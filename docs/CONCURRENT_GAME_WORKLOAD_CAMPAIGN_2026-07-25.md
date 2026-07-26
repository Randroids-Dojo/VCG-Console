# Concurrent tracker and game workload campaign

Date: 2026-07-25

Status: strict plan checked in; execution blocked; zero results

Authority: D-032, D-033, D-106, D-108, D-110, D-113, I-159, and Q-082

## Outcome

The repository now contains a canonical pre-registration artifact for running
the complete one-player Raspberry Pi 5 plus 26 TOPS Hailo tracker alongside
each first workload:
[`pi5-hailo-concurrent-game-plan-v1.json`](../benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json).
Its validator and adversarial tests are:

- `scripts/validate-concurrent-game-workload-plan.mjs`; and
- `scripts/validate-concurrent-game-workload-plan.test.mjs`.

The plan records zero hardware, sessions, participants, measurements, fault
attempts or results. It does not grant hardware, purchase, service-account,
participant, data-retention or fault-injection authority.

## Exact workload boundary

Each workload requires a five-minute warmup followed by one uninterrupted
3,600-second measured soak. One run is the I-159 first evidence unit; it is
explicitly not a reliability-rate estimate. Passive idle cannot qualify.
Camera capture and the complete tracker remain continuous, representative
audio stays enabled, metrics sample at one-second intervals, and only one game
workload runs at a time.

The four fixed workload rows are:

| Workload | Runtime and network | Motion boundary |
|---|---|---|
| Obstacle motion sample | Current console-lab component; offline required | Primary `actions.obstacle.v1` consumer |
| VibeBots | Exact current `remote-web` catalog manifest; network required | No title Motion delivery |
| Mi Casa Es Su Casa | Exact current `remote-web` catalog manifest; network required | No title Motion delivery |
| Determined | Exact current `remote-web` catalog manifest; network required | No title Motion delivery |

D-113 remains authoritative. The three hosted compatibility games do not
receive Motion frames or custom body controls. A separately versioned Motion
qualification client may receive the one-player action stream while each
hosted game produces representative system load. That can measure tracker
behavior under concurrent load; it cannot prove motion integration, controller
playability, service correctness, compositor focus, visible response or title
fitness.

The obstacle sample is still a console-lab component rather than a signed
independent package. Its soak cannot prove the package pipeline.

## Source and live-session binding

Normalized SHA-256 bindings freeze the three current catalog manifests, the
obstacle component, action engine, hosted supervisor, Pi image plan and Hailo
accelerator plan. Any drift requires a deliberate plan refresh before
execution.

Catalog versions and entrypoints describe launch intent, not immutable hosted
content. Each executed hosted session must separately bind the observed
deployment/content evidence and the exact non-destructive interaction script.
The plan leaves those digests null pending Q-260. A page load, HTTP health
check or heartbeat cannot establish interactivity or playability.

## Complete measurement set

Every soak must retain enough bounded numeric evidence to publish:

- valid warmup/measured durations and all phase transitions;
- exposure timestamp authority, clock proof, uncertainty, capture counts and
  drops;
- exposure-to-pose and exposure-to-action p50/p95/p99/worst;
- per-action precision/recall/F1, misses, false events and privileged false
  activations under load;
- pose FPS, inference/post-process/action-delivery counts and drops;
- game FPS, frame-time tails, long frames, stalls and controlled input-response
  samples;
- CPU, GPU, RAM, swap, storage I/O, network and accelerator utilization;
- wall power, temperatures, clocks, throttle state and fan speed;
- calibrated one-metre acoustics with ambient floor;
- launcher/browser/tracker/game lifecycle, health, errors, crashes and hangs;
- launch feedback/interactivity, loading truth and sanitized service failures;
- every fault attempt, containment, recovery time, fresh-instance proof and
  state-integrity outcome; and
- exact hardware, image, runtime, model, configuration, schedule and artifact
  digests.

Existing product gates remain fixed: local interactivity within 15 seconds,
hosted interactivity within 30 seconds, exposure-to-action p95 at or below
120 ms, one-metre acoustics at or below 35 dBA, zero privileged false
activations, zero unrecovered failures and zero unexpected process exits during
the measured soak. Every workload and fault cell must pass; aggregates cannot
rescue a failed cell.

Pose/action quality, pose/game FPS, frame pacing, drop ratios, sustained
temperatures, wall power, service errors, fault repetition counts and recovery
ceilings remain null pending Q-261. They cannot be chosen after outcomes are
visible.

## Failure and recovery suite

Fault exercises occur outside the measured soak so expected injection is not
hidden inside normal stability counts. Each applicable workload must exercise:

1. camera loss and restoration;
2. tracker process termination and a proven fresh restart;
3. game renderer hang or exit;
4. network loss and restoration for each required-network hosted game;
5. reserved Home/Back in responsive, fullscreen/focus-captured and hung
   states; and
6. launcher restart and return without orphaning capture or child processes.

Body actions fail closed on camera/tracker loss. Recovery must not reuse stale
frames or an old tracker instance. Required-network games report Offline and
retry deliberately; restoration cannot hide lost hosted state or duplicate a
mutating request. Load, document readiness and heartbeat evidence remain
separate from playability, focus and recovery claims.

## Data boundary

The blocked plan prohibits retained raw frames, recorded audio, skeleton
traces, typed/generated text, credentials/tokens, request/response bodies,
cookies or storage values, URL query/fragment data, participant identifiers
and free text. Only user-content-free system telemetry is currently allowed;
release evidence is aggregate-only.

This means the campaign cannot run merely because the hardware becomes
available. Q-260 must define the hosted interaction/service boundary, and the
existing participant/privacy questions must authorize any labeled body data.
The exact evidence schema must use stable codes and bounded numeric fields
rather than copying console logs or network payloads.

## Remaining boundary

I-159 is active, not closed. No exact Pi/HAT/camera/runtime/model tuple or
trusted exposure clock exists; the selected target image is still a blocked
recipe. No hosted session is immutable, no activity script is approved, no
participant or fault injection is authorized, and the Motion qualification
client, compositor-level reserved controls and remaining numeric gates do not
exist. The plan therefore establishes no load, readiness, liveness,
playability, focus, latency, thermal, acoustic, recovery or platform
qualification result.
