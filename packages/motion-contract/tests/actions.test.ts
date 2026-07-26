import { describe, expect, it } from "vitest";
import {
  actionBelongsToProfile,
  MOTION_ACTION_PHASE_PRIORITY,
  MOTION_ACTION_PHASES,
  MOTION_ACTION_NAMES,
  MOTION_ACTION_PRIORITY,
  MotionActionSchema,
  sortMotionActions,
  type MotionAction,
} from "../src";

function action(name: MotionAction["name"], phase: MotionAction["phase"], occurredAtMs = 100): MotionAction {
  return { name, phase, confidence: 0.8, occurredAtMs };
}

describe("standardized action semantics", () => {
  it("accepts explicit cancellation as a non-triggering lifecycle phase", () => {
    const cancelled = {
      ...action("menu_select", "cancelled"),
      confidence: 0,
      durationMs: 200,
    };
    expect(MotionActionSchema.parse(cancelled)).toEqual(cancelled);
    expect(MotionActionSchema.safeParse(action("menu_select", "cancelled")).success).toBe(false);
    expect(MotionActionSchema.safeParse(action("menu_select", "started")).success).toBe(false);
    expect(
      MotionActionSchema.safeParse({ ...action("menu_select", "started"), durationMs: 0 }).success,
    ).toBe(true);
    expect(
      MotionActionSchema.safeParse({ ...action("jump", "started"), durationMs: 0 }).success,
    ).toBe(false);
    expect(
      MotionActionSchema.safeParse({
        ...action("menu_select", "triggered"),
        durationMs: 450,
      }).success,
    ).toBe(true);
    expect(MotionActionSchema.safeParse(action("menu_select", "triggered")).success).toBe(false);
    expect(
      MotionActionSchema.safeParse({ ...action("jump", "triggered"), durationMs: 1 }).success,
    ).toBe(false);
  });

  it("owns every action in exactly one negotiated profile", () => {
    for (const name of MOTION_ACTION_NAMES) {
      const memberships = [
        actionBelongsToProfile(name, "actions.obstacle.v1"),
        actionBelongsToProfile(name, "actions.shell.v1"),
      ].filter(Boolean);
      expect(memberships, name).toHaveLength(1);
    }
    expect([...MOTION_ACTION_PRIORITY].sort()).toEqual([...MOTION_ACTION_NAMES].sort());
    expect([...MOTION_ACTION_PHASE_PRIORITY].sort()).toEqual([...MOTION_ACTION_PHASES].sort());
  });

  it("sorts closure before progress and privileged triggers before gameplay triggers", () => {
    expect(
      sortMotionActions([
        action("jump", "triggered"),
        action("menu_select", "held"),
        action("menu_back", "triggered"),
        action("pause", "cancelled"),
        action("menu_select", "started"),
        action("player_join", "ended"),
      ]).map(({ name, phase }) => `${name}:${phase}`),
    ).toEqual([
      "pause:cancelled",
      "player_join:ended",
      "menu_select:started",
      "menu_select:held",
      "menu_back:triggered",
      "jump:triggered",
    ]);
  });

  it("orders earlier event timestamps before within-frame priority", () => {
    expect(
      sortMotionActions([
        action("pause", "triggered", 200),
        action("jump", "triggered", 100),
      ]).map(({ name }) => name),
    ).toEqual(["jump", "pause"]);
  });
});
