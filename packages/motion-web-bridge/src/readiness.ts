import { z } from "zod";
import type {
  BridgeMessageEvent,
  BridgeMessageListener,
  BridgeMessageReceiver,
  BridgePostTarget,
} from "./window-types";

// This protocol records one cooperative local-web instance's bounded launch
// phase. It does not authenticate arbitrary page code or prove compositor
// focus, controller routing, containment, gameplay correctness, or health
// after the challenge expires.
export const LOCAL_WEB_READINESS_PROTOCOL_VERSION = 1 as const;
export const LOCAL_WEB_READINESS_MAX_TRANSITIONS = 64;
export const LOCAL_WEB_READINESS_MIN_TTL_MS = 1_000;
export const LOCAL_WEB_READINESS_MAX_TTL_MS = 120_000;

const GameIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(96);
const VersionSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/)
  .max(96);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const OpaqueIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .min(16)
  .max(96);
const ChallengeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(32)
  .max(96);
const TtlSchema = z
  .number()
  .int()
  .min(LOCAL_WEB_READINESS_MIN_TTL_MS)
  .max(LOCAL_WEB_READINESS_MAX_TTL_MS);

export const LocalWebReadinessChallengeSchema = z
  .object({
    type: z.literal("vcg.runtime.readiness.challenge"),
    protocolVersion: z.literal(LOCAL_WEB_READINESS_PROTOCOL_VERSION),
    runtime: z.literal("local-web"),
    gameId: GameIdSchema,
    version: VersionSchema,
    manifestSha256: Sha256Schema,
    instanceId: OpaqueIdSchema,
    challengeId: ChallengeIdSchema,
    expiresAfterMs: TtlSchema,
  })
  .strict();

const ReadinessPhaseSchema = z.enum([
  "starting",
  "ready",
  "degraded",
  "failed",
]);
const ReadinessReasonSchema = z.enum([
  "none",
  "recovering",
  "dependency-unavailable",
  "performance",
  "initialization-failed",
  "incompatible-release",
  "runtime-error",
]);

export const LocalWebReadinessStatusSchema = z
  .object({
    type: z.literal("vcg.runtime.readiness.status"),
    protocolVersion: z.literal(LOCAL_WEB_READINESS_PROTOCOL_VERSION),
    runtime: z.literal("local-web"),
    gameId: GameIdSchema,
    version: VersionSchema,
    manifestSha256: Sha256Schema,
    instanceId: OpaqueIdSchema,
    challengeId: ChallengeIdSchema,
    sequence: z
      .number()
      .int()
      .min(0)
      .max(LOCAL_WEB_READINESS_MAX_TRANSITIONS - 1),
    phase: ReadinessPhaseSchema,
    reason: ReadinessReasonSchema,
  })
  .strict()
  .superRefine((status, context) => {
    const allowedReasons: Readonly<
      Record<z.infer<typeof ReadinessPhaseSchema>, readonly string[]>
    > = {
      starting: ["none"],
      ready: ["none"],
      degraded: [
        "recovering",
        "dependency-unavailable",
        "performance",
      ],
      failed: [
        "initialization-failed",
        "incompatible-release",
        "runtime-error",
      ],
    };
    if (!allowedReasons[status.phase].includes(status.reason)) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "readiness reason does not match its phase",
      });
    }
  });

export type LocalWebReadinessChallenge = z.infer<
  typeof LocalWebReadinessChallengeSchema
>;
export type LocalWebReadinessStatus = z.infer<
  typeof LocalWebReadinessStatusSchema
>;
export type LocalWebReadinessPhase = LocalWebReadinessStatus["phase"];
export type LocalWebReadinessReason = LocalWebReadinessStatus["reason"];
export type LocalWebDegradedReason = Extract<
  LocalWebReadinessReason,
  "recovering" | "dependency-unavailable" | "performance"
>;
export type LocalWebFailedReason = Extract<
  LocalWebReadinessReason,
  "initialization-failed" | "incompatible-release" | "runtime-error"
>;

export interface LocalWebReleaseIdentity {
  readonly gameId: string;
  readonly version: string;
  readonly manifestSha256: string;
}

export type LocalWebReadinessHostState =
  | "stopped"
  | "waiting"
  | LocalWebReadinessPhase
  | "expired";

export interface LocalWebReadinessSnapshot {
  readonly state: LocalWebReadinessHostState;
  readonly reason: LocalWebReadinessReason | "expired" | null;
  readonly sequence: number | null;
  readonly acceptedTransitions: number;
  readonly invalidMessages: number;
  readonly hostileMessages: number;
  readonly rejectedBindings: number;
  readonly invalidTransitions: number;
}

