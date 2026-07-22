import { describe, expect, it } from "vitest";
import { CORE_LANDMARK_NAMES, MOTION_API_SCHEMA_VERSION, MotionTracePlayer, MotionTraceSchema, type MotionFrame } from "../src";

function frame(sequence: number, sourceTimestampMs: number, action?: "jump"): MotionFrame {
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "replay",
    sourceTimestampMs,
    inferenceStartedAtMs: sourceTimestampMs,
    inferenceCompletedAtMs: sourceTimestampMs,
    publishedAtMs: sourceTimestampMs,
    health: "ready",
    capabilities: {
      profiles: ["body.core17", "actions.obstacle.v1"],
      maxPlayers: 1,
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: "replay",
    },
    players: [
      {
        id: "player-1",
        sessionSlot: 1,
        confidence: 1,
        state: "joined",
        coreLandmarks: CORE_LANDMARK_NAMES.map((name) => ({ name, position: { x: 0.5, y: 0.5 }, visibility: 1, observed: true })),
        bounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
        actions: action ? [{ name: action, phase: "triggered", confidence: 1, occurredAtMs: sourceTimestampMs }] : [],
      },
    ],
  };
}

function trace() {
  return MotionTraceSchema.parse({
    format: "vcg-motion-trace",
    formatVersion: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    containsRawFrames: false,
    frames: [frame(0, 1_000), frame(1, 1_100, "jump"), frame(2, 1_200)],
  });
}

describe("MotionTracePlayer", () => {
  it("advances from a test-controlled clock in deterministic order", () => {
    const observed: number[] = [];
    const player = new MotionTracePlayer(trace(), { onFrame: (value) => observed.push(value.sequence) });
    player.play();
    expect(player.advance(0).map((value) => value.sequence)).toEqual([0]);
    expect(player.advance(99)).toEqual([]);
    expect(player.advance(1).map((value) => value.sequence)).toEqual([1]);
    expect(observed).toEqual([0, 1]);
  });

  it("supports speed, seek, and looping without wall-clock access", () => {
    const player = new MotionTracePlayer(trace(), { loop: true, speed: 2, onFrame: () => undefined });
    player.seek(100);
    player.play();
    expect(player.advance(50).map((value) => value.sequence)).toEqual([1, 2, 0]);
    expect(player.completedLoops).toBe(1);
    expect(player.positionMs).toBe(0);
  });

  it("scores expected standardized actions with explicit tolerance", () => {
    const player = new MotionTracePlayer(trace(), {
      expectations: [
        { atMs: 95, toleranceMs: 5, action: "jump", playerId: "player-1" },
        { atMs: 200, action: "duck" },
      ],
      onFrame: () => undefined,
    });
    player.play();
    player.advance(200);
    expect(player.expectationResults()).toEqual([
      { atMs: 95, toleranceMs: 5, action: "jump", playerId: "player-1", matched: true, matchedAtMs: 100 },
      { atMs: 200, action: "duck", matched: false },
    ]);
  });

  it("rejects out-of-order traces", () => {
    const invalid = trace();
    invalid.frames[1]!.sourceTimestampMs = 999;
    expect(() => new MotionTracePlayer(invalid, { onFrame: () => undefined })).toThrow("ordered");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid expectation tolerance %s", (toleranceMs) => {
    expect(
      () =>
        new MotionTracePlayer(trace(), {
          expectations: [{ atMs: 100, toleranceMs, action: "jump" }],
          onFrame: () => undefined,
        }),
    ).toThrow("toleranceMs");
  });
});
