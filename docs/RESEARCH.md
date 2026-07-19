# VCG Console research brief

Research snapshot: 2026-07-19

## Product thesis

The primary prototype environment is the current main living room and television, with an 8 x 8 ft (2.4 x 2.4 m) minimum safe clear play-zone target for the one- and two-player milestones. Exact room, TV, lighting, furniture, power, network, camera, and mounting facts are captured as the first evidence sheet rather than generalized away. The first complete body-play audience is school-age children and adults primarily standing. Seated and limited-range play remains an explicit accessibility research lane rather than a first-release completeness claim, while controller navigation and recovery remain universal.

VCG Console should combine three related products without coupling their internals:

1. A television-first launcher for the existing VibeCoded.Games catalog.
2. A local body-motion platform for new games, with an experience closer to Kinect or Nex Playground than a webcam demo.
3. An optional retro arcade mode that runs user-provided, legally obtained content.

The shared platform is the launcher, update system, input routing, profiles, and family-safe appliance behavior. Body tracking is a service exposed through a stable API. Retro emulation is a separately permissioned subsystem. A game should not need to know which camera or pose model is installed.

The publication target is an open-source DIY project with reproducible software, bill of materials, enclosure source/templates, and build instructions, not sold or formally supported hardware. Releases therefore require clear licenses, attribution/source compliance, signed or checksummed artifacts, known-risk and safe-use documentation, contribution and security-reporting guidance, and no-warranty language without implying certification or third-party content rights.

## What the current catalog requires

The live VibeCoded.Games source currently contains 26 entries: 23 first-party games and 3 promoted community games. The catalog spans TypeScript, JavaScript, plain HTML, Three.js, and Godot web exports. All 26 live URLs returned HTTP 200 during this snapshot, but reachability alone does not prove console compatibility. Additional third-party community games may enter family mode only through manual version/origin-scoped review with explicit authority, content, runtime, permission, privacy, controller, failure, update, and revocation evidence; developer sideloads remain visibly unapproved.

Approved games whose code or deployment VCG does not control default to supervised top-level fullscreen browser sessions, not iframes. That preserves ordinary website compatibility while the console enforces Home/Back, origin containment, loading, watchdog, and recovery outside the webpage. Iframe remains an explicit cooperative integration option. Games whose code and redistribution rights VCG controls default to signed local packages and select bundled-web or native payloads per game from measured evidence rather than a catalog-wide runtime default. Remaining hosted services must be declared. Every lane still needs an explicit compatibility contract for focus, gamepad input, full-screen behavior, pause and exit, storage, network failure, and resolution scaling.

Important findings:

- The current museum already embeds games in iframes with `autoplay`, `fullscreen`, `gamepad`, `pointer-lock`, and `clipboard-write` delegated.
- Epoch currently restricts `frame-ancestors` to its own origin and `randroid.dev`, so it cannot simply be framed by a new console origin. Its deployment policy must be changed or the console must open it as a top-level page.
- A quick initial-page scan found manifest links for only VibeBots, Asymptotic Bitrot, and Block-You. GoPit and GoDig contain service-worker and WebAssembly signals. This is only a heuristic, not a complete offline audit.
- Only VibeGear2 currently advertises a recognized SPDX license through GitHub metadata. Lack of a declared license means source visibility does not grant permission to redistribute a local/offline copy. Each game needs an explicit license or a private-owner distribution decision before mirroring.
- Several games depend on hosted identity, persistence, or online services. An offline bundle cannot silently promise equivalent behavior.

See [GAME_COMPATIBILITY.md](GAME_COMPATIBILITY.md) for the catalog test matrix and proposed package format.

## Proposed system architecture

### 1. Appliance layer

- Atomic A/B base-system images with bounded boot-health checks and automatic rollback, plus separate writable content and user data.
- Television-safe boot, overscan handling, audio routing, sleep/wake, HDMI-CEC investigation, and a watchdog.
- Full-screen launcher with no desktop escape in normal family mode.
- Controller or remote recovery path that works when the camera, pose service, or game crashes.
- Separate admin mode for Wi-Fi, updates, and diagnostics, plus an explicitly paired LAN developer mode that is disabled during ordinary family use.

The console visual language is deliberately minimal and sleek: charcoal/black surfaces, off-white OCR-A typography, and one configurable accent color. The SourceForge OCR-A project remains the current public-domain baseline. Tokens still need to qualify fallback type, TV sizes, spacing, focus, icons, restrained motion, illustration, and sound. Accent color is never the only state signal; pattern, outline, scale, icon, copy, and functional animation preserve navigation and accessibility.

