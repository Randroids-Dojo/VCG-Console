import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IR_BLOCKERS,
  IR_COMPOUND_SCENE_IDS,
  IR_MODE_IDS,
  IR_TRANSITION_IDS,
  parseCrossDeviceIrInterferenceSafetyPlanBytes,
  validateCrossDeviceIrInterferenceSafetyPlan,
} from "./validate-cross-device-ir-interference-safety-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/depth-interference/cross-device-ir-interference-safety-plan-v1.json",
));
const tracked = await parseCrossDeviceIrInterferenceSafetyPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

async function rejectsMutations(mutations) {
  for (const mutate of mutations) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateCrossDeviceIrInterferenceSafetyPlan(plan));
  }
}

test("accepts the tracked blocked zero-result I-045 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.deepEqual(tracked.candidateModes.map(({ modeId }) => modeId), [...IR_MODE_IDS]);
  assert.equal(tracked.benchMatrix.requiredTotalCellCount, 756);
  assert.equal(tracked.benchMatrix.requiredTotalRunCount, 15120);
  assert.equal(tracked.transitionCampaign.requiredTransitionCycleCount, 1120);
  assert.equal(tracked.soakCampaign.requiredSoakCount, 21);
  assert.equal(tracked.humanPhase.requiredTrialCount, 42000);
  assert.equal(tracked.humanPhase.requiredParticipantAbsentNegativeSessionCount, 126);
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutations([
    (plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); },
    (plan) => { plan.sourceBindings[1].role = "camera-candidate"; },
    (plan) => { plan.sourceBindings.reverse(); },
    (plan) => { plan.sourceBindings.pop(); },
  ]);
});

test("rejects mode substitution, cross-mode rescue, or invented D455 wavelength", async () => {
  await rejectsMutations([
    (plan) => { plan.candidateModes.pop(); },
    (plan) => { plan.candidateModes.reverse(); },
    (plan) => { plan.candidateModes[0].exactSkuOrModel = "A00111"; },
    (plan) => { plan.candidateModes[1].nominalWavelengthNm = 850; },
    (plan) => { plan.candidateModes[2].modeClass = "active-dot-stereo"; },
    (plan) => { plan.candidateModes[4].nominalWavelengthNm = 940; },
    (plan) => { plan.candidateModes[6].nominalWavelengthNm = 850; },
    (plan) => { plan.candidateModes[6].wavelengthStatus = "assumed-common-d4xx"; },
    (plan) => { plan.candidateModes[6].blocking = false; },
    (plan) => { plan.candidateModes[1].operationAuthorized = true; },
  ]);
});

test("rejects invented manifests, device use, emitters, staging, people, diagnostics, or decisions", async () => {
  await rejectsMutations([
    (plan) => { plan.authorityBoundary.exactReceivedDeviceManifestSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.externalIrDeviceAndStateProtocolSha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.deviceAccessOrOperationAuthorized = true; },
    (plan) => { plan.authorityBoundary.irEmitterFloodOrExternalSourceUseAuthorized = true; },
    (plan) => { plan.authorityBoundary.sunlightReflectiveOrCompoundStagingAuthorized = true; },
    (plan) => { plan.authorityBoundary.faultOrTransitionInjectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.authorityBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.authorityBoundary.temporaryDiagnosticImageDepthIrOrPointCloudCollectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.resultPublicationAuthorized = true; },
    (plan) => { plan.authorityBoundary.cameraSelectionPurchaseOrBomChangeAuthorized = true; },
  ]);
});

test("rejects weakened fail-closed sunlight, reflection, emitter, or laser boundaries", async () => {
  await rejectsMutations([
    (plan) => { plan.safetyBoundary.vendorClassificationsAreFactsNotProjectAuthority = false; },
    (plan) => { plan.safetyBoundary.emittersAndFloodsDefaultOff = false; },
    (plan) => { plan.safetyBoundary.damagedOpenedModifiedUnofficiallyFlashedFilteredOrMismatchedDeviceMayOperate = true; },
    (plan) => { plan.safetyBoundary.magnifyingOpticsAllowed = true; },
    (plan) => { plan.safetyBoundary.deliberateDirectSunAimingAllowed = true; },
    (plan) => { plan.safetyBoundary.personOrAnimalAllowedInDirectOrSpecularBenchPath = true; },
    (plan) => { plan.safetyBoundary.independentCommandedAndObservedEmitterStateRequired = false; },
    (plan) => { plan.safetyBoundary.observerDisagreementMeansUnknownAndImmediateStop = false; },
    (plan) => { plan.safetyBoundary.stoppedFailedOrUnsafeModeMayBeRescuedByRecoveryAccuracyOrAnotherMode = true; },
  ]);
});

