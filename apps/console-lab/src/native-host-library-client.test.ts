import { describe, expect, it, vi } from "vitest";
import {
  fetchNativeLibraryPage,
  startNativeLibraryLaunch,
} from "./native-host-client";

const TOKEN = "a".repeat(64);
const HOST_URL = `http://127.0.0.1:5173/?skipBoot=1#vcg-host-port=43123&vcg-host-token=${TOKEN}`;
const STATUS = {
  protocolVersion: "0.1.0",
  hostVersion: "0.1.0",
  target: "x86_64-windows",
  capabilities: ["launcher-shell", "process-supervision"],
};
const CURSOR = "b".repeat(32);

function contentId(index: number): string {
  return `content-${index.toString(16).padStart(64, "0")}`;
}

function libraryEntry(index: number, overrides: Record<string, unknown> = {}) {
  return {
    entryId: contentId(index),
    title: `Title ${String(index).padStart(4, "0")}`,
    systemId: "nes",
    coreId: "mesen",
    sizeBytes: 40_976,
    ...overrides,
  };
}

describe("installed retro library paging", () => {
  const libraryStatus = {
    ...STATUS,
    capabilities: [...STATUS.capabilities, "retro-library"],
  };

  function page(overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: "0.1.0",
      libraryGeneration: 2,
      entryCount: 2,
      entries: [libraryEntry(1), libraryEntry(2)],
      ...overrides,
    };
  }

  function respond(document: unknown) {
    return vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/v1/status")
        ? new Response(JSON.stringify(libraryStatus), { status: 200 })
        : new Response(JSON.stringify(document), { status: 200 }),
    );
  }

  it("walks the first page and one cursor page over the authenticated loopback route", async () => {
    const first = page({ nextCursor: CURSOR });
    const last = page({ entryCount: 4, entries: [libraryEntry(3), libraryEntry(4)] });
    const requests: Array<{
      url: string;
      method: string | undefined;
      authorization: string | null;
    }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.endsWith("/v1/status")) {
        return new Response(JSON.stringify(libraryStatus), { status: 200 });
      }
      return new Response(JSON.stringify(url.endsWith(CURSOR) ? last : first), { status: 200 });
    });

    await expect(fetchNativeLibraryPage(undefined, HOST_URL, fetcher, 100)).resolves.toEqual({
      ok: true,
      status: libraryStatus,
      page: first,
    });
    await expect(fetchNativeLibraryPage(CURSOR, HOST_URL, fetcher, 100)).resolves.toEqual({
      ok: true,
      status: libraryStatus,
      page: last,
    });
    expect(requests.map(({ url, method }) => ({ url, method }))).toEqual([
      { url: "http://127.0.0.1:43123/v1/status", method: "GET" },
      { url: "http://127.0.0.1:43123/v1/library", method: "GET" },
      { url: "http://127.0.0.1:43123/v1/status", method: "GET" },
      { url: `http://127.0.0.1:43123/v1/library/${CURSOR}`, method: "GET" },
    ]);
    expect(requests.every((request) => request.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("sends no credentials, referrer, or cache reuse with a library page request", async () => {
    const fetcher = respond(page());
    await fetchNativeLibraryPage(undefined, HOST_URL, fetcher, 100);
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://127.0.0.1:43123/v1/library",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("rejects a cursor outside the opaque grammar before any network access", async () => {
    const unused = vi.fn<typeof fetch>();
    for (const cursor of ["", "../v1/status", "B".repeat(32), "b".repeat(31), "b".repeat(33)]) {
      await expect(fetchNativeLibraryPage(cursor, HOST_URL, unused, 100)).resolves.toMatchObject({
        ok: false,
        code: "LIBRARY_CURSOR_INVALID",
      });
    }
    expect(unused).not.toHaveBeenCalled();
  });

  it("does not imply a library when the appliance capability is absent", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(STATUS), { status: 200 }));

    await expect(fetchNativeLibraryPage(undefined, HOST_URL, fetcher, 100)).resolves.toMatchObject({
      ok: false,
      code: "LIBRARY_UNAVAILABLE",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("separates an unconfigured library from a dead cursor", async () => {
    const missing = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/v1/status")
        ? new Response(JSON.stringify(libraryStatus), { status: 200 })
        : new Response(JSON.stringify({ code: "LIBRARY_UNAVAILABLE" }), { status: 404 }),
    );
    const dead = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/v1/status")
        ? new Response(JSON.stringify(libraryStatus), { status: 200 })
        : new Response(JSON.stringify({ code: "LIBRARY_CURSOR_INVALID" }), { status: 400 }),
    );

    await expect(fetchNativeLibraryPage(undefined, HOST_URL, missing, 100)).resolves.toMatchObject({
      ok: false,
      code: "LIBRARY_UNAVAILABLE",
    });
    await expect(fetchNativeLibraryPage(CURSOR, HOST_URL, dead, 100)).resolves.toMatchObject({
      ok: false,
      code: "LIBRARY_CURSOR_INVALID",
    });
  });

  it("accepts a full 256-entry page and rejects the first page above the bound", async () => {
    const ordered = (count: number) =>
      Array.from({ length: count }, (_, index) => libraryEntry(index + 1));
    const full = page({ entryCount: 256, entries: ordered(256) });
    const over = page({ entryCount: 257, entries: ordered(257) });

    await expect(
      fetchNativeLibraryPage(undefined, HOST_URL, respond(full), 100),
    ).resolves.toMatchObject({ ok: true, page: { entries: full.entries } });
    await expect(
      fetchNativeLibraryPage(undefined, HOST_URL, respond(over), 100),
    ).resolves.toMatchObject({ ok: false, code: "HOST_PROTOCOL_INVALID" });
  });

  it("rejects a page whose entries exceed the 64 KiB entry bound", async () => {
    const entries = Array.from({ length: 256 }, (_, index) =>
      libraryEntry(index + 1, {
        title: `Title ${String(index).padStart(4, "0")} ${"x".repeat(60)}`,
        systemId: `system-${"a".repeat(50)}`,
        coreId: `core-${"a".repeat(50)}`,
      }),
    );
    expect(new TextEncoder().encode(JSON.stringify(entries)).byteLength).toBeGreaterThan(65_536);

    await expect(
      fetchNativeLibraryPage(
        undefined,
        HOST_URL,
        respond(page({ entryCount: 256, entries })),
        100,
      ),
    ).resolves.toMatchObject({ ok: false, code: "HOST_PROTOCOL_INVALID" });
  });

  it.each([
    ["an unknown document field", () => page({ objectRoot: "/var/lib/vcg" })],
    ["a missing entry count", () => ({
      protocolVersion: "0.1.0",
      libraryGeneration: 2,
      entries: [libraryEntry(1)],
    })],
    ["a mismatched protocol version", () => page({ protocolVersion: "0.2.0" })],
    ["a zero library generation", () => page({ libraryGeneration: 0 })],
    ["an entry count above the library bound", () => page({ entryCount: 100_001 })],
    ["more entries than the library declares", () => page({ entryCount: 1 })],
    ["an unknown entry field", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { path: "rom.nes" })] })],
    ["a short entry digest", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { entryId: `content-${"a".repeat(63)}` })] })],
    ["an uppercase entry digest", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { entryId: `content-${"A".repeat(64)}` })] })],
    ["an unprefixed entry ID", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { entryId: "a".repeat(64) })] })],
    ["a system ID outside the identifier grammar", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { systemId: "NES" })] })],
    ["a core ID carrying a path traversal", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { coreId: "mesen/../sh" })] })],
    ["a title carrying a bidirectional override", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { title: "Balloon\u202EFight" })] })],
    ["a title carrying a path separator", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { title: "nes/Balloon Fight" })] })],
    ["an untrimmed title", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { title: " Balloon Fight" })] })],
    ["a decomposed title", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { title: "Pokemo\u0301n" })] })],
    ["an empty title", () => page({ entryCount: 1, entries: [libraryEntry(1, { title: "" })] })],
    ["a title above eighty characters", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { title: "T".repeat(81) })] })],
    ["a zero-byte entry", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { sizeBytes: 0 })] })],
    ["a fractional entry size", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { sizeBytes: 1.5 })] })],
    ["an entry size above the safe integer bound", () =>
      page({ entryCount: 1, entries: [libraryEntry(1, { sizeBytes: 9_007_199_254_740_992 })] })],
    ["entries out of title order", () => page({ entries: [libraryEntry(2), libraryEntry(1)] })],
    ["a repeated entry", () => page({ entries: [libraryEntry(1), libraryEntry(1)] })],
    ["entries out of system order", () =>
      page({
        entries: [libraryEntry(1, { systemId: "snes" }), libraryEntry(2, { systemId: "nes" })],
      })],
    ["a cursor outside the opaque grammar", () => page({ nextCursor: "b".repeat(31) })],
    ["a cursor after an empty page", () => ({
      protocolVersion: "0.1.0",
      libraryGeneration: 2,
      entryCount: 0,
      entries: [],
      nextCursor: CURSOR,
    })],
  ] as const)("refuses to render a page carrying %s", async (_label, build) => {
    await expect(
      fetchNativeLibraryPage(undefined, HOST_URL, respond(build()), 100),
    ).resolves.toMatchObject({ ok: false, code: "HOST_PROTOCOL_INVALID" });
  });

  it("orders titles by Unicode scalar rather than UTF-16 code unit", async () => {
    // U+1F600 sorts above U+E000 by scalar and below it by code unit, so a
    // page the host considers ordered must not read as unordered here.
    const ordered = page({
      entries: [
        libraryEntry(1, { title: "Zone \uE000" }),
        libraryEntry(2, { title: "Zone \u{1f600}" }),
      ],
    });

    await expect(
      fetchNativeLibraryPage(undefined, HOST_URL, respond(ordered), 100),
    ).resolves.toMatchObject({ ok: true });
  });

  it("accepts an empty library as a complete answer", async () => {
    const empty = {
      protocolVersion: "0.1.0",
      libraryGeneration: 1,
      entryCount: 0,
      entries: [],
    };

    await expect(
      fetchNativeLibraryPage(undefined, HOST_URL, respond(empty), 100),
    ).resolves.toEqual({ ok: true, status: libraryStatus, page: empty });
  });
});

