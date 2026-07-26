# Lens distortion and rectification campaign — 2026-07-25

Status: strict zero-result I-039 plan pre-registered; calibration, camera use,
participant collection, target mutation and persistent artifact writes remain
blocked

Authority: D-002, D-043, D-044, D-077, D-078, D-090, D-091, D-092, D-102,
D-103, D-105, D-110, I-035, I-037, I-039, I-053, I-059 and Q-013

## Purpose

The shared-camera and geometry plans require distortion, crop, edge, floor and
action evidence, while the coordinate contract requires adapters to disclose
their pixel transforms. None determines whether the tracker receives raw or
rectified pixels, whether a post-inference coordinate correction is being
mistaken for pre-inference rectification, or which versioned calibration bytes
may be reused later.

`benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json`
pre-registers that comparison. It contains no selected camera, lens model,
target, room, participant, threshold, pipeline, stored artifact or result.

## Three distinct strategies

Every exact camera/mode/target configuration compares:

1. a raw, unrectified baseline;
2. rectification applied to pixels before inference; and
3. raw inference followed by a post-inference coordinate-transform control.

The third lane measures whether coordinate correction helps downstream
geometry. It cannot claim that the inference model saw rectified pixels.
Preview output, UI state, configuration text or transformed landmarks also
cannot prove the model input. The pre-inference lane requires evidence at the
actual inference-input boundary.

Accuracy comparisons use the same optical capture sequence so motion and
lighting do not confound strategy. Latency comparisons additionally run the
real live pipeline with paired warmup, order and load controls. A strategy must
be selected by a frozen rule before results; a target or strategy cannot rescue
another target or failed cell.

## Calibration and independent validation

The plan covers ordinary x86-64 Linux with the external camera, SteamOS with
the external camera, and Raspberry Pi 5 plus AI HAT+ with the integrated camera
lane. Each exact target/camera/mode configuration requires at least:

- 30 calibration images spanning center, corners, edges, near/nominal/far
  distance roles and negative/level/positive target pitch roles; and
- 20 separate validation images whose target observations were not used to fit
  the calibration.

Across three target configurations that is 90 calibration images and 60
independent validation images. The target geometry must be independently
measured. Manufacturer coefficients cannot substitute for received-unit and
exact-mode evidence. Brown-Conrady and equidistant fisheye are candidate model
families, not selected production models.

## Pose, action, floor and latency matrix

The blocking comparison crosses three targets, three strategies, two standing
persona classes, nine center/quarter/distortion-edge positions and seven
postures. That is 1,134 cells. Twenty valid trials per cell produce 22,680
trials. Every trial retains exact target, camera mode, strategy, frame and
ground-truth joins plus the applicable jump, duck and dodge outcome. Center or
aggregate accuracy cannot rescue an edge, persona, strategy or target failure.

Each target/strategy lane also requires at least 1,000 measured live frames,
or 9,000 frames total. Measurements retain exposure, capture, rectification,
inference, post-processing and game-receipt timing plus CPU, GPU, memory and
bandwidth cost. Capture-arrival time cannot substitute for exposure time.

D-110's fixed end-to-end gate remains 120 ms at p95 from exposure to recognized
action receipt. Existing action precision and recall floors remain 95% and 90%.
Calibration residual, pose, edge regression, crop, floor and rectification
overhead gates remain null until the owner approves qualified instruments,
uncertainty and failure consequences before collection.

## Stored calibration artifact boundary

The plan proposes `vcg-lens-calibration/v1` as an adapter boundary, not an
implemented or authorized persistent record. A future artifact must bind its
exact camera identity digest, target tier, capture path, pixel format,
resolution, nominal frame rate, orientation, mirroring and pre-inference crop.
It also carries the distortion model and coefficients; intrinsics,
rectification and new-camera matrices; rectified ROI; raw-to-rectified and
rectified-to-declared coordinate mappings; protocol and observation digests;
validation summary; validity envelope; creation/expiry; and a source-manifest
digest.

Unknown versions and any camera, mode, orientation, crop, target or validity
mismatch fail closed. No camera or target may reuse another configuration's
artifact. The artifact contains no raw image or video and cannot authorize
itself merely because it exists in writable storage. The privileged storage,
integrity, update, rollback, invalidation and transaction design remains an
owner-reviewed implementation decision.

## Data and execution boundary

Released evidence prefers calibration coefficients, numeric residuals,
skeleton summaries and bounded performance measurements. Raw home video and
frames are prohibited from the repository and release. A separately approved
protocol may retain redacted calibration-target images after EXIF, location,
stable device identity, faces, names, addresses, screens, reflections and
household identifiers are removed.

Before physical execution:

1. resolve `OWNER_QUESTIONS_LENS_DISTORTION_RECTIFICATION_2026-07-25.md`;
2. qualify and bind the exact camera, geometry, target configurations and
   capture/inference/post-processing pipelines;
3. freeze the model-selection and strategy-selection rules plus every numeric
   gate;
4. bind independent optical, pose/action, floor and exposure-time ground truth,
   instruments, uncertainty, data handling and schedule;
5. review a ready-plan/result transition—the current validator intentionally
   accepts only the blocked zero-result state; and
6. obtain explicit camera, participant, target-mutation, persistent-write and
   purchase authority.

Validate the tracked plan with:

```powershell
node scripts/validate-lens-distortion-rectification-plan.mjs `
  benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json
node --test scripts/validate-lens-distortion-rectification-plan.test.mjs
```

Passing these commands proves only the plan's canonical structure, source
freshness, bounded matrices, zero-result state and claim boundaries. It proves
no physical calibration, accuracy, latency, floor contact, action result,
artifact durability or target qualification.
