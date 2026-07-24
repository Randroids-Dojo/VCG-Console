import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";
import {
  countOverlaps,
  findChrome,
  insideSafeArea,
  measureElements,
  normalizedSha256,
  rounded,
  sha256,
  sourceTreeCommitment,
  startProductionPreview,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

export const LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT =
  "vcg-launcher-search-tv-conformance-evidence/v1";
export const LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY =
  "One Windows x64 installed-Chrome production-build desk run proves that the explicitly marked five-result Motion query and no-result Search overlay states satisfy the candidate five-percent CSS safe inset, 24 CSS-pixel critical-text floor, 48 CSS-pixel action floor, non-overlap, bounded overlay overflow, and exact keyboard focus/Back recovery checks at 1280x720, 1920x1080, and 3840x2160 with devicePixelRatio 1. It does not qualify unfiltered or scrolling result sets, arbitrary localization or query text, result activation, a game, every launcher state, a physical television or controller, reserved Home action, native host, target Linux compositor, output mode, overscan, seating-distance legibility, audio, animation smoothness, or frame pacing.";
export const LAUNCHER_SEARCH_TV_LIMITATIONS = Object.freeze([
  "Only two exact Search states were measured: the five-result lowercase Motion query and one fixed no-result query. Empty-query density, scrolling result sets, arbitrary text, localization, voice input, result activation, and every other overlay remain outside this artifact.",
  "The three resolutions used one Windows x64 development host and headless installed Chrome at devicePixelRatio 1, not physical televisions, target Linux, EDID output modes, compositor scaling, HDR, or overscan.",
  "Keyboard input, ArrowDown, Tab wrapping, Escape, and opener restoration were exercised. No physical controller, hot-plug, reserved Home action, pointer lock, fullscreen, compositor focus change, or native recovery authority was tested.",
  "The candidate 5% / 24 CSS px / 48 CSS px values remain provisional under Q-242 and Q-243; passing them is not seating-distance comprehension, accessibility, localization, or catalog-wide compatibility.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputRoot = resolve(root, "benchmarks/tv-conformance");
const artifactPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
);
const representativeEvidenceRelativePath =
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json";
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  searchPath: "apps/console-lab/src/launcher/SearchOverlay.svelte",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  representativeEvidencePath: representativeEvidenceRelativePath,
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-search-tv-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-search-tv-evidence.mjs",
});

const SEARCH_STATES = Object.freeze([
  {
    id: "motion-results",
    query: "motion",
    resultCount: 5,
    criticalTextCount: 13,
    actionTargetCount: 6,
    focusTrace: [
      "universal-search",
      "result-first",
      "result-last",
      "universal-search",
      "search-trigger",
    ],
  },
  {
    id: "no-results",
    query: "no-such-vcg-destination",
    resultCount: 0,
    criticalTextCount: 4,
    actionTargetCount: 1,
    focusTrace: [
      "universal-search",
      "universal-search",
      "search-trigger",
    ],
  },
]);

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return {
    ...Object.fromEntries(
      entries.flatMap(([key, path, digest]) => [
        [key, path],
        [`${key}Sha256`, digest],
      ]),
    ),
    productionSourceTree: await sourceTreeCommitment(),
  };
}

function safeAreaFor(resolution) {
  return {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  };
}

async function exerciseFocus(page, state) {
  const input = page.locator("#universal-search");
  const results = page.locator("#search-results button");
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  if (state.id === "motion-results") {
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await results.first().evaluate((element) => element === document.activeElement),
      true,
    );
    await results.last().focus();
    assert.equal(
      await results.last().evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#search-overlay").isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "search-trigger");
    return [
      "universal-search",
      "result-first",
      "result-last",
      "universal-search",
      "search-trigger",
    ];
  }
  await page.keyboard.press("Tab");
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#search-overlay").isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "search-trigger");
  return ["universal-search", "universal-search", "search-trigger"];
}