describe("library entry launch", () => {
  const requestId = "2".repeat(32);
  const entryId = `content-${"c".repeat(64)}`;
  const libraryLaunchStatus = {
    ...STATUS,
    capabilities: [
      ...STATUS.capabilities,
      "trusted-package-catalog",
      "trusted-package-launch",
      "retro-library",
    ],
  };
  const running = {
    protocolVersion: "0.1.0",
    requestId,
    gameId: "nes-library",
    profileId: "local-player",
    state: "running",
    sequence: 2,
    detailCode: "PROCESS_STARTED",
    replayed: false,
  };

  it("adds exactly one host-published entry ID to the fixed launch intent", async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      return String(input).endsWith("/v1/status")
        ? new Response(JSON.stringify(libraryLaunchStatus), { status: 200 })
        : new Response(JSON.stringify(running), { status: 202 });
    });

    await expect(
      startNativeLibraryLaunch(
        "nes-library",
        "local-player",
        entryId,
        requestId,
        HOST_URL,
        fetcher,
        100,
      ),
    ).resolves.toEqual({ ok: true, status: libraryLaunchStatus, launch: running });
    expect(bodies).toEqual([
      JSON.stringify({
        protocolVersion: "0.1.0",
        requestId,
        gameId: "nes-library",
        profileId: "local-player",
        entryId,
      }),
    ]);
    expect(JSON.stringify(bodies)).not.toMatch(/path|sha256|systemid|coreid|argument/i);
  });

  it("refuses an entry ID outside the content grammar before any network access", async () => {
    const unused = vi.fn<typeof fetch>();
    for (const candidate of [
      `content-${"c".repeat(63)}`,
      "content-../rom",
      `content-${"C".repeat(64)}`,
      "c".repeat(64),
    ]) {
      await expect(
        startNativeLibraryLaunch(
          "nes-library",
          "local-player",
          candidate,
          requestId,
          HOST_URL,
          unused,
          100,
        ),
      ).resolves.toMatchObject({ ok: false, code: "LIBRARY_ENTRY_NOT_FOUND" });
    }
    expect(unused).not.toHaveBeenCalled();
  });

  it("does not send an entry to a host that publishes no library", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...STATUS,
          capabilities: [...STATUS.capabilities, "trusted-package-launch"],
        }),
        { status: 200 },
      ),
    );

    await expect(
      startNativeLibraryLaunch(
        "nes-library",
        "local-player",
        entryId,
        requestId,
        HOST_URL,
        fetcher,
        100,
      ),
    ).resolves.toMatchObject({ ok: false, code: "LIBRARY_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [404, "LIBRARY_UNAVAILABLE", "Rust console host has no installed game library"],
    [404, "LIBRARY_ENTRY_NOT_FOUND", "The selected game is not in the current installed library"],
    [
      409,
      "PACKAGE_REJECTS_LIBRARY_CONTENT",
      "The installed package does not accept library games",
    ],
    [409, "LIBRARY_ENTRY_INCOMPATIBLE", "The installed package cannot run this game's system"],
  ] as const)("preserves the host refusal %s %s", async (status, code, detail) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(libraryLaunchStatus), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      startNativeLibraryLaunch(
        "nes-library",
        "local-player",
        entryId,
        requestId,
        HOST_URL,
        fetcher,
        100,
      ),
    ).resolves.toEqual({ ok: false, code, detail });
  });
});
