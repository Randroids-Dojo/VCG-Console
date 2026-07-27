import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  CONTROLLER_USABILITY_BLOCKERS,
  CONTROLLER_USABILITY_PERSONA_IDS,
  CONTROLLER_USABILITY_RECOVERY_IDS,
  CONTROLLER_USABILITY_RUNTIME_IDS,
  CONTROLLER_USABILITY_TARGET_IDS,
  CONTROLLER_USABILITY_TASK_IDS,
  parseControllerOnlyUsabilityPlanBytes,
  readControllerOnlyUsabilityPlan,
  validateControllerOnlyUsabilityPlan,
} from "./validate-controller-only-usability-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(root, "benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json");
const sourceBytes = await readFile(planPath);
const sourceText = sourceBytes.toString("utf8");

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

async function rejectsMutation(mutate, pattern) {
  const plan = await loadPlan();
  mutate(plan);
  await assert.rejects(validateControllerOnlyUsabilityPlan(plan), pattern);
}

test("accepts the tracked blocked zero-result I-155 plan", async () => {
  const plan = await readControllerOnlyUsabilityPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.sessionMatrix.requiredCompleteSessionCount, 320);
  assert.equal(plan.sessionMatrix.requiredTaskObservationCount, 5120);
  assert.equal(plan.recoveryMatrix.requiredRecoveryCycleCount, 2560);
  assert.equal(plan.result, null);
});

test("closed schema rejects invented usability results or qualification", async () => {
  await rejectsMutation((plan) => {
    plan.usabilityQualified = true;
  }, /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  await rejectsMutation((plan) => {
    plan.sourceBindings[3].sha256 = "0".repeat(64);
  }, /cross-tier-controller-plan-v1\.json digest drifted/u);
});

test("automated browser and synthetic input cannot open human collection", async () => {
  for (const mutate of [
    (plan) => {
      plan.prerequisiteGate.browserDesktopSyntheticInputOrAutomatedFlowMayQualifyHumanControllerOnlyUsability = true;
    },
    (plan) => {
      plan.prerequisiteGate.oneTargetRuntimePersonaFaultOrBestCaseMayOpenOrQualifyAnother = true;
    },
    (plan) => {
      plan.prerequisiteGate.collectionOpened = true;
    },
  ]) await rejectsMutation(mutate);
});

test("ordinary x86 Linux and Pi 5 required targets remain exact and unproven", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.targetRoles.map(({ targetId }) => targetId), CONTROLLER_USABILITY_TARGET_IDS);
  await rejectsMutation((candidate) => {
    candidate.targetRoles.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.targetRoles[0].receivedInventoriedQualifiedAndAuthorized = true;
  });
});

test("all four remote local native and Libretro paths remain exact and required", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.runtimePaths.map(({ runtimePathId }) => runtimePathId), CONTROLLER_USABILITY_RUNTIME_IDS);
  await rejectsMutation((candidate) => {
    candidate.runtimePaths.reverse();
  });
  await rejectsMutation((candidate) => {
    candidate.runtimePaths[2].requiredOnEveryTarget = false;
  });
});

test("child and adult blocking personas stay separate and unauthorized", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.participantRoles.map(({ personaId }) => personaId), CONTROLLER_USABILITY_PERSONA_IDS);
  await rejectsMutation((candidate) => {
    candidate.participantRoles.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.participantRoles[0].participationAuthorized = true;
  });
});

test("all sixteen cold-boot launch play Back return and shutdown tasks remain", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.taskIds, CONTROLLER_USABILITY_TASK_IDS);
  await rejectsMutation((candidate) => {
    candidate.taskIds.splice(6, 1);
  });
  await rejectsMutation((candidate) => {
    candidate.taskIds.reverse();
  });
});

test("session arithmetic preserves sixteen cells 320 sessions and 5120 observations", async () => {
  for (const [key, value] of [
    ["taskCountPerSession", 15],
    ["requiredTargetRuntimePersonaCellCount", 15],
    ["validCompleteSessionsPerCell", 19],
    ["requiredCompleteSessionCount", 319],
    ["requiredTaskObservationCount", 5119],
  ]) await rejectsMutation((plan) => {
    plan.sessionMatrix[key] = value;
  });
});

test("every session begins cold ends shutdown and retains failed assisted evidence", async () => {
  for (const key of [
    "everySessionBeginsAtVerifiedColdOffAndEndsAtVerifiedShutdownState",
    "sameFrozenTargetRuntimeControllerTaskInstructionsScoringAndOraclesRequired",
    "failedInvalidStoppedRetriedAssistedAndPreRepairEvidenceMustRemainVisible",
  ]) await rejectsMutation((plan) => {
    plan.sessionMatrix[key] = false;
  });
  await rejectsMutation((plan) => {
    plan.sessionMatrix.targetRuntimePersonaTaskSessionAverageOrBestCaseMayRescueFailure = true;
  });
});

test("all eight recovery scenarios and 2560 cycles remain non-rescuing", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.recoveryScenarioIds, CONTROLLER_USABILITY_RECOVERY_IDS);
  await rejectsMutation((candidate) => {
    candidate.recoveryScenarioIds.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.recoveryMatrix.requiredTargetRuntimePersonaScenarioCellCount = 127;
  });
  await rejectsMutation((candidate) => {
    candidate.recoveryMatrix.requiredRecoveryCycleCount = 2559;
  });
  await rejectsMutation((candidate) => {
    candidate.recoveryMatrix.anotherFaultRuntimeTargetPersonaOrNormalSessionMayRescueFailure = true;
  });
});

