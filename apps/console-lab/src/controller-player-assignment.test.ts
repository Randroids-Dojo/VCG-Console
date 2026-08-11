import { describe, expect, it } from "vitest";
import { ControllerPlayerAssignments } from "./controller-player-assignment";

function controller(
  index: number,
  id: string,
  mapping: GamepadMappingType = "standard",
): Pick<Gamepad, "id" | "index" | "mapping"> {
  return { index, id, mapping };
}

describe("ControllerPlayerAssignments", () => {
  it("assigns the first two supported controllers to separate player slots", () => {
    const assignments = new ControllerPlayerAssignments();

    expect(assignments.connect(controller(4, "first"))).toMatchObject({ state: "assigned", slot: 1 });
    expect(assignments.connect(controller(1, "second"))).toMatchObject({ state: "assigned", slot: 2 });
    expect(assignments.snapshot()).toEqual([
      { browserIndex: 1, state: "assigned", slot: 2 },
      { browserIndex: 4, state: "assigned", slot: 1 },
    ]);
  });

  it("recovers an unambiguous player slot when a controller reconnects at a new browser index", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0, "player-one"));
    assignments.connect(controller(1, "player-two"));
    expect(assignments.disconnect(controller(0, "player-one"))).toMatchObject({ slot: 1 });

    expect(assignments.connect(controller(7, "player-one"))).toMatchObject({ state: "assigned", slot: 1 });
    expect(assignments.slotForIndex(1)).toBe(2);
  });

  it("promotes a waiting controller when an assigned controller disconnects", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0, "one"));
    assignments.connect(controller(1, "two"));
    expect(assignments.connect(controller(2, "three"))).toMatchObject({ state: "waiting" });

    assignments.disconnect(controller(1, "two"));

    expect(assignments.slotForIndex(2)).toBe(2);
  });

  it("keeps unsupported layouts visible without granting player authority", () => {
    const assignments = new ControllerPlayerAssignments();

    expect(assignments.connect(controller(0, "unknown", ""))).toEqual({
      browserIndex: 0,
      state: "unsupported",
    });
    expect(assignments.slotForIndex(0)).toBeUndefined();
  });

  it("does not expose browser device identity in public snapshots", () => {
    const assignments = new ControllerPlayerAssignments();
    assignments.connect(controller(0, "private-device-identity"));

    expect(JSON.stringify(assignments.snapshot())).not.toContain("private-device-identity");
  });
});
