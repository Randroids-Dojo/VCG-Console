# SteamOS UVC capture and permission campaign

Date: 2026-07-26
Scope: I-167
Status: blocked strict zero-result pre-registration

## Claim boundary

This campaign defines the evidence required to qualify one received shared UVC
camera and one access route on the optional SteamOS compatibility target. It
does not claim that the target or camera has been purchased, received,
inventoried, connected, opened, modified, or qualified; that any Flatpak,
V4L2, PipeWire, portal, or Steam-runtime permission works; or that the camera
delivers genuine 1080p60 exposures, trustworthy timestamps, effective
controls, privacy isolation, or recovery.

Existing merchandise, vendor, Windows, ordinary Linux, Raspberry Pi,
shared-camera, capture-policy, camera-state, microphone-disablement, and
SteamOS packaging evidence remains useful source material. None of it can
substitute for exact received-target observations. No access route may be
selected, operated, published, or used to promote the optional Steam Machine
tier from this plan.

## Target and camera boundary

Before operation, bind the exact received target hardware and inventory;
SteamOS image, kernel, drivers, PipeWire, Gamescope, and package revision; the
selected shared-camera candidate and receipt; USB descriptors, firmware,
cable, port, controller, hub, power, and topology; and the camera's physical
shutter, activity indicator, microphone, and audio-interface inventory.

The camera candidate must remain the same unit across routes unless a
predeclared replacement rule invalidates and repeats affected cells. A USB
product name, advertised mode, ordinary-Linux result, or raw USB permission
does not prove that the correct video node, PipeWire node, format, controls,
audio boundary, or exposure stream is available on the exact target.

All target, device, and authority bindings remain null or false in the tracked
plan. This campaign does not authorize purchasing, room or participant
capture, package or permission mutation, target suspension or update,
qualification, selection, publication, or tier changes.

## Access-route comparison

The plan freezes four routes:

1. Flatpak with direct V4L2 access;
2. Flatpak with PipeWire-mediated access;
3. self-contained Steam-runtime content with direct V4L2 access; and
4. self-contained Steam-runtime content with PipeWire-mediated access.

All four routes must be attempted under one selection rule frozen before
operation. Each requires exact manifests, runtime dependencies, portals,
device permissions, node provenance, and a target result. A broad all-device
grant cannot be assumed necessary, and raw USB access cannot stand in for
V4L2 or PipeWire access. Failed, invalid, stopped, and retried route evidence
remains visible. A different route or aggregate cannot rescue a failure in the
selected route.

## Required lifecycle matrix

Each route runs all 14 scenarios independently:

1. device absent at launch;
2. permission denied before open;
3. deliberate permission grant and cold open;
4. format, frame-size, and interval enumeration;
5. sustained genuine 1920 by 1080 at 60,000 millihertz with timestamp
   observation;
6. UVC control apply, readback, stream effect, and reopen persistence;
7. trusted tracker consumption under representative load;
8. hot-plug before open;
9. disconnect while streaming;
10. same-port and different-port reconnect;
11. permission revocation while streaming and deliberate regrant;
12. suspend and resume while streaming;
13. package update, health failure or rollback, and permission restoration;
    and
14. SteamOS update, offline restart, and permission restoration.

Four routes by 14 scenarios form 56 cells. Twenty valid cycles per cell
require 1,120 cycles. Every route must complete every required mode, control,
privacy, timestamp, tracker, and recovery check. Product failures remain
failures; harness-invalid cycles may be repeated only under the frozen
invalidity rule and may not erase the original evidence.

## Mode, control, timestamp, and tracker proof

Every route must independently prove:

- USB video, audio, and interface inventory plus exact V4L2 and PipeWire node
  provenance, ownership, session, format, and effective permission;
- enumerated pixel formats, sizes, frame intervals, color spaces, buffers, and
  controls, followed by sustained genuine 1920 by 1080 at 60,000 millihertz;
- unique exposure counts with duplicate, dropped, late, stale, out-of-order,
  and cross-epoch accounting;
- exposure-time authority, clock domain, monotonicity, offset, regression,
  jitter, and uncertainty rather than arrival callbacks or inference time;
