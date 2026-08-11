import { describe, expect, it } from "vitest";
import {
  createCircuitShiftGame,
  hasAvailableMove,
  isCircuitShiftEntry,
  moveCircuitShift,
  restoreCircuitShift,
  serializeCircuitShift,
  type CircuitShiftState,
} from "./circuit-shift";

const fixedRandom = (...values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

describe("Circuit Shift", () => {
  it("starts with two charges in deterministic open cells", () => {
    const game = createCircuitShiftGame(fixedRandom(0, 0, 0.99, 0.95));
    expect(game.board.filter(Boolean)).toEqual([2, 4]);
    expect(game.status).toBe("playing");
  });

  it("merges each charge at most once and spawns after a changed move", () => {
    const state: CircuitShiftState = {
      board: [2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      score: 0,
      best: 0,
      status: "playing",
    };
    const moved = moveCircuitShift(state, "left", fixedRandom(0, 0));
    expect(moved.board.slice(0, 4)).toEqual([4, 4, 2, 0]);
    expect(moved.score).toBe(8);
    expect(moved.best).toBe(8);
  });

  it("does not spawn or replace state for an unchanged move", () => {
    const state: CircuitShiftState = {
      board: [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      score: 12,
      best: 30,
      status: "playing",
    };
    expect(moveCircuitShift(state, "left", () => { throw new Error("unexpected random call"); })).toBe(state);
  });

  it("recognizes full dead boards and mergeable full boards", () => {
    expect(hasAvailableMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2])).toBe(false);
    expect(hasAvailableMove([2, 2, 4, 8, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128])).toBe(true);
  });

  it("round-trips bounded local progress and rejects malformed data", () => {
    const game = createCircuitShiftGame(fixedRandom(0, 0, 0.5, 0));
    expect(restoreCircuitShift(serializeCircuitShift(game))).toEqual(game);
    expect(restoreCircuitShift('{"version":1,"board":[3],"score":0,"best":0}')).toBeUndefined();
    expect(restoreCircuitShift(JSON.stringify({
      version: 1,
      board: Array.from({ length: 16 }, () => 0),
      score: 0,
      best: 0,
    }))).toBeUndefined();
    expect(restoreCircuitShift("not json")).toBeUndefined();
  });

  it("keeps maximum charges and scores inside the persisted domain", () => {
    const state: CircuitShiftState = {
      board: [1_048_576, 1_048_576, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      score: 999_999_998,
      best: 999_999_998,
      status: "playing",
    };
    const moved = moveCircuitShift(state, "right", fixedRandom(0, 0));
    expect(moved.board.filter((charge) => charge === 1_048_576)).toHaveLength(2);
    expect(moved.score).toBe(999_999_998);
    expect(restoreCircuitShift(serializeCircuitShift(moved))).toEqual(moved);

    expect(() => serializeCircuitShift({ ...state, board: Array.from({ length: 16 }, () => 0) })).toThrow(RangeError);
    expect(() => serializeCircuitShift({ ...state, score: 1_000_000_000 })).toThrow(RangeError);
  });

  it("only recognizes the embedded Circuit Shift release", () => {
    const embedded = {
      id: "circuit-shift",
      version: "1.0.0",
      runtime: "local-web",
      entrypoint: "builtin:circuit-shift",
    };
    expect(isCircuitShiftEntry(embedded)).toBe(true);
    expect(isCircuitShiftEntry({ ...embedded, version: "2.0.0" })).toBe(false);
  });
});
