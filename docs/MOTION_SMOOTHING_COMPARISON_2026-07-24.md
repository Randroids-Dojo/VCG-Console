# Motion smoothing comparison

Date: 2026-07-24

Status: deterministic camera-free baselines implemented; real-player,
backend-native, gameplay, and target-platform qualification remain.

## Outcome

Motion now has four bounded normalized-point baselines:

1. passthrough;
2. fixed-alpha exponential moving average (EMA);
3. the speed-adaptive One Euro filter; and
4. a constant-velocity linear Kalman filter per axis.

The frozen synthetic comparison makes the expected tradeoff visible but does
not select one universal production filter. With the recorded defaults:

- EMA reduced stationary RMS error by 59.3% versus passthrough, but took
  83.333 ms to reach 90% of an abrupt step;
- One Euro reduced stationary RMS error by 81.3% and reached the same step in
  50 ms, but lagged the slow ramp more than EMA under these exact defaults;
- Kalman reduced stationary RMS error by 82.5% and was best on the
  constant-speed ramp and bounded dropout, but took 383.333 ms to reach the
  step and overshot it by `0.113049` normalized units; and
- passthrough retained the least transient error but also the full generated
  stationary jitter.

That is evidence against choosing by one aggregate score. Filter and
parameters must be qualified at the action/profile boundary using real
detector output and gameplay tasks. Backend-native smoothing remains an
explicitly unavailable fifth slot because no selected backend currently
provides comparable raw and native-smoothed series from the same invocation.

## Runtime contract

[`smoothing.ts`](../packages/motion-contract/src/smoothing.ts) provides a
strict `MotionPointSmoother` over normalized two-dimensional observations. It
enforces:

- exactly four implemented algorithm identifiers;
- finite timestamps that increase strictly;
- observed input coordinates in `[0, 1]`;
- bounded EMA, One Euro, Kalman, and maximum-gap parameters;
- no visible synthesized coordinate when an observation is missing;
- state retention only through a gap no longer than `maxGapMs`; and
- a new filter epoch anchored exactly to the first measurement after a longer
  gap.

The default maximum gap is 250 ms. Missing samples return only their timestamp
and `observed: false`; even the predictive Kalman state cannot silently grant a
visible/control point. All visible outputs are clamped to the normalized
coordinate interval.

The defaults are comparison fixtures, not action-profile requirements:

| Parameter | Frozen value |
|---|---:|
| Maximum retained gap | 250 ms |
| EMA alpha | 0.35 |
| One Euro minimum cutoff | 1 Hz |
| One Euro beta | 4 |
| One Euro derivative cutoff | 1 Hz |
| Kalman process variance | 0.002 |
| Kalman measurement variance | 0.001 |

One Euro's beta depends on the units and scale of the input. The value here is
specific to normalized coordinates; it must not be copied to pixel, metric, or
angular streams without retuning.

## Frozen synthetic suite

[`smoothing-benchmark.ts`](../packages/motion-contract/src/smoothing-benchmark.ts)
generates five exact 60 FPS traces:

| Scenario | Frames | Missing observations | Purpose |
|---|---:|---:|---|
| Static jitter | 300 | 0 | Mixed-frequency stationary noise |
| Step | 180 | 0 | Abrupt `x=0.3` to `x=0.7` transition |
| Ramp | 240 | 0 | Constant-speed `x=0.2` to `x=0.8` motion |
| Reversal | 240 | 0 | Triangle path with abrupt direction change |
| Dropout | 180 | 8 | Constant-speed motion through a bounded gap |

The 1,140 frames are generated normalized points, not camera images,
landmarks from a person, or recorded gameplay. Truth coordinates stay in the
evaluator and are stripped before every smoother call. The serialized suite
SHA-256 is
`3f8603ae1f21409d4c6d29e1475265c2b67981235d6ec0c2d47811015c8a6e6a`.

The static case reports RMS and p95 position error plus frame-to-frame output
delta. The step reports RMS, time to 90% response, and overshoot. The ramp
retains signed horizontal error; the reversal retains maximum point error.
The dropout reports missing-output count, first reacquisition error, and a
12-frame post-reacquisition RMS window.

