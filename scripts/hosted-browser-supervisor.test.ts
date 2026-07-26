import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildHostedBrowserArguments,
  createHostedBrowserPolicy,
  HOSTED_BROWSER_LIVENESS_POLICY_V1,
  HostedBrowserNavigationGuard,
  HostedBrowserPolicyError,
  monitorHostedBrowserLiveness,
  probeHostedBrowserContainment,
  probeHostedBrowserLivenessContract,
  requireHealthyHostedEndpoint,
  type HostedBrowserManifestInput,
  validateHostedBrowserProfilePath,
  waitForExplicitHostedBrowserReadiness,
  waitForDevToolsEndpoint,
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
      /health-check path/,
    );
    for (const path of [
      "health",
      "//login.example/health",
      "/health?profile=child",
      "/health#private",
      "/health\\private",
      `/${"a".repeat(1_024)}`,
    ]) {
      assert.throws(
        () =>
          createHostedBrowserPolicy(
            manifest({
              launch: {
                timeoutMs: 30_000,
                healthCheck: { type: "http", path },
              },
            }),
          ),
        /health-check path|omit query and fragment/u,
      );
    }
  });
});

describe("hosted browser explicit readiness", () => {
  it("requires a bounded boolean probe and no document-load fallback", async () => {
    await assert.rejects(
      waitForExplicitHostedBrowserReadiness(
        async () => true,
        0,
      ),
      /explicit-readiness wait is invalid/,
    );
    await assert.rejects(
      waitForExplicitHostedBrowserReadiness(
        (async () => "ready") as unknown as () => Promise<boolean>,
        100,
      ),
      /probe was not boolean/,
    );
  });

  it("polls until the fixed producer reports readiness", async () => {
    const observations = [false, false, true];
    let calls = 0;
    const ready = await waitForExplicitHostedBrowserReadiness(
      async () => {
        const value = observations[calls];
        calls += 1;
        return value ?? false;
      },
      500,
    );
    assert.equal(ready, true);
    assert.equal(calls, 3);
  });

  it("returns a bounded timeout when readiness never arrives", async () => {
    let calls = 0;
    const started = performance.now();
    const ready = await waitForExplicitHostedBrowserReadiness(
      async () => {
        calls += 1;
        return false;
      },
      75,
    );
    const elapsed = performance.now() - started;
    assert.equal(ready, false);
    assert.ok(calls >= 2);
    assert.ok(calls <= 3);
    assert.ok(elapsed < 500);
  });
});

