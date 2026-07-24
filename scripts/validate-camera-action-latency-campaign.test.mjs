import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateLatencyPlan,
  validateLatencyResult,
} from "./validate-camera-action-latency-campaign.mjs";

const actions = [
  "player_join",
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_select",
  "menu_back",
  "pause",
];
const digest = "a".repeat(64);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vcg-latency-campaign-"));
  await mkdir(join(root, "benchmarks"), { recursive: true });
  const benchmarkBytes = Buffer.from(
    `${JSON.stringify({
      format: "vcg-motion-benchmark-plan",
      protocolId: "household-one-player-v1",
    })}\n`,
  );
  await writeFile(join(root, "benchmarks", "motion.json"), benchmarkBytes);
  const benchmarkSha256 = createHash("sha256").update(benchmarkBytes).digest("hex");

  const trials = [];
  for (const action of actions) {
    for (let repetition = 1; repetition <= 20; repetition += 1) {
      trials.push({
        id: `center-${action.replaceAll("_", "-")}-${repetition}`,
        cellId: "adult-center",
        action,
        repetition,
      });
    }
  }

  const plan = {
    format: "vcg-camera-action-latency-plan",
    formatVersion: 1,
    campaignId: "owned-x86-camera-latency-v1",
    createdAt: "2026-07-24T17:00:00.000Z",
    motionApiVersion: "0.3.0",
    motionBenchmark: {
      protocolId: "household-one-player-v1",
      repositoryPath: "benchmarks/motion.json",
      sha256: benchmarkSha256,
    },
    configuration: {
      id: "owned-x86-c920-core17",
      targetSha256: digest,
      cameraSha256: digest,
      pipelineSha256: digest,
      workloadSha256: digest,
      roomSha256: digest,
      placementSha256: digest,
      personaProtocolSha256: digest,
    },
    timestampAuthority: {
      exposureSource: "validated-driver-exposure",
      exposureClock: "qpc",
      gameReceiptClock: "qpc",
      clockMappingMethod: "shared-clock",
      clockMappingProofSha256: digest,
      exposureProofSha256: digest,
      maxPerAttemptUncertaintyUs: 5_000,
      independentVisibleResponse: {
        required: false,
        minimumFramesPerSecond: null,
        reasonIfNotRequired: "No independent high-speed camera is available for this fixture.",
      },
    },
    cells: [
      {
        id: "adult-center",
        personaClass: "adult-standing",
        placementId: "center",
        workloadId: "obstacle-sample-concurrent",
      },
    ],
    trials,
    negativeWindows: [
      {
        id: "adult-center-negative",
        cellId: "adult-center",
        durationMs: 900_000,
      },
    ],
    acceptance: {
      maxP95LatencyMs: 120,
      minPrecision: 0.95,
      minRecall: 0.9,
      minTrialsPerAction: 20,
      minNegativeDurationMsPerCell: 900_000,
      privilegedActions: ["menu_back", "pause", "home", "resume", "exit"],
    },
    rawDataPolicy: {
      containsRawFrames: false,
      rawVideoDefault: false,
      traceKind: "skeleton-and-events-only",
    },
  };
  const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(root, "benchmarks", "plan.json"), planBytes);

  let clockNs = 1_000_000_000;
  const attempts = plan.trials.map((trial) => {
    const exposureTimestampNs = clockNs;
    clockNs += 1_000_000_000;
    return {
      id: trial.id,
      status: "completed",
      invalidReason: null,
      exposureTimestampNs,
      timestampUncertaintyUs: 1_000,
      droppedFrames: 0,
      events: [
        {
          action: trial.action,
          phase: "triggered",
          gameReceiptTimestampNs: exposureTimestampNs + 99_000_000,
        },
      ],
    };
  });
  const result = {
    format: "vcg-camera-action-latency-result",
    formatVersion: 1,
    campaignId: plan.campaignId,
    createdAt: "2026-07-24T18:00:00.000Z",
    planPath: "benchmarks/plan.json",
    planSha256: createHash("sha256").update(planBytes).digest("hex"),
    configurationId: plan.configuration.id,
    timestampProof: {
      exposureSource: plan.timestampAuthority.exposureSource,
      exposureClock: plan.timestampAuthority.exposureClock,
      gameReceiptClock: plan.timestampAuthority.gameReceiptClock,
      clockMappingMethod: plan.timestampAuthority.clockMappingMethod,
      clockMappingProofSha256: plan.timestampAuthority.clockMappingProofSha256,
      exposureProofSha256: plan.timestampAuthority.exposureProofSha256,
    },
    cellEvidence: [
      {
        cellId: "adult-center",
        skeletonTraceSha256: digest,
        groundTruthSha256: digest,
        workloadTraceSha256: digest,
        systemTraceSha256: digest,
      },
    ],
    attempts,
    negativeWindows: [
      {
        id: "adult-center-negative",
        completed: true,
        startTimestampNs: 0,
        endTimestampNs: 900_000_000_000,
        droppedFrames: 0,
        events: [],
      },
    ],
    independentVisibleResponse: {
      status: "not-run",
      evidenceSha256: null,
      observedFramesPerSecond: null,
      sampleCount: 0,
    },
  };

  return { root, plan, planBytes, result };
}

