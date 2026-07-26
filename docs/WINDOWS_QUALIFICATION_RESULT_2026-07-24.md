# Windows x86-64 qualification result — 2026-07-24

This is an automated compatibility-workstation checkpoint for I-211. It establishes that the shared repository and native host reproduce on the exact Windows machine below. It is not the ordinary x86-64 Linux reference, a real-camera tracking pass, SDL3/controller qualification, or a 120 ms camera-to-action result.

The exact local device inventory, including the full camera instance path, is stored under ignored `artifacts/windows-qualification/`. Unique device paths are deliberately not copied into this tracked report.

## Sanitized host inventory

| Item | Observed |
|---|---|
| Operating system | Windows 11 Pro, x64, build 26200 |
| CPU | AMD Ryzen 9 5900X, 12 cores / 24 logical processors |
| Memory | 68,625,489,920 bytes reported, approximately 63.9 GiB |
| GPU | NVIDIA GeForce RTX 3080 Ti, 12,288 MiB reported by `nvidia-smi`, driver 596.49 |
| Physical storage | Samsung 990 EVO Plus 2 TB NVMe and WDC WDS200T2B0A 2 TB SATA, both online |
| Camera present | Logitech HD Pro Webcam C920, USB vendor/product `046d:082d`, status OK |
| Controllers detected | None |
| Chrome | 150.0.7871.182 |
| Node / pnpm | Node 24.18.0 / pnpm 10.30.3, matching the pinned package manager |
| Rust | rustc/cargo 1.97.1 |

Two physical disks are present, so a separate-disk Linux handoff may be feasible. No disk was repartitioned, formatted, mounted, or selected for Linux, and the observed boot/system flags need a deliberate recovery and data-preservation review before any such work.

The WMI `AdapterRAM` field truncates large GPU memory values near 4 GiB. The inventory script now records that field with an explicit caveat and, when available, records structured `nvidia-smi` memory and driver evidence. This report uses the latter.

## Automated run

The first non-interactive bootstrap attempt stopped safely during `pnpm install`: pnpm required explicit CI intent before replacing `node_modules` after the lockfile changed. The bootstrap now sets `CI=true` only around the frozen install and restores the caller's prior environment afterward. The rerun completed:

- frozen installation of all 82 current npm packages;
- pinned OCR-A, pose model, and MediaPipe WASM verification/staging;
- launcher catalog and all generated schemas;
- TypeScript/Svelte diagnostics;
- 215 workspace unit tests;
- production build and manifest validation;
- Rust formatting, Clippy with warnings denied, 143 library tests passing with five intentional subprocess helpers ignored, and 14 CLI tests passing;
- all 23 real-Chrome automated flows, including worker/fallback, synthetic camera privacy, controller simulation, motion degradation, bridge hostility/stalls, catalog/launch lifecycle, and responsive UI.

`vcg-host doctor` reports target `x86_64-windows`, loopback Chromium app-mode planning, process supervision, bounded watchdog/restart, signed installed catalog, crash-recoverable package generations, fixed-intent native launch/replay, RetroArch integrity planning, and bounded opaque controller lifecycle. It also correctly reports resource-fault integration, RetroArch compositor readiness, and SDL3 target-Linux input as pending.

The deterministic local Motion transport benchmark is a separate result in `MOTION_TRANSPORT_BENCHMARK.md`; it does not turn this automated repository pass into camera-to-action or target-Linux transport qualification.

## Not run

The following required I-211 evidence remains unrun:

- real C920 capture modes, exposure/timestamp behavior, sustained capture, edge coverage, skeleton-only trace, and worker-versus-fallback observation;
- a real controller over USB/Bluetooth/receiver, disconnect/reconnect, mapping, Back/Pause/directions, and physical recovery;
- real hosted-game top-level sessions and their current network/input behavior;
- reboot repeatability, camera/controller reconnection after reboot, suspend/resume, GPU-driver failure, and long soak;
- reviewed selection and recovery planning for a separate native-Linux disk;
- Linux SDL3, compositor-owned Home/Back/Pause, accountless boot-to-launcher, camera permissions, package/runtime behavior, and target performance.

No real room video or raw camera frame was captured, stored, or added to the repository during this automated pass. I-211 remains active.
