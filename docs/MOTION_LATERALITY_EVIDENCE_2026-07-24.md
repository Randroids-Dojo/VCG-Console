# Motion laterality evidence

Date: 2026-07-24

Status: deterministic camera-free adversarial comparison implemented;
provider, real-turn, action, and target qualification remain.

## Outcome

Motion now has a fail-closed anatomical-axis continuity guard for directional
research labels. It compares each frame's named left-to-right hip and shoulder
axes with the neutral calibration:

- missing hip/shoulder anchors block directional labels;
- a reversed named axis blocks rather than relabeling left as right;
- an axis alignment below `0.5` or projected width below `0.35` of calibration
  blocks profile-like ambiguity; and
- Jump and Squat research labels remain independently available because the
  guard filters only Lean, Step, Reach, and Punch laterality.

On 41 generated adversarial scenarios, the guard improved exact outcomes from
15 to 31 and reduced ambiguous directional events from 14 to 4. It explicitly
blocked all eight full anatomical-name swaps and all eight severe
profile-projection cases.

The residual failure is important: torso-axis continuity cannot detect a
provider that swaps only distal limb names while hips and shoulders remain
plausible. Of six injected distal-only swaps, four produced wrong-direction
Reach/Punch labels and two silently suppressed Step. The guard also did not
recover four Lean/Step misses under a 0.65-width turn proxy. Backend
qualification and better coordinate/depth evidence remain mandatory.

This result supports carrying the guard into real testing. It does not support
automatic relabeling or closing I-064.

## Contract

[`laterality-guard.ts`](../packages/motion-contract/src/laterality-guard.ts)
wraps the camera-free rule recognizer. It:

- derives exact calibration hip and shoulder axis references;
- requires finite `0 < minimumAxisAlignment <= 1` and
  `0 < minimumWidthRatio <= 1`;
- accepts no unknown options;
- records `trusted`, `blocked-missing-anchors`,
  `blocked-axis-reversal`, or `blocked-foreshortened`;
- reports the minimum measured alignment and width ratio when available;
- exposes which directional research events were suppressed;
- resets temporal latches, cooldown, and velocity state across ambiguity; and
- never manufactures an opposite-side label from screen position.

The wrapper still returns research labels only. A blocked status is not yet a
Motion wire field, player-session transition, game pause, or UI message. A
production integration must map ambiguity to versioned control availability
and visible controller recovery without turning suppression into hidden
unresponsiveness.

## Frozen adversarial suite

[`laterality-benchmark.ts`](../packages/motion-contract/src/laterality-benchmark.ts)
derives 41 scenarios and 1,524 updates from the adult-standing generated rule
fixture:

| Category | Scenarios | Expected behavior |
|---|---:|---|
| Clear frontal | 8 | Preserve each directional label |
| Full anatomical swap | 8 | Explicitly block |
| Distal-only swap | 6 | Explicitly block |
| Mild turn proxy (`0.65` width) | 8 | Preserve each label |
| Profile ambiguity (`0.20` width) | 8 | Explicitly block |
| Crossed arms | 1 | Emit no directional label |
| One-wrist self-occlusion | 2 | Preserve the independently visible opposite-side Reach |

The suite swaps names rather than coordinates, compresses image-space
horizontal geometry around the hip center, and removes wrist observations.
These are controlled fault injections, not a model of detector error
frequency. Expected predictions remain evaluator-only and are never passed to
either strategy. The serialized suite SHA-256 is
`fead2cd57accb27d17d7a1da6798effa139a13490d17960e08ccc69ef9b1221e`.

## Confusion evidence

The tracked report is
[`windows-x64-synthetic-laterality-v1.json`](../benchmarks/laterality/windows-x64-synthetic-laterality-v1.json).
It retains the complete 10-by-10 labeled confusion matrix for each strategy:
eight directional labels plus `none` and `blocked`.

