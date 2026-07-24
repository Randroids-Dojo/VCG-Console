import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { lstat, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket, { type RawData } from "ws";

const MAX_ALLOWED_ORIGINS = 8;
const MAX_CDP_MESSAGE_BYTES = 1_048_576;
const MAX_CDP_PENDING_COMMANDS = 128;
const CDP_COMMAND_TIMEOUT_MS = 5_000;
const DEVTOOLS_ENDPOINT_TIMEOUT_MS = 10_000;
const DENIED_BROWSER_PERMISSIONS = Object.freeze([
  "camera",
  "geolocation",
  "midi",
  "microphone",
  "notifications",
]);

export interface HostedBrowserManifestInput {
  readonly id: string;
  readonly runtime: string;
  readonly entrypoint: string;
  readonly allowedOrigins: readonly string[];
  readonly launch: {
    readonly timeoutMs: number;
    readonly healthCheck: {
      readonly type: string;
      readonly path?: string;
    };
  };
}

export interface HostedBrowserPolicy {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly entrypoint: string;
  readonly allowedOrigins: readonly string[];
  readonly healthCheckUrl: string;
  readonly launchTimeoutMs: number;
}

export type HostedBrowserViolationCode =
  | "DOWNLOAD_ATTEMPT"
  | "NAVIGATION_ORIGIN_DENIED"
  | "POPUP_ATTEMPT"
  | "TARGET_CRASHED";

export interface HostedBrowserViolation {
  readonly code: HostedBrowserViolationCode;
  readonly detail: string;
}

export interface HostedBrowserRunResult {
  readonly code:
    | "BROWSER_CLOSED"
    | "BROWSER_CRASHED"
    | "LAUNCH_ABORTED"
    | "POLICY_VIOLATION";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly violation?: HostedBrowserViolation;
}

export interface HostedBrowserRunOptions {
  readonly browserPath: string;
  readonly policy: HostedBrowserPolicy;
  readonly profilePath: string;
  readonly signal?: AbortSignal;
  readonly onStatus?: (status: HostedBrowserStatus) => void;
}

export interface HostedBrowserStatus {
  readonly phase:
    | "browser-start"
    | "devtools-connect"
    | "navigation"
    | "ready"
    | "stopping";
  readonly detail: string;
}

export interface HostedBrowserContainmentProbeResult {
  readonly violation: HostedBrowserViolation;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface CdpEvent {
  readonly method: string;
  readonly params?: Record<string, unknown>;
  readonly sessionId?: string;
}

interface TargetInfo {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly openerId?: string;
}

interface BrowserExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

type CdpEventListener = (event: CdpEvent) => void;
type ViolationListener = (violation: HostedBrowserViolation) => void;

export class HostedBrowserPolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HostedBrowserPolicyError";
  }
}

export function createHostedBrowserPolicy(
  manifest: HostedBrowserManifestInput,
): HostedBrowserPolicy {
  if (manifest.runtime !== "remote-web") {
    throw new HostedBrowserPolicyError(
      `hosted browser requires remote-web, received ${manifest.runtime}`,
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new HostedBrowserPolicyError("hosted browser game ID is invalid");
  }
  if (
    !Array.isArray(manifest.allowedOrigins)
    || manifest.allowedOrigins.length === 0
    || manifest.allowedOrigins.length > MAX_ALLOWED_ORIGINS
  ) {
    throw new HostedBrowserPolicyError(
      "hosted browser allowed origins must be a non-empty bounded array",
    );
  }

  const allowedOrigins: string[] = [];
  const uniqueOrigins = new Set<string>();
  for (const value of manifest.allowedOrigins) {
    const origin = requireExactHttpsOrigin(value, "allowed origin");
    if (uniqueOrigins.has(origin)) {
      throw new HostedBrowserPolicyError(
        "hosted browser allowed origins must be unique",
      );
    }
    uniqueOrigins.add(origin);
    allowedOrigins.push(origin);
  }

  const entrypoint = requireCredentialFreeHttpsUrl(
    manifest.entrypoint,
    "entrypoint",
  );
  if (!uniqueOrigins.has(entrypoint.origin)) {
    throw new HostedBrowserPolicyError(
      "hosted browser entrypoint origin is not allowed",
    );
  }
  if (
    !Number.isSafeInteger(manifest.launch.timeoutMs)
    || manifest.launch.timeoutMs < 1_000
    || manifest.launch.timeoutMs > 120_000
  ) {
    throw new HostedBrowserPolicyError(
      "hosted browser launch timeout is invalid",
    );
  }
  if (manifest.launch.healthCheck.type !== "http") {
    throw new HostedBrowserPolicyError(
      "hosted browser requires an HTTP health check",
    );
  }
  const healthCheck = new URL(
    manifest.launch.healthCheck.path ?? "/",
    entrypoint,
  );
  if (!uniqueOrigins.has(healthCheck.origin)) {
    throw new HostedBrowserPolicyError(
      "hosted browser health-check origin is not allowed",
    );
  }
  if (
    healthCheck.protocol !== "https:"
    || healthCheck.username !== ""
    || healthCheck.password !== ""
  ) {
    throw new HostedBrowserPolicyError(
      "hosted browser health check must use credential-free HTTPS",
    );
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    gameId: manifest.id,
    entrypoint: entrypoint.href,
    allowedOrigins: Object.freeze(allowedOrigins),
    healthCheckUrl: healthCheck.href,
    launchTimeoutMs: manifest.launch.timeoutMs,
  });
}