Back, Home, and forced exit are shell-level invariants. They must continue to work when a game owns browser focus, pointer lock, full-screen, or motion input, and while a game is loading or failing. Any standards-conformant controller exposed through SDL or Steam Input is within the controllers-just-work promise. The shell uses automatic canonical mappings, standard or safe generic glyphs, hot-plug, reconnect, player assignment, and a controller-accessible guided mapper only for genuinely ambiguous devices; exact observed compatibility and defects remain public.

Every game launch uses the same branded loading-state shell. It should name observable phases such as preparing, checking network, downloading, starting, waiting for game readiness, and recovering. A loading animation without health or timeout information is insufficient. Slow, offline, hung, crashed, and retrying states need different messages and controller-accessible Back, retry, details, and exit actions. The selected relaxed gates are warm resume within 5 seconds, cold boot within 60 seconds, local interaction within 15 seconds, and hosted interaction or truthful real phase progress within 30 seconds; immediate branded feedback is still mandatory. Quick resume uses platform-native mechanisms behind the same shell: Steam Machine suspends, while Raspberry Pi enters a low-power launcher-idle state unless reliable suspend is proven. Idle transition stops tracking and camera capture, keeps the microphone disabled, blanks or dims video, quiesces unnecessary work and writes, and wakes from controller, remote, HDMI-CEC, or a physical fallback where supported. The lower-cost enclosure may reach 35 dBA at 1 metre under sustained load so thermal and tracking stability take precedence over near-silent operation. It uses no required backup-power hardware: A/B slots, atomic state changes, bounded writes, recovery, and rollback must keep it bootable after sudden unplugging, though the latest uncommitted device-local progress may be lost.

Candidate shells worth prototyping are Gamescope plus a custom launcher, Cage plus a browser launcher, Bazzite, ChimeraOS, Batocera, and OpenGamepadUI. None is selected. A custom web launcher can minimize work for the current catalog, while a more console-oriented distribution can reduce appliance engineering.

The premium compatibility contract now targets ordinary x86-64 Linux/PC hardware rather than one vendor appliance. The preordered 2026 Valve Steam Machine remains an optional later compatibility target for SteamOS, Steam Input, suspend/resume, Proton, camera, tracking, packaging, dual-boot, and performance evidence; it no longer controls premium architecture priorities or economics. Core VCG launcher, tracking, local profiles, installed packages, and retro mode must work without a Steam account on every tier. Valve's documented Offline Mode is not an accountless substitute because it requires prior online login, remembered credentials, and prepared games. Steam-only games, store, community, and cloud features may retain their separate account requirement. Raspberry Pi 5 plus the 26 TOPS AI HAT+ remains the selected lower-cost reference lane and must satisfy the same accountless local product contract. See [STEAM_MACHINE_2026.md](STEAM_MACHINE_2026.md), [RASPBERRY_PI_AI_HAT.md](RASPBERRY_PI_AI_HAT.md), and [AUTONOMOUS_RESEARCH_2026-07-19.md](AUTONOMOUS_RESEARCH_2026-07-19.md).

### 2. Camera and tracking service

```text
camera capture
  -> frame timestamp and exposure metadata
  -> crop/resize and optional person detection
  -> pose inference backend
  -> temporal smoothing and player identity
  -> calibration and room coordinates
  -> gesture/action recognizers
  -> local IPC Motion API
```

The initial baseline should use a single wide RGB camera. Nex publicly describes a single wide RGB camera, local inference, 18 tracked body nodes, and up to four players. That makes RGB-only tracking a valid product baseline, although it does not guarantee equivalent quality. A Raspberry Pi Camera Module 3 Wide provides a 120-degree diagonal field of view and an open libcamera pipeline. A normal USB UVC camera is the portability baseline. Camera packaging differs by compute tier without changing the capture or Motion API contract. The lower-cost appliance targets a Nex-like integrated camera if it passes optical, thermal, privacy, radio, and basic repair gates. Its production direction uses one fixed ultra-wide angle with no tilt mechanism; the first below-TV test fixture remains adjustable only to discover and validate that angle across rooms and player bodies. This is a DIY reference project rather than a warranty-backed sealed product, so the first fixture uses a modified off-the-shelf ABS electronics box with ordinary fasteners, guarded ventilation, deburred openings, stable mounting, cable strain relief, and documented construction. Steam Machine and supported-PC installations may use the qualified camera externally beside, above, or on the computer, with automatic calibration absorbing its supported placement. Games never observe or special-case the packaging difference.

