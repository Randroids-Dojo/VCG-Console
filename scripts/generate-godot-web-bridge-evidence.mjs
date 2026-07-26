import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_EVIDENCE_DATE,
} from "./generate-godot-export-evidence.mjs";
import {
  validateTrackedGodotExportEvidence,
} from "./validate-godot-export-evidence.mjs";

export const GODOT_WEB_BRIDGE_EVIDENCE_FORMAT =
  "vcg-godot-web-bridge-evidence/v1";
export const GODOT_WEB_BRIDGE_EVIDENCE_DATE = "2026-07-24";
export const GODOT_WEB_BRIDGE_CLAIM_BOUNDARY =
  "One Windows x64 Chrome desk run proves that a response-injected exact parent origin let the actual Godot 4.7.1 Web export negotiate bridge v2/Motion API 0.4.0 across two distinct loopback origins with the existing MotionBridgeHost, accept two deterministic core-landmark frames, and acknowledge each before the next publication. It does not prove production host authority, signed permission admission, a physical controller, camera or real tracker input, native Motion IPC, target Linux or ARM64 behavior, compositor recovery controls, or latency qualification.";
export const GODOT_WEB_BRIDGE_LIMITATIONS = Object.freeze([
  "The exact parent origin was injected by the bounded evidence HTTP response, not by the unfinished privileged native package server or signed installed-catalog authority.",
  "Both parent and child were random loopback HTTP origins in installed Chrome on one Windows development host; this was not target Linux, a production compositor, or service-manager isolation.",
  "The host published deterministic synthetic body.core17 frames with no camera, participant, physical controller, recovery remote, or real tracker.",
  "The run proved bridge v2/Motion API 0.4.0 welcome, health, frame application, and acknowledgement recovery but did not exercise reconnect, degraded health, stall expiry, origin navigation, or hostile same-origin code.",
  "The web release remained an ignored unsigned build artifact and was not admitted, launched, updated, rolled back, sandboxed, or resource-limited as an installed game package.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(root, "artifacts/godot-motion/web");
const consoleDist = resolve(root, "apps/console-lab/dist");
const artifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
);
const provenancePaths = Object.freeze({
  projectPath: "examples/godot-motion-game/project.godot",
  mainScriptPath: "examples/godot-motion-game/scripts/main.gd",
  gameScriptPath: "examples/godot-motion-game/scripts/motion_game.gd",
  bridgeScriptPath: "examples/godot-motion-game/scripts/motion_web_bridge.gd",
  presetPath: "examples/godot-motion-game/export_presets.cfg",
  hostDocumentPath: "apps/console-lab/godot-bridge-host.html",
  hostFixturePath: "apps/console-lab/src/godot-bridge-host-fixture.ts",
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  protocolPath: "packages/motion-web-bridge/src/protocol.ts",
  syntheticFramePath: "apps/console-lab/src/synthetic.ts",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  baseEvidencePath:
    "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
  generatorPath: "scripts/generate-godot-web-bridge-evidence.mjs",
  validatorPath: "scripts/validate-godot-web-bridge-evidence.mjs",
});

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
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
  const expectedFiles = baseEvidence.outputs.web.files;
  for (const expected of expectedFiles) {
    const path = resolve(root, expected.path);
    const expectedPrefix = `${webRoot}${sep}`;
    assert.ok(path.startsWith(expectedPrefix));
    const metadata = await stat(path);
    assert.equal(metadata.size, expected.bytes);
    assert.equal(await sha256File(path), expected.sha256);
  }
  return {
    fileCount: expectedFiles.length,
    totalBytes: baseEvidence.outputs.web.totalBytes,
    packSha256: expectedFiles.find((file) => file.path.endsWith(".pck"))
      .sha256,
  };
}

