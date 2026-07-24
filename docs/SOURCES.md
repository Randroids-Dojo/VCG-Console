# Research source ledger

Last verified: 2026-07-21

Prefer primary project repositories, official documentation, standards, and official lifecycle notices. Product claims are candidates for local measurement, not substitutes for it.

## Comparable products and community projects

| Source | Why it matters | Caveat |
|---|---|---|
| [Nex: How does it track my movements?](https://support.nexplayground.com/en/articles/13139469-how-does-it-track-my-movements) | Nex describes a single wide RGB camera, local inference, 18 body nodes, and up to four players. | Does not disclose implementation, latency, model, hardware, or independent accuracy tests. |
| [Pose Battle](https://github.com/n02b3rt/Pose-Battle) | Community Pi 5, Hailo-10H, Camera Module 3 project targeting three-player pose matching and 30 FPS. | No declared repository license in the reviewed snapshot; not a product-quality benchmark. |
| [NeoAiSport](https://github.com/ThingEdu/NeoAiSport) | MIT-licensed ARM64 MediaPipe/OpenCV/Pygame motion games with candid notes about cramped-room foot tracking. | Architecture and accuracy must be re-tested on VCG hardware. |
| [Unchairted](https://github.com/Vitgracer/Unchairted) | Apache-licensed browser movement games that demonstrate local browser inference. | Browser demo scope differs from a hardened appliance. |
| [Neon Dash](https://github.com/Pandey-Shishir/neon-dash) | MIT-licensed example of personalized calibration for camera-controlled play. | Single project's mechanics and test population are not general validation. |
| [MMPose Just Dance project](https://github.com/open-mmlab/mmpose/tree/main/projects/just_dance) | Reference for pose-similarity game mechanics built on MMPose. | A project example, not a living-room runtime guarantee. |
| [UCL MotionInput](https://students.cs.ucl.ac.uk/software/MotionInput/v2/MotionInput.html) | Mature community direction for camera-based touchless input and games. | Current page states non-commercial use; suitability must be reviewed before reuse. |
| [GDMP Godot MediaPipe plugin](https://github.com/j20001970/GDMP) | MIT-licensed bridge supporting Godot on Linux ARM/x86, Windows, web, and other targets. | Plugin lifecycle and latency still need prototype validation. |

## Pose, tracking, and action recognition

| Source | Relevant evidence |
|---|---|
| [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) | Official tasks API documentation for 33 landmarks, world coordinates, multiple poses, segmentation, and live-stream operation. |
| [MediaPipe Pose Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) | Official `@mediapipe/tasks-vision` setup and video API guidance; documents that `detect()` and `detectForVideo()` run synchronously and can block the UI thread, motivating I-208. |
| [Official MediaPipe web samples](https://github.com/google-ai-edge/mediapipe-samples-web) | Apache-2.0 reference implementations for MediaPipe Tasks in browser applications. |
| [MediaPipe module-worker issue 5257](https://github.com/google-ai-edge/mediapipe/issues/5257) | Upstream record of the Tasks Vision classic-loader failure inside module workers and the patch history. The VCG test reproduces the failure when the module WASM loader is not selected. |
| [MMPose](https://github.com/open-mmlab/mmpose) | Apache-2.0 pose toolbox with model zoo and deployment ecosystem. |
| [rtmlib](https://github.com/Tau-J/rtmlib) | Apache-2.0 lightweight RTMPose/RTMO deployment across ONNX Runtime, TensorRT, OpenVINO, and ncnn. |
| [MMPose inference guide](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/inference.md) | Documents multi-frame pose tracking and OKS-based tracking options. |
| [ByteTrack](https://github.com/FoundationVision/ByteTrack) | Official multi-object tracking implementation worth comparing for stable player identity. |
| [MMAction2](https://github.com/open-mmlab/mmaction2) | Apache-2.0 action-recognition toolbox including skeleton-based recognition. |
| [libfreenect](https://github.com/OpenKinect/libfreenect) and [libfreenect2](https://github.com/OpenKinect/libfreenect2) | Open Kinect v1/v2 capture drivers; useful as sensor references but not complete modern body-tracking platforms. |
| [Azure Kinect lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/azure-kinect-sdk) and [archived SDK](https://github.com/microsoft/Azure-Kinect-Sensor-SDK) | Microsoft marks Azure Kinect SDK support ended in 2024 and the repository is archived. |

## Cameras and compute

| Source | Relevant evidence |
|---|---|
| [Raspberry Pi Camera Module 3](https://www.raspberrypi.com/products/camera-module-3/) | Wide model lists 120-degree diagonal field of view, autofocus, 1080p50, libcamera support, and production lifetime to at least January 2030. |
| [Raspberry Pi AI HAT+ documentation](https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html) | Official integration and 13/26/40 TOPS product-family documentation. |
| [AI HAT+ product brief](https://datasheets.raspberrypi.com/ai-hat-plus/raspberry-pi-ai-hat-plus-product-brief.pdf) | Official 13 TOPS and 26 TOPS pricing and hardware overview at publication. Re-quote at purchase. |
| [Raspberry Pi AI HAT documentation](https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html) | Current comparison of Hailo-8L 13 TOPS, Hailo-8 26 TOPS, and Hailo-10H 40 TOPS, including host versus on-board memory, camera integration, mounting, and cooling. |
| [Raspberry Pi vision AI guide](https://www.raspberrypi.com/documentation/computers/ai.html) | Current Pi OS requirements and official `rpicam-hello` 17-point Hailo YOLOv8 pose demo; warns that model, driver, and package versions must match. |
| [Hailo Apps](https://github.com/hailo-ai/hailo-apps) | Current MIT-licensed Hailo-8/8L/10H application repository with pose, tracking-related pipelines, custom HEF support, and Raspberry Pi input. It supersedes the older `hailo-rpi5-examples` repository. |
| [Hailo Pi 5 pose pipeline documentation](https://github.com/hailo-ai/hailo-rpi5-examples/blob/main/doc/basic-pipelines.md) | Documents YOLOv8s Pose for 13 TOPS Hailo-8L and YOLOv8m Pose for 26 TOPS Hailo-8. The containing repository now labels itself outdated, so use it as model evidence and start implementation from Hailo Apps. |
| [Current AI HAT+ 2 product page](https://www.raspberrypi.com/products/ai-hat-plus-2/) | Current page lists $200, 40 TOPS INT4, 8GB on-board RAM, and computer-vision performance comparable to AI HAT+ 26 TOPS. Recheck at purchase. |
| [April 2026 Raspberry Pi price update](https://www.raspberrypi.com/news/a-new-3gb-raspberry-pi-4-for-83-75-and-more-memory-driven-price-increases/) | Official further increases for Pi 5 with 4GB or more and AI HAT+ 2; reinforces right-sizing RAM and obtaining a dated complete-system quote. |
| [Raspberry Pi M.2 HAT+](https://www.raspberrypi.com/products/m2-hat-plus/) | Official PCIe 2.0 x1/NVMe attachment. Its use of the Pi PCIe connector conflicts with directly attaching an AI HAT+ at the same time. |
| [Raspberry Pi February 2026 price update](https://www.raspberrypi.com/news/more-memory-driven-price-rises/) and [April 2026 update](https://www.raspberrypi.com/news/a-new-3gb-raspberry-pi-4-for-83-75-and-more-memory-driven-price-increases/) | Evidence that memory-driven Pi prices changed during 2026; BOMs need dated quotes and right-sized RAM. |
| [Jetson Orin Nano Super announcement](https://developer.nvidia.com/blog/nvidia-jetson-orin-nano-developer-kit-gets-a-super-boost/) | NVIDIA states $249 and 67 sparse TOPS for the developer kit. End-to-end dense model results still need measurement. |
| [OAK-D Pro W](https://docs.luxonis.com/hardware/products/OAK-D%20Pro%20W) | Official specs for wide RGB, stereo depth, IR projector, and on-device vision features. |
| [Luxonis open hardware](https://github.com/luxonis/oak-hardware) | Open design resources for OAK hardware. Individual product completeness must be checked. |
| [Orbbec SDK v2](https://github.com/orbbec/OrbbecSDK_v2) | MIT-licensed current SDK; exact device/architecture support still requires validation. |
| [RealSense librealsense](https://github.com/realsenseai/librealsense) | Apache-2.0 SDK for RealSense depth cameras; exact device lifecycle and target support still require validation. |

### Hailo tested runtime tuple

No Hailo hardware or runtime has been tested by this repository yet, so there is no reproducible tuple to report without fabricating evidence. I-157 and I-158 may advance only when their proof bundle records every field below together; documentation and product-page versions are candidates, not tested values.

| Snapshot date | Pi OS release | Kernel | HailoRT | TAPPAS | Hailo Apps commit | HEF/model SHA-256 | Result |
|---|---|---|---|---|---|---|---|
| Not yet tested | Unqualified | Unqualified | Unqualified | Unqualified | Unqualified | Unqualified | Blocked on exact Pi/AI HAT hardware and image qualification |

## Console platform, browser, and game packaging

| Source | Relevant evidence |
|---|---|
| [Bazzite](https://github.com/ublue-os/bazzite) | Atomic Fedora gaming OS and rollback-oriented console reference. |
| [ChimeraOS](https://github.com/ChimeraOS/chimeraos) | Couch-oriented gaming OS reference. |
| [Batocera](https://github.com/batocera-linux/batocera.linux) | Retro-console distribution and controller-first UX reference. |
| [OpenGamepadUI](https://github.com/ShadowBlip/OpenGamepadUI) | Open controller-first launcher/UI reference. |
| [Gamescope](https://github.com/ValveSoftware/gamescope) | Embedded Wayland compositor used as a game-session and resolution-control candidate. |
| [Cage](https://github.com/cage-kiosk/cage) | Minimal Wayland kiosk compositor candidate. |
| [rpm-ostree administrator handbook](https://coreos.github.io/rpm-ostree/administrator-handbook/) | Atomic upgrades, deployments, and rollback model. |
| [Linux CEC framework](https://kernel.org/doc/html/next/driver-api/media/cec-core.html) | Kernel HDMI-CEC interface reference. Hardware/TV support remains device-specific. |
| [Raspberry Pi HDMI configuration](https://www.raspberrypi.com/documentation/computers/config_txt.html) | Official display configuration reference for Pi tests. |
| [W3C Gamepad API](https://www.w3.org/TR/gamepad/) | Browser gamepad interface and security/privacy considerations. |
| [W3C Permissions Policy](https://www.w3.org/TR/permissions-policy/) | Browser feature delegation and iframe permission boundary. |
| [W3C Service Workers](https://www.w3.org/groups/wg/service-workers/) | Standards work for offline requests and background web behavior; presence alone does not prove complete offline support. |
| [SDL3 Gamepad API](https://wiki.libsdl.org/SDL3/CategoryGamepad) | Official semantic gamepad API, built-in popular mappings, runtime capability queries, and hot-plug guidance for the accountless controller layer. |
| [SDL3 mapping API](https://wiki.libsdl.org/SDL3/SDL_AddGamepadMapping) and [GUID reference](https://wiki.libsdl.org/SDL3/SDL_GUID) | GUID-keyed custom mappings are supported, but a GUID is platform-specific mapping identity rather than a unique physical controller identity. |
| [SDL3 migration guidance](https://wiki.libsdl.org/SDL3/README-migration) | Face buttons are represented by position and labels can be queried; accept/cancel must not assume one printed-letter convention. |
| [Godot web export](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html) | WebAssembly, PWA, offline, threading, and cross-origin requirements for Godot web games. |
| [Godot Linux export](https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_linux.html) | Official native Linux x86-64 and ARM64 export guidance. |
| [Valve Steam Machine documentation](https://partner.steamgames.com/doc/steamhardware/steammachine) | Valve describes the 2026 x86-64 SteamOS living-room PC, discrete semi-custom AMD CPU/GPU, approximately six-times-Deck performance, fast suspend/resume, and current lack of dev-kit units. |
| [SteamOS custom-build deployment](https://partner.steamgames.com/doc/steamhardware/loadgames) | Official developer-mode, SSH pairing, rsync deployment, Linux/Proton start-command, and local testing workflow for Steam Deck and Steam Machine. |
| [Steam Machine desktop FAQ](https://help.steampowered.com/en/faqs/view/671A-4453-E8D2-323C) | Official support for KDE desktop, Flatpak on writable storage, non-Steam apps, simultaneous applications, and warning that direct system-image package changes may be wiped by updates. |
| [Steam Machine compatibility review](https://partner.steamgames.com/doc/steamhardware/compat) | Official controller, glyph, text input, 1080p performance, launcher, Proton, and seamless-operation criteria; useful as a VCG conformance baseline. |
| [SteamOS installation and repair](https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227) | Official recovery image, re-image, repair, and broader AMD PC installation guidance. |
| [Steam Input concepts](https://partner.steamgames.com/doc/features/steam_controller/concepts) | Official action-based and legacy controller mapping architecture. |
| [Steam Input supported devices](https://partner.steamgames.com/doc/features/steam_controller/device) | Valve documents major controller families plus DirectInput devices and says support is continually updated. This is optional Steam-side coverage, not the accountless base layer. |
| [Steam Offline Mode](https://help.steampowered.com/en/faqs/view/0E18-319B-E34B-B2C8) | Official procedure requires prior online login, remembered credentials, updated files, and initial game preparation; active-login and external-launcher games may still fail offline. |
| [Steam Hardware Windows resources](https://help.steampowered.com/en/faqs/view/6121-ECCD-D643-BAA8) | Valve publishes Steam Machine Windows drivers and states that Steam Machine is dual-boot capable, while the supported SteamOS dual-boot installer wizard is not ready and installing Windows currently wipes SteamOS. |
| [Bazzite installation guide](https://docs.bazzite.gg/General/Installation_Guide/install-guide/) | The Bazzite project's current x86 installation, Steam Gaming Mode, Windows dual-boot, separate-drive, Secure Boot, and recovery guidance for evaluating a lower-cost AMD mini-PC lane. This does not establish support on Valve's Steam Machine. |
| [Flatpak sandbox permissions](https://docs.flatpak.org/en/latest/sandbox-permissions.html) | Sandboxes begin without device access; input and raw USB grants exist in newer Flatpak, while webcam access may require broad device access. Exact V4L2 camera behavior still needs SteamOS testing. |

## Brand and typography

| Source | Relevant evidence |
|---|---|
| [OCR-A font project](https://sourceforge.net/projects/ocr-a-font/) and [1.0 files](https://sourceforge.net/projects/ocr-a-font/files/OCR-A/1.0/) | SourceForge describes an ANSI X3.17-1977-conformant font with sources and labels it Public Domain. The exact 24,316-byte `OCRA.ttf` is reproducibly staged under a pinned SHA-256 with source links and a notice. Glyph coverage, accessibility, and TV testing remain. |
| [CDC clinical growth charts](https://www.cdc.gov/growthcharts/cdc-charts.htm), [stature data](https://www.cdc.gov/growthcharts/cdc-data-files.htm), and [child activity overview](https://www.cdc.gov/physical-activity-basics/guidelines/children.html) | Context for the child persona matrix: stature varies across childhood and active play must remain age-appropriate. These sources are not used as a clinical screen or as proof that VCG movements are safe or qualified. |

## Retro and content rights

| Source | Relevant evidence |
|---|---|
| [Libretro core development](https://docs.libretro.com/development/cores/developing-cores/) | Libretro API and core architecture; the API is MIT-licensed while individual cores vary. |
| [Libretro licenses](https://docs.libretro.com/development/licenses/) | RetroArch GPLv3, per-core license variation, and current Lakka non-commercial notice. |
| [Libretro overview](https://docs.libretro.com/development/libretro-overview/) | Relationship among libretro, RetroArch, Lakka, Batocera, and RetroPie. |
| [RetroArch command-line interface](https://docs.libretro.com/guides/cli-intro/) | Direct `-L` core/content launch, explicit base and appended configuration, verbose logging, macOS executable location, and the contentless `--menu` caveat. |
| [RetroArch overrides and remaps](https://docs.libretro.com/guides/overrides/) | Core, content-directory, and game override/remap hierarchy plus configurable storage locations. |
| [Libretro 2048 core](https://docs.libretro.com/library/2048/) and [license file](https://github.com/libretro/libretro-2048/blob/master/COPYING) | Contentless startup, public-domain dedication, RetroPad controls, saves, states, and remapping. This supports a rights-simple smoke candidate, not a qualified package result. |
| [MAME about](https://www.mamedev.org/about.html) and [legal page](https://www.mamedev.org/legal.html) | MAME is open-source emulator software and does not include ROMs or other copyrighted game content. |
| [MAME ROM FAQ](https://wiki.mamedev.org/index.php?title=FAQ%3AROMs) | MAME's explicit position that ROM rights are separate and users must have permission. |
| [MAME ROM set documentation](https://docs.mamedev.org/usingmame/aboutromsets.html) | Versioned sets, parent/clone relationships, and why imports need precise metadata. |

## Privacy and children

| Source | Relevant evidence |
|---|---|
| [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) | Photos, videos, audio, and relevant biometric identifiers can be personal information; the exact obligations depend on product audience and data practice. The FAQ distinguishes on-device interaction when imagery is never transmitted. |
| [FTC six-step COPPA plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business) | Practical official framework for assessing covered online services. It is not a substitute for counsel on a released product. |

## Source-review rules

- Record exact hardware model, board revision, firmware, software commit/version, and quote date.
- Treat vendor TOPS, field of view, and player-count claims as hypotheses until the VCG benchmark reproduces the needed outcome.
- Check source and content licenses separately. Assets, fonts, audio, ROMs, firmware, models, and training data may not share the code license.
- Recheck lifecycle, pricing, repository license, and device support immediately before purchasing or distributing.
- Keep a dated local compatibility artifact for every claim that affects a decision.
