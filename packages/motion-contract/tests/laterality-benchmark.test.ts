import { describe, expect, it } from "vitest";
import {
  LATERALITY_BENCHMARK_VERSION,
  LATERALITY_STRATEGIES,
  evaluateLateralityStrategy,
  generateLateralityBenchmarkSuite,
} from "../src";

describe("laterality benchmark", () => {
  it("generates the exact deterministic adversarial category matrix", () => {
    const first = generateLateralityBenchmarkSuite();
    const second = generateLateralityBenchmarkSuite();
    expect(LATERALITY_BENCHMARK_VERSION).toBe(
      "core17-laterality-adversarial/v1",
    );
    expect(first).toEqual(second);
    expect(first).toHaveLength(41);
    expect(
      Object.fromEntries(
        [
          "clear-frontal",
          "full-anatomical-swap",
          "distal-only-swap",
          "mild-turn",
          "profile-ambiguity",
          "crossed-arms",
          "self-occlusion",
        ].map((category) => [
          category,
          first.filter((scenario) => scenario.category === category).length,
        ]),
      ),
    ).toEqual({
      "clear-frontal": 8,
      "full-anatomical-swap": 8,
      "distal-only-swap": 6,
      "mild-turn": 8,
      "profile-ambiguity": 8,
      "crossed-arms": 1,
      "self-occlusion": 2,
    });
  });

  it.each(LATERALITY_STRATEGIES)(
    "%s produces a complete labeled confusion matrix",
    (strategy) => {
      const evaluation = evaluateLateralityStrategy(strategy);
      expect(evaluation.scenarios).toHaveLength(41);
      expect(evaluation.totals.scenarios).toBe(41);
      expect(
        Object.values(evaluation.confusionMatrix).reduce(
          (total, row) =>
            total +
            Object.values(row).reduce(
              (rowTotal, count) => rowTotal + count,
              0,
            ),
          0,
        ),
      ).toBe(41);
    },
  );

  it("makes the full-swap mitigation and distal-swap residual explicit", () => {
    const guarded = evaluateLateralityStrategy(
      "anatomical-axis-continuity-guard",
    );
    expect(
      guarded.scenarios
        .filter(({ category }) => category === "full-anatomical-swap")
        .every(({ prediction }) => prediction === "blocked"),
    ).toBe(true);
    expect(
      guarded.scenarios
        .filter(({ category }) => category === "distal-only-swap")
        .every(({ prediction }) => prediction !== "blocked"),
    ).toBe(true);
  });

  it("retains unaffected-side reach through wrist self-occlusion", () => {
    const guarded = evaluateLateralityStrategy(
      "anatomical-axis-continuity-guard",
    );
    expect(
      guarded.scenarios
        .filter(({ category }) => category === "self-occlusion")
        .map(({ prediction }) => prediction),
    ).toEqual(["reach_right", "reach_left"]);
  });
});
