# Owner questions: retro performance qualification

Date: 2026-07-24

The repository now enforces a complete measurement matrix but deliberately
does not choose the games, limits, instruments, or target configurations.

## RP-001: representative systems

Which exact one system represents each of the 8-bit, 16-bit, 32-bit, 64-bit,
and arcade classes?

Safe default: select one widely understood system per class only after its
frontend/core/content rights and compatibility dependencies are reviewable.

## RP-002: representative content

Which exact rights-cleared title or test workload, revision, artifact hash,
save/controller setup, and deterministic exercise represents each system?

Safe default: use redistributable homebrew or purpose-built fixtures with
audited provenance; do not use a familiar commercial ROM as an implicit test
asset.

## RP-003: hardware target identity

Which exact Pi and ordinary x86-64 hardware, firmware, cooling, memory,
storage, power, OS image, GPU driver, display mode, and controller define each
target ID?

Safe default: hash a reviewed sanitized inventory and OS release record; any
material substitution creates a new target identity.

## RP-004: frame and audio limits

What p95/p99 frame intervals, missed-frame rate, p95 audio latency, and
underrun count are blocking for each output refresh and system class?

Safe default: set limits before observing results and publish both the
thresholds and raw distribution evidence; do not qualify from average FPS.

## RP-005: power and thermal limits

What wall/board power boundary, temperature sensor, peak limits, cooling
configuration, ambient range, and throttling signal are authoritative?

Safe default: measure wall power and SoC temperature with calibrated,
versioned probes; any throttle event blocks the run.

## RP-006: instrumentation and calibration

Which exact frame-time capture, audio loopback, power meter, thermal reader,
clock source, calibration artifact, and sampling policy are accepted on both
architectures?

Safe default: one reviewed versioned method per metric, bound by hash before
the run, with raw telemetry retained independently of the summary.

## RP-007: duration and soak sequence

Which warmup, minimum steady-state duration, one-hour run, four-hour soak,
restart count, and cool-down sequence are required?

Safe default: require the existing one-hour research floor for every matrix
case and a separate four-hour worst-case thermal/compatibility soak before a
hardware tier is qualified.

## RP-008: known-limit publication

Which non-blocking compatibility/accuracy/input/storage/feature limitations
may coexist with qualification, and where are their evidence and user-facing
support status published?

Safe default: every limitation keeps an opaque stable ID, category, evidence
hash, affected target/case, and reviewed disclosure; metric, crash, hang, or
throttling failures remain blocking.
