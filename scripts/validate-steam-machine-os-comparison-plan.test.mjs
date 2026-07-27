import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseSteamMachineOsComparisonPlanBytes,
  STEAM_MACHINE_OS_COMPARISON_BLOCKERS,
  STEAM_MACHINE_OS_COMPARISON_CONTRACT_SHA256,
  STEAM_MACHINE_OS_LANE_IDS,
  STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS,
  STEAM_MACHINE_OS_SCENARIO_IDS,
  STEAM_MACHINE_OS_TRACE_IDS,
  STEAM_MACHINE_OS_WORKLOAD_IDS,
  validateSteamMachineOsComparisonPlan,
  validateTrackedSteamMachineOsComparisonPlan,
} from "./validate-steam-machine-os-comparison-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/steam-machine-os-comparison/steam-machine-steamos-windows-comparison-plan-v1.json",
);
const sourceBytes = await readFile(planPath);
const sourceText = sourceBytes.toString("utf8");

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

async function rejectsMutation(mutate, pattern = /plan contract drifted/u) {
  const plan = await loadPlan();
  mutate(plan);
  await assert.rejects(validateSteamMachineOsComparisonPlan(plan, root), pattern);
}

test("tracked I-176 same-hardware comparison plan validates", async () => {
  const plan = await validateTrackedSteamMachineOsComparisonPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.result, null);
  assert.match(STEAM_MACHINE_OS_COMPARISON_CONTRACT_SHA256, /^[a-f0-9]{64}$/u);
});

test("source bindings are strict and normalized-digest verified", async () => {
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].sha256 = "0".repeat(64);
  }, /digest drifted/u);
  await rejectsMutation((plan) => {
    plan.sourceBindings[0].path = "docs/DECISIONS.md";
  }, /Expected values to be strictly deep-equal/u);
});

test("unknown top-level fields and reordered schema are rejected", async () => {
  await rejectsMutation((plan) => {
    plan.notes = "invented";
  }, /fields drifted/u);
  await rejectsMutation((plan) => {
    const status = plan.status;
    delete plan.status;
    plan.status = status;
  }, /fields drifted/u);
});

test("exact same received hardware and paired reset contract cannot be weakened", async () => {
  for (const key of [
    "sameExactChassisMainboardCpuGpuRamStorageFirmwareCameraControllerDisplayAudioNetworkPowerAndInstrumentationRequired",
    "everyPairedAttemptUsesOneOpaquePairIdAndBothOperatingSystemLanes",
    "everyPairUsesTheSameFrozenWorkloadTraceFaultScheduleAndAcceptanceRules",
    "hardwareFirmwarePeripheralRoomInstrumentOrGateChangeRequiresCompleteComparisonRerun",
    "failedInvalidInterruptedRetriedPreRepairAndWorstCasePairsRemainVisible",
  ]) await rejectsMutation((plan) => {
    plan.hardwareAndPairingContract[key] = false;
  });
  await rejectsMutation((plan) => {
    plan.hardwareAndPairingContract.laneSpecificOptimizationOutsideTheFrozenManifestAllowed = true;
  });
});

test("Windows workstation proxy and different hardware cannot substitute", async () => {
  await rejectsMutation((plan) => {
    plan.prerequisiteGate.receivedTargetMayBeReplacedByWindowsWorkstationProxyOrDifferentSteamMachine = true;
  });
  await rejectsMutation((plan) => {
    plan.hardwareAndPairingContract.windowsDevelopmentWorkstationProxyOrVendorSpecificationMaySubstitute = true;
  });
});

test("operating-system lane identities and product roles remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.operatingSystemLanes.map((lane) => lane.osLaneId), STEAM_MACHINE_OS_LANE_IDS);
  await rejectsMutation((candidate) => {
    candidate.operatingSystemLanes.reverse();
  });
  await rejectsMutation((candidate) => {
    candidate.operatingSystemLanes[1].productRole = "primary";
  });
  await rejectsMutation((candidate) => {
    candidate.operatingSystemLanes[1].mayBecomePrimaryOrFallbackFromTechnicalPassAlone = true;
  });
});

test("all five exact workload lanes remain blocking", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.workloadRoles.map((workload) => workload.workloadId), STEAM_MACHINE_OS_WORKLOAD_IDS);
  await rejectsMutation((candidate) => {
    candidate.workloadRoles.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.workloadRoles[1].mustRunOnBothOperatingSystemLanes = false;
  });
});

