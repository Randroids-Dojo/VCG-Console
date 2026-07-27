import { describe, expect, it } from "vitest";
import {
  hasUnsafeVisibleTextCharacter,
  unicodeScalarLength,
} from "./visible-text";

const unsafeRanges = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0xd800, 0xdfff],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfff9, 0xfffb],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0020, 0xe007f],
] as const;
const unsafeSingles = [
  0x00ad,
  0x061c,
  0x180e,
  0xfeff,
  0xe0001,
] as const;
const gameController = String.fromCodePoint(0x1f3ae);

describe("visible text boundaries", () => {
  it("rejects every enumerated control, surrogate, and invisible format value", () => {
    for (const [first, last] of unsafeRanges) {
      for (let codePoint = first; codePoint <= last; codePoint += 1) {
        expect(
          hasUnsafeVisibleTextCharacter(String.fromCodePoint(codePoint)),
          `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        ).toBe(true);
      }
    }
    for (const codePoint of unsafeSingles) {
      expect(
        hasUnsafeVisibleTextCharacter(String.fromCodePoint(codePoint)),
        `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
      ).toBe(true);
    }
  });

  it("rejects non-ASCII whitespace while preserving ordinary visible text", () => {
    for (const value of ["\u00a0", "\u1680", "\u2000", "\u202f", "\u205f", "\u3000"]) {
      expect(hasUnsafeVisibleTextCharacter(value)).toBe(true);
    }
    for (const value of [
      "Player One",
      "Rene\u0301".normalize("NFC"),
      String.fromCodePoint(0x73a9, 0x5bb6),
      gameController,
    ]) {
      expect(hasUnsafeVisibleTextCharacter(value)).toBe(false);
    }
  });

  it("counts astral values as one Unicode scalar", () => {
    expect(unicodeScalarLength(gameController.repeat(80))).toBe(80);
  });
});
