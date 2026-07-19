import { describe, expect, it } from "vitest";
import { TrackingLossController } from "./tracking-loss";

describe("TrackingLossController", () => {
  it("confirms loss across time instead of freezing on one frame", () => {
    const loss = new TrackingLossController();
    expect(loss.update(100, true, true)).toBeUndefined();
    expect(loss.update(250, false, true)).toBeUndefined();
    expect(loss.update(399, false, true)).toBeUndefined();
    expect(loss.update(400, false, true)).toBe("freeze");
  });

  it("silently recovers the same session inside two seconds", () => {
    const loss = new TrackingLossController();
    loss.update(100, true, true);
    expect(loss.update(400, false, true)).toBe("freeze");
    expect(loss.update(1_900, true, true)).toBe("recovered");
  });

  it("opens recovery only after the reacquisition window expires", () => {
    const loss = new TrackingLossController();
    loss.update(100, true, true);
    expect(loss.update(400, false, true)).toBe("freeze");
    expect(loss.update(2_399, false, true)).toBeUndefined();
    expect(loss.update(2_400, false, true)).toBe("show-recovery");
  });
});
