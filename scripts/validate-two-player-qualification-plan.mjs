import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/two-player/two-player-qualification-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const TWO_PLAYER_FORMAT = "vcg-two-player-qualification-plan/v1";
export const TWO_PLAYER_PERSONA_PAIRS = Object.freeze([
  "child-p1-child-p2",
  "child-p1-adult-p2",
  "adult-p1-child-p2",
  "adult-p1-adult-p2",
]);
export const TWO_PLAYER_PLACEMENTS = Object.freeze([
  "side-by-side-center",
  "side-by-side-left",
  "side-by-side-right",
  "opposite-lateral-edges",
  "near-far-depth-split",
]);
export const TWO_PLAYER_IDENTITY_SCENARIOS = Object.freeze([
  "side-by-side-static",
  "swap-lateral-positions",
  "cross-center-opposite-directions",
  "depth-order-exchange",
  "p1-front-partial-occlusion",
  "p2-front-partial-occlusion",
  "p1-crouch-behind-p2",
  "p2-crouch-behind-p1",
  "synchronized-same-motion",
  "opposing-motion",
  "p1-exit-and-reenter",
  "p2-exit-and-reenter",
]);
export const TWO_PLAYER_ACTION_SCENARIOS = Object.freeze([
  "p1-dodge-left",
  "p1-dodge-right",
  "p1-duck",
  "p1-jump",
  "p2-dodge-left",
  "p2-dodge-right",
  "p2-duck",
  "p2-jump",
  "simultaneous-jump",
  "simultaneous-duck",
  "p1-jump-p2-duck",
  "p1-duck-p2-jump",
  "opposing-dodge-inward",
  "opposing-dodge-outward",
]);
export const TWO_PLAYER_SESSION_SCENARIOS = Object.freeze([
  "sequential-join-p1-then-p2",
  "simultaneous-join-attempt-remains-sequential",
  "independent-calibration-p1",
  "independent-calibration-p2",
  "launcher-initial-p1-owner",
  "p1-pause-owns-overlay",
  "p2-pause-owns-overlay",
  "equal-update-pause-lower-slot-wins",
  "earlier-p2-pause-completion-wins",
  "overlay-nonowner-input-blocked",
  "pause-exit-transfers-launcher-owner",
  "p1-loss-freezes-entire-game",
  "p2-loss-freezes-entire-game",
  "both-loss-freezes-entire-game",
  "all-original-tracks-silent-reacquire",
  "wrong-track-cannot-silent-reacquire",
  "expired-reacquisition-opens-recovery",
  "full-roster-deliberate-resume",
  "explicit-nonempty-roster-reduction",
  "p1-leave-and-fresh-reentry",
  "p2-leave-and-fresh-reentry",
  "tracker-restart-hard-freeze",
  "camera-disconnect-hard-freeze",
  "time-regression-fails-closed",
]);
export const TWO_PLAYER_ACCESSIBLE_TASKS = Object.freeze([
  "identify-own-number-pattern-outline",
  "identify-other-player-number-pattern-outline",
  "join-as-player-one",
  "join-as-player-two",
  "identify-launcher-owner",
  "identify-pause-overlay-owner",
  "recover-original-two-player-roster",
  "choose-explicit-roster-reduction-or-exit",
]);
export const TWO_PLAYER_BLOCKERS = Object.freeze([
  "complete-one-player-result-and-all-required-cell-closure",
  "selected-prototype-target-build-camera-capture-calibration-and-tracker",
  "measured-room-safe-two-player-subzones-and-placement-fixtures",
  "ordered-child-adult-participant-pairs-consent-assent-and-comprehension",
  "independent-identity-action-freeze-menu-and-clock-oracles",
  "accessible-number-pattern-outline-and-instruction-protocol",
  "console-shell-and-obstacle-runtime-freeze-state-integrity-adapters",
  "participant-identity-performance-resource-and-recovery-gates",
  "data-handling-deletion-schedule-instruments-and-operators",
  "room-participant-camera-runtime-and-collection-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "prerequisiteGate",
  "authorityBoundary", "identityBoundary", "matrices", "measurements",
  "acceptance", "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["multiplayer-decision-boundary", "docs/DECISIONS.md"],
  ["player-session-state-machine-boundary", "docs/PLAYER_SESSION_STATE_MACHINE.md"],
  ["blocking-persona-boundary", "docs/PLAYER_PERSONAS.md"],
  ["prototype-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["one-two-player-room-boundary", "docs/LIVING_ROOM_PLAY_ZONE_SURVEY_PLAN_2026-07-25.md"],
  ["one-player-prerequisite-plan", "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json"],
  ["synthetic-identity-evidence-boundary", "benchmarks/identity-tracking/windows-x64-synthetic-appearance-free-v1.json"],
  ["synthetic-session-interference-boundary", "benchmarks/player-session-interference/camera-free-authority-rehearsal-v1.json"],
  ["session-controller-implementation", "apps/console-lab/src/player-session.ts"],
  ["session-adversarial-rehearsal", "apps/console-lab/src/player-session-adversarial.ts"],
];
const prerequisiteKeys = [
  "completeOnePlayerResultSha256",
  "onePlayerQualifiedTargetConfigurationSha256",
  "onePlayerQualifiedCameraAndCapturePolicySha256",
  "onePlayerQualifiedRoomAndPlayZoneSha256",
  "onePlayerQualifiedPersonaAndPlacementSetSha256",
  "onePlayerQualifiedTrackerConfigurationSha256",
  "everyRequiredOnePlayerCellPassed",
  "onePlayerResultMayBeReplacedBySyntheticOrAggregateEvidence",
  "twoPlayerCollectionMayBeginBeforePrerequisiteClosure",
];
const authorityKeys = [
  "selectedPrototypeTargetConfigurationSha256",
  "cleanBuildAndRuntimeTupleSha256",
  "selectedTwoPlayerTrackerConfigurationSha256",
  "cameraCaptureCalibrationAndTimestampProtocolSha256",
  "measuredRoomAndTwoPlayerSubzoneResultSha256",
  "orderedParticipantPairCohortProtocolSha256",
  "consentAssentAndComprehensionProtocolSha256",
  "independentIdentityActionAndFreezeOracleSha256",
  "accessibleOutlineAndInstructionProtocolSha256",
  "runtimeFreezeAndStateIntegrityAdapterSha256",
  "resourceTelemetryAndClockProtocolSha256",
  "dataHandlingAndDeletionProtocolSha256",
  "scheduleAndOperatorProtocolSha256",
  "roomAccessAuthorized",
  "adultParticipationAuthorized",
  "childParticipationAuthorized",
  "cameraCollectionAuthorized",
  "runtimeMutationAuthorized",
  "productOrFourPlayerAuthorityGranted",
];
const openAcceptanceKeys = [
  "minimumParticipantPairsPerOrderedClass",
  "minimumPerPlayerPoseFpsMilliHz",
  "minimumPerPlayerCore17CoveragePpm",
  "maximumPerPlayerJitterMilliTorso",
  "maximumIdentityFragmentationsPerTrial",
  "maximumSequentialJoinAndCalibrationMs",
  "minimumAccessibleIdentityComprehensionPpm",
  "maximumOrdinaryLossConfirmationUs",
  "maximumRecoveryOverlayReadyUs",
  "pauseOwnershipLockoutMs",
  "maximumCpuUtilizationPpm",
  "maximumGpuUtilizationPpm",
  "maximumResidentMemoryBytes",
  "maximumWallPowerMw",
  "maximumTemperatureMilliC",
  "minimumGameFrameRateMilliHz",
  "maximumGameFrameTimeP95Us",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  assert.ok(!text.startsWith("\uFEFF"), `${label} must not contain a UTF-8 BOM`);
  assert.ok(!/\r(?!\n)/u.test(text), `${label} contains a bare carriage return`);
  return text.replaceAll("\r\n", "\n");
}

function normalizedSha256(bytes, label) {
  return createHash("sha256")
    .update(Buffer.from(normalizedText(bytes, label), "utf8"))
    .digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length, "source binding count drifted");
  for (const [index, [role, path]] of sourceDefinitions.entries()) {
    const binding = bindings[index];
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], [role, path], `sourceBindings[${index}] identity drifted`);
    assert.match(binding.sha256, SHA256, `sourceBindings[${index}].sha256 is invalid`);
    assert.equal(isAbsolute(path), false, "source path must be relative");
    const absolute = resolve(repositoryRoot, path);
    assert.ok(!relative(repositoryRoot, absolute).startsWith(".."), "source path escaped repository");
    assert.equal(
      normalizedSha256(await readFile(absolute), path),
      binding.sha256,
      `${path} digest drifted`,
    );
  }
}

export async function validateTwoPlayerQualificationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, TWO_PLAYER_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "two-player-qualification-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-054"]);
  for (const phrase of [
    "Strict zero-result", "after the complete one-player gate", "No target",
    "Synthetic session and identity evidence cannot qualify", "four-player authority",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.prerequisiteGate, prerequisiteKeys, "prerequisiteGate");
  for (const key of prerequisiteKeys.slice(0, 6)) {
    assert.equal(plan.prerequisiteGate[key], null, `prerequisiteGate.${key} must remain null`);
  }
  for (const key of prerequisiteKeys.slice(6)) {
    assert.equal(plan.prerequisiteGate[key], false, `prerequisiteGate.${key} must remain false`);
  }

  exactKeys(plan.authorityBoundary, authorityKeys, "authorityBoundary");
  for (const key of authorityKeys.slice(0, 13)) {
    assert.equal(plan.authorityBoundary[key], null, `authorityBoundary.${key} must remain null`);
  }
  for (const key of authorityKeys.slice(13)) {
    assert.equal(plan.authorityBoundary[key], false, `authorityBoundary.${key} must remain false`);
  }

  assert.deepEqual(plan.identityBoundary, {
    trackerIdsAreOpaqueSessionLocalContinuityEvidence: true,
    trackerIdsMayIdentifyAuthenticateOrReassociateProfiles: false,
    numberPatternShapeAndColorAreRequiredTogether: true,
    colorAloneMayDistinguishPlayers: false,
    playerOneJoinsAndCalibratesBeforePlayerTwo: true,
    eachPlayerCalibrationIsIndependent: true,
    crossingOcclusionExitAndReentryRequireIndependentGroundTruth: true,
    automaticBodyOrFaceIdentityMatchingIsOutsideCampaignAuthority: true,
    syntheticTrackLabelsMayQualifyRealIdentityContinuity: false,
    identityFailureMayBeHiddenByActionOrAggregateSuccess: false,
  });

  exactKeys(plan.matrices, [
    "targetPolicy", "orderedPersonaPairClasses", "placementPairIds",
    "identityScenarioIds", "independentActionScenarioIds", "sessionScenarioIds",
    "accessibleIdentityTaskIds", "requiredRuntimeSurfaces", "validTrialsPerCell",
    "identityCellCount", "identityTrialCount", "actionCellCount", "actionTrialCount",
    "sessionCellCount", "sessionCycleCount", "accessibleIdentityCellCount",
    "accessibleIdentityTrialCount", "runtimeSoakCellCount", "runtimeSoakDurationMs",
    "runtimeSoakCount", "everyOrderedPairPlacementScenarioAndRuntimeCellMustPass",
    "pairPlacementScenarioRuntimeOrBestCaseAggregateMayRescueFailure",
  ], "matrices");
  assert.deepEqual(plan.matrices.targetPolicy, {
    requiredTargetCount: 1,
    targetRole: "one-player-qualified-selected-prototype",
    substituteTargetMayRescueFailure: false,
  });
  assert.deepEqual(plan.matrices.orderedPersonaPairClasses, [...TWO_PLAYER_PERSONA_PAIRS]);
  assert.deepEqual(plan.matrices.placementPairIds, [...TWO_PLAYER_PLACEMENTS]);
  assert.deepEqual(plan.matrices.identityScenarioIds, [...TWO_PLAYER_IDENTITY_SCENARIOS]);
  assert.deepEqual(plan.matrices.independentActionScenarioIds, [...TWO_PLAYER_ACTION_SCENARIOS]);
  assert.deepEqual(plan.matrices.sessionScenarioIds, [...TWO_PLAYER_SESSION_SCENARIOS]);
  assert.deepEqual(plan.matrices.accessibleIdentityTaskIds, [...TWO_PLAYER_ACCESSIBLE_TASKS]);
  assert.deepEqual(plan.matrices.requiredRuntimeSurfaces, ["console-shell", "obstacle-sample"]);
  assert.equal(plan.matrices.validTrialsPerCell, 20);
  const pairCount = TWO_PLAYER_PERSONA_PAIRS.length;
  const placementCount = TWO_PLAYER_PLACEMENTS.length;
  const trials = plan.matrices.validTrialsPerCell;
  assert.equal(plan.matrices.identityCellCount, pairCount * placementCount * TWO_PLAYER_IDENTITY_SCENARIOS.length);
  assert.equal(plan.matrices.identityTrialCount, plan.matrices.identityCellCount * trials);
  assert.equal(plan.matrices.actionCellCount, pairCount * placementCount * TWO_PLAYER_ACTION_SCENARIOS.length);
  assert.equal(plan.matrices.actionTrialCount, plan.matrices.actionCellCount * trials);
  assert.equal(plan.matrices.sessionCellCount, pairCount * TWO_PLAYER_SESSION_SCENARIOS.length);
  assert.equal(plan.matrices.sessionCycleCount, plan.matrices.sessionCellCount * trials);
  assert.equal(plan.matrices.accessibleIdentityCellCount, pairCount * TWO_PLAYER_ACCESSIBLE_TASKS.length);
  assert.equal(plan.matrices.accessibleIdentityTrialCount, plan.matrices.accessibleIdentityCellCount * trials);
  assert.equal(plan.matrices.runtimeSoakCellCount, pairCount * placementCount * 2);
  assert.equal(plan.matrices.runtimeSoakDurationMs, 3_600_000);
  assert.equal(plan.matrices.runtimeSoakCount, plan.matrices.runtimeSoakCellCount);
  assert.equal(plan.matrices.everyOrderedPairPlacementScenarioAndRuntimeCellMustPass, true);
  assert.equal(plan.matrices.pairPlacementScenarioRuntimeOrBestCaseAggregateMayRescueFailure, false);

  exactKeys(plan.measurements, [
    "requiredMetrics", "independentPerPlayerGroundTruthRequired",
    "exactActionOwnerRequiredForEveryEvent", "exactMenuOwnerRequiredForEveryShellAction",
    "runtimeStateDigestRequiredBeforeFreezeDuringFreezeAndAfterResume",
    "everyScheduledAttemptFailureInvalidationAndInterventionRemainsVisible",
    "sameExposureClockRequiredForTwoPlayerLatency",
    "captureArrivalOrInferenceCompletionMayQualifyExposureLatency",
    "syntheticIdentityOrSessionEvidenceMaySubstitutePhysicalTrials",
    "onePlayerResultMayRescueTwoPlayerFailure",
  ], "measurements");
  assert.deepEqual(plan.measurements.requiredMetrics, [
    "per-player-pose-fps-and-core17-coverage",
    "per-player-landmark-jitter-and-missingness",
    "identity-switch-fragmentation-and-false-transfer-counts",
    "per-player-action-trigger-precision-and-recall",
    "cross-player-action-attribution-count",
    "unintended-privileged-action-count",
    "exposure-to-correct-player-game-api-p50-p95-p99-worst",
    "join-and-separate-calibration-time",
    "outline-and-owner-comprehension",
    "loss-confirmation-and-global-freeze-time",
    "simulation-timer-hazard-score-and-action-advance-during-freeze",
    "same-track-silent-reacquisition-and-recovery-overlay-time",
    "launcher-pause-and-recovery-owner-correctness",
    "tracker-camera-and-clock-fault-recovery",
    "cpu-gpu-memory-power-thermal-and-frame-pacing",
  ]);
  for (const key of [
    "independentPerPlayerGroundTruthRequired", "exactActionOwnerRequiredForEveryEvent",
    "exactMenuOwnerRequiredForEveryShellAction",
    "runtimeStateDigestRequiredBeforeFreezeDuringFreezeAndAfterResume",
    "everyScheduledAttemptFailureInvalidationAndInterventionRemainsVisible",
    "sameExposureClockRequiredForTwoPlayerLatency",
  ]) assert.equal(plan.measurements[key], true, `measurements.${key} drifted`);
  for (const key of [
    "captureArrivalOrInferenceCompletionMayQualifyExposureLatency",
    "syntheticIdentityOrSessionEvidenceMaySubstitutePhysicalTrials",
    "onePlayerResultMayRescueTwoPlayerFailure",
  ]) assert.equal(plan.measurements[key], false, `measurements.${key} drifted`);

  exactKeys(plan.acceptance, [
    "maximumIdentitySwitches", "maximumFalseControlTransfers",
    "maximumCrossPlayerActionAttributions", "maximumUnintendedPrivilegedActions",
    "maximumMissedGlobalFreezes", "maximumStateAdvancesDuringFreeze",
    "maximumIncorrectMenuOwnershipEvents", "maximumWrongTrackSilentReacquisitions",
    "maximumAutomaticRecoveryOverlayResumes", "maximumInvalidAttemptsPerCell",
    "minimumPerPlayerTriggerPrecisionPpm", "minimumPerPlayerTriggerRecallPpm",
    "maximumExposureToCorrectPlayerGameApiP95Us", ...openAcceptanceKeys,
    "allZeroToleranceAndNumericGatesApplyPerPairPlacementScenarioAndRuntime",
    "aggregateImprovementMayRescueAnyFailedCell",
  ], "acceptance");
  assert.deepEqual(
    Object.fromEntries(Object.entries(plan.acceptance).slice(0, 13)),
    {
      maximumIdentitySwitches: 0,
      maximumFalseControlTransfers: 0,
      maximumCrossPlayerActionAttributions: 0,
      maximumUnintendedPrivilegedActions: 0,
      maximumMissedGlobalFreezes: 0,
      maximumStateAdvancesDuringFreeze: 0,
      maximumIncorrectMenuOwnershipEvents: 0,
      maximumWrongTrackSilentReacquisitions: 0,
      maximumAutomaticRecoveryOverlayResumes: 0,
      maximumInvalidAttemptsPerCell: 0,
      minimumPerPlayerTriggerPrecisionPpm: 950000,
      minimumPerPlayerTriggerRecallPpm: 900000,
      maximumExposureToCorrectPlayerGameApiP95Us: 120000,
    },
  );
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `acceptance.${key} must remain null before collection`);
  }
  assert.equal(plan.acceptance.allZeroToleranceAndNumericGatesApplyPerPairPlacementScenarioAndRuntime, true);
  assert.equal(plan.acceptance.aggregateImprovementMayRescueAnyFailedCell, false);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoDefault: false,
    rawFramesImagesAudioOrDepthAllowedInRepositoryReleaseOrResult: false,
    participantNamesStableIdentifiersFacesPortraitsOrProfileIdsAllowed: false,
    bodyMeasurementsCalibrationVectorsOrIdentityTemplatesAllowed: false,
    opaqueSessionLocalTrialAndPlayerLabelsRequired: true,
    skeletonOnlyTraceMayContainStableCrossSessionIdentity: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressAllowed: false,
    temporaryDiagnosticImagesRequireSeparateProtocolConsentAndAuthorization: true,
    temporaryDiagnosticImagesMustBeDeletedAndDeletionVerified: true,
    adverseAttemptsMayBeDeletedOrHidden: false,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...TWO_PLAYER_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedIdentityTrialCount: 0,
    completedActionTrialCount: 0,
    completedSessionCycleCount: 0,
    completedAccessibleIdentityTrialCount: 0,
    completedRuntimeSoakCount: 0,
    qualifiedOrderedPersonaPairClasses: [],
    qualifiedPlacementPairIds: [],
    qualifiedRuntimeSurfaces: [],
  });

  return {
    status: plan.status,
    sourceBindingCount: plan.sourceBindings.length,
    identityTrialCount: plan.matrices.identityTrialCount,
    actionTrialCount: plan.matrices.actionTrialCount,
    sessionCycleCount: plan.matrices.sessionCycleCount,
    accessibleIdentityTrialCount: plan.matrices.accessibleIdentityTrialCount,
    runtimeSoakCount: plan.matrices.runtimeSoakCount,
    openGateCount: openAcceptanceKeys.length,
  };
}

export async function loadTwoPlayerQualificationPlan(path = trackedPath) {
  const bytes = await readFile(path);
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES, `plan must contain 1 through ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan must be valid JSON", { cause: error });
  }
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical two-space JSON with trailing LF");
  return plan;
}

export async function validateTrackedTwoPlayerQualificationPlan(path = trackedPath) {
  return validateTwoPlayerQualificationPlan(await loadTwoPlayerQualificationPlan(path), root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await validateTrackedTwoPlayerQualificationPlan();
  console.log(
    `${trackedPath}: valid ${summary.status} ${summary.identityTrialCount}-identity-trial, `
      + `${summary.actionTrialCount}-action-trial, ${summary.sessionCycleCount}-session-cycle, `
      + `${summary.accessibleIdentityTrialCount}-accessible-task-trial, `
      + `${summary.runtimeSoakCount}-one-hour-soak I-054 plan`,
  );
}
