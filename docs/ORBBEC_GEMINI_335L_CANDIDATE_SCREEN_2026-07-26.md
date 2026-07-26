# Orbbec Gemini 335L candidate screen

Date: 2026-07-26

Status: current official-source candidate and SDK desk inspection; no purchase,
received device, release binary, firmware image, target build, camera operation,
participant collection, physical result, or product selection.

Authority: D-002, D-003, D-043, D-044, D-090, D-091, D-104, D-105, D-110,
I-035, I-036, I-039, I-040, I-041, I-043, I-045, I-053, I-065, I-210,
Q-018, and Q-025.

## Exact candidate boundary

The first I-043 Orbbec candidate is the USB Orbbec Gemini 335L, model
`G40055-170`, VID `0x2BC5`, PID `0x0804`. The official product page and store
describe it as a current Gemini 330-series active/passive stereo camera. The
official US store showed US $359 and in stock on 2026-07-26. That observation
is not a destination-aware quote, purchase authority, future availability,
received-unit identity, or BOM selection.

Gemini 335, 336, 336L, 335Lg, 335Le, Gemini 2-series, Femto, Astra, and any
later Orbbec model are different candidates. A similar name, enclosure, SDK
enumeration string, or family firmware cannot substitute for `G40055-170`.

The official product page and Gemini 330 Series Datasheet V1.6 describe:

- USB 3.0 Type-C data and power;
- 95 mm stereo baseline and 850 nm active illumination;
- global-shutter depth and RGB sensors;
- depth up to 1280 x 800 at 30 FPS with a vendor-stated 90 by 65 degree field
  of view;
- RGB up to 1280 x 800 at 60 FPS with a vendor-stated 94 by 68 degree field
  of view;
- an average under 3 W and up to 6 W peak in the comparison table;
- on-camera MX6800 depth processing, depth/RGB alignment, hardware timestamps,
  IMU, and synchronization features; and
- IP65 enclosure, 133 g mass, and 1/4-20 plus M4 mounting points.

Those are vendor facts. They do not prove usable body/depth overlap, exposure
timestamp truth, latency, accuracy, floor contact, outdoor behavior, USB
stability, power, temperature, recovery, mount fit, or Motion compatibility in
the target room.

## Current SDK and firmware screen

The current official Orbbec SDK v2 release observed on 2026-07-26 is
`v2.9.3`, published 2026-07-16. The release tag object is Git SHA-1
`ca69b53b11eda5c65909da7e016d07fc7537d6a9`; a shallow clone of that tag
resolved to source commit Git SHA-1
`2f6561c28255d805b34aa00a690199ce40e96c81`. This source clone was used only
for temporary read-only contract inspection. It does not authorize a release
binary, model, firmware, target installation, or campaign execution.

The release page publishes these candidate Linux artifacts and SHA-256 values:

| Artifact | Official SHA-256 |
| --- | --- |
| `OrbbecSDK_v2.9.3_202607151523_2f6561c_linux_x86_64.tar.gz` | `8516081b2201f841b1aa444dd203975e06891d73a2694dd2b3d864254f89ff0d` |
| `OrbbecSDK_v2.9.3_202607151523_2f6561c_linux_arm64.tar.gz` | `ce2c476c283b932181b04daf44debadff9e4a743344bd69eecf34f8c18009ac1` |
| `OrbbecSDK_v2.9.3_amd64.deb` | `1c3c56bceafe6f0f562b09eb400750a911b5d02d529f776e76c29fc36371ae29` |
| `OrbbecSDK_v2.9.3_arm64.deb` | `3d238ab1bf76ba768ce859e08991f8cbb40c17ef0895aae6d85e938683aab693` |

Artifact names and published digests are candidate facts, not locally
downloaded or verified bytes. The I-043 blocking lane builds the pinned source
commit natively on every exact target. Vendor binaries are diagnostic
comparators only and cannot rescue a source-build or runtime failure.

The same release recommends Gemini 330-series firmware `1.8.10`; the current
device table lists `1.2.20` as the minimum supported Gemini 335L firmware.
Orbbec's firmware page associates `1.8.10` with SDK `2.8.7`, while SDK `2.9.3`
also recommends `1.8.10`. A received device must report and bind its actual
firmware. No online updater, firmware download, upgrade, downgrade, recovery
write, or deliberate update interruption is authorized by this screen.

## Exact target-support boundary

The current SDK release lists Linux x86-64 testing on Ubuntu 20.04, 22.04, and
24.04, and Linux ARM64 testing on named NVIDIA Jetson systems. The Gemini 330
datasheet separately lists Raspberry Pi 5 as an ARM reference system on Ubuntu
20.04/22.04. Neither statement proves the exact VCG target tuple.

