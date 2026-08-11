import { parseJsonWithUniqueObjectFields } from "./strict-json";

const HOST_API_PROTOCOL_VERSION = "0.1.0";
const HOST_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const HOST_PORT_PATTERN = /^[1-9][0-9]{0,4}$/;
const HOST_REQUEST_TIMEOUT_MS = 1_500;
const HOST_LAUNCH_TIMEOUT_MS = 15_000;
const HOST_BLUETOOTH_TIMEOUT_MS = 35_000;
const MAX_HOST_STATUS_BYTES = 16_384;
const MAX_HOST_PACKAGE_INVENTORY_BYTES = 1_048_576;
const MAX_HOST_PACKAGE_COUNT = 1_024;
const MAX_HOST_VERSION_CHARACTERS = 128;
const MAX_HOST_TARGET_CHARACTERS = 64;
const MAX_HOST_CAPABILITY_COUNT = 32;
const MAX_HOST_CAPABILITY_CHARACTERS = 64;
const MAX_HOST_PROTOCOL_VERSION_CHARACTERS = 64;
const MAX_PACKAGE_VERSION_CHARACTERS = 128;
const HOST_TARGET_PATTERN = /^[a-z0-9_]+-[a-z0-9_]+$/;
const HOST_CAPABILITY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;
const BLUETOOTH_DEVICE_ID_PATTERN = /^controller-([1-9][0-9]{0,8})$/;

export interface NativeHostStatus {
  protocolVersion: typeof HOST_API_PROTOCOL_VERSION;
  hostVersion: string;
  target: string;
  capabilities: string[];
}

export interface NativePackageSummary {
  id: string;
  version: string;
  runtime: "libretro";
}

export interface NativeInstalledPackage extends NativePackageSummary {
  catalogGeneration: number;
}

export interface NativePackageInventory {
  protocolVersion: typeof HOST_API_PROTOCOL_VERSION;
  catalogGeneration: number;
  packages: NativePackageSummary[];
}

export type NativeLaunchState =
  | "preparing"
  | "running"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled";

export interface NativeLaunchSnapshot {
  protocolVersion: typeof HOST_API_PROTOCOL_VERSION;
  requestId: string;
  gameId: string;
  profileId: string;
  state: NativeLaunchState;
  sequence: number;
  detailCode: string;
  replayed: boolean;
  exitCode?: number | null;
}

export interface NativeBluetoothController {
  id: string;
  paired: boolean;
  connected: boolean;
}

export interface NativeBluetoothSnapshot {
  protocolVersion: typeof HOST_API_PROTOCOL_VERSION;
  devices: NativeBluetoothController[];
}

type NativeHostFailure = {
  ok: false;
  code:
    | "HOST_NOT_CONNECTED"
    | "HOST_CONFIG_INVALID"
    | "HOST_UNREACHABLE"
    | "HOST_REJECTED"
    | "HOST_PROTOCOL_INVALID"
    | "HOST_PROTOCOL_MISMATCH"
    | "PACKAGE_NOT_INSTALLED"
    | "PACKAGE_LAUNCH_FAILED"
    | "LAUNCH_REPLAY_UNAVAILABLE"
    | "LAUNCH_RESTART_CLEANUP_REQUIRED"
    | "LAUNCH_NOT_FOUND"
    | "BLUETOOTH_SERVICE_UNAVAILABLE"
    | "BLUETOOTH_OPERATION_FAILED";
  detail: string;
};

export type NativeHostResult = { ok: true; status: NativeHostStatus } | NativeHostFailure;
export type NativePackageResult =
  | { ok: true; status: NativeHostStatus; package: NativeInstalledPackage }
  | NativeHostFailure;
export type NativePackageInventoryResult =
  | { ok: true; status: NativeHostStatus; inventory: NativePackageInventory }
  | NativeHostFailure;
export type NativeLaunchStartResult =
  | { ok: true; status: NativeHostStatus; launch: NativeLaunchSnapshot }
  | NativeHostFailure;
export type NativeLaunchSnapshotResult =
  | { ok: true; launch: NativeLaunchSnapshot }
  | NativeHostFailure;
export type NativeBluetoothResult =
  | { ok: true; status: NativeHostStatus; snapshot: NativeBluetoothSnapshot }
  | NativeHostFailure;

interface HostBridge {
  endpoint: string;
  token: string;
}

