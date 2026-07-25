# Hailo core17 adapter boundary

Date: 2026-07-24

Status: strict pre-wire projection implemented; Hailo runtime and Motion-frame
source integration pending

Authority: D-004, D-058, D-121, D-168, I-073, I-161, and Q-085

## Outcome

The Motion contract now contains a strict, provider-specific projection for the
selected Hailo COCO-style 17-point pose path. It maps a closed
`hailo-coco17-normalized/v1` observation into the exact portable landmark order
already used by `body.core17`.

The projection deliberately is not a Motion frame. Motion API `0.4.0` has no
honest Hailo source value, and D-168 forbids silently widening that closed
vocabulary or relabeling Hailo output as MediaPipe, RTMO, replay, or synthetic.
The returned object therefore carries
`motionFrameEmission: "blocked-pending-honest-source"` and cannot pass
`MotionFrameSchema`.

## Input contract

[`hailo-core17.ts`](../packages/motion-contract/src/hailo-core17.ts) accepts
only a closed top-level object containing:

- `schemaVersion: "hailo-coco17-normalized/v1"`; and
- a dense `people` array of at most 64 plain objects.

The top-level version remains mandatory when `people` is empty. Every person
contains only `landmarks`, with exactly 17 named entries in the canonical nose,
eye, ear, shoulder, elbow, wrist, hip, knee, and ankle order.

Every landmark must contain only `name`, `x`, `y`, and `score`. Coordinates
must be finite normalized image coordinates and may remain outside `[0, 1]`;
the shared image-coordinate contract permits finite off-frame points. Scores
must be finite values in `[0, 1]`.

This is a boundary for an eventual trusted Hailo runtime extractor, not a
parser for an unspecified Hailo SDK object. A pinned Pi OS, HailoRT, TAPPAS,
Hailo Apps, HEF, and post-processing tuple must still prove how its native
detections become this exact normalized input. The adapter does not infer
coordinate semantics from an unversioned array.

## Projection behavior

The mapper:

- requires an explicit player bound from one through four;
- defaults the unqualified observed-score threshold to `0.25`;
- projects each Hailo keypoint score into the required core `visibility` field
  without claiming that the score is calibrated as physical visibility;
- removes candidates with no landmark meeting that threshold;
- computes candidate confidence as the mean of all 17 scores;
- computes bounds only from observed landmarks;
- ranks by confidence with source order as the deterministic tie break;
- issues frame-local `candidate-N` identifiers and sequential session slots;
  and
- emits no actions, rich landmarks, world coordinates, presence values, or
  persistent identity.

The projection reports only `body.core17` as available. It explicitly reports
`body.mediapipe33`, `body.world3d`, `actions.obstacle.v1`, and
`actions.shell.v1` as unavailable. Downstream player-session tracking remains
the identity authority.

The default threshold is a parser/projection default shared with the RTMO desk
adapter, not a Hailo confidence calibration or gameplay threshold. Hardware
evidence must select or replace it.

## Verification

Fifteen focused cases within the motion-contract suite cover:

- exact landmark order and normalized coordinate preservation;
- absence of rich/world/action fabrication;
- all-zero/no-observation filtering;
- confidence ranking, four-player output bounds, and deterministic ties;
- observed-only bounds and finite off-frame coordinates;
- wrong version, missing/reordered landmarks, unknown fields, non-finite
  coordinates, and invalid scores;
- absent empty-batch version, non-array and excessive input, plus invalid
  thresholds/player limits;
- sparse arrays or arrays carrying unknown properties; and
- frozen-input non-mutation.

All 202 motion-contract tests pass, and the package typecheck passes.
The complete workspace production build and root test command also pass. The
five source-hash-coupled launcher/OCR artifacts were regenerated together, and
their 55 strict/adversarial validator cases pass.

## Remaining qualification

This code does not prove:

- any current Hailo Apps/post-processor output shape;
- Hailo hardware execution, model accuracy, timestamp authority, latency,
  throughput, power, temperature, or concurrent game headroom;
- score calibration, one- or multi-player identity, action quality, floor
  contact, or parity with MediaPipe;
- a Motion API source/version migration or released-client compatibility;
- model, runtime, driver, post-processing, or redistribution suitability; or
- Raspberry Pi recovery, update, rollback, and offline reinstall behavior.

I-161 still requires the same labeled sessions to run through the pinned Hailo
and MediaPipe paths, with unavailable-value behavior, timing, action confusion
matrices, and evidence for any game that needs a richer profile.

That requirement is now pre-registered in
[`HAILO_MEDIAPIPE_CORE_COMPARISON_PLAN_2026-07-24.md`](HAILO_MEDIAPIPE_CORE_COMPARISON_PLAN_2026-07-24.md).
The strict plan records zero attempts and no qualification. It requires
simultaneous volatile same-exposure fan-out, exposure-authoritative timing,
independent floor-contact truth, complete capability/unavailable-profile
transcripts, and separate Hailo-core versus MediaPipe-core and
MediaPipe-core-versus-rich views. Execution remains blocked until every
runtime, privacy, participant, timestamp, and metric prerequisite is explicit.
