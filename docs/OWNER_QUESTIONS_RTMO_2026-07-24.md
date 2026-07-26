# Owner questions: RTMO x86

Date: 2026-07-24

The CPU adapter and synthetic benchmark do not require answers. These
questions gate broader host changes and any real-player or GPU qualification.
No answer is assumed.

## Q-213: CUDA and cuDNN installation authority

Should this development host receive the NVIDIA CUDA 13 and compatible cuDNN
runtime needed to qualify RTMO-s through ONNX Runtime's CUDA provider?

Current evidence:

- the RTX 3080 Ti driver is present;
- `onnxruntime-gpu` exposed `CUDAExecutionProvider`;
- provider loading failed on missing `cublasLt64_13.dll` and related runtime
  dependencies; and
- ONNX Runtime silently fell back to CPU, so no GPU number was retained.

Safe default:

- do not install the large system toolchain;
- keep the reproducible project environment on CPU `onnxruntime`;
- fail if the benchmark provider differs from the requested exact CPU
  provider; and
- revisit only if the real-player CPU comparison keeps RTMO viable or a target
  architecture actually requires this CUDA path.

If approved, please identify whether system-wide NVIDIA components are
acceptable on this shared workstation and whether a specific maintained
CUDA/cuDNN version policy already exists.

## Q-214: paired real-player backend comparison

May the RTMO-versus-MediaPipe comparison share the consented room session
already requested by Q-212?

The useful paired run requires:

- the exact same source frames or independently synchronized exposures for
  both pinned backends;
- consented adult-first execution, with child participation still separately
  gated by Q-212;
- one-player trials before two-player crossing and occlusion trials;
- labeled landmarks, presence, identity, and action ground truth;
- skeleton/event/ground-truth outputs without retained raw video by default;
- an approved ephemeral-frame procedure if both backends must process the
  same live frames; and
- immediate stop and deletion procedures.

Safe default:

- do not capture a participant yet;
- coordinate with Q-212 instead of scheduling a duplicate session;
- rehearse the paired pipeline on deterministic synthetic inputs only; and
- retain no raw frames unless you approve an exact minimized retention,
  access, encryption, review, and deletion plan.
