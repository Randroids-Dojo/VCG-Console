# Owner questions: retro display, latency, rewind, and accessibility

Date: 2026-07-24

The host now starts from shaders, state-replay latency features, rewind, frame
delay, hard GPU sync, and threaded video disabled. These questions determine
which optional profiles deserve physical qualification.

## RX-001: visual default

Should the first public retro experience default to the unfiltered/no-shader
image, or may a specific system use an audited CRT-style preset by default?

Safe default: no shader everywhere. Offer an individually qualified visual
profile only after the exact target, renderer, resolution, core, content,
rights, performance, and accessibility evidence exists.

## RX-002: low-cost target shader candidate

Which one lightweight preset should receive the first Raspberry Pi 5 campaign?

Safe default: select either one pinned `crt-pi`-class preset or a simpler
scanline-free scaling preset after renderer selection. Do not qualify a
category or enable online preset downloads.

## RX-003: latency priority

When a feature reduces measured input latency but worsens p99 frame pacing,
audio stability, power, or thermals, which outcome wins?

Safe default: stable full-speed frame/audio behavior wins. Require a
pre-registered target/core/content threshold before testing, and never ship a
feature based only on a lower average latency.

## RX-004: state-replay engine

Should the first deep comparison prioritize single-instance run-ahead or
preemptive frames?

Safe default: compare both at exactly one frame on one deterministic,
save-state-capable 8/16-bit core. Keep second-instance run-ahead and all
feature combinations for later campaigns.

## RX-005: rewind product semantics

Is rewind an ordinary convenience, an accessibility assist, a per-profile
choice, or a per-title author decision?

Safe default: treat it as an optional disclosed assist, off by default and
enabled only on qualified titles. Show its effect on scoring/achievements and
do not combine it with run-ahead or preemptive frames in the first release.

## RX-006: accessibility reviewer

Who approves flashing, black-frame insertion, scan/subframe behavior,
brightness modulation, contrast, blur, curvature, crop, color dependence, and
TV-distance legibility?

Safe default: require a named accessibility reviewer and a controller-reachable
no-shader fallback. Automated screenshots or an upstream preset description
cannot substitute for that review.

## RX-007: advanced controls

Should any family-mode player be able to change shader presets, frame counts,
frame delay, hard GPU sync, threaded video, renderer, or rewind buffer size?

Safe default: no. Expose only named, host-owned, qualified profiles; keep raw
RetroArch configuration and persistent overrides unavailable.

## RX-008: first physical matrix

Which exact core/content/display/controller pair should be the first ARM64 and
x86-64 comparison case?

Safe default: use the same rights-cleared deterministic 8/16-bit case on both
targets, then add one FBNeo arcade case only after its exact core/content
rights and state behavior are qualified.
