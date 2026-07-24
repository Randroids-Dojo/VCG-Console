# Camera-to-action latency campaign — 2026-07-24

Status: method pre-registered and machine-checked; no physical configuration
has run or passed

Authority: D-002, D-032, D-110, D-121, D-130, I-015, I-052, I-053, I-178,
I-208, I-210

## Purpose

I-015 requires the complete interval from a trustworthy camera exposure
timestamp to receipt of the recognized action at the game API. Capture
arrival, browser callback, inference, transport, animation, and display timing
are useful sub-intervals but cannot substitute for that endpoint pair.

`scripts/validate-camera-action-latency-campaign.mjs` defines two strict
formats:

- `vcg-camera-action-latency-plan` version 1 freezes the configuration,
  timestamp authority, qualification cells, trials, negative windows, and
  acceptance gates before results are visible.
- `vcg-camera-action-latency-result` version 1 binds the exact plan bytes and
  records every attempt, triggered game-API receipt, dropped frame, negative
  window, and independent visible-response check.

The validator derives the conclusion from events. A result cannot supply its
own percentile, precision, recall, or pass flag.

## Scope lock

One plan binds these configuration records by SHA-256:

- exact target hardware, operating-system image, kernel, firmware, drivers,
  runtimes, power/performance state, and thermal/cooling state;
- camera manufacturer/model/revision/firmware, USB path class, cable/port,
  pixel format, width, height, FPS, exposure, gain, white balance, focus, and
  buffering settings;
- tracker/model/runtime, preprocessing, association, smoothing, calibration,
  action thresholds, Motion API version, process layout, transport, and game
  client;
- the representative concurrent game/audio/render/network/background
  workload;
- room and lighting evidence;
- exact placement and play-zone evidence; and
- the participant/persona protocol.

Changing any bound configuration record requires a new plan or campaign ID.
Results bind the exact UTF-8 plan bytes by SHA-256 and repeat the configuration
ID.

The plan also binds `household-one-player-v1` by repository-relative path and
SHA-256. This connects latency measurements to the existing movement,
ground-truth, privacy, and scoring protocol without modifying that protocol
after results are seen.

## Timestamp authority

The plan accepts only:

- a hardware exposure-start timestamp;
- a hardware exposure-midpoint timestamp whose proof includes the conservative
  start-time uncertainty; or
- a driver timestamp that has been independently validated as an exposure
  timestamp for the exact camera, mode, driver, and buffering configuration.

`capture-arrival` is deliberately rejected.

The plan records separate exposure and game-receipt clock IDs. They must either
be the same monotonic clock or have a SHA-256-bound affine clock-mapping proof.
The exposure semantics and clock mapping each receive their own proof digest.

Every completed attempt records:

- one run-relative monotonic exposure timestamp in nanoseconds;
- the maximum timing uncertainty for that attempt;
- all triggered Motion `0.3.0` actions at the game API, ordered by
  run-relative monotonic receipt timestamp; and
- the number of dropped frames.

Run-relative timestamps keep integer arithmetic below JavaScript's safe range.
The scorer uses a conservative upper bound:

```text
latency_ms =
  (first matching game receipt ns - exposure ns) / 1,000,000
  + timestamp uncertainty us / 1,000
```

An event before exposure is invalid. The first matching trigger is the true
positive candidate; duplicate matching triggers and every wrong action are
false positives.

## Qualification cells and volume

A cell is one exact persona class, placement, and concurrent workload.
The format supports:

- `school-age-child-standing`;
- `adult-standing`; and
- explicitly non-blocking `exploratory` sessions.

For every declared cell, the plan requires exactly 20 attempts for every
Motion `0.3.0` action:

1. `player_join`
2. `jump`
3. `duck`
4. `dodge_left`
5. `dodge_right`
6. `menu_swipe_left`
7. `menu_swipe_right`
8. `menu_select`
9. `menu_back`
10. `pause`

That is 200 action attempts per cell. Repetition numbers 1 through 20 must
each appear exactly once. Attempts cannot be omitted, duplicated, silently
replaced, or renamed after the run.

