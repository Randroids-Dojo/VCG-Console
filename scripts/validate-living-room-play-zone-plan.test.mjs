import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseLivingRoomPlayZonePlanBytes,
  validateLivingRoomPlayZonePlan,
} from "./validate-living-room-play-zone-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/room-survey/living-room-play-zone-plan-v1.json"));
const tracked = await parseLivingRoomPlayZonePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-001/I-002 survey", () => {
  assert.equal(tracked.requiredMeasurements.length, 12);
  assert.equal(tracked.hazardClasses.length, 12);
  assert.equal(tracked.playZonePolicy.minimumWidthMm, 2438.4);
});

test("rejects source substitution and invented room evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateLivingRoomPlayZonePlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.surveyBoundary.roomAlias = "living-room"; },
    (plan) => { plan.surveyBoundary.annotatedFloorPlanSha256 = "a".repeat(64); },
    (plan) => { plan.cameraCoveragePolicy.cameraIdentitySha256 = "b".repeat(64); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("preserves the exact coordinate system and refuses estimates", async () => {
  for (const mutate of [
    (plan) => { plan.coordinateSystem.unit = "inches"; },
    (plan) => { plan.coordinateSystem.origin = "room corner"; },
    (plan) => { plan.coordinateSystem.yAxis = "positive toward TV"; },
    (plan) => { plan.coordinateSystem.dimensionsUseFinishedAccessibleSurfaces = false; },
    (plan) => { plan.coordinateSystem.estimatedValuesMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("rejects measurement or hazard deletion, reordering, and substitution", async () => {
  for (const mutate of [
    (plan) => { plan.requiredMeasurements.pop(); },
    (plan) => { plan.requiredMeasurements.reverse(); },
    (plan) => { plan.requiredMeasurements[0].measurementId = "approximate-room"; },
    (plan) => { plan.hazardClasses.pop(); },
    (plan) => { plan.hazardClasses.reverse(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("preserves the measured 8 by 8 foot zone and non-rescuing four-player boundary", async () => {
  for (const mutate of [
    (plan) => { plan.playZonePolicy.minimumWidthMm = 2438.3; },
    (plan) => { plan.playZonePolicy.minimumDepthMm = 2438.3; },
    (plan) => { plan.playZonePolicy.minimumAreaSquareMm = 5945792; },
    (plan) => { plan.playZonePolicy.zoneMustNotOverlapHazardEnvelope = false; },
    (plan) => { plan.playZonePolicy.zoneMustPreserveHouseholdEgress = false; },
    (plan) => { plan.playZonePolicy.oneAndTwoPlayerSubzonesMustBeMarked = false; },
    (plan) => { plan.playZonePolicy.laterFourPlayerZoneRequiredForQualification = true; },
    (plan) => { plan.playZonePolicy.laterFourPlayerZoneMayRescueRequiredZone = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("rejects posture and physical camera coverage weakening", async () => {
  for (const mutate of [
    (plan) => { plan.playerPostures.pop(); },
    (plan) => { plan.playerPostures[0].requiredForOneTwoPlayerZone = false; },
    (plan) => { plan.cameraCoveragePolicy.requiredPlacementRole = "desktop-camera"; },
    (plan) => { plan.cameraCoveragePolicy.fixedApplianceOpticalAxisSelected = true; },
    (plan) => { plan.cameraCoveragePolicy.cameraPreviewMayEstablishCoverage = true; },
    (plan) => { plan.cameraCoveragePolicy.diagramMayEstablishCoverage = true; },
    (plan) => { plan.cameraCoveragePolicy.fourPlayerCoverageMayRescueOneTwoPlayerFailure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("rejects raw home evidence, identifiers, credentials, and missing redacted views", async () => {
  for (const mutate of [
    (plan) => { plan.photoEvidencePolicy.requiredRedactedViewRoles.pop(); },
    (plan) => { plan.photoEvidencePolicy.rawHomePhotosAllowedInRepository = true; },
    (plan) => { plan.photoEvidencePolicy.rawHomePhotosAllowedInReleasedEvidence = true; },
    (plan) => { plan.photoEvidencePolicy.exifGpsAndDeviceMetadataMustBeRemoved = false; },
    (plan) => { plan.photoEvidencePolicy.facesNamesAddressesMailScreensReflectionsAndHouseholdIdentifiersMustBeRedacted = false; },
    (plan) => { plan.photoEvidencePolicy.wifiNamesCredentialsMacIpAndTrafficAllowed = true; },
    (plan) => { plan.photoEvidencePolicy.stableTvCameraRouterOrDeviceSerialsAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("rejects invented gates, evidence shortcuts, mutation authority, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.minimumObstacleClearanceMm = 500; },
    (plan) => { plan.acceptance.maximumRequiredZoneHazardOverlaps = 1; },
    (plan) => { plan.acceptance.photoMaySubstituteMeasurement = true; },
    (plan) => { plan.acceptance.emptyRoomMaySubstituteNormalFurnitureConfiguration = true; },
    (plan) => { plan.executionGate.photographyAuthorized = true; },
    (plan) => { plan.executionGate.furnitureOrFixtureMutationAuthorized = true; },
    (plan) => { plan.executionGate.mountingCuttingDrillingOrPurchaseAuthorized = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateLivingRoomPlayZonePlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.roomName = "private";
  await assert.rejects(validateLivingRoomPlayZonePlan(extra), /fields drifted/u);
  await assert.rejects(parseLivingRoomPlayZonePlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseLivingRoomPlayZonePlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseLivingRoomPlayZonePlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parseLivingRoomPlayZonePlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseLivingRoomPlayZonePlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
