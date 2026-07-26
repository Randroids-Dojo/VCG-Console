# RealSense D455 candidate screen

Date: 2026-07-26

Status: source-bound zero-result I-044 screen. No purchase, release-binary or
firmware download, target mutation, device operation, projector use,
participant collection, fault injection, selection, or publication authority
exists.

## Candidate identity

The frozen candidate is the RealSense Depth Camera D455, product code
`82635DSD455`, material code `999WCT`, USB VID `0x8086`, PID `0x0B5C`. The
current official product listing observed on 2026-07-26 showed a US list price
of $419 with a Buy link. That is neither a delivered quote nor proof of stock,
warranty, condition, target compatibility, or permission to buy.

Official product information describes a USB-C 3.1 Gen 1 peripheral with a
95 mm stereo baseline, global-shutter depth and RGB sensors, an IMU, 87 by 58
degree depth FOV, 90 by 65 degree RGB FOV, an ideal range of 0.6 m to 6 m,
depth output up to 1280 by 720 and 90 FPS, and RGB output up to 1280 by 800 at
30 FPS. Those are vendor specifications only. They do not establish the
received unit, usable room coverage, actual modes, timestamp quality, latency,
accuracy, USB bandwidth, power, thermal behavior, or material benefit to VCG.

The D455 includes an infrared projector and is covered by the vendor's D400
laser-safety and regulatory material. The blocking I-044 lane forces the
projector off. Active illumination remains conditional on I-045 and a reviewed
received-unit safety protocol; a Class 1 product classification is not
permission to operate, modify, open, or test the projector around participants.

## Current SDK and firmware screen

The current official SDK release observed on 2026-07-26 is RealSense SDK 2.0
beta `v2.58.3`, published 2026-07-19. `refs/tags/v2.58.3` resolves directly to
Git SHA-1 `dfd6aa91250f5c31521d72d627865417989bb4e7`. A shallow, detached clone of
that exact tag was used only for temporary read-only contract inspection. No
release executable or firmware image was downloaded or run.

The repository is Apache-2.0 licensed, but the exact built and shipped file set
still needs third-party notice, dynamic-link, package, and SBOM review. The
repository's branch policy now permits beta releases on `master`, so moving
branches and aliases are forbidden. The campaign pins the release tag and
commit.

The `v2.58.3` release explicitly lists D455 USB with firmware `5.17.3.10` or
later and SDK `v2.58.3` or later. The D400 firmware page lists
`5.17.3.10`, released June 2026 for D455 and related SKUs, and associates it
with SDK 2.58.1. The source tag's firmware fallback table points to
`D4XX_FW_Image-5.17.3.10.bin`. Its bytes and digest were not downloaded or
verified. I-044 freezes exactly `5.17.3.10`; it does not silently accept a
future firmware.

The GitHub release publishes Windows executables with GitHub-provided SHA-256
digests, but no Linux target binary asset. Those Windows assets are outside the
campaign. Linux qualification begins with the pinned source commit and a
target-native build; a generated GitHub source archive, moving package
repository, third-party binary, or another platform's executable cannot
substitute.

## Linux backend boundary

The current source provides two mutually exclusive Linux communication
backends:

- the default native V4L2/IIO backend, which the vendor generally recommends
  for production and whose Ubuntu instructions patch and insert modified
  kernel modules; and
- the optional RSUSB backend, selected with `FORCE_RSUSB_BACKEND=ON`, which
  implements UVC/HID in userspace over the standard USB driver and is
  documented as avoiding kernel patching.

The common blocking I-044 lane uses RSUSB. It is the only currently defensible
same-backend experiment across ordinary Linux, SteamOS, and Raspberry Pi 5,
and it avoids treating a patched Ubuntu kernel as evidence for immutable or
different-kernel targets. It still requires reviewed udev permissions,
unprivileged runtime proof, exact libusb and dependency manifests, USB
topology, target-native compilation, and real device results.

The native backend is a separately authorized diagnostic only on an exact
vendor-listed Ubuntu/kernel tuple. DKMS, kernel-module replacement, Secure
Boot or BIOS changes, package installation, and rollback must be reviewed
before use. A native-backend success cannot rescue RSUSB, SteamOS, Pi, or the
common comparison; an RSUSB success cannot establish native-backend support.

## Exact target-support boundary

The `v2.58.3` release lists Ubuntu 20.04, 22.04, and 24.04 LTS with enumerated
kernel families, Windows, named Jetson/JetPack releases, macOS as compilable
but not validated, and Android. It does not list SteamOS or Raspberry Pi 5.
The repository landing page has a generic Raspberry Pi platform entry, but
that is not an exact Pi 5 OS, kernel, architecture, USB, or D455 validation.

- Ordinary x86-64 Linux must bind a selected machine, supported or unsupported
  distribution status, exact image, kernel, libc, toolchain, libusb, udev rule,
  controller, cable, and power path.
- SteamOS x86-64 is not in the current release's supported-platform list. Its
  immutable image, update model, packages, kernel, and permissions require
  direct evidence.
- Raspberry Pi 5 ARM64 is not in the release's validated platform list. A
  generic Raspberry Pi entry, Jetson result, or source compilation cannot
  establish Pi OS, kernel, USB power, AI-HAT coexistence, or sustained D455
  operation.

Every target remains blocking and independent. One target, architecture,
backend, enumerated device, frame, or vendor statement cannot qualify another.

## Mutation, recovery, and result boundary

Firmware update, downgrade, self-calibration, advanced-mode configuration,
hardware modification, kernel patching, and deliberate firmware-write
interruption are excluded. The campaign records the received unit's actual
firmware, calibration, configuration, and revision before any operation.

The runtime recovery matrix covers non-destructive process, stream, USB,
permission, bandwidth, suspend, and reboot faults. Firmware update and recovery
remain explicitly unqualified until separately authorized exact bytes,
stable-power controls, sacrificial-hardware rules, operator stops, and a
reviewed recovery protocol exist.

D455 `82635DSD455` / `999WCT` is a no-purchase I-044 candidate only. It is not
the selected camera, a supported accessory, or a BOM item. Target integration
cannot establish material depth benefit; Q-018 still requires same-session
RGB/depth evidence, and I-045 separately governs IR interference and safety.

## Official sources

Accessed 2026-07-26:

- [RealSense D455 product page](https://www.realsenseai.com/products/real-sense-depth-camera-d455f/)
- [RealSense stereo depth camera listing and observed price](https://www.realsenseai.com/stereo-depth-cameras/)
- [D400 Series product datasheet](https://realsenseai.com/wp-content/uploads/2025/08/Intel-RealSense-D400-Series-Datasheet-August-2025.pdf)
- [RealSense SDK `v2.58.3` release](https://github.com/realsenseai/librealsense/releases/tag/v2.58.3)
- [RealSense SDK repository](https://github.com/realsenseai/librealsense)
- [Linux source installation instructions](https://github.com/realsenseai/librealsense/blob/master/doc/installation.md)
- [Linux package distribution instructions](https://github.com/realsenseai/librealsense/blob/master/doc/distribution_linux.md)
- [Jetson backend comparison](https://github.com/realsenseai/librealsense/blob/master/doc/installation_jetson.md)
- [D400 firmware releases](https://dev.realsenseai.com/docs/firmware-releases-d400/)
- [RealSense regulatory information](https://www.realsenseai.com/regulatory-information/)

No vendor source was treated as VCG performance evidence, exact target proof,
purchase authority, or permission to mutate or operate hardware.
