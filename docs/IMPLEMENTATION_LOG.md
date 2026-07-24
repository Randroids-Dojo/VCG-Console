# Implementation record

Last updated: 2026-07-23

This file records what has actually been built and verified. It does not convert desk evidence into Raspberry Pi, ordinary x86-64 Linux, SteamOS, real-room, or product qualification.

## 2026-07-19: first reversible desk slice

### Delivered

- pnpm workspace with independent Motion API, game-manifest, console-lab, asset-preparation, schema-export, catalog-validation, and hosted-process supervision surfaces.
- Motion API `0.2.0`: exact 17-point core, optional MediaPipe 33 and world-coordinate profiles, named timestamp quality, tracker health, temporal standardized obstacle/shell actions, skeleton-only traces, generated Draft 2020-12 schema, and explicit required/optional capability negotiation.
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

At this checkpoint I-154 closed the launcher-layer state and recovery contract while I-109 still lacked the native connection. The later D-136 tranche adds opt-in Rust heartbeat/restart enforcement; launcher service restart, protected real GPU/OOM signals, target-Linux fault injection, cross-origin remote reachability, native/Godot readiness, and RetroArch compositor readiness still require host evidence rather than browser fabrication.

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

## 2026-07-22: native game watchdog and bounded recovery

### Delivered

- The Rust host now offers a `watchdog` command beside direct `supervise`, without shell interpretation.
- A host-owned heartbeat file distinguishes startup silence from post-ready heartbeat loss. Each changed value is one signal; stale files are removed before every attempt and probe reads are capped at 4 KiB.
- A separate host-owned fault file accepts only `gpu-reset` or `out-of-memory`, providing a narrow boundary for later cgroup/driver adapters without claiming those detectors exist.
- Startup timeout, heartbeat timeout, non-zero process exit, and explicit resource faults all force termination and reaping before a bounded restart.
- Default local budgets match the launcher contract: 15-second startup, 8-second heartbeat silence, 100 ms polling, 250 ms backoff, and one restart.
- Stable line events report started, ready, restarting, completed, and failed states with attempts and reasons. Healthy heartbeats update the internal deadline without generating an unbounded event stream. The launcher remains the parent and therefore regains control when the child completes or recovery is exhausted.

### Verification evidence

- Native subprocess tests cover normal exit, cleanup-on-drop, crash-then-success recovery, repeated startup hang with bounded exhaustion, post-ready heartbeat loss, and recovery after injected GPU-reset and out-of-memory signals.
- File-probe tests cover stale-state removal, new versus unchanged heartbeats, exact resource-fault parsing, and rejection of empty, non-UTF-8, oversized, and unknown content through bounded recovery.
- CLI tests cover required heartbeat/program arguments, all timeout/restart options, dry-run behavior, and preservation of child options.
- `cargo fmt`, strict workspace Clippy, and the complete native test suite pass.

### Remaining boundary

I-109 advances to active but is not closed. Real Linux cgroup OOM classification, GPU-reset detection, descendant process-group containment, compositor/browser hangs, launcher IPC/re-entry, service-manager restart of the launcher itself, and ARM64/x86-64 target fault injection remain required. A game or wrapper must atomically replace the changing heartbeat content; merely touching a file is not the contract.

## 2026-07-23: contained RetroArch launch foundation

### Delivered

- The game manifest now has a strict `libretro` contract for frontend/core identities, versions, sources, licenses, architectures, optional artifact hashes, content mode/hash, controller profile, save namespace, and BIOS inventory.
- Runtime parsing requires an exact `libretro:<core-id>` entrypoint, native architecture parity, offline operation, no web origins, restricted permissions, non-HTTP health, and no contentless launch unless the core declares no-game support. A manifest cannot be called qualified until frontend and core SHA-256 hashes are present.
- The new Rust adapter resolves symlinks and confines the frontend, core, and base configuration to the installed-package root. Imported content must resolve beneath a separate console-managed content root, so RetroArch cannot launch directly from USB or an arbitrary user path.
- The host generates one private append configuration and distinct cache/log/save/state/remap/screenshot/system/core-option directories per profile and game. It disables mutable/network-facing RetroArch surfaces, selects kiosk/fullscreen behavior, redirects writable paths, and atomically publishes the configuration.
- `vcg-host retroarch` supports a no-mutation dry run and a direct no-shell launch with stable prepared/started/completed lifecycle lines. It does not fabricate a heartbeat or window-ready event that RetroArch does not provide.
- The catalog and launcher expose 2048 as an uninstalled, unverified qualification candidate. Search finds it across hubs; the native-host-unavailable state remains explicit in the browser prototype.
- The new owner-question document records two non-blocking product choices rather than interrupting implementation.

### Verification evidence

- Manifest unit tests cover exact core entrypoint, architecture mismatch, missing qualification hashes, network/origin/permission escape attempts, invalid contentless launch, and libretro fields on another runtime.
- Rust tests cover exact direct arguments, contentless menu handoff, private storage/config creation, unmanaged content, unmanaged core, path traversal, relative roots, and missing content authority.
- The generated JSON Schema and all four catalog manifests validate.
- Strict Rust formatting/Clippy and the complete native test suite pass for the software-only desk boundary.
- The 1440 x 1000 `test-results/console-lab/retro-candidate.png` review keeps the uninstalled state dominant, gives the candidate one restrained catalog row, and preserves the existing minimal OCR-A hierarchy.

