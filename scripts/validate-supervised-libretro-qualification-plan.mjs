import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/libretro/supervised-libretro-frontend-qualification-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const SUPERVISED_LIBRETRO_FORMAT =
  "vcg-supervised-libretro-frontend-qualification-plan/v1";

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "prerequisiteGate",
  "frontendRoles", "targetRoles", "workloadRoles", "lifecycleScenarioIds",
  "lifecycleMatrix", "controllerActionIds", "controllerMatrix", "measurements",
  "fixedAcceptance", "openAcceptance", "packageAndRightsPolicy",
  "saveAndLifecyclePolicy", "decisionProtocol", "authorityBoundary", "dataPolicy",
  "executionGate", "result",
];

const sourceDefinitions = [
  ["signed-package-libretro-rights-controller-and-product-decisions", "docs/DECISIONS.md"],
  ["implemented-supervised-retroarch-boundary-and-remaining-gates", "docs/RETROARCH_INTEGRATION.md"],
  ["starter-title-rights-and-artifact-candidate-screen", "docs/RETRO_STARTER_CATALOG_CANDIDATE_SCREEN_2026-07-24.md"],
  ["closed-zero-admission-starter-title-candidate-evidence", "compliance/retro-starter-candidates/candidate-screen-v1.json"],
  ["unverified-uninstalled-retro-2048-candidate-manifest", "catalog/retro-2048.vcg-game.json"],
  ["closed-libretro-manifest-runtime-and-cross-field-contract", "packages/game-manifest/src/index.ts"],
  ["per-game-profile-save-state-reset-and-removal-boundary", "docs/GAME_SAVE_LIFECYCLE.md"],
  ["canonical-controller-mapping-and-ambiguity-boundary", "docs/CONTROLLER_MAPPING_CONTRACT.md"],
  ["unstealable-home-back-focus-and-forced-exit-boundary", "benchmarks/reserved-home/reserved-home-action-plan-v1.json"],
  ["runtime-neutral-signed-local-package-lifecycle-boundary", "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json"],
  ["native-trust-loading-containment-retry-and-return-boundary", "docs/GAME_TRUST_TIERS.md"],
  ["retro-display-latency-accessibility-and-baseline-feature-policy", "docs/RETRO_DISPLAY_LATENCY_ACCESSIBILITY_POLICY.md"],
  ["launch-controller-offline-recovery-and-latency-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["cross-tier-cold-boot-controller-only-usability-boundary", "benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json"],
];

export const SUPERVISED_LIBRETRO_FRONTEND_IDS = Object.freeze([
  "primary-retroarch-required",
  "fallback-libretro-frontend-required",
]);

export const SUPERVISED_LIBRETRO_TARGET_IDS = Object.freeze([
  "ordinary-x86-64-linux-required",
  "pi5-lower-cost-aarch64-required",
]);

export const SUPERVISED_LIBRETRO_WORKLOAD_IDS = Object.freeze([
  "rights-cleared-starter-title-required",
  "managed-content-conformance-fixture-required",
]);

export const SUPERVISED_LIBRETRO_SCENARIO_IDS = Object.freeze([
  "reproducible-signed-frontend-core-title-and-config-package-install",
  "cold-launch-branded-loading-exact-readiness-and-usable-input",
  "one-action-start-core-or-content-without-frontend-menu-detour",
  "controller-discovery-curated-default-glyph-and-player-assignment",
  "reserved-home-system-overlay-pause-and-exact-resume",
  "reserved-back-exit-confirmation-cleanup-and-branded-return",
  "save-write-clean-exit-restart-and-exact-restore",
  "save-state-create-load-version-binding-and-corruption-refusal",
  "approved-per-game-core-controller-and-accessibility-override",
  "family-mode-menu-settings-core-content-and-filesystem-containment",
  "offline-updater-achievement-command-interface-and-network-denial",
  "audio-video-sync-latency-frame-pacing-and-baseline-feature-state",
  "compositor-focus-fullscreen-window-descendant-and-desktop-containment",
  "runtime-crash-detection-descendant-cleanup-and-branded-return",
  "runtime-hang-readiness-loss-forced-cleanup-and-branded-return",
  "signed-update-health-save-preservation-and-generation-switch",
  "rollback-health-save-state-compatibility-and-last-known-good",
  "uninstall-save-disposition-no-leftovers-and-clean-reinstall",
  "suspend-resume-audio-video-input-focus-save-and-runtime-continuity",
  "missing-tampered-incompatible-frontend-core-content-bios-or-config-refusal",
]);

export const SUPERVISED_LIBRETRO_ACTION_IDS = Object.freeze([
  "retropad-dpad-up", "retropad-dpad-down", "retropad-dpad-left",
  "retropad-dpad-right", "retropad-face-south", "retropad-face-east",
  "retropad-face-west", "retropad-face-north", "retropad-left-shoulder",
  "retropad-right-shoulder", "retropad-left-trigger", "retropad-right-trigger",
  "retropad-left-stick-press", "retropad-right-stick-press", "retropad-select",
  "retropad-start", "system-home", "system-back", "system-pause",
  "system-resume", "system-exit-confirm",
]);

const metricIds = [
  "package-source-revision-license-signature-artifact-readback-and-reproducibility",
  "title-code-content-asset-trademark-attribution-age-and-update-owner-closure",
  "frontend-core-content-bios-base-config-and-controller-profile-identity",
  "process-descendant-cgroup-window-focus-fullscreen-compositor-and-cleanup-state",
  "controller-source-canonical-action-recipient-epoch-glyph-and-player-assignment",
  "reserved-home-back-pause-resume-exit-revocation-and-frontend-nondelivery",
  "loading-first-frame-exact-readiness-visible-focused-usable-input-and-return",
  "video-frame-time-frame-pacing-resolution-refresh-drops-tears-and-latency",
  "audio-device-format-underrun-volume-latency-and-audio-video-sync",
  "cpu-gpu-memory-storage-write-amplification-power-thermal-and-acoustic-state",
  "network-attempt-updater-achievement-command-interface-and-offline-state",
  "save-state-remap-core-option-screenshot-cache-history-and-profile-isolation",
  "update-rollback-uninstall-reinstall-generation-health-and-leftover-state",
  "fault-detection-classification-details-cleanup-retry-exit-and-recovery",
  "failed-invalid-interrupted-retried-rolled-back-and-pre-repair-adverse-ledger",
];

const openKeys = [
  "maximumControllerToVisibleResponseP95Us",
  "maximumVideoInputToPhotonP95Us",
  "maximumAudioOutputLatencyP95Us",
  "maximumAbsoluteAudioVideoSyncErrorP95Us",
  "maximumFrameTimeP95Us",
  "maximumFramePacingErrorP95Us",
  "minimumSustainedFpsMilliFps",
  "maximumDroppedOrRepeatedFrameRatePpm",
  "maximumCpuUtilizationPpm",
  "maximumGpuUtilizationPpm",
  "maximumResidentMemoryBytes",
  "maximumTargetWallPowerMilliW",
  "maximumRecoveryToLauncherP95AndWorstMsByFault",
  "maximumSuspendResumeToUsableInputP95AndWorstMs",
  "maximumSaveStateCreateLoadAndRestoreP95Ms",
  "minimumDistinctPhysicalControllerSamplesPerTargetAndFrontend",
  "exactReadinessLivenessCleanupAndWindowQualificationPolicySha256",
  "exactPerGameOverrideCompatibilityWarningAndFamilyModePolicySha256",
  "exactSaveStateUpdateRollbackUninstallRetentionAndCompatibilityPolicySha256",
  "exactIssueSeverityTriageClosureRetestExpiryAndRegressionPolicySha256",
];

export const SUPERVISED_LIBRETRO_BLOCKERS = Object.freeze([
  "I123-001-exact-primary-retroarch-source-version-license-build-package-signature-and-artifact-closure",
  "I123-002-selected-fallback-frontend-source-version-license-build-package-signature-and-artifact-closure",
  "I123-003-rights-cleared-starter-title-code-content-asset-trademark-attribution-age-and-maintenance-closure",
  "I123-004-managed-content-conformance-fixture-rights-core-content-bios-and-package-closure",
  "I123-005-exact-x86-64-and-aarch64-target-os-compositor-sdl-audio-video-storage-and-power-manifests",
  "I123-006-qualified-readiness-liveness-window-focus-descendant-cgroup-cleanup-and-no-desktop-adapters",
  "I123-007-curated-controller-profile-player-assignment-glyph-reserved-action-and-physical-sample-manifests",
  "I123-008-exact-package-signing-anti-rollback-immutable-verification-to-use-update-and-health-protocol",
  "I123-009-exact-save-state-remap-override-update-rollback-uninstall-reinstall-and-retention-protocol",
  "I123-010-exact-audio-video-latency-sync-frame-pacing-accessibility-and-baseline-feature-protocol",
  "I123-011-exact-network-filesystem-family-mode-menu-command-interface-and-source-media-containment-protocol",
  "I123-012-complete-lifecycle-controller-fault-suspend-measurement-invalid-cycle-and-independent-oracle-protocol",
  "I123-013-frozen-performance-controller-recovery-compatibility-retention-and-issue-acceptance-gates",
  "I123-014-exact-target-controller-display-audio-network-power-storage-fault-instrument-operator-and-schedule-authority",
  "I123-015-closed-path-free-data-redaction-retention-deletion-incident-and-independent-review-policy",
  "I123-016-owner-rights-trademark-security-accessibility-release-catalog-and-product-decision-boundary",
]);

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
    assert.ok(relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

function validateFrontends(frontends) {
  assert.deepEqual(frontends, [
    {
      frontendRoleId: "primary-retroarch-required",
      frontendId: "retroarch",
      selectionRole: "selected-primary-by-D-096",
      exactVersionSourceRevisionLicensePackageAndArtifactManifestSha256: null,
      exactQualifiedReadinessLivenessWindowAndCleanupAdapterSha256: null,
      mustQualifyIndependentlyOnEveryTargetAndWorkload: true,
      selectedBuiltInstalledQualifiedAndAuthorized: false,
    },
    {
      frontendRoleId: "fallback-libretro-frontend-required",
      frontendId: null,
      selectionRole: "unselected-fallback-required-by-I-123",
      exactVersionSourceRevisionLicensePackageAndArtifactManifestSha256: null,
      exactQualifiedReadinessLivenessWindowAndCleanupAdapterSha256: null,
      mustQualifyIndependentlyOnEveryTargetAndWorkload: true,
      selectedBuiltInstalledQualifiedAndAuthorized: false,
    },
  ]);
}

function validateTargets(targets) {
  assert.deepEqual(targets, [
    {
      targetId: "ordinary-x86-64-linux-required", architecture: "x86_64",
      productRole: "required-premium-reference",
      exactHardwareFirmwareOsCompositorSdlAudioVideoStorageAndPowerManifestSha256: null,
      exactControllerDisplayNetworkAndInstrumentationManifestSha256: null,
      receivedInventoriedQualifiedAndAuthorized: false,
    },
    {
      targetId: "pi5-lower-cost-aarch64-required", architecture: "aarch64",
      productRole: "required-lower-cost-reference",
      exactHardwareFirmwareOsCompositorSdlAudioVideoStorageAndPowerManifestSha256: null,
      exactControllerDisplayNetworkAndInstrumentationManifestSha256: null,
      receivedInventoriedQualifiedAndAuthorized: false,
    },
  ]);
}

function validateWorkloads(workloads) {
  assert.deepEqual(workloads, [
    {
      workloadRoleId: "rights-cleared-starter-title-required",
      catalogRole: "candidate-public-starter-title",
      contentMode: "selected-title-defined-contentless-or-managed-content",
      exactTitleCoreContentBiosRightsTrademarkAttributionPackageAndArtifactManifestSha256: null,
      retro2048OrAnyScreenedCandidateMayQualifyWithoutCompleteIndependentClosure: false,
      mustQualifyOnEveryFrontendAndTarget: true,
      selectedBuiltInstalledQualifiedAndAuthorized: false,
    },
    {
      workloadRoleId: "managed-content-conformance-fixture-required",
      catalogRole: "hidden-developer-qualification-fixture-only",
      contentMode: "console-managed-content-required",
      exactTitleCoreContentBiosRightsAttributionPackageAndArtifactManifestSha256: null,
      retro2048OrAnyScreenedCandidateMayQualifyWithoutCompleteIndependentClosure: false,
      mustQualifyOnEveryFrontendAndTarget: true,
      selectedBuiltInstalledQualifiedAndAuthorized: false,
    },
  ]);
}

export async function validateSupervisedLibretroQualificationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, SUPERVISED_LIBRETRO_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-supervised-libretro-frontend-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26T23:59:59.000Z");
  assert.match(plan.qualificationScope, /I-122, I-123 and I-198/u);
  assert.match(plan.claimBoundary, /No artifact download/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.prerequisiteGate, {
    exactRetroArchFrontendCoreBaseConfigAndPackageManifestSha256: null,
    exactFallbackFrontendCoreBaseConfigAndPackageManifestSha256: null,
    exactRightsClearedStarterTitleRightsArtifactAndPackageManifestSha256: null,
    exactManagedContentConformanceFixtureRightsArtifactAndPackageManifestSha256: null,
    completeSignedLocalPackageQualificationResultSha256: null,
    completeControllerReservedActionKioskAndTargetQualificationResultsSha256: null,
    completeSaveUpdateRollbackUninstallAndCleanupProtocolsSha256: null,
    exactTargetDisplayAudioControllerNetworkPowerAndInstrumentationManifestSha256: null,
    currentlyScreenedCandidateMayOpenExecutionOrCountAsRightsApproval: false,
    manifestNativeUnitDesktopOrSyntheticEvidenceMayQualifyTargetBehavior: false,
    oneFrontendTargetWorkloadScenarioOrBestCaseMayOpenOrQualifyAnother: false,
    executionOpened: false,
  });
  validateFrontends(plan.frontendRoles);
  validateTargets(plan.targetRoles);
  validateWorkloads(plan.workloadRoles);
  assert.deepEqual(plan.lifecycleScenarioIds, SUPERVISED_LIBRETRO_SCENARIO_IDS);
  assert.deepEqual(plan.lifecycleMatrix, {
    frontendRoleIds: SUPERVISED_LIBRETRO_FRONTEND_IDS,
    targetIds: SUPERVISED_LIBRETRO_TARGET_IDS,
    workloadRoleIds: SUPERVISED_LIBRETRO_WORKLOAD_IDS,
    scenarioCount: 20,
    requiredFrontendTargetWorkloadScenarioCellCount: 160,
    validCyclesPerCell: 20,
    requiredLifecycleCycleCount: 3200,
    everyCycleRequiresIndependentPackageProcessDescendantWindowInputAudioVideoNetworkStorageAndClockOracles: true,
    failedInvalidInterruptedRetriedRolledBackAndPreRepairEvidenceMustRemainVisible: true,
    oneFrontendTargetWorkloadScenarioCycleOrAggregateMayRescueFailure: false,
  });
  assert.deepEqual(plan.controllerActionIds, SUPERVISED_LIBRETRO_ACTION_IDS);
  assert.deepEqual(plan.controllerMatrix, {
    frontendCount: 2, targetCount: 2, workloadCount: 2, actionCount: 21,
    requiredFrontendTargetWorkloadActionCellCount: 168,
    validTrialsPerCell: 20,
    requiredControllerActionTrialCount: 3360,
    everyTrialRequiresPhysicalSourceCanonicalMappingRecipientGameAndSystemEventOracles: true,
    supportedStandardsConformantControllersRequireZeroManualMapping: true,
    systemHomeBackPauseResumeAndExitMustNeverReachTheFrontendCoreOrContent: true,
    oneControllerActionFrontendTargetWorkloadOrAggregateMayRescueFailure: false,
  });
  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentPackageProcessWindowInputAudioVideoNetworkStoragePowerAndClockOraclesRequired: true,
    frontendSelfReportProcessStartFirstFrameHeartbeatOrWindowExistenceMayEstablishReadiness: false,
    configurationTextOrDisabledMenuEntryMayEstablishSandboxNetworkOrFilesystemContainment: false,
    everyAttemptFailureRetryRollbackOverrideAndDataDispositionMustRemainVisible: true,
  });
  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidLifecycleCyclesPerFrontendTargetWorkloadScenarioCell: 20,
    minimumValidControllerTrialsPerFrontendTargetWorkloadActionCell: 20,
    maximumMissingRequiredLifecycleOrControllerCells: 0,
    maximumFailedRequiredLifecycleCyclesOrControllerTrials: 0,
    maximumUnsignedUnhashedUnlicensedUnreviewedOrNonreproducibleArtifacts: 0,
    maximumUnexpectedNetworkUpdaterAchievementTelemetryOrCommandInterfaceAttempts: 0,
    maximumDesktopShellFilesystemSourceMediaRawMenuOrArbitraryCoreContentExposureEvents: 0,
    maximumEscapedUnreapedOrUnaccountedFrontendCoreContentOrDescendantProcesses: 0,
    maximumCrossGameCrossProfilePackageContentSaveStateRemapCacheOrLogAccessEvents: 0,
    maximumSaveOrStateLossCorruptionRollbackRegressionOrWrongGenerationEvents: 0,
    maximumMissedDuplicatedStuckWrongRecipientWrongPlayerOrWrongMappedControllerActions: 0,
    maximumSystemHomeBackPauseResumeOrExitEventsDeliveredToFrontendCoreOrContent: 0,
    maximumKeyboardMouseShellOperatorHiddenSetupManualCoreSelectionOrManualMappingRecoveries: 0,
    maximumFalseReadyHealthySavedRecoveredUpdatedRolledBackUninstalledOrSuccessClaims: 0,
    maximumVisibleFeedbackMs: 250,
    maximumLocalLaunchToVisibleFocusedUsableInputMs: 15000,
    usableInputRequiresVisibleFocusedResponsiveIntendedControllerAndCorrectRecipient: true,
    processStartFirstFrameWindowHeartbeatOrFrontendSelfReportMayEstablishUsableInput: false,
    baselineShadersRunAheadPreemptiveFramesRewindFrameDelayHardGpuSyncAndThreadedVideoMustRemainDisabled: true,
    familyModeMustExposeOnlyTheCuratedGameAndSystemOwnedSurfaces: true,
    allOpenPerformanceControllerRecoveryCompatibilityAndRetentionGatesFrozenBeforeExecution: true,
    frontendTargetWorkloadScenarioControllerOrAggregatePassMayRescueFailure: false,
  });
  exactKeys(plan.openAcceptance, openKeys, "openAcceptance");
  for (const key of openKeys) assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  assert.deepEqual(plan.packageAndRightsPolicy, {
    exactSignedFrontendCoreBaseConfigTitleContentBiosAndControllerProfilePackagesRequired: true,
    exactSourceRevisionArtifactHashArchitectureLicenseAndCorrespondingSourceRequired: true,
    titleCodeContentAssetTrademarkAttributionAgeAndMaintenanceReviewRequired: true,
    frontendCoreContentBiosAndBaseConfigReadBackBeforeEveryLaunchRequired: true,
    artifactFilenameVersionFamilyOrCandidateLabelMaySubstituteForDigestIdentity: false,
    currentlyUnverifiedRetro2048ManifestOrZeroAdmissionScreenMayBecomeLaunchAuthority: false,
    networkDownloadCoreUpdaterContentScannerOrRuntimePackageMutationAllowedDuringQualification: false,
    passingDeveloperFixtureMayCountAsAStarterCatalogTitle: false,
  });
  assert.deepEqual(plan.saveAndLifecyclePolicy, {
    opaqueRegisteredProfileIdAndExactGamePackageGenerationBindingRequired: true,
    saveStateRemapCoreOptionScreenshotSystemCacheLogAndRuntimeNamespacesMustRemainSeparate: true,
    healthyUpdateAndRollbackMustPreserveCompatibleSavesAndDeclareStateCompatibility: true,
    uninstallRequiresControllerConfirmedSaveDispositionAndNoUnexplainedLeftovers: true,
    factoryResetProfileDeletionPackageRemovalAndGameUninstallScopesMustRemainDistinct: true,
    displayNamePortraitBodyDataIdentitySecretPathOrFreeTextMayEnterSaveLifecycleEvidence: false,
    successfulRestoreUpdateRollbackOrReinstallMayHidePriorFailureOrLoss: false,
  });
  assert.deepEqual(plan.decisionProtocol, {
    completeRetroArchCrossTierResultSha256: null,
    completeFallbackFrontendCrossTierResultSha256: null,
    completeStarterTitleRightsPackageAndCrossTierResultSha256: null,
    completeManagedContentFixtureCrossTierResultSha256: null,
    completeIndependentSecurityAccessibilityAndReleaseReviewSha256: null,
    fallbackFrontendId: null,
    starterTitleId: null,
    frontendQualificationDisposition: null,
    starterCatalogDisposition: null,
    productCatalogPackageControllerOrSupportMutation: null,
    primaryFrontendPassMayEliminateOrQualifyTheFallbackLane: false,
    technicalPassAutomaticallyApprovesRightsDistributionCatalogOrProductSupport: false,
    selectionRequiresEveryRequiredCellPassingAndSeparateOwnerRightsSecurityAndReleaseReview: true,
  });
  assert.deepEqual(plan.authorityBoundary, {
    exactArtifactBuildSigningInstallTargetControllerFaultAndMeasurementManifestSha256: null,
    exactRightsTrademarkAttributionAgeMaintenanceAndReleaseReviewProtocolSha256: null,
    exactSaveUpdateRollbackUninstallCleanupRetentionAndIncidentProtocolSha256: null,
    artifactDownloadSourceCheckoutBuildSigningInstallOrPackageMutationAuthorized: false,
    titleFrontendCoreContentBiosControllerProfileOrFallbackSelectionAuthorized: false,
    targetControllerDisplayAudioNetworkPowerSuspendOrFaultOperationAuthorized: false,
    profileSaveStateRemapContentPackageOrPersistentDataMutationAuthorized: false,
    rightsTrademarkLegalSecurityAccessibilityOrReleaseApprovalAuthorized: false,
    catalogAdmissionPublicationDistributionCompatibilityOrProductMutationAuthorized: false,
  });
  assert.deepEqual(plan.dataPolicy, {
    opaqueFrontendTargetWorkloadScenarioCycleActionControllerProfileIssueAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCategoriesAndDispositionCodesRequired: true,
    rawRomContentBiosSaveStateSaveRemapScreenshotAudioVideoOrMemoryBytesAllowed: false,
    filesystemPathsUsernamesHostnamesEnvironmentCommandsArgumentsOrProcessIdsAllowed: false,
    profileDisplayNamesPortraitsBodyDataIdentitySecretsCredentialsTokensOrStableIdentifiersAllowed: false,
    rawControllerHidUsbBluetoothPayloadSerialMacOrStableDeviceIdentifiersAllowed: false,
    freeTextFrontendCoreGameDriverCompositorServiceCrashParticipantOrOperatorLogsAllowed: false,
    failedInvalidInterruptedRetriedRolledBackAdverseAndPreRepairEvidenceMustRemainVisible: true,
  });
  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, SUPERVISED_LIBRETRO_BLOCKERS);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseSupervisedLibretroQualificationPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "supervised Libretro qualification plan");
  const plan = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical two-space JSON with one trailing newline");
  return validateSupervisedLibretroQualificationPlan(plan, repositoryRoot);
}

export async function readSupervisedLibretroQualificationPlan(path = trackedPath) {
  return parseSupervisedLibretroQualificationPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readSupervisedLibretroQualificationPlan();
  console.log(`Supervised Libretro qualification plan valid: ${plan.lifecycleMatrix.requiredLifecycleCycleCount} lifecycle cycles, ${plan.controllerMatrix.requiredControllerActionTrialCount} controller trials, ${plan.executionGate.blockerCodes.length} blockers.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
