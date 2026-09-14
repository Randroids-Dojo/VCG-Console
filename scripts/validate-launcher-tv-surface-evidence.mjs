import { launcherBaselines } from "./launcher-evidence-baselines.mjs";
import { exactKeys } from "./evidence-primitives.mjs";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizedSha256,
  sha256,
  sourceTreeCommitment,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  LAUNCHER_TV_SURFACE_CLAIM_BOUNDARY,
  LAUNCHER_TV_SURFACE_EVIDENCE_FORMAT,
  LAUNCHER_TV_SURFACE_LIMITATIONS,
} from "./generate-launcher-tv-surface-evidence.mjs";
import {
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
);
const homeEvidencePath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 96 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const EXPECTED_SURFACES = Object.freeze([
  {
    id: "motion-catalog",
    criticalTextCount: 18,
    actionTargetCount: 12,
    focusTrace: ["motion-first-entry", "launcher-home"],
  },
  {
    id: "wifi-offline",
    criticalTextCount: 22,
    actionTargetCount: 17,
    focusTrace: ["scan-wifi", "launcher-home"],
  },
  {
    id: "launch-offline",
    criticalTextCount: 21,
    actionTargetCount: 3,
    focusTrace: [
      "launch-exit",
      "launch-retry",
      "launch-exit",
      "offline-preview",
    ],
  },
]);

const EXPECTED_SCREENSHOTS = launcherBaselines.surfaces.screenshots;
const EXPECTED_MEASUREMENTS = launcherBaselines.surfaces.measurements;

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
  homeEvidencePath:
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json",
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-tv-surface-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-tv-surface-evidence.mjs",
});

