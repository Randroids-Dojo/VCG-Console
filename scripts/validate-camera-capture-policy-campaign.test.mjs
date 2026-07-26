import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAMERA_CAPTURE_POLICY_RESULT_FORMAT,
  parseCameraCapturePolicyPlanBytes,
  parseCameraCapturePolicyResultBytes,
  validateCameraCapturePolicyResult,
} from "./validate-camera-capture-policy-campaign.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planPath = resolve(
  root,
  "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
);
const trackedPlanBytes = await readFile(planPath);
const trackedPlan = parseCameraCapturePolicyPlanBytes(trackedPlanBytes);
const clone = (value) => structuredClone(value);
const digest = (character) => character.repeat(64);
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const parsePlan = (value) => parseCameraCapturePolicyPlanBytes(canonicalBytes(value));

const lightingRanges = [
  [true, 200_000, 500_000],
  [true, 200_000, 400_000],
  [true, 150_000, 300_000],
  [true, 150_000, 300_000],
  [false, 10_000, 149_999],
  [false, 1_000, 9_999],
];

function readyPlan() {
  const plan = clone(trackedPlan.value);
  plan.qualification = "collection-authorized-plan";
  plan.collectionGate = {
    status: "ready",
    targetId: "owned-x86-camera-fixture",
    cameraId: "qualified-uvc-candidate",
    cameraDeviceSha256: digest("a"),
    cameraControlInventorySha256: digest("b"),
    roomLightingProtocolSha256: digest("c"),
    opticalGroundTruthProtocolSha256: digest("d"),
    poseActionProtocolSha256: digest("e"),
    exposureTimestampAuthority: "hardware-exposure-start",
    exposureTimestampProofSha256: digest("f"),
    participantProtocolSha256: digest("1"),
    dataHandlingProtocolSha256: digest("2"),
    blockerCodes: [],
  };
  const controls = [
    {
      pixelFormat: "mjpeg",
      exposureMode: "auto",
      exposureTimeUs: null,
      gainMode: "auto",
      gainMilliDb: null,
      whiteBalanceMode: "auto",
      whiteBalanceKelvin: null,
      focusMode: "fixed",
      focusValue: null,
      powerLineFrequencyHz: 60,
      bufferCount: 2,
    },
    {
      pixelFormat: "mjpeg",
      exposureMode: "manual",
      exposureTimeUs: 10_000,
      gainMode: "manual",
      gainMilliDb: 12_000,
      whiteBalanceMode: "manual",
      whiteBalanceKelvin: 4_000,
      focusMode: "fixed",
      focusValue: null,
      powerLineFrequencyHz: 60,
      bufferCount: 2,
    },
    {
      pixelFormat: "mjpeg",
      exposureMode: "manual",
      exposureTimeUs: 4_000,
      gainMode: "manual",
      gainMilliDb: 24_000,
      whiteBalanceMode: "manual",
      whiteBalanceKelvin: 4_000,
      focusMode: "fixed",
      focusValue: null,
      powerLineFrequencyHz: 60,
      bufferCount: 2,
    },
  ];
  for (const [index, preset] of plan.matrix.presets.entries()) {
    preset.controls = controls[index];
  }
  for (const [index, condition] of plan.matrix.lightingConditions.entries()) {
    const [blocking, minimumIlluminanceMilliLux, maximumIlluminanceMilliLux] =
      lightingRanges[index];
    Object.assign(condition, {
      blocking,
      minimumIlluminanceMilliLux,
      maximumIlluminanceMilliLux,
    });
  }
  plan.matrix.scheduledBlockingCellCount = 168;
  plan.matrix.scheduledBlockingTrialCount = 3_360;
  plan.acceptance = {
    minimumBlockingIlluminanceMilliLux: 150_000,
    minimumCapturedFramesPerSecondMilliHz: 59_000,
    maximumDroppedFrameRate: 0.01,
    maximumP95ExposureTimeUs: 12_000,
    maximumP95BlurWidthMilliPixels: 8_000,
    maximumP95ColorErrorMilliDeltaE: 5_000,
    maximumP95NormalizedLandmarkError: 0.08,
    minimumCorrectOutcomeRecall: 0.9,
    maximumWrongActionCountPerCell: 0,
  };
  plan.dataPolicy.temporaryFrameAnalysisAuthorized = true;
  plan.claimBoundary =
    "This ready fixture binds one exact target, UVC camera and controls, lighting, optical ground truth, pose/action protocol, exposure timestamp proof, participants, and volatile frame-analysis policy. It authorizes only the frozen campaign and no broader product claim.";
  return plan;
}

