# Owner questions — I-178 capture and inference mode qualification

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for every camera session,
result, qualification, or default-mode decision

## Q1 — Exact execution targets

Which exact target configurations must independently qualify: ordinary
x86-64 Linux, Raspberry Pi 5 plus the selected Hailo accelerator, SteamOS when
hardware is available, and/or Windows as a compatibility fallback?

For each approved target, provide the immutable hardware inventory,
operating-system image, kernel, firmware, camera driver, browser/runtime,
tracker bundle, model, and power/performance configuration. One target cannot
qualify another.

## Q2 — Camera and capture-policy prerequisites

Which exact received camera identity and I-177 qualification result may feed
this campaign, and which completed camera capture-policy result selects its
pixel formats and control presets?

Manufacturer claims, the owned C920 development fixture, or a blocked policy
plan cannot establish a genuine sustained 1080p60 mode.

## Q3 — Downscaled inference shape

What exact width, height, pixel/color conversion, crop/letterbox policy,
interpolation, memory-transfer boundary, and worker/native preprocessing path
must the 1080p downscaled rows use?

The resize and transfer cost must remain measured in the pipeline. It cannot
be hidden outside the latency or resource trace.

## Q4 — Fallback rows

Should both 1080p30-downscaled and 720p30-direct remain required fallback
candidates, or is a different controlled 30 FPS set intended?

If a 30 FPS mode is only a recovery state, define the exact entry/exit trigger,
visible disclosure, hysteresis, retry behavior, and whether it must still pass
the unchanged 120 ms p95 and action gates. The current plan assumes those gates
cannot be weakened.

## Q5 — Room, participants, and counterbalancing

Which exact qualified zone edges, lighting strata, blocking participants,
warmup attempts, interleave block size, and mode order form the paired
same-session schedule?

Approve the participant/guardian consent, independent ground truth, room
protocol, session duration, invalid-attempt treatment, and counterbalancing
before opening any result.

## Q6 — Exposure timestamp and clocks

Which exact exposure timestamp authority is valid for each camera/mode/driver,
and what proof binds it to the game-API receipt clock with a conservative
uncertainty?

Capture arrival, browser callbacks, inference timestamps, animation, and
display timing remain diagnostics only. They cannot qualify the D-110 gate.

## Q7 — Remaining numeric gates

Freeze the minimum sustained capture and inference FPS; maximum drop rate;
maximum p99 and worst exposure-to-action latency; maximum exposure time; CPU,
RAM, and USB ceilings; resource sampling interval; and failed/invalid-attempt
policy.

Specify each value per target if necessary. Do not choose or waive a threshold
after results are visible, and do not allow aggregate rescue of a failed
mode/persona/placement/lighting/action row.

## Q8 — Selection rule

Must one shared default win across both product tiers, or may each target
select a different qualified mode? Define the tie-break order and what happens
when no mode passes every blocking row.

The safe default is no selection and no product-default change unless the
pre-registered rule derives one from complete passing evidence.

## Q9 — Frame handling and publication

Approve the exact volatile frame-analysis boundary, skeleton-only trace
format, evidence digests, retention/deletion audit, and publication fields.

The current plan forbids raw-frame retention, replay, network egress,
participant identifiers, and free text. Any proposal to retain room imagery
requires a separate privacy, legal, security, consent, encryption, access,
incident, and deletion decision before capture.
