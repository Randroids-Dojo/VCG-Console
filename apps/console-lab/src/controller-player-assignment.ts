import type { PlayerSlot } from "./player-session";

export type ControllerAssignmentState = "assigned" | "waiting" | "unsupported";

export interface ControllerAssignment {
  readonly browserIndex: number;
  readonly state: ControllerAssignmentState;
  readonly slot?: PlayerSlot;
}

interface ConnectedController {
  readonly browserIndex: number;
  readonly identity: string;
  readonly supported: boolean;
  slot?: PlayerSlot;
}

const PLAYER_SLOTS: readonly PlayerSlot[] = [1, 2];

/**
 * Session-only controller ownership for recovery input and controller games.
 * Browser device identities are retained only in memory to recover an
 * unambiguous reconnect; snapshots and UI events never expose them.
 */
export class ControllerPlayerAssignments {
  readonly #connected = new Map<number, ConnectedController>();
  readonly #rememberedSlots = new Map<string, Set<PlayerSlot>>();

  connect(gamepad: Pick<Gamepad, "id" | "index" | "mapping">): ControllerAssignment {
    const existing = this.#connected.get(gamepad.index);
    if (existing?.identity === gamepad.id && existing.supported === (gamepad.mapping === "standard")) {
      return publicAssignment(existing);
    }
    if (existing) this.#disconnect(existing);

    const controller: ConnectedController = {
      browserIndex: gamepad.index,
      identity: gamepad.id,
      supported: gamepad.mapping === "standard",
    };
    this.#connected.set(controller.browserIndex, controller);
    this.#assignWaiting();
    return publicAssignment(controller);
  }

  disconnect(gamepad: Pick<Gamepad, "id" | "index">): ControllerAssignment | undefined {
    const controller = this.#connected.get(gamepad.index);
    if (!controller || controller.identity !== gamepad.id) return undefined;
    const assignment = publicAssignment(controller);
    this.#disconnect(controller);
    this.#assignWaiting();
    return assignment;
  }

  slotForIndex(browserIndex: number): PlayerSlot | undefined {
    return this.#connected.get(browserIndex)?.slot;
  }

  snapshot(): readonly ControllerAssignment[] {
    return [...this.#connected.values()]
      .sort((left, right) => left.browserIndex - right.browserIndex)
      .map(publicAssignment);
  }

  reset(): void {
    this.#connected.clear();
    this.#rememberedSlots.clear();
  }

  #disconnect(controller: ConnectedController): void {
    this.#connected.delete(controller.browserIndex);
    if (controller.slot === undefined) return;
    const remembered = this.#rememberedSlots.get(controller.identity) ?? new Set<PlayerSlot>();
    remembered.add(controller.slot);
    this.#rememberedSlots.set(controller.identity, remembered);
  }

  #assignWaiting(): void {
    const assigned = new Set(
      [...this.#connected.values()].flatMap((controller) =>
        controller.slot === undefined ? [] : [controller.slot],
      ),
    );
    const waiting = [...this.#connected.values()]
      .filter((controller) => controller.supported && controller.slot === undefined)
      .sort((left, right) => left.browserIndex - right.browserIndex);

    for (const controller of waiting) {
      const remembered = this.#rememberedSlots.get(controller.identity);
      const rememberedSlot = remembered?.size === 1 ? [...remembered][0] : undefined;
      const slot = rememberedSlot !== undefined && !assigned.has(rememberedSlot)
        ? rememberedSlot
        : PLAYER_SLOTS.find((candidate) => !assigned.has(candidate));
      if (slot === undefined) continue;
      controller.slot = slot;
      assigned.add(slot);
      if (remembered) {
        remembered.delete(slot);
        if (remembered.size === 0) this.#rememberedSlots.delete(controller.identity);
      }
    }
  }
}

function publicAssignment(controller: ConnectedController): ControllerAssignment {
  if (!controller.supported) {
    return { browserIndex: controller.browserIndex, state: "unsupported" };
  }
  if (controller.slot === undefined) {
    return { browserIndex: controller.browserIndex, state: "waiting" };
  }
  return {
    browserIndex: controller.browserIndex,
    state: "assigned",
    slot: controller.slot,
  };
}