### Remaining boundary

I-198 is active, not closed. No RetroArch or 2048 binary was downloaded or bundled. Exact signed artifacts and hashes, reproducible ARM64/x86-64 packages, one-action Start Core, launcher IPC, compositor window readiness and hang recovery, descendant containment, SDL3/reserved controls, target audio/video/latency, and update/removal cleanup remain required. Configuration restriction is defense in depth; target OS sandboxing still has to prove there is no unrestricted desktop or filesystem route.

## 2026-07-23: RetroArch artifact-integrity enforcement

### Delivered

- The native RetroArch request now requires canonical SHA-256 values for the frontend and core, plus an exact content hash whenever managed content is present.
- Hashes use the same 64-character lowercase hexadecimal form as the game manifest. Malformed, missing, unexpected, and mismatched values fail closed.
- The host resolves and confines each file first, then streams it through SHA-256 before it creates session directories, publishes configuration, or launches a process. Large content files are not read into memory at once.
- `vcg-host retroarch` exposes explicit frontend/core/content hash arguments, closing the gap where a correct path could still contain a substituted artifact.
- `sha2` 0.11.0 is pinned without default features; its transitive versions are locked in `Cargo.lock`.

### Verification evidence

- Native tests prove exact digest parsing/round-trip, uppercase/non-hex/incorrect-length rejection, frontend/core/content success, core mismatch failure, missing managed-content hash failure, and rejection of a hash on contentless launch.
- Strict Rust formatting, Clippy, and the full subprocess/native suite pass with 31 ordinary tests plus four intentionally ignored helper entrypoints.

### Remaining boundary

The host enforces integrity values but does not decide which manifest is trusted. Signed package/manifest verification, rollback/revocation policy, authenticated launcher-to-host IPC, and an immutable or file-descriptor-bound verification-to-use path must bind these expected hashes to the approved catalog before target qualification.

## 2026-07-23: authenticated native-host discovery

### Delivered

- A real `vcg-host launcher` run now starts an ephemeral status listener on IPv4 loopback before launching Chromium and keeps it scoped to the browser lifecycle.
- Each launch receives a fresh 256-bit operating-system-random bearer capability. The port and capability travel in the app URL fragment rather than the query, server request, or referrer.
- The Rust endpoint implements protocol `0.1.0`, exact-origin CORS/preflight, constant-time token comparison, no-store responses, bounded request parsing and I/O deadlines, and rejection of unsafe configured origins or ambiguous security headers.
- The Svelte launcher strictly parses the fragment, sends no cookies or referrer, applies one deadline through response-body consumption, caps the streamed status body at 16 KiB, validates the status document and protocol, and distinguishes missing, invalid, unreachable, rejected, incompatible, and malformed hosts.
- Native and RetroArch previews now verify the host before reporting the still-honest `PACKAGE_NOT_INSTALLED` boundary. A connected host alone does not fabricate package availability or readiness.
- `NATIVE_HOST_API.md` records the protocol and non-negotiable rule that future browser requests provide only high-level intent while the Rust host resolves signed manifests, artifacts, permissions, paths, and adapters.

### Verification evidence

- The console lab has 33 passing unit tests, including strict authority parsing, all host error classes, malformed or oversized status and content-length declarations, protocol mismatch, and a response body that stalls beyond the request deadline.
- The Rust library has direct coverage for authenticated status, browser preflight, wrong token/origin, per-launch token uniqueness, fragment placement, unsafe allowed origins, and duplicate security headers.
- All 17 Playwright flows pass; the native flow observes the exact bearer authorization and distinguishes a compatible host from a missing trusted package.
- Svelte diagnostics, strict Rust formatting, Clippy, and the complete native test suite pass on the x86-64 Windows compatibility workstation.

### Remaining boundary

This closes only authenticated discovery, not privileged launch IPC or target qualification. Signed installed-manifest resolution, narrow launch requests, event delivery and replay policy, navigation/process-inspection threat tests, compositor readiness, reserved Home/Back, target-Linux sandboxing, and service-manager recovery remain open under I-109 and I-209. D-129 is deliberately working and reversible.

## 2026-07-23: first-prototype acceptance contract

### Delivered

- `PROTOTYPE_SUCCESS_CRITERIA.md` turns the existing room, launch, motion, latency, offline, escape, privacy, and recovery requirements into one pass/fail checklist scoped to an exact commit, configuration, room, and evidence bundle.
- Timing paths require at least 20 complete trials, publish every failure plus p50/p95/worst, retain D-106's 5/60/15/30-second limits, and add a working 250 ms visible-feedback bound.
- Required motion actions use pre-registered working gates of at least 95% precision and 90% recall per blocking persona and qualified placement. Privileged Back, Pause, Resume, and Exit require zero false activations during the scripted negative/idle run.
- The latency row can pass only from camera exposure to game-API receipt at <= 120 ms p95. Capture-arrival and inference-only timing remain explicitly insufficient.
- The checklist makes offline core behavior, 300 ms loss confirmation, two-second reacquisition, controller-only recovery, exact overlay focus, raw-frame/microphone boundaries, bounded restart, service recovery, 60-minute soak, school-age/adult standing personas, and the 8 x 8 ft room evidence independently auditable.
- D-130 records feedback/sample/accuracy values as reversible working gates, and a new owner-question document preserves the three threshold choices without blocking evidence work.

