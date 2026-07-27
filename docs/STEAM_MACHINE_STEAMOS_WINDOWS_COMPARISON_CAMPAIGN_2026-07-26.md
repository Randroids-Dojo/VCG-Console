# Steam Machine SteamOS versus Windows comparison campaign

Status: blocked zero-result plan

Date: 2026-07-26

Scope: I-176

The canonical artifact is
[`steam-machine-steamos-windows-comparison-plan-v1.json`](../benchmarks/steam-machine-os-comparison/steam-machine-steamos-windows-comparison-plan-v1.json).
It pre-registers a paired comparison on one exact received optional Steam
Machine. It does not claim that the machine has arrived, that Valve's supported
dual-boot flow exists, that either operating-system lane is runnable, that a
SteamOS gap exists, or that Windows is an accepted fallback.

## Product boundary

SteamOS remains the primary environment for the optional Steam Machine target.
Windows remains a compatibility fallback candidate only. The comparison cannot
promote the Steam Machine into the required premium reference, replace ordinary
x86-64 Linux, rescue the Raspberry Pi lower-cost tier, or weaken the common
accountless and offline product contract.

The current Windows 11 development workstation result is useful portability
evidence, but it is not same-hardware evidence. Vendor specifications, the
preorder, a proxy SteamOS machine, software tests, synthetic traces, and results
from another target are also non-qualifying.

## Same-hardware pairing

Both lanes must run on one exact received machine with the same:

- chassis, mainboard, CPU, GPU, RAM, storage device and firmware;
- BIOS, microcode and frozen performance profile;
- camera, controller, display, audio, network and power path;
- ports, cables, orientation, placement and room geometry; and
- independent clocks, power, thermal, acoustic and recovery instruments.

The supported dual-boot partition, encryption, boot selection, backup and
recovery layout must be qualified first. Every compared attempt carries one
opaque pair ID and includes both OS lanes. OS order is counterbalanced. Cache,
data, clock, network, service, account, thermal and cooldown state is reset by
one frozen protocol. Cold, warm, cached and uncached observations remain
separate.

SteamOS and Windows necessarily use different kernels, drivers, compositors,
shells, package routes and update mechanisms. Those differences are the object
of the comparison and must be recorded explicitly. They do not authorize
asymmetric tuning. A hardware, firmware, peripheral, room, instrument, trace,
schedule or acceptance-gate change invalidates the comparison and requires the
complete matrix to run again.

## Operating-system lanes

The two blocking lanes are:

1. `steamos-primary`, with an exact SteamOS image, kernel, firmware, driver,
   Steam client, Gamescope, runtime, package, update channel, accountless entry
   and recovery manifest; and
2. `windows-conditional-fallback`, with an exact Windows edition/build,
   firmware, driver, shell, runtime, package, update channel, accountless entry
   and recovery manifest.

Neither manifest exists yet. Each lane must first qualify independently; a
Windows pass cannot erase a SteamOS failure, and a SteamOS pass cannot hide a
Windows limitation.

## Common workloads

Five exact workloads run on both lanes:

- the launcher shell;
- the local Obstacle motion sample;
- one selected signed local package;
- one rights-cleared supervised Libretro package; and
- one selected hosted-game compatibility route.

Each workload needs a frozen artifact, configuration, interaction and readiness
manifest. The local workloads remain accountless and offline-required. The
hosted workload may require the network only through its declared service
boundary and must fail truthfully when unavailable.

## Paired trace matrix

Each workload has one rights-cleared common trace bundle containing only the
inputs, ground truth and schedules relevant to that workload. Motion bundles
include capture/exposure, pose, action, controller and game timing. Other
bundles include controller, loading, audio/video, save, service, network and
fault schedules as applicable.

The exact trace payload and schedule is byte-identical across both OS lanes for
each pair:

- 2 OS lanes;
- 5 workload/trace pairs;
- 10 blocking lane/workload/trace cells; and
- 20 valid runs per cell.

That yields 200 paired trace runs. Failed, invalid, interrupted, retried,
pre-repair and worst-case runs remain visible. A trace, workload, lane, pair or
aggregate cannot rescue another.

Replay is comparative evidence only. It cannot qualify live camera transport,
permissions, exposure timestamps, physical controllers, room behavior, user
actions or integrated product behavior. Raw trace payloads do not enter the
plan, repository or result; only exact digests and closed metrics may do so.

## Live lifecycle matrix

The live campaign crosses both OS lanes, all five workloads, eighteen scenarios
and twenty valid cycles per cell. That creates 180 blocking cells and 3,600
required lifecycle cycles.

The scenarios cover:

