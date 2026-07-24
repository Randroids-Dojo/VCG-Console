import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildHostedBrowserArguments,
  createHostedBrowserPolicy,
  HostedBrowserNavigationGuard,
  HostedBrowserPolicyError,
  probeHostedBrowserContainment,
  requireHealthyHostedEndpoint,
  type HostedBrowserManifestInput,
  validateHostedBrowserProfilePath,
} from "./hosted-browser-supervisor";

function installedChromePath(): string | undefined {
  if (
    process.env.VCG_CHROME_PATH !== undefined
    && existsSync(process.env.VCG_CHROME_PATH)
  ) {
    return process.env.VCG_CHROME_PATH;
  }
  const candidates =
    process.platform === "win32"
      ? [
          process.env.ProgramFiles
            ? join(
                process.env.ProgramFiles,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              )
            : undefined,
          process.env["ProgramFiles(x86)"]
            ? join(
                process.env["ProgramFiles(x86)"],
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              )
            : undefined,
          process.env.LOCALAPPDATA
            ? join(
                process.env.LOCALAPPDATA,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
              )
            : undefined,
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ];
  return candidates
    .filter((candidate): candidate is string => candidate !== undefined)
    .find(existsSync);
}

function manifest(
  overrides: Partial<HostedBrowserManifestInput> = {},
): HostedBrowserManifestInput {
  return {
    id: "hosted-fixture",
    runtime: "remote-web",
    entrypoint: "https://game.example/play?mode=tv",
    allowedOrigins: ["https://game.example", "https://login.example"],
    launch: {
      timeoutMs: 30_000,
      healthCheck: { type: "http", path: "/health" },
    },
    ...overrides,
  };
}

function policy() {
  return createHostedBrowserPolicy(manifest());
}

describe("hosted browser policy", () => {
  it("binds one remote manifest to an immutable closed HTTPS policy", () => {
    const value = policy();
    assert.deepEqual(value, {
      schemaVersion: 1,
      gameId: "hosted-fixture",
      entrypoint: "https://game.example/play?mode=tv",
      allowedOrigins: [
        "https://game.example",
        "https://login.example",
      ],
      healthCheckUrl: "https://game.example/health",
      launchTimeoutMs: 30_000,
    });
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Object.isFrozen(value.allowedOrigins), true);
  });

  it("rejects non-remote runtimes and unsafe game IDs", () => {
    assert.throws(
      () => createHostedBrowserPolicy(manifest({ runtime: "local-web" })),
      /requires remote-web/,
    );
    assert.throws(
      () => createHostedBrowserPolicy(manifest({ id: "../game" })),
      /game ID is invalid/,
    );
  });

  it("rejects empty, duplicate, excessive, and non-origin allowlists", () => {
    assert.throws(
      () => createHostedBrowserPolicy(manifest({ allowedOrigins: [] })),
      /non-empty bounded array/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({
            allowedOrigins: [
              "https://game.example",
              "https://game.example",
            ],
          }),
        ),
      /must be unique/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({
            allowedOrigins: Array.from(
              { length: 9 },
              (_, index) => `https://game-${index}.example`,
            ),
          }),
        ),
      /non-empty bounded array/,
    );
    for (const invalid of [
      "http://game.example",
      "https://game.example/",
      "https://game.example/path",
      "https://user:secret@game.example",
      "https://game.example?query",
      "https://game.example#fragment",
    ]) {
      assert.throws(
        () =>
          createHostedBrowserPolicy(
            manifest({ allowedOrigins: [invalid] }),
          ),
        HostedBrowserPolicyError,
      );
    }
  });

  it("rejects entrypoint, timeout, and health authority drift", () => {
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({ entrypoint: "https://elsewhere.example/play" }),
        ),
      /entrypoint origin is not allowed/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({ entrypoint: "file:///tmp/game.html" }),
        ),
      /credential-free HTTPS/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({
            launch: {
              timeoutMs: 999,
              healthCheck: { type: "http", path: "/" },
            },
          }),
        ),
      /timeout is invalid/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({
            launch: {
              timeoutMs: 30_000,
              healthCheck: { type: "explicit-ready" },
            },
          }),
        ),
      /requires an HTTP health check/,
    );
    assert.throws(
      () =>
        createHostedBrowserPolicy(
          manifest({
            launch: {
              timeoutMs: 30_000,
              healthCheck: {
                type: "http",
                path: "https://elsewhere.example/health",
              },
            },
          }),
        ),
      /health-check origin is not allowed/,
    );
  });
});