test("requires all 756 bench cells and 15120 runs without condition or mitigation rescue", async () => {
  assert.deepEqual(tracked.benchMatrix.compound.sceneIds, [...IR_COMPOUND_SCENE_IDS]);
  await rejectsMutations([
    (plan) => { plan.benchMatrix.modeIds.pop(); },
    (plan) => { plan.benchMatrix.sunlight.subjectDistanceMm.pop(); },
    (plan) => { plan.benchMatrix.validRunsPerCell = 19; },
    (plan) => { plan.benchMatrix.participantFreeCalibratedFixtureRequired = false; },
    (plan) => { plan.benchMatrix.balancedRandomizedRunOrderRequired = false; },
    (plan) => { plan.benchMatrix.sunlight.conditionIds.pop(); },
    (plan) => { plan.benchMatrix.sunlight.requiredCellCount = 125; },
    (plan) => { plan.benchMatrix.reflection.surfaceIds[3] = "polarized-mirror"; },
    (plan) => { plan.benchMatrix.reflection.incidenceAngleDegrees[2] = 60; },
    (plan) => { plan.benchMatrix.otherIr.interfererIds.pop(); },
    (plan) => { plan.benchMatrix.otherIr.orientationIds.pop(); },
    (plan) => { plan.benchMatrix.compound.sceneIds.reverse(); },
    (plan) => { plan.benchMatrix.compound.subjectDistanceMm[2] = 3000; },
    (plan) => { plan.benchMatrix.requiredTotalCellCount = 755; },
    (plan) => { plan.benchMatrix.requiredTotalRunCount = 15119; },
    (plan) => { plan.benchMatrix.oneModeConditionDistanceSurfaceInterfererOrientationOrSceneMayRescueAnother = true; },
  ]);
});

test("requires all eight transitions, 1120 cycles, and fail-closed healthy return", async () => {
  assert.deepEqual(tracked.transitionCampaign.transitionIds, [...IR_TRANSITION_IDS]);
  await rejectsMutations([
    (plan) => { plan.transitionCampaign.modeIds.pop(); },
    (plan) => { plan.transitionCampaign.transitionIds.pop(); },
    (plan) => { plan.transitionCampaign.validCyclesPerModeTransitionCell = 19; },
    (plan) => { plan.transitionCampaign.requiredModeTransitionCellCount = 55; },
    (plan) => { plan.transitionCampaign.requiredTransitionCycleCount = 1119; },
    (plan) => { plan.transitionCampaign.detectionFailClosedStaleOutputRejectionAndHealthyReturnRequired = false; },
    (plan) => { plan.transitionCampaign.automaticRetryMayHideFailure = true; },
    (plan) => { plan.transitionCampaign.laterRecoveryOrAnotherTransitionModeMayRescueFailure = true; },
  ]);
});

test("requires twenty-one full one-hour soaks without hidden replacement", async () => {
  await rejectsMutations([
    (plan) => { plan.soakCampaign.modeIds.pop(); },
    (plan) => { plan.soakCampaign.validOneHourSoaksPerMode = 2; },
    (plan) => { plan.soakCampaign.minimumMeasuredSecondsPerSoak = 3599; },
    (plan) => { plan.soakCampaign.requiredSoakCount = 20; },
    (plan) => { plan.soakCampaign.continuousStateThermalPowerFrameDepthAndStopObservationRequired = false; },
    (plan) => { plan.soakCampaign.interruptedStoppedOrInvalidSoakMayBeSilentlyReplaced = true; },
    (plan) => { plan.soakCampaign.oneSoakOrModeMayRescueAnother = true; },
  ]);
});

test("keeps the complete 42000-trial human phase separately blocked", async () => {
  await rejectsMutations([
    (plan) => { plan.humanPhase.status = "ready"; },
    (plan) => { plan.humanPhase.executionRequiresModeSpecificCompleteBenchTransitionSoakSafetyAndNumericGates = false; },
    (plan) => { plan.humanPhase.modeIds.pop(); },
    (plan) => { plan.humanPhase.personaClasses.pop(); },
    (plan) => { plan.humanPhase.placementIds.pop(); },
    (plan) => { plan.humanPhase.motionIds.pop(); },
    (plan) => { plan.humanPhase.compoundSceneIds.pop(); },
    (plan) => { plan.humanPhase.validTrialsPerCell = 19; },
    (plan) => { plan.humanPhase.requiredCellCount = 2099; },
    (plan) => { plan.humanPhase.requiredTrialCount = 41999; },
    (plan) => { plan.humanPhase.participantAbsentNegativeDistanceMm.pop(); },
    (plan) => { plan.humanPhase.requiredParticipantAbsentNegativeSessionCount = 125; },
    (plan) => { plan.humanPhase.consentAssentGuardianPrivacyExposureStopDeletionAndAdverseEventProtocolRequired = false; },
    (plan) => { plan.humanPhase.benchSuccessMayAuthorizePeopleOrEstablishChildSafety = true; },
    (plan) => { plan.humanPhase.onePersonaPlacementMotionSceneOrModeMayRescueAnother = true; },
  ]);
});