Depth remains an optional quality tier, not an API assumption. OAK-D Pro W, Orbbec, and RealSense should be tested where low light, body overlap, and floor-plane accuracy justify the cost. Used Kinect hardware is useful as a research reference, but the original OpenKinect projects provide capture rather than a modern maintained full-body tracker, and Azure Kinect support is retired. It should not become a product dependency.

The complete recognized-action path must meet 120 ms at p95 from camera exposure to receipt at the game API while a representative game runs; inference-only or average latency is insufficient. Pose backends to compare:

- MediaPipe Pose Landmarker: accessible cross-platform baseline with 33 landmarks, multiple-pose configuration, world coordinates, and optional segmentation.
- RTMO through MMPose or rtmlib: promising multi-person bottom-up tracking, with deployment paths including ONNX, TensorRT, OpenVINO, and ncnn.
- Hailo-accelerated models: relevant to a Pi 5 plus AI HAT build, but only after model conversion and multi-person accuracy are measured.
- OAK on-device neural inference: may reduce host load and camera-to-pose transfer, at higher camera cost and tighter vendor coupling.
- Godot MediaPipe plugin: valuable for prototypes, but the long-term contract should remain outside any one engine.

### 3. VCG Motion API

Games should consume normalized motion data rather than camera frames or vendor SDK objects. The selected API exposes both normalized landmarks for custom mechanics and standardized console actions for portable, calibrated behavior. The first schema should include:

- schema version, frame sequence, monotonic capture timestamp, and inference timestamp;
- stable session-local player ID and confidence;
- a required named 17-landmark 2D normalized body core with per-landmark confidence;
- negotiated optional profiles for richer landmarks, 3D/world coordinates, depth, hands, face, segmentation, and future features;
- explicit unsupported and unobserved states; adapters never fabricate landmarks merely to fill a richer schema;
- body bounds, facing estimate, floor contact, and active play-zone status;
- calibration transform, handedness only when reliable, and tracker health;
- edge events such as `jump`, `punch_left`, `punch_right`, `squat`, `step_left`, and `step_right`;
- continuous values such as lean, reach, velocity, stance width, and arm angle;
- held states with hysteresis, cooldown, and start/end timestamps.

Version 1 separates two standardized action profiles. The obstacle-game profile contains player present/in-zone, jump, duck, dodge left, and dodge right. The obstacle sample is the only custom motion-controlled game in the first Motion API milestone; existing VibeCoded titles remain controller/service compatibility targets until the platform stabilizes. Its leaderboards are casual, household-local, and visibly unverified, with no anti-cheat, upload, or public competitive claim. The console-shell profile provides swipe-based focus movement, a deliberate two-hands-together selection gesture, and a crossed-forearms X for Back, all with visible confirmation, cancellation, and cooldown. During games, a longer X hold opens a console-owned pause/exit overlay and never exits immediately. Exit is focused by default and requires the hands-together selection; Resume is one swipe away. Shell actions are privileged; games cannot emit, intercept, or disable them. Controller selection and Back/Home remain universal accessibility and recovery paths.

A detected body is only a candidate and receives no control authority. The candidate becomes the one active prototype player only after the deliberate hands-together join gesture. The UI may show a local, privacy-preserving outline or skeleton for readiness, but never requires retained imagery or identity recognition.