type ParsedHostBridge = { kind: "absent" } | { kind: "invalid" } | { kind: "configured"; bridge: HostBridge };

export function parseNativeHostBridge(href: string): ParsedHostBridge {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "invalid" };
  }
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  if ([...fragment.keys()].some((key) => key !== "vcg-host-port" && key !== "vcg-host-token")) {
    return { kind: "invalid" };
  }
  const ports = fragment.getAll("vcg-host-port");
  const tokens = fragment.getAll("vcg-host-token");
  if (ports.length === 0 && tokens.length === 0) return { kind: "absent" };
  if (ports.length !== 1 || tokens.length !== 1) return { kind: "invalid" };

  const portText = ports[0] ?? "";
  const port = Number(portText);
  const token = tokens[0] ?? "";
  if (
    !HOST_PORT_PATTERN.test(portText) ||
    !Number.isInteger(port) ||
    port > 65_535 ||
    !HOST_TOKEN_PATTERN.test(token)
  ) {
    return { kind: "invalid" };
  }
  return {
    kind: "configured",
    bridge: {
      endpoint: `http://127.0.0.1:${port}`,
      token,
    },
  };
}

export async function checkNativeHost(
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativeHostResult> {
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind === "absent") {
    return {
      ok: false,
      code: "HOST_NOT_CONNECTED",
      detail: "Rust console host is not connected in this browser session",
    };
  }
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      code: "HOST_CONFIG_INVALID",
      detail: "Rust console host launch capability is invalid",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(`${parsed.bridge.endpoint}/v1/status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${parsed.bridge.token}` },
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch {
      return unreachableHost();
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "HOST_REJECTED",
        detail: "Rust console host rejected this launcher session",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        code: "HOST_UNREACHABLE",
        detail: `Rust console host returned status ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response);
    } catch {
      if (controller.signal.aborted) return unreachableHost();
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid status document",
      };
    }
    if (!isNativeHostStatus(body)) {
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid status document",
      };
    }
    if (body.protocolVersion !== HOST_API_PROTOCOL_VERSION) {
      return {
        ok: false,
        code: "HOST_PROTOCOL_MISMATCH",
        detail: `Rust console host protocol ${body.protocolVersion} is not supported`,
      };
    }
    return { ok: true, status: body as NativeHostStatus };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkNativePackage(
  gameId: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativePackageResult> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId) || gameId.length > 80) {
    return {
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
      detail: "Requested package identifier is invalid",
    };
  }
  const host = await checkNativeHost(href, fetcher, timeoutMs);
  if (!host.ok) return host;
  if (!host.status.capabilities.includes("trusted-package-catalog")) {
    return {
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
      detail: "Rust host connected · no trusted installed package catalog is configured",
    };
  }
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind !== "configured") {
    return {
      ok: false,
      code: "HOST_CONFIG_INVALID",
      detail: "Rust console host launch capability is invalid",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(`${parsed.bridge.endpoint}/v1/packages/${gameId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${parsed.bridge.token}` },
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch {
      return unreachableHost();
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "HOST_REJECTED",
        detail: "Rust console host rejected this launcher session",
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        code: "PACKAGE_NOT_INSTALLED",
        detail: `No trusted installed package is available for ${gameId}`,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        code: "HOST_UNREACHABLE",
        detail: `Rust console host returned status ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response);
    } catch {
      if (controller.signal.aborted) return unreachableHost();
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid package document",
      };
    }
    if (!isNativeInstalledPackage(body) || body.id !== gameId) {
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid package document",
      };
    }
    return { ok: true, status: host.status, package: body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listNativePackages(
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativePackageInventoryResult> {
  const host = await checkNativeHost(href, fetcher, timeoutMs);
  if (!host.ok) return host;
  if (!host.status.capabilities.includes("trusted-package-catalog")) {
    return {
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
      detail: "Rust host connected · no trusted installed package catalog is configured",
    };
  }
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind !== "configured") {
    return {
      ok: false,
      code: "HOST_CONFIG_INVALID",
      detail: "Rust console host launch capability is invalid",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(`${parsed.bridge.endpoint}/v1/packages`, {
        method: "GET",
        headers: { Authorization: `Bearer ${parsed.bridge.token}` },
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch {
      return unreachableHost();
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: "HOST_REJECTED",
        detail: "Rust console host rejected this launcher session",
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        code: "PACKAGE_NOT_INSTALLED",
        detail: "Rust console host has no trusted installed package catalog",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        code: "HOST_UNREACHABLE",
        detail: `Rust console host returned status ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response, MAX_HOST_PACKAGE_INVENTORY_BYTES);
    } catch {
      if (controller.signal.aborted) return unreachableHost();
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid package inventory",
      };
    }
    if (!isNativePackageInventory(body)) {
      return {
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
        detail: "Rust console host returned an invalid package inventory",
      };
    }
    return { ok: true, status: host.status, inventory: body };
  } finally {
    clearTimeout(timeout);
  }
}

export function createNativeLaunchRequestId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function startNativeLaunch(
  gameId: string,
  profileId: string,
  requestId = createNativeLaunchRequestId(),
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_LAUNCH_TIMEOUT_MS,
): Promise<NativeLaunchStartResult> {
  if (!isIntentId(gameId) || !isIntentId(profileId) || !isRequestId(requestId)) {
    return {
      ok: false,
      code: "PACKAGE_LAUNCH_FAILED",
      detail: "Native launch intent is invalid",
    };
  }
  const host = await checkNativeHost(href, fetcher, timeoutMs);
  if (!host.ok) return host;
  if (!host.status.capabilities.includes("trusted-package-launch")) {
    return {
      ok: false,
      code: "PACKAGE_LAUNCH_FAILED",
      detail: "Rust host connected · trusted package execution is not configured",
    };
  }
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind !== "configured") {
    return {
      ok: false,
      code: "HOST_CONFIG_INVALID",
      detail: "Rust console host launch capability is invalid",
    };
  }

  const response = await fetchNative(
    `${parsed.bridge.endpoint}/v1/launches`,
    parsed.bridge.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocolVersion: HOST_API_PROTOCOL_VERSION,
        requestId,
        gameId,
        profileId,
      }),
    },
    fetcher,
    timeoutMs,
  );
  if (!response.ok) return response.failure;
  if (![200, 202, 422].includes(response.value.status)) {
    return launchHttpFailure(response.value.status, response.value.body);
  }
  const launch = parseLaunchResponse(response.value.body);
  if (
    !launch ||
    launch.requestId !== requestId ||
    launch.gameId !== gameId ||
    launch.profileId !== profileId
  ) {
    return invalidLaunchDocument();
  }
  return { ok: true, status: host.status, launch };
}

export async function getNativeLaunch(
  requestId: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativeLaunchSnapshotResult> {
  return mutateOrReadNativeLaunch("GET", requestId, href, fetcher, timeoutMs);
}

export async function cancelNativeLaunch(
  requestId: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativeLaunchSnapshotResult> {
  return mutateOrReadNativeLaunch("DELETE", requestId, href, fetcher, timeoutMs);
}

export async function listBluetoothControllers(
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_BLUETOOTH_TIMEOUT_MS,
): Promise<NativeBluetoothResult> {
  return bluetoothRequest("GET", "/v1/bluetooth", undefined, href, fetcher, timeoutMs);
}

export async function scanBluetoothControllers(
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_BLUETOOTH_TIMEOUT_MS,
): Promise<NativeBluetoothResult> {
  return bluetoothRequest("POST", "/v1/bluetooth/scan", undefined, href, fetcher, timeoutMs);
}

export async function pairBluetoothController(
  id: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_BLUETOOTH_TIMEOUT_MS,
): Promise<NativeBluetoothResult> {
  if (!BLUETOOTH_DEVICE_ID_PATTERN.test(id)) return invalidBluetoothDevice();
  return bluetoothRequest(
    "POST",
    `/v1/bluetooth/devices/${id}/pair`,
    id,
    href,
    fetcher,
    timeoutMs,
  );
}

export async function forgetBluetoothController(
  id: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_BLUETOOTH_TIMEOUT_MS,
): Promise<NativeBluetoothResult> {
  if (!BLUETOOTH_DEVICE_ID_PATTERN.test(id)) return invalidBluetoothDevice();
  return bluetoothRequest(
    "DELETE",
    `/v1/bluetooth/devices/${id}`,
    id,
    href,
    fetcher,
    timeoutMs,
  );
}

async function bluetoothRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  expectedId: string | undefined,
  href: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<NativeBluetoothResult> {
  const host = await checkNativeHost(href, fetcher, timeoutMs);
  if (!host.ok) return host;
  if (!host.status.capabilities.includes("bluetooth-controller-pairing")) {
    return {
      ok: false,
      code: "BLUETOOTH_SERVICE_UNAVAILABLE",
      detail: "Bluetooth controller setup is not configured on this console",
    };
  }
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind !== "configured") {
    return {
      ok: false,
      code: "HOST_CONFIG_INVALID",
      detail: "Rust console host launch capability is invalid",
    };
  }
  const response = await fetchNative(
    `${parsed.bridge.endpoint}${path}`,
    parsed.bridge.token,
    method === "POST"
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ protocolVersion: HOST_API_PROTOCOL_VERSION }),
        }
      : { method },
    fetcher,
    timeoutMs,
  );
  if (!response.ok) return response.failure;
  if (!response.value.responseOk) {
    return bluetoothHttpFailure(response.value.status);
  }
  if (!isNativeBluetoothSnapshot(response.value.body)) {
    return {
      ok: false,
      code: "HOST_PROTOCOL_INVALID",
      detail: "Rust console host returned an invalid Bluetooth controller document",
    };
  }
  if (
    expectedId !== undefined &&
    method !== "DELETE" &&
    !response.value.body.devices.some((device) => device.id === expectedId)
  ) {
    return invalidBluetoothDevice();
  }
  return { ok: true, status: host.status, snapshot: response.value.body };
}

function bluetoothHttpFailure(status: number): NativeHostFailure {
  if (status === 404) return invalidBluetoothDevice();
  return {
    ok: false,
    code: status === 503 ? "BLUETOOTH_SERVICE_UNAVAILABLE" : "BLUETOOTH_OPERATION_FAILED",
    detail:
      status === 503
        ? "The local Bluetooth service did not complete the controller operation"
        : `The console rejected the Bluetooth controller operation (status ${status})`,
  };
}

function invalidBluetoothDevice(): NativeHostFailure {
  return {
    ok: false,
    code: "BLUETOOTH_OPERATION_FAILED",
    detail: "That controller is no longer available; scan again",
  };
}

async function mutateOrReadNativeLaunch(
  method: "GET" | "DELETE",
  requestId: string,
  href: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<NativeLaunchSnapshotResult> {
  if (!isRequestId(requestId)) {
    return {
      ok: false,
      code: "LAUNCH_NOT_FOUND",
      detail: "Native launch session is invalid",
    };
  }
  const parsed = parseNativeHostBridge(href);
  if (parsed.kind !== "configured") {
    return {
      ok: false,
      code: parsed.kind === "absent" ? "HOST_NOT_CONNECTED" : "HOST_CONFIG_INVALID",
      detail:
        parsed.kind === "absent"
          ? "Rust console host is not connected in this browser session"
          : "Rust console host launch capability is invalid",
    };
  }
  const response = await fetchNative(
    `${parsed.bridge.endpoint}/v1/launches/${requestId}`,
    parsed.bridge.token,
    { method },
    fetcher,
    timeoutMs,
  );
  if (!response.ok) return response.failure;
  if (!response.value.responseOk) {
    return launchHttpFailure(response.value.status, response.value.body);
  }
  const launch = parseLaunchResponse(response.value.body);
  if (!launch || launch.requestId !== requestId) return invalidLaunchDocument();
  return { ok: true, launch };
}

type NativeFetchResult =
  | {
      ok: true;
      value: { status: number; responseOk: boolean; body: unknown };
    }
  | { ok: false; failure: NativeHostFailure };

async function fetchNative(
  url: string,
  token: string,
  init: Pick<RequestInit, "method" | "headers" | "body">,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<NativeFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const response = await fetcher(url, {
        ...init,
        headers,
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          failure: {
            ok: false,
            code: "HOST_REJECTED",
            detail: "Rust console host rejected this launcher session",
          },
        };
      }
      let body: unknown;
      try {
        body = await readBoundedJson(response);
      } catch {
        if (controller.signal.aborted) {
          return { ok: false, failure: unreachableHost() };
        }
        if (response.ok || response.status === 422) {
          return { ok: false, failure: invalidLaunchDocument() };
        }
      }
      return {
        ok: true,
        value: {
          status: response.status,
          responseOk: response.ok,
          body,
        },
      };
    } catch {
      return { ok: false, failure: unreachableHost() };
    }
  } finally {
    clearTimeout(timeout);
  }
}

function parseLaunchResponse(body: unknown): NativeLaunchSnapshot | undefined {
  return isNativeLaunchSnapshot(body) ? body : undefined;
}

function launchHttpFailure(status: number, body: unknown): NativeHostFailure {
  const hostCode =
    typeof body === "object" &&
    body !== null &&
    Object.keys(body).length === 1 &&
    typeof (body as Record<string, unknown>).code === "string"
      ? ((body as Record<string, unknown>).code as string)
      : undefined;
  if (status === 503 && hostCode === "LAUNCH_RESTART_CLEANUP_REQUIRED") {
    return {
      ok: false,
      code: "LAUNCH_RESTART_CLEANUP_REQUIRED",
      detail:
        "Rust console host is waiting for trusted cleanup of an interrupted native game",
    };
  }
  if (status === 503 && hostCode === "LAUNCH_REPLAY_UNAVAILABLE") {
    return {
      ok: false,
      code: "LAUNCH_REPLAY_UNAVAILABLE",
      detail: "Rust console host could not verify durable native launch replay state",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      code: "LAUNCH_NOT_FOUND",
      detail: "Native launch session or host-owned profile is not available",
    };
  }
  return {
    ok: false,
    code: "PACKAGE_LAUNCH_FAILED",
    detail:
      status === 409
        ? "Rust console host rejected a conflicting launch request"
        : `Rust console host could not start the trusted package (status ${status})`,
  };
}

function invalidLaunchDocument(): NativeHostFailure {
  return {
    ok: false,
    code: "HOST_PROTOCOL_INVALID",
    detail: "Rust console host returned an invalid launch document",
  };
}

function unreachableHost(): NativeHostFailure {
  return {
    ok: false,
    code: "HOST_UNREACHABLE",
    detail: "Rust console host did not answer on the local appliance channel",
  };
}

async function readBoundedJson(
  response: Response,
  maxBytes = MAX_HOST_STATUS_BYTES,
): Promise<unknown> {
  const declaredLengthText = response.headers.get("content-length");
  if (declaredLengthText !== null) {
    const declaredLength = Number(declaredLengthText);
    if (
      !/^(0|[1-9][0-9]*)$/.test(declaredLengthText) ||
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > maxBytes
    ) {
      throw new Error("host status content length is invalid");
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error("host status body is too large");
    }
    return parseJsonWithUniqueObjectFields(text);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel("host status body is too large");
        throw new Error("host status body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseJsonWithUniqueObjectFields(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
}

function isNativeHostStatus(
  value: unknown,
): value is Omit<NativeHostStatus, "protocolVersion"> & { protocolVersion: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, ["protocolVersion", "hostVersion", "target", "capabilities"]) ||
    !isVisibleAscii(candidate.protocolVersion, MAX_HOST_PROTOCOL_VERSION_CHARACTERS) ||
    !isVisibleAscii(candidate.hostVersion, MAX_HOST_VERSION_CHARACTERS) ||
    typeof candidate.target !== "string" ||
    candidate.target.length > MAX_HOST_TARGET_CHARACTERS ||
    !HOST_TARGET_PATTERN.test(candidate.target) ||
    !Array.isArray(candidate.capabilities) ||
    candidate.capabilities.length > MAX_HOST_CAPABILITY_COUNT
  ) {
    return false;
  }
  const capabilities = candidate.capabilities;
  return (
    capabilities.every(
      (capability) =>
        typeof capability === "string" &&
        capability.length <= MAX_HOST_CAPABILITY_CHARACTERS &&
        HOST_CAPABILITY_PATTERN.test(capability),
    ) && new Set(capabilities).size === capabilities.length
  );
}

function isNativeBluetoothSnapshot(value: unknown): value is NativeBluetoothSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, ["protocolVersion", "devices"]) ||
    candidate.protocolVersion !== HOST_API_PROTOCOL_VERSION ||
    !Array.isArray(candidate.devices) ||
    candidate.devices.length > 16
  ) {
    return false;
  }
  let previousNumber: number | undefined;
  for (const value of candidate.devices) {
    if (typeof value !== "object" || value === null) return false;
    const device = value as Record<string, unknown>;
    if (
      !hasExactKeys(device, ["id", "paired", "connected"]) ||
      typeof device.id !== "string" ||
      !BLUETOOTH_DEVICE_ID_PATTERN.test(device.id) ||
      typeof device.paired !== "boolean" ||
      typeof device.connected !== "boolean" ||
      bluetoothDeviceNumber(device.id) === undefined
    ) {
      return false;
    }
    const number = bluetoothDeviceNumber(device.id);
    if (number === undefined || (previousNumber !== undefined && number <= previousNumber)) {
      return false;
    }
    previousNumber = number;
  }
  return true;
}

function bluetoothDeviceNumber(id: string): number | undefined {
  const match = BLUETOOTH_DEVICE_ID_PATTERN.exec(id);
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]);
}

function isNativeInstalledPackage(value: unknown): value is NativeInstalledPackage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    hasNativePackageSummaryFields(candidate) &&
    Number.isSafeInteger(candidate.catalogGeneration) &&
    (candidate.catalogGeneration as number) > 0 &&
    Object.keys(candidate).every((key) =>
      ["id", "version", "runtime", "catalogGeneration"].includes(key),
    )
  );
}

function isNativePackageInventory(value: unknown): value is NativePackageInventory {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.protocolVersion !== HOST_API_PROTOCOL_VERSION ||
    !Number.isSafeInteger(candidate.catalogGeneration) ||
    (candidate.catalogGeneration as number) <= 0 ||
    !Array.isArray(candidate.packages) ||
    candidate.packages.length > MAX_HOST_PACKAGE_COUNT ||
    !Object.keys(candidate).every((key) =>
      ["protocolVersion", "catalogGeneration", "packages"].includes(key),
    )
  ) {
    return false;
  }
  let previousId: string | undefined;
  for (const packageValue of candidate.packages) {
    if (!isNativePackageSummary(packageValue)) return false;
    if (previousId !== undefined && packageValue.id <= previousId) return false;
    previousId = packageValue.id;
  }
  return true;
}

function isNativePackageSummary(value: unknown): value is NativePackageSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    hasNativePackageSummaryFields(candidate) &&
    Object.keys(candidate).every((key) => ["id", "version", "runtime"].includes(key))
  );
}

function hasNativePackageSummaryFields(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate.id === "string" &&
    candidate.id.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id) &&
    isVisibleAscii(candidate.version, MAX_PACKAGE_VERSION_CHARACTERS) &&
    candidate.runtime === "libretro"
  );
}

function isVisibleAscii(value: unknown, maxCharacters: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxCharacters &&
    VISIBLE_ASCII_PATTERN.test(value)
  );
}

function hasExactKeys(candidate: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(candidate);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isIntentId(value: string): boolean {
  return (
    value.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

function isRequestId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

function isNativeLaunchSnapshot(value: unknown): value is NativeLaunchSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const states: NativeLaunchState[] = [
    "preparing",
    "running",
    "stopping",
    "completed",
    "failed",
    "cancelled",
  ];
  const terminalWithExit = candidate.state === "completed" || candidate.state === "failed";
  const hasValidExit = terminalWithExit
    ? Object.hasOwn(candidate, "exitCode") &&
      (candidate.exitCode === null || Number.isSafeInteger(candidate.exitCode))
    : !Object.hasOwn(candidate, "exitCode");
  return (
    candidate.protocolVersion === HOST_API_PROTOCOL_VERSION &&
    typeof candidate.requestId === "string" &&
    isRequestId(candidate.requestId) &&
    typeof candidate.gameId === "string" &&
    isIntentId(candidate.gameId) &&
    typeof candidate.profileId === "string" &&
    isIntentId(candidate.profileId) &&
    typeof candidate.state === "string" &&
    states.includes(candidate.state as NativeLaunchState) &&
    Number.isSafeInteger(candidate.sequence) &&
    (candidate.sequence as number) > 0 &&
    typeof candidate.detailCode === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate.detailCode) &&
    typeof candidate.replayed === "boolean" &&
    hasValidExit &&
    Object.keys(candidate).every((key) =>
      [
        "protocolVersion",
        "requestId",
        "gameId",
        "profileId",
        "state",
        "sequence",
        "detailCode",
        "replayed",
        "exitCode",
      ].includes(key),
    )
  );
}
