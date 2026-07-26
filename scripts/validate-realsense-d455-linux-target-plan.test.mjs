import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REALSENSE_BLOCKERS,
  REALSENSE_COMMON_BUILD_OPTIONS,
  REALSENSE_RECOVERY_FAULTS,
  REALSENSE_RUNTIME_PHASES,
  REALSENSE_TARGET_BUILD_OPTIONS,
  REALSENSE_TARGETS,
  parseRealSenseD455LinuxTargetPlanBytes,
  validateRealSenseD455LinuxTargetPlan,
} from "./validate-realsense-d455-linux-target-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/realsense/d455-linux-target-plan-v1.json",
));
const tracked = await parseRealSenseD455LinuxTargetPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-044 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.candidateSnapshot.productCode, "82635DSD455");
  assert.equal(tracked.backendContract.blockingBackendId, "rsusb-libusb-userspace");
  assert.equal(tracked.buildCampaign.requiredCleanOfflineBuildCount, 60);
  assert.equal(tracked.runtimeCampaign.requiredRuntimeRunCount, 360);
  assert.equal(tracked.runtimeCampaign.requiredSoakRunCount, 9);
  assert.equal(tracked.recoveryCampaign.requiredRecoveryCycleCount, 480);
});

test("rejects stale or substituted source bindings", async () => {
  for (const mutate of [
    (plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); },
    (plan) => { plan.sourceBindings[1].role = "campaign-summary"; },
    (plan) => { plan.sourceBindings.pop(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("rejects candidate substitution, vendor promotion, stale price, or invented receipt", async () => {
  for (const mutate of [
    (plan) => { plan.candidateSnapshot.product = "Depth Camera D455f"; },
    (plan) => { plan.candidateSnapshot.productCode = "82635DSD455F"; },
    (plan) => { plan.candidateSnapshot.materialCode = "99C9LW"; },
    (plan) => { plan.candidateSnapshot.usbProductId = "0x0b64"; },
    (plan) => { plan.candidateSnapshot.depthFovDegrees.horizontal = 95; },
    (plan) => { plan.candidateSnapshot.observedListPriceUsdCents = 39900; },
    (plan) => { plan.candidateSnapshot.observedAvailability = "in-stock"; },
    (plan) => { plan.candidateSnapshot.receivedDeviceIdentitySha256 = "a".repeat(64); },
    (plan) => { plan.candidateSnapshot.deliveredQuoteSha256 = "b".repeat(64); },
    (plan) => { plan.candidateSnapshot.vendorFactsMayAuthorizePurchaseSelectionOrQualification = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("preserves honest source inspection while rejecting invented protocols or authority", async () => {
  for (const mutate of [
    (plan) => { plan.authorityBoundary.sourceInspectionCompleted = false; },
    (plan) => { plan.authorityBoundary.sourceInspectionCommitGitSha1 = "0".repeat(40); },
    (plan) => { plan.authorityBoundary.exactReceivedDeviceManifestSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.buildAndPackageProtocolSha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.purchaseAuthorized = true; },
    (plan) => { plan.authorityBoundary.releaseBinaryDownloadAuthorized = true; },
    (plan) => { plan.authorityBoundary.firmwareArtifactDownloadAuthorized = true; },
    (plan) => { plan.authorityBoundary.targetAccessOrMutationAuthorized = true; },
    (plan) => { plan.authorityBoundary.usbDeviceOperationAuthorized = true; },
    (plan) => { plan.authorityBoundary.irProjectorUseAuthorized = true; },
    (plan) => { plan.authorityBoundary.participantCollectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.faultInjectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.publicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("pins beta source, exact firmware, no Linux binaries, and licensing boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.sdkCandidate.releaseTag = "master"; },
    (plan) => { plan.sdkCandidate.releaseChannel = "stable"; },
    (plan) => { plan.sdkCandidate.sourceCommitGitSha1 = "0".repeat(40); },
    (plan) => { plan.sdkCandidate.requiredFirmwareVersion = "5.17.0.10"; },
    (plan) => { plan.sdkCandidate.firmwarePublishedSha256 = "a".repeat(64); },
    (plan) => { plan.sdkCandidate.firmwareLocallyVerifiedSha256 = "b".repeat(64); },
    (plan) => { plan.sdkCandidate.linuxTargetBinaryAssets.push({}); },
    (plan) => { plan.sdkCandidate.windowsReleaseAssetsExcluded = false; },
    (plan) => { plan.sdkCandidate.licenseAndSbomManifestSha256 = "c".repeat(64); },
    (plan) => { plan.sdkCandidate.movingBranchOrAliasAllowed = true; },
    (plan) => { plan.sdkCandidate.generatedSourceArchiveMayDefineSourceIdentity = true; },
    (plan) => { plan.sdkCandidate.prebuiltOrPackageRepositoryMaySubstituteTargetNativeBuild = true; },
    (plan) => { plan.sdkCandidate.publishedDigestMaySubstituteLocallyVerifiedBytes = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("freezes RSUSB as the common non-rescuing backend", async () => {
  for (const mutate of [
    (plan) => { plan.backendContract.blockingBackendId = "v4l2"; },
    (plan) => { plan.backendContract.blockingCmakeSelection = "FORCE_RSUSB_BACKEND=OFF"; },
    (plan) => { plan.backendContract.kernelPatchingRequiredForBlockingBackend = true; },
    (plan) => { plan.backendContract.reviewedUdevRuleAndUnprivilegedAccessStillRequired = false; },
    (plan) => { plan.backendContract.sameBlockingBackendRequiredAcrossTargets = false; },
    (plan) => { plan.backendContract.nativeDiagnosticExecutionAuthorized = true; },
    (plan) => { plan.backendContract.dkmsKernelModuleSecureBootOrBiosMutationAuthorized = true; },
    (plan) => { plan.backendContract.backendSubstitutionMayRescueFailure = true; },
    (plan) => { plan.backendContract.oneBackendMayEstablishAnotherBackend = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("keeps all exact target rows blocked and non-rescuing", async () => {
  assert.deepEqual(
    tracked.targetMatrix.map((target) => [
      target.targetId, target.role, target.architecture,
      target.operatingSystemBoundary, target.vendorSupportBoundary,
    ]),
    [...REALSENSE_TARGETS],
  );
  for (const mutate of [
    (plan) => { plan.targetMatrix.pop(); },
    (plan) => { plan.targetMatrix.reverse(); },
    (plan) => { plan.targetMatrix[1].vendorSupportBoundary = "linux-x86-supported"; },
    (plan) => { plan.targetMatrix[2].architecture = "arm64-generic"; },
    (plan) => { plan.targetMatrix[0].osImageSha256 = "a".repeat(64); },
    (plan) => { plan.targetMatrix[0].kernelRelease = "6.14"; },
    (plan) => { plan.targetMatrix[0].installedSdkManifestSha256 = "b".repeat(64); },
    (plan) => { plan.targetMatrix[0].qualified = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("requires 60 exact RSUSB native offline builds with frozen per-target options", async () => {
  assert.deepEqual(tracked.buildCampaign.commonCmakeOptions, [...REALSENSE_COMMON_BUILD_OPTIONS]);
  assert.deepEqual(
    tracked.buildCampaign.targetCmakeOptions,
    REALSENSE_TARGET_BUILD_OPTIONS.map(([targetId, options]) => ({ targetId, options: [...options] })),
  );
  for (const mutate of [
    (plan) => { plan.buildCampaign.commonCmakeOptions.pop(); },
    (plan) => { plan.buildCampaign.commonCmakeOptions[1] = "FORCE_RSUSB_BACKEND=OFF"; },
    (plan) => { plan.buildCampaign.commonCmakeOptions[14] = "CHECK_FOR_UPDATES=ON"; },
    (plan) => { plan.buildCampaign.targetCmakeOptions[2].options.pop(); },
    (plan) => { plan.buildCampaign.validCleanOfflineBuildsPerTarget = 19; },
    (plan) => { plan.buildCampaign.requiredCleanOfflineBuildCount = 59; },
    (plan) => { plan.buildCampaign.maximumOfflineBuildNetworkAttempts = 1; },
    (plan) => { plan.buildCampaign.contentAddressedSourceDependencyAndUnitTestDataMirrorRequired = false; },
    (plan) => { plan.buildCampaign.compilerWarningsAndFailuresRemainVisible = false; },
    (plan) => { plan.buildCampaign.maximumUnexplainedInstalledManifestMismatches = 1; },
    (plan) => { plan.buildCampaign.prebuiltPackageArchiveOrNativeBackendMayRescueRsusbBuildFailure = true; },
    (plan) => { plan.buildCampaign.oneTargetOrArchitectureMayRescueAnother = true; },
    (plan) => { plan.buildCampaign.failedOrInterruptedBuildMayBeSilentlyReplaced = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("preserves received-device, passive-projector, calibration, and firmware boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.deviceConfiguration.requiredProductCode = "D455"; },
    (plan) => { plan.deviceConfiguration.requiredFirmwareVersion = "latest"; },
    (plan) => { plan.deviceConfiguration.receivedPrivateSerialDigestSha256 = "a".repeat(64); },
    (plan) => { plan.deviceConfiguration.receivedImuComponent = "BMI085"; },
    (plan) => { plan.deviceConfiguration.receivedCalibrationSha256 = "b".repeat(64); },
    (plan) => { plan.deviceConfiguration.exactPassivePresetAndFilterSha256 = "c".repeat(64); },
    (plan) => { plan.deviceConfiguration.blockingModeId = plan.deviceConfiguration.conditionalModeId; },
    (plan) => { plan.deviceConfiguration.campaignForcesProjectorOff = false; },
    (plan) => { plan.deviceConfiguration.activeModeRequiresI045ReadyResult = false; },
    (plan) => { plan.deviceConfiguration.selfCalibrationOrTareAllowed = true; },
    (plan) => { plan.deviceConfiguration.advancedModeOrPresetWriteAllowed = true; },
    (plan) => { plan.deviceConfiguration.onlineFirmwareUpdateAllowed = true; },
    (plan) => { plan.deviceConfiguration.firmwareDowngradeAllowed = true; },
    (plan) => { plan.deviceConfiguration.firmwareWriteInterruptionMayBeInduced = true; },
    (plan) => { plan.deviceConfiguration.firmwareUpdateOrRecoveryClaimed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("requires 360 runtime runs and nine one-hour soaks without hidden replacement", async () => {
  assert.deepEqual(tracked.runtimeCampaign.phaseIds, [...REALSENSE_RUNTIME_PHASES]);
  for (const mutate of [
    (plan) => { plan.runtimeCampaign.targetIds.pop(); },
    (plan) => { plan.runtimeCampaign.phaseIds.pop(); },
    (plan) => { plan.runtimeCampaign.validRunsPerTargetPhase = 19; },
    (plan) => { plan.runtimeCampaign.requiredRuntimeRunCount = 359; },
    (plan) => { plan.runtimeCampaign.validOneHourSoaksPerTarget = 2; },
    (plan) => { plan.runtimeCampaign.minimumMeasuredSecondsPerSoak = 3599; },
    (plan) => { plan.runtimeCampaign.requiredSoakRunCount = 8; },
    (plan) => { plan.runtimeCampaign.sameReceivedDeviceRequiredAcrossTargets = false; },
    (plan) => { plan.runtimeCampaign.sameRsusbBackendRequiredAcrossTargets = false; },
    (plan) => { plan.runtimeCampaign.unprivilegedRuntimeRequired = false; },
    (plan) => { plan.runtimeCampaign.sudoRootOrNativeBackendRuntimeMayPass = true; },
    (plan) => { plan.runtimeCampaign.partialEnumerationDropsDuplicatesCorruptionOrderingSpeedDowngradesRetriesAndInvalidRunsRemainVisible = false; },
    (plan) => { plan.runtimeCampaign.failedInvalidOrInterruptedRunMayBeSilentlyReplaced = true; },
    (plan) => { plan.runtimeCampaign.oneTargetPhaseBackendOrSoakMayRescueAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("requires all 480 non-destructive recovery cycles and refuses mutation", async () => {
  assert.deepEqual(tracked.recoveryCampaign.faultIds, [...REALSENSE_RECOVERY_FAULTS]);
  for (const mutate of [
    (plan) => { plan.recoveryCampaign.faultIds.pop(); },
    (plan) => { plan.recoveryCampaign.validRecoveryCyclesPerTargetFaultCell = 19; },
    (plan) => { plan.recoveryCampaign.requiredTargetFaultCellCount = 23; },
    (plan) => { plan.recoveryCampaign.requiredRecoveryCycleCount = 479; },
    (plan) => { plan.recoveryCampaign.faultDetectionFailClosedPartialEnumerationStaleFrameRejectionAndHealthyReturnRequired = false; },
    (plan) => { plan.recoveryCampaign.manualRootNetworkFirmwareKernelAndPowerInterventionMustBeRecorded = false; },
    (plan) => { plan.recoveryCampaign.firmwareRecoveryQualificationRequiredForFirmwareUpdateClaim = false; },
    (plan) => { plan.recoveryCampaign.firmwareRecoveryQualificationCompleted = true; },
    (plan) => { plan.recoveryCampaign.kernelPatchUsbControllerResetSelfCalibrationOrAdvancedModeMutationAllowed = true; },
    (plan) => { plan.recoveryCampaign.deliberateFirmwareWriteInterruptionAllowed = true; },
    (plan) => { plan.recoveryCampaign.automaticRetryMayHideFailure = true; },
    (plan) => { plan.recoveryCampaign.oneFaultTargetBackendOrLaterSuccessMayRescueFailure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
});

test("rejects weakened gates, invented thresholds, unsafe data, premature results, or purchase", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.maximumLiveExposureToActionP95Us = 120001; },
    (plan) => { plan.fixedAcceptance.maximumRuntimeNetworkAttempts = 1; },
    (plan) => { plan.fixedAcceptance.maximumRootRuntimeProcesses = 1; },
    (plan) => { plan.fixedAcceptance.vendorSpecsPriceAvailabilityPlatformListOrRepositoryBadgeMayQualify = true; },
    (plan) => { plan.fixedAcceptance.activeProjectorResultMayRescuePassiveTargetOrSafetyFailure = true; },
    (plan) => { plan.fixedAcceptance.i044MayEstablishMaterialDepthBenefitSelectionOrBomMutation = true; },
    (plan) => { plan.openAcceptance.minimumRgbFpsMilliFps = 30000; },
    (plan) => { plan.openAcceptance.maximumPartialEnumerationEvents = 1; },
    (plan) => { plan.openAcceptance.maximumDeliveredCostUsdCents = 50000; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeFirstReleaseBinaryOrFirmwareDownloadTargetBuildDeviceOperationOrRun = false; },
    (plan) => { plan.costBoundary.requiredDeliveredCostRoles.pop(); },
    (plan) => { plan.costBoundary.deliveredCostUsdCents = 41900; },
    (plan) => { plan.costBoundary.observedListPriceMayRepresentDeliveredOrIntegratedCost = true; },
    (plan) => { plan.costBoundary.purchaseRecommendation = "buy"; },
    (plan) => { plan.dataPolicy.rawRoomRgbDepthIrOrPointCloudRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.deviceSerialsHostPathsCredentialsTokensPrivateKeysOrRequestBodiesAllowed = true; },
    (plan) => { plan.dataPolicy.networkEgressDuringOfflineBuildOrRuntimeAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.state = "ready"; },
    (plan) => { plan.result.completedRuntimeRunCount = 360; },
    (plan) => { plan.result.targetResults.push({}); },
    (plan) => { plan.result.qualifiedTargetIds.push("ordinary-x86-linux-external-camera"); },
    (plan) => { plan.result.materialDepthBenefitEstablished = true; },
    (plan) => { plan.result.realSenseSelected = true; },
    (plan) => { plan.result.purchaseRecommended = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRealSenseD455LinuxTargetPlan(plan));
  }
  assert.deepEqual(tracked.executionGate.blockerCodes, [...REALSENSE_BLOCKERS]);
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.realSenseSelected = false;
  await assert.rejects(validateRealSenseD455LinuxTargetPlan(extra), /fields drifted/u);
  const nested = clone(); nested.candidateSnapshot.cameraReady = false;
  await assert.rejects(validateRealSenseD455LinuxTargetPlan(nested));
  await assert.rejects(
    parseRealSenseD455LinuxTargetPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace(
    '  "status": "blocked",',
    '  "status": "blocked",\n  "status": "blocked",',
  )}\n`);
  await assert.rejects(parseRealSenseD455LinuxTargetPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseRealSenseD455LinuxTargetPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseRealSenseD455LinuxTargetPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseRealSenseD455LinuxTargetPlanBytes(Buffer.alloc(192 * 1024 + 1)),
    /exceeds/u,
  );
});
