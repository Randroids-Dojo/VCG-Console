import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXTERNAL_MOUNT_ROLES,
  GEOMETRY_BLOCKING_PERSONAS,
  GEOMETRY_ZONE_POINTS,
  parseCrossTierCameraGeometryPlanBytes,
  validateCrossTierCameraGeometryPlan,
} from "./validate-cross-tier-camera-geometry-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json",
));
const tracked = await parseCrossTierCameraGeometryPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-037/I-193/I-194 geometry campaign", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.integratedScreeningMatrix.requiredGeometricScreenCellCount, 405);
  assert.equal(tracked.externalScreeningMatrix.requiredGeometricScreenCellCount, 50);
  assert.equal(tracked.blockingValidationMatrix.requiredBlockingCellCount, 550);
  assert.equal(tracked.blockingValidationMatrix.requiredBlockingTrialCount, 11000);
  assert.equal(tracked.calibrationAndSetupMatrix.requiredCalibrationCycleCount, 220);
});

test("rejects source substitution and stale source bytes", async () => {
  const plan = clone(); plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateCrossTierCameraGeometryPlan(plan), /digest drifted/u);
});

test("rejects invented room, camera, target, participant, construction, or purchase authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.selectedRoomSurveyResultSha256 = "a".repeat(64); },
    (plan) => { plan.collectionBoundary.selectedCameraQualificationResultSha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.integratedPrototypeConfigurationSha256 = "c".repeat(64); },
    (plan) => { plan.collectionBoundary.roomAccessAuthorized = true; },
    (plan) => { plan.collectionBoundary.participantSessionsAuthorized = true; },
    (plan) => { plan.collectionBoundary.mountingOrFurnitureMutationAuthorized = true; },
    (plan) => { plan.collectionBoundary.cuttingDrillingOrConstructionAuthorized = true; },
    (plan) => { plan.collectionBoundary.purchaseAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("preserves all 405 integrated screening combinations without advertised or preview substitution", async () => {
  for (const mutate of [
    (plan) => { plan.integratedScreeningMatrix.enclosureHeightRoles.pop(); },
    (plan) => { plan.integratedScreeningMatrix.tvStandDepthRoles.reverse(); },
    (plan) => { plan.integratedScreeningMatrix.playerDistanceRoles.pop(); },
    (plan) => { plan.integratedScreeningMatrix.roomWidthRoles.reverse(); },
    (plan) => { plan.integratedScreeningMatrix.pitchCandidateRoles.pop(); },
    (plan) => { plan.integratedScreeningMatrix.exactRoleValuesMmOrDegrees = {}; },
    (plan) => { plan.integratedScreeningMatrix.requiredGeometricScreenCellCount = 404; },
    (plan) => { plan.integratedScreeningMatrix.advertisedFieldOfViewMaySubstituteMeasuredGeometry = true; },
    (plan) => { plan.integratedScreeningMatrix.previewOrDiagramMaySubstitutePhysicalGeometry = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("preserves the external target, mount, zone, and non-rescue matrix", async () => {
  assert.deepEqual(tracked.externalScreeningMatrix.mountRoleIds, [...EXTERNAL_MOUNT_ROLES]);
  assert.deepEqual(tracked.externalScreeningMatrix.zonePointIds, [...GEOMETRY_ZONE_POINTS]);
  for (const mutate of [
    (plan) => { plan.externalScreeningMatrix.targetTierIds.pop(); },
    (plan) => { plan.externalScreeningMatrix.mountRoleIds.pop(); },
    (plan) => { plan.externalScreeningMatrix.mountRoleIds.reverse(); },
    (plan) => { plan.externalScreeningMatrix.zonePointIds.pop(); },
    (plan) => { plan.externalScreeningMatrix.requiredGeometricScreenCellCount = 49; },
    (plan) => { plan.externalScreeningMatrix.minimumQualifiedMountRolesPerTargetTier = 0; },
    (plan) => { plan.externalScreeningMatrix.unsupportedMountRolesMustRemainDocumented = false; },
    (plan) => { plan.externalScreeningMatrix.steamEvidenceMayQualifySupportedPc = true; },
    (plan) => { plan.externalScreeningMatrix.supportedPcEvidenceMayQualifySteam = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("preserves both blocking personas, 11000 trials, and 220 calibration cycles", async () => {
  assert.deepEqual(tracked.blockingValidationMatrix.blockingPersonaClasses, [...GEOMETRY_BLOCKING_PERSONAS]);
  for (const mutate of [
    (plan) => { plan.blockingValidationMatrix.blockingPersonaClasses.pop(); },
    (plan) => { plan.blockingValidationMatrix.exploratoryPersonaClasses.pop(); },
    (plan) => { plan.blockingValidationMatrix.motionIds.pop(); },
    (plan) => { plan.blockingValidationMatrix.validTrialsPerCell = 19; },
    (plan) => { plan.blockingValidationMatrix.requiredBlockingCellCount = 549; },
    (plan) => { plan.blockingValidationMatrix.requiredBlockingTrialCount = 10999; },
    (plan) => { plan.blockingValidationMatrix.exploratoryEvidenceMayRescueBlockingFailure = true; },
    (plan) => { plan.blockingValidationMatrix.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.calibrationAndSetupMatrix.calibrationCyclesPerConfiguration = 19; },
    (plan) => { plan.calibrationAndSetupMatrix.requiredCalibrationCycleCount = 219; },
    (plan) => { plan.calibrationAndSetupMatrix.setupErrorScenarioIds.pop(); },
    (plan) => { plan.calibrationAndSetupMatrix.manualHiddenCalibrationMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("rejects physical-evidence shortcuts, invented gates, and cross-tier rescue", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredPhysicalMeasurements.pop(); },
    (plan) => { plan.measurements.independentOpticalAndFloorGroundTruthRequired = false; },
    (plan) => { plan.measurements.physicalPictureMayBeInferredFromCalibrationState = true; },
    (plan) => { plan.measurements.cameraPreviewMayEstablishFullBodyOrFloorCoverage = true; },
    (plan) => { plan.measurements.actionAccuracyMayBeInferredFromLandmarkVisibility = true; },
    (plan) => { plan.measurements.mountStabilityMayBeInferredFromStaticDimensions = true; },
    (plan) => { plan.acceptance.minimumHorizontalFieldOfViewMilliDegrees = 90000; },
    (plan) => { plan.acceptance.maximumFloorPlaneErrorMm = 20; },
    (plan) => { plan.acceptance.minimumActionPrecisionPpm = 949999; },
    (plan) => { plan.acceptance.minimumActionRecallPpm = 899999; },
    (plan) => { plan.acceptance.maximumUsbCaptureErrorsOrDrops = 1; },
    (plan) => { plan.acceptance.externalPlacementMayRescueIntegratedFailure = true; },
    (plan) => { plan.acceptance.integratedPlacementMayRescueExternalFailure = true; },
    (plan) => { plan.acceptance.seatedOrLimitedRangeEvidenceMayRescueBlockingFailure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("rejects unsafe home evidence, blocker weakening, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawHomeVideoAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.rawFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.exifGpsAndDeviceMetadataMustBeRemoved = false; },
    (plan) => { plan.dataPolicy.facesNamesAddressesScreensReflectionsAndHouseholdIdentifiersMustBeRedacted = false; },
    (plan) => { plan.dataPolicy.networkNamesCredentialsAddressesAndTrafficAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedBlockingTrialCount = 11000; },
    (plan) => { plan.result.selectedIntegratedFixedPitchMilliDegrees = 5000; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraGeometryPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.selectedPitch = 5;
  await assert.rejects(validateCrossTierCameraGeometryPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseCrossTierCameraGeometryPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseCrossTierCameraGeometryPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseCrossTierCameraGeometryPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseCrossTierCameraGeometryPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(parseCrossTierCameraGeometryPlanBytes(Buffer.alloc(192 * 1024 + 1)));
});
