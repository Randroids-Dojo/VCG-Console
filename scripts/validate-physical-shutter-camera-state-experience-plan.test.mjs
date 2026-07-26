import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PHYSICAL_CAMERA_BLOCKERS,
  PHYSICAL_CAMERA_CAPTURE_PATH_IDS,
  PHYSICAL_CAMERA_PERSONAS,
  PHYSICAL_CAMERA_SOFTWARE_STATE_IDS,
  PHYSICAL_CAMERA_SURFACE_IDS,
  PHYSICAL_CAMERA_TARGET_IDS,
  parsePhysicalShutterCameraStateExperiencePlanBytes,
  validatePhysicalShutterCameraStateExperiencePlan,
} from "./validate-physical-shutter-camera-state-experience-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/camera-state/physical-shutter-camera-state-experience-plan-v1.json",
));
const tracked = await parsePhysicalShutterCameraStateExperiencePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

async function rejectsMutations(mutations) {
  for (const mutate of mutations) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePhysicalShutterCameraStateExperiencePlan(plan));
  }
}

test("accepts the tracked blocked zero-result I-046 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.opticalShutterMatrix.requiredObservationCount, 1440);
  assert.equal(tracked.shutterTransitionCampaign.requiredCycleCount, 600);
  assert.equal(tracked.indicatorTruthMatrix.requiredObservationCount, 11520);
  assert.equal(tracked.lifecycleTransitionCampaign.requiredCycleCount, 1920);
  assert.equal(tracked.negativeSessionCampaign.requiredSessionCount, 48);
  assert.equal(tracked.cameraFreeRenderMatrix.requiredRenderCellCount, 72);
  assert.equal(tracked.humanComprehensionPhase.requiredTrialCount, 57600);
  assert.equal(tracked.humanReachVisibilityPhase.requiredTrialCount, 4800);
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutations([
    (plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); },
    (plan) => { plan.sourceBindings[3].role = "camera-state-copy"; },
    (plan) => { plan.sourceBindings.reverse(); },
    (plan) => { plan.sourceBindings.pop(); },
  ]);
});

test("rejects target or capture-path substitution, invented receipt, or operation authority", async () => {
  assert.deepEqual(tracked.targetPackageRoles.map(({ targetId }) => targetId), [
    ...PHYSICAL_CAMERA_TARGET_IDS,
  ]);
  assert.deepEqual(tracked.capturePathRoles.map(({ pathId }) => pathId), [
    ...PHYSICAL_CAMERA_CAPTURE_PATH_IDS,
  ]);
  await rejectsMutations([
    (plan) => { plan.targetPackageRoles.pop(); },
    (plan) => { plan.targetPackageRoles.reverse(); },
    (plan) => { plan.targetPackageRoles[0].cameraPlacement = "integrated"; },
    (plan) => { plan.targetPackageRoles[0].exactReceivedCameraEnclosureManifestSha256 = "a".repeat(64); },
    (plan) => { plan.targetPackageRoles[0].operationAuthorized = true; },
    (plan) => { plan.capturePathRoles.pop(); },
    (plan) => { plan.capturePathRoles[0].currentStatus = "production-native-authority"; },
    (plan) => { plan.capturePathRoles[2].requiredInConservativeInventory = false; },
    (plan) => { plan.capturePathRoles[3].operationAuthorized = true; },
  ]);
});

test("preserves separate software access, stream activity, and unsensed shutter truth", async () => {
  assert.deepEqual(tracked.softwareTruthContract.states.map(({ stateId }) => stateId), [
    ...PHYSICAL_CAMERA_SOFTWARE_STATE_IDS,
  ]);
  await rejectsMutations([
    (plan) => { plan.softwareTruthContract.physicalShutterState = "CLOSED"; },
    (plan) => { plan.softwareTruthContract.physicalShutterDetailMustRequireDirectCheck = false; },
    (plan) => { plan.softwareTruthContract.streamActivityMayProveOpenShutterUsefulFramesTrackerHealthOrMotionAvailability = true; },
    (plan) => { plan.softwareTruthContract.blackFrameMissingLandmarksStoppedTrackerIndicatorOrSoftwareBadgeMayProveShutterPosition = true; },
    (plan) => { plan.softwareTruthContract.states.pop(); },
    (plan) => { plan.softwareTruthContract.states[0].softwareAccess = "BLOCKED"; },
    (plan) => { plan.softwareTruthContract.states[3].streamActivity = "NO STREAM"; },
    (plan) => { plan.softwareTruthContract.hostedGameMayReplaceContradictOrHideConsoleOwnedState = true; },
    (plan) => { plan.softwareTruthContract.unknownStaleOrContradictoryAuthorityStopsCapture = false; },
  ]);
});

