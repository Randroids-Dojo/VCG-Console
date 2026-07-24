export type PlayerSlot = 1 | 2;
export type PlayerSessionPhase = "setup" | "playing" | "frozen" | "recovery" | "paused";
export type PlayerPresence =
  | "joined"
  | "confirming-loss"
  | "reacquiring"
  | "awaiting-resume";

export interface PlayerSnapshot {
  slot: PlayerSlot;
  trackId: string;
  presence: PlayerPresence;
  visible: boolean;
}

export interface PlayerSessionSnapshot {
  phase: PlayerSessionPhase;
  players: PlayerSnapshot[];
  launcherOwner?: PlayerSlot;
  overlayOwner?: PlayerSlot;
}

export type PlayerSessionEvent =
  | { type: "player-joined"; slot: PlayerSlot; trackId: string }
  | {
      type: "freeze";
      reason: "tracking-loss" | "hard-fault" | "clock-regression";
      lostSlots: PlayerSlot[];
    }
  | { type: "silent-recovery"; recoveredSlots: PlayerSlot[] }
  | { type: "show-recovery"; lostSlots: PlayerSlot[] }
  | { type: "pause-opened"; ownerSlot: PlayerSlot }
  | { type: "pause-closed"; ownerSlot: PlayerSlot; destination: "game" | "launcher" }
  | {
      type: "recovery-resumed";
      ownerSlot: PlayerSlot;
      takeover: boolean;
      removedSlots: PlayerSlot[];
    };

export interface PlayerSessionOptions {
  maxPlayers?: 1 | 2;
  lossConfirmationMs?: number;
  reacquisitionMs?: number;
  minimumMissingUpdates?: number;
}

interface PlayerRecord extends PlayerSnapshot {
  missingSinceMs?: number;
  missingUpdates: number;
  confirmedLostAtMs?: number;
}

interface PauseCompletion {
  slot: PlayerSlot;
  completedAtMs: number;
}

export interface TrackActionCompletion {
  trackId: string;
  completedAtMs: number;
}

const DEFAULT_LOSS_CONFIRMATION_MS = 300;
const DEFAULT_REACQUISITION_MS = 2_000;
const DEFAULT_MINIMUM_MISSING_UPDATES = 2;
export const MAX_PLAYER_SESSION_VISIBLE_TRACKS = 16;
export const MAX_PLAYER_SESSION_ACTION_COMPLETIONS = 16;

export class PlayerSessionController {
  readonly #maxPlayers: 1 | 2;
  readonly #lossConfirmationMs: number;
  readonly #reacquisitionMs: number;
  readonly #minimumMissingUpdates: number;
  readonly #players = new Map<PlayerSlot, PlayerRecord>();
  #visibleTracks = new Set<string>();
  #phase: PlayerSessionPhase = "setup";
  #launcherOwner: PlayerSlot | undefined;
  #overlayOwner: PlayerSlot | undefined;
  #lastUpdateMs: number | undefined;
  #returnPhaseAfterFreeze: "playing" | "paused" = "playing";

