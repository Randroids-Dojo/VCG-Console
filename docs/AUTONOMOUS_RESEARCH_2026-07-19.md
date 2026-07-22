# Autonomous research tranche: 2026-07-19

This tranche begins after completion of the project-owner intake. All 119 owner decisions remain in force. At the close of this July 19 snapshot, implementation had added seven reversible working decisions and opened two engineering questions, bringing the register at that time to 126 decisions and 67 open questions. The live [decision register](DECISIONS.md) later added D-127 and D-128 on July 21. No additional owner answer is required before prototype work continues.

## Outcome

The architecture is coherent enough to start a desk prototype without buying Raspberry Pi hardware:

1. Build the accountless VCG launcher, motion service, obstacle game, supervised browser runner, controller escape path, and diagnostic harness on available development hardware.
2. Establish an ordinary x86-64 Linux reference when exact owned or selected x86 hardware is available. The current Apple Silicon Mac is a productive development host, not evidence for that tier.
3. Buy or assemble the Pi 5 8GB plus AI HAT+ 26 TOPS lane only after the backend-neutral workload and benchmark harness run end to end.
4. Test the preordered Steam Machine later as an optional SteamOS compatibility target. Do not let Steam login, Steam Input, or the Steam shell become requirements of the core console.

No open hardware-performance question was closed from vendor documentation alone. Product pages establish capabilities and candidate paths; the 120 ms p95 camera-to-action gate and complete concurrent workload still require measured evidence.

## Remaining-question classification

| Closure class | Count | Meaning | Immediate treatment |
|---|---:|---|---|
| Implementation plus local test | 22 | A prototype or software contract can answer it before dedicated target hardware arrives. | Start with the manifest, Motion API, shell gestures, browser supervisor, controller routing, saves, permissions, and diagnostics. |
| Target-hardware or room measurement | 33 | The answer depends on the exact camera, room, compute, storage, thermals, controller, or operating system. | Preserve as a benchmark gate. Do not replace it with a vendor claim. |
| Source, license, or specialist review | 12 | The answer needs exact artifact provenance, distribution authority, legal review, safety language, or release-policy work. | Prepare evidence packets now; obtain counsel or a qualified reviewer before public distribution where applicable. |
| Owner decisions still required before work | 0 | Intake is complete. | Continue autonomously. |

The class is a routing aid, not a priority downgrade. P0 questions remain P0 even when hardware-gated.

- Implementation plus local test: Q-032, Q-038, Q-040, Q-041, Q-042, Q-045, Q-046, Q-048, Q-049, Q-050, Q-052, Q-055, Q-056, Q-057, Q-058, Q-060, Q-061, Q-069, Q-070, Q-079, Q-080, Q-100.
- Target-hardware or room measurement: Q-011, Q-012, Q-013, Q-015, Q-017, Q-018, Q-019, Q-027, Q-028, Q-029, Q-030, Q-031, Q-033, Q-034, Q-035, Q-036, Q-039, Q-043, Q-047, Q-067, Q-068, Q-082, Q-083, Q-084, Q-085, Q-086, Q-087, Q-088, Q-089, Q-090, Q-092, Q-095, Q-101.
- Source, license, or specialist review: Q-025, Q-051, Q-064, Q-065, Q-066, Q-072, Q-074, Q-075, Q-076, Q-077, Q-098, Q-099.

## Evidence added in this tranche

### Accountless core versus Steam

Valve's Offline Mode is not an accountless console mode. Its official procedure requires logging in online, remembering the account, storing credentials, fully updating the game, and usually launching the game once online. A Steam client that asks for login cannot bypass it while offline. Therefore:

- VCG core boot, launcher, local tracking, profiles, installed local games, and retro mode cannot depend on the Steam client.
- The portable controller baseline must be SDL or normal Linux input. Steam Input is an optional adapter on systems where Steam is running.
- Steam-only games and services may keep their account requirement, but the launcher must label that boundary before launch.
- Steam Machine qualification must include restart, network-loss, and local-VCG tests without a logged-in Steam session. Failure blocks it from being a primary appliance but does not block optional compatibility.

### Current development-host inventory

A read-only local inventory found:

| Item | Observed state | What it proves | What it does not prove |
|---|---|---|---|
| Development computer | Apple MacBook Pro with M4 Max, 16 CPU cores, 40 GPU cores, 128GB RAM, arm64, macOS 26.6 | More than enough host capacity to implement schemas, shell UX, web supervision, game integration, replay tooling, and a first functional tracker. | Ordinary x86-64 Linux behavior, low-end performance, SteamOS behavior, Pi performance, or target-TV behavior. |
| Camera inputs | Built-in Mac camera and OBS Virtual Camera visible; no external USB device enumerated in the snapshot | Software can begin with live or replayed frames. | UVC 1080p60 latency, room coverage, optical shutter, reconnect, or cross-platform compatibility. |
| Preordered Steam Machine | In scope but not present in this inventory | A later no-purchase compatibility lane exists. | Any present-tense performance, packaging, camera, or accountless claim. |