export class HostedBrowserNavigationGuard {
  readonly #allowedOrigins: ReadonlySet<string>;
  #mainTargetId: string | undefined;
  #navigationArmed = false;
  #violation: HostedBrowserViolation | undefined;

  public constructor(policy: HostedBrowserPolicy) {
    this.#allowedOrigins = new Set(policy.allowedOrigins);
  }

  public arm(mainTargetId: string): void {
    if (this.#mainTargetId !== undefined) {
      throw new HostedBrowserPolicyError(
        "hosted browser navigation guard is already armed",
      );
    }
    if (!isOpaqueId(mainTargetId)) {
      throw new HostedBrowserPolicyError(
        "hosted browser main target ID is invalid",
      );
    }
    this.#mainTargetId = mainTargetId;
  }

  public beginNavigation(): void {
    if (this.#mainTargetId === undefined) {
      throw new HostedBrowserPolicyError(
        "hosted browser navigation guard is not armed",
      );
    }
    this.#navigationArmed = true;
  }

  public observeTargetCreated(
    target: TargetInfo,
  ): HostedBrowserViolation | undefined {
    if (
      this.#violation === undefined
      && this.#mainTargetId !== undefined
      && target.type === "page"
      && target.targetId !== this.#mainTargetId
    ) {
      return this.#recordViolation(
        "POPUP_ATTEMPT",
        "hosted page created another top-level page target",
      );
    }
    return this.#violation;
  }

  public observeTargetChanged(
    target: TargetInfo,
  ): HostedBrowserViolation | undefined {
    if (
      this.#violation !== undefined
      || target.targetId !== this.#mainTargetId
      || !this.#navigationArmed
    ) {
      return this.#violation;
    }
    return this.#observeUrl(target.url);
  }

  public observeTopFrame(
    targetId: string,
    url: string,
  ): HostedBrowserViolation | undefined {
    if (
      this.#violation !== undefined
      || targetId !== this.#mainTargetId
      || !this.#navigationArmed
    ) {
      return this.#violation;
    }
    return this.#observeUrl(url);
  }

  public observeDownload(): HostedBrowserViolation {
    return this.#recordViolation(
      "DOWNLOAD_ATTEMPT",
      "hosted page attempted a download",
    );
  }

  public observeTargetCrash(
    targetId: string,
  ): HostedBrowserViolation | undefined {
    if (
      this.#violation === undefined
      && targetId === this.#mainTargetId
    ) {
      return this.#recordViolation(
        "TARGET_CRASHED",
        "hosted browser renderer crashed",
      );
    }
    return this.#violation;
  }

  public get currentViolation(): HostedBrowserViolation | undefined {
    return this.#violation;
  }

  public get mainTargetId(): string | undefined {
    return this.#mainTargetId;
  }

  #observeUrl(value: string): HostedBrowserViolation | undefined {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return this.#recordViolation(
        "NAVIGATION_ORIGIN_DENIED",
        "hosted page navigated to a malformed URL",
      );
    }
    if (
      parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || !this.#allowedOrigins.has(parsed.origin)
    ) {
      return this.#recordViolation(
        "NAVIGATION_ORIGIN_DENIED",
        `hosted page left its allowed origin set: ${safeUrlLabel(parsed)}`,
      );
    }
    return undefined;
  }

  #recordViolation(
    code: HostedBrowserViolationCode,
    detail: string,
  ): HostedBrowserViolation {
    if (this.#violation === undefined) {
      this.#violation = Object.freeze({ code, detail });
    }
    return this.#violation;
  }
}

