import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HAILO_RECOVERY_BLOCKERS,
  HAILO_RECOVERY_SCENARIOS,
  HAILO_TUPLE_COMPONENTS,
  parseHailoPackageModelRecoveryPlanBytes,
  validateHailoPackageModelRecoveryPlan,
} from "./validate-hailo-package-model-recovery-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/hailo-recovery/hailo-package-model-recovery-plan-v1.json",
));
const tracked = await parseHailoPackageModelRecoveryPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-164 Hailo recovery plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.compatibilityTuple.componentCount, 10);
  assert.equal(tracked.campaignRules.scenarioCount, 14);
  assert.equal(tracked.campaignRules.requiredCycleCount, 280);
});

test("rejects stale or substituted source bindings", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateHailoPackageModelRecoveryPlan(plan),
    /digest drifted/u,
  );
});

test("rejects invented target, image, bundle, protocol, or mutation authority", async () => {
  for (const mutate of [
    (plan) => { plan.executionBoundary.exactTargetHardwareSha256 = "a".repeat(64); },
    (plan) => { plan.executionBoundary.qualifiedBaselineImageResultSha256 = "b".repeat(64); },
    (plan) => { plan.executionBoundary.signedOfflineBundleSha256 = "c".repeat(64); },
    (plan) => { plan.executionBoundary.compatibilityManifestSha256 = "d".repeat(64); },
    (plan) => { plan.executionBoundary.healthOracleSha256 = "e".repeat(64); },
    (plan) => { plan.executionBoundary.hardwareAccessAuthorized = true; },
    (plan) => { plan.executionBoundary.downloadAuthorized = true; },
    (plan) => { plan.executionBoundary.installAuthorized = true; },
    (plan) => { plan.executionBoundary.slotMutationAuthorized = true; },
    (plan) => { plan.executionBoundary.faultInjectionAuthorized = true; },
    (plan) => { plan.executionBoundary.networkAccessAuthorized = true; },
    (plan) => { plan.executionBoundary.publicationAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("preserves the exact ten-component compatibility tuple", async () => {
  assert.deepEqual(tracked.compatibilityTuple.componentIds, [
    ...HAILO_TUPLE_COMPONENTS,
  ]);
  for (const mutate of [
    (plan) => { plan.compatibilityTuple.componentIds.pop(); },
    (plan) => { plan.compatibilityTuple.componentIds.reverse(); },
    (plan) => { plan.compatibilityTuple.componentCount = 9; },
    (plan) => { plan.compatibilityTuple.everyVersionArchitectureDigestAndDependencyEdgeRequired = false; },
    (plan) => { plan.compatibilityTuple.wildcardsMovingTagsLatestAliasesOrFilenameOnlyIdentityAllowed = true; },
    (plan) => { plan.compatibilityTuple.gamesOrBrowserMaySelectOrOverrideTuple = true; },
    (plan) => { plan.compatibilityTuple.baselineTupleSha256 = "a".repeat(64); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("preserves all mismatch, offline reinstall, update, interruption, rollback, and downgrade scenarios", async () => {
  assert.deepEqual(
    tracked.scenarios.map((scenario) => [
      scenario.scenarioId,
      scenario.expectedDisposition,
      scenario.networkMode,
      scenario.mutationClass,
    ]),
    [...HAILO_RECOVERY_SCENARIOS],
  );
  for (const mutate of [
    (plan) => { plan.scenarios.pop(); },
    (plan) => { plan.scenarios.reverse(); },
    (plan) => { plan.scenarios[1].expectedDisposition = "healthy"; },
    (plan) => { plan.scenarios[6].networkMode = "online"; },
    (plan) => { plan.scenarios[9].mutationClass = "active-slot"; },
    (plan) => { plan.scenarios[13].scenarioId = "ordinary-downgrade"; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("requires 280 visible, counterbalanced, non-rescuable cycles", async () => {
  for (const mutate of [
    (plan) => { plan.campaignRules.scenarioCount = 13; },
    (plan) => { plan.campaignRules.validCyclesPerScenario = 19; },
    (plan) => { plan.campaignRules.requiredCycleCount = 279; },
    (plan) => { plan.campaignRules.eachMismatchChangesExactlyOneDeclaredTupleComponent = false; },
    (plan) => { plan.campaignRules.scenarioOrderCounterbalanced = false; },
    (plan) => { plan.campaignRules.failuresRetriesCutsAndInvalidCyclesRemainVisible = false; },
    (plan) => { plan.campaignRules.failedOrInvalidCycleMayBeReplaced = true; },
    (plan) => { plan.campaignRules.scenarioMayRescueOtherScenario = true; },
    (plan) => { plan.campaignRules.aggregateMayRescueFailedCycle = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("rejects weakened signature, A/B, health, isolation, preservation, or rollback gates", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.signatureAndThresholdVerificationBeforeParsingOrExtraction = false; },
    (plan) => { plan.fixedAcceptance.archiveImageAndInstalledTupleReadbackHashesRequired = false; },
    (plan) => { plan.fixedAcceptance.conventionalInPlaceFamilyModeUpdateAllowed = true; },
    (plan) => { plan.fixedAcceptance.onlyInactiveSystemSlotMayBeWritten = false; },
    (plan) => { plan.fixedAcceptance.mismatchMustFailBeforeCameraParticipantOrModelInference = false; },
    (plan) => { plan.fixedAcceptance.healthMustLoadExactHefPostprocessorAndKnownNonSensitiveVector = false; },
    (plan) => { plan.fixedAcceptance.hailortcliIdentityAloneMayPassHealth = true; },
    (plan) => { plan.fixedAcceptance.launcherTrackerCameraControllerNetworkStorageAndHailoHealthRequired = false; },
    (plan) => { plan.fixedAcceptance.maximumOfflineScenarioNetworkAttempts = 1; },
    (plan) => { plan.fixedAcceptance.maximumSilentTupleSubstitutions = 1; },
    (plan) => { plan.fixedAcceptance.maximumWritableSaveOrContentMutations = 1; },
    (plan) => { plan.fixedAcceptance.maximumBootFailuresAfterRequiredRecovery = 1; },
    (plan) => { plan.fixedAcceptance.maximumValidProductFailures = 1; },
    (plan) => { plan.fixedAcceptance.downgradeOrRollbackMayLowerProtectedHighestSeenGeneration = true; },
    (plan) => { plan.fixedAcceptance.allScenariosAndCyclesMustPass = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("rejects post-result thresholds and unsafe or incomplete evidence", async () => {
  for (const mutate of [
    (plan) => { plan.openAcceptance.maximumHealthWindowMs = 1000; },
    (plan) => { plan.openAcceptance.maximumRollbackP95Ms = 5000; },
    (plan) => { plan.openAcceptance.maximumBootAttemptCount = 3; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeExecution = false; },
    (plan) => { plan.dataPolicy.compatibilityEvidenceLimitedToVersionsArchitecturesDigestsDependencyEdgesAndClosedResults = false; },
    (plan) => { plan.dataPolicy.knownHealthVectorMustBeSyntheticAndNonSensitive = false; },
    (plan) => { plan.dataPolicy.rawCameraFramesAudioParticipantIdentifiersFreeTextPathsCredentialsKeysOrTokensAllowed = true; },
    (plan) => { plan.dataPolicy.saveProfilePortraitCalibrationBodyMatchingOrImportedContentAllowedInImageOrEvidence = true; },
    (plan) => { plan.dataPolicy.privateSigningMaterialAllowed = true; },
    (plan) => { plan.dataPolicy.cycleLevelPowerCutTupleHealthAndPreservationEvidenceRequired = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("rejects blocker removal, premature results, qualification, or selection", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [
    ...HAILO_RECOVERY_BLOCKERS,
  ]);
  for (const mutate of [
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.state = "ready"; },
    (plan) => { plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstMutation = false; },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedScenarioCount = 14; },
    (plan) => { plan.result.completedCycleCount = 280; },
    (plan) => { plan.result.scenarioResults.push({}); },
    (plan) => { plan.result.qualifiedTupleSha256 = "a".repeat(64); },
    (plan) => { plan.result.rollbackQualified = true; },
    (plan) => { plan.result.offlineReinstallQualified = true; },
    (plan) => { plan.result.imageOrProductSelectionChanged = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateHailoPackageModelRecoveryPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.packageRepaired = false;
  await assert.rejects(
    validateHailoPackageModelRecoveryPlan(extra),
    /fields drifted/u,
  );
  await assert.rejects(
    parseHailoPackageModelRecoveryPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseHailoPackageModelRecoveryPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseHailoPackageModelRecoveryPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseHailoPackageModelRecoveryPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseHailoPackageModelRecoveryPlanBytes(Buffer.alloc(192 * 1024 + 1)),
    /exceeds/u,
  );
});
