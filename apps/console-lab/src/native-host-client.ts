// Host operations. Wire validation and transport have separate owners.
import {
  HOST_API_PROTOCOL_VERSION,
  HOST_REQUEST_TIMEOUT_MS,
  HOST_LAUNCH_TIMEOUT_MS,
  HOST_BLUETOOTH_TIMEOUT_MS,
  MAX_HOST_PACKAGE_INVENTORY_BYTES,
  BLUETOOTH_DEVICE_ID_PATTERN,
  MAX_HOST_LIBRARY_PAGE_BYTES,
  LIBRARY_ENTRY_ID_PATTERN,
  LIBRARY_CURSOR_PATTERN,
  type NativeHostStatus,
  type NativeHostResult,
  type NativePackageResult,
  type NativePackageInventoryResult,
  type NativeLaunchStartResult,
  type NativeLaunchSnapshotResult,
  type NativeBluetoothResult,
  type NativeLibraryPageResult,
  bluetoothHttpFailure,
  invalidBluetoothDevice,
  parseLaunchResponse,
  launchHttpFailure,
  invalidLaunchDocument,
  invalidLibraryPage,
  unreachableHost,
  isNativeHostStatus,
  isNativeBluetoothSnapshot,
  isNativeLibraryPage,
  isNativeInstalledPackage,
  isNativePackageInventory,
  isIntentId,
  isRequestId,
} from "./native-host-protocol";
import {
  parseNativeHostBridge,
  fetchNative,
  readBoundedJson,
} from "./native-host-transport";

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

/**
 * Reads one page of the installed retro library.
 *
 * Pass no cursor for the first page and the `nextCursor` of the previous page
 * for every page after it. Cursors are opaque, forward-only, and do not
 * survive a host restart, so a stale cursor is reported rather than retried.
 */
export async function fetchNativeLibraryPage(
  cursor?: string,
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<NativeLibraryPageResult> {
  if (cursor !== undefined && !LIBRARY_CURSOR_PATTERN.test(cursor)) {
    return {
      ok: false,
      code: "LIBRARY_CURSOR_INVALID",
      detail: "The game library position is no longer valid; open the library again",
    };
  }
  const host = await checkNativeHost(href, fetcher, timeoutMs);
  if (!host.ok) return host;
  if (!host.status.capabilities.includes("retro-library")) {
    return {
      ok: false,
      code: "LIBRARY_UNAVAILABLE",
      detail: "Rust host connected · no installed game library is configured",
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
    const path = cursor === undefined ? "/v1/library" : `/v1/library/${cursor}`;
    let response: Response;
    try {
      response = await fetcher(`${parsed.bridge.endpoint}${path}`, {
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
        code: "LIBRARY_UNAVAILABLE",
        detail: "Rust console host has no installed game library",
      };
    }
    if (response.status === 400) {
      return {
        ok: false,
        code: "LIBRARY_CURSOR_INVALID",
        detail: "The game library position is no longer valid; open the library again",
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
      body = await readBoundedJson(response, MAX_HOST_LIBRARY_PAGE_BYTES);
    } catch {
      if (controller.signal.aborted) return unreachableHost();
      return invalidLibraryPage();
    }
    if (!isNativeLibraryPage(body)) return invalidLibraryPage();
    return { ok: true, status: host.status, page: body };
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
  return postNativeLaunch(gameId, profileId, undefined, requestId, href, fetcher, timeoutMs);
}

/**
 * Starts one installed package carrying one library entry the host published.
 *
 * The browser names the entry and nothing else: the system, core, path, and
 * digest all come from the host's own library, and the signed package record
 * decides whether an entry is admissible at all.
 */
export async function startNativeLibraryLaunch(
  gameId: string,
  profileId: string,
  entryId: string,
  requestId = createNativeLaunchRequestId(),
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
  timeoutMs = HOST_LAUNCH_TIMEOUT_MS,
): Promise<NativeLaunchStartResult> {
  if (!LIBRARY_ENTRY_ID_PATTERN.test(entryId)) {
    return {
      ok: false,
      code: "LIBRARY_ENTRY_NOT_FOUND",
      detail: "The selected game is not in the current installed library",
    };
  }
  return postNativeLaunch(gameId, profileId, entryId, requestId, href, fetcher, timeoutMs);
}

async function postNativeLaunch(
  gameId: string,
  profileId: string,
  entryId: string | undefined,
  requestId: string,
  href: string,
  fetcher: typeof fetch,
  timeoutMs: number,
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
  if (entryId !== undefined && !host.status.capabilities.includes("retro-library")) {
    return {
      ok: false,
      code: "LIBRARY_UNAVAILABLE",
      detail: "Rust host connected · no installed game library is configured",
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
      // The field is omitted, never sent as null, for a package that binds
      // fixed content: that is exactly the request every package sent before
      // the library existed.
      body: JSON.stringify({
        protocolVersion: HOST_API_PROTOCOL_VERSION,
        requestId,
        gameId,
        profileId,
        ...(entryId === undefined ? {} : { entryId }),
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

export type { NativeHostStatus, NativePackageSummary, NativeInstalledPackage, NativePackageInventory, NativeLaunchState, NativeLaunchSnapshot, NativeLibraryEntry, NativeLibraryPage, NativeBluetoothController, NativeBluetoothSnapshot, NativeHostFailure, NativeHostResult, NativePackageResult, NativePackageInventoryResult, NativeLaunchStartResult, NativeLaunchSnapshotResult, NativeBluetoothResult, NativeLibraryPageResult, NativeFetchResult } from "./native-host-protocol";
export { compareNativeLibraryEntries } from "./native-host-protocol";
export { parseNativeHostBridge } from "./native-host-transport";