export interface LocalWebReadinessHostOptions
  extends LocalWebReleaseIdentity {
  readonly receiver: BridgeMessageReceiver;
  readonly target: BridgePostTarget;
  readonly targetOrigin: string;
  readonly instanceId: string;
  readonly expiresAfterMs: number;
  readonly createChallengeId: () => string;
  readonly now?: () => number;
  readonly onStateChange?: (snapshot: LocalWebReadinessSnapshot) => void;
}

export interface LocalWebReadinessClientOptions
  extends LocalWebReleaseIdentity {
  readonly receiver: BridgeMessageReceiver;
  readonly target: BridgePostTarget;
  readonly targetOrigin: string;
  readonly now?: () => number;
  readonly onChallenge?: (
    challenge: Readonly<LocalWebReadinessChallenge>,
  ) => void;
}

export class LocalWebReadinessError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LocalWebReadinessError";
  }
}

export class LocalWebReadinessHost {
  readonly #receiver: BridgeMessageReceiver;
  readonly #target: BridgePostTarget;
  readonly #targetOrigin: string;
  readonly #release: LocalWebReleaseIdentity;
  readonly #instanceId: string;
  readonly #expiresAfterMs: number;
  readonly #createChallengeId: () => string;
  readonly #now: () => number;
  readonly #onStateChange:
    | ((snapshot: LocalWebReadinessSnapshot) => void)
    | undefined;
  #challenge: LocalWebReadinessChallenge | undefined;
  #deadlineMs: number | undefined;
  #lastNowMs = -Infinity;
  #state: LocalWebReadinessHostState = "stopped";
  #reason: LocalWebReadinessSnapshot["reason"] = null;
  #sequence: number | null = null;
  #acceptedTransitions = 0;
  #invalidMessages = 0;
  #hostileMessages = 0;
  #rejectedBindings = 0;
  #invalidTransitions = 0;
  #started = false;

  readonly #listener: BridgeMessageListener = (event) =>
    this.#receive(event);

  public constructor(options: LocalWebReadinessHostOptions) {
    this.#receiver = options.receiver;
    this.#target = options.target;
    this.#targetOrigin = exactLocalWebOrigin(options.targetOrigin);
    this.#release = parseReleaseIdentity(options);
    this.#instanceId = OpaqueIdSchema.parse(options.instanceId);
    this.#expiresAfterMs = TtlSchema.parse(options.expiresAfterMs);
    this.#createChallengeId = options.createChallengeId;
    this.#now = options.now ?? (() => performance.now());
    this.#onStateChange = options.onStateChange;
  }

  public start(): void {
    if (this.#started) return;
    const now = this.#readNow();
    const challenge = LocalWebReadinessChallengeSchema.parse({
      type: "vcg.runtime.readiness.challenge",
      protocolVersion: LOCAL_WEB_READINESS_PROTOCOL_VERSION,
      runtime: "local-web",
      ...this.#release,
      instanceId: this.#instanceId,
      challengeId: this.#createChallengeId(),
      expiresAfterMs: this.#expiresAfterMs,
    });
    this.#challenge = Object.freeze(challenge);
    this.#deadlineMs = now + this.#expiresAfterMs;
    if (!Number.isFinite(this.#deadlineMs)) {
      throw new LocalWebReadinessError("readiness deadline is invalid");
    }
    this.#receiver.addEventListener("message", this.#listener);
    this.#started = true;
    this.#transitionState("waiting", null, null);
    this.#sendChallenge();
  }

  public resendChallenge(): boolean {
    this.#expireIfNeeded();
    if (!this.#started || this.#state !== "waiting") return false;
    this.#sendChallenge();
    return true;
  }

  public stop(): void {
    if (this.#started) {
      this.#receiver.removeEventListener("message", this.#listener);
    }
    this.#started = false;
    this.#challenge = undefined;
    this.#deadlineMs = undefined;
    this.#transitionState("stopped", null, null);
  }

  public snapshot(): Readonly<LocalWebReadinessSnapshot> {
    this.#expireIfNeeded();
    return Object.freeze({
      state: this.#state,
      reason: this.#reason,
      sequence: this.#sequence,
      acceptedTransitions: this.#acceptedTransitions,
      invalidMessages: this.#invalidMessages,
      hostileMessages: this.#hostileMessages,
      rejectedBindings: this.#rejectedBindings,
      invalidTransitions: this.#invalidTransitions,
    });
  }

  #receive(event: BridgeMessageEvent): void {
    if (
      event.origin !== this.#targetOrigin
      || event.source !== this.#target
    ) {
      this.#hostileMessages += 1;
      return;
    }
    this.#expireIfNeeded();
    if (!this.#started || this.#state === "expired" || this.#state === "failed") {
      this.#invalidTransitions += 1;
      return;
    }
    const parsed = LocalWebReadinessStatusSchema.safeParse(event.data);
    if (!parsed.success) {
      this.#invalidMessages += 1;
      return;
    }
    const challenge = this.#challenge;
    if (
      challenge === undefined
      || !sameBinding(parsed.data, challenge)
    ) {
      this.#rejectedBindings += 1;
      return;
    }
    const expectedSequence = this.#sequence === null ? 0 : this.#sequence + 1;
    if (
      parsed.data.sequence !== expectedSequence
      || !validTransition(this.#state, parsed.data.phase)
    ) {
      this.#invalidTransitions += 1;
      return;
    }
    this.#acceptedTransitions += 1;
    this.#transitionState(
      parsed.data.phase,
      parsed.data.reason,
      parsed.data.sequence,
    );
  }

  #expireIfNeeded(): void {
    if (
      !this.#started
      || this.#deadlineMs === undefined
      || this.#state === "expired"
      || this.#state === "failed"
    ) {
      return;
    }
    if (this.#readNow() >= this.#deadlineMs) {
      this.#transitionState("expired", "expired", this.#sequence);
    }
  }

  #sendChallenge(): void {
    if (this.#challenge === undefined) {
      throw new LocalWebReadinessError("readiness challenge is unavailable");
    }
    this.#target.postMessage(this.#challenge, this.#targetOrigin);
  }

