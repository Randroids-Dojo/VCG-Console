# Failure-Critical Substitute Qualification Plan

Status: strict blocked I-031 umbrella; no substitute candidate, approved vendor,
purchase, physical test, qualification, publication, or BOM mutation exists.

Machine-readable plan:
[`cross-tier-failure-critical-substitute-plan-v1.json`](../benchmarks/failure-critical-substitutes/cross-tier-failure-critical-substitute-plan-v1.json)

Validator:
[`validate-failure-critical-substitute-plan.mjs`](../scripts/validate-failure-critical-substitute-plan.mjs)

Owner decisions:
[`OWNER_QUESTIONS_FAILURE_CRITICAL_SUBSTITUTES_2026-07-26.md`](OWNER_QUESTIONS_FAILURE_CRITICAL_SUBSTITUTES_2026-07-26.md)

## Outcome

I-031 now has a closed cross-tier qualification boundary instead of a vendor
wish list. The existing BOM remains the source screen: it defines primary line
items and explicitly says no substitution is approved. This plan cannot select
a candidate or vendor. It defines what a future exact primary/substitute pair
must prove before an approved-vendor list can contain a qualified part.

The required tiers are the Raspberry Pi 5 lower-cost reference and ordinary
x86 Linux reference. Steam Machine/SteamOS remains optional and cannot rescue
either required tier. Development workstations, vendor fixtures, family names,
and results from another tier cannot qualify a target.

## Failure-critical functional roles

Every required target carries 12 functional roles, even when a finished
appliance integrates several roles into one chassis or component:

1. compute platform;
2. pose-inference device;
3. primary writable storage;
4. shared RGB camera;
5. primary power supply;
6. cooling assembly;
7. enclosure/chassis;
8. display interconnect;
9. camera interconnect;
10. assembly retention and fasteners;
11. primary controller; and
12. recovery remote.

Each role has four exact mandatory check families. Examples include D-110
camera-to-action timing for inference and camera substitutions; genuine UVC
1080p60, privacy, reconnect, and room coverage for cameras; power-cut,
corruption, endurance, and blank-media recovery for storage; four-hour thermal
soak and one-metre acoustics for cooling; and reserved Home/Back ownership plus
disconnect recovery for controllers and the recovery remote.

A substitute must preserve the role. Replacing a Pi board with a different
architecture tier, a 26 TOPS accelerator with a different product tier, a UVC
camera with an unapproved CSI lane, or an appliance-internal power/cooling
system with a different product is a superseding architecture decision, not a
substitution.

## Exact candidate and vendor boundary

An execution-ready revision must bind:

- the exact qualified primary baseline for every target-role cell;
- an exact substitute manufacturer, model, part number, region, revision,
  firmware, lot or batch scope, included accessories, interfaces, dimensions,
  and safety facts;
- the exact manufacturer or authorized distributor, quote date, jurisdiction,
  currency, tax, shipping, delivered cost, availability, warranty, return,
  support, supply-continuity, expiry, and requalification policy; and
- received-unit identity proving that the tested item matches the quote.

Marketplace, used, open-box, unidentified-seller, silent revision, regional
alias, firmware, lot, cable, mount, or accessory substitution is prohibited.
An approved vendor entry never qualifies a part and never authorizes purchase.
Stock, price, specifications, connector fit, or a component smoke test cannot
replace complete qualification.

## Qualification matrix

The fixed matrix contains:

- 2 required targets × 12 roles = 24 required target-role cells;
- 1 optional target × 12 roles = 12 optional cells;
- one exact primary and at least one exact substitute per cell, producing at
  least 48 required candidate records and 24 optional candidate records; and
- 8 ordered acceptance stages for every candidate record, producing 384
  required and 192 optional stage results.

The eight stages are procurement/identity; interface fit/safety; target
bring-up/firmware/driver; complete-product workload/performance; sustained
environment/coexistence; fault/recovery/service replacement; delivered
cost/supply/warranty/expiry; and independent review/approval.

Every primary and substitute runs under the same exact target, product,
workload, and acceptance contract. Role-specific mandatory checks live inside
the applicable stages. A missing, failed, invalid, stopped, retried, adverse,
or worst case remains visible. No candidate, target, role, stage, optional tier,
or aggregate may rescue failure.

## Fixed gates

The following cannot weaken:

- at least one qualified substitute for every required target-role cell;
- zero missing required cells;
- zero unqualified or silent substitutions;
- zero unreviewed revision, firmware, lot, or seller changes;
- zero weakened inherited product gates;
- zero failed safety, integrity, privacy, recovery, or reserved-control gates;
- the complete Pi delivered reference remains at or below $650;
- exact received identity and integrated target evidence are mandatory;
- failure remains failure for that exact candidate, target, and role; and
- a tier, architecture, or functional-role change requires a superseding
  decision.

The number of received units/lots, behavioral cycles, soak duration,
performance/power/thermal/acoustic/volume/mass regression limits, service time,
quote freshness, supply horizon, warranty, return window, non-Pi cost delta,
ranking, tie-break, expiry, retest, and family scope remain open. They must be
frozen before operation or candidate outcomes are visible.

## Evidence and privacy

Independent evidence must cover receipt/revision/firmware/lot/vendor; fit,
electrical, mechanical, and household safety; boot/driver/update/rollback;
complete-product function, performance, latency, and resources; sustained
thermal, acoustic, power, radio, EMI, and coexistence; faults, recovery,
service replacement, and data continuity; fresh delivered economics and supply;
and independent approval, expiry, and retest.

The tracked result may contain only opaque target, role, candidate, unit, lot,
vendor, stage, attempt, fault, and reason labels plus closed counts, timings,
hashes, metrics, costs, and redacted categories. Serial/device identifiers,
receipts/orders/support contacts, host and filesystem values, profile/save/media
or controller payloads, credentials, payment/tax/street-address data, and
free-text vendor/driver/fault/result logs are prohibited.

## Current blockers

Twelve blocker codes cover role/target ownership, exact qualified primaries,
exact candidates/vendors/quotes, received identities, role-specific harnesses,
the integrated workload, samples and retest policy, economics and supply,
service replacement and recovery, result/data/incident rules, independent
review and expiry, plus purchase/destructive/qualification authority.

Until a separately reviewed execution-ready revision replaces every blocker
with exact hashes, `status` remains `blocked` and `result` remains `null`.

## Validation

Run:

```powershell
pnpm validate:failure-critical-substitutes
```

The validator enforces strict canonical UTF-8 JSON, exact source bindings,
closed target and role inventories, matrix arithmetic, fixed and open gates,
vendor and authority denials, data limits, blocker order, and the null result.
