# Raspberry Pi 5 and AI HAT feasibility brief

Research snapshot: 2026-07-19

Selected role: lower-cost reference lane beside the preordered Steam Machine. The baseline compute configuration is Raspberry Pi 5 with 8GB RAM and the 26 TOPS AI HAT+. A 4GB board will be evaluated later as a possible minimum tier. The camera interface is a shared wide-angle UVC USB RGB camera that must sustain 1920x1080 at 60 FPS, with exact model still subject to qualification. Inference may use downscaled frames. Primary writable storage is a qualified 256GB high-endurance microSD card with atomic A/B system slots, independently versioned game packages, and separate writable user data; exact card model and backup design remain open. Failed normal OS and game updates roll back independently. Disaster recovery uses a verified downloadable image reflashed from another computer. Exact cooling, enclosure, and power components remain open until the owned-x86 workload and purchase-time quote are complete.

## Bottom line

Raspberry Pi 5 plus AI HAT is the selected lower-cost reference lane, subject to the same evidence gates as the Steam Machine. The baseline accelerator is AI HAT+ 26 TOPS. It can run the larger official YOLOv8m Pose model, while the 13 TOPS variant uses YOLOv8s Pose. The 40 TOPS AI HAT+ 2 is currently poor value for a pose-focused console because its main differentiator is local generative AI, and Raspberry Pi describes its ordinary computer-vision performance as comparable to the 26 TOPS AI HAT+.

The gating question is whole-system performance. A pose demo does not prove that camera capture, tracking, gesture recognition, Chromium/WebGL, audio, the launcher, and a real VibeCoded game will remain responsive together. The first build uses 8GB to establish this full workload; a later controlled 4GB comparison determines whether a cheaper minimum is responsible.

## Confirmed capabilities

- AI HAT+ 13 TOPS uses Hailo-8L with INT8 inference.
- AI HAT+ 26 TOPS uses Hailo-8 with INT8 inference and supports larger networks, higher throughput, and parallel models.
- AI HAT+ 2 uses Hailo-10H with 40 TOPS INT4 and 8GB of dedicated memory for local LLM/VLM workloads.
- Raspberry Pi OS detects official AI HATs and integrates them with libcamera, `rpicam-apps`, and Picamera2.
- Raspberry Pi documents an official `rpicam-hello` YOLOv8 pose demo producing 17 human keypoints.
- Hailo's example mapping uses YOLOv8s Pose on Hailo-8L and YOLOv8m Pose on Hailo-8.
- Current MIT-licensed Hailo Apps supports Hailo-8, Hailo-8L, and Hailo-10H and accepts Pi camera, USB camera, video-file, and custom HEF inputs.
- Camera Module 3 Wide offers autofocus and a 120-degree diagonal field of view, with an official $35 reference price in Raspberry Pi's camera comparison.
- AI HAT uses Pi 5's PCIe connector. An ordinary Pi M.2 HAT+ for NVMe cannot attach directly at the same time.
- Raspberry Pi and Hailo recommend active cooling. Hailo's Pi guide uses the official 27W USB-C supply and recommends an 8GB Pi 5, but that recommendation predates the complete VCG workload and current price pressure.

## Option comparison

| Accelerator | Official pose path | Advantages | Disadvantages | VCG position |
|---|---|---|---|---|
| AI HAT+ 13 TOPS, Hailo-8L | YOLOv8s Pose, 17 points | Lowest accelerator price, lower model footprint, same integration path | Smaller model, less headroom for accuracy and simultaneous models | Budget benchmark, not assumed final choice |
| AI HAT+ 26 TOPS, Hailo-8 | YOLOv8m Pose, 17 points | Larger pose model, higher throughput, parallel-model headroom, Hailo-8L models remain usable | Higher price, same host RAM and PCIe/storage constraints | Primary Pi benchmark candidate |
| AI HAT+ 2 40 TOPS, Hailo-10H | Current Hailo Apps pose support | 8GB accelerator RAM, local LLM/VLM capability, newer lifecycle | Current $200 page price, different runtime generation, extra heat, conventional vision comparable to 26 TOPS according to Raspberry Pi | Do not buy for pose alone; reconsider for committed local voice/VLM features |

## Indicative cost floor

These are not purchase quotes. Pi prices changed repeatedly in 2026, and reseller availability varies. The numbers below use official announced/reference pricing and omit tax, shipping, controller, mount, enclosure, power, cooling, storage, and spares.

| Core configuration | Indicative component basis | Incomplete subtotal |
|---|---|---:|
| Pi 5 2GB + 13 TOPS + wide camera | Pi about $65 after official increases, HAT announced at $70, camera reference $35 | About $170 |
| Pi 5 2GB + 26 TOPS + wide camera | Pi about $65, HAT announced at $110, camera reference $35 | About $210 |
| Pi 5 4GB + 26 TOPS + wide camera | Pi price inferred around $110 from cumulative official increases, HAT $110, camera $35 | About $255 |
| Pi 5 8GB + 26 TOPS + wide camera | Pi price inferred around $175 from cumulative official increases, HAT $110, camera $35 | About $320 |
| Pi 5 4GB + AI HAT+ 2 + wide camera | Pi inferred around $110, current HAT+ 2 page $200, camera $35 | About $345 |

