# Implementation record

Last updated: 2026-07-19

This file records what has actually been built and verified. It does not convert desk evidence into Raspberry Pi, ordinary x86-64 Linux, SteamOS, real-room, or product qualification.

## 2026-07-19: first reversible desk slice

### Delivered

- pnpm workspace with independent Motion API, game-manifest, console-lab, asset-preparation, schema-export, catalog-validation, and hosted-process supervision surfaces.
- Motion API `0.1.0`: exact 17-point core, optional MediaPipe 33 and world-coordinate profiles, named timestamp quality, tracker health, standardized obstacle/shell actions, skeleton-only traces, generated Draft 2020-12 schema, and explicit required/optional capability negotiation.
- Local MediaPipe Pose Landmarker Lite pipeline with GPU-first and WASM CPU fallback, hidden raw video, 17/33 mapping, synthetic replay, bounded 600-frame trace buffer, and latency/FPS diagnostics that clearly label capture-arrival timing.
- Minimal OCR-A television shell with charcoal, off-white, and cyan tokens; visible focus; Tracker, Obstacle, and Shell Lab surfaces; keyboard/controller recovery; and reduced-motion support.
- Prototype join, jump, duck, dodge, swipe, two-hands select, crossed-arm Back/pause, 300 ms tracking-loss confirmation, and two-second silent reacquisition logic.
- Manual pause overlay with Exit focused by default and tracking-loss overlay with Resume focused by default.
- Browser Gamepad API adapter for standard semantic input. This is UI behavior evidence only, not SDL3 qualification.
- `vcg-game.json` v1 schema, diagnostics CLI, and honest hosted manifests for Determined, Mi Casa Es Su Casa, and VibeBots.
- Chrome app-mode supervisor spike with a per-game data directory and signal-driven termination. Its dry-run output states the unimplemented security and recovery boundaries.

### Pinned local assets

| Asset | Version or artifact | Bytes | SHA-256 |
|---|---|---:|---|
| MediaPipe web runtime | `@mediapipe/tasks-vision@0.10.35` | package-managed | pnpm lockfile |
| Pose Landmarker Lite | float16 revision 1 | 5,777,746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| OCR-A | `OCRA.ttf` 1.0 | 24,316 | `a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e` |

`pnpm prepare:assets` verifies byte length and SHA-256 before writing. Generated model, font, and WASM directories stay ignored; `apps/console-lab/public/ASSET_PROVENANCE.json` and the preparation script are the reviewable source of truth.

### Verification evidence

| Command | Result |
|---|---|
| `pnpm prepare:assets` | Existing model/font hashes verified; pinned WASM copied locally. |
| `pnpm prepare:schemas` | Motion-frame and game-manifest Draft 2020-12 schemas exported. |
| `pnpm validate:manifests` | All three catalog manifests valid; compatibility remains honestly partial/unverified. |
| `pnpm typecheck` | Passed across all three workspace packages. |
| `pnpm test` | Unit tests cover contracts, adapter, actions, tracking loss, trace privacy, gamepad semantics, and manifests. |
| `pnpm build` | Production console-lab bundle completed. |
| `pnpm test:e2e` | Shell navigation, Escape recovery, overlay defaults, reviewed screenshot, and pinned-model fake-camera pipeline passed in Chrome. |
| `pnpm supervise:game catalog/determined.vcg-game.json --dry-run` | Manifest-driven launch plan and limitations emitted without external mutation. |

The fake-camera test proves the prepared model and browser capture pipeline initialize together. It does not prove pose accuracy because the synthetic Chrome device contains no qualified person or room.

### Issues found and resolved

- The first fake-camera run rejected the test device after requesting a 24 FPS minimum. Camera constraints now express 60 FPS as an ideal and leave qualification to measured telemetry.
- The first rerun still showed stale behavior because Playwright previewed an old `dist`. The web server now builds before every end-to-end run.
- The camera-failure path previously overwrote the fault with an idle replay message. Synthetic fallback now preserves the camera error and marks tracker health as fault.
- Contract arrays could satisfy length while duplicating a landmark. Exact membership validation and a regression test now reject that shape.

### Active limits and next evidence

