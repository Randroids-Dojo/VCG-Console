export type AudioCueLevel = "quiet" | "standard";

export interface AvSettingsRehearsalSnapshot {
  readonly schemaVersion: 1;
  readonly persistence: "session-only";
  readonly display: Readonly<{
    safeAreaGuide: "hidden" | "visible";
    outputIdentity: "not-enumerated";
    signalMode: "not-reported";
    hdr: "not-reported";
    overscan: "unqualified";
  }>;
  readonly audio: Readonly<{
    cueLevel: AudioCueLevel;
    outputIdentity: "system-default-unverified";
    channelLayout: "not-tested";
    microphone: "not-requested";
  }>;
  readonly authority: Readonly<{
    nativeServiceConnected: false;
    appliesHardwareSettings: false;
  }>;
}

export class AvSettingsRehearsalController {
  #safeAreaGuide = false;
  #cueLevel: AudioCueLevel = "standard";

  snapshot(): AvSettingsRehearsalSnapshot {
    return Object.freeze({
      schemaVersion: 1 as const,
      persistence: "session-only" as const,
      display: Object.freeze({
        safeAreaGuide: this.#safeAreaGuide ? "visible" as const : "hidden" as const,
        outputIdentity: "not-enumerated" as const,
        signalMode: "not-reported" as const,
        hdr: "not-reported" as const,
        overscan: "unqualified" as const,
      }),
      audio: Object.freeze({
        cueLevel: this.#cueLevel,
        outputIdentity: "system-default-unverified" as const,
        channelLayout: "not-tested" as const,
        microphone: "not-requested" as const,
      }),
      authority: Object.freeze({
        nativeServiceConnected: false as const,
        appliesHardwareSettings: false as const,
      }),
    });
  }

  setSafeAreaGuide(visible: boolean): AvSettingsRehearsalSnapshot {
    if (typeof visible !== "boolean") throw new TypeError("safe-area guide must be boolean");
    this.#safeAreaGuide = visible;
    return this.snapshot();
  }

  setCueLevel(level: AudioCueLevel): AvSettingsRehearsalSnapshot {
    if (level !== "quiet" && level !== "standard") {
      throw new TypeError("audio cue level is not supported");
    }
    this.#cueLevel = level;
    return this.snapshot();
  }

  reset(): AvSettingsRehearsalSnapshot {
    this.#safeAreaGuide = false;
    this.#cueLevel = "standard";
    return this.snapshot();
  }
}