### Evidence boundary

I-007 closes because the acceptance criteria and evidence rules now exist. No current desk, Windows, x86-64 Linux, Raspberry Pi, Hailo, Steam Machine, camera, room, or game configuration is represented as passing. Each configuration must still produce the linked I-001/I-002/I-015/I-023/I-053/I-109/I-134/I-155/I-194/I-209/I-210 evidence before it may use the checklist's passing claim.

## 2026-07-23: online/offline service contract

### Delivered

- `ONLINE_OFFLINE_SERVICE_MATRIX.md` classifies boot, launcher, input, tracking, Motion bridge, local games, profiles, saves, Retro, imports, networking, updates, diagnostics, time, Museum, hosted games, and optional Steam features under five explicit network classes.
- Core launcher, tracking, controlled installed gameplay, profiles, saves, diagnostics, and Retro behavior remain offline-required. Museum/current hosted entries are network-required; updates and USB import are maintenance-only; paired LAN workflows are session-scoped rather than hidden WAN dependencies.
- The current catalog matrix records Determined, Mi Casa Es Su Casa, and VibeBots as network-required remote experiences without inventing offline packages. The Retro 2048 candidate remains offline but uninstalled and unqualified.
- Manifest and future host rules distinguish offline, optional, and required services; deny network permission to offline packages; keep primary gameplay offline for family-mode installed packages; and reserve signed manifest/origin resolution to the Rust host.
- A failure matrix now covers interface loss, WAN/LAN separation, DNS, refusal, timeout, TLS, captive portals, mid-operation loss, restoration, invalid time, and interrupted maintenance with required state, timeout, recovery, cleanup, and egress evidence.

### Evidence boundary

I-009 closes as a contract task. Native network containment, optional-service inventory, installed-local enforcement, signed manifest resolution, update/import services, target offline runs, and the hosted game compatibility matrix remain open under their existing investigations. A cached page, Steam Offline Mode, or a LAN development server cannot satisfy the offline qualification claim.

## 2026-07-23: signed installed-package resolution

### Delivered

- The Rust host now loads a bounded detached Ed25519-signed installed catalog, verifies the signature before JSON parsing, rejects unknown fields, and requires schema version 1, a positive generation, the exact compiled architecture/OS target, unique bounded IDs, and `qualified` entries.
- Signed relative paths and SHA-256 values bind the exact public game manifest, RetroArch frontend, core, base configuration, and optional managed content. Host-configured canonical install/content/runtime/data roots remain outside browser authority.
- Manifest resolution verifies the signed digest and exact ID/version/runtime/qualification identity. RetroArch planning re-verifies every launch artifact before creating runtime state, including the newly required base-configuration hash.
- The authenticated host API advertises `trusted-package-catalog` only when configured and exposes a read-only `GET /v1/packages/<game-id>` endpoint containing only ID, version, runtime, and catalog generation.
- Svelte sends only the fixed catalog game ID, rejects missing capability, malformed/mismatched metadata, and absent packages, and reports `PACKAGE_LAUNCH_PENDING` honestly because privileged execution is not connected.
- D-131 records the reversible trust boundary; `INSTALLED_PACKAGE_CATALOG.md` records the envelope, schema, host configuration, security invariants, and remaining gates. A new owner-question document preserves key hierarchy, rollback scope, and profile-identity choices without blocking safe implementation.

### Verification evidence

- Rust catalog tests cover valid signed resolution, signature-before-parse rejection, tamper, wrong target, unknown fields, duplicate IDs, unsafe paths, noncanonical key material, size limits, invalid browser intent, absent packages, manifest tamper/misbinding, changed base configuration, and final RetroArch-plan acceptance.
- Host-API tests cover conditional capability discovery, metadata-only package lookup, invalid IDs, and missing packages without disclosing signed paths or hashes.
- TypeScript tests cover fixed-ID-only requests, capability gating, 404 fail-closed behavior, invalid intent, mismatched returned identity, and the absence of browser-supplied path/hash/program/command authority.
- Playwright covers the Svelte Retro lookup end to end and proves that a resolved signed package still stops before execution.
- Strict Rust formatting and Clippy pass; 42 Rust library tests and 12 CLI tests pass with four helper entrypoints intentionally ignored. All workspace unit suites pass, including 36 console-lab tests; Svelte reports zero errors and warnings; the production build and all four manifest validations pass; and all 18 Playwright flows pass. Cargo Audit 0.22.2 scans all 34 locked Rust dependencies against 1,169 RustSec advisories with no vulnerability finding.

