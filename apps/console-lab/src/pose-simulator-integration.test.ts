import { MotionPoseSimulator, type MotionFrame } from "@vcg/motion-contract";
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

  it("drives menu gestures from where a raised hand sits", () => {
    const { engine, simulator } = calibratedEngine();
    engine.join();

    // A hand at your side is not playing, and arriving straight into a zone
    // does not count: a gesture is the step out of the home position.
    simulator.setPose("swipe-left");
    const arrived = engine.enrich(simulator.frame(24, 600));
    expect(arrived.players[0]?.actions).toEqual([]);

    simulator.setPose("neutral");
    engine.enrich(simulator.frame(25, 620));
    simulator.setPose("swipe-left");
    const left = engine.enrich(simulator.frame(26, 640));
    expect(left.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_left", phase: "triggered" }),
    );

    // Coming back to straight up is a return, never the opposite gesture.
    simulator.setPose("neutral");
    const back = engine.enrich(simulator.frame(27, 660));
    expect(back.players[0]?.actions).not.toContainEqual(
      expect.objectContaining({ name: "menu_swipe_right" }),
    );

    // Away from the body with the same arm is the other direction.
    simulator.setPose("swipe-right");
    const right = engine.enrich(simulator.frame(28, 680));
    expect(right.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_right", phase: "triggered" }),
    );
  });

  it("moves focus up and down from the other arm", () => {
    // Both axes are the same comfortable movement; the arm carrying it picks
    // the axis, so nothing has to be held above a shoulder.
    const { engine, simulator } = calibratedEngine();
    engine.join();
    simulator.setPose("neutral");
    engine.enrich(simulator.frame(24, 600));

    simulator.setPose("swipe-up");
    const up = engine.enrich(simulator.frame(25, 620));
    expect(up.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_up", phase: "triggered" }),
    );

    simulator.setPose("neutral");
    const back = engine.enrich(simulator.frame(26, 640));
    expect(back.players[0]?.actions).not.toContainEqual(
      expect.objectContaining({ name: "menu_swipe_down" }),
    );

    simulator.setPose("swipe-down");
    const down = engine.enrich(simulator.frame(27, 660));
    expect(down.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_down", phase: "triggered" }),
    );
  });

  it.each([
    ["swipe-left", "menu_swipe_left"],
    ["swipe-right", "menu_swipe_right"],
    ["swipe-up", "menu_swipe_up"],
    ["swipe-down", "menu_swipe_down"],
  ] as const)(
    "maps %s to %s",
    (moved, action) => {
      // The right arm carries left and right, the left arm carries up and
      // down, and each is one step out of arms hanging at rest.
      const { engine, simulator } = calibratedEngine();
      engine.join();
      engine.enrich(simulator.frame(24, 600));

      simulator.setPose(moved);
      const frame = engine.enrich(simulator.frame(25, 620));

      expect(frame.players[0]?.actions).toContainEqual(
        expect.objectContaining({ name: action, phase: "triggered" }),
      );
    },
  );

  it("keeps holding both hands together from reading as a direction", () => {
    // Select brings both hands together in front of the body. A direction is a
    // hand out to the side or up at the head, so the two can never overlap --
    // but only because Select is checked first.
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));

    simulator.setPose("hands-together");
    let now = 620;
    for (let sequence = 25; sequence < 45; sequence += 1) {
      const frame = engine.enrich(simulator.frame(sequence, now));
      for (const action of frame.players[0]?.actions ?? []) {
        expect(action.name).not.toMatch(/^menu_swipe_/u);
      }
      now += 40;
    }
  });

  it("treats both hands out as its own posture, not a direction", () => {
    // Holding both arms wide is how a player asks what the gestures are. If it
    // resolved to a direction, asking for help would move the focus instead.
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));

    simulator.setPose("both-hands-out");
    const frame = engine.enrich(simulator.frame(25, 620));

    expect(engine.sweep.zone).toBe("both");
    for (const name of ["menu_swipe_left", "menu_swipe_right", "menu_swipe_up", "menu_swipe_down"]) {
      expect(frame.players[0]?.actions).not.toContainEqual(
        expect.objectContaining({ name }),
      );
    }
  });

  it("holds a gesture until the hand comes home, however long it is held", () => {
    const { engine, simulator } = calibratedEngine();
    engine.join();
    simulator.setPose("neutral");
    engine.enrich(simulator.frame(24, 600));
    simulator.setPose("swipe-left");
    engine.enrich(simulator.frame(25, 620));

    // Resting out there is not a stream of gestures. It is one gesture, held.
    let now = 640;
    for (let sequence = 26; sequence < 70; sequence += 1) {
      const frame = engine.enrich(simulator.frame(sequence, now));
      expect(frame.players[0]?.actions).toEqual([]);
      now += 40;
    }
  });

  it("asks for the same movement from a body the camera sees as smaller", () => {
    // Zones are measured in shoulder widths, so a player standing further from
    // the camera makes the same movement rather than a proportionally larger
    // one.
    const shrink = (frame: MotionFrame, scale: number): MotionFrame => ({
      ...frame,
      players: frame.players.map((player) => ({
        ...player,
        coreLandmarks: player.coreLandmarks.map((landmark) => ({
          ...landmark,
          position: {
            x: 0.5 + (landmark.position.x - 0.5) * scale,
            y: 0.5 + (landmark.position.y - 0.5) * scale,
          },
        })),
      })),
    });

    const engine = new ActionEngine();
    const simulator = new MotionPoseSimulator();
    for (let sequence = 0; sequence < 24; sequence += 1) {
      engine.enrich(shrink(simulator.frame(sequence, sequence * 20), 0.5));
    }
    engine.join();
    simulator.setPose("neutral");
    engine.enrich(shrink(simulator.frame(24, 600), 0.5));
    simulator.setPose("swipe-left");
    const swept = engine.enrich(shrink(simulator.frame(25, 620), 0.5));

    expect(swept.players[0]?.actions).toContainEqual(
      expect.objectContaining({ name: "menu_swipe_left", phase: "triggered" }),
    );
  });

  it("reads arms at rest the same way in a mirrored frame", () => {
    // A real camera frame may carry the body either way round, so the same
    // resting pose must mean the same thing mirrored. Reading image sides as
    // fixed made hanging arms satisfy the crossing test forever, firing Back
    // continuously on the device while every simulator test passed.
    const { engine, simulator } = calibratedEngine();
    engine.join();
    const mirror = (frame: MotionFrame): MotionFrame => ({
      ...frame,
      players: frame.players.map((player) => ({
        ...player,
        coreLandmarks: player.coreLandmarks.map((landmark) => ({
          ...landmark,
          position: { x: 1 - landmark.position.x, y: landmark.position.y },
        })),
      })),
    });

    let now = 600;
    for (let sequence = 24; sequence < 70; sequence += 1) {
      const frame = engine.enrich(mirror(simulator.frame(sequence, now)));
      for (const action of frame.players[0]?.actions ?? []) {
        expect(action.name).not.toBe("menu_back");
      }
      now += 40;
    }
  });

  it("does not read a one-armed sweep as folded arms", () => {
    // Sweeping carries one hand across the body above a shoulder. Holding it
    // there used to satisfy the crossing test and fire Back, which made the
    // shell unusable while navigating by motion.
    const { engine, simulator } = calibratedEngine();
    engine.join();
    engine.enrich(simulator.frame(24, 600));

    simulator.setPose("swipe-left");
    let now = 620;
    for (let sequence = 25; sequence < 60; sequence += 1) {
      const frame = engine.enrich(simulator.frame(sequence, now));
      for (const action of frame.players[0]?.actions ?? []) {
        expect(action.name).not.toBe("menu_back");
      }
      now += 40;
    }
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
