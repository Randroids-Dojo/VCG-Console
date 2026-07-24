import { describe, expect, it } from "vitest";
import {
  OBSERVATION_CONFIDENCE_STRATEGIES,
  evaluateObservationConfidenceStrategy,
  generateObservationConfidenceBenchmarkSuite,
} from "../src";

describe("observation confidence benchmark", () => {
  it("generates a deterministic bounded suite without coordinates", () => {
    const first = generateObservationConfidenceBenchmarkSuite();
    const second = generateObservationConfidenceBenchmarkSuite();
    expect(second).toEqual(first);
    expect(first).toHaveLength(10);
    expect(first.reduce((sum, value) => sum + value.samples.length, 0)).toBe(
      115,
    );
    expect(JSON.stringify(first)).not.toMatch(
      /landmarkName|position|image|frameBytes/,
    );
  });

  it("scores both strategies without exposing expected state to them", () => {
    const evaluations = OBSERVATION_CONFIDENCE_STRATEGIES.map((strategy) =>
      evaluateObservationConfidenceStrategy(strategy),
    );
    expect(evaluations.map(({ strategy }) => strategy)).toEqual(
      OBSERVATION_CONFIDENCE_STRATEGIES,
    );
    expect(evaluations.every(({ totals }) => totals.samples === 115)).toBe(
      true,
    );
    expect(evaluations[1]!.totals.unsafeAvailable).toBeLessThan(
      evaluations[0]!.totals.unsafeAvailable,
    );
    expect(evaluations[1]!.totals.falseUnavailable).toBeGreaterThan(
      evaluations[0]!.totals.falseUnavailable,
    );
  });

  it("fails closed on unknown strategies", () => {
    expect(() =>
      evaluateObservationConfidenceStrategy("truth-aware" as never),
    ).toThrow(/unknown observation confidence strategy/);
  });
});
