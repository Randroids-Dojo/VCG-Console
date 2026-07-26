# Cross-tier Bluetooth controller qualification plan

Date: 2026-07-25

Status: strict blocked I-117 plan; no physical-controller result

Authority: D-095, D-116, D-123, I-026, I-117, I-152, Q-067 and Q-227
through Q-232

## Outcome

[`cross-tier-bluetooth-controller-plan-v1.json`](../benchmarks/controller-pairing/cross-tier-bluetooth-controller-plan-v1.json)
pre-registers the campaign. Its strict validator and adversarial tests are
`scripts/validate-cross-tier-bluetooth-controller-plan.mjs` and the matching
test file.

This advances I-117 from an open row to a blocked, executable evidence
contract. It does not select or purchase a controller, target, Bluetooth stack,
mapping, pairing agent, bond-store policy, battery source, threshold or
instrument. It authorizes no pair, forget, radio fault or battery discharge.

## Targets and samples

Ordinary x86-64 native Linux and the Pi 5/Hailo 26 reference are independent
required targets. The later Steam Machine is optional. Windows, WSL2, the Pi
radio campaign, or one required target cannot qualify another target.

The sample roles match I-152: one first-party standard controller, a second
vendor, a generic ambiguous controller and a simultaneous cross-vendor pair.
The exact received brands, revisions and firmware remain Q-227. Each material
revision is a separate configuration.

Bluetooth is the required transport. Wired USB and 2.4 GHz receiver behavior
remain useful recovery or separate-claim evidence, but neither can rescue a
Bluetooth failure. Family resemblance, a mapping entry, discovery, a connected
flag, a stored bond and one successful attempt cannot establish support.

## Matrix

Fourteen scenarios cover:

- fresh pairing before cold boot and at the launcher;
- bonded controllers off and on during cold boot;
- controller sleep/wake and reconnect;
- host-radio loss, Bluetooth-service restart and controller power loss while
  an action is held;
- forget, bond revocation, re-pairing and unselected/failing peers;
- two-controller pairing in both orders and simultaneous reconnect;
- low-battery pairing/reconnect/use; and
- critical, unavailable and stale battery evidence.

Applicability produces 34 sample/scenario cells per target. Every applicable
cell requires 20 valid counterbalanced cycles: 68 required target cells and
1,360 required cycles. Optional Steam adds 680 cycles but cannot qualify either
common target.

An I-152 or I-026 cycle may be reused once only when target, sample, revision,
firmware, transport, scenario, protocol and cell identity match exactly.
Partial controller or Pi-radio evidence cannot promote I-117.

## Evidence and gates

The campaign requires independent physical-input and clock evidence through
pairing phases, bond changes, fresh connection/action epochs, mappings, player
assignment, canonical edges, reserved Home/Back/Pause ownership, battery source
and freshness, recovery paths and lifecycle state.

The existing five-second warm reconnect/wake boundary remains fixed. Every
required cell must pass with zero unrecovered or false pairing/reconnect claims,
stuck/fabricated/duplicate/old-epoch actions, wrong-player or durable-identity
assignment, game-owned reserved actions, lost recovery paths and credential or
stable-identity disclosure.

Pairing, cold-boot reconnect, fault reconnect, low-battery input, warning,
usable-duration and disconnect thresholds remain null until approved before
results. Aggregates, wired/receiver results, optional targets and another target
cannot rescue a failed required cell.

Battery state may never be inferred from model, transport or elapsed time.
Unavailable and stale remain explicit dispositions. A connected flag or stored
bond cannot prove usable input, fresh identity or assignment.

## Data boundary

Raw Bluetooth addresses/names/stable serials, bond keys/passkeys/credentials,
HID descriptors/events, packet payloads, released radio traces, participant
identifiers and free text are prohibited. Only aggregate telemetry with salted
per-campaign device aliases may be released.

## Remaining boundary

I-117 remains active. Exact received controllers, target radio/BlueZ/SDL/
mapping/compositor/bond-store tuples, pairing UX, battery sources, low/critical
policy, harness, applicability ledger, schedule, numeric gates, mutation
authority and all 1,360 required cycles remain absent.

Run the focused gate directly until the concurrently owned `package.json`
tranche is committed:

```text
node scripts/validate-cross-tier-bluetooth-controller-plan.mjs
node --test scripts/validate-cross-tier-bluetooth-controller-plan.test.mjs
```