### Remaining boundary

This is package authority and safe discovery, not a production package lifecycle or game launch. Offline-root delegation, immutable public-key provisioning, key rotation/revocation, persisted channel-scoped anti-rollback, signed installation and atomic promotion, immutable verification-to-child binding, stable host profile IDs, launch replay/idempotency policy, lifecycle events, cancellation, visible readiness, reserved Home/Back, sandboxing, update/removal cleanup, and target-Linux evidence remain open under I-101, I-109, I-141, I-198, and I-209.

## 2026-07-23: fixed-intent native launch lifecycle

### Delivered

- The authenticated host API now accepts only versioned 128-bit request ID, signed game ID, and host-allowlisted profile ID intent. Strict 1 KiB JSON and 8 KiB total request bounds, duplicate framing rejection, transfer-encoding rejection, exact route/method preflight, and unknown-field denial fail closed before launch.
- Rust re-resolves the signed catalog, manifest, runtime artifacts, base configuration, content, storage roots, and final `RetroArchPlan`; the browser still cannot supply a program, path, command, hash, environment, or writable root.
- A per-host-lifetime coordinator permits one active native game, retains at most 64 lifecycle records, replays identical request IDs without re-execution, rejects conflicting reuse, starts directly without a shell, observes exit, and cancels/reaps on request or host shutdown.
- Lifecycle polling exposes only protocol, request/game/profile IDs, monotonic sequence, state, stable detail code, replay marker, and terminal exit code. Process IDs and native implementation details stay private.
- Launcher profiles now carry bounded opaque desk-prototype IDs separately from display names. Host configuration must explicitly list launchable IDs with repeatable `--profile-id`; catalog-only mode remains metadata-only.
- Svelte checks catalog and launch capabilities separately, submits fixed intent, validates lifecycle identity and nondecreasing sequence, polls while in progress, and requests cancellation on Exit, timeout, stale handoff, or invalid state. It reports process failure honestly and never converts process start into `READY`.
- D-132 records the reversible launch boundary.

### Verification evidence

- Strict Rust formatting and Clippy pass. Fifty Rust library tests pass with four helper entrypoints intentionally ignored, and all 12 CLI parser tests pass.
- Native tests cover host-profile allowlisting, invalid intent, signed direct process start, pre-start failure records, replay without re-execution, request conflict, lifecycle sequence, idempotent cancellation, route-specific preflight, duplicate/ambiguous framing, unexpected bodies, and metadata/path non-disclosure.
- All workspace unit suites pass, including 41 console-lab tests. TypeScript tests cover fixed-intent POST, 422 lifecycle failure, identity validation, authenticated polling/cancellation, and absence of native authority fields.
- Svelte reports zero errors and warnings; the production build and all four public manifest validations pass; all 18 Playwright flows pass. The Retro flow proves that its only POST body is protocol, random request ID, `retro-2048`, and `profile-randy`, then displays the host failure without inventing readiness.

### Remaining boundary

This was process lifecycle, not a qualified playable handoff. The later D-136 tranche connects opt-in watchdog games without changing the remaining boundary: request records are not persistent across host restart; the Svelte profile list is not a native persistent registry; polling is not a measured event transport; descendant process groups are not contained; cancellation is not yet proven under hostile children; no compositor window identity/readiness exists; and reserved Home/Back, re-entry, immutable artifact handoff, target-Linux sandboxing, service-manager recovery, and hardware evidence remain open.

## 2026-07-23: API launch watchdog integration

### Delivered

- Host configuration may repeat `--watchdog-game-id` for games present in the signature-verified installed catalog. Browser launch intent and public/package manifests cannot enable watchdog mode or select probe paths.
- Selected games derive a heartbeat file below the prepared private session directory and pass it as `VCG_HEARTBEAT_FILE` to the signed child or trusted wrapper. The integrated path omits a resource-fault file until a trusted OS producer and child containment exist.
- A cancellation-aware watchdog terminates and reaps an active direct child, interrupts restart backoff, and checks cancellation before another spawn.
- Startup timeout, heartbeat timeout, invalid health data, and non-zero process exit consume the bounded retry budget. Every retry remains inside the original request record, so replay protection and the one-active-launch invariant continue to apply. GPU-reset and out-of-memory injection remain available only through the generic watchdog CLI.
- Native lifecycle records expose stable bounded health/restart/failure detail codes without paths or process IDs. Svelte presents runtime recovery while continuing to wait for compositor/window readiness.
- Process-only games remain explicit compatibility mode for packages such as direct RetroArch that do not yet implement the heartbeat contract. A heartbeat is runtime-health evidence, never proof of a visible usable window.
- D-136 records the host-owned opt-in and readiness boundary.
- `OWNER_QUESTIONS_WATCHDOG_2026-07-23.md` preserves exact-release binding and production health-producer ownership without blocking the desk-safe default.

### Verification evidence