- Ordinary native x86-64 Linux still needs its selected host, distribution,
  image, kernel, libc, compiler, USB controller, permissions, power, and
  package proof.
- SteamOS is not in the current vendor-tested distribution list. An x86-64
  tarball cannot establish Arch/SteamOS compatibility.
- Raspberry Pi 5 is named in the product datasheet, but not in the current SDK
  release's tested ARM64 list. A generic ARM64 artifact cannot establish Pi OS,
  Pi kernel, USB, power, or AI HAT coexistence.

Every target therefore requires a native clean build, unprivileged USB access,
exact installed-file manifest, sustained stream, timestamp, power, thermal,
fault-recovery, suspend/reboot, and offline-repeatability evidence. One target
or architecture cannot qualify another.

## Software, licensing, and dependency boundary

The source repository states that the SDK core is MIT-licensed, while its
extension binaries have a separate Orbbec-product-only license and prohibit
modification, decompilation, or reverse engineering. Bundled third-party
components carry their own licenses. The exact compiled and distributed file
set therefore needs a source/SBOM/license review before target build or release.

SDK `v2.9.3` also advertises an optional LingBot enhanced depth filter on
Jetson/Linux ARM64. It requires device activation and a separate 241 MB
`model.sm4` asset. That filter, model, activation, account/network behavior,
and any output it changes are excluded from the I-043 blocking lane. They may
enter only a separately reviewed exploratory plan; they cannot silently alter
the Pi, SteamOS, x86, or Orbbec comparison.

The target runtime uses only the USB PAL. Network and GMSL transports remain
disabled. Root may install a reviewed static udev rule during image
construction, but the runtime camera process must be unprivileged. Running the
viewer or product process with `sudo` is not a passing permissions result.

## Recovery and IR boundary

The official firmware guide warns that an interrupted update can leave a
Gemini 330-series device in Recovery mode and that recovery-mode remediation
requires an offline firmware update followed by another normal-mode update so
the ISP firmware matches. This is a recovery-design input, not proof that VCG
can safely restore a received unit.

The I-043 runtime campaign exercises non-destructive process, stream, USB,
permission, bandwidth, suspend, and reboot recovery. It does not deliberately
interrupt firmware writes. Any firmware mutation or recovery-mode drill needs
separate exact-image, power, sacrificial-hardware, operator, stop, and recovery
authority.

The 850 nm emitter remains off by default. The I-043 blocking integration lane
is passive/emitter-off. Active illumination remains gated by I-045's sunlight,
reflective-surface, other-IR-device, child-participant, temperature, independent
emitter-state, and safety protocol. A successful active-depth frame cannot
rescue passive, safety, target, or recovery failure.

## Candidate disposition

Gemini 335L `G40055-170` is a no-purchase I-043 candidate only. It is not the
shared camera, the selected depth camera, a supported target accessory, or a
release BOM item. Passing target integration would establish only the exact
device/SDK/firmware/USB/recovery tuple tested. Q-018 still requires same-session
RGB/depth benefit evidence, and I-045 separately gates IR interference and
safety.

## Official sources

Accessed 2026-07-26:

- [Gemini 335L product page](https://www.orbbec.com/products/stereo-vision-camera/gemini-335l/)
- [Gemini 335L official store page](https://store.orbbec.com/products/gemini-335l)
- [Gemini 330 Series Datasheet V1.6](https://www.orbbec.com/wp-content/uploads/2025/06/Gemini-330-series-Datasheet-V1.6.pdf)
- [Orbbec SDK v2 release `v2.9.3`](https://github.com/orbbec/OrbbecSDK_v2/releases/tag/v2.9.3)
- [Orbbec SDK v2 repository and platform/device table](https://github.com/orbbec/OrbbecSDK_v2)
- [Orbbec SDK v2 build guide](https://orbbec.github.io/OrbbecSDK_v2/docs/tutorial/building_orbbec_sdk.html)
- [Gemini 330-series firmware releases](https://doc.orbbec.com/documentation/Orbbec%20Gemini%20330%20Series%20Documentation/Firmware%20Release%20%28Gemini%20330%20Series%29)
- [Gemini 330-series firmware update and recovery guide](https://doc.orbbec.com/documentation/Orbbec%20Gemini%20330%20Series%20Documentation/Update%20Firmware%20%28Gemini%20330%20Series%29)

No vendor source was treated as VCG performance evidence or purchase authority.
