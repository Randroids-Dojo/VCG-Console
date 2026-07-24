import { MotionPoseSimulator } from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import { ActionEngine } from "./action-engine";

function calibratedEngine(context: "shell" | "game" = "shell") {
  const engine = new ActionEngine();
  const simulator = new MotionPoseSimulator();
  for (let sequence = 0; sequence < 24; sequence += 1) {
    engine.enrich(simulator.frame(sequence, sequence * 20), context);
  }
  return { engine, simulator };
}

describe("camera-free pose simulator integration", () => {
  it.each([
    ["dodge-left", "dodge_left"],
    ["dodge-right", "dodge_right"],
    ["duck", "duck"],
    ["jump", "jump"],
  ] as const)("drives the %s obstacle recognizer", (pose, action) => {
    const { engine, simulator } = calibratedEngine("game");
    engine.join();
    simulator.setPose(pose);

    const frame = engine.enrich(simulator.frame(24, 600), "game");

    expect(frame.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: action, phase: "triggered" }),
    );
  });

  it("holds hands to join/select and crossed arms to go back", () => {
    const { engine, simulator } = calibratedEngine();
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(24, 600));
    const joined = engine.enrich(simulator.frame(25, 1_100));
    expect(joined.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "player_join", phase: "triggered" }),
    );

    simulator.setPose("neutral");
    engine.enrich(simulator.frame(26, 1_120));
    simulator.setPose("hands-together");
    engine.enrich(simulator.frame(27, 1_200));
    const selected = engine.enrich(simulator.frame(28, 1_700));
    expect(selected.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_select", phase: "triggered" }),
    );

    simulator.setPose("neutral");
    engine.enrich(simulator.frame(29, 1_720));
    simulator.setPose("crossed-arms");
    engine.enrich(simulator.frame(30, 1_800));
    const backed = engine.enrich(simulator.frame(31, 2_500));
    expect(backed.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_back", phase: "triggered" }),
    );
  });

  it("drives temporal swipe hooks and explicit tracking loss", () => {
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));
    simulator.setPose("swipe-left");
    const swiped = engine.enrich(simulator.frame(25, 620));
    expect(swiped.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_left", phase: "triggered" }),
    );

    simulator.setPlayerVisible(false);
    expect(engine.enrich(simulator.frame(26, 640)).players).toEqual([]);
    simulator.setPlayerVisible(true);
    expect(engine.enrich(simulator.frame(27, 660)).players[0]?.id).toBe("simulator-player-1");
  });
});