1. MediaPipe `detectForVideo` is synchronous in the browser API. It now runs in a dedicated browser worker, but I-208 still compares this boundary with a native process under real load.
2. Browser capture records capture-arrival time, not camera exposure time. No current latency number can pass D-110's 120 ms p95 gate.
3. Action thresholds have unit and synthetic tests but no consented real-room precision/recall score. I-210 is the next motion evidence task.
4. Browser Gamepad input is not SDL3, and page code cannot reserve Home/Back. I-209 owns the native Linux boundary.
5. Chrome app mode does not yet enforce allowed origins, report game readiness, render all branded launch phases, or survive hostile full-screen/pointer-lock/hang cases.
6. No current result qualifies ordinary x86-64 Linux, Raspberry Pi, Hailo, or Steam Machine hardware.
7. Model and font artifact provenance is pinned, but full redistribution/SBOM/notice review remains required before a public release bundle.

## 2026-07-19: worker isolation and Windows handoff

### Delivered

- MediaPipe model initialization and `detectForVideo` now run in a dedicated Vite module worker rather than the console UI thread.
- Camera frames cross the boundary as transferable `ImageBitmap` objects. Only one frame may be in flight; additional capture frames are counted and dropped instead of becoming latency-producing backlog.
- Capture-arrival timing is taken before bitmap creation, and publication timing is taken after the skeletal result returns to the UI, so the prototype pipeline measurement includes both transfers. It is still not a camera exposure timestamp.
- The worker selects MediaPipe's module WASM loader explicitly. Without that flag, version 0.10.35 loads the classic script into module scope and fails with `ModuleFactory not set`.
- Worker initialization failure is visible and falls back to the prior main-thread backend. End-to-end tests cover both isolated operation and the explicit fallback.
- A Windows x86-64 bootstrap, inventory script, and qualification checklist are ready for the secondary workstation handoff.

### Verification evidence

| Check | Result |
|---|---|
| Worker production bundle | Vite emits a separate `tracker-worker` asset. |
| Backpressure unit tests | One in-flight frame enforced; drops counted; session reset verified. |
| Worker camera test | Pinned model initializes in Chrome's worker and publishes local pose frames. |
| Fallback camera test | Aborted worker bundle produces visible fallback state while camera inference remains live. |

### Remaining boundary

I-208 remains active rather than closed. Real-camera responsiveness, dropped-frame distribution, actual exposure timestamps, native-process comparison, and ARM64/x86-64 target measurements are still missing.

## 2026-07-19: cooperative Motion bridge and deterministic replay

### Delivered

- `@vcg/motion-web-bridge` implements the proposed cooperative `postMessage` path with exact origin/source checks, schema-validated protocol messages, required/optional capability negotiation, profile-projected frames, bounded publication, hostile-origin silence, and reconnect/retry behavior.
- A typed sample client demonstrates explicit console-window/origin configuration and consumes both core landmarks and standardized obstacle actions.
- `MotionTracePlayer` provides wall-clock-independent play, pause, speed, seek, loop, deterministic frame ordering, and expected-action scoring for skeleton-only traces.
- The console action recognizer now receives an explicit shell/game context. A crossed-arm hold inside a game waits for the longer Pause threshold instead of firing the shorter shell Back action first.
- The protocol's compatibility policy ignores unknown fields on otherwise valid messages while continuing to validate known fields and exact versions.

### Verification evidence

| Check | Result |
|---|---|
| Bridge negotiation and projection | Required profiles accepted or rejected explicitly; non-granted rich/world/action data removed. |
| Origin boundary | Hostile origins receive no response; both endpoints verify configured origin and source. |
| Reconnect and retry | Explicit session replacement and retry-until-host-available tests pass. |
| Chrome integration | Cooperative iframe negotiates, receives a frame, reloads, reconnects, and receives the next frame. |
| Backpressure | Per-session rate limit passes; a 10,000-frame same-timestamp burst delivers one frame and queues none. |
| Deterministic replay | Speed, seek, loop, ordered delivery, expectation scoring, and invalid-trace tests pass. |
| Gesture context | Tests prove shell Back and in-game Pause use distinct hold semantics. |

### Remaining boundary

The bridge is for cooperative web integration only. A separately supervised top-level hosted game has no messaging relationship with the shell today. Cross-origin CSP/sandbox and hostile-navigation cases, native process transport, SDL3/global Home and Back, Linux qualification, and measured delivery latency remain open. Replay proves deterministic contract consumption, not tracker accuracy.

## 2026-07-19: boot-to-launcher experience

### Delivered

