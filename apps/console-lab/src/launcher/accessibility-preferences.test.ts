import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_PREFERENCES_MAX_BYTES,
  ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
  AccessibilityPreferenceController,
  applyAccessibilityPreferences,
} from "./accessibility-preferences";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("read denied");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("write denied");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWrites) throw new Error("remove denied");
    this.values.delete(key);
  }
}

describe("AccessibilityPreferenceController", () => {
  it("starts with conservative device defaults and no write", () => {
    const storage = new MemoryStorage();
    const snapshot = new AccessibilityPreferenceController(storage).snapshot();

    expect(snapshot).toEqual({
      preferences: {
        schemaVersion: 1,
        textScale: "standard",
        contrast: "standard",
        motion: "system",
        seatedPlay: "standard",
        confirmButton: "south",
        audioCues: "on",
      },
      persistence: "default",
    });
    expect(storage.values.size).toBe(0);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.preferences)).toBe(true);
  });

  it("persists and restores only the closed versioned document", () => {
    const storage = new MemoryStorage();
    const controller = new AccessibilityPreferenceController(storage);
    const saved = controller.update({
      textScale: "large",
      contrast: "high",
      motion: "reduced",
      seatedPlay: "preferred",
      confirmButton: "west",
      audioCues: "off",
    });

    expect(saved.persistence).toBe("saved");
    const serialized = storage.values.get(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    expect(serialized).toBeDefined();
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      ACCESSIBILITY_PREFERENCES_MAX_BYTES,
    );
    expect(new AccessibilityPreferenceController(storage).snapshot()).toEqual(saved);
  });

  it("rejects unknown, malformed, oversized, and out-of-vocabulary stored state", () => {
    const invalidDocuments = [
      "{",
      JSON.stringify({ schemaVersion: 2 }),
      JSON.stringify({
        schemaVersion: 1,
        textScale: "huge",
        contrast: "standard",
        motion: "system",
        seatedPlay: "standard",
        confirmButton: "south",
        audioCues: "on",
      }),
      JSON.stringify({
        schemaVersion: 1,
        textScale: "standard",
        contrast: "standard",
        motion: "system",
        seatedPlay: "standard",
        confirmButton: "south",
        audioCues: "on",
        profileId: "profile-randy",
      }),
      " ".repeat(ACCESSIBILITY_PREFERENCES_MAX_BYTES + 1),
    ];

    for (const serialized of invalidDocuments) {
      const storage = new MemoryStorage();
      storage.values.set(ACCESSIBILITY_PREFERENCES_STORAGE_KEY, serialized);
      const snapshot = new AccessibilityPreferenceController(storage).snapshot();
      expect(snapshot.persistence).toBe("rejected");
      expect(snapshot.preferences.textScale).toBe("standard");
    }
  });

  it("keeps valid changes volatile when storage is unavailable", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const controller = new AccessibilityPreferenceController(storage);

    expect(controller.update({ contrast: "high" })).toMatchObject({
      preferences: { contrast: "high" },
      persistence: "volatile",
    });
    expect(controller.reset()).toMatchObject({
      preferences: { contrast: "standard" },
      persistence: "volatile",
    });

    const unreadableStorage = new MemoryStorage();
    unreadableStorage.failReads = true;
    expect(new AccessibilityPreferenceController(unreadableStorage).snapshot().persistence)
      .toBe("volatile");
  });

  it("rejects invalid runtime changes and resets the complete document", () => {
    const storage = new MemoryStorage();
    const controller = new AccessibilityPreferenceController(storage);
    controller.update({ textScale: "large", audioCues: "off" });

    expect(() =>
      controller.update({ textScale: "enormous" as never }),
    ).toThrow(TypeError);
    expect(controller.reset()).toMatchObject({
      preferences: { textScale: "standard", audioCues: "on" },
      persistence: "default",
    });
    expect(storage.values.has(ACCESSIBILITY_PREFERENCES_STORAGE_KEY)).toBe(false);
  });

  it("applies every preference as an explicit root contract", () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    const storage = new MemoryStorage();
    const snapshot = new AccessibilityPreferenceController(storage).update({
      textScale: "large",
      contrast: "high",
      motion: "reduced",
      seatedPlay: "preferred",
      confirmButton: "west",
      audioCues: "off",
    });

    applyAccessibilityPreferences(root, snapshot);
    expect(root.dataset).toMatchObject({
      vcgTextScale: "large",
      vcgContrast: "high",
      vcgMotion: "reduced",
      vcgSeatedPlay: "preferred",
      vcgConfirmButton: "west",
      vcgAudioCues: "off",
    });
  });
});
