import type { PlayerSlot } from "./player-session";

export type ControllerAssignmentState =
  | "assigned"
  | "claim-required"
  | "waiting"
  | "unsupported";

export interface ControllerAssignment {
  readonly browserIndex: number;
  readonly state: ControllerAssignmentState;
  readonly slot?: PlayerSlot;
}

interface ConnectedController {
  readonly browserIndex: number;
  readonly supported: boolean;
  slot?: PlayerSlot;
}

const PLAYER_SLOTS: readonly PlayerSlot[] = [1, 2];

/**
 * Session-only controller ownership for recovery input and controller games.
 * The Web Gamepad API exposes a product label, not a unique device identity.
 * A disconnected player slot therefore requires an intentional button press
 * from a waiting controller before authority moves to that browser index.
 */
export class ControllerPlayerAssignments {
  readonly #connected = new Map<number, ConnectedController>();
  readonly #releasedSlots = new Set<PlayerSlot>();

  connect(gamepad: Pick<Gamepad, "index" | "mapping">): ControllerAssignment {
    const existing = this.#connected.get(gamepad.index);
    if (existing?.supported === (gamepad.mapping === "standard")) {
      return this.#publicAssignment(existing);
    }
    if (existing) this.#disconnect(existing);

    const controller: ConnectedController = {
      browserIndex: gamepad.index,
      supported: gamepad.mapping === "standard",
    };
    this.#connected.set(controller.browserIndex, controller);
    this.#assignInitial(controller);
    return this.#publicAssignment(controller);
  }

  disconnect(gamepad: Pick<Gamepad, "index">): ControllerAssignment | undefined {
    const controller = this.#connected.get(gamepad.index);
    if (!controller) return undefined;
    const assignment = this.#publicAssignment(controller);
    this.#disconnect(controller);
    return assignment;
  }

  slotForIndex(browserIndex: number): PlayerSlot | undefined {
    return this.#connected.get(browserIndex)?.slot;
  }

  claimAvailableSlot(
    browserIndex: number,
    allowedSlots: readonly PlayerSlot[] = PLAYER_SLOTS,
  ): PlayerSlot | undefined {
    const controller = this.#connected.get(browserIndex);
    if (!controller?.supported || controller.slot !== undefined) return controller?.slot;
    const slot = PLAYER_SLOTS.find(
      (candidate) => allowedSlots.includes(candidate) && this.#releasedSlots.has(candidate),
    );
    if (slot === undefined) return undefined;
    controller.slot = slot;
    this.#releasedSlots.delete(slot);
    return slot;
  }

  snapshot(): readonly ControllerAssignment[] {
    return [...this.#connected.values()]
      .sort((left, right) => left.browserIndex - right.browserIndex)
      .map((controller) => this.#publicAssignment(controller));
  }

  reset(): void {
    this.#connected.clear();
    this.#releasedSlots.clear();
  }

  #disconnect(controller: ConnectedController): void {
    this.#connected.delete(controller.browserIndex);
    if (controller.slot === undefined) return;
    this.#releasedSlots.add(controller.slot);
  }

  #assignInitial(controller: ConnectedController): void {
    if (!controller.supported) return;
    const assigned = new Set(
      [...this.#connected.values()].flatMap((controller) =>
        controller.slot === undefined ? [] : [controller.slot],
      ),
    );
    const slot = PLAYER_SLOTS.find(
      (candidate) => !assigned.has(candidate) && !this.#releasedSlots.has(candidate),
    );
    if (slot !== undefined) controller.slot = slot;
  }

  #publicAssignment(controller: ConnectedController): ControllerAssignment {
    if (!controller.supported) {
      return { browserIndex: controller.browserIndex, state: "unsupported" };
    }
    if (controller.slot === undefined) {
      return {
        browserIndex: controller.browserIndex,
        state: this.#releasedSlots.size > 0 ? "claim-required" : "waiting",
      };
    }
    return {
      browserIndex: controller.browserIndex,
      state: "assigned",
      slot: controller.slot,
    };
  }
}
