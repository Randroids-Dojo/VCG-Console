import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPlanPath = resolve(
  root,
  "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json",
);
const MAX_PLAN_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const POSE_EDGE_ACCURACY_PLAN_FORMAT =
  "vcg-pose-edge-accuracy-plan/v1";
export const POSE_EDGE_ACCURACY_RESULT_FORMAT =
  "vcg-pose-edge-accuracy-result/v1";

export const POSE_EDGE_BACKENDS = Object.freeze(["mediapipe-lite"]);
export const POSE_EDGE_BLOCKING_PERSONAS = Object.freeze([
  "adult-standing",
  "school-age-child-standing",
]);
export const POSE_EDGE_EXPLORATORY_PERSONAS = Object.freeze(["seated"]);
export const POSE_EDGE_POSITIONS = Object.freeze([
  "center",
  "upper-left-quarter",
  "upper-right-quarter",
  "lower-left-quarter",
  "lower-right-quarter",
  "left-distortion-edge",
  "right-distortion-edge",
  "top-distortion-edge",
  "bottom-distortion-edge",
]);
export const POSE_EDGE_POSTURES = Object.freeze([
  "neutral",
  "arms-raised",
  "squat",
  "lean-left",
  "lean-right",
  "step-left",
  "step-right",
]);
export const POSE_EDGE_LANDMARKS = Object.freeze([
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
]);

const blockerCodes = [
  "acceptance-gates",
  "camera-room-binding",
  "data-handling-authority",
  "ground-truth-authority",
  "participant-consent",
];
const groundTruthAuthorities = new Set([
  "independent-manual-annotation",
  "independent-optical-reference",
]);

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function assertIsoTimestamp(value, path) {
  assert.equal(typeof value, "string", `${path} must be a string`);
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()), `${path} is invalid`);
  assert.equal(parsed.toISOString(), value, `${path} must be canonical UTC`);
}

function assertDigest(value, path) {
  assert.match(value, SHA256_PATTERN, `${path} must be lowercase SHA-256`);
}

function assertRate(value, path, allowZero = true) {
  assert.ok(
    typeof value === "number"
    && Number.isFinite(value)
    && value >= (allowZero ? 0 : Number.EPSILON)
    && value <= 1,
    `${path} must be a finite rate from ${allowZero ? "0" : "above 0"} to 1`,
  );
}

function validateCollectionGate(plan) {
  const gate = plan.collectionGate;
  exactKeys(
    gate,
    [
      "status",
      "targetId",
      "cameraConfigurationSha256",
      "roomGeometrySha256",
      "placementProtocolSha256",
      "personaProtocolSha256",
      "groundTruthProtocolSha256",
      "groundTruthAuthority",
      "timestampProofSha256",
      "dataHandlingProtocolSha256",
      "blockerCodes",
    ],
    "plan.collectionGate",
  );
  assert.ok(
    gate.status === "blocked" || gate.status === "ready",
    "plan.collectionGate.status is invalid",
  );
  const boundKeys = [
    "cameraConfigurationSha256",
    "roomGeometrySha256",
    "placementProtocolSha256",
    "personaProtocolSha256",
    "groundTruthProtocolSha256",
    "timestampProofSha256",
    "dataHandlingProtocolSha256",
  ];
  if (gate.status === "blocked") {
    assert.equal(plan.qualification, "blocked-plan-only-no-collection-authority");
    assert.equal(gate.targetId, null);
    assert.equal(gate.groundTruthAuthority, null);
    for (const key of boundKeys) assert.equal(gate[key], null);
    assert.deepEqual(gate.blockerCodes, blockerCodes);
    assert.ok(
      plan.claimBoundary.includes("authorizes no camera"),
      "blocked plan must deny camera authority",
    );
    return;
  }
  assert.equal(plan.qualification, "collection-authorized-plan");
  assert.match(gate.targetId, ID_PATTERN, "plan target ID is invalid");
  for (const key of boundKeys) assertDigest(gate[key], `plan.collectionGate.${key}`);
  assert.ok(
    groundTruthAuthorities.has(gate.groundTruthAuthority),
    "plan ground-truth authority is unsupported",
  );
  assert.deepEqual(gate.blockerCodes, []);
}

