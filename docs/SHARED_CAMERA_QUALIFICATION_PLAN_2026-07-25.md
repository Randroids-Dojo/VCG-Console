# Shared wide-angle UVC camera qualification plan — 2026-07-25

Status: strict blocked I-177 plan; one existing merchandise candidate, zero
purchase or execution authority, and zero physical results

Authority: D-021, D-043, D-044, D-045, D-046, D-090, D-091, D-092, D-093,
D-110, I-015, I-177, I-178, I-179, I-193, I-194

## Purpose

I-177 must select one replaceable wide-angle UVC RGB camera contract shared by
the ordinary x86 Linux, SteamOS, and Raspberry Pi tiers. A merchandise page or
successful capture on one workstation cannot qualify the camera, its privacy
behavior, or another target.

`benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json`
pre-registers the complete proof shape before a device is ordered, received,
or measured.

## Candidate boundary

The plan carries the existing BOM candidate:

- Logitech Brio Pro Ultra HD Webcam;
- merchandise model `960-001105`; and
- manufacturer-stated UVC, 1920 by 1080 at 60 FPS, and adjustable 90/78/65
  degree diagonal field of view.

Those are advertised claims only. The plan explicitly records that the camera
is not selected, ordered, purchased, received, or qualified. It contains no
delivered quote, receipt, or received-device identity.

## Source bindings

The plan binds the current bytes of the dated BOM, microphone-disablement plan,
camera capture-policy plan, exposure-to-game-API latency campaign, prototype
success criteria, Steam Machine research, and product research. A source
change makes the plan stale rather than silently changing the campaign.

## Targets and 40 cells

All three target configurations are required:

1. ordinary x86-64 Linux with an external camera;
2. SteamOS with an external camera; and
3. Raspberry Pi 5 plus the selected AI HAT with an integrated fixed-angle
   camera.

Every target hardware, image, kernel, driver, runtime, USB topology, and
packaging binding is currently null.

The validator derives exactly 40 cells:

- four shared-camera checks;
- eleven checks repeated independently on all three targets; and
- one packaging check for each target.

The shared checks cover delivered/received identity, physical optical shutter,
capture activity indication, and standard-connector replacement plus mandatory
recalibration.

Each target separately covers Linux USB/V4L2 identity, a genuine 1080p60 mode,
sustained capture, room coverage, distortion/crop/floor geometry, exposure and
low light, exposure timestamp authority, exposure-to-game-API latency,
hot-plug recovery, suspend/resume, and microphone disablement.

Packaging cells separately cover ordinary-x86 external mounting, SteamOS
external mounting, and the Pi integrated fixed-angle enclosure.

No target or aggregate can rescue another failed or missing cell.

## Fixed and open gates

The current fixed requirements are:

- genuine 1920 by 1080 capture at 60 FPS;
- p95 exposure-to-recognized-action receipt no greater than 120 ms;
- a physical optical shutter;
- an ordinary-user-visible capture indicator;
- a standard replaceable connector/cable path; and
- no default audio capture.

Manufacturer frame-rate claims, duplicated frames, capture-arrival timestamps,
inference-only timing, muted audio, and UI-only privacy state cannot satisfy
those gates.

Attempt count, sustained duration, hot-plug and suspend-cycle counts, field-of-
view floor, distortion, drops, exposure, low-light, reconnect/recovery, and
delivered-price gates remain null. They must be frozen before execution.

## Data and authority

The blocked plan authorizes no temporary frame analysis, room capture, or
participant session. Raw room video is not the default and raw-frame retention,
network egress, participant identifiers, and free text are prohibited.
Releasable evidence is skeleton and numeric data only.

There is no result digest, qualified target, qualified or selected camera,
purchase authority, BOM mutation, or execution authority.

## Validation

Run:

```powershell
node scripts/validate-shared-camera-qualification-plan.mjs
node --test scripts/validate-shared-camera-qualification-plan.test.mjs
```

The validator requires canonical bounded UTF-8 JSON, closed ordered fields,
fresh source bindings, the exact candidate and targets, all 18 check
definitions and 40 derived cells, null unresolved gates, privacy exclusions,
and the zero-result boundary.

The adversarial suite changes sources, candidate authority, targets, checks,
evidence, counts, capture/latency/privacy gates, result claims, and byte
encoding to prove the plan fails closed.

## Current boundary

This tranche moves I-177 from a prose requirement to an auditable blocked
campaign. It proves no actual USB mode, frame rate, optical quality, latency,
reconnect, suspend behavior, privacy control, room coverage, physical fit,
price, or target compatibility.

Execution and any order remain blocked on the questions in
`OWNER_QUESTIONS_SHARED_CAMERA_QUALIFICATION_2026-07-25.md`.
