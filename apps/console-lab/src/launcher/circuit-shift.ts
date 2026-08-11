export const CIRCUIT_SHIFT_SIZE = 4;
export const CIRCUIT_SHIFT_STORAGE_KEY = "vcg.console.circuit-shift.v1";

export type CircuitShiftDirection = "left" | "up" | "right" | "down";
export type CircuitShiftStatus = "playing" | "game-over";

export interface CircuitShiftState {
  readonly board: readonly number[];
  readonly score: number;
  readonly best: number;
  readonly status: CircuitShiftStatus;
}

interface StoredCircuitShiftState {
  readonly version: 1;
  readonly board: readonly number[];
  readonly score: number;
  readonly best: number;
}

export function createCircuitShiftGame(
  random: () => number = Math.random,
  best = 0,
): CircuitShiftState {
  let board = emptyBoard();
  board = spawnCharge(board, random);
  board = spawnCharge(board, random);
  return { board, score: 0, best: validCounter(best) ? best : 0, status: "playing" };
}

export function moveCircuitShift(
  state: CircuitShiftState,
  direction: CircuitShiftDirection,
  random: () => number = Math.random,
): CircuitShiftState {
  if (state.status === "game-over") return state;

  const nextBoard = [...state.board];
  let gained = 0;
  for (let index = 0; index < CIRCUIT_SHIFT_SIZE; index += 1) {
    const positions = linePositions(direction, index);
    const collapsed = collapseLine(positions.map((position) => state.board[position] ?? 0));
    gained += collapsed.gained;
    positions.forEach((position, offset) => {
      nextBoard[position] = collapsed.values[offset] ?? 0;
    });
  }

  if (boardsEqual(state.board, nextBoard)) return state;
  const board = spawnCharge(nextBoard, random);
  const score = state.score + gained;
  return {
    board,
    score,
    best: Math.max(state.best, score),
    status: hasAvailableMove(board) ? "playing" : "game-over",
  };
}

export function serializeCircuitShift(state: CircuitShiftState): string {
  const stored: StoredCircuitShiftState = {
    version: 1,
    board: state.board,
    score: state.score,
    best: state.best,
  };
  return JSON.stringify(stored);
}

export function restoreCircuitShift(value: string | null): CircuitShiftState | undefined {
  if (value === null || value.length > 2_048) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<StoredCircuitShiftState>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.board) ||
      parsed.board.length !== CIRCUIT_SHIFT_SIZE ** 2 ||
      !parsed.board.every(validCharge) ||
      !validCounter(parsed.score) ||
      !validCounter(parsed.best)
    ) {
      return undefined;
    }
    const board = [...parsed.board];
    return {
      board,
      score: parsed.score,
      best: Math.max(parsed.best, parsed.score),
      status: hasAvailableMove(board) ? "playing" : "game-over",
    };
  } catch {
    return undefined;
  }
}

export function hasAvailableMove(board: readonly number[]): boolean {
  if (board.some((value) => value === 0)) return true;
  for (let row = 0; row < CIRCUIT_SHIFT_SIZE; row += 1) {
    for (let column = 0; column < CIRCUIT_SHIFT_SIZE; column += 1) {
      const current = board[row * CIRCUIT_SHIFT_SIZE + column];
      if (column + 1 < CIRCUIT_SHIFT_SIZE && current === board[row * CIRCUIT_SHIFT_SIZE + column + 1]) return true;
      if (row + 1 < CIRCUIT_SHIFT_SIZE && current === board[(row + 1) * CIRCUIT_SHIFT_SIZE + column]) return true;
    }
  }
  return false;
}

function emptyBoard(): number[] {
  return Array.from({ length: CIRCUIT_SHIFT_SIZE ** 2 }, () => 0);
}

function spawnCharge(board: readonly number[], random: () => number): number[] {
  const open = board.flatMap((value, index) => value === 0 ? [index] : []);
  if (open.length === 0) return [...board];
  const selection = Math.min(open.length - 1, Math.floor(clampRandom(random()) * open.length));
  const result = [...board];
  result[open[selection]!] = clampRandom(random()) < 0.9 ? 2 : 4;
  return result;
}

function collapseLine(values: readonly number[]): { values: number[]; gained: number } {
  const charged = values.filter((value) => value !== 0);
  const merged: number[] = [];
  let gained = 0;
  for (let index = 0; index < charged.length; index += 1) {
    const current = charged[index]!;
    if (current === charged[index + 1]) {
      const combined = current * 2;
      merged.push(combined);
      gained += combined;
      index += 1;
    } else {
      merged.push(current);
    }
  }
  return {
    values: [...merged, ...Array.from({ length: CIRCUIT_SHIFT_SIZE - merged.length }, () => 0)],
    gained,
  };
}

function linePositions(direction: CircuitShiftDirection, index: number): number[] {
  const forward = Array.from({ length: CIRCUIT_SHIFT_SIZE }, (_, offset) => offset);
  const order = direction === "right" || direction === "down" ? forward.reverse() : forward;
  return order.map((offset) =>
    direction === "left" || direction === "right"
      ? index * CIRCUIT_SHIFT_SIZE + offset
      : offset * CIRCUIT_SHIFT_SIZE + index,
  );
}

function validCharge(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_048_576 && (value === 0 || (value & (value - 1)) === 0);
}

function validCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999;
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999_999_999, value));
}

function boardsEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.every((value, index) => value === right[index]);
}
