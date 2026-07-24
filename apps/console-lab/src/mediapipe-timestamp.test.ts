import { describe, expect, it } from "vitest";
import { nextMediaPipeTimestampMs } from "./mediapipe-timestamp";

describe("MediaPipe video timestamps", () => {
  it("preserves increasing worker time while repairing duplicate or backward samples", () => {
    expect(nextMediaPipeTimestampMs(12.9, undefined)).toBe(12);
    expect(nextMediaPipeTimestampMs(20.1, 12)).toBe(20);
    expect(nextMediaPipeTimestampMs(20.9, 20)).toBe(21);
    expect(nextMediaPipeTimestampMs(19.2, 21)).toBe(22);
  });
});
