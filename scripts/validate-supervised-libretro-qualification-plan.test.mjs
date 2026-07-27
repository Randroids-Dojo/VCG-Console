import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  SUPERVISED_LIBRETRO_ACTION_IDS,
  SUPERVISED_LIBRETRO_BLOCKERS,
  SUPERVISED_LIBRETRO_FRONTEND_IDS,
  SUPERVISED_LIBRETRO_SCENARIO_IDS,
  SUPERVISED_LIBRETRO_TARGET_IDS,
  SUPERVISED_LIBRETRO_WORKLOAD_IDS,
  parseSupervisedLibretroQualificationPlanBytes,
  readSupervisedLibretroQualificationPlan,
  validateSupervisedLibretroQualificationPlan,
} from "./validate-supervised-libretro-qualification-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(root, "benchmarks/libretro/supervised-libretro-frontend-qualification-plan-v1.json");
const sourceBytes = await readFile(planPath);
const sourceText = sourceBytes.toString("utf8");

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

async function rejectsMutation(mutate, pattern) {
  const plan = await loadPlan();
  mutate(plan);
  await assert.rejects(validateSupervisedLibretroQualificationPlan(plan), pattern);
}

test("accepts the tracked blocked zero-result I-122 I-123 I-198 plan", async () => {
  const plan = await readSupervisedLibretroQualificationPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.lifecycleMatrix.requiredLifecycleCycleCount, 3200);
  assert.equal(plan.controllerMatrix.requiredControllerActionTrialCount, 3360);
  assert.equal(plan.result, null);
});

test("closed schema rejects invented frontend title or qualification results", async () => {
  await rejectsMutation((plan) => {
    plan.qualifiedFrontendId = "retroarch";
  }, /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  await rejectsMutation((plan) => {
    plan.sourceBindings[1].sha256 = "0".repeat(64);
  }, /RETROARCH_INTEGRATION\.md digest drifted/u);
});

test("screened candidates synthetic evidence and best cases cannot open execution", async () => {
  for (const key of [
    "currentlyScreenedCandidateMayOpenExecutionOrCountAsRightsApproval",
    "manifestNativeUnitDesktopOrSyntheticEvidenceMayQualifyTargetBehavior",
    "oneFrontendTargetWorkloadScenarioOrBestCaseMayOpenOrQualifyAnother",
    "executionOpened",
  ]) await rejectsMutation((plan) => {
    plan.prerequisiteGate[key] = true;
  });
});

test("RetroArch and one unselected fallback remain separate mandatory frontend lanes", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.frontendRoles.map(({ frontendRoleId }) => frontendRoleId), SUPERVISED_LIBRETRO_FRONTEND_IDS);
  assert.equal(plan.frontendRoles[1].frontendId, null);
  await rejectsMutation((candidate) => {
    candidate.frontendRoles.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.frontendRoles[1].frontendId = "invented-fallback";
  });
  await rejectsMutation((candidate) => {
    candidate.frontendRoles[0].selectedBuiltInstalledQualifiedAndAuthorized = true;
  });
});

test("x86-64 and aarch64 reference targets remain exact required and unreceived", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.targetRoles.map(({ targetId }) => targetId), SUPERVISED_LIBRETRO_TARGET_IDS);
  await rejectsMutation((candidate) => {
    candidate.targetRoles.reverse();
  });
  await rejectsMutation((candidate) => {
    candidate.targetRoles[1].architecture = "x86_64";
  });
  await rejectsMutation((candidate) => {
    candidate.targetRoles[0].receivedInventoriedQualifiedAndAuthorized = true;
  });
});

test("starter title and managed-content fixture remain separate required workloads", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.workloadRoles.map(({ workloadRoleId }) => workloadRoleId), SUPERVISED_LIBRETRO_WORKLOAD_IDS);
  await rejectsMutation((candidate) => {
    candidate.workloadRoles.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.workloadRoles[0].retro2048OrAnyScreenedCandidateMayQualifyWithoutCompleteIndependentClosure = true;
  });
  await rejectsMutation((candidate) => {
    candidate.workloadRoles[1].catalogRole = "public-starter-title";
  });
});

test("all twenty lifecycle scenarios and 3200 visible cycles remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.lifecycleScenarioIds, SUPERVISED_LIBRETRO_SCENARIO_IDS);
  await rejectsMutation((candidate) => {
    candidate.lifecycleScenarioIds.pop();
  });
  for (const [key, value] of [
    ["scenarioCount", 19],
    ["requiredFrontendTargetWorkloadScenarioCellCount", 159],
    ["validCyclesPerCell", 19],
    ["requiredLifecycleCycleCount", 3199],
  ]) await rejectsMutation((candidate) => {
    candidate.lifecycleMatrix[key] = value;
  });
  await rejectsMutation((candidate) => {
    candidate.lifecycleMatrix.oneFrontendTargetWorkloadScenarioCycleOrAggregateMayRescueFailure = true;
  });
});

