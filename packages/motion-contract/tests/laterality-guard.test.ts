import { describe, expect, it } from "vitest";
import {
  LateralityGuardedRuleRecognizer,
  MotionPoseSimulator,
  RULE_BASELINE_CALIBRATION_SAMPLES,
  type MotionSimulatorPose,
  type RulePoseSample,
} from "../src";

const LEFT_RIGHT_PAIRS = [
  ["left_eye", "right_eye"],
  ["left_ear", "right_ear"],
  ["left_shoulder", "right_shoulder"],
  ["left_elbow", "right_elbow"],
  ["left_wrist", "right_wrist"],
  ["left_hip", "right_hip"],
  ["left_knee", "right_knee"],
  ["left_ankle", "right_ankle"],
] as const;

function sample(
  timestampMs: number,
  pose: MotionSimulatorPose = "neutral",
): RulePoseSample {
  const simulator = new MotionPoseSimulator();
  simulator.setPose(pose);
  const player = simulator.frame(timestampMs, timestampMs).players[0]!;
  return {
    timestampMs,
    landmarks: player.coreLandmarks.map((landmark) => ({
      name: landmark.name,
      x: landmark.position.x,
      y: landmark.position.y,
      confidence: landmark.visibility,
      observed: landmark.observed,
    })),
  };
}

function calibration(): RulePoseSample[] {
  return Array.from(
    { length: RULE_BASELINE_CALIBRATION_SAMPLES },
    (_, index) => sample(index * 33),
  );
}

function swapAnatomicalNames(input: RulePoseSample): RulePoseSample {
  const swap = new Map<string, string>();
  LEFT_RIGHT_PAIRS.forEach(([left, right]) => {
    swap.set(left, right);
    swap.set(right, left);
  });
  return {
    timestampMs: input.timestampMs,
    landmarks: input.landmarks.map((landmark) => ({
      ...landmark,
      name: (swap.get(landmark.name) ?? landmark.name) as typeof landmark.name,
    })),
  };
}

function shiftLeftAnkle(input: RulePoseSample): RulePoseSample {
  return {
    timestampMs: input.timestampMs,
    landmarks: input.landmarks.map((landmark) =>
      landmark.name === "left_ankle" || landmark.name === "left_knee"
        ? { ...landmark, x: landmark.x - 0.12 }
        : landmark,
    ),
  };
}

function compressHorizontally(
  input: RulePoseSample,
  factor: number,
): RulePoseSample {
  return {
    timestampMs: input.timestampMs,
    landmarks: input.landmarks.map((landmark) => ({
      ...landmark,
      x: 0.5 + (landmark.x - 0.5) * factor,
    })),
  };
}

describe("LateralityGuardedRuleRecognizer", () => {
  it("passes a trusted anatomical left step", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    recognizer.update(sample(1_000));
    const update = recognizer.update(shiftLeftAnkle(sample(1_033)));
    expect(update.status).toBe("trusted");
    expect(update.events.map(({ name }) => name)).toEqual(["step_left"]);
    expect(update.suppressedMovements).toEqual([]);
  });

  it("blocks reversed provider anatomy rather than emitting the opposite side", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    recognizer.update(sample(1_000));
    const update = recognizer.update(
      swapAnatomicalNames(shiftLeftAnkle(sample(1_033))),
    );
    expect(update.status).toBe("blocked-axis-reversal");
    expect(update.events).toEqual([]);
    expect(update.suppressedMovements).toEqual([]);
  });

  it("blocks profile-like foreshortening", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    const update = recognizer.update(
      compressHorizontally(sample(1_000), 0.2),
    );
    expect(update.status).toBe("blocked-foreshortened");
    expect(update.minimumWidthRatio).toBeCloseTo(0.2);
  });

  it("blocks an exactly collapsed anatomical axis", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    const collapsed = sample(1_000);
    const leftHip = collapsed.landmarks.find(
      ({ name }) => name === "left_hip",
    )!;
    collapsed.landmarks = collapsed.landmarks.map((landmark) =>
      landmark.name === "right_hip"
        ? { ...landmark, x: leftHip.x, y: leftHip.y }
        : landmark,
    );
    const update = recognizer.update(collapsed);
    expect(update.status).toBe("blocked-foreshortened");
    expect(update.minimumAxisAlignment).toBeNull();
    expect(update.minimumWidthRatio).toBe(0);
  });

  it("blocks when named hip or shoulder anchors disappear", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    const missing = sample(1_000);
    missing.landmarks = missing.landmarks.map((landmark) =>
      landmark.name === "left_hip"
        ? { ...landmark, observed: false }
        : landmark,
    );
    expect(recognizer.update(missing).status).toBe(
      "blocked-missing-anchors",
    );
  });

  it("preserves non-directional Jump while provider anatomy is blocked", () => {
    const recognizer = new LateralityGuardedRuleRecognizer(calibration());
    recognizer.update(sample(1_000));
    const jump = sample(1_033, "jump");
    const update = recognizer.update(swapAnatomicalNames(jump));
    expect(update.status).toBe("blocked-axis-reversal");
    expect(update.events.map(({ name }) => name)).toEqual(["jump"]);
  });

  it("rejects open or out-of-range guard configuration", () => {
    expect(
      () =>
        new LateralityGuardedRuleRecognizer(calibration(), {
          minimumWidthRatio: 0,
        }),
    ).toThrow(/minimumWidthRatio/);
    expect(
      () =>
        new LateralityGuardedRuleRecognizer(calibration(), {
          guessFromScreenPosition: true,
        } as never),
    ).toThrow(/unknown keys/);
  });
});
