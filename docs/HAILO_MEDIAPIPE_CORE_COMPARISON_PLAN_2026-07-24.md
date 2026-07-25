# Hailo and MediaPipe core comparison plan

Date: 2026-07-24

Status: strict plan checked in; execution blocked; zero results

Authority: D-004, D-058, D-110, D-121, D-168, I-073, I-161, and Q-085

## Outcome

The repository now contains a closed, source-bound plan for comparing the
selected Hailo YOLOv8m Pose core17 path with MediaPipe Pose Landmarker Lite.
The plan is
[`hailo-mediapipe-core-comparison-plan-v1.json`](../benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json).
Its generator and validator are:

- `scripts/generate-hailo-mediapipe-comparison-plan.mjs`;
- `scripts/validate-hailo-mediapipe-comparison-plan.mjs`; and
- `scripts/validate-hailo-mediapipe-comparison-plan.test.mjs`.

The checked-in document records zero attempts, no result artifact, no selected
backend, no Raspberry Pi qualification, and no game requiring a richer
profile. This is a pre-registration artifact, not hardware evidence.

The validator binds the plan to the current Hailo projection, MediaPipe
adapter, Motion schema, and game-manifest motion vocabulary by SHA-256. It also
requires canonical UTF-8 JSON, a 64 KiB limit, exact closed fields, dense
arrays, and one trailing newline. Duplicate JSON fields cannot survive the
canonical-byte check. Source digests use strict UTF-8 with CRLF normalized to
LF and reject bare carriage returns, so the same committed source has one
digest on Windows and Linux/Pi checkouts.

## Frozen comparison views

The plan separates three questions that must not be collapsed:

1. **Hailo core17 versus MediaPipe core17.** Both backends feed the same
   portable `body.core17` boundary and one versioned backend-neutral obstacle
   action engine.
2. **MediaPipe core17 versus MediaPipe richer data.** The same MediaPipe
   inference is evaluated once through core17 alone and once with
   `body.mediapipe33` plus `body.world3d`. This isolates the value of heel,
   foot-index, hand, and provider-world fields from provider differences.
3. **Unavailable-profile conformance.** Hailo must advertise only
   `body.core17`. Optional rich profiles remain visibly unavailable, and a
   required rich profile rejects negotiation. Missing values may not be
   replaced with zeros, nulls, copied core points, invented world axes, or
   fabricated confidence.

Provider-native pose adapters produce no action authority. The comparison
applies one frozen action engine after projection so a backend cannot receive
different thresholds, hysteresis, cooldown, or lifecycle treatment.

## Same-exposure and privacy boundary

Every scored attempt requires the exact same ordered exposure sequence to
reach Hailo core17, MediaPipe core17, and the MediaPipe richer ablation.
Sequential sessions, a later replay, or nominally repeated movement are not
substitutes: body motion, auto-exposure, occlusion, and camera timing would
otherwise confound the backend comparison.

The authorized design is simultaneous volatile in-memory fan-out from one
immutable exposure. Raw RGB/depth frames, video, and audio are not retained
and cannot appear in the result. Persistent data is limited to opaque
campaign/session codes, exact runtime digests, timing proof, permitted
skeleton projections, independent labels, derived events, resource samples,
stable invalid reasons, and aggregates.

Temporary recorded raw media is not authorized. If simultaneous in-memory
fan-out cannot be implemented, execution remains blocked pending a separate
owner decision, consent/minimization protocol, privacy review, bounded
encrypted retention design, and deletion audit.

## Timestamp and label authority

The latency boundary is camera exposure to action receipt at the game
boundary. Capture arrival is explicitly unacceptable as exposure time. Before
execution, the campaign must bind:

- hardware exposure start, hardware exposure midpoint, or a validated driver
  exposure timestamp;
- the exposure and game-receipt clocks;
- a shared-clock or measured mapping proof;
- per-attempt uncertainty; and
- drops at camera, fan-out, backend admission/completion, action-engine
  admission, and game receipt.

Reports must include p50, p95, p99, and worst exposure-to-pose and
exposure-to-action timing. The known product ceiling remains 120 ms p95
camera-to-action, but precision, recall, floor-event, participant-count, and
resource gates remain unset rather than invented.

Dodge left/right, duck, and jump use independent expected-action labels.
Floor contact and lift are scored as separate physical events, not silently
promoted into the current Motion action vocabulary. A synchronized
independent floor-contact apparatus and its manifest are mandatory before
those events can be scored.

## Study coverage

Blocking classes are school-age children standing and adults standing.
Seated and limited-range sessions remain separately exploratory. The plan
requires center, both horizontal edges, lower-body-near-edge, and
partial-ankle-occlusion placements, plus negative strata that distinguish
ordinary movement, weight shifts, bends, heel/toe lifts, partial exits, and
passersby from actual controls.

Each positive label has 20 scheduled attempts per participant and placement;
each participant/placement also has 15 minutes of negative observation.
Participant minimums remain unset pending owner approval. The full
counterbalanced schedule and every threshold must be frozen and hashed before
the first scored attempt. Missing or failed backend attempts remain present
with stable invalid reasons and may not be replaced.

The required result contains complete action and floor-event confusion
matrices, per-label precision/recall/F1 and false-event rates, timing,
drop/resource evidence, and every backend/persona/participant/placement/
confidence slice. An aggregate cannot hide a failed or incomplete blocking
cell.

## Richer game-profile decision

The current game-manifest vocabulary can express `body.core17` and
`actions.obstacle.v1`, but no richer landmark profile. The plan therefore
records no current richer-profile game requirement.

A game may require MediaPipe extensions only when:

1. its pre-registered core-only gate fails;
2. the richer view passes every blocking gate on the same exposures;
3. the improvement is attributable to richer fields rather than another
   backend or threshold change; and
4. unavailable-profile launch rejection is verified.

If core17 passes, it remains the requirement. If richer data is proven
necessary, the manifest vocabulary and compatibility behavior need a reviewed
versioned change; Hailo must be marked visibly incompatible for that game
rather than receiving fabricated data or silent degraded controls.

## Execution blockers

The strict plan cannot run until all of these are resolved:

- an honest Hailo Motion source/version or exact reviewed translation;
- the complete Pi/HAT/OS/kernel/firmware/driver/HailoRT/TAPPAS/Hailo
  Apps/HEF/post-processor/camera tuple;
- a pinned MediaPipe browser/WASM/delegate tuple;
- simultaneous same-exposure volatile fan-out;
- exposure authority, common-clock mapping, and uncertainty proof;
- independent action and floor-contact truth;
- participant minimums, consent, privacy review, schedule, and metric gates.

Any missing prerequisite produces an incomplete result, never a partial
qualification.

## Verification

Run:

```text
node scripts/validate-hailo-mediapipe-comparison-plan.mjs
node --test scripts/validate-hailo-mediapipe-comparison-plan.test.mjs
```

The adversarial suite rejects capability invention, unavailable-value
fabrication, sequential-frame substitution, raw retention, capture-arrival
latency, incomplete confusion matrices, unpinned tuple substitution, missing
persona/placement/negative coverage, premature results or selections, source
digest drift, sparse arrays, unknown fields, duplicate keys, non-canonical
JSON, BOMs, malformed UTF-8, and oversized input.
