# Pi 5 CSI fallback comparison plan — 2026-07-26

Status: strict blocked I-033/I-034 zero-result plan; no qualifying UVC failure,
fallback opening, received Camera Module 3 Wide, operation, comparison result,
selection, or D-043 superseding decision exists

Authority: D-043, D-044, D-045, D-090, D-091, D-092, D-110, I-033, I-034,
I-035 through I-040, I-053, I-177, Q-013

## Outcome

The repository now has one source-bound contract for the two conditional CSI
investigations. It tests Raspberry Pi Camera Module 3 Wide only after an exact
shared-UVC product gate fails, then compares the complete UVC and CSI camera
paths without weakening the common product contract. It records no result.

D-043 remains authoritative. One replaceable wide-angle UVC RGB camera is the
cross-tier incumbent. Camera Module 3 Wide is a Pi-only conditional fallback,
not a current substitute, second baseline, or evidence for Steam Machine or
ordinary x86 Linux.

## Trigger before candidate work

The fallback remains closed until all of these exist:

- a valid exact shared-camera qualification result with one failed product
  gate;
- preserved failed cells, attempts, environment and first-failure evidence;
- a reproducible root-cause and failure-window record;
- evidence that the failure is relevant to the final Pi product rather than a
  bad fixture, unsupported cable, guessed mode or development host; and
- an owner-reviewed Q-013 opening decision naming the exact failed gate.

Vendor specifications, advertised field of view, driver availability,
libcamera preview, cable convenience, one frame, one run, another target, or an
aggregate cannot open the fallback.

## Candidate fact boundary

The existing source note records only that Camera Module 3 Wide offers
autofocus and a 120-degree diagonal field of view. That is candidate context,
not a received-device result. Exact part, revision, lens, cable, ribbon,
connector, mounting, driver, firmware, capture mode, controls, timestamps,
enclosure, shutter, indicator, power and service identities remain open.

No camera is selected, purchased, received, installed, operated or qualified.

## Attribution boundary

Camera Module 3 Wide and an unknown future UVC baseline differ in sensor,
optics, lens, controls, rolling-shutter behavior and interface. The comparison
therefore reports a `complete-camera-path-difference`. It cannot claim a pure
CSI interface benefit without a separately reviewed matched-hardware control.

A lower glass-to-memory latency, wider calibrated field, different blur, or
higher action score belongs to the combined candidate path unless the matched
attribution protocol proves otherwise. This prevents a sensor or lens benefit
from being mislabeled as CSI, and prevents a CSI fault from being blamed on the
camera without evidence.

## Two paths and eight phases

Both the exact shared-UVC incumbent and Camera Module 3 Wide CSI candidate run
on the same final Pi 5 product image, complete workload, integrated placement,
lighting schedule, operation schedule and independent oracles.

Each path completes:

1. receipt, identity, installation and mode enumeration;
2. calibrated coverage, distortion, crop and floor geometry;
3. exposure-to-memory latency, jitter, buffering and timestamps;
4. capture controls, lighting, image quality and motion blur;
5. edge pose/action accuracy and exposure-to-action latency;
6. sustained complete-workload power, thermal, radio and frame integrity;
7. boot, update, reconnect, fault recovery and calibration invalidation; and
8. enclosure, privacy, service, maintenance, cost and independent review.

The 16 path/phase cells inherit eight upstream coverage contracts: shared
camera qualification, integrated geometry, lens rectification, capture policy
and lighting, center/quarter/edge pose, real-room action/negative sessions,
D-110 latency, and the complete Pi product workload. A narrow comparison does
not replace those campaigns.

## Evidence and fixed gates

Independent oracles record exact camera/mode/control identity; calibrated
horizontal, vertical, diagonal and useful pose area; distortion/crop/floor/edge
error; exposure-to-first-authoritative-memory p50/p95/p99/worst; jitter,
buffering, drops, duplicates, corruption and reordering; image quality and
blur; core-17/action results; full exposure-to-game-API timing; resources,
power, temperature and coexistence; lifecycle recovery; privacy, safety,
service, delivered cost and every adverse attempt.

Capture-arrival time, inference-only time, vendor UI, advertised field of view,
preview video or a successful operating-system enumeration cannot substitute
for those measurements.

Fixed gates retain:

- zero valid product, safety, privacy, integrity or recovery failures;
- complete 16-cell coverage with no path, phase, persona, position, lighting or
  aggregate rescue;
- genuine sustained 1920x1080 at 60 FPS unless D-044 is separately superseded;
- exposure-to-game-API p95 at or below 120,000 microseconds;
- the exact UVC failure remaining visible and failed;
- material closure of that exact gate without creating another failure;
- the physical shutter and truthful camera-state requirements; and
- a separate D-043 owner decision before any CSI selection.

All material-improvement, sample, timing, jitter, image, coverage, action,
power, thermal, recovery, cost, service, supply, ranking, expiry and retest
thresholds remain open and must be frozen before operation.

## Decision boundary

A CSI candidate cannot pass merely by avoiding the UVC trigger. It must close
the exact failed gate and pass every common gate under the same or stricter
contract. The UVC failure cannot be averaged away, and CSI evidence cannot
qualify UVC or another target.

Even a passing complete CSI path is only evidence for an owner decision. It
does not automatically supersede D-043, select hardware, create a Pi-specific
product fork, or mutate the BOM.

## Authority and data boundary

This plan does not authorize purchasing, returns, vendor contact, installation,
ribbon routing, driver/firmware mutation, persistent calibration writes,
camera or target operation, participant collection, destructive faults,
selection, D-043 supersession, BOM changes, publication or compatibility
claims.

Future public evidence uses opaque camera, unit, lot, session, persona,
position, lighting, trial, fault and reason labels with closed metrics and
digests. It excludes raw frames/audio/video, participant or stable hardware
identifiers, receipts/contact data, host/path/network values, household/profile
payloads, credentials/payment/address data and free-text camera or fault logs.

## Validation

Run:

```powershell
pnpm validate:csi-fallback
```

The validator enforces canonical UTF-8 JSON, exact sources, the trigger gate,
two paths, attribution limits, matrix arithmetic, fixed and open gates,
authority denials, data limits, blocker order and the null result.