  #transitionState(
    state: LocalWebReadinessHostState,
    reason: LocalWebReadinessSnapshot["reason"],
    sequence: number | null,
  ): void {
    const changed =
      state !== this.#state
      || reason !== this.#reason
      || sequence !== this.#sequence;
    this.#state = state;
    this.#reason = reason;
    this.#sequence = sequence;
    if (changed) this.#onStateChange?.(this.snapshotWithoutExpiry());
  }

  private snapshotWithoutExpiry(): Readonly<LocalWebReadinessSnapshot> {
    return Object.freeze({
      state: this.#state,
      reason: this.#reason,
      sequence: this.#sequence,
      acceptedTransitions: this.#acceptedTransitions,
      invalidMessages: this.#invalidMessages,
      hostileMessages: this.#hostileMessages,
      rejectedBindings: this.#rejectedBindings,
      invalidTransitions: this.#invalidTransitions,
    });
  }

  #readNow(): number {
    const now = this.#now();
    if (!Number.isFinite(now) || now < this.#lastNowMs) {
      throw new LocalWebReadinessError(
        "readiness monotonic clock is invalid",
      );
    }
    this.#lastNowMs = now;
    return now;
  }
}

export class LocalWebReadinessClient {
  readonly #receiver: BridgeMessageReceiver;
  readonly #target: BridgePostTarget;
  readonly #targetOrigin: string;
  readonly #release: LocalWebReleaseIdentity;
  readonly #now: () => number;
  readonly #onChallenge:
    | ((challenge: Readonly<LocalWebReadinessChallenge>) => void)
    | undefined;
  #challenge: LocalWebReadinessChallenge | undefined;
  #deadlineMs: number | undefined;
  #lastNowMs = -Infinity;
  #sequence = -1;
  #phase: LocalWebReadinessPhase | undefined;
  #started = false;

  readonly #listener: BridgeMessageListener = (event) =>
    this.#receive(event);

  public constructor(options: LocalWebReadinessClientOptions) {
    this.#receiver = options.receiver;
    this.#target = options.target;
    this.#targetOrigin = exactLocalWebOrigin(options.targetOrigin);
    this.#release = parseReleaseIdentity(options);
    this.#now = options.now ?? (() => performance.now());
    this.#onChallenge = options.onChallenge;
  }

