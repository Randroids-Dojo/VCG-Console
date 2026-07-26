# RGB versus depth floor-contact campaign

Date: 2026-07-24

Status: physical campaign and result contract pre-registered; no physical
capture, participant session, depth reference, or RGB result exists.

## Purpose

I-065 asks whether RGB-only motion can identify jump and foot-contact events
robustly enough for gameplay. This campaign compares:

- a portable core17 2D rule strategy;
- a MediaPipe 33/world-coordinate rule strategy;
- a calibrated depth floor plane for vertical geometry; and
- a synchronized independent foot-contact reference.

Depth is not automatically ground truth for contact. Quantization, reflective
surfaces, occlusion, floor-plane error, and the distance between a keypoint and
the physical sole can all shift an apparent contact event. The plan therefore
requires an independent contact reference and keeps depth-only analysis
exploratory.

The tracked plan is
[`rgb-depth-floor-contact-plan-v1.json`](../benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json).
It is a schedule and evidence contract, not a result.

## Frozen matrix

The campaign schedules two separately reported standing persona classes:

- school-age child; and
- adult.

Each class is measured at five player positions within the RGB/depth overlap:

- frame center;
- left quarter;
- right quarter;
- left edge; and
- right edge.

Each persona/position pair runs three movement blocks:

| Movement | Reference events | Attempts per cell |
|---|---|---:|
| Jump | Takeoff, apex, landing | 20 |
| Left step | Left contact loss, left contact gain | 20 |
| Right step | Right contact loss, right contact gain | 20 |

The complete matrix is 30 cells and 600 scheduled attempts. Every
persona/position pair also includes one 60-second negative window, for ten
minutes of scheduled negative exposure. Attempts cannot be silently replaced
or removed: every scheduled attempt is retained as valid or assigned a bounded
invalid reason.

Seated and limited-range cases are not folded into the standing score. The
current persona contract forbids prompting a seated participant to jump.
Those cases require separately approved comfortable actions and separately
reported exploratory evidence.

## Timestamp and reference gate

All three streams need either one monotonic clock or a measured affine mapping
to the campaign clock:

- RGB uses exposure time or a bounded exposure interval; capture-arrival time
  alone is invalid.
- Depth uses exposure time or a bounded exposure interval.
- The independent contact reference uses its hardware/sample timestamp.
- Maximum measured synchronization error is pre-registered at 5 ms.
- Maximum reference uncertainty is pre-registered at 8 ms.
- Synchronization proof is required before and after every participant
  session.

These are evidence-quality gates, not the missing product event-error gate.
The plan keeps `eventTimingGateMs` explicitly `null`, so even a complete and
otherwise perfect result is not eligible to select a strategy. Q-235 must be
answered and a superseding plan committed before data collection if an
absolute event-error gate is desired.

D-110's 120 ms p95 camera-to-action gate remains separate. Event timestamp
error cannot substitute for exposure-to-action latency because inference,
filtering, action lifecycle, publication, transport, and game consumption add
their own delay.

## Required execution identity

Before the first physical attempt, the execution record must bind:

- exact RGB device, USB identity, firmware, mode, FPS, controls, and mount;
- exact depth device, USB identity, firmware, SDK, mode, controls, and mount;
- exact independent contact-reference device, firmware, sample rate, and
  contact threshold;
- exact host, OS, monotonic clock, capture stack, pose versions, and model
  hashes;
- room-sheet, consent-record-set, and complete configuration SHA-256 values;
- floor-plane residual and shared-field coverage at every position;
- opaque session-local participant IDs and their persona classes; and
- detached configuration, skeleton-trace, depth-label, and contact-label
  digests for every cell.

No name, portrait, facial embedding, durable body identity, RGB frame, depth
frame, video, or audio is retained by default. The persistent evidence is
limited to bounded skeleton traces, event labels, configuration, and metrics.

## Event matching and distributions

Each reference event receives at most one nearest RGB prediction inside a
symmetric 250 ms matching window. One prediction cannot satisfy two reference
events. Signed error is:

> RGB prediction timestamp minus reference timestamp

Every strategy/event/cell reports:

- reference, predicted, matched, missed, and spurious counts;
- precision and recall;
- matched signed-error count, mean, p50, p95, p99, minimum, maximum, and worst
  absolute error;
- the participant session, persona class, and camera position;
- valid and invalid attempt counts; and
- exact trace and label commitments.

Negative windows report false events separately for all seven event types and
both RGB strategies. The validator recomputes attempt totals, count
relationships, rates, synchronization status, negative duration, false-event
totals, and selection eligibility rather than trusting summaries.

## Validation

[`validate-rgb-depth-floor-contact-campaign.mjs`](../scripts/validate-rgb-depth-floor-contact-campaign.mjs)
strictly validates both the pinned plan and future result documents:

```powershell
node scripts/validate-rgb-depth-floor-contact-campaign.mjs benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json
node --test scripts/validate-rgb-depth-floor-contact-campaign.test.mjs
```

Eleven tests cover:

- the exact 30-cell / 600-attempt / 10-window plan;
- a structurally complete result with all per-event distributions;
- missing-cell refusal;
- arrival-only timestamp refusal;
- depth-only contact-truth refusal;
- raw-frame retention refusal;
- plan-hash substitution;
- hidden miss/spurious-count inconsistency;
- recomputed synchronization;
- participant/persona substitution; and
- undeclared result claims.

The result schema permits a failed campaign to remain valid evidence. Invalid
attempts, high synchronization error, misses, spurious events, and large
timing errors are retained rather than making the file unparsable. They keep
selection eligibility false and must be reported.

## Remaining execution boundary

I-065 remains active. The plan cannot close it. Required work includes:

1. Q-235 instrumentation and event-error gate selection;
2. exact consented participants and room/camera geometry;
3. qualified RGB, depth, and independent contact devices;
4. synchronization and reference-uncertainty characterization;
5. all 600 retained movement attempts and ten negative windows;
6. per-participant, per-persona, and per-position distributions;
7. full D-110 action timing and false privileged-action scoring;
8. MediaPipe/RTMO/Hailo capability and unavailable-value comparison;
9. lighting, clothing, occlusion, edge distortion, and floor-reflection
   strata; and
10. ordinary x86-64 Linux and Raspberry Pi workload qualification.

Until a complete validator-passing result and explicit selection gate exist,
neither RGB strategy is preferred and no floor-contact claim is authorized.
