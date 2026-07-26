# Reserved Home action campaign

Date: 2026-07-26
Investigation: I-091
Status: blocked zero-result qualification plan

## Outcome

The repository now has a strict pre-registered campaign for proving that Home
is owned before game delivery by the system compositor or another privileged
pre-game input host. The plan records no physical input, target, runtime,
compositor, focus, recovery, or qualification result.

Existing evidence does not close I-091. Keyboard Escape and Back behavior,
browser navigation guards, process supervision, Steam Input descriptions,
Steam overlay behavior, controller mapping, a game-provided menu, and synthetic
input can all succeed while a hostile or hung game still captures or suppresses
a physical Home control.

## Canonical artifact

The machine-readable plan is
`benchmarks/reserved-home/reserved-home-action-plan-v1.json`. It is intentionally
`blocked`, has `result: null`, and binds ten security, offline, TV, browser,
retro, controller, package, shell, and supervisor sources.

The focused validator rejects unknown fields, source drift, target or sample
promotion, guessed generic-controller bindings, game delivery, missing hostile
states, matrix arithmetic drift, other-action or aggregate rescue, invented
thresholds, unsafe result data, operational authority, and premature results.

## Required system invariant

The physical Home edge must be observed by an independent system router before
the game can receive it. Passing ends only when a system-owned Home surface is
visible, focused, and accepts one canonical controller action.

The game:

- never receives Home;
- never acknowledges Home as a prerequisite;
- cannot override, disable, remap, swallow, duplicate, delay, or fabricate it;
- cannot make Home dependent on its render loop, browser callback, network,
  Motion tracking, camera, Steam account, or Steam overlay;
- cannot retain input or focus ownership while the system surface is active;
- cannot remove the host's process and focus recovery authority.

Back and Pause remain separate unqualified actions. Browser Escape, page Back,
a game pause menu, and ordinary controller actions cannot substitute for Home.
The final resume, return, forced-exit, focus, hold, and confirmation policy is
still an owner decision and remains null.

## Targets

Two targets are required independently:

1. Raspberry Pi 5 plus AI HAT+ 26 TOPS lower-cost reference;
2. ordinary x86-64 native-Linux premium reference.

The Steam Machine/SteamOS row is optional. Windows and WSL cannot qualify a
required Linux target. Steam Machine cannot rescue either required target, and
the two required targets cannot rescue each other. Browser tests, synthetic
events, a Steam Input configuration, or a game handler cannot qualify a global
system reservation.

Every exact hardware, firmware, kernel, compositor, input service, runtime,
global-shortcut policy, fault harness, and clock manifest remains null.

## Input roles

The required physical roles are:

1. first-party standard controller;
2. second-vendor standard controller;
3. generic ambiguous controller;
4. simultaneous cross-vendor pair;
5. dedicated recovery remote.

A 2.4 GHz receiver role becomes mandatory only if that support is claimed.
Every material model, firmware revision, and transport needs its own exact
sample manifest.

Generic input receives no family-based semantic guess. Its Home binding needs
an approved guided mapping. The simultaneous-pair role must prove either player
can invoke the system action without wrong-player or game ownership. The exact
dedicated button or universal chord is deliberately unselected.

## Runtime classes

Each target and input role must exercise:

- bundled local web;
- supervised hosted web;
- a signed native game;
- supervised retro.

Every representative artifact remains null. Success in one runtime cannot
rescue another because their focus, process, input, and failure ownership differ.

## Twelve hostile states

Every runtime exercises:

1. ordinary interactive focus;
2. exclusive fullscreen or equivalent;
3. pointer or relative-input capture;
4. fullscreen plus input capture;
5. active text entry or IME;
6. a game modal or overlay;
7. input flood or repeat storm;
8. hung main thread, renderer, or game loop;
9. process crash or exit race;
10. popup, child window, or secondary surface focus;
11. stolen focus or a backgrounded game;
12. stalled network load or content readiness.

These are product states, not browser-only labels. Each runtime adapter must
define the exact equivalent and independent oracle. Faults stay unauthorized
until safety, cleanup, stop rules, and the target owner are approved.

## Matrix

The fixed required matrix contains:

- 2 required targets;
- 5 required input roles;
- 4 runtime classes;
- 12 hostile states;
- 480 required cells;
- 20 valid cycles per cell;
- 9,600 required cycles.

The optional Steam Machine adds 240 cells and 4,800 cycles. A claimed 2.4 GHz
receiver adds 48 cells and 960 cycles per target.

Every declared cell runs. Failed, blocked, invalid, stopped, retried, and
worst-case cycles stay visible. No other action, input, target, runtime, state,
or aggregate can rescue a failure.

## Oracles and gates

Independent evidence must distinguish the physical edge, pre-game recipient,
game recipient, system-surface visibility and focus, canonical system response,
game-input revocation, player/owner transition, process and surface ownership,
and monotonic clock.

Fixed zero-tolerance gates cover:

- Home delivered to a game;
- swallowed, duplicate, stuck, or fabricated Home events;
- system-surface focus ownership failures;
- system action-response failures;
- wrong-player or wrong-owner transitions;
- keyboard, mouse, shell, or operator recovery;
- escaped or unowned processes and surfaces;
- unrecovered traps or valid product failures.

Every required cell must pass. Outcome-sensitive latency, forced-exit, resume,
and physical-sample thresholds remain null and must be frozen before operation.

## Data and authority boundaries

Tracked evidence is limited to opaque target/input/runtime/state/cell/cycle and
reason labels plus closed counts, timings, digests, metrics, and redacted
categories.

Raw USB, Bluetooth, HID, or remote payloads; serial/MAC/stable device IDs;
screen, video, audio, camera, or participant data; window titles, URLs, paths,
environment values, arguments, storage values; account, profile, save, package,
or entered text; and free-text game/compositor/driver/service/crash logs are
prohibited.

The plan grants no target, controller, remote, participant, compositor, mapping,
persistence, fullscreen, pointer, focus, process, network-fault, package,
runtime, qualification, publication, compatibility, or product-policy authority.

## Owner questions

Twelve blockers are collected in
`OWNER_QUESTIONS_RESERVED_HOME_ACTION_2026-07-26.md`. They cover exact targets,
input samples and bindings, privilege design, Home/resume/forced-exit semantics,
runtime representatives, hostile-state safety, independent oracles, numeric
gates, accessibility, data review, operational authority, and publication.

## Verification

Run:

```text
pnpm validate:reserved-home-action
```

The focused command validates the canonical plan and its adversarial mutation
tests. Aggregate research validation includes the same test file.

## What this tranche does not prove

This work does not implement or qualify a compositor shortcut, input daemon,
controller, remote, mapping, native-host adapter, browser wrapper, retro
frontend, runtime, target, physical recovery action, forced exit, resume,
focus, timing, usability, accessibility, compatibility, or product policy.
