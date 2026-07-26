import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_EVIDENCE_DATE,
} from "./generate-godot-export-evidence.mjs";
import {
  GODOT_WEB_BRIDGE_EVIDENCE_FORMAT,
} from "./generate-godot-web-bridge-evidence.mjs";
import {
  validateTrackedGodotExportEvidence,
} from "./validate-godot-export-evidence.mjs";
import {
  validateTrackedGodotWebBridgeEvidence,
} from "./validate-godot-web-bridge-evidence.mjs";

export const GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_FORMAT =
  "vcg-godot-web-bridge-resilience-evidence/v1";
export const GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE = "2026-07-24";
export const GODOT_WEB_BRIDGE_RESILIENCE_CLAIM_BOUNDARY =
  "One Windows x64 Chrome desk run proves that the actual Godot 4.7.1 Web export received an ordered degraded-health event, visibly blocked Motion control, received ordered ready recovery, resumed exact frame acknowledgements, reloaded in place, negotiated a replacement bridge v2/Motion API 0.4.0 session, and acknowledged a post-reload frame across two distinct loopback origins. It does not prove production host authority, signed permission admission, physical input, a real tracker, hostile-origin navigation, process suspension, target Linux or ARM64 behavior, compositor recovery controls, or latency qualification.";
export const GODOT_WEB_BRIDGE_RESILIENCE_LIMITATIONS = Object.freeze([
  "The exact parent origin was injected by the bounded evidence HTTP response, not by the unfinished privileged native package server or signed installed-catalog authority.",
  "Both origins and the reload remained on one Windows development host in installed headless Chrome; this was not a renderer kill, OS suspend, target Linux, production compositor, or service-manager restart.",
  "The host published deterministic synthetic body.core17 frames and authored tracker-health events with no camera, participant, physical controller, recovery remote, or real tracker.",
  "The run exercised ordered degraded and ready health plus same-frame reload/reconnect, but not a hostile origin, same-origin compromise, session TTL expiry, malformed wire message, repeated reload soak, or network loss.",
  "Chrome may report zero or one non-fatal net::ERR_ABORTED index.wasm fetch while replacing the Godot document; the artifact records the exact observed list, and both document lifecycles must still fetch every core asset and reach Motion-active state.",
  "The web release remained an ignored unsigned build artifact and was not admitted, launched, updated, rolled back, sandboxed, or resource-limited as an installed game package.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consoleRoot = resolve(root, "apps/console-lab");
const webRoot = resolve(root, "artifacts/godot-motion/web");
const fixtureDist = resolve(
  root,
  "artifacts/godot-motion/bridge-resilience-host",
);
const baseBridgeArtifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
);
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-resilience-v1.json",
);
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  bridgeScriptPath: "examples/godot-motion-game/scripts/motion_web_bridge.gd",
  hostDocumentPath:
    "apps/console-lab/godot-bridge-resilience-host.html",
  hostFixturePath:
    "apps/console-lab/src/godot-bridge-resilience-host-fixture.ts",
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  protocolPath: "packages/motion-web-bridge/src/protocol.ts",
  syntheticFramePath: "apps/console-lab/src/synthetic.ts",
  baseExportEvidencePath:
    "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
  baseBridgeEvidencePath:
    "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
  generatorPath:
    "scripts/generate-godot-web-bridge-resilience-evidence.mjs",
  validatorPath:
    "scripts/validate-godot-web-bridge-resilience-evidence.mjs",
});

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

async function verifyLocalWebOutput(baseEvidence) {
  for (const expected of baseEvidence.outputs.web.files) {
    const path = resolve(root, expected.path);
    assert.ok(path.startsWith(`${webRoot}${sep}`));
    const metadata = await stat(path);
    assert.equal(metadata.size, expected.bytes);
    assert.equal(await sha256File(path), expected.sha256);
  }
  return {
    fileCount: baseEvidence.outputs.web.fileCount,
    totalBytes: baseEvidence.outputs.web.totalBytes,
    packSha256: baseEvidence.outputs.web.files.find((file) =>
      file.path.endsWith(".pck")
    ).sha256,
  };
}