function validateMatrix(matrix) {
  exactKeys(
    matrix,
    [
      "backendIds",
      "blockingPersonaClasses",
      "exploratoryPersonaClasses",
      "positionIds",
      "postureIds",
      "minimumValidTrialsPerCell",
      "scheduledBlockingCellCount",
      "scheduledBlockingTrialCount",
      "exploratoryCellsRequiredForBlockingDisposition",
    ],
    "plan.matrix",
  );
  assert.deepEqual(matrix.backendIds, [...POSE_EDGE_BACKENDS]);
  assert.deepEqual(matrix.blockingPersonaClasses, [...POSE_EDGE_BLOCKING_PERSONAS]);
  assert.deepEqual(
    matrix.exploratoryPersonaClasses,
    [...POSE_EDGE_EXPLORATORY_PERSONAS],
  );
  assert.deepEqual(matrix.positionIds, [...POSE_EDGE_POSITIONS]);
  assert.deepEqual(matrix.postureIds, [...POSE_EDGE_POSTURES]);
  assert.equal(matrix.minimumValidTrialsPerCell, 20);
  const cells =
    matrix.backendIds.length
    * matrix.blockingPersonaClasses.length
    * matrix.positionIds.length
    * matrix.postureIds.length;
  assert.equal(matrix.scheduledBlockingCellCount, cells);
  assert.equal(
    matrix.scheduledBlockingTrialCount,
    cells * matrix.minimumValidTrialsPerCell,
  );
  assert.equal(matrix.exploratoryCellsRequiredForBlockingDisposition, false);
}

function validateMeasurement(measurement) {
  exactKeys(
    measurement,
    [
      "coordinateSystem",
      "coordinateSpecificationVersion",
      "landmarks",
      "errorMetric",
      "errorNormalization",
      "statistics",
      "perCellPassRequired",
      "aggregateMayRescueFailedCell",
      "groundTruthIndependentOfCandidate",
    ],
    "plan.measurement",
  );
  assert.equal(
    measurement.coordinateSystem,
    "image.normalized.top-left",
  );
  assert.equal(measurement.coordinateSpecificationVersion, "0.1.0");
  assert.deepEqual(measurement.landmarks, [...POSE_EDGE_LANDMARKS]);
  assert.equal(measurement.errorMetric, "pixel-space-euclidean");
  assert.equal(
    measurement.errorNormalization,
    "ground-truth-shoulder-midpoint-to-hip-midpoint-pixel-distance",
  );
  assert.deepEqual(measurement.statistics, [
    "detection-rate",
    "missing-rate",
    "p50-normalized-error",
    "p95-normalized-error",
    "worst-normalized-error",
    "outlier-rate",
  ]);
  assert.equal(measurement.perCellPassRequired, true);
  assert.equal(measurement.aggregateMayRescueFailedCell, false);
  assert.equal(measurement.groundTruthIndependentOfCandidate, true);
}

function validateAcceptance(plan) {
  const acceptance = plan.acceptance;
  const keys = [
    "minimumDetectionRate",
    "maximumMissingRatePerLandmark",
    "maximumP95NormalizedErrorPerLandmark",
    "maximumWorstNormalizedErrorPerLandmark",
    "maximumOutlierRatePerLandmark",
  ];
  exactKeys(acceptance, keys, "plan.acceptance");
  if (plan.collectionGate.status === "blocked") {
    for (const key of keys) assert.equal(acceptance[key], null);
    return;
  }
  assertRate(acceptance.minimumDetectionRate, "minimumDetectionRate", false);
  for (const key of keys.slice(1)) {
    assertRate(acceptance[key], `plan.acceptance.${key}`);
  }
  assert.ok(
    acceptance.maximumP95NormalizedErrorPerLandmark
      <= acceptance.maximumWorstNormalizedErrorPerLandmark,
    "p95 error gate cannot exceed worst-error gate",
  );
}

