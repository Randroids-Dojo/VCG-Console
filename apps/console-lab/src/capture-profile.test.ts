import { describe, expect, it } from "vitest";
import {
  CAPTURE_PROFILES,
  DEFAULT_CAPTURE_PROFILE,
  captureConstraints,
  captureModeLabel,
  captureProfileFromSearch,
  describeCaptureMode,
} from "./capture-profile";

describe("capture profiles", () => {
  it("defaults to the smallest declared mode", () => {
    expect(DEFAULT_CAPTURE_PROFILE.id).toBe("low-power");
    expect([
      DEFAULT_CAPTURE_PROFILE.width,
      DEFAULT_CAPTURE_PROFILE.height,
      DEFAULT_CAPTURE_PROFILE.frameRate,
    ]).toEqual([640, 480, 30]);
  });

  it("keeps the product contract mode available and unchanged", () => {
    const target = CAPTURE_PROFILES.find((profile) => profile.id === "target");
    expect([target?.width, target?.height, target?.frameRate]).toEqual([1920, 1080, 60]);
  });

  it("requests every dimension as ideal so a usable camera still opens", () => {
    const balanced = CAPTURE_PROFILES.find((profile) => profile.id === "balanced");
    expect(captureConstraints(balanced!)).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: "user",
    });
  });

  it("selects only an exactly declared identifier and otherwise falls back", () => {
    for (const profile of CAPTURE_PROFILES) {
      expect(captureProfileFromSearch(`?capture=${profile.id}`)).toBe(profile);
    }
    expect(captureProfileFromSearch("?other=1&capture=balanced").id).toBe("balanced");
    for (const rejected of ["", "?capture=", "?capture=LOW-POWER", "?capture=4k", "?capture=target%20"]) {
      expect(captureProfileFromSearch(rejected)).toBe(DEFAULT_CAPTURE_PROFILE);
    }
  });

  it("spells a capture mode one way everywhere it is shown", () => {
    expect(captureModeLabel(DEFAULT_CAPTURE_PROFILE)).toBe("640x480 at 30 FPS (low-power)");
  });

  it("reports the requested and the observed mode separately", () => {
    expect(
      describeCaptureMode(DEFAULT_CAPTURE_PROFILE, { width: 640, height: 480, frameRate: 30 }),
    ).toBe(
      "Capture mode: requested 640x480 at 30 FPS (low-power); the camera reported 640x480 at 30 FPS.",
    );
    expect(
      describeCaptureMode(DEFAULT_CAPTURE_PROFILE, { width: 320, height: 240, frameRate: 15 }),
    ).toContain("the camera reported 320x240 at 15 FPS");
    expect(describeCaptureMode(DEFAULT_CAPTURE_PROFILE, undefined)).toContain(
      "the camera reported no mode",
    );
    expect(describeCaptureMode(DEFAULT_CAPTURE_PROFILE, {})).toContain("the camera reported no mode");
    // A camera that reports a size but no frame rate.
    expect(describeCaptureMode(DEFAULT_CAPTURE_PROFILE, { width: 640, height: 480 })).toContain(
      "an unreported frame rate",
    );
  });
});
