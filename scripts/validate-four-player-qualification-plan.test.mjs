import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  FOUR_PLAYER_ACCESSIBLE_TASKS,
  FOUR_PLAYER_ACTION_SCENARIOS,
  FOUR_PLAYER_BLOCKERS,
  FOUR_PLAYER_IDENTITY_SCENARIOS,
  FOUR_PLAYER_PLACEMENTS,
  FOUR_PLAYER_ROSTER_CLASSES,
  FOUR_PLAYER_SAFETY_SCENARIOS,
  FOUR_PLAYER_SESSION_SCENARIOS,
  loadFourPlayerQualificationPlan,
  validateFourPlayerQualificationPlan,
  validateTrackedFourPlayerQualificationPlan,
} from "./validate-four-player-qualification-plan.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const planPath = resolve(repositoryRoot, "benchmarks/four-player/four-player-qualification-plan-v1.json");
const sourceText = await readFile(planPath, "utf8");
const sourcePlan = JSON.parse(sourceText);

function clone() {
  return structuredClone(sourcePlan);
}

async function rejectsMutation(mutator, pattern) {
  const plan = clone();
  mutator(plan);
  await assert.rejects(validateFourPlayerQualificationPlan(plan, repositoryRoot), pattern);
}

test("accepts the tracked blocked zero-result I-055 plan", async () => {
  assert.deepEqual(await validateTrackedFourPlayerQualificationPlan(), {
    status: "blocked",
    sourceBindingCount: 11,
    rosterClassCount: 16,
    identityTrialCount: 84480,
    actionTrialCount: 92160,
    sessionCycleCount: 23040,
    accessibleIdentityTrialCount: 7680,
    roomSafetyTrialCount: 23040,
    runtimeSoakCount: 192,
    openGateCount: 22,
  });
});

test("closed schema rejects invented qualification and result authority", async () => {
  await rejectsMutation((plan) => { plan.hiddenQualification = true; }, /plan fields drifted/u);
  await rejectsMutation((plan) => { plan.status = "qualified"; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.result.disposition = "qualified"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.fourPlayerProductQualityClaimed = true; }, /Expected values to be strictly deep-equal/u);
});

test("source provenance rejects stale reordered substituted and missing bindings", async () => {
  await rejectsMutation((plan) => { plan.sourceBindings[0].sha256 = "0".repeat(64); }, /digest drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings[1].role = "other-role"; }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.reverse(); }, /identity drifted/u);
  await rejectsMutation((plan) => { plan.sourceBindings.pop(); }, /source binding count/u);
});

test("complete two-player evidence and explicit activation remain mandatory", async () => {
  await rejectsMutation((plan) => { plan.prerequisiteGate.completeTwoPlayerResultSha256 = "1".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.everyRequiredTwoPlayerCellPassed = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.fourPlayerMilestoneExplicitlyActivated = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.twoPlayerResultMayBeReplacedByOnePlayerSyntheticAggregateOrVendorEvidence = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.prerequisiteGate.fourPlayerCollectionMayBeginBeforePrerequisiteClosure = true; }, /must remain false/u);
});

test("API shape and current one-to-two-player evidence cannot become four-player qualification", async () => {
  await rejectsMutation((plan) => { plan.apiAndImplementationBoundary.apiMaxPlayersDeclarationMayQualifyFourPlayerProduct = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.apiAndImplementationBoundary.currentConsoleLabConfiguredPlayerCount = 4; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.apiAndImplementationBoundary.currentValidatedSessionStateMachineMaximumPlayers = 4; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.apiAndImplementationBoundary.fourPlayerJoinCalibrationOwnershipRecoverySemanticsImplemented = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.apiAndImplementationBoundary.syntheticTwoOrThreePersonIdentityEvidenceMayQualifyFourPlayers = true; }, /Expected values to be strictly deep-equal/u);
});

test("target room participant camera runtime purchase and publication authority remain absent", async () => {
  await rejectsMutation((plan) => { plan.authorityBoundary.selectedFourPlayerTargetConfigurationSha256 = "2".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.measuredLargerRoomAndFourPlayerZoneResultSha256 = "3".repeat(64); }, /must remain null/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.childParticipationAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.cameraCollectionAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.purchaseAuthorized = true; }, /must remain false/u);
  await rejectsMutation((plan) => { plan.authorityBoundary.publicationAuthorized = true; }, /must remain false/u);
});