The complete 4GB or 8GB Pi build can therefore approach or exceed a capable mini PC or Jetson before storage, case, power, cooling, and camera mounting are added. Pi still may win on size, camera integration, maker documentation, recovery, and power, but it no longer wins automatically on purchase price.

## Technical risks

### Seventeen landmarks versus the Motion API

The official Hailo YOLO pose path provides the COCO-style 17-point skeleton: nose, eyes, ears, shoulders, elbows, wrists, hips, knees, and ankles. That is likely sufficient to prototype dodge, duck, and jump, but it lacks MediaPipe's extra hand, foot, heel, and toe landmarks and does not automatically provide the same world-coordinate semantics. Floor contact, foot direction, subtle stance, and edge-of-frame jumps need direct comparison.

The Motion API should mark unsupported landmarks absent rather than inventing values. Shared gestures must declare their minimum landmark set and confidence requirements.

### Host workload

The NPU accelerates model inference, not the entire console. Pi CPU, GPU, and RAM still handle:

- camera capture and format conversion;
- GStreamer/libcamera pipeline and post-processing;
- temporal smoothing, player identity, calibration, and gestures;
- IPC and browser bridge;
- Chromium, WebGL, JavaScript, audio, network, and game services;
- launcher, loading shell, watchdog, logs, and updates.

The first compatibility set is intentionally demanding: VibeBots exercises identity and hosted services, Mi Casa Es Su Casa adds Three.js and persistence, and Determined adds LLM/API and text-oriented behavior. Each must run alongside tracking for a sustained session.

### Software lifecycle

The older `hailo-rpi5-examples` repository is MIT-licensed but now explicitly labels itself outdated and points to Hailo Apps. Current Hailo Apps is also MIT-licensed, but the complete stack includes separately installed drivers, HailoRT, TAPPAS, Python bindings, models, and compiled post-processing libraries. Hailo-8/8L and Hailo-10H use different runtime-version families. Raspberry Pi documentation warns that compiled models, drivers, and packages must match.

The appliance image must pin every layer, retain an offline recovery cache, and prove update rollback. “Install latest” is not a reproducible console release process.

### Storage and enclosure

AI HAT occupies the only exposed Pi 5 PCIe connector. The selected baseline uses a qualified high-endurance microSD card for the system and all writable content, avoiding an external bridge, cable, enclosure volume, and power load. That simplicity must earn acceptance through measured write volume, wear controls, full-disk handling, sudden-power-loss and interrupted-update tests, system-image recovery artifacts, and blank-card recovery. These recovery artifacts explicitly exclude console user saves, profiles, export, or migration; D-089's device-local no-recovery policy remains intact. USB 3 SSD is the first fallback if any durability gate fails.

AI HAT fits above the official Active Cooler. AI HAT+ 2 adds its own recommended heatsink. The final enclosure must be tested for sustained temperature, throttling, acoustics, camera cable routing, Bluetooth/Wi-Fi reception, and service access.

## Purchase gate

The project owner selected an x86-first path. Do not order a full Pi console build until the end-to-end workload and benchmark harness run on available x86-64 hardware, an existing Pi becomes available without purchase, or the following minimum comparison is approved:

1. Quote complete 4GB + 26 TOPS and 8GB + 26 TOPS builds from approved resellers on the same day.
2. Quote one comparable x86 mini PC and Jetson option with equivalent camera, storage, power, and enclosure needs.
3. Confirm return policy and exact HAT, Pi, and camera revisions.
4. Confirm the current Pi OS/Hailo stack supports all selected parts.
5. Run or obtain access to a 13/26 TOPS benchmark before buying both boards.

If purchasing one Pi accelerator solely to start the VCG benchmark, choose AI HAT+ 26 TOPS. It has the more capable official pose model and avoids paying for AI HAT+ 2's unrelated GenAI feature set. Select 4GB versus 8GB only after measuring or accepting the explicit risk that 4GB may constrain Chromium plus tracking.

## Required benchmark result

For each Pi/RAM/HAT combination, record:

- exact hardware IDs, firmware, OS/kernel, Hailo packages, model and hashes;
- camera mode, exposure, resolution, and room setup;
- camera-to-action latency at p50, p95, and p99;
- pose FPS, dropped frames, CPU/GPU/NPU/RAM/swap, temperature, clocks, power, and fan noise;
- dodge, duck, jump, and floor-contact precision/recall;
- center and edge accuracy plus partial-body recovery;
- sixty minutes each with the obstacle game, VibeBots, Mi Casa Es Su Casa, and Determined;
- network loss, game crash, tracker restart, controller Back/Home, and loading-state recovery;
- cold boot, sustained writes, update interruption, full disk, sudden power loss, card corruption, replacement, and blank-card recovery.

Only then can Pi 5 plus AI HAT move from candidate to selected platform.
