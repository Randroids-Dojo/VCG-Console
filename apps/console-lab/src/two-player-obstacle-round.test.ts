import { describe, expect, it } from "vitest";
import { TwoPlayerObstacleRound } from "./two-player-obstacle-round";

function playingRound(options: ConstructorParameters<typeof TwoPlayerObstacleRound>[0] = {}) {
  const round = new TwoPlayerObstacleRound({ countdownMs: 100, ...options });
  round.setRoster([1, 2]);
  round.update(100);
  expect(round.snapshot().phase).toBe("playing");
  return round;
}

describe("TwoPlayerObstacleRound", () => {
  it("waits for exactly two joined player slots before counting down", () => {
    const round = new TwoPlayerObstacleRound({ countdownMs: 3_000 });

    round.setRoster([1]);
    expect(round.snapshot()).toMatchObject({
      phase: "waiting-for-players",
      joinedSlots: [1],
      countdownRemainingMs: 0,
    });

    round.setRoster([1, 2]);
    expect(round.snapshot()).toMatchObject({
      phase: "countdown",
      joinedSlots: [1, 2],
      countdownRemainingMs: 3_000,
    });
  });

  it("applies an action only to its authorized player slot", () => {
    const round = playingRound({ obstacleTravelMs: 1_000, spawnIntervalMs: 5_000 });

    // The first P1 obstacle occupies the left lane; P2 gets a jump obstacle.
    round.handleAction("dodge_right", 1);
    round.update(1_000);

    expect(round.snapshot().players).toEqual([
      expect.objectContaining({ slot: 1, lane: 2, score: 100, lives: 3, lastResult: "clear" }),
      expect.objectContaining({ slot: 2, lane: 1, score: 0, lives: 2, lastResult: "hit" }),
    ]);
  });

  it("freezes countdown, clock, obstacles, and actions while paused", () => {
    const round = playingRound({ obstacleTravelMs: 1_000, roundMs: 5_000 });
    round.update(250);
    const beforePause = round.snapshot();

    round.setPaused(true);
    round.handleAction("dodge_left", 1);
    round.update(2_000);

    expect(round.snapshot()).toEqual({ ...beforePause, phase: "paused", resumePhase: "playing" });
    round.setPaused(false);
    round.update(250);
    expect(round.snapshot().phase).toBe("playing");
    expect(round.snapshot().roundRemainingMs).toBe(beforePause.roundRemainingMs - 250);
  });

  it("finishes with a winner when both players are out", () => {
    const round = playingRound({
      obstacleTravelMs: 100,
      spawnIntervalMs: 100,
      startingLives: 1,
    });
    round.handleAction("dodge_left", 1);

    round.update(100);

    expect(round.snapshot()).toMatchObject({
      phase: "finished",
      totalScore: 0,
      players: [
        expect.objectContaining({ slot: 1, lives: 0 }),
        expect.objectContaining({ slot: 2, lives: 0 }),
      ],
    });
    expect(round.snapshot().winnerSlot).toBeUndefined();
  });

  it("finishes on time and preserves the stronger player's result", () => {
    const round = playingRound({
      obstacleTravelMs: 100,
      spawnIntervalMs: 5_000,
      roundMs: 100,
    });
    round.update(100);

    expect(round.snapshot()).toMatchObject({ phase: "finished", winnerSlot: 1, totalScore: 100 });
  });

  it("starts a clean countdown when a player leaves and rejoins", () => {
    const round = playingRound();
    round.setRoster([1]);
    expect(round.snapshot()).toMatchObject({ phase: "waiting-for-players", joinedSlots: [1] });

    round.setRoster([1, 2]);
    expect(round.snapshot()).toMatchObject({
      phase: "countdown",
      players: [
        expect.objectContaining({ slot: 1, score: 0, lives: 3 }),
        expect.objectContaining({ slot: 2, score: 0, lives: 3 }),
      ],
    });
  });
});