- Process tests prove cancellation during an active attempt and during restart backoff; no post-cancel attempt spawns.
- Native-launch tests prove watchdog-game catalog membership/policy validation and one bounded retry of the catalog-resolved child inside one monotonic lifecycle record.
- Rust formatting and Clippy pass; all 56 active Rust library tests and 12 CLI tests pass, with four subprocess helpers intentionally ignored.
- All 112 workspace tests, workspace type checking, the production build, all four manifest validations, and all 18 Playwright flows pass. pnpm reports no known vulnerabilities, and Cargo Audit scans all 34 locked Rust dependencies against 1,169 advisories with no finding.

### Remaining boundary

No current RetroArch package or compositor producer is qualified to emit heartbeats. Probe files are not protected from a compromised same-account child, descendant process groups/cgroups remain uncontained, and real Linux GPU/OOM signals, compositor readiness/re-entry, hostile-child cancellation, service-manager restart, architecture parity, and target hardware fault injection remain open under I-109, I-198, and I-209.

## 2026-07-23: canonical game manifest v1

### Delivered

- `GAME_MANIFEST_CONTRACT.md` defines the public manifest's exact v1 compatibility rule, runtime cross-field requirements, diagnostic surface, generated-schema relationship, migration procedure, and separation from signed installed-package authority.
- The package exports one schema-version constant, the canonical `urn:vcg:schema:game-manifest:1` identifier, and stable code-unit-sorted `path: [issue-code] message` formatting for author tooling.
- Canonical fixtures cover remote web, local web, native, and Libretro manifests. Invalid fixtures lock unknown-version, offline-network, origin-binding, and qualified-artifact-hash failures to expected diagnostics.
- `pnpm validate:manifests` now rejects a missing or byte-stale checked-in game-manifest JSON Schema before validating the catalog.
- D-133 records the reversible compatibility policy. I-093 and Q-045 close; packaged adapters, installation lifecycle, and runtime enforcement remain in their own investigations.

### Verification evidence

- The game-manifest package passes 15 tests, including all canonical fixture pairs and exported-schema rules. All 93 workspace unit tests pass.
- Every workspace typecheck and the production build pass; the checked-in schema matches the runtime export, and all four catalog manifests validate.

### Remaining boundary

Manifest validity is not qualification, redistribution authority, installation approval, signature verification, artifact integrity, origin containment, storage isolation, or a working launch adapter. Those remain enforced or investigated separately under I-094, I-095, I-096, I-101, I-104, I-105, I-136, and I-141.

## 2026-07-23: player session and recovery state machine

### Delivered

- Replaced the one-player boolean tracking-loss helper with a pure one-to-two-player `PlayerSessionController` and made the console lab consume its one-player path.
- Passive tracks remain candidates until an explicit visible-candidate join. Assignments are sequential, stable session slots with Player 1 before Player 2.
- Ordinary loss requires elapsed time and multiple missing updates; hard faults and time regression freeze immediately. Confirmed loss of either player freezes the shared session.
- Silent recovery accepts only every lost original session track inside the two-second window. After expiry, recovery never auto-resumes.
- Recovery supports deliberate one-player candidate takeover and requires either every retained multiplayer track or an explicit non-empty roster reduction.
- Manual pause ownership uses earliest completion with a lower-slot tie-break, cannot be stolen after opening, and transfers launcher ownership through an exit flow.
- Recovery Exit resets the active lab session and returns the visible body to candidate status instead of hiding a frozen session behind the overlay.
- `PLAYER_SESSION_STATE_MACHINE.md` records identity boundaries, phases, transitions, ownership, failure behavior, implemented evidence, and the remaining qualification boundary. D-135 records the working contract.

### Verification evidence

- Unit tests cover passive candidates, sequential join, sustained multi-update loss, global two-player freeze, wrong-track rejection, all-player silent recovery, overlay expiry, deliberate takeover, safe roster reduction, pause races/owner isolation, hard faults, time regression, duplicate tracks, and invalid timing.
- Existing action, console, launcher, camera-privacy, bridge, manifest, and browser-flow gates remain part of the full workspace verification.

### Remaining boundary

This is deterministic desk behavior, not two-player qualification. Separate calibration, accessible player identities, crossing/occlusion evidence, controller-only recovery, explicit leave/re-entry UI, multi-player action routing, target-Linux tracker restart, game-runtime freeze enforcement, and physical spectator/pet/mirror/television abuse tests remain under I-054, I-056, I-057, I-059, I-069, I-150, and I-161.

## 2026-07-23: Motion standardized action lifecycle

### Delivered

