# Pose edge-accuracy campaign — 2026-07-25

Status: blocked plan pre-registered and machine-checked; no camera or participant
collection is authorized and no physical result exists

Authority: D-002, D-121, D-130, I-035, I-049, I-050, I-058, Q-027,
Q-034, Q-251, Q-252, Q-253

## Purpose

I-035 requires a labeled scorecard for pose accuracy at the image center,
four quarters, and four distortion edges. A visually plausible skeleton,
provider confidence, repeated candidate output, synthetic motion, or center-only
aggregate cannot establish that claim.

The canonical blocked plan is
`benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json`. Its
validator defines strict plan and result formats:

- `vcg-pose-edge-accuracy-plan/v1` freezes the exact target, camera, room,
  placement, personas, independent labels, timing, data handling, matrix, and
  thresholds before collection; and
- `vcg-pose-edge-accuracy-result/v1` binds the normalized plan bytes, requires
  every ordered blocking cell, checks trial and landmark accounting, applies
  each per-cell gate, and refuses aggregate rescue.

The checked-in plan is intentionally blocked. Null fields are unresolved
authority, not wildcards or permission to choose values after seeing results.

## Collection gate

A plan can become `ready` only when all of these are SHA-256-bound:

- exact target and camera identity, firmware, mode, optics, orientation,
  mirroring, exposure policy, and capture path;
- room geometry and the center, quarter, and distortion-edge placement
  procedure;
- adult-standing and school-age-child-standing persona/consent protocol;
- independent ground-truth procedure and its authorized operator or optical
  reference;
- timestamp proof connecting each scored exposure to its trace and label; and
- approved temporary-image handling, access, deletion, and derived-artifact
  procedure.

All five acceptance gates must be numeric before collection. A ready plan must
explicitly authorize the temporary image workflow required for independent
labels, while still prohibiting raw room video by default, retained raw frames,
participant identifiers, and free text in the release artifact.

The current plan remains blocked on exact acceptance gates, camera/room
bindings, data-handling authority, independent ground-truth authority, and
participant consent. It authorizes no equipment purchase, recruitment, camera
session, or result.

## Frozen blocking matrix

The candidate is `mediapipe-lite` projected to the Motion `0.4.0` core 17
landmarks. The two blocking persona classes are separate:

- `adult-standing`;
- `school-age-child-standing`.

`seated` is recorded as exploratory. It cannot rescue either blocking persona
and is not required for a blocking disposition in this first matrix.

Each blocking persona runs seven postures at nine positions:

- postures: neutral, arms raised, squat, left/right lean, and left/right step;
- positions: center; upper-left, upper-right, lower-left, and lower-right
  quarters; and left, right, top, and bottom distortion edges.

Every persona × position × posture cell requires exactly 20 valid trials. The
blocking scorecard therefore contains 126 cells and 2,520 valid trials. Missing,
duplicate, renamed, or reordered cells are rejected. The ready placement
protocol must define the actual body anchor, tolerances, and edge-band geometry;
the labels in this blocked plan do not invent those physical dimensions.

## Landmark measurement

Candidate and independent ground-truth points share coordinate system
`image.normalized.top-left` from coordinate specification `0.1.0`. The
comparison converts normalized x/y back to the exact bound image dimensions,
then computes pixel-space Euclidean distance. Each error is divided by the
ground-truth pixel distance from the shoulder midpoint to the hip midpoint.
This avoids treating normalized x and y as equal physical pixel scales in a
non-square image.

The scorecard keeps, for every core 17 landmark in every cell:

- compared and missing counts;
- outlier count;
- p50, p95, and worst normalized error; and
- SHA-256 bindings for the minimized trace and independent label artifact.

Candidate confidence or candidate-derived geometry cannot provide ground
truth. A trial that lacks the pre-registered independent label cannot be
silently replaced or interpreted as a successful observation. The detached
artifact scorer and collection procedure remain future work; this tranche
validates the admission envelope and its derived accounting, not the
authenticity of unavailable physical evidence.

## Disposition

Detection rate is checked per cell. Missing rate, p95 error, worst error, and
outlier rate are checked per landmark within every cell. A result passes only
when every one of the 126 blocking cells passes every applicable gate.

An average, center result, adult result, or unusually strong landmark cannot
offset one failed edge, child, posture, or landmark cell. The result summary
must exactly reproduce derived cell and trial totals. A claimed `pass` with one
failed cell is rejected; an honest `fail` remains valid negative evidence.

This scorecard does not qualify:

- action recognition or camera-to-action latency;
- calibration accuracy, floor contact, play-zone safety, or room-change
  detection;
- tracking identity through crossing or occlusion;
- seated or limited-range access;
- another backend, camera, room, target, population, or lighting condition; or
- production readiness.

## Data boundary

Raw room video is not a default evidence artifact. The release artifact must be
skeleton-only and may retain independent numeric labels, but no raw frame,
participant identifier, or free-text field. Any temporary image used for manual
ground truth must have explicit authority, access controls, retention and
deletion timing, consent/assent coverage, and a hash-bound handling procedure
before capture. Q-253 owns that decision.

## Commands

Validate the blocked plan and focused adversarial coverage:

```powershell
corepack pnpm validate:pose-edge-accuracy
```

Validate a future ready plan and result:

```powershell
corepack pnpm exec tsx scripts/validate-pose-edge-accuracy-campaign.mjs `
  <ready-plan.json> <result.json>
```

The second command is not a collection authorization. The ready plan must
first close every collection-gate field through the owners named in Q-251
through Q-253.
