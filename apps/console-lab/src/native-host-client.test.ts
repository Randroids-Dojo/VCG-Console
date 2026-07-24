import { describe, expect, it, vi } from "vitest";
import { checkNativeHost, parseNativeHostBridge } from "./native-host-client";

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
