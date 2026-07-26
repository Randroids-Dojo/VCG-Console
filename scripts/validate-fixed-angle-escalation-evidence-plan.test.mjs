import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadFixedAngleEscalationEvidencePlan,
  validateFixedAngleEscalationEvidencePlan,
  validateTrackedFixedAngleEscalationEvidencePlan,
} from "./validate-fixed-angle-escalation-evidence-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-angle/fixed-angle-escalation-evidence-plan-v1.json",
);
const sourceText = await readFile(trackedPath, "utf8");
const sourcePlan = JSON.parse(sourceText);
const clone = () => structuredClone(sourcePlan);

async function rejectsMutation(mutator, pattern = /Expected values|drifted|must remain|must be/u) {
  const plan = clone();
  mutator(plan);
  await assert.rejects(validateFixedAngleEscalationEvidencePlan(plan, root), pattern);
}

test("accepts the tracked blocked zero-result I-047 plan", async () => {
  assert.deepEqual(await validateTrackedFixedAngleEscalationEvidencePlan(), {
    status: "blocked",
    sourceBindingCount: 13,
    candidateCount: 4,
    burdenCellCount: 72,
    lifecycleCycleCount: 6000,
    humanTrialCount: 1800,
  });
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutation((plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); }, /digest drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings[2].role = "another-role"; }, /role drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.reverse(); }, /role drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.pop(); }, /source binding count/u);
});

test("preserves D-092 as the fixed baseline and rejects invented authority", async () => {
  await rejectsMutation((plan) => { plan.baselineContract.manualOrMotorizedTiltAllowed = true; });
  await rejectsMutation((plan) => { plan.baselineContract.campaignMaySupersedeDecision = true; });
  await rejectsMutation((plan) => { plan.authorityBoundary.roomCameraOrParticipantWorkAuthorized = true; }, /must remain blocked/u);
  await rejectsMutation((plan) => {
    plan.authorityBoundary.softwareAutoFramingImplementationAndControlPlaneSha256 = "1".repeat(64);
  }, /must remain blocked/u);
});

test("rejects mechanism substitution, premature implementation, operation, eligibility, or selection", async () => {
  await rejectsMutation((plan) => { plan.candidateMechanisms[1].mechanismId = "cloud-auto-framing"; });
  await rejectsMutation((plan) => { plan.candidateMechanisms[2].exactImplementationSha256 = "2".repeat(64); });
  await rejectsMutation((plan) => { plan.candidateMechanisms[3].operationAuthorized = true; });
  await rejectsMutation((plan) => { plan.candidateMechanisms[1].eligible = true; });
  await rejectsMutation((plan) => { plan.candidateMechanisms[0].selected = true; });
});

test("rejects invented, incomplete, external, or selectively preserved fixed-placement failure", async () => {
  await rejectsMutation((plan) => { plan.fixedFailureImport.qualifiedFixedPitchCount = 0; });
  await rejectsMutation((plan) => { plan.fixedFailureImport.everyScheduledCellAndAttemptPreserved = true; });
  await rejectsMutation((plan) => {
    plan.fixedFailureImport.nullIncompleteInvalidOrSelectivelyRetriedEvidenceMayDeclareFailure = true;
  });
  await rejectsMutation((plan) => {
    plan.fixedFailureImport.externalCameraSuccessMayDeclareIntegratedFixedPlacementAdequateOrFailed = true;
  });
});

test("requires the common 50-cell remediation grid and null derived counts", async () => {
  await rejectsMutation((plan) => { plan.remediationMatrix.motionIds.pop(); });
  await rejectsMutation((plan) => { plan.remediationMatrix.validTrialsPerCell = 19; });
  await rejectsMutation((plan) => { plan.remediationMatrix.requiredBlockingCellCount = 1; });
  await rejectsMutation((plan) => {
    plan.remediationMatrix.oneMechanismRoomPersonaZoneMotionRetryOrAggregateMayRescueAnother = true;
  });
});

test("requires all 72 independent burden domains without weighted rescue", async () => {
  await rejectsMutation((plan) => { plan.burdenEvidenceMatrix.evidenceDomainIds.pop(); });
  await rejectsMutation((plan) => { plan.burdenEvidenceMatrix.requiredCandidateDomainCellCount = 71; });
  await rejectsMutation((plan) => {
    plan.burdenEvidenceMatrix.weightedScoreMeanOrPassingDomainMayRescueFailedMissingOrUnknownDomain = true;
  });
});

