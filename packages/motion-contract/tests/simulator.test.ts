import { describe, expect, it } from "vitest";
import {
  MOTION_SIMULATOR_POSES,
  MotionFrameSchema,
  MotionPoseSimulator,
} from "../src";

describe("MotionPoseSimulator", () => {
  it("emits deterministic schema-valid landmark-only frames for every pose", () => {
    for (const pose of MOTION_SIMULATOR_POSES) {
      const simulator = new MotionPoseSimulator();
      simulator.setPose(pose);
      const first = simulator.frame(7, 123);
      const second = simulator.frame(7, 123);

      expect(first).toEqual(second);
      expect(MotionFrameSchema.safeParse(first).success).toBe(true);
      expect(first.source).toBe("synthetic");
      expect(first.players[0]?.actions).toEqual([]);
      expect(simulator.snapshot).toEqual({ pose, playerVisible: true });
    }
  });

  it("can hide, reacquire, and reset the simulated player without changing identity", () => {
    const simulator = new MotionPoseSimulator({ playerId: "test-player" });
    simulator.setPose("duck");
    simulator.setPlayerVisible(false);
    expect(simulator.frame(0, 0).players).toEqual([]);

    simulator.setPlayerVisible(true);
    expect(simulator.frame(1, 20).players[0]?.id).toBe("test-player");
    expect(simulator.snapshot.pose).toBe("duck");

    simulator.reset();
    expect(simulator.snapshot).toEqual({ pose: "neutral", playerVisible: true });
  });

  it("rejects invalid constructor and frame inputs", () => {
    expect(() => new MotionPoseSimulator({ playerId: "" })).toThrow(/playerId/);
    expect(() => new MotionPoseSimulator({ playerConfidence: 2 })).toThrow(/playerConfidence/);
    const simulator = new MotionPoseSimulator();
    expect(() => simulator.setPose("spin" as never)).toThrow(/unknown simulator pose/);
    expect(() => simulator.apply({ type: "unknown" } as never)).toThrow(/unknown simulator command/);
    expect(() => simulator.frame(-1, 0)).toThrow(/sequence/);
    expect(() => simulator.frame(0, Number.NaN)).toThrow(/nowMs/);
  });
});
