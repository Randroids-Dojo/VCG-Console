# Cross-tier camera placement and optical-geometry campaign — 2026-07-25

Status: strict zero-result I-037/I-193/I-194 plan pre-registered; physical
screening, construction and qualification remain blocked

Authority: D-002, D-032, D-043, D-044, D-045, D-077, D-090, D-091, D-092,
D-093, D-094, D-102, D-103, D-105, D-110, I-001, I-002, I-035, I-037,
I-046, I-053, I-177, I-192, I-193, I-194, I-196, I-210, Q-001, Q-002,
Q-031, Q-034, Q-036, Q-072, Q-106, Q-254, Q-255

## Purpose

D-090 through D-092 require different camera packaging by tier without
changing the shared camera or Motion contract:

- the lower-cost appliance must discover and freeze one fixed integrated
  optical axis from an adjustable below-TV prototype; and
- Steam Machine and supported-PC installations may use stable external
  placements, but every advertised placement needs its own measured envelope.

The existing room, shared-camera, pose-edge, floor-contact, action and
enclosure artifacts define prerequisites but do not join them into one
selection campaign. The tracked plan and validator now close that method gap.
They authorize no room access, camera collection, participant session,
mounting, cutting, drilling, construction or purchase.

## Source binding

The plan binds current normalized bytes for the packaging decisions, active-
play safety boundary, ABS-box screen, room/play-zone plan, shared-camera plan,
pose-edge plan, RGB/depth floor-contact plan and first real-room action plan.

Any source change makes the plan stale. A new room rule, camera contract,
safety boundary or action method cannot silently alter the campaign after
geometry observations exist.

## Integrated appliance screen

The adjustable prototype screen crosses:

- three enclosure-height roles;
- three TV-stand-depth roles;
- three player-distance roles;
- three room-width roles; and
- five upward-pitch candidate roles.

That is 405 exact geometric screen cells. The millimetre and degree values are
deliberately null until owner review. Manufacturer field-of-view claims,
camera previews and diagrams cannot substitute for measured physical geometry.

The result must select exactly one qualifying fixed integrated pitch. External
camera success cannot rescue an integrated failure. If no fixed pitch passes,
D-092's superseding-decision path remains the honest outcome.

## External placement screen

Supported PC and Steam Machine are separate target tiers. Each independently
screens beside-machine, on-top-of-machine, above-machine, TV-top and shelf
mount roles at center plus four required zone edges: 50 geometric cells.

At least one mount role must qualify per target tier. Every role described as
supported in setup guidance must pass all of its blocking cells; rejected or
unsupported roles remain documented. Steam evidence cannot qualify a generic
supported PC, and supported-PC evidence cannot qualify Steam.

## Blocking validation

The selected integrated fixed-axis configuration plus every external target/
mount combination yields 11 configurations. Each is tested independently for:

- school-age-child-standing and adult-standing blocking personas;
- center and four zone-edge points;
- neutral full-body visibility, jump, duck, dodge left and dodge right; and
- 20 valid scheduled trials per cell.

The matrix contains 550 blocking cells and 11,000 physical trials. Seated and
limited-range evidence remains exploratory and cannot rescue a blocking
failure. Landmark visibility cannot substitute for action accuracy.

## Calibration, relocation and setup errors

Every configuration requires 20 calibration/relocation cycles, for 220 cycles
total. The plan also freezes ten setup-error classes covering height, pitch,
stability, cable strain relief, shutter/indicator obstruction, unreported
placement change, invalid floor plane and zone-edge coverage.

Automatic room/floor calibration and placement-change detection are required.
Unsafe or unsupported setups fail closed; an undocumented manual calibration
step cannot qualify the experience.

## Evidence layers

Each physical cell preserves camera datum, TV/stand geometry, player distance,
room width, pitch/roll/yaw, measured field of view, distortion, crop/head/feet/
zone margins, floor error, action scores, calibration behavior, mount/cable
stability, shutter/indicator truth and USB-mode/drop/reconnect/cable evidence.

Physical picture cannot be inferred from compositor or calibration state.
Preview cannot prove full-body/floor coverage. Static dimensions cannot prove
mount stability. Passing optical geometry cannot prove action accuracy.

The decided action gates remain 95% precision and 90% recall per blocking
cell, with zero USB capture errors/drops and zero mount/cable safety failures.
All optical, margin, distortion, crop, floor, calibration-duration and
placement-detection gates remain null for owner review before collection.

## Privacy and workflow

Raw home video and raw frames are prohibited from repository and released
evidence. A separate protocol may authorize minimized redacted geometry images
only after EXIF/GPS removal and face, name, address, screen, reflection and
household-identifier redaction. Network names, credentials, addresses and
traffic remain prohibited.

Before physical execution:

1. resolve the questions in
   `OWNER_QUESTIONS_CROSS_TIER_CAMERA_GEOMETRY_2026-07-25.md`;
2. complete the selected-room survey and shared-camera qualification;
3. bind exact integrated/external hardware, numeric role values, ground truth,
   safety, data and schedule protocols;
4. add and review a strict ready-plan/result transition—the current validator
   intentionally accepts only the blocked state; and
5. complete all scheduled cells without deleting failed or invalid evidence.

Validate the tracked plan with:

```powershell
node scripts/validate-cross-tier-camera-geometry-plan.mjs `
  benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json
```

Contract tests run with:

```powershell
node --test scripts/validate-cross-tier-camera-geometry-plan.test.mjs
```

## Current boundary

This tranche advances I-037/I-193/I-194 to a strict blocked method. No room,
camera, enclosure, mount, Steam Machine, participant, geometric cell,
calibration cycle, physical trial, fixed pitch, external placement envelope,
setup guide or qualification result exists.
