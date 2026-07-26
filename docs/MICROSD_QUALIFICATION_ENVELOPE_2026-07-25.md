# microSD qualification envelope — 2026-07-25

Status: blocked umbrella plan pre-registered and machine-checked; no card has
been purchased, written, fault-injected, or qualified

Authority: D-047, D-048, D-049, D-050, D-089, D-109, I-022, I-110 through
I-114, I-162, I-191, I-200, I-202, Q-086, Q-193, Q-194, Q-195, Q-196

## Purpose

`MICROSD_QUALIFICATION_PROTOCOL_2026-07-24.md` defines the complete physical
method. The canonical blocked plan at
`benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json`
adds a strict machine-checkable admission and conclusion envelope around that
method. It does not replace the protocol, authorize its destructive steps, or
convert manufacturer claims into VCG evidence.

The validator defines two formats:

- `vcg-microsd-qualification-plan/v1` freezes the approved part boundary,
  destructive cohort, exact hardware/software/layout/filesystem/workload and
  recovery manifests, power-cut and corruption plans, service-write target,
  margin, deadlines, and evidence policy before execution; and
- `vcg-microsd-qualification-result/v1` accounts for every tested card, lot,
  phase, scheduled power cut, safety failure, performance gate, submitted host
  write, retained control, and minimized evidence digest. Its conclusion is
  derived as `qualified`, `rejected`, or `incomplete`.

The checked-in plan is deliberately blocked. Null fields are unresolved owner
authority, never wildcards or permission to choose a threshold after observing
results.

## Candidate and authority boundary

The blocked candidate records the existing quote boundary without resolving
it:

- manufacturer and family: SanDisk High Endurance microSD UHS-I;
- nominal capacity: 256,000,000,000 manufacturer bytes;
- quoted reseller part: `SDSQQNR-256G-AN6IA`; and
- currently manufacturer-listed part: `SDSQQNR-256G-GN6IA`.

A ready plan must name exactly one of those part numbers and classify their
relationship as either a manufacturer-confirmed alias or a distinct approved
test boundary. It may not silently add a substitute, infer that the suffixes
are equivalent, or generalize one tested controller/date-code lot to the
product family.

The execution gate also requires explicit purchase and destructive-test
authority plus exact SHA-256 bindings for:

- the card cohort and independently purchased lots;
- the Raspberry Pi assembly and final software image;
- storage layout and filesystem/mount policy;
- representative console workload trace;
- signed recovery release and toolchain;
- the existing power-cut plan and separate corruption plan; and
- the minimized evidence/data-handling protocol.

No one digest can substitute for another boundary. In particular, a running
launcher does not prove committed-state integrity, and a power-cut plan does
not prove that any cut occurred.

## Nine required phases

Every tested card reports these phases in this exact order:

1. intake and chain of custody;
2. destructive whole-capacity screen;
3. final-image baseline and read-back;
4. representative console workload replay;
5. capacity, quota, reserve, and full-disk behavior;
6. power-cut and update interruption;
7. corruption and removal;
8. blank-card and replacement recovery; and
9. accelerated endurance and performance drift.

A phase is `pass`, `fail`, or `incomplete` and always binds its minimized
evidence by SHA-256. Missing, duplicated, or reordered phases are rejected.
The validator does not authenticate unavailable physical evidence behind a
digest; the future harness and independent review must do that.

## Frozen acceptance before execution

A ready plan must set all of these before any result is opened:

- minimum tested-card and independent-lot counts;
- whether an unpowered control is retained;
- exact scheduled and minimum-valid power cuts per card, with at least 200
  valid cuts required;
- minimum reported capacity;
- projected service host writes per card and an endurance margin ratio;
- maximum p95 boot and storage-operation time; and
- maximum accepted performance-drift ratio.

The required submitted-write target is derived as:

```text
ceil(projected service host writes × endurance margin ratio)
```

Host-submitted writes are observable media-pressure evidence. They do not
claim internal NAND writes, flash translation behavior, TBW, or NAND write
amplification.

These safety ceilings are fixed at zero and cannot be relaxed by a ready plan:

- media or filesystem errors;
- committed-state corruption;
- unverified or uncommitted launches;
- unauthorized content reclamation; and
- recovery failures.

Every tested card must pass independently. Extra cards join the qualification
boundary and cannot be ignored. A strong card, average, lot, or manufacturer
claim cannot rescue one failed card.

## Power-cut accounting

Each card reports four disjoint counts whose sum must equal the frozen
schedule:

- valid passing cuts;
- valid failing cuts;
- harness-invalid cuts; and
- not-run cuts.

Harness-invalid cuts remain visible but never count toward the minimum valid
cut requirement. Any valid failing cut derives a failed power-cut phase and a
rejected campaign. Too few valid cuts or any not-run cut derives an incomplete
phase. The result cannot relabel those ledgers with a passing phase.

The ready plan binds the exact `vcg-power-cut-campaign-result` version 1 plan
by digest. That linked validator owns operation/oracle/trial detail; this
umbrella owns per-card cohort, endurance, capacity, recovery, and final
microSD qualification.

## Derived conclusion

The campaign is:

- `rejected` if any tested card has a failed phase, a valid failed cut, a
  fixed-zero safety event, or a missed frozen performance gate;
- `incomplete` when no failure exists but cohort/lot/control coverage, valid
  cuts, capacity, submitted writes, or any phase remains incomplete; or
- `qualified` only when the cohort, lot, retained-control, every-card,
  every-phase, endurance, capacity, performance, and fixed-zero gates pass.

The summary is recomputed from the card rows, including all cut counts,
minimum submitted writes, worst p95 times, worst drift, and control presence.

## Data boundary

Published card and lot identifiers are opaque. The closed result has no field
for receipts, accounts, filesystem paths, host usernames, Wi-Fi credentials,
signing/vault secrets, player data, or free text. Full intake photographs and
receipts remain outside public evidence under the protocol; redacted identity
and trace artifacts are represented only by digests in this envelope.

## Commands

Validate the tracked blocked plan and adversarial contract tests:

```powershell
corepack pnpm exec tsx scripts/validate-microsd-qualification.mjs
corepack pnpm exec tsx --test scripts/validate-microsd-qualification.test.mjs
```

Validate a future ready plan and result:

```powershell
corepack pnpm exec tsx scripts/validate-microsd-qualification.mjs `
  <ready-plan.json> <result.json>
```

That command validates an envelope; it is not purchase, destructive-test,
power-cut, recovery-media-write, or fallback authority.

## Current boundary

I-022 can advance to an active pre-registration boundary only after this
tranche is integrated. It cannot close without the physical campaign. No card,
lot, Pi assembly, exact final image, filesystem, workload trace, power cut,
corruption case, recovery run, service-write projection, threshold, or result
exists. I-162 and I-202 remain physical execution tasks, and I-021 remains a
separately qualified fallback only after a valid microSD failure invokes it.
