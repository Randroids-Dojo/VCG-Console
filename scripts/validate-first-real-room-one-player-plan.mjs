import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const FIRST_REAL_ROOM_ONE_PLAYER_FORMAT =
  "vcg-first-real-room-one-player-plan/v1";
export const FIRST_REAL_ROOM_PERSONAS = Object.freeze([
  "school-age-child-standing",
  "adult-standing",
]);
export const FIRST_REAL_ROOM_PLACEMENTS = Object.freeze([
  "center",
  "near-left-edge",
  "near-right-edge",
  "far-left-edge",
  "far-right-edge",
]);
export const FIRST_REAL_ROOM_TRIAL_BLOCKS = Object.freeze([
  "rest",
  "stand",
  "join",
  "squat",
  "jump",
  "punch-left",
  "punch-right",
  "step-left",
  "step-right",
  "cross-shell",
  "cross-game",
  "occlude",
  "exit-frame",
  "reenter-frame",
]);
export const FIRST_REAL_ROOM_BLOCKERS = Object.freeze([
  "selected-room-survey-and-safe-play-zone",
  "exact-target-build-camera-placement-and-capture-policy",
  "adult-and-child-consent-assent-and-comprehension-authority",
  "independent-ground-truth-and-exposure-clock-protocols",
  "negative-session-script-and-privileged-action-oracle",
  "pose-fps-coverage-and-jitter-gates",
  "data-handling-schedule-instruments-and-operators",
  "room-participant-camera-and-collection-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "collectionBoundary",
  "matrix",
  "measurements",
  "acceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const collectionKeys = [
  "targetConfigurationSha256",
  "cleanBuildSha256",
  "roomSurveyResultSha256",
  "cameraConfigurationSha256",
  "cameraCapturePolicyResultSha256",
  "participantConsentAndAssentProtocolSha256",
  "independentGroundTruthProtocolSha256",
  "exposureTimestampProofSha256",
  "negativeSessionProtocolSha256",
  "dataHandlingProtocolSha256",
  "scheduleSha256",
  "roomAccessAuthorized",
  "adultParticipationAuthorized",
  "childParticipationAuthorized",
  "cameraCollectionAuthorized",
  "temporaryDiagnosticImageCollectionAuthorized",
];
const sourceDefinitions = [
  ["household-motion-benchmark-plan", "benchmarks/household-one-player-v1.json"],
  ["household-motion-benchmark-protocol", "docs/MOTION_BENCHMARK_PROTOCOL.md"],
  ["first-prototype-success-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["blocking-persona-boundary", "docs/PLAYER_PERSONAS.md"],
  ["room-and-play-zone-boundary", "docs/LIVING_ROOM_PLAY_ZONE_SURVEY_PLAN_2026-07-25.md"],
  ["camera-capture-policy-boundary", "docs/CAMERA_CAPTURE_POLICY_CAMPAIGN_2026-07-25.md"],
  ["exposure-action-latency-boundary", "docs/CAMERA_ACTION_LATENCY_CAMPAIGN_2026-07-24.md"],
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual(
      [binding.role, binding.path],
      sourceDefinitions[index],
      `sourceBindings[${index}] identity drifted`,
    );
    assert.match(binding.sha256, SHA256, `sourceBindings[${index}].sha256 is invalid`);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(
      absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`),
      `sourceBindings[${index}] escapes the repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateFirstRealRoomOnePlayerPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, FIRST_REAL_ROOM_ONE_PLAYER_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "first-real-room-one-player-mediapipe-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-053", "I-210"]);
  for (const phrase of [
    "No room",
    "participant",
    "capture-arrival timestamp",
    "aggregate score",
    "cannot qualify",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 11)) {
    assert.equal(plan.collectionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of collectionKeys.slice(11)) {
    assert.equal(plan.collectionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  exactKeys(plan.matrix, [
    "benchmarkProtocolId",
    "benchmarkTrialBlockIds",
    "blockingPersonaClasses",
    "placementIds",
    "requiredRuntimeSurfaces",
    "benchmarkRunPerPersonaPlacement",
    "requiredBenchmarkRunCount",
    "requiredBenchmarkAttemptsPerRun",
    "requiredBenchmarkAttemptCount",
    "negativeSessionDurationMs",
    "requiredNegativeSessionCount",
    "aggregateMayRescueFailedPersonaPlacement",
  ], "matrix");
  assert.equal(plan.matrix.benchmarkProtocolId, "household-one-player-v1");
  assert.deepEqual(plan.matrix.benchmarkTrialBlockIds, [...FIRST_REAL_ROOM_TRIAL_BLOCKS]);
  assert.deepEqual(plan.matrix.blockingPersonaClasses, [...FIRST_REAL_ROOM_PERSONAS]);
  assert.deepEqual(plan.matrix.placementIds, [...FIRST_REAL_ROOM_PLACEMENTS]);
  assert.deepEqual(plan.matrix.requiredRuntimeSurfaces, ["console-shell", "obstacle-sample"]);
  assert.equal(plan.matrix.benchmarkRunPerPersonaPlacement, true);
  assert.equal(plan.matrix.requiredBenchmarkRunCount, 10);
  assert.equal(plan.matrix.requiredBenchmarkAttemptsPerRun, 280);
  assert.equal(plan.matrix.requiredBenchmarkAttemptCount, 2800);
  assert.equal(plan.matrix.negativeSessionDurationMs, 900000);
  assert.equal(plan.matrix.requiredNegativeSessionCount, 10);
  assert.equal(plan.matrix.aggregateMayRescueFailedPersonaPlacement, false);

  exactKeys(plan.measurements, [
    "requiredMetrics",
    "benchmarkResultRequiredPerPersonaPlacement",
    "actionLatencyResultRequiredPerPersonaPlacement",
    "negativeSessionEvidenceRequiredPerPersonaPlacement",
    "independentGroundTruthRequired",
    "skeletonOnlyTraceReproductionRequired",
    "everyScheduledAttemptAndFailureMustRemainVisible",
    "captureArrivalMayQualifyExposureLatency",
    "streamActiveMayEstablishFirstUsefulFrameOrOpticalUsability",
  ], "measurements");
  assert.deepEqual(plan.measurements.requiredMetrics, [
    "pose-fps",
    "core17-coverage",
    "core17-normalized-jitter",
    "trigger-precision",
    "trigger-recall",
    "transition-precision",
    "transition-recall",
    "unintended-privileged-actions",
    "exposure-to-game-api-p50-p95-p99-worst",
    "capture-and-processing-drops",
    "tracking-loss-confirmation",
    "silent-reacquisition",
    "recovery-overlay-transition",
  ]);
  for (const key of [
    "benchmarkResultRequiredPerPersonaPlacement",
    "actionLatencyResultRequiredPerPersonaPlacement",
    "negativeSessionEvidenceRequiredPerPersonaPlacement",
    "independentGroundTruthRequired",
    "skeletonOnlyTraceReproductionRequired",
    "everyScheduledAttemptAndFailureMustRemainVisible",
  ]) assert.equal(plan.measurements[key], true);
  assert.equal(plan.measurements.captureArrivalMayQualifyExposureLatency, false);
  assert.equal(plan.measurements.streamActiveMayEstablishFirstUsefulFrameOrOpticalUsability, false);

  exactKeys(plan.acceptance, [
    "minimumTriggerPrecisionPpm",
    "minimumTriggerRecallPpm",
    "maximumUnintendedPrivilegedActionsPerNegativeSession",
    "maximumExposureToGameApiP95Us",
    "maximumInvalidBenchmarkAttemptsPerRun",
    "minimumPoseFpsMilliHz",
    "minimumCore17CoveragePpm",
    "maximumCore17NormalizedJitterMilliTorso",
    "everyPersonaPlacementCellMustPass",
    "personaPlacementOrLightingAggregateMayRescueFailure",
    "capturePolicyResultMaySubstituteActionEvidence",
    "inferenceOrCaptureArrivalLatencyMaySubstituteExposureLatency",
  ], "acceptance");
  assert.deepEqual(
    [
      plan.acceptance.minimumTriggerPrecisionPpm,
      plan.acceptance.minimumTriggerRecallPpm,
      plan.acceptance.maximumUnintendedPrivilegedActionsPerNegativeSession,
      plan.acceptance.maximumExposureToGameApiP95Us,
      plan.acceptance.maximumInvalidBenchmarkAttemptsPerRun,
    ],
    [950000, 900000, 0, 120000, 0],
  );
  for (const key of [
    "minimumPoseFpsMilliHz",
    "minimumCore17CoveragePpm",
    "maximumCore17NormalizedJitterMilliTorso",
  ]) assert.equal(plan.acceptance[key], null, `owner gate ${key} must remain open`);
  assert.equal(plan.acceptance.everyPersonaPlacementCellMustPass, true);
  for (const key of [
    "personaPlacementOrLightingAggregateMayRescueFailure",
    "capturePolicyResultMaySubstituteActionEvidence",
    "inferenceOrCaptureArrivalLatencyMaySubstituteExposureLatency",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoDefault: false,
    rawRoomVideoAllowedInRepositoryOrRelease: false,
    rawFramesAllowedInRepositoryOrRelease: false,
    skeletonOnlyTraceRequired: true,
    participantNamesOrStableIdentifiersAllowed: false,
    faceTemplatesOrBodyProfileVectorsAllowed: false,
    freeTextResultEvidenceAllowed: false,
    temporaryDiagnosticImagesRequireSeparateConsentProtocol: true,
    temporaryDiagnosticImagesMustBeDeletedAndDeletionVerified: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...FIRST_REAL_ROOM_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedBenchmarkRunCount: 0,
    completedBenchmarkAttemptCount: 0,
    completedNegativeSessionCount: 0,
    qualifiedPersonaPlacementIds: [],
    exposureLatencyQualifiedPersonaPlacementIds: [],
  });
  return plan;
}

export async function parseFirstRealRoomOnePlayerPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical pretty JSON without duplicate or reordered keys",
  );
  return validateFirstRealRoomOnePlayerPlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseFirstRealRoomOnePlayerPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.matrix.requiredBenchmarkRunCount}-run, `
      + `${plan.matrix.requiredBenchmarkAttemptCount}-attempt real-room campaign`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
