import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STEAMOS_CONTENT_BLOCKERS,
  STEAMOS_CONTENT_CANDIDATES,
  STEAMOS_CONTENT_COMPONENTS,
  STEAMOS_CONTENT_METRICS,
  STEAMOS_CONTENT_SCENARIOS,
  parseSteamOsUpdateSafeContentPlanBytes,
  validateSteamOsUpdateSafeContentPlan,
} from "./validate-steamos-update-safe-content-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
));
const tracked = await parseSteamOsUpdateSafeContentPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-166 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.candidatePackages.length, 2);
  assert.equal(tracked.lifecycleMatrix.requiredCellCount, 32);
  assert.equal(tracked.lifecycleMatrix.requiredCycleCount, 640);
  assert.equal(tracked.result.disposition, "blocked");
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  for (const mutate of [
    (plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); },
    (plan) => { plan.sourceBindings.reverse(); },
    (plan) => { plan.sourceBindings[0].path = "docs/RESEARCH.md"; },
    (plan) => { plan.sourceBindings.pop(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("keeps the exact unreceived optional SteamOS target fail-closed", async () => {
  for (const mutate of [
    (plan) => { plan.targetContract.targetClassId = "ordinary-x86-linux-premium"; },
    (plan) => { plan.targetContract.exactReceivedHardwareAndInventorySha256 = "a".repeat(64); },
    (plan) => { plan.targetContract.steamOsImageKernelDriverAndGamescopeSha256 = "b".repeat(64); },
    (plan) => { plan.targetContract.supportedWritableApplicationRootSha256 = "c".repeat(64); },
    (plan) => { plan.targetContract.readOnlyRootBaselineSnapshotSha256 = "d".repeat(64); },
    (plan) => { plan.targetContract.osUpdateAndRecoveryFixtureSha256 = "e".repeat(64); },
    (plan) => { plan.targetContract.steamAccountOrIdentityRequiredForCorePackage = true; },
    (plan) => { plan.targetContract.steamMachineMayReplaceRequiredReferenceTargets = true; },
    (plan) => { plan.targetContract.deskWindowsOrdinaryLinuxOrPiEvidenceMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("rejects invented build, target, account, device, update, selection, or publication authority", async () => {
  for (const mutate of [
    (plan) => { plan.authorityBoundary.selectedCandidateId = "flatpak-writable-content"; },
    (plan) => { plan.authorityBoundary.sourceRevisionSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.flatpakManifestRuntimeAndSandboxPolicySha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.cameraAndPermissionQualificationResultSha256 = "c".repeat(64); },
    (plan) => { plan.authorityBoundary.buildAuthorized = true; },
    (plan) => { plan.authorityBoundary.targetOperationAuthorized = true; },
    (plan) => { plan.authorityBoundary.installOrUninstallMutationAuthorized = true; },
    (plan) => { plan.authorityBoundary.accountOrServiceInteractionAuthorized = true; },
    (plan) => { plan.authorityBoundary.cameraControllerOrRemoteOperationAuthorized = true; },
    (plan) => { plan.authorityBoundary.osUpdateSuspendRecoveryOrReimageAuthorized = true; },
    (plan) => { plan.authorityBoundary.qualificationSelectionOrPublicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("pins both writable-content candidates without selecting or hiding either", async () => {
  assert.deepEqual(
    tracked.candidatePackages.map((candidate) => [
      candidate.candidateId,
      candidate.artifactClass,
    ]),
    [...STEAMOS_CONTENT_CANDIDATES],
  );
  for (const mutate of [
    (plan) => { plan.candidatePackages.pop(); },
    (plan) => { plan.candidatePackages.reverse(); },
    (plan) => { plan.candidatePackages[0].artifactClass = "appimage"; },
    (plan) => { plan.candidatePackages[0].artifactSha256 = "a".repeat(64); },
    (plan) => { plan.candidatePackages[0].usesOnlySupportedWritableApplicationStorage = false; },
    (plan) => { plan.candidatePackages[0].readOnlyRootModificationAllowed = true; },
    (plan) => { plan.candidatePackages[0].candidateMayBeSelectedFromDeskEvidence = true; },
    (plan) => { plan.candidatePackages[0].failedCandidateEvidenceMayBeDiscarded = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("requires all 32 candidate-scenario cells and 640 visible cycles", async () => {
  assert.deepEqual(tracked.lifecycleMatrix.scenarioIds, [...STEAMOS_CONTENT_SCENARIOS]);
  assert.deepEqual(tracked.lifecycleMatrix.componentRoleIds, [...STEAMOS_CONTENT_COMPONENTS]);
  for (const mutate of [
    (plan) => { plan.lifecycleMatrix.scenarioIds.pop(); },
    (plan) => { plan.lifecycleMatrix.scenarioIds.reverse(); },
    (plan) => { plan.lifecycleMatrix.componentRoleIds.pop(); },
    (plan) => { plan.lifecycleMatrix.candidateCount = 1; },
    (plan) => { plan.lifecycleMatrix.validCyclesPerCandidateScenario = 19; },
    (plan) => { plan.lifecycleMatrix.requiredCellCount = 31; },
    (plan) => { plan.lifecycleMatrix.requiredCycleCount = 639; },
    (plan) => { plan.lifecycleMatrix.everyComponentRoleObservedInEveryCell = false; },
    (plan) => { plan.lifecycleMatrix.everyCandidateMustBeAttempted = false; },
    (plan) => { plan.lifecycleMatrix.candidateSelectionRuleMustBeFrozenBeforeFirstBuild = false; },
    (plan) => { plan.lifecycleMatrix.nonselectedCandidateFailureMayBeHidden = true; },
    (plan) => { plan.lifecycleMatrix.selectedCandidateMustPassEveryScenario = false; },
    (plan) => { plan.lifecycleMatrix.selectedCandidateFailureMayBeRescuedByOtherCandidate = true; },
    (plan) => { plan.lifecycleMatrix.scenarioOrAggregateMayRescueFailedSelectedCandidateCell = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("preserves package isolation, accountless core, update, input, and readiness requirements", async () => {
  for (const mutate of [
    (plan) => { plan.packageRequirements.requiredComponentRoleIds.pop(); },
    (plan) => { plan.packageRequirements.motionSchemaVersion = "latest"; },
    (plan) => { plan.packageRequirements.reservedActionIds.pop(); },
    (plan) => { plan.packageRequirements.packageAndWritableDataRootsMustBeDisjoint = false; },
    (plan) => { plan.packageRequirements.packageFilesImmutableDuringExecution = false; },
    (plan) => { plan.packageRequirements.hostSelectsProgramArgumentsEnvironmentRootsAndPermissions = false; },
    (plan) => { plan.packageRequirements.defaultDenyNetworkIpcFilesystemAndDeviceAccess = false; },
    (plan) => { plan.packageRequirements.cameraAccessRequiresSeparateI167Qualification = false; },
    (plan) => { plan.packageRequirements.controllerOnlyCoreLifecycleRequired = false; },
    (plan) => { plan.packageRequirements.gameOrPackageMayCaptureReservedActions = true; },
    (plan) => { plan.packageRequirements.coreLaunchRequiresNoSteamAccountLoginOrIdentity = false; },
    (plan) => { plan.packageRequirements.steamOnlyFeaturesMustRemainSeparateAndDisclosed = false; },
    (plan) => { plan.packageRequirements.osUpdateMustNotRequireReadOnlyRootRepair = false; },
    (plan) => { plan.packageRequirements.packageUpdateRollbackAndUninstallMustPreserveExplicitDataDisposition = false; },
    (plan) => { plan.packageRequirements.componentDescendantsAndCrashRecoveryMustRemainHostOwned = false; },
    (plan) => { plan.packageRequirements.firstPixelsProcessLivenessOrBridgeHelloMayEstablishInteractiveReadiness = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("requires complete independent root, process, input, Motion, network, data, and recovery evidence", async () => {
  assert.deepEqual(tracked.measurements.requiredMetricIds, [...STEAMOS_CONTENT_METRICS]);
  for (const mutate of [
    (plan) => { plan.measurements.requiredMetricIds.pop(); },
    (plan) => { plan.measurements.requiredMetricIds.reverse(); },
    (plan) => { plan.measurements.independentRootProcessInputMotionNetworkDataAndRecoveryOraclesRequired = false; },
    (plan) => { plan.measurements.everyScheduledCycleAndFailureMustRemainVisible = false; },
    (plan) => { plan.measurements.vendorDescriptionDeskBuildOtherTargetOrAggregateMaySubstituteTargetEvidence = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("preserves fixed root, accountless, isolation, lifecycle, and no-rescue gates", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.cleanBuildCount = 1; },
    (plan) => { plan.fixedAcceptance.minimumValidCyclesPerCandidateScenario = 19; },
    (plan) => { plan.fixedAcceptance.maximumLocalInteractiveMs = 15001; },
    (plan) => { plan.fixedAcceptance.maximumWarmResumeMs = 5001; },
    (plan) => { plan.fixedAcceptance.maximumReadOnlyRootModifications = 1; },
    (plan) => { plan.fixedAcceptance.maximumWritesOutsideDeclaredWritableRoots = 1; },
    (plan) => { plan.fixedAcceptance.maximumUndeclaredNetworkIpcFilesystemOrDeviceAccesses = 1; },
    (plan) => { plan.fixedAcceptance.maximumSteamAccountLoginOrIdentityDependenciesForCore = 1; },
    (plan) => { plan.fixedAcceptance.maximumCredentialTokenSteamIdentityPersonalDataPathOrFreeTextDisclosures = 1; },
    (plan) => { plan.fixedAcceptance.maximumUnownedOrEscapedDescendants = 1; },
    (plan) => { plan.fixedAcceptance.maximumReservedActionsDeliveredToGamesOrSwallowed = 1; },
    (plan) => { plan.fixedAcceptance.maximumMotionSchemaVersionCapabilityOrEpochMismatches = 1; },
    (plan) => { plan.fixedAcceptance.maximumSilentProfileSaveCacheOrPackageDataLossOrCorruption = 1; },
    (plan) => { plan.fixedAcceptance.maximumUnboundedOrUnaccountedComponentRestarts = 1; },
    (plan) => { plan.fixedAcceptance.maximumValidSelectedCandidateProductFailures = 1; },
    (plan) => { plan.fixedAcceptance.byteIdenticalCleanBuildArtifactsRequired = false; },
    (plan) => { plan.fixedAcceptance.osUpdateMustLeaveSelectedPackageRunnableWithoutRootRepair = false; },
    (plan) => { plan.fixedAcceptance.allSelectedCandidateCellsMustPass = false; },
    (plan) => { plan.fixedAcceptance.aggregateMayRescueFailure = true; },
    (plan) => { plan.fixedAcceptance.allOpenGatesMustBeFrozenBeforeFirstBuild = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("keeps all outcome-sensitive size, timing, performance, resource, and growth gates null", async () => {
  for (const key of Object.keys(tracked.openAcceptance)) {
    const plan = clone(); plan.openAcceptance[key] = 1;
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("rejects unsafe evidence, Steam identity capture, secrets, paths, raw media, and hidden failures", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.opaqueCandidateTargetBuildComponentCycleAndAccountStateLabelsRequired = false; },
    (plan) => { plan.dataPolicy.rawScreenRoomPlayerControllerCameraAudioOrVideoAllowedInRepositoryReleaseOrResult = true; },
    (plan) => { plan.dataPolicy.credentialsTokensCookiesSteamIdsAccountNamesProfileIdsSaveContentsOrStorageValuesAllowed = true; },
    (plan) => { plan.dataPolicy.pathsUrlsWithQueriesEnvironmentValuesProcessArgumentsOrArbitraryMessagesAllowed = true; },
    (plan) => { plan.dataPolicy.privateSigningKeysCrashDumpsMinidumpsCoreFilesOrMemoryTracesAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextResultEvidenceAllowed = true; },
    (plan) => { plan.dataPolicy.networkEgressOutsideDeclaredPackageAndServiceTrafficAllowed = true; },
    (plan) => { plan.dataPolicy.failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("rejects blocker weakening, premature results, selection, tier changes, and publication", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...STEAMOS_CONTENT_BLOCKERS]);
  for (const mutate of [
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.status = "ready"; },
    (plan) => { plan.result.artifactPath = "result.json"; },
    (plan) => { plan.result.sha256 = "a".repeat(64); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedCandidateScenarioCellCount = 32; },
    (plan) => { plan.result.completedCycleCount = 640; },
    (plan) => { plan.result.candidateResults.push({}); },
    (plan) => { plan.result.qualifiedCandidateIds.push("flatpak-writable-content"); },
    (plan) => { plan.result.selectedCandidateId = "flatpak-writable-content"; },
    (plan) => { plan.result.readOnlyRootModified = true; },
    (plan) => { plan.result.steamAccountIdentityObserved = true; },
    (plan) => { plan.result.targetQualified = true; },
    (plan) => { plan.result.steamMachinePrimaryTierChanged = true; },
    (plan) => { plan.result.publishedClaims.push("supported"); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateSteamOsUpdateSafeContentPlan(plan));
  }
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const extra = clone(); extra.packageSelected = false;
  await assert.rejects(validateSteamOsUpdateSafeContentPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseSteamOsUpdateSafeContentPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseSteamOsUpdateSafeContentPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseSteamOsUpdateSafeContentPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseSteamOsUpdateSafeContentPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseSteamOsUpdateSafeContentPlanBytes(Buffer.from('{\r"format":1}\n')),
    /bare CR/u,
  );
  await assert.rejects(
    parseSteamOsUpdateSafeContentPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
