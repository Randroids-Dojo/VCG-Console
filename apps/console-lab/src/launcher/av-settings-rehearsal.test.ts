import { describe, expect, it } from "vitest";
import { AvSettingsRehearsalController } from "./av-settings-rehearsal";

describe("display and audio settings rehearsal", () => {
  it("starts with a closed session-only non-authoritative snapshot", () => {
    expect(new AvSettingsRehearsalController().snapshot()).toEqual({
      schemaVersion: 1,
      persistence: "session-only",
      display: {
        safeAreaGuide: "hidden",
        outputIdentity: "not-enumerated",
        signalMode: "not-reported",
        hdr: "not-reported",
        overscan: "unqualified",
      },
      audio: {
        cueLevel: "standard",
        outputIdentity: "system-default-unverified",
        channelLayout: "not-tested",
        microphone: "not-requested",
      },
      authority: {
        nativeServiceConnected: false,
        appliesHardwareSettings: false,
      },
    });
  });

  it("changes only the bounded preview controls and resets completely", () => {
    const controller = new AvSettingsRehearsalController();
    expect(controller.setSafeAreaGuide(true).display.safeAreaGuide).toBe("visible");
    expect(controller.setCueLevel("quiet").audio.cueLevel).toBe("quiet");
    expect(controller.reset()).toMatchObject({
      display: { safeAreaGuide: "hidden" },
      audio: { cueLevel: "standard" },
    });
  });

  it("returns frozen detached snapshots", () => {
    const controller = new AvSettingsRehearsalController();
    const first = controller.snapshot();
    controller.setSafeAreaGuide(true);
    expect(first.display.safeAreaGuide).toBe("hidden");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.display)).toBe(true);
    expect(Object.isFrozen(first.audio)).toBe(true);
    expect(Object.isFrozen(first.authority)).toBe(true);
  });

  it("rejects open runtime values", () => {
    const controller = new AvSettingsRehearsalController();
    expect(() => controller.setCueLevel("loud" as never)).toThrow(
      "audio cue level is not supported",
    );
    expect(() => controller.setSafeAreaGuide("yes" as never)).toThrow(
      "safe-area guide must be boolean",
    );
  });
});
