import { describe, expect, it } from "vitest";
import type { MotionAction } from "@vcg/motion-contract";
import { actionFeedback } from "./action-feedback";

function action(
  name: MotionAction["name"],
  phase: MotionAction["phase"],
  durationMs?: number,
): MotionAction {
  return {
    name,
    phase,
    confidence: phase === "cancelled" ? 0 : 0.9,
    occurredAtMs: 1_000,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

describe("actionFeedback", () => {
  it("uses the recognizer threshold for visible hold progress", () => {
    expect(actionFeedback(action("menu_back", "started", 0))).toEqual(
      expect.objectContaining({
        phase: "holding",
        phaseLabel: "Hold 0%",
        progress: 0,
      }),
    );
    expect(actionFeedback(action("menu_back", "held", 325))).toEqual(
      expect.objectContaining({
        phase: "holding",
        phaseLabel: "Hold 50%",
        progress: 0.5,
      }),
    );
  });

  it("distinguishes accepted, cancelled, and released sustained gestures", () => {
    expect(actionFeedback(action("pause", "triggered", 1_100))).toEqual(
      expect.objectContaining({
        phase: "accepted",
        phaseLabel: "Accepted",
        progress: 1,
      }),
    );
    expect(actionFeedback(action("pause", "cancelled", 500))).toEqual(
      expect.objectContaining({
        phase: "cancelled",
        phaseLabel: "Cancelled",
        progress: 0,
      }),
    );
    expect(actionFeedback(action("pause", "ended", 1_300))).toEqual(
      expect.objectContaining({
        phase: "released",
        phaseLabel: "Released",
        progress: 0,
      }),
    );
  });

  it("shows discrete triggers as accepted without inventing hold progress", () => {
    expect(actionFeedback(action("jump", "triggered"))).toEqual({
      action: "jump",
      actionLabel: "Jump",
      phase: "accepted",
      phaseLabel: "Accepted",
      detail: "Jump recognized.",
      progress: 1,
    });
  });
});