test("rejects invented protocols, purchase, physical operation, participants, or claims", async () => {
  await rejectsMutations([
    (plan) => { plan.authorityBoundary.exactReceivedTargetManifestSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.completeCapturePathAndNativeLeaseInventorySha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.cameraOrEnclosureSelectionPurchaseOrReceiptAuthorized = true; },
    (plan) => { plan.authorityBoundary.devicePowerCaptureOrShutterCyclingAuthorized = true; },
    (plan) => { plan.authorityBoundary.indicatorObservationAuthorized = true; },
    (plan) => { plan.authorityBoundary.idleSuspendDisconnectCrashOrRecoveryInjectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.cameraFreeProductSurfaceImplementationAuthorized = true; },
    (plan) => { plan.authorityBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.authorityBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.authorityBoundary.accessibilityStudyAuthorized = true; },
    (plan) => { plan.authorityBoundary.temporaryDiagnosticCaptureAuthorized = true; },
    (plan) => { plan.authorityBoundary.resultPublicationQualificationOrProductClaimAuthorized = true; },
  ]);
});

test("requires all 72 optical cells, 1440 observations, and independent shutter truth", async () => {
  await rejectsMutations([
    (plan) => { plan.opticalShutterMatrix.targetIds.pop(); },
    (plan) => { plan.opticalShutterMatrix.operatorVerifiedShutterPositionIds.pop(); },
    (plan) => { plan.opticalShutterMatrix.lightingConditionIds.pop(); },
    (plan) => { plan.opticalShutterMatrix.calibratedFixtureIds.pop(); },
    (plan) => { plan.opticalShutterMatrix.validObservationsPerCell = 19; },
    (plan) => { plan.opticalShutterMatrix.requiredCellCount = 71; },
    (plan) => { plan.opticalShutterMatrix.requiredObservationCount = 1439; },
    (plan) => { plan.opticalShutterMatrix.independentShutterPositionAndOpticalGroundTruthRequired = false; },
    (plan) => { plan.opticalShutterMatrix.imageDarknessOrTrackerOutputMayLabelShutterPositionOrBlocking = true; },
    (plan) => { plan.opticalShutterMatrix.oneTargetPositionLightingFixtureOrObservationMayRescueAnother = true; },
  ]);
});

test("requires all 600 shutter transitions without hidden wear, stop, or recovery", async () => {
  await rejectsMutations([
    (plan) => { plan.shutterTransitionCampaign.targetIds.pop(); },
    (plan) => { plan.shutterTransitionCampaign.transitionIds.pop(); },
    (plan) => { plan.shutterTransitionCampaign.validCyclesPerTargetTransitionCell = 49; },
    (plan) => { plan.shutterTransitionCampaign.requiredTargetTransitionCellCount = 11; },
    (plan) => { plan.shutterTransitionCampaign.requiredCycleCount = 599; },
    (plan) => { plan.shutterTransitionCampaign.jamPartialCoverageReboundWearForceContradictionStopRetryAndInvalidCyclesRemainVisible = false; },
    (plan) => { plan.shutterTransitionCampaign.laterSuccessOrAnotherTargetTransitionMayRescueFailure = true; },
  ]);
});

