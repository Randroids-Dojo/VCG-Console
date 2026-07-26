import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LENS_POSITION_IDS,
  LENS_STRATEGIES,
  LENS_TARGET_TIERS,
  parseLensDistortionRectificationPlanBytes,
  validateLensDistortionRectificationPlan,
} from "./validate-lens-distortion-rectification-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json",
));
const tracked = await parseLensDistortionRectificationPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-039 campaign", () => {
  assert.equal(tracked.status, "blocked");
  assert.deepEqual(tracked.strategyMatrix.targetTierIds, [...LENS_TARGET_TIERS]);
  assert.deepEqual(tracked.strategyMatrix.strategyIds, [...LENS_STRATEGIES]);
  assert.equal(tracked.calibrationTargetMatrix.requiredCalibrationImageCount, 90);
  assert.equal(tracked.calibrationTargetMatrix.requiredIndependentValidationImageCount, 60);
  assert.equal(tracked.poseAndActionMatrix.requiredBlockingCellCount, 1134);
  assert.equal(tracked.poseAndActionMatrix.requiredBlockingTrialCount, 22680);
  assert.equal(tracked.latencyMatrix.requiredMeasuredFrameCount, 9000);
});

test("rejects source substitution or stale source bytes", async () => {
  const plan = clone(); plan.sourceBindings[1].sha256 = "0".repeat(64);
  await assert.rejects(validateLensDistortionRectificationPlan(plan), /digest drifted/u);
});

