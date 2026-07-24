import { describe, expect, it } from "vitest";
import {
  activeActions,
  GamepadRouter,
  type ConsoleInputAction,
  type GamepadRouterEnvironment,
  type GamepadSnapshot,
} from "./gamepad-router";

function gamepad(buttons: number[] = [], axes: number[] = [0, 0]): GamepadSnapshot {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 })),
  };
}

function browserGamepad(
  index: number,
  id: string,
  buttons: number[] = [],
  axes: number[] = [0, 0],
): Gamepad {
  return {
    ...gamepad(buttons, axes),
    connected: true,
    id,
    index,
    mapping: "standard",
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
  #nextFrame = 1;

  getGamepads(): readonly (Gamepad | null)[] {
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

  it("cancels polling and ignores connection events after stop", () => {
    const environment = new FakeGamepadEnvironment();
    const connections: boolean[] = [];
    const router = new GamepadRouter(
      () => undefined,
      (_value, connected) => connections.push(connected),
      environment,
    );

    router.start();
    expect(environment.frames.size).toBe(1);
    router.stop();
    environment.dispatch("gamepadconnected", browserGamepad(0, "late"));

    expect(environment.frames.size).toBe(0);
    expect(connections).toEqual([]);
  });
});
