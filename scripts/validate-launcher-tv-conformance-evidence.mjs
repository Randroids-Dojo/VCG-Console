import { sourceTreeCommitment } from "./console-source-tree.mjs";
import { launcherBaselines } from "./launcher-evidence-baselines.mjs";
import { exactKeySet as exactKeys, normalizedSha256, sha256 } from "./evidence-primitives.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAUNCHER_TV_CLAIM_BOUNDARY,
  LAUNCHER_TV_EVIDENCE_FORMAT,
  LAUNCHER_TV_LIMITATIONS,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  TV_CONFORMANCE_EVIDENCE_FORMAT,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json",
);
const baseContractPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 96 * 1024;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
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
const frozenScreenshots = launcherBaselines.home.screenshots;
const observationExpectations = launcherBaselines.home.measurements;
const expectedRequestCounts = launcherBaselines.home.requestCounts;

export async function expectedLauncherTvProvenance() {
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

export async function expectedLauncherTvScreenshots() {
  const entries = await Promise.all(
    TV_CONFORMANCE_RESOLUTIONS.map(async ({ id }) => {
      const expected = frozenScreenshots[id];
      const bytes = await readFile(resolve(root, expected.path));
      assert.ok(
        bytes.length > PNG_SIGNATURE.length
          && bytes.length <= MAX_SCREENSHOT_BYTES,
        `${expected.path} byte size is invalid`,
      );
      assert.ok(
        bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
        `${expected.path} must have a PNG signature`,
      );
      assert.equal(
        bytes.length,
        expected.bytes,
        `${expected.path} byte identity changed`,
      );
      assert.equal(
        sha256(bytes),
        expected.sha256,
        `${expected.path} digest identity changed`,
      );
      return [id, expected];
    }),
  );
  return Object.fromEntries(entries);
}

function validateObservation(
  observation,
  resolution,
  expectedScreenshot,
) {
  const path = `artifact.browser.observations[${resolution.id}]`;
  exactKeys(
    observation,
    [
      "id",
      "width",
      "height",
      "safeArea",
      "documentReadyState",
      "criticalTextCount",
      "criticalTextInsideSafeArea",
      "minimumCriticalTextCssPx",
      "criticalTextOverlapCount",
      "actionTargetCount",
      "minimumActionTargetWidthCssPx",
      "minimumActionTargetHeightCssPx",
      "sectionOverlapCount",
      "launcherOverflowCssPx",
      "nativePackageProjection",
      "focusTrace",
      "searchVisibleAfterSelect",
      "searchHiddenAfterBack",
      "screenshot",
    ],
    path,
  );
  assert.equal(observation.id, resolution.id);
  assert.equal(observation.width, resolution.width);
  assert.equal(observation.height, resolution.height);
  exactKeys(
    observation.safeArea,
    ["left", "top", "right", "bottom"],
    `${path}.safeArea`,
  );
  const expected = observationExpectations[resolution.id];
  assert.deepEqual(observation.safeArea, expected.safeArea);
  assert.equal(observation.documentReadyState, "complete");
  assert.equal(observation.criticalTextCount, 13);
  assert.equal(
    observation.criticalTextInsideSafeArea,
    observation.criticalTextCount,
  );
  assert.equal(
    observation.minimumCriticalTextCssPx,
    expected.minimumCriticalTextCssPx,
  );
  assert.ok(observation.minimumCriticalTextCssPx >= 24);
  assert.equal(observation.criticalTextOverlapCount, 0);
  assert.equal(observation.actionTargetCount, 11);
  assert.equal(
    observation.minimumActionTargetWidthCssPx,
    expected.minimumActionTargetWidthCssPx,
  );
  assert.equal(
    observation.minimumActionTargetHeightCssPx,
    expected.minimumActionTargetHeightCssPx,
  );
  assert.ok(
    observation.minimumActionTargetWidthCssPx >= 48
      && observation.minimumActionTargetHeightCssPx >= 48,
  );
  assert.equal(observation.sectionOverlapCount, 0);
  exactKeys(
    observation.launcherOverflowCssPx,
    ["horizontal", "vertical"],
    `${path}.launcherOverflowCssPx`,
  );
  assert.deepEqual(observation.launcherOverflowCssPx, {
    horizontal: 0,
    vertical: 0,
  });
  assert.equal(
    observation.nativePackageProjection,
    "unavailable-no-host-bridge-configured",
  );
  assert.deepEqual(observation.focusTrace, [
    "settings",
    "search-trigger",
    "universal-search",
    "search-trigger",
  ]);
  assert.equal(observation.searchVisibleAfterSelect, true);
  assert.equal(observation.searchHiddenAfterBack, true);
  exactKeys(
    observation.screenshot,
    ["path", "bytes", "sha256"],
    `${path}.screenshot`,
  );
  assert.deepEqual(observation.screenshot, expectedScreenshot);
  assert.match(observation.screenshot.sha256, SHA256_PATTERN);
}

export function validateLauncherTvConformanceEvidence(
  value,
  expectedProvenance,
  expectedScreenshots,
  expectedBaseContractSha256,
) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "environment",
      "baseContract",
      "contract",
      "browser",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, LAUNCHER_TV_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, launcherBaselines.home.observation.evidenceDate);
  assert.equal(
    value.evidenceClass,
    "windows-x64-headless-chrome-launcher-home-tv-conformance",
  );
  assert.equal(
    value.qualification,
    "candidate-launcher-home-only-not-tv-target-or-catalog-qualification",
  );
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(
    value.retrievedAtUtc.startsWith(
      `${launcherBaselines.home.observation.evidenceDate}T`,
    ),
  );

  exactKeys(
    value.environment,
    [
      "buildMode",
      "producerPlatform",
      "producerArchitecture",
      "nodeVersion",
      "browserProduct",
      "devicePixelRatio",
      "browserClock",
    ],
    "artifact.environment",
  );
  assert.deepEqual(value.environment, {
    buildMode: "lab",
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: launcherBaselines.home.observation.environment.nodeVersion,
    browserProduct: launcherBaselines.home.observation.environment.browserProduct,
    devicePixelRatio: 1,
    browserClock: "2026-07-24T19:00:00-07:00",
  });

  exactKeys(
    value.baseContract,
    ["format", "sha256"],
    "artifact.baseContract",
  );
  assert.deepEqual(value.baseContract, {
    format: TV_CONFORMANCE_EVIDENCE_FORMAT,
    sha256: expectedBaseContractSha256,
  });
  exactKeys(
    value.contract,
    [
      "surface",
      "safeInsetPercent",
      "minimumCriticalTextCssPx",
      "minimumActionTargetCssPx",
      "resolutions",
    ],
    "artifact.contract",
  );
  assert.deepEqual(value.contract, {
    surface: "launcher-home",
    safeInsetPercent: 5,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetCssPx: 48,
    resolutions: TV_CONFORMANCE_RESOLUTIONS,
  });

  exactKeys(
    value.browser,
    [
      "browserProduct",
      "observations",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "requestCounts",
    ],
    "artifact.browser",
  );
  assert.equal(value.browser.browserProduct, launcherBaselines.home.observation.environment.browserProduct);
  assert.ok(Array.isArray(value.browser.observations));
  assert.equal(
    value.browser.observations.length,
    TV_CONFORMANCE_RESOLUTIONS.length,
  );
  exactKeys(
    expectedScreenshots,
    TV_CONFORMANCE_RESOLUTIONS.map(({ id }) => id),
    "expectedScreenshots",
  );
  TV_CONFORMANCE_RESOLUTIONS.forEach((resolution, index) => {
    validateObservation(
      value.browser.observations[index],
      resolution,
      expectedScreenshots[resolution.id],
    );
  });
  assert.equal(value.browser.consoleErrorCount, 0);
  assert.equal(value.browser.pageErrorCount, 0);
  assert.equal(value.browser.requestFailureCount, 0);
  exactKeys(
    value.browser.requestCounts,
    Object.keys(expectedRequestCounts),
    "artifact.browser.requestCounts",
  );
  assert.deepEqual(value.browser.requestCounts, expectedRequestCounts);

  exactKeys(
    value.disposition,
    [
      "productionBuildLoaded",
      "markedCriticalTextVerified",
      "markedActionTargetsVerified",
      "criticalAndSectionOverlapRejected",
      "keyboardFocusSelectBackVerified",
      "launcherOverflowRejected",
      "physicalTelevisionVerified",
      "physicalControllerVerified",
      "reservedHomeVerified",
      "nativeHostVerified",
      "otherLauncherViewsVerified",
      "catalogGameCompatibilityVerified",
      "targetPlatformQualified",
      "frameRateQualified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
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
  });

  exactKeys(
    value.summary,
    [
      "resolutionCount",
      "screenshotCount",
      "launcherViewCount",
      "markedCriticalTextCountPerResolution",
      "markedActionTargetCountPerResolution",
      "physicalTelevisionCount",
      "physicalControllerCount",
      "participantCount",
      "catalogGameCount",
      "targetHardwareCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    resolutionCount: 3,
    screenshotCount: 3,
    launcherViewCount: 1,
    markedCriticalTextCountPerResolution: 13,
    markedActionTargetCountPerResolution: 11,
    physicalTelevisionCount: 0,
    physicalControllerCount: 0,
    participantCount: 0,
    catalogGameCount: 0,
    targetHardwareCount: 0,
  });

  exactKeys(
    value.provenance,
    Object.keys(expectedProvenance),
    "artifact.provenance",
  );
  assert.deepEqual(value.provenance, expectedProvenance);
  for (const [key, digest] of Object.entries(value.provenance)) {
    if (key.endsWith("Sha256")) assert.match(digest, SHA256_PATTERN);
  }
  exactKeys(
    value.provenance.productionSourceTree,
    ["roots", "fileCount", "sha256"],
    "artifact.provenance.productionSourceTree",
  );
  assert.match(
    value.provenance.productionSourceTree.sha256,
    SHA256_PATTERN,
  );
  assert.equal(value.claimBoundary, LAUNCHER_TV_CLAIM_BOUNDARY);
  assert.deepEqual(value.limitations, LAUNCHER_TV_LIMITATIONS);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function validateTrackedLauncherTvConformanceEvidence() {
  const [
    artifactBytes,
    expectedProvenance,
    expectedScreenshots,
    baseContractBytes,
  ] = await Promise.all([
    readFile(artifactPath),
    expectedLauncherTvProvenance(),
    expectedLauncherTvScreenshots(),
    readFile(baseContractPath),
  ]);
  return validateLauncherTvConformanceEvidence(
    parseBoundedJson(artifactBytes),
    expectedProvenance,
    expectedScreenshots,
    sha256(baseContractBytes),
  );
}

async function main() {
  const artifact =
    await validateTrackedLauncherTvConformanceEvidence();
  console.log(
    `validated launcher TV conformance; view=${artifact.contract.surface}; resolutions=${artifact.summary.resolutionCount}; physicalTVs=${artifact.summary.physicalTelevisionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
