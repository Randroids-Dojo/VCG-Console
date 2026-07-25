# VCG visual token system v1

Status: bounded software contract and console-lab integration; not target-TV or
release qualification.

## Purpose

This contract turns D-026, D-027, and D-117 into one versioned implementation
boundary. It keeps the shell visually calm and recognizable while ensuring
focus, faults, and state remain understandable without relying on accent color
alone.

The authoritative software sources are:

- `apps/console-lab/src/visual-tokens.ts` for the closed TypeScript contract and
  allowed accent vocabulary;
- `apps/console-lab/src/styles.css` for the production CSS values and aliases;
- `apps/console-lab/src/visual-tokens.test.ts` for exact cross-source,
  immutability, contrast, focus, target-size, grid, and reduced-motion checks.

The root receives `data-vcg-token-version="1"` and exactly one
`data-vcg-accent` value before the application renders. Unknown accents fail
before changing the active root state.

## Core tokens

| Area | v1 contract |
|---|---|
| Shell type | `OCRA, ui-monospace, SFMono-Regular, monospace` |
| Grid | 32 CSS pixels |
| Minimum declared control target | 48 CSS pixels |
| Standard focus | 3 CSS-pixel solid accent outline with 4 CSS-pixel offset |
| High-contrast focus | 4 CSS-pixel outline plus a separate ring and underline |
| Spacing steps | 8, 16, 24, 32, 48, and 64 CSS pixels |
| Immediate motion | 80 ms |
| Feedback motion | 120 ms |
| View motion | 180 ms |
| Ambient motion | 1,200 ms |

`prefers-reduced-motion: reduce` and the explicit saved reduced-motion
preference both collapse transitions and animations to one non-repeating
0.01 ms iteration. The numeric motion tokens are ceilings for current
tokenized effects, not permission to animate every state.

## Surfaces and semantic color

The standard shell uses:

- ink `#090b0c`;
- panel `#101315`;
- rail `#171b1d`;
- line `#303638`;
- paper `#efeee6`;
- muted text `#778084`;
- fault `#ff765f`.

High contrast replaces these with black/near-black surfaces, white paper,
brighter muted/line values, and fault `#ff9b84`.

Fault is a reserved safety/error semantic inherited from the existing shell.
It is not an additional configurable decorative accent. Whether the final
product retains a distinct fault hue is explicitly unresolved in VTS-002.

## Accent vocabulary

Exactly one accent is active at a time:

| Accent | Standard | High contrast | Contrast against matching ink |
|---|---:|---:|---:|
| Cyan (default) | `#53dac3` | `#7affe5` | 11.44:1 / 17.26:1 |
| Amber | `#f1c75b` | `#ffe089` | 12.27:1 / 16.28:1 |
| Violet | `#b8a7ff` | `#d9d0ff` | 9.40:1 / 14.42:1 |

The software test requires at least 7:1 for every accent/ink pairing. These
computed sRGB ratios are regression evidence only. They do not prove
TV-distance visibility, color-vision comprehension, panel behavior, or
accessibility qualification.

## Redundant state rules

- Focus is a spatial outline, not a text-color change.
- High-contrast focus adds a second ring and underline.
- Selected controls retain shape, border, fill, text, or explicit status copy
  in addition to accent.
- Fault copy must name the condition and recovery action; fault color alone is
  insufficient.
- Icons remain first-party CSS geometry or bounded reviewed assets and must
  have text or accessible labels where they convey an action.
- Loading and progress states must retain text/status semantics when animation
  is disabled.

The focused test proves the shared focus and reduced-motion rules exist. It
does not prove every existing component has completed a state-by-state
redundancy audit.

## Qualification boundary

I-148 is active, not closed. Still required:

- representative setup, loading, error, pause, profile, retro,
  community-review, and developer-mode audits against this token version;
- real target-TV captures from the selected seating distances;
- low-vision and color-vision testing, focus-without-color review, and
  child/adult comprehension;
- deterministic redistributable fallback/font/icon decisions under Q-077;
- exact sound-cue vocabulary, mixing, mute, and non-audio redundancy;
- illustration rules and reviewed assets;
- animation timing and GPU measurements on both reference tiers;
- product policy for which accent variants ship and how they are selected;
- accessibility and release review.

I-206 owns the real target-TV prototype campaign. The current Windows
headless-Chrome evidence remains useful regression evidence but grants no
target-TV, hardware, participant, or release qualification.
