export const VISUAL_TOKEN_SCHEMA_VERSION = 1 as const;
export const DEFAULT_VISUAL_ACCENT = "cyan" as const;

export type VisualAccent = "cyan" | "amber" | "violet";

export interface VisualAccentTokens {
  standard: `#${string}`;
  highContrast: `#${string}`;
}

export interface VisualTokenContract {
  schemaVersion: typeof VISUAL_TOKEN_SCHEMA_VERSION;
  fontFamily: string;
  gridStepPx: number;
  minimumControlTargetPx: number;
  focusOutlinePx: number;
  focusOffsetPx: number;
  highContrastFocusOutlinePx: number;
  motionMs: Readonly<{
    immediate: number;
    feedback: number;
    view: number;
    ambient: number;
  }>;
}

export const VISUAL_ACCENTS: Readonly<Record<VisualAccent, VisualAccentTokens>> =
  Object.freeze({
    cyan: Object.freeze({
      standard: "#53dac3",
      highContrast: "#7affe5",
    }),
    amber: Object.freeze({
      standard: "#f1c75b",
      highContrast: "#ffe089",
    }),
    violet: Object.freeze({
      standard: "#b8a7ff",
      highContrast: "#d9d0ff",
    }),
  });

export const VISUAL_TOKEN_CONTRACT: Readonly<VisualTokenContract> = Object.freeze({
  schemaVersion: VISUAL_TOKEN_SCHEMA_VERSION,
  fontFamily: "OCRA, ui-monospace, SFMono-Regular, monospace",
  gridStepPx: 32,
  minimumControlTargetPx: 48,
  focusOutlinePx: 3,
  focusOffsetPx: 4,
  highContrastFocusOutlinePx: 4,
  motionMs: Object.freeze({
    immediate: 80,
    feedback: 120,
    view: 180,
    ambient: 1_200,
  }),
});

export function applyVisualTokens(
  root: HTMLElement,
  accent: VisualAccent = DEFAULT_VISUAL_ACCENT,
): void {
  if (!Object.hasOwn(VISUAL_ACCENTS, accent)) {
    throw new TypeError("Unsupported visual accent");
  }
  root.dataset.vcgTokenVersion = String(VISUAL_TOKEN_SCHEMA_VERSION);
  root.dataset.vcgAccent = accent;
}