function validateDataPolicy(plan) {
  const policy = plan.dataPolicy;
  exactKeys(
    policy,
    [
      "temporaryImageGroundTruthCollectionAuthorized",
      "rawRoomVideoDefault",
      "retainedRawFrameCountLimit",
      "skeletonOnlyReleaseArtifactRequired",
      "participantIdentifiersAllowed",
      "freeTextAllowed",
    ],
    "plan.dataPolicy",
  );
  assert.equal(
    typeof policy.temporaryImageGroundTruthCollectionAuthorized,
    "boolean",
  );
  assert.equal(policy.rawRoomVideoDefault, false);
  assert.equal(policy.retainedRawFrameCountLimit, 0);
  assert.equal(policy.skeletonOnlyReleaseArtifactRequired, true);
  assert.equal(policy.participantIdentifiersAllowed, false);
  assert.equal(policy.freeTextAllowed, false);
  if (plan.collectionGate.status === "ready") {
    assert.equal(
      policy.temporaryImageGroundTruthCollectionAuthorized,
      true,
      "ready plan must explicitly authorize its temporary image labeling workflow",
    );
  }
  if (policy.temporaryImageGroundTruthCollectionAuthorized) {
    assert.equal(
      policy.retainedRawFrameCountLimit,
      0,
      "temporary image collection cannot imply retained raw frames",
    );
  }
}

export function validatePoseEdgeAccuracyPlan(plan) {
  exactKeys(
    plan,
    [
      "format",
      "campaignId",
      "createdAt",
      "motionApiVersion",
      "qualification",
      "collectionGate",
      "matrix",
      "measurement",
      "acceptance",
      "dataPolicy",
      "claimBoundary",
      "limitations",
    ],
    "plan",
  );
  assert.equal(plan.format, POSE_EDGE_ACCURACY_PLAN_FORMAT);
  assert.match(plan.campaignId, ID_PATTERN, "plan campaign ID is invalid");
  assertIsoTimestamp(plan.createdAt, "plan.createdAt");
  assert.equal(plan.motionApiVersion, "0.4.0");
  validateCollectionGate(plan);
  validateMatrix(plan.matrix);
  validateMeasurement(plan.measurement);
  validateAcceptance(plan);
  validateDataPolicy(plan);
  assert.ok(
    typeof plan.claimBoundary === "string"
    && plan.claimBoundary.length >= 120
    && plan.claimBoundary.length <= 1_024,
    "plan claim boundary is invalid",
  );
  assert.ok(Array.isArray(plan.limitations) && plan.limitations.length === 5);
  for (const limitation of plan.limitations) {
    assert.ok(
      typeof limitation === "string"
      && limitation.length >= 30
      && limitation.length <= 512,
      "plan limitation is invalid",
    );
  }
  return plan;
}

function parseCanonicalJsonBytes(bytes, maximumBytes, label) {
  assert.ok(
    bytes.length > 0 && bytes.length <= maximumBytes,
    `${label} byte size is invalid`,
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = text.replaceAll("\r\n", "\n");
  const value = JSON.parse(normalized);
  assert.equal(
    normalized,
    `${JSON.stringify(value, null, 2)}\n`,
    `${label} must use canonical two-space JSON with one trailing newline`,
  );
  return {
    value,
    sha256: createHash("sha256").update(normalized).digest("hex"),
  };
}

export function parsePoseEdgeAccuracyPlanBytes(bytes) {
  const envelope = parseCanonicalJsonBytes(bytes, MAX_PLAN_BYTES, "plan");
  validatePoseEdgeAccuracyPlan(envelope.value);
  return envelope;
}

function validatePlanEnvelope(planEnvelope) {
  exactKeys(planEnvelope, ["value", "sha256"], "plan envelope");
  const plan = validatePoseEdgeAccuracyPlan(planEnvelope.value);
  assertDigest(planEnvelope.sha256, "plan envelope SHA-256");
  const canonical = `${JSON.stringify(plan, null, 2)}\n`;
  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    planEnvelope.sha256,
    "plan envelope SHA-256 does not match its canonical value",
  );
  return plan;
}

function expectedCells(plan) {
  const cells = [];
  for (const backendId of plan.matrix.backendIds) {
    for (const personaClass of plan.matrix.blockingPersonaClasses) {
      for (const positionId of plan.matrix.positionIds) {
        for (const postureId of plan.matrix.postureIds) {
          cells.push({ backendId, personaClass, positionId, postureId });
        }
      }
    }
  }
  return cells;
}

