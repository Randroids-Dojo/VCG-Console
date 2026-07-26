import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISUAL_BLANKET_SCENARIOS,
  VISUAL_MOTION_SCENARIOS,
  VISUAL_SKIN_TONE_STRATA,
  parseVisualRobustnessPlanBytes,
  validateVisualRobustnessPlan,
} from "./validate-visual-robustness-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/visual-robustness/cross-tier-visual-robustness-plan-v1.json",
));
const tracked = await parseVisualRobustnessPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-041 campaign", () => {
  assert.equal(tracked.status, "blocked");
  assert.deepEqual(tracked.cohortMatrix.skinToneStratumIds, [...VISUAL_SKIN_TONE_STRATA]);
  assert.equal(tracked.trialMatrix.requiredMotionCellCount, 3000);
  assert.equal(tracked.trialMatrix.requiredBlanketProbeCellCount, 300);
  assert.equal(tracked.trialMatrix.requiredTotalTrialCount, 66000);
  assert.equal(tracked.negativeSessionMatrix.requiredNegativeSessionCount, 150);
});

test("rejects source substitution or stale source bytes", async () => {
  const plan = clone(); plan.sourceBindings[2].sha256 = "0".repeat(64);
  await assert.rejects(validateVisualRobustnessPlan(plan), /digest drifted/u);
});

