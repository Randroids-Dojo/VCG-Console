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
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";
import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";

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
    criticalTextCount: 24,
    actionTargetCount: 13,
    focusTrace: ["motion-first-entry", "launcher-home"],
  },
  {
    id: "wifi-offline",
    criticalTextCount: 23,
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

const EXPECTED_SCREENSHOTS = Object.freeze({
  "motion-catalog/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-720p.png",
    bytes: 159596,
    sha256: "3e59a409c553ca3d5b2c786cbd776d344e39bb06016abe00876fa14d20dc54c9",
  },
  "wifi-offline/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-720p.png",
    bytes: 158409,
    sha256: "16429aa0317e4e52eb55ee75846489938efe5c7d5b6a9d166868d15fede49ce9",
  },
  "launch-offline/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-720p.png",
    bytes: 162390,
    sha256: "bfb07926c1617a95c5dc9c1e432b7f3d3366b8deb6e9e524582d7a62681b3981",
  },
  "motion-catalog/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-1080p.png",
    bytes: 244646,
    sha256: "d1dd7fdc603a476fae056c577928c5ed88cc6e1b7c08999cd7a52229e5e35645",
  },
  "wifi-offline/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-1080p.png",
    bytes: 238357,
    sha256: "cf042f3445dc05c62b421c17542e291ebdded407d57989cd944df7e818c702fe",
  },
  "launch-offline/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-1080p.png",
    bytes: 256542,
    sha256: "f059c0130d8e399e35f679315b24eae4d6a543042bac135f4f380e13d3249e1c",
  },
  "motion-catalog/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-4k.png",
    bytes: 617270,
    sha256: "e16f9ec60d3d3f65b9eb32ddb23504a9b07b4322ddda2350c54ec032552e5db6",
  },
  "wifi-offline/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-4k.png",
    bytes: 635436,
    sha256: "95282a1e1769a255d6543be1b8c97d0cff4bc6d1dd15909fa2e739df14209d81",
  },
  "launch-offline/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-4k.png",
    bytes: 661167,
    sha256: "38520115721cdc6b0525e34c215d4e3d2aedc0ec8d0d17d4e649b321bef0d4d3",
  },
});
const EXPECTED_MEASUREMENTS = Object.freeze({
  "motion-catalog/720p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 125.813,
    minimumActionTargetHeightCssPx: 48,
  },
  "wifi-offline/720p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 125.813,
    minimumActionTargetHeightCssPx: 48,
  },
  "launch-offline/720p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 156.594,
    minimumActionTargetHeightCssPx: 48,
  },
  "motion-catalog/1080p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 125.813,
    minimumActionTargetHeightCssPx: 48,
  },
  "wifi-offline/1080p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 125.813,
    minimumActionTargetHeightCssPx: 48,
  },
  "launch-offline/1080p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 172.609,
    minimumActionTargetHeightCssPx: 48,
  },
  "motion-catalog/4k": {
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 211.609,
    minimumActionTargetHeightCssPx: 60,
  },
  "wifi-offline/4k": {
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 190,
    minimumActionTargetHeightCssPx: 60,
  },
  "launch-offline/4k": {
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 243.281,
    minimumActionTargetHeightCssPx: 62,
  },
});

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

function exactKeys(value, expected, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} keys changed`);
}

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
  assert.equal(entries.length, 8);
  assert.equal(requestCounts["/"], 9);
  assert.equal(requestCounts["/fonts/OCRA.ttf"], 9);
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
  assert.equal(artifact.evidenceDate, TV_CONFORMANCE_EVIDENCE_DATE);
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
    new RegExp(`^${TV_CONFORMANCE_EVIDENCE_DATE}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`, "u"),
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
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: GODOT_EXPORT_NODE_VERSION,
    browserProduct: GODOT_EXPORT_BROWSER_PRODUCT,
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
  assert.equal(artifact.browser.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
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
