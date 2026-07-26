import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadCameraReplacementRecalibrationPlan,
  validateCameraReplacementRecalibrationPlan,
  validateTrackedCameraReplacementRecalibrationPlan,
} from "./validate-camera-replacement-recalibration-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-service/camera-replacement-recalibration-plan-v1.json",
);
const sourceText = await readFile(trackedPath, "utf8");
const sourcePlan = JSON.parse(sourceText);
const clone = () => structuredClone(sourcePlan);

async function rejectsMutation(mutator, pattern = /Expected values|drifted|must remain|must be/u) {
  const plan = clone();
  mutator(plan);
  await assert.rejects(validateCameraReplacementRecalibrationPlan(plan, root), pattern);
}

test("accepts the tracked blocked zero-result I-048 plan", async () => {
  assert.deepEqual(await validateTrackedCameraReplacementRecalibrationPlan(), {
    status: "blocked",
    sourceBindingCount: 15,
    phaseObservationCount: 720,
    faultCycleCount: 600,
    humanTrialCount: 2400,
    maximumServiceDurationMs: 300000,
  });
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutation((plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); }, /digest drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings[5].role = "another-role"; }, /role drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.reverse(); }, /role drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.pop(); }, /source binding count/u);
});

test("rejects target substitution, invented fixtures, camera identities, or operation authority", async () => {
  await rejectsMutation((plan) => { plan.targetRoles[0].targetId = "windows-external-camera"; });
  await rejectsMutation((plan) => { plan.targetRoles[1].exactTargetAndServiceFixtureSha256 = "1".repeat(64); });
  await rejectsMutation((plan) => { plan.targetRoles[2].exactReplacementCameraManifestSha256 = "2".repeat(64); });
  await rejectsMutation((plan) => { plan.targetRoles[0].operationAuthorized = true; });
});

test("keeps camera identity protected, exact, non-biometric, and fail-closed", async () => {
  await rejectsMutation((plan) => {
    plan.protectedIdentityContract.stableCameraSerialMayEnterResultDiagnosticsSupportExportOrNetwork = true;
  });
  await rejectsMutation((plan) => {
    plan.protectedIdentityContract.usbVidPidProductTextPortOrderImageAppearanceOrProfileNameMayIndependentlyProveIdentity = true;
  });
  await rejectsMutation((plan) => {
    plan.protectedIdentityContract.cameraIdentityMayIdentifyAuthorizeOrReassociateAPlayerProfile = true;
  });
  await rejectsMutation((plan) => {
    plan.protectedIdentityContract.cameraRemovalReplacementOrMountChangeInvalidatesCameraBoundDerivedState = false;
  });
  await rejectsMutation((plan) => {
    plan.protectedIdentityContract.browserGameOrCalibrationOutputMayMutateProtectedIdentity = true;
  });
});

test("rejects invented protected-state, physical, participant, mutation, or publication authority", async () => {
  await rejectsMutation((plan) => {
    plan.authorityBoundary.protectedIdentityStoreSchemaTransactionAndRecoveryProtocolSha256 = "3".repeat(64);
  }, /must remain blocked/u);
  await rejectsMutation((plan) => {
    plan.authorityBoundary.powerHotPlugDisassemblyEnclosureAccessOrReplacementAuthorized = true;
  }, /must remain blocked/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.participantOrAccessibilityStudyAuthorized = true; }, /must remain blocked/u);
  await rejectsMutation((plan) => {
    plan.authorityBoundary.profileVaultRegistryOrProtectedIdentityMutationAuthorized = true;
  }, /must remain blocked/u);
});

test("preserves the complete contiguous five-minute service clock", async () => {
  await rejectsMutation((plan) => { plan.workflowClockContract.maximumEndToEndDurationMs = 300001; });
  await rejectsMutation((plan) => {
    plan.workflowClockContract.preOpenedEnclosurePreBoundReplacementPreCalibrationOrHiddenSetupAllowed = true;
  });
  await rejectsMutation((plan) => { plan.workflowClockContract.clockPauseExclusionOrRestartAllowed = true; });
  await rejectsMutation((plan) => {
    plan.workflowClockContract.powerDisassemblyReplacementReassemblyEnumerationIdentityInvalidationCalibrationAndVerificationIncluded = false;
  });
  await rejectsMutation((plan) => { plan.workflowClockContract.meanMedianOrAnotherAttemptMayRescueSlowAttempt = true; });
});

test("requires all twelve ordered phases and forbids old calibration", async () => {
  await rejectsMutation((plan) => { plan.servicePhases.pop(); });
  await rejectsMutation((plan) => { plan.servicePhases.reverse(); });
  await rejectsMutation((plan) => { plan.servicePhases[4].captureMayRunInReadyExecution = true; });
  await rejectsMutation((plan) => { plan.servicePhases[10].captureMayRunInReadyExecution = false; });
  await rejectsMutation((plan) => { plan.servicePhases[11].oldCalibrationMayBeUsed = true; });
});

test("requires 36 phase cells, 720 observations, and 60 complete attempts without rescue", async () => {
  await rejectsMutation((plan) => { plan.servicePhaseMatrix.phaseIds.pop(); });
  await rejectsMutation((plan) => { plan.servicePhaseMatrix.validCompleteServiceAttemptsPerTarget = 19; });
  await rejectsMutation((plan) => { plan.servicePhaseMatrix.requiredPhaseObservationCount = 719; });
  await rejectsMutation((plan) => {
    plan.servicePhaseMatrix.oneTargetPhaseAttemptMeanMedianOrAggregateMayRescueAnother = true;
  });
});