- A restrained local boot sequence uses one signal line as its only motion; the same line becomes the active launcher navigation indicator.
- The primary launcher provides Home, Motion, VibeCoded Museum, RetroArch, Profiles, and Settings destinations without making the diagnostic lab the default experience.
- The Motion hub opens Obstacle, Motion Lab, and Shell Lab while preserving the existing tracker, controller, overlay, and camera-fallback tests.
- The museum has an explicit `https://vibecoded.games` entry boundary and states that it is a live web experience.
- Local profile selection, creation, and update flows work in the prototype and clearly state that profile data remains device-local.
- Settings expose prototype/version data, honest estimated storage capacity, Wi-Fi setup state, update status, developer toggles, and direct Motion Lab access.
- The Retro hub describes the native RetroArch boundary and refuses to imply that browser-only import or launch is complete.
- Universal search spans motion experiences, the museum and current compatibility games, RetroArch, profiles, Wi-Fi, storage, and developer options.
- Launcher Back/Home behavior, keyboard search, controller focus routing, reduced motion, and narrow-display layouts are included.

### Verification evidence

Chrome tests cover the timed boot, every launcher destination, the exact museum URL, profile select/create/update, cross-hub game search, RetroArch search, storage and Wi-Fi surfaces, Motion Lab entry, and the existing camera/worker/overlay contracts. Reviewed 1440 x 1000 boot and home screenshots are stored in `test-results/console-lab`.

### Remaining boundary

Profile and settings changes are prototype session state, not durable encrypted console storage. Wi-Fi, storage, updates, RetroArch, and hosted-game launch still require the native Linux host. Search currently indexes the prototype catalog snapshot rather than consuming the final canonical catalog service.

## 2026-07-21: Rust native-host boundary

### Delivered

- The owner selected Rust for the privileged appliance layer and Svelte 5 on the existing Vite build for the launcher.
- A pinned Cargo workspace now contains `vcg-host`, with unsafe Rust forbidden at the workspace level.
- The first host slice launches child programs directly without shell interpolation, observes and reaps normal exits, reports start failures with executable context, and kills and reaps a managed child if its supervisor is dropped.
- A dry-run CLI exposes the exact executable and argument boundary without mutation.
- Canonical Home, Back, navigation, selection, and pause actions live outside SDL-specific types behind an input-source trait.
- The SDL3 Rust adapter remains deliberately separate because the current bindings still document incomplete SDL3 migration and missing features. Target-Linux qualification will pin the adapter rather than allowing it to define host contracts.

### Remaining boundary

This scaffold does not qualify SDL3 devices, background input, compositor-reserved controls, browser origin containment, readiness, timeouts, crash presentation, system settings, RetroArch, IPC, camera capture, or native inference. I-209 remains active until those behaviors pass on ordinary x86-64 Linux.

## 2026-07-21: Svelte launcher migration

### Delivered

- The launcher now renders with pinned Svelte 5 and the official Vite plugin; SvelteKit and generic component libraries remain absent.
- Svelte runes own boot, active view, universal search, profile creation/update/selection, settings panels, Wi-Fi scan feedback, developer toggles, clock, toast, and navigation-signal state.
- Boot, search, profiles, and settings have focused component boundaries. A thin `LauncherController` bridge preserves the existing gamepad, keyboard, and Motion Lab integration without forcing an unrelated tracker rewrite.
- The accepted CSS and visual tokens were not changed. The boot signal remains the one orchestrated motion and becomes the active navigation marker.
- The production CSS remains 24.60 kB (5.62 kB gzip). Main JavaScript moved from 184.60 kB (56.37 kB gzip) to 221.84 kB (71.92 kB gzip); this initial 15.55 kB gzip framework cost is accepted provisionally and remains visible for future boot measurements.

### Verification evidence

- `svelte-check` reports zero errors and zero warnings.
- All 15 console-lab unit tests and all 9 Playwright flows pass.
- Reviewed 1440 x 1000 boot/home captures and the 390 x 844 search capture preserve hierarchy, legibility, focus, and narrow-layout behavior.
- Camera worker, explicit main-thread fallback, Motion Lab navigation, overlay defaults, and cooperative web bridge tests remain green.

### Remaining boundary

The migration changes launcher presentation and state ownership only. Profiles and settings remain prototype session state; canonical catalog consumption, Rust host IPC, SDL3/global controls, native Wi-Fi/storage/update services, supervised Museum/RetroArch launch, and target-hardware boot measurements remain open under their existing investigations.

## 2026-07-21: prototype PR review closeout

### Correctness and recovery fixes

