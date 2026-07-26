# Camera capture-policy campaign — 2026-07-25

Status: method pre-registered and machine-checked; collection and policy
selection remain blocked

Authority: D-002, D-043, D-044, D-110, I-036, I-040, Q-019, Q-211, Q-212

## Purpose

I-036 requires an explicit exposure, gain, white-balance, focus, buffering,
pixel-format, and frame-rate policy for motion. A camera advertising a mode or
producing attractive still images is not enough. The selected policy must
preserve the genuine 1920 by 1080 at 60 frames-per-second capability required
by D-044 while controlling motion blur, low-light noise, color drift, landmark
error, action misses, false actions, and drops in the selected room.

`scripts/validate-camera-capture-policy-campaign.mjs` defines two closed
formats:

- `vcg-camera-capture-policy-plan/v1` freezes the exact camera, controls,
  lighting strata, timestamp authority, optical and pose/action truth,
  participants, data handling, trial volume, and acceptance gates before
  results are available.
- `vcg-camera-capture-policy-result/v1` binds the canonical plan bytes and
  records every ordered preset/persona/lighting/motion cell. The validator
  derives which presets qualify and selects the first qualifying preset in
  the frozen plan order.

The checked-in plan is deliberately blocked. It contains no camera or
collection authority, every UVC control and acceptance gate is null, and the
lighting strata are not yet classified as blocking or exploratory.

## Fixed campaign shape

The plan fixes three candidate roles in this order:

1. `automatic-baseline` — the exact device automatic-control baseline;
2. `balanced-manual` — a manually bounded image-quality and motion balance;
3. `short-exposure-manual` — a manually bounded motion-freeze candidate.

This order is the selection policy. Automatic controls win only if every
blocking cell passes. A single blocking failure moves selection to the next
fully qualifying preset; aggregate averages cannot rescue that failure.

Before a ready plan exists, every preset must disclose these exact controls:

- pixel format;
- automatic or manual exposure and, when manual, exposure time in
  microseconds;
- automatic or manual gain and, when manual, the device-normalized gain in
  milli-decibels;
- automatic or manual white balance and, when manual, Kelvin;
- automatic, manual, or fixed focus and any manual focus value;
- 50 or 60 Hz power-line compensation; and
- capture buffer count.

Manual exposure may not exceed 16,666 microseconds. That ceiling prevents a
ready plan from quietly asking for an exposure longer than one nominal 60 Hz
frame interval. It does not itself prove a sustained frame rate.

Every result contains all combinations of:

- three capture presets;
- `adult-standing` and `school-age-child-standing` blocking personas;
- daylight, backlight, warm-lamp, cool-lamp, television-only, and dim lighting;
- neutral, left/right dodge, duck, jump, and left/right menu-swipe motion; and
- exactly 20 ordered scheduled trials per cell, each retained as valid or
  invalid with one bounded reason code.

The full matrix is 252 cells and 5,040 physical trials. Each cell also binds a
60-second captured/dropped-frame observation. A ready plan computes its
blocking cell and trial counts from the owner-reviewed lighting
classification. Nonblocking lighting still remains in the result as tradeoff
evidence, but it cannot select or reject a preset.

## Lighting boundary

Every lighting condition receives a closed minimum and maximum illuminance in
millilux and a blocking boolean. The result records the median measured
illuminance and must keep it inside that range. At least one condition must be
blocking, and the minimum of the blocking ranges must exactly equal the
plan's selected minimum blocking illumination.

This prevents three common substitutions:

- naming a condition “dim” without measuring it;
- selecting a lux floor that the matrix never exercises; and
- hiding a failed required condition in an all-room average.

Q-019 has not selected the minimum acceptable illumination. The tracked plan
therefore leaves the floor, every range, and every blocking flag null. It does
not imply that television-only or dim-room play is supported.

## Timestamp and ground-truth authority

Capture-arrival, browser callback, and inference-start timestamps are not
camera exposure timestamps. A ready plan accepts only:

- hardware exposure start;
- hardware exposure midpoint with a conservative start-time uncertainty; or
- a driver timestamp independently validated as exposure time for the exact
  camera, mode, controls, driver, and buffering configuration.

