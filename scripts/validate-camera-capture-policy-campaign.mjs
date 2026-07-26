import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPlanPath = resolve(
  root,
  "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
);
const MAX_PLAN_BYTES = 96 * 1024;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CAMERA_CAPTURE_POLICY_PLAN_FORMAT =
  "vcg-camera-capture-policy-plan/v1";
export const CAMERA_CAPTURE_POLICY_RESULT_FORMAT =
  "vcg-camera-capture-policy-result/v1";

export const CAPTURE_PRESETS = Object.freeze([
  { id: "automatic-baseline", purpose: "device-automatic-baseline" },
  { id: "balanced-manual", purpose: "manual-balanced" },
  { id: "short-exposure-manual", purpose: "manual-motion-freeze" },
]);
export const CAPTURE_PERSONAS = Object.freeze([
  "adult-standing",
  "school-age-child-standing",
]);
export const CAPTURE_LIGHTING_CONDITIONS = Object.freeze([
  "daylight",
  "backlight",
  "warm-lamp",
  "cool-lamp",
  "tv-only",
  "dim",
]);
export const CAPTURE_MOTION_CONDITIONS = Object.freeze([
  "neutral",
  "dodge-left",
  "dodge-right",
  "duck",
  "jump",
  "menu-swipe-left",
  "menu-swipe-right",
]);

