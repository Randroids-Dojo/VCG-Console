# Candidate television compatibility contract

Status: candidate authoring contract, not product or target-hardware
qualification

Evidence date: 2026-07-24

This contract gives game and shell authors one conservative, executable
baseline while Q-056 remains open. It prevents ordinary desktop assumptions
from entering the catalog unchecked, but it does not claim that one browser
page represents a physical television, compositor, controller, or game.

## Candidate baseline

An authored television surface should:

1. support landscape CSS viewports at 1280 x 720, 1920 x 1080, and
   3840 x 2160;
2. keep every critical label, status, score, focus target, and recovery action
   within an inset of five percent from every CSS viewport edge;
3. render critical text at no less than 24 CSS px;
4. give every primary action target at least 48 x 48 CSS px;
5. expose one visible, non-color-only focus state and a deterministic focus
   order;
6. support directional focus, deliberate selection, and Back independently
   of pointer input;
7. calculate animation and gameplay from elapsed time rather than assuming
   one fixed refresh rate; and
8. honor reduced-motion preference without removing state or input feedback.

These values are candidate authoring checks. They are deliberately expressed
in CSS pixels. They are not physical panel pixels, angular text size,
seating-distance proof, an EDID mode requirement, or permission to rely on
device pixel ratio 1.

## Conformance surface

The standalone surface lives in
[`examples/tv-conformance`](../examples/tv-conformance). Its probe reports a
closed v1 record containing:

- viewport and device-pixel-ratio facts;
- expected and observed safe-area geometry;
- all declared critical-region containment results;
- computed critical-text sizes and action-target rectangles;
- focus order, final focus, selection count, and Back count; and
- 120 `requestAnimationFrame` elapsed-time deltas summarized as p50, p95,
  worst, and negative-count observations.

The page is served from a random loopback port with a deny-by-default CSP,
Permissions Policy, MIME protection, no-store responses, and exactly three
permitted resources. The generator drives installed Chrome with Playwright,
not page-supplied assertions alone.

Run:

```text
node scripts/generate-tv-conformance-evidence.mjs
pnpm validate:tv-conformance
```

Generation is intentionally frozen to its evidence date, Windows x64,
Node v24.18.0, and Chrome 150.0.7871.182. Ordinary verification is offline
and re-hashes the source, validator, JSON, and exact PNG files.

## Recorded desk result

All three runs used a CSS device pixel ratio of 1 and completed without a
console error, page error, request failure, or undeclared request.

| Mode | Safe rectangle | Minimum critical text | Minimum target | Input result |
|---|---|---:|---:|---|
| 1280 x 720 | `64,36` through `1216,684` | 24 CSS px | 256.609 x 64 CSS px | focus `0,1,2,3`; 2 selections; 1 Back |
| 1920 x 1080 | `96,54` through `1824,1026` | 31.68 CSS px | 385.391 x 64 CSS px | focus `0,1,2,3`; 2 selections; 1 Back |
| 3840 x 2160 | `192,108` through `3648,2052` | 38 CSS px | 803 x 70 CSS px | focus `0,1,2,3`; 2 selections; 1 Back |

The strict artifact is
[`windows-x64-chrome-150-tv-conformance-v1.json`](../benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json).
The corresponding captures are
[`720p`](../benchmarks/tv-conformance/windows-x64-chrome-150-720p.png),
[`1080p`](../benchmarks/tv-conformance/windows-x64-chrome-150-1080p.png), and
[`4K`](../benchmarks/tv-conformance/windows-x64-chrome-150-4k.png).

The frame observations prove only that the page used ordered, nonnegative
elapsed-time samples. They are not a 60 Hz claim, GPU frame-pacing result, or
performance threshold.

## Launcher-home application

The production-built launcher home view now applies the same candidate floor
to 24 explicitly marked critical-text elements and 12 actions. A separate
hash-bound run at all three viewports verifies safe-area containment, minimum
sizes, pairwise text and section non-overlap, zero launcher overflow, and a
Home-to-Search keyboard select/Back focus round trip.

See
[the dated launcher evidence](LAUNCHER_TV_CONFORMANCE_EVIDENCE_2026-07-24.md)
and its
[strict artifact](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-home-tv-conformance-v1.json).
This advances one shell surface only; the remaining launcher views and every
game still require the checklist below.

## Representative launcher states

Three additional production-built states apply the same candidate floor:
Motion Hub catalog discovery, the Wi-Fi offline settings state, and an
injected offline launch-recovery dialog. Nine pixel captures bind all three
states at all three resolutions. The checks add exact keyboard Back and opener
focus recovery, zero major-section overlap, and zero measured-root overflow.

See
[the representative-state evidence](LAUNCHER_TV_SURFACE_EVIDENCE_2026-07-24.md),
its
[strict artifact](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json),
and the
[remaining owner questions](OWNER_QUESTIONS_LAUNCHER_TV_SURFACES_2026-07-24.md).
The injected offline state is presentation evidence, not proof of real
network detection, retry recovery, or native supervision. Other launcher
states and every game remain outside the result.

## Launcher Search states

The production Search overlay now has six exact candidate-TV checks: a
five-result `motion` query, a no-result query, the current 18-destination
empty query, one Obstacle result, and one canonical Museum result in both
ready/blocked-preview and offline-failure modes. Eighteen captures bind marked
labels, query text, result group/title/action copy, empty-state copy, input and
result targets, zero overlap/overflow, scrolling, activation, failure,
denial, Back, and exact focus restoration.

See
[the Search evidence](LAUNCHER_SEARCH_TV_EVIDENCE_2026-07-24.md),
its
[strict artifact](../benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json),
and
[STV-001 through STV-004](OWNER_QUESTIONS_LAUNCHER_SEARCH_TV_2026-07-24.md).
The result records current empty-query density, scrolling, local-shell,
built-in local-web, and remote-web-supervisor activation. It does not select
the final density policy, prove arbitrary or localized queries, open or
qualify remote content, activate unavailable/destructive classes, or qualify
physical TV/controller behavior.

## Author checklist

Before proposing a title or shell surface as television-compatible, record:

- [ ] exact release/deployment, runtime, browser or native adapter, OS,
  compositor, output mode, scaling, device pixel ratio, and capture date;
- [ ] screenshots at every supported output mode with critical regions
  identified;
- [ ] computed critical-text and action-target minima rather than visual
  estimates;
- [ ] controller-only focus traversal, selection, Back, reserved Home, focus
  recovery, disconnect, and reconnect;
- [ ] pointer-lock, fullscreen, popup, external-navigation, crash, and hang
  recovery where applicable;
- [ ] animation/gameplay correctness at the actual refresh modes, including
  variable or missed frames;
- [ ] audio route, autoplay, focus loss, suspend/resume, and exit cleanup;
- [ ] localization, long strings, fallback glyphs, high-text-scale,
  high-contrast, and reduced-motion variants;
- [ ] physical-TV edge visibility and seating-distance comprehension;
- [ ] cold offline, network loss, reconnect, and truthful unavailable states;
  and
- [ ] an evidence boundary that names every untested target, device, and
  catalog title.

Passing the standalone desk fixture satisfies none of the per-title,
physical-TV, or target-platform checklist items by implication.

## Remaining qualification

I-098 remains active. Completion requires the remaining high-risk launcher
and game surfaces on the selected ARM64 and x86-64 Linux targets, physical
televisions at the actual output/scaling modes, controller and
reserved-recovery input, overscan/edge visibility, seating-distance
legibility, localization and accessibility variants, and measured frame
pacing. Q-242 and Q-243 record the owner decisions needed to turn the
candidate values into a final support policy.
