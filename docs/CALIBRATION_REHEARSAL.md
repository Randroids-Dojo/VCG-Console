# Player and play-zone calibration rehearsal

Last updated: 2026-07-24

Status: camera-free synthetic confidence and guidance lifecycle implemented
and bound to deterministic adversarial evidence; real measurements, floor
transform, persistence, target evidence, and production thresholds remain
disabled

Authority: D-002, D-031, D-059, D-060, D-077, D-078, D-084, D-103, D-105,
D-110, I-035, I-039, I-053, I-059, I-060, I-061, I-063, I-067, I-068, I-069,
I-134, I-184, I-186, I-187, I-188, and Q-031

## Claim boundary

The console lab now rehearses D-077's calibration decision without opening the
camera or measuring a person. It:

- starts from one explicitly selected opaque local profile;
- shows notice before the automatic check;
- evaluates five closed synthetic confidence dimensions;
- automatically reaches a reviewable Ready state when every required
  synthetic dimension passes;
- guides only the dimensions that fail confidence or visibility;
- blocks unsafe placement, camera movement, no player, or multiple people;
- permits a conservative skip only for neutral-stance and usable-range
  guidance;
- invalidates a ready result after explicit changed-room or camera evidence;
- refuses late callbacks from a replaced observation attempt;
- supports controller, triggered motion, Back, Home, and cancel; and
- applies one exact synthetic result reference to the selected in-memory
  profile.

The code does not call `getUserMedia`, receive a frame or landmark, calculate
body dimensions, estimate a floor plane, map a play zone, create a homography,
set gameplay thresholds, write browser storage, write the profile vault, or
claim any current person is safe to play. Every visual and confidence value is
a labeled desk fixture.

## Closed input projection

One attempt is bound to an exact session, attempt, profile, environment token,
and camera-configuration token. A synthetic observation contains exactly:

| Field | Meaning | Boundary |
|---|---|---|
| `sampleNumber` | Exact contiguous observation ordinal | Positive safe integer; no gaps, replay, or duplicates |
| `bodyCount` | Synthetic ambiguity fact | Integer from 0 through 4 |
| `fullBodyVisible` | Synthetic head-to-foot visibility fact | Boolean |
| `feetVisible` | Synthetic floor-anchor visibility fact | Boolean |
| `cameraStable` | Synthetic camera/configuration stability fact | Boolean |
| `zoneClear` | Synthetic active-play safety fact | Boolean |
| `floorConfidence` | Synthetic floor-confidence fixture | Finite 0 through 1 |
| `zoneConfidence` | Synthetic play-zone-confidence fixture | Finite 0 through 1 |
| `scaleConfidence` | Synthetic player-scale-confidence fixture | Finite 0 through 1 |
| `neutralConfidence` | Synthetic neutral-stance-confidence fixture | Finite 0 through 1 |
| `rangeConfidence` | Synthetic usable-range-confidence fixture | Finite 0 through 1 |

Unknown fields, unsafe IDs, non-finite or out-of-range confidence, invalid
body count, out-of-sequence samples, stale session/attempt/environment/camera
references, excessive samples, expired sessions, and time rollback fail
closed.

The model accepts a minimum of 8 and maximum of 24 observations per attempt.
The current `0.82` confidence gate is a synthetic UI/test fixture only. It is
not a selected product threshold and must not be copied into a tracker or
release policy without Q-205 evidence.

Snapshots expose dimension, status, rounded synthetic confidence, closed issue
codes, guided steps, and a bounded result reference. They contain no:

- frame, pixel, image, video, or camera object;
- landmark, skeleton, face, body segment, height, weight, proportion, range,
  or measurement value;
- floor transform, homography, room geometry, zone polygon, or camera pose;
- profile display name, portrait, body-match feature, progress, or save data;
- path, key, credential, vault record, export, diagnostic payload, or network
  destination.

## State machine

