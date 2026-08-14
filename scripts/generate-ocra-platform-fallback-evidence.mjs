import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findChrome,
  normalizedSha256,
  sha256,
  sourceTreeCommitment,
  startProductionPreview,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";
import {
  TV_CONFORMANCE_BROWSER_PRODUCT,
} from "./generate-tv-conformance-evidence.mjs";

export const OCRA_FALLBACK_EVIDENCE_FORMAT =
  "vcg-ocra-platform-fallback-observation/v1";
export const OCRA_FALLBACK_EVIDENCE_DATE = "2026-08-11";
export const OCRA_FALLBACK_CLAIM_BOUNDARY =
  "One headless installed-Chrome run on one Windows x64 development host uses the Chrome DevTools Protocol to report the actual font selected for one ASCII baseline and every non-ASCII code point inventoried in current console-lab production source. The exact current probe observes no platform fallback. It uses the production CSS font stack after a production build but injects a diagnostic-only grid, and does not prove dynamically supplied text coverage, glyph shape, legibility, accessibility, localization, physical-TV behavior, another browser or host, target Linux, compositor output, redistribution, or release readiness.";
export const OCRA_FALLBACK_LIMITATIONS = Object.freeze([
  "The diagnostic grid is injected after loading the production app and font stylesheet; it is not a user-facing production route or proof that every launcher state rendered.",
  "Chrome reports the selected font resource and glyph count, not semantic correctness, visual similarity, clipping, reading accuracy, or seating-distance legibility.",
  "The observation covers one installed Chrome version and one Windows x64 font environment. OS updates, installed-font changes, browser engines, target Linux images, and compositor stacks may choose different fallback fonts.",
  "The zero-fallback result is limited to current static production-source characters; deterministic coverage for user-authored text and future localization remains an explicit owner/release decision.",
]);

