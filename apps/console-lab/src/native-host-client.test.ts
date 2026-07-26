import { describe, expect, it, vi } from "vitest";
import {
  cancelNativeLaunch,
  checkNativeHost,
  checkNativePackage,
  createNativeLaunchRequestId,
  getNativeLaunch,
  listNativePackages,
  parseNativeHostBridge,
  startNativeLaunch,
} from "./native-host-client";

const TOKEN = "a".repeat(64);
const HOST_URL = `http://127.0.0.1:5173/?skipBoot=1#vcg-host-port=43123&vcg-host-token=${TOKEN}`;
const STATUS = {
  protocolVersion: "0.1.0",
  hostVersion: "0.1.0",
  target: "x86_64-windows",
  capabilities: ["launcher-shell", "process-supervision"],
};

describe("native host bridge configuration", () => {
  it("distinguishes absent configuration from a valid per-launch capability", () => {
    expect(parseNativeHostBridge("http://127.0.0.1:5173/?skipBoot=1")).toEqual({ kind: "absent" });
    expect(parseNativeHostBridge(HOST_URL)).toEqual({
      kind: "configured",
      bridge: {
        endpoint: "http://127.0.0.1:43123",
        token: TOKEN,
      },
    });
  });

  it("rejects partial, duplicate, or malformed fragment values", () => {
    for (const fragment of [
      "#vcg-host-port=43123",
      `#vcg-host-token=${TOKEN}`,
      `#vcg-host-port=0&vcg-host-token=${TOKEN}`,
      `#vcg-host-port=01&vcg-host-token=${TOKEN}`,
      `#vcg-host-port=1e3&vcg-host-token=${TOKEN}`,
      `#vcg-host-port=70000&vcg-host-token=${TOKEN}`,
      "#vcg-host-port=43123&vcg-host-token=not-a-token",
      `#vcg-host-port=43123&vcg-host-port=43124&vcg-host-token=${TOKEN}`,
      `#vcg-host-port=43123&vcg-host-token=${TOKEN}&unexpected=value`,
    ]) {
      expect(parseNativeHostBridge(`http://127.0.0.1:5173/${fragment}`)).toEqual({ kind: "invalid" });
    }
  });
});

describe("native host status", () => {
  it("authenticates to the fixed loopback endpoint without credentials or referrer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(STATUS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(checkNativeHost(HOST_URL, fetcher)).resolves.toEqual({ ok: true, status: STATUS });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:43123/v1/status",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
        credentials: "omit",
        mode: "cors",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("reports missing, rejected, unreachable, and incompatible hosts distinctly", async () => {
    await expect(checkNativeHost("http://127.0.0.1:5173/", vi.fn())).resolves.toMatchObject({
      ok: false,
      code: "HOST_NOT_CONNECTED",
    });
    await expect(
      checkNativeHost(HOST_URL, vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }))),
    ).resolves.toMatchObject({ ok: false, code: "HOST_REJECTED" });
    await expect(checkNativeHost(HOST_URL, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).resolves.toMatchObject({
      ok: false,
      code: "HOST_UNREACHABLE",
    });
    await expect(
      checkNativeHost(
        HOST_URL,
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ ...STATUS, protocolVersion: "9.0.0" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    ).resolves.toMatchObject({ ok: false, code: "HOST_PROTOCOL_MISMATCH" });
  });

  it("rejects malformed successful status documents", async () => {
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...STATUS, capabilities: ["launcher-shell", 7] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(checkNativeHost(HOST_URL, invalid)).resolves.toMatchObject({
      ok: false,
      code: "HOST_PROTOCOL_INVALID",
    });
  });

  it("rejects oversized status bodies without consuming them", async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(" ".repeat(16_385), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(checkNativeHost(HOST_URL, oversized)).resolves.toMatchObject({
      ok: false,
      code: "HOST_PROTOCOL_INVALID",
    });
  });

  it("rejects oversized or malformed declared status lengths before reading", async () => {
    for (const contentLength of ["16385", "-1", "not-a-number"]) {
      const response = new Response("{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": contentLength,
        },
      });
      Object.defineProperty(response, "body", {
        get: () => {
          throw new Error("body must not be read");
        },
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

      await expect(checkNativeHost(HOST_URL, fetcher)).resolves.toMatchObject({
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
      });
    }
  });

  it("keeps the request deadline active while reading the status body", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener(
            "abort",
            () => controller.error(new DOMException("timed out", "AbortError")),
            {
              once: true,
            },
          );
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(checkNativeHost(HOST_URL, fetcher, 5)).resolves.toMatchObject({
      ok: false,
      code: "HOST_UNREACHABLE",
    });
  });
});

