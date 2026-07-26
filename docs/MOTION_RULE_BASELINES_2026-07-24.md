# Motion rule baselines

Date: 2026-07-24

Status: deterministic camera-free research baseline implemented; real-player,
action-profile, accessibility, floor-reference, and target qualification
remain.

## Outcome

Motion now has a strict, stateful research recognizer for ten core17 movement
labels:

- jump and squat;
- anatomical left/right lean;
- anatomical left/right step;
- anatomical left/right reach; and
- anatomical left/right punch.

These are exploratory labels, not `MotionAction` values. The recognizer cannot
grant gameplay authority and does not widen Motion API `0.4.0`. Four labels
have candidate relationships to the existing obstacle profile:

| Research label | Existing candidate action |
|---|---|
| `jump` | `jump` |
| `squat` | `duck` |
| `step_left` | `dodge_left` |
| `step_right` | `dodge_right` |

Lean, reach, and punch remain exploratory-only. Adding them to the wire
vocabulary requires a separate action/profile decision, lifecycle semantics,
permissions, cross-backend evidence, and a versioned Motion API change.

The synthetic result is intentionally not perfect:

- nominal adult-, child-, and tall-standing shape fixtures each matched all
  ten generated positive trials, but each also produced a false Jump for a
  global upward image shift;
- the seated exploratory fixture matched its six upper-body trials, while
  jump, squat, and left/right step were explicitly unavailable rather than
  counted as successes;
- the unchanged default thresholds matched only 2 of 10 reduced-amplitude
  trials; and
- all five fixtures exposed the same image-space camera/crop-motion Jump
  confound.

The aggregate synthetic precision `0.883721` and recall `0.826087` are method
regression values, not product accuracy. They must not be compared with the
95%/90% real-person prototype gates.

## Runtime boundary

[`rule-baselines.ts`](../packages/motion-contract/src/rule-baselines.ts)
requires:

- exactly 24 strictly ordered neutral calibration samples;
- exactly one of every core17 landmark in every sample;
- finite coordinates, bounded confidence, and explicit observed state;
- strictly increasing non-negative timestamps;
- non-degenerate shoulder width, torso length, body height, anatomical
  left-to-right hip axis, and hip-to-shoulder axis; and
- closed, bounded threshold overrides with entry thresholds above their exit
  thresholds.

Input coordinates may be outside `[0, 1]`, consistent with the Motion image
coordinate contract for inferred or partially visible landmarks. A landmark
that is unobserved or below the `0.5` default confidence suppresses and
releases only rules that need it. The recognizer does not replace a missing
coordinate with zero or a prediction.

Position rules emit once when crossing an entry threshold, remain latched, and
rearm only below a lower exit threshold. A per-label 500 ms cooldown is a
second guard. Punch is a temporal extension-rate impulse; after a punch, the
same arm cannot also emit Reach until it retracts below the Reach exit band.
Calling `resetTemporalState` clears latches, cooldown, and velocity history
but retains the exact calibration.

## Frozen default rules

The defaults are transparent desk hypotheses:

| Signal | Entry | Exit or secondary condition |
|---|---:|---:|
| Jump | Hip and ankle rise at least 0.08 body heights | 0.04 |
| Squat/Duck | Shoulder drop at least 0.10 body heights while ankles remain anchored | 0.06 |
| Lean | Shoulder-versus-hip lateral offset at least 0.30 shoulder widths | 0.18 |
| Step | Named ankle-versus-hip outward offset at least 0.45 shoulder widths | 0.25 |
| Reach | Named wrist extension gain at least 0.55 torso lengths | 0.35 |
| Punch | Extension gain at least 0.12 torso lengths and rate at least 1.8 torso lengths/second | Retraction plus cooldown |

The axes are derived from anatomically named hips and shoulders, so left/right
does not depend on a mirrored preview. Jump and Squat still use image
displacement relative to neutral calibration. Jump therefore cannot
distinguish a player leaving the floor from the camera, crop, or whole
skeleton moving upward. This is a demonstrated failure, not a theoretical
footnote.

The Squat baseline uses shoulder drop with ankle anchoring so it matches the
existing desk Duck fixture. It does not prove knee/hip biomechanics and may
confuse a seated slouch, camera tilt, or partial-body detector distortion. A
floor or qualified world reference is required for a stronger jump/floor
contact claim.

## Frozen synthetic suite

[`rule-baseline-benchmark.ts`](../packages/motion-contract/src/rule-baseline-benchmark.ts)
generates five exact normalized skeleton-shape fixtures:

| Fixture | Evidence class | Calibration | Trials | Positive | Unavailable |
|---|---|---:|---:|---:|---:|
| Adult standing | Blocking-shape fixture | 24 | 16 | 10 | 0 |
| Child standing | Blocking-shape fixture | 24 | 16 | 10 | 0 |
| Tall standing | Blocking-shape fixture | 24 | 16 | 10 | 0 |
| Seated exploratory | Exploratory-shape fixture | 24 | 16 | 6 | 4 |
| Limited-range exploratory | Exploratory-shape fixture | 24 | 16 | 10 | 0 |

“Child,” “seated,” and “limited-range” here describe generated geometry only.
There is no participant, diagnosis, photograph, or accessibility claim.

Each fixture contains the ten movement trials plus six negatives: neutral
jitter, global upward shift, whole-body left/right translation, crossed arms,
and missing wrists. The suite contains 2,810 recognizer updates. Expected
labels exist only in evaluator metadata and are stripped before every
recognizer call. The serialized suite SHA-256 is
`808a3fa144065043dd3d3d90eb6373e5c0db3dab3aa30787596867ed789b5421`.

## Results

The tracked evidence is
[`windows-x64-synthetic-core17-rules-v1.json`](../benchmarks/rule-baselines/windows-x64-synthetic-core17-rules-v1.json).

| Fixture | Expected | Matched | False events | Synthetic precision | Synthetic recall |
|---|---:|---:|---:|---:|---:|
| Adult standing | 10 | 10 | 1 | 0.909091 | 1.000000 |
| Child standing | 10 | 10 | 1 | 0.909091 | 1.000000 |
| Tall standing | 10 | 10 | 1 | 0.909091 | 1.000000 |
| Seated exploratory | 6 | 6 | 1 | 0.857143 | 1.000000 |
| Limited-range exploratory | 10 | 2 | 1 | 0.666667 | 0.200000 |
| Total | 46 | 38 | 5 | 0.883721 | 0.826087 |

Every false event is the pre-registered global-upward-shift Jump. Every
limited-range miss is retained; only the two fast Punch impulses cross the
unchanged thresholds. This directly rejects any claim that torso scaling by
itself creates accessible reduced-range controls.

The Windows/Node microbenchmark recorded 281,000 updates at 12.6 microseconds
p50, 13.6 microseconds p95, and 24.7 microseconds p99. That timing includes
strict per-frame validation and rule evaluation, but excludes calibration,
capture, pose inference, identity association, smoothing, action lifecycle,
IPC, game logic, and rendering. It is not native or target-Linux evidence.

## Reproduction and validation

```powershell
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm --filter @vcg/motion-contract typecheck
corepack pnpm exec tsx scripts/benchmark-motion-rule-baselines.mjs
node --test scripts/validate-motion-rule-baseline-evidence.test.mjs
node scripts/validate-motion-rule-baseline-evidence.mjs
```

The report binds exact recognizer, suite, and benchmark SHA-256 values, Motion
`0.4.0`, the rule and suite versions, source revision, environment, exact
thresholds, suite digest, every deterministic trial outcome, arithmetic,
timing distribution, no-raw-frame boundary, candidate action mapping, and
claim limits. Ten adversarial validator tests cover raw-frame claims, truth
leakage, suite/implementation/result substitution, false wire-action
promotion, hidden camera-shift failure, timing, and undeclared fields.

## Remaining qualification

I-061 remains active. Required next evidence includes:

1. consented adult- and child-standing traces from the frozen household
   protocol, with every miss and false event retained;
2. separate seated and limited-range exploratory sessions only after their
   safety, consent, comfortable-motion, and stop boundaries are approved;
3. floor- or camera-stability evidence that prevents global motion from
   authorizing Jump;
4. detector/backend parity, occlusion, turns, crossed limbs, and low-confidence
   tests;
5. pre-registered threshold selection on training traces and held-out scoring
   per persona and placement;
6. exact action lifecycle, smoothing, calibration, cooldown, and context
   integration;
7. exposure-to-game-API latency under a representative concurrent game; and
8. an explicit vocabulary decision before Lean, Reach, or Punch can become
   standardized actions.

Q-219 asks for that vocabulary boundary. Q-218 already asks for authority to
coordinate one minimized paired skeleton-only evidence session. Until those
are resolved, the rule outputs remain research labels and real capture remains
unscheduled.