- Motion API `0.2.0` adds an explicit `cancelled` phase and makes `triggered` the only phase that may cause navigation or gameplay. The version bump is deliberate because strict `0.1.0` consumers would reject the new phase.
- Every standardized action now belongs to exactly one negotiated obstacle or shell profile. The cooperative bridge uses the shared ownership table rather than maintaining a second name list.
- Enriched frames consistently advertise both recognizer-owned action profiles. Runtime and generated wire schemas reject actions whose owning profile is absent and reject contradictory discrete/sustained phase, duration, or cancellation-confidence shapes.
- Sustained gestures publish deterministic started, held, triggered, ended, or cancelled lifecycles with sampled duration and confidence. A hold triggers at most once before release.
- Discrete jump, duck, dodge, and swipe gestures use entry/release hysteresis and remain latched until the signal returns through the release band, so a held pose does not repeat after cooldown.
- Shell, game, and console-overlay contexts gate eligible actions. Changing context closes the old hold before starting a new timer, and an uninterrupted join hold cannot silently become selection.
- Per-action cooldown, publication-time regression reset, and normative within-frame sorting fail closed. Terminal feedback precedes new progress; privileged Pause/Back triggers precede gameplay triggers.
- The console lab displays lifecycle feedback but dispatches behavior only for `triggered`. Replay expectation scoring likewise ignores started, held, ended, and cancelled events.
- `MOTION_ACTIONS_V1.md` records profile ownership, phase grammar, context, hysteresis/cooldown, confidence/time, ordering, and the remaining qualification boundary. D-134 records the reversible schema change.

### Verification evidence

- Motion-contract tests cover cancellation parsing, exclusive profile ownership, deterministic phase/action ordering, explicit `0.2.0` rejection of old frame versions, and triggered-only replay scoring.
- Console-lab tests cover full join progress/trigger/end, pre-trigger cancellation, landmark-loss cancellation, context restart, no delayed cancellation after player loss, game/shell gating, release hysteresis/rearm, and timestamp-epoch reset.
- Bridge projection tests continue to prove negotiated action-family filtering through the shared contract.
- Generated schemas are fresh; all 104 workspace tests, workspace type checking, the production build, all four manifest validations, and all 18 Playwright flows pass. The pnpm audit reports no known vulnerabilities.

### Remaining boundary

This is deterministic temporal behavior on synthetic desk frames, not proof that the gestures are safe or usable. Exact calibrated v1 movement thresholds, stable-focus rules, smoothing, one-handed and limited-range alternatives, two-player ownership, backend parity, real-room traces, precision/recall, false privileged actions, compositor enforcement, and target-hardware latency remain open under I-056, I-060, I-161, I-183, and I-210.

## 2026-07-23: repository security threat model

### Delivered

- `SECURITY_THREAT_MODEL.md` covers the complete repository rather than one feature diff: camera/tracking, derived Motion data, web origins, hosted navigation, trusted launcher, authenticated loopback IPC, signed packages, native children, writable state, maintenance, developer mode, and the build supply chain.
- The model distinguishes normal household users, hostile games/origins, local processes, package/update attackers, untrusted retro content, paired developers, operating-system administrators, and dependency/build compromise.
- Ten trust boundaries and eleven invariants make native authority, raw-frame privacy, Motion projection, global recovery, path containment, descendant ownership, offline behavior, deletion scope, bounded parsing, and truthful readiness explicit.
- Each surface records existing controls separately from missing target or future-service controls, then maps realistic attacker stories and required abuse tests.
- Severity calibration gives repository-specific Critical, High, Medium, and Low examples and explicitly lowers cases that require root, deliberate developer enablement, invasive physical access, or affect only one unapproved build.
- The threat-model skill cache is keyed to the sanitized repository identity and exact reviewed Git revision for reuse by later security scans. I-135 closes.

### Evidence boundary

This is a reusable threat model, not a vulnerability scan or proof that every mitigation works. I-136 navigation/permission containment, I-141 key/rollback qualification, I-142 fuzzing, I-184 profile privacy review, I-209 target native-host qualification, and installer/update/import/sandbox investigations remain independently open.

## 2026-07-23: signed package generation activation

### Delivered

- Added a host-owned package generation store with explicit `staging`, `generations`, and append-only-by-contract `activations` namespaces.
- Promotion verifies the detached Ed25519 catalog before parsing and verifies every referenced manifest, frontend, core, base configuration, and managed-content SHA-256 before publishing durable intent.
- Candidate generation must strictly advance the highest committed generation. Deliberate rollback must use a newer signed catalog selecting older package versions; signed trust state never decrements.
- A synchronized, no-replace intent binds transaction ID, generation, and exact catalog digest. The verified staging directory moves within the same store filesystem, is re-verified from its final path, then a no-replace hard-link entry commits its activation marker. Competing intent publication cannot replace an owner, and recovery handles interruption after activation but before intent unlink.
- Recovery deterministically resumes when interruption occurs either before or after the generation-directory move. An incomplete stage without durable intent remains inert.
- Active load re-verifies the highest activation marker, signed catalog, and every artifact. Malformed newest state fails closed rather than silently falling back.
- Package generation paths remain separate from the configured managed-content and persistent data/save roots; update tests preserve committed save bytes.
- `PACKAGE_GENERATION_STORE.md` records D-137, layout, activation grammar, interruption states, save boundary, evidence, and unimplemented service/health/cleanup work.

### Verification evidence

- The Rust workspace passes 65 active library tests with four subprocess helpers ignored by the parent run, plus 12 CLI tests.
- New tests cover first promotion, higher-generation update, equal-generation rejection, tamper before intent and after the generation move, managed-content verification, save preservation, both generation-move interruption boundaries, competing no-replace intents, activation-before-unlink recovery, repeat recovery, and corrupt-newest fail-closed behavior.
- Rust formatting and workspace Clippy with warnings denied pass. `git diff --check` is clean.

