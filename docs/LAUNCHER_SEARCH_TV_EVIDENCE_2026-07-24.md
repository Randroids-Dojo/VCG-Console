# Launcher Search television evidence

Date: 2026-07-24

Scope: I-098 and Q-056

## Outcome

The production-built launcher Search overlay now applies the candidate
television floor to two exact states:

1. the lowercase `motion` query with five results; and
2. `no-such-vcg-destination` with no results.

At 1280 x 720, 1920 x 1080, and 3840 x 2160, every explicitly marked label,
query, result group/title/action, and no-result message remains inside the
five-percent CSS safe rectangle. Marked text is at least 24 CSS px, the input
and result actions are at least 48 x 48 CSS px, marked text does not overlap,
and the overlay has no horizontal or vertical overflow.

This proves two fixed Search states on one Windows desk. It does not prove
unfiltered or scrolling result sets, arbitrary or localized queries, result
activation, any game, every overlay, physical TV/controller behavior, target
Linux output, or frame timing.

## Frozen observations

The strict artifact is
[`windows-x64-chrome-150-launcher-search-tv-conformance-v1.json`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json).
It binds the exact production source tree, Search and launcher sources,
generator, validator, browser test, base representative-state artifact,
production resources, and six PNG files.

| State | Mode | Results | Critical text | Minimum text | Actions | Minimum action |
|---|---|---:|---:|---:|---:|---:|
| Motion results | 1280 x 720 | 5 | 18 | 24 px | 6 | 691.766 x 48 px |
| No results | 1280 x 720 | 0 | 4 | 24 px | 1 | 691.766 x 48 px |
| Motion results | 1920 x 1080 | 5 | 18 | 24 px | 6 | 955.328 x 48 px |
| No results | 1920 x 1080 | 0 | 4 | 24 px | 1 | 955.328 x 48 px |
| Motion results | 3840 x 2160 | 5 | 18 | 48 px | 6 | 1940.656 x 61 px |
| No results | 3840 x 2160 | 0 | 4 | 48 px | 1 | 1940.656 x 62 px |

All six observations record complete document state, every marked item inside
the safe rectangle, zero marked-text overlaps, zero overlay overflow, and zero
console errors, page errors, or failed requests.

## Input evidence

The Motion-results trace is:

1. Search input focused on open;
2. ArrowDown focuses the first result;
3. the last result can receive focus;
4. Tab from the last result wraps to the input; and
5. Escape closes Search and restores the exact Search trigger.

The no-result trace keeps Tab on the only enabled control, then Escape closes
Search and restores the exact opener.

The result actions were not activated. The artifact therefore makes no claim
about the selected destination, launch adapter, package, or game.

## Pixel captures

| State | 720p | 1080p | 4K |
|---|---|---|---|
| Motion results | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-4k.png) |
| No results | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-4k.png) |

The frozen browser clock advances by exactly one second after the state is
ready so entrance animation is complete before capture. This is deterministic
fixture input, not a timing or frame-rate result.

## Reproduction and validation

Generation is frozen to Windows x64, Node v24.18.0, installed Chrome
150.0.7871.182, and the evidence date:

```text
node scripts/generate-launcher-tv-conformance-evidence.mjs
node scripts/generate-launcher-tv-surface-evidence.mjs
node scripts/generate-launcher-search-tv-evidence.mjs
pnpm validate:launcher-tv-conformance
pnpm validate:launcher-tv-surfaces
pnpm validate:launcher-search-tv
pnpm --dir apps/console-lab exec playwright test tests/tv-conformance.spec.ts
```

The offline validator has eleven mutation tests covering format, base
evidence, environment, resolution, state, query, counts, empty-state truth,
safe area, text, actions, overlap, overflow, focus, screenshots, browser
errors, resources, provenance, limitations, unknown claims, and promotion.

## Remaining boundary

I-098/Q-056 remain active. Search still needs empty-query/scrolling density,
long strings, localization, large text/high contrast/reduced motion,
controller directional navigation, result activation, physical-TV viewing,
reserved Home, native-host recovery, and both target Linux display stacks.
Q-242/Q-243 and STV-001 through STV-004 retain the final policy choices.
