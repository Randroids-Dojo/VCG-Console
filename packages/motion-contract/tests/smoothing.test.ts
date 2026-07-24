import { describe, expect, it } from "vitest";
import {
  MotionPointSmoother,
  SMOOTHING_ALGORITHMS,
  type SmoothingAlgorithm,
} from "../src";

function run(
  algorithm: SmoothingAlgorithm,
  values: readonly number[],
): number[] {
  const smoother = new MotionPointSmoother({ algorithm });
  return values.map((x, index) => {
    const output = smoother.update({
      timestampMs: index * 16,
      observed: true,
      x,
      y: 0.5,
    });
    if (!output.observed) throw new Error("expected observed output");
    return output.x;
  });
}

describe("MotionPointSmoother", () => {
  it("exposes the four implemented comparison algorithms", () => {
    expect(SMOOTHING_ALGORITHMS).toEqual([
      "passthrough",
      "ema",
      "one-euro",
      "kalman",
    ]);
  });

  it("passes observed coordinates through exactly", () => {
    expect(run("passthrough", [0.2, 0.7, 0.4])).toEqual([0.2, 0.7, 0.4]);
  });

  it.each(["ema", "one-euro", "kalman"] as const)(
    "%s reduces stationary output jitter",
    (algorithm) => {
      const noisy = [0.5, 0.52, 0.48, 0.51, 0.49, 0.515, 0.485, 0.5];
      const output = run(algorithm, noisy);
      const rawDeltas = noisy
        .slice(1)
        .map((value, index) => Math.abs(value - noisy[index]!));
      const outputDeltas = output
        .slice(1)
        .map((value, index) => Math.abs(value - output[index]!));
      expect(
        outputDeltas.reduce((sum, value) => sum + value, 0),
      ).toBeLessThan(rawDeltas.reduce((sum, value) => sum + value, 0));
    },
  );

  it("lets One Euro react faster to sustained high-speed motion than fixed EMA", () => {
    const values = [0.3, 0.3, 0.3, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7];
    const ema = run("ema", values);
    const oneEuro = run("one-euro", values);
    expect(oneEuro.at(-1)).toBeGreaterThan(ema.at(-1)!);
  });

  it("never emits a synthetic point for a missing observation", () => {
    const smoother = new MotionPointSmoother({ algorithm: "kalman" });
    smoother.update({ timestampMs: 0, observed: true, x: 0.4, y: 0.6 });
    expect(smoother.update({ timestampMs: 16, observed: false })).toEqual({
      timestampMs: 16,
      observed: false,
    });
  });

  it.each(["ema", "one-euro", "kalman"] as const)(
    "%s resets to measurement after a gap beyond maxGapMs",
    (algorithm) => {
      const smoother = new MotionPointSmoother({
        algorithm,
        maxGapMs: 100,
      });
      smoother.update({ timestampMs: 0, observed: true, x: 0.2, y: 0.2 });
      smoother.update({ timestampMs: 50, observed: false });
      smoother.update({ timestampMs: 101, observed: false });
      expect(
        smoother.update({
          timestampMs: 150,
          observed: true,
          x: 0.8,
          y: 0.8,
        }),
      ).toEqual({
        timestampMs: 150,
        observed: true,
        x: 0.8,
        y: 0.8,
      });
    },
  );

  it("retains smoothing state through a bounded short gap", () => {
    const smoother = new MotionPointSmoother({
      algorithm: "ema",
      emaAlpha: 0.5,
      maxGapMs: 100,
    });
    smoother.update({ timestampMs: 0, observed: true, x: 0.2, y: 0.2 });
    smoother.update({ timestampMs: 50, observed: false });
    expect(
      smoother.update({ timestampMs: 75, observed: true, x: 0.8, y: 0.8 }),
    ).toEqual({
      timestampMs: 75,
      observed: true,
      x: 0.5,
      y: 0.5,
    });
  });

  it("enforces monotonic bounded normalized input and bounded options", () => {
    expect(
      () => new MotionPointSmoother({ algorithm: "ema", emaAlpha: 0 }),
    ).toThrow(/emaAlpha/);
    const smoother = new MotionPointSmoother({ algorithm: "passthrough" });
    smoother.update({ timestampMs: 10, observed: true, x: 0.5, y: 0.5 });
    expect(() =>
      smoother.update({ timestampMs: 10, observed: false }),
    ).toThrow(/strictly increasing/);
    expect(() =>
      new MotionPointSmoother({ algorithm: "passthrough" }).update({
        timestampMs: 0,
        observed: true,
        x: Number.NaN,
        y: 0.5,
      }),
    ).toThrow(/x/);
    expect(() =>
      new MotionPointSmoother({ algorithm: "passthrough" }).update({
        timestampMs: 0,
        observed: true,
        x: 1.01,
        y: 0.5,
      }),
    ).toThrow(/x/);
    expect(
      () =>
        new MotionPointSmoother({
          algorithm: "ema",
          extra: true,
        } as never),
    ).toThrow(/unknown keys/);
    expect(() =>
      new MotionPointSmoother({ algorithm: "passthrough" }).update({
        timestampMs: 0,
        observed: false,
        x: 0.5,
      } as never),
    ).toThrow(/sample keys/);
  });
});
