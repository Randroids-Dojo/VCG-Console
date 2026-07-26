# Jetson Orin Nano Super TensorRT candidate screen

Date: 2026-07-26

Status: official-source screen and no-purchase benchmark input; not a selected
software tuple, delivered quote, received device, execution result, or product
qualification.

## Candidate identity

NVIDIA's current FAQ identifies the Jetson Orin Nano Super Developer Kit as
part number `945-13766-0007-000`. NVIDIA describes “Super” as a software-enabled
performance mode on the same developer-kit hardware rather than a distinct
module/carrier architecture.

The official quick specifications state:

- Jetson Orin Nano 8GB module;
- 1,024-core Ampere GPU with 32 Tensor Cores;
- six-core Arm Cortex-A78AE CPU;
- 8GB 128-bit LPDDR5 with up to 102 GB/s memory bandwidth;
- SD-card slot plus external NVMe support;
- 7W through 25W configurable power;
- an advertised peak of 67 INT8 TOPS.

These are vendor capability statements. They do not establish model support,
dense end-to-end performance, usable memory headroom, camera-to-action latency,
game frame pacing, thermals, acoustics, wall power, recovery, or total-system
cost for VCG.

The current hardware guide records four 10 Gbps USB-A host ports, Gigabit
Ethernet, two MIPI CSI connectors, and DisplayPort as the only display output.
An HDMI-only target therefore needs an exact qualified DisplayPort-to-HDMI
adapter/cable in the complete-system BOM and display/audio campaign.

## Software baseline hazard

JetPack 6.2 documents Jetson Linux 36.4.3, CUDA 12.6.10, TensorRT 10.3.0,
cuDNN 9.3.0, VPI 3.2, and Super reference power modes for Orin Nano 8GB.

NVIDIA's current JetPack 7.2 quick-start separately warns that the 7.2.0 ISO
path may fail to configure Super Mode, leaving 25W and MAXN Super unavailable,
and recommends SDK Manager or Jetson Linux flashing tools until 7.2.1. It also
states that JetPack 7.2 no longer uses an SD-card image as the installation
medium: the ISO is written to USB and installs to microSD or NVMe.

Accordingly, “latest JetPack” is not an acceptable benchmark identity. The
campaign must freeze the exact installer/image bytes, Jetson Linux release,
flash configuration, kernel, firmware, CUDA, TensorRT, cuDNN, Python/C++
bindings, power mode, clocks, packages, and clean-rebuild procedure before any
result. JetPack 6.2 is an evidenced candidate tuple; it is not selected here.

TensorRT's current support guidance also says serialized engines are not
generally portable across platforms, versions, or GPU architectures unless
the applicable compatibility mechanisms and constraints are proven. The VCG
plan therefore requires the exact ONNX/source model, target-side build log,
builder configuration, precision/calibration inputs, plugins, engine digest,
pre/post-processing, and core-17 translation. A downloaded engine or matching
filename cannot substitute.

## Complete-system comparison boundary

I-019 compares the exact Jetson candidate to the same VCG product/workload
contract used for ordinary x86-64 Linux and Raspberry Pi 5/Hailo. The total
delivered cost must include, at minimum, the kit, qualified storage, display
adapter/cable, power supply, cooling/enclosure, camera and mount, controller,
network/camera cables, tax, and shipping. The board's advertised price or TOPS
cannot select it.

The campaign must separately publish:

- immutable replay capacity without exposure-timing claims;
- live exposure-to-action behavior under every representative workload;
- one-hour game/tracker frame pacing, memory, wall power, thermal and acoustic
  behavior;
- camera, tracker, renderer, network, storage-pressure and power recovery;
- offline clean rebuild and exact TensorRT engine reproduction;
- accountless/offline behavior, update/rollback, service and licensing
  dependencies;
- complete delivered cost and vendor-coupling/repair implications.

The tracked `vcg-jetson-orin-nano-super-tensorrt-plan/v1` artifact freezes FP16
and INT8 as distinct non-rescuing lanes across the same eight product
workloads. It requires 40 immutable-replay runs, 48 one-hour live soak runs,
1,920 workload/precision/fault recovery cycles, twenty clean offline rebuilds,
and forty reproducible engine builds. Failures, retries, invalid runs, and
interruptions remain visible. All exact hardware/software/model/protocol
bindings, open numeric gates, authority, and results remain null or false.

## Official sources

Accessed 2026-07-26:

- [Jetson Orin Nano Super developer-kit user guide](https://docs.nvidia.com/jetson/orin-nano-devkit/user-guide/latest/)
- [Jetson Orin Nano Super hardware layout](https://docs.nvidia.com/jetson/orin-nano-devkit/user-guide/latest/hardware_layout.html)
- [JetPack 6.2 release notes](https://docs.nvidia.com/jetson/jetpack/6.2/release-notes/index.html)
- [Current JetPack 7.2 quick-start and known Super Mode issue](https://docs.nvidia.com/jetson/orin-nano-devkit/user-guide/latest/quick_start.html)
- [TensorRT support matrix](https://docs.nvidia.com/deeplearning/tensorrt/latest/getting-started/support-matrix.html)
- [NVIDIA Jetson FAQ](https://developer.nvidia.com/embedded/faq)
- [NVIDIA Jetson Orin Nano Super announcement](https://developer.nvidia.com/blog/nvidia-jetson-orin-nano-developer-kit-gets-a-super-boost/)

No source was treated as proof of VCG performance or as purchase authority.
