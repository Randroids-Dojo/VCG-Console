# OCR-A platform fallback observation — 2026-07-24

## Result

Chrome's platform-font report confirms that the exact current static production
source needs no platform fallback on the Windows x64 development host. The
exact OCR-A custom font renders both the ASCII baseline and the only current
non-ASCII source character, the middle dot.

This is useful current-host regression evidence for I-147/Q-077. It is not
proof of dynamically supplied text, a target-Linux result, or a font
qualification.

## Reproduce

Prepare the already pinned runtime assets, then generate and validate the
observation:

```text
pnpm prepare:assets
node scripts/generate-ocra-platform-fallback-evidence.mjs
node scripts/validate-ocra-platform-fallback-evidence.mjs
node --test scripts/validate-ocra-platform-fallback-evidence.test.mjs
```

The generator builds the production console app, loads its real stylesheet and
`OCRA.ttf`, injects a diagnostic-only 1920x1080 grid, waits for the font, and
queries Chrome's `CSS.getPlatformFontsForNode` DevTools method for the ASCII
baseline and every current non-ASCII source code point. The generator fails if
the probe set and structural source inventory diverge. It records one selected
font and one rendered glyph per probe, the exact resource requests, errors,
source-tree commitment, structural-evidence digest, and pixel-bound screenshot.

The strict artifact is
`benchmarks/font-coverage/windows-x64-chrome-150-ocra-platform-fallback-v1.json`.
The reviewed capture is
`benchmarks/font-coverage/windows-x64-chrome-150-ocra-platform-fallback-1080p.png`.

## Exact observation

Environment:

- Windows x64 development host;
- installed headless Chrome `150.0.7871.182`;
- Node `v24.18.0`;
- production build and production CSS font stack;
- 1920x1080 viewport at device-pixel ratio 1; and
- zero page errors, request failures, console errors, or grid overflow.

| Selected family | Kind | Exact probes |
|---|---|---|
| OCRA | prepared custom font | `A`, `·` |

The custom-font count is 2 of 2 probes. The platform-fallback count is 0,
matching the structural artifact's zero missing current-source code points.

Production now draws navigation, Search, ring, diamond, and pass-check
decoration with first-party CSS geometry and uses OCR-A-safe text for the
former multiplication, dash, smart-apostrophe, ellipsis, triangle, and filled
circle characters. Visible text remains the accessible authority and every
decorative element is `aria-hidden`.

The zero-fallback result is intentionally narrow. User-authored profile names,
future localization, service responses, or other dynamic strings may contain
characters outside OCR-A and still fall through the named stack to an
OS-selected font.

## Validation

Eleven tests accept the exact observation and reject:

- format, date, platform, browser, viewport, or base-evidence substitution;
- CSS stack, probe ordering, character, role, or overflow drift;
- OCR-A identity, custom/platform classification, glyph count, or introduction
  of a current-source platform fallback;
- hidden browser errors, failed or missing requests, screenshot substitution,
  or summary drift;
- stale structural/source/generator/validator provenance; and
- cross-platform, fallback-selection, glyph-shape, TV-legibility,
  localization, accessibility, redistribution, or production-readiness
  promotion.

## Claim boundary

The evidence proves that one installed Windows Chrome build selected the exact
custom OCRA font for every code point in the source-bound diagnostic probe. It
does not prove dynamically supplied text coverage, semantic appropriateness,
visual consistency, seating-distance legibility, every runtime state, another
machine, or redistribution approval. The diagnostic grid is not a production
route.

Decisions remain in
`OWNER_QUESTIONS_OCRA_PLATFORM_FALLBACK_2026-07-24.md` and the broader
`OWNER_QUESTIONS_OCRA_FONT_2026-07-24.md`.
