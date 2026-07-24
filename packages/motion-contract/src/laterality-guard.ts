import {
  MotionRuleBaselineRecognizer,
  type RuleMovementEvent,
  type RuleMovementName,
  type RulePoseSample,
} from "./rule-baselines";
import type { CoreLandmarkName } from "./landmarks";

export const LATERALITY_GUARD_VERSION =
  "anatomical-axis-continuity/v1" as const;
export const LATERAL_RULE_MOVEMENTS = [
  "lean_left",
  "lean_right",
  "step_left",
  "step_right",
  "reach_left",
  "reach_right",
  "punch_left",
  "punch_right",
] as const satisfies readonly RuleMovementName[];
export const LATERALITY_GUARD_DEFAULTS = Object.freeze({
  minimumAxisAlignment: 0.5,
  minimumWidthRatio: 0.35,
});

export type LateralityStatus =
  | "trusted"
  | "blocked-missing-anchors"
  | "blocked-axis-reversal"
  | "blocked-foreshortened";

export interface LateralityGuardOptions {
  minimumAxisAlignment?: number;
  minimumWidthRatio?: number;
}

export interface LateralityGuardUpdate {
  status: LateralityStatus;
  minimumAxisAlignment: number | null;
  minimumWidthRatio: number | null;
  events: RuleMovementEvent[];
  suppressedMovements: RuleMovementName[];
}

interface Point {
  x: number;
  y: number;
}

interface AxisReference {
  unit: Point;
  width: number;
}

const LATERAL_MOVEMENT_SET = new Set<RuleMovementName>(
  LATERAL_RULE_MOVEMENTS,
);

function requireExactOptions(options: LateralityGuardOptions): void {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("laterality guard options must be an object");
  }
  const allowed = ["minimumAxisAlignment", "minimumWidthRatio"];
  const unknown = Object.keys(options).filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `laterality guard options contain unknown keys: ${unknown.join(", ")}`,
    );
  }
}

function boundedOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0 || resolved > 1) {
    throw new Error(`${name} must be a finite number greater than 0 and at most 1`);
  }
  return resolved;
}

function averagePoint(
  samples: readonly RulePoseSample[],
  name: CoreLandmarkName,
): Point {
  let x = 0;
  let y = 0;
  for (const sample of samples) {
    const landmark = sample.landmarks.find(
      (candidate) => candidate.name === name,
    );
    if (landmark === undefined) {
      throw new Error(`calibration is missing ${name}`);
    }
    x += landmark.x;
    y += landmark.y;
  }
  return { x: x / samples.length, y: y / samples.length };
}

function axis(left: Point, right: Point, name: string): AxisReference {
  const x = right.x - left.x;
  const y = right.y - left.y;
  const width = Math.hypot(x, y);
  if (!Number.isFinite(width) || width <= 1e-6) {
    throw new Error(`${name} axis is degenerate`);
  }
  return { unit: { x: x / width, y: y / width }, width };
}

function dot(left: Point, right: Point): number {
  return left.x * right.x + left.y * right.y;
}

