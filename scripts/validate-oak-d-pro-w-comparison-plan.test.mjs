import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OAK_COMPARISON_LANES,
  parseOakComparisonPlanBytes,
  validateOakComparisonPlan,
} from "./validate-oak-d-pro-w-comparison-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/depth-comparison/oak-d-pro-w-rgb-depth-comparison-plan-v1.json",
));
const tracked = await parseOakComparisonPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked no-purchase I-042 comparison", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.candidateSnapshot.sku, "A00573");
  assert.deepEqual(tracked.comparisonLanes.laneIds, [...OAK_COMPARISON_LANES]);
  assert.equal(tracked.onePlayerMatrix.requiredTrialCount, 90000);
  assert.equal(tracked.twoPlayerOverlapMatrix.requiredTrialCount, 13500);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects stale sources and candidate identity, price, availability, quote, or purchase promotion", async () => {
  for (const mutate of [
    (plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); },
    (plan) => { plan.candidateSnapshot.sku = "OAK-D-Pro-W-97"; },
    (plan) => { plan.candidateSnapshot.centralRgbVariant = "OV9782"; },
    (plan) => { plan.candidateSnapshot.observedListPriceUsdCents = 49900; },
    (plan) => { plan.candidateSnapshot.observedAvailability = "selected"; },
    (plan) => { plan.candidateSnapshot.deliveredQuoteSha256 = "a".repeat(64); },
    (plan) => { plan.candidateSnapshot.merchandiseObservationMayAuthorizePurchaseOrSelection = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("rejects invented device, target, participant, emitter, mutation, diagnostic, or purchase authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.receivedOakDeviceIdentitySha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.depthAiRuntimeFirmwareAndPipelineManifestSha256 = "c".repeat(64); },
    (plan) => { plan.collectionBoundary.roomAccessAuthorized = true; },
    (plan) => { plan.collectionBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.cameraCollectionAuthorized = true; },
    (plan) => { plan.collectionBoundary.oakFirmwareOrPipelineMutationAuthorized = true; },
    (plan) => { plan.collectionBoundary.irEmitterUseAuthorized = true; },
    (plan) => { plan.collectionBoundary.temporaryDiagnosticImageCollectionAuthorized = true; },
    (plan) => { plan.collectionBoundary.purchaseAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("preserves RGB camera control, passive depth, active depth, and exploratory IR attribution", async () => {
  for (const mutate of [
    (plan) => { plan.comparisonLanes.laneIds.pop(); },
    (plan) => { plan.comparisonLanes.blockingLaneIds.pop(); },
    (plan) => { plan.comparisonLanes.exploratoryLaneIds = []; },
    (plan) => { plan.comparisonLanes.onDeviceNeuralInferenceAllowedInBlockingLanes = true; },
    (plan) => { plan.comparisonLanes.oakRgbOnlyCameraControlRequired = false; },
    (plan) => { plan.comparisonLanes.passiveAndActiveStereoMustRemainSeparate = false; },
    (plan) => { plan.comparisonLanes.exploratoryMonoIrMayRescueBlockingFailure = true; },
    (plan) => { plan.comparisonLanes.oakRgbImprovementMayBeAttributedToDepth = true; },
    (plan) => { plan.comparisonLanes.oneLaneOrTargetMayRescueAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("requires honest same-session and same-exposure boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.sessionDesign.sameParticipantRoomPlacementLightingActionSessionRequired = false; },
    (plan) => { plan.sessionDesign.balancedRandomizedLaneOrderRequired = false; },
    (plan) => { plan.sessionDesign.oakInternalAblationsMustUseSameExposureFanOut = false; },
    (plan) => { plan.sessionDesign.sharedUvcAndOakExactExposureEquivalenceClaimed = true; },
    (plan) => { plan.sessionDesign.maximumCrossCameraExposureSkewUs = 1000; },
    (plan) => { plan.sessionDesign.independentExposureAndSynchronizationProofRequired = false; },
    (plan) => { plan.sessionDesign.rawRgbDepthOrIrRetentionRequired = true; },
    (plan) => { plan.sessionDesign.sequentialSessionMayClaimSameExposure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("preserves 90000 one-player and conditionally gated 13500 overlap trials", async () => {
  for (const mutate of [
    (plan) => { plan.onePlayerMatrix.targetTierIds.pop(); },
    (plan) => { plan.onePlayerMatrix.lightingConditionIds.pop(); },
    (plan) => { plan.onePlayerMatrix.validTrialsPerCell = 19; },
    (plan) => { plan.onePlayerMatrix.requiredCellCount = 4499; },
    (plan) => { plan.onePlayerMatrix.requiredTrialCount = 89999; },
    (plan) => { plan.onePlayerMatrix.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.twoPlayerOverlapMatrix.executionRequiresCompletedOnePlayerAndI054Gates = false; },
    (plan) => { plan.twoPlayerOverlapMatrix.requiredForCompleteDepthSelectionClaim = false; },
    (plan) => { plan.twoPlayerOverlapMatrix.pairClassIds.pop(); },
    (plan) => { plan.twoPlayerOverlapMatrix.overlapScenarioIds.pop(); },
    (plan) => { plan.twoPlayerOverlapMatrix.requiredTrialCount = 13499; },
    (plan) => { plan.twoPlayerOverlapMatrix.onePairScenarioOrPlacementMayRescueAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("rejects vendor or device self-labeling, invented gates, aggregate rescue, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.independentGroundTruthRequired = false; },
    (plan) => { plan.measurements.candidateDepthMayLabelItself = true; },
    (plan) => { plan.measurements.vendorDepthAccuracyMaySubstituteMeasuredRoomAccuracy = true; },
    (plan) => { plan.measurements.captureArrivalMaySubstituteExposureTimestamp = true; },
    (plan) => { plan.acceptance.minimumValidDepthCoveragePpm = 900000; },
    (plan) => { plan.acceptance.minimumPredeclaredMaterialBenefitPpm = 100000; },
    (plan) => { plan.acceptance.minimumTriggerPrecisionPpm = 949999; },
    (plan) => { plan.acceptance.depthSelectionRequiresMaterialBenefitAndNoBlockingRegression = false; },
    (plan) => { plan.acceptance.cameraOnlyImprovementMayQualifyDepth = true; },
    (plan) => { plan.acceptance.aggregateTargetLightingPlacementPersonaOrLaneMayRescueFailure = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "depth-selected"; },
    (plan) => { plan.result.completedOnePlayerTrialCount = 90000; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("rejects stale-cost reuse, unsafe IR operation, raw release, identity data, and egress", async () => {
  for (const mutate of [
    (plan) => { plan.costPolicy.deliveredCandidateCostUsdCents = 52900; },
    (plan) => { plan.costPolicy.priceSnapshotMayAuthorizePurchaseOrBOMMutation = true; },
    (plan) => { plan.costPolicy.stalePriceMayBeReusedAtPurchase = true; },
    (plan) => { plan.costPolicy.costMayRescueAccuracySafetyLatencyOrMaintenanceFailure = true; },
    (plan) => { plan.irSafetyPolicy.emittersDefaultOff = false; },
    (plan) => { plan.irSafetyPolicy.damagedOpenedModifiedOrUnofficialFirmwareDeviceMayOperateEmitters = true; },
    (plan) => { plan.irSafetyPolicy.magnifyingOpticsAllowed = true; },
    (plan) => { plan.irSafetyPolicy.vendorLaserClassificationMaySubstituteProjectParticipantOrRoomReview = true; },
    (plan) => { plan.irSafetyPolicy.successfulDepthMayWaiveIrSafetyFailure = true; },
    (plan) => { plan.dataPolicy.rawRgbDepthIrFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.participantNamesPortraitsVoicesAddressesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.networkEgressAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOakComparisonPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.deviceSelected = true;
  await assert.rejects(validateOakComparisonPlan(extra), /fields drifted/u);
  await assert.rejects(parseOakComparisonPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseOakComparisonPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseOakComparisonPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])),
    /BOM/u,
  );
  await assert.rejects(parseOakComparisonPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseOakComparisonPlanBytes(Buffer.alloc(256 * 1024 + 1)));
});
