import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";
import {
  TV_CONFORMANCE_BROWSER_PRODUCT,
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

export const LAUNCHER_TV_EVIDENCE_FORMAT =
  "vcg-launcher-home-tv-conformance-evidence/v1";
export const LAUNCHER_TV_BROWSER_CLOCK = "2026-07-24T19:00:00-07:00";
export const LAUNCHER_TV_CLAIM_BOUNDARY =
  "One Windows x64 installed-Chrome production-build desk run proves that the marked launcher-home critical text and actions remain inside a five-percent CSS safe inset, do not overlap, retain at least 24 CSS-pixel text and 48 CSS-pixel targets, preserve a keyboard focus/select/Back round trip, and avoid launcher overflow at 1280x720, 1920x1080, and 3840x2160 with devicePixelRatio 1. It does not qualify another launcher view, a physical television, controller, reserved Home action, native host, catalog game, target Linux compositor, output mode, overscan, seating-distance legibility, accessibility/localization variant, audio, animation smoothness, or frame pacing.";
export const LAUNCHER_TV_LIMITATIONS = Object.freeze([
  "Only the marked launcher home view was measured. Motion, Museum, Retro, Profiles, Settings, overlays other than Search, launch progress, Motion Lab, games, and failure/recovery surfaces remain outside this evidence.",
  "The three observations used one Windows x64 development host and headless installed Chrome at devicePixelRatio 1, not physical televisions, target Linux, EDID output modes, compositor scaling, HDR, or overscan.",
  "Keyboard Tab, Enter, and Escape exercised one focus/select/Back round trip. No physical controller, hot-plug, reserved Home, motion input, pointer lock, fullscreen, crash, hang, or compositor-owned recovery action was tested.",
  "A frozen browser clock makes the screenshots reproducible. It is evidence-fixture input, not secure time, native-host state, profile authority, or a production clock integration.",
  "The candidate 5% / 24 CSS px / 48 CSS px values remain provisional under Q-242 and Q-243; passing them is not seating-distance comprehension, accessibility, or catalog-wide compatibility.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputRoot = resolve(root, "benchmarks/tv-conformance");
const artifactPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-launcher-home-tv-conformance-v1.json",
);
const baseContractPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-tv-conformance-v1.json",
);
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  searchPath: "apps/console-lab/src/launcher/SearchOverlay.svelte",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  catalogPath: "apps/console-lab/src/launcher/catalog.generated.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  baseContractPath:
    "benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json",
  generatorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-tv-conformance-evidence.mjs",
});
const productionSourceTreeRoots = Object.freeze([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "apps/console-lab/package.json",
  "apps/console-lab/index.html",
  "apps/console-lab/vite.config.ts",
  "apps/console-lab/src",
  "packages/game-manifest/src",
  "packages/launcher-catalog/src",
  "packages/motion-contract/src",
  "packages/motion-web-bridge/src",
  "packages/retro-firmware-contract/src",
  "packages/retro-import-contract/src",
]);

export function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function installFrozenLauncherClock(page) {
  await page.clock.install({
    time: new Date(LAUNCHER_TV_BROWSER_CLOCK),
  });
  await page.addInitScript((timestampMs) => {
    const NativeDate = Date;
    class EvidenceDate extends NativeDate {
      constructor(...args) {
        super(...(args.length > 0 ? args : [timestampMs]));
      }

      static now() {
        return timestampMs;
      }
    }
    Object.defineProperty(globalThis, "Date", {
      configurable: true,
      value: EvidenceDate,
      writable: true,
    });
  }, Date.parse(LAUNCHER_TV_BROWSER_CLOCK));
}

export async function provenance() {
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

async function collectSourceTreeFiles(path) {
  const absolute = resolve(root, path);
  const metadata = await stat(absolute);
  if (metadata.isFile()) return [path.replaceAll("\\", "/")];
  assert.equal(metadata.isDirectory(), true);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) =>
        collectSourceTreeFiles(
          `${path.replaceAll("\\", "/")}/${entry.name}`,
        )
      ),
  );
  return nested.flat();
}

export async function sourceTreeCommitment() {
  const paths = (
    await Promise.all(
      productionSourceTreeRoots.map(collectSourceTreeFiles),
    )
  ).flat().sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    const bytes = await readFile(resolve(root, path));
    hash.update(path);
    hash.update("\0");
    hash.update(bytes.toString("utf8").replaceAll("\r\n", "\n"));
    hash.update("\0");
  }
  return {
    roots: productionSourceTreeRoots,
    fileCount: paths.length,
    sha256: hash.digest("hex"),
  };
}

