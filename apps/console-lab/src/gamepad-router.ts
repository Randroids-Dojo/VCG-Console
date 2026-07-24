export type ConsoleInputAction = "left" | "right" | "up" | "down" | "select" | "back" | "home" | "pause";

export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
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

export function activeActions(gamepad: GamepadSnapshot): Set<ConsoleInputAction> {
  const actions = new Set<ConsoleInputAction>();
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
  }

  readonly #connected = (event: GamepadEvent) => this.#observeConnected(event.gamepad);
  readonly #disconnected = (event: GamepadEvent) => {
    const connected = this.#connectedGamepads.get(event.gamepad.index);
    if (connected && sameGamepad(connected, event.gamepad)) this.#observeDisconnected(connected);
  };

  readonly #poll = (): void => {
    this.#frameHandle = undefined;
    if (!this.#running) return;
    const seen = new Set<number>();
    const combined = new Set<ConsoleInputAction>();
    const pending: Array<readonly [ConsoleInputAction, Gamepad]> = [];
    for (const gamepad of this.#environment.getGamepads()) {
      if (!gamepad) continue;
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
    this.onConnection(gamepad, false);
  }
}

function sameGamepad(left: Gamepad, right: Gamepad): boolean {
  return left.index === right.index && left.id === right.id && left.mapping === right.mapping;
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