### Remaining boundary

This is a package-state primitive, not an update service. It does not download or extract packages, reserve disk headroom, synchronize producer-written candidate files, launch provisional releases for health checks, automate bad-release rollback, rotate/revoke keys, garbage-collect old snapshots, uninstall packages, or implement the developer namespace. Unix builds synchronize marker and rename-parent directories; Windows proves only logical recovery. Real filesystem, low-space, sudden-power, immutable-mount, hostile-concurrency, and target-Linux qualification remain open.

## 2026-07-23: active-generation launcher bootstrap

### Delivered

- Added `--package-store-root` as a mutually exclusive alternative to loose catalog/signature/install-root launcher configuration.
- Normal startup first validates the browser request, then opens the host-owned store, completes any valid durable promotion intent, re-verifies the greatest active signed generation and every artifact, and creates the launcher API and browser process.
- Empty stores, invalid recovery state, changed artifacts, or invalid active markers prevent startup rather than falling back or launching loose paths.
- Dry-run remains read-only: it validates pending-intent state, refuses to recover it, and otherwise reports only catalog source, generation, target, and configured allowlist counts.
- Store-backed and loose-catalog modes preserve the same host-owned profile and watchdog-game allowlists; neither changes the browser's fixed-intent authority.

### Verification evidence

- Strict launcher parsing tests accept a complete store configuration and reject partial or mixed store/loose sources.
- Generation-store tests detect valid pending recovery before and after the generation move and confirm clean state after completion.
- The Rust workspace passes 65 active library tests plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

The launcher takes one verified startup snapshot; it does not hot-reload package state. Package download/intake, health-gated promotion, protected per-channel anti-rollback state, update progress UI, uninstall/garbage collection, key lifecycle, read-only mounts, service-manager policy, and target-Linux power-loss evidence remain open.

## 2026-07-23: read-only package retention planning

### Delivered

- Added a path-free cleanup plan that retains at least the two newest activated generations and classifies older activated snapshots separately from unreferenced generation directories.
- Planning refuses durable promotion intent, malformed markers, unsafe or unexpected generation entries, and activated markers whose generation directory is missing.
- The active generation is re-verified before a plan is returned. Staging, markers, package files, managed content, and saves remain untouched.
- Q-113 and Q-114 preserve the owner choices for the exact count/byte budget and cleanup while a child may still reference an older generation.

### Verification evidence

- New Rust tests cover deterministic retained/retired/orphan classification, minimum-retention rejection, pending-recovery refusal, inconsistent-history refusal, and proof that planning removes nothing.
- The Rust workspace passes 67 active library tests with four subprocess helpers ignored by the parent run, plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

This is classification, not garbage collection. Marker or directory deletion stays disabled until native process coordination proves no active or restartable child references a candidate, the owner selects retention policy, low-space behavior is qualified, and interruption tests cover each deletion boundary.

## 2026-07-23: signed candidate health gate

### Delivered

- The Rust installed-catalog authority now re-hashes each bound manifest before extracting its 1-120 second launch timeout and local `process` or `explicit-ready` health kind.
- The only public generation-promotion entry point runs every package through that exact signed policy. Artifact-only activation remains private to generation-state tests.
- Candidate plans resolve through the signed catalog and RetroArch adapter, then replace runtime and data roots with transaction/game-specific ephemeral paths. No player profile or persistent save root is used.
- Process health requires the direct child to survive the entire signed window. Explicit-ready supplies one host-derived `VCG_READY_FILE` and accepts only a bounded non-empty UTF-8 regular file before timeout.
- Success, invalid token, timeout, and other failure paths terminate and reap the candidate child. Failure occurs before durable intent and leaves the old generation authoritative.
- Promotion re-loads the candidate and requires the exact catalog digest observed by health before publishing intent.
- D-138 records the mechanism and its non-readiness meaning. Q-115 and Q-116 preserve the process-window and exact producer-qualification choices.

### Verification evidence

- Signed-catalog tests cover process and explicit-ready extraction, exact timeout, HTTP/unknown rejection for installed Libretro, missing/out-of-range policy failure, and health-policy tamper binding.
- Health-runner subprocess tests cover process survival, early exit, explicit-ready success, invalid token rejection, timeout behavior, bounded polling, and child reaping.
- Generation tests prove failed health publishes no intent/activation, preserves existing save bytes, and cannot reuse health evidence after catalog-digest change.
- The Rust workspace passes 76 active library tests with five subprocess helpers ignored by the parent run, plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

This is pre-promotion candidate health, not live or post-activation qualification. Process survival is weak compatibility evidence. Explicit-ready remains self-asserted until the exact signed wrapper/observer is qualified, and neither mechanism proves a visible/focused compositor window. Hosted/local-web HTTP health, update-service wiring, post-activation rollback, runtime-root cleanup, hostile descendant containment, and target measurements remain open.

## 2026-07-23: signature-first bounded package intake

### Delivered