describe("trusted native package catalog", () => {
  const catalogStatus = {
    ...STATUS,
    capabilities: [...STATUS.capabilities, "trusted-package-catalog"],
  };

  it("queries a signed package by fixed game id without sending paths or hashes", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.endsWith("/v1/status")) {
        return new Response(JSON.stringify(catalogStatus), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "retro-2048",
          version: "1.0.0",
          runtime: "libretro",
          catalogGeneration: 7,
        }),
        { status: 200 },
      );
    });

    await expect(checkNativePackage("retro-2048", HOST_URL, fetcher)).resolves.toEqual({
      ok: true,
      status: catalogStatus,
      package: {
        id: "retro-2048",
        version: "1.0.0",
        runtime: "libretro",
        catalogGeneration: 7,
      },
    });
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:43123/v1/status",
        authorization: `Bearer ${TOKEN}`,
      },
      {
        url: "http://127.0.0.1:43123/v1/packages/retro-2048",
        authorization: `Bearer ${TOKEN}`,
      },
    ]);
    expect(JSON.stringify(requests)).not.toMatch(/path|sha256|program|command/i);
  });

  it("lists canonical signed package availability without native authority fields", async () => {
    const requests: string[] = [];
    const inventory = {
      protocolVersion: "0.1.0",
      catalogGeneration: 7,
      packages: [
        { id: "alpha-game", version: "2.0.0", runtime: "libretro" },
        { id: "retro-2048", version: "1.0.0", runtime: "libretro" },
      ],
    };
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      requests.push(url);
      return url.endsWith("/v1/status")
        ? new Response(JSON.stringify(catalogStatus), { status: 200 })
        : new Response(JSON.stringify(inventory), { status: 200 });
    });

    await expect(listNativePackages(HOST_URL, fetcher)).resolves.toEqual({
      ok: true,
      status: catalogStatus,
      inventory,
    });
    expect(requests).toEqual([
      "http://127.0.0.1:43123/v1/status",
      "http://127.0.0.1:43123/v1/packages",
    ]);
    expect(JSON.stringify(inventory)).not.toMatch(
      /path|sha256|program|command|environment|permission/i,
    );
  });

  it("accepts a valid inventory larger than the small host-status body bound", async () => {
    const packages = Array.from({ length: 200 }, (_, index) => ({
      id: `game-${index.toString().padStart(4, "0")}`,
      version: "v".repeat(128),
      runtime: "libretro" as const,
    }));
    const inventory = {
      protocolVersion: "0.1.0",
      catalogGeneration: 7,
      packages,
    };
    expect(new TextEncoder().encode(JSON.stringify(inventory)).byteLength).toBeGreaterThan(16_384);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogStatus), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(inventory), { status: 200 }));

    await expect(listNativePackages(HOST_URL, fetcher)).resolves.toMatchObject({
      ok: true,
      inventory: { packages },
    });
  });

  it("rejects ambiguous, noncanonical, or excessive package inventories", async () => {
    const valid = {
      protocolVersion: "0.1.0",
      catalogGeneration: 7,
      packages: [
        { id: "alpha-game", version: "2.0.0", runtime: "libretro" },
        { id: "retro-2048", version: "1.0.0", runtime: "libretro" },
      ],
    };
    const excessive = Array.from({ length: 1_025 }, (_, index) => ({
      id: `game-${index.toString().padStart(4, "0")}`,
      version: "1.0.0",
      runtime: "libretro",
    }));
    const invalidDocuments: unknown[] = [
      { ...valid, protocolVersion: "2.0.0" },
      { ...valid, catalogGeneration: 0 },
      { ...valid, packages: [...valid.packages].reverse() },
      { ...valid, packages: [valid.packages[0], valid.packages[0]] },
      {
        ...valid,
        packages: [{ ...valid.packages[0], installPath: "C:\\private" }],
      },
      { ...valid, packages: excessive },
      { ...valid, unexpected: true },
    ];

    for (const document of invalidDocuments) {
      const fetcher = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify(catalogStatus), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(document), { status: 200 }));
      await expect(listNativePackages(HOST_URL, fetcher)).resolves.toMatchObject({
        ok: false,
        code: "HOST_PROTOCOL_INVALID",
      });
    }
  });

  it("rejects an oversized package inventory before reading its body", async () => {
    const response = new Response("{}", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "1048577",
      },
    });
    Object.defineProperty(response, "body", {
      get: () => {
        throw new Error("body must not be read");
      },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogStatus), { status: 200 }))
      .mockResolvedValueOnce(response);

    await expect(listNativePackages(HOST_URL, fetcher)).resolves.toMatchObject({
      ok: false,
      code: "HOST_PROTOCOL_INVALID",
    });
  });

  it("fails closed when the catalog is absent or the package is not installed", async () => {
    const noCatalog = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(STATUS), { status: 200 }));
    await expect(checkNativePackage("retro-2048", HOST_URL, noCatalog)).resolves.toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
    });
    await expect(listNativePackages(HOST_URL, noCatalog)).resolves.toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
    });
    expect(noCatalog).toHaveBeenCalledTimes(2);

    const missing = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogStatus), { status: 200 }))
      .mockResolvedValueOnce(new Response('{"code":"PACKAGE_NOT_INSTALLED"}', { status: 404 }));
    await expect(checkNativePackage("retro-2048", HOST_URL, missing)).resolves.toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
    });
  });

  it("rejects invalid intents and mismatched package documents", async () => {
    const unused = vi.fn<typeof fetch>();
    await expect(checkNativePackage("../escape", HOST_URL, unused)).resolves.toMatchObject({
      ok: false,
      code: "PACKAGE_NOT_INSTALLED",
    });
    expect(unused).not.toHaveBeenCalled();

    const mismatched = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogStatus), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "another-game",
            version: "1.0.0",
            runtime: "libretro",
            catalogGeneration: 7,
          }),
          { status: 200 },
        ),
      );
    await expect(checkNativePackage("retro-2048", HOST_URL, mismatched)).resolves.toMatchObject({
      ok: false,
      code: "HOST_PROTOCOL_INVALID",
    });
  });
});