  public start(): void {
    if (this.#started) return;
    this.#receiver.addEventListener("message", this.#listener);
    this.#started = true;
  }

  public stop(): void {
    if (this.#started) {
      this.#receiver.removeEventListener("message", this.#listener);
    }
    this.#started = false;
    this.#challenge = undefined;
    this.#deadlineMs = undefined;
    this.#sequence = -1;
    this.#phase = undefined;
  }

  public publishReady(): void {
    this.#publish("ready", "none");
  }

  public publishDegraded(reason: LocalWebDegradedReason): void {
    this.#publish("degraded", reason);
  }

  public publishFailed(reason: LocalWebFailedReason): void {
    this.#publish("failed", reason);
  }

  #receive(event: BridgeMessageEvent): void {
    if (
      event.origin !== this.#targetOrigin
      || event.source !== this.#target
    ) {
      return;
    }
    const parsed = LocalWebReadinessChallengeSchema.safeParse(event.data);
    if (!parsed.success || !sameRelease(parsed.data, this.#release)) return;
    if (
      this.#challenge !== undefined
      && parsed.data.challengeId === this.#challenge.challengeId
      && parsed.data.instanceId === this.#challenge.instanceId
    ) {
      return;
    }
    const now = this.#readNow();
    this.#challenge = Object.freeze(parsed.data);
    this.#deadlineMs = now + parsed.data.expiresAfterMs;
    this.#sequence = -1;
    this.#phase = undefined;
    this.#publish("starting", "none");
    this.#onChallenge?.(this.#challenge);
  }

  #publish(
    phase: LocalWebReadinessPhase,
    reason: LocalWebReadinessReason,
  ): void {
    if (!this.#started || this.#challenge === undefined) {
      throw new LocalWebReadinessError(
        "readiness client has no active challenge",
      );
    }
    if (
      this.#deadlineMs === undefined
      || this.#readNow() >= this.#deadlineMs
    ) {
      throw new LocalWebReadinessError("readiness challenge expired");
    }
    if (!validTransition(this.#phase ?? "waiting", phase)) {
      throw new LocalWebReadinessError(
        "readiness client transition is invalid",
      );
    }
    if (this.#sequence >= LOCAL_WEB_READINESS_MAX_TRANSITIONS - 1) {
      throw new LocalWebReadinessError(
        "readiness transition limit was reached",
      );
    }
    const sequence = this.#sequence + 1;
    const status = LocalWebReadinessStatusSchema.parse({
      type: "vcg.runtime.readiness.status",
      protocolVersion: LOCAL_WEB_READINESS_PROTOCOL_VERSION,
      runtime: "local-web",
      gameId: this.#challenge.gameId,
      version: this.#challenge.version,
      manifestSha256: this.#challenge.manifestSha256,
      instanceId: this.#challenge.instanceId,
      challengeId: this.#challenge.challengeId,
      sequence,
      phase,
      reason,
    });
    this.#sequence = sequence;
    this.#phase = phase;
    this.#target.postMessage(status, this.#targetOrigin);
  }

  #readNow(): number {
    const now = this.#now();
    if (!Number.isFinite(now) || now < this.#lastNowMs) {
      throw new LocalWebReadinessError(
        "readiness monotonic clock is invalid",
      );
    }
    this.#lastNowMs = now;
    return now;
  }
}

function parseReleaseIdentity(
  value: LocalWebReleaseIdentity,
): LocalWebReleaseIdentity {
  return Object.freeze({
    gameId: GameIdSchema.parse(value.gameId),
    version: VersionSchema.parse(value.version),
    manifestSha256: Sha256Schema.parse(value.manifestSha256),
  });
}

function exactLocalWebOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LocalWebReadinessError(
      "local-web readiness origin is invalid",
    );
  }
  const loopbackHttp =
    url.protocol === "http:"
    && (
      url.hostname === "localhost"
      || url.hostname === "127.0.0.1"
      || url.hostname === "[::1]"
    );
  if (
    url.origin !== value
    || url.username !== ""
    || url.password !== ""
    || (url.protocol !== "https:" && !loopbackHttp)
  ) {
    throw new LocalWebReadinessError(
      "local-web readiness requires an exact HTTPS or loopback origin",
    );
  }
  return url.origin;
}

function sameRelease(
  value: LocalWebReleaseIdentity,
  release: LocalWebReleaseIdentity,
): boolean {
  return (
    value.gameId === release.gameId
    && value.version === release.version
    && value.manifestSha256 === release.manifestSha256
  );
}

function sameBinding(
  status: LocalWebReadinessStatus,
  challenge: LocalWebReadinessChallenge,
): boolean {
  return (
    sameRelease(status, challenge)
    && status.instanceId === challenge.instanceId
    && status.challengeId === challenge.challengeId
  );
}

function validTransition(
  current: LocalWebReadinessHostState | "waiting",
  next: LocalWebReadinessPhase,
): boolean {
  switch (current) {
    case "waiting":
      return next === "starting";
    case "starting":
      return (
        next === "ready"
        || next === "degraded"
        || next === "failed"
      );
    case "ready":
      return next === "degraded" || next === "failed";
    case "degraded":
      return next === "ready" || next === "failed";
    case "failed":
    case "expired":
    case "stopped":
      return false;
  }
}
