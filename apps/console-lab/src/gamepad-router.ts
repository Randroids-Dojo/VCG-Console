export type ConsoleInputAction = "left" | "right" | "up" | "down" | "select" | "back" | "home" | "pause";

export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  mapping: string;
}

export interface GamepadRouterEnvironment {
  getGamepads(): readonly (Gamepad | null)[];
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  addEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void;
  removeEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void;
}

const DEAD_ZONE = 0.55;
export const MAX_BROWSER_GAMEPADS = 16;
export const MAX_BROWSER_GAMEPAD_SLOTS = 64;
export const MAX_BROWSER_GAMEPAD_AXES = 8;
export const MAX_BROWSER_GAMEPAD_BUTTONS = 32;

export type GamepadObservationFault =
  | "observation-unavailable"
  | "too-many-slots"
  | "too-many-gamepads"
  | "duplicate-index"
  | "invalid-device"
  | "invalid-controls";

export function activeActions(gamepad: GamepadSnapshot): Set<ConsoleInputAction> {
  const fault = validateControls(gamepad);
  if (fault) throw new Error(fault);
  const actions = new Set<ConsoleInputAction>();
  if (gamepad.mapping !== "standard") return actions;
  const pressed = (index: number) => Boolean(gamepad.buttons[index]?.pressed);
  const horizontal = gamepad.axes[0] ?? 0;
  const vertical = gamepad.axes[1] ?? 0;
  if (pressed(14) || horizontal < -DEAD_ZONE) actions.add("left");
  if (pressed(15) || horizontal > DEAD_ZONE) actions.add("right");
  if (pressed(12) || vertical < -DEAD_ZONE) actions.add("up");
  if (pressed(13) || vertical > DEAD_ZONE) actions.add("down");
  if (pressed(0)) actions.add("select");
  if (pressed(1)) actions.add("back");
  if (pressed(16)) actions.add("home");
  if (pressed(9)) actions.add("pause");
  return actions;
}

export class GamepadRouter {
  readonly #previous = new Map<number, Set<ConsoleInputAction>>();
  readonly #connectedGamepads = new Map<number, Gamepad>();
  readonly #environment: GamepadRouterEnvironment;
  #running = false;
  #frameHandle: number | undefined;

  constructor(
    private readonly onAction: (action: ConsoleInputAction, gamepad: Gamepad) => void,
    private readonly onConnection: (gamepad: Gamepad, connected: boolean) => void,
    environment?: GamepadRouterEnvironment,
    private readonly onState?: (actions: ReadonlySet<ConsoleInputAction>) => void,
    private readonly onFault?: (fault: GamepadObservationFault) => void,
  ) {
    this.#environment = environment ?? browserGamepadEnvironment();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#environment.addEventListener("gamepadconnected", this.#connected);
    this.#environment.addEventListener("gamepaddisconnected", this.#disconnected);
    this.#schedulePoll();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#environment.removeEventListener("gamepadconnected", this.#connected);
    this.#environment.removeEventListener("gamepaddisconnected", this.#disconnected);
    if (this.#frameHandle !== undefined) {
      this.#environment.cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = undefined;
    }
    this.#previous.clear();
    this.#connectedGamepads.clear();
    this.onState?.(new Set());
  }