describe("trusted native launch lifecycle", () => {
  const requestId = "1".repeat(32);
  const launchStatus = {
    ...STATUS,
    capabilities: [...STATUS.capabilities, "trusted-package-catalog", "trusted-package-launch"],
  };
  const running = {
    protocolVersion: "0.1.0",
    requestId,
    gameId: "retro-2048",
    profileId: "local-player",
    state: "running",
    sequence: 2,
    detailCode: "PROCESS_STARTED",
    replayed: false,
  };

  it("creates a fresh bounded correlation id without embedding intent", () => {
    const first = createNativeLaunchRequestId();
    const second = createNativeLaunchRequestId();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it("posts only versioned fixed intent and accepts a host-owned lifecycle record", async () => {
    const requests: Array<{ url: string; method: string; authorization: string | null; body: string | null }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return url.endsWith("/v1/status")
        ? new Response(JSON.stringify(launchStatus), { status: 200 })
        : new Response(JSON.stringify(running), { status: 202 });
    });

    await expect(
      startNativeLaunch("retro-2048", "local-player", requestId, HOST_URL, fetcher, 100),
    ).resolves.toEqual({ ok: true, status: launchStatus, launch: running });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
      url: "http://127.0.0.1:43123/v1/launches",
      method: "POST",
      authorization: `Bearer ${TOKEN}`,
      body: JSON.stringify({
        protocolVersion: "0.1.0",
        requestId,
        gameId: "retro-2048",
        profileId: "local-player",
      }),
    });
    expect(JSON.stringify(requests)).not.toMatch(/path|sha256|program|command|environment/i);
  });

  it("preserves a verified pre-start failure as an observable idempotent record", async () => {
    const failed = {
      ...running,
      state: "failed",
      sequence: 2,
      detailCode: "PROCESS_START_FAILED",
      exitCode: null,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(launchStatus), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(failed), { status: 422 }));

    await expect(
      startNativeLaunch("retro-2048", "local-player", requestId, HOST_URL, fetcher, 100),
    ).resolves.toEqual({ ok: true, status: launchStatus, launch: failed });
  });

  it.each([
    [
      "LAUNCH_REPLAY_UNAVAILABLE",
      "Rust console host could not verify durable native launch replay state",
    ],
    [
      "LAUNCH_RESTART_CLEANUP_REQUIRED",
      "Rust console host is waiting for trusted cleanup of an interrupted native game",
    ],
  ] as const)("preserves the bounded host recovery failure %s", async (code, detail) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(launchStatus), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      startNativeLaunch("retro-2048", "local-player", requestId, HOST_URL, fetcher, 100),
    ).resolves.toEqual({ ok: false, code, detail });
  });

  it("reads and cancels lifecycle state with the same authenticated request id", async () => {
    const stopping = {
      ...running,
      state: "stopping",
      sequence: 3,
      detailCode: "CANCEL_REQUESTED",
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(running), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(stopping), { status: 202 }));

    await expect(getNativeLaunch(requestId, HOST_URL, fetcher, 100)).resolves.toEqual({
      ok: true,
      launch: running,
    });
    await expect(cancelNativeLaunch(requestId, HOST_URL, fetcher, 100)).resolves.toEqual({
      ok: true,
      launch: stopping,
    });
    expect(fetcher.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method,
      authorization: new Headers(init?.headers).get("authorization"),
    }))).toEqual([
      {
        url: `http://127.0.0.1:43123/v1/launches/${requestId}`,
        method: "GET",
        authorization: `Bearer ${TOKEN}`,
      },
      {
        url: `http://127.0.0.1:43123/v1/launches/${requestId}`,
        method: "DELETE",
        authorization: `Bearer ${TOKEN}`,
      },
    ]);
  });

  it("fails closed on invalid intent and mismatched lifecycle identity", async () => {
    const unused = vi.fn<typeof fetch>();
    await expect(
      startNativeLaunch("../escape", "local-player", requestId, HOST_URL, unused, 100),
    ).resolves.toMatchObject({ ok: false, code: "PACKAGE_LAUNCH_FAILED" });
    expect(unused).not.toHaveBeenCalled();

    const mismatched = {
      ...running,
      gameId: "another-game",
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(launchStatus), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mismatched), { status: 202 }));
    await expect(
      startNativeLaunch("retro-2048", "local-player", requestId, HOST_URL, fetcher, 100),
    ).resolves.toMatchObject({ ok: false, code: "HOST_PROTOCOL_INVALID" });
  });
});
