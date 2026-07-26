# Hailo 13 TOPS and 26 TOPS accelerator comparison plan

Date: 2026-07-25

Status: strict plan checked in; execution blocked; zero results

Authority: D-041, D-110, I-158, Q-082, Q-084, and Q-085

## Outcome

The repository now contains a machine-checked plan for comparing Raspberry Pi
AI HAT+ 13 TOPS with `yolov8s_pose` against AI HAT+ 26 TOPS with
`yolov8m_pose`:
[`ai-hat-13-26-comparison-plan-v1.json`](../benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json).
The validator and adversarial tests are:

- `scripts/validate-hailo-accelerator-comparison-plan.mjs`; and
- `scripts/validate-hailo-accelerator-comparison-plan.test.mjs`.

This artifact pre-registers the comparison shape and its evidence boundaries.
It records no received accelerator, model artifact, runtime, participant,
input corpus, measurement, quote, purchase, selection or rejection. D-041's
26 TOPS reference remains selected. Replacing it requires complete evidence
and a superseding decision; this plan cannot select hardware automatically.

Raspberry Pi's current product page identifies AI HAT+ variants at 13 TOPS
with Hailo-8L and 26 TOPS with Hailo-8. Hailo's published Raspberry Pi example
documentation maps `yolov8s_pose` to Hailo-8L and `yolov8m_pose` to Hailo-8.
Those are source candidates, not proof of the exact received parts, installed
runtime, HEF, post-processor, compatibility or performance:

- <https://www.raspberrypi.com/products/ai-hat/>;
- <https://github.com/hailo-ai/hailo-rpi5-examples/blob/main/doc/basic-pipelines.md>.

## Three non-interchangeable lanes

The campaign keeps three questions separate:

1. **Paired immutable replay.** Both variants consume the exact same ordered
   decoded frame bytes and labels from one hash-bound corpus. This lane can
   compare pose/action outputs, throughput, drops, CPU and memory. Its clock
   starts at source-frame admission, so it cannot establish camera-exposure
   latency.
2. **Counterbalanced live full pipeline.** Both variants use the same exact
   camera, room, script and participant protocol with accelerator order
   counterbalanced. Separate human performances are never described as
   identical inputs. Only this lane may report exposure-to-pose and
   exposure-to-action timing after the timestamp authority and uncertainty are
   proven.
3. **Sustained concurrent game load.** Both variants replay the same versioned
   VCG workload trace and game settings. This lane measures complete-host
   capacity, game frame pacing, resources, wall power, temperatures and
   throttling, while keeping exposure timing separate.

The workloads include idle tracker/launcher, the obstacle motion sample, and
compatibility sessions for VibeBots, Mi Casa Es Su Casa and Determined. The
last three remain compatibility workloads under D-113; their presence does
not claim custom motion adaptation.

## Frozen measurements and gates

Every variant/lane/workload/participant/placement cell must publish the
applicable raw counts and distributions. Required measurements include:

- per-landmark missing rate and torso-normalized error;
- dodge-left, dodge-right, duck and jump precision, recall, F1 and false-event
  rate;
- independently labeled floor-contact/lift events only when authorized;
- replay admission-to-pose/action timing, kept distinct from live
  exposure-to-pose/action p50/p95/p99/worst and uncertainty;
- capture through delivery drops, pose FPS, game FPS and frame-time tails;
- CPU, GPU, RAM, swap and accelerator utilization;
- wall power, SoC/accelerator temperatures, clocks and throttle state;
- cold-start, steady-state and recovery behavior; and
- same-date delivered price and complete-system BOM delta.

Two existing product gates are fixed now: live exposure-to-action p95 must be
at most 120 ms under D-110, and privileged false activations must be zero.
Every blocking cell must pass and aggregate results cannot rescue a failed
cell. Detection, pose error, per-action quality, FPS, drops, temperatures,
throttling and minimum savings thresholds remain null until Q-259 is answered.
Choosing them after results are visible is prohibited.

Accuracy and throughput are a joint comparison because the vendor example
mapping changes both accelerator and pose model. A faster small model cannot
win solely on latency, and a larger model cannot win solely on accuracy while
failing the complete workload. Inference-only latency cannot qualify the
product.

## Source and data boundary

The canonical plan binds normalized SHA-256 values for the Pi image plan, the
Hailo-versus-MediaPipe provider plan and the edge-accuracy campaign. The
validator rejects source substitution, alternate host/model identities,
hidden result fields, weakened gates, unauthorized collection, noncanonical
JSON, duplicate keys, BOMs, malformed UTF-8 and oversized input.

Raw replay retention, live raw-frame retention, audio, participant identifiers
and free text are all unauthorized. Release evidence is skeleton-only. Q-258
must define whether and how an identical-input replay corpus can exist; Q-253
continues to govern sensitive labeling images. A data-plan decision does not
authorize participants, hardware access or purchase.

## Execution order

1. Obtain authorized access to both exact HAT variants without inferring
   purchase permission.
2. Record the received Pi, accelerator, storage, power, cooler, enclosure and
   camera identities.
3. Complete the source-pinned I-157 image/runtime work and hash both HEFs and
   compiled post-processors.
4. Freeze the paired replay corpus, independent labels, live room/camera/clock
   proof, counterbalanced schedule, trial counts and every null threshold.
5. Run both variants through the complete matrix without model, threshold,
   calibration or workload changes between arms.
6. Publish failures and invalid attempts, then resolve Q-084 only through a
   separate evidence review and, if warranted, a superseding hardware
   decision.

## Remaining boundary

I-158 is active, not closed. No AI HAT was accessed, installed, purchased or
borrowed; no image was built; no HEF or runtime was run; and no replay, live,
game, power, thermal, accuracy, latency, cost or recovery measurement exists.
The pre-registration therefore proves neither that 13 TOPS is cheaper enough
nor that 26 TOPS is faster, more accurate, compatible or qualified.
