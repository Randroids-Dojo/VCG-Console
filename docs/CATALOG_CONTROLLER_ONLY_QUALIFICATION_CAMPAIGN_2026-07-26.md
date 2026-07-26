# Catalog controller-only qualification campaign

Date: 2026-07-26
Scope: I-089
Status: blocked strict zero-result pre-registration

## Claim boundary

This campaign defines the hands-on evidence required to decide whether each
of the 26 catalog entries is usable with only a television, game controller,
and recovery remote on both supported Linux target classes. It does not claim
that a physical controller, remote, television, target image, game build,
account, network service, capture fixture, participant, or completed trial
exists or passes.

The existing synthetic neutral-Gamepad observations prove only that a bounded
browser surface can observe a signal. A listener, loaded URL, DOM surface,
declared mapping, or success in another game cannot establish controller-only
playability, recovery, television usability, catalog admission, permissions,
offline support, or family-mode suitability.

## Frozen catalog and target scope

The exact catalog is pinned in the machine-readable plan:

- `vibebots`, `vibe-pinball`, `vibe-racer`, `vibe-pins`, `bone-cleaver`,
  `vibeman-hangman`, `asymptotic-bitrot`, `fracking-asteroids`, `hoops`,
  `mi-casa-es-su-casa`, `block-punch-kick`, `epoch`, and `game-tape`;
- `go-pit`, `block-you`, `determined`, `software-dev-sim`, `baby-piano`,
  `clankers`, `vibe-city`, `flatline`, `vibe-gear-2`, `text-racer`,
  `drop-dead-keep`, `streamer-billboard`, and `go-dig`.

Every game is evaluated independently on
`ordinary-x86-linux-premium` and `pi5-hailo26-reference`. A pass on one
target does not qualify the other. Any catalog addition, removal, ID change,
game-build change, target-image change, compositor change, browser change,
mapping change, or recovery-routing change requires an explicit evidence
invalidation decision.

## Authority and prerequisite boundary

Before operation, bind exact reviewed digests for both target/runtime tuples,
the supervised browser and launcher, controller samples and mappings, recovery
remote and reserved-action enforcement, per-game ordinary-play scripts and
input applicability, television/audio fixtures, network and test-account
handling, fault injection and recovery oracles, data handling, schedule, and
independent review.

The tracked plan grants no authority to operate targets or physical devices,
interact with games or accounts, capture screens, audio, rooms, or people,
change catalog manifests or permissions, publish family-mode claims, qualify
entries, or publish results. Missing authority is a blocker, not a failed
game.

## Required matrices

### Controller-only ordinary play

Run three independently selected controller roles: first-party standard,
second-vendor standard, and generic/ambiguous. The generic role must remain a
visible recoverable disposition even if it is unsupported; it cannot be
silently omitted or relabeled as a standard controller.

For every game, target, and controller role, exercise ten stages: launch from
the controller-only shell; reach a usable title/menu; understand controls and
glyphs; start ordinary play; perform declared primary mechanics; pause and
resume; retry/restart after a declared failure; complete required text entry
or prove none is required; return safely to title/launcher; and invoke Home or
forced exit to a responsive launcher.

This is 1,560 independent cells. Twenty valid trials per cell require 31,200
controller-task trials. Keyboard, mouse, touch, developer tools, operator
intervention, or a later stage cannot rescue a controller-only failure.

### Lifecycle and fault recovery

For every game, target, and controller role, run 12 scenarios: pre-attached
cold launch, post-load hotplug, disconnect during navigation, disconnect while
a gameplay control is held, same-device reconnect, different-device slot
replacement, sleep/wake, focus loss/return, fullscreen capture/recovery,
pointer-lock capture/recovery, network loss/recovery, and game hang/crash with
supervisor return.

The 1,872 cells require 37,440 valid cycles. Score input epochs, slot
assignment, held-action release, reserved-action routing, recovery state, and
launcher responsiveness independently. A reconnect that leaves stale input,
wrong ownership, or an unresponsive launcher is not a pass.

### Recovery remote

For every game and target, run six remote scenarios: safe shell launch/focus,
Back from game or overlay, Home during ordinary play, Home from fullscreen or
pointer lock, Home from a hung/crashed game, and retry/exit/shutdown recovery.
The 312 cells require 6,240 valid trials.

Reserved Home, Back, and Pause behavior is scored at both boundaries: the
launcher/compositor must receive and act on the event, while the game must not
receive a prohibited privileged action. Neither swallowing nor leaking the
event is acceptable.

### Television and audio

For every game and target, inspect safe area and critical text, controller
glyphs and focus, gameplay action visibility, pause/retry/error/exit
comprehension, expected game audio and dropouts, and launcher audio focus and
volume recovery. The 312 cells require 6,240 valid observations.

Screen and audio evidence requires separately approved rights, privacy,
consent where applicable, security, retention, and deletion protocols. A
capture is not implicitly authorized by this plan.

## Acceptance boundary

The combined campaign requires 81,120 observations. Every scheduled game,
target, controller, task, lifecycle scenario, remote scenario, and
television/audio check must pass independently. Aggregation cannot rescue a
failure.

The tracked zero-tolerance gates prohibit required keyboard/mouse/touch
intervention, missing or wrong required actions, wrong glyphs, stale or
cross-epoch input, privileged actions delivered to games, swallowed reserved
actions, wrong player slots, controller-only text-entry blockage, unrecovered
focus/fullscreen/pointer-lock/hang/crash events, remote failures, critical TV
or audio failures, sensitive-data disclosure, and hidden adverse evidence.

Seventeen outcome-sensitive numeric gates remain null: controller sample
count, adult and child participant counts, ordinary-play duration, number of
primary mechanics, controller detection/action/reconnect/reserved/recovery
timing, game FPS/frame time, audio latency/dropout, television/control
comprehension, and controller text-entry rate/error. They must be approved
before affected operation, never selected after outcomes are visible.

## Evidence and privacy

The result envelope permits opaque game, target, controller, trial, and
participant labels; closed reason codes; counts; timings; digests; and
redacted categories. It excludes raw room/player/controller video, images,
or audio; credentials, tokens, cookies, storage/form/chat/profile values;
names, faces, voices, exact ages, stable device identifiers, paths, URLs with
queries, arbitrary messages, and free text.

Failed, invalid, stopped, retried, adverse, and worst-case attempts remain
visible. Evidence cannot leave the declared game-service boundary, and
ordinary service traffic requires an approved per-game protocol.

## Honest stopping point

This document, plan, validator, and mutation tests make I-089 reviewable and
fail closed. They do not perform physical qualification, establish game or
account rights, mutate the catalog, admit any game, or publish controller,
offline, family-mode, or product-support claims.