test("paired trace identities mapping and 200-run arithmetic remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.traceBundleRoles.map((trace) => trace.traceBundleId), STEAM_MACHINE_OS_TRACE_IDS);
  assert.equal(plan.pairedTraceMatrix.requiredLaneWorkloadTraceCellCount, 10);
  assert.equal(plan.pairedTraceMatrix.requiredTraceRunCount, 200);
  await rejectsMutation((candidate) => {
    candidate.traceBundleRoles[1].workloadId = "launcher-shell";
  });
  await rejectsMutation((candidate) => {
    candidate.pairedTraceMatrix.validRunsPerCell = 1;
  });
  await rejectsMutation((candidate) => {
    candidate.pairedTraceMatrix.oneLaneWorkloadTraceRunOrAggregateMayRescueFailure = true;
  });
});

test("replay evidence cannot qualify live integrated behavior", async () => {
  for (let index = 0; index < STEAM_MACHINE_OS_TRACE_IDS.length; index += 1) {
    await rejectsMutation((plan) => {
      plan.traceBundleRoles[index].replayMayQualifyLiveCameraControllerOrProductBehavior = true;
    });
  }
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.replayTraceMayQualifyLiveIntegratedBehavior = true;
  });
});

test("all eighteen lifecycle scenarios and 3,600-cycle arithmetic remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.lifecycleScenarioIds, STEAM_MACHINE_OS_SCENARIO_IDS);
  assert.equal(plan.lifecycleMatrix.requiredLaneWorkloadScenarioCellCount, 180);
  assert.equal(plan.lifecycleMatrix.requiredLifecycleCycleCount, 3600);
  await rejectsMutation((candidate) => {
    candidate.lifecycleScenarioIds.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.lifecycleMatrix.validCyclesPerCell = 1;
  });
  await rejectsMutation((candidate) => {
    candidate.lifecycleMatrix.nonApplicableOutcomeRequiresPreRegisteredReasonAndCannotCountAsPass = false;
  });
});

test("fixed product timing latency and zero-failure gates cannot be relaxed", async () => {
  for (const [key, value] of [
    ["maximumVisibleFeedbackMs", 251],
    ["maximumColdBootToControllerUsableMs", 60001],
    ["maximumWarmResumeToControllerUsableMs", 5001],
    ["maximumLocalLaunchToVisibleFocusedUsableInputMs", 15001],
    ["maximumHostedLaunchToInteractiveOrTruthfulObservablePhaseMs", 30001],
    ["maximumCameraExposureToActionDeliveryP95Us", 120001],
    ["maximumFailedRequiredTraceRunsOrLifecycleCycles", 1],
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = value;
  });
});

test("accountless offline identity input cleanup and recovery zero gates remain fixed", async () => {
  for (const key of [
    "maximumSteamOrMicrosoftAccountDependenciesForCoreLocalOperation",
    "maximumRequiredNetworkRequestsForCoreLocalOfflineOperation",
    "maximumUndeclaredNetworkEgresses",
    "maximumIdentityCredentialTokenCookieProfileSaveOrDeviceOwnerReassociationsAcrossOsLanes",
    "maximumSilentProfileSavePackageCacheOrProgressLossCorruptionOrCrossLaneAccessEvents",
    "maximumKeyboardMouseShellOperatorOrHiddenSetupInterventionsInControllerOnlyProductPaths",
    "maximumReservedHomeBackPauseResumeExitOrPowerActionsDeliveredToGameContent",
    "maximumEscapedUnreapedOrUnaccountedGameTrackerBrowserOrPackageDescendants",
    "maximumUnrecoveredCrashHangCameraTrackerInputUpdateRollbackOrSuspendFailures",
  ]) await rejectsMutation((plan) => {
    plan.fixedAcceptance[key] = 1;
  });
});

test("every open quality resource maintenance and decision gate remains null", async () => {
  const plan = await loadPlan();
  assert.deepEqual(Object.keys(plan.openAcceptance), STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS);
  for (const key of STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS) {
    assert.equal(plan.openAcceptance[key], null);
    await rejectsMutation((candidate) => {
      candidate.openAcceptance[key] = key.endsWith("Sha256") ? "f".repeat(64) : 1;
    }, /must remain open|plan contract drifted/u);
  }
});

