# Owner questions: Raspberry Pi 5 CPU-only pose benchmark

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for every I-014 execution
and conclusion

These questions refine existing Q-012, Q-257, Q-258, Q-260, Q-261 and Q-264.
They intentionally use local identifiers so concurrent work can update the
central question register without an ID collision.

## PCPU-001: exact CPU backend and model

Which exact ARM64 CPU pose backend, model artifact, precision, input tensor,
resize/letterbox path, score calibration, post-processor and tracker should be
the I-014 candidate?

The Windows MediaPipe Lite desk result is not an ARM64 Pi result. A backend
chosen after viewing target performance would make the benchmark
outcome-dependent. Freeze every artifact digest and runtime option first.

## PCPU-002: physical accelerator state

Should the CPU-only row run with the AI HAT physically absent, installed but
its driver and device nodes denied, or installed with the runtime isolated
from the tracker?

These states can change airflow, power, PCIe, boot and software behavior. The
campaign must record one exact state and prove from process plus processor
telemetry that no GPU/NPU pose delegation occurred.

## PCPU-003: pre-result qualification gates

What minimum pose FPS, game FPS and per-action precision/recall, and what
maximum frame-time p95, capture/pose drop ratio, RAM, swap, wall power, SoC
temperature, throttle events and recovery time qualify each CPU-only cell?

D-110 fixes exposure-to-action p95 at 120 ms, D-108 fixes 35 dBA for the
lower-cost enclosure, and privileged false activations remain zero. The other
values must be frozen before measurements are visible; averages cannot rescue
a failed workload or lane.

## PCPU-004: replay, participant and hosted-service authority

Which rights-cleared decoded-input corpus may be retained for the immutable
replay lane, and which exact consent, room, temporary-frame, ground-truth,
account, hosted interaction, credential, cleanup and cost controls authorize
the live workload lane?

If those authorities are unavailable, retain the corresponding cells as
blocked. Passive load cannot qualify gameplay, and a replay clock cannot prove
camera-exposure latency.

## PCPU-005: native Godot ARM64 workload

Which trusted native Motion transport and exact ARM64 Godot build may serve as
the required native workload, and what user-visible interaction proves the
game is responding rather than merely loaded or alive?

The current export evidence establishes a Windows-produced ARM64 artifact
identity only. It does not establish target execution, native Motion delivery,
focus/recovery authority or playability on Raspberry Pi.