test("requires the complete indicator truth table and rejects intent or power lamps", async () => {
  await rejectsMutations([
    (plan) => { plan.indicatorTruthMatrix.targetIds.pop(); },
    (plan) => { plan.indicatorTruthMatrix.capturePathIds.pop(); },
    (plan) => { plan.indicatorTruthMatrix.lifecycleRows.pop(); },
    (plan) => { plan.indicatorTruthMatrix.lifecycleRows[3].cameraCaptureExpected = false; },
    (plan) => { plan.indicatorTruthMatrix.lifecycleRows[3].hardwareActivityIndicatorExpected = "off"; },
    (plan) => { plan.indicatorTruthMatrix.lifecycleRows[10].softwareStateId = "disabled"; },
    (plan) => { plan.indicatorTruthMatrix.lightingConditionIds.pop(); },
    (plan) => { plan.indicatorTruthMatrix.validObservationsPerCell = 19; },
    (plan) => { plan.indicatorTruthMatrix.requiredCellCount = 575; },
    (plan) => { plan.indicatorTruthMatrix.requiredObservationCount = 11519; },
    (plan) => { plan.indicatorTruthMatrix.independentOsDeviceApplicationIndicatorAndShutterObservationRequired = false; },
    (plan) => { plan.indicatorTruthMatrix.powerOnlyOrApplicationIntentLampMayQualifyCaptureActivityIndicator = true; },
    (plan) => { plan.indicatorTruthMatrix.oneTargetPathStateLightingOrObservationMayRescueAnother = true; },
  ]);
});

test("requires fail-closed lifecycle transitions and all capture-absent sessions", async () => {
  await rejectsMutations([
    (plan) => { plan.lifecycleTransitionCampaign.transitionIds.pop(); },
    (plan) => { plan.lifecycleTransitionCampaign.validCyclesPerTargetPathTransitionCell = 19; },
    (plan) => { plan.lifecycleTransitionCampaign.requiredTargetPathTransitionCellCount = 95; },
    (plan) => { plan.lifecycleTransitionCampaign.requiredCycleCount = 1919; },
    (plan) => { plan.lifecycleTransitionCampaign.captureReleaseIndicatorOffStaleStateRejectionAndExplicitRecoveryRequired = false; },
    (plan) => { plan.lifecycleTransitionCampaign.automaticResumeRetryOrLaterSuccessMayHideFailure = true; },
    (plan) => { plan.negativeSessionCampaign.capturePathIds.pop(); },
    (plan) => { plan.negativeSessionCampaign.minimumMeasuredSecondsPerSession = 899; },
    (plan) => { plan.negativeSessionCampaign.requiredSessionCount = 47; },
    (plan) => { plan.negativeSessionCampaign.unexpectedAccessIndicatorStreamFrameAutoRetryOrNetworkEgressIsFailure = false; },
    (plan) => { plan.negativeSessionCampaign.oneSessionTargetPathOrLightingConditionMayRescueAnother = true; },
  ]);
});

test("requires every render, comprehension, and reach cell without cross-persona rescue", async () => {
  assert.deepEqual(tracked.cameraFreeRenderMatrix.surfaceIds, [...PHYSICAL_CAMERA_SURFACE_IDS]);
  assert.deepEqual(tracked.humanComprehensionPhase.personaClasses, [...PHYSICAL_CAMERA_PERSONAS]);
  await rejectsMutations([
    (plan) => { plan.cameraFreeRenderMatrix.surfaceIds.pop(); },
    (plan) => { plan.cameraFreeRenderMatrix.softwareStateIds.pop(); },
    (plan) => { plan.cameraFreeRenderMatrix.resolutionIds.pop(); },
    (plan) => { plan.cameraFreeRenderMatrix.requiredRenderCellCount = 71; },
    (plan) => { plan.cameraFreeRenderMatrix.unimplementedMissingOverflowingOverlappingOrInaccessibleSurfaceFails = false; },
    (plan) => { plan.cameraFreeRenderMatrix.renderEvidenceMayEstablishComprehensionPhysicalIndicatorVisibilityOrFinalLocation = true; },
    (plan) => { plan.humanComprehensionPhase.status = "ready"; },
    (plan) => { plan.humanComprehensionPhase.personaClasses.pop(); },
    (plan) => { plan.humanComprehensionPhase.viewingDistanceMm.pop(); },
    (plan) => { plan.humanComprehensionPhase.viewingAngleDegrees.pop(); },
    (plan) => { plan.humanComprehensionPhase.taskIds.pop(); },
    (plan) => { plan.humanComprehensionPhase.validTrialsPerCell = 19; },
    (plan) => { plan.humanComprehensionPhase.requiredCellCount = 2879; },
    (plan) => { plan.humanComprehensionPhase.requiredTrialCount = 57599; },
    (plan) => { plan.humanComprehensionPhase.correctButtonUseMayHideFalsePrivacyInference = true; },
    (plan) => { plan.humanReachVisibilityPhase.status = "ready"; },
    (plan) => { plan.humanReachVisibilityPhase.taskIds.pop(); },
    (plan) => { plan.humanReachVisibilityPhase.approachPositionIds.pop(); },
    (plan) => { plan.humanReachVisibilityPhase.requiredCellCount = 239; },
    (plan) => { plan.humanReachVisibilityPhase.requiredTrialCount = 4799; },
    (plan) => { plan.humanReachVisibilityPhase.unsafeZoneEntryOrAssistanceMayBeHiddenByTaskCompletion = true; },
  ]);
});

