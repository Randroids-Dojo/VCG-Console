import { describe, expect, it } from "vitest";
import { ControllerPlayerAssignments } from "./controller-player-assignment";

function controller(
  index: number,
  mapping: GamepadMappingType = "standard",
): Pick<Gamepad, "index" | "mapping"> {
  return { index, mapping };
}

describe("ControllerPlayerAssignments", () => {
  it("assigns the first two supported controllers to separate player slots", () => {
    const assignments = new ControllerPlayerAssignments();

    expect(assignments.connect(controller(4))).toMatchObject({ state: "assigned", slot: 1 });
    expect(assignments.connect(controller(1))).toMatchObject({ state: "assigned", slot: 2 });
    expect(assignments.snapshot()).toEqual([
      { browserIndex: 1, state: "assigned", slot: 2 },
      { browserIndex: 4, state: "assigned", slot: 1 },
    ]);
  });

  it("requires an intentional claim after reconnect because product labels are not device identities", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0));
    assignments.connect(controller(1));
    expect(assignments.disconnect(controller(0))).toMatchObject({ slot: 1 });

    expect(assignments.connect(controller(7))).toMatchObject({ state: "claim-required" });
    expect(assignments.slotForIndex(7)).toBeUndefined();
    expect(assignments.claimAvailableSlot(7)).toBe(1);
    expect(assignments.slotForIndex(1)).toBe(2);
  });

  it("does not let a waiting same-model controller silently consume a released slot", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0));
    assignments.connect(controller(1));
    expect(assignments.connect(controller(2))).toMatchObject({ state: "waiting" });

    assignments.disconnect(controller(1));

    expect(assignments.snapshot()).toContainEqual({ browserIndex: 2, state: "claim-required" });
    expect(assignments.slotForIndex(2)).toBeUndefined();
    expect(assignments.claimAvailableSlot(2)).toBe(2);
  });

  it("keeps unsupported layouts visible without granting player authority", () => {
    const assignments = new ControllerPlayerAssignments();

    expect(assignments.connect(controller(0, ""))).toEqual({
      browserIndex: 0,
      state: "unsupported",
    });
    expect(assignments.slotForIndex(0)).toBeUndefined();
  });

  it("does not accept or expose a browser product label as reconnect authority", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0));

    expect(assignments.snapshot()).toEqual([{ browserIndex: 0, state: "assigned", slot: 1 }]);
  });
});
