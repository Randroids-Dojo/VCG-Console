import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SIGNED_LOCAL_PACKAGE_BLOCKERS,
  SIGNED_LOCAL_PACKAGE_LANES,
  SIGNED_LOCAL_PACKAGE_SCENARIOS,
  parseRuntimeNeutralSignedLocalPackagePlanBytes,
  validateRuntimeNeutralSignedLocalPackagePlan,
} from "./validate-runtime-neutral-signed-local-package-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
));
const tracked = await parseRuntimeNeutralSignedLocalPackagePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-181 signed local-package plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.packageLanes.length, 4);
  assert.equal(tracked.lifecycleMatrix.requiredCellCount, 48);
  assert.equal(tracked.lifecycleMatrix.requiredCycleCount, 960);
  assert.equal(tracked.result.disposition, "blocked");
});

test("rejects source substitution and stale source bytes", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateRuntimeNeutralSignedLocalPackagePlan(plan),
    /digest drifted/u,
  );
});

test("rejects invented target, source, rights, signing, runtime, or execution authority", async () => {
  for (const mutate of [
    (plan) => { plan.authorityBoundary.targetConfigurations.aarch64LinuxSha256 = "a".repeat(64); },
    (plan) => { plan.authorityBoundary.exampleGameSourceSha256 = "b".repeat(64); },
    (plan) => { plan.authorityBoundary.rightsReviewSha256 = "c".repeat(64); },
    (plan) => { plan.authorityBoundary.signingAndDelegationPolicySha256 = "d".repeat(64); },
    (plan) => { plan.authorityBoundary.localWebRuntimePolicySha256 = "e".repeat(64); },
    (plan) => { plan.authorityBoundary.nativeRuntimePolicySha256 = "f".repeat(64); },
    (plan) => { plan.authorityBoundary.buildAuthorized = true; },
    (plan) => { plan.authorityBoundary.signingAuthorized = true; },
    (plan) => { plan.authorityBoundary.executionAuthorized = true; },
    (plan) => { plan.authorityBoundary.publicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("preserves all four independent runtime and target lanes", async () => {
  assert.deepEqual(
    tracked.packageLanes.map((lane) => [
      lane.laneId,
      lane.runtime,
      lane.target,
      lane.artifactClass,
    ]),
    [...SIGNED_LOCAL_PACKAGE_LANES],
  );
  for (const mutate of [
    (plan) => { plan.packageLanes.pop(); },
    (plan) => { plan.packageLanes.reverse(); },
    (plan) => { plan.packageLanes[0].runtime = "remote-web"; },
    (plan) => { plan.packageLanes[1].target = "windows-x86-64"; },
    (plan) => { plan.packageLanes[2].artifactClass = "generic-native"; },
    (plan) => { plan.packageLanes[0].examplePackageId = "example"; },
    (plan) => { plan.packageLanes[0].artifactSha256 = "a".repeat(64); },
    (plan) => { plan.packageLanes[0].requiresIndependentTargetResult = false; },
    (plan) => { plan.packageLanes[0].otherTargetMayQualify = true; },
    (plan) => { plan.packageLanes[0].builtinOrHostedFixtureMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("preserves the complete 48-cell and 960-cycle lifecycle matrix", async () => {
  assert.deepEqual(tracked.lifecycleMatrix.scenarioIds, [
    ...SIGNED_LOCAL_PACKAGE_SCENARIOS,
  ]);
  for (const mutate of [
    (plan) => { plan.lifecycleMatrix.scenarioIds.pop(); },
    (plan) => { plan.lifecycleMatrix.scenarioIds.reverse(); },
    (plan) => { plan.lifecycleMatrix.laneCount = 3; },
    (plan) => { plan.lifecycleMatrix.validCyclesPerLaneScenario = 19; },
    (plan) => { plan.lifecycleMatrix.requiredCellCount = 47; },
    (plan) => { plan.lifecycleMatrix.requiredCycleCount = 959; },
    (plan) => { plan.lifecycleMatrix.sameReleaseIdentityAcrossTargetsPerRuntime = false; },
    (plan) => { plan.lifecycleMatrix.everyLaneAndScenarioRequired = false; },
    (plan) => { plan.lifecycleMatrix.runtimeLaneMayRescueOtherRuntime = true; },
    (plan) => { plan.lifecycleMatrix.targetMayRescueOtherTarget = true; },
    (plan) => { plan.lifecycleMatrix.scenarioMayRescueOtherScenario = true; },
    (plan) => { plan.lifecycleMatrix.aggregateMayRescueFailedCell = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("rejects weakened manifest, input, readiness, sandbox, save, or network boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.interfaceRequirements.manifestRequiredFields.pop(); },
    (plan) => { plan.interfaceRequirements.manifestAndSignedCatalogMustAgree = false; },
    (plan) => { plan.interfaceRequirements.packageMayChooseProgramArgumentsEnvironmentOrWritablePaths = true; },
    (plan) => { plan.interfaceRequirements.hostSelectsArchitectureAndRuntimeAdapter = false; },
    (plan) => { plan.interfaceRequirements.motionSchemaVersion = "latest"; },
    (plan) => { plan.interfaceRequirements.motionApiReceiptIsLatencyEndpoint = false; },
    (plan) => { plan.interfaceRequirements.reservedActionIds.pop(); },
    (plan) => { plan.interfaceRequirements.gameMayCaptureReservedActions = true; },
    (plan) => { plan.interfaceRequirements.controllerOnlyFlowRequired = false; },
    (plan) => { plan.interfaceRequirements.interactiveMeansUsableInputNotFirstPixels = false; },
    (plan) => { plan.interfaceRequirements.localWebRequiresExactLoopbackOriginAndQualifiedWrapper = false; },
    (plan) => { plan.interfaceRequirements.nativeRequiresTargetSandboxAndOwnedDescendants = false; },
    (plan) => { plan.interfaceRequirements.saveRootsHostDerivedAndPerGameProfile = false; },
    (plan) => { plan.interfaceRequirements.networkDefaultDenyAndExactDeclaration = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("preserves fixed launch, Motion, isolation, save, and non-rescue gates", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.cleanBuildCount = 1; },
    (plan) => { plan.fixedAcceptance.byteIdenticalReleaseArchiveRequired = false; },
    (plan) => { plan.fixedAcceptance.maximumLocalInteractiveMs = 15001; },
    (plan) => { plan.fixedAcceptance.maximumMotionExposureToApiP95Ms = 121; },
    (plan) => { plan.fixedAcceptance.minimumActionPrecisionPpm = 949999; },
    (plan) => { plan.fixedAcceptance.minimumActionRecallPpm = 899999; },
    (plan) => { plan.fixedAcceptance.maximumUnintendedPrivilegedActions = 1; },
    (plan) => { plan.fixedAcceptance.maximumUndeclaredNetworkAttempts = 1; },
    (plan) => { plan.fixedAcceptance.maximumUndeclaredDeviceAccesses = 1; },
    (plan) => { plan.fixedAcceptance.maximumEscapedDescendants = 1; },
    (plan) => { plan.fixedAcceptance.maximumValidProductFailures = 1; },
    (plan) => { plan.fixedAcceptance.healthyUpdateMustPreserveSaves = false; },
    (plan) => { plan.fixedAcceptance.uninstallMustRequireControllerConfirmedSaveDisposition = false; },
    (plan) => { plan.fixedAcceptance.allCellsMustPass = false; },
    (plan) => { plan.fixedAcceptance.crossRuntimeOrTargetAggregateRescueAllowed = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("rejects post-result thresholds and weakened evidence policy", async () => {
  for (const mutate of [
    (plan) => { plan.openAcceptance.maximumArchiveBytesByRuntime = { native: 1 }; },
    (plan) => { plan.openAcceptance.maximumInstallP95Ms = 1000; },
    (plan) => { plan.openAcceptance.maximumStorageQuotaBytesByRuntime = { native: 1 }; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeExecution = false; },
    (plan) => { plan.evidencePolicy.twoIndependentCleanBuildLogsRequired = false; },
    (plan) => { plan.evidencePolicy.sbomLicenseAndRightsEvidenceRequired = false; },
    (plan) => { plan.evidencePolicy.rawCameraFramesOrAudioAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.evidencePolicy.participantIdentifiersFreeTextPathsSecretsKeysCredentialsOrTokensAllowed = true; },
    (plan) => { plan.evidencePolicy.privateSigningKeyMaterialAllowedInEvidence = true; },
    (plan) => { plan.evidencePolicy.saveContentsAllowedInEvidence = true; },
    (plan) => { plan.evidencePolicy.failuresRetriesInterruptionsAndRollbackReasonsMustRemainVisible = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("rejects blocker weakening, premature qualification, publication, or product mutation", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [
    ...SIGNED_LOCAL_PACKAGE_BLOCKERS,
  ]);
  for (const mutate of [
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.state = "ready"; },
    (plan) => { plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstBuild = false; },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedCellCount = 48; },
    (plan) => { plan.result.completedCycleCount = 960; },
    (plan) => { plan.result.laneResults.push({}); },
    (plan) => { plan.result.qualifiedLaneIds.push("native-x86-64-linux"); },
    (plan) => { plan.result.selectedDefaultRuntime = "native"; },
    (plan) => { plan.result.publishedPackageIds.push("example"); },
    (plan) => { plan.result.productDefaultChanged = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateRuntimeNeutralSignedLocalPackagePlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.packageSelected = false;
  await assert.rejects(
    validateRuntimeNeutralSignedLocalPackagePlan(extra),
    /fields drifted/u,
  );
  await assert.rejects(
    parseRuntimeNeutralSignedLocalPackagePlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(
    parseRuntimeNeutralSignedLocalPackagePlanBytes(duplicate),
    /canonical/u,
  );
  await assert.rejects(
    parseRuntimeNeutralSignedLocalPackagePlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseRuntimeNeutralSignedLocalPackagePlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseRuntimeNeutralSignedLocalPackagePlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