export function buildHostedBrowserArguments(
  profilePath: string,
): readonly string[] {
  if (profilePath.length === 0) {
    throw new HostedBrowserPolicyError(
      "hosted browser profile path is missing",
    );
  }
  return Object.freeze([
    `--user-data-dir=${profilePath}`,
    "--remote-debugging-port=0",
    "--remote-allow-origins=http://127.0.0.1",
    "--app=about:blank",
    "--start-fullscreen",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-features=AutofillServerCommunication,MediaRouter,Translate",
    "--disable-sync",
  ]);
}

export async function requireHealthyHostedEndpoint(
  policy: HostedBrowserPolicy,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const allowedOrigins = new Set(policy.allowedOrigins);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    policy.launchTimeoutMs,
  );
  let current = new URL(policy.healthCheckUrl);
  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      if (!allowedOrigins.has(current.origin)) {
        throw new Error(
          `health check origin is not allowed: ${safeUrlLabel(current)}`,
        );
      }
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (location === null) {
          throw new Error(
            `health check redirect ${response.status} omitted Location`,
          );
        }
        if (redirects === 5) {
          throw new Error("health check exceeded five redirects");
        }
        current = requireCredentialFreeHttpsUrl(
          new URL(location, current).href,
          "health-check redirect",
        );
        continue;
      }
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`health check returned HTTP ${response.status}`);
      }
      return;
    }
    throw new Error("health check exceeded five redirects");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new HostedBrowserPolicyError(
      `hosted browser health check failed: ${detail}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function runSupervisedHostedBrowser(
  options: HostedBrowserRunOptions,
): Promise<HostedBrowserRunResult> {
  const profilePath = validateHostedBrowserProfilePath(options.profilePath);
  const report = (status: HostedBrowserStatus) => {
    options.onStatus?.(Object.freeze(status));
  };
  report({
    phase: "browser-start",
    detail: "Starting isolated hosted browser",
  });
  const child = spawn(
    options.browserPath,
    [...buildHostedBrowserArguments(profilePath)],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    },
  );
  const childExit = observeChildExit(child);
  let connection: CdpConnection | undefined;
  let stopRequested = false;
  let mainTargetClosed = false;
  let violation: HostedBrowserViolation | undefined;
  let stopPromise: Promise<BrowserExit> | undefined;
  let resolveViolation: (
    value: HostedBrowserViolation,
  ) => void = () => undefined;
  const violationObserved = new Promise<HostedBrowserViolation>((resolve) => {
    resolveViolation = resolve;
  });
  let resolveMainTargetClosed: () => void = () => undefined;
  const mainTargetClosedObserved = new Promise<void>((resolve) => {
    resolveMainTargetClosed = resolve;
  });
  let resolveAborted: () => void = () => undefined;
  const abortedObserved = new Promise<void>((resolve) => {
    resolveAborted = resolve;
  });

  const requestStop = (detail: string) => {
    if (stopRequested) return;
    stopRequested = true;
    report({
      phase: "stopping",
      detail,
    });
    stopPromise ??= stopBrowserProcess(connection, child, childExit);
    void stopPromise.catch(() => undefined);
  };
  const onViolation = (value: HostedBrowserViolation) => {
    if (violation === undefined) {
      violation = value;
      resolveViolation(value);
    }
    requestStop(value.detail);
  };
  const onMainTargetClosed = () => {
    if (!mainTargetClosed) {
      mainTargetClosed = true;
      resolveMainTargetClosed();
    }
    requestStop("Hosted browser main page closed");
  };
  const onAbort = () => {
    resolveAborted();
    requestStop("Stopping hosted browser");
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  try {
    report({
      phase: "devtools-connect",
      detail: "Attaching browser policy supervisor",
    });
    const endpoint = await waitForDevToolsEndpoint(
      profilePath,
      child,
      DEVTOOLS_ENDPOINT_TIMEOUT_MS,
    );
    connection = await CdpConnection.connect(endpoint);
    const ready = await superviseCdpSession(
      connection,
      options.policy,
      onViolation,
      onMainTargetClosed,
    );
    report({
      phase: "navigation",
      detail: "Navigating to the reviewed hosted origin",
    });
    await ready.navigate();
    const initial = await withDeadline(
      Promise.race([
        ready.loaded.then(() => ({ kind: "loaded" as const })),
        violationObserved.then((value) => ({
          kind: "violation" as const,
          value,
        })),
        mainTargetClosedObserved.then(() => ({
          kind: "closed" as const,
        })),
        abortedObserved.then(() => ({ kind: "aborted" as const })),
        childExit.then((exit) => ({ kind: "exit" as const, exit })),
      ]),
      options.policy.launchTimeoutMs,
      "hosted browser did not finish its initial document load",
    );
    if (initial.kind !== "loaded") {
      const exit =
        initial.kind === "exit"
          ? initial.exit
          : await (stopPromise ?? childExit);
      if (initial.kind === "violation") {
        return Object.freeze({
          code: "POLICY_VIOLATION" as const,
          exitCode: exit.code,
          signal: exit.signal,
          violation: initial.value,
        });
      }
      if (initial.kind === "closed") {
        return Object.freeze({
          code: "BROWSER_CLOSED" as const,
          exitCode: exit.code,
          signal: exit.signal,
        });
      }
      if (initial.kind === "aborted") {
        return Object.freeze({
          code: "LAUNCH_ABORTED" as const,
          exitCode: exit.code,
          signal: exit.signal,
        });
      }
      return Object.freeze({
        code:
          exit.code === 0 && exit.signal === null
            ? "BROWSER_CLOSED" as const
            : "BROWSER_CRASHED" as const,
        exitCode: exit.code,
        signal: exit.signal,
      });
    }
    if (violation !== undefined) {
      const exit = await (stopPromise ?? childExit);
      return Object.freeze({
        code: "POLICY_VIOLATION" as const,
        exitCode: exit.code,
        signal: exit.signal,
        violation,
      });
    }
    report({
      phase: "ready",
      detail:
        "Allowed document loaded; explicit in-game readiness remains unavailable",
    });

    const terminal = await Promise.race([
      violationObserved.then((value) => ({
        kind: "violation" as const,
        value,
      })),
      mainTargetClosedObserved.then(() => ({ kind: "closed" as const })),
      abortedObserved.then(() => ({ kind: "aborted" as const })),
      childExit.then((exit) => ({ kind: "exit" as const, exit })),
    ]);
    const exit =
      terminal.kind === "exit"
        ? terminal.exit
        : await (stopPromise ?? childExit);
    if (terminal.kind === "violation") {
      return Object.freeze({
        code: "POLICY_VIOLATION" as const,
        exitCode: exit.code,
        signal: exit.signal,
        violation: terminal.value,
      });
    }
    if (terminal.kind === "closed") {
      return Object.freeze({
        code: "BROWSER_CLOSED" as const,
        exitCode: exit.code,
        signal: exit.signal,
      });
    }
    if (terminal.kind === "aborted") {
      return Object.freeze({
        code: "LAUNCH_ABORTED" as const,
        exitCode: exit.code,
        signal: exit.signal,
      });
    }
    return Object.freeze({
      code:
        exit.code === 0 && exit.signal === null
          ? "BROWSER_CLOSED" as const
          : "BROWSER_CRASHED" as const,
      exitCode: exit.code,
      signal: exit.signal,
    });
  } catch (error) {
    requestStop("Stopping hosted browser after launch failure");
    await stopPromise?.catch(() => undefined);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    if (child.exitCode === null && child.signalCode === null) {
      stopPromise ??= stopBrowserProcess(connection, child, childExit);
      await stopPromise;
    }
    connection?.close();
    await removeEphemeralProfile(profilePath);
  }
}

/**
 * Real-browser evidence helper used only by the repository test.
 *
 * It starts the same blank-profile CDP path headlessly, arms the production
 * guard, then injects one forbidden `data:` top-level navigation through CDP.
 * The guard must observe it and terminate the browser before the probe passes.
 */
export async function probeHostedBrowserContainment(
  browserPath: string,
  profilePath: string,
): Promise<HostedBrowserContainmentProbeResult> {
  profilePath = validateHostedBrowserProfilePath(profilePath);
  const probePolicy = createHostedBrowserPolicy({
    id: "containment-probe",
    runtime: "remote-web",
    entrypoint: "https://allowed.invalid/",
    allowedOrigins: ["https://allowed.invalid"],
    launch: {
      timeoutMs: 5_000,
      healthCheck: { type: "http", path: "/" },
    },
  });
  const child = spawn(
    browserPath,
    [
      ...buildHostedBrowserArguments(profilePath),
      "--headless=new",
      "--disable-gpu",
    ],
    {
      detached: process.platform !== "win32",
      stdio: "ignore",
      windowsHide: true,
    },
  );
  const childExit = observeChildExit(child);
  let connection: CdpConnection | undefined;
  let violation: HostedBrowserViolation | undefined;
  let resolveViolation: (
    value: HostedBrowserViolation,
  ) => void = () => undefined;
  const observedViolation = new Promise<HostedBrowserViolation>((resolve) => {
    resolveViolation = resolve;
  });
  try {
    const endpoint = await waitForDevToolsEndpoint(
      profilePath,
      child,
      DEVTOOLS_ENDPOINT_TIMEOUT_MS,
    );
    connection = await CdpConnection.connect(endpoint);
    const ready = await superviseCdpSession(
      connection,
      probePolicy,
      (value) => {
        if (violation !== undefined) return;
        violation = value;
        resolveViolation(value);
      },
      () => undefined,
    );
    await ready.navigate("data:text/html,vcg-contained");
    const observed = await withDeadline(
      observedViolation,
      5_000,
      "real Chrome did not report the forbidden navigation",
    );
    const exit = await stopBrowserProcess(connection, child, childExit);
    return Object.freeze({
      violation: observed,
      exitCode: exit.code,
      signal: exit.signal,
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await stopBrowserProcess(connection, child, childExit);
    }
    connection?.close();
    await removeEphemeralProfile(profilePath);
  }
}

async function superviseCdpSession(
  connection: CdpConnection,
  policy: HostedBrowserPolicy,
  onViolation: ViolationListener,
  onMainTargetClosed: () => void,
): Promise<{
  readonly loaded: Promise<void>;
  readonly navigate: (url?: string) => Promise<void>;
}> {
  const discoveredPages = new Map<string, TargetInfo>();
  let guard: HostedBrowserNavigationGuard | undefined;
  let mainSessionId: string | undefined;
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => {
    resolveLoaded = resolve;
  });
  const reportViolation = (value: HostedBrowserViolation | undefined) => {
    if (value !== undefined) onViolation(value);
  };

  connection.subscribe((event) => {
    const params = event.params ?? {};
    if (
      event.method === "Target.targetCreated"
      || event.method === "Target.targetInfoChanged"
    ) {
      const target = asTargetInfo(params.targetInfo);
      if (target === undefined) return;
      if (target.type === "page") discoveredPages.set(target.targetId, target);
      if (event.method === "Target.targetCreated") {
        reportViolation(guard?.observeTargetCreated(target));
      } else {
        reportViolation(guard?.observeTargetChanged(target));
      }
      return;
    }
    if (event.method === "Target.targetDestroyed") {
      const targetId = stringField(params, "targetId");
      if (targetId !== undefined && targetId === guard?.mainTargetId) {
        onMainTargetClosed();
      }
      return;
    }
    if (event.method === "Browser.downloadWillBegin") {
      reportViolation(guard?.observeDownload());
      return;
    }
    if (
      event.sessionId === mainSessionId
      && event.method === "Page.frameNavigated"
    ) {
      const frame = objectField(params, "frame");
      if (frame === undefined || "parentId" in frame) return;
      const url = stringField(frame, "url");
      const targetId = guardMainTargetId(guard);
      if (url !== undefined && targetId !== undefined) {
        reportViolation(guard?.observeTopFrame(targetId, url));
      }
      return;
    }
    if (
      event.sessionId === mainSessionId
      && event.method === "Page.loadEventFired"
    ) {
      resolveLoaded?.();
      resolveLoaded = undefined;
      return;
    }
    if (
      event.sessionId === mainSessionId
      && event.method === "Inspector.targetCrashed"
    ) {
      const targetId = guardMainTargetId(guard);
      if (targetId !== undefined) {
        reportViolation(guard?.observeTargetCrash(targetId));
      }
    }
  });

  await connection.send("Target.setDiscoverTargets", { discover: true });
  const targetsResult = await connection.send("Target.getTargets");
  const targets = arrayField(targetsResult, "targetInfos")
    .map(asTargetInfo)
    .filter((target): target is TargetInfo => target !== undefined);
  for (const target of targets) {
    if (target.type === "page") discoveredPages.set(target.targetId, target);
  }
  const pages = [...discoveredPages.values()];
  if (pages.length !== 1 || !isStartupPage(pages[0].url)) {
    const startupLabels = pages.map((page) => startupUrlLabel(page.url));
    throw new HostedBrowserPolicyError(
      `hosted browser did not start with exactly one blank page (${pages.length}: ${startupLabels.join(", ")})`,
    );
  }
  const mainTarget = pages[0];
  guard = new HostedBrowserNavigationGuard(policy);
  guard.arm(mainTarget.targetId);

  const attachResult = await connection.send("Target.attachToTarget", {
    targetId: mainTarget.targetId,
    flatten: true,
  });
  mainSessionId = requireStringField(attachResult, "sessionId");
  await connection.send("Page.enable", {}, mainSessionId);
  await connection.send(
    "Page.setLifecycleEventsEnabled",
    { enabled: true },
    mainSessionId,
  );
  await connection.send("Browser.setDownloadBehavior", {
    behavior: "deny",
    eventsEnabled: true,
  });
  await connection.send("Browser.resetPermissions");
  for (const permission of DENIED_BROWSER_PERMISSIONS) {
    for (const origin of policy.allowedOrigins) {
      await connection.send("Browser.setPermission", {
        permission: { name: permission },
        setting: "denied",
        origin,
      });
    }
  }

  return Object.freeze({
    loaded,
    navigate: async (url = policy.entrypoint) => {
      guard?.beginNavigation();
      const result = await connection.send(
        "Page.navigate",
        { url },
        mainSessionId,
      );
      const errorText = optionalStringField(result, "errorText");
      if (errorText !== undefined) {
        throw new HostedBrowserPolicyError(
          `hosted browser navigation failed: ${errorText}`,
        );
      }
    },
  });
}

class CdpConnection {
  readonly #socket: WebSocket;
  readonly #pending = new Map<
    number,
    {
      readonly resolve: (value: Record<string, unknown>) => void;
      readonly reject: (error: Error) => void;
      readonly timeout: ReturnType<typeof setTimeout>;
    }
  >();
  readonly #listeners = new Set<CdpEventListener>();
  #nextId = 1;
  #closed = false;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on("message", (data) => this.#receive(data));
    socket.on("close", () => this.#failAll("DevTools connection closed"));
    socket.on("error", (error) => {
      this.#failAll(`DevTools connection failed: ${error.message}`);
    });
  }

  public static async connect(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint, {
      maxPayload: MAX_CDP_MESSAGE_BYTES,
      origin: "http://127.0.0.1",
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("DevTools connection timed out")),
        CDP_COMMAND_TIMEOUT_MS,
      );
      socket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    return new CdpConnection(socket);
  }

  public subscribe(listener: CdpEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (this.#closed) {
      throw new HostedBrowserPolicyError("DevTools connection is closed");
    }
    if (this.#pending.size >= MAX_CDP_PENDING_COMMANDS) {
      throw new HostedBrowserPolicyError(
        "DevTools pending-command bound exceeded",
      );
    }
    const id = this.#nextId;
    this.#nextId += 1;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId === undefined ? {} : { sessionId }),
    });
    if (Buffer.byteLength(payload) > MAX_CDP_MESSAGE_BYTES) {
      throw new HostedBrowserPolicyError(
        "DevTools command exceeded its byte bound",
      );
    }
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new HostedBrowserPolicyError(
            `DevTools command timed out: ${method}`,
          ),
        );
      }, CDP_COMMAND_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timeout });
      this.#socket.send(payload, (error) => {
        if (error == null) return;
        const pending = this.#pending.get(id);
        if (pending === undefined) return;
        clearTimeout(pending.timeout);
        this.#pending.delete(id);
        pending.reject(
          new HostedBrowserPolicyError(
            `DevTools command failed: ${error.message}`,
          ),
        );
      });
    });
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket.close();
    this.#failAll("DevTools connection closed");
  }

  #receive(data: RawData): void {
    const bytes =
      typeof data === "string"
        ? Buffer.byteLength(data)
        : Array.isArray(data)
          ? data.reduce((total, value) => total + value.byteLength, 0)
          : data.byteLength;
    if (bytes > MAX_CDP_MESSAGE_BYTES) {
      this.#failAll("DevTools message exceeded its byte bound");
      this.#socket.terminate();
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.#failAll("DevTools returned malformed JSON");
      this.#socket.terminate();
      return;
    }
    if (!isRecord(message)) return;
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (pending === undefined) return;
      clearTimeout(pending.timeout);
      this.#pending.delete(message.id);
      if (isRecord(message.error)) {
        pending.reject(
          new HostedBrowserPolicyError(
            `DevTools rejected command: ${String(message.error.message)}`,
          ),
        );
        return;
      }
      pending.resolve(
        isRecord(message.result) ? message.result : Object.freeze({}),
      );
      return;
    }
    if (typeof message.method !== "string") return;
    const event: CdpEvent = {
      method: message.method,
      ...(isRecord(message.params) ? { params: message.params } : {}),
      ...(typeof message.sessionId === "string"
        ? { sessionId: message.sessionId }
        : {}),
    };
    for (const listener of this.#listeners) listener(event);
  }

  #failAll(detail: string): void {
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new HostedBrowserPolicyError(detail));
    }
    this.#pending.clear();
  }
}

async function waitForDevToolsEndpoint(
  profilePath: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<string> {
  const activePortPath = `${profilePath}/DevToolsActivePort`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new HostedBrowserPolicyError(
        "hosted browser exited before DevTools became available",
      );
    }
    try {
      const bytes = await readFile(activePortPath);
      if (bytes.byteLength > 4_096) {
        throw new HostedBrowserPolicyError(
          "DevTools endpoint file exceeded its byte bound",
        );
      }
      const [portText, path, ...extra] = bytes.toString("utf8").trim().split(
        /\r?\n/,
      );
      const port = Number(portText);
      if (
        extra.length !== 0
        || !Number.isSafeInteger(port)
        || port < 1
        || port > 65_535
        || !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(path ?? "")
      ) {
        throw new HostedBrowserPolicyError(
          "DevTools endpoint file is malformed",
        );
      }
      return `ws://127.0.0.1:${port}${path}`;
    } catch (error) {
      if (error instanceof HostedBrowserPolicyError) throw error;
      const code =
        isRecord(error) && typeof error.code === "string"
          ? error.code
          : undefined;
      if (code !== "ENOENT") throw error;
    }
    await delay(25);
  }
  throw new HostedBrowserPolicyError(
    "timed out waiting for the DevTools endpoint",
  );
}

