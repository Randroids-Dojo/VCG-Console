import { MotionPoseSimulator } from "@vcg/motion-contract";
import { describe, expect, it } from "vitest";
import { ActionEngine } from "./action-engine";
import { PlayerSessionController } from "./player-session";

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

  it("drives vertical menu sweeps with a raised hand", () => {
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));

    // Raising the hand is how the sweep begins, so it is not itself a sweep.
    simulator.setPose("swipe-down");
    const raising = engine.enrich(simulator.frame(25, 620));
    expect(raising.players[0]?.actions).not.toContainEqual(
      expect.objectContaining({ name: "menu_swipe_up" }),
    );

    simulator.setPose("swipe-up");
    const up = engine.enrich(simulator.frame(26, 640));
    expect(up.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_up", phase: "triggered" }),
    );
    expect(up.players[0]?.actions).not.toContainEqual(
      expect.objectContaining({ name: "menu_swipe_left" }),
    );

    // Sweeping back down from the raised position is the opposite gesture.
    simulator.setPose("swipe-down");
    const down = engine.enrich(simulator.frame(27, 660));
    expect(down.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_down", phase: "triggered" }),
    );
  });

  it("keeps jumping in the shell from reading as a vertical menu sweep", () => {
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));

    // A jump moves the whole body, wrists included, but leaves them below the
    // shoulders, which is what separates it from a raised-hand sweep.
    simulator.setPose("jump");
    const jumped = engine.enrich(simulator.frame(25, 620));
    for (const name of ["menu_swipe_up", "menu_swipe_down"]) {
      expect(jumped.players[0]?.actions).not.toContainEqual(
        expect.objectContaining({ name }),
      );
    }
  });

  it("denies reordered candidates and strips non-local upstream action claims", () => {
    const { engine, simulator } = calibratedEngine("game");
    const session = new PlayerSessionController();
    const initial = simulator.frame(24, 600);
    const activeTrack = initial.players[0]!.id;
    session.observe(initial.publishedAtMs, [activeTrack]);
    session.join(activeTrack);
    engine.join();

    simulator.setPose("dodge-right");
    const base = simulator.frame(25, 800);
    const candidate = base.players[0]!;
    const reordered = engine.enrich({
      ...base,
      players: [
        {
          ...candidate,
          id: "spectator-track",
          actions: [],
        },
        {
          ...candidate,
          id: activeTrack,
          actions: [{
            name: "jump",
            phase: "triggered",
            confidence: 0.9,
            occurredAtMs: 800,
          }],
        },
      ],
    }, "game");
    session.observe(
      reordered.publishedAtMs,
      reordered.players.map(({ id }) => id),
    );

    expect(reordered.players[0]?.actions).toContainEqual(
      expect.objectContaining({
        name: "dodge_right",
        phase: "triggered",
      }),
    );
    const authorized = reordered.players.flatMap((player) =>
      player.actions.flatMap((action) =>
        session.authorizeGameplayAction(player.id) === undefined
          ? []
          : [{ trackId: player.id, action: action.name }],
      ),
    );
    expect(reordered.players[1]?.actions).toEqual([]);
    expect(session.authorizeGameplayAction(activeTrack)).toBeDefined();
    expect(authorized).toEqual([]);
  });
});
