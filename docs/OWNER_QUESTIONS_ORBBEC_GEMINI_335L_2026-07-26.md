# Owner questions: Orbbec Gemini 335L Linux target qualification

Date: 2026-07-26

Safe defaults grant no purchase, release-asset or firmware download, target
mutation, device operation, emitter use, participant collection, fault
injection, result publication, camera selection, or BOM mutation.

## ORB-001: exact candidate and acquisition

Confirm whether Gemini 335L model `G40055-170`, VID `0x2BC5`, PID `0x0804` is
the only I-043 candidate. Who may obtain a fresh destination-aware quote,
borrow a unit, or authorize purchase?

Safe default: keep the observed US $359 in-stock listing as a stale-at-purchase
screen only. Do not substitute another Gemini model or mutate the BOM.

## ORB-002: received-device identity

Which model, hardware/optical revision, private serial digest, calibration,
bootloader, firmware, visible condition, cable, tripod/head, mount, and package
contents must the intake record bind?

Safe default: reject damaged, opened, modified, substituted, recalibrated, or
unofficially flashed units. Never publish the serial.

## ORB-003: exact target tuples

Select the ordinary x86-64 Linux, SteamOS x86-64, and Pi 5 ARM64 hardware,
OS image, release, kernel, libc, compiler, CMake, libusb, USB controller/port,
power topology, AI HAT coexistence, mount, and cable tuple.

Safe default: every row is blocking and independent. Ubuntu, Jetson, generic
ARM64, Pi datasheet, or another target's result cannot rescue a row.

## ORB-004: SDK source, build, and packaging

Confirm SDK tag `v2.9.3`, source commit
`2f6561c28255d805b34aa00a690199ce40e96c81`, the frozen CMake flags, compiler,
dependencies, source mirror, clean-build environment, warning policy,
installed-file contract, dynamic-link policy, package layout, and update/
rollback path.

Safe default: native source build on every target, no moving refs or network
fetches, no root runtime, and vendor artifacts are diagnostic only.

## ORB-005: extension and third-party licensing

May the Orbbec-product-only extension binaries enter the target build, and who
reviews their no-modification/no-reverse-engineering terms plus every bundled
third-party license and release notice?

Safe default: keep extension use and distribution blocked until an exact-file
SBOM/license review. Core MIT status cannot authorize the separate extensions.

## ORB-006: LingBot and model activation

Should the optional Jetson/Linux ARM64 LingBot enhanced filter, 241 MB
`model.sm4`, device activation, or related account/network behavior ever enter
an exploratory lane?

Safe default: exclude all of them. They cannot enter or rescue the blocking
common target comparison.

## ORB-007: firmware and update boundary

Must every received device already carry recommended firmware `1.8.10`, or may
an exact offline image be downloaded and applied? Who authorizes update,
downgrade, device reboot, emergency stop, recovery write, and post-update ISP
verification?

Safe default: record actual firmware and do not mutate it. Any update needs
exact bytes/digest, release notes, stable power, a reviewed operator, and a
separate recovery protocol.

## ORB-008: firmware recovery proof

What non-destructive or sacrificial-hardware method may prove Orbbec's documented
Recovery-mode offline update followed by Normal-mode ISP update, without
deliberately bricking the only candidate?

Safe default: do not interrupt firmware writes. Runtime/USB recovery may pass,
but firmware-update recovery support remains explicitly unclaimed.

## ORB-009: stream and preset contract

Select exact RGB/depth/IR formats, resolutions, FPS, passive preset, confidence,
filters, alignment, point-cloud, exposure, timestamp, warmup, calibration,
invalid-frame, and drift rules for each target.

Safe default: keep all unresolved values null. Vendor maxima or the default
preset cannot silently become the test configuration.

## ORB-010: emitter and I-045 safety gate

Who may authorize 850 nm emitter operation, and which received-unit damage,
state-observation, distance, duration, reflection, sunlight, other-IR-device,
temperature, participant/child, stop, and legal/safety protocol applies?

Safe default: emitter off and independently verified. I-043 uses the passive
lane; active results cannot waive I-045 or rescue another failure.

## ORB-011: USB, power, and recovery faults

Confirm allowed unplug/replug, process termination, permission, bandwidth,
suspend, reboot, concurrent-load, instrumentation, operator, invalid-run, and
stop rules. May any USB controller reset or power interruption be injected?

Safe default: only the eight pre-registered non-destructive faults, with stable
device power and every failure retained. No firmware-write interruption.

## ORB-012: numeric gates and instruments

Freeze RGB/depth/IR FPS, drops, corruption, ordering, timestamp uncertainty,
alignment/depth error, USB load, CPU/RAM, power, temperature, build, recovery,
package-size, delivered-cost, and material-benefit gates. Identify calibrated
instruments and uncertainty rules.

Safe default: all remain null and must be approved before the first target
build or physical run. Results cannot author their own thresholds.

## ORB-013: Q-018 comparison and participants

Which same-session RGB/depth matrix, room, placements, lighting, personas,
actions, ground truth, consent/assent, schedule, operators, and deletion
protocol may use a target-qualified Orbbec device?

Safe default: none. I-043 integration cannot establish depth benefit or select
a camera; Q-018 and I-045 remain separate gates.

## ORB-014: evidence and authority

Who may authorize release-asset/firmware downloads, target access/mutation,
USB operation, emitter use, participant collection, fault injection, temporary
diagnostics, result publication, comparison selection, and purchase?

Safe default: nobody under this plan. Publish only path-free closed-vocabulary
summaries with no raw RGB/depth/IR, point clouds, identities, serials,
credentials, unredacted logs, or free text.
