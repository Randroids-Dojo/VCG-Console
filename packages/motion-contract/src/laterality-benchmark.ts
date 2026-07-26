import {
  LateralityGuardedRuleRecognizer,
  LATERAL_RULE_MOVEMENTS,
  type LateralityStatus,
} from "./laterality-guard";
import {
  MotionRuleBaselineRecognizer,
  type RuleMovementName,
  type RulePoseSample,
} from "./rule-baselines";
import {
  generateRuleBaselineBenchmarkSuite,
  type RuleBenchmarkTrial,
} from "./rule-baseline-benchmark";
import type { CoreLandmarkName } from "./landmarks";

export const LATERALITY_BENCHMARK_VERSION =
  "core17-laterality-adversarial/v1" as const;
export const LATERALITY_STRATEGIES = [
  "trust-provider-names",
  "anatomical-axis-continuity-guard",
] as const;
export const LATERALITY_CONFUSION_LABELS = [
  ...LATERAL_RULE_MOVEMENTS,
  "none",
  "blocked",
] as const;

export type LateralityStrategy = (typeof LATERALITY_STRATEGIES)[number];
export type LateralityMovement = (typeof LATERAL_RULE_MOVEMENTS)[number];
export type LateralityPrediction =
  (typeof LATERALITY_CONFUSION_LABELS)[number];

export interface LateralityScenario {
  id: string;
  category:
    | "clear-frontal"
    | "full-anatomical-swap"
    | "distal-only-swap"
    | "mild-turn"
    | "profile-ambiguity"
    | "crossed-arms"
    | "self-occlusion";
  description: string;
  expectedPrediction: LateralityPrediction;
  calibration: RulePoseSample[];
  frames: RulePoseSample[];
}

export interface LateralityScenarioResult {
  id: string;
  category: LateralityScenario["category"];
  expectedPrediction: LateralityPrediction;
  prediction: LateralityPrediction;
  emittedMovements: LateralityMovement[];
  blockedStatuses: LateralityStatus[];
  exact: boolean;
}

export interface LateralityStrategyEvaluation {
  strategy: LateralityStrategy;
  scenarios: LateralityScenarioResult[];
  confusionMatrix: Record<
    LateralityPrediction,
    Record<LateralityPrediction, number>
  >;
  totals: {
    scenarios: number;
    exact: number;
    wrongSide: number;
    unsafeDirectionalEvents: number;
    explicitAmbiguityBlocks: number;
    silentAmbiguitySuppressions: number;
    extraDirectionalEvents: number;
    accuracy: number;
  };
}

const FULL_LEFT_RIGHT_PAIRS = [
  ["left_eye", "right_eye"],
  ["left_ear", "right_ear"],
  ["left_shoulder", "right_shoulder"],
  ["left_elbow", "right_elbow"],
  ["left_wrist", "right_wrist"],
  ["left_hip", "right_hip"],
  ["left_knee", "right_knee"],
  ["left_ankle", "right_ankle"],
] as const satisfies readonly (readonly [CoreLandmarkName, CoreLandmarkName])[];
const DISTAL_PAIRS = [
  ["left_elbow", "right_elbow"],
  ["left_wrist", "right_wrist"],
  ["left_knee", "right_knee"],
  ["left_ankle", "right_ankle"],
] as const satisfies readonly (readonly [CoreLandmarkName, CoreLandmarkName])[];
const OPPOSITE: Readonly<Partial<Record<RuleMovementName, RuleMovementName>>> =
  Object.freeze({
    lean_left: "lean_right",
    lean_right: "lean_left",
    step_left: "step_right",
    step_right: "step_left",
    reach_left: "reach_right",
    reach_right: "reach_left",
    punch_left: "punch_right",
    punch_right: "punch_left",
  });

function isLateralMovement(
  name: RuleMovementName,
): name is LateralityMovement {
  return (LATERAL_RULE_MOVEMENTS as readonly RuleMovementName[]).includes(
    name,
  );
}

function cloneSample(sample: RulePoseSample): RulePoseSample {
  return {
    timestampMs: sample.timestampMs,
    landmarks: sample.landmarks.map((landmark) => ({ ...landmark })),
  };
}

function swapNames(
  sample: RulePoseSample,
  pairs: readonly (readonly [CoreLandmarkName, CoreLandmarkName])[],
): RulePoseSample {
  const names = new Map<CoreLandmarkName, CoreLandmarkName>();
  pairs.forEach(([left, right]) => {
    names.set(left, right);
    names.set(right, left);
  });
  return {
    timestampMs: sample.timestampMs,
    landmarks: sample.landmarks.map((landmark) => ({
      ...landmark,
      name: names.get(landmark.name) ?? landmark.name,
    })),
  };
}

