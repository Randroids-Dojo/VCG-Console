import { describe, expect, it, vi } from "vitest";
import {
  CONTROLLER_REQUIRED_DETAIL,
  ControllerPresence,
  connectedControllerCount,
  libretroLaunchGate,
  type ControllerPresenceEnvironment,
} from "./controller-launch-gate";

function pad(): Gamepad {
  return {
    id: "Standard Gamepad (Vendor: 054c)",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 1,
    axes: [],
    buttons: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function padAt(index: number, overrides: Partial<Gamepad> = {}): Gamepad {
  return { ...pad(), index, ...overrides } as Gamepad;
}

describe("libretro controller gate", () => {
  it("refuses a launch while no controller is connected", () => {
    expect(libretroLaunchGate(0)).toEqual({
      allowed: false,
      detail: CONTROLLER_REQUIRED_DETAIL,
    });
    // The refusal has to tell the player both what to do and why, because the
    // appliance has no keyboard to fall back to.
    expect(CONTROLLER_REQUIRED_DETAIL).toMatch(/Connect a controller/);
  });

  it("allows a launch as soon as one controller is connected", () => {
    expect(libretroLaunchGate(1)).toEqual({ allowed: true });
    expect(libretroLaunchGate(4)).toEqual({ allowed: true });
  });

  it("treats an unusable count as no controller", () => {
    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(libretroLaunchGate(count).allowed).toBe(false);
    }
  });
});

describe("connected controller count", () => {
  it("counts one device per occupied slot", () => {
    expect(connectedControllerCount([])).toBe(0);
    expect(connectedControllerCount([null, null])).toBe(0);
    expect(connectedControllerCount([padAt(0), null, padAt(2)])).toBe(2);
  });

  it("counts a pad the browser cannot map to the standard layout", () => {
    // The libretro frontend maps devices itself, so excluding an unmapped pad
    // would refuse a launch the player can in fact control.
    expect(connectedControllerCount([padAt(0, { mapping: "" as GamepadMappingType })])).toBe(1);
  });

  it("ignores a disconnected, nameless, or duplicated slot", () => {
    expect(connectedControllerCount([padAt(0, { connected: false })])).toBe(0);
    expect(connectedControllerCount([padAt(0, { id: "" })])).toBe(0);
    expect(connectedControllerCount([padAt(-1)])).toBe(0);
    expect(connectedControllerCount([padAt(0), padAt(0)])).toBe(1);
  });
});

describe("controller presence", () => {
  function environment(slots: Array<(Gamepad | null)[]>): {
    environment: ControllerPresenceEnvironment;
    fire: () => void;
    reads: number;
  } {
    const listeners: Array<(event: GamepadEvent) => void> = [];
    const state = { reads: 0 };
    return {
      environment: {
        getGamepads: () => {
          const observation = slots[Math.min(state.reads, slots.length - 1)] ?? [];
          state.reads += 1;
          return observation;
        },
        addEventListener: (_type, listener) => listeners.push(listener),
        removeEventListener: (_type, listener) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
      fire: () => {
        for (const listener of [...listeners]) listener({} as GamepadEvent);
      },
      get reads() {
        return state.reads;
      },
    };
  }

  it("reads the environment on start rather than waiting for an event", () => {
    const changes: number[] = [];
    const harness = environment([[padAt(0)]]);
    const presence = new ControllerPresence((count) => changes.push(count), harness.environment);

    presence.start();
    expect(presence.connected).toBe(1);
    expect(changes).toEqual([1]);
    presence.stop();
  });

  it("re-reads the environment on every connection event", () => {
    const changes: number[] = [];
    const harness = environment([[], [padAt(0)], [padAt(0), padAt(1)], []]);
    const presence = new ControllerPresence((count) => changes.push(count), harness.environment);

    presence.start();
    expect(presence.connected).toBe(0);
    harness.fire();
    harness.fire();
    harness.fire();
    expect(presence.connected).toBe(0);
    expect(changes).toEqual([1, 2, 0]);
    presence.stop();
  });

  it("stops observing and counts a failed read as no controller", () => {
    const changes: number[] = [];
    const harness = environment([[padAt(0)]]);
    const presence = new ControllerPresence((count) => changes.push(count), harness.environment);
    presence.start();
    presence.stop();
    harness.fire();
    expect(changes).toEqual([1]);

    const failing = new ControllerPresence(
      (count) => changes.push(count),
      {
        getGamepads: () => {
          throw new Error("gamepad observation unavailable");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    );
    failing.start();
    expect(failing.connected).toBe(0);
    expect(libretroLaunchGate(failing.refresh()).allowed).toBe(false);
    failing.stop();
  });
});