test("requires all 30 replacement/fault cells and 600 visible cycles", async () => {
  await rejectsMutation((plan) => { plan.replacementFaultMatrix.scenarioIds.pop(); });
  await rejectsMutation((plan) => { plan.replacementFaultMatrix.validCyclesPerTargetScenarioCell = 1; });
  await rejectsMutation((plan) => { plan.replacementFaultMatrix.requiredCycleCount = 30; });
  await rejectsMutation((plan) => {
    plan.replacementFaultMatrix.captureMustRemainDisabledUntilExactIdentityAndFreshCalibrationCommit = false;
  });
  await rejectsMutation((plan) => {
    plan.replacementFaultMatrix.oldCalibrationAutomaticRestartLaterSuccessOrAnotherScenarioMayRescueFailure = true;
  });
});

test("requires all 120 blocked human-service cells and 2400 trials", async () => {
  await rejectsMutation((plan) => { plan.humanServiceMatrix.status = "ready"; });
  await rejectsMutation((plan) => { plan.humanServiceMatrix.personaClasses.pop(); });
  await rejectsMutation((plan) => { plan.humanServiceMatrix.taskIds.pop(); });
  await rejectsMutation((plan) => { plan.humanServiceMatrix.requiredTrialCount = 2399; });
  await rejectsMutation((plan) => {
    plan.humanServiceMatrix.completionMayHideUnsafeReachAssistanceFalsePrivacyBeliefDamageOrDiscomfort = true;
  });
});

test("rejects self-labeling, best-case substitution, missing measurements, or hidden worst cases", async () => {
  await rejectsMutation((plan) => { plan.measurements.requiredMeasurementIds.pop(); });
  await rejectsMutation((plan) => {
    plan.measurements.enumerationVideoCalibrationOutputApplicationReadyOrProfileNameMaySelfLabelSuccess = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.vendorClaimSameModelMeanBestCaseOrLaterRecoveryMaySubstituteEvidence = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.perTargetPhaseScenarioPersonaTaskCycleAttemptAndWorstCaseRequired = false;
  });
});

test("preserves zero-tolerance gates, the 300000 ms limit, and null open gates", async () => {
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumEndToEndServiceDurationMs = 300001; });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.maximumOldCalibrationFloorCropBodyMatchOrCachedDerivedStateUseAfterReplacementIntent = 1;
  });
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumWrongUnapprovedAmbiguousOrStaleIdentityAdmissions = 1; });
  await rejectsMutation((plan) => { plan.fixedAcceptance.freshExactCameraBoundCalibrationAndPrivacyReadyVerificationRequired = false; });
  await rejectsMutation((plan) => { plan.openAcceptance.maximumDisassemblyTimeMs = 50000; }, /must remain null/u);
});

test("rejects unsafe data, remote identity/calibration, evidence deletion, or blocker weakening", async () => {
  await rejectsMutation((plan) => {
    plan.dataPolicy.rawRoomCameraVideoImagePortraitBodyMeasurementOrAudioAllowedInRepositoryOrRelease = true;
  });
  await rejectsMutation((plan) => { plan.dataPolicy.stableCameraSerialsPathsCredentialsSecretsProviderMessagesOrUnredactedLogsAllowed = true; });
  await rejectsMutation((plan) => { plan.dataPolicy.networkEgressRemoteIdentityResolutionOrCloudCalibrationAllowed = true; });
  await rejectsMutation((plan) => {
    plan.dataPolicy.failedStoppedInvalidRetriedAbandonedAdverseAndWorstCaseEvidenceMustRemainVisible = false;
  });
  await rejectsMutation((plan) => { plan.executionGate.blockerCodes.pop(); });
});

test("rejects premature identity persistence, completion, qualification, selection, purchase, or claims", async () => {
  await rejectsMutation((plan) => { plan.result.persistedIdentityImplementationSha256 = "4".repeat(64); });
  await rejectsMutation((plan) => { plan.result.completedServiceAttemptCount = 60; });
  await rejectsMutation((plan) => { plan.result.qualifiedTargetIds = ["ordinary-x86-linux-external-camera"]; });
  await rejectsMutation((plan) => { plan.result.fiveMinuteProcedureQualified = true; });
  await rejectsMutation((plan) => { plan.result.cameraReplacementOrSubstituteSelected = true; });
  await rejectsMutation((plan) => { plan.result.purchaseAuthorized = true; });
  await rejectsMutation((plan) => { plan.result.warrantyOrFormalServiceabilityClaimed = true; });
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  await rejectsMutation((plan) => { plan.unexpected = true; }, /plan fields drifted/u);
  await rejectsMutation((plan) => { plan.targetRoles[0].unexpected = true; });

  const directory = await mkdtemp(resolve(tmpdir(), "vcg-camera-service-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    ));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(duplicate), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(sourcePlan));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(noncanonical), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(bom), /must not contain a UTF-8 BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xff]));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(invalid), /strict UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, sourceText.replace("\n", "\r"));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(bareCr), /bare carriage return/u);

    const oversize = resolve(directory, "oversize.json");
    await writeFile(oversize, Buffer.alloc(192 * 1024 + 1, 0x20));
    await assert.rejects(loadCameraReplacementRecalibrationPlan(oversize), /exceeds/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
