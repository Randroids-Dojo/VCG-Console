# Raspberry Pi 5 thermal, acoustic and cooling comparison plan

Date: 2026-07-25

Status: strict blocked I-024/I-025 plan; zero physical results

Authority: D-041, D-044, D-090, D-094, D-108, D-110, I-024, I-025,
Q-255 and Q-261

## Outcome

[`pi5-cooling-soak-plan-v1.json`](../benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json)
defines the machine-checked campaign. Validation lives in
`scripts/validate-pi5-cooling-soak-plan.mjs` with adversarial tests in the
matching `.test.mjs` file.

This is a zero-result pre-registration. It selects no cooler or enclosure,
authorizes no purchase or cut, and records no soak, temperature, clock,
throttle, FPS, power, sound, vibration, fit, safety or cost evidence.

## Matrix and method

Four configuration roles are frozen: official Active Cooler `SC1148` baseline,
low-profile blower, passive and larger-fan comparisons. Only the baseline has
a quoted product; exact received assemblies, interfaces, mounts, fan curves
and delivered costs remain null.

Each configuration runs obstacle, VibeBots, Mi Casa Es Su Casa and Determined
loads for both one hour and four hours after a five-minute warmup: 32 required
cells. Configuration/workload order is counterbalanced, every cell cools to a
pre-registered ambient band, invalid harness runs remain visible and rerun,
and product failures cannot be replaced. One hour cannot substitute for four.

The common target binds one exact Pi 5 8GB/Hailo 26/image/runtime/storage,
qualified 1080p60 UVC camera, modified ABS enclosure geometry, room, workload,
power/fan policy, instruments and safety protocol. Open-enclosure results
cannot qualify the final enclosure.

## Evidence and gates

The campaign records ambient temperature/humidity/noise; SoC, accelerator,
storage, camera, air and surface temperatures; clocks, throttling, fan command
and tachometer; pose/game timing and drops; wall power/energy; one-metre sound
distributions and uncertainty; spectral tonal peaks, rattle, vibration and
oscillation; faults/recovery; vent, hot-part, cable, radio and stability
observations; exact digests and delivered cost.

Fixed gates are 35 dBA at one metre, zero thermal shutdowns, unrecovered
failures and privileged false activations, and 120 ms p95 exposure-to-action.
Temperatures, throttling, FPS/frame/drop, power, idle sound, tonal prominence,
rattle/oscillation, recovery and savings thresholds remain null until approved
before results. A numeric dBA pass never excuses tonal or mechanical failure.

Acoustic level/spectrum telemetry may be retained only without speech. Raw
frames, audio recordings, identifiers and free text remain prohibited.

## Remaining boundary

I-024 and I-025 remain active, not closed. Exact hardware, enclosure, cooler
candidates, fan curves, target tuple, instruments, room, schedule, cooldown,
safety, numeric gates and physical authority are absent.

Run `corepack pnpm validate:pi5-cooling-soak` for the focused gate.
