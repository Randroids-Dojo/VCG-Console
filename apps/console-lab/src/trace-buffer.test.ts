import { describe, expect, it } from "vitest";
import { syntheticFrame } from "./synthetic";
import { TraceBuffer } from "./trace-buffer";

describe("TraceBuffer", () => {
  it("retains a bounded skeleton-only replay", () => {
    const trace = new TraceBuffer(2);
    trace.push(syntheticFrame(1, 10));
    trace.push(syntheticFrame(2, 20));
    trace.push(syntheticFrame(3, 30));
    const snapshot = trace.snapshot();
    expect(snapshot.frames.map((frame) => frame.sequence)).toEqual([2, 3]);
    expect(snapshot.containsRawFrames).toBe(false);
    const keys = new Set<string>();
    JSON.stringify(snapshot, (key, value) => {
      keys.add(key);
      return value;
    });
    expect(keys).not.toContain("imageData");
    expect(keys).not.toContain("rawFrame");
    expect(keys).not.toContain("videoFrame");
  });
});