function currentAxis(
  left: Point,
  right: Point,
  reference: AxisReference,
): { alignment: number; widthRatio: number } | undefined {
  const x = right.x - left.x;
  const y = right.y - left.y;
  const width = Math.hypot(x, y);
  if (!Number.isFinite(width) || width <= 1e-6) {
    return undefined;
  }
  return {
    alignment: dot({ x: x / width, y: y / width }, reference.unit),
    widthRatio: width / reference.width,
  };
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function observedPoint(
  sample: RulePoseSample,
  name: CoreLandmarkName,
  minimumConfidence: number,
): Point | undefined {
  const landmark = sample.landmarks.find(
    (candidate) => candidate.name === name,
  );
  if (
    landmark === undefined ||
    !landmark.observed ||
    landmark.confidence < minimumConfidence
  ) {
    return undefined;
  }
  return { x: landmark.x, y: landmark.y };
}

/**
 * Adds a fail-closed anatomical-axis continuity guard around research rules.
 *
 * The guard never relabels left as right. It suppresses directional labels
 * when named shoulder/hip axes reverse, collapse, or become unavailable,
 * while retaining independently recognized Jump/Squat research labels.
 */
export class LateralityGuardedRuleRecognizer {
  readonly minimumAxisAlignment: number;
  readonly minimumWidthRatio: number;

  readonly #recognizer: MotionRuleBaselineRecognizer;
  readonly #hipReference: AxisReference;
  readonly #shoulderReference: AxisReference;

  constructor(
    calibrationSamples: readonly RulePoseSample[],
    options: LateralityGuardOptions = {},
  ) {
    requireExactOptions(options);
    this.minimumAxisAlignment = boundedOption(
      options.minimumAxisAlignment,
      LATERALITY_GUARD_DEFAULTS.minimumAxisAlignment,
      "minimumAxisAlignment",
    );
    this.minimumWidthRatio = boundedOption(
      options.minimumWidthRatio,
      LATERALITY_GUARD_DEFAULTS.minimumWidthRatio,
      "minimumWidthRatio",
    );
    this.#recognizer = new MotionRuleBaselineRecognizer(calibrationSamples);
    this.#hipReference = axis(
      averagePoint(calibrationSamples, "left_hip"),
      averagePoint(calibrationSamples, "right_hip"),
      "calibration hip",
    );
    this.#shoulderReference = axis(
      averagePoint(calibrationSamples, "left_shoulder"),
      averagePoint(calibrationSamples, "right_shoulder"),
      "calibration shoulder",
    );
  }

  update(sample: RulePoseSample): LateralityGuardUpdate {
    const events = this.#recognizer.update(sample);
    const minimumConfidence =
      this.#recognizer.thresholds.minimumLandmarkConfidence;
    const leftHip = observedPoint(
      sample,
      "left_hip",
      minimumConfidence,
    );
    const rightHip = observedPoint(
      sample,
      "right_hip",
      minimumConfidence,
    );
    const leftShoulder = observedPoint(
      sample,
      "left_shoulder",
      minimumConfidence,
    );
    const rightShoulder = observedPoint(
      sample,
      "right_shoulder",
      minimumConfidence,
    );
    if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) {
      return this.#blocked(
        "blocked-missing-anchors",
        null,
        null,
        events,
      );
    }
    const hipAxis = currentAxis(
      leftHip,
      rightHip,
      this.#hipReference,
    );
    const shoulderAxis = currentAxis(
      leftShoulder,
      rightShoulder,
      this.#shoulderReference,
    );
    if (!hipAxis || !shoulderAxis) {
      return this.#blocked(
        "blocked-foreshortened",
        null,
        0,
        events,
      );
    }
    const minimumAxisAlignment = Math.min(
      hipAxis.alignment,
      shoulderAxis.alignment,
    );
    const minimumWidthRatio = Math.min(
      hipAxis.widthRatio,
      shoulderAxis.widthRatio,
    );
    if (minimumAxisAlignment < 0) {
      return this.#blocked(
        "blocked-axis-reversal",
        minimumAxisAlignment,
        minimumWidthRatio,
        events,
      );
    }
    if (
      minimumAxisAlignment < this.minimumAxisAlignment ||
      minimumWidthRatio < this.minimumWidthRatio
    ) {
      return this.#blocked(
        "blocked-foreshortened",
        minimumAxisAlignment,
        minimumWidthRatio,
        events,
      );
    }
    return {
      status: "trusted",
      minimumAxisAlignment: rounded(minimumAxisAlignment),
      minimumWidthRatio: rounded(minimumWidthRatio),
      events,
      suppressedMovements: [],
    };
  }

  #blocked(
    status: Exclude<LateralityStatus, "trusted">,
    minimumAxisAlignment: number | null,
    minimumWidthRatio: number | null,
    events: RuleMovementEvent[],
  ): LateralityGuardUpdate {
    const suppressed = events.filter(({ name }) =>
      LATERAL_MOVEMENT_SET.has(name),
    );
    const retained = events.filter(
      ({ name }) => !LATERAL_MOVEMENT_SET.has(name),
    );
    this.#recognizer.resetTemporalState();
    return {
      status,
      minimumAxisAlignment:
        minimumAxisAlignment === null ? null : rounded(minimumAxisAlignment),
      minimumWidthRatio:
        minimumWidthRatio === null ? null : rounded(minimumWidthRatio),
      events: retained,
      suppressedMovements: suppressed.map(({ name }) => name),
    };
  }
}