export const OCRA_FALLBACK_PROBES = Object.freeze([
  { id: "ascii-a", codePoint: "U+0041", character: "A", role: "OCR-A baseline" },
  { id: "middle-dot", codePoint: "U+00B7", character: "·", role: "covered separator" },
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputRoot = resolve(root, "benchmarks/font-coverage");
const artifactRelativePath =
  "benchmarks/font-coverage/windows-x64-chrome-151-ocra-platform-fallback-v1.json";
const screenshotRelativePath =
  "benchmarks/font-coverage/windows-x64-chrome-151-ocra-platform-fallback-1080p.png";
const artifactPath = resolve(root, artifactRelativePath);
const screenshotPath = resolve(root, screenshotRelativePath);
const baseEvidenceRelativePath =
  "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json";
const provenancePaths = Object.freeze({
  stylePath: "apps/console-lab/src/styles.css",
  baseEvidencePath: baseEvidenceRelativePath,
  generatorPath: "scripts/generate-ocra-platform-fallback-evidence.mjs",
  validatorPath: "scripts/validate-ocra-platform-fallback-evidence.mjs",
});

function requestPath(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  const baseBytes = await readFile(resolve(root, baseEvidenceRelativePath));
  return {
    ...Object.fromEntries(
      entries.flatMap(([key, path, digest]) => [
        [key, path],
        [`${key}Sha256`, digest],
      ]),
    ),
    baseEvidenceBytes: baseBytes.length,
    baseEvidenceSha256: sha256(baseBytes),
    productionSourceTree: await sourceTreeCommitment(),
  };
}

async function installProbeGrid(page) {
  await page.evaluate((probes) => {
    document.title = "VCG OCR-A platform fallback observation";
    document.body.dataset.fontProbe = "true";
    const style = document.createElement("style");
    style.textContent = `
      body[data-font-probe="true"] {
        margin: 0;
        min-height: 100vh;
        overflow: hidden;
        background: #090b0c;
        color: #efeee6;
        font-family: Arial, sans-serif;
      }
      body[data-font-probe="true"] > :not(#font-probe-shell) {
        display: none !important;
      }
      #font-probe-shell {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        box-sizing: border-box;
        width: 100vw;
        height: 100vh;
        padding: 54px 72px;
        overflow: hidden;
        background: #090b0c;
      }
      #font-probe-title {
        margin: 0 0 8px;
        font: 700 30px/1.2 Arial, sans-serif;
        letter-spacing: 0.04em;
      }
      #font-probe-boundary {
        margin: 0 0 28px;
        color: #9ba4a7;
        font: 20px/1.35 Arial, sans-serif;
      }
      #font-probe-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .font-probe-card {
        box-sizing: border-box;
        min-width: 0;
        height: 256px;
        padding: 18px;
        overflow: hidden;
        border: 2px solid #303638;
        border-radius: 12px;
        background: #101315;
      }
      .font-probe-character {
        display: block;
        height: 112px;
        overflow: hidden;
        color: #53dac3;
        font-family: OCRA, ui-monospace, SFMono-Regular, monospace;
        font-size: 88px;
        font-style: normal;
        font-weight: 400;
        line-height: 1.15;
        white-space: nowrap;
      }
      .font-probe-code {
        display: block;
        margin-top: 8px;
        font: 700 18px/1.2 Consolas, monospace;
      }
      .font-probe-role {
        display: block;
        margin-top: 7px;
        color: #9ba4a7;
        font: 17px/1.25 Arial, sans-serif;
      }
      .font-probe-resolved {
        display: block;
        margin-top: 9px;
        color: #53dac3;
        font: 15px/1.2 Consolas, monospace;
      }
    `;
    document.head.append(style);
    const shell = document.createElement("main");
    shell.id = "font-probe-shell";
    shell.innerHTML = `
      <h1 id="font-probe-title">OCR-A / Windows Chrome platform-font observation</h1>
      <p id="font-probe-boundary">Diagnostic injection · production font stack · not a fallback selection or TV qualification</p>
    `;
    const grid = document.createElement("section");
    grid.id = "font-probe-grid";
    for (const probe of probes) {
      const card = document.createElement("article");
      card.className = "font-probe-card";
      const character = document.createElement("span");
      character.id = `font-probe-${probe.id}`;
      character.className = "font-probe-character";
      character.textContent = probe.character;
      const code = document.createElement("span");
      code.className = "font-probe-code";
      code.textContent = probe.codePoint;
      const role = document.createElement("span");
      role.className = "font-probe-role";
      role.textContent = probe.role;
      card.append(character, code, role);
      grid.append(card);
    }
    shell.append(grid);
    document.body.append(shell);
  }, OCRA_FALLBACK_PROBES);
  await page.evaluate(async () => {
    await document.fonts.load("88px OCRA", "A·");
    await document.fonts.ready;
  });
}

async function observePlatformFonts(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root: documentNode } = await session.send("DOM.getDocument", {
    depth: 1,
    pierce: false,
  });
  const observations = [];
  try {
    for (const probe of OCRA_FALLBACK_PROBES) {
      const { nodeId } = await session.send("DOM.querySelector", {
        nodeId: documentNode.nodeId,
        selector: `#font-probe-${probe.id}`,
      });
      assert.ok(nodeId > 0, `probe node is missing: ${probe.id}`);
      const result = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      assert.ok(result.fonts.length > 0, `Chrome reported no font for ${probe.id}`);
      observations.push({
        ...probe,
        fonts: result.fonts.map((font) => ({
          familyName: font.familyName,
          postScriptName: font.postScriptName,
          customFont: font.isCustomFont,
          glyphCount: font.glyphCount,
        })),
      });
    }
  } finally {
    await session.detach();
  }
  return observations;
}

export async function generateOcraPlatformFallbackEvidence() {
  const requireFromConsoleLab = createRequire(resolve(appRoot, "package.json"));
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const server = await startProductionPreview();
  const browser = await chromium.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--disable-gpu"],
  });
  const browserProduct = `Chrome/${browser.version()}`;
  assert.equal(browserProduct, TV_CONFORMANCE_BROWSER_PRODUCT);
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const requestCounts = new Map();
  const consoleErrors = [];
  let pageErrorCount = 0;
  let requestFailureCount = 0;
  page.on("request", (request) => {
    const path = requestPath(request.url());
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });
  page.on("requestfailed", () => {
    requestFailureCount += 1;
  });

  let observations;
  let overflow;
  try {
    const response = await page.goto(server.origin, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await installProbeGrid(page);
    observations = await observePlatformFonts(page);
    await page.evaluate((resolved) => {
      for (const observation of resolved) {
        const character = document.querySelector(`#font-probe-${observation.id}`);
        if (!character) throw new Error(`missing rendered probe ${observation.id}`);
        const label = document.createElement("span");
        label.className = "font-probe-resolved";
        label.textContent = observation.fonts
          .map((font) => `${font.familyName}${font.customFont ? " / custom" : " / platform"}`)
          .join(" + ");
        character.parentElement?.append(label);
      }
    }, observations);
    overflow = await page.evaluate(() => ({
      horizontal: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      vertical: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    }));
    assert.deepEqual(overflow, { horizontal: 0, vertical: 0 });
    await mkdir(outputRoot, { recursive: true });
    await page.screenshot({
      path: screenshotPath,
      type: "png",
      animations: "disabled",
    });
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }

  assert.equal(pageErrorCount, 0, "font probe produced a page error");
  assert.equal(requestFailureCount, 0, "font probe had a failed request");
  assert.deepEqual(consoleErrors, [], "font probe produced a console error");

  const screenshotBytes = await readFile(screenshotPath);
  const baseEvidence = JSON.parse(
    await readFile(resolve(root, baseEvidenceRelativePath), "utf8"),
  );
  assert.deepEqual(
    OCRA_FALLBACK_PROBES.slice(1).map(({ codePoint }) => codePoint),
    baseEvidence.coverage.productionSource.nonAsciiCodePoints.map(
      ({ codePoint }) => codePoint,
    ),
    "platform-font probes must exactly cover current non-ASCII production source",
  );
  const fallbackObservations = observations.filter(
    (observation) => !observation.fonts.some((font) => font.customFont),
  );
  const evidence = {
    format: OCRA_FALLBACK_EVIDENCE_FORMAT,
    evidenceDate: OCRA_FALLBACK_EVIDENCE_DATE,
    environment: {
      platform: "windows-x64",
      browserProduct,
      node: GODOT_EXPORT_NODE_VERSION,
      headless: true,
      devicePixelRatio: 1,
      viewport: { width: 1920, height: 1080 },
    },
    baseStructuralEvidence: {
      path: baseEvidenceRelativePath,
      format: baseEvidence.format,
      fontPath: baseEvidence.subject.path,
      fontBytes: baseEvidence.subject.bytes,
      fontSha256: baseEvidence.subject.sha256,
      productionSourceNonAsciiCodePointCount:
        baseEvidence.coverage.summary.productionSourceNonAsciiCodePointCount,
      productionSourceNonAsciiMissingCount:
        baseEvidence.coverage.summary.productionSourceNonAsciiMissingCount,
    },
    probe: {
      cssFontFamily: "OCRA, ui-monospace, SFMono-Regular, monospace",
      cssFontSizePx: 88,
      observationCount: observations.length,
      observations,
      overflowCssPx: overflow,
    },
    browser: {
      documentReadyState: "complete",
      pageErrorCount,
      requestFailureCount,
      consoleErrors,
      requestCounts: Object.fromEntries(
        [...requestCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    screenshot: {
      path: screenshotRelativePath,
      bytes: screenshotBytes.length,
      sha256: sha256(screenshotBytes),
    },
    summary: {
      probeCodePointCount: observations.length,
      customFontObservationCount: observations.length - fallbackObservations.length,
      platformFallbackObservationCount: fallbackObservations.length,
      distinctFamilyNames: [
        ...new Set(observations.flatMap((item) => item.fonts.map((font) => font.familyName))),
      ].sort(),
      distinctPostScriptNames: [
        ...new Set(observations.flatMap((item) => item.fonts.map((font) => font.postScriptName))),
      ].sort(),
    },
    provenance: await provenance(),
    disposition: {
      exactWindowsChromeObservationVerified: true,
      productionCssStackUsed: true,
      diagnosticGridOnly: true,
      deterministicCrossPlatformFallbackVerified: false,
      fallbackSelected: fallbackObservations.length > 0,
      glyphShapesVerified: false,
      tvLegibilityVerified: false,
      localizationQualified: false,
      accessibilityQualified: false,
      redistributionApproved: false,
      productionReady: false,
    },
    claimBoundary: OCRA_FALLBACK_CLAIM_BOUNDARY,
    limitations: [...OCRA_FALLBACK_LIMITATIONS],
  };
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const evidence = await generateOcraPlatformFallbackEvidence();
  console.log(
    `wrote ${artifactRelativePath}: ${evidence.summary.customFontObservationCount} custom-font and ` +
      `${evidence.summary.platformFallbackObservationCount} platform-fallback observations`,
  );
}