function observeChildExit(child: ChildProcess): Promise<BrowserExit> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(Object.freeze({ code, signal }));
    });
  });
}

async function stopBrowserProcess(
  connection: CdpConnection | undefined,
  child: ChildProcess,
  childExit: Promise<BrowserExit>,
): Promise<BrowserExit> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return childExit;
  }
  if (connection !== undefined) {
    await Promise.race([
      connection.send("Browser.close").catch(() => undefined),
      delay(1_000),
    ]);
    const graceful = await Promise.race([
      childExit.then((exit) => ({ exit })),
      delay(1_500).then(() => undefined),
    ]);
    if (graceful !== undefined) return graceful.exit;
  }

  await terminateBrowserTree(child);
  return withDeadline(
    childExit,
    5_000,
    "hosted browser process tree did not terminate",
  );
}

async function terminateBrowserTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) {
    throw new HostedBrowserPolicyError(
      "hosted browser process has no process identifier",
    );
  }
  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    await withDeadline(
      observeChildExit(killer),
      5_000,
      "Windows browser-tree termination timed out",
    );
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    const code =
      isRecord(error) && typeof error.code === "string"
        ? error.code
        : undefined;
    if (code !== "ESRCH") throw error;
  }
}

async function removeEphemeralProfile(profilePath: string): Promise<void> {
  profilePath = validateHostedBrowserProfilePath(profilePath);
  let metadata;
  try {
    metadata = await lstat(profilePath);
  } catch (error) {
    const code =
      isRecord(error) && typeof error.code === "string"
        ? error.code
        : undefined;
    if (code === "ENOENT") return;
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new HostedBrowserPolicyError(
      "hosted browser profile is not an owned temporary directory",
    );
  }
  await rm(profilePath, {
    force: true,
    maxRetries: 3,
    recursive: true,
    retryDelay: 50,
  });
}

