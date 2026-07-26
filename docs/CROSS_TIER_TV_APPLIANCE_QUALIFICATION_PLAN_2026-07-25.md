# Cross-tier TV appliance qualification plan

Date: 2026-07-25

Status: strict blocked I-118 plan; no physical-TV result

Authority: D-008, D-095, D-106, D-116, D-119, D-166, I-027, I-028,
I-118, Q-001 and Q-270

## Outcome

[`cross-tier-tv-appliance-plan-v1.json`](../benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json)
pre-registers the campaign. Its strict validator and adversarial tests are
`scripts/validate-cross-tier-tv-appliance-plan.mjs` and the matching test file.

This advances I-118 from an open row to a blocked, executable evidence
contract. It does not select a TV, ordinary x86 host, display stack, idle
strategy, control policy, instrument, or threshold. It authorizes no hardware
session or mutation.

## Required scope

The ordinary x86-64 native-Linux premium target and Pi 5/Hailo 26 reference
are independent required targets. The later Steam Machine is optional. Windows,
WSL2, Steam, or a successful Pi cell cannot substitute for ordinary Linux, and
neither required target can rescue the other.

Eight scenarios cover the four I-118 domains twice:

- launcher idle and television standby wake;
- standby while the console is active;
- deliberate input switching away and back;
- an external source taking the input;
- direct-TV audio-route loss and restoration;
- another approved audio device and return;
- HDMI unplug, replug and safe-mode recovery; and
- hot-plug during launcher, loading, game, failure and idle boundaries.

Each scenario runs 100 valid cycles on each required target: 16 required
target/scenario cells and 1,600 required cycles. The optional Steam row adds
800 cycles but cannot qualify either common target. A Pi I-027/I-028 cycle may
be reused only when its exact target, configuration, stimulus, protocol and
cell identity match, and it may appear once. Partial Pi evidence cannot promote
this campaign.

## Cycle and evidence boundary

Every cycle separately proves baseline physical picture, audible stereo and
controller response; applies one scheduled stimulus; observes host and physical
state independently; performs the pre-registered recovery; proves restored
picture, audio, controller and privileged fallback; and holds the recovered
state for at least 60 seconds.

Product failures remain failures. Invalid harness cycles remain recorded and
are rerun; they cannot replace product failures. Unscheduled operator
intervention is itself a product failure. The schedule is counterbalanced.

EDID, ELD, compositor state, audio API state, CEC traffic, browser pixels and a
running launcher are diagnostic inputs, not proof of physical video, audible
audio, user control or recovery. A physical observer and independent timing
harness must establish those claims.

## Gates and data boundary

The existing five-second warm-wake gate is fixed. Every required cell must
pass with zero unrecovered cycles, false physical-ready/audio claims, CEC loops,
unexpected input takeovers, lost controller or physical fallbacks, privacy or
quiescence violations, and crashes, hangs or unbounded restarts.

Input-switch, audio-route, hot-plug, reliability, dropout, blanking, power and
thermal thresholds remain null until approved before results. Aggregates and
optional targets cannot rescue a failed required cell.

Raw video/audio, released raw EDID/ELD/CEC traces, stable equipment serials,
network addresses, credentials, participant identifiers and free text are not
authorized. Only aggregate telemetry with salted per-campaign equipment aliases
may be released.

## Remaining boundary

I-118 remains active, not complete. Exact received targets, TV/port/cable/source
and optional receiver tuples, target display/audio/CEC/controller stacks, the
ordinary-x86 idle strategy, physical and timing oracles, counterbalanced
schedule, fault protocol, numeric gates and mutation authority are absent.

Run the focused gate directly until the concurrently owned `package.json`
tranche is committed:

```text
node scripts/validate-cross-tier-tv-appliance-plan.mjs
node --test scripts/validate-cross-tier-tv-appliance-plan.test.mjs
```
