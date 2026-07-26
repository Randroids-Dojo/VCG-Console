# Owner questions: RealSense D455 Linux target qualification

Date: 2026-07-26

Safe defaults grant no purchase, release-binary or firmware download, target
mutation, device operation, projector use, participant collection, fault
injection, result publication, camera selection, or BOM mutation.

## RS-001: exact candidate and acquisition

Confirm whether D455 product code `82635DSD455`, material code `999WCT`, VID
`0x8086`, PID `0x0B5C` is the only I-044 candidate. Who may obtain a fresh
destination-aware quote, borrow a unit, or authorize purchase?

Safe default: treat the observed US $419 Buy listing as a stale-at-purchase
screen only. Do not substitute D455f, D456, another D400, a used unit, or an
engineering sample, and do not mutate the BOM.

## RS-002: received-device identity

Which manufacturing configuration, IMU component, hardware/optical revision,
private serial digest, calibration, firmware, visible condition, cable, mount,
and package contents must intake bind?

Safe default: reject damaged, opened, modified, substituted, self-calibrated,
or unofficially flashed units. Never publish the serial.

## RS-003: exact target tuples

Select the ordinary x86-64 Linux, SteamOS x86-64, and Pi 5 ARM64 hardware,
OS image, release, kernel, libc, compiler, CMake, libusb, USB controller/port,
power topology, AI-HAT coexistence, mount, and cable tuple.

Safe default: every row is blocking and independent. Ubuntu, Jetson, generic
Raspberry Pi, another backend, or another target's result cannot rescue it.

## RS-004: SDK source and release channel

Confirm beta SDK tag/commit `v2.58.3` /
`dfd6aa91250f5c31521d72d627865417989bb4e7`, the source/dependency mirror,
compiler, common and target CMake flags, warning policy, package layout,
installed-file/dynamic-link contract, update, and rollback path.

Safe default: target-native source builds only, with no moving refs, generated
source archive identity, unmirrored fetches, prebuilt rescue, or root runtime.

## RS-005: RSUSB common backend

Is RSUSB/libusb the intended common product backend on all three targets?
Freeze the libusb version, udev rule, group/seat behavior, interface ownership,
partial-device policy, CPU extension choices, and permission rollback.

Safe default: use RSUSB as the sole blocking lane. A successful native V4L2,
webcam/UVC, root, Viewer, or partial-device path cannot rescue it.

## RS-006: native backend and kernel mutation

May a separately approved native V4L2/IIO diagnostic patch or replace kernel
modules on one exact release-supported Ubuntu/kernel tuple? Who reviews DKMS,
Secure Boot/BIOS implications, module signing, rollback, reboot, and recovery?

Safe default: no kernel, BIOS, Secure Boot, or module mutation. Native-backend
results cannot qualify the common lane, SteamOS, Pi, or product packaging.

## RS-007: firmware identity and update boundary

Must the received camera already carry `5.17.3.10`, or may the exact official
image be downloaded and applied? Who authorizes byte verification, update,
downgrade, hardware reset, emergency stop, recovery, and post-write proof?

Safe default: require exactly `5.17.3.10` as received and do not mutate it. No
future version silently enters. The recorded vendor URL is not verified bytes.

## RS-008: firmware and device recovery proof

What non-destructive or sacrificial-hardware method may establish D455 update
and recovery behavior without risking the only candidate? Which stable-power,
operator, stop, offline-byte, failed-write, and vendor-support rules apply?

Safe default: never interrupt a write. Runtime/USB recovery may pass while
firmware update/recovery remains explicitly unqualified.

## RS-009: calibration and advanced mode

May on-chip self-calibration, tare, advanced-mode JSON, presets, hardware reset,
or calibration restore be used? Which before/after calibration digests, ground
truth, limits, backups, and rollback apply?

Safe default: read and hash state only. No calibration, tare, advanced-mode,
preset write, or hardware reset may change the received device.

## RS-010: stream and timestamp contract

Select exact RGB/depth/IR/IMU formats, resolutions, rates, passive preset,
exposure, filters, alignment, point-cloud, partial-device, warmup, invalid-frame,
device/host/application clock mapping, drift, and ground-truth rules.

Safe default: all unresolved values remain null. Vendor maxima, Viewer defaults,
or a successful first stream cannot become the test contract.

## RS-011: projector and I-045 safety gate

Who may authorize the D455 infrared projector, and which received-unit damage,
state-observation, distance, duration, reflection, sunlight, other-IR-device,
temperature, participant/child, stop, regulatory, and safety protocol applies?

Safe default: projector forced off and independently observed. Active results
cannot waive I-045 or rescue passive, safety, target, or recovery failure.

## RS-012: USB, power, and recovery faults

Confirm allowed unplug/replug, process termination, permission, bandwidth,
suspend, reboot, concurrent load, instrumentation, operator, invalid-run, and
stop rules. May any controller reset, hub cascade, or power interruption occur?

Safe default: only the eight registered non-destructive faults, with stable
device power and every failure retained. No firmware or kernel mutation.

## RS-013: numeric gates and instruments

Freeze RGB/depth/IR/IMU rates, drops, corruption, ordering, partial enumeration,
timestamp uncertainty, alignment/depth error, USB load, CPU/RAM, wall/USB
power, temperature, build, recovery, package size, delivered cost, and material
benefit limits. Identify calibrated instruments and uncertainty rules.

Safe default: every open limit remains null and must be approved before the
first target build or physical run. Results cannot author their own limits.

## RS-014: Q-018 comparison and participants

Which same-session RGB/depth matrix, room, placements, lighting, personas,
actions, ground truth, consent/assent, schedule, operators, and deletion
protocol may use a target-qualified D455?

Safe default: none. I-044 cannot establish depth benefit or select a camera;
Q-018 and I-045 remain separate gates.

## RS-015: evidence and authority

Who may authorize binary/firmware downloads, target access/mutation, USB
operation, projector use, participant collection, fault injection, temporary
diagnostics, publication, comparison selection, and purchase?

Safe default: nobody under this plan. Publish only path-free closed-vocabulary
summaries with no raw RGB/depth/IR/point clouds, identities, serials,
credentials, unredacted logs, or free text.
