import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  POSE_EDGE_ACCURACY_RESULT_FORMAT,
  POSE_EDGE_BACKENDS,
  POSE_EDGE_BLOCKING_PERSONAS,
  POSE_EDGE_LANDMARKS,
  POSE_EDGE_POSITIONS,
  POSE_EDGE_POSTURES,
  parsePoseEdgeAccuracyPlanBytes,
  parsePoseEdgeAccuracyResultBytes,
  validatePoseEdgeAccuracyResult,
} from "./validate-pose-edge-accuracy-campaign.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json",
);
const trackedPlanBytes = await readFile(planPath);
const trackedPlan = parsePoseEdgeAccuracyPlanBytes(trackedPlanBytes);
const digest = (character) => character.repeat(64);
const clone = (value) => structuredClone(value);
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const parsePlan = (value) => parsePoseEdgeAccuracyPlanBytes(canonicalBytes(value));

function readyPlan() {
  const plan = clone(trackedPlan.value);
  plan.qualification = "collection-authorized-plan";
  plan.collectionGate = {
    status: "ready",
    targetId: "owned-x86-camera-fixture",
    cameraConfigurationSha256: digest("a"),
    roomGeometrySha256: digest("b"),
    placementProtocolSha256: digest("c"),
    personaProtocolSha256: digest("d"),
    groundTruthProtocolSha256: digest("e"),
    groundTruthAuthority: "independent-manual-annotation",
    timestampProofSha256: digest("f"),
    dataHandlingProtocolSha256: digest("1"),
    blockerCodes: [],
  };
  plan.acceptance = {
    minimumDetectionRate: 0.95,
    maximumMissingRatePerLandmark: 0.05,
    maximumP95NormalizedErrorPerLandmark: 0.08,
    maximumWorstNormalizedErrorPerLandmark: 0.15,
    maximumOutlierRatePerLandmark: 0.05,
  };
  plan.dataPolicy.temporaryImageGroundTruthCollectionAuthorized = true;
  plan.claimBoundary =
    "This ready test fixture binds one exact target, camera, room, placement, persona, ground-truth, timestamp, and data-handling protocol. It authorizes only the pre-registered physical campaign and no broader product claim.";
  return plan;
}

function passingResult(planEnvelope) {
  const cells = [];
  for (const backendId of POSE_EDGE_BACKENDS) {
    for (const personaClass of POSE_EDGE_BLOCKING_PERSONAS) {
      for (const positionId of POSE_EDGE_POSITIONS) {
        for (const postureId of POSE_EDGE_POSTURES) {
          cells.push({
            backendId,
            personaClass,
            positionId,
            postureId,
            validTrials: 20,
            detectionCount: 20,
            landmarks: POSE_EDGE_LANDMARKS.map((landmark) => ({
              landmark,
              comparedCount: 20,
              missingCount: 0,
              outlierCount: 0,
              p50NormalizedError: 0.02,
              p95NormalizedError: 0.04,
              worstNormalizedError: 0.08,
            })),
            traceSha256: digest("2"),
            labelSha256: digest("3"),
          });
        }
      }
    }
  }
  return {
    format: POSE_EDGE_ACCURACY_RESULT_FORMAT,
    campaignId: planEnvelope.value.campaignId,
    planSha256: planEnvelope.sha256,
    startedAt: "2026-08-01T18:00:00.000Z",
    completedAt: "2026-08-01T20:00:00.000Z",
    disposition: "pass",
    cells,
    summary: {
      cellCount: 126,
      passingCellCount: 126,
      failingCellCount: 0,
      validTrialCount: 2_520,
      participantCount: 2,
      realCameraTrialCount: 2_520,
    },
    dataDisposition: {
      rawFramesRetained: false,
      rawRoomVideoRetained: false,
      skeletonOnlyReleaseArtifact: true,
      participantIdentifiersRetained: false,
      groundTruthLabelsRetained: true,
    },
    claimBoundary:
      "This result qualifies only the exact hash-bound camera, room, participants, protocols, MediaPipe backend, and acceptance gates in its plan. It is not target-wide, gameplay, latency, safety, or population evidence.",
    limitations: [
      "Only the exact bound camera and first-room geometry were exercised.",
      "The exploratory seated persona is outside the blocking disposition.",
      "Pose landmark accuracy does not establish gameplay action accuracy.",
      "This result does not qualify latency, safety, or another backend.",
    ],
  };
}