Each cell also requires at least 900,000 ms of planned negative/idle evidence.
The result records actual start/end timestamps and cannot claim a completed
window shorter than planned. Any Motion action in that window is false-positive
evidence. `menu_back`, `pause`, `home`, `resume`, and `exit` additionally have
a zero-unintended-activation gate.

A complete first-prototype claim still requires both blocking personas and
every qualified center/edge placement in `PROTOTYPE_SUCCESS_CRITERIA.md`.
`qualified-cells` means only the cells named in one result passed; an
exploratory or partial plan cannot be relabeled as full prototype evidence.

## Evidence retained per cell

Each result binds four detached evidence artifacts by SHA-256:

- the skeleton-only trace;
- the independent operator ground-truth labels;
- the concurrent workload trace; and
- the system/resource trace.

The result schema contains no raw-frame field, accepts no extra fields, and
requires `containsRawFrames: false`, `rawVideoDefault: false`, and
`skeleton-and-events-only` in the frozen plan. Raw room video remains
prohibited by default. A separately approved optical timing recording must be
minimized to the timing apparatus or handled under its own consent, retention,
and deletion procedure.

Dropped frames stay attached to their original attempt or negative window.
They are published in the derived total and never justify deleting a trial. A
drop can coexist with a detected event; recall and latency still decide the
action gate. An invalid attempt remains present and makes the campaign
`incomplete`.

## Scoring

For each action in each cell:

```text
precision = true positives / (true positives + false positives)
recall    = true positives / (true positives + false negatives)
```

A zero denominator is not a pass. Latency percentiles use nearest rank over
the conservative matching-event latencies:

```text
rank(p) = ceil(sample_count * p)
```

The validator reports p50, p95, p99, and worst. An action passes only when:

- precision is at least 0.95;
- recall is at least 0.90; and
- p95 is no more than 120 ms.

The result status is:

- `qualified-cells` when all action gates and the privileged negative gate
  pass for every declared cell;
- `rejected` when a complete result fails a gate; or
- `incomplete` when any attempt/window is invalid or incomplete, or a required
  independent visible-response check was not run.

Two slow samples out of twenty place the second-slowest sample at nearest-rank
p95 and therefore expose a tail failure. Declared timestamp uncertainty is
added before percentile calculation.

## Independent visible-response check

The plan must explicitly state whether an independent high-speed visible
response check is required.

When required, it pre-registers at least 240 frames per second. The result must
bind the optical evidence, observed frame rate, and sample count. A missing
required check makes the result incomplete; a failed check rejects it.

This check is an independent audit of the software trace, not permission to
replace the D-110 endpoints with animation or display timing. If a suitable
high-speed or photodiode rig is unavailable, the plan must explain why the
check is not run; the exposure timestamp still requires its own trustworthy
proof.

## Workflow

1. Complete the room, placement, camera, target, workload, participant, and
   timestamp-method records.
2. Generate the ordered plan before opening any result.
3. Validate the plan:

   ```powershell
   node scripts/validate-camera-action-latency-campaign.mjs `
     benchmarks/camera-action-latency/<campaign>-plan.json
   ```

4. Record every attempt and negative window without replacement.
5. Produce the detached minimized traces and enter their SHA-256 digests.
6. Validate the result:

   ```powershell
   node scripts/validate-camera-action-latency-campaign.mjs `
     benchmarks/camera-action-latency/<campaign>-result.json
   ```

7. Publish the derived per-cell/action table, every invalid/failure reason,
   drops, false activations, and timestamp proof.
8. If anything changes, create a new plan/campaign rather than editing the
   completed result.

Contract tests run with:

```powershell
node --test scripts/validate-camera-action-latency-campaign.test.mjs
```

They use synthetic data only. They prove validation and arithmetic, not camera
or player performance.

## Current boundary

This tranche establishes the auditable I-015 method and moves the
investigation to `active`. It records no actual camera exposure, person,
action, game workload, optical cross-check, or latency result. No current
configuration has a D-110 pass.

Physical execution waits on:

- exact room and placement evidence under I-001/I-002;
- camera mode/exposure qualification under I-036/I-178;
- the hands-on session in Q-204;
- trustworthy exposure-timestamp equipment/proof in Q-211; and
- the blocking-persona/consent schedule in Q-212.
