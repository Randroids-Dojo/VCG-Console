import { describe, expect, it } from "vitest";
import type { CoreLandmarkName, MotionFrame } from "@vcg/motion-contract";
import { ActionEngine } from "./action-engine";
import { syntheticFrame } from "./synthetic";

function alter(frame: MotionFrame, changes: Partial<Record<CoreLandmarkName, { x?: number; y?: number }>>): MotionFrame {
  const clone = structuredClone(frame);
  const player = clone.players[0];
  if (!player) throw new Error("fixture player missing");
  for (const landmark of player.coreLandmarks) {
    const change = changes[landmark.name];
    if (change?.x !== undefined) landmark.position.x = change.x;
    if (change?.y !== undefined) landmark.position.y = change.y;
  }
  return clone;
}

function hide(frame: MotionFrame, names: readonly CoreLandmarkName[]): MotionFrame {
  const clone = structuredClone(frame);
  const player = clone.players[0];
  if (!player) throw new Error("fixture player missing");
  for (const landmark of player.coreLandmarks) {
    if (names.includes(landmark.name)) landmark.observed = false;
  }
  return clone;
}

function calibrated(engine: ActionEngine): number {
  for (let sequence = 0; sequence < 30; sequence += 1) engine.enrich(syntheticFrame(sequence, sequence * 20));
  engine.join();
  return 1_000;
}