test("rejects self-labeling, hidden worst cases, weakened fixed gates, or post-result gates", async () => {
  await rejectsMutations([
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.independentGroundTruthRequired = false; },
    (plan) => { plan.measurements.cameraFrameTrackerSoftwareStateOrIndicatorMaySelfLabelAnotherFact = true; },
    (plan) => { plan.measurements.vendorClaimScreenshotOneParticipantMeanOrBestCaseMaySubstituteMeasurement = true; },
    (plan) => { plan.fixedAcceptance.minimumValidObservationsPerPhysicalMatrixCell = 19; },
    (plan) => { plan.fixedAcceptance.maximumActiveCaptureWithoutQualifiedHardwareActivityIndicator = 1; },
    (plan) => { plan.fixedAcceptance.maximumSoftwareOpenOrClosedShutterClaims = 1; },
    (plan) => { plan.fixedAcceptance.maximumAutomaticCaptureRestartsAfterIdleSuspendDisconnectOrCrash = 1; },
    (plan) => { plan.fixedAcceptance.allOpenGatesMustBeFrozenBeforeOperation = false; },
    (plan) => { plan.fixedAcceptance.aggregateRecoveryCrossTargetPathStateSurfaceOrPersonaRescueAllowed = true; },
    (plan) => { plan.openAcceptance.minimumClosedShutterOpticalAttenuation = 1; },
    (plan) => { plan.openAcceptance.minimumNotSensedShutterComprehensionPpm = 950000; },
    (plan) => { plan.openAcceptance.maximumParticipantDiscomfortEventsPerCell = 0; },
  ]);
});

test("rejects unsafe data, missing blockers, premature results, selection, or claims", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...PHYSICAL_CAMERA_BLOCKERS]);
  await rejectsMutations([
    (plan) => { plan.dataPolicy.rawCameraRoomOpticalAudioPortraitOrVideoAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.participantNamesFacesVoicesExactAgesAddressesAccessibilityNotesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.deviceSerialsPathsCredentialsProviderMessagesSecretsOrUnredactedLogsAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextResultEvidenceAllowed = true; },
    (plan) => { plan.dataPolicy.audioCollectionAllowed = true; },
    (plan) => { plan.dataPolicy.networkEgressAllowed = true; },
    (plan) => { plan.executionGate.status = "ready"; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "pass"; },
    (plan) => { plan.result.receivedTargetPackageCount = 1; },
    (plan) => { plan.result.participantCount = 1; },
    (plan) => { plan.result.completedIndicatorObservationCount = 1; },
    (plan) => { plan.result.qualifiedSurfaceIds.push(PHYSICAL_CAMERA_SURFACE_IDS[0]); },
    (plan) => { plan.result.selectedCameraEnclosureOrSurfaceIds.push("selected"); },
    (plan) => { plan.result.publishedQualificationOrProductClaim = "qualified"; },
  ]);
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const withUnknown = clone();
  withUnknown.result.note = "hidden";
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.from(
    `${JSON.stringify(withUnknown, null, 2)}\n`,
  )));

  const text = trackedBytes.toString("utf8");
  const duplicate = text.replace(
    '  "format":',
    '  "format": "duplicate",\n  "format":',
  );
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.from(duplicate)));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.from(JSON.stringify(tracked))));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(trackedBytes.subarray(0, -1)));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes,
  ])));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.from([0xc3, 0x28])));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.from(text.replace("\n", "\r"))));
  await assert.rejects(parsePhysicalShutterCameraStateExperiencePlanBytes(Buffer.alloc(192 * 1024 + 1, 0x20)));
});
