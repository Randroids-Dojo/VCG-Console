import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORBBEC_BLOCKERS,
  ORBBEC_BUILD_OPTIONS,
  ORBBEC_RECOVERY_FAULTS,
  ORBBEC_RUNTIME_PHASES,
  ORBBEC_TARGETS,
  parseOrbbecGemini335lLinuxTargetPlanBytes,
  validateOrbbecGemini335lLinuxTargetPlan,
} from "./validate-orbbec-gemini-335l-linux-target-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/orbbec/gemini-335l-linux-target-plan-v1.json",
));
const tracked = await parseOrbbecGemini335lLinuxTargetPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-043 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.candidateSnapshot.model, "G40055-170");
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
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("rejects candidate substitution, vendor-claim promotion, stale price, or invented receipt", async () => {
  for (const mutate of [
    (plan) => { plan.candidateSnapshot.product = "Gemini 335"; },
    (plan) => { plan.candidateSnapshot.model = "G40155-170"; },
    (plan) => { plan.candidateSnapshot.usbProductId = "0x0800"; },
    (plan) => { plan.candidateSnapshot.rgbFovDegrees.horizontal = 120; },
    (plan) => { plan.candidateSnapshot.observedListPriceUsdCents = 34900; },
    (plan) => { plan.candidateSnapshot.observedAvailability = "selected"; },
    (plan) => { plan.candidateSnapshot.receivedDeviceIdentitySha256 = "a".repeat(64); },
    (plan) => { plan.candidateSnapshot.deliveredQuoteSha256 = "b".repeat(64); },
    (plan) => { plan.candidateSnapshot.vendorFactsMayAuthorizePurchaseSelectionOrQualification = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("preserves honest desk inspection while rejecting invented protocols or authority", async () => {
  for (const mutate of [
    (plan) => { plan.authorityBoundary.sourceInspectionCompleted = false; },
    (plan) => { plan.authorityBoundary.sourceInspectionCommitGitSha1 = "0".repeat(40); },
    (plan) => { plan.authorityBoundary.exactReceivedDeviceManifestSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.buildAndPackageProtocolSha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.purchaseAuthorized = true; },
    (plan) => { plan.authorityBoundary.releaseArtifactDownloadAuthorized = true; },
    (plan) => { plan.authorityBoundary.firmwareArtifactDownloadAuthorized = true; },
    (plan) => { plan.authorityBoundary.targetAccessOrMutationAuthorized = true; },
    (plan) => { plan.authorityBoundary.usbDeviceOperationAuthorized = true; },
    (plan) => { plan.authorityBoundary.irEmitterUseAuthorized = true; },
    (plan) => { plan.authorityBoundary.participantCollectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.faultInjectionAuthorized = true; },
    (plan) => { plan.authorityBoundary.publicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("pins SDK source, assets, firmware, licensing, and LingBot exclusion", async () => {
  for (const mutate of [
    (plan) => { plan.sdkCandidate.releaseTag = "latest"; },
    (plan) => { plan.sdkCandidate.sourceCommitGitSha1 = "0".repeat(40); },
    (plan) => { plan.sdkCandidate.recommendedFirmwareVersion = "1.6.00"; },
    (plan) => { plan.sdkCandidate.releaseAssets[0].publishedSha256 = "0".repeat(64); },
    (plan) => { plan.sdkCandidate.releaseAssets[0].locallyVerifiedSha256 = plan.sdkCandidate.releaseAssets[0].publishedSha256; },
    (plan) => { plan.sdkCandidate.releaseAssets[0].diagnosticOnly = false; },
    (plan) => { plan.sdkCandidate.extensionBinaryUseDecision = "approved"; },
    (plan) => { plan.sdkCandidate.licenseAndSbomManifestSha256 = "a".repeat(64); },
    (plan) => { plan.sdkCandidate.lingBotEnhancedFilterAllowedInBlockingLane = true; },
    (plan) => { plan.sdkCandidate.modelSm4DownloadOrActivationAuthorized = true; },
    (plan) => { plan.sdkCandidate.movingAliasAllowed = true; },
    (plan) => { plan.sdkCandidate.releaseAssetMaySubstituteTargetNativeBuild = true; },
    (plan) => { plan.sdkCandidate.publishedDigestMaySubstituteLocallyVerifiedBytes = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("keeps all exact target rows blocked and non-rescuing", async () => {
  assert.deepEqual(
    tracked.targetMatrix.map((target) => [
      target.targetId, target.role, target.architecture,
      target.operatingSystemBoundary, target.vendorSupportBoundary,
    ]),
    [...ORBBEC_TARGETS],
  );
  for (const mutate of [
    (plan) => { plan.targetMatrix.pop(); },
    (plan) => { plan.targetMatrix.reverse(); },
    (plan) => { plan.targetMatrix[1].vendorSupportBoundary = "linux-x86_64-supported"; },
    (plan) => { plan.targetMatrix[2].architecture = "arm64-generic"; },
    (plan) => { plan.targetMatrix[0].osImageSha256 = "a".repeat(64); },
    (plan) => { plan.targetMatrix[0].kernelRelease = "6.12"; },
    (plan) => { plan.targetMatrix[0].installedSdkManifestSha256 = "b".repeat(64); },
    (plan) => { plan.targetMatrix[0].qualified = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("requires 60 exact native offline builds with no target or vendor-binary rescue", async () => {
  assert.deepEqual(tracked.buildCampaign.cmakeOptions, [...ORBBEC_BUILD_OPTIONS]);
  for (const mutate of [
    (plan) => { plan.buildCampaign.cmakeOptions.pop(); },
    (plan) => { plan.buildCampaign.cmakeOptions[7] = "OB_BUILD_USB_PAL=OFF"; },
    (plan) => { plan.buildCampaign.cmakeOptions[8] = "OB_BUILD_NET_PAL=ON"; },
    (plan) => { plan.buildCampaign.validCleanOfflineBuildsPerTarget = 19; },
    (plan) => { plan.buildCampaign.requiredCleanOfflineBuildCount = 59; },
    (plan) => { plan.buildCampaign.maximumOfflineBuildNetworkAttempts = 1; },
    (plan) => { plan.buildCampaign.contentAddressedSourceAndDependencyMirrorRequired = false; },
    (plan) => { plan.buildCampaign.compilerWarningsAndFailuresRemainVisible = false; },
    (plan) => { plan.buildCampaign.maximumUnexplainedInstalledManifestMismatches = 1; },
    (plan) => { plan.buildCampaign.vendorPrebuiltAssetMayRescueNativeBuildFailure = true; },
    (plan) => { plan.buildCampaign.oneTargetOrArchitectureMayRescueAnother = true; },
    (plan) => { plan.buildCampaign.failedOrInterruptedBuildMayBeSilentlyReplaced = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("preserves received-device, passive-mode, firmware, and I-045 boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.deviceConfiguration.requiredModel = "Gemini 335L"; },
    (plan) => { plan.deviceConfiguration.requiredFirmwareVersion = "latest"; },
    (plan) => { plan.deviceConfiguration.receivedPrivateSerialDigestSha256 = "a".repeat(64); },
    (plan) => { plan.deviceConfiguration.receivedCalibrationSha256 = "b".repeat(64); },
    (plan) => { plan.deviceConfiguration.exactPassivePresetAndFilterSha256 = "c".repeat(64); },
    (plan) => { plan.deviceConfiguration.blockingModeId = plan.deviceConfiguration.conditionalModeId; },
    (plan) => { plan.deviceConfiguration.emitterDefaultOff = false; },
    (plan) => { plan.deviceConfiguration.activeModeRequiresI045ReadyResult = false; },
    (plan) => { plan.deviceConfiguration.onlineFirmwareUpdateAllowed = true; },
    (plan) => { plan.deviceConfiguration.firmwareDowngradeAllowed = true; },
    (plan) => { plan.deviceConfiguration.firmwareWriteInterruptionMayBeInduced = true; },
    (plan) => { plan.deviceConfiguration.firmwareUpdateOrRecoveryClaimed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("requires 360 runtime runs and nine one-hour soaks without hidden replacement", async () => {
  assert.deepEqual(tracked.runtimeCampaign.phaseIds, [...ORBBEC_RUNTIME_PHASES]);
  for (const mutate of [
    (plan) => { plan.runtimeCampaign.targetIds.pop(); },
    (plan) => { plan.runtimeCampaign.phaseIds.pop(); },
    (plan) => { plan.runtimeCampaign.validRunsPerTargetPhase = 19; },
    (plan) => { plan.runtimeCampaign.requiredRuntimeRunCount = 359; },
    (plan) => { plan.runtimeCampaign.validOneHourSoaksPerTarget = 2; },
    (plan) => { plan.runtimeCampaign.minimumMeasuredSecondsPerSoak = 3599; },
    (plan) => { plan.runtimeCampaign.requiredSoakRunCount = 8; },
    (plan) => { plan.runtimeCampaign.sameReceivedDeviceRequiredAcrossTargets = false; },
    (plan) => { plan.runtimeCampaign.unprivilegedRuntimeRequired = false; },
    (plan) => { plan.runtimeCampaign.sudoOrRootRuntimeMayPass = true; },
    (plan) => { plan.runtimeCampaign.dropsDuplicatesCorruptionOrderingSpeedDowngradesRetriesAndInvalidRunsRemainVisible = false; },
    (plan) => { plan.runtimeCampaign.failedInvalidOrInterruptedRunMayBeSilentlyReplaced = true; },
    (plan) => { plan.runtimeCampaign.oneTargetPhaseOrSoakMayRescueAnother = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("requires all 480 non-destructive recovery cycles and refuses firmware interruption", async () => {
  assert.deepEqual(tracked.recoveryCampaign.faultIds, [...ORBBEC_RECOVERY_FAULTS]);
  for (const mutate of [
    (plan) => { plan.recoveryCampaign.faultIds.pop(); },
    (plan) => { plan.recoveryCampaign.validRecoveryCyclesPerTargetFaultCell = 19; },
    (plan) => { plan.recoveryCampaign.requiredTargetFaultCellCount = 23; },
    (plan) => { plan.recoveryCampaign.requiredRecoveryCycleCount = 479; },
    (plan) => { plan.recoveryCampaign.faultDetectionFailClosedStaleFrameRejectionAndHealthyReturnRequired = false; },
    (plan) => { plan.recoveryCampaign.manualRootNetworkFirmwareAndPowerInterventionMustBeRecorded = false; },
    (plan) => { plan.recoveryCampaign.firmwareRecoveryModeQualificationRequiredForFirmwareUpdateClaim = false; },
    (plan) => { plan.recoveryCampaign.firmwareRecoveryModeQualificationCompleted = true; },
    (plan) => { plan.recoveryCampaign.deliberateFirmwareWriteInterruptionAllowed = true; },
    (plan) => { plan.recoveryCampaign.automaticRetryMayHideFailure = true; },
    (plan) => { plan.recoveryCampaign.oneFaultTargetOrLaterSuccessMayRescueFailure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
});

test("rejects weakened gates, invented thresholds, unsafe data, premature results, or purchase", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.maximumLiveExposureToActionP95Us = 120001; },
    (plan) => { plan.fixedAcceptance.maximumRuntimeNetworkAttempts = 1; },
    (plan) => { plan.fixedAcceptance.maximumRootRuntimeProcesses = 1; },
    (plan) => { plan.fixedAcceptance.vendorSpecsPriceAvailabilityOrPlatformListMayQualify = true; },
    (plan) => { plan.fixedAcceptance.activeEmitterResultMayRescuePassiveTargetOrSafetyFailure = true; },
    (plan) => { plan.fixedAcceptance.i043MayEstablishMaterialDepthBenefitSelectionOrBomMutation = true; },
    (plan) => { plan.openAcceptance.minimumRgbFpsMilliFps = 30000; },
    (plan) => { plan.openAcceptance.maximumDeliveredCostUsdCents = 50000; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeFirstReleaseArtifactOrFirmwareDownloadTargetBuildDeviceOperationOrRun = false; },
    (plan) => { plan.costBoundary.requiredDeliveredCostRoles.pop(); },
    (plan) => { plan.costBoundary.deliveredCostUsdCents = 35900; },
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
    (plan) => { plan.result.orbbecSelected = true; },
    (plan) => { plan.result.purchaseRecommended = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(plan));
  }
  assert.deepEqual(tracked.executionGate.blockerCodes, [...ORBBEC_BLOCKERS]);
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.orbbecSelected = false;
  await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(extra), /fields drifted/u);
  const nested = clone(); nested.candidateSnapshot.cameraReady = false;
  await assert.rejects(validateOrbbecGemini335lLinuxTargetPlan(nested));
  await assert.rejects(
    parseOrbbecGemini335lLinuxTargetPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace(
    '  "status": "blocked",',
    '  "status": "blocked",\n  "status": "blocked",',
  )}\n`);
  await assert.rejects(parseOrbbecGemini335lLinuxTargetPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseOrbbecGemini335lLinuxTargetPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseOrbbecGemini335lLinuxTargetPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseOrbbecGemini335lLinuxTargetPlanBytes(Buffer.alloc(192 * 1024 + 1)),
    /exceeds/u,
  );
});
