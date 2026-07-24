import { describe, expect, it } from "vitest";
import {
  IDENTITY_BENCHMARK_SUITE_VERSION,
  IDENTITY_TRACKER_ALGORITHMS,
  evaluateIdentityAlgorithm,
  generateIdentityBenchmarkSuite,
} from "../src";

describe("appearance-free identity benchmark", () => {
  it("generates the exact bounded camera-free scenario matrix", () => {
    const suite = generateIdentityBenchmarkSuite();
    expect(IDENTITY_BENCHMARK_SUITE_VERSION).toBe(
      "appearance-free-identity-synthetic/v1",
    );
    expect(
      suite.map(({ id, frames }) => ({
        id,
        frames: frames.length,
        observations: frames.reduce(
          (total, frame) => total + frame.detections.length,
          0,
        ),
      })),
    ).toEqual([
      { id: "two-player-linear-crossing", frames: 61, observations: 122 },
      { id: "brief-central-occlusion", frames: 70, observations: 135 },
      { id: "crossing-confidence-dip", frames: 64, observations: 128 },
      { id: "fast-direction-reversal", frames: 72, observations: 144 },
      { id: "long-exit-and-reentry", frames: 85, observations: 142 },
      { id: "three-player-braided-crossing", frames: 76, observations: 228 },
    ]);
    expect(suite.every(({ framesPerSecond }) => framesPerSecond === 30)).toBe(true);
    expect(suite.flatMap(({ frames }) => frames).every(({ detections }) => detections.length <= 3)).toBe(true);
  });

  it("is byte-for-byte deterministic when serialized", () => {
    expect(JSON.stringify(generateIdentityBenchmarkSuite())).toBe(
      JSON.stringify(generateIdentityBenchmarkSuite()),
    );
  });

  it("keeps truth labels outside tracker inputs and scores the known nearest crossing failure", () => {
    const metrics = evaluateIdentityAlgorithm(
      "nearest-centroid",
      generateIdentityBenchmarkSuite(),
    );
    expect(metrics.totals).toMatchObject({
      visibleTruthObservations: 899,
      assignedObservations: 899,
      missedAssignments: 0,
      idSwitches: 3,
      falseTrackTransfers: 2,
      identityCorrectAssignments: 814,
      idF1: 0.905451,
    });
    expect(
      metrics.scenarios.find(
        ({ scenarioId }) => scenarioId === "two-player-linear-crossing",
      ),
    ).toMatchObject({
      idSwitches: 2,
      falseTrackTransfers: 2,
      idF1: 0.508197,
    });
  });

  it("shows the two-stage baseline leads this synthetic suite without treating it as qualification", () => {
    const results = IDENTITY_TRACKER_ALGORITHMS.map((algorithm) =>
      evaluateIdentityAlgorithm(algorithm, generateIdentityBenchmarkSuite()),
    );
    const twoStage = results.find(
      ({ algorithm }) => algorithm === "two-stage-kalman-iou",
    );
    expect(twoStage?.totals).toMatchObject({
      idSwitches: 1,
      falseTrackTransfers: 0,
      idF1: 0.972191,
    });
    expect(
      results.every(
        ({ scenarios }) =>
          scenarios.find(
            ({ scenarioId }) => scenarioId === "long-exit-and-reentry",
          )?.idSwitches === 1,
      ),
    ).toBe(true);
  });
});
