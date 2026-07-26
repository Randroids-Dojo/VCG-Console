# Dependent hardware campaign status audit

Date: 2026-07-25

Status: I-160/I-162/I-197 status reconciliation; no physical result

## Outcome

Three investigation rows remained `open` even though their parent plans or
implementation boundaries are committed and tested. They are now `active`:

- I-160 is the gated 4 GB candidate lane inside I-016;
- I-162 is the physical build/abuse execution lane inside I-022 and I-202; and
- I-197 is the production-wiring and physical-stress lane for the committed
  D-166 power coordinator plus I-023/I-117/I-118/I-120 campaigns.

This audit changes no target, strategy, threshold, purchase, mutation or
physical-execution authority.

## I-160: 4 GB memory comparison

`benchmarks/pi5-memory-pressure/pi5-memory-tier-plan-v1.json` already freezes
D-042's order:

1. the selected 8 GB reference must pass first;
2. 4 GB is the only current minimum-tier candidate; and
3. 2 GB remains optional exploration and cannot become product-eligible without
   a superseding decision.

The 8 GB and 4 GB rows use the same image, kernel, Hailo 26 runtime, storage,
swap/zram/cgroup policy, camera, room and workloads. Forty required cells span
cold launch, one-hour representative operation, bounded pressure/reclaim and
kernel-owned OOM recovery. Metrics include peak/resident memory, swap, storage
writes, OOM, launch time, frame pacing, latency, FPS, recovery, power, thermal,
acoustic and cost/savings evidence. A 4 GB result cannot run or select a tier
before a stable passing 8 GB baseline.

The current focused memory-plan suite passes eight tests. No board, stable 8 GB
baseline, ready plan, result or selection exists.

## I-162: selected microSD build and abuse campaign

`benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json`
and `MICROSD_QUALIFICATION_PROTOCOL_2026-07-24.md` already define the I-162
umbrella: intake, destructive capacity, final image, console workload,
full-disk/quota, power-cut/update interruption, corruption/removal, blank-card
recovery and accelerated endurance/drift.

The ready/result transition requires exact part/cohort/lots/control, Pi/image/
layout/filesystem/workload/recovery/harness bindings, at least 200 valid cuts
per card, zero safety failures, complete phase accounting, capacity/write and
endurance gates, every-card pass and no aggregate rescue. The USB SSD path is
only a measured fallback after an exact microSD failure.

The current focused microSD suite passes 17 tests. No physical card, purchase,
destructive run, cut, corruption, endurance or fallback trigger exists.

## I-197: tier-native quick resume

The committed Rust `PowerCoordinator` expresses D-166's exact bounded ordering:
fresh native launch admission closes first; host-selected adapters prove game,
tracker, camera, input, write and update-safe quiescence; the selected target
adapter performs idle; and only exact launcher/display/input wake readiness can
consume the retained closure and reopen launch.

The physical evidence surface is now split into dedicated strict plans:

- I-023 freezes cold/resume/idle/wake timing and external interaction oracles;
- I-117 freezes controller pairing/reconnect/battery and required wake behavior;
- I-118 freezes TV sleep/wake, input, audio and HDMI hot-plug behavior; and
- I-120 freezes wall energy, thermal/write/network quiescence, privacy and at
  least 600 required wake cycles across the target strategies.

Together they cover the requested state assertions, watts, thermals, five-
second wake, controller/physical and conditional remote/CEC reliability,
update interactions and branded controller-usable return boundary. The
existing sudden-power campaign covers unclean interruption separately.

The current combined plan suites pass 53 timing/controller/TV/energy tests.
Native tests were not rerun in this audit because another concurrent tranche
currently makes the shared native crate intentionally incomplete; no inference
is made from that temporary build state.

## Remaining boundary

I-160/I-162/I-197 remain active, not complete. Missing evidence includes the
exact received hardware, stable prerequisite baselines, production adapters,
privileged wiring/authentication, game suspend manifests, physical controls,
compositor/display/audio paths, calibrated instruments, schedules, gates,
destructive/unattended authority, trials, results and target qualification.

Existing dedicated owner-question documents retain the unresolved values:
`OWNER_QUESTIONS_PI5_MEMORY_TIER_2026-07-25.md`,
`OWNER_QUESTIONS_MICROSD_QUALIFICATION_2026-07-24.md`,
`OWNER_QUESTIONS_BOOT_RESUME_LAUNCH_TIMING_2026-07-25.md`,
`OWNER_QUESTIONS_BLUETOOTH_CONTROLLER_2026-07-25.md`,
`OWNER_QUESTIONS_TV_APPLIANCE_2026-07-25.md`, and
`OWNER_QUESTIONS_IDLE_ENERGY_2026-07-25.md`.
