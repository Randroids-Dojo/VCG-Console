# Controller-only usability campaign — 2026-07-26

Status: strict blocked I-155 zero-result plan; no physical target, controller,
participant, session, recording, issue result, or usability qualification exists

Authority: D-008, D-027, D-028, D-029, D-030, D-050, D-051, D-055, D-106,
D-116, D-130, D-132, D-136, D-141, D-173, I-155

## Outcome

Pre-register the evidence required to show that a school-age child or adult can
use either required Linux reference target from cold power-off through launch,
play, system recovery, return, and shutdown with a supported controller only.
The tracked artifact is:

`benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json`

This is a human and physical campaign plan, not a browser automation result.
The existing Svelte loading screen, synthetic Gamepad tests, process host,
manifests, validators, screenshots, desktop runs and upstream zero-result plans
do not establish target usability.

## Gate before collection

Collection remains closed until the following are exact and qualified:

1. the ordinary x86-64 Linux and Raspberry Pi reference hardware, OS,
   compositor, browser, SDL/runtime, physical television/audio/power and network
   tuples;
2. controller samples, transports, mappings, glyphs, lifecycle behavior and
   unstealable Home/Back routing;
3. the physical-TV, kiosk, visual-token, boot/launch and local-package results;
4. one exact release, manifest, play task and fault disposition for each of the
   four runtime lanes;
5. participant cohort, counterbalancing, consent/assent, accessibility, safety
   and stop rules;
6. session instructions, scoring, independent physical/input/focus/process/
   network/power clocks and invalid-attempt treatment; and
7. screen-only recording, input ledger, issue taxonomy, retention, review,
   ranking, expiry and retest protocols.

The plan grants no target, controller, TV, power, network, runtime, participant,
fault, recording, diagnostic, publication, qualification or product-policy
authority.

## Required targets and runtime paths

Both targets are independently blocking:

- `ordinary-x86-linux-required`; and
- `pi5-lower-cost-reference-required`.

Each target must run all four runtime paths:

| Runtime path | Contract | Interactive gate |
|---|---|---:|
| Supervised remote web | Network-required with truthful offline failure and system-owned containment | 30 s to interactive input or truthful phase progress only; phase progress is not playability |
| Signed local web | Exact loopback wrapper, offline-required | 15 s to visible, focused, usable input |
| Signed native/Godot | Exact qualified local package and compositor handoff | 15 s to visible, focused, usable input |
| Supervised Libretro | Exact qualified frontend/core/content/controller package, offline-required | 15 s to visible, focused, usable input |

One target, runtime, synthetic fixture, optional platform or aggregate cannot
qualify another.

## Blocking personas and session matrix

School-age-child and adult persona classes are separately blocking. Exact
cohort size and sessions-per-participant remain open until consent, safety,
fatigue and counterbalancing review.

Every target/runtime/persona cell requires twenty valid complete sessions:

```text
2 targets x 4 runtimes x 2 personas = 16 cells
16 cells x 20 sessions = 320 complete sessions
320 sessions x 16 tasks = 5,120 task observations
```

Every session begins from independently verified cold power-off and ends at the
independently verified shutdown state. It includes:

1. power application and branded feedback within 250 ms;
2. controller discovery, canonical glyphs and no manual setup;
3. cold boot to a visible, focused, controller-usable Home within 60 seconds;
4. Home, catalog, search and runtime-disclosure navigation;
5. exact-game selection and launch;
6. comprehension of loading, waiting, progress and the current escape action;
7. controller Back cancellation during launch;
8. clean relaunch without stale state;
9. visible, focused, interactive gameplay;
10. the declared controller-only play task;
11. a system-owned Home or pause surface during play;
12. exact-game resume with focus/input restored;
13. universal Back or system Exit;
14. return to a visible, valid launcher focus target;
15. power-menu access without keyboard, mouse, desktop or hidden shell; and
16. deliberate shutdown with physical terminal-state confirmation.

Failed, invalid, stopped, retried, assisted and pre-repair attempts remain in
the ledger. Another participant, persona, runtime, target or best case cannot
rescue failure.

## Recovery matrix

Every target/runtime/persona combination also runs twenty valid cycles for each
of eight scenarios:

- slow launch with truthful progress;
- absolute timeout or hang;
- crash or unexpected process exit;
- readiness, heartbeat or visible-focus loss;
- offline or required-resource failure;
- controller disconnect, sleep and reconnect;
- fullscreen, pointer-lock, focus or compositor capture attempt; and
- failed Retry followed by controller-accessible Details, Exit and clean return.

This produces 128 cells and 2,560 recovery cycles. Each cycle independently
observes fault injection, detection, visible state/copy, focus, input recipient,
Retry, Exit, process cleanup and return. A later successful retry cannot hide a
failed retry, missing details, unsafe exit or pre-repair fault.

## Fixed gates

Every required cell must pass with:

- zero keyboard, mouse, shell, desktop, operator or hidden-setup recoveries;
- zero manual-mapping events for a supported standards-conformant controller;
- zero missed, duplicate, stuck, wrong-recipient or wrong-mapped actions;
- zero Home, Back, Pause, Resume or Exit events delivered to a game;
- zero focus traps, desktop exposures, blank dead ends or unbounded waits;
- zero unprompted guesses, wrong actions or assistance events;
- zero false Ready, Recovered, Interactive, Shutdown or success claims;
- zero unintended privileged Back, Home, Pause, Resume, Exit or Shutdown;
- feedback within 250 ms, cold boot within 60 seconds, local launch within
  15 seconds and hosted launch or truthful phase progress within 30 seconds;
- visible, focused response to the intended controller before a path is called
  interactive; and
- system ownership of Home, Back, Pause, Retry, Exit and Shutdown outside game
  authority.

First pixels, process start, wrapper liveness, heartbeat, a truthful hosted
phase or self-report cannot establish playability. Technical success, timing,
one target, averages or a best case cannot rescue a usability failure.

## Open gates

Before collection, owners must freeze participant count and fatigue limits,
counterbalancing, controller sample coverage, detailed task timing, first-
attempt completion, loading/fault/recovery comprehension, fault detection and
Retry timing, Home/Back/Pause/Resume/Exit/Shutdown timing, reconnect timing,
discomfort/accessibility limits, issue severity and closure, recording review,
retention/deletion, independent audit, ranking, expiry and retest.

These values may not be chosen after results are visible.

## Recording and issue boundary

Every valid session and recovery cycle requires a separately authorized
screen-only recording bound to the input ledger, clock, observer record and
closed cell identity. The recording excludes the room, faces, bodies, voices,
camera frames and household identity; metadata is removed and a published
artifact may be digest-only.

Issue records use closed codes, severity/disposition, counts, timings, cell
identity and evidence digests. Participant/operator narratives and arbitrary
game, driver, compositor, service or crash logs are not stored. Issues,
failures, stops, retries, assistance, wrong actions and adverse first attempts
cannot be deleted or hidden.

## Decision boundary

A complete pass does not automatically change controller support, game
compatibility, input promises, product guidance or publication status. Both
target results, every required cell and an independent cross-tier review must
pass before a separate owner decision can state a disposition.

## Validation

Run:

```text
pnpm validate:controller-only-usability
```

The validator checks normalized source provenance, closed schemas, exact target,
runtime, persona, task and recovery identities, all arithmetic, fixed and open
gates, recording/issue privacy, authority, decision boundaries, blockers,
canonical JSON, strict UTF-8 and parser limits.