function validateResultCell(cell, expected, plan, path) {
  exactKeys(
    cell,
    [
      "backendId",
      "personaClass",
      "positionId",
      "postureId",
      "validTrials",
      "detectionCount",
      "landmarks",
      "traceSha256",
      "labelSha256",
    ],
    path,
  );
  assert.deepEqual(
    {
      backendId: cell.backendId,
      personaClass: cell.personaClass,
      positionId: cell.positionId,
      postureId: cell.postureId,
    },
    expected,
    `${path} identity or order changed`,
  );
  assert.equal(cell.validTrials, plan.matrix.minimumValidTrialsPerCell);
  assert.ok(
    Number.isSafeInteger(cell.detectionCount)
    && cell.detectionCount >= 0
    && cell.detectionCount <= cell.validTrials,
    `${path}.detectionCount is invalid`,
  );
  assertDigest(cell.traceSha256, `${path}.traceSha256`);
  assertDigest(cell.labelSha256, `${path}.labelSha256`);
  assert.ok(Array.isArray(cell.landmarks));
  assert.deepEqual(
    cell.landmarks.map(({ landmark }) => landmark),
    [...POSE_EDGE_LANDMARKS],
  );
  let passes =
    cell.detectionCount / cell.validTrials
    >= plan.acceptance.minimumDetectionRate;
  for (const [index, landmark] of cell.landmarks.entries()) {
    const landmarkPath = `${path}.landmarks[${index}]`;
    exactKeys(
      landmark,
      [
        "landmark",
        "comparedCount",
        "missingCount",
        "outlierCount",
        "p50NormalizedError",
        "p95NormalizedError",
        "worstNormalizedError",
      ],
      landmarkPath,
    );
    for (const key of ["comparedCount", "missingCount", "outlierCount"]) {
      assert.ok(
        Number.isSafeInteger(landmark[key]) && landmark[key] >= 0,
        `${landmarkPath}.${key} is invalid`,
      );
    }
    assert.equal(
      landmark.comparedCount + landmark.missingCount,
      cell.validTrials,
      `${landmarkPath} trial accounting mismatch`,
    );
    assert.ok(
      landmark.comparedCount <= cell.detectionCount,
      `${landmarkPath} comparisons exceed detected trials`,
    );
    assert.ok(
      landmark.outlierCount <= landmark.comparedCount,
      `${landmarkPath} outlier count exceeds comparisons`,
    );
    for (const key of [
      "p50NormalizedError",
      "p95NormalizedError",
      "worstNormalizedError",
    ]) {
      assert.ok(
        typeof landmark[key] === "number"
        && Number.isFinite(landmark[key])
        && landmark[key] >= 0
        && landmark[key] <= 10,
        `${landmarkPath}.${key} is invalid`,
      );
    }
    assert.ok(
      landmark.p50NormalizedError <= landmark.p95NormalizedError
      && landmark.p95NormalizedError <= landmark.worstNormalizedError,
      `${landmarkPath} error percentiles are non-monotonic`,
    );
    passes = passes
      && landmark.missingCount / cell.validTrials
        <= plan.acceptance.maximumMissingRatePerLandmark
      && landmark.p95NormalizedError
        <= plan.acceptance.maximumP95NormalizedErrorPerLandmark
      && landmark.worstNormalizedError
        <= plan.acceptance.maximumWorstNormalizedErrorPerLandmark
      && landmark.outlierCount / cell.validTrials
        <= plan.acceptance.maximumOutlierRatePerLandmark;
  }
  return passes;
}

