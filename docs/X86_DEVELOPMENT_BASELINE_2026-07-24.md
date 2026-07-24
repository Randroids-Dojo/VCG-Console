# x86-64 development baseline — 2026-07-24

Status: I-013 proof complete at the development-host boundary; I-207 and I-211
remain separate and incomplete

Authority: D-007, D-036, D-110, D-119, D-126, I-013, I-074, I-207, I-211

## Outcome

The owned Ryzen/RTX workstation is now the explicit x86-64 development
baseline. The proof consists of:

1. a path-free CPU/GPU/RAM/OS and runtime capture;
2. the existing sanitized Windows qualification result;
3. all twelve checked-in Windows and WSL2 transport reports; and
4. a strict manifest that binds every evidence file by repository-relative
   path, byte length, SHA-256 digest, declared environment, payload shape, and
   process layout.

The machine is suitable for fast shared-software development and controlled
local transport comparisons. This conclusion does not promote Windows or WSL2
to the ordinary native-Linux premium reference and does not satisfy the
end-to-end workload gate that precedes a Raspberry Pi purchase.

The authoritative bundle is
`benchmarks/x86-development/windows-wsl2-owned-2026-07-24.json`.

## Sanitized exact host

| Item | Captured value |
|---|---|
| Host role | Owned x86-64 development workstation |
| Operating system | Microsoft Windows 11 Pro 10.0.26200, build 26200, 64-bit |
| CPU | AMD Ryzen 9 5900X, 12 physical cores / 24 logical processors |
| Physical memory | 68,625,489,920 bytes, approximately 63.91 GiB |
| GPU | NVIDIA GeForce RTX 3080 Ti, 12,288 MiB via `nvidia-smi`, driver 596.49 |
| Camera enumerated | Logitech HD Pro Webcam C920, USB `046d:082d`, status OK |
| Controllers enumerated | None |
| Windows project runtime | Node 24.18.0; Corepack-selected pnpm 10.30.3 |
| Rust | rustc 1.97.1; cargo 1.97.1 |
| WSL development lane | WSL 2.6.3.0; Ubuntu 26.04 LTS; x86_64; kernel 6.6.87.2; Node 22.22.1 |

The capture excludes the computer name, user name, device instance IDs, serial
numbers, filesystem paths, and network addresses. Camera vendor/product is
retained because it is non-unique qualification input; the complete device
instance path remains only in the ignored Windows inventory.

## Reproducible capture

From repository root on the same Windows machine, with the pinned Rust
toolchain available on `PATH`:

```powershell
.\scripts\windows\capture-development-baseline.ps1
```

To retain an ignored local capture:

```powershell
.\scripts\windows\capture-development-baseline.ps1 `
  -OutputPath artifacts/windows-qualification/development-baseline.json
```

The script has a closed output schema and deliberately collects no hostname,
username, full PnP instance ID, disk serial, filesystem path, IP address, or
MAC address. An explicit output must stay within the repository.

The tracked capture records `workingTreeClean: false`: another agent's
independently owned profile-calibration edits were present in the shared
worktree. That work is neither staged nor claimed here. The capture instead
binds source commit `33b662ac671aa43d81730cae305c5f72a8042329`, and the
bundle independently binds the reused evidence bytes.

## Benchmark bundle

The bundle includes every checked-in local-transport report available at
capture time:

| Environment | Reports | Coverage |
|---|---:|---|
| Windows x64 / Node 24.18.0 | 8 | 4,096-byte legacy same/child layouts; exact 2,010-, 2,919-, and 8,353-byte opaque/Motion pairs |
| Ubuntu WSL2 x64 / Node 22.22.1 | 4 | Exact 2,010- and 8,353-byte opaque/Motion pairs through the child-process layout |

The representative schema-valid Motion results are:

| Environment / frame | Direct p50 | Shared slot p50 | OS-local socket p50 | TCP p50 | WebSocket p50 |
|---|---:|---:|---:|---:|---:|
| Windows, core17 / 2,010 B | 36.6 µs | 54.3 µs | 85.3 µs | 114.2 µs | 140.2 µs |
| Windows, action-heavy / 2,919 B | 50.5 µs | 70.5 µs | 107.0 µs | 131.5 µs | 163.8 µs |
| Windows, MediaPipe33 + world / 8,353 B | 135.5 µs | 159.1 µs | 208.1 µs | 239.5 µs | 316.1 µs |
| WSL2, core17 / 2,010 B | 36.77 µs | 95.39 µs | 150.41 µs | 329.16 µs | 386.80 µs |
| WSL2, MediaPipe33 + world / 8,353 B | 146.90 µs | 202.58 µs | 294.33 µs | 531.43 µs | 563.03 µs |

These values are development observations. Direct and shared-slot results are
not cross-process equivalents; Windows local sockets are named pipes; WSL2
local sockets are Unix-domain sockets under a virtualized kernel. The
underlying reports retain p50/p95/p99/max, throughput, CPU, queue, buffer, and
RSS evidence.

## Validation

Run:

```powershell
node --test scripts/validate-x86-development-baseline.test.mjs
node scripts/validate-x86-development-baseline.mjs
pnpm validate:transport-benchmarks
```

The baseline validator:

- rejects extra capture fields that could hide identifiers;
- rejects Windows, UNC, and user-home paths in captured values;
- requires all privacy assertions to remain false;
- resolves evidence only below repository root;
- rejects duplicate, missing, resized, or hash-substituted evidence;
- checks each transport report's exact platform, architecture, Node version,
  environment kind, payload mode/size/shape, format version, and process
  layout; and
- requires both a Windows and an explicitly labeled WSL2 result.

The transport validator remains authoritative for the complete benchmark
report schema.

## Exact claim boundary

This establishes I-013's CPU/GPU/RAM/OS report plus benchmark result bundle for
the available x86-64 development host.

It does not establish:

- the ordinary native x86-64 Linux premium reference in I-207;
- the hands-on Windows camera/controller/reboot/soak rows in I-211;
- native compositor, SDL3, system-owned Home/Back/Pause, accountless
  boot-to-launcher, package recovery, or suspend behavior;
- real C920 modes, timestamps, pose accuracy, or the D-110 120 ms p95
  exposure-to-game-action gate;
- representative game FPS, RAM, power, thermals, acoustics, or TV behavior;
- Raspberry Pi, Hailo, SteamOS, or Steam Machine behavior; or
- a production Motion transport selection.

The next hardware step is not another desk benchmark. It is the separately
authorized native-Linux and hands-on physical-device work recorded in
`OWNER_QUESTIONS_X86_DEVELOPMENT_BASELINE_2026-07-24.md`.
