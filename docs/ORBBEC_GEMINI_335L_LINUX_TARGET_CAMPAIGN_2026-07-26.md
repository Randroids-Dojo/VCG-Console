# Orbbec Gemini 335L Linux target campaign

Date: 2026-07-26

Status: strict source-bound zero-result I-043 plan; no purchase, release-asset
or firmware download, target build, device operation, fault injection,
participant collection, result, selection, or publication authority exists.

## Outcome and scope

`benchmarks/orbbec/gemini-335l-linux-target-plan-v1.json` pre-registers the
exact-device build, firmware, USB, SDK, and recovery record required by I-043.
It freezes one candidate, Orbbec Gemini 335L model `G40055-170`, rather than
allowing another Gemini or Orbbec product to enter after results are known.

The plan is an integration and lifecycle campaign. It cannot establish that
depth materially improves VCG, select a camera, or replace I-042/Q-018's
same-session RGB/depth comparison. Active IR remains conditional on I-045.

## Pinned software candidate

The blocking build starts from Orbbec SDK v2 release tag `v2.9.3`, tag object
`ca69b53b11eda5c65909da7e016d07fc7537d6a9`, source commit
`2f6561c28255d805b34aa00a690199ce40e96c81`. The vendor-published x86-64 and
ARM64 tarball and Debian-package names/digests are recorded only as diagnostic
comparators. They cannot substitute for target-native builds.

The build enables the USB transport and disables network/GMSL transports,
documentation, GUI tools, PCL/Open3D examples, sanitizers, and clang-tidy. It
builds the SDK examples and tests, installs license notices, and records the
extension commit identity. The exact compiler, CMake, libc, libusb,
dependencies, CMake cache, warnings, installed files, dynamic links, SBOM, and
license decisions remain target-bound inputs.

LingBot enhanced filtering and `model.sm4` are excluded. No account,
activation, model download, network fetch, moving dependency, or target-only
filter may silently enter the common lane.

## Target matrix

The same exact source and received camera must pass independently on:

1. ordinary native x86-64 Linux with an external camera;
2. SteamOS x86-64 with an external camera; and
3. Raspberry Pi 5 ARM64 with the selected AI-HAT topology and integrated
   camera fixture.

Each row binds exact hardware inventory, OS image, release, kernel, libc,
compiler, CMake, libusb, udev rule, USB-controller topology, power topology,
installed SDK manifest, build artifact, and runtime configuration. All are
currently null. Orbbec's Ubuntu x86-64, Jetson ARM64, or Pi datasheet claims
cannot populate these fields.

Twenty clean offline native builds are required per target: 60 builds total.
Every build starts from the same content-addressed source/dependency mirror,
makes zero network attempts, retains failures and warnings, and yields the
same explained installed-file and linkage contract. A vendor binary or one
target cannot rescue another.

## Device and runtime matrix

The received model, VID/PID, private serial digest, hardware revision,
calibration digest, cable, mount, power path, actual firmware, bootloader,
presets, filters, stream formats, timestamp source, and emitter-state observer
must be frozen before operation. Firmware `1.8.10` is a candidate requirement,
not permission to update a device.

The blocking I-043 mode is RGB plus passive stereo with the emitter confirmed
off. An active-stereo lane remains conditional on I-045 and cannot qualify
I-043 by itself.

Six phases run independently on each target:

- unprivileged enumeration and exact identity;
- cold open/configure/close;
- sustained RGB/depth/IR stream and timestamp accounting;
- depth-to-color alignment and point-cloud contract;
- concurrent VCG tracker/game workload; and
- clean stop/restart without host or device reboot.

Twenty valid runs per target/phase produce 360 runtime runs. Three independent
one-hour soaks per target add nine soaks. The plan retains every failed,
invalid, interrupted, retried, dropped, duplicate, corrupt, out-of-order, or
USB-speed-downgraded observation.

## Recovery matrix

Eight non-destructive faults run twenty cycles on each target, for 480 recovery
cycles:

- SDK process termination and restart;
- stream stop/start cycling;
- idle camera unplug/reconnect;
- streaming camera unplug/reconnect;
- permission denial/restoration;
- USB bandwidth contention/restoration;
- host suspend/resume; and
- host reboot/cold reopen.

Each cycle records fault injection, detection, fail-closed behavior, device and
process identity, stale-frame rejection, time to healthy service, state
preservation, and whether manual, root, network, firmware, or power intervention
occurred. Zero unrecovered or hidden faults are allowed.

No test deliberately interrupts a firmware write. Firmware update/recovery
support remains unclaimed until a separate reviewed protocol safely proves the
official two-stage Recovery-mode/Normal-mode remediation on authorized
hardware with exact offline bytes.

## Fixed and open gates

The fixed product gates retain 120 ms live exposure-to-game p95, 95% per-action
precision, 90% per-action recall, zero privileged false activations, zero
unrecovered faults, zero unexpected runtime network attempts, zero root runtime
processes, and zero silent device, firmware, SDK, build, stream, or emitter
substitutions.

Open gates include minimum RGB/depth/IR FPS, maximum drops, corrupt and
out-of-order frames, timestamp uncertainty and drift, alignment/depth error,
USB bandwidth/utilization, CPU/RAM, wall/USB power, temperature, recovery time,
build time, package size, delivered cost, and minimum material depth benefit.
Every open value must be frozen before the first release-asset/firmware
download, target build, device operation, or run. Results cannot set their own
thresholds.

## Privacy, authority, and result boundary

Raw room RGB, depth, IR, point clouds, faces, voices, names, exact ages,
addresses, device serials, host paths, credentials, and free text are forbidden
from release evidence. Temporary diagnostic collection needs a separate
consent, access, retention, and deletion protocol. The offline lane permits no
network egress.

The tracked plan grants no purchase, artifact/firmware download, target
mutation, USB operation, emitter use, participant collection, fault injection,
or publication authority. It contains zero builds, runs, soaks, recovery
cycles, results, qualified targets, depth benefit, selection, or purchase
recommendation.

Resolve `OWNER_QUESTIONS_ORBBEC_GEMINI_335L_2026-07-26.md` and every blocker
before execution.

Validate the plan with:

```powershell
node scripts/validate-orbbec-gemini-335l-linux-target-plan.mjs
node --test scripts/validate-orbbec-gemini-335l-linux-target-plan.test.mjs
```

Passing these commands proves only source freshness, closed plan structure,
arithmetic, and zero-result/authority boundaries. It proves no Orbbec hardware,
target, build, firmware, USB, stream, timestamp, recovery, depth, safety,
participant, room, cost, or product result.
