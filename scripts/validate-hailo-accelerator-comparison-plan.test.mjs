import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseHailoAcceleratorComparisonPlanBytes,
  validateHailoAcceleratorComparisonPlan,
} from "./validate-hailo-accelerator-comparison-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(root, "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json"),
);
const tracked = await parseHailoAcceleratorComparisonPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked zero-result accelerator plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.variants.length, 2);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source binding substitution", async () => {
  const plan = clone();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateHailoAcceleratorComparisonPlan(plan), /digest drifted/u);
});

test("rejects host, accelerator, model, or landmark substitution", async () => {
  for (const mutate of [
    (plan) => { plan.fixedHostBoundary.boardProduct = "Raspberry Pi 5 4GB"; },
    (plan) => { plan.variants[0].architecture = "hailo8"; },
    (plan) => { plan.variants[1].defaultPoseModel = "yolov8s_pose"; },
    (plan) => { plan.variants[1].landmarkLayout = "MediaPipe-33"; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateHailoAcceleratorComparisonPlan(plan));
  }
});

test("rejects hidden received identity, runtime, model, cost, or schedule", async () => {
  for (const mutate of [
    (plan) => { plan.fixedHostBoundary.boardRevision = "invented"; },
    (plan) => { plan.variants[0].hefSha256 = "a".repeat(64); },
    (plan) => { plan.variants[1].sameDateDeliveredCostUsd = 110; },
    (plan) => { plan.comparisonLanes[0].coldStartCount = 1; },
    (plan) => { plan.comparisonLanes[1].scheduleSha256 = "b".repeat(64); },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateHailoAcceleratorComparisonPlan(plan), /blocked/u);
  }
});

test("keeps replay and live timing claims separate", async () => {
  const replay = clone();
  replay.comparisonLanes[0].timingBoundary =
    "camera exposure to action receipt";
  await assert.rejects(validateHailoAcceleratorComparisonPlan(replay));
  const live = clone();
  live.comparisonLanes[1].inputRule = "identical live input on both variants";
  await assert.rejects(validateHailoAcceleratorComparisonPlan(live));
});

test("rejects missing, duplicate, or reordered lanes, workloads, and metrics", async () => {
  for (const mutate of [
    (plan) => { plan.comparisonLanes.pop(); },
    (plan) => { plan.comparisonLanes.reverse(); },
    (plan) => { plan.requiredWorkloads.reverse(); },
    (plan) => { plan.requiredMetrics[1] = plan.requiredMetrics[0]; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateHailoAcceleratorComparisonPlan(plan));
  }
});

test("rejects weakened latency, safety, every-cell, or selection rules", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumLiveExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumPrivilegedFalseActivations = 1; },
    (plan) => { plan.acceptance.everyBlockingCellMustPass = false; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.selectionPolicy.automaticSelectionAllowed = true; },
    (plan) => { plan.selectionPolicy.selectedVariantId = plan.variants[0].variantId; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateHailoAcceleratorComparisonPlan(plan));
  }
});

test("rejects hidden collection, purchase, and retained-data authority", async () => {
  for (const mutate of [
    (plan) => { plan.executionGate.hardwareAccessAuthorized = true; },
    (plan) => { plan.executionGate.purchaseAuthorized = true; },
    (plan) => { plan.executionGate.participantCollectionAuthorized = true; },
    (plan) => { plan.dataPolicy.rawReplayCorpusRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.liveRawFrameRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.audioCollectionAuthorized = true; },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateHailoAcceleratorComparisonPlan(plan));
  }
});

test("rejects blockers, premature result, and undeclared fields", async () => {
  const blockers = clone();
  blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validateHailoAcceleratorComparisonPlan(blockers));
  const result = clone();
  result.result.disposition = "qualified";
  await assert.rejects(validateHailoAcceleratorComparisonPlan(result));
  const extra = clone();
  extra.conclusion = "13 TOPS wins";
  await assert.rejects(validateHailoAcceleratorComparisonPlan(extra), /fields drifted/u);
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized bytes", async () => {
  await assert.rejects(
    parseHailoAcceleratorComparisonPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseHailoAcceleratorComparisonPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseHailoAcceleratorComparisonPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
  );
  await assert.rejects(
    parseHailoAcceleratorComparisonPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseHailoAcceleratorComparisonPlanBytes(Buffer.alloc(96 * 1024 + 1)),
  );
});