The first working milestone remains one active player. After it passes, two simultaneous players are the required next milestone, covering identity through crossing and overlap, independent actions, join/leave and recovery, shared menu ownership, room coverage, and full-pipeline performance. Players join sequentially with hands-together, receive Player 1 then Player 2 session identities, and use numbered/patterned outlines that never rely on color alone. Each player calibrates automatically for floor, scale, stance, and usable range; a short guided correction appears only when confidence or required visibility fails. Complete per-player calibration profiles persist locally, and the console predicts returning profiles from locally processed body measurements. It always displays and focuses the predicted profile for hands-together confirmation rather than applying it silently; another profile or New Player remains selectable. Each profile displays a deliberately captured local portrait. A dedicated capture screen provides visible countdown, temporary preview, Retake, explicit hands-together acceptance, and cancel without save. Portrait pixels and facial embeddings are excluded from automatic matching. Portraits, calibration data, and body-matching measurements stay device-local and are excluded from backup, export, cloud, diagnostics, support bundles, and recovery images. They persist across ordinary OS updates only while the local writable profile partition survives, and must be recreated after storage loss, reflash, migration, or console replacement. Any local console user may manage any profile after an explicit, deliberate confirmation; no admin or per-profile credential exists, and body matching never acts as authentication. Deleting a profile immediately removes its sensitive fields and identity links but preserves console-managed game progress as unassigned data. An Unassigned Progress area permits deliberate play, manual claim, or permanent deletion without guessing ownership from a new profile, name, portrait, or body measurement. Console-managed saves are also device-local: they survive healthy OS/game updates and rollbacks while the writable data partition survives, but have no backup, export, migration, or console cloud-sync path and are permanently lost after storage failure, destructive reflash, factory reset, or replacement. Steam and hosted-service save systems remain separate. Hosted-service deletion remains a separately disclosed service responsibility. These biometric-like and identifiable-image features require correction, consent, opt-out/delete controls, security, privacy, and legal review. Four-player compatibility remains a forward-looking API goal until the two-player gates pass.

Any joined player may invoke the long-X in-game pause overlay. The earliest completed recognized gesture owns the overlay; completions in the same tracking update go to the lower player number, followed by a short ownership lockout. The owner exclusively controls overlay motion focus and is visibly identified by player number and pattern. Player 1 initially owns the shared launcher; when a pause/exit flow returns there, launcher ownership transfers to the player who opened that pause overlay.

In multiplayer, confirmed loss of any active player pauses the entire game. Shared simulation, timers, hazards, scoring, and motion actions freeze for everyone so no remaining player gains an advantage while another cannot act.

The console does not freeze on one missed or low-confidence tracking frame. It confirms ordinary active-player loss after approximately 300 ms across multiple tracking updates using monotonic time, weighted/consecutive confidence evidence, and hysteresis so behavior is stable across changing FPS. A hard camera disconnect, permission loss, or tracker crash may pause immediately. After confirmed loss, it freezes game simulation, timers, hazards, scoring, and motion actions while attempting same-track reacquisition for two seconds. Confident reacquisition within that window silently unfreezes play. Otherwise the console remains paused and opens its recovery overlay with Resume focused and Exit one swipe away; it never resumes merely because a body later reappears. Any candidate may then deliberately select Resume with hands-together and take over the one-player session without biometric identity matching. This automatic overlay intentionally differs from the manually invoked long-X overlay, which focuses Exit.

The service should expose a local IPC transport for native games and a small bridge for trusted web games. The browser bridge should use a versioned `postMessage` handshake, validate origins, validate message schemas, and never expose raw camera frames by default. Permissions must be declared in each game manifest.

### 4. Game runtime and packaging

Support three primary runtime classes:

- `web`: a remote HTTPS URL or a trusted local static bundle.
- `native`: a signed executable or Godot export for the console architecture.
- `libretro`: a core plus user-provided content, launched through the isolated retro subsystem.

A proposed `vcg-game.json` manifest should carry:

```json
{
  "schemaVersion": 1,
  "id": "example-game",
  "version": "1.0.0",
  "title": "Example Game",
  "runtime": "web",
  "entrypoint": "https://example.invalid",
  "architectures": ["aarch64", "x86_64"],
  "permissions": ["gamepad", "motion.skeleton"],
  "inputProfiles": ["gamepad", "motion.v1"],
  "minimumConsoleVersion": "0.1.0",
  "network": "required",
  "license": "LicenseRef-Proprietary",
  "source": "https://github.com/example/example-game",
  "healthCheck": { "type": "http", "path": "/" }
}
```

Local packages additionally need checksums, a trusted signature, content size, writable-data paths, migration rules, uninstall behavior, and an explicit offline capability statement. The console should not run a generic proxy that strips a game's CSP or frame restrictions. That hides compatibility defects and weakens the browser security boundary.

### 5. Retro subsystem

Libretro offers a useful stable core API, while RetroArch is a mature GPLv3 frontend. Batocera and similar systems show the full-console experience, but every core has its own license and distribution terms. Lakka's current license page also describes a non-commercial restriction that needs careful review before reuse in any distributed product. The selected first integration launches a supervised fullscreen RetroArch or other qualified libretro frontend as a signed local application from the VCG launcher rather than rebooting into a separate retro operating system. VCG retains branded loading and return, reserved Home/Back, controller assignment, family-mode boundaries, process supervision, crash recovery, update, and rollback. Each supported system receives one pinned qualified default core and controller profile so controllers normally just work; only approved per-game exceptions may override them outside ordinary family UI.

