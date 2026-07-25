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
  LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY,
  LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT,
  LAUNCHER_SEARCH_TV_LIMITATIONS,
} from "./generate-launcher-search-tv-evidence.mjs";
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
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
);
const representativeEvidencePath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 80 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const EXPECTED_STATES = Object.freeze([
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

const EXPECTED_SCREENSHOTS = Object.freeze({
  "motion-results/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-720p.png",
    bytes: 87298,
    sha256: "d6205d9f2ce3e1c8244c8202e16dcccec410d6fcf9b04d66e80cd4fa94527121",
  },
  "no-results/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-720p.png",
    bytes: 60495,
    sha256: "842330707cdfb1440e5d68425f839a9789fc99d0907d9dddd131504e22eefa3e",
  },
  "motion-results/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-1080p.png",
    bytes: 105671,
    sha256: "bc88fc38e70ec9c927961df3ce3479b69a4fb29da5790ace10c41179a5dfbc57",
  },
  "no-results/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-1080p.png",
    bytes: 77671,
    sha256: "bd2e1a90aa81e815404132dbedfbcffe598bb6eb5018e114d69365b38bf034ad",
  },
  "motion-results/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-4k.png",
    bytes: 256838,
    sha256: "73726fe4531dd85be98216c8aafb25f3143b7a8b9d4be9b3248b300dcbccfc7f",
  },
  "no-results/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-4k.png",
    bytes: 191868,
    sha256: "c3b1565a03946923f64424e06d6bb3f94580f99559c821e145900f76d2edb342",
  },
});
const EXPECTED_MEASUREMENTS = Object.freeze({
  "motion-results/720p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 687.766,
    minimumActionTargetHeightCssPx: 48,
  },
  "no-results/720p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 687.766,
    minimumActionTargetHeightCssPx: 48,
  },
  "motion-results/1080p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 951.328,
    minimumActionTargetHeightCssPx: 48,
  },
  "no-results/1080p": {
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 951.328,
    minimumActionTargetHeightCssPx: 48,
  },
  "motion-results/4k": {
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1936.656,
    minimumActionTargetHeightCssPx: 61,
  },
  "no-results/4k": {
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1936.656,
    minimumActionTargetHeightCssPx: 62,
  },
});
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  searchPath: "apps/console-lab/src/launcher/SearchOverlay.svelte",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  representativeEvidencePath:
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-search-tv-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-search-tv-evidence.mjs",
});