test("four-player identity joining ownership freeze and roster rules remain fail-closed", async () => {
  await rejectsMutation((plan) => { plan.identityAndSessionBoundary.trackerIdsMayIdentifyAuthenticateOrReassociateProfiles = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityAndSessionBoundary.playersJoinSequentiallyFromOneThroughFour = false; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityAndSessionBoundary.colorAloneMayDistinguishPlayers = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityAndSessionBoundary.confirmedLossOfAnyJoinedPlayerFreezesTheEntireGame = false; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.identityAndSessionBoundary.wrongPartialOrSubstituteRosterMayAutoResume = true; }, /Expected values to be strictly deep-equal/u);
});

test("all sixteen ordered child adult roster classes remain exact and unique", async () => {
  assert.deepEqual(sourcePlan.matrices.orderedRosterPersonaClasses, [...FOUR_PLAYER_ROSTER_CLASSES]);
  assert.equal(new Set(sourcePlan.matrices.orderedRosterPersonaClasses).size, 16);
  await rejectsMutation((plan) => { plan.matrices.orderedRosterPersonaClasses.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.orderedRosterPersonaClasses.reverse(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.orderedRosterPersonaClasses[15] = plan.matrices.orderedRosterPersonaClasses[0]; }, /Expected values to be strictly deep-equal/u);
});

test("placements identity scenarios and 84480 identity trials cannot shrink", async () => {
  assert.deepEqual(sourcePlan.matrices.placementQuartetIds, [...FOUR_PLAYER_PLACEMENTS]);
  assert.deepEqual(sourcePlan.matrices.identityScenarioIds, [...FOUR_PLAYER_IDENTITY_SCENARIOS]);
  await rejectsMutation((plan) => { plan.matrices.placementQuartetIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.identityScenarioIds[6] = "easy-static"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.identityCellCount = 4223; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.identityTrialCount = 84479; }, /Expected values to be strictly equal/u);
});

test("independent and simultaneous actions require all 92160 trials", async () => {
  assert.deepEqual(sourcePlan.matrices.independentActionScenarioIds, [...FOUR_PLAYER_ACTION_SCENARIOS]);
  await rejectsMutation((plan) => { plan.matrices.independentActionScenarioIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.actionCellCount = 4607; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.actionTrialCount = 92159; }, /Expected values to be strictly equal/u);
});

test("all join calibration owner freeze recovery leave and fault scenarios remain", async () => {
  assert.deepEqual(sourcePlan.matrices.sessionScenarioIds, [...FOUR_PLAYER_SESSION_SCENARIOS]);
  for (const required of [
    "sequential-join-p1-through-p4",
    "same-update-four-way-pause-lower-slot-wins",
    "p4-loss-freezes-entire-game",
    "partial-roster-cannot-auto-resume",
    "explicit-four-to-two-roster-reduction",
    "tracker-overload-hard-freeze",
  ]) assert.ok(sourcePlan.matrices.sessionScenarioIds.includes(required));
  await rejectsMutation((plan) => { plan.matrices.sessionScenarioIds.splice(11, 1); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.sessionCycleCount = 23039; }, /Expected values to be strictly equal/u);
});

test("accessible identity and physical safety matrices remain complete", async () => {
  assert.deepEqual(sourcePlan.matrices.accessibleIdentityTaskIds, [...FOUR_PLAYER_ACCESSIBLE_TASKS]);
  assert.deepEqual(sourcePlan.matrices.roomSafetyScenarioIds, [...FOUR_PLAYER_SAFETY_SCENARIOS]);
  await rejectsMutation((plan) => { plan.matrices.accessibleIdentityTaskIds.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.roomSafetyScenarioIds.splice(4, 1); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.roomSafetyTrialCount = 23039; }, /Expected values to be strictly equal/u);
});

test("both runtime surfaces and every one-hour soak remain non-rescuing", async () => {
  await rejectsMutation((plan) => { plan.matrices.requiredRuntimeSurfaces = ["console-shell"]; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.matrices.runtimeSoakCellCount = 191; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.runtimeSoakDurationMs = 3_599_999; }, /Expected values to be strictly equal/u);
  await rejectsMutation((plan) => { plan.matrices.rosterPlacementScenarioRuntimeTargetOrBestCaseAggregateMayRescueFailure = true; }, /Expected values to be strictly equal/u);
});

test("independent ground truth exposure timing and adverse evidence remain mandatory", async () => {
  await rejectsMutation((plan) => { plan.measurements.independentPerPlayerAndSafetyGroundTruthRequired = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.exactActionOwnerRequiredForEveryEvent = false; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.captureArrivalOrInferenceCompletionMayQualifyExposureLatency = true; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.selfReportedOrTrackerInferredIdentitySafetyOrCollisionTruthAllowed = true; }, /drifted/u);
  await rejectsMutation((plan) => { plan.measurements.oneOrTwoPlayerResultMayRescueFourPlayerFailure = true; }, /drifted/u);
});

test("zero-tolerance inherited action and D-110 gates cannot weaken", async () => {
  await rejectsMutation((plan) => { plan.acceptance.maximumIdentitySwitches = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumAutomaticPartialRosterResumes = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumPlayerCollisionOrContactEvents = 1; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.minimumPerPlayerTriggerPrecisionPpm = 949999; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumExposureToCorrectPlayerGameApiP95Us = 120001; }, /Expected values to be strictly deep-equal/u);
});

test("all outcome-sensitive cohort room performance thermal and recovery gates remain open", async () => {
  await rejectsMutation((plan) => { plan.acceptance.minimumParticipantQuartetsPerOrderedClass = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.minimumInterPlayerClearanceMm = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.minimumFourPlayerZoneWidthMm = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumResidentMemoryBytes = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.maximumTemperatureMilliC = 1; }, /must remain null/u);
  await rejectsMutation((plan) => { plan.acceptance.aggregateImprovementMayRescueAnyFailedCell = true; }, /Expected values to be strictly equal/u);
});

test("raw media identity biometrics free text egress and adverse deletion remain prohibited", async () => {
  await rejectsMutation((plan) => { plan.dataPolicy.rawFramesImagesAudioOrDepthAllowedInRepositoryReleaseOrResult = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.participantNamesStableIdentifiersFacesPortraitsOrProfileIdsAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.bodyMeasurementsCalibrationVectorsAppearanceEmbeddingsOrIdentityTemplatesAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.networkEgressAllowed = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.dataPolicy.adverseAttemptsStopsFaultsCollisionsOrExcludedQuartetsMayBeDeletedOrHidden = true; }, /Expected values to be strictly deep-equal/u);
});

test("a pass or failure cannot automatically change milestone or product scope", async () => {
  await rejectsMutation((plan) => { plan.decisionProtocol.completePassingEvidenceMayAutomaticallyActivateTheMilestone = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.decisionProtocol.completePassingEvidenceMayAutomaticallyPromiseFourPlayerProductQuality = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.decisionProtocol.failedFourPlayerEvidenceMayAutomaticallyChangeTheProductMaximum = true; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.decisionProtocol.fourPlayerProductDecisionId = "D-999"; }, /Expected values to be strictly deep-equal/u);
});

test("all blockers and the zero-result envelope remain exact", async () => {
  assert.deepEqual(sourcePlan.executionGate.blockerCodes, [...FOUR_PLAYER_BLOCKERS]);
  await rejectsMutation((plan) => { plan.executionGate.blockerCodes.pop(); }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.executionGate.status = "ready"; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.completedIdentityTrialCount = 84480; }, /Expected values to be strictly deep-equal/u);
  await rejectsMutation((plan) => { plan.result.maximumProductPlayersChanged = true; }, /Expected values to be strictly deep-equal/u);
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "vcg-four-player-plan-"));
  try {
    const duplicate = resolve(directory, "duplicate.json");
    await writeFile(duplicate, sourceText.replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "qualified",',
    ));
    await assert.rejects(loadFourPlayerQualificationPlan(duplicate), /canonical two-space JSON/u);

    const noncanonical = resolve(directory, "noncanonical.json");
    await writeFile(noncanonical, JSON.stringify(sourcePlan));
    await assert.rejects(loadFourPlayerQualificationPlan(noncanonical), /canonical two-space JSON/u);

    const bom = resolve(directory, "bom.json");
    await writeFile(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sourceText)]));
    await assert.rejects(loadFourPlayerQualificationPlan(bom), /BOM/u);

    const invalid = resolve(directory, "invalid.json");
    await writeFile(invalid, Buffer.from([0xc3, 0x28]));
    await assert.rejects(loadFourPlayerQualificationPlan(invalid), /strict UTF-8/u);

    const bareCr = resolve(directory, "bare-cr.json");
    await writeFile(bareCr, sourceText.replace("\n", "\r"));
    await assert.rejects(loadFourPlayerQualificationPlan(bareCr), /bare carriage return/u);

    const oversize = resolve(directory, "oversize.json");
    await writeFile(oversize, Buffer.alloc(256 * 1024 + 1, 0x20));
    await assert.rejects(loadFourPlayerQualificationPlan(oversize), /1 through 262144 bytes/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
