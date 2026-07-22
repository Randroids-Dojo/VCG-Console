import { describe, expect, it } from "vitest";
import { MEDIAPIPE_LANDMARK_NAMES } from "@vcg/motion-contract";
import { mediapipeResultToMotionFrame } from "./mediapipe-adapter";

function result() {
  const landmarks = MEDIAPIPE_LANDMARK_NAMES.map((_, index) => ({
    x: index / 33,
    y: index / 66,
    z: 0,
    visibility: 0.9,
    presence: 0.8,
  }));
  return {
    landmarks: [landmarks],
    worldLandmarks: [landmarks],
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
    expect(frame.players[0]?.coreLandmarks.find((point) => point.name === "left_shoulder")?.position.x).toBe(11 / 33);
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
    const lowPresence = result();
    for (const landmark of lowPresence.landmarks[0] ?? []) landmark.presence = 0.1;
    const frame = mediapipeResultToMotionFrame(lowPresence, {
      sequence: 9,
      sourceTimestampMs: 10,
      inferenceStartedAtMs: 11,
      inferenceCompletedAtMs: 14,
      publishedAtMs: 15,
    });

    expect(frame.players[0]?.confidence).toBeCloseTo(0.1);
    expect(frame.players[0]?.coreLandmarks.every((landmark) => !landmark.observed)).toBe(true);
  });
});