test("Windows fallback requires a measured SteamOS gap closure and zero new failures", async () => {
  for (const key of [
    "steamOsPrimaryByDefault",
    "windowsCandidateOnlyAfterAtLeastOneFrozenRequiredSteamOsGateFails",
    "eachCandidateGapRequiresExactSteamOsFailingCellPairAndMetricIds",
    "windowsMustPassTheSamePairedCellsTracesWorkloadsOraclesAndFrozenGates",
    "windowsMustCloseEveryCitedGapByTheFrozenMaterialityRule",
    "windowsMustIntroduceZeroNewRequiredGateFailures",
    "windowsMustPreserveAccountlessOfflineControllerCameraDataRecoveryAndTimingContracts",
    "fallbackScopeMustBeLimitedToExactQualifiedWorkloadsFeaturesAndHardware",
    "fallbackRequiresSeparateOwnerApprovalAfterCompleteIndependentReview",
    "fallbackExpiresOnBoundOsDriverRuntimePackageHardwareOrGateChange",
  ]) await rejectsMutation((plan) => {
    plan.fallbackDecisionProtocol[key] = false;
  });
  await rejectsMutation((plan) => {
    plan.fallbackDecisionProtocol.windowsPassWithoutSteamOsFailureMaySelectFallback = true;
  });
  await rejectsMutation((plan) => {
    plan.fallbackDecisionProtocol.windowsFallbackAccepted = true;
  });
});

test("comparison cannot promote Steam Machine or weaken required product tiers", async () => {
  await rejectsMutation((plan) => {
    plan.fixedAcceptance.steamMachineResultMayReplaceRescueOrWeakenRequiredOrdinaryLinuxOrPiTiers = true;
  });
  await rejectsMutation((plan) => {
    plan.fallbackDecisionProtocol.technicalComparisonMayChangePrimaryEnvironmentOptionalTargetOrRequiredTiers = true;
  });
});

test("no target system account data fault fallback or publication authority exists", async () => {
  const plan = await loadPlan();
  for (const key of Object.keys(plan.authorityBoundary)) {
    await rejectsMutation((candidate) => {
      candidate.authorityBoundary[key] = true;
    });
  }
});

test("raw media identities paths payloads and free-form logs remain prohibited", async () => {
  for (const key of [
    "rawCameraScreenAudioVideoSkeletonControllerNetworkStorageSaveOrMemoryBytesAllowedInPlanRepositoryOrResult",
    "namesFacesVoicesExactAgesDisplayNamesPortraitsBodyDataOrStableIdentifiersAllowed",
    "steamMicrosoftHostedAccountCredentialsTokensCookiesIdentityOrProfileAssociationsAllowed",
    "pathsUsernamesHostnamesSerialsMacsUrlsWithQueriesEnvironmentCommandsArgumentsOrProcessIdsAllowed",
    "freeTextOsDriverRuntimeServiceGameCrashParticipantOperatorOrMaintenanceLogsAllowed",
  ]) await rejectsMutation((plan) => {
    plan.dataPolicy[key] = true;
  });
});

test("all eighteen blockers and the zero-result envelope remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, STEAM_MACHINE_OS_COMPARISON_BLOCKERS);
  await rejectsMutation((candidate) => {
    candidate.executionGate.blockerCodes.pop();
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.status = "ready";
  });
  await rejectsMutation((candidate) => {
    candidate.executionGate.mayExecute = true;
  });
  await rejectsMutation((candidate) => {
    candidate.result = { windowsFallbackAccepted: true };
  });
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-steam-machine-os-comparison-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "qualified",'));
    await assert.rejects(parseSteamMachineOsComparisonPlanBytes(await readFile(duplicate)), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(JSON.parse(sourceText)));
    await assert.rejects(parseSteamMachineOsComparisonPlanBytes(await readFile(noncanonical)), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sourceBytes]));
    await assert.rejects(parseSteamMachineOsComparisonPlanBytes(await readFile(bom)), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(parseSteamMachineOsComparisonPlanBytes(await readFile(invalid)), /valid UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, Buffer.from(sourceText.replace("\n", "\r")));
    await assert.rejects(parseSteamMachineOsComparisonPlanBytes(await readFile(bareCr)), /bare CR/u);

    await assert.rejects(
      parseSteamMachineOsComparisonPlanBytes(Buffer.alloc(384 * 1024 + 1, 0x20)),
      /exceeds/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