test("rejects invented hardware, participant, write, or purchase authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.selectedCameraQualificationResultSha256 = "a".repeat(64); },
    (plan) => { plan.collectionBoundary.captureAndPreprocessingPipelineSha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.cameraCollectionAuthorized = true; },
    (plan) => { plan.collectionBoundary.participantSessionsAuthorized = true; },
    (plan) => { plan.collectionBoundary.targetMutationAuthorized = true; },
    (plan) => { plan.collectionBoundary.persistentCalibrationWriteAuthorized = true; },
    (plan) => { plan.collectionBoundary.purchaseAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("preserves the three-target three-strategy comparison and rectified-input proof boundary", async () => {
  for (const mutate of [
    (plan) => { plan.strategyMatrix.targetTierIds.pop(); },
    (plan) => { plan.strategyMatrix.strategyIds.pop(); },
    (plan) => { plan.strategyMatrix.requiredTargetStrategyCellCount = 8; },
    (plan) => { plan.strategyMatrix.sameOpticalCaptureSequenceRequiredForAccuracyComparison = false; },
    (plan) => { plan.strategyMatrix.livePipelineRequiredForLatencyComparison = false; },
    (plan) => { plan.strategyMatrix.postInferenceTransformMayClaimRectifiedInferenceInput = true; },
    (plan) => { plan.strategyMatrix.previewMayEstablishInferenceInputState = true; },
    (plan) => { plan.strategyMatrix.selectionRuleSha256 = "c".repeat(64); },
    (plan) => { plan.strategyMatrix.strategyMayBeSelectedAfterSeeingResults = true; },
    (plan) => { plan.strategyMatrix.crossTargetStrategyRescueAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("preserves independent calibration and validation sampling", async () => {
  for (const mutate of [
    (plan) => { plan.calibrationTargetMatrix.distortionModelCandidateIds.pop(); },
    (plan) => { plan.calibrationTargetMatrix.selectedDistortionModelByCameraMode = {}; },
    (plan) => { plan.calibrationTargetMatrix.coveragePositionIds.pop(); },
    (plan) => { plan.calibrationTargetMatrix.distanceRoleIds.reverse(); },
    (plan) => { plan.calibrationTargetMatrix.minimumCalibrationImagesPerTargetConfiguration = 29; },
    (plan) => { plan.calibrationTargetMatrix.requiredCalibrationImageCount = 89; },
    (plan) => { plan.calibrationTargetMatrix.requiredIndependentValidationImageCount = 59; },
    (plan) => { plan.calibrationTargetMatrix.calibrationAndValidationImagesMustBeDisjoint = false; },
    (plan) => { plan.calibrationTargetMatrix.independentTargetGeometryRequired = false; },
    (plan) => { plan.calibrationTargetMatrix.manufacturerCoefficientsMaySubstituteMeasuredCalibration = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("preserves all 22680 blocking trials and exposure-based 9000-frame latency matrix", async () => {
  assert.deepEqual(tracked.poseAndActionMatrix.positionIds, [...LENS_POSITION_IDS]);
  for (const mutate of [
    (plan) => { plan.poseAndActionMatrix.blockingPersonaClasses.pop(); },
    (plan) => { plan.poseAndActionMatrix.positionIds.pop(); },
    (plan) => { plan.poseAndActionMatrix.postureIds.pop(); },
    (plan) => { plan.poseAndActionMatrix.validTrialsPerCell = 19; },
    (plan) => { plan.poseAndActionMatrix.requiredBlockingCellCount = 1133; },
    (plan) => { plan.poseAndActionMatrix.requiredBlockingTrialCount = 22679; },
    (plan) => { plan.poseAndActionMatrix.centerOrAggregateEvidenceMayRescueEdgeFailure = true; },
    (plan) => { plan.latencyMatrix.minimumMeasuredFramesPerCell = 999; },
    (plan) => { plan.latencyMatrix.requiredMeasuredFrameCount = 8999; },
    (plan) => { plan.latencyMatrix.exposureTimestampRequired = false; },
    (plan) => { plan.latencyMatrix.captureArrivalTimestampMaySubstituteExposureTimestamp = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("rejects incomplete, reusable, self-authorizing, or premature stored calibration artifacts", async () => {
  for (const mutate of [
    (plan) => { plan.storedCalibrationArtifact.requiredFields.pop(); },
    (plan) => { plan.storedCalibrationArtifact.exactCameraModeOrientationCropAndTargetBindingRequired = false; },
    (plan) => { plan.storedCalibrationArtifact.rawImagesOrVideoAllowedInArtifact = true; },
    (plan) => { plan.storedCalibrationArtifact.crossCameraModeTargetOrCropReuseAllowed = true; },
    (plan) => { plan.storedCalibrationArtifact.unknownArtifactVersionFailsClosed = false; },
    (plan) => { plan.storedCalibrationArtifact.identityOrValidityMismatchFailsClosed = false; },
    (plan) => { plan.storedCalibrationArtifact.writableArtifactMaySelfAuthorize = true; },
    (plan) => { plan.storedCalibrationArtifact.artifactPath = "calibration.json"; },
    (plan) => { plan.storedCalibrationArtifact.artifactSha256 = "d".repeat(64); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("rejects evidence shortcuts, invented gates, unsafe data, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.inferenceInputRectificationStateRequiresInstrumentedBoundaryEvidence = false; },
    (plan) => { plan.measurements.postInferenceCoordinatesMaySubstitutePixelInputEvidence = true; },
    (plan) => { plan.measurements.calibrationUiStateMaySubstitutePhysicalValidation = true; },
    (plan) => { plan.acceptance.maximumIndependentReprojectionErrorMilliPixels = 1000; },
    (plan) => { plan.acceptance.maximumExposureToActionReceiptMsP95 = 121; },
    (plan) => { plan.acceptance.minimumActionPrecisionPpm = 949999; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.dataPolicy.rawFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.exifGpsAndStableDeviceIdentifiersMustBeRemoved = false; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedBlockingTrialCount = 22680; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLensDistortionRectificationPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.rectificationChosen = true;
  await assert.rejects(validateLensDistortionRectificationPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseLensDistortionRectificationPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseLensDistortionRectificationPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseLensDistortionRectificationPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseLensDistortionRectificationPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(parseLensDistortionRectificationPlanBytes(Buffer.alloc(192 * 1024 + 1)));
});
