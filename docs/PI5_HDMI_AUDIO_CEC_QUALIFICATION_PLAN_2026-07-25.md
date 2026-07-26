# Raspberry Pi 5 HDMI video, audio and CEC qualification plan

Date: 2026-07-25

Status: strict blocked I-027/I-028 plan; no physical-TV result

Authority: D-008, D-095, D-106, I-027, I-028, I-098, Q-001, Q-242 and
Q-243

## Outcome

[`pi5-hdmi-audio-cec-plan-v1.json`](../benchmarks/pi5-hdmi-cec/pi5-hdmi-audio-cec-plan-v1.json)
pre-registers the campaign. Its strict validator and adversarial tests are
`scripts/validate-pi5-hdmi-audio-cec-plan.mjs` and the matching test file.

This is a zero-result plan. Browser screenshots, CSS viewports, EDID,
compositor state and Web Audio cues are explicitly insufficient to prove a
physical mode, overscan, audible route, channel identity or usable television.

## Video and audio matrix

Three required SDR/60 Hz candidates are kept separate: 720p safe recovery,
1080p baseline and 4K headroom. None is selected. Direct-TV stereo PCM at
48 kHz is the required baseline route. An optional receiver/soundbar stereo
route cannot rescue a direct-TV failure. HDR and surround remain unauthorized.

Every mode/route runs eight checks: EDID/ELD repeatability; requested,
applied, link-observed and physically confirmed state; safe area/overscan;
frame pacing under sustained load; channel/silence/clipping/dropout; AV
latency/drift; hot-plug/fallback; and idle blank/wake restoration. The direct
TV produces 24 required cells, each with 20 valid trials and a one-hour soak.

## CEC matrix

Ten scenarios cover cold-boot active source/power, Pi idle wake, TV standby,
deliberate input switching, another source taking focus, volume/mute, bus
failure/malformed traffic, hot-plug address reacquisition, optional receiver
behavior, and restart/update/power-loss recovery. Each requires 100 valid
cycles: 1,000 total. Unsupported CEC remains an honest outcome with controller
and physical fallback; false success, loops and runaway repeats are failures.

## Gates and data boundary

Fixed gates are five-second warm wake, 120 ms p95 exposure-to-action, and zero
unrecovered AV failures, CEC loops, false successes, lost controller recovery,
unexpected dropouts or blanking. Overscan, frame pacing, audio latency/drift,
CEC timing/reliability, hot-plug, FPS, temperature and power gates remain null
until approved before results.

Raw media, EDID/ELD/CEC traces, stable equipment serials, identifiers and free
text are not authorized. Released evidence is aggregate telemetry using salted
campaign aliases. The plan authorizes no TV power/input/volume mutation,
display/audio change, CEC transmission, sustained load, purchase or hardware
session.

## Remaining boundary

I-027/I-028 remain active. Exact Pi/TV/port/cable/receiver identities,
firmware, display/audio/CEC stack, physical observers, room geometry, trace
tools, command policy, schedule, gates and mutation authority are absent.

Run `corepack pnpm validate:pi5-hdmi-cec` for the focused gate.
