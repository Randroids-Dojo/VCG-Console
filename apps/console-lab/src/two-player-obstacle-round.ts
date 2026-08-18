import type { MotionAction } from "@vcg/motion-contract";
import type { PlayerSlot } from "./player-session";

export type ObstacleRoundPhase =
  | "waiting-for-players"
  | "countdown"
  | "playing"
  | "paused"
  | "finished";
export type ObstacleStance = "standing" | "jumping" | "ducking";
export type ObstacleKind = "lane" | "jump" | "duck";

export interface ObstacleRoundPlayer {
  readonly slot: PlayerSlot;
  readonly lane: 0 | 1 | 2;
  readonly stance: ObstacleStance;
  readonly score: number;
  readonly lives: number;
  readonly lastResult: "ready" | "clear" | "hit";
}

export interface PlayerObstacle {
  readonly id: number;
  readonly slot: PlayerSlot;
  readonly kind: ObstacleKind;
  readonly lane: 0 | 1 | 2;
  readonly progress: number;
  readonly resolved: boolean;
}

export interface ObstacleRoundSnapshot {
  readonly phase: ObstacleRoundPhase;
  readonly resumePhase?: "countdown" | "playing";
  readonly joinedSlots: readonly PlayerSlot[];
  readonly players: readonly ObstacleRoundPlayer[];
  readonly obstacles: readonly PlayerObstacle[];
  readonly countdownRemainingMs: number;
  readonly roundRemainingMs: number;
  readonly totalScore: number;
  readonly winnerSlot?: PlayerSlot;
}

export interface ObstacleRoundOptions {
  readonly countdownMs?: number;
  readonly roundMs?: number;
  readonly spawnIntervalMs?: number;
  readonly obstacleTravelMs?: number;
  readonly startingLives?: number;
}

interface MutablePlayer {
  slot: PlayerSlot;
  lane: 0 | 1 | 2;
  stance: ObstacleStance;
  stanceRemainingMs: number;
  score: number;
  lives: number;
  lastResult: "ready" | "clear" | "hit";
}

interface MutableObstacle {
  id: number;
  slot: PlayerSlot;
  kind: ObstacleKind;
  lane: 0 | 1 | 2;
  remainingMs: number;
  resolved: boolean;
}

/** Slots the arena can seat. A round needs one; it can hold two. */
const MAX_PLAYERS = 2;
const DEFAULT_COUNTDOWN_MS = 3_000;
const DEFAULT_ROUND_MS = 45_000;
const DEFAULT_SPAWN_INTERVAL_MS = 1_550;
const DEFAULT_OBSTACLE_TRAVEL_MS = 2_500;
const DEFAULT_STARTING_LIVES = 3;
const RESOLVED_OBSTACLE_VISIBLE_MS = 450;

export class TwoPlayerObstacleRound {
  readonly #countdownMs: number;
  readonly #roundMs: number;
  readonly #spawnIntervalMs: number;
  readonly #obstacleTravelMs: number;
  readonly #startingLives: number;
  readonly #players = new Map<PlayerSlot, MutablePlayer>();
  readonly #obstacles: MutableObstacle[] = [];
  #joinedSlots: PlayerSlot[] = [];
  #phase: Exclude<ObstacleRoundPhase, "paused"> = "waiting-for-players";
  #suspended = false;
  #countdownRemainingMs = 0;
  #roundRemainingMs = 0;
  #spawnRemainingMs = 0;
  #spawnSequence = 0;
  #winnerSlot: PlayerSlot | undefined;