The exact proof is SHA-256 bound. The optical ground-truth protocol is also
bound separately; its commanded reference and labels must be independent of
the candidate camera/tracker output. The reference is still observed through
the camera under test. Candidate confidence cannot label candidate quality.

The campaign uses five independent measurements per cell:

- captured and dropped exposure accounting over exactly 60 seconds;
- p95 moving-target edge width in millipixels for motion blur;
- p95 CIEDE2000 error against a neutral reference in milli-delta-E for
  white-balance/color drift;
- p95 torso-normalized MediaPipe core-17 error against independent pose truth;
  and
- correct-outcome recall plus wrong Motion action count across the 20 trials.

The result also records exposure-authoritative p95 exposure time. Full
exposure-to-game-action latency remains the separate I-015/D-110 campaign;
this capture-policy result cannot claim that gate.

## Acceptance and derivation

A ready plan must freeze all of these gates before collection:

- minimum blocking illuminance;
- minimum captured frame rate from 59,000 through 60,000 millihertz;
- maximum dropped-frame rate;
- maximum p95 exposure time;
- maximum p95 blur width;
- maximum p95 color error;
- maximum p95 normalized landmark error;
- minimum correct-outcome recall of at least 0.90; and
- maximum wrong Motion actions per cell.

The validator recomputes frame rate from captured frames and duration and
drop rate from captured plus dropped frames. It evaluates every blocking cell
against every gate. It then derives:

- `policy-selected` plus the first fully qualifying preset ID; or
- `no-qualified-preset` plus a null selection; or
- `incomplete` plus a null selection when any scheduled repetition is invalid
  or a cell lacks its exact lighting/observation measurements.

The result cannot provide its own per-cell pass flag. Summary counts,
qualified preset IDs, selection, and disposition must exactly match the
derived values. Every repetition number 1 through 20 is explicit; a stopped,
equipment-faulted, lighting-invalid, ground-truth-invalid, timestamp-invalid,
or protocol-invalid trial stays in place and cannot be silently replaced.

## Data minimization

The ready plan must explicitly authorize only volatile frame analysis under a
separately bound data-handling protocol. The closed policy requires:

- raw room video off by default;
- zero retained raw frames;
- skeleton and numeric release artifacts only;
- no participant identifiers; and
- no free-text evidence fields.

The result binds capture, optical, and ground-truth traces by SHA-256. It may
retain the minimized independent optical ground truth, but no raw room frame
or video. Any temporary material needed for independent labeling must have
its own consent, access, deletion, and verification procedure before the plan
can become ready.

## Workflow

1. Resolve the owner inputs in
   `OWNER_QUESTIONS_CAMERA_CAPTURE_POLICY_2026-07-25.md`.
2. Inventory the exact camera modes and UVC controls without treating a mode
   advertisement as sustained evidence.
3. Bind the room lighting, optical ground-truth, pose/action, exposure-time,
   participant, and data-handling protocols by SHA-256.
4. Fill every control, lux range, blocking flag, count, and acceptance gate in
   a new ready plan before observing result data.
5. Validate the plan:

   ```powershell
   node scripts/validate-camera-capture-policy-campaign.mjs `
     benchmarks/camera-capture-policy/<campaign>-plan.json
   ```

6. Record all 252 ordered cells and all 5,040 ordered repetitions without
   omission, replacement, or reordering.
7. Publish only minimized traces and their digests, then validate the result:

   ```powershell
   node scripts/validate-camera-capture-policy-campaign.mjs `
     benchmarks/camera-capture-policy/<campaign>-plan.json `
     benchmarks/camera-capture-policy/<campaign>-result.json
   ```

8. If the camera, room, control values, lighting floor, protocol, or gate
   changes, create a new plan rather than editing a completed result.

Contract tests run with:

```powershell
node --test scripts/validate-camera-capture-policy-campaign.test.mjs
```

The tests are synthetic. They prove schema closure, ordering, arithmetic,
selection derivation, and claim boundaries, not camera performance.

## Current boundary

This tranche creates an auditable I-036 method; it does not complete I-036 or
I-040. No physical camera, room, participant, frame, exposure, blur, color,
landmark, action, or target result has been recorded. The owned C920 remains a
development fixture and cannot establish D-044's shared genuine 1080p60
camera requirement. No camera or equipment has been selected or purchased.
