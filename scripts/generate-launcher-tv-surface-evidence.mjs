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

export const LAUNCHER_TV_SURFACE_EVIDENCE_FORMAT =
  "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1";
export const LAUNCHER_TV_SURFACE_CLAIM_BOUNDARY =
  "One Windows x64 installed-Chrome production-build desk run proves that the explicitly marked Motion catalog, Wi-Fi offline settings state, and offline launch-recovery dialog satisfy the candidate five-percent CSS safe inset, 24 CSS-pixel critical-text floor, 48 CSS-pixel action floor, non-overlap, bounded overflow, and exact keyboard Back/focus-recovery checks at 1280x720, 1920x1080, and 3840x2160 with devicePixelRatio 1. It does not qualify any other launcher state, a game, physical television, controller, reserved Home action, native host, target Linux compositor, output mode, overscan, seating-distance legibility, accessibility/localization variant, audio, animation smoothness, or frame pacing.";
export const LAUNCHER_TV_SURFACE_LIMITATIONS = Object.freeze([
  "Only three explicit states were measured: the Motion Hub catalog list, the Wi-Fi offline settings panel, and an injected local-web offline launch-recovery dialog. Museum, Retro, Profiles, calibration, portraits, unassigned progress, other settings, other launch states, Search, Motion Lab, and games remain outside this artifact.",
  "The three resolutions used one Windows x64 development host and headless installed Chrome at devicePixelRatio 1, not physical televisions, target Linux, EDID output modes, compositor scaling, HDR, or overscan.",
  "Keyboard focus and Escape exercised one exact route per state. No physical controller, hot-plug, reserved Home action, pointer lock, fullscreen, crashed process, compositor focus change, or native recovery authority was tested.",
  "The offline dialog was deliberately injected from the developer preview. It verifies presentation and focus recovery only; it does not prove real network detection, process supervision, native launch recovery, or retry success.",
  "The candidate 5% / 24 CSS px / 48 CSS px values remain provisional under Q-242 and Q-243; passing them is not seating-distance comprehension, accessibility, localization, or catalog-wide compatibility.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputRoot = resolve(root, "benchmarks/tv-conformance");
const artifactPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
);
const homeEvidenceRelativePath =
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json";
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  settingsPath: "apps/console-lab/src/launcher/SettingsView.svelte",
  launchScreenPath: "apps/console-lab/src/launcher/LaunchScreen.svelte",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  catalogPath: "apps/console-lab/src/launcher/catalog.generated.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  homeEvidencePath: homeEvidenceRelativePath,
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-tv-surface-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-tv-surface-evidence.mjs",
});

const SURFACES = Object.freeze([
  {
    id: "motion-catalog",
    rootSelector: "#launcher",
    criticalTextCount: 24,
    actionTargetCount: 13,
    sections: [".view-header", ".library-list"],
    focusTrace: ["motion-first-entry", "launcher-home"],
  },
  {
    id: "wifi-offline",
    rootSelector: "#launcher",
    criticalTextCount: 23,
    actionTargetCount: 17,
    sections: [".view-header", ".settings-layout"],
    focusTrace: ["scan-wifi", "launcher-home"],
  },
  {
    id: "launch-offline",
    rootSelector: ".launch-screen",
    criticalTextCount: 21,
    actionTargetCount: 3,
    sections: [".launch-header", ".launch-body", ".launch-footer"],
    focusTrace: [
      "launch-exit",
      "launch-retry",
      "launch-exit",
      "offline-preview",
    ],
  },
]);

