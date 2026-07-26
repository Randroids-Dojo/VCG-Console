# USB 3 SSD Fallback Qualification Plan

Status: strict blocked I-021 pre-registration; no SSD is selected, purchased,
received, attached, written, updated, power-cut, disconnected, corrupted,
recovered, qualified, or added to the product BOM.

Machine-readable plan:
[`pi5-usb3-ssd-fallback-plan-v1.json`](../benchmarks/usb3-ssd-fallback/pi5-usb3-ssd-fallback-plan-v1.json)

Validator:
[`validate-usb3-ssd-fallback-plan.mjs`](../scripts/validate-usb3-ssd-fallback-plan.mjs)

Owner decisions:
[`OWNER_QUESTIONS_USB3_SSD_QUALIFICATION_2026-07-26.md`](OWNER_QUESTIONS_USB3_SSD_QUALIFICATION_2026-07-26.md)

## Outcome

I-021 now has a closed, source-bound, zero-result campaign boundary. It does
not start merely because one microSD card fails. Production fallback execution
requires either:

1. a canonical `vcg-microsd-qualification-result/v1` conclusion of `rejected`
   for the tracked microSD campaign, plus a reviewed failure/root-cause record
   showing why an SSD architecture could address the failure; or
2. separate written authority for a lab-only comparative sample that cannot
   qualify the fallback or change the production BOM.

A harness defect, non-storage target failure, invalid trial, or unexplained
single-card fault cannot invoke the production fallback. A rejected microSD
does not qualify an SSD.

## Candidate boundary

The existing screen supplies two exact source facts, not candidates selected
for purchase or execution:

| Candidate | Screen state | Qualification state |
|---|---|---|
| Kingston XS1000 1TB black `SXS1000/1000G` | Best integrated/cable desk lead, but unavailable and unpriced at the frozen seller snapshot | Unselected and unqualified |
| Samsung T7 Shield 1TB black `MU-PE1T0S/AM` | Exact available screen identity, but the observed $287.99 item price already breaks D-111 before tax, shipping, or mounting | Cost-screen failure, unselected, and unqualified |

The plan admits only an exact bus-powered integrated portable SSD assembly.
The received SSD, controller/firmware, shipped cable, Pi USB 3 Type-A port,
power state, mechanical mount, and service treatment form one indivisible
candidate. Swapping any member invalidates inherited results. A separate NVMe
or SATA bridge, enclosure, replacement cable, powered hub, or separate supply
requires a new reviewed branch and authority; it cannot be added during a run.

## Fixed target boundary

Qualification is specific to the lower-cost Raspberry Pi 5 / AI HAT+ 26 TOPS
reference assembly. The final board, EEPROM, kernel, firmware, USB drivers,
power supply, cooling, HAT, camera, controllers, receivers, topology, signed
image, layout, filesystems, mount policy, workload, update path, recovery
release, and service projection must be frozen before operation.

The SSD connects to a Pi USB 3 Type-A port. The Pi USB-C receptacle remains the
power input. Qualification requires cold boot with no microSD inserted. A
desktop, Windows host, other board, hidden boot card, or another USB device
cannot qualify the Pi route. The harness may not assert a USB current budget
that the negotiated supply does not provide.

## Mandatory phases and scenarios

The plan fixes 12 ordered phases:

1. trigger and intake;
2. identity, firmware, and health;
3. image, layout, capacity, and full disk;
4. boot enumeration and slot selection;
5. performance, concurrent load, and endurance;
6. signed update promotion and rollback;
7. scheduled power cut;
8. disconnect and intermittent contact;
9. corruption and substitution;
10. blank-device recovery and offline first boot;
11. mechanics, power, thermal, and EMI; and
12. delivered cost, service, and review.

Twenty-four exact scenarios cover the valid microSD trigger; receipt and
assembly intake; firmware lifecycle; 100 valid cold boots without microSD;
warm restart; missing, late, multiple, wrong, old, and cloned devices; clean,
dirty, near-full, sustained-write, AI, camera, controller, and cooling load;
signed A/B and package update/rollback; scheduled cuts; live removal and
intermittent contact during every authoritative state; partition, slot,
filesystem, metadata, data, and controller faults; blank-device read-back and
offline first boot; supported writer-platform target selection; cable and
connector handling; inrush, peak, steady, brownout, and reconnect power;
thermal/EMI coexistence; and delivered cost, volume, replacement, and review.

The cold-boot floor is fixed at 100 valid cycles because the existing I-021
screen already requires that baseline. Other sample counts, cut/disconnect
counts, performance limits, service writes, endurance margin, current margin,
thermal/mechanical limits, physical size, mass, and quote freshness remain
open. They must be frozen before any outcome is visible.

## Fixed gates

The following cannot be weakened by an execution-ready revision:

- zero committed-state corruption;
- zero launch or promotion of unverified or uncommitted state;
- zero incorrect recovery-target mutation;
- zero unsafe USB-current override;
- zero silent UAS-to-BOT downgrade;
- zero unexpected USB reset or disconnect;
- zero unauthorized quota, reserve, write, or content-promise expansion;
- complete accounting for every scheduled attempt, including invalid,
  stopped, retried, adverse, and worst cases;
- no candidate, phase, speed, capacity, cost, or aggregate rescue;
- cold boot without microSD;
- the same logical storage, update, recovery, privacy, and permanent-local-loss
  contract as the microSD baseline; and
- a complete delivered lower-cost reference build at or below $650, including
  storage, mount, any approved cable, shipping, and tax.

Extra capacity does not authorize larger caches, logs, write budgets, content
promises, or recovery assumptions. Advertised throughput, Linux support, USB
attachment, filesystem mount, one successful boot, vendor UI, health display,
or a partial campaign cannot substitute for semantic state and recovery
evidence.

## Evidence and privacy boundary

Independent oracles must establish boot slot and readiness, committed state,
storage latency and writes, scheduled cut/disconnect timing, injected faults,
recovery target/read-back/offline boot, USB mode and errors, rail/system power,
temperature, retention/connector outcomes, camera/controller coexistence,
fresh delivered cost, and a complete attempt ledger.

Repository evidence uses opaque candidate, unit, lot, cable, mount, target,
scenario, attempt, fault, and reason labels. Closed counts, timings, hashes,
metrics, costs, and redacted categories are allowed. Raw USB descriptors and
serials, SMART payloads, receipts/orders/support identifiers, usernames,
paths, filesystem values, profiles, saves, retro content, browser data,
credentials, tokens, keys, secrets, media, controller payloads, and free-text
logs are prohibited.

## Current blockers

The artifact records 12 closed blocker codes covering the trigger, exact fresh
candidate and quote, received assembly, Pi tuple, service/endurance/performance
gates, UAS/BOT and power protocol, fault harness, recovery oracles, mechanical
and thermal protocol, D-111 review, schedule/result/data/review contract, and
all purchase/destructive/qualification authority.

Until every blocker is replaced by a reviewed digest in a separately validated
execution-ready revision, `status` remains `blocked` and `result` remains
`null`.

## Validation

Run the focused validator and adversarial tests with:

```powershell
pnpm validate:usb3-ssd-fallback
```

The validator enforces bounded canonical UTF-8 JSON, exact source hashes,
closed fields, candidate identities, phase/scenario order, fixed gates, open
thresholds, authority denials, privacy limits, blocker order, and the null
result. The test suite mutates every major boundary and rejects noncanonical
JSON, duplicate keys, a BOM, invalid UTF-8, bare carriage returns, and
oversized input.
