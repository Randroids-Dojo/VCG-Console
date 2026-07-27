# Shutdown reserve comparison plan — 2026-07-26

Status: strict blocked I-032 zero-result plan; no UPS or supercapacitor
candidate, purchase, electrical operation, comparison result, selection, or
D-109 superseding decision exists

Authority: D-047, D-050, D-084, D-089, D-109, D-111, I-021, I-022, I-029,
I-030, I-032, I-202, Q-022, Q-086, Q-197, and Q-198

## Outcome

The repository now has a source-bound comparison contract for deciding whether
a small external UPS or supercapacitor shutdown reserve is worthwhile for the
Raspberry Pi 5 lower-cost reference. It deliberately records no result.

D-109 remains authoritative: the incumbent is software and storage resilience
without required backup power. A passing qualified-microSD sudden-power
campaign keeps that incumbent. If qualified microSD repeatedly fails, the
documented USB 3 SSD lane is the first storage fallback. UPS or supercapacitor
evidence may support a later owner decision, but it cannot rewrite a failed
software/storage result, mutate the BOM, or supersede D-109 on its own.

## Four alternatives

The comparison keeps four exact, non-rescuing alternatives visible:

1. software plus qualified microSD, the required incumbent;
2. software plus qualified USB 3 SSD, the required D-109 storage fallback
   comparator;
3. a small external UPS, currently unselected; and
4. a supercapacitor shutdown reserve, currently unselected.

Every exact target, storage device, image, workload, supply, reserve, cell,
firmware, cable, connector, wiring, revision, and received-unit identity is
open. A topology sketch, advertised VA/Wh/F rating, quoted runtime, calculated
hold-up interval, clean shutdown, one unit, or vendor demo is not evidence of
complete-product qualification.

## Same-product comparison

All alternatives use the same final Pi assembly, image, workload, operation
transitions, electrical-event schedule, trigger/observation apparatus, oracles,
restore procedure, and acceptance rules. Storage changes remain explicit and
cannot be treated as the same environment.

The eleven inherited I-202 operation classes are:

- idle and boot;
- system update;
- package update and rollback;
- retro import;
- save/checkpoint and profile update;
- log rotation and low-space behavior; and
- filesystem recovery.

Each alternative covers abrupt production-input removal, sustained brownout,
short dropout, undervoltage ramp, and oscillating loss/reconnect. UPS and
supercapacitor candidates additionally cover depleted reserve, disconnected
reserve, health/capacity failure, shutdown signal/control-path failure, and
restore or boot with insufficient reserve.

That creates 220 common scenario cells and 110 reserve-fault cells before
repetition. Every alternative retains the inherited floor of at least 200 valid
power-cut trials. The per-cell repetitions, units, lots, aging states,
temperatures, charge states, and schedule remain owner-reviewed open gates.

## Required evidence

The campaign measures the complete sequence from fixture command through
observed input/rail loss, event detection, shutdown request, shutdown
completion, reserve depletion, restoration, boot, and semantic state checks.
It also records:

- usable hold-up time and shutdown margin under every complete workload;
- rail voltage, current, power, energy, brownout, and reconnect waveforms;
- bootability, committed-state integrity, authority consistency, filesystem
  disposition, and exact wrong-state counts;
- missed events, false shutdowns, reconnect loops, and degraded-mode behavior;
- fresh, aged, hot, cold, discharged, disconnected, and faulty behavior;
- recharge time, standby/charging energy, temperature, acoustics, radio/EMI,
  service life, and capacity loss;
- delivered hardware, integration, energy, replacement, space, mass, service,
  warranty, return, supply, and expiry effects; and
- every failure, invalid trial, stop, retry, adverse result, and worst case.

Vendor specifications, capacity calculations, emulated control signals, or a
successful operating-system shutdown cannot replace independent electrical,
state-integrity, safety, lifecycle, and complete-system evidence.

## Fixed gates

No alternative may have a valid product failure, boot loop, unbounded recovery
state, committed-state corruption, unauthorized authority change, missed
required shutdown, unsafe reserve transition, or electrical/thermal/household
safety failure. Harness-invalid or unmeasured trials never count as valid. One
alternative, operation, event, average, or aggregate cannot rescue another.

The Raspberry Pi delivered build remains capped at 65,000 cents. Reserve costs
include the exact unit, adapters, cables, mounting, enclosure changes, shipping,
tax, energy, replacement, service, and lifecycle burden. Passing the cap is
necessary but is not a value decision or purchase authority.

A reserve must fail safely when depleted, disconnected, unhealthy, or unable to
signal shutdown. It may not advertise bootability or committed-state safety it
did not prove. All outcome-sensitive thresholds, sample counts, schedules,
ranking weights, tie-breaks, decision horizon, expiry, and retest policy must be
frozen before operation.

## Decision boundary

If the qualified microSD software-only configuration passes every D-109 gate,
no backup power remains the incumbent. Extra reserve hardware would need a
pre-registered net-value case and still requires a superseding owner decision.

If microSD fails, its failure remains a failure. The USB 3 SSD fallback must be
evaluated rather than silently skipped. If software/storage alternatives cannot
meet D-109 and a reserve can, that evidence supports—but does not enact—a
superseding decision. Fewer failures, lower average cost, or a cleaner shutdown
cannot rescue any fixed safety or integrity failure.

## Authority and data boundary

This plan does not authorize purchasing, returning, contacting a vendor,
wiring, charging, firmware mutation, electrical assembly, destructive power or
fault operation, target operation, candidate selection, BOM mutation,
publication, a product claim, or D-109 supersession.

Future public evidence uses opaque alternative, unit, lot, event, operation,
trial, fault, and reason labels with closed counts, timings, metrics, costs, and
digests. It excludes raw serial/device/cell identifiers, receipts, contacts,
host or path values, household/profile/save/media/controller payloads,
credentials, payment/address data, and free-text electrical or fault logs.

## Blocked execution

Twelve blockers keep the checked-in plan at `status: blocked`. They cover the
D-109 trigger and incumbent result, qualified storage results, exact target and
reserve manifests, reviewed electrical safety fixture, transition/oracle
readiness, samples and faults, technical thresholds, lifecycle/value gates,
ranking policy, evidence governance/review, and purchase/operation/decision
authority.

## Validation

Run:

```powershell
pnpm validate:shutdown-reserve
```

The validator enforces strict canonical UTF-8 JSON, exact source bindings,
closed alternatives and matrices, fixed and open gates, D-109 non-rescue,
authority denials, data limits, blocker order, and the null result.