export function validateHostedBrowserProfilePath(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HostedBrowserPolicyError(
      "hosted browser profile path is invalid",
    );
  }
  const normalized = resolve(value);
  const temporaryRoot = resolve(tmpdir());
  const samePath = (left: string, right: string) =>
    process.platform === "win32"
      ? left.toLowerCase() === right.toLowerCase()
      : left === right;
  if (
    !samePath(dirname(normalized), temporaryRoot)
    || !/^vcg-hosted-(?:browser|probe)-[A-Za-z0-9_-]{6,64}$/.test(
      basename(normalized),
    )
  ) {
    throw new HostedBrowserPolicyError(
      "hosted browser profile must be one branded temporary directory",
    );
  }
  return normalized;
}

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  detail: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new HostedBrowserPolicyError(detail)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function requireExactHttpsOrigin(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new HostedBrowserPolicyError(
      `hosted browser ${label} is invalid`,
    );
  }
  const parsed = requireCredentialFreeHttpsUrl(value, label);
  if (value !== parsed.origin) {
    throw new HostedBrowserPolicyError(
      `hosted browser ${label} must be an exact HTTPS origin`,
    );
  }
  return parsed.origin;
}

function requireCredentialFreeHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostedBrowserPolicyError(
      `hosted browser ${label} is invalid`,
    );
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new HostedBrowserPolicyError(
      `hosted browser ${label} must use credential-free HTTPS`,
    );
  }
  return parsed;
}