- Added a domain-separated, signature-before-parse release descriptor binding target, generation, archive format/hash/length, exact expanded file/byte facts, and installed-catalog hash/length.
- Added deterministic pre-download and post-download capacity admission with a mandatory nonzero reserve and real staging-filesystem available-space snapshots.
- Added a regular-files-only uncompressed-TAR extractor with archive/file/expanded/entry limits; portable ASCII paths; case-insensitive prefix-collision detection; link/device/special-entry rejection; no-replace writes; safe executable-mode normalization; and Unix file/directory synchronization.
- The generation store now extracts into a private incoming directory, rechecks signed expanded/catalog evidence, verifies the installed catalog and every referenced artifact, requires descriptor/catalog generation agreement and monotonicity, then atomically publishes an inert staging transaction.
- Failed intake validates and removes only its private direct-child work directory. It never changes activation state, managed content, or saves.
- D-139 records the boundary. Q-117 through Q-119 preserve compression, reserve, and signing-role choices.

### Verification evidence

- Descriptor tests cover signature-before-parse behavior, exact archive use, wrong/tampered input, target/schema/record bounds, capacity arithmetic, real filesystem capacity, unsupported compressed extraction, and descriptor-bound TAR/catalog evidence.
- Archive tests cover successful bounded extraction, nonempty/unsafe destinations, links, duplicates, portable case collisions, unsafe names, and archive/file/entry limits.
- Generation tests prove a signed capacity-admitted archive becomes only a re-verifiable inert stage and that signed expanded-fact mismatch removes partial work without intent or activation.
- The Rust workspace passes 87 active library tests with five subprocess helpers ignored by the parent run, plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

This is local completed-archive intake, not an update client. Network transport/resume, mirrors/TLS policy, disk reservation, low-space coordination/UI, `tar-zstd`, key-role separation, immutable destination ownership, target-Linux permission/mount behavior, and sudden-power qualification remain open.

## 2026-07-23: durable resumable package archive receipt

### Delivered

- Added an exclusive transfer transaction bound to an already verified release generation, archive length, and archive SHA-256.
- Durable progress is the synchronized partial-file length. New chunks must be sequential and at most 8 MiB; wholly received retries are accepted only when every byte matches.
- Resume refuses gaps, partial overlap, conflicting replay, overrun, changed release binding, unsafe state, and an unbound partial file.
- Opening and every new append recheck available capacity using remaining archive bytes plus complete expanded bytes plus a mandatory nonzero reserve, without charging the received prefix twice.
- Finalization verifies the complete signed hash and publishes a no-replace hard-link ready name. Reopening after ready-before-cleanup interruption verifies the ready archive and completes cleanup.
- D-140 records the transfer-neutral durability contract. Q-120 and Q-121 preserve the network-source and abandoned-partial choices.

### Verification evidence

- Transfer tests cover append, identical replay, restart resume, completion, repeated finalize, gap/overlap/conflict/overrun rejection, chunk bounds, lock contention, changed binding, orphan partial refusal, wrong-hash retention, unsafe IDs, and interruption after ready publication.
- Capacity tests cover remaining-byte arithmetic, impossible received lengths, overflow, reserve, and real filesystem availability.
- The Rust workspace passes 100 active library tests with five subprocess helpers ignored by the parent run, plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

This is a durable local byte sink, not a network update client. Descriptor discovery, URL/TLS/proxy/mirror policy, HTTP range validation, retry/backoff, bandwidth limits, abandoned-partial cleanup, real reservation, cross-writer low-space coordination, target filesystem locks, and sudden-power evidence remain open.

## 2026-07-23: game trust tiers and admission lifecycle

### Delivered

- `GAME_TRUST_TIERS.md` separates owner-production, manually curated community, paired developer-session, and blocked untrusted-URL authority without treating runtime, signature, public manifest validity, URL reachability, or compatibility as interchangeable with trust.
- A tier matrix defines who may admit a release, where it can appear, its baseline containment, and mandatory visible disclosure. Local community content still uses signed production installation; developer builds remain unsigned only inside a visibly active paired namespace.
- An immutable admission record binds exact package version/hash/target or hosted origin/deployment plus rights, content, permissions, Motion, input, recovery, network/services, storage, privacy, health, update ownership, evidence, and review scope.
- Default-deny capability rules cover ordinary input, derived Motion, camera/microphone, network, storage, profiles, and native execution for every tier.
- Candidate, Approved, Temporarily disabled, Revoked, and Removed are independent states with constrained transitions. Disable/revoke/removal block launch before mutation and do not silently uninstall or erase/reassociate user data.
- Eleven abuse-test requirements cover self-promotion, version/origin drift, stale family caches, developer namespace escape, permission overgrant, hostile capture, rollback-resistant revocation, save isolation, review tamper, log redaction, and offline family operation. I-105 closes.

### Remaining boundary

This is the admission policy, not an implemented admission database or review service. Per-game evidence, signed installation/update, paired deployment, curated discovery, console mode UX, emergency-disable distribution, browser containment, sandboxing, and rollback qualification remain open under I-095, I-096, I-101, I-102, I-106, I-115, I-136, and I-141.