MAME is open source, but it does not include arcade ROMs. ROMs, BIOS files, artwork, samples, and CHDs require separate rights analysis. MAME ROM sets are versioned and have parent/clone relationships, so content scanning needs precise core and set metadata rather than filename guessing.

The safe default is:

- bundle no commercial ROMs, BIOS files, keys, or copyrighted artwork;
- let the owner import content they are entitled to use;
- store retro content outside the immutable operating system;
- inventory the exact license and source revision of every distributed core;
- ship a small per-title-audited homebrew/public-domain starter catalog before broad arcade importing;
- keep retro input remapping and process permissions separate from body-game permissions.

User-entitled retro files may enter through either removable USB media or the explicitly paired LAN workstation. Both transports terminate in one console-owned importer with the same visible session, entitlement acknowledgement, hashing, validation, duplicate and quota behavior, provenance record, cancellation cleanup, and family-mode denial. Every approved file is staged, validated, hashed, and atomically copied into console-managed local storage; RetroArch never runs from the source USB path, and the source can be removed after verification. Game content remains isolated from cores, save states, configuration, and profiles. The LAN path is not a permanent file share, and neither path authorizes automatic acquisition of commercial ROMs, BIOS files, keys, or copyrighted artwork.

### 6. Privacy and family safety

Raw video should be processed locally, not recorded, and not transmitted by default. Diagnostics should export skeletal traces only after explicit admin consent, with a clear deletion path. Device-only portraits, calibration fields, and body-profile-matching measurements live in an automatically unlocked encrypted vault protected by a console-bound key. This protects a removed or cloned storage card without adding a family login step, but does not protect plaintext while an authorized running console is using it. The key and plaintext must not enter backups, recovery images, diagnostics, logs, swap, crash dumps, or game storage. There is no recovery copy: key loss destroys the vault and requires profile recreation. Console-managed saves are separately isolated but are also intentionally device-local and unrecoverable after storage loss. The selected baseline requires a physical optical shutter while camera power and activity remain software-managed. The UI must not claim to know whether the shutter is open or closed unless the exact hardware exposes a trustworthy sensor.

The FTC treats children's photos, video, audio, and biometric identifiers as personal information in relevant online-service contexts. Its guidance also distinguishes processing on a device when imagery is never transmitted. Personal home use is not the same as offering a service to children, but local-first architecture materially reduces risk if the project later expands.

Profiles should avoid requiring real names or cloud accounts. Family mode needs session reset, guest profiles, clear play-zone guidance, break reminders, guardian controls, and a non-camera way to exit every game.

## Hardware candidates

No final bill of materials is approved. Prices and availability must be quoted at purchase time, especially because Raspberry Pi pricing changed in 2026.

| Tier | Candidate parts | Why test it | Primary risks |
|---|---|---|---|
| Fast development | Existing x86-64 mini PC or gaming PC, 1080p wide UVC camera, Bluetooth gamepad | Fastest software iteration, broad browser and emulator compatibility | Power use, larger box, variable GPU and driver behavior |
| Embedded RGB | Raspberry Pi 5, shared wide UVC camera, active cooler, adequate USB-C supply, high-endurance microSD | Compact, simple storage path, large maker community | Host/game latency, 2026 board cost, SD durability, thermals, ARM game compatibility |
| Embedded accelerated | Pi 5 plus AI HAT+ 13 or 26 TOPS | Local inference at a console-sized power envelope | Model conversion, PCIe lane conflict with M.2 HAT+, Hailo-specific maintenance |
| Higher-performance edge | Jetson Orin Nano Super developer kit, wide UVC or CSI camera | CUDA/TensorRT ecosystem, official 67 sparse TOPS claim | $249 class board before peripherals, power and vendor coupling |
| Smart depth camera | OAK-D Pro W plus x86/Pi/Jetson host | 120-degree RGB, stereo depth, IR projector, on-camera inference options | Camera cost, USB bandwidth, SDK coupling, low-light safety validation |
| Depth comparison | Orbbec or RealSense model with maintained SDK support | Better occlusion and floor geometry experiments | Exact-device Linux/ARM support varies; cost and supply |

