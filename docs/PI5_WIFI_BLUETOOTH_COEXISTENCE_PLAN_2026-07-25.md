# Raspberry Pi 5 Wi-Fi and Bluetooth coexistence plan

Date: 2026-07-25

Status: strict blocked I-026 plan; no RF or product result

Authority: D-041, D-043, D-044, D-090, D-094, D-110, D-116, I-026,
Q-072 and Q-255

## Outcome

[`pi5-wifi-bluetooth-coexistence-plan-v1.json`](../benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json)
pre-registers the campaign. Its strict validator and adversarial tests are
`scripts/validate-pi5-radio-coexistence-plan.mjs` and the matching test file.

This is a zero-result plan. It records no received target, radio, controller,
camera, access point, room, network traffic, trial, RF measurement,
qualification, supported band or product result and authorizes no purchase,
network use, hosted session or radio fault.

## Required 32-cell matrix

Both the 2.4 GHz coexistence-risk band and a 5 GHz control band run in an open
diagnostic placement and the closed below-TV product placement. The open row
cannot qualify the closed enclosure. Eight scenarios produce 32 required
band/placement/scenario cells:

1. associated idle with no camera/controller;
2. sustained download plus 1080p60 camera;
3. idle network plus camera and one Bluetooth controller;
4. download plus camera and one controller;
5. bidirectional traffic plus camera and two controllers;
6. representative hosted workload plus camera and two controllers;
7. qualified update download, without install, plus camera/controller; and
8. authorized radio loss/reconnect under full bidirectional load.

Each cell has a five-minute warmup and 30-minute measurement. Input-latency
cells require 20 valid physical-stimulus trials; fault cells require 20 valid
reconnect cycles. Harness-invalid attempts remain visible and rerun, while
product failures cannot be replaced.

## Evidence boundaries

The campaign records Wi-Fi signal/noise/rate/retry/disconnect distributions,
packet loss/jitter/RTT/throughput, Bluetooth link/retransmission/reconnect and
fresh-epoch evidence, physical-stimulus-to-SDL/shell action latency and faults,
camera cadence/drops/USB behavior, exposure-to-action, pose/game performance,
system resources, power/thermal state and end-to-end recovery.

Fixed gates remain 120 ms p95 exposure-to-action, zero controller lifecycle,
stuck/fabricated, wrong-player/old-epoch and unrecovered-disconnect faults, and
genuine 1920x1080 at 60 FPS capture. Packet, throughput, controller latency,
reconnect, camera/pose drop, FPS, temperature and power thresholds remain null
until approved before results. 5 GHz cannot rescue 2.4 GHz, and throughput
cannot rescue input, camera or recovery failure.

Raw MAC/BSSID/SSID/controller identifiers, credentials, payload bodies,
USB/Bluetooth descriptors, frames and audio are prohibited. Evidence uses
salted per-campaign aliases and aggregate telemetry only.

## Remaining boundary

I-026 remains active, not closed. Exact target firmware/regulatory domain,
antenna/enclosure/USB geometry, controllers, AP/channel, network server/path,
RF survey, instruments, payload, service authority, schedule, stimulus,
recovery oracles, numeric gates and physical execution are absent.

Run `corepack pnpm validate:pi5-radio-coexistence` for the focused gate.
