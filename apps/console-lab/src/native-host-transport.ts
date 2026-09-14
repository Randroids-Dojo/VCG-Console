// Authenticated loopback transport and bounded JSON consumption.
import {
  HOST_TOKEN_PATTERN,
  HOST_PORT_PATTERN,
  MAX_HOST_STATUS_BYTES,
  type ParsedHostBridge,
  type NativeFetchResult,
  invalidLaunchDocument,
  unreachableHost,
} from "./native-host-protocol";
import { parseJsonWithUniqueObjectFields } from "./strict-json";

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

export async function fetchNative(
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

export async function readBoundedJson(
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