  readonly #connected = (event: GamepadEvent) => {
    const fault = validateDevice(event.gamepad, false);
    if (fault) {
      this.#failObservation(fault);
      return;
    }
    if (
      !this.#connectedGamepads.has(event.gamepad.index) &&
      this.#connectedGamepads.size >= MAX_BROWSER_GAMEPADS
    ) {
      this.#failObservation("too-many-gamepads");
      return;
    }
    this.#observeConnected(event.gamepad);
  };
  readonly #disconnected = (event: GamepadEvent) => {
    const fault = validateDevice(event.gamepad, false);
    if (fault) {
      this.#failObservation(fault);
      return;
    }
    const connected = this.#connectedGamepads.get(event.gamepad.index);
    if (connected && sameGamepad(connected, event.gamepad)) this.#observeDisconnected(connected);
  };

  readonly #poll = (): void => {
    this.#frameHandle = undefined;
    if (!this.#running) return;
    let slots: readonly (Gamepad | null)[];
    try {
      slots = this.#environment.getGamepads();
    } catch {
      this.#failObservation("observation-unavailable");
      this.#schedulePoll();
      return;
    }
    const observation = validateObservation(slots);
    if (!observation.ok) {
      this.#failObservation(observation.fault);
      this.#schedulePoll();
      return;
    }
    const seen = new Set<number>();
    const combined = new Set<ConsoleInputAction>();
    const pending: Array<readonly [ConsoleInputAction, Gamepad]> = [];
    for (const gamepad of observation.gamepads) {
      seen.add(gamepad.index);
      this.#observeConnected(gamepad);
      const current = activeActions(gamepad);
      for (const action of current) combined.add(action);
      const previous = this.#previous.get(gamepad.index) ?? new Set<ConsoleInputAction>();
      for (const action of current) {
        if (!previous.has(action)) pending.push([action, gamepad]);
      }
      this.#previous.set(gamepad.index, current);
    }
    for (const [index, gamepad] of this.#connectedGamepads) {
      if (!seen.has(index)) this.#observeDisconnected(gamepad);
    }
    this.onState?.(combined);
    for (const [action, gamepad] of pending) this.onAction(action, gamepad);
    this.#schedulePoll();
  };

  #schedulePoll(): void {
    if (!this.#running || this.#frameHandle !== undefined) return;
    this.#frameHandle = this.#environment.requestAnimationFrame(this.#poll);
  }

  #observeConnected(gamepad: Gamepad): void {
    const connected = this.#connectedGamepads.get(gamepad.index);
    if (connected && sameGamepad(connected, gamepad)) {
      this.#connectedGamepads.set(gamepad.index, gamepad);
      return;
    }
    if (connected) this.#observeDisconnected(connected);
    this.#connectedGamepads.set(gamepad.index, gamepad);
    this.onConnection(gamepad, true);
  }

  #observeDisconnected(gamepad: Gamepad): void {
    this.#connectedGamepads.delete(gamepad.index);
    this.#previous.delete(gamepad.index);
    this.#publishHeldState();
    this.onConnection(gamepad, false);
  }

  #failObservation(fault: GamepadObservationFault): void {
    this.onState?.(new Set());
    this.onFault?.(fault);
  }

  #publishHeldState(): void {
    if (!this.onState) return;
    const combined = new Set<ConsoleInputAction>();
    for (const actions of this.#previous.values()) {
      for (const action of actions) combined.add(action);
    }
    this.onState(combined);
  }
}

function sameGamepad(left: Gamepad, right: Gamepad): boolean {
  return left.index === right.index && left.id === right.id && left.mapping === right.mapping;
}

function validateObservation(
  slots: readonly (Gamepad | null)[],
):
  | { ok: true; gamepads: Gamepad[] }
  | { ok: false; fault: GamepadObservationFault } {
  if (slots.length > MAX_BROWSER_GAMEPAD_SLOTS) {
    return { ok: false, fault: "too-many-slots" };
  }
  const gamepads = slots.filter(
    (gamepad): gamepad is Gamepad => gamepad !== null,
  );
  if (gamepads.length > MAX_BROWSER_GAMEPADS) {
    return { ok: false, fault: "too-many-gamepads" };
  }
  const indexes = new Set<number>();
  for (const gamepad of gamepads) {
    const fault = validateDevice(gamepad, true);
    if (fault) return { ok: false, fault };
    if (indexes.has(gamepad.index)) {
      return { ok: false, fault: "duplicate-index" };
    }
    indexes.add(gamepad.index);
  }
  return {
    ok: true,
    gamepads: [...gamepads].sort((left, right) => left.index - right.index),
  };
}

function validateDevice(
  gamepad: Gamepad,
  requireConnected: boolean,
): GamepadObservationFault | undefined {
  if (
    !Number.isSafeInteger(gamepad.index) ||
    gamepad.index < 0 ||
    gamepad.index > 255 ||
    typeof gamepad.id !== "string" ||
    gamepad.id.length < 1 ||
    gamepad.id.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(gamepad.id) ||
    !["", "standard", "xr-standard"].includes(gamepad.mapping) ||
    typeof gamepad.connected !== "boolean" ||
    (requireConnected && !gamepad.connected) ||
    !Number.isFinite(gamepad.timestamp) ||
    gamepad.timestamp < 0
  ) {
    return "invalid-device";
  }
  return validateControls(gamepad);
}

function validateControls(
  gamepad: GamepadSnapshot,
): GamepadObservationFault | undefined {
  if (
    !Array.isArray(gamepad.axes) ||
    gamepad.axes.length > MAX_BROWSER_GAMEPAD_AXES ||
    gamepad.axes.some(
      (axis) => !Number.isFinite(axis) || axis < -1 || axis > 1,
    ) ||
    !Array.isArray(gamepad.buttons) ||
    gamepad.buttons.length > MAX_BROWSER_GAMEPAD_BUTTONS ||
    gamepad.buttons.some(
      (button) =>
        typeof button !== "object" ||
        button === null ||
        typeof button.pressed !== "boolean" ||
        !Number.isFinite(button.value) ||
        button.value < 0 ||
        button.value > 1,
    )
  ) {
    return "invalid-controls";
  }
  return undefined;
}

function browserGamepadEnvironment(): GamepadRouterEnvironment {
  return {
    getGamepads: () => navigator.getGamepads(),
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}