describe("hosted browser navigation guard", () => {
  it("allows paths, queries, fragments, and reviewed multi-origin redirects", () => {
    const guard = new HostedBrowserNavigationGuard(policy());
    guard.arm("target-1");
    guard.beginNavigation();
    assert.equal(
      guard.observeTopFrame(
        "target-1",
        "https://game.example/level/2?x=1#ready",
      ),
      undefined,
    );
    assert.equal(
      guard.observeTargetChanged({
        targetId: "target-1",
        type: "page",
        url: "https://login.example/session",
      }),
      undefined,
    );
  });

  it("terminates on malformed, downgraded, credentialed, or foreign navigation", () => {
    for (const url of [
      "not a URL",
      "http://game.example/play",
      "https://user:secret@game.example/play",
      "https://sub.game.example/play",
      "https://elsewhere.example/play",
      "file:///tmp/game.html",
      "data:text/html,escape",
      "chrome://settings",
    ]) {
      const guard = new HostedBrowserNavigationGuard(policy());
      guard.arm("target-1");
      guard.beginNavigation();
      assert.equal(
        guard.observeTopFrame("target-1", url)?.code,
        "NAVIGATION_ORIGIN_DENIED",
      );
    }
  });

  it("ignores startup URL changes until explicitly armed for navigation", () => {
    const guard = new HostedBrowserNavigationGuard(policy());
    guard.arm("target-1");
    assert.equal(
      guard.observeTargetChanged({
        targetId: "target-1",
        type: "page",
        url: "about:blank",
      }),
      undefined,
    );
    guard.beginNavigation();
    assert.equal(
      guard.observeTargetChanged({
        targetId: "target-1",
        type: "page",
        url: "about:blank",
      })?.code,
      "NAVIGATION_ORIGIN_DENIED",
    );
  });

  it("terminates on every second page target, download, or renderer crash", () => {
    const popup = new HostedBrowserNavigationGuard(policy());
    popup.arm("target-1");
    assert.equal(
      popup.observeTargetCreated({
        targetId: "target-2",
        type: "page",
        url: "about:blank",
        openerId: "target-1",
      })?.code,
      "POPUP_ATTEMPT",
    );

    const unrelatedWorker = new HostedBrowserNavigationGuard(policy());
    unrelatedWorker.arm("target-1");
    assert.equal(
      unrelatedWorker.observeTargetCreated({
        targetId: "worker-1",
        type: "service_worker",
        url: "https://game.example/sw.js",
      }),
      undefined,
    );

    const download = new HostedBrowserNavigationGuard(policy());
    download.arm("target-1");
    assert.equal(download.observeDownload().code, "DOWNLOAD_ATTEMPT");

    const crash = new HostedBrowserNavigationGuard(policy());
    crash.arm("target-1");
    assert.equal(
      crash.observeTargetCrash("target-1")?.code,
      "TARGET_CRASHED",
    );
  });

  it("preserves the first violation and refuses invalid guard lifecycle", () => {
    const guard = new HostedBrowserNavigationGuard(policy());
    assert.throws(() => guard.beginNavigation(), /is not armed/);
    assert.throws(() => guard.arm(""), /target ID is invalid/);
    guard.arm("target-1");
    assert.throws(() => guard.arm("target-2"), /already armed/);
    guard.beginNavigation();
    const first = guard.observeDownload();
    const second = guard.observeTopFrame(
      "target-1",
      "https://elsewhere.example",
    );
    assert.strictEqual(second, first);
    assert.equal(second?.code, "DOWNLOAD_ATTEMPT");
  });
});

