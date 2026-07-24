import { describe, expect, it } from "vitest";
import {
  SMOOTHING_ALGORITHMS,
  SMOOTHING_BENCHMARK_SUITE_VERSION,
  evaluateSmoothingAlgorithm,
  generateSmoothingBenchmarkSuite,
} from "../src";

describe("smoothing benchmark", () => {
  it("generates the exact deterministic scenario set without raw frames", () => {
    const first = generateSmoothingBenchmarkSuite();
    const second = generateSmoothingBenchmarkSuite();
    expect(SMOOTHING_BENCHMARK_SUITE_VERSION).toBe(
      "normalized-point-smoothing-synthetic/v1",
    );
    expect(first).toEqual(second);
    expect(
      first.map(({ id, framesPerSecond, frames }) => [
        id,
        framesPerSecond,
        frames.length,
      ]),
    ).toEqual([
      ["static-jitter", 60, 300],
      ["step", 60, 180],
      ["ramp", 60, 240],
      ["reversal", 60, 240],
      ["dropout", 60, 180],
    ]);
    expect(
      first.flatMap(({ frames }) => frames).every(({ input }) =>
        input.observed
          ? input.x >= 0 && input.x <= 1 && input.y >= 0 && input.y <= 1
          : true,
      ),
    ).toBe(true);
  });

  it.each(SMOOTHING_ALGORITHMS)(
    "%s produces bounded finite comparison metrics",
    (algorithm) => {
      const metrics = evaluateSmoothingAlgorithm(algorithm);
      expect(metrics.overallRmsError).toBeGreaterThanOrEqual(0);
      expect(metrics.static.rmsError).toBeGreaterThanOrEqual(0);
      expect(metrics.step.response90Milliseconds).not.toBeNull();
      expect(metrics.dropout.missingOutputCount).toBe(8);
      expect(
        JSON.stringify(metrics).includes("NaN") ||
          JSON.stringify(metrics).includes("Infinity"),
      ).toBe(false);
    },
  );

  it("makes the static-noise versus step-lag tradeoff visible", () => {
    const passthrough = evaluateSmoothingAlgorithm("passthrough");
    const ema = evaluateSmoothingAlgorithm("ema");
    const oneEuro = evaluateSmoothingAlgorithm("one-euro");
    expect(ema.static.rmsError).toBeLessThan(passthrough.static.rmsError);
    expect(oneEuro.static.rmsError).toBeLessThan(passthrough.static.rmsError);
    expect(ema.step.response90Milliseconds).toBeGreaterThan(
      passthrough.step.response90Milliseconds!,
    );
  });
});
