import { describe, expect, it } from "vitest";
import {
  CAMERA_SHUTTER_DETAIL,
  CAMERA_SHUTTER_STATE,
  cameraStateForStartFailure,
  cameraStateForTrackerStatus,
  cameraStatePresentation,
  type CameraSoftwareState,
} from "./camera-state";

describe("camera state presentation", () => {
  it.each([
    ["idle", "disabled"],
    ["stopped", "disabled"],
    ["loading", "starting"],
    ["requesting-camera", "requesting-permission"],
    ["running", "active"],
    ["fault", undefined],
  ] as const)("maps tracker status %s without guessing a fault cause", (status, expected) => {
    expect(cameraStateForTrackerStatus(status)).toBe(expected);
  });

  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "unavailable"],
    ["NotReadableError", "unavailable"],
    ["OverconstrainedError", "unavailable"],
    ["AbortError", "failed"],
    ["UnknownError", "failed"],
  ] as const)("classifies %s without exposing provider text", (name, expected) => {
    const error = Object.assign(new Error("private provider detail"), { name });
    expect(cameraStateForStartFailure(error)).toBe(expected);
    expect(cameraStatePresentation(expected).detail).not.toContain("private provider detail");
  });

  it("keeps every state explicit about software access, stream activity, and unsensed shutter position", () => {
    const states: readonly CameraSoftwareState[] = [
      "disabled",
      "starting",
      "requesting-permission",
      "active",
      "permission-denied",
      "unavailable",
      "disconnected",
      "failed",
    ];
    for (const state of states) {
      const presentation = cameraStatePresentation(state);
      expect(presentation.badge).not.toBe("");
      expect(presentation.access).not.toBe("");
      expect(presentation.activity).not.toBe("");
      expect(presentation.detail).not.toMatch(/shutter\s+(?:is\s+)?(?:open|closed)/i);
    }
    expect(CAMERA_SHUTTER_STATE).toBe("NOT SENSED");
    expect(CAMERA_SHUTTER_DETAIL).toContain("Check the shutter directly");
    expect(CAMERA_SHUTTER_DETAIL).not.toMatch(/shutter\s+(?:is\s+)?(?:open|closed)/i);
  });

  it("fails unknown and hostile-shaped exceptions to a bounded state", () => {
    expect(cameraStateForStartFailure("secret provider error")).toBe("failed");
    expect(cameraStateForStartFailure({ name: "NotAllowedError" })).toBe("failed");
    expect(cameraStateForStartFailure(null)).toBe("failed");
  });
});