function finite(value, label) {
  assert.equal(typeof value, "number", `${label} must be numeric`);
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function observationKey(observation) {
  return `${observation.surface}/${observation.id}`;
}

async function validateScreenshot(observation) {
  const expected = EXPECTED_SCREENSHOTS[observationKey(observation)];
  assert.ok(expected, `no frozen screenshot for ${observationKey(observation)}`);
  assert.deepEqual(observation.screenshot, expected);
  const absolute = resolve(root, observation.screenshot.path);
  assert.equal(
    absolute.startsWith(resolve(root, "benchmarks/tv-conformance")),
    true,
    "screenshot path escaped evidence root",
  );
  const metadata = await stat(absolute);
  assert.equal(metadata.isFile(), true);
  assert.ok(metadata.size <= MAX_SCREENSHOT_BYTES);
  assert.equal(metadata.size, observation.screenshot.bytes);
  const bytes = await readFile(absolute);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
  assert.equal(sha256(bytes), observation.screenshot.sha256);
}

function validateRequests(requestCounts) {
  exactKeys(
    requestCounts,
    Object.keys(requestCounts).sort((left, right) => left.localeCompare(right)),
    "requestCounts",
  );
  const entries = Object.entries(requestCounts);
  assert.equal(entries.length, 9);
  assert.equal(requestCounts["/"], 9);
  assert.equal(requestCounts["/fonts/OCRA.ttf"], 9);
  assert.equal(requestCounts["/fonts/InterVariable.woff2"], 9);
  const assets = entries.filter(([path]) => path.startsWith("/assets/"));
  assert.equal(assets.length, 6);
  assert.equal(
    assets.filter(([path]) => path.endsWith(".css")).length,
    1,
  );
  assert.equal(
    assets.filter(([path]) => path.endsWith(".js")).length,
    5,
  );
  for (const [path, count] of assets) {
    assert.match(path, /^\/assets\/[A-Za-z0-9_-]+\.(?:css|js)$/u);
    assert.equal(count, 9);
  }
}

async function validateProvenance(provenance) {
  const expectedKeys = Object.keys(provenancePaths).flatMap((key) => [
    key,
    `${key}Sha256`,
  ]);
  expectedKeys.push("productionSourceTree");
  exactKeys(provenance, expectedKeys, "provenance");
  for (const [key, path] of Object.entries(provenancePaths)) {
    assert.equal(provenance[key], path);
    assert.equal(
      provenance[`${key}Sha256`],
      normalizedSha256(await readFile(resolve(root, path))),
    );
  }
  assert.deepEqual(
    provenance.productionSourceTree,
    await sourceTreeCommitment(),
  );
}

async function validateObservation(observation, expectedSurface, resolution) {
  exactKeys(
    observation,
    [
      "surface",
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
      "rootOverflowCssPx",
      "focusTrace",
      "screenshot",
    ],
    `observation ${expectedSurface.id}/${resolution.id}`,
  );
  assert.equal(observation.surface, expectedSurface.id);
  assert.equal(observation.id, resolution.id);
  assert.equal(observation.width, resolution.width);
  assert.equal(observation.height, resolution.height);
  assert.deepEqual(observation.safeArea, {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  });
  assert.equal(observation.documentReadyState, "complete");
  assert.equal(observation.criticalTextCount, expectedSurface.criticalTextCount);
  assert.equal(
    observation.criticalTextInsideSafeArea,
    expectedSurface.criticalTextCount,
  );
  assert.ok(finite(observation.minimumCriticalTextCssPx, "minimum text") >= 24);
  assert.equal(observation.criticalTextOverlapCount, 0);
  assert.equal(observation.actionTargetCount, expectedSurface.actionTargetCount);
  assert.ok(finite(observation.minimumActionTargetWidthCssPx, "minimum width") >= 48);
  assert.ok(finite(observation.minimumActionTargetHeightCssPx, "minimum height") >= 48);
  assert.equal(observation.sectionOverlapCount, 0);
  assert.deepEqual(observation.rootOverflowCssPx, {
    horizontal: 0,
    vertical: 0,
  });
  assert.deepEqual(observation.focusTrace, expectedSurface.focusTrace);
  assert.deepEqual(
    {
      minimumCriticalTextCssPx: observation.minimumCriticalTextCssPx,
      minimumActionTargetWidthCssPx:
        observation.minimumActionTargetWidthCssPx,
      minimumActionTargetHeightCssPx:
        observation.minimumActionTargetHeightCssPx,
    },
    EXPECTED_MEASUREMENTS[observationKey(observation)],
  );
  await validateScreenshot(observation);
}

export async function validateLauncherTvSurfaceEvidence(
  artifactFile = defaultArtifactPath,
) {
  const bytes = await readFile(artifactFile);
  assert.ok(bytes.length <= MAX_ARTIFACT_BYTES);
  const artifact = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bytes.toString("utf8"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "artifact must use canonical pretty JSON without duplicate or reordered keys",
  );
  exactKeys(
    artifact,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "baseLauncherHomeEvidence",
      "environment",
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
  assert.equal(artifact.format, LAUNCHER_TV_SURFACE_EVIDENCE_FORMAT);
  assert.equal(artifact.evidenceDate, launcherBaselines.surfaces.observation.evidenceDate);
  assert.equal(
    artifact.evidenceClass,
    "windows-x64-headless-chrome-launcher-representative-surfaces-tv-conformance",
  );
  assert.equal(
    artifact.qualification,
    "candidate-three-launcher-states-only-not-tv-target-or-game-qualification",
  );
  assert.match(
    artifact.retrievedAtUtc,
    new RegExp(`^${launcherBaselines.surfaces.observation.evidenceDate}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`, "u"),
  );

  exactKeys(
    artifact.baseLauncherHomeEvidence,
    ["format", "sha256"],
    "baseLauncherHomeEvidence",
  );
  assert.equal(
    artifact.baseLauncherHomeEvidence.format,
    "vcg-launcher-home-tv-conformance-evidence/v1",
  );
  assert.equal(
    artifact.baseLauncherHomeEvidence.sha256,
    sha256(await readFile(homeEvidencePath)),
  );

  assert.deepEqual(artifact.environment, {
    buildMode: "lab",
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: launcherBaselines.surfaces.observation.environment.nodeVersion,
    browserProduct: launcherBaselines.surfaces.observation.environment.browserProduct,
    devicePixelRatio: 1,
    browserClock: "2026-07-24T19:00:00-07:00",
  });
  assert.deepEqual(artifact.contract, {
    surfaces: EXPECTED_SURFACES,
    safeInsetPercent: 5,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetCssPx: 48,
    resolutions: TV_CONFORMANCE_RESOLUTIONS,
  });

  exactKeys(
    artifact.browser,
    [
      "browserProduct",
      "observations",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "requestCounts",
    ],
    "browser",
  );
  assert.equal(artifact.browser.browserProduct, launcherBaselines.surfaces.observation.environment.browserProduct);
  assert.equal(artifact.browser.observations.length, 9);
  let observationIndex = 0;
  for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
    for (const surface of EXPECTED_SURFACES) {
      await validateObservation(
        artifact.browser.observations[observationIndex],
        surface,
        resolution,
      );
      observationIndex += 1;
    }
  }
  assert.equal(artifact.browser.consoleErrorCount, 0);
  assert.equal(artifact.browser.pageErrorCount, 0);
  assert.equal(artifact.browser.requestFailureCount, 0);
  validateRequests(artifact.browser.requestCounts);

  assert.deepEqual(artifact.disposition, {
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
  });
  assert.deepEqual(artifact.summary, {
    resolutionCount: 3,
    launcherStateCount: 3,
    observationCount: 9,
    screenshotCount: 9,
    physicalTelevisionCount: 0,
    physicalControllerCount: 0,
    participantCount: 0,
    catalogGameCount: 0,
    targetHardwareCount: 0,
  });
  await validateProvenance(artifact.provenance);
  assert.equal(artifact.claimBoundary, LAUNCHER_TV_SURFACE_CLAIM_BOUNDARY);
  assert.deepEqual(artifact.limitations, LAUNCHER_TV_SURFACE_LIMITATIONS);
  return artifact;
}

async function main() {
  const artifact = await validateLauncherTvSurfaceEvidence(
    process.argv[2] ? resolve(process.argv[2]) : defaultArtifactPath,
  );
  console.log(
    `validated representative launcher TV evidence; states=${artifact.summary.launcherStateCount}; observations=${artifact.summary.observationCount}; physicalTVs=${artifact.summary.physicalTelevisionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