test("rejects self-labeled truth, hidden worst cases, or weakened pre-operation gates", async () => {
  await rejectsMutations([
    (plan) => { plan.measurements.requiredMeasurements.pop(); },
    (plan) => { plan.measurements.independentGroundTruthRequired = false; },
    (plan) => { plan.measurements.candidateDepthMayLabelItself = true; },
    (plan) => { plan.measurements.vendorClaimScreenshotOrOneFrameMaySubstituteMeasurement = true; },
    (plan) => { plan.measurements.captureArrivalMaySubstituteExposureTimestamp = true; },
    (plan) => { plan.measurements.meanAggregateOrBestCaseMayHideWorstCell = true; },
    (plan) => { plan.fixedAcceptance.minimumValidRunsPerBenchCell = 19; },
    (plan) => { plan.fixedAcceptance.maximumUnknownOrDisagreedEmitterStateObservations = 1; },
    (plan) => { plan.fixedAcceptance.maximumUnreviewedDirectOrSpecularPathEntries = 1; },
    (plan) => { plan.fixedAcceptance.allGatesMustBeFrozenBeforeOperation = false; },
    (plan) => { plan.fixedAcceptance.aggregateRecoveryMitigationOrCrossModeRescueAllowed = true; },
  ]);
});

test("rejects post-result numeric gates, unsafe data, or network egress", async () => {
  await rejectsMutations([
    (plan) => { plan.openAcceptance.maximumIrradianceOrProxy = 1; },
    (plan) => { plan.openAcceptance.minimumValidDepthFillPpm = 900000; },
    (plan) => { plan.openAcceptance.minimumTriggerPrecisionPpm = 950000; },
    (plan) => { plan.openAcceptance.minimumPredeclaredMaterialBenefitPpm = 1; },
    (plan) => { plan.dataPolicy.rawRgbDepthIrPointCloudAudioOrVideoAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.participantNamesFacesVoicesExactAgesAddressesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.deviceSerialNumbersPathsCredentialsSecretsOrUnredactedLogsAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextResultEvidenceAllowed = true; },
    (plan) => { plan.dataPolicy.temporaryRawDiagnosticsRequireSeparateAuthorityConsentSecurityAndDeletionProtocol = false; },
    (plan) => { plan.dataPolicy.networkEgressAllowed = true; },
  ]);
});

test("rejects missing blockers or premature results, safety conclusions, selection, and purchase", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...IR_BLOCKERS]);
  await rejectsMutations([
    (plan) => { plan.executionGate.status = "ready"; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.artifactPath = "results.json"; },
    (plan) => { plan.result.sha256 = "a".repeat(64); },
    (plan) => { plan.result.disposition = "pass"; },
    (plan) => { plan.result.receivedDeviceCount = 1; },
    (plan) => { plan.result.completedBenchRunCount = 1; },
    (plan) => { plan.result.participantCount = 1; },
    (plan) => { plan.result.qualifiedModeIds.push(IR_MODE_IDS[0]); },
    (plan) => { plan.result.safetyConclusionIds.push("safe"); },
    (plan) => { plan.result.materialDepthBenefitIds.push(IR_MODE_IDS[1]); },
    (plan) => { plan.result.selectedCameraOrModeIds.push(IR_MODE_IDS[1]); },
    (plan) => { plan.result.purchaseOrBomRecommendation = "buy"; },
  ]);
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const withUnknown = clone();
  withUnknown.result.note = "hidden";
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.from(
    `${JSON.stringify(withUnknown, null, 2)}\n`,
  )));

  const text = trackedBytes.toString("utf8");
  const duplicate = text.replace(
    '  "format":',
    '  "format": "duplicate",\n  "format":',
  );
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.from(duplicate)));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.from(JSON.stringify(tracked))));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(trackedBytes.subarray(0, -1)));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes,
  ])));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.from([0xc3, 0x28])));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.from(text.replace("\n", "\r"))));
  await assert.rejects(parseCrossDeviceIrInterferenceSafetyPlanBytes(Buffer.alloc(192 * 1024 + 1, 0x20)));
});
