# Appearance-free identity tracker comparison

Date: 2026-07-24

Status: deterministic camera-free baselines implemented; real-player and
backend qualification remain.

## Outcome

Five bounded appearance-free identity-assignment baselines now consume only
normalized Motion `body.core17` landmarks and detection confidence:

1. nearest torso centroid;
2. constant-velocity two-axis Kalman torso-centroid prediction;
3. consecutive-pose COCO-style Object Keypoint Similarity (OKS);
4. a Kalman-plus-OKS hybrid; and
5. a ByteTrack-inspired two-stage high/low-confidence association using
   Kalman centroid prediction and skeleton-box overlap.

The fifth baseline is deliberately not called ByteTrack. It borrows the
paper's high-score-first, low-score-recovery structure, but it does not run the
upstream tracker, YOLOX detections, its complete lifecycle, or its exact
association implementation.

On the frozen synthetic suite, the two-stage baseline led with IDF1
`0.972191`, one identity switch, and zero false track transfers. That makes it
the first appearance-free candidate for real evidence under D-169. It is not a
production selection.

## Contract and privacy boundary

[`identity-tracking.ts`](../packages/motion-contract/src/identity-tracking.ts)
enforces:

- five exact algorithm identifiers;
- at most four live tracks and sixteen input detections;
- exactly 17 finite landmark positions per detection with at least one
  observed point;
- confidence, association-distance, OKS, and retention bounds;
- strictly increasing finite timestamps;
- one globally optimized one-to-one assignment per association stage;
- monotonically allocated opaque session-local track IDs that are never
  reused; and
- explicit unmatched detections and bounded track expiry.

The tracker inputs contain no truth label, name, profile ID, face, image crop,
color histogram, embedding, or persistent biometric template. Benchmark
`truthId` exists only in evaluator-owned synthetic frames and is stripped
before every tracker call. This does not prove an implementation cannot be
fingerprinted from body geometry, but it materially narrows the data surface
compared with appearance re-identification.

Long exit and re-entry is intentionally not solved by hidden persistence. A
track expires after six missing frames in this fixture; the returning person
receives a new opaque ID. The player-session recovery/confirmation flow, not a
silent biometric guess, must decide whether to restore authority.

## Frozen synthetic suite

[`identity-benchmark.ts`](../packages/motion-contract/src/identity-benchmark.ts)
generates six exact 30 FPS scenarios:

| Scenario | Frames | Visible truth observations | Purpose |
|---|---:|---:|---|
| Two-player linear crossing | 61 | 122 | Same-path crossing and shuffled detection order |
| Brief central occlusion | 70 | 135 | Five-frame disappearance inside retention |
| Crossing confidence dip | 64 | 128 | Low-score observations through overlap |
| Fast direction reversal | 72 | 144 | Prediction overshoot near another player |
| Long exit and re-entry | 85 | 142 | Deliberately unresolvable post-expiry return |
| Three-player braided crossing | 76 | 228 | Nearby multi-path association |

The 428 generated frames contain 899 labeled pose observations, deterministic
sub-pixel jitter, three stable synthetic body-proportion variants, and
deterministically shuffled detection order. The serialized suite SHA-256 is
`1276dffb126f3182bfce942985f7b02cd9f92d056ab8e55fd8196e5fb8bf227d`.
There are no image or camera frames.

ID precision, recall, and IDF1 use the maximum one-to-one mapping between
truth identities and opaque tracker IDs over each scenario. The scorer also
retains missed assignments, identity switches, false track transfers,
assignment fragmentations, and distinct created tracks. Totals are derived
from scenario counters rather than averaged rates.

## Results

The tracked report is
[`windows-x64-synthetic-appearance-free-v1.json`](../benchmarks/identity-tracking/windows-x64-synthetic-appearance-free-v1.json).
Every algorithm received the exact same suite and thresholds.

