import type { MotionFrame } from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import { Metrics } from "./metrics";
import { syntheticFrame } from "./synthetic";

type TimestampQuality = MotionFrame["capabilities"]["timestampQuality"];

function frame(
  sequence: number,
  timestampQuality: TimestampQuality,
  timing: Readonly<{
    source: number;
    inferenceStart: number;
    inferenceComplete: number;
    published: number;
  }>,
): MotionFrame {
  const base = syntheticFrame(sequence, timing.source);
  return {
    ...base,
    sourceTimestampMs: timing.source,
    inferenceStartedAtMs: timing.inferenceStart,
    inferenceCompletedAtMs: timing.inferenceComplete,
    publishedAtMs: timing.published,
    capabilities: {
      ...base.capabilities,
      timestampQuality,
    },
  };
}

describe("Metrics", () => {
  it("starts without fabricating zero-duration samples", () => {
    const snapshot = new Metrics(() => 100).snapshot();

    expect(snapshot).toMatchObject({
      fps: 0,
      inferenceInvalidSamples: 0,
      inferenceP50: null,
      inferenceP95: null,
      sourceTiming: {
        boundaryLabel: "SOURCE TO FRAME P95",
        invalidSamples: 0,
        p95: null,
        timestampQuality: null,
        validSamples: 0,
      },
    });
  });

  it.each([
    [
      "camera-exposure",
      "EXPOSURE TO FRAME P95",
      "ends before recognized-action receipt",
    ],
    [
      "capture-arrival",
      "ARRIVAL TO FRAME P95",
      "Camera exposure and capture transport are outside this boundary",
    ],
    [
      "replay",
      "REPLAY TO FRAME P95",
      "camera-free diagnostic timing",
    ],
  ] as const)(
    "names the %s boundary without promoting it to exposure-to-action evidence",
    (timestampQuality, boundaryLabel, disclosureFragment) => {
      const metrics = new Metrics(() => 100);
      metrics.push(
        frame(0, timestampQuality, {
          source: 10,
          inferenceStart: 12,
          inferenceComplete: 15,
          published: 18,
        }),
      );

      expect(metrics.snapshot().sourceTiming).toMatchObject({
        boundaryLabel,
        p95: 8,
        timestampQuality,
        validSamples: 1,
      });
      expect(metrics.snapshot().sourceTiming.disclosure).toContain(
        disclosureFragment,
      );
      expect(metrics.snapshot().sourceTiming.disclosure).not.toContain(
        "qualifies the 120 ms",
      );
    },
  );

  it("computes rolling percentiles and observation-rate FPS", () => {
    let observedAt = 1_000;
    const metrics = new Metrics(() => observedAt);
    for (let sequence = 0; sequence < 4; sequence += 1) {
      metrics.push(
        frame(sequence, "capture-arrival", {
          source: sequence * 100,
          inferenceStart: sequence * 100 + 2,
          inferenceComplete: sequence * 100 + 3 + sequence,
          published: sequence * 100 + 10 + sequence,
        }),
      );
      observedAt += 100;
    }

    expect(metrics.snapshot()).toMatchObject({
      fps: 10,
      inferenceP50: 3,
      inferenceP95: 4,
      sourceTiming: {
        p95: 13,
        validSamples: 4,
      },
    });
  });

  it("does not mix source boundaries when timestamp quality changes", () => {
    const metrics = new Metrics(() => 100);
    metrics.push(
      frame(0, "replay", {
        source: 10,
        inferenceStart: 10,
        inferenceComplete: 11,
        published: 110,
      }),
    );
    metrics.push(
      frame(1, "capture-arrival", {
        source: 120,
        inferenceStart: 121,
        inferenceComplete: 122,
        published: 125,
      }),
    );

    expect(metrics.snapshot().sourceTiming).toMatchObject({
      boundaryLabel: "ARRIVAL TO FRAME P95",
      p95: 5,
      timestampQuality: "capture-arrival",
      validSamples: 1,
    });
  });

  it("bounds the source-timing window to the newest 600 valid samples", () => {
    const metrics = new Metrics(() => 100);
    for (let sequence = 0; sequence <= 600; sequence += 1) {
      metrics.push(
        frame(sequence, "replay", {
          source: sequence * 1_000,
          inferenceStart: sequence * 1_000,
          inferenceComplete: sequence * 1_000 + 1,
          published: sequence * 1_000 + sequence,
        }),
      );
    }

    expect(metrics.snapshot().sourceTiming).toMatchObject({
      p95: 571,
      validSamples: 600,
    });
  });

  it("omits invalid timestamp order instead of displaying negative timing", () => {
    const metrics = new Metrics(() => 100);
    metrics.push(
      frame(0, "camera-exposure", {
        source: 20,
        inferenceStart: 19,
        inferenceComplete: 18,
        published: 17,
      }),
    );

    const snapshot = metrics.snapshot();
    expect(snapshot).toMatchObject({
      inferenceInvalidSamples: 1,
      inferenceP50: null,
      inferenceP95: null,
      sourceTiming: {
        invalidSamples: 1,
        p95: null,
        validSamples: 0,
      },
    });
    expect(snapshot.sourceTiming.disclosure).toContain(
      "Omitted 1 source-timing and 1 inference sample(s)",
    );
  });

  it("reset removes samples, boundary identity, and invalid counts", () => {
    const metrics = new Metrics(() => 100);
    metrics.push(
      frame(0, "replay", {
        source: 10,
        inferenceStart: 12,
        inferenceComplete: 11,
        published: 20,
      }),
    );

    metrics.reset();

    expect(metrics.snapshot()).toMatchObject({
      fps: 0,
      inferenceInvalidSamples: 0,
      inferenceP50: null,
      inferenceP95: null,
      sourceTiming: {
        boundaryLabel: "SOURCE TO FRAME P95",
        invalidSamples: 0,
        p95: null,
        timestampQuality: null,
        validSamples: 0,
      },
    });
  });
});
