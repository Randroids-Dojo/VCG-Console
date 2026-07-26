import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CAPTURE_INFERENCE_MODE_PLAN_PATH,
  parseCanonicalCaptureInferenceModePlan,
} from "./validate-capture-inference-mode-qualification.mjs";
import {
  MAX_CAPTURE_INFERENCE_MODE_RESULT_BYTES,
  expandCaptureInferenceModeCells,
  parseCanonicalCaptureInferenceModeResult,
  parseCanonicalReadyCaptureInferenceModePlan,
  validateCaptureInferenceModeResult,
  validateReadyCaptureInferenceModePlan,
} from "./validate-capture-inference-mode-result.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const BLOCKED_PLAN_PATH = join(
  REPOSITORY_ROOT,
  ...CAPTURE_INFERENCE_MODE_PLAN_PATH.split("/"),
);
const blockedPlan = parseCanonicalCaptureInferenceModePlan(await readFile(BLOCKED_PLAN_PATH));

const READY_CLAIM_BOUNDARY =
  "This ready I-178 plan authorizes only the exact bound capture and inference mode comparison. It records no result, grants no raw-frame retention, replay, or egress, and does not select a mode or change a product default.";
const READY_LIMITATIONS = [
  "Readiness is scoped to the exact target, camera, camera qualification, capture policy, tracker, room, participants, clocks, truth, schedule, data protocol, mode controls, downscale dimensions, and pre-registered gates in this plan.",
  "Execution must preserve all four modes and every persona, placement, lighting, action, attempt, and negative window; a changed input or threshold requires a new ready plan.",
  "The result may derive qualified modes only; product-mode selection and default mutation remain separate owner decisions.",
];
const RESULT_CLAIM_BOUNDARY =
  "This result derives qualified capture and inference modes only for the exact ready I-178 plan. It cannot qualify another target or camera, select a product mode, change a default, retain or export raw frames, or promote incomplete evidence.";
const RESULT_LIMITATIONS = [
  "Every disposition is scoped to the exact ready-plan digest, target, camera, controls, tracker, room, participants, clocks, schedule, and gates.",
  "A qualified mode is not a selected product default and does not authorize a camera purchase or another target configuration.",
  "The result contains only bounded numeric observations, action events, opaque evidence digests, and derived summaries; it contains no raw frames, participant identifiers, paths, or free text.",
];

const digest = (seed) => createHash("sha256").update(seed).digest("hex");
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function buildReadyPlan() {
  const ready = structuredClone(blockedPlan);
  let digestIndex = 0;
  const nextDigest = () => digest(`mode-ready-${digestIndex++}`);
  ready.qualification = "ready-plan-no-results";
  ready.executionGate.status = "ready";
  ready.executionGate.targetId = "target-one";
  ready.executionGate.cameraId = "camera-one";
  for (const key of Object.keys(ready.executionGate)) {
    if (key.endsWith("Sha256")) ready.executionGate[key] = nextDigest();
  }
  ready.executionGate.exposureTimestampAuthority = "hardware-exposure-start";
  ready.executionGate.blockerCodes = [];

  for (const mode of ready.modes) {
    mode.capture.pixelFormat = "mjpeg";
    mode.capture.controlPresetId = "balanced-manual";
    if (mode.inference.strategy === "downscaled-from-capture") {
      mode.inference.width = 640;
      mode.inference.height = 360;
    }
  }

  ready.comparisonDesign.warmupAttemptsPerMode = 2;
  ready.comparisonDesign.interleaveBlockSize = 2;
  ready.comparisonDesign.placementIds = ["zone-center"];
  ready.comparisonDesign.lightingConditionIds = ["room-normal"];
  ready.comparisonDesign.scheduledCellCount = 8;
  ready.comparisonDesign.scheduledActionAttemptCount = 1600;
  ready.measurements.resourceSamplingIntervalMs = 100;

  ready.acceptance.minimumCaptureFramesPerSecondMilliHz = 25_000;
  ready.acceptance.maximumDroppedFrameRate = 0.01;
  ready.acceptance.maximumP99ExposureToGameApiMs = 150;
  ready.acceptance.maximumWorstExposureToGameApiMs = 200;
  ready.acceptance.minimumInferenceFramesPerSecondMilliHz = 25_000;
  ready.acceptance.maximumUsbBytesPerSecond = 1_000_000_000;
  ready.acceptance.maximumCpuPermille = 800;
  ready.acceptance.maximumRamBytes = 1_000_000_000;
  ready.acceptance.maximumP95ExposureTimeUs = 16_000;
  ready.acceptance.selectionPolicy = "qualification-only-no-selection";

  ready.dataPolicy.temporaryFrameAnalysisAuthorized = true;
  ready.dataPolicy.dataHandlingAuthoritySha256 =
    ready.executionGate.dataHandlingProtocolSha256;
  ready.resultBoundary.executionAuthorized = true;
  ready.claimBoundary = READY_CLAIM_BOUNDARY;
  ready.limitations = READY_LIMITATIONS;
  return ready;
}

