import { describe, expect, it } from "vitest";
import { assessPlayerControlAvailability, MotionFrameSchema } from "@vcg/motion-contract";
import { applyBodyVisibilityFixture } from "./body-visibility-fixture";
import { syntheticFrame } from "./synthetic";

describe("body visibility fixtures", () => {
  it("leaves full replay frames unchanged", () => {
    const frame = syntheticFrame(1, 100);
    expect(applyBodyVisibilityFixture(frame, "full")).toBe(frame);
  });

  it("creates a schema-valid legs case that suppresses only jump", () => {
    const frame = MotionFrameSchema.parse(
      applyBodyVisibilityFixture(syntheticFrame(1, 100), "legs"),
    );
    const availability = assessPlayerControlAvailability(frame.players[0], frame.health);
    expect(availability).toMatchObject({
      state: "partial",
      regions: { leftLeg: "partial", rightLeg: "partial" },
      controls: {
        menuSelect: true,
        menuBackPause: true,
        menuSwipe: true,
        gameDodge: true,
        gameDuck: true,
        gameJump: false,
      },
    });
  });

  it("creates an unavailable half-body case without removing required landmarks", () => {
    const frame = MotionFrameSchema.parse(
      applyBodyVisibilityFixture(syntheticFrame(1, 100), "half-body"),
    );
    const availability = assessPlayerControlAvailability(frame.players[0], frame.health);
    expect(availability.state).toBe("unavailable");
    expect(availability.regions).toMatchObject({
      leftArm: "missing",
      leftLeg: "missing",
      rightArm: "observed",
      rightLeg: "observed",
    });
    expect(frame.players[0]?.coreLandmarks).toHaveLength(17);
  });
});
