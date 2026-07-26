import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  CATALOG_CONTROLLER_BLOCKERS,
  CATALOG_CONTROLLER_GAME_IDS,
  CATALOG_CONTROLLER_LIFECYCLE,
  CATALOG_CONTROLLER_ROLES,
  CATALOG_CONTROLLER_TARGETS,
  CATALOG_CONTROLLER_TASKS,
  CATALOG_REMOTE_SCENARIOS,
  CATALOG_TV_AUDIO_CHECKS,
  loadCatalogControllerOnlyPlan,
  validateCatalogControllerOnlyPlan,
  validateTrackedCatalogControllerOnlyPlan,
} from "./validate-catalog-controller-only-plan.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const planPath = resolve(repositoryRoot, "benchmarks/catalog-controller-only/catalog-controller-only-qualification-plan-v1.json");
const sourceText = await readFile(planPath, "utf8");
const sourcePlan = JSON.parse(sourceText);

function clone() {
  return structuredClone(sourcePlan);
}

async function rejectsMutation(mutator, pattern) {
  const plan = clone();
  mutator(plan);
  await assert.rejects(validateCatalogControllerOnlyPlan(plan, repositoryRoot), pattern);
}

test("accepts the tracked blocked zero-result I-089 plan", async () => {
  assert.deepEqual(await validateTrackedCatalogControllerOnlyPlan(), {
    status: "blocked",
    sourceBindingCount: 11,
    gameCount: 26,
    controllerTaskTrialCount: 31200,
    lifecycleCycleCount: 37440,
    recoveryRemoteTrialCount: 6240,
    televisionAudioTrialCount: 6240,
    totalRequiredObservationCount: 81120,
    openGateCount: 17,
  });
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutation((plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); }, /digest drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings[1].role = "other-role"; }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.reverse(); }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.pop(); }, /source binding count/u);
});

test("pins all 26 games and rejects listener, URL, admission, or aggregate promotion", async () => {
  assert.deepEqual(sourcePlan.catalogContract.exactGameIds, [...CATALOG_CONTROLLER_GAME_IDS]);
  await rejectsMutation((plan) => { plan.catalogContract.exactGameIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.catalogContract.neutralGamepadSignalListenerOrDomSurfaceMayEstablishSupport = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.catalogContract.loadedUrlMayEstablishReadinessPlayabilityOrControllerSupport = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.catalogContract.controllerCompatibilityMayGrantCatalogAdmissionRightsPermissionsOrOfflineSupport = true; }, /Expected values to be strictly deep-equal/u);
});

test("rejects invented target, device, game, recording, mutation, and publication authority", async () => {
  await rejectsMutation((plan) => { plan.authorityBoundary.ordinaryX86TargetRuntimeAndCompositorSha256 = "1".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.controllerQualificationResultSha256 = "2".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.gameInteractionOrAccountUseAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.catalogManifestPermissionOrFamilyModeMutationAuthorized = true; }, /must remain false/u);
});