function refreshAggregates(result, ready) {
  result.modes = ready.modes.map((mode) => {
    const cells = result.cells.filter((cell) => cell.modeId === mode.id);
    const passedCellCount = cells.filter((cell) => cell.disposition === "passed").length;
    const rejectedCellCount = cells.filter((cell) => cell.disposition === "rejected").length;
    const incompleteCellCount = cells.filter((cell) => cell.disposition === "incomplete").length;
    return {
      modeId: mode.id,
      passedCellCount,
      rejectedCellCount,
      incompleteCellCount,
      disposition:
        rejectedCellCount > 0 ? "rejected" : incompleteCellCount > 0 ? "incomplete" : "qualified",
    };
  });
  const qualifiedModeIds = result.modes
    .filter((mode) => mode.disposition === "qualified")
    .map((mode) => mode.modeId);
  const rejectedModeCount = result.modes.filter((mode) => mode.disposition === "rejected").length;
  const incompleteModeCount = result.modes.filter((mode) => mode.disposition === "incomplete").length;
  result.summary = {
    qualifiedModeCount: qualifiedModeIds.length,
    rejectedModeCount,
    incompleteModeCount,
    qualifiedModeIds,
    selectedModeId: null,
    productDefaultChanged: false,
    disposition:
      incompleteModeCount > 0
        ? "incomplete"
        : qualifiedModeIds.length > 0
          ? "qualified-modes"
          : "no-qualified-mode",
  };
}

function buildPassingResult(ready) {
  const readyBytes = canonicalBytes(ready);
  let evidenceIndex = 0;
  const nextDigest = () => digest(`mode-result-${evidenceIndex++}`);
  const cells = expandCaptureInferenceModeCells(ready).map((expected, cellIndex) => {
    const nominalCaptureFps = expected.mode.capture.framesPerSecondNumerator * 1_000;
    const nominalInferenceFps =
      expected.mode.inference.maximumFramesPerSecondNumerator * 1_000;
    const actions = ready.comparisonDesign.actions.map((actionId) => ({
      actionId,
      attempts: Array.from(
        { length: ready.comparisonDesign.measuredAttemptsPerActionPerCell },
        (_, attemptIndex) => {
          const exposureTimestampNs =
            1_000_000_000 + cellIndex * 10_000_000_000 + attemptIndex * 200_000_000;
          return {
            ordinal: attemptIndex + 1,
            status: "valid",
            exposureTimestampNs,
            timestampUncertaintyUs: 0,
            receivedEvents: [
              { actionId, receiptTimestampNs: exposureTimestampNs + 100_000_000 },
            ],
            captureFramesPerSecondMilliHz: nominalCaptureFps,
            inferenceFramesPerSecondMilliHz: nominalInferenceFps,
            capturedFrameCount: 100,
            droppedFrameCount: 0,
            exposureTimeUs: 10_000,
            cpuPermille: 500,
            ramBytes: 100_000_000,
            usbBytesPerSecond: 10_000_000,
            evidenceSha256: nextDigest(),
            retainedRawFrameCount: 0,
            networkEgressBytes: 0,
          };
        },
      ),
      summary: {
        validAttemptCount: 20,
        invalidAttemptCount: 0,
        truePositiveCount: 20,
        falseNegativeCount: 0,
        falsePositiveCount: 0,
        precision: 1,
        recall: 1,
        p50Ms: 100,
        p95Ms: 100,
        p99Ms: 100,
        worstMs: 100,
        disposition: "passed",
      },
    }));
    return {
      index: cellIndex,
      modeId: expected.mode.id,
      personaClass: expected.personaClass,
      placementId: expected.placementId,
      lightingConditionId: expected.lightingConditionId,
      evidence: {
        skeletonTraceSha256: nextDigest(),
        groundTruthSha256: nextDigest(),
        pipelineTraceSha256: nextDigest(),
        resourceTraceSha256: nextDigest(),
      },
      actions,
      negativeWindow: {
        status: "valid",
        durationMs: ready.comparisonDesign.negativeWindowDurationMsPerModeCell,
        events: [],
        evidenceSha256: nextDigest(),
        retainedRawFrameCount: 0,
        networkEgressBytes: 0,
        disposition: "passed",
      },
      disposition: "passed",
    };
  });
  const result = {
    format: "vcg-capture-inference-mode-result/v1",
    campaignId: ready.campaignId,
    recordedAt: "2026-07-25T02:00:00.000Z",
    readyPlanSha256: digest(readyBytes),
    cells,
    modes: null,
    summary: null,
    dataDisposition: {
      retainedRawFrameCount: 0,
      rawFrameReplayCount: 0,
      networkEgressBytes: 0,
      participantIdentifiersIncluded: false,
      pathsIncluded: false,
      freeTextIncluded: false,
    },
    claimBoundary: RESULT_CLAIM_BOUNDARY,
    limitations: RESULT_LIMITATIONS,
  };
  refreshAggregates(result, ready);
  return { result, readyBytes };
}

