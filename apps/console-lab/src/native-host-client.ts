const HOST_API_PROTOCOL_VERSION = "0.1.0";
const HOST_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const HOST_PORT_PATTERN = /^[1-9][0-9]{0,4}$/;
const HOST_REQUEST_TIMEOUT_MS = 1_500;
const MAX_HOST_STATUS_BYTES = 16_384;

export interface NativeHostStatus {
  protocolVersion: typeof HOST_API_PROTOCOL_VERSION;
  hostVersion: string;
  target: string;
  capabilities: string[];
}

export type NativeHostResult =
  | { ok: true; status: NativeHostStatus }
  | {
      ok: false;
      code:
        | "HOST_NOT_CONNECTED"
        | "HOST_CONFIG_INVALID"
        | "HOST_UNREACHABLE"
        | "HOST_REJECTED"
        | "HOST_PROTOCOL_INVALID"
        | "HOST_PROTOCOL_MISMATCH";
      detail: string;
    };

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

function unreachableHost(): NativeHostResult {
  return {
    ok: false,
    code: "HOST_UNREACHABLE",
    detail: "Rust console host did not answer on the local appliance channel",
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLengthText = response.headers.get("content-length");
  if (declaredLengthText !== null) {
    const declaredLength = Number(declaredLengthText);
    if (
      !/^(0|[1-9][0-9]*)$/.test(declaredLengthText) ||
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > MAX_HOST_STATUS_BYTES
    ) {
      throw new Error("host status content length is invalid");
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_HOST_STATUS_BYTES) {
      throw new Error("host status body is too large");
    }
    return JSON.parse(text) as unknown;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HOST_STATUS_BYTES) {
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
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

function isNativeHostStatus(value: unknown): value is Omit<NativeHostStatus, "protocolVersion"> & { protocolVersion: string } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.protocolVersion === "string" &&
    typeof candidate.hostVersion === "string" &&
    candidate.hostVersion.length > 0 &&
    typeof candidate.target === "string" &&
    candidate.target.length > 0 &&
    Array.isArray(candidate.capabilities) &&
    candidate.capabilities.every((capability) => typeof capability === "string")
  );
}