test("qualifies the declared cells for a complete conservative 100 ms result", async () => {
  const { root, plan, planBytes, result } = await fixture();
  const score = await validateLatencyResult(result, plan, planBytes, root);
  assert.equal(score.status, "qualified-cells");
  assert.equal(score.cells[0].actions[0].latencyMs.p95, 100);
});

test("requires exactly twenty trials for every Motion action and cell", async () => {
  const { root, plan } = await fixture();
  plan.trials.pop();
  await assert.rejects(validateLatencyPlan(plan, root), /exactly minTrialsPerAction/);
});

test("rejects a substituted motion benchmark", async () => {
  const { root, plan } = await fixture();
  await writeFile(join(root, "benchmarks", "motion.json"), "{}\n");
  await assert.rejects(validateLatencyPlan(plan, root), /motionBenchmark.sha256/);
});

test("rejects plan path traversal before loading evidence", async () => {
  const { root, plan } = await fixture();
  plan.motionBenchmark.repositoryPath = "../motion.json";
  await assert.rejects(validateLatencyPlan(plan, root), /normalized repository-relative/);
});

test("requires actual exposure authority rather than capture arrival", async () => {
  const { root, plan } = await fixture();
  plan.timestampAuthority.exposureSource = "capture-arrival";
  await assert.rejects(validateLatencyPlan(plan, root), /not exposure-authoritative/);
});

test("requires shared-clock identifiers to match", async () => {
  const { root, plan } = await fixture();
  plan.timestampAuthority.gameReceiptClock = "another-clock";
  await assert.rejects(validateLatencyPlan(plan, root), /shared-clock requires identical/);
});

test("binds result bytes to the exact plan", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.planSha256 = "b".repeat(64);
  await assert.rejects(
    validateLatencyResult(result, plan, planBytes, root),
    /result.planSha256/,
  );
});

test("requires one complete evidence digest set per cell", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.cellEvidence = [];
  await assert.rejects(
    validateLatencyResult(result, plan, planBytes, root),
    /exactly one entry per qualification cell/,
  );
});

test("uses nearest-rank p95 and rejects two slow attempts out of twenty", async () => {
  const { root, plan, planBytes, result } = await fixture();
  const jumpAttempts = result.attempts.filter((attempt) => attempt.id.includes("-jump-"));
  for (const attempt of jumpAttempts.slice(-2)) {
    attempt.events[0].gameReceiptTimestampNs = attempt.exposureTimestampNs + 120_000_000;
  }
  const score = await validateLatencyResult(result, plan, planBytes, root);
  const jump = score.cells[0].actions.find((action) => action.action === "jump");
  assert.equal(jump.latencyMs.p95, 121);
  assert.equal(jump.pass, false);
  assert.equal(score.status, "rejected");
});