function invalidateAttempt(attempt) {
  attempt.status = "harness-invalid";
  for (const key of [
    "exposureTimestampNs",
    "timestampUncertaintyUs",
    "captureFramesPerSecondMilliHz",
    "inferenceFramesPerSecondMilliHz",
    "capturedFrameCount",
    "droppedFrameCount",
    "exposureTimeUs",
    "cpuPermille",
    "ramBytes",
    "usbBytesPerSecond",
  ]) {
    attempt[key] = null;
  }
  attempt.receivedEvents = [];
}

test("accepts an exact safe I-178 ready plan", async () => {
  assert.deepEqual(await validateReadyCaptureInferenceModePlan(buildReadyPlan(), blockedPlan), {
    campaignId: "shared-camera-capture-inference-mode-v1",
    scheduledCellCount: 8,
  });
});

test("derives four qualified modes without selecting or changing the default", async () => {
  const ready = buildReadyPlan();
  await validateReadyCaptureInferenceModePlan(ready, blockedPlan);
  const { result, readyBytes } = buildPassingResult(ready);
  assert.deepEqual(validateCaptureInferenceModeResult(result, ready, readyBytes), {
    qualifiedModeCount: 4,
    rejectedModeCount: 0,
    incompleteModeCount: 0,
    qualifiedModeIds: ready.modes.map((mode) => mode.id),
    selectedModeId: null,
    productDefaultChanged: false,
    disposition: "qualified-modes",
  });
});

test("accepts honest incomplete attempts and derives an incomplete comparison", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const action = result.cells[0].actions[0];
  invalidateAttempt(action.attempts[0]);
  action.summary = {
    ...action.summary,
    validAttemptCount: 19,
    invalidAttemptCount: 1,
    truePositiveCount: 19,
    disposition: "incomplete",
  };
  result.cells[0].disposition = "incomplete";
  refreshAggregates(result, ready);
  const summary = validateCaptureInferenceModeResult(result, ready, readyBytes);
  assert.equal(summary.incompleteModeCount, 1);
  assert.equal(summary.disposition, "incomplete");
});

test("accepts honest p95 failure and derives mode rejection", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const action = result.cells[0].actions[0];
  for (const index of [18, 19]) {
    action.attempts[index].receivedEvents[0].receiptTimestampNs =
      action.attempts[index].exposureTimestampNs + 200_000_000;
  }
  action.summary = {
    ...action.summary,
    p95Ms: 200,
    p99Ms: 200,
    worstMs: 200,
    disposition: "rejected",
  };
  result.cells[0].disposition = "rejected";
  refreshAggregates(result, ready);
  const summary = validateCaptureInferenceModeResult(result, ready, readyBytes);
  assert.equal(summary.rejectedModeCount, 1);
  assert.equal(summary.qualifiedModeCount, 3);
});

test("rejects immutable ready-plan drift, hidden fields, and mode substitution", async () => {
  const source = buildReadyPlan();
  source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateReadyCaptureInferenceModePlan(source, blockedPlan), /immutable projection/u);

  const hidden = buildReadyPlan();
  hidden.modes[0].inference.provider = "unreviewed-provider";
  await assert.rejects(validateReadyCaptureInferenceModePlan(hidden, blockedPlan), /immutable projection/u);

  const mode = buildReadyPlan();
  mode.modes[0].capture.width = 1280;
  await assert.rejects(validateReadyCaptureInferenceModePlan(mode, blockedPlan), /capture\.width/u);
});