describe("hosted browser post-ready liveness", () => {
  const fastPolicy = Object.freeze({
    schemaVersion: 1 as const,
    challengeIntervalMs: 10,
    acknowledgementTimeoutMs: 10,
    maximumConsecutiveMisses: 2,
  });

  it("publishes one immutable bounded desk policy", async () => {
    assert.deepEqual(HOSTED_BROWSER_LIVENESS_POLICY_V1, {
      schemaVersion: 1,
      challengeIntervalMs: 1_000,
      acknowledgementTimeoutMs: 2_000,
      maximumConsecutiveMisses: 2,
    });
    assert.equal(
      Object.isFrozen(HOSTED_BROWSER_LIVENESS_POLICY_V1),
      true,
    );
    await assert.rejects(
      monitorHostedBrowserLiveness(
        async (challenge) => challenge,
        {
          ...fastPolicy,
          maximumConsecutiveMisses: 0,
        },
      ),
      /liveness policy is invalid/,
    );
  });

  it("distinguishes a missing initial contract from a lost contract", async () => {
    const missing = await monitorHostedBrowserLiveness(
      async () => undefined,
      fastPolicy,
    );
    assert.deepEqual(missing, {
      code: "POST_READY_CONTRACT_MISSING",
      challengeCount: 1,
      acknowledgementCount: 0,
      consecutiveMisses: 0,
    });
    assert.equal(Object.isFrozen(missing), true);

    let calls = 0;
    const lost = await monitorHostedBrowserLiveness(
      async (challenge) => {
        calls += 1;
        return calls === 1 ? challenge : undefined;
      },
      fastPolicy,
    );
    assert.deepEqual(lost, {
      code: "POST_READY_CONTRACT_LOST",
      challengeCount: 2,
      acknowledgementCount: 1,
      consecutiveMisses: 0,
    });
  });

  it("rejects a wrong, replayed, or malformed acknowledgement immediately", async () => {
    for (const acknowledgement of [
      "",
      "replayed-ack",
      null,
      true,
      { challenge: "echo" },
    ]) {
      const failure = await monitorHostedBrowserLiveness(
        async () => acknowledgement,
        fastPolicy,
      );
      assert.deepEqual(failure, {
        code: "POST_READY_ACK_INVALID",
        challengeCount: 1,
        acknowledgementCount: 0,
        consecutiveMisses: 0,
      });
    }
  });

  it("requires exact fresh acknowledgements and resets only consecutive misses", async () => {
    let calls = 0;
    const failure = await monitorHostedBrowserLiveness(
      async (challenge) => {
        calls += 1;
        if (calls === 1 || calls === 3) {
          throw new Error("redacted transport failure");
        }
        if (calls === 2) return challenge;
        return new Promise<never>(() => undefined);
      },
      fastPolicy,
    );
    assert.deepEqual(failure, {
      code: "POST_READY_HEARTBEAT_TIMEOUT",
      challengeCount: 4,
      acknowledgementCount: 1,
      consecutiveMisses: 2,
    });
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
      assert.equal(init?.body, undefined);
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.credentials, "omit");
      assert.deepEqual(init?.headers, {
        accept:
          "application/vnd.vcg.health+json, application/json;q=0.1",
      });
      assert.equal(init?.method, "GET");
      assert.equal(init?.referrerPolicy, "no-referrer");
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

  it("cancels response bytes without parsing or retaining them", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '{"profile":"private","save":"must-not-be-read"}',
          ),
        );
      },
    });
    await requireHealthyHostedEndpoint(
      policy(),
      async () =>
        new Response(body, {
          status: 200,
          headers: {
            "set-cookie": "private-session=must-not-be-retained",
            "x-private-detail": "must-not-be-retained",
          },
        }),
    );
    assert.equal(canceled, true);
  });

  it("rejects redirect query data before a second request", async () => {
    const seen: string[] = [];
    await assert.rejects(
      requireHealthyHostedEndpoint(
        policy(),
        async (input) => {
          seen.push(String(input));
          return new Response(null, {
            status: 302,
            headers: { location: "/ready?profile=private" },
          });
        },
      ),
      /omit query and fragment/,
    );
    assert.deepEqual(seen, ["https://game.example/health"]);
  });

  it("redacts arbitrary transport exceptions", async () => {
    await assert.rejects(
      requireHealthyHostedEndpoint(
        policy(),
        async () => {
          throw new Error(
            "socket failed for /users/private-profile?token=secret",
          );
        },
      ),
      (error: unknown) =>
        error instanceof HostedBrowserPolicyError
        && error.message
          === "hosted browser health check transport failed",
    );
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
  it("retries a transiently locked DevTools endpoint file", async () => {
    const child = {
      exitCode: null,
      signalCode: null,
    } as ChildProcess;
    let reads = 0;
    const endpoint = await waitForDevToolsEndpoint(
      "C:/bounded-profile",
      child,
      250,
      async (path) => {
        assert.equal(
          path,
          "C:/bounded-profile/DevToolsActivePort",
        );
        reads += 1;
        if (reads === 1) {
          throw Object.assign(new Error("temporarily locked"), {
            code: "EBUSY",
          });
        }
        return Buffer.from(
          "9222\n/devtools/browser/bounded-fixture\n",
          "utf8",
        );
      },
    );
    assert.equal(
      endpoint,
      "ws://127.0.0.1:9222/devtools/browser/bounded-fixture",
    );
    assert.equal(reads, 2);
  });

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
    "actively terminates real Chrome abuse and proves the exact liveness echo",
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
      const livenessProfilePath = await mkdtemp(
        join(tmpdir(), "vcg-hosted-probe-"),
      );
      const liveness = await probeHostedBrowserLivenessContract(
        chrome,
        livenessProfilePath,
      );
      assert.equal(liveness.acknowledged, true);
      assert.equal(existsSync(livenessProfilePath), false);
    },
  );
});
