import type { MotionActionNameSchema } from "./schema";
import { parseMotionTrace, type MotionFrame, type MotionTrace } from "./schema";
import type { z } from "zod";

export interface ReplayExpectation {
  atMs: number;
  action: z.infer<typeof MotionActionNameSchema>;
  playerId?: string;
  toleranceMs?: number;
}

export interface ReplayExpectationResult extends ReplayExpectation {
  matched: boolean;
  matchedAtMs?: number;
}

export interface MotionTracePlayerOptions {
  loop?: boolean;
  speed?: number;
  expectations?: readonly ReplayExpectation[];
  onFrame: (frame: MotionFrame) => void;
}

/**
 * A clock-independent skeletal trace source. Call advance() from a render loop or
 * a test-controlled clock; it never consults wall time and therefore produces the
 * same frame and event ordering in every environment.
 */
export class MotionTracePlayer {
  readonly #trace: MotionTrace;
  readonly #onFrame: (frame: MotionFrame) => void;
  readonly #expectations: readonly ReplayExpectation[];
  readonly #matches = new Map<number, number>();
  #loop: boolean;
  #speed: number;
  #cursor = 0;
  #positionMs = 0;
  #playing = false;
  #completedLoops = 0;

  constructor(trace: MotionTrace, options: MotionTracePlayerOptions) {
    this.#trace = parseMotionTrace(trace);
    if (this.#trace.frames.length === 0) throw new Error("A motion replay requires at least one frame");
    for (let index = 1; index < this.#trace.frames.length; index += 1) {
      if (this.#trace.frames[index]!.sourceTimestampMs < this.#trace.frames[index - 1]!.sourceTimestampMs) {
        throw new Error("Motion replay frames must be ordered by sourceTimestampMs");
      }
    }
    this.#onFrame = options.onFrame;
    this.#loop = options.loop ?? false;
    this.#speed = MotionTracePlayer.#validSpeed(options.speed ?? 1);
    this.#expectations = options.expectations ?? [];
    for (const expectation of this.#expectations) {
      if (!Number.isFinite(expectation.atMs) || expectation.atMs < 0) throw new Error("Replay expectation atMs must be non-negative");
      if (expectation.toleranceMs !== undefined && (!Number.isFinite(expectation.toleranceMs) || expectation.toleranceMs < 0)) {
        throw new Error("Replay expectation toleranceMs must be finite and non-negative");
      }
    }
  }

  get durationMs(): number {
    return this.#relativeTime(this.#trace.frames.at(-1)!);
  }

  get positionMs(): number {
    return this.#positionMs;
  }

  get playing(): boolean {
    return this.#playing;
  }

  get completedLoops(): number {
    return this.#completedLoops;
  }

  play(): void {
    this.#playing = true;
  }

  pause(): void {
    this.#playing = false;
  }

  setLoop(loop: boolean): void {
    this.#loop = loop;
  }

  setSpeed(speed: number): void {
    this.#speed = MotionTracePlayer.#validSpeed(speed);
  }

  seek(positionMs: number): void {
    if (!Number.isFinite(positionMs)) throw new Error("Replay seek position must be finite");
    this.#positionMs = Math.min(this.durationMs, Math.max(0, positionMs));
    this.#cursor = this.#trace.frames.findIndex((frame) => this.#relativeTime(frame) >= this.#positionMs);
    if (this.#cursor < 0) this.#cursor = this.#trace.frames.length;
  }

  reset(): void {
    this.#cursor = 0;
    this.#positionMs = 0;
    this.#playing = false;
    this.#completedLoops = 0;
    this.#matches.clear();
  }

  advance(elapsedMs: number): MotionFrame[] {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Replay elapsed time must be non-negative");
    if (!this.#playing) return [];

    this.#positionMs += elapsedMs * this.#speed;
    const emitted: MotionFrame[] = [];
    while (true) {
      while (this.#cursor < this.#trace.frames.length && this.#relativeTime(this.#trace.frames[this.#cursor]!) <= this.#positionMs) {
        const frame = this.#trace.frames[this.#cursor]!;
        emitted.push(frame);
        this.#onFrame(frame);
        this.#recordExpectations(frame);
        this.#cursor += 1;
      }

      if (this.#cursor < this.#trace.frames.length) break;
      if (!this.#loop || this.durationMs <= 0) {
        this.#positionMs = this.durationMs;
        this.#playing = false;
        break;
      }
      this.#completedLoops += 1;
      this.#positionMs -= this.durationMs;
      this.#cursor = 0;
      if (this.#positionMs < 0) this.#positionMs = 0;
    }
    return emitted;
  }

  expectationResults(): ReplayExpectationResult[] {
    return this.#expectations.map((expectation, index) => {
      const matchedAtMs = this.#matches.get(index);
      return { ...expectation, matched: matchedAtMs !== undefined, ...(matchedAtMs === undefined ? {} : { matchedAtMs }) };
    });
  }

  #relativeTime(frame: MotionFrame): number {
    return frame.sourceTimestampMs - this.#trace.frames[0]!.sourceTimestampMs;
  }

  #recordExpectations(frame: MotionFrame): void {
    const atMs = this.#relativeTime(frame);
    this.#expectations.forEach((expectation, index) => {
      if (this.#matches.has(index)) return;
      const toleranceMs = expectation.toleranceMs ?? 0;
      if (Math.abs(atMs - expectation.atMs) > toleranceMs) return;
      const players = expectation.playerId ? frame.players.filter((player) => player.id === expectation.playerId) : frame.players;
      if (players.some((player) => player.actions.some((action) => action.name === expectation.action))) this.#matches.set(index, atMs);
    });
  }

  static #validSpeed(speed: number): number {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error("Replay speed must be greater than zero");
    return speed;
  }
}