async function buildFixture() {
  const requireFromConsoleLab = createRequire(
    resolve(consoleRoot, "package.json"),
  );
  const vitePath = requireFromConsoleLab.resolve("vite");
  const { build } = await import(pathToFileURL(vitePath).href);
  await build({
    root: consoleRoot,
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: fixtureDist,
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(
          consoleRoot,
          "godot-bridge-resilience-host.html",
        ),
      },
    },
  });
}

function findChrome() {
  const candidates = [
    process.env.VCG_CHROME_PATH,
    process.env.ProgramFiles
      ? resolve(
          process.env.ProgramFiles,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.env["ProgramFiles(x86)"]
      ? resolve(
          process.env["ProgramFiles(x86)"],
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
    process.env.LOCALAPPDATA
      ? resolve(
          process.env.LOCALAPPDATA,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : undefined,
  ].filter((candidate) => typeof candidate === "string");
  const browser = candidates.find(existsSync);
  if (!browser) throw new Error("installed Chrome was not found");
  return browser;
}

const contentTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".wasm": "application/wasm",
});

function contentType(path) {
  const extension = path.slice(path.lastIndexOf("."));
  return contentTypes[extension] ?? "application/octet-stream";
}

function startServer(handler) {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address !== null && typeof address === "object");
      resolveStart({
        port: address.port,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          }),
      });
    });
  });
}

function writeBytes(response, bytes, type, extraHeaders = {}) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(bytes);
}

function validatedPath(rootPath, pathname, pattern) {
  assert.match(pathname, pattern);
  const path = resolve(rootPath, pathname.slice(1));
  assert.ok(path.startsWith(`${rootPath}${sep}`));
  return path;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function startFixtureServers() {
  const state = {
    hostOrigin: "",
    childOrigin: "",
    childUrl: "",
  };
  const hostRequestCounts = new Map();
  const childRequestCounts = new Map();
  const host = await startServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname =
      url.pathname === "/"
        ? "/godot-bridge-resilience-host.html"
        : url.pathname;
    const path = validatedPath(
      fixtureDist,
      pathname,
      /^\/(?:godot-bridge-resilience-host\.html|assets\/[A-Za-z0-9_.-]+)$/u,
    );
    let bytes = await readFile(path);
    if (pathname === "/godot-bridge-resilience-host.html") {
      assert.ok(state.childOrigin && state.childUrl);
      const original = bytes.toString("utf8");
      assert.equal(
        original.split("http://localhost:4173").length - 1,
        2,
      );
      bytes = Buffer.from(
        original
          .replaceAll("http://localhost:4173", state.childOrigin)
          .replace(`${state.childOrigin}/index.html`, state.childUrl),
      );
    }
    increment(hostRequestCounts, pathname);
    writeBytes(response, bytes, contentType(pathname), {
      "Content-Security-Policy":
        pathname === "/godot-bridge-resilience-host.html"
          ? `default-src 'none'; script-src 'self'; frame-src ${state.childOrigin}; base-uri 'none'; form-action 'none'; object-src 'none'`
          : "default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), midi=(), display-capture=()",
      "Referrer-Policy": "no-referrer",
    });
  });
  state.hostOrigin = `http://127.0.0.1:${host.port}`;

  const child = await startServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const path = validatedPath(
      webRoot,
      pathname,
      /^\/index(?:\.[A-Za-z0-9_-]+)*\.(?:html|js|pck|png|wasm)$/u,
    );
    let bytes = await readFile(path);
    if (pathname === "/index.html") {
      const config = JSON.stringify({ targetOrigin: state.hostOrigin });
      const injection =
        "<script>"
        + "Object.defineProperty(globalThis,"
        + '"__vcgGodotMotionHostConfig",'
        + `{value:Object.freeze(${config}),writable:false,`
        + "configurable:false,enumerable:false});"
        + "</script>";
      const original = bytes.toString("utf8");
      assert.equal(original.split("</head>").length - 1, 1);
      bytes = Buffer.from(original.replace("</head>", `${injection}</head>`));
    }
    increment(childRequestCounts, pathname);
    writeBytes(response, bytes, contentType(pathname), {
      "Content-Security-Policy":
        `default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; `
        + `connect-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; `
        + `media-src 'self' blob:; style-src 'unsafe-inline'; `
        + `frame-ancestors ${state.hostOrigin}; base-uri 'none'; form-action 'none'; object-src 'none'`,
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), midi=(), display-capture=()",
      "Referrer-Policy": "no-referrer",
    });
  });
  state.childOrigin = `http://localhost:${child.port}`;
  state.childUrl = `${state.childOrigin}/index.html`;

  return {
    hostUrl:
      `${state.hostOrigin}/godot-bridge-resilience-host.html`,
    hostOrigin: state.hostOrigin,
    childOrigin: state.childOrigin,
    hostRequestCounts,
    childRequestCounts,
    close: async () => {
      await Promise.all([host.close(), child.close()]);
    },
  };
}

