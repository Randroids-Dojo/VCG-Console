import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/orbbec/gemini-335l-linux-target-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA1 = /^[a-f0-9]{40}$/u;

export const ORBBEC_GEMINI_335L_FORMAT =
  "vcg-orbbec-gemini-335l-linux-target-plan/v1";
export const ORBBEC_TARGETS = Object.freeze([
  [
    "ordinary-x86-linux-external-camera",
    "ordinary-native-linux-reference",
    "x86_64",
    "selected-native-linux-distribution",
    "ubuntu-20.04-22.04-24.04-x86_64-listed-exact-vcg-tuple-unproven",
  ],
  [
    "steamos-external-camera",
    "steamos-reference",
    "x86_64",
    "selected-steamos-image",
    "steamos-not-in-current-vendor-tested-distribution-list",
  ],
  [
    "raspberry-pi5-ai-hat-integrated-camera",
    "lower-cost-integrated-reference",
    "aarch64",
    "selected-raspberry-pi-linux-image",
    "pi5-named-in-product-datasheet-not-current-sdk-release-tested-arm64-list",
  ],
]);
export const ORBBEC_BUILD_OPTIONS = Object.freeze([
  "CMAKE_BUILD_TYPE=Release",
  "OB_BUILD_EXAMPLES=ON",
  "OB_BUILD_TESTS=ON",
  "OB_BUILD_TOOLS=OFF",
  "OB_BUILD_DOCS=OFF",
  "OB_BUILD_PCL_EXAMPLES=OFF",
  "OB_BUILD_OPEN3D_EXAMPLES=OFF",
  "OB_BUILD_USB_PAL=ON",
  "OB_BUILD_NET_PAL=OFF",
  "OB_BUILD_GMSL_PAL=OFF",
  "OB_INSTALL_LICENSES=ON",
  "OB_BUILD_WITH_EXTENSIONS_COMMIT_HASH=ON",
  "OB_ENABLE_SANITIZER=OFF",
  "OB_ENABLE_CLANG_TIDY=OFF",
]);
export const ORBBEC_RUNTIME_PHASES = Object.freeze([
  "unprivileged-enumeration-and-exact-identity",
  "cold-open-configure-and-close",
  "sustained-rgb-depth-ir-stream-and-timestamps",
  "depth-to-color-alignment-and-point-cloud-contract",
  "concurrent-vcg-tracker-and-game-workload",
  "clean-stop-and-restart-without-host-or-device-reboot",
]);
export const ORBBEC_RECOVERY_FAULTS = Object.freeze([
  "sdk-process-termination-and-restart",
  "stream-stop-start-cycling",
  "idle-camera-unplug-and-reconnect",
  "streaming-camera-unplug-and-reconnect",
  "permission-denial-and-restoration",
  "usb-bandwidth-contention-and-restoration",
  "host-suspend-and-resume",
  "host-reboot-and-cold-reopen",
]);
export const ORBBEC_BLOCKERS = Object.freeze([
  "exact-received-g40055-170-identity-condition-calibration-cable-mount-power-firmware-and-bootloader",
  "fresh-destination-aware-delivered-quote-and-purchase-or-borrow-authority",
  "exact-ordinary-linux-steamos-and-pi5-hardware-os-kernel-libc-toolchain-usb-power-and-ai-hat-tuples",
  "sdk-source-dependency-build-package-license-sbom-udev-update-and-rollback-contract",
  "extension-binary-decision-and-lingbot-model-activation-exclusion",
  "exact-passive-preset-filters-stream-alignment-timestamp-emitter-state-and-ground-truth-protocol",
  "runtime-soak-fault-recovery-offline-rebuild-instrumentation-and-schedule-protocols",
  "all-open-stream-timestamp-depth-resource-power-thermal-recovery-build-cost-and-benefit-gates",
  "i045-ready-result-before-any-active-emitter-lane-and-q018-protocol-before-depth-benefit-claim",
  "purchase-download-target-device-emitter-participant-fault-diagnostic-result-selection-and-publication-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "candidateSnapshot",
  "authorityBoundary", "sdkCandidate", "targetMatrix", "buildCampaign",
  "deviceConfiguration", "runtimeCampaign", "recoveryCampaign", "requiredEvidence",
  "fixedAcceptance", "openAcceptance", "costBoundary", "dataPolicy",
  "executionGate", "result",
];
const sourceDefinitions = [
  ["official-source-candidate-screen", "docs/ORBBEC_GEMINI_335L_CANDIDATE_SCREEN_2026-07-26.md"],
  ["campaign-contract", "docs/ORBBEC_GEMINI_335L_LINUX_TARGET_CAMPAIGN_2026-07-26.md"],
  ["depth-option-research-boundary", "docs/RESEARCH.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["shared-camera-target-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-usb-cable-boundary", "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"],
  ["exposure-to-action-proof-boundary", "scripts/validate-camera-action-latency-campaign.mjs"],
];
const sdkAssets = [
  [
    "linux-x86_64-tarball",
    "OrbbecSDK_v2.9.3_202607151523_2f6561c_linux_x86_64.tar.gz",
    "8516081b2201f841b1aa444dd203975e06891d73a2694dd2b3d864254f89ff0d",
  ],
  [
    "linux-arm64-tarball",
    "OrbbecSDK_v2.9.3_202607151523_2f6561c_linux_arm64.tar.gz",
    "ce2c476c283b932181b04daf44debadff9e4a743344bd69eecf34f8c18009ac1",
  ],
  [
    "linux-amd64-deb",
    "OrbbecSDK_v2.9.3_amd64.deb",
    "1c3c56bceafe6f0f562b09eb400750a911b5d02d529f776e76c29fc36371ae29",
  ],
  [
    "linux-arm64-deb",
    "OrbbecSDK_v2.9.3_arm64.deb",
    "3d238ab1bf76ba768ce859e08991f8cbb40c17ef0895aae6d85e938683aab693",
  ],
];
const requiredEvidence = [
  "exact received model revision private serial digest calibration cable mount power firmware and bootloader",
  "exact target hardware os image release kernel libc compiler cmake libusb udev usb controller and power topology",
  "pinned source tag object commit cmake cache dependency mirror compiler warnings installed files dynamic links licenses and sbom",
  "locally verified release artifact and firmware bytes only when separately authorized",
  "unprivileged enumeration model vid pid firmware usb speed port path and permissions",
  "exact passive preset filters rgb depth ir formats resolution fps alignment and emitter-off observation",
  "exposure device host and application timestamps with clock mapping uncertainty drift drops duplicates corruption and ordering",
  "rgb valid-depth aligned-depth point-cloud and qualified-action coverage with independent ground truth",
  "exposure-to-game-api p50 p95 p99 worst action precision recall and privileged false activations",
  "cpu ram usb bandwidth wall and usb power temperature throttling and concurrent game frame pacing",
  "cold open close restart one-hour soak and complete failure retry invalid and interruption ledger",
  "per-fault injection detection fail-closed stale-frame rejection healthy-return timing and intervention record",
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
  return createHash("sha256").update(Buffer.from(normalizedText(bytes, label), "utf8")).digest("hex");
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

export async function validateOrbbecGemini335lLinuxTargetPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, ORBBEC_GEMINI_335L_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "orbbec-gemini-335l-linux-target-qualification-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-043", "Q-018"]);
  assert.match(plan.claimBoundary, /zero-result/u);
  assert.match(plan.claimBoundary, /temporary read-only clone/u);
  assert.match(plan.claimBoundary, /No purchase/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.candidateSnapshot, {
    manufacturer: "Orbbec",
    product: "Gemini 335L",
    model: "G40055-170",
    usbVendorId: "0x2bc5",
    usbProductId: "0x0804",
    connection: "usb-3.0-type-c",
    depthTechnology: "active-and-passive-stereo",
    emitterWavelengthNm: 850,
    baselineMm: 95,
    depthAndRgbShutter: "global",
    maximumDepthMode: "1280x800@30",
    maximumRgbMode: "1280x800@60",
    depthFovDegrees: { horizontal: 90, vertical: 65 },
    rgbFovDegrees: { horizontal: 94, vertical: 68 },
    averagePowerMilliWLessThan: 3000,
    observedListPriceUsdCents: 35900,
    observedAvailability: "in-stock",
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
    "releaseArtifactDownloadAuthorized", "firmwareArtifactDownloadAuthorized",
    "targetAccessOrMutationAuthorized", "usbDeviceOperationAuthorized",
    "irEmitterUseAuthorized", "participantCollectionAuthorized", "faultInjectionAuthorized",
    "temporaryDiagnosticCollectionAuthorized", "publicationAuthorized",
  ], "authorityBoundary");
  assert.equal(plan.authorityBoundary.sourceInspectionCompleted, true);
  assert.equal(
    plan.authorityBoundary.sourceInspectionCommitGitSha1,
    "2f6561c28255d805b34aa00a690199ce40e96c81",
  );
  assert.match(plan.authorityBoundary.sourceInspectionCommitGitSha1, GIT_SHA1);
  for (const key of Object.keys(plan.authorityBoundary).slice(2, 11)) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of Object.keys(plan.authorityBoundary).slice(11)) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  exactKeys(plan.sdkCandidate, [
    "repositoryUrl", "releaseTag", "tagObjectGitSha1", "sourceCommitGitSha1",
    "publishedAt", "minimumSupportedFirmwareVersion", "recommendedFirmwareVersion",
    "releaseAssets", "sourceLicenseSummary", "extensionBinaryUseDecision",
    "licenseAndSbomManifestSha256", "lingBotEnhancedFilterAllowedInBlockingLane",
    "modelSm4DownloadOrActivationAuthorized", "movingAliasAllowed",
    "releaseAssetMaySubstituteTargetNativeBuild",
    "publishedDigestMaySubstituteLocallyVerifiedBytes",
  ], "sdkCandidate");
  assert.deepEqual([
    plan.sdkCandidate.repositoryUrl,
    plan.sdkCandidate.releaseTag,
    plan.sdkCandidate.tagObjectGitSha1,
    plan.sdkCandidate.sourceCommitGitSha1,
    plan.sdkCandidate.publishedAt,
    plan.sdkCandidate.minimumSupportedFirmwareVersion,
    plan.sdkCandidate.recommendedFirmwareVersion,
  ], [
    "https://github.com/orbbec/OrbbecSDK_v2.git",
    "v2.9.3",
    "ca69b53b11eda5c65909da7e016d07fc7537d6a9",
    "2f6561c28255d805b34aa00a690199ce40e96c81",
    "2026-07-16T15:48:20Z",
    "1.2.20",
    "1.8.10",
  ]);
  assert.match(plan.sdkCandidate.tagObjectGitSha1, GIT_SHA1);
  assert.match(plan.sdkCandidate.sourceCommitGitSha1, GIT_SHA1);
  assert.equal(plan.sdkCandidate.releaseAssets.length, sdkAssets.length);
  for (const [index, [role, name, digest]] of sdkAssets.entries()) {
    const asset = plan.sdkCandidate.releaseAssets[index];
    exactKeys(asset, [
      "role", "name", "publishedSha256", "locallyVerifiedSha256", "diagnosticOnly",
    ], `sdkCandidate.releaseAssets[${index}]`);
    assert.deepEqual([asset.role, asset.name, asset.publishedSha256], [role, name, digest]);
    assert.equal(asset.locallyVerifiedSha256, null);
    assert.equal(asset.diagnosticOnly, true);
  }
  assert.equal(
    plan.sdkCandidate.sourceLicenseSummary,
    "MIT core; Orbbec-product-only restricted extension binaries; exact third-party notices remain required",
  );
  assert.equal(plan.sdkCandidate.extensionBinaryUseDecision, null);
  assert.equal(plan.sdkCandidate.licenseAndSbomManifestSha256, null);
  for (const key of [
    "lingBotEnhancedFilterAllowedInBlockingLane", "modelSm4DownloadOrActivationAuthorized",
    "movingAliasAllowed", "releaseAssetMaySubstituteTargetNativeBuild",
    "publishedDigestMaySubstituteLocallyVerifiedBytes",
  ]) assert.equal(plan.sdkCandidate[key], false);

  const targetKeys = [
    "targetId", "role", "architecture", "operatingSystemBoundary",
    "vendorSupportBoundary", "required", "hardwareInventorySha256", "osImageSha256",
    "osRelease", "kernelRelease", "libcVersion", "compilerVersion", "cmakeVersion",
    "libusbVersion", "udevRuleSha256", "usbControllerTopologySha256",
    "powerTopologySha256", "installedSdkManifestSha256", "buildArtifactSha256",
    "runtimeConfigurationSha256", "qualified",
  ];
  assert.equal(plan.targetMatrix.length, ORBBEC_TARGETS.length);
  for (const [index, definition] of ORBBEC_TARGETS.entries()) {
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
    sourceCommitGitSha1: "2f6561c28255d805b34aa00a690199ce40e96c81",
    cmakeOptions: [...ORBBEC_BUILD_OPTIONS],
    validCleanOfflineBuildsPerTarget: 20,
    requiredTargetCount: 3,
    requiredCleanOfflineBuildCount: 60,
    maximumOfflineBuildNetworkAttempts: 0,
    contentAddressedSourceAndDependencyMirrorRequired: true,
    freshBuildRootRequired: true,
    compilerWarningsAndFailuresRemainVisible: true,
    installedFilesDynamicLinksLicensesAndSbomMustBeRecorded: true,
    maximumUnexplainedInstalledManifestMismatches: 0,
    vendorPrebuiltAssetMayRescueNativeBuildFailure: false,
    oneTargetOrArchitectureMayRescueAnother: false,
    failedOrInterruptedBuildMayBeSilentlyReplaced: false,
  });
  assert.equal(
    plan.buildCampaign.requiredCleanOfflineBuildCount,
    plan.buildCampaign.requiredTargetCount * plan.buildCampaign.validCleanOfflineBuildsPerTarget,
  );

  assert.deepEqual(plan.deviceConfiguration, {
    requiredModel: "G40055-170",
    requiredUsbVendorId: "0x2bc5",
    requiredUsbProductId: "0x0804",
    requiredFirmwareVersion: "1.8.10",
    receivedPrivateSerialDigestSha256: null,
    receivedHardwareRevision: null,
    receivedCalibrationSha256: null,
    receivedFirmwareSha256: null,
    receivedBootloaderVersion: null,
    suppliedCableManifestSha256: null,
    mountAndPowerManifestSha256: null,
    blockingModeId: "rgb-depth-passive-emitter-off",
    conditionalModeId: "rgb-depth-active-emitter-on-i045-gated",
    exactPassivePresetAndFilterSha256: null,
    exactRgbDepthIrStreamProfileSha256: null,
    timestampAndClockMappingProtocolSha256: null,
    emitterStateIndependentObserverSha256: null,
    emitterDefaultOff: true,
    activeModeRequiresI045ReadyResult: true,
    onlineFirmwareUpdateAllowed: false,
    firmwareDowngradeAllowed: false,
    firmwareWriteInterruptionMayBeInduced: false,
    firmwareUpdateOrRecoveryClaimed: false,
  });

  assert.deepEqual(plan.runtimeCampaign, {
    targetIds: ORBBEC_TARGETS.map(([targetId]) => targetId),
    phaseIds: [...ORBBEC_RUNTIME_PHASES],
    validRunsPerTargetPhase: 20,
    requiredTargetPhaseCellCount: 18,
    requiredRuntimeRunCount: 360,
    validOneHourSoaksPerTarget: 3,
    minimumMeasuredSecondsPerSoak: 3600,
    requiredSoakRunCount: 9,
    sameReceivedDeviceRequiredAcrossTargets: true,
    unprivilegedRuntimeRequired: true,
    sudoOrRootRuntimeMayPass: false,
    counterbalancedTargetAndPhaseOrderRequired: true,
    dropsDuplicatesCorruptionOrderingSpeedDowngradesRetriesAndInvalidRunsRemainVisible: true,
    failedInvalidOrInterruptedRunMayBeSilentlyReplaced: false,
    oneTargetPhaseOrSoakMayRescueAnother: false,
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
    faultIds: [...ORBBEC_RECOVERY_FAULTS],
    validRecoveryCyclesPerTargetFaultCell: 20,
    requiredTargetFaultCellCount: 24,
    requiredRecoveryCycleCount: 480,
    faultDetectionFailClosedStaleFrameRejectionAndHealthyReturnRequired: true,
    manualRootNetworkFirmwareAndPowerInterventionMustBeRecorded: true,
    vendorFirmwareRecoveryProcedureDeskReviewRequired: true,
    firmwareRecoveryModeQualificationRequiredForFirmwareUpdateClaim: true,
    firmwareRecoveryModeQualificationCompleted: false,
    deliberateFirmwareWriteInterruptionAllowed: false,
    automaticRetryMayHideFailure: false,
    oneFaultTargetOrLaterSuccessMayRescueFailure: false,
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
    maximumDeviceFirmwareSdkBuildStreamOrEmitterSubstitutions: 0,
    maximumUsbSpeedDowngradeEvents: 0,
    everyBuildRunSoakAndRecoveryCellMustPass: true,
    vendorSpecsPriceAvailabilityOrPlatformListMayQualify: false,
    vendorBinaryOrPublishedDigestMayQualify: false,
    oneTargetArchitecturePhaseFaultOrLaterSuccessMayRescueAnother: false,
    activeEmitterResultMayRescuePassiveTargetOrSafetyFailure: false,
    buildEnumerationHeartbeatOrOneStreamMayQualifyRuntime: false,
    i043MayEstablishMaterialDepthBenefitSelectionOrBomMutation: false,
  });

  const openKeys = [
    "minimumRgbFpsMilliFps", "minimumDepthFpsMilliFps", "minimumIrFpsMilliFps",
    "maximumFrameDropRatePpm", "maximumCorruptOrOutOfOrderFramesPerRun",
    "maximumTimestampUncertaintyUs", "maximumTimestampDriftUsPerHour",
    "maximumAlignmentErrorP95Mm", "maximumDepthErrorP95Mm",
    "maximumUsbBandwidthUtilizationPpm", "maximumCpuUtilizationPpm", "maximumRamBytes",
    "maximumWallPowerMilliW", "maximumUsbPowerMilliW", "maximumDeviceTemperatureMilliC",
    "maximumRecoveryP95Ms", "maximumCleanBuildP95Ms", "maximumInstalledPackageBytes",
    "maximumDeliveredCostUsdCents", "minimumMaterialDepthBenefitPpm",
    "mustBeFixedBeforeFirstReleaseArtifactOrFirmwareDownloadTargetBuildDeviceOperationOrRun",
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
    blockerCodes: [...ORBBEC_BLOCKERS],
    readyRequiresEveryBlockerResolvedBeforeFirstReleaseArtifactOrFirmwareDownloadTargetBuildDeviceOperationOrRun: true,
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
    orbbecSelected: false,
    deliveredCostUsdCents: null,
    purchaseRecommended: false,
  });
  return plan;
}

export async function parseOrbbecGemini335lLinuxTargetPlanBytes(bytes, repositoryRoot = root) {
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
  await validateOrbbecGemini335lLinuxTargetPlan(plan, repositoryRoot);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseOrbbecGemini335lLinuxTargetPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.buildCampaign.requiredCleanOfflineBuildCount}-build,`
      + ` ${plan.runtimeCampaign.requiredRuntimeRunCount}-run,`
      + ` ${plan.runtimeCampaign.requiredSoakRunCount}-soak,`
      + ` ${plan.recoveryCampaign.requiredRecoveryCycleCount}-recovery-cycle I-043 plan`,
    );
  }
}