function compressHorizontal(
  sample: RulePoseSample,
  factor: number,
): RulePoseSample {
  const leftHip = sample.landmarks.find(({ name }) => name === "left_hip")!;
  const rightHip = sample.landmarks.find(({ name }) => name === "right_hip")!;
  const centerX = (leftHip.x + rightHip.x) / 2;
  return {
    timestampMs: sample.timestampMs,
    landmarks: sample.landmarks.map((landmark) => ({
      ...landmark,
      x: centerX + (landmark.x - centerX) * factor,
    })),
  };
}

function occlude(
  sample: RulePoseSample,
  names: readonly CoreLandmarkName[],
): RulePoseSample {
  const nameSet = new Set(names);
  return {
    timestampMs: sample.timestampMs,
    landmarks: sample.landmarks.map((landmark) =>
      nameSet.has(landmark.name)
        ? { ...landmark, confidence: 0.2, observed: false }
        : { ...landmark },
    ),
  };
}

function requireTrial(
  trials: readonly RuleBenchmarkTrial[],
  id: string,
): RuleBenchmarkTrial {
  const trial = trials.find((candidate) => candidate.id === id);
  if (trial === undefined) throw new Error(`missing rule trial ${id}`);
  return trial;
}

export function generateLateralityBenchmarkSuite(): LateralityScenario[] {
  const fixture = generateRuleBaselineBenchmarkSuite().find(
    ({ id }) => id === "adult-standing",
  );
  if (fixture === undefined) {
    throw new Error("adult-standing rule fixture is required");
  }
  const lateralTrials = LATERAL_RULE_MOVEMENTS.map((movement) => ({
    movement,
    trial: requireTrial(fixture.trials, movement),
  }));
  const distalMovements = lateralTrials.filter(
    ({ movement }) =>
      movement.startsWith("step") ||
      movement.startsWith("reach") ||
      movement.startsWith("punch"),
  );
  const scenarios: LateralityScenario[] = [];

  for (const { movement, trial } of lateralTrials) {
    scenarios.push({
      id: `clear-${movement}`,
      category: "clear-frontal",
      description: `Clear frontal ${movement} retains its anatomical label.`,
      expectedPrediction: movement,
      calibration: fixture.calibration.map(cloneSample),
      frames: trial.frames.map(cloneSample),
    });
    scenarios.push({
      id: `full-swap-${movement}`,
      category: "full-anatomical-swap",
      description:
        `All provider left/right names reverse during ${movement}; downstream code must block rather than guess.`,
      expectedPrediction: "blocked",
      calibration: fixture.calibration.map(cloneSample),
      frames: trial.frames.map((frame) =>
        swapNames(frame, FULL_LEFT_RIGHT_PAIRS),
      ),
    });
    scenarios.push({
      id: `mild-turn-${movement}`,
      category: "mild-turn",
      description:
        `A 0.65 horizontal projection retains ${movement} as a desired label.`,
      expectedPrediction: movement,
      calibration: fixture.calibration.map(cloneSample),
      frames: trial.frames.map((frame) => compressHorizontal(frame, 0.65)),
    });
    scenarios.push({
      id: `profile-${movement}`,
      category: "profile-ambiguity",
      description:
        `A 0.20 horizontal projection makes ${movement} laterality unavailable.`,
      expectedPrediction: "blocked",
      calibration: fixture.calibration.map(cloneSample),
      frames: trial.frames.map((frame) => compressHorizontal(frame, 0.2)),
    });
  }

  for (const { movement, trial } of distalMovements) {
    scenarios.push({
      id: `distal-swap-${movement}`,
      category: "distal-only-swap",
      description:
        `Distal provider names reverse while torso names remain stable during ${movement}.`,
      expectedPrediction: "blocked",
      calibration: fixture.calibration.map(cloneSample),
      frames: trial.frames.map((frame) => swapNames(frame, DISTAL_PAIRS)),
    });
  }

  const crossedArms = requireTrial(fixture.trials, "crossed-arms");
  scenarios.push({
    id: "crossed-arms-negative",
    category: "crossed-arms",
    description: "Crossed arms must not become a directional research label.",
    expectedPrediction: "none",
    calibration: fixture.calibration.map(cloneSample),
    frames: crossedArms.frames.map(cloneSample),
  });
  const reachRight = requireTrial(fixture.trials, "reach_right");
  scenarios.push({
    id: "left-wrist-occluded-right-reach",
    category: "self-occlusion",
    description:
      "Missing left wrist must not suppress an independently visible right reach.",
    expectedPrediction: "reach_right",
    calibration: fixture.calibration.map(cloneSample),
    frames: reachRight.frames.map((frame) =>
      occlude(frame, ["left_wrist"]),
    ),
  });
  const reachLeft = requireTrial(fixture.trials, "reach_left");
  scenarios.push({
    id: "right-wrist-occluded-left-reach",
    category: "self-occlusion",
    description:
      "Missing right wrist must not suppress an independently visible left reach.",
    expectedPrediction: "reach_left",
    calibration: fixture.calibration.map(cloneSample),
    frames: reachLeft.frames.map((frame) =>
      occlude(frame, ["right_wrist"]),
    ),
  });
  return scenarios;
}