test("all twenty-one gameplay and reserved actions and 3360 trials remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.controllerActionIds, SUPERVISED_LIBRETRO_ACTION_IDS);
  await rejectsMutation((candidate) => {
    candidate.controllerActionIds.splice(16, 1);
  });
  for (const [key, value] of [
    ["actionCount", 20],
    ["requiredFrontendTargetWorkloadActionCellCount", 167],
    ["validTrialsPerCell", 19],
    ["requiredControllerActionTrialCount", 3359],
  ]) await rejectsMutation((candidate) => {
    candidate.controllerMatrix[key] = value;
  });
});

test("physical input recipient and system-reserved ownership cannot weaken", async () => {
  for (const key of [
    "everyTrialRequiresPhysicalSourceCanonicalMappingRecipientGameAndSystemEventOracles",
    "supportedStandardsConformantControllersRequireZeroManualMapping",
    "systemHomeBackPauseResumeAndExitMustNeverReachTheFrontendCoreOrContent",
  ]) await rejectsMutation((plan) => {
    plan.controllerMatrix[key] = false;
  });
  await rejectsMutation((plan) => {
    plan.controllerMatrix.oneControllerActionFrontendTargetWorkloadOrAggregateMayRescueFailure = true;
  });
});

test("independent package process window input media storage and clock evidence is required", async () => {
  await rejectsMutation((plan) => {
    plan.measurements.requiredMetricIds.pop();
  });
  await rejectsMutation((plan) => {
    plan.measurements.independentPackageProcessWindowInputAudioVideoNetworkStoragePowerAndClockOraclesRequired = false;
  });
  await rejectsMutation((plan) => {
    plan.measurements.frontendSelfReportProcessStartFirstFrameHeartbeatOrWindowExistenceMayEstablishReadiness = true;
  });
  await rejectsMutation((plan) => {
    plan.measurements.configurationTextOrDisabledMenuEntryMayEstablishSandboxNetworkOrFilesystemContainment = true;
  });
});

test("unsigned rights network escape process save and controller failures remain zero", async () => {
  for (const key of [
    "maximumUnsignedUnhashedUnlicensedUnreviewedOrNonreproducibleArtifacts",
    "maximumUnexpectedNetworkUpdaterAchievementTelemetryOrCommandInterfaceAttempts",
    "maximumDesktopShellFilesystemSourceMediaRawMenuOrArbitraryCoreContentExposureEvents",
    "maximumEscapedUnreapedOrUnaccountedFrontendCoreContentOrDescendantProcesses",
    "maximumCrossGameCrossProfilePackageContentSaveStateRemapCacheOrLogAccessEvents",
    "maximumSaveOrStateLossCorruptionRollbackRegressionOrWrongGenerationEvents",
    "maximumMissedDuplicatedStuckWrongRecipientWrongPlayerOrWrongMappedControllerActions",
    "maximumSystemHomeBackPauseResumeOrExitEventsDeliveredToFrontendCoreOrContent",
    "maximumKeyboardMouseShellOperatorHiddenSetupManualCoreSelectionOrManualMappingRecoveries",
    "maximumFalseReadyHealthySavedRecoveredUpdatedRolledBackUninstalledOrSuccessClaims",
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = 1;
  });
});

test("feedback launch readiness family mode and no-enhancement gates remain exact", async () => {
  for (const [key, value] of [
    ["maximumVisibleFeedbackMs", 251],
    ["maximumLocalLaunchToVisibleFocusedUsableInputMs", 15001],
    ["usableInputRequiresVisibleFocusedResponsiveIntendedControllerAndCorrectRecipient", false],
    ["processStartFirstFrameWindowHeartbeatOrFrontendSelfReportMayEstablishUsableInput", true],
    ["baselineShadersRunAheadPreemptiveFramesRewindFrameDelayHardGpuSyncAndThreadedVideoMustRemainDisabled", false],
    ["familyModeMustExposeOnlyTheCuratedGameAndSystemOwnedSurfaces", false],
    ["frontendTargetWorkloadScenarioControllerOrAggregatePassMayRescueFailure", true],
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = value;
  });
});

