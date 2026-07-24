export const LOCAL_CONFIRMATION_WINDOW_MS = 30_000;

export type ConsoleIdentityKind = "guest" | "local-profile";
export type ConsoleOperatingMode = "family" | "admin" | "developer";
export type PendingModeConfirmation = "enter-admin" | "enable-developer";

export interface ConsoleOperatingModeSnapshot {
  identityKind: ConsoleIdentityKind;
  mode: ConsoleOperatingMode;
  pendingConfirmation?: {
    action: PendingModeConfirmation;
    expiresAtMs: number;
  };
  canManageConsole: boolean;
  canPairDeveloperWorkstation: boolean;
  canUseDeveloperTransport: boolean;
}

/**
 * Pure fail-closed policy model for the launcher operating-mode prototype.
 *
 * This class does not authenticate a person or grant native authority. A
 * future privileged service must own trusted local confirmation and pairing.
 */
export class ConsoleOperatingModeController {
  #identityKind: ConsoleIdentityKind;
  #mode: ConsoleOperatingMode = "family";
  #pendingConfirmation:
    | {
        action: PendingModeConfirmation;
        expiresAtMs: number;
      }
    | undefined;

  constructor(identityKind: ConsoleIdentityKind = "local-profile") {
    this.#identityKind = identityKind;
  }

  snapshot(nowMs?: number): ConsoleOperatingModeSnapshot {
    if (nowMs !== undefined) this.#requireFiniteTime(nowMs);
    this.#expirePending(nowMs);
    return {
      identityKind: this.#identityKind,
      mode: this.#mode,
      ...(this.#pendingConfirmation === undefined
        ? {}
        : { pendingConfirmation: { ...this.#pendingConfirmation } }),
      canManageConsole: this.#mode === "admin" || this.#mode === "developer",
      canPairDeveloperWorkstation: this.#mode === "developer",
      canUseDeveloperTransport: this.#mode === "developer",
    };
  }

  changeIdentity(identityKind: ConsoleIdentityKind): ConsoleOperatingModeSnapshot {
    this.#identityKind = identityKind;
    this.#lock();
    return this.snapshot();
  }

  requestAdminConfirmation(nowMs: number): ConsoleOperatingModeSnapshot {
    this.#requireFiniteTime(nowMs);
    this.#expirePending(nowMs);
    if (this.#mode !== "family" || this.#pendingConfirmation !== undefined) {
      throw new Error("admin confirmation requires idle family mode");
    }
    this.#pendingConfirmation = {
      action: "enter-admin",
      expiresAtMs: nowMs + LOCAL_CONFIRMATION_WINDOW_MS,
    };
    return this.snapshot(nowMs);
  }

  requestDeveloperConfirmation(nowMs: number): ConsoleOperatingModeSnapshot {
    this.#requireFiniteTime(nowMs);
    this.#expirePending(nowMs);
    if (this.#mode !== "admin" || this.#pendingConfirmation !== undefined) {
      throw new Error("developer confirmation requires idle admin mode");
    }
    this.#pendingConfirmation = {
      action: "enable-developer",
      expiresAtMs: nowMs + LOCAL_CONFIRMATION_WINDOW_MS,
    };
    return this.snapshot(nowMs);
  }

  confirmLocally(nowMs: number): ConsoleOperatingModeSnapshot {
    this.#requireFiniteTime(nowMs);
    this.#expirePending(nowMs);
    const pending = this.#pendingConfirmation;
    if (pending === undefined) {
      throw new Error("no live local confirmation");
    }
    this.#pendingConfirmation = undefined;
    this.#mode = pending.action === "enter-admin" ? "admin" : "developer";
    return this.snapshot(nowMs);
  }

  cancelConfirmation(): ConsoleOperatingModeSnapshot {
    this.#pendingConfirmation = undefined;
    return this.snapshot();
  }

  endDeveloperMode(): ConsoleOperatingModeSnapshot {
    if (this.#mode !== "developer") {
      throw new Error("developer mode is not active");
    }
    this.#mode = "admin";
    this.#pendingConfirmation = undefined;
    return this.snapshot();
  }

  lockToFamily(): ConsoleOperatingModeSnapshot {
    this.#lock();
    return this.snapshot();
  }

  reboot(): ConsoleOperatingModeSnapshot {
    this.#lock();
    return this.snapshot();
  }

  #expirePending(nowMs?: number): void {
    if (
      nowMs !== undefined &&
      this.#pendingConfirmation !== undefined &&
      nowMs >= this.#pendingConfirmation.expiresAtMs
    ) {
      this.#pendingConfirmation = undefined;
    }
  }

  #lock(): void {
    this.#mode = "family";
    this.#pendingConfirmation = undefined;
  }

  #requireFiniteTime(nowMs: number): void {
    if (
      !Number.isSafeInteger(nowMs) ||
      nowMs < 0 ||
      nowMs > Number.MAX_SAFE_INTEGER - LOCAL_CONFIRMATION_WINDOW_MS
    ) {
      throw new Error("confirmation time must be a non-negative safe integer");
    }
  }
}