test("independent power input recipient focus process network and clock evidence is mandatory", async () => {
  await rejectsMutation((plan) => {
    plan.measurements.independentPhysicalPowerInputRecipientFocusSurfaceProcessNetworkAndClockOraclesRequired = false;
  });
  await rejectsMutation((plan) => {
    plan.measurements.screenCopyFirstPixelsProcessStartHeartbeatOrSelfReportMayEstablishUsableInteraction = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.requiredMetricIds.pop();
  });
});

test("zero keyboard mouse setup mapping focus action and privileged failures cannot weaken", async () => {
  for (const key of [
    "maximumKeyboardMouseShellDesktopOperatorOrHiddenSetupRecoveries",
    "maximumManualMappingEventsForSupportedStandardsConformantControllers",
    "maximumMissedDuplicatedStuckWrongRecipientOrWrongMappedControllerActions",
    "maximumHomeBackPauseResumeOrExitEventsDeliveredToGame",
    "maximumFocusTrapsDesktopExposureBlankDeadEndsOrUnboundedWaits",
    "maximumUnpromptedWrongActionGuessOrAssistanceEvents",
    "maximumFalseReadyRecoveredInteractiveShutdownOrSuccessClaims",
    "maximumUnintendedPrivilegedBackHomePauseResumeExitOrShutdownActions",
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = 1;
  });
});

test("D-106 D-130 usable-input and no-fake-readiness gates remain exact", async () => {
  for (const [key, value] of [
    ["maximumVisibleFeedbackMs", 251],
    ["maximumColdBootToControllerUsableHomeMs", 60001],
    ["maximumLocalGameLaunchToInteractiveMs", 15001],
    ["maximumHostedLaunchToInteractiveOrTruthfulPhaseMs", 30001],
    ["interactiveMeansVisibleFocusedAndResponsiveToTheIntendedController", false],
    ["firstPixelsProcessStartHeartbeatOrTruthfulHostedPhaseMayEstablishPlayability", true],
    ["systemMustOwnHomeBackPauseRetryExitAndShutdownOutsideGameAuthority", false],
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = value;
  });
});

test("cohort task comprehension fault timing discomfort issue and audit gates stay open", async () => {
  for (const key of [
    "minimumDistinctParticipantsPerPersonaClass",
    "maximumTaskCompletionP95AndWorstMsByTaskPersonaAndRuntime",
    "minimumLoadingFaultAndRecoveryCopyComprehensionPpm",
    "maximumParticipantDiscomfortStopOrAccessibilityFailureEvents",
    "issueSeverityBlockingThresholdTriageAndClosurePolicySha256",
    "recordingReviewSamplingRetentionDeletionAndIndependentAuditPolicySha256",
  ]) await rejectsMutation((plan) => {
    plan.openAcceptance[key] = 1;
  }, /must remain open/u);
});

test("screen-only recordings and closed issue records cannot hide evidence or identity", async () => {
  await rejectsMutation((plan) => {
    plan.recordingAndIssuePolicy.recordingMustExcludeRoomFacesBodiesVoicesCameraAndHouseholdIdentity = false;
  });
  await rejectsMutation((plan) => {
    plan.recordingAndIssuePolicy.participantOrOperatorFreeTextIssueNarrativesAllowed = true;
  });
  await rejectsMutation((plan) => {
    plan.recordingAndIssuePolicy.issuesFailuresStopsRetriesAssistanceAndWrongActionsMayBeDeletedOrHidden = true;
  });
});

test("no target aggregate or technical pass automatically changes product support", async () => {
  await rejectsMutation((plan) => {
    plan.decisionProtocol.oneTargetRuntimePersonaOrAggregatePassAutomaticallyQualifiesAnother = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.completeTechnicalPassAutomaticallyChangesProductSupportOrInputPromise = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.controllerOnlyUsabilityDisposition = "qualified";
  });
});

test("no target controller participant fault recording or publication authority exists", async () => {
  const plan = await loadPlan();
  for (const key of Object.keys(plan.authorityBoundary).filter((key) => key.endsWith("Authorized"))) {
    await rejectsMutation((candidate) => {
      candidate.authorityBoundary[key] = true;
    });
  }
});

test("raw people controller identifiers credentials entered text and free logs remain prohibited", async () => {
  for (const key of [
    "rawRoomFacesBodiesVoicesCameraFramesAudioOrHouseholdMediaAllowed",
    "participantNamesExactAgesAddressesDiagnosesProfilesSavesOrStableIdentifiersAllowed",
    "rawControllerHidUsbBluetoothPayloadSerialMacOrStableDeviceIdentifiersAllowed",
    "credentialsTokensCookiesStorageValuesUrlsPathsEnvironmentOrEnteredTextAllowed",
    "freeTextParticipantOperatorGameDriverCompositorServiceCrashOrIssueLogsAllowed",
  ]) await rejectsMutation((plan) => {
    plan.dataPolicy[key] = true;
  });
});

test("all fourteen blockers and the zero-result envelope remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, CONTROLLER_USABILITY_BLOCKERS);
  await rejectsMutation((candidate) => {
    candidate.executionGate.blockerCodes.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.status = "ready";
  });
  await rejectsMutation((candidate) => {
    candidate.result = { qualified: true };
  });
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-controller-usability-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "qualified",'));
    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(await readFile(duplicate)), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(JSON.parse(sourceText)));
    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(await readFile(noncanonical)), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sourceBytes]));
    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(await readFile(bom)), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(await readFile(invalid)), /valid UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, Buffer.from(sourceText.replace("\n", "\r")));
    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(await readFile(bareCr)), /bare CR/u);

    await assert.rejects(parseControllerOnlyUsabilityPlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20)), /exceeds/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