  constructor(options: ObstacleRoundOptions = {}) {
    this.#countdownMs = positiveDuration(options.countdownMs ?? DEFAULT_COUNTDOWN_MS, "countdownMs");
    this.#roundMs = positiveDuration(options.roundMs ?? DEFAULT_ROUND_MS, "roundMs");
    this.#spawnIntervalMs = positiveDuration(
      options.spawnIntervalMs ?? DEFAULT_SPAWN_INTERVAL_MS,
      "spawnIntervalMs",
    );
    this.#obstacleTravelMs = positiveDuration(
      options.obstacleTravelMs ?? DEFAULT_OBSTACLE_TRAVEL_MS,
      "obstacleTravelMs",
    );
    this.#startingLives = positiveInteger(options.startingLives ?? DEFAULT_STARTING_LIVES, "startingLives");
  }

  snapshot(): ObstacleRoundSnapshot {
    const resumePhase: "countdown" | "playing" | undefined =
      this.#phase === "countdown" ? "countdown" : this.#phase === "playing" ? "playing" : undefined;
    const phase = this.#suspended && resumePhase !== undefined ? "paused" : this.#phase;
    const players = [...this.#players.values()]
      .sort((left, right) => left.slot - right.slot)
      .map(({ stanceRemainingMs: _stanceRemainingMs, ...player }) => ({ ...player }));
    return {
      phase,
      ...(phase === "paused" && resumePhase !== undefined ? { resumePhase } : {}),
      joinedSlots: [...this.#joinedSlots],
      players,
      obstacles: this.#obstacles.map((obstacle) => ({
        id: obstacle.id,
        slot: obstacle.slot,
        kind: obstacle.kind,
        lane: obstacle.lane,
        progress: Math.max(0, Math.min(1.18, 1 - obstacle.remainingMs / this.#obstacleTravelMs)),
        resolved: obstacle.resolved,
      })),
      countdownRemainingMs: this.#countdownRemainingMs,
      roundRemainingMs: this.#roundRemainingMs,
      totalScore: players.reduce((total, player) => total + player.score, 0),
      ...(this.#winnerSlot === undefined ? {} : { winnerSlot: this.#winnerSlot }),
    };
  }

  setRoster(slots: readonly PlayerSlot[]): void {
    const next = [...new Set(slots)].sort((left, right) => left - right);
    if (next.some((slot) => slot !== 1 && slot !== 2) || next.length > MAX_PLAYERS) {
      throw new Error("roster supports only player slots 1 and 2");
    }
    if (sameSlots(next, this.#joinedSlots)) return;
    const joining = next.filter((slot) => !this.#joinedSlots.includes(slot));
    const leaving = this.#joinedSlots.filter((slot) => !next.includes(slot));
    const underWay = this.#phase === "countdown" || this.#phase === "playing";
    this.#joinedSlots = next;
    // Someone stepping in front of the camera mid-run is seated where they
    // stand rather than restarting the round, so a late join never discards
    // the run already in progress. Anything else starts a fresh round.
    if (underWay && joining.length > 0 && leaving.length === 0) {
      for (const slot of joining) this.#players.set(slot, this.#freshPlayer(slot));
      return;
    }
    this.#startFreshRound();
  }

  reset(): void {
    this.#startFreshRound();
  }

  setPaused(paused: boolean): void {
    this.#suspended = paused;
  }

  handleAction(action: MotionAction["name"], slot: PlayerSlot): void {
    if (this.#phase !== "playing" || this.#suspended) return;
    const player = this.#players.get(slot);
    if (!player || player.lives === 0) return;
    if (action === "dodge_left") player.lane = Math.max(0, player.lane - 1) as 0 | 1 | 2;
    if (action === "dodge_right") player.lane = Math.min(2, player.lane + 1) as 0 | 1 | 2;
    if (action === "jump") {
      player.stance = "jumping";
      player.stanceRemainingMs = 650;
    }
    if (action === "duck") {
      player.stance = "ducking";
      player.stanceRemainingMs = 800;
    }
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("deltaMs must be a nonnegative finite number");
    if (this.#suspended || this.#phase === "waiting-for-players" || this.#phase === "finished") return;

    let remainingDelta = deltaMs;
    if (this.#phase === "countdown") {
      const countdownDelta = Math.min(remainingDelta, this.#countdownRemainingMs);
      this.#countdownRemainingMs -= countdownDelta;
      remainingDelta -= countdownDelta;
      if (this.#countdownRemainingMs === 0) {
        this.#phase = "playing";
        this.#spawnPair();
        this.#spawnRemainingMs = this.#spawnIntervalMs;
      }
    }
    if (this.#phase !== "playing" || remainingDelta === 0) return;
    this.#advancePlaying(Math.min(remainingDelta, this.#roundRemainingMs));
  }

  #freshPlayer(slot: PlayerSlot): MutablePlayer {
    return {
      slot,
      lane: 1,
      stance: "standing",
      stanceRemainingMs: 0,
      score: 0,
      lives: this.#startingLives,
      lastResult: "ready",
    };
  }

  #startFreshRound(): void {
    this.#players.clear();
    for (const slot of this.#joinedSlots) {
      this.#players.set(slot, this.#freshPlayer(slot));
    }
    this.#obstacles.length = 0;
    this.#spawnSequence = 0;
    this.#winnerSlot = undefined;
    this.#roundRemainingMs = this.#roundMs;
    this.#spawnRemainingMs = 0;
    // One player is a complete round. A second is welcome, not required.
    if (this.#joinedSlots.length > 0) {
      this.#phase = "countdown";
      this.#countdownRemainingMs = this.#countdownMs;
    } else {
      this.#phase = "waiting-for-players";
      this.#countdownRemainingMs = 0;
    }
  }

  #advancePlaying(deltaMs: number): void {
    for (const player of this.#players.values()) {
      player.stanceRemainingMs = Math.max(0, player.stanceRemainingMs - deltaMs);
      if (player.stanceRemainingMs === 0) player.stance = "standing";
    }

    for (const obstacle of this.#obstacles) {
      obstacle.remainingMs -= deltaMs;
      if (!obstacle.resolved && obstacle.remainingMs <= 0) this.#resolveObstacle(obstacle);
    }
    while (this.#obstacles[0]?.remainingMs !== undefined && this.#obstacles[0].remainingMs < -RESOLVED_OBSTACLE_VISIBLE_MS) {
      this.#obstacles.shift();
    }

    this.#roundRemainingMs = Math.max(0, this.#roundRemainingMs - deltaMs);
    this.#spawnRemainingMs -= deltaMs;
    while (this.#spawnRemainingMs <= 0 && this.#roundRemainingMs > 0) {
      this.#spawnPair();
      this.#spawnRemainingMs += this.#spawnIntervalMs;
    }

    if (
      this.#roundRemainingMs === 0 ||
      [...this.#players.values()].every((player) => player.lives === 0)
    ) {
      this.#finish();
    }
  }

  #spawnPair(): void {
    const kinds: readonly ObstacleKind[] = ["lane", "jump", "duck"];
    for (const slot of this.#joinedSlots) {
      const player = this.#players.get(slot);
      if (!player || player.lives === 0) continue;
      const kind = kinds[(this.#spawnSequence + slot - 1) % kinds.length] ?? "lane";
      const lane = (Math.floor(this.#spawnSequence / kinds.length) + slot - 1) % 3;
      this.#obstacles.push({
        id: this.#spawnSequence * MAX_PLAYERS + slot,
        slot,
        kind,
        lane: kind === "lane" ? lane as 0 | 1 | 2 : 1,
        remainingMs: this.#obstacleTravelMs,
        resolved: false,
      });
    }
    this.#spawnSequence += 1;
  }

  #resolveObstacle(obstacle: MutableObstacle): void {
    obstacle.resolved = true;
    const player = this.#players.get(obstacle.slot);
    if (!player || player.lives === 0) return;
    const avoided =
      (obstacle.kind === "lane" && player.lane !== obstacle.lane) ||
      (obstacle.kind === "jump" && player.stance === "jumping") ||
      (obstacle.kind === "duck" && player.stance === "ducking");
    if (avoided) {
      player.score += 100;
      player.lastResult = "clear";
    } else {
      player.lives = Math.max(0, player.lives - 1);
      player.lastResult = "hit";
    }
  }

  #finish(): void {
    this.#phase = "finished";
    this.#obstacles.length = 0;
    const [player1, player2] = [this.#players.get(1), this.#players.get(2)];
    if (!player1 || !player2) return;
    const player1Rank = player1.score * 100 + player1.lives;
    const player2Rank = player2.score * 100 + player2.lives;
    this.#winnerSlot = player1Rank === player2Rank ? undefined : player1Rank > player2Rank ? 1 : 2;
  }
}

function sameSlots(left: readonly PlayerSlot[], right: readonly PlayerSlot[]): boolean {
  return left.length === right.length && left.every((slot, index) => slot === right[index]);
}

function positiveDuration(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a positive finite number`);
  return value;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}
