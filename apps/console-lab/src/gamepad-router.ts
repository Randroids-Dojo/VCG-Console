export type ConsoleInputAction = "left" | "right" | "up" | "down" | "select" | "back" | "home" | "pause";

export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
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
  #running = false;

  constructor(
    private readonly onAction: (action: ConsoleInputAction, gamepad: Gamepad) => void,
    private readonly onConnection: (gamepad: Gamepad, connected: boolean) => void,
  ) {}

  start(): void {
    if (this.#running) return;
    this.#running = true;
    window.addEventListener("gamepadconnected", this.#connected);
    window.addEventListener("gamepaddisconnected", this.#disconnected);
    requestAnimationFrame(() => this.#poll());
  }

  stop(): void {
    this.#running = false;
    window.removeEventListener("gamepadconnected", this.#connected);
    window.removeEventListener("gamepaddisconnected", this.#disconnected);
    this.#previous.clear();
  }

  readonly #connected = (event: GamepadEvent) => this.onConnection(event.gamepad, true);
  readonly #disconnected = (event: GamepadEvent) => {
    this.#previous.delete(event.gamepad.index);
    this.onConnection(event.gamepad, false);
  };

  #poll(): void {
    if (!this.#running) return;
    for (const gamepad of navigator.getGamepads()) {
      if (!gamepad) continue;
      const current = activeActions(gamepad);
      const previous = this.#previous.get(gamepad.index) ?? new Set<ConsoleInputAction>();
      for (const action of current) {
        if (!previous.has(action)) this.onAction(action, gamepad);
      }
      this.#previous.set(gamepad.index, current);
    }
    requestAnimationFrame(() => this.#poll());
  }
}