The Pi M.2 HAT+ and AI HAT+ both use the Pi 5 PCIe connector. A build cannot assume both are directly attached at once. The selected baseline uses qualified high-endurance microSD; USB 3 SSD is the first fallback if durability tests fail.

The selected lower-cost reference lane is Raspberry Pi 5 with 8GB RAM plus AI HAT+ 26 TOPS, after the owned-x86 workload is complete. Raspberry Pi ships a 17-point pose demo, and Hailo's current MIT-licensed Hailo Apps supports Hailo-8, Hailo-8L, and Hailo-10H. The 13 TOPS example uses YOLOv8s Pose; the 26 TOPS example uses the larger YOLOv8m Pose. The 40 TOPS AI HAT+ 2 adds 8GB of dedicated memory and local LLM/VLM support, but Raspberry Pi says its conventional computer-vision performance is comparable to the 26 TOPS AI HAT+. That makes AI HAT+ 2 poor value for a pose-only console unless local voice or vision-language features become requirements.

Pi feasibility depends on whole-system results. Hailo accelerates neural inference, but camera capture, GStreamer, post-processing, player tracking, the Motion API, gestures, Chromium, WebGL, audio, and the game still consume host resources. The Hailo setup guide recommends an 8GB Pi 5, yet official Pi prices rose sharply in 2026. A later 4GB comparison remains mandatory after the 8GB build passes. Because AI HAT occupies the exposed PCIe connector, the selected writable-storage path is qualified high-endurance microSD, with USB 3 SSD held as the first measured fallback.

See [RASPBERRY_PI_AI_HAT.md](RASPBERRY_PI_AI_HAT.md) for the focused evidence, cost model, risks, and purchase gate.

Ancillary parts that need explicit selection include enclosure, active cooling, storage, power supply, short certified HDMI cable, microphone policy, speakers or HDMI audio, Bluetooth/Wi-Fi antennas, gamepad, simple remote, status LED, privacy shutter, camera mount, strain relief, wall or TV mount, service button, and reset/recovery mechanism. The delivered lower-cost reference BOM may total up to $650 including shipping and tax but excluding TV, controllers, tools, spares, and Steam Machine; the ceiling does not authorize purchases before evidence gates.

## Measurement gates

Hardware is selected only after a reproducible benchmark suite answers:

- camera-to-game event latency at p50, p95, and p99;
- sustained pose FPS and dropped-frame behavior for one, two, and four players;
- accuracy across child/adult height, skin tone, clothing, seated play, and mobility variation;
- minimum and maximum camera distance and usable horizontal play zone;
- overlap recovery, player ID stability, leaving/re-entering, and partial body visibility;
- daylight, backlight, evening lamp, and dim-room performance;
- 60-minute and 4-hour thermals, noise, throttling, and power draw;
- cold boot to launcher, game launch, crash recovery, and rollback time;
- web, Godot, and representative retro workload compatibility on both ARM64 and x86-64;
- network-loss behavior, storage corruption recovery, and update interruption recovery.

## Milestone sequence

1. **Desk proof:** camera capture, one pose backend, skeleton visualizer, recording-free diagnostics, and a simple motion game.
2. **Living-room proof:** wired box on the target TV, one-player latency and room benchmark, controller recovery path, and three representative VibeCoded games.
3. **SDK proof:** versioned Motion API, web bridge, Godot client, calibration flow, gesture test harness, and a sample game.
4. **Catalog proof:** compatibility test all 26 current games, fix top-level/frame launch policies, define licenses, and validate remote/offline classifications.
5. **Multi-player proof:** two-player then four-player identity, overlap, calibration, fairness, and performance tests.
6. **Appliance alpha:** enclosure, thermals, atomic updates, watchdog, guest profiles, privacy controls, and recovery image.
7. **Retro alpha:** isolated frontend, homebrew content, controller mapping, per-core license report, and user import workflow.
8. **Home pilot:** repeated family sessions, telemetry only with consent, failure diary, accessibility review, and hardware revision decision.

## Definition of a credible first prototype

The prototype is credible when it boots directly to a television-safe launcher, works without a keyboard for ordinary play, launches at least one hosted web game, one local web or Godot game, and one body-controlled sample, keeps raw camera frames local and ephemeral, recovers from a failed game with the controller, and publishes a repeatable latency/room report. An attractive enclosure is not a substitute for those results.