Q-011 remains open because the inventory still needs an exact ordinary x86-64 system, target-TV inputs, qualified UVC camera, controllers, room measurements, and any other owned equipment the first wired prototype can use.

### Pose and tracking candidates

The candidate roles are now sharper:

| Candidate | Confirmed capability | Best first use | Unresolved gate |
|---|---|---|---|
| MediaPipe Pose Landmarker | 33 3D body landmarks, world coordinates, multiple-pose configuration, optional segmentation, live-stream callback; Google labels the Tasks solution a preview. | Portable one-player baseline and richer-landmark comparison. | Q-027 accuracy, tracking behavior, CPU load, and full-pipeline latency in the real room. |
| MMPose RTMO | One-stage real-time multi-person pose model intended for crowded scenes, without a separate person detector. | Two-player and eventual four-player comparison on x86. | Q-028 measured latency, memory, accuracy, and identity stability on VCG recordings. |
| Hailo YOLOv8 pose | Raspberry Pi documents a 17-point demo. Current Hailo Apps supports Hailo-8L, Hailo-8, and Hailo-10H, USB/Pi/video input, custom HEF files, and a pose pipeline. | Pi accelerator baseline mapped into the portable 17-point Motion API core. | Q-082, Q-084, and Q-085 complete-workload and action-quality measurements. |

The official Hailo software split is also a release-engineering warning. Hailo-8/8L currently use a 4.x runtime line while Hailo-10H uses 5.x, and the Pi documentation warns that compiled models, drivers, and packages must match. The console image must pin the complete tuple: OS image, kernel, PCIe driver, HailoRT, TAPPAS Core, Hailo Apps commit, HEF model hash, post-processing library, and camera pipeline. This makes Q-087 a cold-rebuild and rollback test, not just a package-lock exercise.

The 26 TOPS choice remains a capacity hypothesis, not a benchmark result. It offers the larger documented pose model and more parallel-model headroom than the 13 TOPS board. The project should not buy the 40 TOPS AI HAT+ 2 for pose alone because its on-board memory and generative-AI features do not establish a conventional-vision advantage over the 26 TOPS board.

### Browser, kiosk, and process ownership

Gamescope and Cage solve different layers:

- Gamescope is a micro-compositor suited to supervising a game window, fixing the virtual resolution and refresh rate, isolating an Xwayland desktop, and returning control when the child process exits.
- Cage is a minimal single-application Wayland kiosk. It is a good small shell for a browser experiment but does not itself provide VCG package policy, loading health, controller mapping, or game process recovery.
- Chromium can be centrally configured, but browser policy is not the VCG trust boundary. The console must own process lifecycle, allowed origins, pop-up/external-navigation behavior, saved-data directories, timeouts, and forced exit outside the page.

The current recommendation for the first Linux desk image is a custom VCG launcher plus a dedicated Chromium profile per game, supervised by a native parent process under Gamescope or Cage. Compare both compositors with the same test matrix before selecting one. Electron is useful only if it materially simplifies privileged shell integration; shipping an extra Chromium per application is otherwise unnecessary.

Flatpak strengthens application isolation but complicates the camera service. Official Flatpak documentation says sandboxes start with no device access. Newer permissions can expose input and raw USB devices, while webcam access may still require the broad `--device=all`; raw USB permission is not the same as access to a V4L2 `/dev/video` node. This preserves Q-089 as a real SteamOS test and argues for keeping the trusted tracker as a narrowly permissioned system component that sends skeleton data to less-trusted games.

### Controllers that just work

SDL3 is the accountless canonical mapping layer:

- SDL's gamepad API names controls by semantic position, ships popular mappings, permits GUID-based custom mappings, and is designed for hot-plug.
- Face-button legends differ by controller. The shell must render a controller-specific label when known and allow South/East accept-cancel preference instead of assuming the printed letter.
- An SDL GUID identifies a mapping class on one platform, not a unique physical controller and not necessarily the same device across operating systems. Pairing and player assignment must not use it as a durable identity.
- Steam Input can broaden mappings and supply glyphs when Steam is available, but it is an adapter behind the same canonical actions.

This evidence is enough to begin I-151 and I-152. Q-067 remains open until real USB, Bluetooth, receiver, reconnect, suspend, and simultaneous-player tests pass on both reference tiers.

### Selected VibeCoded game set

The repositories were refreshed and inspected at these `origin/main` commits on 2026-07-19:

| Game | Commit | Runtime and services | Console consequence |
|---|---|---|---|
| VibeBots | `5b5d17efd3cd29c5cdbdc6e8f3eadf6d7173e602` | Next.js 16, React Three Fiber, local deterministic simulation, guest-first local behavior, many server APIs, Neon persistence, optional Clerk identity and Web Push. The live custom domain redirects to `/mine` and returns 200. | Test hosted top-level first. A controlled local package is a separate engineering project because server authority, persistence, identity, notifications, and production-origin assumptions must be classified feature by feature. |
| Mi Casa Es Su Casa | `0c868be698360385d4a613fdca689faf0a2b82ca` | Next.js 15, Three.js, Vercel KV-backed character/layout/message APIs, server-side name validation, feedback integration. Live root returns 200. | Hosted-service-required under its current architecture. An offline package needs a deliberate local storage/server replacement and a decision about shared visiting/messaging, not just a copied Next.js build. |
| Determined | `7d9a38dc2c64915808c4a0a7081133ebb1865eec` | Static HTML/CSS/JS frontend, localStorage asset cache, Vercel API routes, Groq generation, Vercel KV cache/leaderboard. Documentation says the static game opens without the API, with fallback content, but generation and leaderboard features do not. Live root returns 200. | Best first controlled degradation experiment: package static content locally, explicitly disable or label hosted-only features, and test whether fallback play is genuinely complete and understandable offline. |

This answers the architectural part of Q-049 for the selected set but not the controller/mouse/keyboard details. Those require browser automation plus a real controller. Q-051 stays open until code, assets, fonts, music, model, service, and private-owner distribution authority are reviewed per exact build.

Epoch's live response still sends `frame-ancestors 'self' https://randroid.dev https://www.randroid.dev` plus `X-Frame-Options: ALLOW-FROM https://randroid.dev`. Its current correct VCG mode is supervised top-level launch. Q-048 can close only after that route is implemented and its Home/Back/origin-containment behavior passes, or after Epoch deliberately adds the console origin.

### OCR-A artifact selection

The specified SourceForge project labels itself Public Domain and publishes source material plus PostScript, FontForge, and TrueType artifacts. Its 1.0 directory was updated in 2020, while most binary assets date to 2004. The relevant UI artifact is `OCRA.ttf`, listed as 24.3 kB. The project README also records prior macOS compatibility issues and the removal of a separate Mac conversion that lacked lowercase `z`.

The font should therefore be treated as a brand display face, not assumed to be a complete interface font:

1. Download the exact `OCRA.ttf` artifact into a provenance staging area.
2. Record SHA-256, byte size, source URL, retrieval date, project license page, and the source archive references.
3. Inspect Unicode coverage and font metadata before vendoring it.
4. Define a freely redistributable fallback for lowercase, symbols, controller glyph labels, localization, and accessibility.
5. Test uppercase and mixed-case samples at the target TV distance. Do not inherit the project's 10-point print recommendation as a television size.

Q-077 remains open for legibility and fallback testing, but I-145's format/source/license evidence is complete and I-146 can proceed without another owner decision.

### Retro scope

No source supports bundling emulator code and commercial game data as one rights decision. Libretro documents that core licenses vary, and MAME explicitly separates its open-source emulator from ROM, BIOS, artwork, sample, and CHD rights. The correct implementation order remains:

1. Build the supervised frontend and importer with no commercial content.
2. Qualify one exact core revision per initially supported system, including its code license, architecture builds, BIOS needs, save compatibility, controller mapping, and source-offer obligations.
3. Add only individually audited homebrew or public-domain starter titles with exact artifact hashes and redistribution evidence.
4. Treat user imports as a local entitlement representation plus technical validation, not as legal proof created by the console.

## First autonomous implementation queue

These tasks maximize learning before a hardware purchase:

1. I-073 and I-075: write Motion API v0 schema, capability negotiation, 17-point canonical body, 33-point MediaPipe extension, action phases, health states, and fixtures.
2. I-050: build the MediaPipe visualizer with capture/inference timestamps, ephemeral frames, skeleton-only replay export, and synthetic/replayed input.
3. I-183: prototype the OCR-A shell navigation gestures, controller fallback, manual pause overlay with Exit focused, and tracking-loss overlay with Resume focused.
4. I-088, I-092, I-093, and I-117: build the supervised top-level browser runner, game-specific data directory, reserved Home/Back, branded launch phases, timeout, crash marker, and forced process termination.
5. I-151 and I-152: add SDL3 canonical navigation, mapping database import, controller glyph policy, hot-plug, reconnect, and guided mapping surfaces.
6. I-093, I-096, I-097, and I-104: produce local-package and hosted-game manifests for Determined, Mi Casa, and VibeBots, with every service and degradation mode declared.
7. I-207: identify or select an ordinary x86-64 Linux host and run the common test harness before attributing premium-tier evidence to the M4 Mac or Steam Machine.
8. I-157 through I-161: only after the common pipeline works, build the pinned Pi image and compare 13/26 TOPS behavior if both accelerators can be borrowed, returned, or responsibly acquired.

## Evidence boundaries

- Current web reachability is not playability.
- A service worker is not proof of complete offline operation.
- Public source code without a license is not redistribution permission.
- TOPS is not pose latency, action accuracy, or whole-console headroom.
- A detected skeleton is not a stable player identity.
- Steam Offline Mode is not an accountless product mode.
- Flatpak availability is not proof that a persistent low-latency camera daemon works on SteamOS.
- The M4 Max development host is not the lower-end target and not the ordinary x86-64 premium target.
