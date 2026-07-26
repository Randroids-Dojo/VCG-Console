# Cross-tier camera cable qualification plan — 2026-07-25

Status: strict zero-result I-038 plan pre-registered; cable acquisition,
installation and physical testing remain blocked

Authority: D-043, D-044, D-045, D-090, D-091, D-093, D-094, I-026, I-037,
I-038, I-177, I-193, I-194, Q-023, Q-072, Q-089, Q-254, Q-255

## Purpose

The shared-camera and geometry campaigns require safe, stable cabling but do
not determine the maximum supported cable path. Successful USB enumeration or
one received frame cannot establish sustained genuine 1080p60, household-safe
routing, reconnect behavior or RF coexistence.

`benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json` pre-registers
one common UVC cable campaign across ordinary x86 Linux, SteamOS and the
integrated Raspberry Pi lane. The tracked plan contains no cable identity,
length, route, port, target, instrument, mutation or purchase authority.

## Source boundary

The plan binds the current camera/packaging decisions, active-play cable safety
rules, ABS-box screen, shared-camera plan, cross-tier geometry plan, Pi radio-
coexistence plan and boot/suspend recovery plan by normalized SHA-256.

Any source change makes the cable plan stale. A new mount, camera, USB topology
or recovery model cannot silently inherit old cable evidence.

## Sustained passive-cable matrix

Each target independently tests four roles:

- device-supplied cable;
- short passive cable;
- nominal-routing passive cable; and
- maximum-proposed passive cable.

Every target/length crosses straight baseline, minimum bend radius, secured
service loop, adjacent power/HDMI routing, radio-coexistence load and a
representative retained cable pull. The resulting 72 cells each require one
continuous hour of genuine 1920 by 1080 at 60 FPS capture: 72 hours total.

Every cell preserves captured, duplicate, dropped, corrupt and out-of-order
frame accounting plus USB errors/resets/retries/disconnects, frame-spacing
jitter, voltage/current, topology and exact cable identity. Another length,
route or target cannot rescue a failed cell.

## Recovery matrix

All three targets and four passive length roles run 20 valid cycles across:

1. cold boot attached;
2. hot-plug at launcher idle;
3. disconnect/reconnect under representative load;
4. suspend/resume or the tier-native idle/wake equivalent; and
5. USB-controller or radio-stack recovery.

That is 60 cells and 1,200 cycles. Failed or invalid cycles remain in place.
Recovery must prove the same camera identity, apply the frozen recalibration
rule and restore usable capture; enumeration alone is insufficient.

## Mechanical and household routing

Integrated internal, short visible external, managed wall/furniture-edge and
service-loop/replacement routes are separate roles. Each qualified route
receives 20 pulls in five directions, or 100 pull cycles.

A route cannot qualify if a connector or enclosure enters the play zone, a
loose loop creates a trip/child/pet snag hazard, retention is adhesive-only, or
the route obstructs the shutter, activity indicator, vents, controls or
service access. Signal quality cannot rescue a safety failure.

## Conditional extensions

Active USB extension is disabled until a required passive path fails and the
owner authorizes a separate power, latency, RF, recovery and safety matrix. It
cannot rescue or promote a required passive cell.

CSI extension remains disabled unless a documented shared-UVC failure opens
the Pi-only CSI fallback through a superseding capture-path decision. CSI
evidence cannot qualify UVC or another target.

## Fixed and open gates

The current fixed gates are:

- at least 59 FPS captured rate for the genuine 60 FPS stream;
- zero duplicate, dropped, corrupt or out-of-order frames per sustained cell;
- zero USB CRC/reset/retry/disconnect/reenumeration events per sustained cell;
- every required passive cell passes independently; and
- no safety failure.

Minimum camera voltage, maximum voltage drop and frame-spacing jitter,
reconnect/wake deadlines, cable retention force, per-cable bend radius, radio
throughput regression and controller-latency regression remain null for owner
review before collection.

## Data and execution boundary

The campaign prefers a synthetic or nonidentifying optical target and requires
no raw room video. Raw frames/video, network names/credentials/addresses/
traffic and stable device serials are prohibited from released evidence.

Before execution:

1. resolve `OWNER_QUESTIONS_CROSS_TIER_CAMERA_CABLING_2026-07-25.md`;
2. qualify the shared camera and selected geometry;
3. bind exact targets, ports/topologies, cables/routes, instruments, protocols,
   numeric gates and schedule;
4. add and review a strict ready-plan/result transition—the current validator
   intentionally accepts only the blocked state; and
5. obtain explicit authority for hot-plug/suspend, mechanical testing,
   installation and any purchase.

Validate the tracked plan with:

```powershell
node scripts/validate-cross-tier-camera-cable-plan.mjs `
  benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json
```

Contract tests run with:

```powershell
node --test scripts/validate-cross-tier-camera-cable-plan.test.mjs
```

## Current boundary

This tranche advances I-038 to a strict blocked campaign. No cable, connector,
route, bend, pull, sustained stream, USB event, voltage, recovery cycle, RF
result, supported length, active extension or CSI fallback has been tested or
qualified.
