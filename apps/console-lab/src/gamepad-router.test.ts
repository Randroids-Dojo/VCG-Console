import { describe, expect, it } from "vitest";
import {
  activeActions,
  GamepadRouter,
  MAX_BROWSER_GAMEPADS,
  MAX_BROWSER_GAMEPAD_SLOTS,
  type ConsoleInputAction,
  type GamepadObservationFault,
  type GamepadRouterEnvironment,
  type GamepadSnapshot,
} from "./gamepad-router";

function gamepad(
  buttons: number[] = [],
  axes: number[] = [0, 0],
  mapping = "standard",
): GamepadSnapshot {
  return {
    axes,
    mapping,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 })),
  };
}

function browserGamepad(
  index: number,
  id: string,
  buttons: number[] = [],
  axes: number[] = [0, 0],
  mapping = "standard",
): Gamepad {
  return {
    ...gamepad(buttons, axes, mapping),
    connected: true,
    id,
    index,
    timestamp: 1,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

class FakeGamepadEnvironment implements GamepadRouterEnvironment {
  readonly listeners = {
    gamepadconnected: new Set<(event: GamepadEvent) => void>(),
    gamepaddisconnected: new Set<(event: GamepadEvent) => void>(),
  };
  readonly frames = new Map<number, FrameRequestCallback>();
  gamepads: Array<Gamepad | null> = [];
  throwOnNextPoll = false;
  #nextFrame = 1;

  getGamepads(): readonly (Gamepad | null)[] {
    if (this.throwOnNextPoll) {
      this.throwOnNextPoll = false;
      throw new Error("synthetic browser observation failure");
    }
    return this.gamepads;
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const handle = this.#nextFrame++;
    this.frames.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.frames.delete(handle);
  }

  addEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void {
    this.listeners[type].delete(listener);
  }

  dispatch(type: "gamepadconnected" | "gamepaddisconnected", value: Gamepad): void {
    for (const listener of this.listeners[type]) {
      listener({ gamepad: value } as GamepadEvent);
    }
  }

  step(): void {
    const pending = [...this.frames.values()];
    this.frames.clear();
    for (const callback of pending) callback(0);
  }
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

  it("denies semantic actions to ambiguous mappings and malformed controls", () => {
    expect(activeActions(gamepad([0, 1, 9, 16], [0.9, -0.9], ""))).toEqual(
      new Set(),
    );
    expect(() =>
      activeActions(gamepad([], [Number.NaN, 0])),
    ).toThrow("invalid-controls");
    expect(() =>
      activeActions({
        ...gamepad(),
        buttons: [{ pressed: true, value: 2 }],
      }),
    ).toThrow("invalid-controls");
  });
});

describe("GamepadRouter", () => {
  it("reports the combined held state continuously and clears it after release", () => {
    const environment = new FakeGamepadEnvironment();
    const controller = browserGamepad(0, "controller", [0], [0.8, 0]);
    environment.gamepads = [controller];
    const states: string[][] = [];
    const router = new GamepadRouter(
      () => undefined,
      () => undefined,
      environment,
      (actions) => states.push([...actions].sort()),
    );

    router.start();
    environment.step();
    environment.gamepads = [browserGamepad(0, "controller")];
    environment.step();

    expect(states).toEqual([["right", "select"], []]);
  });

  it("discovers a controller that was already connected and emits only action edges", () => {
    const environment = new FakeGamepadEnvironment();
    const controller = browserGamepad(0, "preconnected", [0]);
    environment.gamepads = [controller];
    const connections: string[] = [];
    const actions: ConsoleInputAction[] = [];
    const router = new GamepadRouter(
      (action) => actions.push(action),
      (value, connected) => connections.push(`${value.id}:${connected}`),
      environment,
    );

    router.start();
    environment.step();
    environment.step();

    expect(connections).toEqual(["preconnected:true"]);
    expect(actions).toEqual(["select"]);
  });

  it("deduplicates browser connection events against polling", () => {
    const environment = new FakeGamepadEnvironment();
    const controller = browserGamepad(0, "event-and-poll");
    environment.gamepads = [controller];
    const connections: boolean[] = [];
    const router = new GamepadRouter(
      () => undefined,
      (_value, connected) => connections.push(connected),
      environment,
    );

    router.start();
    environment.dispatch("gamepadconnected", controller);
    environment.step();
    environment.dispatch("gamepadconnected", controller);

    expect(connections).toEqual([true]);
  });

  it("recovers from a missed disconnect event and rearms the replacement controller", () => {
    const environment = new FakeGamepadEnvironment();
    const first = browserGamepad(0, "reconnecting", [0]);
    environment.gamepads = [first];
    const connections: boolean[] = [];
    const actions: ConsoleInputAction[] = [];
    const router = new GamepadRouter(
      (action) => actions.push(action),
      (_value, connected) => connections.push(connected),
      environment,
    );

    router.start();
    environment.step();
    environment.gamepads = [];
    environment.step();
    environment.gamepads = [browserGamepad(0, "reconnecting", [0])];
    environment.step();

    expect(connections).toEqual([true, false, true]);
    expect(actions).toEqual(["select", "select"]);
  });

  it("orders a different controller replacement at the same browser index", () => {
    const environment = new FakeGamepadEnvironment();
    environment.gamepads = [browserGamepad(0, "first")];
    const connections: string[] = [];
    const router = new GamepadRouter(
      () => undefined,
      (value, connected) => connections.push(`${value.id}:${connected}`),
      environment,
    );

    router.start();
    environment.step();
    environment.gamepads = [browserGamepad(0, "replacement")];
    environment.step();

    expect(connections).toEqual([
      "first:true",
      "first:false",
      "replacement:true",
    ]);
  });

  it("processes simultaneous devices in deterministic index order", () => {
    const environment = new FakeGamepadEnvironment();
    environment.gamepads = [
      browserGamepad(4, "four", [1]),
      browserGamepad(1, "one", [0]),
      browserGamepad(3, "three", [9]),
    ];
    const connections: number[] = [];
    const actions: string[] = [];
    const router = new GamepadRouter(
      (action, value) => actions.push(`${value.index}:${action}`),
      (value, connected) => {
        if (connected) connections.push(value.index);
      },
      environment,
    );

    router.start();
    environment.step();

    expect(connections).toEqual([1, 3, 4]);
    expect(actions).toEqual(["1:select", "3:pause", "4:back"]);
  });

  it("keeps ambiguous devices visible but denies their semantic actions", () => {
    const environment = new FakeGamepadEnvironment();
    environment.gamepads = [
      browserGamepad(0, "unknown-layout", [0, 1, 9, 16], [0.9, -0.9], ""),
    ];
    const connections: string[] = [];
    const actions: ConsoleInputAction[] = [];
    const states: string[][] = [];
    const router = new GamepadRouter(
      (action) => actions.push(action),
      (value, connected) =>
        connections.push(`${value.mapping || "ambiguous"}:${connected}`),
      environment,
      (held) => states.push([...held]),
    );

    router.start();
    environment.step();

    expect(connections).toEqual(["ambiguous:true"]);
    expect(actions).toEqual([]);
    expect(states).toEqual([[]]);
  });

  it("rejects a malformed complete poll without mutating established state", () => {
    const environment = new FakeGamepadEnvironment();
    const controller = browserGamepad(0, "stable", [0]);
    environment.gamepads = [controller];
    const connections: boolean[] = [];
    const actions: ConsoleInputAction[] = [];
    const states: string[][] = [];
    const faults: GamepadObservationFault[] = [];
    const router = new GamepadRouter(
      (action) => actions.push(action),
      (_value, connected) => connections.push(connected),
      environment,
      (held) => states.push([...held]),
      (fault) => faults.push(fault),
    );

    router.start();
    environment.step();
    environment.gamepads = [controller, controller];
    environment.step();
    environment.gamepads = [browserGamepad(0, "stable", [0])];
    environment.step();
    environment.gamepads = [browserGamepad(0, "stable")];
    environment.step();
    environment.gamepads = [browserGamepad(0, "stable", [0])];
    environment.step();

    expect(faults).toEqual(["duplicate-index"]);
    expect(connections).toEqual([true]);
    expect(actions).toEqual(["select", "select"]);
    expect(states[1]).toEqual([]);
  });

  it("fails a thrown browser observation closed and resumes polling", () => {
    const environment = new FakeGamepadEnvironment();
    environment.gamepads = [browserGamepad(0, "stable", [0])];
    const actions: ConsoleInputAction[] = [];
    const states: string[][] = [];
    const faults: GamepadObservationFault[] = [];
    const router = new GamepadRouter(
      (action) => actions.push(action),
      () => undefined,
      environment,
      (held) => states.push([...held]),
      (fault) => faults.push(fault),
    );

    router.start();
    environment.step();
    environment.throwOnNextPoll = true;
    environment.step();
    expect(environment.frames.size).toBe(1);
    environment.step();

    expect(faults).toEqual(["observation-unavailable"]);
    expect(actions).toEqual(["select"]);
    expect(states).toEqual([["select"], [], ["select"]]);
  });

  it("bounds slot and connected-device observations before mutation", () => {
    const tooManySlots = new FakeGamepadEnvironment();
    tooManySlots.gamepads = Array.from(
      { length: MAX_BROWSER_GAMEPAD_SLOTS + 1 },
      () => null,
    );
    const slotFaults: GamepadObservationFault[] = [];
    const slotRouter = new GamepadRouter(
      () => undefined,
      () => undefined,
      tooManySlots,
      undefined,
      (fault) => slotFaults.push(fault),
    );
    slotRouter.start();
    tooManySlots.step();
    expect(slotFaults).toEqual(["too-many-slots"]);

    const tooManyDevices = new FakeGamepadEnvironment();
    tooManyDevices.gamepads = Array.from(
      { length: MAX_BROWSER_GAMEPADS + 1 },
      (_, index) => browserGamepad(index, `controller-${index}`),
    );
    const deviceFaults: GamepadObservationFault[] = [];
    const connections: boolean[] = [];
    const deviceRouter = new GamepadRouter(
      () => undefined,
      (_value, connected) => connections.push(connected),
      tooManyDevices,
      undefined,
      (fault) => deviceFaults.push(fault),
    );
    deviceRouter.start();
    tooManyDevices.step();
    expect(deviceFaults).toEqual(["too-many-gamepads"]);
    expect(connections).toEqual([]);

    const eventEnvironment = new FakeGamepadEnvironment();
    const eventFaults: GamepadObservationFault[] = [];
    const eventConnections: number[] = [];
    const eventRouter = new GamepadRouter(
      () => undefined,
      (value, connected) => {
        if (connected) eventConnections.push(value.index);
      },
      eventEnvironment,
      undefined,
      (fault) => eventFaults.push(fault),
    );
    eventRouter.start();
    for (let index = 0; index <= MAX_BROWSER_GAMEPADS; index += 1) {
      eventEnvironment.dispatch(
        "gamepadconnected",
        browserGamepad(index, `event-controller-${index}`),
      );
    }
    expect(eventConnections).toHaveLength(MAX_BROWSER_GAMEPADS);
    expect(eventFaults).toEqual(["too-many-gamepads"]);
  });

  it("ignores malformed connection events with a closed fault code", () => {
    const environment = new FakeGamepadEnvironment();
    const connections: boolean[] = [];
    const faults: GamepadObservationFault[] = [];
    const router = new GamepadRouter(
      () => undefined,
      (_value, connected) => connections.push(connected),
      environment,
      undefined,
      (fault) => faults.push(fault),
    );
    router.start();
    environment.dispatch(
      "gamepadconnected",
      {
        ...browserGamepad(0, "bad-controls"),
        axes: [2],
      } as unknown as Gamepad,
    );

    expect(faults).toEqual(["invalid-controls"]);
    expect(connections).toEqual([]);
  });

  it("rejects invisible controller identifiers and counts their limit in scalars", () => {
    const gameController = String.fromCodePoint(0x1f3ae);
    const environment = new FakeGamepadEnvironment();
    const connections: string[] = [];
    const faults: GamepadObservationFault[] = [];
    const router = new GamepadRouter(
      () => undefined,
      (value) => connections.push(value.id),
      environment,
      undefined,
      (fault) => faults.push(fault),
    );
    router.start();

    for (const unsafe of ["\u0085", "\u00ad", "\u200b", "\u202e", "\u2066", "\ufeff"]) {
      environment.dispatch(
        "gamepadconnected",
        browserGamepad(0, `Controller${unsafe}`),
      );
    }
    environment.dispatch(
      "gamepadconnected",
      browserGamepad(0, gameController.repeat(256)),
    );

    expect(faults).toEqual(Array.from({ length: 6 }, () => "invalid-device"));
    expect(connections).toEqual([gameController.repeat(256)]);

    const overlongEnvironment = new FakeGamepadEnvironment();
    const overlongFaults: GamepadObservationFault[] = [];
    const overlongRouter = new GamepadRouter(
      () => undefined,
      () => undefined,
      overlongEnvironment,
      undefined,
      (fault) => overlongFaults.push(fault),
    );
    overlongRouter.start();
    overlongEnvironment.dispatch(
      "gamepadconnected",
      browserGamepad(0, gameController.repeat(257)),
    );
    expect(overlongFaults).toEqual(["invalid-device"]);
  });

  it("cancels polling and ignores connection events after stop", () => {
    const environment = new FakeGamepadEnvironment();
    const connections: boolean[] = [];
    const states: string[][] = [];
    const router = new GamepadRouter(
      () => undefined,
      (_value, connected) => connections.push(connected),
      environment,
      (held) => states.push([...held]),
    );

    router.start();
    expect(environment.frames.size).toBe(1);
    router.stop();
    environment.dispatch("gamepadconnected", browserGamepad(0, "late"));

    expect(environment.frames.size).toBe(0);
    expect(connections).toEqual([]);
    expect(states).toEqual([[]]);
  });
});
