import { describe, expect, it } from "vitest";
import {
  LocalObstacleLeaderboard,
  OBSTACLE_LEADERBOARD_STORAGE_KEY,
  type ObstacleRunResult,
} from "./local-leaderboard";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("storage unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("storage unavailable");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWrites) throw new Error("storage unavailable");
    this.values.delete(key);
  }
}

function result(overrides: Partial<ObstacleRunResult> = {}): ObstacleRunResult {
  return {
    score: 300,
    endedAtMs: 1_000,
    inputMode: "simulator",
    pauseCount: 1,
    trackingDropoutCount: 2,
    ...overrides,
  };
}

describe("LocalObstacleLeaderboard", () => {
  it("persists bounded, versioned run context and sorts high scores", () => {
    const storage = new MemoryStorage();
    const leaderboard = new LocalObstacleLeaderboard(storage);
    leaderboard.record(result({ score: 100, endedAtMs: 3_000 }));
    leaderboard.record(result({ score: 500, endedAtMs: 2_000, inputMode: "camera" }));
    leaderboard.record(result({ score: 500, endedAtMs: 4_000, inputMode: "replay" }));

    expect(leaderboard.snapshot()).toMatchObject({
      persistenceAvailable: true,
      recoveredMalformedData: false,
      entries: [
        {
          score: 500,
          endedAtMs: 4_000,
          inputMode: "replay",
          calibrationMode: "not-qualified",
          scoreScope: "two-player-team",
          playerSlots: [1, 2],
        },
        { score: 500, endedAtMs: 2_000, inputMode: "camera" },
        { score: 100, endedAtMs: 3_000, inputMode: "simulator" },
      ],
    });
    expect(new LocalObstacleLeaderboard(storage).snapshot().entries).toEqual(
      leaderboard.snapshot().entries,
    );
  });

  it("caps retained history at twenty runs", () => {
    const leaderboard = new LocalObstacleLeaderboard(new MemoryStorage());
    for (let score = 0; score < 25; score += 1) {
      leaderboard.record(result({ score, endedAtMs: score }));
    }
    expect(leaderboard.snapshot().entries).toHaveLength(20);
    expect(leaderboard.snapshot().entries.at(-1)?.score).toBe(5);
  });

  it("removes a deleted profile link without removing its score", () => {
    const storage = new MemoryStorage();
    const leaderboard = new LocalObstacleLeaderboard(storage);
    leaderboard.record(
      result({ player: { kind: "local-profile", profileId: "player-1", label: "PLAYER 1" } }),
    );

    expect(leaderboard.unassignProfile("player-1")).toBe(1);
    expect(leaderboard.snapshot().entries[0]?.player).toEqual({ kind: "unassigned" });
    expect(new LocalObstacleLeaderboard(storage).snapshot().entries).toHaveLength(1);
  });

  it("resets the whole local board", () => {
    const storage = new MemoryStorage();
    const leaderboard = new LocalObstacleLeaderboard(storage);
    leaderboard.record(result());
    leaderboard.reset();

    expect(leaderboard.snapshot().entries).toEqual([]);
    expect(storage.values.has(OBSTACLE_LEADERBOARD_STORAGE_KEY)).toBe(false);
  });

  it.each([
    "{broken",
    JSON.stringify({ version: 1, entries: [{ score: -1 }] }),
    JSON.stringify({ version: 99, entries: [] }),
  ])("recovers malformed data without displaying partial scores", (stored) => {
    const storage = new MemoryStorage();
    storage.values.set(OBSTACLE_LEADERBOARD_STORAGE_KEY, stored);
    const leaderboard = new LocalObstacleLeaderboard(storage);

    expect(leaderboard.snapshot()).toEqual({
      entries: [],
      persistenceAvailable: true,
      recoveredMalformedData: true,
    });
    expect(storage.values.has(OBSTACLE_LEADERBOARD_STORAGE_KEY)).toBe(false);
  });

  it("reports unavailable storage while retaining the current-session score", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const leaderboard = new LocalObstacleLeaderboard(storage);
    leaderboard.record(result());

    expect(leaderboard.snapshot()).toMatchObject({
      entries: [{ score: 300 }],
      persistenceAvailable: false,
    });
  });

  it.each([
    { score: -1 },
    { score: 1.5 },
    { pauseCount: -1 },
    { trackingDropoutCount: Number.NaN },
    { inputMode: "network" },
  ])("rejects invalid run context %#", (override) => {
    const leaderboard = new LocalObstacleLeaderboard(new MemoryStorage());
    expect(() => leaderboard.record(result(override as Partial<ObstacleRunResult>))).toThrow();
  });
});
