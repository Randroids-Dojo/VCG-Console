import { describe, expect, it } from "vitest";
import { activeActions, type GamepadSnapshot } from "./gamepad-router";

function gamepad(buttons: number[] = [], axes: number[] = [0, 0]): GamepadSnapshot {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 })),
  };
}

describe("activeActions", () => {
  it("maps standard face, Back, Home, and pause buttons semantically", () => {
    expect([...activeActions(gamepad([0, 1, 9, 16]))]).toEqual(["select", "back", "home", "pause"]);
  });

  it("accepts both d-pad and analog navigation with a dead zone", () => {
    expect(activeActions(gamepad([14]))).toContain("left");
    expect(activeActions(gamepad([], [0.8, -0.7]))).toEqual(new Set(["right", "up"]));
    expect(activeActions(gamepad([], [0.3, -0.2]))).toEqual(new Set());
  });
});