function exactKeys(value, expected, label) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} keys changed`);
}

function finite(value, label) {
  assert.equal(typeof value, "number", `${label} must be numeric`);
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function observationKey(observation) {
  return `${observation.state}/${observation.id}`;
}

async function validateScreenshot(observation) {
  const expected = EXPECTED_SCREENSHOTS[observationKey(observation)];
  assert.ok(expected, `no frozen screenshot for ${observationKey(observation)}`);
  assert.deepEqual(observation.screenshot, expected);
  const absolute = resolve(root, observation.screenshot.path);
  assert.equal(
    absolute.startsWith(resolve(root, "benchmarks/tv-conformance")),
    true,
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
  assert.equal(requestCounts["/"], 6);
  assert.equal(requestCounts["/fonts/OCRA.ttf"], 6);
  const assets = entries.filter(([path]) => path.startsWith("/assets/"));
  assert.equal(assets.length, 6);
  assert.equal(assets.filter(([path]) => path.endsWith(".css")).length, 1);
  assert.equal(assets.filter(([path]) => path.endsWith(".js")).length, 5);
  for (const [path, count] of assets) {
    assert.match(path, /^\/assets\/[A-Za-z0-9_-]+\.(?:css|js)$/u);
    assert.equal(count, 6);
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

async function validateObservation(observation, expectedState, resolution) {
  exactKeys(
    observation,
    [
      "state",
      "id",
      "width",
      "height",
      "query",
      "safeArea",
      "documentReadyState",
      "resultCount",
      "emptyStateVisible",
      "criticalTextCount",
      "criticalTextInsideSafeArea",
      "minimumCriticalTextCssPx",
      "criticalTextOverlapCount",
      "actionTargetCount",
      "minimumActionTargetWidthCssPx",
      "minimumActionTargetHeightCssPx",
      "overlayOverflowCssPx",
      "focusTrace",
      "screenshot",
    ],
    `observation ${expectedState.id}/${resolution.id}`,
  );
  assert.equal(observation.state, expectedState.id);
  assert.equal(observation.id, resolution.id);
  assert.equal(observation.width, resolution.width);
  assert.equal(observation.height, resolution.height);
  assert.equal(observation.query, expectedState.query);
  assert.deepEqual(observation.safeArea, {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  });
  assert.equal(observation.documentReadyState, "complete");
  assert.equal(observation.resultCount, expectedState.resultCount);
  assert.equal(observation.emptyStateVisible, expectedState.resultCount === 0);
  assert.equal(observation.criticalTextCount, expectedState.criticalTextCount);
  assert.equal(
    observation.criticalTextInsideSafeArea,
    expectedState.criticalTextCount,
  );
  assert.ok(finite(observation.minimumCriticalTextCssPx, "minimum text") >= 24);
  assert.equal(observation.criticalTextOverlapCount, 0);
  assert.equal(observation.actionTargetCount, expectedState.actionTargetCount);
  assert.ok(finite(observation.minimumActionTargetWidthCssPx, "minimum width") >= 48);
  assert.ok(finite(observation.minimumActionTargetHeightCssPx, "minimum height") >= 48);
  assert.deepEqual(observation.overlayOverflowCssPx, {
    horizontal: 0,
    vertical: 0,
  });
  assert.deepEqual(observation.focusTrace, expectedState.focusTrace);
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

export async function validateLauncherSearchTvEvidence(
  artifactFile = defaultArtifactPath,
) {
  const bytes = await readFile(artifactFile);
  assert.ok(bytes.length <= MAX_ARTIFACT_BYTES);
  const artifact = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bytes.toString("utf8"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "artifact must use canonical pretty JSON",
  );
  exactKeys(
    artifact,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "baseRepresentativeEvidence",
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
  assert.equal(artifact.format, LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT);
  assert.equal(artifact.evidenceDate, TV_CONFORMANCE_EVIDENCE_DATE);
  assert.equal(
    artifact.evidenceClass,
    "windows-x64-headless-chrome-launcher-search-tv-conformance",
  );
  assert.equal(
    artifact.qualification,
    "candidate-two-search-states-only-not-tv-target-or-catalog-qualification",
  );
  assert.match(
    artifact.retrievedAtUtc,
    new RegExp(`^${TV_CONFORMANCE_EVIDENCE_DATE}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`, "u"),
  );
  assert.deepEqual(artifact.baseRepresentativeEvidence, {
    format:
      "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1",
    sha256: sha256(await readFile(representativeEvidencePath)),
  });
  assert.deepEqual(artifact.environment, {
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: GODOT_EXPORT_NODE_VERSION,
    browserProduct: GODOT_EXPORT_BROWSER_PRODUCT,
    devicePixelRatio: 1,
    browserClock: "2026-07-24T19:00:00-07:00",
  });
  assert.deepEqual(artifact.contract, {
    states: EXPECTED_STATES,
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
  assert.equal(artifact.browser.observations.length, 6);
  let observationIndex = 0;
  for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
    for (const state of EXPECTED_STATES) {
      await validateObservation(
        artifact.browser.observations[observationIndex],
        state,
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
  });
  assert.deepEqual(artifact.summary, {
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
  });
  await validateProvenance(artifact.provenance);
  assert.equal(artifact.claimBoundary, LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY);
  assert.deepEqual(artifact.limitations, LAUNCHER_SEARCH_TV_LIMITATIONS);
  return artifact;
}

async function main() {
  const artifact = await validateLauncherSearchTvEvidence(
    process.argv[2] ? resolve(process.argv[2]) : defaultArtifactPath,
  );
  console.log(
    `validated launcher Search TV evidence; states=${artifact.summary.searchStateCount}; observations=${artifact.summary.observationCount}; physicalTVs=${artifact.summary.physicalTelevisionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
