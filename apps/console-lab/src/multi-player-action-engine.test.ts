import { describe, expect, it } from "vitest";
import type { CoreLandmarkName, MotionFrame, PlayerMotion } from "@vcg/motion-contract";
import { MultiPlayerActionEngine } from "./multi-player-action-engine";
import { syntheticFrame } from "./synthetic";

function twoPlayerFrame(sequence: number, atMs: number): MotionFrame {
  const frame = syntheticFrame(sequence, atMs);
  const first = frame.players[0];
  if (!first) throw new Error("fixture player missing");
  const second = structuredClone(first);
  first.id = "track-1";
  second.id = "track-2";
  second.coreLandmarks.forEach((landmark) => {
    landmark.position.x = Math.min(1, landmark.position.x + 0.18);
  });
  return { ...frame, capabilities: { ...frame.capabilities, maxPlayers: 2 }, players: [first, second] };
}

function alterPlayer(
  frame: MotionFrame,
  trackId: string,
  changes: Partial<Record<CoreLandmarkName, { x?: number; y?: number }>>,
): MotionFrame {
  const clone = structuredClone(frame);
  const player = clone.players.find((candidate) => candidate.id === trackId);
  if (!player) throw new Error(`fixture player ${trackId} missing`);
  for (const landmark of player.coreLandmarks) {
    const change = changes[landmark.name];
    if (change?.x !== undefined) landmark.position.x = change.x;
    if (change?.y !== undefined) landmark.position.y = change.y;
  }
  return clone;
}

function byId(frame: MotionFrame, trackId: string): PlayerMotion | undefined {
  return frame.players.find((player) => player.id === trackId);
}

describe("MultiPlayerActionEngine", () => {
  it("keeps recognition state isolated for two simultaneous bodies", () => {
    const engine = new MultiPlayerActionEngine();
    const handsTogether = {
      left_wrist: { x: 0.49, y: 0.45 },
      right_wrist: { x: 0.51, y: 0.45 },
    };
    engine.enrich(alterPlayer(twoPlayerFrame(1, 0), "track-1", handsTogether));
    const held = engine.enrich(alterPlayer(twoPlayerFrame(2, 500), "track-1", handsTogether));

    expect(byId(held, "track-1")?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "held" }),
      expect.objectContaining({ name: "player_join", phase: "triggered" }),
    ]);
    expect(byId(held, "track-2")?.actions).toEqual([]);
    expect(byId(held, "track-1")?.state).toBe("candidate");
  });

  it("only grants joined authority after an explicit session assignment", () => {
    const engine = new MultiPlayerActionEngine();
    engine.enrich(twoPlayerFrame(1, 0));
    engine.join("track-2", 1);
    const enriched = engine.enrich(twoPlayerFrame(2, 20));

    expect(enriched.players[0]).toMatchObject({ id: "track-2", state: "joined", sessionSlot: 1 });
    expect(byId(enriched, "track-1")).toMatchObject({ state: "candidate" });
  });

  it("preserves player slots when detector order reverses", () => {
    const engine = new MultiPlayerActionEngine();
    engine.enrich(twoPlayerFrame(1, 0));
    engine.join("track-1", 1);
    engine.join("track-2", 2);
    const reversed = twoPlayerFrame(2, 20);
    reversed.players.reverse();

    expect(engine.enrich(reversed).players.map(({ id, sessionSlot, state }) => ({ id, sessionSlot, state }))).toEqual([
      { id: "track-1", sessionSlot: 1, state: "joined" },
      { id: "track-2", sessionSlot: 2, state: "joined" },
    ]);
  });

  it("removes authority from a departed track without promoting a spectator", () => {
    const engine = new MultiPlayerActionEngine();
    engine.enrich(twoPlayerFrame(1, 0));
    engine.join("track-1", 1);
    engine.synchronize([]);
    const enriched = engine.enrich(twoPlayerFrame(2, 20));

    expect(enriched.players.every((player) => player.state === "candidate")).toBe(true);
  });
});
