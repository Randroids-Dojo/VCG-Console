# Camera replacement and recalibration campaign - 2026-07-26

Status: strict zero-result I-048 plan pre-registered; no service operation,
replacement, persisted camera identity, calibration, target qualification, or
five-minute result is claimed or authorized

Authority: D-078, D-084, D-093, I-038, I-046, I-048, I-177, I-193, I-194,
Q-072

## Purpose

The shared-camera, cabling, geometry and camera-state plans require ordinary
connectors, replacement access, identity-aware recovery and mandatory
recalibration. They do not yet prove one complete service workflow. I-048
requires a reproducible five-minute procedure that safely replaces a camera,
detects the exact hardware transition, invalidates stale derived state,
recalibrates, verifies privacy and capture truth, and returns the target to a
supported Ready state.

D-093 still defines a DIY reference project rather than a warranty-backed
service tier. This campaign documents reversible repair behavior; it does not
promise authorized service, consumer warranty, tamper resistance or formal
field replaceability.

## Protected camera identity

Persisted camera identity is a protected local hardware binding, not a player
profile, display name, USB product label, public serial, biometric identity or
authorization credential. A ready campaign must bind an exact received-device
manifest containing the independently reviewed camera revision, firmware,
optical module, connector/cable and applicable host enumeration facts. Raw
serial-bearing material remains protected and is never released.

The workflow must distinguish:

- the same exact unit reconnected after service;
- a new unit of the same qualified revision;
- an explicitly approved substitute revision;
- an unapproved or silently changed revision;
- a wrong camera;
- ambiguous simultaneous candidates; and
- identity changing during binding or recalibration.

VID/PID, display text, port position, first-device ordering, image similarity,
calibration success or a profile name cannot independently establish identity.
Ambiguity and mismatch fail closed.

## Twelve service phases

Each target performs the same ordered twelve-phase workflow:

1. admit the exact service intent and release camera capture;
2. bind the old protected identity and calibration revision;
3. reach the documented powered-down or safe-disconnect state;
4. open and reach the ordinary-fastener service path;
5. remove the old camera and its exact cable/connector path;
6. inspect connector, mount, shutter, indicator, vents and cable restraint;
7. install the exact eligible replacement;
8. close, stabilize and restore the reviewed cable route;
9. boot or re-enumerate and commit the new protected identity;
10. transactionally invalidate old floor, calibration and body-match state;
11. complete fresh room/floor/player calibration and capture verification; and
12. verify Ready, shutter/indicator/camera-state truth, recovery and service
    closeout.

The five-minute clock begins when the reviewed service intent is admitted and
ends only after phase 12 succeeds. It includes required power transitions,
disassembly, replacement, reassembly, enumeration, identity binding,
invalidation, fresh calibration and verification. An already-open enclosure,
pre-bound replacement, hidden calibration, omitted privacy check or stopped
clock cannot qualify.

## Matrices

The campaign covers ordinary x86 Linux with an external camera, SteamOS with
an external camera, and the Pi 5 integrated DIY appliance. Every target and
phase receives 20 valid observations: 36 target/phase cells and 720 phase
observations. Every complete service attempt preserves all phase timings,
assistance, tools, fasteners, cable/mount state, identity decisions,
calibration invalidation, privacy truth and failure disposition.

Ten replacement/fault scenarios run 20 cycles on each target: 30 cells and
600 cycles. They cover same-unit reconnect, same-revision replacement,
approved substitute, unapproved revision, wrong camera, ambiguous cameras,
disconnect during identity commit, disconnect during recalibration, reboot
during binding, and power loss after invalidation but before recalibration.
Later success cannot erase a failed, stopped or invalid cycle.

If separately authorized, five service-persona classes perform eight common
tasks on all three targets with 20 trials per cell: 120 cells and 2,400 human
trials. The tasks cover replacement eligibility, safe service entry,
disconnection, installation, identity conflict, fresh calibration,
interruption recovery and final privacy/Ready verification. Completion cannot
hide unsafe reach, excessive assistance, inaccessible copy, false privacy
belief, discomfort or a broken part.

## Gates and evidence

The fixed end-to-end limit is 300,000 ms on every valid complete service
attempt. Zero-tolerance gates forbid stale calibration use, identity mismatch
or ambiguity admission, capture during unauthorized service phases,
automatic restart, skipped phases, unsafe cable/mount/fastener behavior,
shutter/indicator obstruction, serial or path disclosure, network egress and
discarded adverse evidence.

Subphase deadlines, forces, tool counts, fastener loss, connector wear,
calibration accuracy, lighting, accessibility, energy and reliability limits
remain null until frozen before operation. A fast mean cannot rescue one slow
or unsafe valid attempt. External success cannot qualify the integrated
target, one persona cannot rescue another, and a same-model unit cannot rescue
an unapproved revision.

The required evidence is path-free and closed vocabulary. It includes exact
protected identity-manifest digests, transactional before/after calibration
revisions, phase and total times, camera/stream/shutter/indicator truth,
connector and mount observations, fresh floor/action verification, failures,
retries, stops, tool/assistance counts and worst cases. Calibration output,
enumeration, a test image or application Ready state cannot self-label the
workflow as successful.

## Data and authority

The blocked plan authorizes no camera purchase, disassembly, hot-plug, device
power, enclosure access, camera capture, replacement, calibration, fault
injection, participant work, profile/vault/registry mutation, BOM change,
setup-guidance change, qualification or publication claim. Raw room media,
audio, portraits, body measurements, profile identifiers, stable camera
serials, paths, credentials, provider text and free text are prohibited from
repository and released results.

Resolve the questions in
`OWNER_QUESTIONS_CAMERA_REPLACEMENT_RECALIBRATION_2026-07-26.md` before a ready
plan is created.

## Validation

Run:

```powershell
node scripts/validate-camera-replacement-recalibration-plan.mjs
node --test scripts/validate-camera-replacement-recalibration-plan.test.mjs
```

The validator requires canonical bounded closed JSON, fresh normalized source
bindings, exact targets/phases/scenarios/personas/tasks, complete arithmetic,
null unresolved gates, the full blocker set and a zero-result boundary.
Mutation tests reject invented identity, authority, service completion,
five-minute shortcuts, cross-target rescue, stale calibration, unsafe data,
premature results and malformed input.

## Current boundary

This tranche pre-registers the I-048 proof shape only. No exact replacement
unit, target service fixture, protected identity implementation, calibration
transaction, service attempt, participant, timing observation, result or
qualified procedure exists.