describe("ActionEngine", () => {
  it("advertises both action profiles on every enriched frame", () => {
    const engine = new ActionEngine();
    const enriched = engine.enrich({ ...syntheticFrame(1, 0), players: [] });
    expect(enriched.capabilities.profiles).toEqual([
      "body.core17",
      "actions.obstacle.v1",
      "actions.shell.v1",
    ]);
  });

  it("recognizes a mirrored screen-left dodge once until the release threshold rearms it", () => {
    const engine = new ActionEngine();
    const now = calibrated(engine);
    const base = syntheticFrame(31, now);
    const shifted = alter(base, {
      left_hip: { x: 0.66 },
      right_hip: { x: 0.76 },
    });
    expect(engine.enrich(shifted, "game").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "dodge_left", phase: "triggered" }),
    ]);
    expect(engine.enrich(alter(shifted, {}), "game").players[0]?.actions).toEqual([]);
    engine.enrich(syntheticFrame(32, now + 800), "game");
    expect(engine.enrich(alter(syntheticFrame(33, now + 1_500), {
      left_hip: { x: 0.66 },
      right_hip: { x: 0.76 },
    }), "game").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "dodge_left", phase: "triggered" }),
    ]);
  });

  it("publishes a complete sustained join lifecycle with one trigger", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    const first = engine.enrich(alter(syntheticFrame(1, 0), hands));
    const held = engine.enrich(alter(syntheticFrame(2, 500), hands));
    const stillHeld = engine.enrich(alter(syntheticFrame(3, 1_200), hands));
    const released = engine.enrich(syntheticFrame(4, 1_300));
    expect(first.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started", durationMs: 0 }),
    ]);
    expect(held.players[0]?.actions.map((action) => action.phase)).toEqual(["held", "triggered"]);
    expect(stillHeld.players[0]?.actions.map((action) => action.phase)).toEqual(["held"]);
    expect(released.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "ended" }),
    ]);
    expect(held.players[0]?.state).toBe("joined");
  });

  it("requires a release after explicit leave before accepting a fresh join", () => {
    const engine = new ActionEngine();
    const hands = {
      left_wrist: { x: 0.49, y: 0.45 },
      right_wrist: { x: 0.51, y: 0.45 },
    };
    engine.join();
    engine.leave();

    expect(
      engine.enrich(alter(syntheticFrame(1, 100), hands)).players[0],
    ).toMatchObject({ state: "candidate", actions: [] });
    expect(
      engine.enrich(alter(syntheticFrame(2, 700), hands)).players[0]
        ?.actions,
    ).toEqual([]);
    expect(engine.enrich(syntheticFrame(3, 800)).players[0]?.actions).toEqual(
      [],
    );
    expect(
      engine.enrich(alter(syntheticFrame(4, 900), hands)).players[0]
        ?.actions,
    ).toEqual([
      expect.objectContaining({
        name: "player_join",
        phase: "started",
      }),
    ]);
    expect(
      engine.enrich(alter(syntheticFrame(5, 1_350), hands)).players[0],
    ).toMatchObject({
      state: "joined",
      actions: [
        expect.objectContaining({
          name: "player_join",
          phase: "held",
        }),
        expect.objectContaining({
          name: "player_join",
          phase: "triggered",
        }),
      ],
    });
  });

  it("does not invent actions before a standing baseline exists", () => {
    const engine = new ActionEngine();
    const early = alter(syntheticFrame(1, 100), { left_hip: { x: 0.8 }, right_hip: { x: 0.9 } });
    expect(engine.enrich(early).players[0]?.actions).toEqual([]);
  });

  it("suppresses actions and clears hold continuity while tracker health is degraded", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    expect(engine.enrich(alter(syntheticFrame(1, 0), hands)).players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started" }),
    ]);

    const degraded = alter(syntheticFrame(2, 500), hands);
    degraded.health = "degraded";
    expect(engine.enrich(degraded).players[0]?.actions).toEqual([]);
    expect(engine.enrich(alter(syntheticFrame(3, 1_000), hands)).players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started" }),
    ]);
  });

  it("does not fire shell Back before a longer in-game pause hold completes", () => {
    const engine = new ActionEngine();
    const crossed = {
      left_wrist: { x: 0.7, y: 0.45 },
      right_wrist: { x: 0.3, y: 0.45 },
    };
    engine.enrich(alter(syntheticFrame(1, 100), crossed), "game");
    expect(engine.enrich(alter(syntheticFrame(2, 850), crossed), "game").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "pause", phase: "held" }),
    ]);
    expect(engine.enrich(alter(syntheticFrame(3, 1_250), crossed), "game").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "pause", phase: "held" }),
      expect.objectContaining({ name: "pause", phase: "triggered" }),
    ]);
  });

  it("context-gates game actions and shell selection progress", () => {
    const engine = new ActionEngine();
    const now = calibrated(engine);
    const shifted = alter(syntheticFrame(31, now), {
      left_hip: { x: 0.66 },
      right_hip: { x: 0.76 },
    });
    expect(engine.enrich(shifted, "shell").players[0]?.actions).toEqual([]);

    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    expect(engine.enrich(alter(syntheticFrame(32, now + 100), hands), "game").players[0]?.actions).toEqual([]);
    expect(engine.enrich(alter(syntheticFrame(33, now + 200), hands), "overlay").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "menu_select", phase: "started" }),
    ]);
  });

  it("fires the shorter crossed-arm hold as Back in shell context", () => {
    const engine = new ActionEngine();
    const crossed = {
      left_wrist: { x: 0.7, y: 0.45 },
      right_wrist: { x: 0.3, y: 0.45 },
    };
    engine.enrich(alter(syntheticFrame(1, 100), crossed), "shell");
    expect(engine.enrich(alter(syntheticFrame(2, 800), crossed), "shell").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "menu_back", phase: "held" }),
      expect.objectContaining({ name: "menu_back", phase: "triggered" }),
    ]);
  });

  it("restarts hold timing after the player disappears without fabricating a delayed cancellation", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 0), hands));
    engine.enrich({ ...syntheticFrame(2, 500), players: [] });
    const returned = engine.enrich(alter(syntheticFrame(3, 1_000), hands));
    const heldAgain = engine.enrich(alter(syntheticFrame(4, 1_451), hands));

    expect(returned.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started" }),
    ]);
    expect(heldAgain.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "held" }),
      expect.objectContaining({ name: "player_join", phase: "triggered" }),
    ]);
  });

  it("keeps an unrelated hands hold running when an ankle disappears", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 0), hands));
    const incomplete = hide(alter(syntheticFrame(2, 500), hands), ["left_ankle"]);
    const continued = engine.enrich(incomplete);

    expect(continued.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "held" }),
      expect.objectContaining({ name: "player_join", phase: "triggered" }),
    ]);
  });

  it("cancels and restarts a hands hold when a required wrist disappears", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 0), hands));
    const incomplete = hide(alter(syntheticFrame(2, 300), hands), ["left_wrist"]);
    const cancelled = engine.enrich(incomplete);
    const returned = engine.enrich(alter(syntheticFrame(3, 1_000), hands));

    expect(cancelled.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "cancelled", confidence: 0 }),
    ]);
    expect(returned.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started" }),
    ]);
  });

  it("keeps dodge available when an ankle required only by jump disappears", () => {
    const engine = new ActionEngine();
    const now = calibrated(engine);
    const shifted = hide(
      alter(syntheticFrame(31, now), {
        left_hip: { x: 0.66 },
        right_hip: { x: 0.76 },
      }),
      ["left_ankle"],
    );

    expect(engine.enrich(shifted, "game").players[0]?.actions).toEqual([
      expect.objectContaining({ name: "dodge_left", phase: "triggered" }),
    ]);
  });

  it("cancels a context-specific hold before starting the replacement timer", () => {
    const engine = new ActionEngine();
    const crossed = {
      left_wrist: { x: 0.7, y: 0.45 },
      right_wrist: { x: 0.3, y: 0.45 },
    };
    engine.enrich(alter(syntheticFrame(1, 100), crossed), "game");
    const changed = engine.enrich(alter(syntheticFrame(2, 700), crossed), "shell");
    const completed = engine.enrich(alter(syntheticFrame(3, 1_400), crossed), "shell");

    expect(changed.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "pause", phase: "cancelled" }),
      expect.objectContaining({ name: "menu_back", phase: "started" }),
    ]);
    expect(completed.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "menu_back", phase: "held" }),
      expect.objectContaining({ name: "menu_back", phase: "triggered" }),
    ]);
  });

  it("fails closed into a new candidate epoch when frame time regresses", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 1_000), hands));
    const restarted = engine.enrich(alter(syntheticFrame(2, 100), hands));

    expect(restarted.players[0]?.state).toBe("candidate");
    expect(restarted.players[0]?.actions).toEqual([
      expect.objectContaining({ name: "player_join", phase: "started", durationMs: 0 }),
    ]);
  });
});
