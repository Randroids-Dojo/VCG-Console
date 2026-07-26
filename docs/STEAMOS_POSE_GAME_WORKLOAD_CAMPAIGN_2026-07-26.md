# SteamOS pose and concurrent-game workload campaign

Date: 2026-07-26
Scope: I-168
Status: blocked strict zero-result pre-registration

## Claim boundary

This campaign defines the evidence required to run the standard one-player
pose and concurrent-game workload on either the exact delivered Steam Machine
or one explicitly selected AMD SteamOS development proxy. It records no
received target, proxy, package, camera, backend build, participant, workload
session, measurement, recovery attempt, result, or selection.

Existing reported specifications, Windows synthetic backend benchmarks,
ordinary-Linux and Raspberry Pi plans, SteamOS documentation, package and
camera plans, or another target's workload evidence cannot prove performance
on the selected hardware. A proxy result is development-only: it cannot
qualify the exact Steam Machine, rescue a Steam Machine failure, replace a
required reference tier, or be aggregated with exact-target evidence.

The plan does not authorize target or camera operation, service or account
mutation, participant collection, fault injection, suspend, update, recovery,
backend selection, qualification, publication, or a product-tier change.

## Target and proxy boundary

The two candidate rows are:

1. `exact-steam-machine`, whose result may describe only the exact delivered
   unit; and
2. `closest-supported-amd-steamos-proxy`, whose result is always explicitly
   development-only.

Before operation, select one row under a frozen rule and bind the exact
hardware inventory; SteamOS image, kernel, drivers, Gamescope, PipeWire,
firmware, CPU, GPU, RAM, VRAM, storage, cooling, and power configuration; plus
package, camera, controller, display, room, and instrument manifests. Only one
target runs a campaign matrix. Changing target requires a complete matrix
rerun, and results remain separate.

Similarity in CPU vendor, GPU architecture, core count, driver family, or
reported performance does not establish equivalence. A proxy protocol must
state every material difference and keep all Steam Machine claims false.

## Package and camera prerequisites

I-168 requires an exact qualified I-166 package result and an exact qualified
I-167 camera result for the selected target. The package must supply the
launcher, embedded browser, tracker, Motion API, process ownership, writable
roots, and accountless core execution path without read-only-root repair. The
camera result must supply genuine exposures, V4L2 or PipeWire permission,
microphone denial, privacy truth, controls, timestamps, common-clock mapping,
reconnect, suspend, update, and recovery behavior.

Safe denied or unavailable states, synthetic replay, backend-call timing,
advertised frame rate, or another platform's camera result cannot qualify
camera-to-action latency.

## Inference-backend comparison

The plan freezes four backend rows:

1. MediaPipe Tasks on CPU;
2. ONNX Runtime on CPU;
3. ncnn through Vulkan; and
4. one exact supported AMD accelerated provider, if such a route can be
   bound and built for the selected target.

Every row requires exact implementation, runtime, model, provider, dependency
closure, target build, and provider proof. Windows synthetic results are
context only. An assumed ROCm, DirectML, Vulkan, or model-provider path is not
support evidence. An unsupported, unavailable, failed, stopped, or retried row
remains visible and cannot be silently dropped. Selection occurs only after
the complete matrix and owner-approved rule are available.

## Standard workloads and performance matrix

Each backend runs the same four workload rows:

1. the local Obstacle motion sample, offline, as the primary Motion action
   consumer;
2. VibeBots as network-required compatibility load;
3. Mi Casa Es Su Casa as network-required compatibility load; and
4. Determined as network-required compatibility load.

The three compatibility titles receive no Motion frames. A versioned Motion
qualification client may measure the tracker while those titles create
representative load, but that cannot prove title Motion integration,
controller playability, service correctness, focus ownership, or visible
response. A page load, pixels, document readiness, or heartbeat cannot prove
playability.

Four backends by four workloads form 16 performance cells on the selected
target. Each cell has a 300-second warmup followed by at least 3,600 measured
seconds. One run per cell is the first sustained evidence unit, not a
reliability-rate estimate. Every backend must be attempted, every workload
must run for every backend, and the selected backend must pass every workload.
No other backend, workload, target, or aggregate may rescue failure.

The tracker uses Motion `0.4.0`, one player, and the fixed `body.core17`,
`actions.obstacle.v1`, and `actions.shell.v1` profiles. Every backend must use
the same pose/action definitions, ground truth, camera exposures, and clock
protocol. Reserved actions remain outside game authority.

## Recovery matrix

Every backend/workload cell separately exercises eight scenarios:

1. camera or permission loss followed by a proven fresh restoration;
2. tracker termination followed by a proven fresh restart;
3. game renderer hang or exit followed by contained launcher return;
4. network loss, truthful offline state, and deliberate restoration;
5. Home, Back, and Pause while responsive, fullscreen, captured, and hung;
6. launcher restart with descendant reaping and fresh readiness;
7. suspend/resume with camera stop, input-epoch reset, and fresh stream; and
8. package update, SteamOS update, offline restart, and recovery.

Sixteen backend/workload cells by eight scenarios form 128 recovery cells.
The valid-attempt count and recovery ceiling remain null pending owner review.
Scheduled fault attempts occur outside the measured performance soak so
expected injection cannot hide an ordinary stability failure. Failed,
invalid, stopped, retried, unavailable, and adverse attempts remain visible.
Later recovery cannot erase an earlier timeout, stale instance, leaked
permission, cross-epoch frame, orphaned process, swallowed reserved action, or
state-integrity failure.

## Measurement boundary

Every performance and recovery cell requires independent evidence for:

- exact target, package, camera, controller, room, backend, model, workload,
  build, configuration, and schedule identity;
- exposure counts, drops, duplicates, epochs, timestamp authority, domain,
  mapping, and uncertainty;
- exposure-to-pose, exposure-to-action, action-delivery, and controlled
  action-to-game-response latency distributions;
- per-action precision, recall, F1, misses, false events, and privileged false
  activations;
- admitted camera frames, pose inference and post-process throughput, action
  delivery, FPS, latency, and drops;
- game FPS, frame-time tails, long frames, stalls, and controlled response;
- CPU and GPU utilization, clocks, queue time, energy, and process
  attribution;
- RAM, swap, VRAM, allocations, residency, pressure, growth, and out-of-memory
  state;
- storage, network, IPC, device, filesystem, and hosted-service traffic;
- wall power and idle baseline;
- CPU, GPU, memory, storage, and enclosure thermals, clocks, throttle, and fan
  state;
- one-metre acoustics, ambient floor, spectrum, tonality, and uncertainty;
- process lifecycle, health, crash, hang, descendant, controller, focus,
  reserved-action, and input-epoch state; and
- fault containment, recovery time, fresh-instance proof, state integrity,
  recurrence, and every adverse attempt.

Vendor specifications, another target, a synthetic negative-input benchmark,
or aggregate statistics cannot substitute for a selected-target cell.

## Acceptance boundary

The fixed gates require a one-hour measured soak per backend/workload cell,
exposure-to-action p95 at or below 120 milliseconds, local interactivity
within 15 seconds, hosted interactivity within 30 seconds, and one-metre
acoustics at or below 35 dBA. They permit zero:

- privileged false activations;
- unexpected process exits during a performance soak;
- unrecovered failures;
- unexplained timestamp regressions, domain substitutions, or cross-epoch
  frames;
- retained raw frames, audio, skeletons, or undeclared egress;
- credential, account, participant, stable-identifier, path, or free-text
  disclosures; and
- valid selected-backend product failures.

The selected backend must pass every performance and recovery cell. Proxy
evidence cannot qualify the exact Steam Machine and no aggregate may rescue a
failure.

Twenty-one outcome-sensitive gates remain null: recovery repetitions;
per-action precision and recall; pose and game FPS; game frame time; capture
and pose drop rates; exposure timestamp uncertainty; capture-to-pose and
action-delivery latency; CPU and GPU utilization; resident RAM and VRAM; wall
power; sustained CPU and GPU temperature; throttle events; hosted-service
error rate; and recovery time. Freeze exact values, instruments, sampling,
uncertainty, and per-cell treatment before operation.

## Evidence and privacy

The result may contain only opaque target, backend, build, workload, cell,
attempt, and reason labels plus closed counts, timings, digests, metrics, and
redacted categories. It excludes raw room, player, camera, screen, audio,
video, or skeleton data; retained raw buffers or sample bytes; names, faces,
voices, exact ages, stable device IDs, serials, paths, query URLs, credentials,
tokens, cookies, account/profile/save/storage values, environment or argument
values, arbitrary driver/provider/service/console/crash messages, and free
text. Only declared package, hosted-service, and probe traffic may leave the
target.

## Relationship to adjacent work

An I-168 pass measures one selected target, package, camera, backend, and
workload protocol. It does not qualify general accountless lifecycle (I-170),
Steam Input coverage (I-169), full SteamOS branding (I-171), cross-platform
economics (I-172), the Pi reference comparison (I-173), SteamOS/Windows
parity (I-176), two-player behavior, another room, another camera, public
release, or the optional Steam Machine as the primary VCG appliance.

## Honest stopping point

This document, its machine-readable plan, validator, and adversarial tests
convert I-168 into an auditable blocked campaign. They do not receive or
operate hardware, install or select a backend, open a camera, use an account,
collect a participant, run a game, inject a fault, suspend or update a target,
measure performance, qualify a target, publish results, or change support.