| Category | Count | Trust names exact | Axis guard exact |
|---|---:|---:|---:|
| Clear frontal | 8 | 8 | 8 |
| Full anatomical swap | 8 | 0 | 8 |
| Distal-only swap | 6 | 0 | 0 |
| Mild turn | 8 | 4 | 4 |
| Profile ambiguity | 8 | 0 | 8 |
| Crossed arms | 1 | 1 | 1 |
| Self-occlusion | 2 | 2 | 2 |
| Total | 41 | 15 | 31 |

| Strategy | Exact | Unsafe directional events during ambiguity | Explicit ambiguity blocks | Silent ambiguity suppressions |
|---|---:|---:|---:|---:|
| Trust provider names | 15 | 14 | 0 | 8 |
| Axis continuity guard | 31 | 4 | 16 | 2 |

The full matrix shows:

- full swaps preserve or reverse visible directional labels under blind trust;
- the guard converts all full swaps to `blocked`;
- severe profile compression leaves four Reach/Punch labels active under
  blind trust, while the guard blocks all eight;
- distal-only Reach/Punch swaps remain four unsafe opposite-side labels even
  with the guard;
- distal-only Step swaps become two silent `none` results because the geometry
  no longer crosses the named-side threshold;
- mild-turn Lean and Step remain four misses for both strategies; and
- crossed arms remain negative while either missing wrist leaves the visible
  opposite-side Reach usable.

The axis guard measured 21 microseconds p50 and 32.5 microseconds p95 per
strict update on this Windows/Node host, versus 14/26.2 microseconds for
blind trust. This is a desk microbenchmark, not end-to-end or native timing.

## Mitigation boundary

The defensible mitigation is:

1. preserve provider anatomical names when the calibrated torso axes remain
   continuous;
2. suppress directional rules and clear their temporal state when torso axes
   reverse, collapse, or disappear;
3. keep non-directional controls independent when their own landmarks remain
   qualified;
4. show a visible directional-control-unavailable state with controller
   recovery;
5. never silently swap left/right based on which side of the image a landmark
   occupies; and
6. require backend/provider evidence for distal anatomical consistency because
   the torso guard cannot prove it.

Adding a second heuristic based on wrist ordering would fail crossed-arm
gestures by design and still would not establish anatomical identity through
occlusion. The current guard therefore reports its residual rather than
stacking guesses.

## Reproduction and validation

```powershell
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm --filter @vcg/motion-contract typecheck
corepack pnpm exec tsx scripts/benchmark-motion-laterality.mjs
node --test scripts/validate-motion-laterality-evidence.test.mjs
node scripts/validate-motion-laterality-evidence.mjs
```

The report binds exact guard, suite, and benchmark SHA-256 values, Motion
`0.4.0`, guard/suite versions, exact scenario matrix, truth separation,
guard parameters, both complete confusion results, timing distributions,
raw-frame exclusion, findings, and limitations. Ten adversarial validator
tests reject truth leakage, suite/implementation/result substitution,
relabel-instead-of-block policy, hidden distal residuals, timing corruption,
raw-frame claims, and undeclared fields.

## Remaining qualification

I-064 remains active. Required evidence includes:

1. paired MediaPipe and RTMO output through real turns from frontal to profile
   and back;
2. independently labeled anatomical left/right truth through arm crossing,
   self-occlusion, crouch, blur, partial exit, and re-entry;
3. per-landmark provider swap, duplicate, missing, and confidence behavior;
4. held-out thresholds across child/adult standing cases and approved
   seated/limited-range exploration;
5. interaction with identity assignment, smoothing, calibration, action
   lifecycle, and multiplayer freeze/recovery;
6. visible ambiguity feedback and controller-only recovery testing; and
7. full workload latency on target Linux/native implementations.

Q-233 asks whether a laterality block should suppress only affected controls
or freeze the whole game. Q-218 already asks for authority to coordinate the
minimized paired skeleton-only session. Until those are resolved, the guard is
a research mitigation and distal laterality remains unqualified.
