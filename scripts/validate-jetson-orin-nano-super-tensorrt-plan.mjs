import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/jetson/jetson-orin-nano-super-tensorrt-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const JETSON_TENSORRT_FORMAT =
  "vcg-jetson-orin-nano-super-tensorrt-plan/v1";
export const JETSON_PRECISION_LANES = Object.freeze(["fp16", "int8"]);
export const JETSON_WORKLOADS = Object.freeze([
  ["launcher-shell", "console-shell", "offline-required", "shell-and-reserved-action-owner"],
  ["obstacle-local-web-motion", "local-web", "offline-required", "primary-motion-consumer"],
  ["tiny-motion-godot-native-arm64", "native-godot-arm64", "offline-required", "primary-motion-consumer"],
  ["selected-signed-local-package", "installed-controlled-package", "offline-required", "manifest-declared-profile"],
  ["retro-2048", "libretro", "offline-required", "none-controller-only"],
  ["vibebots-remote-web-compatibility", "remote-web", "network-required", "no-title-motion-delivery"],
  ["mi-casa-remote-web-compatibility", "remote-web", "network-required", "no-title-motion-delivery"],
  ["determined-remote-web-compatibility", "remote-web", "network-required", "no-title-motion-delivery"],
]);
export const JETSON_FAULTS = Object.freeze([
  "camera-loss-and-restoration",
  "tracker-process-termination-and-restart",
  "game-renderer-hang-or-exit",
  "network-loss-and-explicit-retry",
  "storage-pressure-and-write-refusal",
  "forced-reboot-and-clean-return",
]);
export const JETSON_BLOCKERS = Object.freeze([
  "exact-received-kit-storage-display-power-cooling-camera-controller-and-cables",
  "destination-aware-delivered-quote-and-purchase-or-borrow-authority",
  "selected-jetpack-l4t-cuda-tensorrt-cudnn-package-power-and-clock-tuple",
  "signed-offline-bundle-license-notice-clean-flash-and-rebuild-procedure",
  "source-model-onnx-builder-plugins-calibration-prepost-core17-and-engine-identities",
  "exact-launcher-game-package-hosted-builds-interactions-and-network-states",
  "camera-room-persona-consent-ground-truth-exposure-clock-and-data-protocols",
  "counterbalanced-replay-live-soak-fault-recovery-rebuild-and-monitoring-schedule",
  "all-open-performance-resource-thermal-recovery-rebuild-and-cost-gates",
  "purchase-download-flash-network-participant-fault-result-selection-and-publication-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "vendorCandidate",
  "executionBoundary", "softwareTuple", "tensorRtModelBoundary", "workloads",
  "campaignMatrix", "requiredMetrics", "fixedAcceptance", "openAcceptance",
  "costBoundary", "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["official-source-candidate-screen", "docs/JETSON_ORIN_NANO_SUPER_TENSORRT_SCREEN_2026-07-26.md"],
  ["compute-selection-and-product-decisions", "docs/DECISIONS.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["ordinary-x86-comparison-boundary", "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json"],
  ["pi-cpu-comparison-boundary", "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json"],
  ["representative-workload-boundary", "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json"],
  ["core17-provider-comparison-boundary", "benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json"],
  ["exposure-to-action-proof-boundary", "scripts/validate-camera-action-latency-campaign.mjs"],
];
const executionKeys = [
  "exactHardwareManifestSha256", "exactDeliveredBomSha256",
  "selectedSoftwareTupleSha256", "signedOfflineBundleSha256",
  "modelConversionManifestSha256", "cameraRoomParticipantProtocolSha256",
  "workloadBuildAndInteractionManifestSha256", "faultRecoveryProtocolSha256",
  "measurementAndScheduleProtocolSha256", "dataHandlingAndDeletionProtocolSha256",
  "purchaseAuthorized", "downloadAuthorized", "flashOrStorageMutationAuthorized",
  "targetAccessAuthorized", "networkOrHostedServiceUseAuthorized",
  "participantCollectionAuthorized", "faultInjectionAuthorized", "publicationAuthorized",
];
const softwareKeys = [
  "architecture", "candidateTupleIds", "selectedCandidateTupleId",
  "installerOrImageSha256", "flashConfigurationSha256", "jetPackVersion",
  "jetsonLinuxVersion", "kernelRelease", "firmwareManifestSha256", "cudaVersion",
  "tensorRtVersion", "cudnnVersion", "pythonAndCppBindingManifestSha256",
  "packageLockAndLicenseManifestSha256", "powerMode", "clockAndGovernorPolicySha256",
  "browserLauncherHostTrackerBuildsSha256", "cleanOfflineRebuildProcedureSha256",
  "latestOrMovingAliasAllowed", "superModeMustBeIndependentlyProvenFromModeClocksAndTelemetry",
  "jetpack720IsoMayBeAssumedToEnableSuperMode",
];
const modelKeys = [
  "providerId", "precisionLaneIds", "sourceModelSha256", "sourceModelLicenseSha256",
  "onnxSha256", "onnxOpset", "inputAndOutputContractSha256",
  "builderAndPluginManifestSha256", "int8CalibrationCorpusAndProtocolSha256",
  "preprocessorSha256", "postprocessorSha256", "core17TranslatorSha256",
  "trackerAndActionConfigurationSha256", "fp16EngineSha256", "int8EngineSha256",
  "targetSideEngineBuildRequired", "filenameOrDownloadedEngineMayEstablishIdentity",
  "enginePortabilityAcrossPlatformVersionOrGpuMayBeAssumed", "dlaExecutionAllowed",
  "gpuExecutionTelemetryProofSha256",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM`);
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
  assert.ok(Array.isArray(bindings));
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath), `sourceBindings[${index}] escapes repository`);
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validateJetsonOrinNanoSuperTensorRtPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, JETSON_TENSORRT_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "jetson-orin-nano-super-tensorrt-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-019", "Q-017"]);
  for (const phrase of [
    "zero-result Jetson Orin Nano Super TensorRT benchmark plan",
    "do not prove a received device",
    "No purchase",
    "publication is authorized",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.vendorCandidate, {
    product: "NVIDIA Jetson Orin Nano Super Developer Kit",
    partNumber: "945-13766-0007-000",
    module: "Jetson Orin Nano 8GB",
    gpuArchitecture: "Ampere",
    cudaCoreCount: 1024,
    tensorCoreCount: 32,
    cpuDescription: "6-core Arm Cortex-A78AE v8.2 64-bit",
    memoryBytes: 8589934592,
    maximumAdvertisedMemoryBandwidthBytesPerSecond: 102000000000,
    advertisedInt8Tops: 67,
    advertisedPowerRangeW: [7, 25],
    displayOutput: "DisplayPort-only; exact HDMI adapter path remains unselected",
    superModeIsSoftwareEnabledOnSameDeveloperKitHardware: true,
    vendorFactsMayEstablishVcgPerformanceOrSelection: false,
    receivedHardwareIdentitySha256: null,
    deliveredQuoteSha256: null,
  });

  exactKeys(plan.executionBoundary, executionKeys, "executionBoundary");
  for (const key of executionKeys.slice(0, 10)) assert.equal(plan.executionBoundary[key], null, `blocked plan cannot bind ${key}`);
  for (const key of executionKeys.slice(10)) assert.equal(plan.executionBoundary[key], false, `blocked plan cannot authorize ${key}`);

  exactKeys(plan.softwareTuple, softwareKeys, "softwareTuple");
  assert.equal(plan.softwareTuple.architecture, "aarch64");
  assert.deepEqual(plan.softwareTuple.candidateTupleIds, [
    "jetpack-6.2-l4t-36.4.3-tensorrt-10.3-evidenced-candidate",
    "jetpack-7.2.0-current-super-mode-warning-not-selected",
  ]);
  for (const key of softwareKeys.slice(2, 18)) assert.equal(plan.softwareTuple[key], null, `blocked plan cannot select ${key}`);
  assert.equal(plan.softwareTuple.latestOrMovingAliasAllowed, false);
  assert.equal(plan.softwareTuple.superModeMustBeIndependentlyProvenFromModeClocksAndTelemetry, true);
  assert.equal(plan.softwareTuple.jetpack720IsoMayBeAssumedToEnableSuperMode, false);

  exactKeys(plan.tensorRtModelBoundary, modelKeys, "tensorRtModelBoundary");
  assert.equal(plan.tensorRtModelBoundary.providerId, "tensorrt-integrated-ampere-gpu");
  assert.deepEqual(plan.tensorRtModelBoundary.precisionLaneIds, [...JETSON_PRECISION_LANES]);
  for (const key of modelKeys.slice(2, 15)) assert.equal(plan.tensorRtModelBoundary[key], null, `blocked plan cannot bind ${key}`);
  assert.equal(plan.tensorRtModelBoundary.targetSideEngineBuildRequired, true);
  assert.equal(plan.tensorRtModelBoundary.filenameOrDownloadedEngineMayEstablishIdentity, false);
  assert.equal(plan.tensorRtModelBoundary.enginePortabilityAcrossPlatformVersionOrGpuMayBeAssumed, false);
  assert.equal(plan.tensorRtModelBoundary.dlaExecutionAllowed, false);
  assert.equal(plan.tensorRtModelBoundary.gpuExecutionTelemetryProofSha256, null);

  assert.ok(Array.isArray(plan.workloads));
  assert.equal(plan.workloads.length, JETSON_WORKLOADS.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(workload, ["workloadId", "runtime", "networkClass", "motionRole"], `workloads[${index}]`);
    assert.deepEqual([workload.workloadId, workload.runtime, workload.networkClass, workload.motionRole], JETSON_WORKLOADS[index]);
  }

  assert.deepEqual(plan.campaignMatrix, {
    workloadCount: 8,
    precisionLaneCount: 2,
    validImmutableReplayRunsPerPrecisionLane: 20,
    requiredImmutableReplayRunCount: 40,
    validLiveSoakRunsPerPrecisionWorkloadCell: 3,
    minimumMeasuredSecondsPerLiveSoakRun: 3600,
    requiredLiveSoakCellCount: 16,
    requiredLiveSoakRunCount: 48,
    faultIds: [...JETSON_FAULTS],
    validRecoveryCyclesPerPrecisionWorkloadFaultCell: 20,
    requiredRecoveryCellCount: 96,
    requiredRecoveryCycleCount: 1920,
    validOfflineCleanRebuildCycles: 20,
    validEngineRebuildsPerPrecisionLane: 20,
    requiredEngineRebuildCount: 40,
    runOrderCounterbalanced: true,
    failuresRetriesInvalidRunsAndInterruptedRebuildsRemainVisible: true,
    failedOrInvalidRunMayBeSilentlyReplaced: false,
    precisionWorkloadFaultOrTargetMayRescueAnother: false,
    aggregateMayRescueFailedCell: false,
  });
  assert.equal(plan.campaignMatrix.workloadCount * plan.campaignMatrix.precisionLaneCount, plan.campaignMatrix.requiredLiveSoakCellCount);
  assert.equal(plan.campaignMatrix.requiredLiveSoakCellCount * plan.campaignMatrix.validLiveSoakRunsPerPrecisionWorkloadCell, plan.campaignMatrix.requiredLiveSoakRunCount);
  assert.equal(plan.campaignMatrix.workloadCount * plan.campaignMatrix.precisionLaneCount * plan.campaignMatrix.faultIds.length, plan.campaignMatrix.requiredRecoveryCellCount);
  assert.equal(plan.campaignMatrix.requiredRecoveryCellCount * plan.campaignMatrix.validRecoveryCyclesPerPrecisionWorkloadFaultCell, plan.campaignMatrix.requiredRecoveryCycleCount);

  assert.ok(Array.isArray(plan.requiredMetrics));
  assert.equal(plan.requiredMetrics.length, 12);
  for (const phrase of ["engine build", "exposure-to-game-api", "privileged false", "wall power", "offline blank-storage", "complete delivered BOM"]) {
    assert.ok(plan.requiredMetrics.some((metric) => metric.includes(phrase)), `missing metric ${phrase}`);
  }

  assert.deepEqual(plan.fixedAcceptance, {
    maximumLiveExposureToActionP95Us: 120000,
    minimumPerActionPrecisionPpm: 950000,
    minimumPerActionRecallPpm: 900000,
    maximumPrivilegedFalseActivations: 0,
    maximumUnrecoveredFailures: 0,
    maximumUnexpectedProcessExits: 0,
    maximumOneMeterAcousticsMilliDba: 35000,
    maximumOfflineRebuildNetworkAttempts: 0,
    maximumEngineDigestMismatchesForIdenticalTuple: 0,
    maximumSilentModelEnginePrecisionOrPowerModeSubstitutions: 0,
    everyBlockingCellAndCycleMustPass: true,
    vendorTopsPriceOrSingleInferenceBenchmarkMayQualify: false,
    replayTimingMayQualifyExposureLatency: false,
    loadHeartbeatOrProcessSurvivalMayQualifyPlayability: false,
    passingFp16MayQualifyInt8OrReverse: false,
    campaignMayAutomaticallySupersedePiHailoSelection: false,
  });

  exactKeys(plan.openAcceptance, [
    "minimumPoseFpsMilliFps", "minimumGameFpsMilliFps", "maximumGameFrameTimeP95Us",
    "maximumCaptureDropRatePpm", "maximumPoseDropRatePpm",
    "maximumCore17P95NormalizedErrorMilliTorso", "maximumIdentitySwitchesPerRun",
    "maximumRamBytes", "maximumSwapBytes", "maximumWallPowerMilliW",
    "maximumSustainedTemperatureMilliC", "maximumThrottleEventsPerRun",
    "maximumLaunchP95Ms", "maximumRecoveryP95Ms", "maximumOfflineRebuildP95Ms",
    "maximumDeliveredCostCents", "mustBeFixedBeforeFirstDownloadFlashBuildOrRun",
  ], "openAcceptance");
  for (const key of Object.keys(plan.openAcceptance).slice(0, 16)) assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  assert.equal(plan.openAcceptance.mustBeFixedBeforeFirstDownloadFlashBuildOrRun, true);

  exactKeys(plan.costBoundary, [
    "requiredDeliveredCostRoles", "quoteDestination", "quoteCurrency", "quoteObservedAt",
    "deliveredCostCents", "boardOnlyPriceMayRepresentCompleteSystem", "purchaseRecommendation",
  ], "costBoundary");
  assert.deepEqual(plan.costBoundary.requiredDeliveredCostRoles, [
    "developer-kit", "qualified-storage", "displayport-to-hdmi-path", "power-supply",
    "cooling-and-enclosure", "camera-and-mount", "controller",
    "network-and-camera-cables", "tax", "shipping",
  ]);
  for (const key of ["quoteDestination", "quoteCurrency", "quoteObservedAt", "deliveredCostCents"]) assert.equal(plan.costBoundary[key], null);
  assert.equal(plan.costBoundary.boardOnlyPriceMayRepresentCompleteSystem, false);
  assert.equal(plan.costBoundary.purchaseRecommendation, "none-no-purchase-authority");

  assert.deepEqual(plan.dataPolicy, {
    rawReplayCorpusRetentionAuthorized: false,
    liveRawFrameOrAudioRetentionAuthorized: false,
    participantNamesFacesVoicesExactAgesAddressesOrStableIdentifiersAllowed: false,
    credentialsTokensPrivateKeysPathsOrRequestBodiesAllowedInEvidence: false,
    individualFreeTextOrUnredactedSystemLogsAllowed: false,
    aggregatePathFreeClosedVocabularyResultsRequired: true,
    temporaryDiagnosticCollectionRequiresSeparateConsentAccessAndDeletionProof: true,
    networkEgressDuringOfflineLanesAllowed: false,
  });

  exactKeys(plan.executionGate, ["state", "blockerCodes", "readyRequiresEveryBlockerResolvedBeforeFirstDownloadFlashBuildOrRun"], "executionGate");
  assert.equal(plan.executionGate.state, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...JETSON_BLOCKERS]);
  assert.equal(plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstDownloadFlashBuildOrRun, true);

  assert.deepEqual(plan.result, {
    disposition: "blocked",
    completedImmutableReplayRunCount: 0,
    completedLiveSoakRunCount: 0,
    completedRecoveryCycleCount: 0,
    completedOfflineRebuildCycleCount: 0,
    completedEngineRebuildCount: 0,
    cellResults: [],
    qualifiedPrecisionLaneIds: [],
    deliveredCostCents: null,
    jetsonQualified: false,
    piHailoSelectionSuperseded: false,
    purchaseRecommended: false,
  });
}

export async function parseJetsonOrinNanoSuperTensorRtPlanBytes(bytes) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan is not valid JSON", { cause: error });
  }
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must use canonical two-space JSON with one trailing LF");
  await validateJetsonOrinNanoSuperTensorRtPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseJetsonOrinNanoSuperTensorRtPlanBytes(await readFile(trackedPath));
  console.log(`Jetson TensorRT plan valid: status=${plan.status} workloads=${plan.campaignMatrix.workloadCount} replayRuns=${plan.campaignMatrix.requiredImmutableReplayRunCount} liveRuns=${plan.campaignMatrix.requiredLiveSoakRunCount} recoveryCycles=${plan.campaignMatrix.requiredRecoveryCycleCount}`);
}
