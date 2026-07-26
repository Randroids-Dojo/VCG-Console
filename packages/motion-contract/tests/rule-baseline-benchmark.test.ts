import { describe, expect, it } from "vitest";
import {
  RULE_BASELINE_BENCHMARK_VERSION,
  RULE_FIXTURE_IDS,
  countRuleBenchmarkUpdates,
  evaluateRuleBaseline,
  generateRuleBaselineBenchmarkSuite,
} from "../src";

describe("rule-baseline benchmark", () => {
  it("generates the exact deterministic fixture and trial matrix", () => {
    const first = generateRuleBaselineBenchmarkSuite();
    const second = generateRuleBaselineBenchmarkSuite();
    expect(RULE_BASELINE_BENCHMARK_VERSION).toBe(
      "core17-rule-baseline-synthetic/v1",
    );
    expect(first).toEqual(second);
    expect(first.map(({ id }) => id)).toEqual(RULE_FIXTURE_IDS);
    expect(first.every(({ calibration }) => calibration.length === 24)).toBe(
      true,
    );
    expect(first.every(({ trials }) => trials.length === 16)).toBe(true);
    expect(countRuleBenchmarkUpdates(first)).toBeGreaterThan(2_000);
  });

  it("scores exact event arithmetic without exposing truth to recognizers", () => {
    const evaluation = evaluateRuleBaseline();
    expect(evaluation.fixtures).toHaveLength(5);
    expect(evaluation.totals.expectedTrials).toBe(46);
    expect(evaluation.totals.falseNegativeTrials).toBe(
      evaluation.totals.expectedTrials - evaluation.totals.matchedTrials,
    );
    expect(evaluation.totals.emittedEvents).toBe(
      evaluation.totals.truePositiveEvents +
        evaluation.totals.falsePositiveEvents,
    );
  });

  it("retains the global-upward camera-shift confound as false-positive evidence", () => {
    const evaluation = evaluateRuleBaseline();
    for (const fixture of evaluation.fixtures) {
      const confound = fixture.trials.find(
        ({ id }) => id === "global-upward-shift",
      );
      expect(confound?.expectation).toBe("no-event");
      expect(confound?.emittedMovements).toContain("jump");
    }
  });

  it("does not count unavailable seated lower-body actions as recall targets", () => {
    const suite = generateRuleBaselineBenchmarkSuite();
    const seated = suite.find(({ id }) => id === "seated-exploratory")!;
    expect(
      seated.trials
        .filter(({ expectation }) => expectation === "unavailable")
        .map(({ id }) => id),
    ).toEqual(["jump", "squat", "step_left", "step_right"]);
    const score = evaluateRuleBaseline(suite).fixtures.find(
      ({ fixtureId }) => fixtureId === "seated-exploratory",
    )!;
    expect(score.expectedTrials).toBe(6);
  });
});
