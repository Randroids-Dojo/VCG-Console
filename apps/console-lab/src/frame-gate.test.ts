import { describe, expect, it } from "vitest";
import { FrameGate } from "./frame-gate";

describe("FrameGate", () => {
  it("allows only one inference frame in flight", () => {
    const gate = new FrameGate();
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    expect(gate.droppedFrames).toBe(1);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it("resets frame pressure between camera sessions", () => {
    const gate = new FrameGate();
    gate.tryAcquire();
    gate.tryAcquire();
    gate.reset();
    expect(gate.droppedFrames).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
  });
});