```text
idle
  |
  | selected opaque profile + synthetic environment/camera tokens
  v
notice
  |
  | Start automatic check
  v
observing -- exact ordered bounded samples --> evaluate
  |                                           |
  |                                           +-- all required pass --> ready
  |                                           |
  |                                           +-- correctable failure --> guided
  |                                           |                           |
  |                                           |      fresh attempt <------+
  |                                           |
  |                                           +-- safety/ambiguity --> blocked
  |                                                                      |
  |                                                   fresh recheck <-----+
  |
  +-- Back/Home/cancel/expiry --> idle, no result

ready -- changed room/camera/configuration/confidence --> invalidated
  |                                                       |
  | Use exact synthetic result                            +-- fresh recheck
  v
profile-management revision
```

Each session expires after 120 seconds. Starting a correction or blocked-state
recheck increments the attempt and clears every prior observation. A callback
from the former attempt cannot contribute to the new result.

## Evaluation and guidance rules

The synthetic evaluator averages each confidence dimension across the exact
attempt. Safety and ambiguity facts use the strict all-samples rule:

| Evidence | Outcome |
|---|---|
| Any zero-player sample | Blocked: `no-player` |
| Any sample with more than one person | Blocked: `multiple-people` |
| Any unstable-camera sample | Blocked: `camera-moved` |
| Any unclear-zone sample | Blocked: `unsafe-zone` |
| Missing full-body visibility | Guided camera placement; player scale needs check |
| Missing feet or low floor confidence | Guided camera placement; floor needs check |
| Low play-zone confidence | Guided clear-play-zone check |
| Low neutral confidence | Guided neutral-stance check |
| Low usable-range confidence | Guided usable-range check |

Blocked outcomes mark every dimension unavailable and produce no result.
Unsafe placement and ambiguity cannot be skipped.

A guided result preserves visible passing dimensions and names only the failed
steps. Beginning a correction creates a new exact attempt rather than silently
editing old evidence.

Only a result whose failures are limited to neutral stance and usable range
may choose `Use conservative fallback`. Those two dimensions become visibly
`conservative`; floor, play zone, and player scale must already pass. This is a
prototype safety default, not a final gameplay policy. Required dimensions by
action/game remain Q-206.

## Ready result and profile application

A ready result contains exactly:

```text
calibration-fixture-<session>-<attempt>
opaque profile ID
exact session and attempt
limited: true | false
```

The calibration controller issues each Ready result into a shared bounded
collection before exposing it. At most 64 unconsumed results may exist. The
profile-management controller requires an exact issued match across result ID,
opaque profile ID, session, attempt, and limited flag, then consumes that
authority exactly once during commit. Expiry is checked against the shared
monotonic time at both planning and commit, independently of any UI cleanup
callback. Shape-valid but unissued, cross-profile, changed, invalidated,
cancelled, expired, externally consumed, or replayed results fail before
profile mutation. Expired entries are pruned before capacity is evaluated.

After provenance checks, profile management also binds current profile and
prior-calibration revision before assigning a new monotonic synthetic
calibration revision. Applying a new calibration clears any old body-match
fixture; it does not create body-match authority. Portrait and progress links
stay unchanged.

This in-process composition is not a native transaction or persistent
calibration schema. Production must bind the broker-owned result, selected
profile, measurement schema, camera/room configuration, policy version, and
protected vault revision under one reviewed commit.

## Invalidation

The controller can invalidate only a Ready result. A room-change reason
requires a different opaque environment token. Camera-change and
geometry-change reasons require a different camera-configuration token.
Confidence drop is separately explicit.

Invalidation:

- revokes the issued ready-result authority immediately;
- marks every synthetic dimension unavailable;
- sends no former state to a game;
- requires a fresh attempt before another result; and
- preserves no observation samples.

The browser does not detect movement. Production authority for detecting room,
camera, crop, resolution, mount, and floor changes remains Q-207.

## UI and input behavior

The screen labels Camera Off and states that no frame, landmark, body
dimension, floor transform, room map, or persistent calibration is produced.
A desk-only fixture selector exposes:

- Ready;
- Feet missing;
- Unsafe zone; and
- Limited range.

Production must never ask a player to select confidence. The fixture selector
exists only to exercise visible outcomes deterministically.

The automatic screen shows bounded observation progress. Guided and blocked
screens show all five dimensions with redundant shape, text, and confidence
copy. Blocked copy says not to continue active play. Ready pauses for desk
review even though D-077 selects automatic progression after a qualified real
pass.

All choices use ordinary focusable buttons. Controller Select and a triggered
hands-together action activate only the focused choice. Controller Back,
crossed-arm Back, and Home cancel without applying a result. Focus never moves
from one operation to another merely because confidence changes.

## Non-negotiable invariants

1. Calibration never starts from a detected body without an explicit joined
   player/profile context.
2. Automatic assessment precedes guided correction.
3. Passing dimensions remain visible and are not repeated without reason.
4. Safety or player ambiguity cannot be skipped.
5. A missing required dimension cannot silently become zero, guessed, or
   Ready.
6. Corrections start fresh attempts; late evidence is rejected.
7. A Ready result names one exact opaque profile and session/attempt.
8. A Ready result is issued once, consumed once, and revoked on invalidation,
   cancellation, or expiry.
9. A display name, portrait, body match, current player, or game string cannot
   select calibration authority.
10. Camera/room/configuration changes invalidate before gameplay use.
11. Applying calibration invalidates prior body matching; it never creates an
    identity prediction.
12. Games receive no result until the production broker commits a qualified
    minimized projection.
13. Frames, landmarks, body measurements, and room geometry do not enter logs,
    diagnostics, support, saves, backup, export, recovery images, or network.
14. The real feature remains disabled until thresholds, measurement schema,
    persistence, invalidation, accessibility, safety, privacy, and both-target
    evidence pass.

## Threat and failure stories

| ID | Story | Required response |
|---|---|---|
| CR-01 | A stale observation from before correction completes the new attempt. | Exact session/attempt/environment/camera binding and contiguous sample ordinal reject it. |
| CR-02 | One unsafe-zone frame is averaged away by otherwise high confidence. | Safety booleans use strict all-samples behavior; any unsafe fact blocks. |
| CR-03 | A second person, pet-like false body, mirror, or television person contaminates scale/range. | Any multi-person fact blocks; real I-069 trials must characterize false detections. |
| CR-04 | Feet are absent but floor confidence looks high. | Feet visibility independently gates the floor dimension. |
| CR-05 | Low confidence silently applies default body thresholds. | Missing dimensions remain visible; only explicitly permitted optional guidance can use conservative status. |
| CR-06 | A camera shifts after Ready and games retain the old floor/zone. | Qualified change authority invalidates the entire result before further delivery. |
| CR-07 | A same-name or predicted profile receives another person's calibration. | Exact issued profile binding plus current revision reject cross-profile substitution; names/predictions have no authority. |
| CR-08 | Recalibration leaves an old body-match template active. | Applying or requiring recalibration clears the synthetic body-match state; production must transactionally invalidate derived templates. |
| CR-09 | A hostile browser forges a Ready result ID, substitutes profile/limited fields, replays a consumed result, or adds measurements/paths. | Closed result grammar plus exact bounded one-shot issuance reject it; browser still has no native mutation authority. |
| CR-10 | Calibration confidence or body values leak through diagnostics/support. | Current model contains no values; production must use I-186 producer canaries and artifact inspection. |
| CR-11 | Session abandonment later applies a result. | Back/Home/cancel/expiry revoke issued authority and remove the session/result. |
| CR-12 | Seated, child, limited-range, assisted, or mobility-changing users are forced through unsafe standing assumptions. | Cohort-specific guidance and optional profiles remain required under Q-209; no current fixture is qualification. |

## Automated evidence

Fourteen focused calibration unit cases prove:

- frozen identity-minimized idle state;
- explicit notice, ordered observations, and minimum sample count;
- automatic Ready when every required dimension passes;
- dimension-specific guidance and passing-dimension preservation;
- fresh correction attempts and stale-callback refusal;
- unsafe-zone, camera-movement, and multi-person blocking;
- conservative skip only for optional neutral/range failures;
- closed fields, safe IDs, bounded confidence/body count, and forgery refusal;
- cancel and exact session expiry without a result;
- exact room/camera invalidation and recheck;
- maximum-sample, safe-time, and backwards-clock bounds; and
- result/snapshot exclusion of measurements and storage authority;
- exact one-shot result issuance and cross-profile/limited-field mismatch
  denial;
- revocation on invalidation/cancel and fresh corrected-result issuance; and
- unconsumed-result bounds, expired-entry pruning, invalid-expiry and
  duplicate-ID rejection, one-time consumption, and no Ready exposure when
  issuance cannot commit.

The tracked
`benchmarks/calibration/camera-free-calibration-rehearsal-v1.json` artifact
binds the exact controller, focused tests, this contract, generator, and
validator by normalized SHA-256. Eight deterministic scenarios cover full
Ready, required floor guidance, unsafe-zone blocking, explicit limited
fallback, changed-room revocation, stale-attempt rejection, exact one-shot
result consumption, and expiry revocation. A second complete run is exactly
identical. Ten adversarial validator cases reject physical/production
promotion, hidden camera/participant/measurement claims, weakened guidance or
blocking, widened fallback, replay/substitution/revocation weakening,
fabricated gameplay or room-change results, scenario/summary drift, stale
provenance, unknown claims, and malformed or oversized artifacts.

This repeatability is software determinism only. The artifact records zero
physical trials, zero gameplay-error measurements, and zero room-change
detection trials.

The profile-management suite adds issued-result provenance, cross-profile and
limited-field substitution denial, expiry refusal at both planning and commit,
consumed-result replay refusal, no-mutation failure after expiry or external
consumption, monotonic synthetic calibration revision, prior-body-match
removal, stale profile revision refusal, and exact result-ID/session/attempt
agreement.

One Chrome flow proves:

- explicit credential-free recalibration entry;
- Camera Off copy and zero `getUserMedia` calls;
- Feet Missing producing floor-only guidance while Play Zone remains Ready;
- unavailable conservative skip for a required floor failure;
- controller Back cancellation without applying a result;
- Unsafe Zone producing a fail-closed blocked screen;
- safe-room recheck reaching Ready;
- changed-room invalidation before reuse;
- fresh recheck and focused motion acceptance;
- application as synthetic profile calibration revision 8 with no body-match
  fixture; and
- no horizontal overflow at 520 by 900.

Reviewed 1440 by 1000 screenshots:

- `test-results/console-lab/calibration-guided.png`
- `test-results/console-lab/calibration-blocked.png`

## Remaining qualification

I-059 remains incomplete. Required evidence includes:

- answers to Q-031, Q-205 through Q-210, and Q-251;
- the exact minimized calibration schema and versioning;
- actual automatic estimation for room, floor, play zone, player scale,
  neutral stance, and usable range;
- qualified exposure timestamps and camera/configuration identity;
- real confidence calibration, repeatability, error distributions, and
  action/game outcome correlation;
- fixed optical geometry and room-change detection;
- floor/homography validation and depth/RGB comparison where needed;
- per-action/game required-dimension policy;
- child, adult, seated, limited-range, assisted, mobility-changing, clothing,
  lighting, occlusion, mirror, pet, television-person, and multi-person
  cohorts;
- controller, one-handed, motion false-positive, screen-reader,
  reduced-cognition, TV-distance, and localization testing;
- native broker/vault storage, schema migration, invalidation, reset, deletion,
  and target power-loss/full-disk/update/rollback evidence;
- I-186 exclusion canaries and real materialized-artifact inspection; and
- qualified safety, accessibility, privacy, security, and applicable legal
  review.

Until those gates pass, the launcher must not claim a real floor frame, safe
play zone, calibrated player, or game-ready movement range.
