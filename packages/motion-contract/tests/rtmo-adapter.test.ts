import { describe, expect, it } from "vitest";
import {
  CORE_LANDMARK_NAMES,
  MotionFrameSchema,
  rtmoResultToMotionFrame,
  type RtmoFrameTiming,
  type RtmoPersonResult,
} from "../src";

const timing: RtmoFrameTiming = {
  sequence: 7,
  sourceTimestampMs: 100,
  inferenceStartedAtMs: 101,
  inferenceCompletedAtMs: 109,
  publishedAtMs: 110,
};

function person(score = 0.9, offset = 0): RtmoPersonResult {
  return {
    keypoints: CORE_LANDMARK_NAMES.map((_, index) => [index * 10 + offset, index * 5 + offset]),
    scores: CORE_LANDMARK_NAMES.map(() => score),
  };
}

describe("rtmoResultToMotionFrame", () => {
  it("maps the exact COCO-17 order and normalizes pixel coordinates", () => {
    const frame = rtmoResultToMotionFrame([person()], timing, {
      imageWidth: 640,
      imageHeight: 320,
      maxPlayers: 4,
      timestampQuality: "replay",
    });

    expect(frame.source).toBe("rtmo-native");
    expect(frame.capabilities).toEqual({
      profiles: ["body.core17"],
      maxPlayers: 4,
      coordinateSpecVersion: "0.1.0",
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: "replay",
    });
    expect(frame.players[0]?.coreLandmarks.map(({ name }) => name)).toEqual(CORE_LANDMARK_NAMES);
    expect(frame.players[0]?.coreLandmarks[16]?.position).toEqual({ x: 0.25, y: 0.25 });
    expect(MotionFrameSchema.parse(frame)).toEqual(frame);
  });

  it("filters RTMO's all-zero no-detection sentinel", () => {
    const sentinel = person(0);
    const frame = rtmoResultToMotionFrame([sentinel], timing, {
      imageWidth: 640,
      imageHeight: 640,
      maxPlayers: 1,
    });
    expect(frame.players).toEqual([]);
  });

  it("ranks multiple people by mean score and applies the declared player bound", () => {
    const frame = rtmoResultToMotionFrame([person(0.5), person(0.9, 20), person(0.7, 10)], timing, {
      imageWidth: 640,
      imageHeight: 640,
      maxPlayers: 2,
    });
    expect(frame.players.map(({ id, sessionSlot }) => ({ id, sessionSlot }))).toEqual([
      { id: "candidate-2", sessionSlot: 1 },
      { id: "candidate-3", sessionSlot: 2 },
    ]);
    expect(frame.players[0]?.confidence).toBeCloseTo(0.9);
    expect(frame.players[1]?.confidence).toBeCloseTo(0.7);
  });

  it("uses observed points for bounds and preserves finite out-of-frame coordinates", () => {
    const baseline = person(0.1);
    const keypoints = baseline.keypoints.map((point) => [...point] as [number, number]);
    const scores = [...baseline.scores];
    keypoints[0] = [-64, 700];
    keypoints[1] = [320, 320];
    scores[0] = 0.8;
    scores[1] = 0.7;
    const candidate = { keypoints, scores };
    const frame = rtmoResultToMotionFrame([candidate], timing, {
      imageWidth: 640,
      imageHeight: 640,
      maxPlayers: 1,
      observedScoreThreshold: 0.5,
    });
    expect(frame.players[0]?.coreLandmarks[0]).toMatchObject({
      position: { x: -0.1, y: 1.09375 },
      visibility: 0.8,
      observed: true,
    });
    expect(frame.players[0]?.coreLandmarks[2]?.observed).toBe(false);
    expect(frame.players[0]?.bounds).toEqual({ left: -0.1, top: 0.5, right: 0.5, bottom: 1.09375 });
  });

  it.each([
    ["missing keypoint", { ...person(), keypoints: person().keypoints.slice(1) }],
    ["missing score", { ...person(), scores: person().scores.slice(1) }],
    ["non-finite point", { ...person(), keypoints: person().keypoints.map((point, index) => index === 0 ? [Number.NaN, point[1]] as const : point) }],
    ["out-of-range score", { ...person(), scores: person().scores.map((score, index) => index === 0 ? 1.1 : score) }],
  ])("rejects malformed backend output: %s", (_, malformed) => {
    expect(() =>
      rtmoResultToMotionFrame([malformed], timing, { imageWidth: 640, imageHeight: 640, maxPlayers: 1 }),
    ).toThrow();
  });

  it("rejects invalid dimensions, limits, thresholds, and non-monotonic timing", () => {
    expect(() => rtmoResultToMotionFrame([], timing, { imageWidth: 0, imageHeight: 640, maxPlayers: 1 })).toThrow();
    expect(() => rtmoResultToMotionFrame([], timing, { imageWidth: 640, imageHeight: 640, maxPlayers: 0 })).toThrow();
    expect(() =>
      rtmoResultToMotionFrame([], timing, {
        imageWidth: 640,
        imageHeight: 640,
        maxPlayers: 1,
        observedScoreThreshold: 2,
      }),
    ).toThrow();
    expect(() =>
      rtmoResultToMotionFrame([], timing, {
        imageWidth: 640,
        imageHeight: 640,
        maxPlayers: 1,
        observedScoreThreshold: 0,
      }),
    ).toThrow();
    expect(() =>
      rtmoResultToMotionFrame(
        [],
        { ...timing, inferenceCompletedAtMs: timing.inferenceStartedAtMs - 1 },
        { imageWidth: 640, imageHeight: 640, maxPlayers: 1 },
      ),
    ).toThrow();
  });
});
