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

function calibrated(engine: ActionEngine): number {
  for (let sequence = 0; sequence < 30; sequence += 1) engine.enrich(syntheticFrame(sequence, sequence * 20));
  engine.join();
  return 1_000;
}

describe("ActionEngine", () => {
  it("recognizes a mirrored screen-left dodge after calibration", () => {
    const engine = new ActionEngine();
    const now = calibrated(engine);
    const base = syntheticFrame(31, now);
    const shifted = alter(base, {
      left_hip: { x: 0.66 },
      right_hip: { x: 0.76 },
    });
    expect(engine.enrich(shifted).players[0]?.actions.map((action) => action.name)).toContain("dodge_left");
  });

  it("requires a sustained hands-together gesture to join", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    const first = engine.enrich(alter(syntheticFrame(1, 0), hands));
    const held = engine.enrich(alter(syntheticFrame(2, 500), hands));
    expect(first.players[0]?.actions).toEqual([]);
    expect(held.players[0]?.actions.map((action) => action.name)).toContain("player_join");
    expect(held.players[0]?.state).toBe("joined");
  });

  it("does not invent actions before a standing baseline exists", () => {
    const engine = new ActionEngine();
    const early = alter(syntheticFrame(1, 100), { left_hip: { x: 0.8 }, right_hip: { x: 0.9 } });
    expect(engine.enrich(early).players[0]?.actions).toEqual([]);
  });

  it("does not fire shell Back before a longer in-game pause hold completes", () => {
    const engine = new ActionEngine();
    const crossed = {
      left_wrist: { x: 0.7, y: 0.45 },
      right_wrist: { x: 0.3, y: 0.45 },
    };
    engine.enrich(alter(syntheticFrame(1, 100), crossed), "game");
    expect(engine.enrich(alter(syntheticFrame(2, 850), crossed), "game").players[0]?.actions).toEqual([]);
    expect(engine.enrich(alter(syntheticFrame(3, 1_250), crossed), "game").players[0]?.actions.map((action) => action.name)).toEqual([
      "pause",
    ]);
  });

  it("fires the shorter crossed-arm hold as Back in shell context", () => {
    const engine = new ActionEngine();
    const crossed = {
      left_wrist: { x: 0.7, y: 0.45 },
      right_wrist: { x: 0.3, y: 0.45 },
    };
    engine.enrich(alter(syntheticFrame(1, 100), crossed), "shell");
    expect(engine.enrich(alter(syntheticFrame(2, 800), crossed), "shell").players[0]?.actions.map((action) => action.name)).toEqual([
      "menu_back",
    ]);
  });

  it("restarts hold timing after the player disappears", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 0), hands));
    engine.enrich({ ...syntheticFrame(2, 500), players: [] });
    const returned = engine.enrich(alter(syntheticFrame(3, 1_000), hands));
    const heldAgain = engine.enrich(alter(syntheticFrame(4, 1_451), hands));

    expect(returned.players[0]?.actions).toEqual([]);
    expect(heldAgain.players[0]?.actions.map((action) => action.name)).toContain("player_join");
  });

  it("restarts hold timing when required body measurements disappear", () => {
    const engine = new ActionEngine();
    const hands = { left_wrist: { x: 0.49, y: 0.45 }, right_wrist: { x: 0.51, y: 0.45 } };
    engine.enrich(alter(syntheticFrame(1, 0), hands));
    const incomplete = alter(syntheticFrame(2, 500), hands);
    const leftAnkle = incomplete.players[0]?.coreLandmarks.find((landmark) => landmark.name === "left_ankle");
    if (leftAnkle) leftAnkle.observed = false;
    engine.enrich(incomplete);
    const returned = engine.enrich(alter(syntheticFrame(3, 1_000), hands));

    expect(returned.players[0]?.actions).toEqual([]);
  });
});