test("rejects invented room, participant, camera, fixture, mutation, or purchase authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.selectedRoomSurveyResultSha256 = "a".repeat(64); },
    (plan) => { plan.collectionBoundary.skinToneMeasurementAndSamplingProtocolSha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.roomAccessAuthorized = true; },
    (plan) => { plan.collectionBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.cameraCollectionAuthorized = true; },
    (plan) => { plan.collectionBoundary.garmentBlanketOrClutterFixtureUseAuthorized = true; },
    (plan) => { plan.collectionBoundary.physicalFixtureMutationAuthorized = true; },
    (plan) => { plan.collectionBoundary.purchaseAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("preserves five opaque skin-tone strata without identity inference or post-result exclusion", async () => {
  for (const mutate of [
    (plan) => { plan.cohortMatrix.blockingPersonaClasses.pop(); },
    (plan) => { plan.cohortMatrix.skinToneStratumIds.pop(); },
    (plan) => { plan.cohortMatrix.exactMeasurementAndAssignmentProtocolSha256 = "c".repeat(64); },
    (plan) => { plan.cohortMatrix.minimumDistinctParticipantsPerPersonaStratum = 1; },
    (plan) => { plan.cohortMatrix.everyPersonaStratumIsBlocking = false; },
    (plan) => { plan.cohortMatrix.oneParticipantMayPopulateMultipleSkinToneStrata = true; },
    (plan) => { plan.cohortMatrix.skinToneStrataGrantIdentityEthnicityHealthOrProfileAuthority = true; },
    (plan) => { plan.cohortMatrix.onePersonaOrStratumMayRescueAnother = true; },
    (plan) => { plan.cohortMatrix.postResultParticipantOrStratumExclusionAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("preserves every patterned, loose, blanket, and clutter condition without substitution", async () => {
  assert.deepEqual(tracked.conditionMatrix.motionScenarioIds, [...VISUAL_MOTION_SCENARIOS]);
  assert.deepEqual(tracked.conditionMatrix.boundedBlanketScenarioIds, [...VISUAL_BLANKET_SCENARIOS]);
  for (const mutate of [
    (plan) => { plan.conditionMatrix.motionScenarioIds.pop(); },
    (plan) => { plan.conditionMatrix.boundedBlanketScenarioIds.pop(); },
    (plan) => { plan.conditionMatrix.exactItemFixtureAndPlacementManifestSha256 = "d".repeat(64); },
    (plan) => { plan.conditionMatrix.clothingPatternContrastAndSpatialFrequencyMustBeMeasured = false; },
    (plan) => { plan.conditionMatrix.garmentFitAndOccludedBodyRegionsMustBeRecorded = false; },
    (plan) => { plan.conditionMatrix.clutterOccupancyEdgeDensityAndDisplayMotionMustBeMeasured = false; },
    (plan) => { plan.conditionMatrix.ordinaryControlGarmentMayRescueStressCondition = true; },
    (plan) => { plan.conditionMatrix.onePatternGarmentBlanketOrClutterFixtureMaySubstituteAnother = true; },
    (plan) => { plan.conditionMatrix.syntheticOrPublicDatasetMayQualifyHouseholdPhysicalConditions = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("preserves all 3300 cells, 66000 trials, and 150 negative sessions", async () => {
  for (const mutate of [
    (plan) => { plan.trialMatrix.placementIds.pop(); },
    (plan) => { plan.trialMatrix.motionIds.pop(); },
    (plan) => { plan.trialMatrix.blanketProbeIds.pop(); },
    (plan) => { plan.trialMatrix.validTrialsPerCell = 19; },
    (plan) => { plan.trialMatrix.requiredMotionCellCount = 2999; },
    (plan) => { plan.trialMatrix.requiredBlanketProbeTrialCount = 5999; },
    (plan) => { plan.trialMatrix.requiredTotalTrialCount = 65999; },
    (plan) => { plan.trialMatrix.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.negativeSessionMatrix.scenarioIds.pop(); },
    (plan) => { plan.negativeSessionMatrix.requiredNegativeSessionCount = 149; },
    (plan) => { plan.negativeSessionMatrix.requiredNegativeSessionDurationMs = 134999999; },
    (plan) => { plan.negativeSessionMatrix.shortenedOrSubstitutedFailedSessionAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("rejects measurement shortcuts, invented gates, aggregate rescue, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.independentPoseAndActionGroundTruthRequired = false; },
    (plan) => { plan.measurements.candidateConfidenceMayLabelItself = true; },
    (plan) => { plan.measurements.captureArrivalMaySubstituteExposureTimestamp = true; },
    (plan) => { plan.measurements.skinToneOrAppearanceMayBeInferredFromTrackerOutput = true; },
    (plan) => { plan.acceptance.minimumCore17DetectionRatePpm = 900000; },
    (plan) => { plan.acceptance.maximumWorstStratumPerformanceGapPpm = 100000; },
    (plan) => { plan.acceptance.minimumTriggerPrecisionPpm = 949999; },
    (plan) => { plan.acceptance.maximumExposureToGameApiP95Us = 120001; },
    (plan) => { plan.acceptance.aggregatePersonaStratumConditionPlacementOrActionMayRescueFailure = true; },
    (plan) => { plan.acceptance.stoppedOrIncompleteCellMayPass = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedMotionTrialCount = 60000; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("rejects unsafe blanket motion, privacy weakening, identity-bearing release, and egress", async () => {
  for (const mutate of [
    (plan) => { plan.safetyPolicy.blanketProbeMotionLimitedToStationaryNeutralAndSlowArmsRaised = false; },
    (plan) => { plan.safetyPolicy.jumpDuckDodgeOrRapidTurnAllowedDuringBlanketProbe = true; },
    (plan) => { plan.safetyPolicy.faceNeckAirwayOrHeadCoveringAllowed = true; },
    (plan) => { plan.safetyPolicy.floorDraggingWrappingTyingPinningOrRestrainingAllowed = true; },
    (plan) => { plan.safetyPolicy.garmentOrBlanketTripEntanglementHeatOrBalanceRiskMayPass = true; },
    (plan) => { plan.safetyPolicy.participantStopRequestEndsSessionImmediately = false; },
    (plan) => { plan.safetyPolicy.consentOrSuccessfulTrackingMayWaiveSafetyFailure = true; },
    (plan) => { plan.dataPolicy.rawFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.participantNamesPortraitsVoicesExactAgesAddressesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.individualLevelSkinToneGarmentOrAppearanceDataAllowedInRelease = true; },
    (plan) => { plan.dataPolicy.networkEgressAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateVisualRobustnessPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.fairnessQualified = true;
  await assert.rejects(validateVisualRobustnessPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseVisualRobustnessPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseVisualRobustnessPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseVisualRobustnessPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseVisualRobustnessPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(parseVisualRobustnessPlanBytes(Buffer.alloc(192 * 1024 + 1)));
});
