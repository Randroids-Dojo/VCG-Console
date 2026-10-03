import { describe, expect, it } from "vitest";
import type { MotionAction } from "@vcg/motion-contract";
import { GestureReadout } from "./gesture-readout";

function action(phase: MotionAction["phase"], durationMs = 0): MotionAction {
  return { name: "player_join", phase, durationMs, confidence: 0.9, occurredAtMs: durationMs };
}

describe("gesture readout", () => {
  it("shows hold progress and preserves a completed gesture through held and release frames", () => {
    const feedback = new GestureReadout();
    feedback.observe(action("held", 225), "one", "Pair", 225);
    expect(feedback.snapshot(225).current).toBe("Hands together · Hold 50%");
    feedback.observe(action("triggered", 450), "one", "Pair", 450);
    feedback.result("Player 1 paired");
    feedback.observe(action("held", 500), "one", "Pair", 500);
    feedback.observe(action("ended", 600), "one", "Pair", 600);
    expect(feedback.snapshot(700)).toEqual({ current: "Hands together · Seen", last: "Player 1 paired" });
    expect(feedback.snapshot(2100)).toEqual({ last: "Player 1 paired" });
    feedback.observe(action("started"), "one", "Select", 2200);
    expect(feedback.snapshot(2200).current).toBe("Hands together · Hold 0%");
  });

  it("shows a cancelled hold and distinguishes recognition from a rejected action", () => {
    const feedback = new GestureReadout();
    feedback.observe(action("cancelled", 200), "one", "Pair", 200);
    expect(feedback.snapshot(200).current).toBe("Hands together · Released too soon");
    feedback.observe(action("triggered", 450), "two", "Seen, but this player does not have control", 800);
    expect(feedback.snapshot(800).last).toContain("does not have control");
    feedback.reset();
    expect(feedback.snapshot(800)).toEqual({ last: "No gesture completed yet." });
  });
});
