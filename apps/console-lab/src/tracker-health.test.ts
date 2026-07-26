import { describe, expect, it } from "vitest";
import { trackerHealthFixture, trackerHealthPresentation } from "./tracker-health";

describe("tracker health presentation", () => {
  it.each([
    ["initializing", "starting", "blocked", "STARTING"],
    ["restarting", "starting", "blocked", "RESTARTING"],
    ["healthy", "ready", "full", "READY"],
    ["low-confidence", "degraded", "landmarks-only", "LOW CONF"],
    ["overload", "degraded", "landmarks-only", "OVERLOAD"],
    ["fallback-backend", "degraded", "landmarks-only", "FALLBACK"],
    ["camera-unavailable", "fault", "blocked", "NO CAMERA"],
    ["camera-disconnected", "fault", "blocked", "CAMERA LOST"],
    ["backend-fault", "fault", "blocked", "FAULT"],
  ] as const)("maps %s to deterministic control and visible copy", (reason, status, controlAvailability, badge) => {
    const event = trackerHealthFixture(reason, 1, 100);
    expect(event).toMatchObject({ reason, status, controlAvailability });
    expect(trackerHealthPresentation(event)).toMatchObject({ badge });
  });

  it("does not expose provider exception text in a health event", () => {
    const event = trackerHealthFixture("backend-fault", 2, 200, "mediapipe-web");
    expect(Object.keys(event).sort()).toEqual([
      "controlAvailability",
      "occurredAtMs",
      "reason",
      "schemaVersion",
      "sequence",
      "source",
      "status",
    ]);
  });
});