function passingResult(planEnvelope) {
  const cells = [];
  for (const preset of planEnvelope.value.matrix.presets) {
    for (const personaClass of planEnvelope.value.matrix.blockingPersonaClasses) {
      for (const lighting of planEnvelope.value.matrix.lightingConditions) {
        for (const motionConditionId of planEnvelope.value.matrix.motionConditionIds) {
          cells.push({
            presetId: preset.id,
            personaClass,
            lightingConditionId: lighting.id,
            motionConditionId,
            trials: Array.from({ length: 20 }, (_, index) => ({
              repetition: index + 1,
              status: "valid",
              correctOutcome: true,
              wrongActionCount: 0,
              invalidReasonCode: null,
            })),
            validTrialCount: 20,
            invalidTrialCount: 0,
            medianIlluminanceMilliLux: Math.floor(
              (lighting.minimumIlluminanceMilliLux
                + lighting.maximumIlluminanceMilliLux) / 2,
            ),
            observationDurationMs: 60_000,
            capturedFrameCount: 3_600,
            droppedFrameCount: 0,
            p95ExposureTimeUs: 8_000,
            p95BlurWidthMilliPixels: 4_000,
            p95ColorErrorMilliDeltaE: 2_000,
            p95NormalizedLandmarkError: 0.04,
            correctOutcomeCount: 20,
            wrongActionCount: 0,
            captureTraceSha256: digest("3"),
            opticalTraceSha256: digest("4"),
            groundTruthTraceSha256: digest("5"),
          });
        }
      }
    }
  }
  return {
    format: CAMERA_CAPTURE_POLICY_RESULT_FORMAT,
    campaignId: planEnvelope.value.campaignId,
    planSha256: planEnvelope.sha256,
    startedAt: "2026-08-01T18:00:00.000Z",
    completedAt: "2026-08-01T22:00:00.000Z",
    disposition: "policy-selected",
    selectedPresetId: "automatic-baseline",
    cells,
    summary: {
      cellCount: 252,
      blockingCellCount: 168,
      passingBlockingCellCount: 168,
      failingBlockingCellCount: 0,
      scheduledTrialCount: 5_040,
      validTrialCount: 5_040,
      invalidTrialCount: 0,
      candidatePresetCount: 3,
      qualifiedPresetIds: [
        "automatic-baseline",
        "balanced-manual",
        "short-exposure-manual",
      ],
      participantCount: 2,
    },
    dataDisposition: {
      rawFramesRetained: false,
      rawRoomVideoRetained: false,
      skeletonAndNumericReleaseOnly: true,
      participantIdentifiersRetained: false,
      opticalGroundTruthRetained: true,
    },
    claimBoundary:
      "This result selects only the first qualifying capture preset for the exact hash-bound camera, controls, room lighting, optical reference, participants, and target in its plan. It does not qualify another camera, room, platform, latency path, or population.",
    limitations: [
      "Only the exact bound camera controls and first-room lighting protocol were exercised.",
      "Nonblocking lighting strata report tradeoffs but cannot rescue or defeat the policy selection.",
      "Capture policy evidence does not establish the exposure-to-game-action latency requirement.",
      "No raw room video, retained frame, participant identity, or broader target claim is present.",
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
  assert.throws(() => validateCameraCapturePolicyResult(plan, result), pattern);
}

test("accepts the tracked blocked plan without granting collection or policy authority", () => {
  assert.equal(trackedPlan.value.collectionGate.status, "blocked");
  assert.equal(trackedPlan.value.matrix.scheduledCellCount, 252);
  assert.equal(trackedPlan.value.matrix.scheduledTrialCount, 5_040);
  assert.equal(trackedPlan.value.matrix.scheduledBlockingCellCount, null);
  assert.throws(
    () => validateCameraCapturePolicyResult(trackedPlan, {}),
    /blocked plan cannot accept a result/,
  );
});

test("normalizes LF and CRLF plan bytes to the same digest", () => {
  const lf = parseCameraCapturePolicyPlanBytes(trackedPlanBytes);
  const crlf = parseCameraCapturePolicyPlanBytes(
    Buffer.from(trackedPlanBytes.toString("utf8").replaceAll("\n", "\r\n")),
  );
  assert.equal(crlf.sha256, lf.sha256);
});

test("accepts one exact ready plan and derives its complete selected policy", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  assert.equal(validateCameraCapturePolicyResult(plan, result), result);
  assert.deepEqual(
    parseCameraCapturePolicyResultBytes(plan, canonicalBytes(result)).value,
    result,
  );
});

test("rejects capture-mode weakening and invalid or duplicate UVC controls", () => {
  assertPlanRejected(
    (plan) => { plan.matrix.captureMode.framesPerSecondNumerator = 30; },
    /Expected values to be strictly deep-equal/,
  );
  assertPlanRejected(
    (plan) => { plan.matrix.presets[1].controls.exposureTimeUs = null; },
    /safe integer/,
  );
  assertPlanRejected(
    (plan) => {
      plan.matrix.presets[2].controls = clone(plan.matrix.presets[1].controls);
    },
    /distinct controls/,
  );
  assertPlanRejected(
    (plan) => {
      plan.matrix.presets[0].controls.exposureMode = "manual";
      plan.matrix.presets[0].controls.exposureTimeUs = 8_000;
    },
    /automatic-baseline exposureMode must be auto/,
  );
  assertPlanRejected(
    (plan) => {
      plan.matrix.presets[2].controls.exposureTimeUs = 12_000;
    },
    /must use a shorter exposure/,
  );
});

test("rejects hidden bindings, controls, or gates in a blocked plan", () => {
  const hiddenBinding = clone(trackedPlan.value);
  hiddenBinding.collectionGate.cameraId = "quiet-camera-binding";
  assert.throws(() => parsePlan(hiddenBinding), /must be null/);

  const hiddenControl = clone(trackedPlan.value);
  hiddenControl.matrix.presets[0].controls.pixelFormat = "mjpeg";
  assert.throws(() => parsePlan(hiddenControl), /must be null/);

  const hiddenGate = clone(trackedPlan.value);
  hiddenGate.acceptance.minimumCorrectOutcomeRecall = 0.9;
  assert.throws(() => parsePlan(hiddenGate), /0.9 !== null/);
});

test("rejects capture-arrival authority and missing ready-plan bindings", () => {
  assertPlanRejected(
    (plan) => {
      plan.collectionGate.exposureTimestampAuthority = "capture-arrival";
    },
    /timestamp authority is unsupported/,
  );
  assertPlanRejected(
    (plan) => { plan.collectionGate.cameraDeviceSha256 = digest("A"); },
    /lowercase SHA-256/,
  );
  assertPlanRejected(
    (plan) => { plan.dataPolicy.temporaryFrameAnalysisAuthorized = false; },
    /must explicitly authorize/,
  );
});

test("rejects an unexercised illumination floor or blocking-count drift", () => {
  assertPlanRejected(
    (plan) => { plan.acceptance.minimumBlockingIlluminanceMilliLux = 100_000; },
    /must exercise the selected illumination floor/,
  );
  assertPlanRejected(
    (plan) => { plan.matrix.lightingConditions[0].blocking = false; },
    /168 !== 126/,
  );
  assertPlanRejected(
    (plan) => {
      for (const condition of plan.matrix.lightingConditions) {
        condition.blocking = false;
      }
      plan.matrix.scheduledBlockingCellCount = 0;
      plan.matrix.scheduledBlockingTrialCount = 0;
    },
    /needs a blocking lighting condition/,
  );
});

test("rejects weakened frame, exposure, accuracy, and action gates", () => {
  assertPlanRejected(
    (plan) => { plan.acceptance.minimumCapturedFramesPerSecondMilliHz = 58_999; },
    /59000 through 60000/,
  );
  assertPlanRejected(
    (plan) => { plan.acceptance.maximumP95ExposureTimeUs = 16_667; },
    /1 through 16666/,
  );
  assertPlanRejected(
    (plan) => { plan.acceptance.minimumCorrectOutcomeRecall = 0.899; },
    /0.9 through 1/,
  );
});

test("rejects raw retention, participant identifiers, free text, and unknown fields", () => {
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
  const extra = clone(trackedPlan.value);
  extra.surprise = true;
  assert.throws(() => parsePlan(extra), /plan keys must be exactly/);
});

test("rejects noncanonical, malformed, and oversized plan bytes", () => {
  assert.throws(
    () => parseCameraCapturePolicyPlanBytes(Buffer.from(JSON.stringify(trackedPlan.value))),
    /canonical two-space JSON/,
  );
  assert.throws(
    () => parseCameraCapturePolicyPlanBytes(Uint8Array.from([0xc3, 0x28])),
    /encoded data was not valid|encoding/i,
  );
  assert.throws(
    () => parseCameraCapturePolicyPlanBytes(Buffer.alloc(96 * 1_024 + 1, 0x20)),
    /byte size is invalid/,
  );
});

test("rejects forged plan envelopes and omitted, duplicated, or reordered cells", () => {
  const plan = parsePlan(readyPlan());
  assert.throws(
    () => validateCameraCapturePolicyResult(
      { value: plan.value, sha256: digest("9") },
      passingResult(plan),
    ),
    /does not match its canonical value/,
  );
  assertResultRejected(
    (result) => result.cells.pop(),
    /false == true|falsy value|result\.cells/,
  );
  assertResultRejected(
    (result) => { result.cells[1] = clone(result.cells[0]); },
    /identity or order changed/,
  );
  assertResultRejected(
    (result) => {
      [result.cells[0], result.cells[1]] = [result.cells[1], result.cells[0]];
    },
    /identity or order changed/,
  );
  assertResultRejected(
    (result) => { result.cells[0].trials[1].repetition = 1; },
    /missing, duplicated, or reordered/,
  );
});

test("preserves an invalid repetition and derives an incomplete campaign", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  const cell = result.cells[0];
  cell.trials[0] = {
    repetition: 1,
    status: "invalid",
    correctOutcome: null,
    wrongActionCount: null,
    invalidReasonCode: "participant-stop",
  };
  cell.validTrialCount = 19;
  cell.invalidTrialCount = 1;
  cell.correctOutcomeCount = 19;
  result.disposition = "incomplete";
  result.selectedPresetId = null;
  result.summary.passingBlockingCellCount = 167;
  result.summary.failingBlockingCellCount = 1;
  result.summary.validTrialCount = 5_039;
  result.summary.invalidTrialCount = 1;
  result.summary.qualifiedPresetIds = [];

  assert.equal(validateCameraCapturePolicyResult(plan, result), result);
});

