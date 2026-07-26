import {
  MotionRuleBaselineRecognizer,
  RULE_BASELINE_CALIBRATION_SAMPLES,
  RULE_MOVEMENT_NAMES,
  type RuleMovementEvent,
  type RuleMovementName,
  type RulePoseSample,
} from "./rule-baselines";
import {
  CORE_LANDMARK_NAMES,
  type CoreLandmarkName,
} from "./landmarks";

export const RULE_BASELINE_BENCHMARK_VERSION =
  "core17-rule-baseline-synthetic/v1" as const;
export const RULE_FIXTURE_IDS = [
  "adult-standing",
  "child-standing",
  "tall-standing",
  "seated-exploratory",
  "limited-range-exploratory",
] as const;

export type RuleFixtureId = (typeof RULE_FIXTURE_IDS)[number];
export type RuleTrialExpectation = "event" | "no-event" | "unavailable";

export interface RuleBenchmarkTrial {
  id: string;
  description: string;
  expectation: RuleTrialExpectation;
  expectedMovement: RuleMovementName | null;
  frames: RulePoseSample[];
}

export interface RuleBenchmarkFixture {
  id: RuleFixtureId;
  description: string;
  evidenceClass: "blocking-shape-fixture" | "exploratory-shape-fixture";
  calibration: RulePoseSample[];
  trials: RuleBenchmarkTrial[];
}

export interface RuleTrialResult {
  id: string;
  expectation: RuleTrialExpectation;
  expectedMovement: RuleMovementName | null;
  emittedMovements: RuleMovementName[];
  matched: boolean | null;
}

export interface RuleScoreTotals {
  expectedTrials: number;
  matchedTrials: number;
  falseNegativeTrials: number;
  emittedEvents: number;
  truePositiveEvents: number;
  falsePositiveEvents: number;
  precision: number | null;
  recall: number | null;
}

export interface RuleFixtureScore extends RuleScoreTotals {
  fixtureId: RuleFixtureId;
  trials: RuleTrialResult[];
}

export interface RuleBaselineEvaluation {
  fixtures: RuleFixtureScore[];
  totals: RuleScoreTotals;
}

type MutablePoint = [x: number, y: number];
type Pose = Record<CoreLandmarkName, MutablePoint>;

interface FixtureDefinition {
  id: RuleFixtureId;
  description: string;
  evidenceClass: RuleBenchmarkFixture["evidenceClass"];
  scale: number;
  movementScale: number;
  seated: boolean;
}

const FRAME_INTERVAL_MS = 1000 / 30;
const NEUTRAL: Readonly<Record<CoreLandmarkName, readonly [number, number]>> = {
  nose: [0.5, 0.18],
  left_eye: [0.485, 0.17],
  right_eye: [0.515, 0.17],
  left_ear: [0.46, 0.18],
  right_ear: [0.54, 0.18],
  left_shoulder: [0.42, 0.3],
  right_shoulder: [0.58, 0.3],
  left_elbow: [0.38, 0.45],
  right_elbow: [0.62, 0.45],
  left_wrist: [0.35, 0.6],
  right_wrist: [0.65, 0.6],
  left_hip: [0.45, 0.55],
  right_hip: [0.55, 0.55],
  left_knee: [0.44, 0.73],
  right_knee: [0.56, 0.73],
  left_ankle: [0.43, 0.92],
  right_ankle: [0.57, 0.92],
};
const HEAD_AND_ARMS = [
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
] as const satisfies readonly CoreLandmarkName[];
const UPPER_WITH_HIPS = [
  ...HEAD_AND_ARMS,
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
] as const satisfies readonly CoreLandmarkName[];
const DEFINITIONS: readonly FixtureDefinition[] = [
  {
    id: "adult-standing",
    description: "Nominal standing adult-shaped normalized skeleton fixture.",
    evidenceClass: "blocking-shape-fixture",
    scale: 1,
    movementScale: 1,
    seated: false,
  },
  {
    id: "child-standing",
    description:
      "Shorter standing child-shaped normalized skeleton fixture; not a child participant.",
    evidenceClass: "blocking-shape-fixture",
    scale: 0.72,
    movementScale: 1,
    seated: false,
  },
  {
    id: "tall-standing",
    description: "Taller standing boundary-shape normalized skeleton fixture.",
    evidenceClass: "blocking-shape-fixture",
    scale: 1.12,
    movementScale: 1,
    seated: false,
  },
  {
    id: "seated-exploratory",
    description:
      "Synthetic seated geometry with lower-body actions explicitly unavailable.",
    evidenceClass: "exploratory-shape-fixture",
    scale: 0.86,
    movementScale: 0.8,
    seated: true,
  },
  {
    id: "limited-range-exploratory",
    description:
      "Standing synthetic geometry with movement amplitude reduced to 45 percent.",
    evidenceClass: "exploratory-shape-fixture",
    scale: 0.9,
    movementScale: 0.45,
    seated: false,
  },
];

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clonePose(source: Readonly<Record<CoreLandmarkName, readonly [number, number]>>): Pose {
  return Object.fromEntries(
    CORE_LANDMARK_NAMES.map((name) => [name, [...source[name]]]),
  ) as Pose;
}

