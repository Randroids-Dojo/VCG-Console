import { LAUNCHER_SEARCH_STATES as EXPECTED_STATES } from "./launcher-tv-scenarios.mjs";
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
  LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY,
  LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT,
  LAUNCHER_SEARCH_TV_LIMITATIONS,
} from "./generate-launcher-search-tv-evidence.mjs";
import {
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-installed-chrome-launcher-search-tv-conformance-v1.json",
);
const representativeEvidencePath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-installed-chrome-launcher-representative-surfaces-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 80 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const EXPECTED_SCREENSHOTS = launcherBaselines.search.screenshots;
const EXPECTED_MEASUREMENTS = launcherBaselines.search.measurements;
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  searchPath: "apps/console-lab/src/launcher/SearchOverlay.svelte",
  unassignedViewPath:
    "apps/console-lab/src/launcher/UnassignedProgressView.svelte",
  unassignedControllerPath:
    "apps/console-lab/src/launcher/unassigned-progress.ts",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  representativeEvidencePath:
    "benchmarks/tv-conformance/windows-x64-installed-chrome-launcher-representative-surfaces-tv-conformance-v1.json",
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-search-tv-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-search-tv-evidence.mjs",
});

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
  assert.equal(entries.length, 9);
  assert.equal(requestCounts["/"], 24);
  assert.equal(requestCounts["/fonts/OCRA.ttf"], 24);
  assert.equal(requestCounts["/fonts/InterVariable.woff2"], 24);
  const assets = entries.filter(([path]) => path.startsWith("/assets/"));
  assert.equal(assets.length, 6);
  assert.equal(assets.filter(([path]) => path.endsWith(".css")).length, 1);
  assert.equal(assets.filter(([path]) => path.endsWith(".js")).length, 5);
  for (const [path, count] of assets) {
    assert.match(path, /^\/assets\/[A-Za-z0-9_-]+\.(?:css|js)$/u);
    assert.equal(count, 24);
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
      "measuredCriticalTextCount",
      "criticalTextInsideSafeArea",
      "minimumCriticalTextCssPx",
      "criticalTextOverlapCount",
      "actionTargetCount",
      "minimumActionTargetWidthCssPx",
      "minimumActionTargetHeightCssPx",
      "overlayOverflowCssPx",
      "resultsScroll",
      "interactionTrace",
      "activation",
      "recovery",
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
  assert.ok(observation.measuredCriticalTextCount > 0);
  assert.ok(
    observation.measuredCriticalTextCount <= observation.criticalTextCount,
  );
  assert.equal(
    observation.criticalTextInsideSafeArea,
    observation.measuredCriticalTextCount,
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
  exactKeys(
    observation.resultsScroll,
    [
      "clientHeightCssPx",
      "scrollHeightCssPx",
      "initialScrollTopCssPx",
      "finalScrollTopCssPx",
      "maximumScrollTopCssPx",
      "lastResultInsideViewportAfterFocus",
    ],
    `resultsScroll ${expectedState.id}/${resolution.id}`,
  );
  for (const key of [
    "clientHeightCssPx",
    "scrollHeightCssPx",
    "initialScrollTopCssPx",
    "finalScrollTopCssPx",
    "maximumScrollTopCssPx",
  ]) {
    assert.ok(
      finite(observation.resultsScroll[key], `resultsScroll ${key}`) >= 0,
    );
  }
  assert.equal(
    observation.resultsScroll.maximumScrollTopCssPx,
    observation.resultsScroll.scrollHeightCssPx
      - observation.resultsScroll.clientHeightCssPx,
  );
  assert.equal(observation.resultsScroll.initialScrollTopCssPx, 0);
  const scrollingExpected =
    expectedState.scrollingExpectedResolutionIds.includes(resolution.id);
  if (expectedState.id === "empty-query-scroll-activation") {
    assert.equal(
      observation.resultsScroll.lastResultInsideViewportAfterFocus,
      true,
    );
    if (scrollingExpected) {
      assert.ok(
        observation.resultsScroll.scrollHeightCssPx
          > observation.resultsScroll.clientHeightCssPx,
      );
      assert.ok(observation.resultsScroll.finalScrollTopCssPx > 0);
    } else {
      assert.equal(
        observation.resultsScroll.scrollHeightCssPx,
        observation.resultsScroll.clientHeightCssPx,
      );
      assert.equal(observation.resultsScroll.finalScrollTopCssPx, 0);
    }
  } else {
    assert.equal(
      observation.resultsScroll.lastResultInsideViewportAfterFocus,
      null,
    );
    assert.equal(observation.resultsScroll.finalScrollTopCssPx, 0);
  }
  assert.deepEqual(
    observation.interactionTrace,
    expectedState.interactionTrace,
  );
  if (expectedState.activation === null) {
    assert.equal(observation.activation, null);
  } else {
    const remoteExpectation =
      expectedState.activation.remoteWebExpectation;
    const remoteWebEvidence = remoteExpectation === null
      ? null
      : {
          statusLabel: remoteExpectation.statusLabel,
          statusVisible: true,
          originLabel: remoteExpectation.originLabel,
          originVisible: true,
          actionLabel: remoteExpectation.actionLabel,
          actionVisible: true,
          failureMessage: remoteExpectation.failureMessage,
          failureMessageVisible:
            remoteExpectation.failureMessage === null ? null : true,
          retryAvailable: remoteExpectation.retryAvailable,
          denialKind: remoteExpectation.denial?.kind ?? null,
          denialObserved: remoteExpectation.denial !== null,
          denialMessage: remoteExpectation.denial?.message ?? null,
          launchRetainedAfterDenial:
            remoteExpectation.denial?.launchRetained ?? null,
        };
    const unavailableExpectation =
      expectedState.activation.unavailableExpectation;
    const unavailableEvidence = unavailableExpectation === null
      ? null
      : {
          statusLabel: unavailableExpectation.statusLabel,
          statusVisible: true,
          detail: unavailableExpectation.detail,
          detailVisible: true,
          diagnosticCode: unavailableExpectation.diagnosticCode,
          diagnosticVisible: true,
          retryAvailable: unavailableExpectation.retryAvailable,
        };
    const destructiveExpectation =
      expectedState.activation.destructiveExpectation;
    const destructiveEvidence = destructiveExpectation === null
      ? null
      : {
          selectedEntryTitle: destructiveExpectation.selectedEntryTitle,
          entryCountBeforeDenial: 4,
          actionLabel: destructiveExpectation.actionLabel,
          dialogLabel: destructiveExpectation.dialogLabel,
          warning: destructiveExpectation.warning,
          warningVisible: true,
          prototypeBoundary: destructiveExpectation.prototypeBoundary,
          prototypeBoundaryVisible: true,
          safeDefaultLabel: destructiveExpectation.safeDefaultLabel,
          safeDefaultInitiallyFocused:
            destructiveExpectation.safeDefaultInitiallyFocused,
          denialKind: destructiveExpectation.denialKind,
          confirmationDismissed:
            destructiveExpectation.confirmationDismissed,
          entryRetainedAfterDenial:
            destructiveExpectation.entryRetainedAfterDenial,
          entryCountAfterDenial: 4,
          denialRecoveryFocus:
            destructiveExpectation.denialRecoveryFocus,
        };
    assert.deepEqual(observation.activation, {
      resultTitle: expectedState.activation.resultTitle,
      method: expectedState.activation.method,
      searchOverlayHidden: true,
      outcomeKind: expectedState.activation.outcomeKind,
      outcomeLabel: expectedState.activation.outcomeLabel,
      outcomeVisible: true,
      adapter: expectedState.activation.expectedAdapter,
      networkOnlineAtActivation:
        expectedState.activation.expectedNetworkOnline,
      remoteWebEvidence,
      unavailableEvidence,
      destructiveEvidence,
      backRecoveryVerified: true,
      backRecoveryFocus: expectedState.activation.backRecoveryFocus,
    });
  }
  const recoveryExpectation = expectedState.recoveryExpectation ?? null;
  if (recoveryExpectation === null) {
    assert.equal(observation.recovery, null);
  } else {
    assert.deepEqual(observation.recovery, {
      clearActionLabel: recoveryExpectation.clearActionLabel,
      clearActionFocused: true,
      clearQuery: recoveryExpectation.clearQuery,
      clearResultCount: recoveryExpectation.clearResultCount,
      clearInputFocused: true,
      categoryActionLabel: recoveryExpectation.categoryActionLabel,
      categoryActionFocused: true,
      categoryQuery: recoveryExpectation.categoryQuery,
      categoryResultCount: recoveryExpectation.categoryResultCount,
      categoryFirstResultTitle:
        recoveryExpectation.categoryFirstResultTitle,
      categoryFirstResultFocused: true,
      backRecoveryVerified: true,
      backRecoveryFocus: recoveryExpectation.backRecoveryFocus,
    });
  }
  assert.deepEqual(
    {
      measuredCriticalTextCount: observation.measuredCriticalTextCount,
      minimumCriticalTextCssPx: observation.minimumCriticalTextCssPx,
      minimumActionTargetWidthCssPx:
        observation.minimumActionTargetWidthCssPx,
      minimumActionTargetHeightCssPx:
        observation.minimumActionTargetHeightCssPx,
      resultsScroll: observation.resultsScroll,
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
  assert.equal(artifact.evidenceDate, launcherBaselines.search.observation.evidenceDate);
  assert.equal(
    artifact.evidenceClass,
    "windows-x64-headless-chrome-launcher-search-tv-conformance",
  );
  assert.equal(
    artifact.qualification,
    "candidate-eight-search-states-with-local-no-result-recovery-and-five-activation-classes-with-remote-unavailable-and-destructive-failure-denial-only-not-tv-target-or-catalog-qualification",
  );
  assert.match(
    artifact.retrievedAtUtc,
    new RegExp(`^${launcherBaselines.search.observation.evidenceDate}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`, "u"),
  );
  assert.deepEqual(artifact.baseRepresentativeEvidence, {
    format:
      "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1",
    sha256: sha256(await readFile(representativeEvidencePath)),
  });
  assert.deepEqual(artifact.environment, {
    buildMode: "lab",
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: launcherBaselines.search.observation.environment.nodeVersion,
    browserProduct: launcherBaselines.search.observation.environment.browserProduct,
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
  assert.equal(artifact.browser.browserProduct, launcherBaselines.search.observation.environment.browserProduct);
  assert.equal(artifact.browser.observations.length, 24);
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
    scrollingResultsVerified: true,
    noResultRecoveryVerified: true,
    resultActivationVerified: true,
    remoteWebActivationVerified: true,
    remoteWebOfflineFailureVerified: true,
    externalOriginDisclosureVerified: true,
    blockedPreviewDenialVerified: true,
    unavailablePackageDenialVerified: true,
    destructiveSettingsDenialVerified: true,
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
    searchStateCount: 8,
    observationCount: 24,
    screenshotCount: 24,
    distinctQueryCount: 7,
    activatedResultClassCount: 5,
    remoteWebOutcomeStateCount: 2,
    unavailableOutcomeStateCount: 1,
    destructiveOutcomeStateCount: 1,
    recoveryStateCount: 1,
    failureOutcomeStateCount: 2,
    denialOutcomeStateCount: 3,
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