async function buildConsoleFixture() {
  const requireFromConsoleLab = createRequire(
    resolve(root, "apps/console-lab/package.json"),
  );
  const vitePath = requireFromConsoleLab.resolve("vite");
  const { build } = await import(pathToFileURL(vitePath).href);
  await build({
    root: resolve(root, "apps/console-lab"),
    configFile: resolve(root, "apps/console-lab/vite.config.ts"),
    logLevel: "silent",
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
  const prefix = `${rootPath}${sep}`;
  assert.ok(path.startsWith(prefix));
  return path;
}

async function startFixtureServers() {
  const state = {
    hostOrigin: "",
    childOrigin: "",
    childUrl: "",
  };
  const hostRequests = new Set();
  const childRequests = new Set();
  const host = await startServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname =
      url.pathname === "/" ? "/godot-bridge-host.html" : url.pathname;
    const path = validatedPath(
      consoleDist,
      pathname,
      /^\/(?:godot-bridge-host\.html|assets\/[A-Za-z0-9_.-]+)$/u,
    );
    let bytes = await readFile(path);
    if (pathname === "/godot-bridge-host.html") {
      assert.ok(state.childOrigin && state.childUrl);
      const original = bytes.toString("utf8");
      assert.equal(
        original.split("http://localhost:4173").length - 1,
        3,
      );
      bytes = Buffer.from(
        original
          .replaceAll("http://localhost:4173", state.childOrigin)
          .replace(
            `${state.childOrigin}/index.html`,
            state.childUrl,
          ),
      );
    }
    hostRequests.add(pathname);
    writeBytes(response, bytes, contentType(pathname), {
      "Content-Security-Policy":
        pathname === "/godot-bridge-host.html"
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
      const config = JSON.stringify({
        targetOrigin: state.hostOrigin,
      });
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
    childRequests.add(pathname);
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
    hostUrl: `${state.hostOrigin}/godot-bridge-host.html`,
    hostOrigin: state.hostOrigin,
    childUrl: state.childUrl,
    childOrigin: state.childOrigin,
    hostRequests,
    childRequests,
    close: async () => {
      await Promise.all([host.close(), child.close()]);
    },
  };
}

async function exerciseBridge(chromePath) {
  const requireFromConsoleLab = createRequire(
    resolve(root, "apps/console-lab/package.json"),
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
      candidate.url().startsWith(servers.childOrigin),
    );
    assert.ok(frame, "Godot child frame was not found");
    await frame.waitForFunction(
      () =>
        globalThis.__vcgGodotExportProbe?.status === "MOTION READY",
      undefined,
      { timeout: 10_000 },
    );
    const configured = await frame.evaluate(() => {
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
    assert.deepEqual(configured, {
      targetOrigin: servers.hostOrigin,
      frozen: true,
      writable: false,
      configurable: false,
      query: "",
    });

    const initialHost = await page.evaluate(() => ({
      status: document.querySelector("#host-status")?.textContent,
      accepted: document.querySelector("#accepted-count")?.textContent,
      active: document.querySelector("#active-count")?.textContent,
      pending: document.querySelector("#pending-count")?.textContent,
      invalidAck: document.querySelector("#invalid-ack-count")?.textContent,
    }));
    assert.deepEqual(initialHost, {
      status: "CONNECTED",
      accepted: "1",
      active: "1",
      pending: "0",
      invalidAck: "0",
    });

    await page.click("#publish");
    await page.waitForFunction(
      () =>
        document.querySelector("#host-status")?.textContent
          === "PUBLISHED 0 TO 1"
        && document.querySelector("#pending-count")?.textContent === "0",
      undefined,
      { timeout: 10_000 },
    );
    try {
      await frame.waitForFunction(
        () =>
          globalThis.__vcgGodotExportProbe?.inputSource === "motion"
          && globalThis.__vcgGodotExportProbe?.status === "LANDMARKS ACTIVE",
        undefined,
        { timeout: 10_000 },
      );
    } catch (error) {
      const diagnostic = await frame.evaluate(
        () => globalThis.__vcgGodotExportProbe,
      );
      throw new Error(
        `Godot frame was not applied: ${JSON.stringify(diagnostic)}; console=${JSON.stringify(consoleErrors)}; page=${JSON.stringify(pageErrors)}`,
        { cause: error },
      );
    }
    const afterFirstFrame = await frame.evaluate(
      () => globalThis.__vcgGodotExportProbe,
    );
    assert.deepEqual(afterFirstFrame, {
      schemaVersion: 1,
      lane: 1,
      stance: "standing",
      score: 0,
      inputSource: "motion",
      status: "LANDMARKS ACTIVE",
    });

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    await page.click("#publish");
    await page.waitForFunction(
      () =>
        document.querySelector("#host-status")?.textContent
          === "PUBLISHED 1 TO 1"
        && document.querySelector("#pending-count")?.textContent === "0",
      undefined,
      { timeout: 10_000 },
    );
    const finalHost = await page.evaluate(() => ({
      status: document.querySelector("#host-status")?.textContent,
      accepted: document.querySelector("#accepted-count")?.textContent,
      active: document.querySelector("#active-count")?.textContent,
      pending: document.querySelector("#pending-count")?.textContent,
      invalidAck: document.querySelector("#invalid-ack-count")?.textContent,
    }));
    assert.deepEqual(finalHost, {
      status: "PUBLISHED 1 TO 1",
      accepted: "1",
      active: "1",
      pending: "0",
      invalidAck: "0",
    });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(requestFailures, []);
    return {
      browserProduct: `Chrome/${browser.version()}`,
      parentOriginClass: "random-loopback-ipv4-http",
      childOriginClass: "random-loopback-localhost-http",
      originsDistinct: servers.hostOrigin !== servers.childOrigin,
      sandboxTokens: ["allow-scripts", "allow-same-origin"],
      responseInjectedConfig: {
        matchesParentOrigin: configured.targetOrigin === servers.hostOrigin,
        frozen: configured.frozen,
        writable: configured.writable,
        configurable: configured.configurable,
        queryEmpty: configured.query === "",
      },
      connectedMs: Number(connectedMs.toFixed(3)),
      bridgeProtocolVersion: 2,
      motionApiSchemaVersion: "0.4.0",
      initialHost,
      afterFirstFrame,
      finalHost,
      acceptedSessionCount: 1,
      publishedFrameCount: 2,
      acknowledgedFrameCount: 2,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      requestFailureCount: 0,
      abortedWasmFetchCount: 0,
      hostRequestCount: servers.hostRequests.size,
      childRequestCount: servers.childRequests.size,
    };
  } finally {
    await browser.close();
    await servers.close();
  }
}

export async function generateGodotWebBridgeEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${GODOT_WEB_BRIDGE_EVIDENCE_DATE}T`),
    `this versioned evidence generator is frozen to ${GODOT_WEB_BRIDGE_EVIDENCE_DATE}`,
  );
  assert.equal(GODOT_WEB_BRIDGE_EVIDENCE_DATE, GODOT_EXPORT_EVIDENCE_DATE);
  const baseEvidence = await validateTrackedGodotExportEvidence();
  const webBuild = await verifyLocalWebOutput(baseEvidence);
  await buildConsoleFixture();
  const bridge = await exerciseBridge(findChrome());
  assert.equal(bridge.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
  return {
    format: GODOT_WEB_BRIDGE_EVIDENCE_FORMAT,
    evidenceDate: GODOT_WEB_BRIDGE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-chrome-cross-origin-godot-web-motion-bridge",
    qualification: "desk-live-bridge-only-not-product-qualification",
    retrievedAtUtc,
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: bridge.browserProduct,
      godotVersion: baseEvidence.environment.godotVersion,
    },
    baseWebBuild: webBuild,
    bridge,
    disposition: {
      distinctParentChildOriginsVerified: true,
      responseInjectedExactParentOriginVerified: true,
      urlParameterAuthorityUsed: false,
      bridgeV2Negotiated: true,
      motionApi040Negotiated: true,
      syntheticCoreFramesApplied: true,
      exactFrameAcknowledgementsObserved: true,
      physicalControllerVerified: false,
      realTrackerVerified: false,
      productionHostAuthorityVerified: false,
      signedPermissionAdmissionVerified: false,
      targetPlatformQualified: false,
      latencyQualified: false,
    },
    summary: {
      acceptedSessionCount: 1,
      publishedFrameCount: 2,
      acknowledgedFrameCount: 2,
      motionFrameCount: 2,
      physicalControllerCount: 0,
      participantCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: GODOT_WEB_BRIDGE_CLAIM_BOUNDARY,
    limitations: GODOT_WEB_BRIDGE_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateGodotWebBridgeEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote Godot bridge ${artifact.bridge.bridgeProtocolVersion}/Motion ${artifact.bridge.motionApiSchemaVersion}; frames=${artifact.summary.publishedFrameCount}/${artifact.summary.acknowledgedFrameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
