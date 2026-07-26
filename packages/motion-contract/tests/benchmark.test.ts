import { describe, expect, it } from "vitest";
import canonicalPlan from "../../../benchmarks/household-one-player-v1.json" with { type: "json" };
import {
  MotionBenchmarkPlanSchema,
  MotionBenchmarkResultSchema,
  requireHouseholdBenchmarkCoverage,
  scoreMotionBenchmark,
} from "../src/benchmark";

describe("motion benchmark contract", () => {
  it("validates the complete canonical household movement suite", () => {
    const plan = requireHouseholdBenchmarkCoverage(canonicalPlan);
    expect(plan.trials).toHaveLength(14);
    expect(plan.containsRawFrames).toBe(false);
    expect(plan.rawVideoDefault).toBe(false);
    expect(plan.trials.every((trial) => trial.repetitions >= 20)).toBe(true);
  });

  it("rejects missing movement coverage, duplicate trials, and incoherent contexts", () => {
    const plan = MotionBenchmarkPlanSchema.parse(canonicalPlan);
    expect(() =>
      requireHouseholdBenchmarkCoverage({
        ...plan,
        trials: plan.trials.filter((trial) => trial.movement !== "occlude"),
      }),
    ).toThrow("occlude");
    expect(
      MotionBenchmarkPlanSchema.safeParse({
        ...plan,
        trials: [plan.trials[0], plan.trials[0]],
      }).success,
    ).toBe(false);
    expect(
      MotionBenchmarkPlanSchema.safeParse({
        ...plan,
        trials: [
          {
            ...plan.trials[0],
            id: "bad-context",
            context: "shell",
            expectation: {
              kind: "trigger",
              action: "jump",
              window: { earliestMs: 0, latestMs: 100 },
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(() =>
      requireHouseholdBenchmarkCoverage({
        ...plan,
        trials: plan.trials.map((trial) =>
          trial.id === "jump"
            ? { ...trial, repetitions: 19, expectation: { kind: "no-trigger" } }
            : trial,
        ),
      }),
    ).toThrow("20-attempt");
  });

  it("scores timed triggers, false events, misses, transitions, and invalid attempts", () => {
    const plan = MotionBenchmarkPlanSchema.parse({
      format: "vcg-motion-benchmark-plan",
      formatVersion: 1,
      protocolId: "score-fixture",
      createdAt: "2026-07-24T00:00:00.000Z",
      motionApiSchemaVersion: "0.4.0",
      containsRawFrames: false,
      rawVideoDefault: false,
      trials: [
        {
          id: "jump",
          movement: "jump",
          context: "game",
          repetitions: 2,
          durationMs: 1_000,
          instruction: "Jump once.",
          expectation: {
            kind: "trigger",
            action: "jump",
            window: { earliestMs: 100, latestMs: 800 },
          },
        },
        {
          id: "stand",
          movement: "stand",
          context: "game",
          repetitions: 1,
          durationMs: 1_000,
          instruction: "Stand still.",
          expectation: { kind: "no-trigger" },
        },
        {
          id: "loss",
          movement: "occlude",
          context: "session",
          repetitions: 1,
          durationMs: 1_000,
          instruction: "Occlude the joined player.",
          expectation: {
            kind: "session-transition",
            transition: "freeze",
            window: { earliestMs: 300, latestMs: 700 },
          },
        },
      ],
    });
    const result = MotionBenchmarkResultSchema.parse({
      format: "vcg-motion-benchmark-result",
      formatVersion: 1,
      protocolId: "score-fixture",
      runId: "run-1",
      createdAt: "2026-07-24T00:00:00.000Z",
      containsRawFrames: false,
      traceSha256: "a".repeat(64),
      timestampQuality: "capture-arrival",
      configurationId: "desk-test",
      placementId: "center",
      personaClass: "adult-standing",
      concurrentWorkload: "synthetic scorer fixture",
      attempts: [
        {
          trialId: "jump",
          repetition: 1,
          completed: true,
          observedTriggers: [
            { action: "jump", atMs: 200 },
            { action: "duck", atMs: 250 },
          ],
          observedTransitions: [{ transition: "show-recovery", atMs: 500 }],
        },
        {
          trialId: "jump",
          repetition: 2,
          completed: true,
          observedTriggers: [{ action: "jump", atMs: 900 }],
          observedTransitions: [],
        },
        {
          trialId: "stand",
          repetition: 1,
          completed: false,
          observedTriggers: [],
          observedTransitions: [],
        },
        {
          trialId: "loss",
          repetition: 1,
          completed: true,
          observedTriggers: [],
          observedTransitions: [{ transition: "freeze", atMs: 400 }],
        },
      ],
    });

    expect(scoreMotionBenchmark(plan, result)).toEqual({
      complete: false,
      expectedAttempts: 4,
      completedAttempts: 3,
      invalidAttempts: 1,
      truePositiveTriggers: 1,
      falsePositiveTriggers: 2,
      falseNegativeTriggers: 1,
      triggerPrecision: 1 / 3,
      triggerRecall: 1 / 2,
      expectedTransitions: 1,
      correctTransitions: 1,
      falsePositiveTransitions: 1,
      falseNegativeTransitions: 0,
      transitionPrecision: 1 / 2,
      transitionRecall: 1,
    });
  });

  it("refuses omitted or duplicate trial results", () => {
    const plan = MotionBenchmarkPlanSchema.parse(canonicalPlan);
    const empty = {
      format: "vcg-motion-benchmark-result",
      formatVersion: 1,
      protocolId: plan.protocolId,
      runId: "empty",
      createdAt: "2026-07-24T00:00:00.000Z",
      containsRawFrames: false,
      traceSha256: "b".repeat(64),
      timestampQuality: "replay",
      configurationId: "test",
      placementId: "center",
      personaClass: "exploratory-other",
      concurrentWorkload: "none",
      attempts: [],
    };
    expect(() => scoreMotionBenchmark(plan, empty)).toThrow("every planned");
    expect(
      MotionBenchmarkResultSchema.safeParse({
        ...empty,
        attempts: [
          {
            trialId: "stand",
            repetition: 1,
            completed: true,
            observedTriggers: [],
            observedTransitions: [],
          },
          {
            trialId: "stand",
            repetition: 1,
            completed: true,
            observedTriggers: [],
            observedTransitions: [],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
