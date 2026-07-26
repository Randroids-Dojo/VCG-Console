# Owner questions — I-164 Hailo package/model recovery

Date: 2026-07-26

Status: non-blocking for plan validation; blocking for downloads, installation,
slot mutation, fault injection, network access, physical execution, results,
or publication

## Q1 — Qualified baseline and exact hardware

Which completed I-157 result, received Raspberry Pi, HAT revision/firmware,
storage, power, cooling, enclosure, camera and recovery media form the baseline?

The source-pinned blocked I-157 recipe and vendor family names cannot substitute
for an installed, booted and independently verified tuple.

## Q2 — Complete compatibility manifest

Provide the exact version, architecture, digest and dependency edge for the
kernel, PCIe driver, firmware, HailoRT, TAPPAS Core, Hailo Apps, Python
bindings, pose HEF, compiled post-processor and pose configuration.

Who reviews supported combinations, and which exact single-component changes
are safe inert mismatch fixtures? A mismatch test must not risk firmware,
hardware, participant data, or the current healthy slot.

## Q3 — Signed offline bundle and cache lifecycle

Select the release roles/thresholds, complete offline apt/Python/resource/image
bundle, cache format, capacity reserve, trusted time, expiration/rotation,
revocation, retention, tamper handling and blank-card reconstruction process.

Define how the complete bundle is staged and verified without network access
and how missing/tampered members fail while preserving the active slot.

## Q4 — Genuine Hailo health oracle

Which pinned synthetic non-sensitive vector, expected output digest/tolerance,
HEF load, post-processor load and tracker integration prove the tuple is
actually usable?

Freeze the full launcher/tracker/camera/controller/network/storage health set,
observation window, clock, failure codes and rollback trigger. Device identity
or process survival alone is insufficient.

## Q5 — Fault injection and physical A/B behavior

Select safe apparatus and exact interruption points before/after image write,
read-back verification, boot-state publication, first candidate boot, each
health gate and rollback publication. Define valid versus harness-invalid cuts,
attempt limits, counterbalancing, cooldown and evidence capture.

The campaign requires 20 valid cycles in every scenario and cannot silently
replace a failure or invalid attempt.

## Q6 — Preservation and privacy oracles

Which non-sensitive sentinels prove writable saves/content remain unchanged,
and which inspections prove system/recovery images and evidence exclude saves,
profiles, portraits, calibration, body matching, imported content, credentials,
keys, tokens, raw media, paths and identifiers?

Ordinary A/B rollback must preserve writable data without putting that data
inside the replaceable or recovery image.

## Q7 — Numeric gates and execution authority

Freeze health-window, reinstall/update/rollback/recovery p95, free-space,
write-amplification, boot-attempt, thermal and wall-power limits before the
first mutation. Identify instruments, operators, schedule, trusted clock and
the authority for downloads, installation, slot writes, fault injection,
network access and evidence publication.

Passing I-164 does not itself select a different Hailo accelerator/model,
authorize a release, or supersede D-041/D-050.