  constructor(options: PlayerSessionOptions = {}) {
    this.#maxPlayers = options.maxPlayers ?? 1;
    this.#lossConfirmationMs = positiveDuration(
      options.lossConfirmationMs ?? DEFAULT_LOSS_CONFIRMATION_MS,
      "lossConfirmationMs",
    );
    this.#reacquisitionMs = positiveDuration(
      options.reacquisitionMs ?? DEFAULT_REACQUISITION_MS,
      "reacquisitionMs",
    );
    this.#minimumMissingUpdates = positiveInteger(
      options.minimumMissingUpdates ?? DEFAULT_MINIMUM_MISSING_UPDATES,
      "minimumMissingUpdates",
    );
  }

  snapshot(): PlayerSessionSnapshot {
    return {
      phase: this.#phase,
      players: [...this.#players.values()]
        .sort((left, right) => left.slot - right.slot)
        .map(({ slot, trackId, presence, visible }) => ({ slot, trackId, presence, visible })),
      ...(this.#launcherOwner === undefined ? {} : { launcherOwner: this.#launcherOwner }),
      ...(this.#overlayOwner === undefined ? {} : { overlayOwner: this.#overlayOwner }),
    };
  }

  observe(
    nowMs: number,
    visibleTrackIds: readonly string[],
    options: Readonly<{ hardFault?: boolean }> = {},
  ): PlayerSessionEvent[] {
    nonnegativeTime(nowMs, "nowMs");
    this.#visibleTracks = uniqueTrackIds(visibleTrackIds);

    if (this.#lastUpdateMs !== undefined && nowMs < this.#lastUpdateMs) {
      this.#lastUpdateMs = nowMs;
      return this.#forceLoss(nowMs, "clock-regression");
    }
    this.#lastUpdateMs = nowMs;
    if (options.hardFault) return this.#forceLoss(nowMs, "hard-fault");
    if (this.#players.size === 0) {
      this.#refreshVisibility();
      return [];
    }

    const newlyLost: PlayerSlot[] = [];
    const recovered: PlayerSlot[] = [];
    for (const player of this.#players.values()) {
      player.visible = this.#visibleTracks.has(player.trackId);
      if (player.visible) {
        if (player.presence === "reacquiring" && this.#phase === "frozen") {
          const elapsed = nowMs - (player.confirmedLostAtMs ?? nowMs);
          if (elapsed <= this.#reacquisitionMs) recovered.push(player.slot);
        }
        if (this.#phase === "recovery" && player.presence !== "joined") {
          player.presence = "awaiting-resume";
        } else {
          player.presence = "joined";
        }
        clearLossEvidence(player);
        continue;
      }

      if (player.presence === "joined") {
        player.presence = "confirming-loss";
        player.missingSinceMs = nowMs;
        player.missingUpdates = 1;
      } else if (player.presence === "confirming-loss") {
        player.missingUpdates += 1;
        if (
          nowMs - (player.missingSinceMs ?? nowMs) >= this.#lossConfirmationMs &&
          player.missingUpdates >= this.#minimumMissingUpdates
        ) {
          confirmLoss(player, nowMs);
          newlyLost.push(player.slot);
        }
      }
    }

    const events: PlayerSessionEvent[] = [];
    if (newlyLost.length > 0 && (this.#phase === "playing" || this.#phase === "paused")) {
      this.#returnPhaseAfterFreeze = this.#phase;
      this.#phase = "frozen";
      events.push({ type: "freeze", reason: "tracking-loss", lostSlots: sortedSlots(newlyLost) });
    }
    if (
      this.#phase === "frozen" &&
      [...this.#players.values()].every((player) => player.presence === "joined")
    ) {
      this.#phase = this.#returnPhaseAfterFreeze;
      events.push({ type: "silent-recovery", recoveredSlots: sortedSlots(recovered) });
      return events;
    }
    if (
      this.#phase === "frozen" &&
      [...this.#players.values()].some(
        (player) =>
          player.confirmedLostAtMs !== undefined &&
          nowMs - player.confirmedLostAtMs >= this.#reacquisitionMs,
      )
    ) {
      this.#phase = "recovery";
      this.#overlayOwner = undefined;
      for (const player of this.#players.values()) {
        if (player.presence !== "joined") player.presence = "awaiting-resume";
      }
      events.push({ type: "show-recovery", lostSlots: this.#unsafeSlots() });
    }
    return events;
  }

  join(trackId: string): PlayerSessionEvent {
    validTrackId(trackId);
    if (!this.#visibleTracks.has(trackId)) {
      throw new Error("join requires a currently visible candidate track");
    }
    if ([...this.#players.values()].some((player) => player.trackId === trackId)) {
      throw new Error("candidate track is already joined");
    }
    if (!["setup", "playing"].includes(this.#phase)) {
      throw new Error(`cannot join while session phase is ${this.#phase}`);
    }
    const slot = ([1, 2] as const).find((candidate) => !this.#players.has(candidate));
    if (!slot || slot > this.#maxPlayers) throw new Error("session player limit reached");
    this.#players.set(slot, {
      slot,
      trackId,
      presence: "joined",
      visible: true,
      missingUpdates: 0,
    });
    this.#phase = "playing";
    this.#launcherOwner ??= slot;
    return { type: "player-joined", slot, trackId };
  }

  authorizeGameplayAction(trackId: string): PlayerSlot | undefined {
    validTrackId(trackId);
    if (this.#phase !== "playing") return undefined;
    const player = [...this.#players.values()].find(
      (candidate) =>
        candidate.trackId === trackId &&
        candidate.presence === "joined" &&
        candidate.visible,
    );
    return player?.slot;
  }

  openPauseForTracks(
    completions: readonly TrackActionCompletion[],
  ): PlayerSessionEvent | undefined {
    boundedArray(
      completions,
      MAX_PLAYER_SESSION_ACTION_COMPLETIONS,
      "track action completions",
    );
    const authorized = completions.flatMap(({ trackId, completedAtMs }) => {
      const slot = this.authorizeGameplayAction(trackId);
      return slot === undefined ? [] : [{ slot, completedAtMs }];
    });
    return this.openPause(authorized);
  }

  openPause(completions: readonly PauseCompletion[]): PlayerSessionEvent | undefined {
    boundedArray(
      completions,
      MAX_PLAYER_SESSION_ACTION_COMPLETIONS,
      "pause completions",
    );
    if (this.#phase !== "playing") return undefined;
    const eligible = completions
      .filter(
        ({ slot, completedAtMs }) =>
          this.#players.get(slot)?.presence === "joined" &&
          Number.isFinite(completedAtMs) &&
          completedAtMs >= 0,
      )
      .sort(
        (left, right) =>
          left.completedAtMs - right.completedAtMs || left.slot - right.slot,
      );
    const winner = eligible[0];
    if (!winner) return undefined;
    this.#phase = "paused";
    this.#overlayOwner = winner.slot;
    return { type: "pause-opened", ownerSlot: winner.slot };
  }

  closePause(ownerSlot: PlayerSlot, destination: "game" | "launcher"): PlayerSessionEvent {
    if (this.#phase !== "paused" || this.#overlayOwner !== ownerSlot) {
      throw new Error("only the pause owner may close the manual overlay");
    }
    this.#phase = "playing";
    this.#overlayOwner = undefined;
    if (destination === "launcher") this.#launcherOwner = ownerSlot;
    return { type: "pause-closed", ownerSlot, destination };
  }

  resumeRecovery(
    controllerTrackId: string,
    keepSlots: readonly PlayerSlot[] = [...this.#players.keys()],
  ): PlayerSessionEvent {
    validTrackId(controllerTrackId);
    if (this.#phase !== "recovery") throw new Error("recovery overlay is not active");
    if (!this.#visibleTracks.has(controllerTrackId)) {
      throw new Error("recovery requires a currently visible candidate");
    }
    const uniqueSlots = [...new Set(keepSlots)].sort((left, right) => left - right);
    if (uniqueSlots.length === 0) throw new Error("recovery cannot resume an empty roster");
    if (uniqueSlots.some((slot) => !this.#players.has(slot))) {
      throw new Error("recovery roster contains an unknown player slot");
    }

    let ownerSlot: PlayerSlot;
    let takeover = false;
    if (this.#players.size === 1) {
      ownerSlot = uniqueSlots[0]!;
      const player = this.#players.get(ownerSlot)!;
      takeover = player.trackId !== controllerTrackId;
      player.trackId = controllerTrackId;
    } else {
      const controller = [...this.#players.values()].find(
        (player) => player.trackId === controllerTrackId && uniqueSlots.includes(player.slot),
      );
      if (!controller) {
        throw new Error("multiplayer recovery controller must be a retained joined track");
      }
      for (const slot of uniqueSlots) {
        const player = this.#players.get(slot)!;
        if (!this.#visibleTracks.has(player.trackId)) {
          throw new Error("every retained multiplayer track must be visible before resume");
        }
      }
      ownerSlot = controller.slot;
    }

    const removedSlots = [...this.#players.keys()].filter(
      (slot) => !uniqueSlots.includes(slot),
    );
    for (const slot of removedSlots) this.#players.delete(slot);
    for (const player of this.#players.values()) {
      player.presence = "joined";
      player.visible = this.#visibleTracks.has(player.trackId);
      clearLossEvidence(player);
    }
    this.#phase = "playing";
    this.#overlayOwner = undefined;
    return {
      type: "recovery-resumed",
      ownerSlot,
      takeover,
      removedSlots: sortedSlots(removedSlots),
    };
  }

  reset(): void {
    this.#players.clear();
    this.#visibleTracks.clear();
    this.#phase = "setup";
    this.#launcherOwner = undefined;
    this.#overlayOwner = undefined;
    this.#lastUpdateMs = undefined;
    this.#returnPhaseAfterFreeze = "playing";
  }

  #forceLoss(
    nowMs: number,
    reason: "hard-fault" | "clock-regression",
  ): PlayerSessionEvent[] {
    this.#refreshVisibility();
    if (this.#players.size === 0) return [];
    if (reason === "hard-fault" && this.#phase === "recovery") return [];
    if (reason === "hard-fault" && this.#phase === "frozen") {
      for (const player of this.#players.values()) {
        if (player.confirmedLostAtMs === undefined) confirmLoss(player, nowMs);
      }
      return [];
    }
    if (this.#phase === "playing" || this.#phase === "paused") {
      this.#returnPhaseAfterFreeze = this.#phase;
    }
    for (const player of this.#players.values()) confirmLoss(player, nowMs);
    this.#phase = "frozen";
    return [{ type: "freeze", reason, lostSlots: sortedSlots([...this.#players.keys()]) }];
  }

  #refreshVisibility(): void {
    for (const player of this.#players.values()) {
      player.visible = this.#visibleTracks.has(player.trackId);
    }
  }

  #unsafeSlots(): PlayerSlot[] {
    return sortedSlots(
      [...this.#players.values()]
        .filter((player) => player.presence !== "joined")
        .map((player) => player.slot),
    );
  }
}

function confirmLoss(player: PlayerRecord, nowMs: number): void {
  player.presence = "reacquiring";
  player.confirmedLostAtMs = nowMs;
  player.visible = false;
}

function clearLossEvidence(player: PlayerRecord): void {
  delete player.missingSinceMs;
  player.missingUpdates = 0;
  delete player.confirmedLostAtMs;
}

function sortedSlots(slots: readonly PlayerSlot[]): PlayerSlot[] {
  return [...slots].sort((left, right) => left - right);
}

function uniqueTrackIds(trackIds: readonly string[]): Set<string> {
  boundedArray(
    trackIds,
    MAX_PLAYER_SESSION_VISIBLE_TRACKS,
    "visible tracks",
  );
  const output = new Set<string>();
  for (const trackId of trackIds) {
    validTrackId(trackId);
    if (output.has(trackId)) throw new Error(`duplicate visible track: ${trackId}`);
    output.add(trackId);
  }
  return output;
}

function boundedArray(
  value: readonly unknown[],
  maximum: number,
  name: string,
): void {
  if (value.length > maximum) {
    throw new Error(`${name} must contain at most ${maximum} entries`);
  }
}

function validTrackId(trackId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(trackId)) {
    throw new Error("trackId must be a bounded opaque identifier");
  }
}

function nonnegativeTime(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative and finite`);
}

function positiveDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