1. clean package installation, read-back and supported automatic entry;
2. first VCG entry without Steam or Microsoft identity;
3. accountless online cold boot to controller-usable interaction;
4. accountless offline cold boot to controller-usable interaction;
5. network loss, local continuity, truthful hosted failure and restore;
6. branded loading, exact readiness, usable input and bounded cancel;
7. live UVC permissions, modes, timestamps, hot-plug and reconnect;
8. live pose-to-action quality and latency under concurrent game load;
9. controller discovery, zero setup, glyphs, reserved actions and reconnect;
10. normal exit, descendant cleanup, focus restore and a fresh input epoch;
11. game-crash detection, truthful recovery and a fresh retry;
12. game-hang/readiness loss, forced cleanup and system-owned exit;
13. camera or tracker loss, fresh stream epoch and bounded recovery;
14. suspend/resume across camera, audio/video, input, focus, save and network;
15. OS, driver, runtime and VCG updates, health failure and rollback;
16. uninstall/reinstall with explicit profile, save and cache disposition;
17. one-hour steady-state performance, power, thermal and acoustic behavior;
18. maintenance, diagnostics, repair, recovery and operator-time burden.

Every cell uses the same frozen start/end oracles, schedule and acceptance
rules. A pre-registered non-applicable result remains visible and cannot count
as a pass. Live camera, controller, display, audio, network, power and recovery
evidence is mandatory where the scenario requires it.

## Fixed product gates

Existing product gates remain unchanged:

- visible feedback: at most 250 ms;
- cold boot to controller-usable interaction: at most 60 seconds;
- warm resume to controller-usable interaction: at most 5 seconds;
- local launch to visible, focused, usable input: at most 15 seconds;
- hosted launch to interaction or a truthful observable phase: at most
  30 seconds; and
- camera exposure to action delivery at the game API boundary: at most
  120 ms p95.

A truthful hosted phase satisfies only the launch-timing gate, not playability.
Process start, first pixels, heartbeat, self-report, average or best case cannot
establish product success.

The campaign accepts zero:

- missing or failed required cells, runs or cycles;
- Steam or Microsoft account dependencies for local core operation;
- required network traffic in local offline operation or undeclared egress;
- identity, credential, token, cookie, profile/save-owner reassociation across
  OS lanes;
- silent profile, save, package, cache or progress loss or cross-lane access;
- unsupported system mutation, undeclared writes or read-only-root changes;
- keyboard, mouse, shell, hidden setup or operator intervention in a
  controller-only product path;
- missed, duplicated, stuck, misrouted, wrong-player or wrongly mapped input;
- system-reserved actions delivered to a game;
- escaped or unreaped descendants;
- unrecovered crash, hang, camera, tracker, input, update, rollback or suspend
  failures;
- false Ready, Interactive, Offline, Recovered, Updated, Rolled Back or success
  claims; or
- unreviewed lane-specific tuning, instrumentation, schedule or gate changes.

Quality, frame, resource, power, thermal, acoustic, recovery, maintenance,
material-gap, statistics, regression and review thresholds remain null. They
must be frozen before target operation, not chosen after results are visible.

## Windows fallback rule

Windows can be proposed as a fallback only after all of these conditions hold:

1. at least one pre-registered required SteamOS gate fails on the exact machine;
2. each proposed gap names the exact failing SteamOS cell, pair and metric;
3. the cause is attributed to the OS lane or explicitly remains unresolved;
4. Windows passes the same paired cells, traces, workloads, oracles and gates;
5. Windows closes every cited gap by the pre-registered materiality rule;
6. Windows introduces no new required-gate failure;
7. accountless, offline, controller, camera, data, recovery and timing contracts
   remain intact;
8. power, thermal, acoustic, maintenance and support deltas pass their frozen
   limits;
9. the fallback is limited to the exact qualified hardware, workload and
   feature scope; and
10. an independent review is complete and the owner separately approves the
    fallback.

A Windows pass without a SteamOS failure is not a reason to select Windows.
Aggregate, average, best-case, proxy or different-hardware evidence cannot close
a gap. The fallback expires when any bound OS, driver, runtime, package,
hardware or gate changes. If SteamOS later closes the cited gap and regression
review passes, the route returns to SteamOS.

## Evidence and authority

Accepted repository evidence is path-free and closed-vocabulary: opaque labels,
counts, timings, digests, metrics, resource/cost values and redacted categories.
It excludes raw camera, screen, audio/video, skeleton, controller, network,
storage, save or memory bytes; names, faces, voices, profile presentation and
stable identifiers; account and credential material; paths, host details,
commands and arguments; and free-form platform, driver, game or operator logs.

This plan grants no authority to receive or operate the target, change firmware
or storage, install either OS, retrieve/build/sign/install artifacts, use
accounts, operate peripherals, mutate the network, inject faults, change data,
capture raw media, choose gates, accept Windows, publish results or change a
product tier.

Eighteen blockers and the unresolved owner choices are recorded in
[`OWNER_QUESTIONS_STEAM_MACHINE_OS_COMPARISON_2026-07-26.md`](OWNER_QUESTIONS_STEAM_MACHINE_OS_COMPARISON_2026-07-26.md).

## Verification

```sh
pnpm validate:steam-machine-os-comparison
```

The validator checks normalized source provenance, the closed semantic contract,
same-hardware pairing, exact lanes/workloads/traces/scenarios, matrix arithmetic,
fixed and open gates, fallback preconditions, authority, data policy, blockers,
canonical JSON, strict UTF-8 and parser limits.
