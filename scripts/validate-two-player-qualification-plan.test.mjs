import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  TWO_PLAYER_ACCESSIBLE_TASKS,
  TWO_PLAYER_ACTION_SCENARIOS,
  TWO_PLAYER_BLOCKERS,
  TWO_PLAYER_IDENTITY_SCENARIOS,
  TWO_PLAYER_PERSONA_PAIRS,
  TWO_PLAYER_PLACEMENTS,
  TWO_PLAYER_SESSION_SCENARIOS,
  loadTwoPlayerQualificationPlan,
  validateTrackedTwoPlayerQualificationPlan,
  validateTwoPlayerQualificationPlan,
} from "./validate-two-player-qualification-plan.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const planPath = resolve(
  repositoryRoot,
  "benchmarks/two-player/two-player-qualification-plan-v1.json",
);
const sourceText = await readFile(planPath, "utf8");
const sourcePlan = JSON.parse(sourceText);

function clone() {
  return structuredClone(sourcePlan);
}

async function rejectsMutation(mutator, pattern) {
  const plan = clone();
  mutator(plan);
  await assert.rejects(validateTwoPlayerQualificationPlan(plan, repositoryRoot), pattern);
}

test("accepts the tracked blocked zero-result I-054 plan", async () => {
  assert.deepEqual(await validateTrackedTwoPlayerQualificationPlan(), {
    status: "blocked",
    sourceBindingCount: 10,
    identityTrialCount: 4800,
    actionTrialCount: 5600,
    sessionCycleCount: 1920,
    accessibleIdentityTrialCount: 640,
    runtimeSoakCount: 40,
    openGateCount: 17,
  });
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  await rejectsMutation((plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); }, /digest drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings[1].role = "other-role"; }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.reverse(); }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.pop(); }, /source binding count/u);
});

test("keeps the complete one-player prerequisite closed and non-substitutable", async () => {
  await rejectsMutation((plan) => { plan.prerequisiteGate.completeOnePlayerResultSha256 = "1".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.everyRequiredOnePlayerCellPassed = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.onePlayerResultMayBeReplacedBySyntheticOrAggregateEvidence = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.twoPlayerCollectionMayBeginBeforePrerequisiteClosure = true; }, /must remain false/u);
});

test("rejects invented targets, participants, protocols, collection, and four-player authority", async () => {
  await rejectsMutation((plan) => { plan.authorityBoundary.selectedPrototypeTargetConfigurationSha256 = "2".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.childParticipationAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.cameraCollectionAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.productOrFourPlayerAuthorityGranted = true; }, /must remain false/u);
});

test("preserves opaque session identity, sequential join, separate calibration, and accessible outlines", async () => {
  await rejectsMutation((plan) => { plan.identityBoundary.trackerIdsMayIdentifyAuthenticateOrReassociateProfiles = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityBoundary.colorAloneMayDistinguishPlayers = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityBoundary.playerOneJoinsAndCalibratesBeforePlayerTwo = false; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityBoundary.syntheticTrackLabelsMayQualifyRealIdentityContinuity = true; }, /Expected values to be strictly deep-equal/u);
});

