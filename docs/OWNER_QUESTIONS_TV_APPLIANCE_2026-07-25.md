# Owner questions: cross-tier TV appliance qualification

Date: 2026-07-25

Status: non-blocking questions retained for I-118 execution

The blocked plan is complete without these answers. No hardware session or
mutation should begin until the applicable answers are recorded before results.

## QTV-001: exact equipment tuples

Which received primary TV, HDMI port/settings, certified cable and external
source should be shared across both required targets? Is a receiver or soundbar
in scope only as the optional route, and which received unit is it?

Record salted campaign aliases plus reviewed configuration digests. Do not put
stable serials in released evidence.

## QTV-002: ordinary x86 idle and wake policy

For the selected ordinary x86-64 native-Linux tuple, should the campaign use
platform suspend or measured low-power launcher idle? Which controller, remote,
HDMI-CEC and physical wake sources are approved and expected to work?

This resolves Q-270 for this exact tuple; it does not create a global idle
strategy for untested hardware.

## QTV-003: mutation authority

Which exact TV power, input, volume/mute, display-mode, audio-route, CEC and
physical hot-plug actions may the operator or harness perform? Which actions
must remain manual, and what is the bounded physical recovery procedure when
the screen or audio is unavailable?

## QTV-004: physical oracles and schedule

Which reviewed instruments establish physical picture, audible left/right
output, controller response, stimulus time and recovery time? Who approves the
counterbalanced 100-cycle schedule, fault injection, invalid-cycle rules and
unscheduled-intervention classification?

## QTV-005: numeric gates

Before results, what are the maximum acceptable wake-failure ratio, p95 input
switch, audio-route and hot-plug recovery times, unexpected audio dropouts,
unexpected video blanking, wall power and sustained temperature?

The fixed five-second warm-wake deadline and zero-failure safety/recovery gates
already apply and should not be relaxed through this answer.
