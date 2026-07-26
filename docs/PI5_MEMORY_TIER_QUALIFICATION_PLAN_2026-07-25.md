# Raspberry Pi 5 memory-tier qualification plan

Date: 2026-07-25

Status: strict blocked I-016 plan; no memory-tier result or recommendation

Authority: D-021, D-041, D-042, D-047, D-085, D-108, D-110, D-180,
I-016, Q-012, Q-083 and Q-086

## Outcome

[`pi5-memory-tier-plan-v1.json`](../benchmarks/pi5-memory-pressure/pi5-memory-tier-plan-v1.json)
pre-registers the Pi memory comparison. Its validator and adversarial tests are:

- `scripts/validate-pi5-memory-tier-plan.mjs`; and
- `scripts/validate-pi5-memory-tier-plan.test.mjs`.

This is a blocked zero-result plan. No board, image, run, pressure injection,
OOM, memory distribution, cost, qualification or minimum-tier recommendation
exists.

## D-042 ordering and scope

The selected 8 GB reference must complete first. The 4 GB row is the only
current minimum-tier candidate and may run only after a stable passing 8 GB
baseline exists. A 2 GB row is exploratory: it is optional, cannot rescue an
8 GB or 4 GB failure, and cannot become product-eligible without a superseding
decision.

Every tier uses the same image, kernel, EEPROM policy, Hailo 26 runtime and
model, VCG workload bundle, storage/filesystem, swap/zram, cgroup, OOM,
cooling, power, enclosure, camera, room, monitoring and run protocol. A board
revision or artifact change creates a new comparison rather than a substitute
row.

## Matrix

The two required tiers each run five workloads through four phases, producing
40 required cells. The optional 2 GB lane contains another 20 cells but does
not affect required qualification.

Workloads are the local-web obstacle Motion sample, native ARM64 Godot Motion
sample, and the VibeBots, Mi Casa Es Su Casa and Determined remote-web
compatibility sessions. Hosted load does not establish title Motion
integration or playability.

The phases are:

1. cold launch and idle headroom;
2. five-minute warmup plus uninterrupted one-hour representative workload;
3. bounded cgroup-v2 memory pressure and reclaim; and
4. kernel-owned OOM evidence, fail-closed containment and fresh recovery.

Synthetic pressure can expose failure behavior, but cannot qualify a tier by
itself. Product failures remain failures; only a proven harness-invalid run is
retained and rerun.

## Required evidence

The campaign records process/cgroup resident and proportional memory, commit,
cache, slab, page tables, faults/refaults, PSI, reclaim, swap/zram, storage IO
and pressure-attributable writes. It also preserves pose/game FPS and tails,
pipeline drops, exposure-to-action distributions, OOM counters with per-run
baselines, launch/recovery/fresh-instance evidence, wall power and energy,
temperature, clocks, throttling, fan behavior, one-metre acoustics and
same-date delivered cost.

Existing hard gates remain 120 ms p95 exposure-to-action, zero privileged
false activations, zero unrecovered failures, zero unexpected representative
OOM kills and 35 dBA at one metre for the lower-cost enclosure. Memory
headroom, PSI, fault, swap/zram, storage-write, FPS, frame/drop, power,
temperature, throttle, recovery and cost-savings thresholds remain null until
approved before results are visible.

## Security and claim boundaries

D-085 prohibits profile-vault keys or plaintext in swap and crash dumps. The
plan also prohibits raw frames, audio, retained skeleton traces, credentials,
tokens, hosted request/response bodies, participant identifiers and free text.
Aggregate system telemetry is the only release evidence currently allowed.

The plan authorizes no hardware access, purchase, image/storage mutation,
participant session, pressure injection or OOM injection. It does not claim
that no swap is best: a disabled, disk-backed or compressed-RAM policy must be
selected and measured before execution, including its storage-wear and
recovery effects.

## Remaining boundary

I-016 is active, not closed. The 8 GB reference campaign has not passed, exact
8 GB/4 GB boards are not received, and every runtime, pressure, memory,
storage, workload, physical-authority and numeric-gate dependency remains
blocked. The plan cannot change D-042 or authorize a purchase.

Run the focused gate with:

```powershell
corepack pnpm validate:pi5-memory-tier
```