function safeUrlLabel(value: URL): string {
  return `${value.protocol}//${value.host}`;
}

function isOpaqueId(value: string): boolean {
  return value.length > 0 && value.length <= 256 && /^[A-Za-z0-9._:-]+$/.test(
    value,
  );
}

function isStartupPage(value: string): boolean {
  return value === ""
    || value === "about:blank"
    || value === "chrome://newtab/";
}

function startupUrlLabel(value: string): string {
  if (value === "") return "<empty>";
  try {
    return new URL(value).protocol;
  } catch {
    return "<malformed>";
  }
}

function asTargetInfo(value: unknown): TargetInfo | undefined {
  if (!isRecord(value)) return undefined;
  const targetId = stringField(value, "targetId");
  const type = stringField(value, "type");
  const url = stringField(value, "url");
  if (
    targetId === undefined
    || type === undefined
    || url === undefined
    || !isOpaqueId(targetId)
  ) {
    return undefined;
  }
  const openerId = optionalStringField(value, "openerId");
  return Object.freeze({
    targetId,
    type,
    url,
    ...(openerId === undefined ? {} : { openerId }),
  });
}

function guardMainTargetId(
  guard: HostedBrowserNavigationGuard | undefined,
): string | undefined {
  return guard?.mainTargetId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectField(
  value: Record<string, unknown>,
  name: string,
): Record<string, unknown> | undefined {
  return isRecord(value[name]) ? value[name] : undefined;
}

function stringField(
  value: Record<string, unknown>,
  name: string,
): string | undefined {
  return typeof value[name] === "string" ? value[name] : undefined;
}

function optionalStringField(
  value: Record<string, unknown>,
  name: string,
): string | undefined {
  const field = value[name];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function requireStringField(
  value: Record<string, unknown>,
  name: string,
): string {
  const field = stringField(value, name);
  if (field === undefined || !isOpaqueId(field)) {
    throw new HostedBrowserPolicyError(
      `DevTools response omitted valid ${name}`,
    );
  }
  return field;
}

function arrayField(
  value: Record<string, unknown>,
  name: string,
): unknown[] {
  return Array.isArray(value[name]) ? value[name] : [];
}