test("requires all 300 lifecycle/fault cells and 6000 visible cycles", async () => {
  await rejectsMutation((plan) => { plan.lifecycleFaultMatrix.transitionIds.pop(); });
  await rejectsMutation((plan) => { plan.lifecycleFaultMatrix.validCyclesPerCandidateTransitionFaultCell = 1; });
  await rejectsMutation((plan) => { plan.lifecycleFaultMatrix.requiredCycleCount = 300; });
  await rejectsMutation((plan) => {
    plan.lifecycleFaultMatrix.oneCandidateTransitionFaultCycleRetryOrLaterSuccessMayRescueAnother = true;
  });
});

test("requires all 90 human-use cells and keeps participant work blocked", async () => {
  await rejectsMutation((plan) => { plan.humanUseMatrix.status = "ready"; });
  await rejectsMutation((plan) => { plan.humanUseMatrix.personaClasses.pop(); });
  await rejectsMutation((plan) => { plan.humanUseMatrix.requiredTrialCount = 1799; });
  await rejectsMutation((plan) => {
    plan.humanUseMatrix.taskCompletionMayHideFalsePrivacyBeliefAssistanceUnsafeReachOrDiscomfort = true;
  });
});

test("rejects self-labeling, best-case substitution, missing measurements, and hidden worst cases", async () => {
  await rejectsMutation((plan) => { plan.measurements.requiredMeasurementIds.pop(); });
  await rejectsMutation((plan) => {
    plan.measurements.candidateOutputControlStateCalibrationOrAggregateMaySelfLabelSuccess = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.vendorClaimCadMeanBestCaseOnePersonaOrLaterRecoveryMaySubstituteEvidence = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.perCandidateConfigurationPersonaZoneMotionDomainTransitionFaultCycleAndWorstCaseRequired = false;
  });
});

test("preserves zero-tolerance gates, null open gates, and the motorized last-resort rule", async () => {
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumNetworkEgressOrRemoteControlDependencies = 1; });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.motorizedAdmissionRequiresCompleteRejectedSoftwareAndManualCandidates = false;
  });
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.incompleteUnknownNotRunInconvenientOrHigherCostNonmotorizedEvidenceMayAdmitMotorized = true;
  });
  await rejectsMutation((plan) => { plan.openAcceptance.maximumDeliveredBomCostDeltaCents = 5000; }, /must remain null/u);
});

test("rejects post-result decisions, automatic selection, purchase, BOM changes, or D-092 supersession", async () => {
  await rejectsMutation((plan) => {
    plan.decisionPolicy.campaignMaySelectMechanismAuthorizePurchaseMutateBomOrSetupGuidance = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionPolicy.motorizedCandidateMayBeEligibleOnlyAfterSoftwareAndManualAreCompleteAndRejected = false;
  });
  await rejectsMutation((plan) => { plan.result.selectedMechanismId = "bounded-locking-manual-tilt"; });
  await rejectsMutation((plan) => { plan.result.purchaseAuthorized = true; });
  await rejectsMutation((plan) => { plan.result.d092Superseded = true; });
});

test("rejects unsafe data, remote inference, evidence deletion, and blocker weakening", async () => {
  await rejectsMutation((plan) => {
    plan.dataPolicy.rawRoomCameraVideoImagePortraitOrAudioAllowedInRepositoryOrRelease = true;
  });
  await rejectsMutation((plan) => { plan.dataPolicy.freeTextResultEvidenceAllowed = true; });
  await rejectsMutation((plan) => { plan.dataPolicy.networkEgressOrRemoteInferenceAllowed = true; });
  await rejectsMutation((plan) => {
    plan.dataPolicy.failedStoppedInvalidRetriedNotRunAndAdverseEvidenceMustRemainVisible = false;
  });
  await rejectsMutation((plan) => { plan.executionGate.blockerCodes.pop(); });
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  await rejectsMutation((plan) => { plan.unexpected = true; }, /plan fields drifted/u);
  await rejectsMutation((plan) => { plan.candidateMechanisms[0].unexpected = true; });

  const directory = await mkdtemp(resolve(tmpdir(), "vcg-fixed-angle-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    ));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(duplicate), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(sourcePlan));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(noncanonical), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(bom), /must not contain a UTF-8 BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xff]));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(invalid), /strict UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, sourceText.replace("\n", "\r"));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(bareCr), /bare carriage return/u);

    const oversize = resolve(directory, "oversize.json");
    await writeFile(oversize, Buffer.alloc(192 * 1024 + 1, 0x20));
    await assert.rejects(loadFixedAngleEscalationEvidencePlan(oversize), /exceeds/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
