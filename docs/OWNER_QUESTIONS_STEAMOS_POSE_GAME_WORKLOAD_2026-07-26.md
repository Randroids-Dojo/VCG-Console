# Owner questions: SteamOS pose and concurrent-game workload

Date: 2026-07-26
Scope: I-168
Status: decisions required before execution

These questions preserve the strict zero-result campaign. Freeze each answer
in an exact reviewed protocol before the first affected action. An answer does
not itself authorize target or camera operation, account or service mutation,
participant collection, fault injection, suspend, update, recovery, backend
selection, qualification, publication, or a product-tier change.

## SUW-001 - Exact target or AMD SteamOS proxy

Will this campaign run on the exact delivered Steam Machine or one explicitly
development-only AMD SteamOS proxy? Bind hardware, firmware, SteamOS image,
kernel, drivers, Gamescope, PipeWire, CPU, GPU, RAM, VRAM, storage, power,
cooling, display, controller, room, and clean state. Define the selection rule,
the proxy's material differences, and every change that invalidates results.

## SUW-002 - Qualified I-166 package prerequisite

Which exact qualified I-166 package result supplies the launcher, browser,
tracker, Motion API, process ownership, writable roots, accountless core
execution, update, rollback, suspend, and recovery boundary? Which package
change requires rebuilding or repeating I-168 cells?

## SUW-003 - Qualified I-167 camera prerequisite

Which exact qualified I-167 camera result supplies the received camera,
V4L2/PipeWire route, genuine mode, permission confinement, microphone denial,
privacy indication, controls, exposure timestamps, common clock, reconnect,
suspend, update, and recovery behavior? Which camera, USB topology, permission,
or route change invalidates workload results?

## SUW-004 - Four backend implementations

Approve the exact source, build, runtime, model, provider, dependency closure,
input format, preprocessing, post-processing, action mapping, package boundary,
and target build for MediaPipe CPU, ONNX Runtime CPU, ncnn/Vulkan, and the AMD
accelerated candidate. How are model or implementation differences prevented
from turning a runtime comparison into a different-quality comparison?

## SUW-005 - Supported AMD provider and unavailable-result policy

Which exact vendor, driver, runtime, API, model operations, GPU architecture,
support statement, build, and provider proof establish the AMD route? If no
supported route exists, what closed `unsupported` or `unavailable`
disposition is recorded, and how is that row kept visible without silently
assuming ROCm, DirectML, Vulkan, or another provider works?

## SUW-006 - Tracker, actions, ground truth, and common clock

Freeze Motion `0.4.0`, the one-player body/action profiles, model and action
definitions, camera exposure authority, clock mapping, uncertainty,
ground-truth protocol, visible-response oracle, per-action labels, and
privileged-action negative windows. How are capture arrival, inference time,
synthetic replay, and backend-call-only timing prevented from substituting for
camera-to-action evidence?

## SUW-007 - Workload content, service, and interaction authority

Bind exact Obstacle, VibeBots, Mi Casa Es Su Casa, and Determined content plus
non-destructive interaction scripts. Which guest/test account, service calls,
mutations, generated or typed data, rate/cost limits, cleanup, network
captures, and failure probes are permitted? How is a realistic load produced
without calling reachability, pixels, readiness, or heartbeat playability?

## SUW-008 - Participant, room, safety, and collection

Which consented participant strata, placements, clothing, motion, negative
windows, room, lighting, floor, camera geometry, calibration, warmup, breaks,
stop conditions, accessibility adaptations, safety observer, and incident
rules apply? Who may authorize participant and room collection, and what
synthetic or replay work remains explicitly non-qualifying?

## SUW-009 - Performance schedule and independent review

Freeze backend/workload order or randomization, clean state, warmup, the
16 one-hour cells, cooldowns, sampling, background services, game settings,
render mode, audio, controller script, invalid-cycle rule, and independent
review. Is one run per cell only the first sustained evidence unit, and what
larger design would be required for a reliability-rate claim?

## SUW-010 - Quality, performance, and service gates

Freeze minimum per-action precision and recall, pose FPS, game FPS, maximum
game p95 frame time, capture and pose drop rates, exposure uncertainty,
capture-to-pose and action-delivery latency, CPU/GPU use, RAM, VRAM, hosted
service error rate, and any cross-backend selection scoring. Define units,
percentile method, uncertainty, per-cell pass logic, and the rule against
post-result threshold tuning.

## SUW-011 - Recovery attempts and protocol

How many valid attempts must every one of the 128 backend/workload/scenario
cells complete, and what p95 and worst recovery ceilings apply? Define camera
or permission loss, tracker termination, renderer hang/exit, network loss,
reserved actions, launcher restart, suspend/resume, package update, SteamOS
update, offline restart, fresh camera/tracker/game/input epochs, state
integrity, retries, oracle failure, and the rule that later recovery cannot
erase an earlier failure.

## SUW-012 - Power, thermal, acoustic, and resource instrumentation

Approve wall-power meter, rail coverage, idle baseline, CPU/GPU clocks and
utilization, process attribution, RAM/swap/VRAM allocation and residency,
storage/network counters, temperature sensors, fan state, throttle detection,
one-metre microphone or sound meter, ambient floor, spectrum/tonality method,
sampling, calibration, observer effect, and uncertainty. Freeze power,
temperature, throttle, memory, and acoustic gates.

## SUW-013 - Controller, focus, reserved actions, and game response

Which controller samples, mappings, focus/fullscreen/pointer-lock states,
Home/Back/Pause routes, input epochs, overlays, response probes, and hung-game
oracles apply? Define how shell ownership is proven without game
acknowledgement and how a controlled action-to-visible-response metric remains
separate from title Motion integration and general playability.

## SUW-014 - Proxy limitation and exact-target retest

Which evidence may a proxy produce, which exact Steam Machine claims must stay
false, and what language labels every proxy artifact and result? Confirm that
proxy and exact-target results are never aggregated, another target cannot
rescue failure, and the complete 16 performance plus 128 recovery cells must
be rerun on the exact delivered Steam Machine before exact-target
qualification.

## SUW-015 - Data rights, privacy, retention, and incidents

Approve the closed result schema, opaque labels, redaction, raw-media and
skeleton prohibition, temporary buffers, declared hosted/probe traffic,
custody, access, retention, verified deletion, adverse-evidence preservation,
and incident response. Who verifies that no raw media, skeleton, name, face,
voice, exact age, serial, stable identifier, credential, account/profile/save
value, path, query URL, environment/argument value, arbitrary message, or free
text enters repository or release evidence?

## SUW-016 - Operation, selection, qualification, and publication authority

Who may operate the target or proxy, connect the camera/controller, use
participants or services, inject faults, suspend, update, restart, and recover?
Who may declare a backend or target qualified, select a backend, publish
results, or change support? State explicitly that an I-168 pass does not close
I-169/I-170/I-171/I-172/I-173/I-176, qualify two players or another room,
replace required reference targets, or make Steam Machine the primary VCG
appliance.
