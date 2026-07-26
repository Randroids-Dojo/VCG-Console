export const ACCESSIBILITY_PREFERENCES_SCHEMA_VERSION = 1 as const;
export const ACCESSIBILITY_PREFERENCES_STORAGE_KEY = "vcg.accessibility.v1";
export const ACCESSIBILITY_PREFERENCES_MAX_BYTES = 1_024;

export type AccessibilityTextScale = "standard" | "large";
export type AccessibilityContrast = "standard" | "high";
export type AccessibilityMotion = "system" | "reduced";
export type AccessibilitySeatedPlay = "standard" | "preferred";
export type AccessibilityConfirmButton = "south" | "west";
export type AccessibilityAudioCues = "on" | "off";
export type AccessibilityPersistence = "default" | "saved" | "volatile" | "rejected";

export interface AccessibilityPreferences {
  schemaVersion: typeof ACCESSIBILITY_PREFERENCES_SCHEMA_VERSION;
  textScale: AccessibilityTextScale;
  contrast: AccessibilityContrast;
  motion: AccessibilityMotion;
  seatedPlay: AccessibilitySeatedPlay;
  confirmButton: AccessibilityConfirmButton;
  audioCues: AccessibilityAudioCues;
}

export interface AccessibilityPreferenceSnapshot {
  preferences: Readonly<AccessibilityPreferences>;
  persistence: AccessibilityPersistence;
}

export type AccessibilityPreferenceChange = Partial<
  Omit<AccessibilityPreferences, "schemaVersion">
>;

interface AccessibilityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const preferenceKeys = [
  "schemaVersion",
  "textScale",
  "contrast",
  "motion",
  "seatedPlay",
  "confirmButton",
  "audioCues",
] as const;
const sortedPreferenceKeys = [...preferenceKeys].sort();

const defaultPreferences: AccessibilityPreferences = {
  schemaVersion: ACCESSIBILITY_PREFERENCES_SCHEMA_VERSION,
  textScale: "standard",
  contrast: "standard",
  motion: "system",
  seatedPlay: "standard",
  confirmButton: "south",
  audioCues: "on",
};

function freezeSnapshot(
  preferences: AccessibilityPreferences,
  persistence: AccessibilityPersistence,
): AccessibilityPreferenceSnapshot {
  return Object.freeze({
    preferences: Object.freeze({ ...preferences }),
    persistence,
  });
}

function hasExactPreferenceKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === preferenceKeys.length &&
    sortedPreferenceKeys.every((key, index) => keys[index] === key)
  );
}

function parsePreferences(serialized: string): AccessibilityPreferences | undefined {
  if (new TextEncoder().encode(serialized).byteLength > ACCESSIBILITY_PREFERENCES_MAX_BYTES) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!hasExactPreferenceKeys(record)) return undefined;
  if (record.schemaVersion !== ACCESSIBILITY_PREFERENCES_SCHEMA_VERSION) return undefined;
  if (record.textScale !== "standard" && record.textScale !== "large") return undefined;
  if (record.contrast !== "standard" && record.contrast !== "high") return undefined;
  if (record.motion !== "system" && record.motion !== "reduced") return undefined;
  if (record.seatedPlay !== "standard" && record.seatedPlay !== "preferred") return undefined;
  if (record.confirmButton !== "south" && record.confirmButton !== "west") return undefined;
  if (record.audioCues !== "on" && record.audioCues !== "off") return undefined;
  return {
    schemaVersion: ACCESSIBILITY_PREFERENCES_SCHEMA_VERSION,
    textScale: record.textScale,
    contrast: record.contrast,
    motion: record.motion,
    seatedPlay: record.seatedPlay,
    confirmButton: record.confirmButton,
    audioCues: record.audioCues,
  };
}

export class AccessibilityPreferenceController {
  readonly #storage: AccessibilityStorage;
  #preferences: AccessibilityPreferences;
  #persistence: AccessibilityPersistence;

  constructor(storage: AccessibilityStorage) {
    this.#storage = storage;
    let serialized: string | null;
    try {
      serialized = storage.getItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
    } catch {
      serialized = null;
      this.#preferences = { ...defaultPreferences };
      this.#persistence = "volatile";
      return;
    }
    const restored = serialized === null ? undefined : parsePreferences(serialized);
    this.#preferences = restored ?? { ...defaultPreferences };
    this.#persistence = restored
      ? "saved"
      : serialized === null
        ? "default"
        : "rejected";
  }

  snapshot(): AccessibilityPreferenceSnapshot {
    return freezeSnapshot(this.#preferences, this.#persistence);
  }

  update(change: AccessibilityPreferenceChange): AccessibilityPreferenceSnapshot {
    const candidate = { ...this.#preferences, ...change };
    const validated = parsePreferences(JSON.stringify(candidate));
    if (!validated) throw new TypeError("Invalid accessibility preference change");
    this.#preferences = validated;
    try {
      this.#storage.setItem(
        ACCESSIBILITY_PREFERENCES_STORAGE_KEY,
        JSON.stringify(validated),
      );
      this.#persistence = "saved";
    } catch {
      this.#persistence = "volatile";
    }
    return this.snapshot();
  }

  reset(): AccessibilityPreferenceSnapshot {
    this.#preferences = { ...defaultPreferences };
    try {
      this.#storage.removeItem(ACCESSIBILITY_PREFERENCES_STORAGE_KEY);
      this.#persistence = "default";
    } catch {
      this.#persistence = "volatile";
    }
    return this.snapshot();
  }
}

export function applyAccessibilityPreferences(
  root: HTMLElement,
  snapshot: AccessibilityPreferenceSnapshot,
): void {
  const preferences = snapshot.preferences;
  root.dataset.vcgTextScale = preferences.textScale;
  root.dataset.vcgContrast = preferences.contrast;
  root.dataset.vcgMotion = preferences.motion;
  root.dataset.vcgSeatedPlay = preferences.seatedPlay;
  root.dataset.vcgConfirmButton = preferences.confirmButton;
  root.dataset.vcgAudioCues = preferences.audioCues;
}
