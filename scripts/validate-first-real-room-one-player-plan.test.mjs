import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIRST_REAL_ROOM_PERSONAS,
  FIRST_REAL_ROOM_PLACEMENTS,
  FIRST_REAL_ROOM_TRIAL_BLOCKS,
  parseFirstRealRoomOnePlayerPlanBytes,
  validateFirstRealRoomOnePlayerPlan,
} from "./validate-first-real-room-one-player-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(
  root,
  "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json",
));
const tracked = await parseFirstRealRoomOnePlayerPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-053/I-210 campaign without collection authority", () => {
  assert.equal(tracked.status, "blocked");
  assert.deepEqual(tracked.matrix.blockingPersonaClasses, [...FIRST_REAL_ROOM_PERSONAS]);
  assert.deepEqual(tracked.matrix.placementIds, [...FIRST_REAL_ROOM_PLACEMENTS]);
  assert.deepEqual(tracked.matrix.benchmarkTrialBlockIds, [...FIRST_REAL_ROOM_TRIAL_BLOCKS]);
  assert.equal(tracked.matrix.requiredBenchmarkRunCount, 10);
  assert.equal(tracked.matrix.requiredBenchmarkAttemptCount, 2800);
  assert.equal(tracked.matrix.requiredNegativeSessionCount, 10);
});

test("rejects source substitution and stale source bytes", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan), /digest drifted/u);
});

test("rejects invented room, participant, camera, and diagnostic authority", async () => {
  for (const mutate of [
    (plan) => { plan.collectionBoundary.roomSurveyResultSha256 = "a".repeat(64); },
    (plan) => { plan.collectionBoundary.cameraConfigurationSha256 = "b".repeat(64); },
    (plan) => { plan.collectionBoundary.adultParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.childParticipationAuthorized = true; },
    (plan) => { plan.collectionBoundary.cameraCollectionAuthorized = true; },
    (plan) => { plan.collectionBoundary.temporaryDiagnosticImageCollectionAuthorized = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("preserves both personas, five placements, every block, and all 2800 attempts", async () => {
  for (const mutate of [
    (plan) => { plan.matrix.blockingPersonaClasses.pop(); },
    (plan) => { plan.matrix.blockingPersonaClasses.reverse(); },
    (plan) => { plan.matrix.placementIds.pop(); },
    (plan) => { plan.matrix.placementIds.reverse(); },
    (plan) => { plan.matrix.benchmarkTrialBlockIds.pop(); },
    (plan) => { plan.matrix.benchmarkTrialBlockIds.reverse(); },
    (plan) => { plan.matrix.requiredBenchmarkRunCount = 9; },
    (plan) => { plan.matrix.requiredBenchmarkAttemptsPerRun = 279; },
    (plan) => { plan.matrix.requiredBenchmarkAttemptCount = 2799; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("preserves ten independent 15-minute negative sessions and no aggregate rescue", async () => {
  for (const mutate of [
    (plan) => { plan.matrix.negativeSessionDurationMs = 899999; },
    (plan) => { plan.matrix.requiredNegativeSessionCount = 1; },
    (plan) => { plan.matrix.aggregateMayRescueFailedPersonaPlacement = true; },
    (plan) => { plan.acceptance.personaPlacementOrLightingAggregateMayRescueFailure = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("preserves action, recovery, pose stability, and exposure-latency measurements", async () => {
  for (const mutate of [
    (plan) => { plan.measurements.requiredMetrics.pop(); },
    (plan) => { plan.measurements.requiredMetrics.reverse(); },
    (plan) => { plan.measurements.benchmarkResultRequiredPerPersonaPlacement = false; },
    (plan) => { plan.measurements.actionLatencyResultRequiredPerPersonaPlacement = false; },
    (plan) => { plan.measurements.negativeSessionEvidenceRequiredPerPersonaPlacement = false; },
    (plan) => { plan.measurements.everyScheduledAttemptAndFailureMustRemainVisible = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("rejects weakened action gates and dishonest timing substitutions", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.minimumTriggerPrecisionPpm = 949999; },
    (plan) => { plan.acceptance.minimumTriggerRecallPpm = 899999; },
    (plan) => { plan.acceptance.maximumUnintendedPrivilegedActionsPerNegativeSession = 1; },
    (plan) => { plan.acceptance.maximumExposureToGameApiP95Us = 120001; },
    (plan) => { plan.acceptance.maximumInvalidBenchmarkAttemptsPerRun = 1; },
    (plan) => { plan.measurements.captureArrivalMayQualifyExposureLatency = true; },
    (plan) => { plan.measurements.streamActiveMayEstablishFirstUsefulFrameOrOpticalUsability = true; },
    (plan) => { plan.acceptance.capturePolicyResultMaySubstituteActionEvidence = true; },
    (plan) => { plan.acceptance.inferenceOrCaptureArrivalLatencyMaySubstituteExposureLatency = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("rejects invented open pose gates, unsafe data, weakened blockers, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.minimumPoseFpsMilliHz = 30000; },
    (plan) => { plan.acceptance.minimumCore17CoveragePpm = 950000; },
    (plan) => { plan.acceptance.maximumCore17NormalizedJitterMilliTorso = 20; },
    (plan) => { plan.dataPolicy.rawRoomVideoAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.rawFramesAllowedInRepositoryOrRelease = true; },
    (plan) => { plan.dataPolicy.participantNamesOrStableIdentifiersAllowed = true; },
    (plan) => { plan.dataPolicy.faceTemplatesOrBodyProfileVectorsAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedBenchmarkRunCount = 10; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateFirstRealRoomOnePlayerPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.roomName = "private";
  await assert.rejects(validateFirstRealRoomOnePlayerPlan(extra), /fields drifted/u);
  await assert.rejects(
    parseFirstRealRoomOnePlayerPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseFirstRealRoomOnePlayerPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseFirstRealRoomOnePlayerPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseFirstRealRoomOnePlayerPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(parseFirstRealRoomOnePlayerPlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
