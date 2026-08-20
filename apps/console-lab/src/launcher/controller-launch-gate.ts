/**
 * The controller requirement for starting a libretro game.
 *
 * This is a usability gate in the shell, not a security boundary. The
 * appliance session runs a full-screen browser with no keyboard, so a player
 * who reached a running core without a controller could neither play it nor
 * leave it. Refusing the launch in the shell is the only place that check
 * currently exists: `native/vcg-host/src/input.rs` declares `ShellAction`, but
 * no backend reads a physical input device, so the host cannot see whether a
 * controller is attached and cannot refuse the same launch. Anything that
 * calls the host directly, or any code path here that skips this check, still
 * starts the game.
 */

export interface ControllerPresenceEnvironment {
  getGamepads(): readonly (Gamepad | null)[];
  addEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void;
  removeEventListener(
    type: "gamepadconnected" | "gamepaddisconnected",
    listener: (event: GamepadEvent) => void,
  ): void;
}

export type ControllerLaunchGate = { allowed: true } | { allowed: false; detail: string };

export const CONTROLLER_REQUIRED_DETAIL =
  "Connect a controller to play. This game cannot be played or exited without one.";

/**
 * Counts the controllers the browser reports as connected.
 *
 * Layout is deliberately not part of the count. A pad the browser cannot map
 * to the standard layout is still a physical device, and the libretro frontend
 * maps devices itself, so excluding it here would refuse a launch the player
 * can in fact control. What is excluded is a slot the browser has emptied or
 * filled with a device it cannot describe.
 */
export function connectedControllerCount(slots: readonly (Gamepad | null)[]): number {
  let count = 0;
  const seen = new Set<number>();
  for (const gamepad of slots) {
    if (
      gamepad === null ||
      typeof gamepad !== "object" ||
      gamepad.connected !== true ||
      !Number.isSafeInteger(gamepad.index) ||
      gamepad.index < 0 ||
      typeof gamepad.id !== "string" ||
      gamepad.id.length === 0 ||
      seen.has(gamepad.index)
    ) {
      continue;
    }
    seen.add(gamepad.index);
    count += 1;
  }
  return count;
}

/** Decides whether a libretro launch may start. */
export function libretroLaunchGate(connectedControllers: number): ControllerLaunchGate {
  if (Number.isSafeInteger(connectedControllers) && connectedControllers > 0) {
    return { allowed: true };
  }
  return { allowed: false, detail: CONTROLLER_REQUIRED_DETAIL };
}

/**
 * Tracks whether a controller is connected right now.
 *
 * Connection events carry a device, but the count is always re-read from the
 * environment: a browser reveals already-attached pads only after the player
 * has used one, so the event stream alone is not a complete picture.
 */
export class ControllerPresence {
  readonly #environment: ControllerPresenceEnvironment;
  readonly #onChange: (connected: number) => void;
  #connected = 0;
  #running = false;

  constructor(
    onChange: (connected: number) => void,
    environment: ControllerPresenceEnvironment = browserControllerPresenceEnvironment(),
  ) {
    this.#onChange = onChange;
    this.#environment = environment;
  }

  get connected(): number {
    return this.#connected;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#environment.addEventListener("gamepadconnected", this.#observe);
    this.#environment.addEventListener("gamepaddisconnected", this.#observe);
    this.refresh();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#environment.removeEventListener("gamepadconnected", this.#observe);
    this.#environment.removeEventListener("gamepaddisconnected", this.#observe);
  }

  /** Re-reads the environment; a failed read counts as no controller. */
  refresh(): number {
    let next = 0;
    try {
      next = connectedControllerCount(this.#environment.getGamepads());
    } catch {
      next = 0;
    }
    if (next !== this.#connected) {
      this.#connected = next;
      this.#onChange(next);
    }
    return next;
  }

  readonly #observe = (): void => {
    this.refresh();
  };
}

function browserControllerPresenceEnvironment(): ControllerPresenceEnvironment {
  return {
    getGamepads: () => navigator.getGamepads(),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}