- exposure, gain, white balance, focus, power-line, and buffer control request,
  readback, stream effect, and reopen behavior; and
- trusted tracker input, backpressure, delivery, common-clock alignment,
  representative workload, clean stop, and component health.

An advertised mode, enumeration result, duplicated frames, arrival timestamp,
or passing aggregate cannot prove these properties.

## Permission and privacy proof

Only the selected trusted tracker route may receive camera authority. The
launcher, embedded browser, games, packages, and untrusted descendants must
have zero successful camera access. Declared and effective Flatpak or
Steam-runtime permissions, V4L2 node access, PipeWire portal/session state,
process/cgroup ownership, device access, IPC, filesystem access, and network
traffic require independent observation.

The camera's audio function and every microphone route must return zero audio
tracks, buffers, samples, and bytes. A silent signal, UI toggle, absent prompt,
or vendor claim does not prove microphone disablement. Software-access state,
active streaming, the physical activity indicator, and physical shutter truth
must be recorded separately; a closed shutter may make the room unsensed while
software access remains active.

Repository and result artifacts permit only opaque labels, closed reason
codes, counts, timings, digests, controls, modes, and redacted categories. They
exclude raw room, player, camera, screen, audio, or video; retained raw frames
or sample bytes; names, faces, voices, exact ages, serials, stable identifiers,
paths, query URLs, credentials, profile/save contents, environment or argument
values, arbitrary messages, and free text. Only declared package and probe
traffic may leave the target.

## Recovery proof

The matrix distinguishes safe absence, permission denial, deliberate grant,
revoke, unplug, reconnect, suspend, package update or rollback, SteamOS update,
offline restart, and restoration. Every transition requires independent USB,
node, permission, exposure, audio, indicator, process, tracker, and recovery
oracles. A recovered later cycle cannot hide a timeout, leaked grant, stale
frame, cross-epoch exposure, control mismatch, or failed stop in the affected
cycle.

There may be zero unrecovered permission, hot-plug, revoke, suspend, update,
or restart events; zero camera grants outside the selected trusted tracker;
zero retained raw media or undeclared egress; and zero valid selected-route
product failures.

## Acceptance boundary

The fixed gates require genuine 1920 by 1080 at 60,000 millihertz and at least
20 valid cycles per route/scenario. They permit zero:

- successful camera capture by untrusted launcher, browser, game, package, or
  descendant processes;
- audio tracks, buffers, samples, or returned bytes;
- retained raw frames, audio, or network-egress events;
- duplicated, stale, out-of-order, or cross-epoch exposures;
- unexplained timestamp regressions or clock-domain substitutions;
- control apply, readback, stream-effect, or reopen mismatches;
- unrecovered permission, hot-plug, revoke, suspend, update, or restart events;
- camera grants outside the selected trusted tracker route;
- stable device, participant, account, path, or free-text disclosures; and
- valid selected-route product failures.

Fifteen outcome-sensitive gates remain null: physical camera sample count;
sustained duration; drop rate; frame-interval jitter; exposure timestamp
uncertainty; open-to-first-exposure, capture-to-tracker, permission, reconnect,
suspend-recovery, and update-recovery timing; CPU, GPU, resident memory, and
USB bandwidth. Freeze them, the instruments, sampling, uncertainty, and
no-rescue treatment before operation rather than deriving them from observed
results.

## Relationship to adjacent work

I-166 may package the tracker and safely represent denied, unavailable,
disconnected, and recovery states. It does not qualify camera access. I-167
must provide the exact target result before an I-166 package may claim real
tracking. Likewise, passing I-167 does not select the shared camera, prove
room geometry or pose accuracy, close microphone or camera-state campaigns,
prove action latency, qualify concurrent gameplay, or replace the ordinary
x86 and Raspberry Pi reference tiers.

## Honest stopping point

This document, its machine-readable plan, validator, and adversarial tests
convert I-167 into an auditable blocked campaign. They do not purchase,
receive, connect, open, modify, suspend, update, or recover hardware; grant or
revoke permissions; capture people or rooms; select a package, camera, or
route; qualify the target; publish results; or change product support.
