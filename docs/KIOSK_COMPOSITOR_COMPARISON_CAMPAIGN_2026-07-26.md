# Kiosk compositor comparison campaign

Date: 2026-07-26
Investigation: I-092
Status: blocked zero-result qualification plan

## Outcome

The repository now has a strict pre-registered comparison of three browser
session routes:

1. Cage plus Chromium plus the common VCG wrapper;
2. Gamescope plus Chromium plus the common VCG wrapper;
3. the VCG wrapper under an exact owner-selected base compositor as a control.

No route, source revision, package closure, browser build, invocation,
privilege design, target, workload, controller, display, audio path, threshold,
ranking, or product choice is selected. The plan contains no build, target run,
fault, soak, compatibility result, or qualification result.

## Why the layers stay separate

Cage describes a single-application Wayland kiosk. Gamescope describes nested
and embedded game-session micro-compositor modes. The VCG browser supervisor
provides bounded desk process, navigation, permission, readiness, liveness, and
profile-cleanup behavior.

Those are different layers. A wrapper challenge acknowledgement does not prove
a visible or focused compositor surface. A compositor process does not prove
origin containment, browser readiness, child cleanup, controller ownership, or
safe return. Chromium app/kiosk flags and a fresh profile do not prove either.

The dated source observation is recorded in
`KIOSK_COMPOSITOR_SOURCE_SCREEN_2026-07-26.md`. The exact immutable Cage and
Gamescope source revisions are observations only and cannot become selected
builds without a separately approved, reproducible package closure.

## Canonical artifact

The machine-readable plan is
`benchmarks/kiosk-compositor/cross-tier-kiosk-compositor-plan-v1.json`. It is
canonical strict UTF-8 JSON, has a closed schema, is intentionally `blocked`,
and has `result: null`.

The artifact binds eleven repository sources covering the upstream screen,
hosted supervision, offline/service behavior, security, reserved recovery,
controller qualification, TV-appliance behavior, launch timing, both required
target lanes, and the current desk wrapper implementation.

The validator rejects unknown fields, stale sources, upstream promotion,
target or route substitution, silently selected builds, weakened browser
policy, workload or scenario omission, matrix arithmetic drift, failed-evidence
deletion, route or aggregate rescue, weakened fixed gates, invented open gates,
unsafe evidence, operational authority, and premature results.

## Targets

Two native-Linux targets are independently required:

- Raspberry Pi 5 plus AI HAT+ 26 TOPS as the lower-cost AArch64 reference;
- ordinary x86-64 Linux as the premium reference.

Steam Machine/SteamOS is an optional compatibility row. It cannot rescue a
required target, and the required targets cannot rescue each other. Windows,
WSL, and a nested desktop run cannot qualify a TTY/appliance session.

Each target still needs exact hardware, firmware, operating-system image,
kernel, GPU/display driver, input stack, browser, compositor, wrapper, audio,
storage, network, power, harness, clock, and independent-oracle identities.

## Route candidates

### Cage route

The Cage route tests an exact reproducible Cage build as a dedicated
single-application Wayland session around the common Chromium and VCG wrapper.
The observed upstream source says XWayland support depends on build-time
configuration and an installed XWayland binary, so the plan permits no assumed
browser compatibility or architecture support.

### Gamescope route

The Gamescope route tests an exact reproducible Gamescope build around the same
Chromium and wrapper. Nested and embedded modes are not interchangeable. The
exact appliance mode, driver path, Vulkan/DRM behavior, screenshot/grab policy,
display behavior, and privilege boundary remain open.

### Wrapper/base-compositor control

The control keeps the common VCG wrapper but requires an exact separately
selected base compositor and privileged input/focus/process design. It cannot
silently claim a dedicated compositor or inherit containment from the desk
supervisor.

Every route starts unbuilt and unqualified. Source descriptions and successful
process starts cannot qualify a route.

## Common browser contract

All routes must use the same exact Chromium, signed wrapper, origin policy,
permission policy, profile policy, workloads, inputs, display/audio conditions,
and evidence contract unless the pre-run comparison protocol explicitly marks
an unavoidable route-specific dimension.

The fixed common boundary requires:

- at most eight exact credential-free remote origins;
- no HTTP, `file:`, `data:`, custom-scheme, or credentialed navigation;
- no downloads, popups, or secondary targets;
- no direct game camera, microphone, location, MIDI, or notification grants;
- one fixed top-level explicit-ready contract;
- continuing fresh post-ready challenge acknowledgements;
- a fresh per-game profile;
- separate compositor-ready and wrapper-live evidence;
- no promotion of process survival to playability or recovery.

## Workloads

Six workloads exercise every route and target:

1. controlled local ready fixture;
2. local obstacle Motion workload;
3. VibeBots as supervised top-level hosted web;
4. Mi Casa Es Su Casa as supervised top-level hosted web;
5. Determined as supervised top-level hosted web;
6. Epoch as the restrictive-framing hosted case.

