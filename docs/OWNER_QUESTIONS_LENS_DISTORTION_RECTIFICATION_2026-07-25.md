# Owner questions: lens distortion and rectification — 2026-07-25

The I-039 plan remains blocked without these inputs. Safe defaults grant no
camera collection, participant session, target mutation, persistent
calibration write or purchase authority.

## LDR-001: exact camera, lens and mode identity

Which received camera/lens revisions, firmware, target ports/capture paths,
pixel formats, 1920 by 1080 at 60 FPS modes, orientation, mirroring and crops
are blocking on ordinary x86 Linux, SteamOS and Raspberry Pi?

Safe default: bind every exact identity and mode independently after the shared
camera and geometry campaigns select them. Do not inherit calibration by model
name or advertised specification.

## LDR-002: inference-input oracle

Which instrumented boundary proves the exact pixels, dimensions, crop,
orientation and rectification state delivered to each inference backend?

Safe default: hash or otherwise attest bounded nonidentifying test inputs at
the final pre-inference adapter boundary. Preview, configuration, logs and
post-inference landmarks are insufficient.

## LDR-003: distortion model selection

May Brown-Conrady and equidistant fisheye both enter model selection, and what
precommitted rule selects or rejects a model for an exact camera mode?

Safe default: keep the selection null. Freeze a complexity-penalized rule and
independent-validation gates before observing campaign results; retain rejected
model evidence.

## LDR-004: calibration target and observation geometry

Which independently measured target, printer/display process, square or point
dimensions, flatness tolerance, distances, tilts, coverage positions,
illumination and focus rules define a valid observation?

Safe default: no household screen or unmeasured printout. Use a traceable flat
target, record measurement uncertainty and reject blur, glare, clipping,
autofocus drift or incomplete edge coverage without silently replacing cells.

## LDR-005: optical and coordinate gates

What maximum independent reprojection error, straight-line residual, coordinate
round-trip error, edge regression, field-of-view loss and crop loss apply?

Safe default: keep all values null until the independent target, expected
action consequences and instrument uncertainty are approved. Freeze gates
before collection and require every blocking cell to pass.

## LDR-006: pose, floor and action gates

What maximum per-landmark p95 and floor-plane/contact errors apply, and do the
existing 95% precision and 90% recall action floors require stricter per-edge
or per-persona thresholds?

Safe default: retain the existing action floors, add no new numeric accuracy
claim and allow no center, aggregate, persona, strategy or target rescue.

## LDR-007: rectification latency and resource budget

What p95 rectification overhead and CPU, GPU, memory and bandwidth budgets are
acceptable on each target while preserving D-110's 120 ms exposure-to-action
p95 gate under representative concurrent load?

Safe default: keep overhead gates null and measure every stage with qualified
exposure time. Capture-arrival timing does not qualify D-110.

## LDR-008: strategy selection policy

Must every tier use one common raw, pre-inference-rectified or post-inference
control strategy, or may targets select independently under one frozen rule?

Safe default: allow no selection until a rule is approved. A post-inference
coordinate transform remains a control and can never be labeled rectified
inference input.

## LDR-009: stored artifact protection

Which privileged component writes, authenticates, reads, migrates and deletes
`vcg-lens-calibration/v1`, and how is its integrity bound to the active camera,
capture and inference configuration across update and rollback?

Safe default: a writable file cannot self-authorize. Fail closed on unknown
version, integrity failure or identity/configuration mismatch; do not persist
raw frames or video.

## LDR-010: validity and invalidation

What expiry, temperature/focus/mount tolerance, camera movement or replacement,
resolution/crop/orientation change, enclosure relocation and residual-check
signals invalidate the artifact, and how quickly must downstream floor/action
authority be revoked?

Safe default: bind the narrowest validity envelope and revoke before another
affected Motion/game frame. Any ambiguous change requires fresh calibration.

## LDR-011: ground truth, instruments and operators

Which calibrated optical, timing, pose, floor and resource instruments;
operators; randomization; warmup; cooldown; invalid reasons; uncertainty
budgets and stop rules apply?

Safe default: bind them before collection, keep calibration and validation
observations disjoint, retain failures and invalid attempts, and stop when the
independent oracle or target configuration drifts.

## LDR-012: participant, data and schedule authority

Who may participate, who supplies child consent/assent and comprehension
checks, what redacted target imagery may be retained, and which exact room,
schedule and operators are authorized?

Safe default: no participant or camera session. Release only bounded numeric
artifacts unless a reviewed protocol explicitly permits redacted target images;
never release raw home video or frames.
