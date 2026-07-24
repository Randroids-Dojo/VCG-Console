# Household motion benchmark protocol

Last updated: 2026-07-24

The canonical `household-one-player-v1` plan turns I-052 into a fixed, machine-validated trial and scoring contract. It defines what must be attempted and labeled before real-room results are visible; it does not claim that any person, room, camera, tracker, threshold, or target configuration has passed.

Validate every checked-in plan with:

```sh
pnpm validate:benchmarks
```

The canonical plan contains 14 trial blocks and 280 required attempts: 20 repetitions each for rest, stand, join, squat, jump, left/right punch, left/right step, shell crossed-arms Back, in-game crossed-arms Pause, occlusion, exit, and re-entry. The 20-attempt floor follows D-130 and the first-prototype measurement rules.

## Labels and expectations

| Movement label | Context | Scored expectation |
|---|---|---|
| `rest`, `stand` | shell / game | No standardized trigger |
| `join` | shell | `player_join` inside its declared timing window |
| `squat`, `jump` | game | `duck` / `jump` |
| `punch_left`, `punch_right` | game | Landmark-only exploratory label; any existing standardized trigger is false-positive evidence |
| `step_left`, `step_right` | game | `dodge_left` / `dodge_right` |
| `cross_arms` | shell / game | `menu_back` / `pause` under separate hold windows |
| `occlude` | session | `freeze` after confirmed loss |
| `exit_frame` | session | `show-recovery` after the reacquisition window expires |
| `reenter_frame` | session | `silent-recovery` before that window expires |

Every plan trial declares a bounded duration, instruction, context, repetition count, and one strict expectation: timed trigger, no trigger, landmark-only, or timed session transition. Trigger/context mismatches, duplicate trial IDs, unknown fields, invalid windows, missing movement classes, raw-frame claims, and non-`0.4.0` Motion contracts fail validation.

Punches deliberately remain landmark-only because Motion API `0.4.0` does not standardize punch actions. The protocol preserves those labeled movements for I-061 without inventing an action or silently treating another gesture as a punch.

## Result binding

A result must bind:

- the exact protocol and run IDs;
- a SHA-256 digest of the skeleton-only trace;
- timestamp quality (`camera-exposure`, `capture-arrival`, or `replay`);
- configuration and placement IDs;
- blocking persona class;
- the concurrent workload;
- exactly one ordered result for every planned trial repetition.

Each attempt retains whether it completed plus all observed standardized triggers and player-session transitions using milliseconds relative to that trial's start. Observations outside the declared trial duration, duplicates, omissions, extra attempts, unordered times, mismatched protocol IDs, or unknown fields fail. An incomplete attempt remains in the result and makes the run incomplete; it cannot be dropped or replaced silently.

The result schema always requires `containsRawFrames: false`. The trace digest binds evidence but does not authorize raw video. Consent and any separately approved diagnostic capture remain external prerequisites.

## Scoring

`scoreMotionBenchmark` performs one-to-one expectation matching:

- one expected trigger inside its window is one true positive;
- absence is one false negative;
- duplicate, wrong-action, or out-of-window triggers are false positives;
- triggers during no-trigger, landmark-only, or session trials are false positives;
- session transitions receive the same precision/recall treatment;
- invalid attempts are reported and make `complete: false` rather than disappearing from denominators.

The scorer returns raw counts plus trigger and transition precision/recall. A zero denominator is reported as `null`, never as a perfect score. Passing thresholds remain in `PROTOTYPE_SUCCESS_CRITERIA.md`: at least 95% trigger precision and 90% recall per blocking persona and qualified placement, zero unintended privileged actions in negative/idle work, and the separate 120 ms exposure-to-game-API p95 gate.

## Evidence boundary

Contract tests use synthetic result objects only to prove validation and arithmetic. They are not motion-quality evidence. I-053 and I-210 still require consented real-room traces, human ground-truth labeling, exact camera/room/configuration facts, concurrent workloads, trustworthy timestamps, latency distributions, failure publication, and explicit pass/fail reports.
