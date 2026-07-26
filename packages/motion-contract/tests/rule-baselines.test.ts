import { describe, expect, it } from "vitest";
import {
  MotionPoseSimulator,
  MotionRuleBaselineRecognizer,
  RULE_BASELINE_CALIBRATION_SAMPLES,
  RULE_MOVEMENT_NAMES,
  type RulePoseSample,
} from "../src";

function sample(
  timestampMs: number,
  pose:
    | "neutral"
    | "jump"
    | "duck"
    | "dodge-left"
    | "dodge-right" = "neutral",
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

describe("MotionRuleBaselineRecognizer", () => {
  it("exposes the exact exploratory movement vocabulary", () => {
    expect(RULE_MOVEMENT_NAMES).toEqual([
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
    ]);
  });

  it("recognizes simulator jump without granting a MotionAction", () => {
    const recognizer = new MotionRuleBaselineRecognizer(calibration());
    recognizer.update(sample(1_000));
    expect(recognizer.update(sample(1_033, "jump"))).toEqual([
      {
        name: "jump",
        confidence: expect.any(Number),
        occurredAtMs: 1_033,
      },
    ]);
  });

  it("recognizes simulator duck as the squat research label", () => {
    const recognizer = new MotionRuleBaselineRecognizer(calibration());
    recognizer.update(sample(1_000));
    expect(recognizer.update(sample(1_033, "duck")).map(({ name }) => name)).toEqual([
      "squat",
    ]);
  });

  it("latches a positional rule until it crosses the exit threshold", () => {
    const recognizer = new MotionRuleBaselineRecognizer(calibration(), {
      cooldownMs: 0,
    });
    recognizer.update(sample(1_000));
    expect(recognizer.update(sample(1_033, "jump"))).toHaveLength(1);
    expect(recognizer.update(sample(1_066, "jump"))).toEqual([]);
    expect(recognizer.update(sample(1_099))).toEqual([]);
    expect(recognizer.update(sample(1_132, "jump"))).toHaveLength(1);
  });

  it("suppresses an affected rule when required landmarks are unavailable", () => {
    const recognizer = new MotionRuleBaselineRecognizer(calibration());
    recognizer.update(sample(1_000));
    const missingAnkles = sample(1_033, "jump");
    missingAnkles.landmarks = missingAnkles.landmarks.map((landmark) =>
      landmark.name === "left_ankle" || landmark.name === "right_ankle"
        ? { ...landmark, observed: false }
        : landmark,
    );
    expect(recognizer.update(missingAnkles)).toEqual([]);
  });

  it("fails closed on malformed calibration, time, landmarks, and thresholds", () => {
    expect(
      () => new MotionRuleBaselineRecognizer(calibration().slice(1)),
    ).toThrow(/exactly 24/);
    expect(
      () =>
        new MotionRuleBaselineRecognizer(calibration(), {
          jumpExitBodyHeights: 0.09,
        }),
    ).toThrow(/less than/);
    const recognizer = new MotionRuleBaselineRecognizer(calibration());
    recognizer.update(sample(1_000));
    expect(() => recognizer.update(sample(1_000))).toThrow(
      /strictly increasing/,
    );
    const duplicate = sample(1_033);
    duplicate.landmarks[1] = {
      ...duplicate.landmarks[1]!,
      name: duplicate.landmarks[0]!.name,
    };
    expect(() =>
      new MotionRuleBaselineRecognizer(calibration()).update(duplicate),
    ).toThrow(/duplicate/);
    expect(
      () =>
        new MotionRuleBaselineRecognizer(calibration(), {
          extra: 1,
        } as never),
    ).toThrow(/unknown keys/);
  });
});
