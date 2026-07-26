# RealSense D455 Linux target campaign

Date: 2026-07-26

Status: strict source-bound zero-result I-044 plan; no purchase, release-binary
or firmware download, target build or mutation, device operation, projector
use, fault injection, participant collection, result, selection, or
publication authority exists.

## Outcome and scope

`benchmarks/realsense/d455-linux-target-plan-v1.json` pre-registers the exact
D455 build, firmware, USB, backend, SDK, and recovery evidence required by
I-044. It freezes product code `82635DSD455`, material code `999WCT`, VID
`0x8086`, and PID `0x0B5C`; another D400, D455f, used unit, engineering sample,
or vendor-selected replacement cannot enter after results are known.

I-044 is an integration and lifecycle campaign. It cannot establish that depth
materially improves VCG, select RealSense over another candidate, or replace
I-042/Q-018's same-session RGB/depth comparison. Active IR remains conditional
on I-045.

## Pinned software and firmware

The source build starts from official RealSense SDK beta release `v2.58.3`,
published 2026-07-19, at tag/commit
`dfd6aa91250f5c31521d72d627865417989bb4e7`. `master`, `latest`, package
repository state, and generated source archives are not accepted identities.
The GitHub release has no Linux target binary asset; published Windows assets
are excluded and cannot rescue a Linux build.

The required firmware identity is exactly `5.17.3.10`, which the current SDK
release lists for D455 USB. The official image URL is recorded, but the bytes
and SHA-256 remain unverified because no firmware download is authorized. A
received camera carrying another version does not silently pass and is not
silently updated. Any accept-as-received exception or mutation needs an owner
decision before operation.

The Apache-2.0 source license does not replace an exact third-party notice,
dependency, installed-file, dynamic-link, package, and SBOM review.

## Blocking RSUSB backend

All three targets use the same RSUSB/libusb userspace backend selected with
`FORCE_RSUSB_BACKEND=ON`. It avoids the vendor's native-backend kernel-patching
procedure, but does not itself prove target support. The exact libusb version,
udev rule, group and seat behavior, package closure, USB controller, negotiated
speed, cable, power path, device identities, and unprivileged access must be
recorded independently on every target.

The common build disables GUI examples, firmware tools, Viewer tests, update
checks, CUDA, DDS, ROS bag support, Python bindings, ccache, and ASan. It builds
the shared SDK, textual examples, and unit tests. Unit-test data and every
dependency must already exist in a content-addressed offline mirror; an
attempted fetch invalidates the build. CPU extensions remain explicitly on;
the Pi row additionally binds NEON on and close-range enhanced depth off.

The default native V4L2/IIO backend is not a rescue lane. It may run later only
as a separately approved diagnostic on an exact release-supported Ubuntu and
kernel tuple, with reviewed modified-kernel-module installation, Secure Boot,
rollback, and recovery. It cannot qualify SteamOS, Pi, RSUSB, or product
packaging.

## Target and build matrix

The same received D455 and pinned source must pass independently on:

1. ordinary native x86-64 Linux with an external camera;
2. SteamOS x86-64 with an external camera; and
3. Raspberry Pi 5 ARM64 with the selected AI-HAT topology and integrated
   camera fixture.

Each row binds exact hardware inventory, OS image, release, kernel, libc,
compiler, CMake, libusb, udev rule, USB-controller topology, power topology,
installed SDK manifest, build artifact, and runtime configuration. Every field
is currently null.

Twenty fresh offline native builds are required per target: 60 total. Builds
start from the same content-addressed source/dependency mirror, make zero
network attempts, retain failures and warnings, and produce an explained
installed-file/linkage/SBOM contract. One target, backend, package, generated
archive, or prebuilt executable cannot rescue another.

## Device and runtime matrix

Before operation, bind the received model and product/material codes, VID/PID,
private serial digest, manufacturing configuration, IMU component, hardware
revision, calibration digest, firmware bytes/version, supplied cable, mount,
power path, advanced-mode state, presets, filters, stream formats, clock
mapping, and independent projector-state observation.

The blocking mode is RGB plus passive stereo with the projector forced and
observed off. Self-calibration and advanced-mode writes are disabled. An active
projector lane remains conditional on I-045 and cannot qualify I-044 by itself.

Six phases run independently on every target:

- unprivileged enumeration and exact identity;
- cold open, configure, and close;
- sustained RGB/depth/IR/IMU streaming and timestamps;
- depth-to-color alignment and point-cloud contract;
- concurrent VCG tracker/game workload; and
- clean stop/restart without host or device reboot.

Twenty valid runs per target/phase produce 360 runtime runs. Three independent
one-hour soaks per target add nine soaks. Every failed, invalid, interrupted,
retried, dropped, duplicate, corrupt, out-of-order, partial-enumeration, or
USB-speed-downgraded observation remains visible.

## Recovery matrix

Eight non-destructive faults run twenty cycles on each target, for 480 cycles:

- SDK process termination and restart;
- stream stop/start cycling;
- idle camera unplug/reconnect;
- streaming camera unplug/reconnect;
- permission denial/restoration;
- USB bandwidth contention/restoration;
- host suspend/resume; and
- host reboot/cold reopen.

Each cycle records fault injection, detection, fail-closed behavior, device and
process identity, partial enumeration, stale-frame rejection, healthy-return
time, state preservation, and manual, root, network, firmware, kernel, or power
intervention. Zero unrecovered or hidden faults are allowed.

No cycle patches a kernel, resets a USB controller, writes firmware, runs
self-calibration, changes advanced-mode configuration, or deliberately
interrupts a write. Firmware update and recovery support remain unclaimed.

## Fixed and open gates

Fixed product gates retain 120 ms live exposure-to-game p95, 95% per-action
precision, 90% per-action recall, zero privileged false activations, zero
runtime network attempts, zero root runtime processes, zero unrecovered faults,
zero USB speed downgrades, and zero silent device, firmware, SDK, backend,
build, stream, or projector substitutions.

Open gates include minimum RGB/depth/IR/IMU rates, drops, corruption, partial
enumeration, timestamp uncertainty and drift, alignment/depth error, USB
bandwidth, CPU/RAM, wall/USB power, temperature, recovery time, clean-build
time, package size, delivered cost, and minimum material depth benefit. Every
open value must be frozen before the first release-binary/firmware download,
target build, device operation, or run. Results cannot set their own limits.

## Privacy, authority, and result boundary

Raw room RGB, depth, IR, point clouds, faces, voices, names, exact ages,
addresses, serials, host paths, credentials, and free text are forbidden from
release evidence. Temporary diagnostics need separate consent, access,
retention, and deletion proof. Offline build and runtime permit no network
egress.

The tracked plan grants no purchase, binary/firmware download, target
mutation, USB operation, projector use, participant collection, fault
injection, temporary diagnostics, or publication authority. It contains zero
builds, runs, soaks, recovery cycles, target results, depth benefit, selection,
or purchase recommendation.

Resolve `OWNER_QUESTIONS_REALSENSE_D455_2026-07-26.md` and every blocker before
execution.

Validate the plan with:

```powershell
node scripts/validate-realsense-d455-linux-target-plan.mjs
node --test scripts/validate-realsense-d455-linux-target-plan.test.mjs
```

Passing proves only source freshness, closed-plan structure, arithmetic, and
zero-result/authority boundaries. It proves no camera, target, backend, build,
firmware, USB, stream, timestamp, recovery, depth, safety, participant, room,
cost, or product result.
