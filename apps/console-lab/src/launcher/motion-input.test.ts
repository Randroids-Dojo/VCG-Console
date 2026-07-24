import { describe, expect, it } from "vitest";
import { launcherInputForMotionAction } from "./motion-input";

describe("launcherInputForMotionAction", () => {
  it("routes triggered shell navigation through the controller-safe vocabulary", () => {
    expect(
      launcherInputForMotionAction({
        name: "menu_swipe_left",
        phase: "triggered",
      }),
    ).toBe("left");
    expect(
      launcherInputForMotionAction({
        name: "menu_swipe_right",
        phase: "triggered",
      }),
    ).toBe("right");
    expect(
      launcherInputForMotionAction({
        name: "menu_select",
        phase: "triggered",
      }),
    ).toBe("select");
    expect(
      launcherInputForMotionAction({
        name: "menu_back",
        phase: "triggered",
      }),
    ).toBe("back");
  });

  it("ignores lifecycle phases and non-shell game actions", () => {
    expect(
      launcherInputForMotionAction({
        name: "menu_select",
        phase: "held",
      }),
    ).toBeUndefined();
    expect(
      launcherInputForMotionAction({
        name: "jump",
        phase: "triggered",
      }),
    ).toBeUndefined();
    expect(
      launcherInputForMotionAction({
        name: "pause",
        phase: "triggered",
      }),
    ).toBeUndefined();
  });
});
