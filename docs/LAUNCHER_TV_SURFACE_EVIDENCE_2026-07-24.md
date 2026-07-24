# Representative launcher television evidence

Date: 2026-07-24

Scope: I-098 and Q-056

## Outcome

The production-built Console Lab now applies the candidate television
authoring floor to three additional states:

1. Motion Hub catalog discovery;
2. the Wi-Fi offline settings state; and
3. an injected offline launch-recovery dialog.

At 1280 x 720, 1920 x 1080, and 3840 x 2160, every explicitly marked
critical text and action remains inside the exact five-percent CSS safe
rectangle. Critical text is at least 24 CSS px, actions are at least
48 x 48 CSS px, marked text does not overlap, major sections do not overlap,
and the measured root has no horizontal or vertical overflow.

This advances three bounded launcher states. It is not evidence for a real
network failure, successful retry, any game, every launcher state, a physical
television or controller, native-host authority, target Linux, overscan,
seating-distance comprehension, audio, or frame pacing.

## Frozen observations

The strict artifact is
[`windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json`](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json).
It binds the exact production source tree, generator, validator, browser test,
base launcher-home artifact, build resources, and all nine PNG files.

| State | Mode | Critical text | Minimum text | Actions | Minimum action |
|---|---|---:|---:|---:|---:|
| Motion catalog | 1280 x 720 | 24 | 24 px | 13 | 125.813 x 48 px |
| Wi-Fi offline | 1280 x 720 | 21 | 24 px | 15 | 125.813 x 48 px |
| Launch offline | 1280 x 720 | 21 | 24 px | 3 | 151.359 x 48 px |
| Motion catalog | 1920 x 1080 | 24 | 24 px | 13 | 125.813 x 48 px |
| Wi-Fi offline | 1920 x 1080 | 21 | 24 px | 15 | 125.813 x 48 px |
| Launch offline | 1920 x 1080 | 21 | 24 px | 3 | 167.375 x 48 px |
| Motion catalog | 3840 x 2160 | 24 | 48 px | 13 | 211.609 x 60 px |
| Wi-Fi offline | 3840 x 2160 | 21 | 48 px | 15 | 190 x 60 px |
| Launch offline | 3840 x 2160 | 21 | 48 px | 3 | 243.281 x 62 px |

All nine observations record:

- every marked critical-text item inside the safe rectangle;
- zero critical-text overlaps;
- zero adjacent major-section overlaps;
- zero root horizontal and vertical overflow;
- complete document state;
- zero console errors, page errors, or failed requests; and
- exactly the production-build resources expected across nine isolated page
  loads.

## Focus and Back evidence

The exact keyboard traces are:

- Motion catalog: first catalog entry, then Escape to focused Home;
- Wi-Fi offline: Scan for networks, then Escape to focused Home; and
- launch offline: initially focused Exit, Tab-wrapped Retry, Shift+Tab back to
  Exit, then Escape to the exact Offline preview control that opened the
  dialog.

The dialog route is an explicit developer fault injection. It proves only
that blocking copy, actions, focus trapping, dismissal, and opener restoration
remain understandable and recoverable at the three CSS viewports.

## Pixel captures

| State | 720p | 1080p | 4K |
|---|---|---|---|
| Motion catalog | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-motion-catalog-4k.png) |
| Wi-Fi offline | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-wifi-offline-4k.png) |
| Launch offline | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-720p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-1080p.png) | [PNG](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-launch-offline-4k.png) |

The browser clock advances by an exact one second after each state is ready.
This completes entrance animations and produces byte-stable launch elapsed
readouts without claiming secure time or frame-rate behavior.

## Reproduction and validation

Generation is intentionally frozen to Windows x64, Node v24.18.0, installed
Chrome 150.0.7871.182, and the evidence date:

```text
node scripts/generate-launcher-tv-conformance-evidence.mjs
node scripts/generate-launcher-tv-surface-evidence.mjs
pnpm validate:launcher-tv-conformance
pnpm validate:launcher-tv-surfaces
pnpm --dir apps/console-lab exec playwright test tests/tv-conformance.spec.ts
```

The ordinary validator is offline. Its eleven mutation tests reject contract,
environment, resolution, state, count, safe-area, text, action, overlap,
overflow, focus, screenshot, resource, error, provenance, boundary, and claim
promotion.

## Remaining boundary

I-098 and Q-056 remain active. Physical-TV and target-platform qualification
still requires the selected ARM64 and x86-64 Linux stacks, actual output and
scaling modes, overscan, controller and reserved Home/Back recovery,
representative real games, localization and accessibility variants,
seating-distance evidence, audio, concurrent tracking load, and sustained
frame timing. Q-242 and Q-243 still select the final product policy.