## Results

The tracked evidence is
[`windows-x64-synthetic-smoothing-v1.json`](../benchmarks/smoothing/windows-x64-synthetic-smoothing-v1.json).
Every implementation received the exact same inputs and frozen defaults.

| Baseline | Static RMS | Step 90% | Ramp RMS | Reversal max | Reacquisition error | p95 update |
|---|---:|---:|---:|---:|---:|---:|
| Passthrough | 0.009029 | 0 ms | 0.002582 | 0.004137 | 0.002939 | 0.8 us |
| EMA | 0.003678 | 83.333 ms | 0.004738 | 0.010829 | 0.024156 | 0.7 us |
| One Euro | 0.001687 | 50 ms | 0.014727 | 0.027542 | 0.018271 | 0.7 us |
| Kalman | 0.001579 | 383.333 ms | 0.000549 | 0.211892 | 0.000445 | 0.9 us |

All filters are computationally negligible on this Node/Windows workstation
relative to pose inference. The sub-microsecond timer values are
microbenchmark observations with quantization, JIT, scheduler, and garbage
collection sensitivity. They do not qualify Rust/native or target-Linux
performance.

The dropout is shorter than `maxGapMs`, so EMA and One Euro preserve their
lagging state, while constant-velocity Kalman resumes close to the continued
ramp. That is not generally a Kalman victory: its same default performs badly
on the discontinuous step and reversal. A longer gap resets every stateful
filter directly to the next measurement.

## Backend-native evidence gap

“Model-native smoothing” is not one algorithm. It may be a tracker option,
temporal model behavior, provider graph, or undocumented internal state. A
fair comparison requires:

1. paired raw and backend-native-smoothed landmarks from the same backend
   invocation and source exposure;
2. exact native control names, versions, defaults, and timestamp behavior;
3. the same jitter, step, ramp, reversal, dropout, and action/game scoring
   boundary; and
4. explicit separation of detector changes from smoothing changes.

Until those inputs exist, the report records
`unmeasured-no-comparable-backend-series` and carries no invented metric.

## Reproduction and validation

```powershell
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm --filter @vcg/motion-contract typecheck
corepack pnpm exec tsx scripts/benchmark-motion-smoothing.mjs
node --test scripts/validate-motion-smoothing-comparison.test.mjs
node scripts/validate-motion-smoothing-comparison.mjs
```

The report binds exact smoother, suite-generator, and benchmark SHA-256
values, Motion API `0.4.0`, source revision, environment, method, suite digest,
deterministic metrics, timing distributions, no-raw-frame boundary,
backend-native absence, and limitations. Nine adversarial validator tests
cover raw-frame claims, truth leakage, suite and implementation substitution,
metric substitution, fabricated backend evidence, non-monotonic timing, and
undeclared fields.

## Primary sources

- Casiez, Roussel, and Vogel's official
  [One Euro Filter page](https://gery.casiez.net/1euro/) links the CHI 2012
  paper, reference implementations, algorithm, and tuning procedure. It
  explains the minimum-cutoff jitter/lag tradeoff and beta's speed-dependent
  lag control.
- Kalman's original
  [1960 filtering and prediction paper](https://cds.cern.ch/record/434680)
  is the basis for the small constant-velocity state estimator used here.

## Remaining qualification

I-062 remains active. The next evidence must add:

1. paired MediaPipe and RTMO landmark traces from consented people without
   raw-video retention by default;
2. separately frozen low-motion, fast-motion, occlusion, and failure segments;
3. action-level timing, precision/recall, false triggers, and gameplay task
   outcomes, rather than point error alone;
4. per-action/profile parameters selected on training traces and scored on
   held-out traces;
5. accessible standing, seated, limited-range, child, and adult cases under
   an approved protocol;
6. comparable backend-native output when an exact backend exposes it; and
7. end-to-end latency and target Linux/Rust performance under the real game
   workload.

Q-217 asks for the acceptance boundary and stream architecture. Q-218 asks for
authority to collect one minimized paired smoothing session. Until those are
resolved, none of these defaults is a production selection.
