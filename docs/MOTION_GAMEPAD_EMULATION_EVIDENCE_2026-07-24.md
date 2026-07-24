# Motion-to-gamepad emulation evidence

Status: I-071 advanced from open to active; camera-free adapter contract and
three-genre software exercise implemented, no game or participant play test
completed.

Last updated: 2026-07-24

Authority: D-008, D-028, D-059, D-060, D-063, I-071, I-151, I-152, Q-042,
Q-160, and Q-239.

## Outcome

A bounded research adapter now converts an already-authorized player's
continuous lean feature and standardized obstacle actions into a
title-specific virtual-gamepad snapshot. It exercises three authored genre
mappings:

| Mapping | Authored function coverage | Software disposition | Play test | End-to-end latency | Comfort |
|---|---|---|---|---|---|
| Platformer | Horizontal move, Jump, Crouch, Dodge left/right | Camera-free software path only | Not run | Not measured | Unknown |
| Racing | Steering only; continuous throttle and brake absent | Unsupported | Not run | Not measured | Unknown |
| Simple arcade | Horizontal move plus four ordinary actions | Camera-free software path only | Not run | Not measured | Unknown |

All 12 deterministic checks pass. That result does not answer Q-042's
usefulness question: zero unmodified games, native virtual devices, target
appliances, or people participated.

The racing result is deliberately negative. Lean-to-stick steering does not
make a racing game playable when required continuous throttle and brake
controls are absent. The adapter emits a fully released `unsupported` state
instead of launching a partial control scheme.

## Closed adapter boundary

`MotionGamepadEmulator` is constructed for exactly one safe game ID, one
mapping ID, and one volatile epoch. Every sample carries:

- an increasing sequence and monotonic timestamp;
- the exact epoch;
- tracker health;
- an explicit already-authorized-player boolean;
- one bounded `leanX` feature in `[-1, 1]` or `null`; and
- at most ten parsed Motion actions.

The adapter does not select a player, grant a manifest permission, create a
native device, launch a game, or authorize a catalog mapping. Those remain
trusted-host responsibilities. Its `researchOnly: true` output cannot be
treated as a production grant.

## Lean and button semantics

The authored lean path applies a symmetric `0.15` deadzone and rescales the
remaining magnitude to the full left-stick X range. It never derives lean
from camera landmarks itself; the synthetic evidence injects the feature
directly.

Only `actions.obstacle.v1` discrete triggers may become ordinary game
buttons. Each accepted trigger creates a fixed 80 ms pulse:

| Obstacle action | Platformer | Simple arcade |
|---|---|---|
| Jump | South | South |
| Duck | D-pad Down | West |
| Dodge left | Left shoulder | Left shoulder |
| Dodge right | Right shoulder | Right shoulder |

The difference for Duck demonstrates that mappings are title-specific rather
than a hidden global remap. A repeated or older event cannot extend a pulse;
an event already older than its pulse window is reported stale and emits no
press.

The 80 ms value is a deterministic research parameter, not a qualified
game-compatible hold time. It contributes no camera-to-game latency evidence.

## Fail-closed behavior

Every axis and button releases immediately when:

- tracker health is not `ready`;
- exact player authority is false; or
- the selected mapping is incomplete.

Sequence replay, epoch substitution, timestamp regression, duplicate action
names, future-dated actions, unknown fields, and over-bounded action batches
are rejected before output.

Shell actions never bind. In particular, Pause, Back, Select, Join, and Swipe
are reported in `blockedActions` and emit no gamepad button. The output button
vocabulary does not contain Home, Back, or Pause. A real privileged input host
must still keep the physical reserved path outside the game and release the
native virtual device on context transition, shutdown, or adapter fault.

## Reproducible artifacts

- adapter:
  `packages/motion-contract/src/gamepad-emulation.ts`;
- focused contract tests:
  `packages/motion-contract/tests/gamepad-emulation.test.ts`;
- sample and output schemas:
  `schemas/motion-gamepad-sample.schema.json` and
  `schemas/motion-gamepad-output.schema.json`;
- generated evidence:
  `benchmarks/motion-gamepad/camera-free-three-genre-v1.json`;
- generator: `scripts/generate-motion-gamepad-evidence.mjs`;
- strict validator: `scripts/validate-motion-gamepad-evidence.mjs`; and
- validator mutation suite:
  `scripts/validate-motion-gamepad-evidence.test.mjs`.

The artifact binds normalized SHA-256 digests for the adapter, contract tests,
generator, and validator. Validation recomputes the entire artifact, enforces
strict UTF-8 and a 96 KiB bound, and rejects fabricated play/latency/comfort
claims, incomplete-racing promotion, hidden throttle/brake coverage,
shell/reserved delivery, missing title/player/health binding, stuck buttons,
mapping substitution, stale provenance, and undeclared qualification.

Reproduce with:

```text
pnpm tsx scripts/generate-motion-gamepad-evidence.mjs
pnpm tsx scripts/validate-motion-gamepad-evidence.mjs
pnpm tsx --test scripts/validate-motion-gamepad-evidence.test.mjs
pnpm validate:schemas
```

## Required next evidence

I-071 remains active until at minimum:

1. Q-239 selects three exact rights-cleared controller games, the candidate
   per-title mappings, participant scope, and pass/fail gates;
2. a signed/versioned host-owned mapping authorization exists rather than a
   browser or game-selected mapping;
3. a target-native virtual-device adapter proves full release on health,
   authority, process, context, and device faults without exposing reserved
   controls;
4. the same exact builds run on both target Linux tiers with physical
   controller recovery;
5. exposure-to-game and controller-to-game latency distributions are measured
   separately, including pulse scheduling and frame pacing;
6. consented play sessions report task completion, false/missed commands,
   comfort, fatigue, range, cancellation, comprehension, and stop requests by
   persona and genre; and
7. unsupported and controller-required states are visible before launch.

No mapping should enter the catalog merely because its authored function list
is complete. A real game may need analog ranges, simultaneous controls,
combos, camera control, menus, accessibility variants, or timing that this
prototype cannot represent.