test("adds declared timestamp uncertainty as a conservative upper bound", async () => {
  const { root, plan, planBytes, result } = await fixture();
  const jumpAttempts = result.attempts.filter((attempt) => attempt.id.includes("-jump-"));
  for (const attempt of jumpAttempts.slice(-2)) {
    attempt.timestampUncertaintyUs = 5_000;
    attempt.events[0].gameReceiptTimestampNs = attempt.exposureTimestampNs + 116_000_000;
  }
  const score = await validateLatencyResult(result, plan, planBytes, root);
  const jump = score.cells[0].actions.find((action) => action.action === "jump");
  assert.equal(jump.latencyMs.p95, 121);
  assert.equal(score.status, "rejected");
});

test("counts wrong and duplicate events as false positives", async () => {
  const { root, plan, planBytes, result } = await fixture();
  const jumpAttempts = result.attempts.filter((attempt) => attempt.id.includes("-jump-"));
  for (const attempt of jumpAttempts.slice(0, 2)) {
    attempt.events.push({
      action: "duck",
      phase: "triggered",
      gameReceiptTimestampNs: attempt.exposureTimestampNs + 100_000_000,
    });
  }
  const score = await validateLatencyResult(result, plan, planBytes, root);
  const duck = score.cells[0].actions.find((action) => action.action === "duck");
  assert.equal(duck.falsePositives, 2);
  assert.equal(duck.precision, 20 / 22);
  assert.equal(score.status, "rejected");
});

test("preserves invalid attempts and makes the campaign incomplete", async () => {
  const { root, plan, planBytes, result } = await fixture();
  Object.assign(result.attempts[0], {
    status: "invalid",
    invalidReason: "participant stopped for safety",
    exposureTimestampNs: null,
    timestampUncertaintyUs: null,
    events: [],
  });
  const score = await validateLatencyResult(result, plan, planBytes, root);
  assert.equal(score.status, "incomplete");
});

test("records drops without silently deleting the attempt", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.attempts[0].droppedFrames = 3;
  result.negativeWindows[0].droppedFrames = 2;
  const score = await validateLatencyResult(result, plan, planBytes, root);
  assert.equal(score.totalDroppedFrames, 5);
  assert.equal(score.status, "qualified-cells");
});

test("rejects a privileged activation in the negative window", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.negativeWindows[0].events.push({
    name: "pause",
    receiptTimestampNs: 10_000,
  });
  const score = await validateLatencyResult(result, plan, planBytes, root);
  assert.equal(score.privilegedFalseActivations.length, 1);
  assert.equal(score.status, "rejected");
});

test("rejects a claimed complete negative window shorter than planned", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.negativeWindows[0].endTimestampNs = 899_999_999_999;
  await assert.rejects(
    validateLatencyResult(result, plan, planBytes, root),
    /shorter than its planned duration/,
  );
});

test("requires a planned visible-response cross-check to run", async () => {
  const { root, plan, result } = await fixture();
  plan.timestampAuthority.independentVisibleResponse = {
    required: true,
    minimumFramesPerSecond: 240,
    reasonIfNotRequired: null,
  };
  const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  result.planSha256 = createHash("sha256").update(planBytes).digest("hex");
  const score = await validateLatencyResult(result, plan, planBytes, root);
  assert.equal(score.status, "incomplete");
});

test("rejects receipt timestamps before exposure", async () => {
  const { root, plan, planBytes, result } = await fixture();
  result.attempts[0].events[0].gameReceiptTimestampNs =
    result.attempts[0].exposureTimestampNs - 1;
  await assert.rejects(
    validateLatencyResult(result, plan, planBytes, root),
    /gameReceiptTimestampNs/,
  );
});

test("rejects raw-frame collection claims", async () => {
  const { root, plan } = await fixture();
  plan.rawDataPolicy.containsRawFrames = true;
  await assert.rejects(validateLatencyPlan(plan, root), /containsRawFrames/);
});