async function hostSnapshot(page) {
  return page.evaluate(() => ({
    status: document.querySelector("#host-status")?.textContent,
    accepted: document.querySelector("#accepted-count")?.textContent,
    active: document.querySelector("#active-count")?.textContent,
    peak: document.querySelector("#peak-count")?.textContent,
    pending: document.querySelector("#pending-count")?.textContent,
    published: document.querySelector("#published-count")?.textContent,
    health: document.querySelector("#health-count")?.textContent,
    invalidAck: document.querySelector("#invalid-ack-count")?.textContent,
  }));
}

async function probeSnapshot(frame) {
  return frame.evaluate(() => globalThis.__vcgGodotExportProbe);
}

async function configuredSnapshot(frame) {
  return frame.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "__vcgGodotMotionHostConfig",
    );
    return {
      targetOrigin:
        globalThis.__vcgGodotMotionHostConfig?.targetOrigin ?? "",
      frozen: Object.isFrozen(globalThis.__vcgGodotMotionHostConfig),
      writable: descriptor?.writable ?? null,
      configurable: descriptor?.configurable ?? null,
      query: location.search,
    };
  });
}

async function exerciseBridge(chromePath) {
  const requireFromConsoleLab = createRequire(
    resolve(consoleRoot, "package.json"),
  );
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const servers = await startFixtureServers();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    requestFailures.push({
      path: new URL(request.url()).pathname,
      resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? "unknown failure",
    });
  });

  const started = performance.now();
  try {
    const response = await page.goto(servers.hostUrl, {
      waitUntil: "load",
      timeout: 30_000,
    });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(
      () => document.querySelector("#host-status")?.textContent === "CONNECTED",
      undefined,
      { timeout: 30_000 },
    );
    const connectedMs = performance.now() - started;
    const frame = page.frames().find((candidate) =>
      candidate.url().startsWith(servers.childOrigin)
    );
    assert.ok(frame, "Godot resilience child frame was not found");
    await frame.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.status === "MOTION READY",
      undefined,
      { timeout: 10_000 },
    );
    assert.deepEqual(await configuredSnapshot(frame), {
      targetOrigin: servers.hostOrigin,
      frozen: true,
      writable: false,
      configurable: false,
      query: "",
    });

    const initialHost = await hostSnapshot(page);
    assert.deepEqual(initialHost, {
      status: "CONNECTED",
      accepted: "1",
      active: "1",
      peak: "1",
      pending: "0",
      published: "0",
      health: "0",
      invalidAck: "0",
    });

    await page.click("#publish");
    await frame.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.inputSource === "motion",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#published-count")?.textContent === "1"
        && document.querySelector("#pending-count")?.textContent === "0",
      undefined,
      { timeout: 10_000 },
    );
    const afterFirstFrame = await probeSnapshot(frame);
    assert.equal(afterFirstFrame.status, "LANDMARKS ACTIVE");

    await page.click("#degrade");
    await frame.waitForFunction(
      () =>
        globalThis.__vcgGodotExportProbe?.inputSource === "waiting"
        && globalThis.__vcgGodotExportProbe?.status === "MOTION OVERLOAD",
      undefined,
      { timeout: 10_000 },
    );
    const afterDegradedHealth = await probeSnapshot(frame);
    await page.waitForFunction(
      () =>
        document.querySelector("#health-count")?.textContent === "1"
        && document.querySelector("#host-status")?.textContent
          === "DEGRADED TO 1",
      undefined,
      { timeout: 10_000 },
    );

    await page.click("#recover");
    await frame.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.status === "MOTION READY",
      undefined,
      { timeout: 10_000 },
    );
    const afterRecoveredHealth = await probeSnapshot(frame);
    await page.waitForFunction(
      () =>
        document.querySelector("#health-count")?.textContent === "2"
        && document.querySelector("#host-status")?.textContent
          === "RECOVERED TO 1",
      undefined,
      { timeout: 10_000 },
    );

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    await page.click("#publish");
    await frame.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.inputSource === "motion",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#published-count")?.textContent === "2"
        && document.querySelector("#pending-count")?.textContent === "0",
      undefined,
      { timeout: 10_000 },
    );
    const afterSecondFrame = await probeSnapshot(frame);

    const reloadStarted = performance.now();
    await Promise.all([
      frame.waitForNavigation({ waitUntil: "load", timeout: 30_000 }),
      page.click("#reload"),
    ]);
    await page.waitForFunction(
      () =>
        document.querySelector("#host-status")?.textContent === "RECONNECTED"
        && document.querySelector("#accepted-count")?.textContent === "2"
        && document.querySelector("#active-count")?.textContent === "1",
      undefined,
      { timeout: 30_000 },
    );
    await frame.waitForFunction(
      () => globalThis.__vcgGodotExportProbe?.status === "MOTION READY",
      undefined,
      { timeout: 10_000 },
    );
    const reloadRoundTripMs = performance.now() - reloadStarted;
    assert.deepEqual(await configuredSnapshot(frame), {
      targetOrigin: servers.hostOrigin,
      frozen: true,
      writable: false,
      configurable: false,
      query: "",
    });
    const afterReloadHost = await hostSnapshot(page);
    const afterReloadProbe = await probeSnapshot(frame);

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    await page.click("#publish");
    await frame.waitForFunction(
      () =>
        globalThis.__vcgGodotExportProbe?.inputSource === "motion"
        && globalThis.__vcgGodotExportProbe?.status === "LANDMARKS ACTIVE",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#published-count")?.textContent === "3"
        && document.querySelector("#pending-count")?.textContent === "0",
      undefined,
      { timeout: 10_000 },
    );
    const finalHost = await hostSnapshot(page);
    assert.deepEqual(finalHost, {
      status: "PUBLISHED 2 TO 1",
      accepted: "2",
      active: "1",
      peak: "1",
      pending: "0",
      published: "3",
      health: "2",
      invalidAck: "0",
    });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.ok(requestFailures.length <= 1);
    if (requestFailures.length === 1) {
      assert.deepEqual(requestFailures[0], {
        path: "/index.wasm",
        resourceType: "fetch",
        error: "net::ERR_ABORTED",
      });
    }
    for (const path of [
      "/index.html",
      "/index.js",
      "/index.pck",
      "/index.wasm",
    ]) {
      assert.equal(
        servers.childRequestCounts.get(path),
        2,
        `${path} must be fetched once per Godot document lifecycle`,
      );
    }

    return {
      browserProduct: `Chrome/${browser.version()}`,
      parentOriginClass: "random-loopback-ipv4-http",
      childOriginClass: "random-loopback-localhost-http",
      originsDistinct: servers.hostOrigin !== servers.childOrigin,
      sandboxTokens: ["allow-scripts", "allow-same-origin"],
      responseInjectedConfig: {
        matchesParentOrigin: true,
        frozen: true,
        writable: false,
        configurable: false,
        queryEmptyBeforeAndAfterReload: true,
      },
      connectedMs: Number(connectedMs.toFixed(3)),
      reloadRoundTripMs: Number(reloadRoundTripMs.toFixed(3)),
      bridgeProtocolVersion: 2,
      motionApiSchemaVersion: "0.4.0",
      initialHost,
      afterFirstFrame,
      afterDegradedHealth,
      afterRecoveredHealth,
      afterSecondFrame,
      afterReloadHost,
      afterReloadProbe,
      finalHost,
      acceptedSessionCount: 2,
      replacementSessionCount: 1,
      publishedFrameCount: 3,
      acknowledgedFrameCount: 3,
      publishedHealthEventCount: 2,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      requestFailureCount: requestFailures.length,
      abortedWasmFetchCount: requestFailures.length,
      requestFailures,
      hostRequestCounts: Object.fromEntries(
        [...servers.hostRequestCounts.entries()].sort(),
      ),
      childRequestCounts: Object.fromEntries(
        [...servers.childRequestCounts.entries()].sort(),
      ),
    };
  } finally {
    await browser.close();
    await servers.close();
  }
}

export async function generateGodotWebBridgeResilienceEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(
      `${GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE}T`,
    ),
    `this versioned evidence generator is frozen to ${GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE}`,
  );
  assert.equal(
    GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE,
    GODOT_EXPORT_EVIDENCE_DATE,
  );
  const [baseExportEvidence, baseBridgeEvidence, baseBridgeBytes] =
    await Promise.all([
      validateTrackedGodotExportEvidence(),
      validateTrackedGodotWebBridgeEvidence(),
      readFile(baseBridgeArtifactPath),
    ]);
  assert.equal(baseBridgeEvidence.format, GODOT_WEB_BRIDGE_EVIDENCE_FORMAT);
  const baseWebBuild = await verifyLocalWebOutput(baseExportEvidence);
  await buildFixture();
  const bridge = await exerciseBridge(findChrome());
  assert.equal(bridge.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);

  return {
    format: GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_FORMAT,
    evidenceDate: GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-chrome-cross-origin-godot-web-motion-bridge-resilience",
    qualification: "desk-live-resilience-only-not-product-qualification",
    retrievedAtUtc,
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: bridge.browserProduct,
      godotVersion: baseExportEvidence.environment.godotVersion,
    },
    baseBridgeEvidence: {
      format: baseBridgeEvidence.format,
      sha256: sha256(baseBridgeBytes),
    },
    baseWebBuild,
    bridge,
    disposition: {
      orderedDegradedHealthApplied: true,
      orderedReadyHealthRestored: true,
      frameAcknowledgementsResumed: true,
      sameFrameReloadReconnected: true,
      priorSessionReplacedWithoutOverlap: true,
      postReloadFrameAcknowledged: true,
      hostileOriginNavigationVerified: false,
      physicalControllerVerified: false,
      realTrackerVerified: false,
      productionHostAuthorityVerified: false,
      signedPermissionAdmissionVerified: false,
      processSuspendOrKillVerified: false,
      targetPlatformQualified: false,
      latencyQualified: false,
    },
    summary: {
      acceptedSessionCount: 2,
      replacementSessionCount: 1,
      publishedFrameCount: 3,
      acknowledgedFrameCount: 3,
      publishedHealthEventCount: 2,
      reloadCount: 1,
      physicalControllerCount: 0,
      participantCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: GODOT_WEB_BRIDGE_RESILIENCE_CLAIM_BOUNDARY,
    limitations: GODOT_WEB_BRIDGE_RESILIENCE_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateGodotWebBridgeResilienceEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote Godot resilience bridge ${artifact.bridge.bridgeProtocolVersion}/Motion ${artifact.bridge.motionApiSchemaVersion}; sessions=${artifact.summary.acceptedSessionCount}; frames=${artifact.summary.publishedFrameCount}/${artifact.summary.acknowledgedFrameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
