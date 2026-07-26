# Complete-system economics campaign

Date: 2026-07-26

Status: strict zero-result pre-registration; no exact five-candidate set, delivered quote set, physical operation, ranking, selection, purchase recommendation, or tier mutation exists.

## Outcome

I-172 now has a machine-checked comparison contract at
`benchmarks/system-economics/complete-system-economics-plan-v1.json`.
It compares these five roles without treating them as interchangeable:

1. the preordered Steam Machine as an optional compatibility candidate;
2. one exact, still-unselected custom AMD mini PC;
3. Raspberry Pi 5 8GB plus AI HAT+ 26 TOPS as the required lower-cost reference;
4. the Jetson Orin Nano Super Developer Kit as an Arm accelerator comparator;
5. one exact owned x86-64 Linux system as the required premium reference.

This document and plan do not select a winner. Vendor specifications, list
prices, advertised TOPS, an available development PC, a board-only quote, or a
result from a different candidate cannot close any integrated system cell. A
less expensive candidate cannot compensate for a failed product gate.

## Current source boundary

Current official pages reinforce why the quote set remains open:

- Raspberry Pi lists AI HAT+ in 13 and 26 TOPS variants and says the family is
  available from $70. Its launch article lists the 26 TOPS variant at $110.
  Neither number is a delivered Pi console total. Raspberry Pi also announced
  further memory-driven Pi 4/5 price increases on 2026-04-01, including a $50
  increase for 8GB products. A fresh approved-reseller checkout quote is
  therefore required.
- NVIDIA's current Jetson purchase page says the Orin Nano Super Developer Kit
  is $249, while NVIDIA's current FAQ price table says $399. The FAQ also says
  developer kits are non-production reference systems. The disagreement must
  be preserved and resolved with an exact part-number, seller, stock, and
  delivered quote; neither figure is silently selected.
- Valve's live Steam Machine page remains the authoritative product surface,
  but the comparison requires the actual preorder/payment and final delivered
  ledger, not a reported base price. Steam Machine remains optional and outside
  the Pi ceiling.
- No exact AMD mini PC has been selected. A plausible product family or a bare
  mini-PC price is not a candidate identity.

Official sources accessed 2026-07-26:

- [Raspberry Pi AI HAT+ product page](https://www.raspberrypi.com/products/ai-hat/)
- [Raspberry Pi AI HAT+ launch article](https://www.raspberrypi.com/news/raspberry-pi-ai-hat/)
- [Raspberry Pi 2026-04-01 price update](https://www.raspberrypi.com/news/a-new-3gb-raspberry-pi-4-for-83-75-and-more-memory-driven-price-increases/)
- [NVIDIA Jetson purchase page](https://developer.nvidia.com/embedded/buy-jetson?product=all)
- [NVIDIA Jetson FAQ](https://developer.nvidia.com/embedded/faq)
- [Valve Steam Machine product page](https://store.steampowered.com/hardware/steammachine)

These sources are discovery inputs, not performance evidence, delivered
quotes, purchase authority, or qualification.

## Comparison contract

The plan holds the common VCG product contract fixed across candidates:

- seven workloads: launcher shell, obstacle motion sample, one selected signed
  local package, Retro 2048, VibeBots, Mi Casa Es Su Casa, and Determined;
- the same qualified camera, mount, controller, display/audio path, storage
  class, room, content, interactions, instrumentation, and acceptance rules;
- candidate-specific architecture, driver, inference runtime, model build, and
  packaging differences only behind reviewed interfaces;
- accountless local launcher, tracking, profiles, packages, and retro behavior;
- independent exposure-to-game-API latency, action quality, controller,
  performance, power, acoustic, update, recovery, and economic evidence.

The three lifecycle phases are:

1. accountless cold start through the usable workload;
2. one hour of concurrent steady-state tracking and workload operation;
3. update/fault recovery followed by an offline restart.

Five candidates by seven workloads by three phases gives 105 cells. Each cell
requires 20 valid cycles, for 2,100 valid cycles. Invalid, failed, stopped,
retried, adverse, and worst-case cycles remain visible and do not count as
valid replacements. No missing cell is imputed from another candidate or an
aggregate.

## Complete-system economics

Every quote line requires the exact manufacturer, model, revision and part
number; seller; item URL digest; observation time; stock state; currency;
destination jurisdiction; item subtotal; discount; shipping; tax; delivered
total; return window; warranty; and support category.

System parity includes compute, camera and mount, inference accelerator when
needed, storage, power, cooling, enclosure, display/audio adaptation, cables,
mounting hardware, shipping, and tax. A base MSRP, component subtotal, mixed-
date quote, or unbound currency conversion cannot prove delivered cost.

The $650 ceiling applies only to the complete delivered Pi reference described
by D-111. It includes Pi 5 8GB, AI HAT+ 26 TOPS, qualified camera, 256GB storage,
power, cooling, ABS enclosure, cables, fasteners, shipping, and tax. Television,
controllers, tools, experimental spares, and the preordered Steam Machine are
excluded exactly as D-111 specifies.

Owned x86 receives two explicit views: incremental reuse cost and current
replacement-parity delivered cost. Availability does not make the hardware
free. The evaluation horizon, duty cycle, electricity price, labor rate,
discount treatment, residual value, repair assumptions, and uncertainty method
all remain owner-frozen inputs rather than convenient defaults.

## Measurements and fixed gates

The 16 metric families cover exact manifests; quotes; reuse and replacement
economics; wall energy; one-metre acoustics; size and mass; repair; updates;
account boundaries; controller behavior; exposure timing; action quality;
frame pacing and resources; thermal behavior; fault recovery; and the complete
adverse-evidence ledger.

The already-decided fixed gates remain:

- exposure-to-game-API p95 is at most 120 ms;
- the complete delivered Pi reference is at most $650;
- core local operation has zero Steam-account dependencies;
- privileged false activations, missing cells, unbound currency conversions,
  base-price substitutions, TOPS-based selections, zero-cost owned-hardware
  claims, and cross-candidate rescues are all zero.

Twenty-five performance, resource, economic-horizon, repair, maintenance, and
value thresholds remain null. They must be frozen before operation and before
results are visible. The plan cannot manufacture them from observed outcomes.

## Authority and evidence boundary

The campaign is blocked on 18 explicit prerequisites mirrored in
`OWNER_QUESTIONS_COMPLETE_SYSTEM_ECONOMICS_2026-07-26.md`. In particular, it
does not authorize purchases or returns, account or service use, participant or
camera operation, software or firmware updates, fault injection, repair,
power-cut testing, destructive recovery, publication, ranking, selection, or a
reference-tier change.

Repository-safe results use opaque candidate/workload/phase/cycle labels and
closed numeric fields. They exclude raw room, player, camera, screen, audio,
video and skeleton data; personal and stable device identifiers; checkout and
support identifiers; credentials; paths; arbitrary logs; and free text.

## Verification

Run the focused gate with:

```text
pnpm validate:complete-system-economics
```

The validator enforces source digests, the closed candidate set, the matrix
arithmetic, D-110/D-111/D-118 invariants, null gates and results, no-rescue
rules, authority denial, and exact blocker alignment.