function digestBytes(bytes) {
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

function sectionOverlapCount(sections) {
  let count = 0;
  for (let index = 0; index < sections.length - 1; index += 1) {
    if (sections[index].bottom > sections[index + 1].top + 0.5) {
      count += 1;
    }
  }
  return count;
}

async function openSurface(page, surfaceId) {
  if (surfaceId === "motion-catalog") {
    await page.locator('[data-view-target="motion"]').click();
    await page.getByRole("heading", { name: "Move to play." }).waitFor();
    return;
  }
  await page.locator('[data-view-target="settings"]').click();
  if (surfaceId === "wifi-offline") {
    await page.locator('[data-settings-target="network"]').click();
    await page.getByRole("heading", { name: "Wi-Fi." }).waitFor();
    return;
  }
  assert.equal(surfaceId, "launch-offline");
  await page.locator('[data-settings-target="developer"]').click();
  await page.locator('[data-tv-focus="offline-preview"]').click();
  await page.getByRole("dialog", { name: "Obstacle" }).waitFor();
}

async function exerciseFocus(page, surfaceId) {
  if (surfaceId === "motion-catalog") {
    await page.locator('[data-tv-focus="motion-first-entry"]').focus();
    assert.equal(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-tv-focus"),
      ),
      "motion-first-entry",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-view-target"),
      ),
      "home",
    );
    return ["motion-first-entry", "launcher-home"];
  }
  if (surfaceId === "wifi-offline") {
    await page.locator("#scan-wifi").focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "scan-wifi");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-view-target"),
      ),
      "home",
    );
    return ["scan-wifi", "launcher-home"];
  }

  const exit = page.getByRole("button", { name: /Exit/ });
  const retry = page.getByRole("button", { name: /Retry/ });
  await exit.waitFor();
  assert.equal(await exit.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await retry.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await exit.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".launch-screen").count(), 0);
  assert.equal(
    await page.evaluate(
      () => document.activeElement?.getAttribute("data-tv-focus"),
    ),
    "offline-preview",
  );
  return ["launch-exit", "launch-retry", "launch-exit", "offline-preview"];
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
      for (const surface of SURFACES) {
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
        await openSurface(page, surface.id);
        await page.evaluate(() => document.fonts.ready);
        await page.clock.runFor(1_000);

        const safeArea = safeAreaFor(resolution);
        const criticalText = await measureElements(
          page,
          `${surface.rootSelector} [data-tv-critical-text]:visible`,
        );
        const actions = await measureElements(
          page,
          `${surface.rootSelector} [data-tv-action]:visible`,
        );
        assert.equal(criticalText.length, surface.criticalTextCount);
        assert.equal(actions.length, surface.actionTargetCount);
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

        const sections = await page.locator(
          surface.sections.join(", "),
        ).evaluateAll((elements) =>
          elements
            .filter((element) => element.getClientRects().length > 0)
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return {
                className: element.className,
                top: Number(bounds.top.toFixed(3)),
                bottom: Number(bounds.bottom.toFixed(3)),
              };
            }),
        );
        assert.equal(sections.length, surface.sections.length);
        const overlaps = sectionOverlapCount(sections);
        assert.equal(overlaps, 0);

        const overflow = await page.locator(surface.rootSelector).evaluate(
          (element) => ({
            horizontal: element.scrollWidth - element.clientWidth,
            vertical: element.scrollHeight - element.clientHeight,
          }),
        );
        assert.ok(overflow.horizontal <= 1 && overflow.vertical <= 1);

        const screenshotPath = resolve(
          outputRoot,
          `windows-x64-chrome-150-launcher-${surface.id}-${resolution.id}.png`,
        );
        await mkdir(dirname(screenshotPath), { recursive: true });
        const screenshot = await page.screenshot({
          path: screenshotPath,
          fullPage: false,
        });
        const focusTrace = await exerciseFocus(page, surface.id);
        assert.deepEqual(focusTrace, surface.focusTrace);

        observations.push({
          surface: surface.id,
          ...resolution,
          safeArea,
          documentReadyState: await page.evaluate(() => document.readyState),
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
          sectionOverlapCount: overlaps,
          rootOverflowCssPx: overflow,
          focusTrace,
          screenshot: {
            path:
              `benchmarks/tv-conformance/windows-x64-chrome-150-launcher-${surface.id}-${resolution.id}.png`,
            bytes: screenshot.length,
            sha256: digestBytes(screenshot),
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

export async function generateLauncherTvSurfaceEvidence() {
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
  const homeEvidenceBytes = await readFile(
    resolve(root, homeEvidenceRelativePath),
  );
  return {
    format: LAUNCHER_TV_SURFACE_EVIDENCE_FORMAT,
    evidenceDate: TV_CONFORMANCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-headless-chrome-launcher-representative-surfaces-tv-conformance",
    qualification:
      "candidate-three-launcher-states-only-not-tv-target-or-game-qualification",
    retrievedAtUtc,
    baseLauncherHomeEvidence: {
      format: "vcg-launcher-home-tv-conformance-evidence/v1",
      sha256: sha256(homeEvidenceBytes),
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
      surfaces: SURFACES.map((surface) => ({
        id: surface.id,
        criticalTextCount: surface.criticalTextCount,
        actionTargetCount: surface.actionTargetCount,
        focusTrace: surface.focusTrace,
      })),
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
      criticalAndSectionOverlapRejected: true,
      keyboardBackAndFocusRecoveryVerified: true,
      rootOverflowRejected: true,
      realNetworkFailureVerified: false,
      retryRecoveryVerified: false,
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
      launcherStateCount: 3,
      observationCount: 9,
      screenshotCount: 9,
      physicalTelevisionCount: 0,
      physicalControllerCount: 0,
      participantCount: 0,
      catalogGameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: LAUNCHER_TV_SURFACE_CLAIM_BOUNDARY,
    limitations: LAUNCHER_TV_SURFACE_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateLauncherTvSurfaceEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote representative launcher TV evidence for ${artifact.summary.launcherStateCount} states, ${artifact.summary.observationCount} observations, and ${artifact.summary.screenshotCount} screenshots`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