export function findChrome() {
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

export function rounded(value) {
  return Number(value.toFixed(3));
}

export function insideSafeArea(item, safeArea) {
  return (
    item.left >= safeArea.left - 0.5
    && item.top >= safeArea.top - 0.5
    && item.right <= safeArea.right + 0.5
    && item.bottom <= safeArea.bottom + 0.5
  );
}

export function countOverlaps(items) {
  let count = 0;
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < items.length;
      rightIndex += 1
    ) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      const width =
        Math.min(left.right, right.right)
        - Math.max(left.left, right.left);
      const height =
        Math.min(left.bottom, right.bottom)
        - Math.max(left.top, right.top);
      if (width > 0.5 && height > 0.5) count += 1;
    }
  }
  return count;
}

export async function startProductionPreview() {
  const requireFromConsoleLab = createRequire(
    resolve(appRoot, "package.json"),
  );
  const vitePath = requireFromConsoleLab.resolve("vite");
  const { build, preview } = await import(pathToFileURL(vitePath).href);
  await build({ root: appRoot, logLevel: "silent" });
  const server = await preview({
    root: appRoot,
    logLevel: "silent",
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  const address = server.httpServer.address();
  assert.ok(address !== null && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.httpServer.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}

export async function measureElements(page, selector) {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        label:
          element.getAttribute("aria-label")
          ?? element.textContent?.trim().replace(/\s+/gu, " ")
          ?? element.tagName,
        left: Number(bounds.left.toFixed(3)),
        top: Number(bounds.top.toFixed(3)),
        right: Number(bounds.right.toFixed(3)),
        bottom: Number(bounds.bottom.toFixed(3)),
        width: Number(bounds.width.toFixed(3)),
        height: Number(bounds.height.toFixed(3)),
        fontSize: Number(
          Number.parseFloat(getComputedStyle(element).fontSize).toFixed(3),
        ),
      };
    }),
  );
}

