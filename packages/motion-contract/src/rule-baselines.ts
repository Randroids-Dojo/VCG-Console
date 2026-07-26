import {
  CORE_LANDMARK_NAMES,
  type CoreLandmarkName,
} from "./landmarks";

export const RULE_BASELINE_VERSION = "core17-rule-baselines/v1" as const;
export const RULE_BASELINE_CALIBRATION_SAMPLES = 24 as const;
export const RULE_MOVEMENT_NAMES = [
  "jump",
  "squat",
  "lean_left",
  "lean_right",
  "step_left",
  "step_right",
  "reach_left",
  "reach_right",
  "punch_left",
  "punch_right",
] as const;

export type RuleMovementName = (typeof RULE_MOVEMENT_NAMES)[number];

export interface RuleLandmark {
  name: CoreLandmarkName;
  x: number;
  y: number;
  confidence: number;
  observed: boolean;
}

export interface RulePoseSample {
  timestampMs: number;
  landmarks: RuleLandmark[];
}

export interface RuleMovementEvent {
  name: RuleMovementName;
  confidence: number;
  occurredAtMs: number;
}

export interface RuleBaselineThresholds {
  jumpEnterBodyHeights: number;
  jumpExitBodyHeights: number;
  squatEnterBodyHeights: number;
  squatExitBodyHeights: number;
  leanEnterShoulderWidths: number;
  leanExitShoulderWidths: number;
  stepEnterShoulderWidths: number;
  stepExitShoulderWidths: number;
  reachEnterTorsoLengths: number;
  reachExitTorsoLengths: number;
  punchMinimumExtensionGainTorsoLengths: number;
  punchMinimumExtensionRateTorsoLengthsPerSecond: number;
  minimumLandmarkConfidence: number;
  cooldownMs: number;
}

export const RULE_BASELINE_DEFAULT_THRESHOLDS: Readonly<RuleBaselineThresholds> =
  Object.freeze({
    jumpEnterBodyHeights: 0.08,
    jumpExitBodyHeights: 0.04,
    squatEnterBodyHeights: 0.1,
    squatExitBodyHeights: 0.06,
    leanEnterShoulderWidths: 0.3,
    leanExitShoulderWidths: 0.18,
    stepEnterShoulderWidths: 0.45,
    stepExitShoulderWidths: 0.25,
    reachEnterTorsoLengths: 0.55,
    reachExitTorsoLengths: 0.35,
    punchMinimumExtensionGainTorsoLengths: 0.12,
    punchMinimumExtensionRateTorsoLengthsPerSecond: 1.8,
    minimumLandmarkConfidence: 0.5,
    cooldownMs: 500,
  });

interface Point {
  x: number;
  y: number;
}

interface RuleCalibration {
  points: Readonly<Record<CoreLandmarkName, Point>>;
  hipCenter: Point;
  shoulderCenter: Point;
  ankleCenter: Point;
  horizontalUnit: Point;
  upwardUnit: Point;
  torsoLength: number;
  shoulderWidth: number;
  bodyHeight: number;
}

interface Measurements {
  hipCenter?: Point;
  shoulderCenter?: Point;
  ankleCenter?: Point;
  leftAnkle?: Point;
  rightAnkle?: Point;
  leftWrist?: Point;
  rightWrist?: Point;
  leftShoulder?: Point;
  rightShoulder?: Point;
}

const SAMPLE_KEYS = ["timestampMs", "landmarks"] as const;
const LANDMARK_KEYS = ["name", "x", "y", "confidence", "observed"] as const;
const THRESHOLD_KEYS = Object.keys(RULE_BASELINE_DEFAULT_THRESHOLDS);

