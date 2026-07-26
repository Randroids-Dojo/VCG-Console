import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/realsense/d455-linux-target-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA1 = /^[a-f0-9]{40}$/u;

export const REALSENSE_D455_FORMAT =
  "vcg-realsense-d455-linux-target-plan/v1";
export const REALSENSE_TARGETS = Object.freeze([
  [
    "ordinary-x86-linux-external-camera",
    "ordinary-native-linux-reference",
    "x86_64",
    "selected-native-linux-distribution",
    "ubuntu-20.04-22.04-24.04-lts-listed-kernels-exact-vcg-tuple-and-rsusb-unproven",
  ],
  [
    "steamos-external-camera",
    "steamos-reference",
    "x86_64",
    "selected-steamos-image",
    "steamos-not-in-v2.58.3-supported-platform-list-exact-rsusb-tuple-unproven",
  ],
  [
    "raspberry-pi5-ai-hat-integrated-camera",
    "lower-cost-integrated-reference",
    "aarch64",
    "selected-raspberry-pi-linux-image",
    "generic-raspberry-pi-repository-entry-no-v2.58.3-exact-pi5-os-kernel-d455-or-rsusb-validation",
  ],
]);
export const REALSENSE_COMMON_BUILD_OPTIONS = Object.freeze([
  "CMAKE_BUILD_TYPE=Release",
  "FORCE_RSUSB_BACKEND=ON",
  "BUILD_SHARED_LIBS=ON",
  "BUILD_UNIT_TESTS=ON",
  "BUILD_VIEWER_TESTS=OFF",
  "BUILD_EXAMPLES=ON",
  "BUILD_GRAPHICAL_EXAMPLES=OFF",
  "BUILD_TOOLS=OFF",
  "BUILD_WITH_CUDA=OFF",
  "BUILD_GLSL_EXTENSIONS=OFF",
  "BUILD_WITH_OPENMP=OFF",
  "BUILD_WITH_DDS=OFF",
  "BUILD_ROSBAG2=OFF",
  "BUILD_PYTHON_BINDINGS=OFF",
  "CHECK_FOR_UPDATES=OFF",
  "ENABLE_CCACHE=OFF",
  "ENABLE_SECURITY_FLAGS=ON",
  "BUILD_ASAN=OFF",
]);
export const REALSENSE_TARGET_BUILD_OPTIONS = Object.freeze([
  ["ordinary-x86-linux-external-camera", ["BUILD_WITH_CPU_EXTENSIONS=ON"]],
  ["steamos-external-camera", ["BUILD_WITH_CPU_EXTENSIONS=ON"]],
  [
    "raspberry-pi5-ai-hat-integrated-camera",
    [
      "BUILD_WITH_CPU_EXTENSIONS=ON",
      "BUILD_WITH_NEON=ON",
      "BUILD_WITH_CLOSE_RANGE_DEPTH=OFF",
    ],
  ],
]);
export const REALSENSE_RUNTIME_PHASES = Object.freeze([
  "unprivileged-enumeration-and-exact-identity",
  "cold-open-configure-and-close",
  "sustained-rgb-depth-ir-imu-stream-and-timestamps",
  "depth-to-color-alignment-and-point-cloud-contract",
  "concurrent-vcg-tracker-and-game-workload",
  "clean-stop-and-restart-without-host-or-device-reboot",
]);
export const REALSENSE_RECOVERY_FAULTS = Object.freeze([
  "sdk-process-termination-and-restart",
  "stream-stop-start-cycling",
  "idle-camera-unplug-and-reconnect",
  "streaming-camera-unplug-and-reconnect",
  "permission-denial-and-restoration",
  "usb-bandwidth-contention-and-restoration",
  "host-suspend-and-resume",
  "host-reboot-and-cold-reopen",
]);
export const REALSENSE_BLOCKERS = Object.freeze([
  "exact-received-82635dsd455-999wct-identity-condition-manufacturing-imu-calibration-cable-mount-power-and-firmware",
  "fresh-destination-aware-delivered-quote-and-purchase-or-borrow-authority",
  "exact-ordinary-linux-steamos-and-pi5-hardware-os-kernel-libc-toolchain-libusb-usb-power-and-ai-hat-tuples",
  "sdk-source-dependency-unit-test-data-build-package-license-sbom-udev-update-and-rollback-contract",
  "rsusb-common-backend-permission-partial-device-and-native-backend-exclusion-contract",
  "exact-passive-preset-filters-stream-alignment-clock-advanced-mode-projector-state-and-ground-truth-protocol",
  "runtime-soak-fault-recovery-offline-rebuild-instrumentation-and-schedule-protocols",
  "all-open-stream-timestamp-depth-resource-power-thermal-recovery-build-cost-and-benefit-gates",
  "i045-ready-result-before-any-active-projector-lane-and-q018-protocol-before-depth-benefit-claim",
  "purchase-binary-firmware-target-device-projector-participant-fault-diagnostic-result-selection-and-publication-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "candidateSnapshot",
  "authorityBoundary", "sdkCandidate", "backendContract", "targetMatrix",
  "buildCampaign", "deviceConfiguration", "runtimeCampaign", "recoveryCampaign",
  "requiredEvidence", "fixedAcceptance", "openAcceptance", "costBoundary",
  "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["official-source-candidate-screen", "docs/REALSENSE_D455_CANDIDATE_SCREEN_2026-07-26.md"],
  ["campaign-contract", "docs/REALSENSE_D455_LINUX_TARGET_CAMPAIGN_2026-07-26.md"],
  ["depth-option-research-boundary", "docs/RESEARCH.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["shared-camera-target-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-usb-cable-boundary", "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"],
  ["exposure-to-action-proof-boundary", "scripts/validate-camera-action-latency-campaign.mjs"],
];
const requiredEvidence = [
  "exact received product and material code manufacturing configuration private serial digest imu calibration cable mount power firmware and condition",
  "exact target hardware os image release kernel libc compiler cmake libusb udev usb controller and power topology",
  "pinned source tag commit common and target cmake cache dependency and unit-test-data mirror compiler warnings installed files dynamic links licenses and sbom",
  "locally verified firmware or release bytes only when separately authorized",
  "unprivileged rsusb enumeration complete interface identity vid pid firmware usb speed port path and permissions",
  "exact passive preset filters rgb depth ir imu formats resolution rates alignment advanced-mode state and projector-off observation",
  "exposure device host and application timestamps with clock mapping uncertainty drift drops duplicates corruption ordering and partial enumeration",
  "rgb valid-depth aligned-depth point-cloud and qualified-action coverage with independent ground truth",
  "exposure-to-game-api p50 p95 p99 worst action precision recall and privileged false activations",
  "cpu ram usb bandwidth wall and usb power temperature throttling and concurrent game frame pacing",
  "cold open close restart one-hour soak and complete failure retry invalid interruption and backend ledger",
  "per-fault injection detection fail-closed partial-enumeration stale-frame rejection healthy-return timing and intervention record",
  "offline clean rebuild network-attempt installed-manifest repeatability update rollback and blank-target recovery",
  "destination-aware delivered camera cable mount power integration tax shipping warranty repair and support cost",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  assert.ok(!text.startsWith("\uFEFF"), `${label} must not contain a UTF-8 BOM`);
  assert.ok(!/\r(?!\n)/u.test(text), `${label} contains a bare carriage return`);
  return text.replaceAll("\r\n", "\n");
}

function normalizedSha256(bytes, label) {
  return createHash("sha256")
    .update(Buffer.from(normalizedText(bytes, label), "utf8"))
    .digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length, "source binding count drifted");
  for (const [index, [role, path]] of sourceDefinitions.entries()) {
    const binding = bindings[index];
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.equal(binding.role, role);
    assert.equal(binding.path, path);
    assert.match(binding.sha256, SHA256);
    assert.equal(isAbsolute(path), false, "source path must be relative");
    const absolute = resolve(repositoryRoot, path);
    assert.ok(!relative(repositoryRoot, absolute).startsWith(".."), "source path escaped repository");
    assert.equal(
      normalizedSha256(await readFile(absolute), path),
      binding.sha256,
      `${path} digest drifted`,
    );
  }
}

export async function validateRealSenseD455LinuxTargetPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, REALSENSE_D455_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "realsense-d455-linux-target-qualification-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-044", "Q-018"]);
  assert.match(plan.claimBoundary, /zero-result/u);
  assert.match(plan.claimBoundary, /temporary read-only clone/u);
  assert.match(plan.claimBoundary, /No purchase/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.candidateSnapshot, {
    manufacturer: "RealSense",
    product: "Depth Camera D455",
    productCode: "82635DSD455",
    materialCode: "999WCT",
    usbVendorId: "0x8086",
    usbProductId: "0x0b5c",
    connection: "usb-c-3.1-gen-1",
    depthTechnology: "active-and-passive-stereoscopic",
    projectorSafetyClassification: "class-1-laser-product-vendor-regulatory-claim",
    baselineMm: 95,
    depthAndRgbShutter: "global",
    idealDepthRangeM: { minimum: 0.6, maximum: 6 },
    maximumDepthMode: "1280x720-up-to-90-fps",
    maximumRgbMode: "1280x800@30",
    depthFovDegrees: { horizontal: 87, vertical: 58 },
    rgbFovDegrees: { horizontal: 90, vertical: 65 },
    advertisedImuPresent: true,
    observedListPriceUsdCents: 41900,
    observedAvailability: "buy-link-present-stock-unverified",
    observedAt: "2026-07-26",
    receivedDeviceIdentitySha256: null,
    deliveredQuoteSha256: null,
    vendorFactsMayAuthorizePurchaseSelectionOrQualification: false,
  });

  exactKeys(plan.authorityBoundary, [
    "sourceInspectionCompleted", "sourceInspectionCommitGitSha1",
    "exactReceivedDeviceManifestSha256", "exactTargetTupleManifestSha256",
    "buildAndPackageProtocolSha256", "deviceStreamAndTimestampProtocolSha256",
    "runtimeAndSoakScheduleSha256", "faultRecoveryProtocolSha256",
    "firmwareMutationAndRecoveryProtocolSha256", "measurementAndAcceptanceProtocolSha256",
    "participantConsentAndDataProtocolSha256", "purchaseAuthorized",
    "releaseBinaryDownloadAuthorized", "firmwareArtifactDownloadAuthorized",
    "targetAccessOrMutationAuthorized", "usbDeviceOperationAuthorized",
    "irProjectorUseAuthorized", "participantCollectionAuthorized", "faultInjectionAuthorized",
    "temporaryDiagnosticCollectionAuthorized", "publicationAuthorized",
  ], "authorityBoundary");
  assert.equal(plan.authorityBoundary.sourceInspectionCompleted, true);
  assert.equal(
    plan.authorityBoundary.sourceInspectionCommitGitSha1,
    "dfd6aa91250f5c31521d72d627865417989bb4e7",
  );
  assert.match(plan.authorityBoundary.sourceInspectionCommitGitSha1, GIT_SHA1);
  for (const key of Object.keys(plan.authorityBoundary).slice(2, 11)) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of Object.keys(plan.authorityBoundary).slice(11)) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.sdkCandidate, {
    repositoryUrl: "https://github.com/realsenseai/librealsense.git",
    releaseTag: "v2.58.3",
    releaseTitle: "RealSense SDK 2.0 beta (v2.58.3)",
    releaseChannel: "beta",
    tagReferenceGitSha1: "dfd6aa91250f5c31521d72d627865417989bb4e7",
    sourceCommitGitSha1: "dfd6aa91250f5c31521d72d627865417989bb4e7",
    publishedAt: "2026-07-19T16:47:13Z",
    requiredFirmwareVersion: "5.17.3.10",
    firmwareReleaseMonth: "2026-06",
    firmwareArtifactUrl: "https://librealsense.realsenseai.com/Releases/RS4xx/FW/D4XX_FW_Image-5.17.3.10.bin",
    firmwarePublishedSha256: null,
    firmwareLocallyVerifiedSha256: null,
    linuxTargetBinaryAssets: [],
    windowsReleaseAssetsExcluded: true,
    sourceLicenseSummary: "Apache-2.0 repository; exact bundled third-party notices, dependencies, links, installed files, and SBOM remain required",
    licenseAndSbomManifestSha256: null,
    movingBranchOrAliasAllowed: false,
    generatedSourceArchiveMayDefineSourceIdentity: false,
    prebuiltOrPackageRepositoryMaySubstituteTargetNativeBuild: false,
    publishedDigestMaySubstituteLocallyVerifiedBytes: false,
  });
  assert.match(plan.sdkCandidate.tagReferenceGitSha1, GIT_SHA1);
  assert.match(plan.sdkCandidate.sourceCommitGitSha1, GIT_SHA1);

  assert.deepEqual(plan.backendContract, {
    blockingBackendId: "rsusb-libusb-userspace",
    blockingCmakeSelection: "FORCE_RSUSB_BACKEND=ON",
    officialLinuxStatus: "optional-userspace-backend",
    kernelPatchingRequiredForBlockingBackend: false,
    reviewedUdevRuleAndUnprivilegedAccessStillRequired: true,
    sameBlockingBackendRequiredAcrossTargets: true,
    nativeDiagnosticBackendId: "v4l2-iio-modified-kernel-drivers",
    nativeDiagnosticVendorPreference: "generally-recommended-for-production",
    nativeDiagnosticAllowedOnlyOnExactReleaseSupportedUbuntuKernelTuple: true,
    nativeDiagnosticExecutionAuthorized: false,
    dkmsKernelModuleSecureBootOrBiosMutationAuthorized: false,
    backendSubstitutionMayRescueFailure: false,
    oneBackendMayEstablishAnotherBackend: false,
  });

  const targetKeys = [
    "targetId", "role", "architecture", "operatingSystemBoundary",
    "vendorSupportBoundary", "required", "hardwareInventorySha256", "osImageSha256",
    "osRelease", "kernelRelease", "libcVersion", "compilerVersion", "cmakeVersion",
    "libusbVersion", "udevRuleSha256", "usbControllerTopologySha256",
    "powerTopologySha256", "installedSdkManifestSha256", "buildArtifactSha256",
    "runtimeConfigurationSha256", "qualified",
  ];
  assert.equal(plan.targetMatrix.length, REALSENSE_TARGETS.length);
  for (const [index, definition] of REALSENSE_TARGETS.entries()) {
    const target = plan.targetMatrix[index];
    exactKeys(target, targetKeys, `targetMatrix[${index}]`);
    assert.deepEqual([
      target.targetId, target.role, target.architecture,
      target.operatingSystemBoundary, target.vendorSupportBoundary,
    ], definition);
    assert.equal(target.required, true);
    for (const key of targetKeys.slice(6, 20)) {
      assert.equal(target[key], null, `blocked target cannot bind ${key}`);
    }
    assert.equal(target.qualified, false);
  }

  assert.deepEqual(plan.buildCampaign, {
    sourceCommitGitSha1: "dfd6aa91250f5c31521d72d627865417989bb4e7",
    commonCmakeOptions: [...REALSENSE_COMMON_BUILD_OPTIONS],
    targetCmakeOptions: REALSENSE_TARGET_BUILD_OPTIONS.map(([targetId, options]) => ({
      targetId,
      options: [...options],
    })),
    validCleanOfflineBuildsPerTarget: 20,
    requiredTargetCount: 3,
    requiredCleanOfflineBuildCount: 60,
    maximumOfflineBuildNetworkAttempts: 0,
    contentAddressedSourceDependencyAndUnitTestDataMirrorRequired: true,
    freshBuildRootRequired: true,
    compilerWarningsAndFailuresRemainVisible: true,
    installedFilesDynamicLinksLicensesAndSbomMustBeRecorded: true,
    maximumUnexplainedInstalledManifestMismatches: 0,
    prebuiltPackageArchiveOrNativeBackendMayRescueRsusbBuildFailure: false,
    oneTargetOrArchitectureMayRescueAnother: false,
    failedOrInterruptedBuildMayBeSilentlyReplaced: false,
  });
  assert.equal(
    plan.buildCampaign.requiredCleanOfflineBuildCount,
    plan.buildCampaign.requiredTargetCount * plan.buildCampaign.validCleanOfflineBuildsPerTarget,
  );

  assert.deepEqual(plan.deviceConfiguration, {
    requiredProductCode: "82635DSD455",
    requiredMaterialCode: "999WCT",
    requiredUsbVendorId: "0x8086",
    requiredUsbProductId: "0x0b5c",
    requiredFirmwareVersion: "5.17.3.10",
    receivedPrivateSerialDigestSha256: null,
    receivedManufacturingConfiguration: null,
    receivedImuComponent: null,
    receivedHardwareRevision: null,
    receivedCalibrationSha256: null,
    receivedFirmwareSha256: null,
    suppliedCableManifestSha256: null,
    mountAndPowerManifestSha256: null,
    blockingModeId: "rgb-depth-passive-projector-off",
    conditionalModeId: "rgb-depth-active-projector-on-i045-gated",
    exactPassivePresetAndFilterSha256: null,
    exactRgbDepthIrImuStreamProfileSha256: null,
    timestampAndClockMappingProtocolSha256: null,
    projectorStateIndependentObserverSha256: null,
    advancedModeStateSha256: null,
    campaignForcesProjectorOff: true,
    activeModeRequiresI045ReadyResult: true,
    selfCalibrationOrTareAllowed: false,
    advancedModeOrPresetWriteAllowed: false,
    onlineFirmwareUpdateAllowed: false,
    firmwareDowngradeAllowed: false,
    firmwareWriteInterruptionMayBeInduced: false,
    firmwareUpdateOrRecoveryClaimed: false,
  });

  assert.deepEqual(plan.runtimeCampaign, {
    targetIds: REALSENSE_TARGETS.map(([targetId]) => targetId),
    phaseIds: [...REALSENSE_RUNTIME_PHASES],
    validRunsPerTargetPhase: 20,
    requiredTargetPhaseCellCount: 18,
    requiredRuntimeRunCount: 360,
    validOneHourSoaksPerTarget: 3,
    minimumMeasuredSecondsPerSoak: 3600,
    requiredSoakRunCount: 9,
    sameReceivedDeviceRequiredAcrossTargets: true,
    sameRsusbBackendRequiredAcrossTargets: true,
    unprivilegedRuntimeRequired: true,
    sudoRootOrNativeBackendRuntimeMayPass: false,
    counterbalancedTargetAndPhaseOrderRequired: true,
    partialEnumerationDropsDuplicatesCorruptionOrderingSpeedDowngradesRetriesAndInvalidRunsRemainVisible: true,
    failedInvalidOrInterruptedRunMayBeSilentlyReplaced: false,
    oneTargetPhaseBackendOrSoakMayRescueAnother: false,
  });
  assert.equal(
    plan.runtimeCampaign.requiredTargetPhaseCellCount,
    plan.runtimeCampaign.targetIds.length * plan.runtimeCampaign.phaseIds.length,
  );
  assert.equal(
    plan.runtimeCampaign.requiredRuntimeRunCount,
    plan.runtimeCampaign.requiredTargetPhaseCellCount * plan.runtimeCampaign.validRunsPerTargetPhase,
  );
  assert.equal(
    plan.runtimeCampaign.requiredSoakRunCount,
    plan.runtimeCampaign.targetIds.length * plan.runtimeCampaign.validOneHourSoaksPerTarget,
  );

  assert.deepEqual(plan.recoveryCampaign, {
    faultIds: [...REALSENSE_RECOVERY_FAULTS],
    validRecoveryCyclesPerTargetFaultCell: 20,
    requiredTargetFaultCellCount: 24,
    requiredRecoveryCycleCount: 480,
    faultDetectionFailClosedPartialEnumerationStaleFrameRejectionAndHealthyReturnRequired: true,
    manualRootNetworkFirmwareKernelAndPowerInterventionMustBeRecorded: true,
    vendorFirmwareUpdateAndRecoveryDeskReviewRequired: true,
    firmwareRecoveryQualificationRequiredForFirmwareUpdateClaim: true,
    firmwareRecoveryQualificationCompleted: false,
    kernelPatchUsbControllerResetSelfCalibrationOrAdvancedModeMutationAllowed: false,
    deliberateFirmwareWriteInterruptionAllowed: false,
    automaticRetryMayHideFailure: false,
    oneFaultTargetBackendOrLaterSuccessMayRescueFailure: false,
  });
  assert.equal(
    plan.recoveryCampaign.requiredTargetFaultCellCount,
    plan.targetMatrix.length * plan.recoveryCampaign.faultIds.length,
  );
  assert.equal(
    plan.recoveryCampaign.requiredRecoveryCycleCount,
    plan.recoveryCampaign.requiredTargetFaultCellCount
      * plan.recoveryCampaign.validRecoveryCyclesPerTargetFaultCell,
  );

  assert.deepEqual(plan.requiredEvidence, requiredEvidence);
  assert.deepEqual(plan.fixedAcceptance, {
    maximumLiveExposureToActionP95Us: 120000,
    minimumPerActionPrecisionPpm: 950000,
    minimumPerActionRecallPpm: 900000,
    maximumPrivilegedFalseActivations: 0,
    maximumRuntimeNetworkAttempts: 0,
    maximumRootRuntimeProcesses: 0,
    maximumUnrecoveredFaults: 0,
    maximumUnexpectedProcessExits: 0,
    maximumDeviceFirmwareSdkBackendBuildStreamOrProjectorSubstitutions: 0,
    maximumUsbSpeedDowngradeEvents: 0,
    everyBuildRunSoakAndRecoveryCellMustPass: true,
    vendorSpecsPriceAvailabilityPlatformListOrRepositoryBadgeMayQualify: false,
    prebuiltPackageGeneratedArchiveOrPublishedDigestMayQualify: false,
    oneTargetArchitecturePhaseFaultBackendOrLaterSuccessMayRescueAnother: false,
    activeProjectorResultMayRescuePassiveTargetOrSafetyFailure: false,
    buildEnumerationHeartbeatPartialDeviceOrOneStreamMayQualifyRuntime: false,
    i044MayEstablishMaterialDepthBenefitSelectionOrBomMutation: false,
  });

  const openKeys = [
    "minimumRgbFpsMilliFps", "minimumDepthFpsMilliFps", "minimumIrFpsMilliFps",
    "minimumImuRateMilliHz", "maximumFrameDropRatePpm", "maximumPartialEnumerationEvents",
    "maximumCorruptOrOutOfOrderFramesPerRun", "maximumTimestampUncertaintyUs",
    "maximumTimestampDriftUsPerHour", "maximumAlignmentErrorP95Mm",
    "maximumDepthErrorP95Mm", "maximumUsbBandwidthUtilizationPpm",
    "maximumCpuUtilizationPpm", "maximumRamBytes", "maximumWallPowerMilliW",
    "maximumUsbPowerMilliW", "maximumDeviceTemperatureMilliC", "maximumRecoveryP95Ms",
    "maximumCleanBuildP95Ms", "maximumInstalledPackageBytes",
    "maximumDeliveredCostUsdCents", "minimumMaterialDepthBenefitPpm",
    "mustBeFixedBeforeFirstReleaseBinaryOrFirmwareDownloadTargetBuildDeviceOperationOrRun",
  ];
  exactKeys(plan.openAcceptance, openKeys, "openAcceptance");
  for (const key of openKeys.slice(0, -1)) {
    assert.equal(plan.openAcceptance[key], null, `open gate ${key} must remain null`);
  }
  assert.equal(plan.openAcceptance[openKeys.at(-1)], true);

  assert.deepEqual(plan.costBoundary, {
    requiredDeliveredCostRoles: [
      "camera", "qualified-usb-cable", "mount-and-hardware", "power-accessories",
      "target-specific-integration", "tax", "shipping",
    ],
    quoteDestination: null,
    quoteCurrency: null,
    quoteObservedAt: null,
    deliveredCostUsdCents: null,
    observedListPriceMayRepresentDeliveredOrIntegratedCost: false,
    purchaseRecommendation: "none-no-purchase-authority",
  });
  assert.deepEqual(plan.dataPolicy, {
    rawRoomRgbDepthIrOrPointCloudRetentionAuthorized: false,
    participantNamesFacesVoicesExactAgesAddressesOrStableIdentifiersAllowed: false,
    deviceSerialsHostPathsCredentialsTokensPrivateKeysOrRequestBodiesAllowed: false,
    individualFreeTextOrUnredactedSystemLogsAllowed: false,
    pathFreeClosedVocabularyAndAggregateEvidenceRequired: true,
    temporaryDiagnosticCollectionRequiresSeparateConsentAccessRetentionAndDeletionProof: true,
    networkEgressDuringOfflineBuildOrRuntimeAllowed: false,
  });
  assert.deepEqual(plan.executionGate, {
    state: "blocked",
    blockerCodes: [...REALSENSE_BLOCKERS],
    readyRequiresEveryBlockerResolvedBeforeFirstReleaseBinaryOrFirmwareDownloadTargetBuildDeviceOperationOrRun: true,
  });
  assert.deepEqual(plan.result, {
    disposition: "blocked",
    completedCleanOfflineBuildCount: 0,
    completedRuntimeRunCount: 0,
    completedSoakRunCount: 0,
    completedRecoveryCycleCount: 0,
    targetResults: [],
    qualifiedTargetIds: [],
    firmwareUpdateOrRecoveryQualified: false,
    materialDepthBenefitEstablished: false,
    realSenseSelected: false,
    deliveredCostUsdCents: null,
    purchaseRecommended: false,
  });
  return plan;
}

export async function parseRealSenseD455LinuxTargetPlanBytes(bytes, repositoryRoot = root) {
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
  await validateRealSenseD455LinuxTargetPlan(plan, repositoryRoot);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseRealSenseD455LinuxTargetPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.buildCampaign.requiredCleanOfflineBuildCount}-build,`
      + ` ${plan.runtimeCampaign.requiredRuntimeRunCount}-run,`
      + ` ${plan.runtimeCampaign.requiredSoakRunCount}-soak,`
      + ` ${plan.recoveryCampaign.requiredRecoveryCycleCount}-recovery-cycle I-044 plan`,
    );
  }
}