describe("hosted browser health check", () => {
  it("follows only bounded reviewed redirects without automatic forwarding", async () => {
    const seen: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      seen.push(url);
      assert.equal(init?.redirect, "manual");
      if (url === "https://game.example/health") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://login.example/ready" },
        });
      }
      return new Response(null, { status: 204 });
    };
    await requireHealthyHostedEndpoint(policy(), fakeFetch);
    assert.deepEqual(seen, [
      "https://game.example/health",
      "https://login.example/ready",
    ]);
  });

  it("rejects a redirect before sending a request to the foreign origin", async () => {
    const seen: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      seen.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "https://elsewhere.example/collect" },
      });
    };
    await assert.rejects(
      requireHealthyHostedEndpoint(policy(), fakeFetch),
      /health check origin is not allowed/,
    );
    assert.deepEqual(seen, ["https://game.example/health"]);
  });

  it("rejects redirect loops, missing locations, and unhealthy responses", async () => {
    await assert.rejects(
      requireHealthyHostedEndpoint(
        policy(),
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "/again" },
          }),
      ),
      /exceeded five redirects/,
    );
    await assert.rejects(
      requireHealthyHostedEndpoint(
        policy(),
        async () => new Response(null, { status: 302 }),
      ),
      /omitted Location/,
    );
    await assert.rejects(
      requireHealthyHostedEndpoint(
        policy(),
        async () => new Response(null, { status: 503 }),
      ),
      /HTTP 503/,
    );
  });
});

describe("hosted browser process arguments", () => {
  it("uses one blank app target, ephemeral profile, and loopback-only DevTools", () => {
    const args = buildHostedBrowserArguments("C:/Temp/vcg-hosted-123");
    assert.equal(
      args.includes("--user-data-dir=C:/Temp/vcg-hosted-123"),
      true,
    );
    assert.equal(args.includes("--app=about:blank"), true);
    assert.equal(args.includes("--remote-debugging-port=0"), true);
    assert.equal(
      args.includes("--remote-allow-origins=http://127.0.0.1"),
      true,
    );
    assert.equal(args.some((arg) => arg.includes("game.example")), false);
    assert.equal(args.some((arg) => arg === "--no-sandbox"), false);
    assert.equal(
      args.some((arg) => arg === "--disable-web-security"),
      false,
    );
    assert.equal(Object.isFrozen(args), true);
  });

  it("accepts only one branded direct child of the temporary directory", async () => {
    const profilePath = await mkdtemp(
      join(tmpdir(), "vcg-hosted-browser-"),
    );
    try {
      assert.equal(
        validateHostedBrowserProfilePath(profilePath),
        profilePath,
      );
      for (const invalid of [
        "",
        ".",
        tmpdir(),
        join(tmpdir(), "unrelated-profile-123456"),
        join(tmpdir(), "vcg-hosted-browser-short"),
        join(
          tmpdir(),
          "nested",
          "vcg-hosted-browser-123456",
        ),
      ]) {
        assert.throws(
          () => validateHostedBrowserProfilePath(invalid),
          HostedBrowserPolicyError,
        );
      }
    } finally {
      await rm(profilePath, { recursive: true, force: true });
    }
  });

  const chrome = installedChromePath();
  it(
    "actively terminates real Chrome on navigation, popup, and download abuse",
    { skip: chrome === undefined, timeout: 60_000 },
    async () => {
      assert.ok(chrome);
      const attempts = [
        ["foreign-navigation", "NAVIGATION_ORIGIN_DENIED"],
        ["popup", "POPUP_ATTEMPT"],
        ["download", "DOWNLOAD_ATTEMPT"],
      ] as const;
      for (const [attempt, expectedCode] of attempts) {
        const profilePath = await mkdtemp(
          join(tmpdir(), "vcg-hosted-probe-"),
        );
        const result = await probeHostedBrowserContainment(
          chrome,
          profilePath,
          attempt,
        );
        assert.equal(result.attempt, attempt);
        assert.equal(result.violation.code, expectedCode);
        assert.equal(existsSync(profilePath), false);
      }
    },
  );
});
