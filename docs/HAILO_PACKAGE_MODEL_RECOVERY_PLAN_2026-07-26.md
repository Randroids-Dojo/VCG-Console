# Hailo package/model recovery plan — 2026-07-26

Status: strict blocked I-164 plan; no Hailo install, mismatch, offline
reinstall, update, rollback, recovery, or target qualification result exists

Authority: D-050, D-084, D-109, I-157, I-158, I-164, Q-087

## Purpose

I-164 requires proof that the Hailo driver, firmware, runtime, model and
post-processing stack behaves like one recoverable appliance tuple. The
existing I-157 recipe names package/model mismatch and A/B recovery as future
work, but its canonical JSON does not freeze the mismatch or offline-reinstall
matrix. This plan supplies that missing pre-collection contract without
authorizing a download, install, slot write, fault injection, network request,
or hardware run.

## Bound implementation boundary

`benchmarks/hailo-recovery/hailo-package-model-recovery-plan-v1.json`
binds the exact current bytes of:

- the system update/recovery decisions and blocked Pi/Hailo image recipe;
- the 13/26 TOPS model candidates;
- delegated update trust and signed system/recovery image verification;
- the protected A/B update state machine; and
- the documented A/B and recovery-image contracts.

Those components prove parsers and state machines, not a Hailo package tuple or
physical appliance. The plan remains subordinate to I-157: it requires a
qualified baseline image result before any I-164 mutation.

## Exact compatibility tuple

Every candidate and installed state must bind ten components by version,
architecture, digest, and dependency edge:

1. kernel;
2. PCIe driver;
3. Hailo firmware;
4. HailoRT;
5. TAPPAS Core;
6. Hailo Apps;
7. Python bindings;
8. pose HEF;
9. compiled pose post-processor; and
10. pose configuration.

Moving tags, `latest` aliases, filenames, package-family claims, and wildcard
compatibility do not identify a tuple. Games and browser code cannot select or
override any component.

## Failure and recovery matrix

The campaign has fourteen required scenarios:

- exact baseline offline boot;
- PCIe-driver/HailoRT major mismatch;
- runtime/firmware mismatch;
- runtime/HEF architecture mismatch;
- HEF/post-processor mismatch;
- Python/native-binding mismatch;
- offline reinstall from a complete signed cache;
- offline reinstall with a missing cache member;
- offline reinstall with a tampered cache member;
- complete signed forward update;
- forward update that fails Hailo health;
- interruption before slot switch;
- interruption after slot switch but before health; and
- signed downgrade/replay attempt.

Each mismatch fixture changes exactly one declared tuple component. Every
scenario runs 20 valid counterbalanced cycles: 280 cycles total. Invalid runs,
power cuts, failures, retries, and rollback reasons remain visible and cannot
be replaced. No scenario or aggregate may rescue another.

All scenarios are offline. Update and reinstall consume an already staged,
signature-verified complete bundle. A network fetch would fail the scenario,
not rescue an incomplete cache.

## Fixed safety and health gates

The plan preserves these fixed rules:

- signature threshold verification precedes parsing or extraction;
- archive, image, and installed tuple bytes receive complete read-back hashes;
- family-mode updates write only the inactive A/B slot, never in place;
- a mismatched tuple fails before a camera session, participant collection, or
  model inference;
- Hailo health loads the exact HEF and post-processor and runs a pinned
  synthetic non-sensitive vector; `hailortcli identify` alone cannot pass;
- candidate health also includes launcher, tracker, camera, controller,
  network, and storage;
- offline network attempts, silent substitutions, save/content mutations,
  post-recovery boot failures, and valid product failures remain zero;
- rollback or an older signed image cannot lower protected highest-seen
  generation; and
- every scenario and cycle must pass.

Health-window, offline-reinstall, update, rollback, interruption-recovery,
free-space, write-amplification, boot-attempt, thermal and wall-power gates
remain null. They must be frozen before the first mutation.

## Data boundary

Compatibility evidence is limited to closed versions, architectures, digests,
dependency edges, health states, interruption points, preservation facts and
dispositions. The known health vector is synthetic. Evidence and images cannot
contain raw camera/audio, participant identifiers, free text, paths,
credentials, keys, tokens, saves, profiles, portraits, calibration,
body-matching data or imported content. Private signing material is always
forbidden.

## Validation

Run:

```powershell
node scripts/validate-hailo-package-model-recovery-plan.mjs
node --test scripts/validate-hailo-package-model-recovery-plan.test.mjs
```

The ten adversarial groups reject source drift, invented authority, tuple or
scenario weakening, online rescue, reduced cycle counts, in-place updates,
weak health, save mutation, downgrade, post-result gates, unsafe evidence,
premature results, unknown fields and malformed or noncanonical JSON.

## Current boundary

This tranche advances I-164 from an open failure-matrix request to a canonical
blocked plan. It does not build the I-157 image, choose a package cache,
install Hailo, prove a mismatch, mutate a slot, cut power, preserve real data,
or qualify offline reinstall/update/rollback on Raspberry Pi.

Execution remains blocked on
`OWNER_QUESTIONS_HAILO_PACKAGE_MODEL_RECOVERY_2026-07-26.md`.
