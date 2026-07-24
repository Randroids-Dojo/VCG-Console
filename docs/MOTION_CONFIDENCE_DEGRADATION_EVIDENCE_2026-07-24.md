# Motion confidence-degradation evidence

Date: 2026-07-24

Status: deterministic camera-free state-machine comparison implemented;
provider thresholds, real-player truth, action behavior, and target
qualification remain.

## Outcome

Motion now has a research-only per-landmark confidence gate that separates
loss from restoration:

- provider `observed: false` blocks immediately, regardless of numeric score;
- confidence below `0.5` blocks immediately;
- a blocked landmark requires three consecutive provider-observed samples at
  or above `0.75` to return; and
- an already acquired landmark remains available in the `0.5` to `0.75`
  retain band.

The values are frozen experiment parameters, not selected production
thresholds. The comparison deliberately shows their cost. Across 115 authored
samples, the gate eliminated all 14 unsafe-available samples produced by a
memoryless `0.5` threshold, but increased false-unavailable samples from 2 to
34. State transitions fell from 32 to 20.

This result supports carrying an immediate-loss/bounded-rearm mechanism into
real provider testing. It does not support adopting these numeric values or
changing the Motion `observed` wire field.

## Strict gate

[`observation-confidence.ts`](../packages/motion-contract/src/observation-confidence.ts)
implements `fail-closed-confidence-rearm/v1`. It:

- accepts only `timestampMs`, `providerObserved`, and `confidence`;
- requires finite confidence in `[0, 1]`;
- requires strictly increasing non-negative timestamps so replayed samples
  cannot advance rearming;
- rejects unknown options and samples;
- bounds acquisition to 1 through 120 consecutive samples;
- requires `acquireConfidence >= releaseConfidence`;
- clears all rearm evidence on provider loss or low confidence;
- exposes `observed`, `blocked-provider`, `blocked-confidence`, or `rearming`;
  and
- resets to a blocked state for a fresh tracker epoch.

The gate does not infer coordinates, extrapolate an unobserved joint, select a
provider threshold, authorize an action, or replace global tracker health.

## Frozen synthetic campaign

[`observation-confidence-benchmark.ts`](../packages/motion-contract/src/observation-confidence-benchmark.ts)
contains ten deterministic authored scenarios:

| Scenario | Samples | Purpose |
|---|---:|---|
| Stable high | 12 | Bounded startup acquisition |
| Stable low | 12 | Persistent denial |
| Visible threshold jitter | 12 | Availability cost near both thresholds |
| Occluded medium rebound | 12 | Unsafe early restoration after collapse |
| Provider loss with high score | 10 | Provider flag precedence |
| Single low blip | 8 | Immediate loss and fresh rearm |
| Sustained loss/recovery | 12 | Bounded restoration delay |
| Ambiguous alternation | 14 | Threshold chatter and unsafe openings |
| Visible retain band | 11 | Hysteresis after trustworthy acquisition |
| Provider-flag oscillation | 12 | No accumulation across explicit loss |

The suite contains no coordinates, landmarks, images, or frames. Its complete
serialization SHA-256 is
`a4cab2a1315b62536c72b7240752a29dbd2e45aa06f170fffef7c7129252c322`.
Expected state remains evaluator-only and is not passed to either strategy.

## Results

The tracked artifact is
[`windows-x64-synthetic-confidence-v1.json`](../benchmarks/confidence-degradation/windows-x64-synthetic-confidence-v1.json).

| Strategy | Exact | Unsafe available | False unavailable | Transitions | Accuracy |
|---|---:|---:|---:|---:|---:|
| Memoryless release threshold | 99/115 | 14 | 2 | 32 | 0.860870 |
| Fail-closed confidence rearm | 81/115 | 0 | 34 | 20 | 0.704348 |

The overall accuracy ranking is intentionally not the decision criterion. A
single aggregate treats unsafe authority and conservative unavailability as
equivalent errors, while the product consequences differ:

- the memoryless strategy reopened for five medium-confidence samples after an
  authored occlusion collapse;
- it also reopened for five alternating ambiguous-confidence samples and four
  provider-flag oscillation samples;
- the gated strategy reopened for none of those fourteen samples;
- the gate imposed two high-confidence samples of restoration delay at
  startup and after loss; and
- visible confidence jitter caused substantial additional unavailability,
  showing why the thresholds cannot be selected from this synthetic suite.

At 60 FPS, two withheld samples would be roughly 33 ms before the third sample
is accepted. At another input cadence it is a different duration. Production
policy therefore needs timestamp-based evidence and the complete D-110
camera-to-action budget, not an assumed frame rate.

## Integration boundary

`assessPlayerControlAvailability` continues to consume the provider-authored
Motion `observed` signal. The new gate is not wired into MediaPipe, RTMO,
tracker health, the browser lab, or the native host. That separation prevents
synthetic experiment parameters from silently becoming production authority.

A qualified provider adapter would need to:

1. pre-register separately calibrated input semantics for visibility,
   presence, and keypoint score;
2. define immediate-loss conditions and a timestamp-based restoration window;
3. reset on source, model, camera, tracker, and timestamp epoch changes;
4. emit the existing closed `observed` field only after that adapter contract
   passes;
5. let action-specific availability suppress only controls requiring the
   missing landmark; and
6. prove that restoration delay remains within the full action-latency and
   recovery-comprehension gates.

## Reproduction

```powershell
corepack pnpm --filter @vcg/motion-contract typecheck
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm exec tsx scripts/benchmark-observation-confidence.mjs
node scripts/validate-observation-confidence-evidence.mjs
node --test scripts/validate-observation-confidence-evidence.test.mjs
```

The validator binds canonical UTF-8/LF hashes for the exact gate, suite, and
generator so Windows line-ending conversion cannot change identity; it also
binds suite serialization, both complete prediction/reason sequences, exact
totals, scenario-specific safety findings, and an explicit claim boundary.
Ten adversarial tests reject raw-frame or coordinate claims, truth leakage,
implementation/suite/result substitution, hidden safety failures, hidden
availability cost, and undeclared claims.

## Remaining qualification

I-063 remains active. Closure still requires:

1. independently labeled real MediaPipe and RTMO landmark observations;
2. provider-specific calibration and held-out threshold selection;
3. time-based rather than frame-count restoration comparison;
4. child/adult, standing/seated/limited-range, partial-body, crossing,
   occlusion, blur, clothing, and room-lighting coverage;
5. action and per-control precision/recall plus false privileged actions;
6. interaction with smoothing, identity, calibration, global health, and
   tracker restart;
7. visible TV-distance feedback and controller recovery comprehension; and
8. full latency on ordinary x86-64 Linux and the Raspberry Pi tier.

Q-234 asks for the owner-selected restoration-delay and safety posture. Q-039
still governs final provider thresholds and title continuation versus pause.
