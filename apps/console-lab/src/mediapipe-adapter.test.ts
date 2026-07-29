import { describe, expect, it } from "vitest";
import { MEDIAPIPE_LANDMARK_NAMES } from "@vcg/motion-contract";
import { MediaPipeFrameAdapter, mediapipeResultToMotionFrame } from "./mediapipe-adapter";

function pose(centerX = 0.5) {
  return MEDIAPIPE_LANDMARK_NAMES.map((_, index) => ({
    x: centerX + (index / 33 - 0.5) * 0.2,
    y: index / 66,
    z: 0,
    visibility: 0.9,
    presence: 0.8,
  }));
}

function result(centers = [0.5]) {
  const landmarks = centers.map((center) => pose(center));
  return {
    landmarks,
    worldLandmarks: landmarks,
    segmentationMasks: [],
    close() {},
  };
}

describe("mediapipeResultToMotionFrame", () => {
  it("maps MediaPipe's 33 points to the exact portable 17-point core", () => {
    const frame = mediapipeResultToMotionFrame(result(), {
      sequence: 7,
      sourceTimestampMs: 10,
      inferenceStartedAtMs: 11,
      inferenceCompletedAtMs: 14,
      publishedAtMs: 15,
    });
    expect(frame.players[0]?.coreLandmarks).toHaveLength(17);
    expect(frame.players[0]?.richLandmarks).toHaveLength(33);
    expect(frame.players[0]?.coreLandmarks.find((point) => point.name === "left_shoulder")?.position.x).toBeCloseTo(0.5 + (11 / 33 - 0.5) * 0.2);
    expect(frame.capabilities.timestampQuality).toBe("capture-arrival");
  });

  it("publishes no player instead of fabricating missing landmarks", () => {
    const incomplete = result();
    incomplete.landmarks[0]?.pop();
    const frame = mediapipeResultToMotionFrame(incomplete, {
      sequence: 8,
      sourceTimestampMs: 10,
      inferenceStartedAtMs: 11,
      inferenceCompletedAtMs: 14,
      publishedAtMs: 15,
    });
    expect(frame.players).toEqual([]);
  });

  it("includes landmark presence in player confidence", () => {
    const adapter = new MediaPipeFrameAdapter();
    adapter.convert(result(), {
      sequence: 8,
      sourceTimestampMs: 1,
      inferenceStartedAtMs: 2,
      inferenceCompletedAtMs: 3,
      publishedAtMs: 4,
    });
    const lowPresence = result();
    for (const landmark of lowPresence.landmarks[0] ?? []) landmark.presence = 0.1;
    const frame = adapter.convert(lowPresence, {
      sequence: 9,
      sourceTimestampMs: 10,
      inferenceStartedAtMs: 11,
      inferenceCompletedAtMs: 14,
      publishedAtMs: 15,
    });

    expect(frame.players[0]?.confidence).toBeCloseTo(0.1);
    expect(frame.players[0]?.coreLandmarks.every((landmark) => !landmark.observed)).toBe(true);
  });

  it("publishes two active-player capacity while tracking additional spectator candidates", () => {
    const frame = mediapipeResultToMotionFrame(result([0.2, 0.5, 0.8]), {
      sequence: 10,
      sourceTimestampMs: 20,
      inferenceStartedAtMs: 21,
      inferenceCompletedAtMs: 24,
      publishedAtMs: 25,
    });

    expect(frame.capabilities.maxPlayers).toBe(2);
    expect(frame.players).toHaveLength(3);
    expect(new Set(frame.players.map((player) => player.id)).size).toBe(3);
    expect(frame.players.every((player) => player.state === "candidate")).toBe(true);
  });

  it("keeps persistent IDs when MediaPipe reverses detection order", () => {
    const adapter = new MediaPipeFrameAdapter();
    const first = adapter.convert(result([0.25, 0.75]), {
      sequence: 1,
      sourceTimestampMs: 100,
      inferenceStartedAtMs: 101,
      inferenceCompletedAtMs: 102,
      publishedAtMs: 103,
    });
    const second = adapter.convert(result([0.75, 0.25]), {
      sequence: 2,
      sourceTimestampMs: 110,
      inferenceStartedAtMs: 111,
      inferenceCompletedAtMs: 112,
      publishedAtMs: 113,
    });

    const leftId = first.players.find((player) => player.bounds.left < 0.5)?.id;
    const rightId = first.players.find((player) => player.bounds.left > 0.5)?.id;
    expect(second.players.find((player) => player.bounds.left < 0.5)?.id).toBe(leftId);
    expect(second.players.find((player) => player.bounds.left > 0.5)?.id).toBe(rightId);
  });
});
