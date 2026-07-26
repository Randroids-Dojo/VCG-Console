import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAMERA_CABLE_LENGTH_ROLES,
  CAMERA_CABLE_TARGETS,
  parseCrossTierCameraCablePlanBytes,
  validateCrossTierCameraCablePlan,
} from "./validate-cross-tier-camera-cable-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"));
const tracked = await parseCrossTierCameraCablePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-038 cable campaign", () => {
  assert.deepEqual(tracked.uvcSustainedMatrix.targetIds, [...CAMERA_CABLE_TARGETS]);
  assert.deepEqual(tracked.uvcSustainedMatrix.passiveCableLengthRoles, [...CAMERA_CABLE_LENGTH_ROLES]);
  assert.equal(tracked.uvcSustainedMatrix.requiredCellCount, 72);
  assert.equal(tracked.recoveryMatrix.requiredCycleCount, 1200);
});

test("rejects source substitution", async () => {
  const plan = clone(); plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateCrossTierCameraCablePlan(plan), /digest drifted/u);
});

test("rejects invented hardware, protocol, mutation, installation, and purchase authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.sharedCameraQualificationResultSha256 = "a".repeat(64); },
    (plan) => { plan.collectionBoundary.cableInventoryAndIdentitySha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.cameraOperationAuthorized = true; },
    (plan) => { plan.collectionBoundary.hotPlugAndSuspendMutationAuthorized = true; },
    (plan) => { plan.collectionBoundary.mechanicalPullAndBendTestingAuthorized = true; },
    (plan) => { plan.collectionBoundary.enclosureOrFurnitureInstallationAuthorized = true; },
    (plan) => { plan.collectionBoundary.purchaseAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("preserves 72 one-hour sustained cells and genuine 1080p60", async () => {
  for (const mutate of [
    (plan) => { plan.uvcSustainedMatrix.targetIds.pop(); },
    (plan) => { plan.uvcSustainedMatrix.passiveCableLengthRoles.pop(); },
    (plan) => { plan.uvcSustainedMatrix.stressStateIds.pop(); },
    (plan) => { plan.uvcSustainedMatrix.exactCableLengthsAndBendRadiiMm = {}; },
    (plan) => { plan.uvcSustainedMatrix.requiredCellCount = 71; },
    (plan) => { plan.uvcSustainedMatrix.sustainedCaptureDurationMsPerCell = 3599999; },
    (plan) => { plan.uvcSustainedMatrix.requiredSustainedCaptureDurationMs = 259199999; },
    (plan) => { plan.uvcSustainedMatrix.genuine1920x1080At60FpsRequired = false; },
    (plan) => { plan.uvcSustainedMatrix.cableOrTargetAggregateMayRescueFailedCell = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("preserves 1200 recovery cycles and 100 pull cycles per route", async () => {
  for (const mutate of [
    (plan) => { plan.recoveryMatrix.scenarioIds.pop(); },
    (plan) => { plan.recoveryMatrix.validCyclesPerCell = 19; },
    (plan) => { plan.recoveryMatrix.requiredCellCount = 59; },
    (plan) => { plan.recoveryMatrix.requiredCycleCount = 1199; },
    (plan) => { plan.recoveryMatrix.failedCycleMayBeDeletedOrReplaced = true; },
    (plan) => { plan.mechanicalAndRoutingMatrix.requiredRouteRoles.pop(); },
    (plan) => { plan.mechanicalAndRoutingMatrix.requiredPullDirectionIds.pop(); },
    (plan) => { plan.mechanicalAndRoutingMatrix.pullCyclesPerDirection = 19; },
    (plan) => { plan.mechanicalAndRoutingMatrix.requiredPullCycleCountPerQualifiedRoute = 99; },
    (plan) => { plan.mechanicalAndRoutingMatrix.looseLoopTripOrPetSnagHazardMayQualify = true; },
    (plan) => { plan.mechanicalAndRoutingMatrix.adhesiveOnlyRetentionMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("keeps active USB and CSI extensions conditional and non-rescuing", async () => {
  for (const mutate of [
    (plan) => { plan.conditionalExtensionBoundary.activeUsbExtensionStatus = "qualified"; },
    (plan) => { plan.conditionalExtensionBoundary.activeUsbExtensionMayRescueARequiredPassiveCell = true; },
    (plan) => { plan.conditionalExtensionBoundary.activeUsbExtensionRequiresSeparatePowerLatencyRfRecoveryAndSafetyMatrix = false; },
    (plan) => { plan.conditionalExtensionBoundary.csiExtensionStatus = "qualified"; },
    (plan) => { plan.conditionalExtensionBoundary.csiEvidenceMayQualifyUvcOrAnotherTarget = true; },
    (plan) => { plan.conditionalExtensionBoundary.csiRequiresSupersedingCapturePathDecision = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("rejects evidence shortcuts and weakened or invented gates", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.usbEnumerationMayEstablishSustainedCapture = true; },
    (plan) => { plan.measurements.receivedFrameMayEstablishSignalStability = true; },
    (plan) => { plan.measurements.passingShortCableMayQualifyLongerCable = true; },
    (plan) => { plan.acceptance.minimumCapturedFrameRateMilliHz = 58999; },
    (plan) => { plan.acceptance.maximumDuplicateDroppedCorruptOrOutOfOrderFramesPerCell = 1; },
    (plan) => { plan.acceptance.minimumCameraVoltageMilliVolts = 4750; },
    (plan) => { plan.acceptance.maximumReconnectAndUsableCaptureMs = 5000; },
    (plan) => { plan.acceptance.anotherLengthRouteOrTargetMayRescueFailure = true; },
    (plan) => { plan.acceptance.safetyFailureMayBeRescuedBySignalQuality = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("rejects unsafe data, blocker weakening, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawRoomVideoAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.rawFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.networkNamesCredentialsAddressesAndTrafficAllowed = true; },
    (plan) => { plan.dataPolicy.stableDeviceSerialsAllowedInReleasedEvidence = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedRecoveryCycleCount = 1200; },
    (plan) => { plan.result.activeUsbExtensionQualified = true; },
    (plan) => { plan.result.csiExtensionQualified = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierCameraCablePlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.cable = "unknown";
  await assert.rejects(validateCrossTierCameraCablePlan(extra), /fields drifted/u);
  await assert.rejects(parseCrossTierCameraCablePlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseCrossTierCameraCablePlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseCrossTierCameraCablePlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])), /BOM/u);
  await assert.rejects(parseCrossTierCameraCablePlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseCrossTierCameraCablePlanBytes(Buffer.alloc(160 * 1024 + 1)));
});
