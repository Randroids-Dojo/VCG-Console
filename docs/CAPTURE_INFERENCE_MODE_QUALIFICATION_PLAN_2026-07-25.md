# Capture and inference mode qualification plan — 2026-07-25

Status: strict blocked I-178 plan; no camera session, result, qualification, or
default-mode selection exists

Authority: D-044, D-110, D-121, D-125, D-130, I-015, I-177, I-178, I-208,
I-210

## Purpose

I-178 requires a same-session comparison of the genuine shared-camera modes
that could become the product default. The checked-in plan prevents a result
from silently changing the camera mode, preprocessing path, tracker, room,
participants, action set, latency endpoints, or acceptance gates after
measurements are visible.

The plan compares four required execution candidates:

1. 1920 by 1080 at 60 FPS capture with separately measured downscaled
   inference;
2. direct 1280 by 720 at 60 FPS capture and inference;
3. 1920 by 1080 at 30 FPS capture with separately measured downscaled
   inference; and
4. direct 1280 by 720 at 30 FPS capture and inference.

The two 30 FPS rows are fallback candidates, not permission to weaken action,
latency, false-activation, room, persona, or evidence gates. Every row must run
before a comparison can select among them.

## Bound sources

`benchmarks/capture-inference-mode/shared-camera-capture-inference-mode-plan-v1.json`
binds the exact current bytes of:

- the blocked camera capture-policy plan and its validator;
- the exposure-to-game-API latency validator;
- the browser tracker and worker implementations;
- the Motion `0.4.0` contract; and
- the prototype success criteria.

A source change makes the plan stale. Refreshing a digest is a reviewed plan
change, not a result repair.

## Fair comparison

The comparison requires one paired session, a counterbalanced mode order, one
camera stream at a time, the same persona movement script, and identical room,
placement, lighting, tracker, and action rules. Raw-frame replay is prohibited:
it would create a retained-room-imagery boundary and would not exercise the
camera's real mode changes.

Each exact persona/placement/lighting cell requires 20 measured attempts for
each of the ten current Motion actions. Every mode/cell also requires a
15-minute negative window covering privileged Back, Pause, Home, Resume, and
Exit behavior. Drops, invalid attempts, failures, and retries remain visible;
they cannot be deleted or replaced by an aggregate.

The exact placement and lighting lists, warmup count, interleave block size,
and derived schedule counts remain null until the room and counterbalanced
schedule are approved.

## Measurements and fixed gates

Every mode/cell publishes attempt-level:

- capture and inference FPS;
- dropped frames;
- exposure time;
- trustworthy exposure-to-game-API latency with p50, p95, p99, and worst;
- pipeline-stage timing;
- action precision and recall;
- USB bandwidth; and
- system CPU and RAM load.

The existing fixed gates remain:

- p95 exposure-to-recognized-action receipt no greater than 120 ms;
- action precision at least 0.95;
- action recall at least 0.90; and
- zero unintended privileged actions.

Capture arrival, browser callback, inference-only, animation, and display
timestamps cannot substitute for the exposure-to-game-API endpoints.

Minimum sustained capture/inference rates, maximum drop rate, p99/worst
latency, exposure, CPU, RAM, USB, sampling, and selection gates remain null.
They must be frozen before execution so the observed result cannot choose its
own definition of success.

## Privacy and authority

The blocked plan authorizes no temporary frame analysis. A ready plan needs a
separate data-handling protocol and participant authority. Raw-frame
retention, raw-frame replay, network egress, participant identifiers, and free
text stay forbidden; the releasable trace is skeleton-only.

The current artifact contains no result digest, qualified mode, selected mode,
product-default mutation, execution authority, or purchase authority.

## Ready plan and derived result

`scripts/validate-capture-inference-mode-result.mjs` defines the only accepted
transition out of the blocked plan. A ready plan must preserve all source
bindings, four mode identities and capture rates, personas, actions, fixed
gates, fairness rules, privacy exclusions, and zero-result fields while
filling:

- the exact target, image, camera, qualified-camera result, capture-policy
  result, tracker, room, participant, ground-truth, schedule, clock, and data
  protocol bindings;
- pixel format and capture-control preset for every mode;
- strictly smaller inference dimensions for both downscaled rows;
- placement and lighting IDs, warmups, interleave size, derived cell/attempt
  counts, and resource sampling;
- all open capture, inference, drop, p99/worst latency, exposure, CPU, RAM, USB,
  and data-handling gates; and
- a qualification-only selection policy that cannot mutate the product
  default.

All distinct bindings require distinct digests. Only hardware exposure start,
an uncertainty-bounded exposure midpoint, or an independently validated exact
driver exposure timestamp is accepted. Capture arrival remains invalid.

The result expands the ready plan into every ordered mode/persona/placement/
lighting cell. Each cell contains the four required evidence digests, all ten
actions with exactly 20 attempts, and its complete negative window. Attempts
record exposure time, uncertainty, ordered game-API events, capture/inference
FPS, captured and dropped frames, exposure, CPU, RAM, USB, and an opaque
evidence digest.

The validator derives true positives, false negatives, wrong/duplicate/idle
false positives, precision, recall, nearest-rank p50/p95/p99/worst latency,
resource/drop/exposure gates, action dispositions, cell dispositions, mode
qualification, and the overall result. A valid product failure remains a
rejection even when another attempt is invalid; purely invalid or stopped work
is incomplete. No summary can rescue a row.

Qualified mode IDs may be reported only when all their cells pass. The result
always keeps `selectedModeId` null and `productDefaultChanged` false. Raw-frame
retention, replay, network egress, paths, participant identifiers, and free
text remain prohibited.

## Validation

Run the strict validator and adversarial tests with:

```powershell
node scripts/validate-capture-inference-mode-qualification.mjs
node --test scripts/validate-capture-inference-mode-qualification.test.mjs `
  scripts/validate-capture-inference-mode-result.test.mjs
```

The 26 adversarial groups require bounded canonical UTF-8 JSON, closed ordered
fields, the exact four modes, source freshness, the complete action and
negative matrix, honest latency endpoints, immutable ready-plan transitions,
attempt-level scoring, derived summaries, privacy exclusions, and no product
selection authority.

## Current boundary

This tranche advances I-178 from an unstructured open comparison to an
auditable blocked plan. It does not prove that any camera exposes a genuine
mode, that the tracker sustains it, that a person completed a trial, that any
latency or action gate passed, or that a product default should change.

Execution remains blocked on the decisions recorded in
`OWNER_QUESTIONS_CAPTURE_INFERENCE_MODE_2026-07-25.md`.