function assertPlanRejected(mutate, pattern) {
  const plan = readyPlan();
  mutate(plan);
  assert.throws(() => parsePlan(plan), pattern);
}

function assertResultRejected(mutate, pattern) {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  mutate(result, plan);
  assert.throws(() => validatePoseEdgeAccuracyResult(plan, result), pattern);
}

test("accepts the tracked blocked plan without granting collection authority", () => {
  assert.equal(trackedPlan.value.collectionGate.status, "blocked");
  assert.equal(trackedPlan.value.matrix.scheduledBlockingCellCount, 126);
  assert.equal(trackedPlan.value.matrix.scheduledBlockingTrialCount, 2_520);
  assert.equal(
    trackedPlan.value.dataPolicy.temporaryImageGroundTruthCollectionAuthorized,
    false,
  );
  assert.throws(
    () => validatePoseEdgeAccuracyResult(trackedPlan, {}),
    /blocked plan cannot accept a result/,
  );
});

test("normalizes LF and CRLF plan bytes to the same digest", () => {
  const lf = parsePoseEdgeAccuracyPlanBytes(trackedPlanBytes);
  const crlf = parsePoseEdgeAccuracyPlanBytes(
    Buffer.from(trackedPlanBytes.toString("utf8").replaceAll("\n", "\r\n")),
  );
  assert.equal(crlf.sha256, lf.sha256);
});

test("accepts an exact ready plan and complete passing result", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  assert.equal(validatePoseEdgeAccuracyResult(plan, result), result);
  assert.deepEqual(
    parsePoseEdgeAccuracyResultBytes(plan, canonicalBytes(result)).value,
    result,
  );
});

test("rejects matrix omissions, reordering, and weakened trial counts", () => {
  assertPlanRejected(
    (plan) => plan.matrix.positionIds.pop(),
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => plan.matrix.postureIds.reverse(),
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => plan.matrix.blockingPersonaClasses.reverse(),
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => { plan.matrix.minimumValidTrialsPerCell = 19; },
    /19 !== 20/,
  );
});

test("rejects hidden bindings or thresholds in a blocked plan", () => {
  const hiddenBinding = clone(trackedPlan.value);
  hiddenBinding.collectionGate.targetId = "quiet-camera-binding";
  assert.throws(() => parsePlan(hiddenBinding), /actual: 'quiet-camera-binding'|quiet-camera-binding/);

  const hiddenThreshold = clone(trackedPlan.value);
  hiddenThreshold.acceptance.minimumDetectionRate = 0.95;
  assert.throws(() => parsePlan(hiddenThreshold), /0.95 !== null/);
});

test("rejects a ready plan without exact authority, hashes, or image policy", () => {
  assertPlanRejected(
    (plan) => { plan.collectionGate.groundTruthAuthority = "candidate-output"; },
    /ground-truth authority is unsupported/,
  );
  assertPlanRejected(
    (plan) => { plan.collectionGate.cameraConfigurationSha256 = digest("A"); },
    /lowercase SHA-256/,
  );
  assertPlanRejected(
    (plan) => {
      plan.dataPolicy.temporaryImageGroundTruthCollectionAuthorized = false;
    },
    /must explicitly authorize/,
  );
});

test("rejects raw retention, participant identifiers, and free text", () => {
  assertPlanRejected(
    (plan) => { plan.dataPolicy.rawRoomVideoDefault = true; },
    /true !== false/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.retainedRawFrameCountLimit = 1; },
    /1 !== 0/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.participantIdentifiersAllowed = true; },
    /true !== false/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.freeTextAllowed = true; },
    /true !== false/,
  );
});