function requireExactKeys(
  value: object,
  expectedKeys: readonly string[],
  name: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys must be exactly ${expected.join(", ")}`);
  }
}

function requireFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
  minimumInclusive = true,
): number {
  if (
    !Number.isFinite(value) ||
    (minimumInclusive ? value < minimum : value <= minimum) ||
    value > maximum
  ) {
    throw new Error(
      minimumInclusive
        ? `${name} must be a finite number between ${minimum} and ${maximum}`
        : `${name} must be a finite number greater than ${minimum} and at most ${maximum}`,
    );
  }
  return value;
}

function validateSample(
  sample: RulePoseSample,
  name: string,
  previousTimestampMs?: number,
): void {
  if (!sample || typeof sample !== "object") {
    throw new Error(`${name} must be an object`);
  }
  requireExactKeys(sample, SAMPLE_KEYS, name);
  requireFiniteRange(
    sample.timestampMs,
    0,
    Number.MAX_SAFE_INTEGER,
    `${name}.timestampMs`,
  );
  if (
    previousTimestampMs !== undefined &&
    sample.timestampMs <= previousTimestampMs
  ) {
    throw new Error(`${name}.timestampMs must be strictly increasing`);
  }
  if (
    !Array.isArray(sample.landmarks) ||
    sample.landmarks.length !== CORE_LANDMARK_NAMES.length
  ) {
    throw new Error(`${name}.landmarks must contain exactly 17 landmarks`);
  }
  const seen = new Set<CoreLandmarkName>();
  sample.landmarks.forEach((landmark, index) => {
    const landmarkName = `${name}.landmarks[${index}]`;
    if (!landmark || typeof landmark !== "object") {
      throw new Error(`${landmarkName} must be an object`);
    }
    requireExactKeys(landmark, LANDMARK_KEYS, landmarkName);
    if (!(CORE_LANDMARK_NAMES as readonly string[]).includes(landmark.name)) {
      throw new Error(`${landmarkName}.name must be a core17 landmark`);
    }
    if (seen.has(landmark.name)) {
      throw new Error(`${name}.landmarks contains duplicate ${landmark.name}`);
    }
    seen.add(landmark.name);
    requireFiniteRange(
      landmark.x,
      -10,
      10,
      `${landmarkName}.x`,
    );
    requireFiniteRange(
      landmark.y,
      -10,
      10,
      `${landmarkName}.y`,
    );
    requireFiniteRange(
      landmark.confidence,
      0,
      1,
      `${landmarkName}.confidence`,
    );
    if (typeof landmark.observed !== "boolean") {
      throw new Error(`${landmarkName}.observed must be boolean`);
    }
  });
}

function resolveThresholds(
  overrides: Partial<RuleBaselineThresholds>,
): Readonly<RuleBaselineThresholds> {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error("threshold overrides must be an object");
  }
  const unknownKeys = Object.keys(overrides).filter(
    (key) => !THRESHOLD_KEYS.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `threshold overrides contain unknown keys: ${unknownKeys.join(", ")}`,
    );
  }
  const resolved = {
    ...RULE_BASELINE_DEFAULT_THRESHOLDS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(resolved)) {
    requireFiniteRange(
      value,
      0,
      key === "cooldownMs" ? 10_000 : 100,
      key,
      key === "cooldownMs" || key === "minimumLandmarkConfidence",
    );
  }
  if (
    resolved.minimumLandmarkConfidence > 1 ||
    !Number.isSafeInteger(resolved.cooldownMs)
  ) {
    throw new Error(
      "minimumLandmarkConfidence must be at most 1 and cooldownMs must be a safe integer",
    );
  }
  for (const [entryKey, exitKey] of [
    ["jumpEnterBodyHeights", "jumpExitBodyHeights"],
    ["squatEnterBodyHeights", "squatExitBodyHeights"],
    ["leanEnterShoulderWidths", "leanExitShoulderWidths"],
    ["stepEnterShoulderWidths", "stepExitShoulderWidths"],
    ["reachEnterTorsoLengths", "reachExitTorsoLengths"],
  ] as const) {
    if (resolved[exitKey] >= resolved[entryKey]) {
      throw new Error(`${exitKey} must be less than ${entryKey}`);
    }
  }
  return Object.freeze(resolved);
}

function midpoint(left: Point, right: Point): Point {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function subtract(left: Point, right: Point): Point {
  return { x: left.x - right.x, y: left.y - right.y };
}

function dot(left: Point, right: Point): number {
  return left.x * right.x + left.y * right.y;
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalized(vector: Point, name: string): Point {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-6) {
    throw new Error(`${name} is degenerate`);
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function observedPoint(
  landmarks: ReadonlyMap<CoreLandmarkName, RuleLandmark>,
  name: CoreLandmarkName,
  minimumConfidence: number,
): Point | undefined {
  const landmark = landmarks.get(name);
  if (
    landmark === undefined ||
    !landmark.observed ||
    landmark.confidence < minimumConfidence
  ) {
    return undefined;
  }
  return { x: landmark.x, y: landmark.y };
}

function sampleMap(
  sample: RulePoseSample,
): ReadonlyMap<CoreLandmarkName, RuleLandmark> {
  return new Map(sample.landmarks.map((landmark) => [landmark.name, landmark]));
}

function measure(
  sample: RulePoseSample,
  minimumConfidence: number,
): Measurements {
  const landmarks = sampleMap(sample);
  const leftHip = observedPoint(landmarks, "left_hip", minimumConfidence);
  const rightHip = observedPoint(landmarks, "right_hip", minimumConfidence);
  const leftShoulder = observedPoint(
    landmarks,
    "left_shoulder",
    minimumConfidence,
  );
  const rightShoulder = observedPoint(
    landmarks,
    "right_shoulder",
    minimumConfidence,
  );
  const leftAnkle = observedPoint(
    landmarks,
    "left_ankle",
    minimumConfidence,
  );
  const rightAnkle = observedPoint(
    landmarks,
    "right_ankle",
    minimumConfidence,
  );
  const leftWrist = observedPoint(
    landmarks,
    "left_wrist",
    minimumConfidence,
  );
  const rightWrist = observedPoint(
    landmarks,
    "right_wrist",
    minimumConfidence,
  );
  return {
    ...(leftHip && rightHip ? { hipCenter: midpoint(leftHip, rightHip) } : {}),
    ...(leftShoulder && rightShoulder
      ? {
          shoulderCenter: midpoint(leftShoulder, rightShoulder),
          leftShoulder,
          rightShoulder,
        }
      : {}),
    ...(leftAnkle && rightAnkle
      ? { ankleCenter: midpoint(leftAnkle, rightAnkle) }
      : {}),
    ...(leftAnkle ? { leftAnkle } : {}),
    ...(rightAnkle ? { rightAnkle } : {}),
    ...(leftWrist ? { leftWrist } : {}),
    ...(rightWrist ? { rightWrist } : {}),
  };
}

export function createRuleCalibration(
  samples: readonly RulePoseSample[],
  thresholds: Partial<RuleBaselineThresholds> = {},
): RuleCalibration {
  const resolvedThresholds = resolveThresholds(thresholds);
  if (
    !Array.isArray(samples) ||
    samples.length !== RULE_BASELINE_CALIBRATION_SAMPLES
  ) {
    throw new Error(
      `calibration requires exactly ${RULE_BASELINE_CALIBRATION_SAMPLES} samples`,
    );
  }
  let previousTimestampMs: number | undefined;
  const totals = Object.fromEntries(
    CORE_LANDMARK_NAMES.map((name) => [name, { x: 0, y: 0 }]),
  ) as Record<CoreLandmarkName, Point>;
  samples.forEach((sample, sampleIndex) => {
    validateSample(sample, `samples[${sampleIndex}]`, previousTimestampMs);
    previousTimestampMs = sample.timestampMs;
    const landmarks = sampleMap(sample);
    for (const name of CORE_LANDMARK_NAMES) {
      const point = observedPoint(
        landmarks,
        name,
        resolvedThresholds.minimumLandmarkConfidence,
      );
      if (point === undefined) {
        throw new Error(
          `samples[${sampleIndex}] requires observed ${name} at calibration confidence`,
        );
      }
      totals[name].x += point.x;
      totals[name].y += point.y;
    }
  });
  const points = Object.fromEntries(
    CORE_LANDMARK_NAMES.map((name) => [
      name,
      {
        x: totals[name].x / samples.length,
        y: totals[name].y / samples.length,
      },
    ]),
  ) as Record<CoreLandmarkName, Point>;
  const hipCenter = midpoint(points.left_hip, points.right_hip);
  const shoulderCenter = midpoint(
    points.left_shoulder,
    points.right_shoulder,
  );
  const ankleCenter = midpoint(points.left_ankle, points.right_ankle);
  const torsoLength = distance(hipCenter, shoulderCenter);
  const shoulderWidth = distance(
    points.left_shoulder,
    points.right_shoulder,
  );
  const bodyHeight = distance(shoulderCenter, ankleCenter);
  if (
    torsoLength <= 0.02 ||
    shoulderWidth <= 0.02 ||
    bodyHeight <= 0.08
  ) {
    throw new Error("calibration body geometry is degenerate");
  }
  const calibration: RuleCalibration = {
    points: Object.freeze(points),
    hipCenter,
    shoulderCenter,
    ankleCenter,
    horizontalUnit: normalized(
      subtract(points.right_hip, points.left_hip),
      "left-to-right hip axis",
    ),
    upwardUnit: normalized(
      subtract(shoulderCenter, hipCenter),
      "hip-to-shoulder axis",
    ),
    torsoLength,
    shoulderWidth,
    bodyHeight,
  };
  return Object.freeze(calibration);
}

function scaledConfidence(signal: number, entryThreshold: number): number {
  return Math.round(
    Math.min(1, Math.max(0.5, signal / (entryThreshold * 2))) * 1_000_000,
  ) / 1_000_000;
}

/**
 * Camera-free heuristic research baseline.
 *
 * It emits exploratory movement labels, not MotionAction wire authority.
 * Missing required landmarks suppress and release only the affected rule.
 */
export class MotionRuleBaselineRecognizer {
  readonly thresholds: Readonly<RuleBaselineThresholds>;

  readonly #calibration: RuleCalibration;
  readonly #latched = new Set<RuleMovementName>();
  readonly #lastTriggeredAt = new Map<RuleMovementName, number>();
  readonly #punchSuppressedReach = new Set<"left" | "right">();
  #previousTimestampMs: number | undefined;
  #previousLeftExtension: number | undefined;
  #previousRightExtension: number | undefined;

  constructor(
    calibrationSamples: readonly RulePoseSample[],
    thresholdOverrides: Partial<RuleBaselineThresholds> = {},
  ) {
    this.thresholds = resolveThresholds(thresholdOverrides);
    this.#calibration = createRuleCalibration(
      calibrationSamples,
      this.thresholds,
    );
  }

  resetTemporalState(): void {
    this.#latched.clear();
    this.#lastTriggeredAt.clear();
    this.#punchSuppressedReach.clear();
    this.#previousTimestampMs = undefined;
    this.#previousLeftExtension = undefined;
    this.#previousRightExtension = undefined;
  }

  update(sample: RulePoseSample): RuleMovementEvent[] {
    validateSample(sample, "sample", this.#previousTimestampMs);
    const previousTimestampMs = this.#previousTimestampMs;
    this.#previousTimestampMs = sample.timestampMs;
    const measurements = measure(
      sample,
      this.thresholds.minimumLandmarkConfidence,
    );
    const events: RuleMovementEvent[] = [];
    const calibration = this.#calibration;

    const hipRise =
      measurements.hipCenter === undefined
        ? undefined
        : dot(
            subtract(measurements.hipCenter, calibration.hipCenter),
            calibration.upwardUnit,
          ) / calibration.bodyHeight;
    const ankleRise =
      measurements.ankleCenter === undefined
        ? undefined
        : dot(
            subtract(measurements.ankleCenter, calibration.ankleCenter),
            calibration.upwardUnit,
          ) / calibration.bodyHeight;
    const shoulderDrop =
      measurements.shoulderCenter === undefined
        ? undefined
        : -dot(
            subtract(
              measurements.shoulderCenter,
              calibration.shoulderCenter,
            ),
            calibration.upwardUnit,
          ) / calibration.bodyHeight;
    const ankleAnchorError =
      ankleRise === undefined ? undefined : Math.abs(ankleRise);
    const torsoLateral =
      measurements.shoulderCenter === undefined ||
      measurements.hipCenter === undefined
        ? undefined
        : dot(
            subtract(
              subtract(measurements.shoulderCenter, measurements.hipCenter),
              subtract(calibration.shoulderCenter, calibration.hipCenter),
            ),
            calibration.horizontalUnit,
          ) / calibration.shoulderWidth;
    const leftStep =
      measurements.leftAnkle === undefined ||
      measurements.hipCenter === undefined
        ? undefined
        : -dot(
            subtract(
              subtract(measurements.leftAnkle, measurements.hipCenter),
              subtract(calibration.points.left_ankle, calibration.hipCenter),
            ),
            calibration.horizontalUnit,
          ) / calibration.shoulderWidth;
    const rightStep =
      measurements.rightAnkle === undefined ||
      measurements.hipCenter === undefined
        ? undefined
        : dot(
            subtract(
              subtract(measurements.rightAnkle, measurements.hipCenter),
              subtract(calibration.points.right_ankle, calibration.hipCenter),
            ),
            calibration.horizontalUnit,
          ) / calibration.shoulderWidth;
    const leftExtension =
      measurements.leftWrist === undefined ||
      measurements.leftShoulder === undefined
        ? undefined
        : distance(measurements.leftWrist, measurements.leftShoulder) /
          calibration.torsoLength;
    const rightExtension =
      measurements.rightWrist === undefined ||
      measurements.rightShoulder === undefined
        ? undefined
        : distance(measurements.rightWrist, measurements.rightShoulder) /
          calibration.torsoLength;
    const baselineLeftExtension =
      distance(
        calibration.points.left_wrist,
        calibration.points.left_shoulder,
      ) / calibration.torsoLength;
    const baselineRightExtension =
      distance(
        calibration.points.right_wrist,
        calibration.points.right_shoulder,
      ) / calibration.torsoLength;
    const leftExtensionGain =
      leftExtension === undefined
        ? undefined
        : leftExtension - baselineLeftExtension;
    const rightExtensionGain =
      rightExtension === undefined
        ? undefined
        : rightExtension - baselineRightExtension;
    const elapsedSeconds =
      previousTimestampMs === undefined
        ? undefined
        : (sample.timestampMs - previousTimestampMs) / 1000;
    const leftExtensionRate =
      elapsedSeconds === undefined ||
      this.#previousLeftExtension === undefined ||
      leftExtension === undefined
        ? undefined
        : (leftExtension - this.#previousLeftExtension) / elapsedSeconds;
    const rightExtensionRate =
      elapsedSeconds === undefined ||
      this.#previousRightExtension === undefined ||
      rightExtension === undefined
        ? undefined
        : (rightExtension - this.#previousRightExtension) / elapsedSeconds;

    const leftPunch =
      leftExtensionGain !== undefined &&
      leftExtensionRate !== undefined &&
      leftExtensionGain >=
        this.thresholds.punchMinimumExtensionGainTorsoLengths &&
      leftExtensionRate >=
        this.thresholds.punchMinimumExtensionRateTorsoLengthsPerSecond;
    const rightPunch =
      rightExtensionGain !== undefined &&
      rightExtensionRate !== undefined &&
      rightExtensionGain >=
        this.thresholds.punchMinimumExtensionGainTorsoLengths &&
      rightExtensionRate >=
        this.thresholds.punchMinimumExtensionRateTorsoLengthsPerSecond;
    if (
      leftExtensionGain === undefined ||
      leftExtensionGain <= this.thresholds.reachExitTorsoLengths
    ) {
      this.#punchSuppressedReach.delete("left");
    }
    if (
      rightExtensionGain === undefined ||
      rightExtensionGain <= this.thresholds.reachExitTorsoLengths
    ) {
      this.#punchSuppressedReach.delete("right");
    }
    if (leftPunch) {
      this.#punchSuppressedReach.add("left");
      this.#emitImpulse(
        "punch_left",
        leftExtensionRate,
        this.thresholds.punchMinimumExtensionRateTorsoLengthsPerSecond,
        sample.timestampMs,
        events,
      );
    }
    if (rightPunch) {
      this.#punchSuppressedReach.add("right");
      this.#emitImpulse(
        "punch_right",
        rightExtensionRate,
        this.thresholds.punchMinimumExtensionRateTorsoLengthsPerSecond,
        sample.timestampMs,
        events,
      );
    }

    this.#updatePositionRule(
      "jump",
      hipRise === undefined || ankleRise === undefined
        ? undefined
        : Math.min(hipRise, ankleRise),
      this.thresholds.jumpEnterBodyHeights,
      this.thresholds.jumpExitBodyHeights,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "squat",
      shoulderDrop === undefined ||
        ankleAnchorError === undefined ||
        ankleAnchorError > this.thresholds.squatExitBodyHeights
        ? undefined
        : shoulderDrop,
      this.thresholds.squatEnterBodyHeights,
      this.thresholds.squatExitBodyHeights,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "lean_left",
      torsoLateral === undefined ? undefined : -torsoLateral,
      this.thresholds.leanEnterShoulderWidths,
      this.thresholds.leanExitShoulderWidths,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "lean_right",
      torsoLateral,
      this.thresholds.leanEnterShoulderWidths,
      this.thresholds.leanExitShoulderWidths,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "step_left",
      leftStep,
      this.thresholds.stepEnterShoulderWidths,
      this.thresholds.stepExitShoulderWidths,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "step_right",
      rightStep,
      this.thresholds.stepEnterShoulderWidths,
      this.thresholds.stepExitShoulderWidths,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "reach_left",
      this.#punchSuppressedReach.has("left")
        ? undefined
        : leftExtensionGain,
      this.thresholds.reachEnterTorsoLengths,
      this.thresholds.reachExitTorsoLengths,
      sample.timestampMs,
      events,
    );
    this.#updatePositionRule(
      "reach_right",
      this.#punchSuppressedReach.has("right")
        ? undefined
        : rightExtensionGain,
      this.thresholds.reachEnterTorsoLengths,
      this.thresholds.reachExitTorsoLengths,
      sample.timestampMs,
      events,
    );

    this.#previousLeftExtension = leftExtension;
    this.#previousRightExtension = rightExtension;
    return events.sort(
      (left, right) =>
        RULE_MOVEMENT_NAMES.indexOf(left.name) -
        RULE_MOVEMENT_NAMES.indexOf(right.name),
    );
  }

  #canTrigger(name: RuleMovementName, nowMs: number): boolean {
    const previous = this.#lastTriggeredAt.get(name);
    return (
      previous === undefined || nowMs - previous >= this.thresholds.cooldownMs
    );
  }

  #emit(
    name: RuleMovementName,
    signal: number,
    entryThreshold: number,
    nowMs: number,
    events: RuleMovementEvent[],
  ): void {
    if (!this.#canTrigger(name, nowMs)) return;
    this.#lastTriggeredAt.set(name, nowMs);
    events.push({
      name,
      confidence: scaledConfidence(signal, entryThreshold),
      occurredAtMs: nowMs,
    });
  }

  #emitImpulse(
    name: RuleMovementName,
    signal: number,
    entryThreshold: number,
    nowMs: number,
    events: RuleMovementEvent[],
  ): void {
    this.#emit(name, signal, entryThreshold, nowMs, events);
  }

  #updatePositionRule(
    name: RuleMovementName,
    signal: number | undefined,
    enterThreshold: number,
    exitThreshold: number,
    nowMs: number,
    events: RuleMovementEvent[],
  ): void {
    if (signal === undefined || signal <= exitThreshold) {
      this.#latched.delete(name);
      return;
    }
    if (this.#latched.has(name)) return;
    if (signal < enterThreshold) return;
    this.#latched.add(name);
    this.#emit(name, signal, enterThreshold, nowMs, events);
  }
}