function emptyConfusionMatrix(): Record<
  LateralityPrediction,
  Record<LateralityPrediction, number>
> {
  return Object.fromEntries(
    LATERALITY_CONFUSION_LABELS.map((truth) => [
      truth,
      Object.fromEntries(
        LATERALITY_CONFUSION_LABELS.map((prediction) => [prediction, 0]),
      ),
    ]),
  ) as Record<LateralityPrediction, Record<LateralityPrediction, number>>;
}

function runScenario(
  strategy: LateralityStrategy,
  scenario: LateralityScenario,
): LateralityScenarioResult {
  const emittedMovements: LateralityMovement[] = [];
  const blockedStatuses: LateralityStatus[] = [];
  if (strategy === "trust-provider-names") {
    const recognizer = new MotionRuleBaselineRecognizer(
      scenario.calibration,
    );
    for (const frame of scenario.frames) {
      for (const event of recognizer.update(cloneSample(frame))) {
        if (isLateralMovement(event.name)) {
          emittedMovements.push(event.name);
        }
      }
    }
  } else {
    const recognizer = new LateralityGuardedRuleRecognizer(
      scenario.calibration,
    );
    for (const frame of scenario.frames) {
      const update = recognizer.update(cloneSample(frame));
      for (const event of update.events) {
        if (isLateralMovement(event.name)) {
          emittedMovements.push(event.name);
        }
      }
      if (
        update.status !== "trusted" &&
        !blockedStatuses.includes(update.status)
      ) {
        blockedStatuses.push(update.status);
      }
    }
  }
  const prediction: LateralityPrediction =
    emittedMovements[0] ??
    (blockedStatuses.length > 0 ? "blocked" : "none");
  return {
    id: scenario.id,
    category: scenario.category,
    expectedPrediction: scenario.expectedPrediction,
    prediction,
    emittedMovements,
    blockedStatuses,
    exact: prediction === scenario.expectedPrediction,
  };
}

export function evaluateLateralityStrategy(
  strategy: LateralityStrategy,
  suite = generateLateralityBenchmarkSuite(),
): LateralityStrategyEvaluation {
  if (!(LATERALITY_STRATEGIES as readonly string[]).includes(strategy)) {
    throw new Error(`unknown laterality strategy ${String(strategy)}`);
  }
  const scenarios = suite.map((scenario) =>
    runScenario(strategy, scenario),
  );
  const confusionMatrix = emptyConfusionMatrix();
  for (const scenario of scenarios) {
    confusionMatrix[scenario.expectedPrediction][scenario.prediction] += 1;
  }
  const exact = scenarios.filter((scenario) => scenario.exact).length;
  const expectedAmbiguity = scenarios.filter(
    ({ expectedPrediction }) => expectedPrediction === "blocked",
  );
  const wrongSide = scenarios.filter((scenario) => {
    if (
      scenario.expectedPrediction === "none" ||
      scenario.expectedPrediction === "blocked"
    ) {
      return false;
    }
    return OPPOSITE[scenario.expectedPrediction] === scenario.prediction;
  }).length;
  return {
    strategy,
    scenarios,
    confusionMatrix,
    totals: {
      scenarios: scenarios.length,
      exact,
      wrongSide,
      unsafeDirectionalEvents: expectedAmbiguity.filter(({ prediction }) =>
        (LATERAL_RULE_MOVEMENTS as readonly string[]).includes(prediction),
      ).length,
      explicitAmbiguityBlocks: expectedAmbiguity.filter(
        ({ prediction }) => prediction === "blocked",
      ).length,
      silentAmbiguitySuppressions: expectedAmbiguity.filter(
        ({ prediction }) => prediction === "none",
      ).length,
      extraDirectionalEvents: scenarios.reduce(
        (total, scenario) =>
          total + Math.max(0, scenario.emittedMovements.length - 1),
        0,
      ),
      accuracy:
        Math.round((exact / scenarios.length) * 1_000_000) / 1_000_000,
    },
  };
}

export function countLateralityBenchmarkUpdates(
  suite: readonly LateralityScenario[],
): number {
  return suite.reduce(
    (total, scenario) => total + scenario.frames.length,
    0,
  );
}
