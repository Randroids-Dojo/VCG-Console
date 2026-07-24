# OCR-A platform fallback observation — 2026-07-24

## Result

Chrome’s platform-font report confirms that the current production CSS stack
does not produce one coherent fallback family on the Windows x64 development
host. The exact OCR-A custom font renders the ASCII baseline and middle dot.
The 15 current production-source characters missing from OCR-A are divided
among Consolas, Cambria Math, and Segoe UI Symbol.

This is useful current-host evidence for I-147/Q-077. It is not a fallback
selection, a target-Linux result, or a font qualification.

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
queries Chrome’s `CSS.getPlatformFontsForNode` DevTools method for each
single-character probe. It records one selected font and one rendered glyph
per probe, the exact resource requests, errors, source-tree commitment,
structural-evidence digest, and pixel-bound screenshot.

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
| Consolas | Windows platform font | `×`, `—`, `’`, `…`, `←`, `→`, `○`, `●` |
| Cambria Math | Windows platform font | `↻`, `⌕`, `△`, `◆`, `◇` |
| Segoe UI Symbol | Windows platform font | `↗`, `✓` |

The custom-font count is 2 of 17 probes. The platform-fallback count is 15 of
17, matching the structural artifact’s 15 missing current-source code points.

The result is more specific than “monospace fallback”: even on this one host,
the browser moves through three platform resources. Cambria Math and Segoe UI
Symbol are not named in the application CSS; Windows/Chrome selects them after
the named stack cannot supply a glyph. Their observed presence does not grant
permission to redistribute them or predict their presence on a Linux image.

## Validation

Eleven tests accept the exact observation and reject:

- format, date, platform, browser, viewport, or base-evidence substitution;
- CSS stack, probe ordering, character, role, or overflow drift;
- OCR-A identity, custom/platform classification, glyph count, or fallback
  family substitution;
- hidden browser errors, failed or missing requests, screenshot substitution,
  or summary drift;
- stale structural/source/generator/validator provenance; and
- cross-platform, fallback-selection, glyph-shape, TV-legibility,
  localization, accessibility, redistribution, or production-readiness
  promotion.

## Claim boundary

The evidence proves what one installed Windows Chrome build reported for the
exact diagnostic probe and current production stack. It does not prove that a
glyph is semantically appropriate, visually consistent, legible at seating
distance, unclipped in every UI context, available on another machine, or
licensed for bundling. The diagnostic grid is not a production route and does
not show that every launcher state rendered.

Decisions remain in
`OWNER_QUESTIONS_OCRA_PLATFORM_FALLBACK_2026-07-24.md` and the broader
`OWNER_QUESTIONS_OCRA_FONT_2026-07-24.md`.