test("derives selection from every blocking cell and permits no aggregate rescue", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  result.cells[0].p95BlurWidthMilliPixels = 8_001;
  result.selectedPresetId = "balanced-manual";
  result.summary.passingBlockingCellCount = 167;
  result.summary.failingBlockingCellCount = 1;
  result.summary.qualifiedPresetIds = [
    "balanced-manual",
    "short-exposure-manual",
  ];
  assert.equal(validateCameraCapturePolicyResult(plan, result), result);

  result.selectedPresetId = "automatic-baseline";
  assert.throws(
    () => validateCameraCapturePolicyResult(plan, result),
    /Expected values to be strictly equal/,
  );
});

test("accepts an honest no-qualified-preset disposition", () => {
  const plan = parsePlan(readyPlan());
  const result = passingResult(plan);
  for (const cellIndex of [0, 84, 168]) {
    result.cells[cellIndex].p95BlurWidthMilliPixels = 8_001;
  }
  result.disposition = "no-qualified-preset";
  result.selectedPresetId = null;
  result.summary.passingBlockingCellCount = 165;
  result.summary.failingBlockingCellCount = 3;
  result.summary.qualifiedPresetIds = [];

  assert.equal(validateCameraCapturePolicyResult(plan, result), result);
});

test("rejects frame-rate, drop, action, summary, and data-disposition fabrication", () => {
  assertResultRejected(
    (result) => { result.cells[0].capturedFrameCount = 3_539; },
    /Expected values to be strictly equal/,
  );
  assertResultRejected(
    (result) => { result.cells[0].droppedFrameCount = 100; },
    /Expected values to be strictly equal/,
  );
  assertResultRejected(
    (result) => {
      result.cells[0].trials[0].correctOutcome = false;
      result.cells[0].trials[1].correctOutcome = false;
      result.cells[0].trials[2].correctOutcome = false;
      result.cells[0].correctOutcomeCount = 17;
    },
    /Expected values to be strictly equal/,
  );
  assertResultRejected(
    (result) => { result.summary.validTrialCount -= 1; },
    /Expected values to be strictly deep-equal/,
  );
  assertResultRejected(
    (result) => { result.dataDisposition.rawFramesRetained = true; },
    /Expected values to be strictly deep-equal/,
  );
});