test("rejects missing or reused bindings, capture-arrival authority, and unsafe data policy", async () => {
  const missing = buildReadyPlan();
  missing.executionGate.trackerBundleSha256 = null;
  await assert.rejects(validateReadyCaptureInferenceModePlan(missing, blockedPlan), /ready digest/u);

  const reused = buildReadyPlan();
  reused.executionGate.trackerBundleSha256 = reused.executionGate.cameraDeviceSha256;
  await assert.rejects(validateReadyCaptureInferenceModePlan(reused, blockedPlan), /must not reuse/u);

  const arrival = buildReadyPlan();
  arrival.executionGate.exposureTimestampAuthority = "capture-arrival";
  await assert.rejects(validateReadyCaptureInferenceModePlan(arrival, blockedPlan), /approved exposure/u);

  const retained = buildReadyPlan();
  retained.dataPolicy.rawFrameRetentionAllowed = true;
  await assert.rejects(validateReadyCaptureInferenceModePlan(retained, blockedPlan), /raw retention/u);
});

test("rejects unsafe downscales, matrix arithmetic, thresholds, and selection authority", async () => {
  const downscale = buildReadyPlan();
  downscale.modes[0].inference.width = downscale.modes[0].capture.width;
  await assert.rejects(validateReadyCaptureInferenceModePlan(downscale, blockedPlan), /inference.width/u);

  const duplicatePlacement = buildReadyPlan();
  duplicatePlacement.comparisonDesign.placementIds = ["zone-center", "zone-center"];
  await assert.rejects(validateReadyCaptureInferenceModePlan(duplicatePlacement, blockedPlan), /duplicates/u);

  const falseCount = buildReadyPlan();
  falseCount.comparisonDesign.scheduledActionAttemptCount = 1599;
  await assert.rejects(validateReadyCaptureInferenceModePlan(falseCount, blockedPlan), /scheduledActionAttemptCount/u);

  const weakTail = buildReadyPlan();
  weakTail.acceptance.maximumP99ExposureToGameApiMs = 100;
  await assert.rejects(validateReadyCaptureInferenceModePlan(weakTail, blockedPlan), /maximumP99/u);

  const selection = buildReadyPlan();
  selection.acceptance.selectionPolicy = "select-fastest";
  await assert.rejects(validateReadyCaptureInferenceModePlan(selection, blockedPlan), /selectionPolicy/u);
});

test("binds result date and exact ready-plan bytes", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const hash = structuredClone(result);
  hash.readyPlanSha256 = "0".repeat(64);
  assert.throws(() => validateCaptureInferenceModeResult(hash, ready, readyBytes), /readyPlanSha256/u);

  const old = structuredClone(result);
  old.recordedAt = "2026-07-24T23:59:59.000Z";
  assert.throws(() => validateCaptureInferenceModeResult(old, ready, readyBytes), /precedes/u);
});

test("rejects omitted, reordered, substituted cells and reused evidence", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const omitted = structuredClone(result);
  omitted.cells.pop();
  assert.throws(() => validateCaptureInferenceModeResult(omitted, ready, readyBytes), /exactly 8/u);

  const reordered = structuredClone(result);
  [reordered.cells[0], reordered.cells[1]] = [reordered.cells[1], reordered.cells[0]];
  assert.throws(() => validateCaptureInferenceModeResult(reordered, ready, readyBytes), /\.index/u);

  const mode = structuredClone(result);
  mode.cells[0].modeId = ready.modes[1].id;
  assert.throws(() => validateCaptureInferenceModeResult(mode, ready, readyBytes), /modeId/u);

  const reused = structuredClone(result);
  reused.cells[1].evidence.skeletonTraceSha256 = reused.cells[0].evidence.skeletonTraceSha256;
  assert.throws(() => validateCaptureInferenceModeResult(reused, ready, readyBytes), /must not reuse/u);
});

test("rejects attempt omission, invalid shapes, event ordering, and timestamp substitution", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const omitted = structuredClone(result);
  omitted.cells[0].actions[0].attempts.pop();
  assert.throws(() => validateCaptureInferenceModeResult(omitted, ready, readyBytes), /exactly 20/u);

  const invalidWithSamples = structuredClone(result);
  invalidWithSamples.cells[0].actions[0].attempts[0].status = "harness-invalid";
  assert.throws(
    () => validateCaptureInferenceModeResult(invalidWithSamples, ready, readyBytes),
    /exposureTimestampNs/u,
  );

  const beforeExposure = structuredClone(result);
  const attempt = beforeExposure.cells[0].actions[0].attempts[0];
  attempt.receivedEvents[0].receiptTimestampNs = attempt.exposureTimestampNs - 1;
  assert.throws(
    () => validateCaptureInferenceModeResult(beforeExposure, ready, readyBytes),
    /precedes exposure/u,
  );
});

