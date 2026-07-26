import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/visual-robustness/cross-tier-visual-robustness-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const VISUAL_ROBUSTNESS_FORMAT = "vcg-cross-tier-visual-robustness-plan/v1";
export const VISUAL_SKIN_TONE_STRATA = Object.freeze([
  "opaque-skin-tone-stratum-1",
  "opaque-skin-tone-stratum-2",
  "opaque-skin-tone-stratum-3",
  "opaque-skin-tone-stratum-4",
  "opaque-skin-tone-stratum-5",
]);
export const VISUAL_MOTION_SCENARIOS = Object.freeze([
  "solid-fitted-uncluttered-control",
  "fine-repeating-pattern-upper-body",
  "large-high-contrast-pattern-upper-body",
  "patterned-upper-and-lower-body",
  "loose-long-sleeve-upper-body",
  "loose-wide-leg-lower-body",
  "layered-loose-outerwear",
  "static-high-texture-background",
  "household-object-boundary-clutter",
  "television-motion-clutter",
  "pattern-plus-static-clutter",
  "loose-garment-plus-television-motion",
]);
export const VISUAL_BLANKET_SCENARIOS = Object.freeze([
  "stationary-torso-blanket-drape",
  "stationary-lower-body-blanket-occlusion",
  "stationary-held-blanket-edge-occlusion",
]);
export const VISUAL_BLOCKERS = Object.freeze([
  "qualified-camera-geometry-capture-lens-and-exact-targets",
  "selected-room-and-safe-play-zone",
  "exact-garment-blanket-clutter-fixtures-and-measurement-protocol",
  "skin-tone-measurement-sampling-cohort-and-analysis-protocol",
  "numeric-pose-jitter-dropout-reacquisition-disparity-and-cohort-gates",
  "participant-consent-assent-comprehension-and-stop-authority",
  "independent-pose-action-ground-truth-and-exposure-clock",
  "garment-blanket-active-play-safety-and-recovery-protocol",
  "data-handling-temporary-image-deletion-and-reidentification-review",
  "room-participant-camera-fixture-purchase-operators-and-schedule-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "collectionBoundary",
  "cohortMatrix", "conditionMatrix", "trialMatrix", "negativeSessionMatrix",
  "measurements", "acceptance", "dataPolicy", "safetyPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["privacy-camera-and-product-decisions", "docs/DECISIONS.md"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["blocking-persona-and-consent-boundary", "docs/PLAYER_PERSONAS.md"],
  ["data-flow-and-diagnostics-boundary", "docs/DATA_FLOWS.md"],
  ["motion-scoring-boundary", "docs/MOTION_BENCHMARK_PROTOCOL.md"],
  ["camera-capture-and-lighting-plan", "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json"],
  ["pose-edge-plan", "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json"],
  ["first-real-room-one-player-plan", "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json"],
  ["lens-rectification-plan", "benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json"],
];
const collectionKeys = [
  "selectedCameraQualificationResultSha256", "selectedGeometryResultSha256",
  "selectedCapturePolicyResultSha256", "selectedLensCalibrationResultSha256",
  "exactTargetConfigurationMatrixSha256", "exactCameraModeAndPipelineSha256",
  "selectedRoomSurveyResultSha256", "appearanceAndClutterFixtureProtocolSha256",
  "skinToneMeasurementAndSamplingProtocolSha256", "garmentAndBlanketSafetyProtocolSha256",
  "independentPoseAndActionGroundTruthProtocolSha256", "exposureTimestampProofSha256",
  "participantConsentAndAssentProtocolSha256", "dataHandlingAndDeletionProtocolSha256",
  "scheduleSha256", "roomAccessAuthorized", "adultParticipationAuthorized",
  "childParticipationAuthorized", "cameraCollectionAuthorized",
  "temporaryDiagnosticImageCollectionAuthorized",
  "garmentBlanketOrClutterFixtureUseAuthorized", "physicalFixtureMutationAuthorized",
  "purchaseAuthorized",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(
      absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateVisualRobustnessPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, VISUAL_ROBUSTNESS_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-visual-robustness-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-041"]);
  for (const phrase of [
    "No participant", "skin-tone stratum", "blanket condition", "fairness result",
    "synthetic image", "aggregate score", "cannot qualify another persona",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 15)) {
    assert.equal(plan.collectionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of collectionKeys.slice(15)) {
    assert.equal(plan.collectionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.cohortMatrix, {
    blockingPersonaClasses: ["school-age-child-standing", "adult-standing"],
    skinToneStratumIds: [...VISUAL_SKIN_TONE_STRATA],
    exactMeasurementAndAssignmentProtocolSha256: null,
    minimumDistinctParticipantsPerPersonaStratum: null,
    everyPersonaStratumIsBlocking: true,
    oneParticipantMayPopulateMultipleSkinToneStrata: false,
    skinToneStrataGrantIdentityEthnicityHealthOrProfileAuthority: false,
    onePersonaOrStratumMayRescueAnother: false,
    postResultParticipantOrStratumExclusionAllowed: false,
  });

  assert.deepEqual(plan.conditionMatrix, {
    motionScenarioIds: [...VISUAL_MOTION_SCENARIOS],
    boundedBlanketScenarioIds: [...VISUAL_BLANKET_SCENARIOS],
    exactItemFixtureAndPlacementManifestSha256: null,
    clothingPatternContrastAndSpatialFrequencyMustBeMeasured: true,
    garmentFitAndOccludedBodyRegionsMustBeRecorded: true,
    clutterOccupancyEdgeDensityAndDisplayMotionMustBeMeasured: true,
    ordinaryControlGarmentMayRescueStressCondition: false,
    onePatternGarmentBlanketOrClutterFixtureMaySubstituteAnother: false,
    syntheticOrPublicDatasetMayQualifyHouseholdPhysicalConditions: false,
  });

  assert.deepEqual(plan.trialMatrix, {
    placementIds: ["center", "near-left-edge", "near-right-edge", "far-left-edge", "far-right-edge"],
    motionIds: ["neutral-full-body", "jump", "duck", "dodge-left", "dodge-right"],
    blanketProbeIds: ["neutral-stationary", "slow-arms-raised"],
    validTrialsPerCell: 20,
    requiredMotionCellCount: 3000,
    requiredMotionTrialCount: 60000,
    requiredBlanketProbeCellCount: 300,
    requiredBlanketProbeTrialCount: 6000,
    requiredTotalCellCount: 3300,
    requiredTotalTrialCount: 66000,
    everyTrialBoundToExactParticipantConditionPlacementAndGroundTruth: true,
    aggregateMayRescueFailedCell: false,
  });

  assert.deepEqual(plan.negativeSessionMatrix, {
    scenarioIds: [...VISUAL_MOTION_SCENARIOS, ...VISUAL_BLANKET_SCENARIOS],
    placementId: "center",
    durationMsPerPersonaStratumScenario: 900000,
    requiredNegativeSessionCount: 150,
    requiredNegativeSessionDurationMs: 135000000,
    ordinarySetupRestControllerAndNonActionMovementRequired: true,
    everyEmittedPrivilegedAndGameplayActionMustRemainVisible: true,
    shortenedOrSubstitutedFailedSessionAllowed: false,
  });

  assert.deepEqual(plan.measurements, {
    requiredMeasurements: [
      "measured-illuminance-color-temperature-and-exposure",
      "clothing-pattern-contrast-and-spatial-frequency",
      "garment-fit-drape-and-occluded-body-regions",
      "background-clutter-occupancy-edge-density-and-display-motion",
      "core17-per-landmark-detection-missing-and-normalized-error",
      "core17-normalized-jitter-and-dropout-duration",
      "jump-duck-and-dodge-precision-recall-and-wrong-trigger-count",
      "unintended-privileged-actions-during-negative-sessions",
      "tracking-loss-reacquisition-and-recovery-overlay-timing",
      "exposure-to-game-api-p50-p95-p99-and-worst",
      "invalid-stop-discomfort-and-safety-events",
      "per-persona-stratum-condition-placement-and-action-disposition",
    ],
    independentPoseAndActionGroundTruthRequired: true,
    candidateConfidenceMayLabelItself: false,
    captureArrivalMaySubstituteExposureTimestamp: false,
    skinToneOrAppearanceMayBeInferredFromTrackerOutput: false,
    perCellAndWorstStratumReportingRequired: true,
  });

  exactKeys(plan.acceptance, [
    "minimumTriggerPrecisionPpm", "minimumTriggerRecallPpm",
    "maximumUnintendedPrivilegedActionsPerNegativeSession",
    "maximumExposureToGameApiP95Us", "minimumCore17DetectionRatePpm",
    "maximumCore17MissingRatePpm", "maximumCore17P95NormalizedErrorMilliTorso",
    "maximumCore17NormalizedJitterMilliTorso", "maximumTrackingDropoutDurationMs",
    "maximumReacquisitionDurationMs", "maximumWorstStratumPerformanceGapPpm",
    "minimumDistinctParticipantsPerPersonaStratum", "everyBlockingCellMustPass",
    "aggregatePersonaStratumConditionPlacementOrActionMayRescueFailure",
    "stoppedOrIncompleteCellMayPass", "selectionOrExclusionRuleMayChangeAfterResults",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.minimumTriggerPrecisionPpm,
    plan.acceptance.minimumTriggerRecallPpm,
    plan.acceptance.maximumUnintendedPrivilegedActionsPerNegativeSession,
    plan.acceptance.maximumExposureToGameApiP95Us,
  ], [950000, 900000, 0, 120000]);
  for (const key of [
    "minimumCore17DetectionRatePpm", "maximumCore17MissingRatePpm",
    "maximumCore17P95NormalizedErrorMilliTorso", "maximumCore17NormalizedJitterMilliTorso",
    "maximumTrackingDropoutDurationMs", "maximumReacquisitionDurationMs",
    "maximumWorstStratumPerformanceGapPpm", "minimumDistinctParticipantsPerPersonaStratum",
  ]) assert.equal(plan.acceptance[key], null, `open gate ${key} must remain null`);
  assert.equal(plan.acceptance.everyBlockingCellMustPass, true);
  assert.equal(plan.acceptance.aggregatePersonaStratumConditionPlacementOrActionMayRescueFailure, false);
  assert.equal(plan.acceptance.stoppedOrIncompleteCellMayPass, false);
  assert.equal(plan.acceptance.selectionOrExclusionRuleMayChangeAfterResults, false);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoDefault: false,
    rawRoomVideoAllowedInRepositoryOrRelease: false,
    rawFramesAllowedInRepositoryOrRelease: false,
    temporaryDiagnosticImagesRequireSeparateProtocolAndConsent: true,
    temporaryDiagnosticImagesMustBeEncryptedAccessBoundedAndDeletedWithVerification: true,
    participantNamesPortraitsVoicesExactAgesAddressesOrStableIdentifiersAllowed: false,
    individualLevelSkinToneGarmentOrAppearanceDataAllowedInRelease: false,
    opaqueStratumAggregateMetricsRequireMinimumCohortAndReidentificationReview: true,
    skeletonNumericAndAggregateReleaseArtifactsPreferred: true,
    networkEgressAllowed: false,
    freeTextResultEvidenceAllowed: false,
  });

  assert.deepEqual(plan.safetyPolicy, {
    blanketProbeMotionLimitedToStationaryNeutralAndSlowArmsRaised: true,
    jumpDuckDodgeOrRapidTurnAllowedDuringBlanketProbe: false,
    faceNeckAirwayOrHeadCoveringAllowed: false,
    floorDraggingWrappingTyingPinningOrRestrainingAllowed: false,
    garmentOrBlanketTripEntanglementHeatOrBalanceRiskMayPass: false,
    participantStopRequestEndsSessionImmediately: true,
    independentPhysicalStopAndControllerRecoveryRequired: true,
    consentOrSuccessfulTrackingMayWaiveSafetyFailure: false,
  });

  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...VISUAL_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedMotionCellCount: 0,
    completedMotionTrialCount: 0,
    completedBlanketProbeCellCount: 0,
    completedBlanketProbeTrialCount: 0,
    completedNegativeSessionCount: 0,
    qualifiedPersonaStratumConditionPlacementActionCells: [],
    publishedAggregateReportSha256: null,
  });
  return plan;
}

export async function parseVisualRobustnessPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical pretty JSON without duplicate or reordered keys",
  );
  return validateVisualRobustnessPlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseVisualRobustnessPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.trialMatrix.requiredTotalCellCount}-cell,`
      + ` ${plan.trialMatrix.requiredTotalTrialCount}-trial,`
      + ` ${plan.negativeSessionMatrix.requiredNegativeSessionCount}-negative-session campaign`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
