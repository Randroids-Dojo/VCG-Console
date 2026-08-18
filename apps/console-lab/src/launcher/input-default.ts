/**
 * Which input the console reaches for when it starts.
 *
 * A body-only household has no controller to open the camera with, so motion
 * is the default and the camera starts with the console. A household that
 * would rather the camera stayed off until asked can say so here, and that
 * choice is the only thing that keeps it off at boot.
 */

export const INPUT_DEFAULT_STORAGE_KEY = "vcg.input-default.v1";
export const INPUT_DEFAULT_MAX_BYTES = 256;

export type ConsoleInputDefault = "motion" | "controller";

const VALUES: readonly ConsoleInputDefault[] = ["motion", "controller"];

interface InputDefaultStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parse(raw: string | null): ConsoleInputDefault | undefined {
  if (raw === null || raw.length > INPUT_DEFAULT_MAX_BYTES) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    const stored = (value as { input?: unknown }).input;
    return VALUES.find((candidate) => candidate === stored);
  } catch {
    return undefined;
  }
}

export class InputDefaultController {
  #value: ConsoleInputDefault;

  constructor(private readonly storage?: InputDefaultStorage) {
    let stored: ConsoleInputDefault | undefined;
    try {
      stored = parse(storage?.getItem(INPUT_DEFAULT_STORAGE_KEY) ?? null);
    } catch {
      stored = undefined;
    }
    // Unreadable or absent storage means nobody has chosen, and the console
    // has to be usable by someone standing in front of it with no controller.
    this.#value = stored ?? "motion";
  }

  get value(): ConsoleInputDefault {
    return this.#value;
  }

  /** Whether the camera should open as the console starts. */
  get startsCamera(): boolean {
    return this.#value === "motion";
  }

  set(next: ConsoleInputDefault): ConsoleInputDefault {
    this.#value = next;
    try {
      this.storage?.setItem(
        INPUT_DEFAULT_STORAGE_KEY,
        JSON.stringify({ input: next }),
      );
    } catch {
      // A full or blocked store still leaves the choice active this session.
    }
    return this.#value;
  }
}
