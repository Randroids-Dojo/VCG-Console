# Motion bridge wall-clock stall evidence

Status: Windows x64 child-process desk observation complete; target and native
qualification remain open

Evidence date: 2026-07-24

Scope: I-084

## Outcome

The existing Motion bridge already has deterministic virtual-time evidence for
one-frame acknowledgement backpressure, stalled-session expiry, healthy-client
isolation, 1,000 reconnects, and a five-minute 100 Hz producer model. This
tranche adds one bounded wall-clock, multi-process observation on the current
Windows x64 desk host.

Three real Node child processes exercise:

1. an initially healthy acknowledging client;
2. a client that accepts its first frame and then never acknowledges; and
3. a fresh healthy replacement after the first healthy process is forcibly
   terminated.

The result shows this run preserved healthy delivery, expired both failed
sessions, ended with one healthy session and no pending frame, and kept the
host's session state bounded. It does not qualify browser suspension, Chromium
renderer behavior, native transport, target Linux, the tracker process, or
product resource budgets.

## Reproducible artifacts

- `benchmarks/motion-bridge/windows-x64-child-stall-recovery-v1.json`
- `scripts/motion-bridge-wall-clock-client.mjs`
- `scripts/run-motion-bridge-wall-clock-evidence.mjs`
- `scripts/validate-motion-bridge-wall-clock-evidence.mjs`
- `scripts/validate-motion-bridge-wall-clock-evidence.test.mjs`

The artifact hash-binds the actual Motion bridge host implementation, child
fixture, runner, and validator. The validator accepts at most 128 KiB of
strict UTF-8 JSON, requires the frozen Windows x64 configuration, checks every
cross-field count and observational ceiling, and rejects target/product claims.

The wall-clock runner takes about nine seconds. The ordinary validator and its
mutation suite do not rerun the soak.

## Frozen rehearsal

| Parameter | Value |
|---|---:|
| Requested producer rate | 100 Hz |
| Bridge publication ceiling | 60 FPS |
| Timed publication phase | 8,000 ms |
| Session TTL | 1,000 ms |
| Maximum admitted sessions | 3 |
| Process telemetry interval | 100 ms |
| Non-acknowledging child termination | 2,000 ms |
| Initially healthy child termination | 3,500 ms |

The host and child processes communicate through real Node child-process IPC.
The producer constructs and validates one synthetic core17 frame per timer
callback. Child telemetry reports its own RSS, heap, cumulative user/system
CPU, received frames, and acknowledgements. The parent samples its RSS and
per-callback positive scheduler delay over the requested 10 ms interval.

The non-acknowledging process models an application-level client stall. The
forced process termination models disappearance of a client process. Neither
operation is represented as an operating-system suspend or a Chromium
renderer kill.

## Exact observation

The pinned run used Node v24.18.0 on Windows x64 and observed:

| Observation | Result |
|---|---:|
| Total elapsed time including final expiry collection | 9,136.305 ms |
| Requested producer callbacks | 100 Hz |
| Achieved producer callbacks | 514 / 8 s, 64.25 Hz |
| Frames published to sessions | 257 |
| Per-session publications rejected by rate/ACK gating | 382 |
| Accepted connections | 3 |
| Expired failed sessions | 2 |
| Peak active sessions | 2 |
| Active sessions before final shutdown | 1 |
| Pending frames before final shutdown | 0 |
| Invalid acknowledgements | 0 |
| Initial healthy frames offered | 114 |
| Stalled frames offered | 1 |
| Replacement healthy frames offered | 142 |
| Parent peak RSS | 98,942,976 bytes |
| Parent peak RSS growth | 11,235,328 bytes |
| Scheduler positive-delay p99 | 6.363 ms |
| Scheduler maximum positive delay | 13.151 ms |

The requested 100 Hz timer was not achieved. The Windows desk lane delivered
64.25 Hz, which still exceeded the bridge's 60 FPS ceiling and exercised
backpressure. This is an observed platform limitation, not a corrected or
rounded 100 Hz result.

Child peak RSS observations were:

| Child | Mode | Peak RSS | Last reported received / acknowledged |
|---|---|---:|---:|
| Initial healthy | Acknowledging, then forcibly terminated | 69,390,336 bytes | 111 / 111 |
| Stalled | Never acknowledges | 68,669,440 bytes | 1 / 0 |
| Replacement healthy | Acknowledging, graceful shutdown | 69,427,200 bytes | 142 / 142 |

The parent offered 114 frames to the initial child. Its last periodic telemetry
sample recorded 111 before forced termination; this is expected sampling lag
and is not relabeled as lost or acknowledged data.

## Assertions and validation

All 12 frozen harness assertions passed:

- the stalled session received only one frame;
- the stalled and killed sessions both expired;
- both healthy process generations received at least 100 frames;
- one healthy session remained with zero pending frames;
- peak host session state stayed at two;
- no invalid acknowledgement was accepted;
- achieved production exceeded the host ceiling and excess delivery was
  rate/ACK limited;
- no child IPC send error was observed;
- scheduler p99 and maximum delay stayed below generous harness-integrity
  ceilings;
- parent peak RSS stayed below 512 MiB; and
- each child peak RSS stayed below 256 MiB.

Those RSS and scheduler ceilings detect a broken or wedged rehearsal. They are
not product acceptance budgets.

Ten mutation tests reject fabricated target/native/suspend/tracker/product
qualification, participants or camera frames, extra stalled delivery, missing
expiry, weakened healthy paths, pending/extra session state, invalid
acknowledgements, scheduler/RSS substitution, failed or removed assertions,
configuration drift, stale provenance, and undeclared claims.

## Claim boundary

This evidence proves only the exact checked-in Windows desk observation. It
does not prove:

- a 100 Hz wall-clock producer on this host;
- a long-duration or statistically repeated soak;
- Chromium renderer, page, tab, or compositor behavior;
- OS suspend/resume, SIGSTOP, job-object freeze, or cgroup freezer behavior;
- tracker-process isolation or continued camera inference;
- Unix socket, shared-memory, or native-library backpressure;
- native process, service-manager, or cgroup ownership;
- target ARM64 or ordinary x86-64 Linux resource behavior;
- end-to-end capture, action, render, or gameplay latency;
- memory-leak absence, thermal stability, or resource budgets; or
- player, game, room, camera, accessibility, or recovery usability.

## Remaining qualification

Before I-084 can close:

1. resolve Q-241 and pre-register target durations, rates, process topologies,
   failure injection, resource budgets, and pass/fail gates;
2. run the exact native transport selected by I-074 on both target Linux
   families;
3. measure real producer, tracker, bridge, renderer, and compositor processes
   separately under full console load;
4. suspend, resume, kill, crash, and restart actual renderer and tracker
   processes using target OS/service-manager mechanisms;
5. prove one stalled or dead game cannot delay another game, the trusted shell,
   Home/Back/Pause, tracker recovery, or service cleanup;
6. collect wall-clock RSS/PSS, CPU, scheduler delay, queue depth, drops,
   reconnect/expiry time, and full latency distributions over the
   pre-registered duration;
7. inspect memory growth, handles/file descriptors, IPC buffers, logs, crash
   output, and post-fault cleanup; and
8. retain raw bounded evidence and exact image/kernel/browser/runtime
   provenance for independent review.
