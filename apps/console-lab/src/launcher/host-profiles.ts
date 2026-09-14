import { HOST_API_PROTOCOL_VERSION, HOST_REQUEST_TIMEOUT_MS, hasExactKeys, isIntentId, type NativeHostFailure } from "../native-host-protocol";
import { parseNativeHostBridge, fetchNative } from "../native-host-transport";
import type { LocalProfile } from "./types";

export async function loadHostProfiles(
  href = window.location.href,
  fetcher: typeof fetch = window.fetch.bind(window),
): Promise<{ ok: true; profiles: LocalProfile[] } | NativeHostFailure> {
  const bridge = parseNativeHostBridge(href);
  if (bridge.kind !== "configured") return {
    ok: false,
    code: bridge.kind === "absent" ? "HOST_NOT_CONNECTED" : "HOST_CONFIG_INVALID",
    detail: "Connect the native console host to select a saved profile.",
  };
  const result = await fetchNative(`${bridge.bridge.endpoint}/v1/profiles`, bridge.bridge.token, { method: "GET" }, fetcher, HOST_REQUEST_TIMEOUT_MS);
  if (!result.ok) return result.failure;
  const ids = parseHostProfileIds(result.value.body);
  if (!result.value.responseOk || !ids) return {
    ok: false,
    code: "HOST_PROTOCOL_INVALID",
    detail: "Saved profile selection is unavailable from this host.",
  };
  // The registry stores opaque IDs only. Do not invent names or browser-owned IDs.
  return { ok: true, profiles: ids.map((id) => ({ id, name: id, detail: "Saved on this console" })) };
}

export function parseHostProfileIds(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const body = value as Record<string, unknown>;
  if (!hasExactKeys(body, ["protocolVersion", "profileIds"]) || body.protocolVersion !== HOST_API_PROTOCOL_VERSION) return;
  const ids: unknown = body.profileIds;
  if (!Array.isArray(ids) || ids.length > 64 || ids.some((id) => typeof id !== "string" || !isIntentId(id))) return;
  if (new Set(ids).size !== ids.length) return;
  return ids as string[];
}
