import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steam-machine-os-comparison/steam-machine-steamos-windows-comparison-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const ZERO_SHA256 = "0".repeat(64);

export const STEAM_MACHINE_OS_COMPARISON_FORMAT =
  "vcg-steam-machine-steamos-windows-comparison-plan/v1";
export const STEAM_MACHINE_OS_COMPARISON_CONTRACT_SHA256 =
  "f59829c34ca7388f0355d153d25c4eee30ff004c29317d862ffca55f7e25b5e1";

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings",
  "prerequisiteGate", "hardwareAndPairingContract", "operatingSystemLanes",
  "workloadRoles", "traceBundleRoles", "pairedTraceMatrix",
  "lifecycleScenarioIds", "lifecycleMatrix", "measurements",
  "fixedAcceptance", "openAcceptance", "fallbackDecisionProtocol",
  "authorityBoundary", "dataPolicy", "executionGate", "result",
];

const sourceDefinitions = [
  ["optional-steam-machine-platform-and-known-unknowns-boundary", "docs/STEAM_MACHINE_2026.md"],
  ["supported-dual-boot-zero-result-boundary", "benchmarks/steam-machine-dual-boot/steam-machine-windows-dual-boot-status-v1.json"],
  ["windows-development-workstation-evidence-and-platform-limit", "docs/WINDOWS_QUALIFICATION_RESULT_2026-07-24.md"],
  ["steamos-update-safe-package-boundary", "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json"],
  ["steamos-uvc-permission-and-live-camera-boundary", "benchmarks/steamos-camera/steamos-uvc-permission-plan-v1.json"],
  ["steamos-pose-concurrent-game-workload-boundary", "benchmarks/steamos-workload/steamos-pose-game-workload-plan-v1.json"],
  ["steamos-input-action-and-accountless-base-input-boundary", "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json"],
  ["steam-machine-accountless-core-boundary", "benchmarks/steam-machine-accountless/steam-machine-accountless-core-plan-v1.json"],
  ["steamos-outer-shell-lifecycle-boundary", "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json"],
  ["cross-tier-boot-resume-launch-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
  ["complete-system-economics-and-maintenance-boundary", "benchmarks/system-economics/complete-system-economics-plan-v1.json"],
  ["controller-only-cold-start-and-recovery-usability-boundary", "benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json"],
  ["fixed-product-success-and-latency-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["required-pi-and-ordinary-linux-tier-boundary", "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json"],
];

export const STEAM_MACHINE_OS_LANE_IDS = Object.freeze([
  "steamos-primary",
  "windows-conditional-fallback",
]);

export const STEAM_MACHINE_OS_WORKLOAD_IDS = Object.freeze([
  "launcher-shell",
  "obstacle-motion-sample",
  "selected-signed-local-package",
  "rights-cleared-supervised-libretro-package",
  "selected-hosted-game-compatibility",
]);

export const STEAM_MACHINE_OS_TRACE_IDS = Object.freeze([
  "launcher-shell-common-trace",
  "obstacle-motion-common-trace",
  "signed-local-package-common-trace",
  "supervised-libretro-common-trace",
  "hosted-game-common-trace",
]);

export const STEAM_MACHINE_OS_SCENARIO_IDS = Object.freeze([
  "clean-package-install-readback-and-supported-auto-entry",
  "accountless-first-vcg-entry-without-steam-or-microsoft-identity",
  "accountless-online-cold-boot-to-controller-usable",
  "accountless-offline-cold-boot-to-controller-usable",
  "network-loss-local-continuity-truthful-hosted-failure-and-restore",
  "branded-loading-exact-readiness-usable-input-and-bounded-cancel",
  "live-uvc-permission-mode-exposure-timestamp-hotplug-and-reconnect",
  "live-camera-pose-action-concurrent-game-quality-and-latency",
  "controller-discovery-zero-setup-glyph-reserved-actions-and-reconnect",
  "normal-exit-descendant-cleanup-focus-restore-and-fresh-input-epoch",
  "game-crash-detection-cleanup-truthful-recovery-and-fresh-retry",
  "game-hang-readiness-loss-forced-cleanup-and-system-owned-exit",
  "camera-or-tracker-loss-fresh-stream-epoch-and-bounded-recovery",
  "suspend-resume-camera-audio-video-input-focus-save-and-network-state",
  "os-driver-runtime-vcg-package-update-health-failure-and-rollback",
  "uninstall-reinstall-explicit-local-profile-save-and-cache-disposition",
  "one-hour-steady-state-power-thermal-acoustic-resource-and-frame-quality",
  "operator-maintenance-diagnostics-repair-recovery-and-time-burden",
]);

export const STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS = Object.freeze([
  "minimumPerActionPrecisionPpmByLaneWorkload",
  "minimumPerActionRecallPpmByLaneWorkload",
  "minimumPoseFrameRateMilliHzByLaneWorkload",
  "minimumGameFrameRateMilliHzByLaneWorkload",
  "maximumGameFrameTimeP95UsByLaneWorkload",
  "maximumFramePacingErrorP95UsByLaneWorkload",
  "maximumDroppedCaptureRatePpmByLaneWorkload",
  "maximumDroppedPoseRatePpmByLaneWorkload",
  "maximumExposureTimestampUncertaintyUsByLane",
  "maximumCaptureToPoseP95UsByLaneWorkload",
  "maximumActionDeliveryOverheadP95UsByLaneWorkload",
  "maximumControllerToVisibleResponseP95UsByLaneWorkload",
  "maximumAudioOutputLatencyP95UsByLaneWorkload",
  "maximumAbsoluteAudioVideoSyncErrorP95UsByLaneWorkload",
  "maximumCpuUtilizationPpmByLaneWorkload",
  "maximumGpuUtilizationPpmByLaneWorkload",
  "maximumResidentMemoryBytesByLaneWorkload",
  "maximumVramBytesByLaneWorkload",
  "maximumPersistentStorageGrowthBytesPerHourByLaneWorkload",
  "maximumDiagnosticLogGrowthBytesPerHourByLaneWorkload",
  "maximumWallPowerMilliwattsByLaneWorkloadPhase",
  "maximumEnergyMilliwattHoursByLaneScenario",
  "maximumSustainedCpuTemperatureMilliCByLaneWorkload",
  "maximumSustainedGpuTemperatureMilliCByLaneWorkload",
  "maximumThermalThrottleEventsByLaneWorkload",
  "maximumOneMeterAcousticsMilliDbaByLaneWorkloadPhase",
  "maximumCrashHangOrComponentRecoveryP95AndWorstMsByFaultAndLane",
  "maximumUpdateRollbackReinstallAndRecoveryP95AndWorstMsByLane",
  "maximumOperatorMaintenanceSecondsPerScenarioByLane",
  "maximumScheduledMaintenanceEventsPerYearByLane",
  "maximumUnscheduledMaintenanceEventsPerYearByLane",
  "maximumWindowsMaintenanceBurdenDeltaSecondsPerYear",
  "minimumMaterialWindowsGapClosureDeltaByMetric",
  "exactGapClassificationRootCauseAndAttributionProtocolSha256",
  "exactPairedStatisticalUncertaintyOutlierAndMissingDataProtocolSha256",
  "exactWindowsFallbackScopeExpiryRegressionAndReturnToSteamOsProtocolSha256",
  "exactIndependentEvidenceReviewAndOwnerDecisionPacketProtocolSha256",
]);

export const STEAM_MACHINE_OS_COMPARISON_BLOCKERS = Object.freeze([
  "I176-001-exact-received-steam-machine-hardware-firmware-storage-custody-and-peripheral-manifest",
  "I176-002-qualified-supported-dual-boot-install-update-boot-selection-backup-and-recovery-result",
  "I176-003-exact-steamos-image-driver-runtime-package-auto-entry-update-and-recovery-lane-manifest",
  "I176-004-exact-windows-image-driver-runtime-package-auto-entry-update-and-recovery-lane-manifest",
  "I176-005-exact-common-vcg-build-model-catalog-package-workload-configuration-and-readback-manifest",
  "I176-006-qualified-live-camera-permission-mode-timestamp-pose-action-and-reconnect-protocol",
  "I176-007-qualified-controller-zero-setup-glyph-reserved-action-reconnect-and-input-epoch-protocol",
  "I176-008-qualified-accountless-auto-entry-offline-identity-profile-save-and-service-boundary-protocol",
  "I176-009-exact-rights-cleared-common-trace-ground-truth-payload-retention-and-deletion-manifest",
  "I176-010-exact-loading-readiness-process-window-descendant-audio-video-network-storage-and-clock-oracles",
  "I176-011-exact-package-os-driver-runtime-update-rollback-uninstall-reinstall-and-data-disposition-protocol",
  "I176-012-exact-crash-hang-camera-tracker-input-suspend-resume-and-recovery-fault-protocol",
  "I176-013-exact-power-thermal-acoustic-resource-ambient-cooldown-and-maintenance-instrumentation-protocol",
  "I176-014-frozen-quality-resource-maintenance-materiality-uncertainty-and-regression-gates",
  "I176-015-exact-paired-order-reset-counterbalance-invalid-cycle-exclusion-and-complete-rerun-protocol",
  "I176-016-closed-path-free-data-redaction-retention-deletion-incident-and-independent-review-policy",
  "I176-017-exact-target-account-network-data-fault-update-recovery-capture-and-operator-authority",
  "I176-018-owner-reviewed-windows-fallback-scope-expiry-publication-and-product-decision-boundary",
]);

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has a bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

function contractDigest(plan) {
  const normalized = structuredClone(plan);
  for (const binding of normalized.sourceBindings) binding.sha256 = ZERO_SHA256;
  return createHash("sha256")
    .update(`${JSON.stringify(normalized, null, 2)}\n`)
    .digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings));
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath));
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateSteamMachineOsComparisonPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAM_MACHINE_OS_COMPARISON_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i176-steam-machine-steamos-windows-same-hardware-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26T23:59:59.000Z");
  assert.match(plan.qualificationScope, /I-176/u);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /No artifact retrieval/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.equal(
    contractDigest(plan),
    STEAM_MACHINE_OS_COMPARISON_CONTRACT_SHA256,
    "plan contract drifted",
  );

  assert.deepEqual(
    plan.operatingSystemLanes.map((lane) => lane.osLaneId),
    STEAM_MACHINE_OS_LANE_IDS,
  );
  assert.deepEqual(
    plan.workloadRoles.map((workload) => workload.workloadId),
    STEAM_MACHINE_OS_WORKLOAD_IDS,
  );
  assert.deepEqual(
    plan.traceBundleRoles.map((trace) => trace.traceBundleId),
    STEAM_MACHINE_OS_TRACE_IDS,
  );
  assert.deepEqual(plan.lifecycleScenarioIds, STEAM_MACHINE_OS_SCENARIO_IDS);

  assert.deepEqual(plan.pairedTraceMatrix.osLaneIds, STEAM_MACHINE_OS_LANE_IDS);
  assert.deepEqual(plan.pairedTraceMatrix.workloadIds, STEAM_MACHINE_OS_WORKLOAD_IDS);
  assert.deepEqual(plan.pairedTraceMatrix.traceBundleIds, STEAM_MACHINE_OS_TRACE_IDS);
  assert.equal(
    plan.pairedTraceMatrix.requiredLaneWorkloadTraceCellCount,
    plan.pairedTraceMatrix.osLaneCount * plan.pairedTraceMatrix.workloadTracePairCount,
  );
  assert.equal(
    plan.pairedTraceMatrix.requiredTraceRunCount,
    plan.pairedTraceMatrix.requiredLaneWorkloadTraceCellCount
      * plan.pairedTraceMatrix.validRunsPerCell,
  );
  assert.deepEqual(plan.lifecycleMatrix.osLaneIds, STEAM_MACHINE_OS_LANE_IDS);
  assert.deepEqual(plan.lifecycleMatrix.workloadIds, STEAM_MACHINE_OS_WORKLOAD_IDS);
  assert.equal(plan.lifecycleMatrix.scenarioCount, STEAM_MACHINE_OS_SCENARIO_IDS.length);
  assert.equal(
    plan.lifecycleMatrix.requiredLaneWorkloadScenarioCellCount,
    plan.lifecycleMatrix.osLaneCount
      * plan.lifecycleMatrix.workloadCount
      * plan.lifecycleMatrix.scenarioCount,
  );
  assert.equal(
    plan.lifecycleMatrix.requiredLifecycleCycleCount,
    plan.lifecycleMatrix.requiredLaneWorkloadScenarioCellCount
      * plan.lifecycleMatrix.validCyclesPerCell,
  );

  exactKeys(plan.openAcceptance, STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS, "openAcceptance");
  for (const key of STEAM_MACHINE_OS_OPEN_ACCEPTANCE_KEYS) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }

  assert.equal(plan.fixedAcceptance.maximumCameraExposureToActionDeliveryP95Us, 120000);
  assert.equal(plan.fixedAcceptance.maximumColdBootToControllerUsableMs, 60000);
  assert.equal(plan.fixedAcceptance.maximumWarmResumeToControllerUsableMs, 5000);
  assert.equal(plan.fixedAcceptance.maximumLocalLaunchToVisibleFocusedUsableInputMs, 15000);
  assert.equal(plan.fixedAcceptance.maximumHostedLaunchToInteractiveOrTruthfulObservablePhaseMs, 30000);
  assert.equal(plan.fixedAcceptance.maximumFailedRequiredTraceRunsOrLifecycleCycles, 0);
  assert.equal(plan.fixedAcceptance.maximumWindowsFallbackAcceptancesWithoutMeasuredRequiredSteamOsGap, 0);
  assert.equal(plan.fixedAcceptance.maximumWindowsFallbackAcceptancesWithAnyNewRequiredGateFailure, 0);
  assert.equal(plan.fixedAcceptance.maximumWindowsFallbackAcceptancesWithoutOwnerApproval, 0);
  assert.equal(plan.fixedAcceptance.replayTraceMayQualifyLiveIntegratedBehavior, false);
  assert.equal(plan.fixedAcceptance.windowsAggregateAverageBestCaseProxyOrDevelopmentWorkstationMayRescueSteamOs, false);
  assert.equal(plan.fixedAcceptance.steamMachineResultMayReplaceRescueOrWeakenRequiredOrdinaryLinuxOrPiTiers, false);

  assert.equal(plan.hardwareAndPairingContract.everyPairedAttemptUsesOneOpaquePairIdAndBothOperatingSystemLanes, true);
  assert.equal(plan.hardwareAndPairingContract.laneSpecificOptimizationOutsideTheFrozenManifestAllowed, false);
  assert.equal(plan.hardwareAndPairingContract.oneLaneWorkloadScenarioPairOrAggregateMayRescueAnother, false);
  assert.equal(plan.fallbackDecisionProtocol.steamOsPrimaryByDefault, true);
  assert.equal(plan.fallbackDecisionProtocol.windowsCandidateOnlyAfterAtLeastOneFrozenRequiredSteamOsGateFails, true);
  assert.equal(plan.fallbackDecisionProtocol.windowsMustIntroduceZeroNewRequiredGateFailures, true);
  assert.equal(plan.fallbackDecisionProtocol.fallbackRequiresSeparateOwnerApprovalAfterCompleteIndependentReview, true);
  assert.equal(plan.fallbackDecisionProtocol.windowsPassWithoutSteamOsFailureMaySelectFallback, false);
  assert.equal(plan.fallbackDecisionProtocol.technicalComparisonMayChangePrimaryEnvironmentOptionalTargetOrRequiredTiers, false);
  assert.equal(plan.fallbackDecisionProtocol.windowsFallbackAccepted, false);

  for (const [key, value] of Object.entries(plan.authorityBoundary)) {
    assert.equal(value, false, `authorityBoundary.${key} must remain false`);
  }
  for (const key of [
    "rawCameraScreenAudioVideoSkeletonControllerNetworkStorageSaveOrMemoryBytesAllowedInPlanRepositoryOrResult",
    "namesFacesVoicesExactAgesDisplayNamesPortraitsBodyDataOrStableIdentifiersAllowed",
    "steamMicrosoftHostedAccountCredentialsTokensCookiesIdentityOrProfileAssociationsAllowed",
    "pathsUsernamesHostnamesSerialsMacsUrlsWithQueriesEnvironmentCommandsArgumentsOrProcessIdsAllowed",
    "freeTextOsDriverRuntimeServiceGameCrashParticipantOperatorOrMaintenanceLogsAllowed",
  ]) assert.equal(plan.dataPolicy[key], false, `dataPolicy.${key} must remain false`);

  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, STEAM_MACHINE_OS_COMPARISON_BLOCKERS);
  assert.equal(plan.executionGate.mayExecute, false);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseSteamMachineOsComparisonPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes instanceof Uint8Array, "plan bytes must be a Uint8Array");
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan is not valid JSON", { cause: error });
  }
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateSteamMachineOsComparisonPlan(plan, repositoryRoot);
}

export async function validateTrackedSteamMachineOsComparisonPlan() {
  return parseSteamMachineOsComparisonPlanBytes(await readFile(trackedPath), root);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await validateTrackedSteamMachineOsComparisonPlan();
  console.log("Validated blocked same-hardware SteamOS/Windows comparison plan (I-176).");
}