test("requires both Linux tiers, all controller roles, tasks, and 31200 task trials", async () => {
  assert.deepEqual(sourcePlan.matrices.requiredTargetIds, [...CATALOG_CONTROLLER_TARGETS]);
  assert.deepEqual(sourcePlan.matrices.controllerRoleIds, [...CATALOG_CONTROLLER_ROLES]);
  assert.deepEqual(sourcePlan.matrices.controllerOnlyTaskIds, [...CATALOG_CONTROLLER_TASKS]);
  await rejectsMutation((plan) => { plan.matrices.requiredTargetIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.controllerRoleIds.reverse(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.controllerOnlyTaskIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.controllerTaskTrialCount = 31199; }, /Expected values to be strictly equal/u);
});

test("requires all lifecycle and failure recovery cells with no aggregate rescue", async () => {
  assert.deepEqual(sourcePlan.matrices.lifecycleScenarioIds, [...CATALOG_CONTROLLER_LIFECYCLE]);
  for (const required of [
    "disconnect-while-gameplay-control-held",
    "fullscreen-capture-and-global-recovery",
    "pointer-lock-capture-and-global-recovery",
    "game-hang-crash-and-supervisor-return",
  ]) assert.ok(sourcePlan.matrices.lifecycleScenarioIds.includes(required));
  await rejectsMutation((plan) => { plan.matrices.lifecycleScenarioIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.lifecycleCycleCount = 37439; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.gameControllerTargetTaskScenarioOrAggregateMayRescueFailure = true; }, /Expected values to be strictly equal/u);
});

test("requires every recovery-remote and TV/audio check", async () => {
  assert.deepEqual(sourcePlan.matrices.recoveryRemoteScenarioIds, [...CATALOG_REMOTE_SCENARIOS]);
  assert.deepEqual(sourcePlan.matrices.televisionAudioCheckIds, [...CATALOG_TV_AUDIO_CHECKS]);
  await rejectsMutation((plan) => { plan.matrices.recoveryRemoteScenarioIds.splice(4, 1); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.televisionAudioCheckIds[0] = "desktop-only"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.totalRequiredObservationCount = 81119; }, /Expected values to be strictly equal/u);
});

test("keeps required input, ordinary mechanics, failures, and independent oracles visible", async () => {
  await rejectsMutation((plan) => { plan.measurements.independentControllerScreenAudioReservedActionAndRecoveryOraclesRequired = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.ordinaryPlayScriptMustExerciseDeclaredPrimaryMechanics = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.requiredInputUnavailableFeatureAuthOrServiceMustRemainVisible = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.syntheticSignalUrlLoadOrDomSurfaceMaySubstituteHandsOnEvidence = true; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.keyboardMouseTouchOrDeveloperToolMayRescueControllerOnlyFailure = true; }, /drifted/u);
});

test("preserves zero-tolerance controller, reserved-action, recovery, TV, audio, and disclosure gates", async () => {
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumRequiredKeyboardMouseOrTouchInterventionsInControllerFirstPath = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumReservedHomeBackOrPauseActionsDeliveredToGame = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumRecoveryRemoteFailures = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.fixedAcceptance.maximumCriticalTvSafeAreaFocusTextOrActionVisibilityFailures = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.fixedAcceptance.aggregateSuccessMayRescueFailure = true; }, /Expected values to be strictly deep-equal/u);
});

test("keeps all 17 outcome-sensitive thresholds null", async () => {
  await rejectsMutation((plan) => { plan.openAcceptance.minimumIndependentPhysicalSamplesPerControllerRole = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.openAcceptance.minimumOrdinaryGameplayDurationMsPerTrial = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.openAcceptance.maximumControllerToGameActionP95Us = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.openAcceptance.minimumTvAndControlComprehensionPpm = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.openAcceptance.maximumControllerTextEntryErrorRatePpm = 1; }, /must remain null/u);
});

test("rejects unsafe data, credential capture, free text, external egress, and adverse-evidence deletion", async () => {
  await rejectsMutation((plan) => { plan.dataPolicy.rawRoomPlayerControllerVideoAudioOrImagesAllowedInRepositoryReleaseOrResult = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.credentialsTokensCookiesStorageValuesFormValuesChatTextOrProfileDataAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.freeTextResultEvidenceAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.networkEgressOutsideDeclaredGameServiceTrafficAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible = false; }, /Expected values to be strictly deep-equal/u);
});

test("rejects blocker weakening, premature results, compatibility, admission, and family-mode claims", async () => {
  assert.deepEqual(sourcePlan.executionGate.blockerCodes, [...CATALOG_CONTROLLER_BLOCKERS]);
  await rejectsMutation((plan) => { plan.executionGate.blockerCodes.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.disposition = "qualified"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.compatibleGameIdsByTarget.push("vibebots"); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.catalogAdmissionOrManifestPermissionsChanged = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.familyModeClaimPublished = true; }, /Expected values to be strictly deep-equal/u);
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  await rejectsMutation((plan) => { plan.hiddenAuthority = true; }, /plan fields drifted/u);
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-catalog-controller-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "qualified",'));
    await assert.rejects(loadCatalogControllerOnlyPlan(duplicate), /canonical two-space JSON/u);
    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(sourcePlan));
    await assert.rejects(loadCatalogControllerOnlyPlan(noncanonical), /canonical two-space JSON/u);
    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]));
    await assert.rejects(loadCatalogControllerOnlyPlan(bom), /BOM/u);
    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(loadCatalogControllerOnlyPlan(invalid), /strict UTF-8/u);
    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, sourceText.replace("\n", "\r"));
    await assert.rejects(loadCatalogControllerOnlyPlan(bareCr), /bare carriage return/u);
    const oversize = resolve(directory, "oversize.json");
    await writeFile(oversize, Buffer.alloc(192 * 1024 + 1, 0x20));
    await assert.rejects(loadCatalogControllerOnlyPlan(oversize), /1 through 196608 bytes/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