test("rejects unknown fields, noncanonical JSON, malformed UTF-8, and oversize", () => {
  const extra = clone(trackedPlan.value);
  extra.surprise = true;
  assert.throws(() => parsePlan(extra), /plan keys must be exactly/);
  assert.throws(
    () => parsePoseEdgeAccuracyPlanBytes(Buffer.from(JSON.stringify(trackedPlan.value))),
    /canonical two-space JSON/,
  );
  assert.throws(
    () => parsePoseEdgeAccuracyPlanBytes(Uint8Array.from([0xc3, 0x28])),
    /encoded data was not valid|encoding/i,
  );
  assert.throws(
    () => parsePoseEdgeAccuracyPlanBytes(Buffer.alloc(64 * 1_024 + 1, 0x20)),
    /byte size is invalid/,
  );
});

test("rejects a forged plan envelope or mismatched result plan hash", () => {
  const plan = parsePlan(readyPlan());
  const forged = { value: plan.value, sha256: digest("9") };
  assert.throws(
    () => validatePoseEdgeAccuracyResult(forged, passingResult(plan)),
    /does not match its canonical value/,
  );
  assertResultRejected(
    (result) => { result.planSha256 = digest("8"); },
    /Expected values to be strictly equal/,
  );
});

test("rejects omitted, duplicated, or reordered blocking cells", () => {
  assertResultRejected(
    (result) => result.cells.pop(),
    /result cells must be an array with exactly 126 entries/,
  );
  assertResultRejected(
    (result) => { result.cells[1] = clone(result.cells[0]); },
    /identity or order changed/,
  );
  assertResultRejected(
    (result) => { [result.cells[0], result.cells[1]] = [result.cells[1], result.cells[0]]; },
    /identity or order changed/,
  );
});

test("rejects invalid landmark accounting and non-monotonic statistics", () => {
  assertResultRejected(
    (result) => { result.cells[0].landmarks[0].missingCount = 1; },
    /trial accounting mismatch/,
  );
  assertResultRejected(
    (result) => {
      result.cells[0].detectionCount = 19;
      result.cells[0].landmarks[0].comparedCount = 20;
    },
    /comparisons exceed detected trials/,
  );
  assertResultRejected(
    (result) => {
      result.cells[0].landmarks[0].p95NormalizedError = 0.01;
    },
    /non-monotonic/,
  );
});

test("rejects aggregate rescue of one failed edge cell", () => {
  assertResultRejected(
    (result) => {
      const edgeCell = result.cells.find(
        ({ positionId }) => positionId === "left-distortion-edge",
      );
      edgeCell.landmarks[0].p95NormalizedError = 0.12;
      edgeCell.landmarks[0].worstNormalizedError = 0.12;
    },
    /disposition does not match per-cell gates/,
  );
});

test("accepts an honest failing disposition but rejects summary drift", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  result.cells[0].detectionCount = 18;
  for (const landmark of result.cells[0].landmarks) {
    landmark.comparedCount = 18;
    landmark.missingCount = 2;
  }
  result.disposition = "fail";
  result.summary.passingCellCount = 125;
  result.summary.failingCellCount = 1;
  assert.equal(validatePoseEdgeAccuracyResult(plan, result), result);

  result.summary.validTrialCount -= 1;
  assert.throws(
    () => validatePoseEdgeAccuracyResult(plan, result),
    /Expected values to be strictly deep-equal/,
  );
});

test("rejects retained raw material or identity-bearing result artifacts", () => {
  assertResultRejected(
    (result) => { result.dataDisposition.rawFramesRetained = true; },
    /Expected values to be strictly deep-equal/,
  );
  assertResultRejected(
    (result) => {
      result.dataDisposition.participantIdentifiersRetained = true;
    },
    /Expected values to be strictly deep-equal/,
  );
  assertResultRejected(
    (result) => { result.dataDisposition.skeletonOnlyReleaseArtifact = false; },
    /Expected values to be strictly deep-equal/,
  );
});