function midpoint(left: MutablePoint, right: MutablePoint): MutablePoint {
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

function distance(left: MutablePoint, right: MutablePoint): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function normalized(
  vector: MutablePoint,
): MutablePoint {
  const magnitude = Math.hypot(vector[0], vector[1]);
  return [vector[0] / magnitude, vector[1] / magnitude];
}

function basePose(definition: FixtureDefinition): Pose {
  const pose = clonePose(NEUTRAL);
  const origin: MutablePoint = [0.5, 0.55];
  for (const name of CORE_LANDMARK_NAMES) {
    pose[name] = [
      origin[0] + (pose[name][0] - origin[0]) * definition.scale,
      origin[1] + (pose[name][1] - origin[1]) * definition.scale,
    ];
  }
  if (definition.seated) {
    const hipY = pose.left_hip[1];
    pose.left_knee = [pose.left_hip[0] - 0.09 * definition.scale, hipY + 0.1];
    pose.right_knee = [pose.right_hip[0] + 0.09 * definition.scale, hipY + 0.1];
    pose.left_ankle = [pose.left_knee[0] - 0.05, hipY + 0.19];
    pose.right_ankle = [pose.right_knee[0] + 0.05, hipY + 0.19];
  }
  return pose;
}

function geometry(pose: Pose): {
  hipCenter: MutablePoint;
  shoulderCenter: MutablePoint;
  ankleCenter: MutablePoint;
  horizontalUnit: MutablePoint;
  upwardUnit: MutablePoint;
  torsoLength: number;
  shoulderWidth: number;
  bodyHeight: number;
} {
  const hipCenter = midpoint(pose.left_hip, pose.right_hip);
  const shoulderCenter = midpoint(pose.left_shoulder, pose.right_shoulder);
  const ankleCenter = midpoint(pose.left_ankle, pose.right_ankle);
  return {
    hipCenter,
    shoulderCenter,
    ankleCenter,
    horizontalUnit: normalized([
      pose.right_hip[0] - pose.left_hip[0],
      pose.right_hip[1] - pose.left_hip[1],
    ]),
    upwardUnit: normalized([
      shoulderCenter[0] - hipCenter[0],
      shoulderCenter[1] - hipCenter[1],
    ]),
    torsoLength: distance(hipCenter, shoulderCenter),
    shoulderWidth: distance(pose.left_shoulder, pose.right_shoulder),
    bodyHeight: distance(shoulderCenter, ankleCenter),
  };
}

function addAlong(
  pose: Pose,
  names: Iterable<CoreLandmarkName>,
  axis: MutablePoint,
  distanceAlongAxis: number,
): void {
  for (const name of names) {
    pose[name][0] += axis[0] * distanceAlongAxis;
    pose[name][1] += axis[1] * distanceAlongAxis;
  }
}

function interpolatePose(from: Pose, to: Pose, progress: number): Pose {
  return Object.fromEntries(
    CORE_LANDMARK_NAMES.map((name) => [
      name,
      [
        from[name][0] + (to[name][0] - from[name][0]) * progress,
        from[name][1] + (to[name][1] - from[name][1]) * progress,
      ],
    ]),
  ) as Pose;
}

function movementPose(
  definition: FixtureDefinition,
  movement: RuleMovementName,
): Pose {
  const neutral = basePose(definition);
  const pose = clonePose(neutral);
  const body = geometry(neutral);
  const amplitude = definition.movementScale;
  const left = -1;
  const right = 1;
  switch (movement) {
    case "jump":
      addAlong(
        pose,
        CORE_LANDMARK_NAMES,
        body.upwardUnit,
        body.bodyHeight * 0.13 * amplitude,
      );
      break;
    case "squat":
      addAlong(
        pose,
        UPPER_WITH_HIPS,
        body.upwardUnit,
        -body.bodyHeight * 0.15 * amplitude,
      );
      break;
    case "lean_left":
    case "lean_right": {
      const direction = movement === "lean_left" ? left : right;
      addAlong(
        pose,
        HEAD_AND_ARMS,
        body.horizontalUnit,
        direction * body.shoulderWidth * 0.45 * amplitude,
      );
      break;
    }
    case "step_left":
      addAlong(
        pose,
        ["left_knee", "left_ankle"],
        body.horizontalUnit,
        left * body.shoulderWidth * 0.66 * amplitude,
      );
      break;
    case "step_right":
      addAlong(
        pose,
        ["right_knee", "right_ankle"],
        body.horizontalUnit,
        right * body.shoulderWidth * 0.66 * amplitude,
      );
      break;
    case "reach_left":
    case "punch_left": {
      const extensionAxis = normalized([
        neutral.left_wrist[0] - neutral.left_shoulder[0],
        neutral.left_wrist[1] - neutral.left_shoulder[1],
      ]);
      const extension =
        body.torsoLength *
        (movement === "punch_left" ? 1 : 0.7) *
        amplitude;
      addAlong(
        pose,
        ["left_wrist"],
        extensionAxis,
        extension,
      );
      addAlong(pose, ["left_elbow"], extensionAxis, extension * 0.5);
      break;
    }
    case "reach_right":
    case "punch_right": {
      const extensionAxis = normalized([
        neutral.right_wrist[0] - neutral.right_shoulder[0],
        neutral.right_wrist[1] - neutral.right_shoulder[1],
      ]);
      const extension =
        body.torsoLength *
        (movement === "punch_right" ? 1 : 0.7) *
        amplitude;
      addAlong(
        pose,
        ["right_wrist"],
        extensionAxis,
        extension,
      );
      addAlong(pose, ["right_elbow"], extensionAxis, extension * 0.5);
      break;
    }
  }
  return pose;
}

function deterministicJitter(
  frame: number,
  landmarkIndex: number,
  scale: number,
): MutablePoint {
  const amplitude = 0.00045 * scale;
  return [
    amplitude * Math.sin(frame * 1.7 + landmarkIndex * 0.31),
    amplitude * Math.cos(frame * 1.1 + landmarkIndex * 0.47),
  ];
}

function poseSample(
  pose: Pose,
  timestampMs: number,
  frame: number,
  scale: number,
  occluded: ReadonlySet<CoreLandmarkName> = new Set(),
): RulePoseSample {
  return {
    timestampMs: rounded(timestampMs),
    landmarks: CORE_LANDMARK_NAMES.map((name, index) => {
      const jitter = deterministicJitter(frame, index, scale);
      return {
        name,
        x: rounded(pose[name][0] + jitter[0]),
        y: rounded(pose[name][1] + jitter[1]),
        confidence: occluded.has(name) ? 0.2 : 0.96,
        observed: !occluded.has(name),
      };
    }),
  };
}

function calibrationSamples(definition: FixtureDefinition): RulePoseSample[] {
  const neutral = basePose(definition);
  return Array.from(
    { length: RULE_BASELINE_CALIBRATION_SAMPLES },
    (_, frame) =>
      poseSample(
        neutral,
        frame * FRAME_INTERVAL_MS,
        frame,
        definition.scale,
      ),
  );
}

function framesForTransition(
  definition: FixtureDefinition,
  target: Pose,
  transitionFrames: number,
  occluded: ReadonlySet<CoreLandmarkName> = new Set(),
): RulePoseSample[] {
  const neutral = basePose(definition);
  const poses: Pose[] = [
    ...Array.from({ length: 8 }, () => neutral),
    ...Array.from({ length: transitionFrames }, (_, index) =>
      interpolatePose(neutral, target, (index + 1) / transitionFrames),
    ),
    ...Array.from({ length: 8 }, () => target),
    ...Array.from({ length: 8 }, (_, index) =>
      interpolatePose(target, neutral, (index + 1) / 8),
    ),
    ...Array.from({ length: 4 }, () => neutral),
  ];
  return poses.map((pose, frame) =>
    poseSample(
      pose,
      1_000 + frame * FRAME_INTERVAL_MS,
      frame + 100,
      definition.scale,
      occluded,
    ),
  );
}

function movementTrial(
  definition: FixtureDefinition,
  movement: RuleMovementName,
): RuleBenchmarkTrial {
  const lowerBodyMovement = [
    "jump",
    "squat",
    "step_left",
    "step_right",
  ].includes(movement);
  const unavailable = definition.seated && lowerBodyMovement;
  const transitionFrames = movement.startsWith("punch")
    ? 2
    : movement.startsWith("reach")
      ? 20
      : 6;
  const target = unavailable
    ? movementPose({ ...definition, movementScale: 0.2 }, movement)
    : movementPose(definition, movement);
  return {
    id: movement,
    description: unavailable
      ? `${movement} is unavailable in the seated exploratory fixture.`
      : `Synthetic ${movement} movement.`,
    expectation: unavailable ? "unavailable" : "event",
    expectedMovement: unavailable ? null : movement,
    frames: framesForTransition(definition, target, transitionFrames),
  };
}

function negativeTrials(
  definition: FixtureDefinition,
): RuleBenchmarkTrial[] {
  const neutral = basePose(definition);
  const body = geometry(neutral);
  const globalUp = clonePose(neutral);
  addAlong(
    globalUp,
    CORE_LANDMARK_NAMES,
    body.upwardUnit,
    body.bodyHeight * 0.13,
  );
  const translateLeft = clonePose(neutral);
  addAlong(
    translateLeft,
    CORE_LANDMARK_NAMES,
    body.horizontalUnit,
    -body.shoulderWidth * 0.8,
  );
  const translateRight = clonePose(neutral);
  addAlong(
    translateRight,
    CORE_LANDMARK_NAMES,
    body.horizontalUnit,
    body.shoulderWidth * 0.8,
  );
  const crossedArms = clonePose(neutral);
  crossedArms.left_wrist = [
    neutral.right_elbow[0] + 0.03,
    neutral.right_elbow[1],
  ];
  crossedArms.right_wrist = [
    neutral.left_elbow[0] - 0.03,
    neutral.left_elbow[1],
  ];
  return [
    {
      id: "neutral",
      description: "Neutral jitter must emit no movement.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(definition, neutral, 6),
    },
    {
      id: "global-upward-shift",
      description:
        "A global image-space upward shift exposes jump's missing floor/camera reference.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(definition, globalUp, 2),
    },
    {
      id: "global-left-translation",
      description: "Whole-body lateral image translation is not a body-relative movement.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(definition, translateLeft, 6),
    },
    {
      id: "global-right-translation",
      description: "Opposite whole-body image translation remains a negative.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(definition, translateRight, 6),
    },
    {
      id: "crossed-arms",
      description: "Crossed arms are a shell gesture, not a rule-baseline movement.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(definition, crossedArms, 8),
    },
    {
      id: "wrist-occlusion",
      description: "Missing wrists must suppress reach and punch labels.",
      expectation: "no-event",
      expectedMovement: null,
      frames: framesForTransition(
        definition,
        neutral,
        6,
        new Set(["left_wrist", "right_wrist"]),
      ),
    },
  ];
}

export function generateRuleBaselineBenchmarkSuite(): RuleBenchmarkFixture[] {
  return DEFINITIONS.map((definition) => ({
    id: definition.id,
    description: definition.description,
    evidenceClass: definition.evidenceClass,
    calibration: calibrationSamples(definition),
    trials: [
      ...RULE_MOVEMENT_NAMES.map((movement) =>
        movementTrial(definition, movement),
      ),
      ...negativeTrials(definition),
    ],
  }));
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return rounded(numerator / denominator);
}

function scoreFixture(fixture: RuleBenchmarkFixture): RuleFixtureScore {
  const trials: RuleTrialResult[] = [];
  let expectedTrials = 0;
  let matchedTrials = 0;
  let emittedEvents = 0;
  let truePositiveEvents = 0;
  let falsePositiveEvents = 0;
  for (const trial of fixture.trials) {
    const recognizer = new MotionRuleBaselineRecognizer(fixture.calibration);
    const events = trial.frames.flatMap((frame) =>
      recognizer.update({
        timestampMs: frame.timestampMs,
        landmarks: frame.landmarks.map((landmark) => ({ ...landmark })),
      }),
    );
    const expected = trial.expectedMovement;
    const firstExpectedIndex =
      expected === null
        ? -1
        : events.findIndex((event) => event.name === expected);
    const matched = expected === null ? null : firstExpectedIndex !== -1;
    if (expected !== null) {
      expectedTrials += 1;
      if (matched) matchedTrials += 1;
    }
    emittedEvents += events.length;
    events.forEach((event, eventIndex) => {
      if (event.name === expected && eventIndex === firstExpectedIndex) {
        truePositiveEvents += 1;
      } else {
        falsePositiveEvents += 1;
      }
    });
    trials.push({
      id: trial.id,
      expectation: trial.expectation,
      expectedMovement: expected,
      emittedMovements: events.map(({ name }) => name),
      matched,
    });
  }
  return {
    fixtureId: fixture.id,
    expectedTrials,
    matchedTrials,
    falseNegativeTrials: expectedTrials - matchedTrials,
    emittedEvents,
    truePositiveEvents,
    falsePositiveEvents,
    precision: rate(
      truePositiveEvents,
      truePositiveEvents + falsePositiveEvents,
    ),
    recall: rate(matchedTrials, expectedTrials),
    trials,
  };
}

export function evaluateRuleBaseline(
  suite = generateRuleBaselineBenchmarkSuite(),
): RuleBaselineEvaluation {
  const fixtures = suite.map(scoreFixture);
  const totals = fixtures.reduce<RuleScoreTotals>(
    (sum, fixture) => ({
      expectedTrials: sum.expectedTrials + fixture.expectedTrials,
      matchedTrials: sum.matchedTrials + fixture.matchedTrials,
      falseNegativeTrials:
        sum.falseNegativeTrials + fixture.falseNegativeTrials,
      emittedEvents: sum.emittedEvents + fixture.emittedEvents,
      truePositiveEvents:
        sum.truePositiveEvents + fixture.truePositiveEvents,
      falsePositiveEvents:
        sum.falsePositiveEvents + fixture.falsePositiveEvents,
      precision: null,
      recall: null,
    }),
    {
      expectedTrials: 0,
      matchedTrials: 0,
      falseNegativeTrials: 0,
      emittedEvents: 0,
      truePositiveEvents: 0,
      falsePositiveEvents: 0,
      precision: null,
      recall: null,
    },
  );
  totals.precision = rate(
    totals.truePositiveEvents,
    totals.truePositiveEvents + totals.falsePositiveEvents,
  );
  totals.recall = rate(totals.matchedTrials, totals.expectedTrials);
  return { fixtures, totals };
}

export function countRuleBenchmarkUpdates(
  suite: readonly RuleBenchmarkFixture[],
): number {
  return suite.reduce(
    (total, fixture) =>
      total +
      fixture.trials.reduce(
        (fixtureTotal, trial) => fixtureTotal + trial.frames.length,
        0,
      ),
    0,
  );
}

export function runRuleBenchmarkUpdates(
  suite: readonly RuleBenchmarkFixture[],
  observe?: (event: RuleMovementEvent) => void,
): void {
  for (const fixture of suite) {
    for (const trial of fixture.trials) {
      const recognizer = new MotionRuleBaselineRecognizer(fixture.calibration);
      for (const frame of trial.frames) {
        const events = recognizer.update({
          timestampMs: frame.timestampMs,
          landmarks: frame.landmarks.map((landmark) => ({ ...landmark })),
        });
        if (observe) events.forEach(observe);
      }
    }
  }
}
