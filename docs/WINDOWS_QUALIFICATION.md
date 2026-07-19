# Windows compatibility workstation

Last updated: 2026-07-19

Windows is the first secondary x86-64 compatibility lane. It is useful for architecture portability, UVC camera and controller drivers, Chrome behavior, and games that may eventually need a Windows fallback. It is not the premium reference environment: I-207 and I-209 still require native x86-64 Linux. WSL cannot qualify physical camera, controller, compositor, kiosk, suspend, or reserved Home/Back behavior.

## When to run this

Run the Windows pass after the MediaPipe worker changes are available on the remote branch and before building the Linux SDL3 host. This catches shared-stack portability defects before they become native-host noise.

## Machine requirements

- Windows 11 x86-64 with current system and GPU updates.
- At least 16 GB RAM and 20 GB free working space preferred.
- Chrome, Git, and Node.js 22 or newer.
- One real UVC camera; record exact vendor/product ID, firmware, cable, port, modes, and driver.
- One Xbox-style standards-conformant controller over every available transport: USB first, then Bluetooth or receiver.
- A second SSD is preferred for the later native Linux installation. A partition is acceptable only with verified backups and recovery media.

## Repository setup

Open PowerShell, clone the repository, check out the published implementation branch, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\bootstrap.ps1
.\scripts\windows\inventory.ps1
```

The bootstrap script changes only the repository dependency/build state. It does not install system packages, repartition storage, enable WSL, or modify Windows boot settings. If a prerequisite is absent, install it deliberately and rerun.

## First hands-on matrix

1. Start `corepack pnpm dev`, open the local URL in Chrome, and approve only camera access.
2. Verify the tracker reports `WORKER / ...`, not the main-thread fallback.
3. Stand at center, near/far bounds, and left/right edges. Verify the entire body remains visible without displaying raw camera video.
4. Exercise join, jump, duck, both dodges, menu swipes, hands-together select, crossed-arm Back, manual pause, brief tracking loss, two-second recovery, Resume, and Exit.
5. Connect, disconnect, and reconnect the controller. Verify selection, Back, pause, directions, and keyboard Escape recovery. This remains browser evidence, not SDL3 qualification.
6. Run the three hosted-game supervisor dry runs. Manually launch each top-level game only after reviewing its current manifest and network behavior.
7. Run the automated commands again after a reboot and after camera/controller reconnection.

## Evidence to return

- The JSON file written under `artifacts/windows-qualification/`.
- `pnpm test:e2e` output.
- A skeleton-only trace from the real camera; do not send raw room video by default.
- Exact camera and controller identifiers plus connection method.
- Any visible errors, fallback messages, missing body regions, false gestures, or controller mapping defects.
- Whether a separate SSD is available for native Linux. Do not repartition or install Linux until the exact target and recovery plan are reviewed.

## Pass boundary

Passing Windows means the shared TypeScript contracts, local assets, browser worker, camera capture, controller prototype, and catalog tooling reproduce on an x86-64 machine. It does not pass the 120 ms exposure-to-action gate, native SDL3 input, system-owned Home/Back, Linux packaging, appliance boot, suspend, or Raspberry Pi comparison.
