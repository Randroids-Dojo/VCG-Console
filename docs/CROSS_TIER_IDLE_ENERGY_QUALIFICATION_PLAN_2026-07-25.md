# Cross-tier unattended idle energy qualification plan

Date: 2026-07-25

Status: strict blocked I-120 plan; no physical power or wake result

Authority: D-008, D-095, D-106, D-119, D-166, I-023, I-024, I-117,
I-118, I-120 and Q-270 through Q-272

## Outcome

[`cross-tier-idle-energy-plan-v1.json`](../benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json)
pre-registers the campaign. Its strict validator and adversarial tests are
`scripts/validate-cross-tier-idle-energy-plan.mjs` and the matching test file.

This advances I-120 from an open row to a blocked physical campaign. The
runtime policy already defines safe idle ordering; this campaign measures
whether exact target adapters actually reduce wall energy while preserving
privacy, bounded writes, update safety and reliable controller use.

No hardware, strategy, instrument, wake source, threshold or result is selected.
No unattended or power-state session is authorized.

## Target and strategy comparison

The ordinary x86-64 native-Linux target must compare platform suspend with
low-power launcher idle before Q-270 selects one. The Pi 5/Hailo 26 reference
measures D-095's low-power launcher idle. Reliable Pi suspend would require a
separate, explicitly proven candidate before superseding that policy. The later
Steam Machine's suspend row is optional and cannot rescue either common target.

Windows, WSL2, another target, another strategy, a shorter duration or an
aggregate cannot rescue a failed required cell. Strategy selection is never
automatic and must publish the energy, latency, reliability, thermal and write
tradeoff against pre-registered gates.

## Idle matrix

Four entry profiles cover accountless offline launcher, online quiescent
launcher, return from a local game, and return from a hosted session. Three
durations cover one-hour characterization, an eight-hour overnight interval and
a 24-hour unattended interval. Five valid counterbalanced runs are required for
every target/strategy/profile/duration cell.

The three required target/strategy combinations produce 36 cells and 180 idle
runs. Every required primary-controller and physical-fallback wake source gets
100 cycles per target/strategy combination: at least 600 required wake cycles.
Claimed remote or HDMI-CEC sources add required conditional rows. Optional
Steam adds at least 200 wake cycles.

Invalid harness runs remain recorded and rerun; product failures cannot be
replaced. Unscheduled operator intervention is a product failure.

## Safety and evidence boundary

Before idle is accepted, fresh launch admission closes; the game follows its
reviewed close/suspend policy; tracker and camera stop; the camera-active
indication turns off; microphone stays OS-disabled; display physically blanks
or dims; writes and updates reach a safe boundary; unnecessary network,
compute, fan and device activity quiesce; and exact wake authority remains.

Wake reopens launch admission only after launcher, display and input readiness.
A policy transition, blank display, sleeping process, host power estimate or
one successful wake cannot prove wall energy or reliable resume.

The campaign requires calibrated wall-power and clock evidence, one-hertz or
faster power/thermal sampling, namespace write and network counters, complete
privacy/lifecycle state, physical wake stimulus and controller-use timing, and
five minutes of post-wake observation.

## Gates and data boundary

The fixed five-second warm-wake deadline applies. Every required cell/source
must pass with zero unrecovered, false or duplicate wakes; privacy violations;
unsafe writes or update/protected-state transitions; lost required sources; and
crashes, hangs or unbounded restarts.

Wall watts, eight/24-hour energy, temperature, write rate, network rate, wake
failure/p95 and minimum savings gates remain null until approved before results.
Power savings cannot rescue privacy, wake, write or update failure, and fast
wake cannot rescue excess energy or weak reliability.

Raw media, network payloads/addresses/credentials, profile/save/package
contents, stable serials, participant identifiers and free text are prohibited.
Only aggregate telemetry with salted equipment aliases may be released.

## Remaining boundary

I-120 remains active. Exact received targets, power/display/controller tuples,
adapters, wake sources, x86 strategy authority, meters, state/privacy/write/
network oracles, schedule, numeric gates and all physical runs remain absent.

Run the focused gate directly until the concurrently owned `package.json`
tranche is committed:

```text
node scripts/validate-cross-tier-idle-energy-plan.mjs
node --test scripts/validate-cross-tier-idle-energy-plan.test.mjs
```