test("requires all ordered pairs, placements, identity scenes, and 4800 trials", async () => {
  assert.deepEqual(sourcePlan.matrices.orderedPersonaPairClasses, [...TWO_PLAYER_PERSONA_PAIRS]);
  assert.deepEqual(sourcePlan.matrices.placementPairIds, [...TWO_PLAYER_PLACEMENTS]);
  assert.deepEqual(sourcePlan.matrices.identityScenarioIds, [...TWO_PLAYER_IDENTITY_SCENARIOS]);
  await rejectsMutation((plan) => { plan.matrices.orderedPersonaPairClasses.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.placementPairIds.reverse(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.identityScenarioIds[0] = "easy-center-only"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.identityTrialCount = 4799; }, /Expected values to be strictly equal/u);
});

test("requires independent per-player actions and all 5600 non-rescuing action trials", async () => {
  assert.deepEqual(sourcePlan.matrices.independentActionScenarioIds, [...TWO_PLAYER_ACTION_SCENARIOS]);
  await rejectsMutation((plan) => { plan.matrices.independentActionScenarioIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.actionCellCount = 279; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.actionTrialCount = 5599; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.pairPlacementScenarioRuntimeOrBestCaseAggregateMayRescueFailure = true; }, /Expected values to be strictly equal/u);
});

test("requires every join, owner, pause-race, global-freeze, recovery, leave, and hard-fault scenario", async () => {
  assert.deepEqual(sourcePlan.matrices.sessionScenarioIds, [...TWO_PLAYER_SESSION_SCENARIOS]);
  for (const required of [
    "equal-update-pause-lower-slot-wins",
    "p2-loss-freezes-entire-game",
    "wrong-track-cannot-silent-reacquire",
    "explicit-nonempty-roster-reduction",
    "tracker-restart-hard-freeze",
    "camera-disconnect-hard-freeze",
  ]) assert.ok(sourcePlan.matrices.sessionScenarioIds.includes(required));
  await rejectsMutation((plan) => { plan.matrices.sessionScenarioIds.splice(7, 1); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.sessionCycleCount = 1919; }, /Expected values to be strictly equal/u);
});

test("requires accessible identity tasks and both runtime surfaces without synthetic rescue", async () => {
  assert.deepEqual(sourcePlan.matrices.accessibleIdentityTaskIds, [...TWO_PLAYER_ACCESSIBLE_TASKS]);
  await rejectsMutation((plan) => { plan.matrices.accessibleIdentityTaskIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.requiredRuntimeSurfaces = ["console-shell"]; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.runtimeSoakDurationMs = 3_599_999; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.measurements.syntheticIdentityOrSessionEvidenceMaySubstitutePhysicalTrials = true; }, /drifted/u);
});

test("requires independent action, menu, freeze-state, and exposure-clock evidence", async () => {
  await rejectsMutation((plan) => { plan.measurements.independentPerPlayerGroundTruthRequired = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.exactActionOwnerRequiredForEveryEvent = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.runtimeStateDigestRequiredBeforeFreezeDuringFreezeAndAfterResume = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.captureArrivalOrInferenceCompletionMayQualifyExposureLatency = true; }, /drifted/u);
});

test("preserves zero-tolerance gates, inherited action gates, and all 17 open thresholds", async () => {
  await rejectsMutation((plan) => { plan.acceptance.maximumIdentitySwitches = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumStateAdvancesDuringFreeze = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.minimumPerPlayerTriggerPrecisionPpm = 949999; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumExposureToCorrectPlayerGameApiP95Us = 120001; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.minimumParticipantPairsPerOrderedClass = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumResidentMemoryBytes = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.aggregateImprovementMayRescueAnyFailedCell = true; }, /Expected values to be strictly equal/u);
});

test("rejects unsafe data, adverse-evidence deletion, premature results, and blocker weakening", async () => {
  await rejectsMutation((plan) => { plan.dataPolicy.rawFramesImagesAudioOrDepthAllowedInRepositoryReleaseOrResult = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.participantNamesStableIdentifiersFacesPortraitsOrProfileIdsAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.adverseAttemptsMayBeDeletedOrHidden = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.executionGate.blockerCodes.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.disposition = "qualified"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.completedIdentityTrialCount = 4800; }, /Expected values to be strictly deep-equal/u);
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  await rejectsMutation((plan) => { plan.hiddenAuthority = true; }, /plan fields drifted/u);
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-two-player-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "qualified",',
    ));
    await assert.rejects(loadTwoPlayerQualificationPlan(duplicate), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(sourcePlan));
    await assert.rejects(loadTwoPlayerQualificationPlan(noncanonical), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]));
    await assert.rejects(loadTwoPlayerQualificationPlan(bom), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(loadTwoPlayerQualificationPlan(invalid), /strict UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, sourceText.replace("\n", "\r"));
    await assert.rejects(loadTwoPlayerQualificationPlan(bareCr), /bare carriage return/u);

    const oversize = resolve(directory, "oversize.json");
    await writeFile(oversize, Buffer.alloc(192 * 1024 + 1, 0x20));
    await assert.rejects(loadTwoPlayerQualificationPlan(oversize), /1 through 196608 bytes/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