test("performance controller recovery compatibility retention and issue gates stay open", async () => {
  for (const key of [
    "maximumVideoInputToPhotonP95Us",
    "maximumAbsoluteAudioVideoSyncErrorP95Us",
    "minimumSustainedFpsMilliFps",
    "maximumRecoveryToLauncherP95AndWorstMsByFault",
    "minimumDistinctPhysicalControllerSamplesPerTargetAndFrontend",
    "exactReadinessLivenessCleanupAndWindowQualificationPolicySha256",
    "exactSaveStateUpdateRollbackUninstallRetentionAndCompatibilityPolicySha256",
    "exactIssueSeverityTriageClosureRetestExpiryAndRegressionPolicySha256",
  ]) await rejectsMutation((plan) => {
    plan.openAcceptance[key] = 1;
  }, /must remain open/u);
});

test("candidate labels filenames and developer fixtures cannot bypass package or rights closure", async () => {
  for (const key of [
    "artifactFilenameVersionFamilyOrCandidateLabelMaySubstituteForDigestIdentity",
    "currentlyUnverifiedRetro2048ManifestOrZeroAdmissionScreenMayBecomeLaunchAuthority",
    "networkDownloadCoreUpdaterContentScannerOrRuntimePackageMutationAllowedDuringQualification",
    "passingDeveloperFixtureMayCountAsAStarterCatalogTitle",
  ]) await rejectsMutation((plan) => {
    plan.packageAndRightsPolicy[key] = true;
  });
  await rejectsMutation((plan) => {
    plan.packageAndRightsPolicy.titleCodeContentAssetTrademarkAttributionAgeAndMaintenanceReviewRequired = false;
  });
});

test("profile save state update rollback and uninstall scopes remain isolated", async () => {
  for (const key of [
    "opaqueRegisteredProfileIdAndExactGamePackageGenerationBindingRequired",
    "saveStateRemapCoreOptionScreenshotSystemCacheLogAndRuntimeNamespacesMustRemainSeparate",
    "healthyUpdateAndRollbackMustPreserveCompatibleSavesAndDeclareStateCompatibility",
    "uninstallRequiresControllerConfirmedSaveDispositionAndNoUnexplainedLeftovers",
    "factoryResetProfileDeletionPackageRemovalAndGameUninstallScopesMustRemainDistinct",
  ]) await rejectsMutation((plan) => {
    plan.saveAndLifecyclePolicy[key] = false;
  });
  await rejectsMutation((plan) => {
    plan.saveAndLifecyclePolicy.displayNamePortraitBodyDataIdentitySecretPathOrFreeTextMayEnterSaveLifecycleEvidence = true;
  });
});

test("technical or primary-frontend passes cannot choose a title fallback or product policy", async () => {
  for (const key of [
    "fallbackFrontendId", "starterTitleId", "frontendQualificationDisposition",
    "starterCatalogDisposition", "productCatalogPackageControllerOrSupportMutation",
  ]) await rejectsMutation((plan) => {
    plan.decisionProtocol[key] = "invented";
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.primaryFrontendPassMayEliminateOrQualifyTheFallbackLane = true;
  });
  await rejectsMutation((plan) => {
    plan.decisionProtocol.technicalPassAutomaticallyApprovesRightsDistributionCatalogOrProductSupport = true;
  });
});

test("no artifact target data rights catalog or publication authority exists", async () => {
  const plan = await loadPlan();
  for (const key of Object.keys(plan.authorityBoundary).filter((key) => key.endsWith("Authorized"))) {
    await rejectsMutation((candidate) => {
      candidate.authorityBoundary[key] = true;
    });
  }
});

test("raw content saves media paths identities controller payloads and free logs remain prohibited", async () => {
  for (const key of [
    "rawRomContentBiosSaveStateSaveRemapScreenshotAudioVideoOrMemoryBytesAllowed",
    "filesystemPathsUsernamesHostnamesEnvironmentCommandsArgumentsOrProcessIdsAllowed",
    "profileDisplayNamesPortraitsBodyDataIdentitySecretsCredentialsTokensOrStableIdentifiersAllowed",
    "rawControllerHidUsbBluetoothPayloadSerialMacOrStableDeviceIdentifiersAllowed",
    "freeTextFrontendCoreGameDriverCompositorServiceCrashParticipantOrOperatorLogsAllowed",
  ]) await rejectsMutation((plan) => {
    plan.dataPolicy[key] = true;
  });
});

test("all sixteen blockers and the zero-result envelope remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, SUPERVISED_LIBRETRO_BLOCKERS);
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
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-supervised-libretro-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "qualified",'));
    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(await readFile(duplicate)), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(JSON.parse(sourceText)));
    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(await readFile(noncanonical)), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sourceBytes]));
    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(await readFile(bom)), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(await readFile(invalid)), /valid UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, Buffer.from(sourceText.replace("\n", "\r")));
    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(await readFile(bareCr)), /bare CR/u);

    await assert.rejects(parseSupervisedLibretroQualificationPlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20)), /exceeds/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
