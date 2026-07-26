import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { validateCaptureInferenceModePlan } from "./validate-capture-inference-mode-qualification.mjs";

export const MAX_READY_CAPTURE_INFERENCE_MODE_PLAN_BYTES = 128 * 1024;
export const MAX_CAPTURE_INFERENCE_MODE_RESULT_BYTES = 32 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
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

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  if (!isDeepStrictEqual(Object.keys(value), keys)) {
    fail(`${label} fields must be exactly ${keys.join(", ")}`);
  }
}

function assertExact(value, expected, label) {
  if (!isDeepStrictEqual(value, expected)) {
    fail(`${label} does not match the bound mode-comparison contract`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertSafeId(value, label) {
  if (typeof value !== "string" || value.length > 64 || !SAFE_ID_PATTERN.test(value)) {
    fail(`${label} must be a safe bounded opaque ID`);
  }
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
}

function assertNumber(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number from ${minimum} through ${maximum}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function round6(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round6(sorted[Math.ceil(sorted.length * percentile) - 1]);
}

function parseCanonicalJson(bytes, maximumBytes, label) {
  if (!(bytes instanceof Uint8Array)) fail(`${label} bytes must be a Uint8Array`);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    fail(`${label} must be between 1 and ${maximumBytes} bytes`);
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${label} must not contain a UTF-8 BOM`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} must contain valid JSON`);
  }
  assertPlainObject(value, label);
  if (text !== `${JSON.stringify(value, null, 2)}\n`) {
    fail(`${label} must use canonical two-space JSON with one trailing newline`);
  }
  return value;
}

export function parseCanonicalReadyCaptureInferenceModePlan(bytes) {
  return parseCanonicalJson(
    bytes,
    MAX_READY_CAPTURE_INFERENCE_MODE_PLAN_BYTES,
    "ready capture/inference mode plan",
  );
}

export function parseCanonicalCaptureInferenceModeResult(bytes) {
  return parseCanonicalJson(
    bytes,
    MAX_CAPTURE_INFERENCE_MODE_RESULT_BYTES,
    "capture/inference mode result",
  );
}

function restoreKnownFields(projection, blockedPlan, objectKey) {
  for (const key of Object.keys(blockedPlan[objectKey])) {
    projection[objectKey][key] = clone(blockedPlan[objectKey][key]);
  }
}

function collectReadyDigests(readyPlan) {
  const digests = [
    ...Object.entries(readyPlan.executionGate)
      .filter(([key]) => key.endsWith("Sha256"))
      .map(([, value]) => value),
  ];
  for (const [index, digest] of digests.entries()) {
    assertSha256(digest, `ready digest[${index}]`);
  }
  if (new Set(digests).size !== digests.length) {
    fail("ready plan must not reuse digests across distinct bindings");
  }
}

export async function validateReadyCaptureInferenceModePlan(
  readyPlan,
  blockedPlan,
  options,
) {
  await validateCaptureInferenceModePlan(blockedPlan, options);
  assertExactKeys(readyPlan, Object.keys(blockedPlan), "ready capture/inference mode plan");
  assertExact(readyPlan.format, blockedPlan.format, "ready format");
  assertExact(readyPlan.campaignId, blockedPlan.campaignId, "ready campaignId");
  assertExact(readyPlan.createdAt, blockedPlan.createdAt, "ready createdAt");
  assertExact(readyPlan.motionApiVersion, blockedPlan.motionApiVersion, "ready Motion API");
  assertExact(readyPlan.qualification, "ready-plan-no-results", "ready qualification");

  assertExact(readyPlan.executionGate.status, "ready", "executionGate.status");
  assertSafeId(readyPlan.executionGate.targetId, "executionGate.targetId");
  assertSafeId(readyPlan.executionGate.cameraId, "executionGate.cameraId");
  if (
    ![
      "hardware-exposure-start",
      "hardware-exposure-midpoint-with-start-uncertainty",
      "independently-validated-driver-exposure",
    ].includes(readyPlan.executionGate.exposureTimestampAuthority)
  ) {
    fail("executionGate.exposureTimestampAuthority is not an approved exposure authority");
  }
  assertExact(readyPlan.executionGate.blockerCodes, [], "executionGate.blockerCodes");

  assertExact(readyPlan.modes.length, blockedPlan.modes.length, "ready mode count");
  for (const [index, mode] of readyPlan.modes.entries()) {
    const blockedMode = blockedPlan.modes[index];
    assertExact(mode.id, blockedMode.id, `modes[${index}].id`);
    for (const key of [
      "width",
      "height",
      "framesPerSecondNumerator",
      "framesPerSecondDenominator",
    ]) {
      assertExact(
        mode.capture[key],
        blockedMode.capture[key],
        `modes[${index}].capture.${key}`,
      );
    }
    for (const key of [
      "strategy",
      "maximumFramesPerSecondNumerator",
      "maximumFramesPerSecondDenominator",
      "independentResizeCostRequired",
    ]) {
      assertExact(
        mode.inference[key],
        blockedMode.inference[key],
        `modes[${index}].inference.${key}`,
      );
    }
    assertSafeId(mode.capture.pixelFormat, `modes[${index}].capture.pixelFormat`);
    assertSafeId(mode.capture.controlPresetId, `modes[${index}].capture.controlPresetId`);
    if (mode.inference.strategy === "downscaled-from-capture") {
      assertInteger(mode.inference.width, 1, mode.capture.width - 1, `modes[${index}].inference.width`);
      assertInteger(mode.inference.height, 1, mode.capture.height - 1, `modes[${index}].inference.height`);
    } else {
      assertExact(mode.inference.width, mode.capture.width, `modes[${index}].inference.width`);
      assertExact(mode.inference.height, mode.capture.height, `modes[${index}].inference.height`);
    }
  }

  assertInteger(readyPlan.comparisonDesign.warmupAttemptsPerMode, 1, 20, "warmupAttemptsPerMode");
  assertInteger(readyPlan.comparisonDesign.interleaveBlockSize, 1, 20, "interleaveBlockSize");
  for (const key of ["placementIds", "lightingConditionIds"]) {
    const values = readyPlan.comparisonDesign[key];
    if (!Array.isArray(values) || values.length === 0 || values.length > 8) {
      fail(`${key} must contain 1 through 8 safe IDs`);
    }
    values.forEach((value, index) => assertSafeId(value, `${key}[${index}]`));
    if (new Set(values).size !== values.length) fail(`${key} must not contain duplicates`);
  }
  const scheduledCellCount =
    readyPlan.modes.length *
    readyPlan.comparisonDesign.blockingPersonaClasses.length *
    readyPlan.comparisonDesign.placementIds.length *
    readyPlan.comparisonDesign.lightingConditionIds.length;
  assertExact(
    readyPlan.comparisonDesign.scheduledCellCount,
    scheduledCellCount,
    "scheduledCellCount",
  );
  assertExact(
    readyPlan.comparisonDesign.scheduledActionAttemptCount,
    scheduledCellCount *
      readyPlan.comparisonDesign.actions.length *
      readyPlan.comparisonDesign.measuredAttemptsPerActionPerCell,
    "scheduledActionAttemptCount",
  );
  assertInteger(readyPlan.measurements.resourceSamplingIntervalMs, 10, 10_000, "resourceSamplingIntervalMs");

  assertInteger(
    readyPlan.acceptance.minimumCaptureFramesPerSecondMilliHz,
    1,
    60_000,
    "minimumCaptureFramesPerSecondMilliHz",
  );
  assertNumber(readyPlan.acceptance.maximumDroppedFrameRate, 0, 1, "maximumDroppedFrameRate");
  assertInteger(
    readyPlan.acceptance.maximumP99ExposureToGameApiMs,
    readyPlan.acceptance.maximumP95ExposureToGameApiMs,
    10_000,
    "maximumP99ExposureToGameApiMs",
  );
  assertInteger(
    readyPlan.acceptance.maximumWorstExposureToGameApiMs,
    readyPlan.acceptance.maximumP99ExposureToGameApiMs,
    10_000,
    "maximumWorstExposureToGameApiMs",
  );
  assertInteger(
    readyPlan.acceptance.minimumInferenceFramesPerSecondMilliHz,
    1,
    60_000,
    "minimumInferenceFramesPerSecondMilliHz",
  );
  assertInteger(readyPlan.acceptance.maximumUsbBytesPerSecond, 1, 10_000_000_000, "maximumUsbBytesPerSecond");
  assertInteger(readyPlan.acceptance.maximumCpuPermille, 1, 1_000, "maximumCpuPermille");
  assertInteger(readyPlan.acceptance.maximumRamBytes, 1, Number.MAX_SAFE_INTEGER, "maximumRamBytes");
  assertInteger(readyPlan.acceptance.maximumP95ExposureTimeUs, 1, 1_000_000, "maximumP95ExposureTimeUs");
  assertExact(
    readyPlan.acceptance.selectionPolicy,
    "qualification-only-no-selection",
    "selectionPolicy",
  );

  assertExact(readyPlan.dataPolicy.temporaryFrameAnalysisAuthorized, true, "frame authority");
  assertSha256(readyPlan.dataPolicy.dataHandlingAuthoritySha256, "dataHandlingAuthoritySha256");
  assertExact(
    readyPlan.dataPolicy.dataHandlingAuthoritySha256,
    readyPlan.executionGate.dataHandlingProtocolSha256,
    "data handling authority binding",
  );
  assertExact(readyPlan.dataPolicy.rawFrameRetentionAllowed, false, "raw retention");
  assertExact(readyPlan.dataPolicy.rawFrameNetworkEgressAllowed, false, "raw egress");
  assertExact(readyPlan.dataPolicy.rawFrameReplayAllowed, false, "raw replay");
  assertExact(readyPlan.dataPolicy.skeletonOnlyTraceRequired, true, "trace boundary");
  assertExact(readyPlan.dataPolicy.participantIdentifiersAllowed, false, "participant IDs");
  assertExact(readyPlan.dataPolicy.freeTextAllowed, false, "free text");

  assertExact(readyPlan.resultBoundary.resultArtifactSha256, null, "result digest");
  assertExact(readyPlan.resultBoundary.qualifiedModeIds, [], "qualified modes");
  assertExact(readyPlan.resultBoundary.selectedModeId, null, "selected mode");
  assertExact(readyPlan.resultBoundary.productDefaultChanged, false, "product default");
  assertExact(readyPlan.resultBoundary.executionAuthorized, true, "execution authority");
  assertExact(readyPlan.resultBoundary.purchaseAuthorized, false, "purchase authority");
  assertExact(readyPlan.claimBoundary, READY_CLAIM_BOUNDARY, "ready claimBoundary");
  assertExact(readyPlan.limitations, READY_LIMITATIONS, "ready limitations");
  collectReadyDigests(readyPlan);

  const projection = clone(readyPlan);
  projection.qualification = blockedPlan.qualification;
  for (const key of Object.keys(blockedPlan.executionGate)) {
    projection.executionGate[key] = clone(blockedPlan.executionGate[key]);
  }
  for (const [index, blockedMode] of blockedPlan.modes.entries()) {
    for (const key of Object.keys(blockedMode.capture)) {
      projection.modes[index].capture[key] = clone(blockedMode.capture[key]);
    }
    for (const key of Object.keys(blockedMode.inference)) {
      projection.modes[index].inference[key] = clone(blockedMode.inference[key]);
    }
  }
  restoreKnownFields(projection, blockedPlan, "comparisonDesign");
  restoreKnownFields(projection, blockedPlan, "measurements");
  restoreKnownFields(projection, blockedPlan, "acceptance");
  restoreKnownFields(projection, blockedPlan, "dataPolicy");
  restoreKnownFields(projection, blockedPlan, "resultBoundary");
  projection.claimBoundary = blockedPlan.claimBoundary;
  projection.limitations = clone(blockedPlan.limitations);
  assertExact(projection, blockedPlan, "ready plan immutable projection");

  return { campaignId: readyPlan.campaignId, scheduledCellCount };
}

export function expandCaptureInferenceModeCells(readyPlan) {
  const cells = [];
  for (const mode of readyPlan.modes) {
    for (const personaClass of readyPlan.comparisonDesign.blockingPersonaClasses) {
      for (const placementId of readyPlan.comparisonDesign.placementIds) {
        for (const lightingConditionId of readyPlan.comparisonDesign.lightingConditionIds) {
          cells.push({ mode, personaClass, placementId, lightingConditionId });
        }
      }
    }
  }
  return cells;
}

function validateEvent(event, label, readyPlan) {
  assertExactKeys(event, ["actionId", "receiptTimestampNs"], label);
  const allowed = new Set([
    ...readyPlan.comparisonDesign.actions,
    ...readyPlan.comparisonDesign.privilegedActionIds,
  ]);
  if (!allowed.has(event.actionId)) fail(`${label}.actionId is not in the bound action vocabulary`);
  assertInteger(event.receiptTimestampNs, 0, Number.MAX_SAFE_INTEGER, `${label}.receiptTimestampNs`);
}

function validateAttempt(attempt, label, actionId, mode, readyPlan, usedDigests) {
  assertExactKeys(
    attempt,
    [
      "ordinal",
      "status",
      "exposureTimestampNs",
      "timestampUncertaintyUs",
      "receivedEvents",
      "captureFramesPerSecondMilliHz",
      "inferenceFramesPerSecondMilliHz",
      "capturedFrameCount",
      "droppedFrameCount",
      "exposureTimeUs",
      "cpuPermille",
      "ramBytes",
      "usbBytesPerSecond",
      "evidenceSha256",
      "retainedRawFrameCount",
      "networkEgressBytes",
    ],
    label,
  );
  if (!["valid", "harness-invalid", "stopped"].includes(attempt.status)) {
    fail(`${label}.status is not allowed`);
  }
  assertSha256(attempt.evidenceSha256, `${label}.evidenceSha256`);
  if (usedDigests.has(attempt.evidenceSha256)) fail("result must not reuse evidence digests");
  usedDigests.add(attempt.evidenceSha256);
  assertExact(attempt.retainedRawFrameCount, 0, `${label}.retainedRawFrameCount`);
  assertExact(attempt.networkEgressBytes, 0, `${label}.networkEgressBytes`);

  if (attempt.status !== "valid") {
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
      assertExact(attempt[key], null, `${label}.${key}`);
    }
    assertExact(attempt.receivedEvents, [], `${label}.receivedEvents`);
    return;
  }

  assertInteger(attempt.exposureTimestampNs, 0, Number.MAX_SAFE_INTEGER, `${label}.exposureTimestampNs`);
  assertInteger(attempt.timestampUncertaintyUs, 0, 1_000_000, `${label}.timestampUncertaintyUs`);
  if (!Array.isArray(attempt.receivedEvents) || attempt.receivedEvents.length > 32) {
    fail(`${label}.receivedEvents must contain at most 32 events`);
  }
  attempt.receivedEvents.forEach((event, index) => {
    validateEvent(event, `${label}.receivedEvents[${index}]`, readyPlan);
    if (event.receiptTimestampNs < attempt.exposureTimestampNs) {
      fail(`${label}.receivedEvents[${index}] precedes exposure`);
    }
    if (index > 0 && event.receiptTimestampNs < attempt.receivedEvents[index - 1].receiptTimestampNs) {
      fail(`${label}.receivedEvents must be ordered`);
    }
  });
  assertInteger(
    attempt.captureFramesPerSecondMilliHz,
    1,
    mode.capture.framesPerSecondNumerator * 1_000,
    `${label}.captureFramesPerSecondMilliHz`,
  );
  assertInteger(
    attempt.inferenceFramesPerSecondMilliHz,
    1,
    mode.inference.maximumFramesPerSecondNumerator * 1_000,
    `${label}.inferenceFramesPerSecondMilliHz`,
  );
  assertInteger(attempt.capturedFrameCount, 1, 10_000_000, `${label}.capturedFrameCount`);
  assertInteger(attempt.droppedFrameCount, 0, 10_000_000, `${label}.droppedFrameCount`);
  assertInteger(attempt.exposureTimeUs, 1, 1_000_000, `${label}.exposureTimeUs`);
  assertInteger(attempt.cpuPermille, 0, 1_000, `${label}.cpuPermille`);
  assertInteger(attempt.ramBytes, 1, Number.MAX_SAFE_INTEGER, `${label}.ramBytes`);
  assertInteger(attempt.usbBytesPerSecond, 0, 10_000_000_000, `${label}.usbBytesPerSecond`);
  if (!readyPlan.comparisonDesign.actions.includes(actionId)) fail(`${label} action is not bound`);
}

function deriveActionSummary(action, negativeEvents, readyPlan) {
  let truePositiveCount = 0;
  let falseNegativeCount = 0;
  let falsePositiveCount = negativeEvents.filter((event) => event.actionId === action.actionId).length;
  let invalidAttemptCount = 0;
  const latencies = [];

  for (const attempt of action.attempts) {
    if (attempt.status !== "valid") {
      invalidAttemptCount += 1;
      continue;
    }
    const matching = attempt.receivedEvents.filter((event) => event.actionId === action.actionId);
    if (matching.length === 0) {
      falseNegativeCount += 1;
    } else {
      truePositiveCount += 1;
      latencies.push(
        round6(
          (matching[0].receiptTimestampNs - attempt.exposureTimestampNs) / 1_000_000 +
            attempt.timestampUncertaintyUs / 1_000,
        ),
      );
      falsePositiveCount += matching.length - 1;
    }
    falsePositiveCount += attempt.receivedEvents.filter(
      (event) => event.actionId !== action.actionId,
    ).length;
  }

  const validAttemptCount = action.attempts.length - invalidAttemptCount;
  const precisionDenominator = truePositiveCount + falsePositiveCount;
  const precision = precisionDenominator === 0 ? 0 : round6(truePositiveCount / precisionDenominator);
  const recallDenominator = truePositiveCount + falseNegativeCount;
  const recall = recallDenominator === 0 ? 0 : round6(truePositiveCount / recallDenominator);
  const p50Ms = nearestRank(latencies, 0.5);
  const p95Ms = nearestRank(latencies, 0.95);
  const p99Ms = nearestRank(latencies, 0.99);
  const worstMs = latencies.length === 0 ? null : round6(Math.max(...latencies));
  const rejected =
    validAttemptCount > 0 &&
    (precision < readyPlan.acceptance.minimumActionPrecision ||
      recall < readyPlan.acceptance.minimumActionRecall ||
      p95Ms === null ||
      p95Ms > readyPlan.acceptance.maximumP95ExposureToGameApiMs ||
      p99Ms > readyPlan.acceptance.maximumP99ExposureToGameApiMs ||
      worstMs > readyPlan.acceptance.maximumWorstExposureToGameApiMs);
  return {
    validAttemptCount,
    invalidAttemptCount,
    truePositiveCount,
    falseNegativeCount,
    falsePositiveCount,
    precision,
    recall,
    p50Ms,
    p95Ms,
    p99Ms,
    worstMs,
    disposition: rejected ? "rejected" : invalidAttemptCount > 0 ? "incomplete" : "passed",
  };
}

function resourcesPass(cell, readyPlan) {
  const attempts = cell.actions.flatMap((action) => action.attempts).filter((a) => a.status === "valid");
  if (attempts.length === 0) return false;
  const exposureP95 = nearestRank(attempts.map((attempt) => attempt.exposureTimeUs), 0.95);
  return (
    attempts.every(
      (attempt) =>
        attempt.captureFramesPerSecondMilliHz >=
          readyPlan.acceptance.minimumCaptureFramesPerSecondMilliHz &&
        attempt.inferenceFramesPerSecondMilliHz >=
          readyPlan.acceptance.minimumInferenceFramesPerSecondMilliHz &&
        attempt.droppedFrameCount /
          (attempt.capturedFrameCount + attempt.droppedFrameCount) <=
          readyPlan.acceptance.maximumDroppedFrameRate &&
        attempt.cpuPermille <= readyPlan.acceptance.maximumCpuPermille &&
        attempt.ramBytes <= readyPlan.acceptance.maximumRamBytes &&
        attempt.usbBytesPerSecond <= readyPlan.acceptance.maximumUsbBytesPerSecond,
    ) && exposureP95 <= readyPlan.acceptance.maximumP95ExposureTimeUs
  );
}

function deriveCellDisposition(cell, readyPlan) {
  const actionDispositions = cell.actions.map((action) => action.summary.disposition);
  const negativeRejected =
    cell.negativeWindow.status === "valid" &&
    cell.negativeWindow.events.some((event) =>
      readyPlan.comparisonDesign.privilegedActionIds.includes(event.actionId),
    );
  if (
    actionDispositions.includes("rejected") ||
    negativeRejected ||
    (cell.negativeWindow.status === "valid" && !resourcesPass(cell, readyPlan))
  ) {
    return "rejected";
  }
  if (
    actionDispositions.includes("incomplete") ||
    cell.negativeWindow.status !== "valid" ||
    Object.values(cell.evidence).some((value) => value === null)
  ) {
    return "incomplete";
  }
  return "passed";
}

function validateNegativeWindow(window, label, readyPlan, usedDigests) {
  assertExactKeys(
    window,
    [
      "status",
      "durationMs",
      "events",
      "evidenceSha256",
      "retainedRawFrameCount",
      "networkEgressBytes",
      "disposition",
    ],
    label,
  );
  if (!["valid", "harness-invalid", "stopped"].includes(window.status)) {
    fail(`${label}.status is not allowed`);
  }
  assertSha256(window.evidenceSha256, `${label}.evidenceSha256`);
  if (usedDigests.has(window.evidenceSha256)) fail("result must not reuse evidence digests");
  usedDigests.add(window.evidenceSha256);
  assertExact(window.retainedRawFrameCount, 0, `${label}.retainedRawFrameCount`);
  assertExact(window.networkEgressBytes, 0, `${label}.networkEgressBytes`);
  if (window.status === "valid") {
    assertInteger(
      window.durationMs,
      readyPlan.comparisonDesign.negativeWindowDurationMsPerModeCell,
      86_400_000,
      `${label}.durationMs`,
    );
    if (!Array.isArray(window.events) || window.events.length > 10_000) {
      fail(`${label}.events must contain at most 10000 events`);
    }
    window.events.forEach((event, index) => validateEvent(event, `${label}.events[${index}]`, readyPlan));
    const rejected = window.events.some((event) =>
      readyPlan.comparisonDesign.privilegedActionIds.includes(event.actionId),
    );
    assertExact(window.disposition, rejected ? "rejected" : "passed", `${label}.disposition`);
  } else {
    assertExact(window.durationMs, null, `${label}.durationMs`);
    assertExact(window.events, [], `${label}.events`);
    assertExact(window.disposition, "incomplete", `${label}.disposition`);
  }
}

function validateCell(cell, expected, index, readyPlan, usedDigests) {
  assertExactKeys(
    cell,
    [
      "index",
      "modeId",
      "personaClass",
      "placementId",
      "lightingConditionId",
      "evidence",
      "actions",
      "negativeWindow",
      "disposition",
    ],
    `cells[${index}]`,
  );
  assertExact(cell.index, index, `cells[${index}].index`);
  assertExact(cell.modeId, expected.mode.id, `cells[${index}].modeId`);
  assertExact(cell.personaClass, expected.personaClass, `cells[${index}].personaClass`);
  assertExact(cell.placementId, expected.placementId, `cells[${index}].placementId`);
  assertExact(
    cell.lightingConditionId,
    expected.lightingConditionId,
    `cells[${index}].lightingConditionId`,
  );
  assertExactKeys(
    cell.evidence,
    ["skeletonTraceSha256", "groundTruthSha256", "pipelineTraceSha256", "resourceTraceSha256"],
    `cells[${index}].evidence`,
  );
  for (const [key, value] of Object.entries(cell.evidence)) {
    if (value !== null) {
      assertSha256(value, `cells[${index}].evidence.${key}`);
      if (usedDigests.has(value)) fail("result must not reuse evidence digests");
      usedDigests.add(value);
    }
  }

  if (!Array.isArray(cell.actions) || cell.actions.length !== readyPlan.comparisonDesign.actions.length) {
    fail(`cells[${index}].actions must preserve the complete action inventory`);
  }
  for (const [actionIndex, action] of cell.actions.entries()) {
    assertExactKeys(action, ["actionId", "attempts", "summary"], `cells[${index}].actions[${actionIndex}]`);
    assertExact(
      action.actionId,
      readyPlan.comparisonDesign.actions[actionIndex],
      `cells[${index}].actions[${actionIndex}].actionId`,
    );
    const expectedAttempts = readyPlan.comparisonDesign.measuredAttemptsPerActionPerCell;
    if (!Array.isArray(action.attempts) || action.attempts.length !== expectedAttempts) {
      fail(`cells[${index}].actions[${actionIndex}].attempts must contain exactly ${expectedAttempts}`);
    }
    for (const [attemptIndex, attempt] of action.attempts.entries()) {
      assertExact(
        attempt.ordinal,
        attemptIndex + 1,
        `cells[${index}].actions[${actionIndex}].attempts[${attemptIndex}].ordinal`,
      );
      validateAttempt(
        attempt,
        `cells[${index}].actions[${actionIndex}].attempts[${attemptIndex}]`,
        action.actionId,
        expected.mode,
        readyPlan,
        usedDigests,
      );
    }
  }

  validateNegativeWindow(cell.negativeWindow, `cells[${index}].negativeWindow`, readyPlan, usedDigests);
  for (const [actionIndex, action] of cell.actions.entries()) {
    assertExact(
      action.summary,
      deriveActionSummary(action, cell.negativeWindow.events, readyPlan),
      `cells[${index}].actions[${actionIndex}].summary`,
    );
  }
  assertExact(cell.disposition, deriveCellDisposition(cell, readyPlan), `cells[${index}].disposition`);
}

function deriveModes(cells, readyPlan) {
  return readyPlan.modes.map((mode) => {
    const modeCells = cells.filter((cell) => cell.modeId === mode.id);
    const passedCellCount = modeCells.filter((cell) => cell.disposition === "passed").length;
    const rejectedCellCount = modeCells.filter((cell) => cell.disposition === "rejected").length;
    const incompleteCellCount = modeCells.filter((cell) => cell.disposition === "incomplete").length;
    return {
      modeId: mode.id,
      passedCellCount,
      rejectedCellCount,
      incompleteCellCount,
      disposition:
        rejectedCellCount > 0 ? "rejected" : incompleteCellCount > 0 ? "incomplete" : "qualified",
    };
  });
}

function deriveOverallSummary(modes) {
  const qualifiedModeIds = modes
    .filter((mode) => mode.disposition === "qualified")
    .map((mode) => mode.modeId);
  const qualifiedModeCount = qualifiedModeIds.length;
  const rejectedModeCount = modes.filter((mode) => mode.disposition === "rejected").length;
  const incompleteModeCount = modes.filter((mode) => mode.disposition === "incomplete").length;
  return {
    qualifiedModeCount,
    rejectedModeCount,
    incompleteModeCount,
    qualifiedModeIds,
    selectedModeId: null,
    productDefaultChanged: false,
    disposition:
      incompleteModeCount > 0
        ? "incomplete"
        : qualifiedModeCount > 0
          ? "qualified-modes"
          : "no-qualified-mode",
  };
}

export function validateCaptureInferenceModeResult(result, readyPlan, readyPlanBytes) {
  assertExactKeys(
    result,
    [
      "format",
      "campaignId",
      "recordedAt",
      "readyPlanSha256",
      "cells",
      "modes",
      "summary",
      "dataDisposition",
      "claimBoundary",
      "limitations",
    ],
    "capture/inference mode result",
  );
  assertExact(result.format, "vcg-capture-inference-mode-result/v1", "result format");
  assertExact(result.campaignId, readyPlan.campaignId, "result campaignId");
  const recordedAtMs = Date.parse(result.recordedAt);
  if (!Number.isFinite(recordedAtMs) || new Date(recordedAtMs).toISOString() !== result.recordedAt) {
    fail("result.recordedAt must be a canonical ISO timestamp");
  }
  if (recordedAtMs < Date.parse(readyPlan.createdAt)) fail("result.recordedAt precedes the ready plan");
  assertExact(result.readyPlanSha256, sha256(readyPlanBytes), "readyPlanSha256");

  const expectedCells = expandCaptureInferenceModeCells(readyPlan);
  if (!Array.isArray(result.cells) || result.cells.length !== expectedCells.length) {
    fail(`result.cells must contain exactly ${expectedCells.length} ordered cells`);
  }
  const usedDigests = new Set();
  for (const [index, cell] of result.cells.entries()) {
    validateCell(cell, expectedCells[index], index, readyPlan, usedDigests);
  }
  const derivedModes = deriveModes(result.cells, readyPlan);
  assertExact(result.modes, derivedModes, "result.modes");
  assertExact(result.summary, deriveOverallSummary(derivedModes), "result.summary");
  assertExact(
    result.dataDisposition,
    {
      retainedRawFrameCount: 0,
      rawFrameReplayCount: 0,
      networkEgressBytes: 0,
      participantIdentifiersIncluded: false,
      pathsIncluded: false,
      freeTextIncluded: false,
    },
    "result.dataDisposition",
  );
  assertExact(result.claimBoundary, RESULT_CLAIM_BOUNDARY, "result.claimBoundary");
  assertExact(result.limitations, RESULT_LIMITATIONS, "result.limitations");
  return result.summary;
}
