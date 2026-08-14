import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import {
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";

export const TV_CONFORMANCE_EVIDENCE_FORMAT =
  "vcg-tv-conformance-evidence/v1";
export const TV_CONFORMANCE_EVIDENCE_DATE = "2026-08-14";
export const TV_CONFORMANCE_BROWSER_PRODUCT = "Chrome/151.0.7922.138";
export const TV_CONFORMANCE_RESOLUTIONS = Object.freeze([
  Object.freeze({ id: "720p", width: 1280, height: 720 }),
  Object.freeze({ id: "1080p", width: 1920, height: 1080 }),
  Object.freeze({ id: "4k", width: 3840, height: 2160 }),
]);
export const TV_CONFORMANCE_CLAIM_BOUNDARY =
  "One Windows x64 headless Chrome desk run proves that the standalone candidate authoring surface kept all declared critical regions inside a five-percent CSS-pixel safe inset, retained at least 24 CSS-pixel critical text and 48 CSS-pixel action targets, preserved deterministic keyboard focus/select/Back behavior, and sampled requestAnimationFrame with nonnegative elapsed deltas at 1280x720, 1920x1080, and 3840x2160. It does not prove a physical television, GPU frame pacing, overscan behavior, seating-distance legibility, controller input, audio, target Linux, compositor scaling, or compatibility of any catalog game.";
export const TV_CONFORMANCE_LIMITATIONS = Object.freeze([
  "The five-percent inset, 24 CSS-pixel critical text, and 48 CSS-pixel target minimums are conservative candidate authoring checks pending owner and target-TV review; they are not a final product standard.",
  "The three observations used headless installed Chrome on one Windows development host with devicePixelRatio 1, not physical 720p/1080p/4K televisions, EDID modes, compositor scaling, HDR, or overscan.",
  "The page tested keyboard fallback only. It did not enumerate a physical gamepad, reserve Home/Back outside the page, test touch/pointer requirements, or qualify controller glyphs.",
  "requestAnimationFrame deltas prove only monotonic elapsed-time sampling in this page; they are not a refresh-rate, GPU, animation smoothness, frame-pacing, or performance qualification.",
  "The screenshots and geometry cover the standalone conformance surface only, not the launcher, Godot sample, hosted catalog, native games, RetroArch, accessibility variants, localization, or real seating-distance comprehension.",
]);

// Chrome's own PNG encoder is not byte-deterministic across runs (threaded
// compression), while the rendered pixels are. Evidence screenshots are
// therefore decoded in the page and re-encoded here with single-threaded
// zlib so regeneration converges to identical bytes.
let pngCrcTable;

function pngCrc(bytes) {
  if (!pngCrcTable) {
    pngCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let k = 0; k < 8; k += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      pngCrcTable[n] = value;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    pngCrc(chunk.subarray(4, data.length + 8)),
    data.length + 8,
  );
  return chunk;
}

function encodeDeterministicPng(width, height, rgba) {
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    filtered[rowStart] = 2;
    for (let x = 0; x < stride; x += 1) {
      const above = y === 0 ? 0 : rgba[(y - 1) * stride + x];
      filtered[rowStart + 1 + x] = (rgba[y * stride + x] - above) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(filtered, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function deterministicScreenshot(page, path) {
  const encoded = await page.screenshot({ fullPage: false });
  const raw = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let out = "";
    const step = 0x8000;
    for (let index = 0; index < image.data.length; index += step) {
      out += String.fromCharCode.apply(
        null,
        image.data.subarray(
          index,
          Math.min(index + step, image.data.length),
        ),
      );
    }
    return { width: image.width, height: image.height, base64: btoa(out) };
  }, encoded.toString("base64"));
  const png = encodeDeterministicPng(
    raw.width,
    raw.height,
    Buffer.from(raw.base64, "base64"),
  );
  await writeFile(path, png);
  return png;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = resolve(root, "examples/tv-conformance");
const outputRoot = resolve(root, "benchmarks/tv-conformance");
const artifactPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-tv-conformance-v1.json",
);
const provenancePaths = Object.freeze({
  documentPath: "examples/tv-conformance/index.html",
  stylePath: "examples/tv-conformance/styles.css",
  scriptPath: "examples/tv-conformance/app.js",
  generatorPath: "scripts/generate-tv-conformance-evidence.mjs",
  validatorPath: "scripts/validate-tv-conformance-evidence.mjs",
});

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function writeBytes(response, bytes, contentType, contentSecurityPolicy) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": contentSecurityPolicy,
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), fullscreen=(), gamepad=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(bytes);
}

