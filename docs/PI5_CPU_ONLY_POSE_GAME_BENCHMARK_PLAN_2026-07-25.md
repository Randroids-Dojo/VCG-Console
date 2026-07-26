# Raspberry Pi 5 CPU-only pose plus game benchmark plan

Date: 2026-07-25

Status: strict blocked I-014 plan; no target execution or result

Authority: D-012, D-041, D-106, D-108, D-110, I-014, Q-012, Q-257,
Q-258, Q-260, Q-261 and Q-264

## Outcome

The repository now contains a machine-checked plan for the Raspberry Pi 5
CPU-only pose-plus-game feasibility question:
[`pi5-cpu-only-pose-game-plan-v1.json`](../benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json).
The validator and adversarial tests are:

- `scripts/validate-pi5-cpu-only-pose-game-plan.mjs`; and
- `scripts/validate-pi5-cpu-only-pose-game-plan.test.mjs`.

This is a zero-result pre-registration. It does not claim access to a Pi,
selection of a CPU pose backend, a runnable target image, an executable native
Godot Motion path, a qualified camera, participant or service authority, or
any latency, FPS, memory, power, thermal, acoustic or playability result. It
does not reconsider D-041's selected Pi 5 plus 26 TOPS AI HAT+ lane.

## Exact comparison boundary

The first target remains the selected-memory reference, Raspberry Pi 5 8GB.
The received board revision, image, kernel, EEPROM, CPU policy, pose backend,
model, runtime, pre/post-processors, tracker, browser, launcher, native Motion
transport, storage, cooling, power, display, controller, camera and room are
all deliberately null.

"CPU-only" is an evidence requirement, not a label. A ready campaign must
record the physical accelerator state, loaded kernel drivers, device nodes,
runtime visibility, CPU affinity and priority policy, and processor telemetry.
GPU or NPU pose delegation is prohibited. The campaign cannot infer non-use
from an unchecked setting, low reported utilization or successful output.

The plan does not choose whether the AI HAT is physically absent, installed
but driver-denied, or installed with its runtime isolated from the tracker.
That choice changes airflow, power, PCIe and software state and must be frozen
before measurement.

## Two non-interchangeable lanes

| Lane | Input and clock | Valid claim |
| --- | --- | --- |
| Immutable replay capacity | Exact ordered decoded frame bytes, labels, decode contract and cadence; replay admission through Motion API on one monotonic host clock | CPU throughput, drops, resource use and admission-to-output timing only |
| Live concurrent pipeline | Exact camera, room, placement, participant script, workload interaction and run order; trustworthy exposure midpoint on a shared or measured clock | Complete exposure-to-pose/action behavior under workload |

Replay admission is not camera exposure. Separate live performances are not
identical inputs. Neither lane may rescue a failed cell in the other.

Each workload receives a five-minute warmup and one uninterrupted 3,600-second
measured run in each applicable lane. One run is first-soak evidence, not a
population reliability rate.

## Workload matrix

| Workload | Runtime | Motion role | Network |
| --- | --- | --- | --- |
| Obstacle sample | Local web | Primary Motion consumer | Offline required |
| Tiny Motion sample | Native Godot ARM64 | Primary Motion consumer | Offline required |
| VibeBots | Remote web | No title Motion delivery | Required |
| Mi Casa Es Su Casa | Remote web | No title Motion delivery | Required |
| Determined | Remote web | No title Motion delivery | Required |

The hosted titles measure system load and compatibility. Their load, response,
or heartbeat cannot establish title Motion integration or playability. The
native Godot row remains blocked until an ARM64 target build and trusted native
Motion transport actually execute on the Pi.

## Metrics and gates

Every attempt retains phase timing and all failures. Required distributions
cover replay and live latency, pipeline counts and drops, pose FPS, landmark
missing rate, per-action precision/recall/F1, game FPS and frame-time tails,
per-core CPU state, GPU state, RAM and swap, storage/network/process behavior,
wall power and energy, temperatures, clocks, throttling, fan speed, one-metre
acoustics, launch, crash, hang and recovery.

Existing product gates stay fixed:

- live camera exposure to recognized-action receipt is at most 120 ms p95;
- privileged false activations are zero;
- unrecovered failures and unexpected process exits are zero;
- the lower-cost enclosure is at most 35 dBA at one metre; and
- every required lane/workload cell passes without aggregate rescue.

Pose/action quality, pose/game FPS, frame-time, drops, RAM, swap, wall power,
temperature, throttling and recovery ceilings remain null. Selecting them
after results are visible is prohibited.

## Data and authority boundary

The checked-in plan authorizes no hardware access, image or storage mutation,
participant collection, hosted-service use, replay corpus, raw-frame
retention, audio recording, skeleton retention, credentials, tokens, typed or
generated text, request/response bodies, identifiers or free text. Release
evidence is aggregate system telemetry only.

The source bindings freeze the existing Pi image boundary, concurrent-workload
plan, Hailo/MediaPipe provider plan and Godot export evidence. Those artifacts
are prerequisites and source identities, not target results.

## Execution order

1. Resolve the exact CPU backend/model and physical accelerator state.
2. Receive and inventory the exact Pi, storage, cooling, power, display,
   controller and camera assembly without inferring purchase authority.
3. Build and qualify the exact image/runtime tuple, CPU tracker and native
   Godot ARM64 Motion path.
4. Freeze a rights-cleared replay corpus or keep replay blocked.
5. Freeze room, participant, camera-exposure clock, hosted interaction,
   monitoring, schedule, trial and every null numeric gate.
6. Validate the completed plan before any run, then execute every required
   cell and publish invalid attempts and failures.

## Remaining boundary

I-014 remains open. The plan proves only that the campaign shape is bounded
and machine checked. It provides no evidence that Raspberry Pi 5 CPU pose is
fast enough, slow enough, cheaper, more portable, compatible with the final
tracker, or a replacement for the selected accelerator lane.

Run the focused gate with:

```powershell
corepack pnpm validate:pi5-cpu-only
```