| Baseline | IDF1 | ID switches | False transfers | p50 update | p95 update |
|---|---:|---:|---:|---:|---:|
| Nearest centroid | 0.905451 | 3 | 2 | 5.2 µs | 14.7 µs |
| Kalman centroid | 0.936596 | 5 | 4 | 4.8 µs | 13.9 µs |
| OKS | 0.936596 | 2 | 0 | 4.3 µs | 9.2 µs |
| Kalman + OKS | 0.936596 | 2 | 0 | 4.4 µs | 9.3 µs |
| Two-stage Kalman + IoU | 0.972191 | 1 | 0 | 5.9 µs | 15.5 µs |

Important scenario-level failures:

- nearest-centroid swaps both identities in the exact linear crossing:
  IDF1 `0.508197`, two switches, and two false transfers;
- Kalman-centroid preserves that two-player crossing but produces four
  switches/transfers in the braided three-player scenario;
- OKS and Kalman-plus-OKS preserve the ordinary crossings but start a new track
  after the brief central occlusion, yielding IDF1 `0.762963` there; and
- every baseline creates a new identity after the deliberate long
  post-expiry absence, yielding one switch and IDF1 `0.823944`.

The microsecond timings show that identity assignment is negligible beside
the measured 9.571 ms MediaPipe and 56.334 ms RTMO-s synthetic inference p50s.
The JavaScript worst cases are scheduler/GC-sensitive, so only the complete
tracked distributions are retained. These numbers do not qualify a native
implementation or end-to-end latency.

## Reproduction and validation

```powershell
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm --filter @vcg/motion-contract typecheck
corepack pnpm exec tsx scripts/benchmark-identity-trackers.mjs
node --test scripts/validate-identity-tracker-comparison.test.mjs
node scripts/validate-identity-tracker-comparison.mjs
```

The report binds the exact tracker, suite-generator, and benchmark
implementation SHA-256 values, Motion API `0.4.0`, source Git commit,
environment, method, scenario matrix, suite digest, deterministic metrics,
latency distributions, no-raw-frame boundary, and limitations. Nine
adversarial validator tests cover raw-frame claims, truth leakage, suite and
implementation substitution, impossible arithmetic, false upstream ByteTrack
claims, non-monotonic timing, and undeclared fields.

## Primary sources

- The [COCO keypoint evaluation overview](https://presentations.cocodataset.org/COCO17-Keypoints-Overview.pdf)
  defines Object Keypoint Similarity as the keypoint evaluation measure.
- [MMPose's official inference guide](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/inference.md)
  exposes OKS as an optional pose-tracking similarity measure.
- Kalman's original
  [1960 filtering and prediction paper](https://cds.cern.ch/record/434680)
  is the basis for the constant-velocity state estimator used as a small
  baseline here.
- The official [ByteTrack ECCV paper](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136820001.pdf)
  describes associating low-score detections with existing tracklets after
  high-score association. VCG implements only a clearly labeled
  skeleton-specific inspiration for comparison.

## Remaining qualification

I-057 remains active. Synthetic generated skeletons cannot choose the
production tracker. Required next evidence includes:

1. exact paired MediaPipe and RTMO detector outputs from consented crossing,
   overlap, crouch, exit, re-entry, and occlusion sessions;
2. independently labeled identity ground truth and detector
   duplicate/miss/score behavior;
3. one-player gates before two-player control authority;
4. an upstream or faithful ByteTrack comparison at the detector-box boundary,
   if it remains relevant;
5. parameter pre-registration rather than tuning on visible final results;
6. native Linux/Rust process timing under the full tracker/game workload; and
7. an explicit privacy decision before any appearance descriptor is even
   prototyped.

Q-215 asks for the physical paired-session authority and ground-truth
procedure. Q-216 asks whether appearance-derived re-identification is outside
the product boundary. Until those are resolved, the implementation remains
appearance-free and long-absence recovery remains explicit.