- Tracking gaps now reset gesture-hold and wrist-continuity state, preventing an interrupted join, select, Back, or Pause hold from completing instantly after reacquisition.
- Profile selection now uses stable local IDs through selection and rename; duplicate or changed display names no longer determine the active record.
- Universal search traps Tab focus while modal and restores its opener on Escape. Keyboard obstacle controls now obey the same mode and overlay gates as controller input.
- Worker runtime errors remain observed after initialization and release frame backpressure before surfacing a tracker fault.
- MediaPipe player confidence now combines visibility and presence consistently with each landmark's observed state.

### Contract and host fixes

- Game manifests compare normalized origins, preserve extension fields, and export the representable HTTPS/offline cross-field rules. Normalized entrypoint-origin membership remains enforced by `parseGameManifest` because standard JSON Schema cannot compare the origins of two property values.
- Exported Motion JSON Schema now encodes one-and-only-one occurrence of all 17 core and 33 MediaPipe landmark names.
- Bridge wire schemas permit forward-compatible extension fields. Clients safely reconnect after stop, acknowledge delivered frames, and the host keeps one unacknowledged frame in flight before expiring a silent session.
- The Rust CLI's privileged supervise argument boundary now has direct parsing tests. Windows bootstrap requires an active rustup-managed toolchain, and its pnpm wrapper independently enforces Node.js 22.
- Asset and hosted-game health requests have bounded abort timeouts. The browser spike checks HTTP readiness and fails closed unless an explicit development-only override acknowledges that runtime navigation containment is still absent.

### Evidence boundaries retained

- No Hailo runtime tuple is claimed without the target hardware; the source ledger now exposes every required qualification field as unqualified.
- The Steam Machine specification paragraph now cites Valve's official product page and remains labeled as reported until delivery-time inventory.
- The profile-vault research boundary now assigns decryption to a deny-by-default broker with caller- and operation-scoped ACLs and no game-visible access to portraits, calibration records, or body-matching measurements.

## 2026-07-21: shared branded launch states

### Delivered

- One Svelte launch screen now represents remote web, local web, native/Godot, and RetroArch adapters without duplicating visual or navigation behavior.
- A vertical signal trace names the adapter's actual phases. Live elapsed time is always visible; numeric progress appears only when the local launcher has completed known milestones.
- Local Motion launches verify the loaded package, reserve console controls, and transfer focus through the shared screen before opening the selected lab.
- Museum entry checks the browser's network state, keeps `vibecoded.games` visible, and requires a deliberate handoff. Native and Retro previews report that the Rust console host is unavailable instead of implying a working integration.
- Escape, controller Back, controller Home, visible Back/Exit, modal focus containment, and opener-focus restoration share the launcher's existing navigation contract.
- Developer settings can hold each adapter state for review without starting a game or requiring camera hardware.

### Verification evidence

- `svelte-check` reports zero errors and zero warnings.
- Playwright covers all four adapters, exact remote URL, honest progress omission, unavailable-host copy, Escape focus restoration, and narrow-display layout.
- Reviewed 1440 x 1000 and 390 x 844 captures are stored as `test-results/console-lab/launch-state-local.png` and `launch-state-mobile.png`.

### Remaining boundary

At this stage I-154 remained open. The next implementation tranche closes the launcher-layer state contract; native host IPC, real process control, and target-hardware evidence remain separate boundaries.

## 2026-07-22: launch supervision and recovery

### Delivered

- A framework-independent `LaunchSupervisor` now owns launch attempts, phase health signals, heartbeats, slow thresholds, silence detection, absolute timeouts, retry, process-exit reporting, and recovered completion.
- Local launch budgets are 5 seconds to slow, 8 seconds without a health signal to hung, and 15 seconds absolute. Hosted launch budgets are 10, 15, and 30 seconds, matching D-106's interaction gates without treating a heartbeat as permission to wait forever.
- The shared Svelte screen distinguishes in-progress, slow, ready, offline, not responding, crashed, recovering, recovered, and unavailable states. It exposes Retry only for recoverable faults and keeps Details and Exit controller-routable.
- Diagnostic disclosure reports a stable code, attempt number, last signal, relative signal time, and absolute timeout without exposing logs or personal data.
- Local Motion launch uses real package/control/focus milestones. Museum entry uses the browser's actual online state while stating that target reachability remains a native-host check. Native and Retro adapters continue to report the absent Rust host honestly.
- Developer-only fault injection can hold or generate slow, offline, heartbeat-timeout, process-exit, and recovered states without camera or target hardware.