const blockerCodes = [
  "acceptance-gates",
  "camera-control-binding",
  "exposure-timestamp-authority",
  "lighting-floor-selection",
  "optical-ground-truth",
  "participant-consent",
  "room-lighting-binding",
];
const exposureAuthorities = new Set([
  "hardware-exposure-start",
  "hardware-exposure-midpoint",
  "validated-driver-exposure",
]);
const controlKeys = [
  "pixelFormat",
  "exposureMode",
  "exposureTimeUs",
  "gainMode",
  "gainMilliDb",
  "whiteBalanceMode",
  "whiteBalanceKelvin",
  "focusMode",
  "focusValue",
  "powerLineFrequencyHz",
  "bufferCount",
];
const acceptanceKeys = [
  "minimumBlockingIlluminanceMilliLux",
  "minimumCapturedFramesPerSecondMilliHz",
  "maximumDroppedFrameRate",
  "maximumP95ExposureTimeUs",
  "maximumP95BlurWidthMilliPixels",
  "maximumP95ColorErrorMilliDeltaE",
  "maximumP95NormalizedLandmarkError",
  "minimumCorrectOutcomeRecall",
  "maximumWrongActionCountPerCell",
];
const invalidTrialReasonCodes = new Set([
  "participant-stop",
  "equipment-fault",
  "lighting-out-of-range",
  "ground-truth-fault",
  "timestamp-fault",
  "protocol-deviation",
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

function assertSafeInteger(value, minimum, maximum, path) {
  assert.ok(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    `${path} must be a safe integer from ${minimum} through ${maximum}`,
  );
}

function assertFiniteNumber(value, minimum, maximum, path) {
  assert.ok(
    typeof value === "number"
      && Number.isFinite(value)
      && value >= minimum
      && value <= maximum,
    `${path} must be a finite number from ${minimum} through ${maximum}`,
  );
}

function assertDigest(value, path) {
  assert.match(value, SHA256_PATTERN, `${path} must be lowercase SHA-256`);
}

function assertIsoTimestamp(value, path) {
  assert.equal(typeof value, "string", `${path} must be a string`);
  const parsed = new Date(value);
  assert.ok(Number.isFinite(parsed.getTime()), `${path} is invalid`);
  assert.equal(parsed.toISOString(), value, `${path} must be canonical UTC`);
}

function validateCollectionGate(plan) {
  const gate = plan.collectionGate;
  exactKeys(
    gate,
    [
      "status",
      "targetId",
      "cameraId",
      "cameraDeviceSha256",
      "cameraControlInventorySha256",
      "roomLightingProtocolSha256",
      "opticalGroundTruthProtocolSha256",
      "poseActionProtocolSha256",
      "exposureTimestampAuthority",
      "exposureTimestampProofSha256",
      "participantProtocolSha256",
      "dataHandlingProtocolSha256",
      "blockerCodes",
    ],
    "plan.collectionGate",
  );
  assert.ok(
    gate.status === "blocked" || gate.status === "ready",
    "plan.collectionGate.status is invalid",
  );
  const digestKeys = [
    "cameraDeviceSha256",
    "cameraControlInventorySha256",
    "roomLightingProtocolSha256",
    "opticalGroundTruthProtocolSha256",
    "poseActionProtocolSha256",
    "exposureTimestampProofSha256",
    "participantProtocolSha256",
    "dataHandlingProtocolSha256",
  ];
  if (gate.status === "blocked") {
    assert.equal(
      plan.qualification,
      "blocked-plan-only-no-collection-or-policy-authority",
    );
    for (const key of [
      "targetId",
      "cameraId",
      "exposureTimestampAuthority",
      ...digestKeys,
    ]) assert.equal(gate[key], null, `blocked plan ${key} must be null`);
    assert.deepEqual(gate.blockerCodes, blockerCodes);
    assert.ok(
      plan.claimBoundary.includes("authorizes no camera"),
      "blocked plan must deny camera authority",
    );
    return;
  }
  assert.equal(plan.qualification, "collection-authorized-plan");
  assert.match(gate.targetId, ID_PATTERN, "plan target ID is invalid");
  assert.match(gate.cameraId, ID_PATTERN, "plan camera ID is invalid");
  for (const key of digestKeys) {
    assertDigest(gate[key], `plan.collectionGate.${key}`);
  }
  assert.ok(
    exposureAuthorities.has(gate.exposureTimestampAuthority),
    "plan exposure timestamp authority is unsupported",
  );
  assert.deepEqual(gate.blockerCodes, []);
}

function validateControls(controls, blocked, path) {
  exactKeys(controls, controlKeys, path);
  if (blocked) {
    for (const key of controlKeys) {
      assert.equal(controls[key], null, `${path}.${key} must be null`);
    }
    return;
  }
  assert.match(controls.pixelFormat, ID_PATTERN, `${path}.pixelFormat is invalid`);
  assert.ok(
    controls.exposureMode === "auto" || controls.exposureMode === "manual",
    `${path}.exposureMode is invalid`,
  );
  if (controls.exposureMode === "manual") {
    assertSafeInteger(controls.exposureTimeUs, 1, 16_666, `${path}.exposureTimeUs`);
  } else {
    assert.equal(controls.exposureTimeUs, null);
  }
  assert.ok(
    controls.gainMode === "auto" || controls.gainMode === "manual",
    `${path}.gainMode is invalid`,
  );
  if (controls.gainMode === "manual") {
    assertSafeInteger(controls.gainMilliDb, 0, 100_000, `${path}.gainMilliDb`);
  } else {
    assert.equal(controls.gainMilliDb, null);
  }
  assert.ok(
    controls.whiteBalanceMode === "auto"
      || controls.whiteBalanceMode === "manual",
    `${path}.whiteBalanceMode is invalid`,
  );
  if (controls.whiteBalanceMode === "manual") {
    assertSafeInteger(
      controls.whiteBalanceKelvin,
      2_000,
      10_000,
      `${path}.whiteBalanceKelvin`,
    );
  } else {
    assert.equal(controls.whiteBalanceKelvin, null);
  }
  assert.ok(
    controls.focusMode === "auto"
      || controls.focusMode === "manual"
      || controls.focusMode === "fixed",
    `${path}.focusMode is invalid`,
  );
  if (controls.focusMode === "manual") {
    assertSafeInteger(controls.focusValue, 0, 100_000, `${path}.focusValue`);
  } else {
    assert.equal(controls.focusValue, null);
  }
  assert.ok(
    controls.powerLineFrequencyHz === 50
      || controls.powerLineFrequencyHz === 60,
    `${path}.powerLineFrequencyHz is invalid`,
  );
  assertSafeInteger(controls.bufferCount, 1, 8, `${path}.bufferCount`);
}

function validateMatrix(plan) {
  const matrix = plan.matrix;
  exactKeys(
    matrix,
    [
      "captureMode",
      "presets",
      "blockingPersonaClasses",
      "lightingConditions",
      "motionConditionIds",
      "scheduledTrialsPerCell",
      "observationDurationMsPerCell",
      "scheduledCellCount",
      "scheduledTrialCount",
      "scheduledBlockingCellCount",
      "scheduledBlockingTrialCount",
    ],
    "plan.matrix",
  );
  exactKeys(
    matrix.captureMode,
    [
      "width",
      "height",
      "framesPerSecondNumerator",
      "framesPerSecondDenominator",
      "capabilityRequirement",
    ],
    "plan.matrix.captureMode",
  );
  assert.deepEqual(matrix.captureMode, {
    width: 1920,
    height: 1080,
    framesPerSecondNumerator: 60,
    framesPerSecondDenominator: 1,
    capabilityRequirement: "sustained-genuine-mode",
  });
  assert.ok(Array.isArray(matrix.presets));
  assert.deepEqual(
    matrix.presets.map(({ id, purpose }) => ({ id, purpose })),
    [...CAPTURE_PRESETS],
  );
  const blocked = plan.collectionGate.status === "blocked";
  const controlSignatures = new Set();
  for (const [index, preset] of matrix.presets.entries()) {
    exactKeys(preset, ["id", "purpose", "controls"], `plan.matrix.presets[${index}]`);
    validateControls(preset.controls, blocked, `plan.matrix.presets[${index}].controls`);
    if (!blocked) {
      const signature = JSON.stringify(preset.controls);
      assert.ok(
        !controlSignatures.has(signature),
        "ready plan capture presets must have distinct controls",
      );
      controlSignatures.add(signature);
    }
  }
  if (!blocked) {
    const [automatic, balanced, shortExposure] = matrix.presets;
    for (const key of ["exposureMode", "gainMode", "whiteBalanceMode"]) {
      assert.equal(
        automatic.controls[key],
        "auto",
        `automatic-baseline ${key} must be auto`,
      );
      assert.equal(
        balanced.controls[key],
        "manual",
        `balanced-manual ${key} must be manual`,
      );
      assert.equal(
        shortExposure.controls[key],
        "manual",
        `short-exposure-manual ${key} must be manual`,
      );
    }
    assert.ok(
      shortExposure.controls.exposureTimeUs < balanced.controls.exposureTimeUs,
      "short-exposure-manual must use a shorter exposure than balanced-manual",
    );
  }
  assert.deepEqual(matrix.blockingPersonaClasses, [...CAPTURE_PERSONAS]);
  assert.deepEqual(
    matrix.lightingConditions.map(({ id }) => id),
    [...CAPTURE_LIGHTING_CONDITIONS],
  );
  let blockingLightingCount = 0;
  for (const [index, condition] of matrix.lightingConditions.entries()) {
    const path = `plan.matrix.lightingConditions[${index}]`;
    exactKeys(
      condition,
      [
        "id",
        "blocking",
        "minimumIlluminanceMilliLux",
        "maximumIlluminanceMilliLux",
      ],
      path,
    );
    if (blocked) {
      assert.equal(condition.blocking, null);
      assert.equal(condition.minimumIlluminanceMilliLux, null);
      assert.equal(condition.maximumIlluminanceMilliLux, null);
      continue;
    }
    assert.equal(typeof condition.blocking, "boolean", `${path}.blocking is invalid`);
    assertSafeInteger(
      condition.minimumIlluminanceMilliLux,
      1,
      10_000_000,
      `${path}.minimumIlluminanceMilliLux`,
    );
    assertSafeInteger(
      condition.maximumIlluminanceMilliLux,
      condition.minimumIlluminanceMilliLux,
      10_000_000,
      `${path}.maximumIlluminanceMilliLux`,
    );
    if (condition.blocking) blockingLightingCount += 1;
  }
  if (!blocked) {
    assert.ok(blockingLightingCount > 0, "ready plan needs a blocking lighting condition");
  }
  assert.deepEqual(matrix.motionConditionIds, [...CAPTURE_MOTION_CONDITIONS]);
  assert.equal(matrix.scheduledTrialsPerCell, 20);
  assert.equal(matrix.observationDurationMsPerCell, 60_000);
  const cellCount =
    CAPTURE_PRESETS.length
    * CAPTURE_PERSONAS.length
    * CAPTURE_LIGHTING_CONDITIONS.length
    * CAPTURE_MOTION_CONDITIONS.length;
  assert.equal(matrix.scheduledCellCount, cellCount);
  assert.equal(matrix.scheduledTrialCount, cellCount * 20);
  if (blocked) {
    assert.equal(matrix.scheduledBlockingCellCount, null);
    assert.equal(matrix.scheduledBlockingTrialCount, null);
  } else {
    const blockingCells =
      CAPTURE_PRESETS.length
      * CAPTURE_PERSONAS.length
      * blockingLightingCount
      * CAPTURE_MOTION_CONDITIONS.length;
    assert.equal(matrix.scheduledBlockingCellCount, blockingCells);
    assert.equal(matrix.scheduledBlockingTrialCount, blockingCells * 20);
  }
}

function validateMeasurement(measurement) {
  exactKeys(
    measurement,
    [
      "frameRateMethod",
      "blurMetric",
      "colorMetric",
      "landmarkMetric",
      "actionMetric",
      "exposureMetric",
      "perCellPassRequired",
      "aggregateMayRescueFailedCell",
      "groundTruthIndependentOfCandidateOutput",
      "captureArrivalMaySubstituteForExposure",
      "selectionPolicy",
    ],
    "plan.measurement",
  );
  assert.deepEqual(measurement, {
    frameRateMethod: "exposure-ordered-captured-and-dropped-frame-accounting",
    blurMetric: "independent-moving-target-p95-edge-width-millipixels",
    colorMetric: "independent-neutral-reference-p95-ciede2000-millideltae",
    landmarkMetric: "independent-ground-truth-p95-torso-normalized-core17-error",
    actionMetric: "correct-outcome-recall-and-wrong-trigger-count",
    exposureMetric: "exposure-authoritative-p95-microseconds",
    perCellPassRequired: true,
    aggregateMayRescueFailedCell: false,
    groundTruthIndependentOfCandidateOutput: true,
    captureArrivalMaySubstituteForExposure: false,
    selectionPolicy: "first-qualified-preset-in-plan-order",
  });
}

function validateAcceptance(plan) {
  const acceptance = plan.acceptance;
  exactKeys(acceptance, acceptanceKeys, "plan.acceptance");
  if (plan.collectionGate.status === "blocked") {
    for (const key of acceptanceKeys) assert.equal(acceptance[key], null);
    return;
  }
  assertSafeInteger(
    acceptance.minimumBlockingIlluminanceMilliLux,
    1,
    10_000_000,
    "plan.acceptance.minimumBlockingIlluminanceMilliLux",
  );
  assertSafeInteger(
    acceptance.minimumCapturedFramesPerSecondMilliHz,
    59_000,
    60_000,
    "plan.acceptance.minimumCapturedFramesPerSecondMilliHz",
  );
  assertFiniteNumber(
    acceptance.maximumDroppedFrameRate,
    0,
    0.1,
    "plan.acceptance.maximumDroppedFrameRate",
  );
  assertSafeInteger(
    acceptance.maximumP95ExposureTimeUs,
    1,
    16_666,
    "plan.acceptance.maximumP95ExposureTimeUs",
  );
  assertSafeInteger(
    acceptance.maximumP95BlurWidthMilliPixels,
    0,
    100_000,
    "plan.acceptance.maximumP95BlurWidthMilliPixels",
  );
  assertSafeInteger(
    acceptance.maximumP95ColorErrorMilliDeltaE,
    0,
    100_000,
    "plan.acceptance.maximumP95ColorErrorMilliDeltaE",
  );
  assertFiniteNumber(
    acceptance.maximumP95NormalizedLandmarkError,
    0,
    1,
    "plan.acceptance.maximumP95NormalizedLandmarkError",
  );
  assertFiniteNumber(
    acceptance.minimumCorrectOutcomeRecall,
    0.9,
    1,
    "plan.acceptance.minimumCorrectOutcomeRecall",
  );
  assertSafeInteger(
    acceptance.maximumWrongActionCountPerCell,
    0,
    plan.matrix.scheduledTrialsPerCell,
    "plan.acceptance.maximumWrongActionCountPerCell",
  );
  const blockingMinimums = plan.matrix.lightingConditions
    .filter(({ blocking }) => blocking)
    .map(({ minimumIlluminanceMilliLux }) => minimumIlluminanceMilliLux);
  assert.equal(
    Math.min(...blockingMinimums),
    acceptance.minimumBlockingIlluminanceMilliLux,
    "blocking lighting matrix must exercise the selected illumination floor",
  );
}

function validateDataPolicy(plan) {
  const policy = plan.dataPolicy;
  exactKeys(
    policy,
    [
      "temporaryFrameAnalysisAuthorized",
      "rawRoomVideoDefault",
      "retainedRawFrameCountLimit",
      "skeletonAndNumericReleaseOnly",
      "participantIdentifiersAllowed",
      "freeTextAllowed",
    ],
    "plan.dataPolicy",
  );
  assert.equal(typeof policy.temporaryFrameAnalysisAuthorized, "boolean");
  assert.equal(policy.rawRoomVideoDefault, false);
  assert.equal(policy.retainedRawFrameCountLimit, 0);
  assert.equal(policy.skeletonAndNumericReleaseOnly, true);
  assert.equal(policy.participantIdentifiersAllowed, false);
  assert.equal(policy.freeTextAllowed, false);
  if (plan.collectionGate.status === "ready") {
    assert.equal(
      policy.temporaryFrameAnalysisAuthorized,
      true,
      "ready plan must explicitly authorize volatile frame analysis",
    );
  }
}

export function validateCameraCapturePolicyPlan(plan) {
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
  assert.equal(plan.format, CAMERA_CAPTURE_POLICY_PLAN_FORMAT);
  assert.match(plan.campaignId, ID_PATTERN, "plan campaign ID is invalid");
  assertIsoTimestamp(plan.createdAt, "plan.createdAt");
  assert.equal(plan.motionApiVersion, "0.4.0");
  validateCollectionGate(plan);
  validateMatrix(plan);
  validateMeasurement(plan.measurement);
  validateAcceptance(plan);
  validateDataPolicy(plan);
  assert.ok(
    typeof plan.claimBoundary === "string"
      && plan.claimBoundary.length >= 160
      && plan.claimBoundary.length <= 1_024,
    "plan claim boundary is invalid",
  );
  assert.ok(Array.isArray(plan.limitations) && plan.limitations.length === 5);
  for (const limitation of plan.limitations) {
    assert.ok(
      typeof limitation === "string"
        && limitation.length >= 40
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

export function parseCameraCapturePolicyPlanBytes(bytes) {
  const envelope = parseCanonicalJsonBytes(bytes, MAX_PLAN_BYTES, "plan");
  validateCameraCapturePolicyPlan(envelope.value);
  return envelope;
}

function validatePlanEnvelope(planEnvelope) {
  exactKeys(planEnvelope, ["value", "sha256"], "plan envelope");
  const plan = validateCameraCapturePolicyPlan(planEnvelope.value);
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
  for (const preset of plan.matrix.presets) {
    for (const personaClass of plan.matrix.blockingPersonaClasses) {
      for (const lighting of plan.matrix.lightingConditions) {
        for (const motionConditionId of plan.matrix.motionConditionIds) {
          cells.push({
            presetId: preset.id,
            personaClass,
            lightingConditionId: lighting.id,
            motionConditionId,
            blocking: lighting.blocking,
            minimumIlluminanceMilliLux: lighting.minimumIlluminanceMilliLux,
            maximumIlluminanceMilliLux: lighting.maximumIlluminanceMilliLux,
          });
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
      "presetId",
      "personaClass",
      "lightingConditionId",
      "motionConditionId",
      "trials",
      "validTrialCount",
      "invalidTrialCount",
      "medianIlluminanceMilliLux",
      "observationDurationMs",
      "capturedFrameCount",
      "droppedFrameCount",
      "p95ExposureTimeUs",
      "p95BlurWidthMilliPixels",
      "p95ColorErrorMilliDeltaE",
      "p95NormalizedLandmarkError",
      "correctOutcomeCount",
      "wrongActionCount",
      "captureTraceSha256",
      "opticalTraceSha256",
      "groundTruthTraceSha256",
    ],
    path,
  );
  assert.deepEqual(
    {
      presetId: cell.presetId,
      personaClass: cell.personaClass,
      lightingConditionId: cell.lightingConditionId,
      motionConditionId: cell.motionConditionId,
    },
    {
      presetId: expected.presetId,
      personaClass: expected.personaClass,
      lightingConditionId: expected.lightingConditionId,
      motionConditionId: expected.motionConditionId,
    },
    `${path} identity or order changed`,
  );
  assert.ok(
    Array.isArray(cell.trials)
      && cell.trials.length === plan.matrix.scheduledTrialsPerCell,
    `${path}.trials must contain every scheduled repetition`,
  );
  let validTrialCount = 0;
  let invalidTrialCount = 0;
  let correctOutcomeCount = 0;
  let wrongActionCount = 0;
  for (const [index, trial] of cell.trials.entries()) {
    const trialPath = `${path}.trials[${index}]`;
    exactKeys(
      trial,
      [
        "repetition",
        "status",
        "correctOutcome",
        "wrongActionCount",
        "invalidReasonCode",
      ],
      trialPath,
    );
    assert.equal(
      trial.repetition,
      index + 1,
      `${trialPath}.repetition is missing, duplicated, or reordered`,
    );
    assert.ok(
      trial.status === "valid" || trial.status === "invalid",
      `${trialPath}.status is invalid`,
    );
    if (trial.status === "valid") {
      validTrialCount += 1;
      assert.equal(typeof trial.correctOutcome, "boolean");
      assertSafeInteger(
        trial.wrongActionCount,
        0,
        1_000_000,
        `${trialPath}.wrongActionCount`,
      );
      assert.equal(trial.invalidReasonCode, null);
      if (trial.correctOutcome) correctOutcomeCount += 1;
      wrongActionCount += trial.wrongActionCount;
    } else {
      invalidTrialCount += 1;
      assert.equal(trial.correctOutcome, null);
      assert.equal(trial.wrongActionCount, null);
      assert.ok(
        invalidTrialReasonCodes.has(trial.invalidReasonCode),
        `${trialPath}.invalidReasonCode is invalid`,
      );
    }
  }
  assert.equal(cell.validTrialCount, validTrialCount);
  assert.equal(cell.invalidTrialCount, invalidTrialCount);
  assert.equal(cell.correctOutcomeCount, correctOutcomeCount);
  assert.equal(cell.wrongActionCount, wrongActionCount);
  if (cell.medianIlluminanceMilliLux !== null) {
    assertSafeInteger(
      cell.medianIlluminanceMilliLux,
      0,
      10_000_000,
      `${path}.medianIlluminanceMilliLux`,
    );
  }
  assertSafeInteger(
    cell.observationDurationMs,
    0,
    plan.matrix.observationDurationMsPerCell * 2,
    `${path}.observationDurationMs`,
  );
  assertSafeInteger(cell.capturedFrameCount, 0, 10_000_000, `${path}.capturedFrameCount`);
  assertSafeInteger(cell.droppedFrameCount, 0, 10_000_000, `${path}.droppedFrameCount`);
  if (cell.p95ExposureTimeUs !== null) {
    assertSafeInteger(cell.p95ExposureTimeUs, 1, 1_000_000, `${path}.p95ExposureTimeUs`);
  }
  if (cell.p95BlurWidthMilliPixels !== null) {
    assertSafeInteger(
      cell.p95BlurWidthMilliPixels,
      0,
      1_000_000,
      `${path}.p95BlurWidthMilliPixels`,
    );
  }
  if (cell.p95ColorErrorMilliDeltaE !== null) {
    assertSafeInteger(
      cell.p95ColorErrorMilliDeltaE,
      0,
      1_000_000,
      `${path}.p95ColorErrorMilliDeltaE`,
    );
  }
  if (cell.p95NormalizedLandmarkError !== null) {
    assertFiniteNumber(
      cell.p95NormalizedLandmarkError,
      0,
      10,
      `${path}.p95NormalizedLandmarkError`,
    );
  }
  for (const key of [
    "captureTraceSha256",
    "opticalTraceSha256",
    "groundTruthTraceSha256",
  ]) assertDigest(cell[key], `${path}.${key}`);

  const totalFrames = cell.capturedFrameCount + cell.droppedFrameCount;
  const measurementComplete =
    cell.medianIlluminanceMilliLux !== null
    && cell.medianIlluminanceMilliLux >= expected.minimumIlluminanceMilliLux
    && cell.medianIlluminanceMilliLux <= expected.maximumIlluminanceMilliLux
    && cell.observationDurationMs === plan.matrix.observationDurationMsPerCell
    && cell.p95ExposureTimeUs !== null
    && cell.p95BlurWidthMilliPixels !== null
    && cell.p95ColorErrorMilliDeltaE !== null
    && cell.p95NormalizedLandmarkError !== null;
  const meetsFrameRate =
    measurementComplete
    && cell.capturedFrameCount * 1_000_000
    >= plan.acceptance.minimumCapturedFramesPerSecondMilliHz
      * cell.observationDurationMs;
  const meetsDropRate =
    totalFrames > 0
    && cell.droppedFrameCount / totalFrames
    <= plan.acceptance.maximumDroppedFrameRate;
  const passes =
    invalidTrialCount === 0
    && validTrialCount === plan.matrix.scheduledTrialsPerCell
    && meetsFrameRate
    && meetsDropRate
    && cell.p95ExposureTimeUs <= plan.acceptance.maximumP95ExposureTimeUs
    && cell.p95BlurWidthMilliPixels
      <= plan.acceptance.maximumP95BlurWidthMilliPixels
    && cell.p95ColorErrorMilliDeltaE
      <= plan.acceptance.maximumP95ColorErrorMilliDeltaE
    && cell.p95NormalizedLandmarkError
      <= plan.acceptance.maximumP95NormalizedLandmarkError
    && cell.correctOutcomeCount / validTrialCount
      >= plan.acceptance.minimumCorrectOutcomeRecall
    && cell.wrongActionCount
      <= plan.acceptance.maximumWrongActionCountPerCell;
  return {
    passes,
    incomplete: invalidTrialCount > 0 || !measurementComplete,
    validTrialCount,
    invalidTrialCount,
  };
}

export function validateCameraCapturePolicyResult(planEnvelope, result) {
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
      "selectedPresetId",
      "cells",
      "summary",
      "dataDisposition",
      "claimBoundary",
      "limitations",
    ],
    "result",
  );
  assert.equal(result.format, CAMERA_CAPTURE_POLICY_RESULT_FORMAT);
  assert.equal(result.campaignId, plan.campaignId);
  assert.equal(result.planSha256, planEnvelope.sha256);
  assertIsoTimestamp(result.startedAt, "result.startedAt");
  assertIsoTimestamp(result.completedAt, "result.completedAt");
  assert.ok(
    Date.parse(result.completedAt) >= Date.parse(result.startedAt),
    "result completes before it starts",
  );
  const expected = expectedCells(plan);
  assert.ok(Array.isArray(result.cells) && result.cells.length === expected.length);
  const blockingPassByPreset = new Map(
    plan.matrix.presets.map(({ id }) => [id, true]),
  );
  let passingBlockingCellCount = 0;
  let blockingCellCount = 0;
  let validTrialCount = 0;
  let invalidTrialCount = 0;
  let hasIncompleteEvidence = false;
  for (const [index, cell] of result.cells.entries()) {
    const validated = validateResultCell(
      cell,
      expected[index],
      plan,
      `result.cells[${index}]`,
    );
    if (validated.incomplete) hasIncompleteEvidence = true;
    if (expected[index].blocking) {
      blockingCellCount += 1;
      if (validated.passes) passingBlockingCellCount += 1;
      else blockingPassByPreset.set(expected[index].presetId, false);
    }
    validTrialCount += validated.validTrialCount;
    invalidTrialCount += validated.invalidTrialCount;
  }
  const completeQualifiedPresetIds = plan.matrix.presets
    .map(({ id }) => id)
    .filter((id) => blockingPassByPreset.get(id));
  const qualifiedPresetIds = hasIncompleteEvidence
    ? []
    : completeQualifiedPresetIds;
  const selectedPresetId = qualifiedPresetIds[0] ?? null;
  const disposition = hasIncompleteEvidence
    ? "incomplete"
    : selectedPresetId === null
      ? "no-qualified-preset"
      : "policy-selected";
  assert.equal(result.selectedPresetId, selectedPresetId);
  assert.equal(
    result.disposition,
    disposition,
    "result disposition does not match derived preset qualification",
  );
  exactKeys(
    result.summary,
    [
      "cellCount",
      "blockingCellCount",
      "passingBlockingCellCount",
      "failingBlockingCellCount",
      "scheduledTrialCount",
      "validTrialCount",
      "invalidTrialCount",
      "candidatePresetCount",
      "qualifiedPresetIds",
      "participantCount",
    ],
    "result.summary",
  );
  assertSafeInteger(result.summary.participantCount, 2, 1_000, "result.summary.participantCount");
  assert.deepEqual(result.summary, {
    cellCount: expected.length,
    blockingCellCount,
    passingBlockingCellCount,
    failingBlockingCellCount: blockingCellCount - passingBlockingCellCount,
    scheduledTrialCount: plan.matrix.scheduledTrialCount,
    validTrialCount,
    invalidTrialCount,
    candidatePresetCount: plan.matrix.presets.length,
    qualifiedPresetIds,
    participantCount: result.summary.participantCount,
  });
  exactKeys(
    result.dataDisposition,
    [
      "rawFramesRetained",
      "rawRoomVideoRetained",
      "skeletonAndNumericReleaseOnly",
      "participantIdentifiersRetained",
      "opticalGroundTruthRetained",
    ],
    "result.dataDisposition",
  );
  assert.deepEqual(result.dataDisposition, {
    rawFramesRetained: false,
    rawRoomVideoRetained: false,
    skeletonAndNumericReleaseOnly: true,
    participantIdentifiersRetained: false,
    opticalGroundTruthRetained: true,
  });
  assert.ok(
    typeof result.claimBoundary === "string"
      && result.claimBoundary.length >= 140
      && result.claimBoundary.length <= 1_024,
    "result claim boundary is invalid",
  );
  assert.ok(Array.isArray(result.limitations) && result.limitations.length === 4);
  for (const limitation of result.limitations) {
    assert.ok(
      typeof limitation === "string"
        && limitation.length >= 30
        && limitation.length <= 512,
      "result limitation is invalid",
    );
  }
  return result;
}

export function parseCameraCapturePolicyResultBytes(planEnvelope, bytes) {
  const result = parseCanonicalJsonBytes(bytes, MAX_RESULT_BYTES, "result");
  validateCameraCapturePolicyResult(planEnvelope, result.value);
  return result;
}

export async function validateTrackedCameraCapturePolicyPlan() {
  return parseCameraCapturePolicyPlanBytes(await readFile(trackedPlanPath));
}

async function main() {
  const planPath = process.argv[2] ? resolve(process.argv[2]) : trackedPlanPath;
  const plan = parseCameraCapturePolicyPlanBytes(await readFile(planPath));
  if (process.argv[3]) {
    const result = parseCameraCapturePolicyResultBytes(
      plan,
      await readFile(resolve(process.argv[3])),
    );
    console.log(
      `validated ${result.value.summary.cellCount} capture-policy cells: ${result.value.disposition}`,
    );
    return;
  }
  console.log(
    `validated blocked camera capture-policy plan: ${plan.value.matrix.scheduledCellCount} cells / ${plan.value.matrix.scheduledTrialCount} trials; ${plan.value.collectionGate.blockerCodes.length} blockers`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
