import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseConcurrentGameWorkloadPlanBytes,
  validateConcurrentGameWorkloadPlan,
} from "./validate-concurrent-game-workload-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
  ),
);
const tracked = await parseConcurrentGameWorkloadPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked four-workload plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.workloads.length, 4);
  assert.equal(tracked.faultExercises.length, 6);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source binding substitution", async () => {
  const plan = clone();
  plan.sourceBindings[4].sha256 = "0".repeat(64);
  await assert.rejects(validateConcurrentGameWorkloadPlan(plan), /digest drifted/u);
});

test("rejects fabricated target, tracker, model, or clock evidence", async () => {
  for (const mutate of [
    (plan) => { plan.targetBoundary.hostProduct = "Raspberry Pi 5 4GB"; },
    (plan) => { plan.targetBoundary.acceleratorProduct = "Raspberry Pi AI HAT+ 13 TOPS"; },
    (plan) => { plan.targetBoundary.poseModel = "yolov8s_pose"; },
    (plan) => { plan.targetBoundary.receivedBoardRevision = "invented"; },
    (plan) => { plan.trackerBoundary.exposureTimestampAuthority = "capture-arrival"; },
    (plan) => { plan.trackerBoundary.motionQualificationClientSha256 = "a".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects workload identity, version, network, or motion-role substitution", async () => {
  for (const mutate of [
    (plan) => { plan.workloads.reverse(); },
    (plan) => { plan.workloads[1].manifestVersion = "latest"; },
    (plan) => { plan.workloads[2].networkPolicy = "optional"; },
    (plan) => { plan.workloads[3].entrypoint = "https://example.test"; },
    (plan) => { plan.workloads[1].motionRole = "primary-motion-consumer"; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects shorter, passive, partial, or concurrent soak substitution", async () => {
  for (const mutate of [
    (plan) => { plan.workloads[0].minimumMeasuredSeconds = 3599; },
    (plan) => { plan.runProtocol.measuredSecondsPerRun = 3599; },
    (plan) => { plan.runProtocol.warmupSeconds = 0; },
    (plan) => { plan.runProtocol.passiveIdleMayQualify = true; },
    (plan) => { plan.runProtocol.oneWorkloadAtATime = false; },
    (plan) => { plan.runProtocol.backgroundTrackerContinuous = false; },
    (plan) => { plan.runProtocol.cameraCaptureContinuous = false; },
    (plan) => { plan.runProtocol.oneRunIsReliabilityRateEvidence = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("keeps compatibility timing, motion integration, and playability claims separate", async () => {
  for (const mutate of [
    (plan) => { plan.trackerBoundary.compatibilityGamesReceiveMotionFrames = true; },
    (plan) => { plan.trackerBoundary.compatibilityTimingClaim = "all games passed Motion"; },
    (plan) => { plan.acceptance.compatibilityLoadMayEstablishMotionIntegration = true; },
    (plan) => { plan.acceptance.loadOrHeartbeatAloneMayEstablishPlayability = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects metric removal and weakened fixed acceptance gates", async () => {
  for (const mutate of [
    (plan) => { plan.requiredMetrics.pop(); },
    (plan) => { plan.requiredMetrics[1] = plan.requiredMetrics[0]; },
    (plan) => { plan.acceptance.maximumExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumPrivilegedFalseActivations = 1; },
    (plan) => { plan.acceptance.maximumUnrecoveredFailures = 1; },
    (plan) => { plan.acceptance.maximumUnexpectedProcessExitsDuringSoak = 1; },
    (plan) => { plan.acceptance.maximumHostedLaunchToInteractiveMs = 30001; },
    (plan) => { plan.acceptance.maximumOneMeterAcousticsDba = 36; },
    (plan) => { plan.acceptance.everyWorkloadAndFaultCellMustPass = false; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects omitted, reordered, or prematurely populated fault exercises", async () => {
  for (const mutate of [
    (plan) => { plan.faultExercises.pop(); },
    (plan) => { plan.faultExercises.reverse(); },
    (plan) => { plan.faultExercises[3].workloadIds.push("obstacle-motion-sample"); },
    (plan) => { plan.faultExercises[0].requiredOutcome = "camera returns"; },
    (plan) => { plan.faultExercises[1].attemptsPerWorkload = 1; },
    (plan) => { plan.faultExercises[2].maximumRecoveryMs = 5000; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects hidden collection, service mutation, purchase, and fault authority", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawFrameRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.skeletonTraceRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.typedOrGeneratedTextRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.credentialOrTokenUseAuthorized = true; },
    (plan) => { plan.dataPolicy.requestOrResponseBodyRetentionAuthorized = true; },
    (plan) => { plan.executionGate.hardwareAccessAuthorized = true; },
    (plan) => { plan.executionGate.purchaseAuthorized = true; },
    (plan) => { plan.executionGate.participantCollectionAuthorized = true; },
    (plan) => { plan.executionGate.serviceAccountOrMutationAuthorized = true; },
    (plan) => { plan.executionGate.faultInjectionAuthorized = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateConcurrentGameWorkloadPlan(plan));
  }
});

test("rejects blocker drift, premature results, and undeclared fields", async () => {
  const blockers = clone();
  blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validateConcurrentGameWorkloadPlan(blockers));

  const result = clone();
  result.result.disposition = "qualified";
  result.result.completedWorkloads = 4;
  await assert.rejects(validateConcurrentGameWorkloadPlan(result));

  const extra = clone();
  extra.playability = "passed";
  await assert.rejects(validateConcurrentGameWorkloadPlan(extra), /fields drifted/u);
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized bytes", async () => {
  await assert.rejects(
    parseConcurrentGameWorkloadPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseConcurrentGameWorkloadPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseConcurrentGameWorkloadPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
  );
  await assert.rejects(
    parseConcurrentGameWorkloadPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseConcurrentGameWorkloadPlanBytes(Buffer.alloc(128 * 1024 + 1)),
  );
});
