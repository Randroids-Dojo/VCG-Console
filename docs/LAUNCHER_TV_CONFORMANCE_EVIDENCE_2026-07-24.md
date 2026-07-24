# Launcher-home television conformance evidence

Evidence date: 2026-07-24

Status: Windows x64 production-build desk evidence for one launcher view; not
physical-TV, target-platform, controller, or catalog qualification

## Result

The launcher home view now satisfies the candidate automated authoring floor
at 1280 x 720, 1920 x 1080, and 3840 x 2160 CSS viewports with device pixel
ratio 1.

Across all three observations:

- all 24 explicitly marked critical-text elements are inside the exact
  five-percent safe inset;
- critical text is at least 24 CSS px, rising to 48 CSS px in the 4K fixture;
- no two marked critical-text rectangles overlap;
- the heading, destination grid, and status strip do not overlap;
- all 12 marked actions are at least 48 x 48 CSS px;
- the launcher has zero horizontal or vertical CSS-pixel overflow;
- keyboard focus moves from Home to Search, Enter opens and focuses Search,
  and Escape closes it and restores focus to Search;
- the production build reaches complete document state with zero console
  errors, page errors, request failures, or undeclared build-resource drift;
  and
- absent native bridge configuration remains truthfully visible as
  `Local package catalog unavailable`.

The first screenshot review caught a 720p heading/card overlap that edge and
minimum-size checks alone did not detect. The final browser and offline gates
therefore reject pairwise critical-text overlap and section overlap as
independent invariants.

## Recorded observations

| CSS viewport | Safe rectangle | Minimum critical text | Minimum action target | Critical/action counts |
|---|---|---:|---:|---:|
| 1280 x 720 | `64,36` through `1216,684` | 24 CSS px | 125.813 x 48 CSS px | 24 / 12 |
| 1920 x 1080 | `96,54` through `1824,1026` | 24 CSS px | 125.813 x 48 CSS px | 24 / 12 |
| 3840 x 2160 | `192,108` through `3648,2052` | 48 CSS px | 211.609 x 60 CSS px | 24 / 12 |

The strict artifact is
[`windows-x64-chrome-150-launcher-home-tv-conformance-v1.json`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json).
Pixel-bound screenshots are
[`720p`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-720p.png),
[`1080p`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-1080p.png),
and
[`4K`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-4k.png).

The browser clock is deliberately frozen to make those PNG identities
reproducible. The evidence records that fixture input explicitly.

## Reproduction and validation

Live reproduction requires the frozen evidence date and installed toolchain:

```text
node scripts/generate-launcher-tv-conformance-evidence.mjs
```

Ordinary validation is offline:

```text
pnpm validate:launcher-tv-conformance
```

The offline validator binds the base candidate-TV artifact, source and
production-build inputs, exact build-resource set, exact JSON shape, observed
geometry/minima, focus trace, error counts, and byte-identical PNGs. Eleven
mutation tests reject substituted base evidence, environment/resolution
drift, safe-area escape, weak or missing text/targets, overlap, overflow,
focus/select/Back drift, screenshot/resource substitution, fabricated
physical/native/other-view/target claims, stale provenance, and unknown
fields.

The independent Playwright test
`apps/console-lab/tests/tv-conformance.spec.ts` runs the same three viewports
through the normal production E2E server.

## Exact boundary

This evidence covers one marked home view and its Search round trip only. It
does not qualify Motion, Museum, Retro, Profiles, Settings, launch progress,
other overlays, failure/recovery surfaces, Motion Lab, or any game. It uses
keyboard input only and no native host.

No physical television, controller, person, catalog game, target hardware,
target Linux compositor, EDID output/scaling mode, overscan setting,
seating-distance comprehension, localization/accessibility variant, audio,
reserved Home recovery, performance, animation smoothness, or frame pacing
was tested. Q-242 and Q-243 remain open, and I-098 remains active.
