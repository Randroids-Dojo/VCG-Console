# Launcher Search television evidence

Date: 2026-07-24

Scope: I-098 and Q-056

## Outcome

The production-built launcher Search overlay now applies the candidate
television floor to four exact states:

1. the lowercase `motion` query with five results;
2. `no-such-vcg-destination` with no results;
3. the empty query with the current 18 destinations, last-result focus, and
   local Profiles activation; and
4. the lowercase `obstacle` query with one result and offline local-web launch
   activation.

At 1280 x 720, 1920 x 1080, and 3840 x 2160, every explicitly marked label,
query, result group/title/action, and no-result message remains inside the
five-percent CSS safe rectangle. Marked text is at least 24 CSS px, the input
and result actions are at least 48 x 48 CSS px, marked text does not overlap,
and the overlay has no horizontal or vertical overflow. The empty-query
results viewport has 387 CSS px of internal overflow at 720p, 79 CSS px at
1080p, and exactly no overflow at 4K. Focusing the last result reaches the
maximum scroll position where overflow exists and leaves that result fully
inside the results viewport at all three resolutions.

The strict television artifact proves four fixed Search states, keyboard
activation and Back recovery for the local Profiles shell view, and keyboard
activation plus opener-focus recovery for the built-in offline Obstacle launch
surface on one Windows desk. It does not select the final empty-query policy;
prove arbitrary or localized queries; activate remote titles, unavailable
packages, destructive settings, or external-origin disclosures; complete
gameplay; or qualify every overlay, physical TV/controller behavior, target
Linux output, or frame timing.

## Frozen observations

The strict artifact is
[`windows-x64-chrome-150-launcher-search-tv-conformance-v1.json`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json).
It binds the exact production source tree, Search and launcher sources,
generator, validator, browser test, base representative-state artifact,
production resources, and twelve PNG files.

| State | Mode | Results | Measured visible / total critical text | Minimum text | Actions | Minimum action |
|---|---|---:|---:|---:|---:|---:|
| Motion results | 1280 x 720 | 5 | 13 / 13 | 24 px | 6 | 687.766 x 48 px |
| No results | 1280 x 720 | 0 | 4 / 4 | 24 px | 1 | 687.766 x 48 px |
| Empty query, scrolled | 1280 x 720 | 18 | 23 / 39 | 24 px | 19 | 687.766 x 48 px |
| Obstacle activation | 1280 x 720 | 1 | 5 / 5 | 24 px | 2 | 687.766 x 48 px |
| Motion results | 1920 x 1080 | 5 | 13 / 13 | 24 px | 6 | 951.328 x 48 px |
| No results | 1920 x 1080 | 0 | 4 / 4 | 24 px | 1 | 951.328 x 48 px |
| Empty query, scrolled | 1920 x 1080 | 18 | 35 / 39 | 24 px | 19 | 951.328 x 48 px |
| Obstacle activation | 1920 x 1080 | 1 | 5 / 5 | 24 px | 2 | 951.328 x 48 px |
| Motion results | 3840 x 2160 | 5 | 13 / 13 | 48 px | 6 | 1936.656 x 61 px |
| No results | 3840 x 2160 | 0 | 4 / 4 | 48 px | 1 | 1936.656 x 62 px |
| Empty query, exact fit | 3840 x 2160 | 18 | 39 / 39 | 48 px | 19 | 1936.656 x 61 px |
| Obstacle activation | 3840 x 2160 | 1 | 5 / 5 | 48 px | 2 | 1936.656 x 61 px |

All twelve observations record complete document state, every measured visible
marked item inside the safe rectangle, zero measured marked-text overlaps,
zero overlay overflow, and zero console errors, page errors, or failed
requests. Offscreen critical text in the two internally scrolling observations
is counted but is not misrepresented as visible or safe-area measured.

## Input evidence

The Motion-results trace is:

1. Search input focused on open;
2. ArrowDown focuses the first result;
3. the last result can receive focus;
4. Tab from the last result wraps to the input; and
5. Escape closes Search and restores the exact Search trigger.

The no-result trace keeps Tab on the only enabled control, then Escape closes
Search and restores the exact opener.

The empty-query trace starts at scroll position zero, focuses the last result,
records the resulting exact scroll position, then focuses the Profiles result
and presses Enter. Search closes and the exact `Who is playing?` destination
appears at all three resolutions. Back returns to the launcher Home view with
its navigation action focused.

The `obstacle` trace focuses its only result and presses Enter. Search restores
its exact opener before invoking the result action, the `LOCAL WEB` Obstacle
launch dialog appears, and Back closes it and returns focus to the Search
trigger at all three resolutions. This proves one built-in offline local-web
launch surface, not completed gameplay, a signed installed package, or target
runtime behavior.

The broader Console Lab Chrome suite separately proves that opening Search with
an empty query exposes exactly 18 current destinations, the results container
has real internal overflow, focusing its last result advances `scrollTop`, and
synthetic standard-gamepad Down focuses the exact filtered `Profiles` result.
Synthetic Select then closes Search and opens the `Who is playing?`
destination. That synthetic standard-gamepad flow remains separate evidence:
the strict TV artifact uses programmatic focus and keyboard Enter, not a
physical or synthetic controller. Neither flow proves arbitrary query text or
activates a game or package.

## Pixel captures

| State | 720p | 1080p | 4K |
|---|---|---|---|
| Motion results | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-4k.png) |
| No results | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-4k.png) |
| Empty query after last-result focus | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-4k.png) |
| Obstacle result before activation | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-4k.png) |

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

The offline validator has eleven adversarial test groups covering format, base
evidence, environment, resolution, state, query, counts, empty-state truth,
visible-text clipping, safe area, text, actions, overlap, overlay and results
overflow, focus, activation, screenshots, browser errors, resources,
provenance, limitations, unknown claims, promotion, and demotion.

## Remaining boundary

I-098/Q-056 remain active. The strict TV record now covers current empty-query
density plus local-shell and built-in offline local-web activation at every
target resolution, but STV-001 must still choose whether the default list
remains, becomes curated, or requires a query. Search also needs long strings,
localization, large text/high contrast/reduced motion, physical-controller
directional navigation, the remote-web, unavailable-package,
destructive-settings, and external-origin STV-004 result classes with their
failure/denial paths, physical-TV viewing, reserved Home, native-host recovery,
and both target Linux display stacks. Q-242/Q-243 and STV-001 through STV-004
retain the final policy choices.
