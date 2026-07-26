import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePi5CpuOnlyPoseGamePlanBytes,
  validatePi5CpuOnlyPoseGamePlan,
} from "./validate-pi5-cpu-only-pose-game-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(root, "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json"),
);
const tracked = await parsePi5CpuOnlyPoseGamePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-014 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.lanes.length, 2);
  assert.equal(tracked.workloads.length, 5);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source binding substitution", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan), /digest drifted/u);
});

test("rejects target, backend, runtime, and result invention", async () => {
  for (const mutate of [
    (plan) => { plan.targetBoundary.boardProduct = "Raspberry Pi 4"; },
    (plan) => { plan.targetBoundary.receivedBoardRevision = "invented"; },
    (plan) => { plan.targetBoundary.cpuPoseBackend = "mediapipe"; },
    (plan) => { plan.targetBoundary.godotArm64BuildSha256 = "a".repeat(64); },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("requires proof boundaries for genuinely CPU-only inference", async () => {
  for (const mutate of [
    (plan) => { plan.cpuOnlyBoundary.poseInferenceProcessor = "gpu"; },
    (plan) => { plan.cpuOnlyBoundary.acceleratorRuntimeAvailableToTracker = true; },
    (plan) => { plan.cpuOnlyBoundary.gpuOrNpuPoseDelegationAllowed = true; },
    (plan) => { plan.cpuOnlyBoundary.acceleratorPhysicalState = "removed"; },
    (plan) => { plan.cpuOnlyBoundary.acceleratorNonUseProofSha256 = "b".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("keeps replay and live timing claims separate", async () => {
  const replay = clone();
  replay.lanes[0].timingBoundary = "camera exposure to action receipt";
  await assert.rejects(validatePi5CpuOnlyPoseGamePlan(replay));
  const live = clone();
  live.lanes[1].inputRule = "identical live performance on every run";
  await assert.rejects(validatePi5CpuOnlyPoseGamePlan(live));
});

test("rejects missing, duplicate, reordered, or weakened workload coverage", async () => {
  for (const mutate of [
    (plan) => { plan.lanes.reverse(); },
    (plan) => { plan.workloads.pop(); },
    (plan) => { plan.workloads.reverse(); },
    (plan) => { plan.workloads[1].runtime = "local-web"; },
    (plan) => { plan.workloads[2].motionRole = "primary-motion-consumer"; },
    (plan) => { plan.requiredMetrics[1] = plan.requiredMetrics[0]; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("rejects weakened duration, latency, safety, and evidence rules", async () => {
  for (const mutate of [
    (plan) => { plan.lanes[0].measuredSeconds = 3599; },
    (plan) => { plan.acceptance.maximumLiveExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumPrivilegedFalseActivations = 1; },
    (plan) => { plan.acceptance.maximumOneMeterAcousticsDba = 36; },
    (plan) => { plan.acceptance.everyLaneWorkloadCellMustPass = false; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.replayTimingMayQualifyExposureLatency = true; },
    (plan) => { plan.acceptance.loadOrHeartbeatMayEstablishPlayability = true; },
    (plan) => { plan.acceptance.compatibilityLoadMayEstablishMotionIntegration = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("rejects post-result numeric gates and hidden execution authority", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.minimumPoseFps = 1; },
    (plan) => { plan.acceptance.maximumWallPowerW = 50; },
    (plan) => { plan.executionGate.hardwareAccessAuthorized = true; },
    (plan) => { plan.executionGate.imageOrStorageMutationAuthorized = true; },
    (plan) => { plan.executionGate.participantCollectionAuthorized = true; },
    (plan) => { plan.executionGate.hostedServiceUseAuthorized = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("rejects retained sensitive data and premature per-workload evidence", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawReplayCorpusRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.liveRawFrameRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.audioRecordingAuthorized = true; },
    (plan) => { plan.dataPolicy.credentialOrTokenUseAuthorized = true; },
    (plan) => { plan.workloads[0].interactionProtocolSha256 = "c".repeat(64); },
    (plan) => { plan.workloads[1].buildOrSessionSha256 = "d".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5CpuOnlyPoseGamePlan(plan));
  }
});

test("rejects blocker drift, undeclared fields, and noncanonical bytes", async () => {
  const blockers = clone();
  blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validatePi5CpuOnlyPoseGamePlan(blockers));
  const extra = clone();
  extra.conclusion = "Pi CPU is fast enough";
  await assert.rejects(validatePi5CpuOnlyPoseGamePlan(extra), /fields drifted/u);
  await assert.rejects(
    parsePi5CpuOnlyPoseGamePlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
});

test("rejects duplicate JSON keys, BOM, invalid UTF-8, and oversized bytes", async () => {
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parsePi5CpuOnlyPoseGamePlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parsePi5CpuOnlyPoseGamePlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
  );
  await assert.rejects(
    parsePi5CpuOnlyPoseGamePlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parsePi5CpuOnlyPoseGamePlanBytes(Buffer.alloc(96 * 1024 + 1)),
  );
});