export function validatePoseEdgeAccuracyResult(planEnvelope, result) {
  const plan = validatePlanEnvelope(planEnvelope);
  assert.equal(
    plan.collectionGate.status,
    "ready",
    "blocked plan cannot accept a result",
  );
  exactKeys(
    result,
    [
      "format",
      "campaignId",
      "planSha256",
      "startedAt",
      "completedAt",
      "disposition",
      "cells",
      "summary",
      "dataDisposition",
      "claimBoundary",
      "limitations",
    ],
    "result",
  );
  assert.equal(result.format, POSE_EDGE_ACCURACY_RESULT_FORMAT);
  assert.equal(result.campaignId, plan.campaignId);
  assert.equal(result.planSha256, planEnvelope.sha256);
  assertIsoTimestamp(result.startedAt, "result.startedAt");
  assertIsoTimestamp(result.completedAt, "result.completedAt");
  assert.ok(
    Date.parse(result.completedAt) >= Date.parse(result.startedAt),
    "result completes before it starts",
  );
  const expected = expectedCells(plan);
  assert.ok(
    Array.isArray(result.cells) && result.cells.length === expected.length,
    `result cells must be an array with exactly ${expected.length} entries`,
  );
  let passingCellCount = 0;
  let validTrialCount = 0;
  for (const [index, cell] of result.cells.entries()) {
    if (validateResultCell(cell, expected[index], plan, `result.cells[${index}]`)) {
      passingCellCount += 1;
    }
    validTrialCount += cell.validTrials;
  }
  const failingCellCount = expected.length - passingCellCount;
  const derivedDisposition = failingCellCount === 0 ? "pass" : "fail";
  assert.equal(
    result.disposition,
    derivedDisposition,
    "result disposition does not match per-cell gates",
  );
  exactKeys(
    result.summary,
    [
      "cellCount",
      "passingCellCount",
      "failingCellCount",
      "validTrialCount",
      "participantCount",
      "realCameraTrialCount",
    ],
    "result.summary",
  );
  assert.ok(
    Number.isSafeInteger(result.summary.participantCount)
    && result.summary.participantCount >= 2,
    "result participant count is insufficient",
  );
  assert.deepEqual(result.summary, {
    cellCount: expected.length,
    passingCellCount,
    failingCellCount,
    validTrialCount,
    participantCount: result.summary.participantCount,
    realCameraTrialCount: validTrialCount,
  });
  exactKeys(
    result.dataDisposition,
    [
      "rawFramesRetained",
      "rawRoomVideoRetained",
      "skeletonOnlyReleaseArtifact",
      "participantIdentifiersRetained",
      "groundTruthLabelsRetained",
    ],
    "result.dataDisposition",
  );
  assert.deepEqual(result.dataDisposition, {
    rawFramesRetained: false,
    rawRoomVideoRetained: false,
    skeletonOnlyReleaseArtifact: true,
    participantIdentifiersRetained: false,
    groundTruthLabelsRetained: true,
  });
  assert.ok(
    typeof result.claimBoundary === "string"
    && result.claimBoundary.length >= 100
    && result.claimBoundary.length <= 1_024,
    "result claim boundary is invalid",
  );
  assert.ok(Array.isArray(result.limitations) && result.limitations.length === 4);
  for (const limitation of result.limitations) {
    assert.ok(typeof limitation === "string" && limitation.length >= 20);
  }
  return result;
}

export function parsePoseEdgeAccuracyResultBytes(planEnvelope, bytes) {
  const result = parseCanonicalJsonBytes(bytes, MAX_RESULT_BYTES, "result");
  validatePoseEdgeAccuracyResult(planEnvelope, result.value);
  return result;
}

export async function validateTrackedPoseEdgeAccuracyPlan() {
  return parsePoseEdgeAccuracyPlanBytes(await readFile(trackedPlanPath));
}

async function main() {
  const planPath = process.argv[2]
    ? resolve(process.argv[2])
    : trackedPlanPath;
  const plan = parsePoseEdgeAccuracyPlanBytes(await readFile(planPath));
  if (process.argv[3]) {
    const result = parsePoseEdgeAccuracyResultBytes(
      plan,
      await readFile(resolve(process.argv[3])),
    );
    console.log(
      `validated ${result.value.summary.cellCount} pose edge cells: ${result.value.disposition}`,
    );
    return;
  }
  console.log(
    `validated blocked pose edge plan: ${plan.value.matrix.scheduledBlockingCellCount} cells / ${plan.value.matrix.scheduledBlockingTrialCount} trials; ${plan.value.collectionGate.blockerCodes.length} blockers`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
