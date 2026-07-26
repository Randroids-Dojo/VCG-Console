import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISUAL_ACCENT,
  VISUAL_ACCENTS,
  VISUAL_TOKEN_CONTRACT,
  applyVisualTokens,
} from "./visual-tokens";

const stylesheet = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function selectorBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "u").exec(stylesheet);
  if (!match?.[1]) throw new Error(`Missing stylesheet selector: ${selector}`);
  return match[1];
}

function property(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s*:\\s*([^;]+);`, "u").exec(block);
  if (!match?.[1]) throw new Error(`Missing stylesheet property: ${name}`);
  return match[1].trim();
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("visual token contract", () => {
  it("is a closed immutable v1 contract", () => {
    expect(VISUAL_TOKEN_CONTRACT).toEqual({
      schemaVersion: 1,
      fontFamily: "OCRA, ui-monospace, SFMono-Regular, monospace",
      gridStepPx: 32,
      minimumControlTargetPx: 48,
      focusOutlinePx: 3,
      focusOffsetPx: 4,
      highContrastFocusOutlinePx: 4,
      motionMs: {
        immediate: 80,
        feedback: 120,
        view: 180,
        ambient: 1_200,
      },
    });
    expect(Object.isFrozen(VISUAL_TOKEN_CONTRACT)).toBe(true);
    expect(Object.isFrozen(VISUAL_TOKEN_CONTRACT.motionMs)).toBe(true);
    expect(Object.keys(VISUAL_ACCENTS)).toEqual(["cyan", "amber", "violet"]);
    expect(Object.values(VISUAL_ACCENTS).every(Object.isFrozen)).toBe(true);
  });

  it("applies only a declared accent and exact version marker", () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyVisualTokens(root);
    expect(root.dataset).toEqual({
      vcgTokenVersion: "1",
      vcgAccent: DEFAULT_VISUAL_ACCENT,
    });

    applyVisualTokens(root, "amber");
    expect(root.dataset.vcgAccent).toBe("amber");
    expect(() => applyVisualTokens(root, "red" as never)).toThrow(TypeError);
    expect(root.dataset.vcgAccent).toBe("amber");
  });

  it("keeps every accent legible against both standard and high-contrast ink", () => {
    for (const accent of Object.values(VISUAL_ACCENTS)) {
      expect(contrastRatio(accent.standard, "#090b0c")).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(accent.highContrast, "#000000")).toBeGreaterThanOrEqual(7);
    }
    expect(contrastRatio("#efeee6", "#090b0c")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#778084", "#101315")).toBeGreaterThanOrEqual(4.5);
  });

  it("binds the TypeScript contract to the production stylesheet", () => {
    const root = selectorBlock(":root");
    expect(property(root, "--vcg-token-version")).toBe('"1"');
    expect(property(root, "--vcg-font-shell")).toBe(VISUAL_TOKEN_CONTRACT.fontFamily);
    expect(property(root, "--vcg-grid-step")).toBe(
      `${VISUAL_TOKEN_CONTRACT.gridStepPx}px`,
    );
    expect(property(root, "--vcg-control-min")).toBe(
      `${VISUAL_TOKEN_CONTRACT.minimumControlTargetPx}px`,
    );
    expect(property(root, "--vcg-focus-width")).toBe(
      `${VISUAL_TOKEN_CONTRACT.focusOutlinePx}px`,
    );
    expect(property(root, "--vcg-focus-offset")).toBe(
      `${VISUAL_TOKEN_CONTRACT.focusOffsetPx}px`,
    );
    expect(property(root, "--vcg-motion-view")).toBe(
      `${VISUAL_TOKEN_CONTRACT.motionMs.view}ms`,
    );
    expect(property(root, "--vcg-accent-standard")).toBe(
      VISUAL_ACCENTS.cyan.standard,
    );
    expect(property(root, "--vcg-accent-high")).toBe(
      VISUAL_ACCENTS.cyan.highContrast,
    );

    for (const [name, accent] of Object.entries(VISUAL_ACCENTS)) {
      const block = selectorBlock(`:root[data-vcg-accent="${name}"]`);
      expect(property(block, "--vcg-accent-standard")).toBe(accent.standard);
      expect(property(block, "--vcg-accent-high")).toBe(accent.highContrast);
    }
  });

  it("uses redundant focus, target, grid, and reduced-motion tokens", () => {
    const focus = selectorBlock("button:focus-visible,\na:focus-visible");
    expect(property(focus, "outline")).toBe(
      "var(--vcg-focus-width) solid var(--accent)",
    );
    expect(property(focus, "outline-offset")).toBe("var(--vcg-focus-offset)");

    const highContrastFocus = selectorBlock(
      ':root[data-vcg-contrast="high"] button:focus-visible,\n:root[data-vcg-contrast="high"] a:focus-visible',
    );
    expect(property(highContrastFocus, "text-decoration")).toBe("underline");
    expect(property(highContrastFocus, "box-shadow")).toContain("var(--accent)");

    expect(stylesheet).toContain("background-size: var(--vcg-grid-step)");
    expect(stylesheet).toContain("min-height: var(--vcg-control-min)");
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain(':root[data-vcg-motion="reduced"] *');
    expect(stylesheet).toContain("animation-iteration-count: 1 !important");
  });
});