Every exact artifact/deployment, rights record, admission record, interaction
script, account/service state, and network authority remains null. Local success
cannot rescue hosted failure, and one hosted title cannot rescue another.

## Eighteen scenarios

Every target, route, and workload records:

1. cold launch through visible, focused, usable readiness;
2. warm relaunch with a fresh clean profile;
3. fullscreen entry/exit and output scaling;
4. pointer lock or relative-input capture;
5. stolen/background focus and return;
6. popup, child, or secondary-surface attempt;
7. foreign-origin or scheme navigation attempt;
8. download and permission request attempt;
9. main-thread or wrapper-liveness hang;
10. renderer-process crash;
11. browser-parent exit or signal race;
12. compositor/session-process loss;
13. network loss, redirect loop, or readiness stall;
14. controller disconnect/reconnect plus input flood;
15. reserved Home/Back and forced exit;
16. profile/storage corruption and cold restart;
17. audio-device loss/focus/recovery;
18. display hotplug/mode loss/recovery.

Faults remain unauthorized until the exact harness, containment, stop, cleanup,
preservation, and safety protocol is approved.

## Matrix and soak

The required matrix contains:

- 2 required targets;
- 3 route candidates;
- 6 workloads;
- 18 scenarios;
- 648 required cells;
- 20 valid cycles per cell;
- 12,960 required cycles.

The optional Steam row adds 324 cells and 6,480 cycles.

Every required target/route/workload combination also receives three complete
one-hour soaks: 36 required soak cells and 108 one-hour runs. The optional Steam
row adds 18 soak cells and 54 one-hour runs.

All declared cells and soaks run in a frozen counterbalanced order. Failed,
blocked, invalid, stopped, retried, and worst-case evidence remains visible. A
route is eligible only if every required target/workload/scenario cell passes.
A failed route remains rejected or ineligible; no target, workload, scenario,
soak, route, or aggregate rescues it.

## Oracles and gates

Independent evidence must distinguish first video, producer readiness, wrapper
liveness, compositor surface generation, visibility, focus, ordinary input,
reserved pre-game input, game input, navigation, permissions, popups, downloads,
owned processes/descendants/sessions/surfaces, profile and service-worker state,
audio, frame pacing, display mode, network/offline behavior, resources, power,
thermal/acoustic state, and monotonic timing.

Fixed gates preserve D-106's 15-second p95 interactive-launch ceiling and
250-millisecond p95 first-feedback ceiling. Zero-tolerance gates cover:

- unauthorized origins, schemes, popups, downloads, or permissions;
- Home/Back delivered to a game;
- keyboard, mouse, shell, or operator recovery;
- unowned or escaped processes, surfaces, or sessions;
- cross-game or cross-run profile/storage leakage;
- missing, stale, or self-asserted compositor readiness evidence;
- unrecovered audio, video, focus, input, display, or network failures.

Outcome-sensitive p99/worst launch, wrapper, reserved-action, crash-return,
display/audio recovery, FPS, frame-time, underrun, memory, GPU-memory, power,
acoustic, profile-growth, physical sample, ranking, tie-break, and maintenance
gates remain null. They must be frozen before the first operation.

## Data and authority boundaries

Tracked results are limited to opaque target/route/workload/scenario/cell/cycle,
fault, and reason labels plus closed counts, timings, digests, metrics, and
redacted categories.

Raw controller payloads; stable device, display, network, or household IDs;
URLs, queries, titles, headers, bodies, cookies, tokens, credentials, and entered
text; paths, environment, arguments, storage values, or crash logs; screen,
video, audio, camera, participant, or household media; and free-text browser,
compositor, driver, game, service, or result logs are prohibited. External
egress is limited to separately authorized exact hosted origins.

The plan grants no download, build, install, target mutation, display/audio,
controller, power, hosted-account, network, fault, qualification, selection,
compatibility, or publication authority.

## Owner questions

Twelve blockers are collected in
`OWNER_QUESTIONS_KIOSK_COMPOSITOR_2026-07-26.md`. They cover exact target tuples,
both compositor builds, the wrapper/base-compositor control, Chromium policy,
workloads and rights, controller and reserved recovery semantics, fault safety,
independent oracles, schedule and ranking, evidence handling, operation,
qualification, selection, and publication.

## Verification

Run:

```text
pnpm validate:kiosk-compositor
```

The focused command validates the canonical plan and all adversarial mutation
tests. Aggregate research validation includes the same test file.

## What this tranche does not prove

This work does not build, install, run, compare, qualify, or select Cage,
Gamescope, Chromium, a VCG wrapper, a compositor, a target, a controller, a TV,
an audio route, a workload, a recovery action, a fault harness, or a product
image. It does not close Q-047, Q-101, or I-092.