### Verification evidence

- Deterministic unit tests distinguish slow work from silence, prove heartbeats cannot extend the absolute deadline, separate offline from process exit, and require a successful second attempt before reporting recovered.
- Playwright drives the actual Svelte screen through slow, offline, Retry, recovered, hung, crashed, and diagnostic-detail states.
- The reviewed `test-results/console-lab/launch-state-crashed.png` capture preserves the minimal phase trace, coral terminal-fault cue, exact exit code, Retry, Details, and Exit at 1440 x 1000.

### Remaining boundary

I-154 closes the launcher-layer state and recovery contract. I-109 remains open for real Rust child-process heartbeat, forced termination, launcher restart, post-ready crash/hang/OOM handling, and target-Linux fault injection. Cross-origin remote reachability, native/Godot readiness, and RetroArch readiness require that host integration rather than browser fabrication.

## 2026-07-22: data-flow map and raw-frame egress audit

### Delivered

- `DATA_FLOWS.md` maps current and planned flows for raw frames, portable/rich skeletons, actions, profiles, portraits, calibration, saves, diagnostics, hosted traffic, local assets, and the cooperative Motion bridge.
- Each data class records source/path, storage and retention, recipients, user control or consent, implementation status, invariants, failure behavior, and the events that require requalification.
- The map separates application guarantees from browser, GPU driver, operating-system, firmware, swap, crash-dump, developer-tool, and compromised-origin behavior that the web prototype cannot prove.
- A Chrome observation test now starts the actual pinned local tracker with a synthetic camera, waits for derived skeleton traces, stops capture, and audits requests and browser persistence.
- The test fails on external-origin traffic, mutating methods, request bodies, suspicious raw-media query parameters, Local/Session Storage keys, IndexedDB databases, Cache Storage entries, or service-worker registrations.
- The accompanying source/failure audit traces the only raw-pixel protocol field through one-frame transfer and guaranteed bitmap closure, and confirms the sole Blob download path validates a trace with `containsRawFrames: false`.

### Verification evidence

- Active camera inference produced derived trace frames while the network/persistence observation remained empty.
- Worker fallback, frame-gate, late-run rejection, schema, bridge projection, acknowledgement, expiry, and skeleton-only export evidence remain linked from the data-flow audit.
- I-133 is closed because every requested data class now has a durable flow artifact. I-134 advances to active browser evidence rather than claiming the unbuilt native/target path is qualified.

### Remaining boundary

I-134 requires repetition with a real camera and target browser, plus native tracker IPC, OS/GPU/crash-dump/swap observation, Hailo or other inference backends, and target-Linux filesystem/network monitoring. Portrait capture, encrypted profile storage, save isolation, and bounded native logs remain unimplemented and retain their existing privacy, consent, security, and legal gates.

## 2026-07-22: versioned coordinate-frame contract

### Delivered

- Motion capabilities now declare coordinate specification `0.1.0`, the image coordinate identifier, and an explicit world coordinate identifier exactly when `body.world3d` is advertised.
- The image frame is unmirrored, top-left-origin, normalized by image width/height, and permits inferred points outside the nominal rectangle.
- A normative player-relative transform uses hip midpoint origin, anatomical left-to-right +x, hip-to-shoulder +y, torso-length scale, and roll-orthogonalized axes.
- A calibrated floor transform applies a versioned 3×3 image-to-floor homography into camera-right/away meters and rejects points at infinity rather than fabricating a location.
- The current optional world frame is deliberately named `player.metric.hip-origin.provider-axes`: meter units and hip origin are known, but axis parity across MediaPipe, Hailo, RTMO, and future backends is not claimed.
- Cooperative bridge projection now removes the world coordinate identifier whenever it removes the world profile and landmark values.

### Verification evidence

- Transform tests cover translation/scale invariance, body roll, image/player round trips, degenerate anchors, metric floor projection, perspective division, and points at infinity.
- Runtime validation rejects a world profile without world semantics and world semantics without the profile.
- Exported Motion and bridge JSON Schemas encode the same representable cross rule.
- Existing MediaPipe, replay, synthetic, bridge, schema, and browser fixtures declare the versioned coordinate contract explicitly.

### Remaining boundary

I-058 is closed as a specification/transform task. Floor calibration confidence, room-change invalidation, real jump/floor evidence, Hailo mapping, and cross-backend provider-world axis conversion remain under I-059, I-073, and I-161.
