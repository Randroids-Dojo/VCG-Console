import { describe, it, expect } from "vitest";
import { loadHostProfiles, parseHostProfileIds } from "./host-profiles";

describe("host-owned profile selection", () => {
  it("keeps opaque IDs exact and rejects invented fields, duplicates, invalid IDs and oversized lists", () => {
    const document = { protocolVersion: "0.1.0", profileIds: ["player-01", "family-02"] };
    expect(parseHostProfileIds(document)).toEqual(document.profileIds);
    for (const invalid of [
      { ...document, displayNames: ["Randy"] },
      { ...document, profileIds: ["player-01", "player-01"] },
      { ...document, profileIds: ["../secret"] },
      { ...document, profileIds: ["Profile Name"] },
      { ...document, profileIds: Array.from({ length: 65 }, (_, i) => `profile-${i}`) },
      { ...document, protocolVersion: "9.0.0" },
    ]) expect(parseHostProfileIds(invalid)).toBeUndefined();
  });

  it("does not create a profile when the host is absent or rejects selection", async () => {
    const fetcher = (async () => { throw new Error("must not fetch"); }) as typeof fetch;
    expect(await loadHostProfiles("http://127.0.0.1:4173", fetcher)).toMatchObject({ ok: false, code: "HOST_NOT_CONNECTED" });
    const token = "a".repeat(64);
    const href = `http://127.0.0.1:4173/#vcg-host-port=43210&vcg-host-token=${token}`;
    const result = await loadHostProfiles(href, async (url, init) => {
      expect(String(url)).toBe("http://127.0.0.1:43210/v1/profiles");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
      return new Response(JSON.stringify({ protocolVersion: "0.1.0", profileIds: ["owned-07"] }));
    });
    expect(result).toEqual({ ok: true, profiles: [{ id: "owned-07", name: "owned-07", detail: "Saved on this console" }] });
  });
});