async function exercise(chromePath) {
  const requireFromConsoleLab = createRequire(resolve(appRoot, "package.json"));
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const server = await startProductionPreview();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const observations = [];
  const requestCounts = new Map();
  const consoleErrors = [];
  let pageErrorCount = 0;
  let requestFailureCount = 0;
  try {
    for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
      for (const state of SEARCH_STATES) {
        const page = await browser.newPage({
          viewport: {
            width: resolution.width,
            height: resolution.height,
          },
          deviceScaleFactor: 1,
        });
        await page.clock.install({
          time: new Date("2026-07-24T19:00:00-07:00"),
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
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (url.origin !== server.origin) return;
          requestCounts.set(
            url.pathname,
            (requestCounts.get(url.pathname) ?? 0) + 1,
          );
        });
        const response = await page.goto(`${server.origin}/?skipBoot=1`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        assert.equal(response?.status(), 200);
        await page.getByRole("heading", { name: /Good evening/ }).waitFor();
        await page.locator("#search-trigger").focus();
        await page.locator("#search-trigger").click();
        const input = page.locator("#universal-search");
        await input.fill(state.query);
        const results = page.locator("#search-results button");
        assert.equal(await results.count(), state.resultCount);
        assert.equal(
          await page.locator("#search-empty").isVisible(),
          state.resultCount === 0,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.clock.runFor(1_000);

        const safeArea = safeAreaFor(resolution);
        const criticalText = await measureElements(
          page,
          ".search-overlay [data-tv-critical-text]:visible",
        );
        const actions = await measureElements(
          page,
          ".search-overlay [data-tv-action]:visible",
        );
        assert.equal(criticalText.length, state.criticalTextCount);
        assert.equal(actions.length, state.actionTargetCount);
        assert.ok(
          criticalText.every(
            (item) =>
              insideSafeArea(item, safeArea) && item.fontSize >= 24,
          ),
        );
        assert.equal(countOverlaps(criticalText), 0);
        assert.ok(
          actions.every(
            (item) => item.width >= 48 && item.height >= 48,
          ),
        );
        const overflow = await page.locator(".search-overlay").evaluate(
          (element) => ({
            horizontal: element.scrollWidth - element.clientWidth,
            vertical: element.scrollHeight - element.clientHeight,
          }),
        );
        assert.ok(overflow.horizontal <= 1 && overflow.vertical <= 1);

        const screenshotPath = resolve(
          outputRoot,
          `windows-x64-chrome-150-launcher-search-${state.id}-${resolution.id}.png`,
        );
        await mkdir(dirname(screenshotPath), { recursive: true });
        const screenshot = await page.screenshot({
          path: screenshotPath,
          fullPage: false,
        });
        const focusTrace = await exerciseFocus(page, state);
        assert.deepEqual(focusTrace, state.focusTrace);
        observations.push({
          state: state.id,
          ...resolution,
          query: state.query,
          safeArea,
          documentReadyState: await page.evaluate(() => document.readyState),
          resultCount: state.resultCount,
          emptyStateVisible: state.resultCount === 0,
          criticalTextCount: criticalText.length,
          criticalTextInsideSafeArea: criticalText.filter((item) =>
            insideSafeArea(item, safeArea)
          ).length,
          minimumCriticalTextCssPx: rounded(
            Math.min(...criticalText.map((item) => item.fontSize)),
          ),
          criticalTextOverlapCount: countOverlaps(criticalText),
          actionTargetCount: actions.length,
          minimumActionTargetWidthCssPx: rounded(
            Math.min(...actions.map((item) => item.width)),
          ),
          minimumActionTargetHeightCssPx: rounded(
            Math.min(...actions.map((item) => item.height)),
          ),
          overlayOverflowCssPx: overflow,
          focusTrace,
          screenshot: {
            path:
              `benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-${state.id}-${resolution.id}.png`,
            bytes: screenshot.length,
            sha256: createHash("sha256").update(screenshot).digest("hex"),
          },
        });
        await page.close();
      }
    }
    assert.deepEqual(consoleErrors, []);
    assert.equal(pageErrorCount, 0);
    assert.equal(requestFailureCount, 0);
    return {
      browserProduct: `Chrome/${browser.version()}`,
      observations,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount,
      requestFailureCount,
      requestCounts: Object.fromEntries(
        [...requestCounts].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      ),
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function generateLauncherSearchTvEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, GODOT_EXPORT_NODE_VERSION);
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${TV_CONFORMANCE_EVIDENCE_DATE}T`),
    `this evidence generator is frozen to ${TV_CONFORMANCE_EVIDENCE_DATE}`,
  );
  const browser = await exercise(findChrome());
  assert.equal(browser.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
  const representativeEvidenceBytes = await readFile(
    resolve(root, representativeEvidenceRelativePath),
  );
  return {
    format: LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT,
    evidenceDate: TV_CONFORMANCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-headless-chrome-launcher-search-tv-conformance",
    qualification:
      "candidate-two-search-states-only-not-tv-target-or-catalog-qualification",
    retrievedAtUtc,
    baseRepresentativeEvidence: {
      format:
        "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1",
      sha256: sha256(representativeEvidenceBytes),
    },
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: browser.browserProduct,
      devicePixelRatio: 1,
      browserClock: "2026-07-24T19:00:00-07:00",
    },
    contract: {
      states: SEARCH_STATES,
      safeInsetPercent: 5,
      minimumCriticalTextCssPx: 24,
      minimumActionTargetCssPx: 48,
      resolutions: TV_CONFORMANCE_RESOLUTIONS,
    },
    browser,
    disposition: {
      productionBuildLoaded: true,
      markedCriticalTextVerified: true,
      markedActionTargetsVerified: true,
      criticalTextOverlapRejected: true,
      keyboardInputFocusBackVerified: true,
      overlayOverflowRejected: true,
      arbitraryQueryVerified: false,
      scrollingResultsVerified: false,
      resultActivationVerified: false,
      physicalTelevisionVerified: false,
      physicalControllerVerified: false,
      reservedHomeVerified: false,
      nativeHostVerified: false,
      catalogGameCompatibilityVerified: false,
      allLauncherStatesVerified: false,
      targetPlatformQualified: false,
      frameRateQualified: false,
    },
    summary: {
      resolutionCount: 3,
      searchStateCount: 2,
      observationCount: 6,
      screenshotCount: 6,
      distinctQueryCount: 2,
      physicalTelevisionCount: 0,
      physicalControllerCount: 0,
      participantCount: 0,
      catalogGameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY,
    limitations: LAUNCHER_SEARCH_TV_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateLauncherSearchTvEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote launcher Search TV evidence for ${artifact.summary.searchStateCount} states, ${artifact.summary.observationCount} observations, and ${artifact.summary.screenshotCount} screenshots`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