test("recomputes action scores, uncertainty, false events, and negative-window failure", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  const fakeSummary = structuredClone(result);
  fakeSummary.cells[0].actions[0].summary.p95Ms = 99;
  assert.throws(() => validateCaptureInferenceModeResult(fakeSummary, ready, readyBytes), /summary/u);

  const uncertainty = structuredClone(result);
  uncertainty.cells[0].actions[0].attempts[0].timestampUncertaintyUs = 1_000;
  assert.throws(() => validateCaptureInferenceModeResult(uncertainty, ready, readyBytes), /summary/u);

  const wrongEvent = structuredClone(result);
  wrongEvent.cells[0].actions[0].attempts[0].receivedEvents.push({
    actionId: "pause",
    receiptTimestampNs:
      wrongEvent.cells[0].actions[0].attempts[0].exposureTimestampNs + 110_000_000,
  });
  assert.throws(() => validateCaptureInferenceModeResult(wrongEvent, ready, readyBytes), /summary/u);

  const privileged = structuredClone(result);
  privileged.cells[0].negativeWindow.events.push({ actionId: "pause", receiptTimestampNs: 1 });
  assert.throws(() => validateCaptureInferenceModeResult(privileged, ready, readyBytes), /disposition/u);
});

test("rejects resource rescue, retained frames, egress, paths, identifiers, and free text", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  const cpu = structuredClone(result);
  cpu.cells[0].actions[0].attempts[0].cpuPermille = 900;
  assert.throws(() => validateCaptureInferenceModeResult(cpu, ready, readyBytes), /disposition/u);

  const drops = structuredClone(result);
  drops.cells[0].actions[0].attempts[0].droppedFrameCount = 10;
  assert.throws(() => validateCaptureInferenceModeResult(drops, ready, readyBytes), /disposition/u);

  const retained = structuredClone(result);
  retained.cells[0].actions[0].attempts[0].retainedRawFrameCount = 1;
  assert.throws(() => validateCaptureInferenceModeResult(retained, ready, readyBytes), /retainedRawFrameCount/u);

  for (const key of ["participantIdentifiersIncluded", "pathsIncluded", "freeTextIncluded"]) {
    const unsafe = structuredClone(result);
    unsafe.dataDisposition[key] = true;
    assert.throws(() => validateCaptureInferenceModeResult(unsafe, ready, readyBytes), /dataDisposition/u);
  }
});

test("rejects aggregate rescue, mode promotion, selection, and product-default mutation", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  const hiddenFailure = structuredClone(result);
  hiddenFailure.cells[0].disposition = "rejected";
  assert.throws(() => validateCaptureInferenceModeResult(hiddenFailure, ready, readyBytes), /disposition/u);

  const modes = structuredClone(result);
  modes.modes[0].rejectedCellCount = 1;
  assert.throws(() => validateCaptureInferenceModeResult(modes, ready, readyBytes), /result.modes/u);

  const selection = structuredClone(result);
  selection.summary.selectedModeId = ready.modes[0].id;
  assert.throws(() => validateCaptureInferenceModeResult(selection, ready, readyBytes), /result.summary/u);

  const changed = structuredClone(result);
  changed.summary.productDefaultChanged = true;
  assert.throws(() => validateCaptureInferenceModeResult(changed, ready, readyBytes), /result.summary/u);
});

test("requires canonical bounded ready-plan and result envelopes", () => {
  const ready = buildReadyPlan();
  const { result } = buildPassingResult(ready);
  const readyBytes = canonicalBytes(ready);
  const resultBytes = canonicalBytes(result);
  assert.deepEqual(parseCanonicalReadyCaptureInferenceModePlan(readyBytes), ready);
  assert.deepEqual(parseCanonicalCaptureInferenceModeResult(resultBytes), result);
  assert.throws(
    () => parseCanonicalReadyCaptureInferenceModePlan(Buffer.from(JSON.stringify(ready))),
    /canonical two-space JSON/u,
  );
  assert.throws(
    () =>
      parseCanonicalCaptureInferenceModeResult(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), resultBytes]),
      ),
    /must not contain a UTF-8 BOM/u,
  );
  assert.throws(
    () => parseCanonicalCaptureInferenceModeResult(new Uint8Array([0xff])),
    /valid UTF-8/u,
  );
  assert.throws(
    () =>
      parseCanonicalCaptureInferenceModeResult(
        Buffer.alloc(MAX_CAPTURE_INFERENCE_MODE_RESULT_BYTES + 1),
      ),
    /must be between 1 and/u,
  );
});
