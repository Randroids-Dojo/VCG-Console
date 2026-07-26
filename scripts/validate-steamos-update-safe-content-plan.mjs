import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAMOS_CONTENT_PLAN_FORMAT =
  "vcg-steamos-update-safe-content-plan/v1";
export const STEAMOS_CONTENT_CANDIDATES = Object.freeze([
  ["flatpak-writable-content", "flatpak"],
  ["self-contained-steam-runtime-content", "steam-runtime-content"],
]);
export const STEAMOS_CONTENT_COMPONENTS = Object.freeze([
  "launcher",
  "embedded-browser",
  "tracker",
  "motion-api",
]);
export const STEAMOS_CONTENT_SCENARIOS = Object.freeze([
  "clean-reproducible-build",
  "install-from-supported-writable-storage",
  "launch-without-steam-account-or-identity",
  "launcher-browser-tracker-motion-ready",
  "controller-only-launch-navigation-and-exit",
  "reserved-home-back-pause-under-capture",
  "local-package-and-offline-restart",
  "simultaneous-game-tracker-motion-workload",
  "camera-denied-unavailable-and-recovery",
  "component-crash-and-bounded-restart",
  "sleep-resume-and-input-epoch-reset",
  "steamos-update-survival",
  "content-update-health-failure-and-rollback",
  "interrupted-content-update-recovery",
  "uninstall-preserve-or-delete-data-choice",
  "recovery-reimage-and-supported-reinstallation-disposition",
]);
export const STEAMOS_CONTENT_METRICS = Object.freeze([
  "exact-target-os-kernel-driver-gamescope-package-runtime-and-component-digests",
  "clean-build-artifact-sbom-license-signature-and-dependency-closure",
  "read-only-root-and-supported-writable-root-before-after-snapshots",
  "install-launch-ready-resume-recovery-update-rollback-uninstall-and-reinstall-timing",
  "launcher-browser-tracker-motion-process-tree-and-component-health",
  "controller-focus-glyph-navigation-back-home-pause-exit-and-input-epoch",
  "motion-schema-negotiation-frame-health-action-order-and-delivery-overhead",
  "network-ipc-filesystem-device-camera-microphone-gpu-audio-and-display-access",
  "offline-accountless-steam-identity-and-steam-only-feature-boundary",
  "sleep-resume-os-update-content-update-interruption-and-reimage-disposition",
  "profile-save-cache-log-diagnostic-and-package-data-root-integrity",
  "game-fps-frame-time-cpu-gpu-memory-storage-network-and-log-growth",
  "crash-hang-restart-descendant-reap-and-responsive-launcher-recovery",
  "failed-invalid-stopped-retried-adverse-and-worst-case-cycle-ledger",
]);
export const STEAMOS_CONTENT_BLOCKERS = Object.freeze([
  "suc-001-exact-received-steamos-target-image-kernel-driver-gamescope-and-writable-root",
  "suc-002-predeclared-candidate-comparison-and-selection-rule",
  "suc-003-exact-source-toolchain-reproducible-build-sbom-rights-and-signing-policy",
  "suc-004-flatpak-manifest-runtime-dependency-sandbox-and-update-policy",
  "suc-005-self-contained-steam-runtime-content-manifest-dependency-sandbox-and-update-policy",
  "suc-006-supported-install-launch-accountless-offline-and-steam-feature-separation-protocol",
  "suc-007-launcher-browser-tracker-motion-supervisor-process-and-readiness-policy",
  "suc-008-i167-camera-permission-plus-controller-and-reserved-action-qualification",
  "suc-009-network-ipc-filesystem-device-and-root-snapshot-oracles",
  "suc-010-profile-save-cache-log-diagnostic-and-data-disposition-policy",
  "suc-011-suspend-os-update-content-update-rollback-recovery-reimage-and-reinstall-protocol",
  "suc-012-workload-schedule-independent-oracles-and-all-numeric-gates",
  "suc-013-data-rights-privacy-retention-deletion-incident-and-adverse-evidence-policy",
  "suc-014-build-target-install-account-camera-update-recovery-qualification-and-publication-authority",
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
  "targetContract",
  "authorityBoundary",
  "candidatePackages",
  "lifecycleMatrix",
  "packageRequirements",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["steam-machine-feasibility-boundary", "docs/STEAM_MACHINE_2026.md"],
  ["current-reference-and-optional-target-policy", "docs/RESEARCH.md"],
  [
    "runtime-neutral-signed-package-campaign",
    "docs/SIGNED_LOCAL_PACKAGE_PIPELINE_PLAN_2026-07-26.md",
  ],
  [
    "runtime-neutral-signed-package-plan",
    "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
  ],
  ["native-package-process-boundary", "docs/NATIVE_PACKAGE_RUNTIME.md"],
  ["embedded-browser-supervision-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
  ["motion-api-browser-bridge-boundary", "docs/MOTION_WEB_BRIDGE.md"],
  ["console-operating-mode-boundary", "docs/CONSOLE_OPERATING_MODES.md"],
  ["online-offline-service-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["controller-input-boundary", "docs/CONTROLLER_INPUT.md"],
  ["television-compatibility-boundary", "docs/TV_COMPATIBILITY_CONTRACT.md"],
  ["prototype-gate-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["protected-package-generation-boundary", "docs/PACKAGE_GENERATION_STORE.md"],
  ["save-and-writable-data-boundary", "docs/GAME_SAVE_LIFECYCLE.md"],
];
const targetKeys = [
  "targetClassId",
  "exactReceivedHardwareAndInventorySha256",
  "steamOsImageKernelDriverAndGamescopeSha256",
  "supportedWritableApplicationRootSha256",
  "readOnlyRootBaselineSnapshotSha256",
  "osUpdateAndRecoveryFixtureSha256",
  "steamAccountOrIdentityRequiredForCorePackage",
  "steamMachineMayReplaceRequiredReferenceTargets",
  "deskWindowsOrdinaryLinuxOrPiEvidenceMayQualify",
];
const authorityNullKeys = [
  "selectedCandidateId",
  "sourceRevisionSha256",
  "reproducibleBuildToolchainSha256",
  "packageSigningAndDelegationPolicySha256",
  "flatpakManifestRuntimeAndSandboxPolicySha256",
  "steamRuntimeContentManifestAndSandboxPolicySha256",
  "supportedInstallLaunchAndAccountlessProtocolSha256",
  "componentSupervisorAndProcessOwnershipPolicySha256",
  "browserTrackerAndMotionIntegrationPolicySha256",
  "cameraAndPermissionQualificationResultSha256",
  "controllerAndReservedActionQualificationResultSha256",
  "networkIpcDeviceAndFilesystemPolicySha256",
  "writableDataProfileSaveAndCachePolicySha256",
  "steamOsUpdateSuspendRecoveryAndReimageProtocolSha256",
  "workloadScheduleOracleAndNumericGateProtocolSha256",
  "dataRightsPrivacyRetentionDeletionAndIncidentProtocolSha256",
];
const authorityFalseKeys = [
  "buildAuthorized",
  "targetOperationAuthorized",
  "installOrUninstallMutationAuthorized",
  "accountOrServiceInteractionAuthorized",
  "cameraControllerOrRemoteOperationAuthorized",
  "osUpdateSuspendRecoveryOrReimageAuthorized",
  "qualificationSelectionOrPublicationAuthorized",
];
const candidateKeys = [
  "candidateId",
  "artifactClass",
  "manifestSha256",
  "runtimeAndDependencyClosureSha256",
  "buildRecipeSha256",
  "artifactSha256",
  "targetResultSha256",
  "usesOnlySupportedWritableApplicationStorage",
  "readOnlyRootModificationAllowed",
  "candidateMayBeSelectedFromDeskEvidence",
  "failedCandidateEvidenceMayBeDiscarded",
];
const openAcceptanceKeys = [
  "maximumArtifactBytesByCandidate",
  "maximumExpandedBytesByCandidate",
  "maximumInstallP95Ms",
  "maximumComponentReadyP95Ms",
  "maximumComponentRecoveryP95Ms",
  "maximumContentUpdateP95Ms",
  "maximumRollbackP95Ms",
  "maximumUninstallP95Ms",
  "maximumSupportedReinstallP95Ms",
  "maximumMotionDeliveryOverheadP95Us",
  "minimumConcurrentGameFrameRateMilliHz",
  "maximumConcurrentGameFrameTimeP95Us",
  "maximumCpuPpm",
  "maximumGpuPpm",
  "maximumResidentMemoryBytes",
  "maximumPersistentStorageGrowthBytesPerHour",
  "maximumLogGrowthBytesPerHour",
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

export async function validateSteamOsUpdateSafeContentPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAMOS_CONTENT_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "steamos-update-safe-content-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-166"]);
  for (const phrase of [
    "strict zero-result qualification plan",
    "do not prove a SteamOS package",
    "No candidate may be selected",
    "optional Steam Machine tier",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.targetContract, targetKeys, "targetContract");
  assert.equal(
    plan.targetContract.targetClassId,
    "optional-steamos-compatibility-target",
  );
  for (const key of targetKeys.slice(1, 6)) {
    assert.equal(plan.targetContract[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of targetKeys.slice(6)) {
    assert.equal(plan.targetContract[key], false, `${key} must remain false`);
  }

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of authorityFalseKeys) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.ok(Array.isArray(plan.candidatePackages));
  assert.equal(plan.candidatePackages.length, STEAMOS_CONTENT_CANDIDATES.length);
  for (const [index, candidate] of plan.candidatePackages.entries()) {
    exactKeys(candidate, candidateKeys, `candidatePackages[${index}]`);
    assert.deepEqual(
      [candidate.candidateId, candidate.artifactClass],
      STEAMOS_CONTENT_CANDIDATES[index],
    );
    for (const key of candidateKeys.slice(2, 7)) {
      assert.equal(candidate[key], null, `blocked candidate cannot bind ${key}`);
    }
    assert.equal(candidate.usesOnlySupportedWritableApplicationStorage, true);
    assert.equal(candidate.readOnlyRootModificationAllowed, false);
    assert.equal(candidate.candidateMayBeSelectedFromDeskEvidence, false);
    assert.equal(candidate.failedCandidateEvidenceMayBeDiscarded, false);
  }

  exactKeys(plan.lifecycleMatrix, [
    "scenarioIds",
    "componentRoleIds",
    "candidateCount",
    "validCyclesPerCandidateScenario",
    "requiredCellCount",
    "requiredCycleCount",
    "everyComponentRoleObservedInEveryCell",
    "everyCandidateMustBeAttempted",
    "candidateSelectionRuleMustBeFrozenBeforeFirstBuild",
    "nonselectedCandidateFailureMayBeHidden",
    "selectedCandidateMustPassEveryScenario",
    "selectedCandidateFailureMayBeRescuedByOtherCandidate",
    "scenarioOrAggregateMayRescueFailedSelectedCandidateCell",
  ], "lifecycleMatrix");
  assert.deepEqual(plan.lifecycleMatrix.scenarioIds, [...STEAMOS_CONTENT_SCENARIOS]);
  assert.deepEqual(plan.lifecycleMatrix.componentRoleIds, [...STEAMOS_CONTENT_COMPONENTS]);
  assert.equal(plan.lifecycleMatrix.candidateCount, 2);
  assert.equal(plan.lifecycleMatrix.validCyclesPerCandidateScenario, 20);
  assert.equal(plan.lifecycleMatrix.requiredCellCount, 32);
  assert.equal(plan.lifecycleMatrix.requiredCycleCount, 640);
  for (const key of [
    "everyComponentRoleObservedInEveryCell",
    "everyCandidateMustBeAttempted",
    "candidateSelectionRuleMustBeFrozenBeforeFirstBuild",
    "selectedCandidateMustPassEveryScenario",
  ]) {
    assert.equal(plan.lifecycleMatrix[key], true, `${key} must remain true`);
  }
  for (const key of [
    "nonselectedCandidateFailureMayBeHidden",
    "selectedCandidateFailureMayBeRescuedByOtherCandidate",
    "scenarioOrAggregateMayRescueFailedSelectedCandidateCell",
  ]) {
    assert.equal(plan.lifecycleMatrix[key], false, `${key} must remain false`);
  }

  exactKeys(plan.packageRequirements, [
    "requiredComponentRoleIds",
    "motionSchemaVersion",
    "reservedActionIds",
    "packageAndWritableDataRootsMustBeDisjoint",
    "packageFilesImmutableDuringExecution",
    "hostSelectsProgramArgumentsEnvironmentRootsAndPermissions",
    "defaultDenyNetworkIpcFilesystemAndDeviceAccess",
    "cameraAccessRequiresSeparateI167Qualification",
    "controllerOnlyCoreLifecycleRequired",
    "gameOrPackageMayCaptureReservedActions",
    "coreLaunchRequiresNoSteamAccountLoginOrIdentity",
    "steamOnlyFeaturesMustRemainSeparateAndDisclosed",
    "osUpdateMustNotRequireReadOnlyRootRepair",
    "packageUpdateRollbackAndUninstallMustPreserveExplicitDataDisposition",
    "componentDescendantsAndCrashRecoveryMustRemainHostOwned",
    "firstPixelsProcessLivenessOrBridgeHelloMayEstablishInteractiveReadiness",
  ], "packageRequirements");
  assert.deepEqual(
    plan.packageRequirements.requiredComponentRoleIds,
    [...STEAMOS_CONTENT_COMPONENTS],
  );
  assert.equal(plan.packageRequirements.motionSchemaVersion, "0.4.0");
  assert.deepEqual(plan.packageRequirements.reservedActionIds, ["Home", "Back", "Pause"]);
  for (const key of [
    "packageAndWritableDataRootsMustBeDisjoint",
    "packageFilesImmutableDuringExecution",
    "hostSelectsProgramArgumentsEnvironmentRootsAndPermissions",
    "defaultDenyNetworkIpcFilesystemAndDeviceAccess",
    "cameraAccessRequiresSeparateI167Qualification",
    "controllerOnlyCoreLifecycleRequired",
    "coreLaunchRequiresNoSteamAccountLoginOrIdentity",
    "steamOnlyFeaturesMustRemainSeparateAndDisclosed",
    "osUpdateMustNotRequireReadOnlyRootRepair",
    "packageUpdateRollbackAndUninstallMustPreserveExplicitDataDisposition",
    "componentDescendantsAndCrashRecoveryMustRemainHostOwned",
  ]) {
    assert.equal(plan.packageRequirements[key], true, `${key} must remain true`);
  }
  assert.equal(plan.packageRequirements.gameOrPackageMayCaptureReservedActions, false);
  assert.equal(
    plan.packageRequirements.firstPixelsProcessLivenessOrBridgeHelloMayEstablishInteractiveReadiness,
    false,
  );

  exactKeys(plan.measurements, [
    "requiredMetricIds",
    "independentRootProcessInputMotionNetworkDataAndRecoveryOraclesRequired",
    "everyScheduledCycleAndFailureMustRemainVisible",
    "vendorDescriptionDeskBuildOtherTargetOrAggregateMaySubstituteTargetEvidence",
  ], "measurements");
  assert.deepEqual(plan.measurements.requiredMetricIds, [...STEAMOS_CONTENT_METRICS]);
  assert.equal(
    plan.measurements.independentRootProcessInputMotionNetworkDataAndRecoveryOraclesRequired,
    true,
  );
  assert.equal(plan.measurements.everyScheduledCycleAndFailureMustRemainVisible, true);
  assert.equal(
    plan.measurements.vendorDescriptionDeskBuildOtherTargetOrAggregateMaySubstituteTargetEvidence,
    false,
  );

  assert.deepEqual(plan.fixedAcceptance, {
    cleanBuildCount: 2,
    minimumValidCyclesPerCandidateScenario: 20,
    maximumLocalInteractiveMs: 15000,
    maximumWarmResumeMs: 5000,
    maximumReadOnlyRootModifications: 0,
    maximumWritesOutsideDeclaredWritableRoots: 0,
    maximumUndeclaredNetworkIpcFilesystemOrDeviceAccesses: 0,
    maximumSteamAccountLoginOrIdentityDependenciesForCore: 0,
    maximumCredentialTokenSteamIdentityPersonalDataPathOrFreeTextDisclosures: 0,
    maximumUnownedOrEscapedDescendants: 0,
    maximumReservedActionsDeliveredToGamesOrSwallowed: 0,
    maximumMotionSchemaVersionCapabilityOrEpochMismatches: 0,
    maximumSilentProfileSaveCacheOrPackageDataLossOrCorruption: 0,
    maximumUnboundedOrUnaccountedComponentRestarts: 0,
    maximumValidSelectedCandidateProductFailures: 0,
    byteIdenticalCleanBuildArtifactsRequired: true,
    osUpdateMustLeaveSelectedPackageRunnableWithoutRootRepair: true,
    allSelectedCandidateCellsMustPass: true,
    aggregateMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeFirstBuild: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }

  assert.deepEqual(plan.dataPolicy, {
    opaqueCandidateTargetBuildComponentCycleAndAccountStateLabelsRequired: true,
    closedReasonCodesCountsTimingsDigestsAndRedactedCategoriesRequired: true,
    rawScreenRoomPlayerControllerCameraAudioOrVideoAllowedInRepositoryReleaseOrResult: false,
    credentialsTokensCookiesSteamIdsAccountNamesProfileIdsSaveContentsOrStorageValuesAllowed: false,
    pathsUrlsWithQueriesEnvironmentValuesProcessArgumentsOrArbitraryMessagesAllowed: false,
    privateSigningKeysCrashDumpsMinidumpsCoreFilesOrMemoryTracesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressOutsideDeclaredPackageAndServiceTrafficAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...STEAMOS_CONTENT_BLOCKERS]);

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "blocked",
    completedCandidateScenarioCellCount: 0,
    completedCycleCount: 0,
    candidateResults: [],
    qualifiedCandidateIds: [],
    selectedCandidateId: null,
    readOnlyRootModified: false,
    steamAccountIdentityObserved: false,
    targetQualified: false,
    steamMachinePrimaryTierChanged: false,
    publishedClaims: [],
  });
}

export async function parseSteamOsUpdateSafeContentPlanBytes(bytes) {
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
  await validateSteamOsUpdateSafeContentPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseSteamOsUpdateSafeContentPlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `${trackedPath}: valid blocked ${plan.candidatePackages.length}-candidate, ${plan.lifecycleMatrix.requiredCycleCount}-cycle I-166 plan`,
  );
}
