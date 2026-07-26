import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionTraceSchema,
  type MotionAction,
  type MotionFrame,
} from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import {
  createTinyGameReplay,
  TinyMotionGame,
} from "../examples/tiny-motion-game";

function frame(sequence: number, atMs: number, action?: MotionAction["name"]): MotionFrame {
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "replay",
    sourceTimestampMs: atMs,
    inferenceStartedAtMs: atMs,
    inferenceCompletedAtMs: atMs,
    publishedAtMs: atMs,
    health: "ready",
    capabilities: {
      profiles: ["body.core17", "actions.obstacle.v1"],
      maxPlayers: 1,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: "replay",
    },
    players: [{
      id: "player-1",
      sessionSlot: 1,
      confidence: 1,
      state: "joined",
      coreLandmarks: CORE_LANDMARK_NAMES.map((name) => ({
        name,
        position: {
          x: name === "left_hip" ? 0.34 : name === "right_hip" ? 0.42 : 0.5,
          y: 0.5,
        },
        visibility: 1,
        observed: true,
      })),
      bounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
      actions: action
        ? [{ name: action, phase: "triggered", confidence: 1, occurredAtMs: atMs }]
        : [],
    }],
  };
}

describe("tiny Motion reference game", () => {
  it("uses portable landmarks and only triggered obstacle actions", () => {
    const snapshots: string[] = [];
    const game = new TinyMotionGame((snapshot) => snapshots.push(snapshot.status));
    const value = frame(0, 0, "jump");
    value.capabilities.profiles.push("actions.shell.v1");
    value.players[0]!.actions.unshift({
      name: "menu_back",
      phase: "triggered",
      confidence: 1,
      occurredAtMs: 0,
      durationMs: 800,
    });

    game.acceptFrame(value);

    expect(game.snapshot).toMatchObject({
      lane: 0,
      stance: "jumping",
      score: 100,
      motionReady: true,
      inputSource: "motion",
      status: "MOTION JUMP",
    });
    expect(snapshots).toContain("MOTION JUMP");
  });

  it("runs the same consumer from a deterministic skeleton-only replay", () => {
    const game = new TinyMotionGame(() => undefined);
    const trace = MotionTraceSchema.parse({
      format: "vcg-motion-trace",
      formatVersion: 1,
      createdAt: "2026-07-24T00:00:00.000Z",
      containsRawFrames: false,
      frames: [frame(0, 1_000), frame(1, 1_100, "duck")],
    });
    const replay = createTinyGameReplay(game, trace);

    replay.play();
    expect(replay.advance(0)).toHaveLength(1);
    expect(replay.advance(100)).toHaveLength(1);
    expect(game.snapshot).toMatchObject({
      stance: "ducking",
      score: 100,
      inputSource: "motion",
    });
  });

  it("keeps controller fallback available through loss and degradation", () => {
    const game = new TinyMotionGame(() => undefined);
    game.acceptFrame({ ...frame(0, 0), players: [] });
    expect(game.snapshot).toMatchObject({
      motionReady: false,
      inputSource: "waiting",
      status: "PLAYER NOT FOUND",
    });

    game.acceptController("right");
    expect(game.snapshot).toMatchObject({
      lane: 2,
      score: 100,
      inputSource: "controller",
      status: "CONTROLLER RIGHT",
    });
  });
});
