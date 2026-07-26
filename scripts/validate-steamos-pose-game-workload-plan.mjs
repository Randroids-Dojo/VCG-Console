import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steamos-workload/steamos-pose-game-workload-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAMOS_WORKLOAD_PLAN_FORMAT =
  "vcg-steamos-pose-game-workload-plan/v1";
export const STEAMOS_WORKLOAD_TARGETS = Object.freeze([
  [
    "exact-steam-machine",
    "optional-delivered-steam-machine",
    "may-qualify-only-this-exact-target",
  ],
  [
    "closest-supported-amd-steamos-proxy",
    "explicit-development-proxy-only",
    "development-only-never-steam-machine-qualification",
  ],
]);
export const STEAMOS_WORKLOAD_BACKENDS = Object.freeze([
  ["mediapipe-cpu", "cpu", "mediapipe-tasks"],
  ["onnxruntime-cpu", "cpu", "onnxruntime"],
  ["ncnn-vulkan", "gpu", "ncnn-vulkan"],
  [
    "supported-amd-accelerated",
    "gpu-or-accelerated",
    "exact-supported-amd-provider-to-be-bound",
  ],
]);
export const STEAMOS_WORKLOADS = Object.freeze([
  [
    "obstacle-motion-sample",
    "console-lab-component",
    "offline-required",
    "primary-motion-action-consumer",
  ],
  [
    "vibebots-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
  [
    "mi-casa-es-su-casa-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
  [
    "determined-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
]);
export const STEAMOS_WORKLOAD_RECOVERY_SCENARIOS = Object.freeze([
  "camera-loss-permission-loss-and-fresh-restoration",
  "tracker-process-termination-and-fresh-restart",
  "game-renderer-hang-exit-and-contained-return",
  "network-loss-offline-truth-and-deliberate-restoration",
  "reserved-home-back-pause-responsive-fullscreen-captured-and-hung",
  "launcher-restart-descendant-reap-and-fresh-readiness",
  "suspend-resume-camera-stop-input-epoch-and-fresh-stream",
  "package-update-steamos-update-offline-restart-and-recovery",
]);
export const STEAMOS_WORKLOAD_METRICS = Object.freeze([
  "exact-target-package-camera-controller-room-backend-model-workload-and-schedule-digests",
  "camera-exposure-count-drop-duplicate-epoch-timestamp-domain-and-uncertainty",
  "exposure-to-pose-exposure-to-action-and-action-to-game-response-percentiles",
  "per-action-precision-recall-f1-miss-false-event-and-privileged-activation-counts",
  "pose-admission-inference-postprocess-action-delivery-fps-latency-and-drops",
  "game-fps-frame-time-percentiles-long-frames-stalls-and-controlled-response",
  "cpu-utilization-frequency-time-energy-and-process-attribution",
  "gpu-utilization-frequency-render-compute-queue-time-energy-and-process-attribution",
  "ram-swap-vram-allocation-residency-pressure-growth-and-oom-state",
  "storage-network-ipc-device-filesystem-and-service-traffic",
  "wall-power-idle-baseline-energy-and-instrument-uncertainty",
  "cpu-gpu-memory-storage-and-enclosure-temperatures-clocks-throttle-and-fan-state",
  "one-metre-acoustics-ambient-floor-spectrum-tonality-and-meter-uncertainty",
  "launcher-browser-tracker-game-process-lifecycle-health-crash-hang-and-descendant-ledger",
  "controller-focus-reserved-action-input-epoch-and-recovery-state",
  "fault-containment-recovery-time-fresh-instance-state-integrity-and-recurrence",
  "failed-invalid-stopped-retried-adverse-and-worst-case-cell-ledger",
]);
export const STEAMOS_WORKLOAD_BLOCKERS = Object.freeze([
  "suw-001-selected-received-target-or-explicit-proxy-hardware-os-driver-and-resource-inventory",
  "suw-002-qualified-i166-package-and-accountless-core-execution-path",
  "suw-003-qualified-i167-camera-permission-microphone-privacy-and-exposure-clock-path",
  "suw-004-four-backend-implementation-runtime-model-provider-build-and-dependency-closures",
  "suw-005-exact-supported-amd-provider-availability-support-and-fallback-disposition",
  "suw-006-tracker-model-action-ground-truth-common-clock-and-game-response-protocol",
  "suw-007-exact-workload-content-interaction-service-account-and-non-destructive-mutation-policy",
  "suw-008-participant-room-ground-truth-accessibility-safety-and-collection-authority",
  "suw-009-performance-schedule-order-warmup-soak-sampling-and-independent-review",
  "suw-010-all-performance-quality-resource-power-thermal-acoustic-and-service-gates",
  "suw-011-recovery-fault-suspend-update-schedule-attempt-count-and-fresh-instance-protocol",
  "suw-012-power-thermal-acoustic-resource-clock-and-uncertainty-instrumentation",
  "suw-013-controller-focus-reserved-action-input-epoch-and-game-response-oracles",
  "suw-014-proxy-equivalence-limitations-no-rescue-and-exact-target-retest-policy",
  "suw-015-data-rights-privacy-retention-deletion-incident-and-adverse-evidence-policy",
  "suw-016-target-camera-participant-service-fault-update-qualification-selection-and-publication-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetCandidates",
  "targetSelectionBoundary",
  "authorityBoundary",
  "inferenceBackends",
  "workloads",
  "trackerAndWorkloadBoundary",
  "performanceMatrix",
  "recoveryMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["steam-machine-target-boundary", "docs/STEAM_MACHINE_2026.md"],
  [
    "steamos-package-campaign",
    "docs/STEAMOS_UPDATE_SAFE_CONTENT_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-package-plan",
    "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
  ],
  [
    "steamos-camera-campaign",
    "docs/STEAMOS_UVC_PERMISSION_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-camera-plan",
    "benchmarks/steamos-camera/steamos-uvc-permission-plan-v1.json",
  ],
  [
    "standard-concurrent-workload-campaign",
    "docs/CONCURRENT_GAME_WORKLOAD_CAMPAIGN_2026-07-25.md",
  ],
  [
    "standard-concurrent-workload-plan",
    "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
  ],
  [
    "camera-action-latency-campaign",
    "docs/CAMERA_ACTION_LATENCY_CAMPAIGN_2026-07-24.md",
  ],
  [
    "camera-action-latency-validator",
    "scripts/validate-camera-action-latency-campaign.mjs",
  ],
  [
    "windows-mediapipe-synthetic-boundary",
    "benchmarks/pose-backends/windows-x64-mediapipe-lite-cpu.json",
  ],
  [
    "windows-onnxruntime-synthetic-boundary",
    "benchmarks/pose-backends/windows-x64-rtmo-s-cpu.json",
  ],
  [
    "ordinary-x86-comparison-boundary",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  [
    "pi-cpu-comparison-boundary",
    "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json",
  ],
  ["prototype-gate-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["device-only-data-boundary", "docs/DEVICE_ONLY_DATA_EXCLUSION.md"],
  ["current-tracker-implementation-boundary", "apps/console-lab/src/tracker-worker.ts"],
];
const targetKeys = [
  "targetId",
  "targetClass",
  "evidenceDisposition",
  "hardwareInventorySha256",
  "steamOsImageKernelDriverGamescopeAndPipeWireSha256",
  "cpuGpuRamVramStorageCoolingAndPowerManifestSha256",
  "packageCameraControllerDisplayAndRoomManifestSha256",
  "targetResultSha256",
  "targetReceivedInventoriedOrQualified",
  "otherTargetEvidenceMayQualify",
  "resultMayReplaceRequiredReferenceTargets",
];
const authorityNullKeys = [
  "selectedInferenceBackendId",
  "qualifiedI166PackageResultSha256",
  "qualifiedI167CameraResultSha256",
  "trackerModelActionAndClockProtocolSha256",
  "backendBuildRuntimeModelAndProviderProtocolSha256",
  "workloadSessionInteractionAndServiceProtocolSha256",
  "participantRoomGroundTruthAndSafetyProtocolSha256",
  "powerThermalAcousticAndResourceInstrumentationSha256",
  "recoveryFaultSuspendAndUpdateProtocolSha256",
  "scheduleRandomizationNumericGateAndIndependentReviewSha256",
  "dataRightsPrivacyRetentionDeletionAndIncidentProtocolSha256",
];
const authorityFalseKeys = [
  "targetOrProxyOperationAuthorized",
  "cameraControllerOrParticipantOperationAuthorized",
  "serviceAccountOrHostedMutationAuthorized",
  "faultSuspendUpdateOrRecoveryAuthorized",
  "qualificationSelectionPublicationOrTierMutationAuthorized",
];
const backendKeys = [
  "backendId",
  "executionClass",
  "expectedRuntimeFamily",
  "implementationRuntimeModelAndProviderSha256",
  "packageAndDependencyClosureSha256",
  "targetBuildAndProviderProofSha256",
  "targetResultSha256",
  "windowsSyntheticEvidenceMayQualify",
  "unsupportedOrUnavailableResultMayBeDiscarded",
  "backendMayBeSelectedBeforeCompleteMatrix",
];
const workloadKeys = [
  "workloadId",
  "runtime",
  "networkClass",
  "motionRole",
  "exactContentAndInteractionSha256",
  "targetResultSha256",
  "loadOrHeartbeatMayProvePlayability",
  "compatibilityLoadMayProveMotionIntegration",
];
const openAcceptanceKeys = [
  "minimumValidAttemptsPerRecoveryCell",
  "minimumPerActionPrecisionPpm",
  "minimumPerActionRecallPpm",
  "minimumPoseFrameRateMilliHz",
  "minimumGameFrameRateMilliHz",
  "maximumGameFrameTimeP95Us",
  "maximumDroppedCaptureRatePpm",
  "maximumDroppedPoseRatePpm",
  "maximumExposureTimestampUncertaintyUs",
  "maximumCaptureToPoseP95Us",
  "maximumActionDeliveryOverheadP95Us",
  "maximumCpuUtilizationPpm",
  "maximumGpuUtilizationPpm",
  "maximumResidentMemoryBytes",
  "maximumVramBytes",
  "maximumWallPowerMilliwatts",
  "maximumSustainedCpuTemperatureMilliC",
  "maximumSustainedGpuTemperatureMilliC",
  "maximumThermalThrottleEvents",
  "maximumServiceErrorRatePpm",
  "maximumRecoveryP95Ms",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
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

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings), "sourceBindings must be an array");
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(
      relativePath.length > 0 &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateSteamOsPoseGameWorkloadPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAMOS_WORKLOAD_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "steamos-pose-game-workload-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-168"]);
  for (const phrase of [
    "strict zero-result qualification plan",
    "do not prove a received SteamOS target or proxy",
    "proxy result remains development-only",
    "No target or inference backend may be selected",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.ok(Array.isArray(plan.targetCandidates));
  assert.equal(plan.targetCandidates.length, STEAMOS_WORKLOAD_TARGETS.length);
  for (const [index, target] of plan.targetCandidates.entries()) {
    exactKeys(target, targetKeys, `targetCandidates[${index}]`);
    assert.deepEqual(
      [target.targetId, target.targetClass, target.evidenceDisposition],
      STEAMOS_WORKLOAD_TARGETS[index],
    );
    for (const key of targetKeys.slice(3, 8)) {
      assert.equal(target[key], null, `blocked target cannot bind ${key}`);
    }
    for (const key of targetKeys.slice(8)) {
      assert.equal(target[key], false, `${key} must remain false`);
    }
  }

  assert.deepEqual(plan.targetSelectionBoundary, {
    selectedExecutionTargetId: null,
    targetSelectionRuleSha256: null,
    proxyEquivalenceAndLimitationProtocolSha256: null,
    exactSteamMachineAvailabilityDispositionSha256: null,
    oneTargetRunsPerformanceAndRecoveryMatrixPerCampaign: true,
    targetChangeRequiresCompleteMatrixRerun: true,
    proxyResultMayQualifySteamMachine: false,
    proxyAndSteamMachineResultsMayBeAggregated: false,
    differentTargetMayRescueFailure: false,
  });

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(
      plan.authorityBoundary[key],
      null,
      `blocked plan cannot bind ${key}`,
    );
  }
  for (const key of authorityFalseKeys) {
    assert.equal(
      plan.authorityBoundary[key],
      false,
      `blocked plan cannot authorize ${key}`,
    );
  }

  assert.ok(Array.isArray(plan.inferenceBackends));
  assert.equal(plan.inferenceBackends.length, STEAMOS_WORKLOAD_BACKENDS.length);
  for (const [index, backend] of plan.inferenceBackends.entries()) {
    exactKeys(backend, backendKeys, `inferenceBackends[${index}]`);
    assert.deepEqual(
      [backend.backendId, backend.executionClass, backend.expectedRuntimeFamily],
      STEAMOS_WORKLOAD_BACKENDS[index],
    );
    for (const key of backendKeys.slice(3, 7)) {
      assert.equal(backend[key], null, `blocked backend cannot bind ${key}`);
    }
    for (const key of backendKeys.slice(7)) {
      assert.equal(backend[key], false, `${key} must remain false`);
    }
  }

  assert.ok(Array.isArray(plan.workloads));
  assert.equal(plan.workloads.length, STEAMOS_WORKLOADS.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(workload, workloadKeys, `workloads[${index}]`);
    assert.deepEqual(
      [
        workload.workloadId,
        workload.runtime,
        workload.networkClass,
        workload.motionRole,
      ],
      STEAMOS_WORKLOADS[index],
    );
    assert.equal(workload.exactContentAndInteractionSha256, null);
    assert.equal(workload.targetResultSha256, null);
    assert.equal(workload.loadOrHeartbeatMayProvePlayability, false);
    assert.equal(workload.compatibilityLoadMayProveMotionIntegration, false);
  }

  assert.deepEqual(plan.trackerAndWorkloadBoundary, {
    motionApiVersion: "0.4.0",
    requiredProfileIds: [
      "body.core17",
      "actions.obstacle.v1",
      "actions.shell.v1",
    ],
    playerCount: 1,
    genuineQualifiedCameraExposureRequired: true,
    qualifiedI166PackageRequired: true,
    qualifiedI167CameraAndPermissionRequired: true,
    exposureTimestampAuthorityAndCommonClockRequired: true,
    samePoseActionDefinitionsAndGroundTruthAcrossBackendsRequired: true,
    compatibilityGamesReceiveMotionFrames: false,
    obstacleConsumesMotionActions: true,
    reservedActionsOwnedOutsideGame: true,
    syntheticReplayOrBackendCallTimingMayQualifyCameraToAction: false,
    compatibilityGameLoadMayQualifyTitleMotionIntegration: false,
    campaignMayQualifyGeneralAccountlessLifecycle: false,
  });

  assert.deepEqual(plan.performanceMatrix, {
    backendIds: STEAMOS_WORKLOAD_BACKENDS.map(([id]) => id),
    workloadIds: STEAMOS_WORKLOADS.map(([id]) => id),
    backendCount: 4,
    workloadCount: 4,
    requiredCellCountPerSelectedTarget: 16,
    warmupSecondsPerCell: 300,
    minimumMeasuredSecondsPerCell: 3600,
    requiredRunsPerCell: 1,
    everyBackendMustBeAttempted: true,
    everyWorkloadMustRunForEveryBackend: true,
    oneRunIsReliabilityRateEvidence: false,
    unsupportedUnavailableFailedStoppedAndRetriedCellsRemainVisible: true,
    selectedBackendMustPassEveryWorkload: true,
    otherBackendWorkloadTargetOrAggregateMayRescueFailure: false,
  });

  exactKeys(
    plan.recoveryMatrix,
    [
      "scenarioIds",
      "scenarioCount",
      "backendWorkloadCellCount",
      "requiredRecoveryCellCountPerSelectedTarget",
      "validAttemptsPerRecoveryCell",
      "everyScenarioRunsForEveryBackendWorkloadCell",
      "scheduledFaultsRemainOutsideMeasuredPerformanceSoak",
      "freshCameraTrackerGameAndInputEpochProofRequired",
      "failedInvalidStoppedRetriedAndAdverseAttemptsRemainVisible",
      "laterRecoveryMayHideEarlierFailure",
      "otherScenarioBackendWorkloadTargetOrAggregateMayRescueFailure",
    ],
    "recoveryMatrix",
  );
  assert.deepEqual(
    plan.recoveryMatrix.scenarioIds,
    [...STEAMOS_WORKLOAD_RECOVERY_SCENARIOS],
  );
  assert.equal(plan.recoveryMatrix.scenarioCount, 8);
  assert.equal(plan.recoveryMatrix.backendWorkloadCellCount, 16);
  assert.equal(plan.recoveryMatrix.requiredRecoveryCellCountPerSelectedTarget, 128);
  assert.equal(plan.recoveryMatrix.validAttemptsPerRecoveryCell, null);
  for (const key of [
    "everyScenarioRunsForEveryBackendWorkloadCell",
    "scheduledFaultsRemainOutsideMeasuredPerformanceSoak",
    "freshCameraTrackerGameAndInputEpochProofRequired",
    "failedInvalidStoppedRetriedAndAdverseAttemptsRemainVisible",
  ]) {
    assert.equal(plan.recoveryMatrix[key], true, `${key} must remain true`);
  }
  for (const key of [
    "laterRecoveryMayHideEarlierFailure",
    "otherScenarioBackendWorkloadTargetOrAggregateMayRescueFailure",
  ]) {
    assert.equal(plan.recoveryMatrix[key], false, `${key} must remain false`);
  }

  exactKeys(
    plan.measurements,
    [
      "requiredMetricIds",
      "independentExposurePoseActionGameResourcePowerThermalAcousticProcessInputAndRecoveryOraclesRequired",
      "everyScheduledCellAttemptFailureAndUnavailableBackendMustRemainVisible",
      "vendorSpecsSyntheticBenchmarksOtherTargetOrAggregateMaySubstituteTargetEvidence",
    ],
    "measurements",
  );
  assert.deepEqual(plan.measurements.requiredMetricIds, [...STEAMOS_WORKLOAD_METRICS]);
  assert.equal(
    plan.measurements
      .independentExposurePoseActionGameResourcePowerThermalAcousticProcessInputAndRecoveryOraclesRequired,
    true,
  );
  assert.equal(
    plan.measurements.everyScheduledCellAttemptFailureAndUnavailableBackendMustRemainVisible,
    true,
  );
  assert.equal(
    plan.measurements
      .vendorSpecsSyntheticBenchmarksOtherTargetOrAggregateMaySubstituteTargetEvidence,
    false,
  );

  assert.deepEqual(plan.fixedAcceptance, {
    minimumMeasuredSecondsPerBackendWorkloadCell: 3600,
    requiredRunsPerBackendWorkloadCell: 1,
    maximumExposureToActionP95Ms: 120,
    maximumLocalLaunchToInteractiveMs: 15000,
    maximumHostedLaunchToInteractiveMs: 30000,
    maximumOneMeterAcousticsDba: 35,
    maximumPrivilegedFalseActivations: 0,
    maximumUnexpectedProcessExitsDuringPerformanceSoak: 0,
    maximumUnrecoveredFailures: 0,
    maximumUnexplainedTimestampRegressionsDomainSubstitutionsOrCrossEpochFrames: 0,
    maximumRetainedRawFramesAudioSkeletonsOrUndeclaredEgressEvents: 0,
    maximumCredentialAccountParticipantStableIdentifierPathOrFreeTextDisclosures: 0,
    maximumValidSelectedBackendProductFailures: 0,
    selectedBackendMustPassEveryPerformanceAndRecoveryCell: true,
    proxyResultMayQualifyExactSteamMachine: false,
    aggregateMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }

  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetBackendBuildWorkloadCellAttemptAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsAndRedactedCategoriesRequired: true,
    rawRoomPlayerCameraScreenAudioVideoOrSkeletonAllowedInRepositoryReleaseOrResult: false,
    retainedRawFramesAudioBuffersSkeletonTracesOrSampleBytesAllowed: false,
    namesFacesVoicesExactAgesStableDeviceIdsSerialsPathsOrQueryUrlsAllowed: false,
    credentialsTokensCookiesAccountsProfileSaveStorageEnvironmentOrArgumentValuesAllowed: false,
    arbitraryDriverProviderServiceConsoleOrCrashMessagesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressOutsideDeclaredPackageHostedServiceAndProbeTrafficAllowed: false,
    failedInvalidStoppedRetriedUnavailableAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...STEAMOS_WORKLOAD_BLOCKERS]);

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "blocked",
    executedTargetId: null,
    completedPerformanceCellCount: 0,
    completedRecoveryCellCount: 0,
    backendResults: [],
    qualifiedBackendIds: [],
    selectedInferenceBackendId: null,
    proxyOnlyResult: false,
    targetQualified: false,
    steamMachineQualified: false,
    steamMachinePrimaryTierChanged: false,
    publishedClaims: [],
  });
}

export async function parseSteamOsPoseGameWorkloadPlanBytes(bytes) {
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
    "plan must use canonical two-space JSON with one trailing LF",
  );
  await validateSteamOsPoseGameWorkloadPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseSteamOsPoseGameWorkloadPlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `${trackedPath}: valid blocked ${plan.performanceMatrix.requiredCellCountPerSelectedTarget}-performance-cell, ${plan.recoveryMatrix.requiredRecoveryCellCountPerSelectedTarget}-recovery-cell I-168 plan`,
  );
}