async function startFixtureServer() {
  const requestCounts = new Map();
  const files = Object.freeze({
    "/index.html": {
      path: resolve(exampleRoot, "index.html"),
      contentType: "text/html; charset=utf-8",
      csp:
        "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    },
    "/styles.css": {
      path: resolve(exampleRoot, "styles.css"),
      contentType: "text/css; charset=utf-8",
      csp: "default-src 'none'",
    },
    "/app.js": {
      path: resolve(exampleRoot, "app.js"),
      contentType: "text/javascript; charset=utf-8",
      csp: "default-src 'none'",
    },
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = files[pathname];
    if (!file) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("not found");
      return;
    }
    requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
    readFile(file.path).then(
      (bytes) =>
        writeBytes(response, bytes, file.contentType, file.csp),
      () => {
        response.writeHead(500);
        response.end();
      },
    );
  });
  await new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveStart);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/index.html`,
    requestCounts,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}

function expectedSafeArea(resolution) {
  return {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  };
}

function validateLiveProbe(probe, resolution) {
  assert.equal(probe.schemaVersion, 1);
  assert.equal(probe.ready, true);
  assert.deepEqual(probe.viewport, {
    width: resolution.width,
    height: resolution.height,
    devicePixelRatio: 1,
  });
  assert.deepEqual(probe.expectedSafeArea, expectedSafeArea(resolution));
  assert.deepEqual(
    {
      left: probe.safeArea.left,
      top: probe.safeArea.top,
      right: probe.safeArea.right,
      bottom: probe.safeArea.bottom,
    },
    expectedSafeArea(resolution),
  );
  assert.ok(probe.critical.length >= 5);
  assert.ok(probe.critical.every((entry) => entry.insideSafeArea));
  assert.ok(probe.criticalTextCssPx.length >= 8);
  assert.ok(probe.criticalTextCssPx.every((value) => value >= 24));
  assert.deepEqual(
    probe.targets.map((target) => target.focusOrder),
    [0, 1, 2, 3],
  );
  assert.ok(
    probe.targets.every(
      (target) =>
        target.bounds.width >= 48 && target.bounds.height >= 48,
    ),
  );
  assert.equal(probe.activeFocusOrder, 1);
  assert.equal(probe.activationCount, 2);
  assert.equal(probe.backRequestCount, 1);
  assert.equal(probe.animation.sampleCount, 120);
  assert.equal(probe.animation.negativeDeltaCount, 0);
  for (const value of [
    probe.animation.p50DeltaMs,
    probe.animation.p95DeltaMs,
    probe.animation.worstDeltaMs,
  ]) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1_000);
  }
}

async function exercise(chromePath) {
  const requireFromConsoleLab = createRequire(
    resolve(root, "apps/console-lab/package.json"),
  );
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const server = await startFixtureServer();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--disable-gpu",
      "--disable-lcd-text",
      "--disable-partial-raster",
      "--disable-skia-runtime-opts",
      "--force-color-profile=srgb",
    ],
  });
  const observations = [];
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  let requestFailureCount = 0;
  try {
    for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
      const page = await browser.newPage({
        viewport: {
          width: resolution.width,
          height: resolution.height,
        },
        deviceScaleFactor: 1,
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrorCount += 1;
      });
      page.on("pageerror", () => {
        pageErrorCount += 1;
      });
      page.on("requestfailed", () => {
        requestFailureCount += 1;
      });
      const response = await page.goto(server.url, {
        waitUntil: "load",
        timeout: 30_000,
      });
      assert.equal(response?.status(), 200);
      await page.waitForFunction(
        () => globalThis.__vcgTvConformanceProbe?.ready === true,
        undefined,
        { timeout: 10_000 },
      );
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      const probe = await page.evaluate(
        () => globalThis.__vcgTvConformanceProbe,
      );
      validateLiveProbe(probe, resolution);

      const screenshotPath = resolve(
        outputRoot,
        `windows-x64-chrome-150-${resolution.id}.png`,
      );
      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await deterministicScreenshot(page, screenshotPath);
      observations.push({
        ...resolution,
        documentReadyState: await page.evaluate(() => document.readyState),
        safeInsetPercent: 5,
        safeArea: probe.safeArea,
        criticalRegionCount: probe.critical.length,
        criticalRegionsInsideSafeArea: probe.critical.filter(
          (entry) => entry.insideSafeArea,
        ).length,
        minimumCriticalTextCssPx: Math.min(...probe.criticalTextCssPx),
        actionTargetCount: probe.targets.length,
        minimumActionTargetWidthCssPx: Math.min(
          ...probe.targets.map((target) => target.bounds.width),
        ),
        minimumActionTargetHeightCssPx: Math.min(
          ...probe.targets.map((target) => target.bounds.height),
        ),
        focusOrder: probe.targets.map((target) => target.focusOrder),
        finalFocusedOrder: probe.activeFocusOrder,
        keyboardActivationCount: probe.activationCount,
        keyboardBackRequestCount: probe.backRequestCount,
        animation: probe.animation,
        screenshot: {
          path:
            `benchmarks/tv-conformance/windows-x64-chrome-150-${resolution.id}.png`,
          bytes: screenshot.length,
          sha256: sha256(screenshot),
        },
      });
      await page.close();
    }
    assert.equal(consoleErrorCount, 0);
    assert.equal(pageErrorCount, 0);
    assert.equal(requestFailureCount, 0);
    assert.deepEqual(Object.fromEntries(server.requestCounts), {
      "/index.html": 3,
      "/styles.css": 3,
      "/app.js": 3,
    });
    return {
      browserProduct: `Chrome/${browser.version()}`,
      observations,
      consoleErrorCount,
      pageErrorCount,
      requestFailureCount,
      requestCounts: Object.fromEntries(server.requestCounts),
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function generateTvConformanceEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, GODOT_EXPORT_NODE_VERSION);
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${TV_CONFORMANCE_EVIDENCE_DATE}T`),
    `this evidence generator is frozen to ${TV_CONFORMANCE_EVIDENCE_DATE}`,
  );
  const exerciseResult = await exercise(findChrome());
  assert.equal(
    exerciseResult.browserProduct,
    TV_CONFORMANCE_BROWSER_PRODUCT,
  );
  return {
    format: TV_CONFORMANCE_EVIDENCE_FORMAT,
    evidenceDate: TV_CONFORMANCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-headless-chrome-tv-authoring-conformance",
    qualification:
      "candidate-authoring-surface-only-not-tv-or-game-qualification",
    retrievedAtUtc,
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: exerciseResult.browserProduct,
      devicePixelRatio: 1,
    },
    contract: {
      safeInsetPercent: 5,
      minimumCriticalTextCssPx: 24,
      minimumActionTargetCssPx: 48,
      frameTimingModel: "request-animation-frame-elapsed-time",
      resolutions: TV_CONFORMANCE_RESOLUTIONS,
    },
    browser: exerciseResult,
    disposition: {
      candidateSafeAreaGeometryVerified: true,
      candidateTextAndTargetMinimumsVerified: true,
      keyboardFocusSelectAndBackVerified: true,
      elapsedFrameSamplingVerified: true,
      physicalTelevisionVerified: false,
      physicalControllerVerified: false,
      seatingDistanceLegibilityVerified: false,
      hardwareOverscanVerified: false,
      targetCompositorScalingVerified: false,
      catalogGameCompatibilityVerified: false,
      frameRateQualified: false,
    },
    summary: {
      resolutionCount: TV_CONFORMANCE_RESOLUTIONS.length,
      screenshotCount: TV_CONFORMANCE_RESOLUTIONS.length,
      physicalTelevisionCount: 0,
      physicalControllerCount: 0,
      participantCount: 0,
      catalogGameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: TV_CONFORMANCE_CLAIM_BOUNDARY,
    limitations: TV_CONFORMANCE_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateTvConformanceEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote TV conformance evidence for ${artifact.summary.resolutionCount} resolutions and ${artifact.summary.screenshotCount} screenshots`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