async function exercise(chromePath) {
  const requireFromConsoleLab = createRequire(
    resolve(appRoot, "package.json"),
  );
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
      await installFrozenLauncherClock(page);
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrorCount += 1;
          consoleErrors.push(message.text());
        }
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
      const response = await page.goto(
        `${server.origin}/?skipBoot=1`,
        { waitUntil: "load", timeout: 30_000 },
      );
      assert.equal(response?.status(), 200);
      await page.getByRole("heading", { name: /Good evening/ }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      const safeArea = {
        left: resolution.width * 0.05,
        top: resolution.height * 0.05,
        right: resolution.width * 0.95,
        bottom: resolution.height * 0.95,
      };
      const criticalText = await measureElements(
        page,
        "[data-tv-critical-text]:visible",
      );
      const actions = await measureElements(
        page,
        "[data-tv-action]:visible",
      );
      assert.equal(criticalText.length, 24);
      assert.equal(actions.length, 12);
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

      const sections = await page
        .locator(".home-heading, .home-destinations, .home-status")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              className: element.className,
              top: Number(bounds.top.toFixed(3)),
              bottom: Number(bounds.bottom.toFixed(3)),
            };
          }),
        );
      assert.equal(sections.length, 3);
      const sectionOverlapCount =
        Number(sections[0].bottom > sections[1].top + 0.5)
        + Number(sections[1].bottom > sections[2].top + 0.5);
      assert.equal(sectionOverlapCount, 0);

      const overflow = await page.locator("#launcher").evaluate(
        (element) => ({
          horizontal: element.scrollWidth - element.clientWidth,
          vertical: element.scrollHeight - element.clientHeight,
        }),
      );
      assert.ok(
        overflow.horizontal <= 1 && overflow.vertical <= 1,
      );
      const packageState = (
        await page.locator(".home-status span").nth(1).textContent()
      )?.trim();
      assert.equal(packageState, "Local package catalog unavailable");

      await page.locator("[data-launcher-home]").focus();
      const focusTrace = [
        await page.evaluate(() => document.activeElement?.getAttribute(
          "data-launcher-home",
        ) === "" ? "launcher-home" : null),
      ];
      await page.keyboard.press("Tab");
      focusTrace.push(
        await page.evaluate(() => document.activeElement?.id ?? null),
      );
      await page.keyboard.press("Enter");
      focusTrace.push(
        await page.evaluate(() => document.activeElement?.id ?? null),
      );
      const searchVisibleAfterSelect =
        await page.locator("#search-overlay").isVisible();
      await page.keyboard.press("Escape");
      focusTrace.push(
        await page.evaluate(() => document.activeElement?.id ?? null),
      );
      const searchHiddenAfterBack =
        await page.locator("#search-overlay").isHidden();
      assert.deepEqual(focusTrace, [
        "launcher-home",
        "search-trigger",
        "universal-search",
        "search-trigger",
      ]);
      assert.equal(searchVisibleAfterSelect, true);
      assert.equal(searchHiddenAfterBack, true);

      const screenshotPath = resolve(
        outputRoot,
        `windows-x64-chrome-150-launcher-home-${resolution.id}.png`,
      );
      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await page.screenshot({
        path: screenshotPath,
        fullPage: false,
      });
      observations.push({
        ...resolution,
        safeArea,
        documentReadyState: await page.evaluate(
          () => document.readyState,
        ),
        criticalTextCount: criticalText.length,
        criticalTextInsideSafeArea: criticalText.filter((item) =>
          insideSafeArea(item, safeArea)
        ).length,
        minimumCriticalTextCssPx: Math.min(
          ...criticalText.map((item) => item.fontSize),
        ),
        criticalTextOverlapCount: countOverlaps(criticalText),
        actionTargetCount: actions.length,
        minimumActionTargetWidthCssPx: rounded(
          Math.min(...actions.map((item) => item.width)),
        ),
        minimumActionTargetHeightCssPx: rounded(
          Math.min(...actions.map((item) => item.height)),
        ),
        sectionOverlapCount,
        launcherOverflowCssPx: overflow,
        nativePackageProjection:
          "unavailable-no-host-bridge-configured",
        focusTrace,
        searchVisibleAfterSelect,
        searchHiddenAfterBack,
        screenshot: {
          path:
            `benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-${resolution.id}.png`,
          bytes: screenshot.length,
          sha256: sha256(screenshot),
        },
      });
      await page.close();
    }
    assert.deepEqual(consoleErrors, []);
    assert.equal(pageErrorCount, 0);
    assert.equal(requestFailureCount, 0);
    return {
      browserProduct: `Chrome/${browser.version()}`,
      observations,
      consoleErrorCount,
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

export async function generateLauncherTvConformanceEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, GODOT_EXPORT_NODE_VERSION);
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${TV_CONFORMANCE_EVIDENCE_DATE}T`),
    `this evidence generator is frozen to ${TV_CONFORMANCE_EVIDENCE_DATE}`,
  );
  const browser = await exercise(findChrome());
  assert.equal(browser.browserProduct, TV_CONFORMANCE_BROWSER_PRODUCT);
  const baseContractBytes = await readFile(baseContractPath);
  return {
    format: LAUNCHER_TV_EVIDENCE_FORMAT,
    evidenceDate: TV_CONFORMANCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-headless-chrome-launcher-home-tv-conformance",
    qualification:
      "candidate-launcher-home-only-not-tv-target-or-catalog-qualification",
    retrievedAtUtc,
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: browser.browserProduct,
      devicePixelRatio: 1,
      browserClock: LAUNCHER_TV_BROWSER_CLOCK,
    },
    baseContract: {
      format: "vcg-tv-conformance-evidence/v1",
      sha256: sha256(baseContractBytes),
    },
    contract: {
      surface: "launcher-home",
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
      keyboardFocusSelectBackVerified: true,
      launcherOverflowRejected: true,
      physicalTelevisionVerified: false,
      physicalControllerVerified: false,
      reservedHomeVerified: false,
      nativeHostVerified: false,
      otherLauncherViewsVerified: false,
      catalogGameCompatibilityVerified: false,
      targetPlatformQualified: false,
      frameRateQualified: false,
    },
    summary: {
      resolutionCount: 3,
      screenshotCount: 3,
      launcherViewCount: 1,
      markedCriticalTextCountPerResolution: 24,
      markedActionTargetCountPerResolution: 12,
      physicalTelevisionCount: 0,
      physicalControllerCount: 0,
      participantCount: 0,
      catalogGameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: LAUNCHER_TV_CLAIM_BOUNDARY,
    limitations: LAUNCHER_TV_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateLauncherTvConformanceEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote launcher TV evidence for ${artifact.summary.resolutionCount} resolutions and ${artifact.summary.screenshotCount} screenshots`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
