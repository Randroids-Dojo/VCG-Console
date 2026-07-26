export const OBSTACLE_GAME_ID = "vcg-obstacle-survival";
export const OBSTACLE_GAME_VERSION = "0.1.0";
export const OBSTACLE_RULES_VERSION = "1";
export const OBSTACLE_LEADERBOARD_STORAGE_KEY = "vcg.console.obstacle-leaderboard.v1";

const DOCUMENT_VERSION = 1;
const MAX_ENTRIES = 20;

export type LeaderboardInputMode = "camera" | "replay" | "simulator";

export type LeaderboardPlayer =
  | Readonly<{ kind: "unassigned" }>
  | Readonly<{ kind: "local-profile"; profileId: string; label: string }>;

export interface ObstacleLeaderboardEntry {
  readonly score: number;
  readonly endedAtMs: number;
  readonly gameId: typeof OBSTACLE_GAME_ID;
  readonly gameVersion: typeof OBSTACLE_GAME_VERSION;
  readonly rulesVersion: typeof OBSTACLE_RULES_VERSION;
  readonly playerSlot: 1;
  readonly player: LeaderboardPlayer;
  readonly inputMode: LeaderboardInputMode;
  readonly calibrationMode: "not-qualified";
  readonly pauseCount: number;
  readonly trackingDropoutCount: number;
}

export interface ObstacleRunResult {
  readonly score: number;
  readonly endedAtMs?: number;
  readonly player?: LeaderboardPlayer;
  readonly inputMode: LeaderboardInputMode;
  readonly pauseCount: number;
  readonly trackingDropoutCount: number;
}

export interface ObstacleLeaderboardSnapshot {
  readonly entries: readonly ObstacleLeaderboardEntry[];
  readonly recoveredMalformedData: boolean;
  readonly persistenceAvailable: boolean;
}

interface StoredDocument {
  readonly version: typeof DOCUMENT_VERSION;
  readonly entries: readonly ObstacleLeaderboardEntry[];
}

export class LocalObstacleLeaderboard {
  readonly #storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  #entries: ObstacleLeaderboardEntry[] = [];
  #recoveredMalformedData = false;
  #persistenceAvailable = true;

  constructor(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
    this.#storage = storage;
    this.#load();
  }

  snapshot(): ObstacleLeaderboardSnapshot {
    return {
      entries: this.#entries.map(cloneEntry),
      recoveredMalformedData: this.#recoveredMalformedData,
      persistenceAvailable: this.#persistenceAvailable,
    };
  }

  record(result: ObstacleRunResult): ObstacleLeaderboardEntry {
    const entry: ObstacleLeaderboardEntry = {
      score: boundedInteger(result.score, "score", 999_999_999),
      endedAtMs: boundedInteger(result.endedAtMs ?? Date.now(), "endedAtMs", Number.MAX_SAFE_INTEGER),
      gameId: OBSTACLE_GAME_ID,
      gameVersion: OBSTACLE_GAME_VERSION,
      rulesVersion: OBSTACLE_RULES_VERSION,
      playerSlot: 1,
      player: validatePlayer(result.player ?? { kind: "unassigned" }),
      inputMode: validateInputMode(result.inputMode),
      calibrationMode: "not-qualified",
      pauseCount: boundedInteger(result.pauseCount, "pauseCount", 1_000_000),
      trackingDropoutCount: boundedInteger(
        result.trackingDropoutCount,
        "trackingDropoutCount",
        1_000_000,
      ),
    };
    this.#entries = sortAndBound([entry, ...this.#entries]);
    this.#persist();
    return cloneEntry(entry);
  }

  unassignProfile(profileId: string): number {
    if (!profileId) throw new Error("profileId must not be empty");
    let changed = 0;
    this.#entries = this.#entries.map((entry) => {
      if (entry.player.kind !== "local-profile" || entry.player.profileId !== profileId) return entry;
      changed += 1;
      return { ...entry, player: { kind: "unassigned" } };
    });
    if (changed > 0) this.#persist();
    return changed;
  }

  reset(): void {
    this.#entries = [];
    this.#recoveredMalformedData = false;
    try {
      this.#storage.removeItem(OBSTACLE_LEADERBOARD_STORAGE_KEY);
    } catch {
      this.#persistenceAvailable = false;
    }
  }

  #load(): void {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(OBSTACLE_LEADERBOARD_STORAGE_KEY);
    } catch {
      this.#persistenceAvailable = false;
      return;
    }
    if (raw === null) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredDocument(parsed)) throw new Error("invalid leaderboard document");
      this.#entries = sortAndBound(parsed.entries.map(cloneEntry));
    } catch {
      this.#entries = [];
      this.#recoveredMalformedData = true;
      try {
        this.#storage.removeItem(OBSTACLE_LEADERBOARD_STORAGE_KEY);
      } catch {
        this.#persistenceAvailable = false;
      }
    }
  }

  #persist(): void {
    const document: StoredDocument = { version: DOCUMENT_VERSION, entries: this.#entries };
    try {
      this.#storage.setItem(OBSTACLE_LEADERBOARD_STORAGE_KEY, JSON.stringify(document));
    } catch {
      this.#persistenceAvailable = false;
    }
  }
}

function sortAndBound(entries: readonly ObstacleLeaderboardEntry[]): ObstacleLeaderboardEntry[] {
  return [...entries]
    .sort((left, right) => right.score - left.score || right.endedAtMs - left.endedAtMs)
    .slice(0, MAX_ENTRIES);
}

function cloneEntry(entry: ObstacleLeaderboardEntry): ObstacleLeaderboardEntry {
  return {
    ...entry,
    player: entry.player.kind === "unassigned" ? { kind: "unassigned" } : { ...entry.player },
  };
}

function boundedInteger(value: number, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${field} must be an integer from 0 through ${maximum}`);
  }
  return value;
}

function validateInputMode(value: unknown): LeaderboardInputMode {
  if (value === "camera" || value === "replay" || value === "simulator") return value;
  throw new Error("inputMode is invalid");
}

function validatePlayer(value: LeaderboardPlayer): LeaderboardPlayer {
  if (value.kind === "unassigned") return { kind: "unassigned" };
  if (
    value.kind !== "local-profile" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value.profileId) ||
    value.label.length < 1 ||
    value.label.length > 32
  ) {
    throw new Error("player assignment is invalid");
  }
  return { kind: "local-profile", profileId: value.profileId, label: value.label };
}

function isStoredDocument(value: unknown): value is StoredDocument {
  if (!isRecord(value) || value.version !== DOCUMENT_VERSION || !Array.isArray(value.entries)) return false;
  if (value.entries.length > MAX_ENTRIES) return false;
  return value.entries.every(isStoredEntry);
}

function isStoredEntry(value: unknown): value is ObstacleLeaderboardEntry {
  if (!isRecord(value)) return false;
  try {
    boundedInteger(value.score as number, "score", 999_999_999);
    boundedInteger(value.endedAtMs as number, "endedAtMs", Number.MAX_SAFE_INTEGER);
    boundedInteger(value.pauseCount as number, "pauseCount", 1_000_000);
    boundedInteger(value.trackingDropoutCount as number, "trackingDropoutCount", 1_000_000);
    validateInputMode(value.inputMode);
    validatePlayer(value.player as LeaderboardPlayer);
  } catch {
    return false;
  }
  return (
    value.gameId === OBSTACLE_GAME_ID &&
    value.gameVersion === OBSTACLE_GAME_VERSION &&
    value.rulesVersion === OBSTACLE_RULES_VERSION &&
    value.playerSlot === 1 &&
    value.calibrationMode === "not-qualified"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
