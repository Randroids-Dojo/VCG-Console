import { describe, expect, it } from "vitest";
import { MotionPoseSimulator, type CoreLandmarkName, type MotionFrame, type PlayerMotion } from "@vcg/motion-contract";
import { PlayerSessionController } from "./player-session";
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
  it("keeps a rejected candidate unpaired and able to request pairing again", () => {
    const engine = new MultiPlayerActionEngine();
    const simulator = new MotionPoseSimulator();
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(1, 0));
    const first = engine.enrich(simulator.frame(2, 500));
    expect(first.players[0]?.actions).toContainEqual(expect.objectContaining({ name: "player_join", phase: "triggered" }));
    simulator.setPose("neutral");
    engine.enrich(simulator.frame(3, 600));
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(4, 1200));
    const again = engine.enrich(simulator.frame(5, 1700));
    expect(again.players[0]).toMatchObject({ state: "candidate" });
    expect(again.players[0]?.actions).toContainEqual(expect.objectContaining({ name: "player_join", phase: "triggered" }));
    expect(again.players[0]?.actions.some(a => a.name === "menu_select")).toBe(false);
  });

  it("requires a fresh hold after a player disappears mid-gesture", () => {
    const engine = new MultiPlayerActionEngine();
    const simulator = new MotionPoseSimulator();
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(1, 0));
    simulator.setPlayerVisible(false);
    engine.enrich(simulator.frame(2, 200));
    simulator.setPlayerVisible(true);
    const returned = engine.enrich(simulator.frame(3, 700));
    expect(returned.players[0]?.actions).toEqual([expect.objectContaining({ name: "player_join", phase: "started", durationMs: 0 })]);
  });

  it("allows a fresh candidate to deliberately take a lost single-player slot without a second join", () => {
    const engine = new MultiPlayerActionEngine();
    const session = new PlayerSessionController({ maxPlayers: 2 });
    session.observe(0, ["departed"]);
    session.join("departed");
    engine.synchronize(session.snapshot().players);
    session.observe(100, []);
    session.observe(500, []);
    session.observe(2600, ["replacement"]);
    expect(session.snapshot().phase).toBe("recovery");
    const simulator = new MotionPoseSimulator({ playerId: "replacement" });
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(1, 2600), "overlay");
    const joined = engine.enrich(simulator.frame(2, 3100), "overlay").players[0]!;
    expect(joined.actions).toContainEqual(expect.objectContaining({ name: "player_join", phase: "triggered" }));
    expect(session.authorizeRecoveryAction(joined.id)).toBe(true);
    session.resumeRecovery(joined.id);
    engine.synchronize(session.snapshot().players);
    expect(session.authorizeLauncherAction(joined.id)).toBe(1);
    expect(session.authorizeLauncherAction("departed")).toBeUndefined();
    expect(engine.enrich(simulator.frame(3, 3300)).players[0]?.actions.some(a => a.name === "menu_select" && a.phase === "triggered")).toBe(false);
    simulator.setPose("neutral");
    engine.enrich(simulator.frame(4, 3500));
    expect(engine.sweep.zone).toBe("home");
    simulator.setPose("swipe-right");
    expect(engine.enrich(simulator.frame(5, 3800)).players[0]?.actions).toContainEqual(expect.objectContaining({ name: "menu_swipe_right", phase: "triggered" }));
  });

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
