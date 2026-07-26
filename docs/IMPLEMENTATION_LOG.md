# Implementation record

Last updated: 2026-07-24

This file records what has actually been built and verified. It does not convert desk evidence into Raspberry Pi, ordinary x86-64 Linux, SteamOS, real-room, or product qualification.

## 2026-07-19: first reversible desk slice

### Delivered

- pnpm workspace with independent Motion API, game-manifest, console-lab, asset-preparation, schema-export, catalog-validation, and hosted-process supervision surfaces.
- Motion API `0.4.0`: exact 17-point core, honest MediaPipe/RTMO/replay/synthetic source identity, optional MediaPipe 33 and world-coordinate profiles, named timestamp quality, ordered out-of-band tracker health, temporal standardized obstacle/shell actions, skeleton-only traces, generated Draft 2020-12 schemas, and explicit required/optional capability negotiation.
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

## 2026-07-24: durable resumable package archive receipt

### Delivered

- Added an exclusive transfer transaction bound to an already verified release generation, archive length, and archive SHA-256.
- Durable progress is the synchronized partial-file length. New chunks must be sequential and at most 8 MiB; wholly received retries are accepted only when every byte matches.
- Resume refuses gaps, partial overlap, conflicting replay, overrun, changed release binding, unsafe state, and unbound partial or ready files.
- Opening and every new append recheck available capacity using remaining archive bytes plus complete expanded bytes plus a mandatory nonzero reserve, without charging the received prefix twice.
- Finalization verifies the complete signed hash and publishes a no-replace hard-link ready name. The immutable binding remains for the ready archive's lifetime; reopening after ready-before-cleanup interruption verifies both and completes partial cleanup.
- The generation store can consume a ready archive only while its receiver lock remains held. It independently verifies the descriptor with the store key, requires the exact transfer/release binding, and re-hashes before bounded extraction.
- Successful staging retains the ready archive and binding as a durable receipt; incomplete, mismatched, low-space, and staging-failure paths preserve transfer evidence and never activate a generation.
- D-140 records the transfer-neutral durability contract. Q-120 through Q-122 preserve network-source, abandoned-partial, and bandwidth/scheduling choices.

### Verification evidence

- Transfer tests cover append, identical replay, restart resume, completion, repeated finalize, gap/overlap/conflict/overrun rejection, chunk bounds, lock contention, changed binding before and after publication, orphan partial/ready refusal, wrong-hash retention, zero-reserve no-mutation, unsafe IDs, and interruption after ready publication.
- Handoff tests cover refusal before finalization, independent reserve enforcement, exact signed-release binding, successful inert staging, receipt retention, and no-replace replay after staging.
- Capacity tests cover remaining-byte arithmetic, impossible received lengths, overflow, reserve, and real filesystem availability.
- The Rust workspace passes 102 active library tests with five subprocess helpers ignored by the parent run, plus 13 CLI tests; formatting and Clippy with warnings denied pass.

### Remaining boundary

This is a durable local byte sink, not a network update client. Descriptor discovery, URL/TLS/proxy/mirror policy, HTTP range validation, retry/backoff, bandwidth limits, abandoned-partial and consumed-ready cleanup, real reservation, cross-writer low-space coordination, target filesystem locks, and sudden-power evidence remain open.

## 2026-07-24: durable native launch replay

### Delivered

- Added an exclusively locked replay journal that synchronizes immutable request/game/profile acceptance before any signed resolution or child execution.
- Each lifecycle transition is an append-only event with strict state/detail validation. The journal is bounded to 64 retained records, 128 events per record, and 2 KiB per event; duplicate request IDs, ordinals, malformed state, or unavailable storage fail closed.
- Identical retained terminal intent replays across host restart without execution. Recovered preparing, running, or stopping intent becomes terminal `HOST_RESTARTED_INDETERMINATE` and is never re-executed.
- Recovery persists a cleanup barrier that blocks every fresh launch until trusted native service code proves old descendants gone and synchronizes `acknowledge_restart_cleanup`. The authenticated browser API cannot invoke that operation.
- Terminal retirement and empty-acceptance cleanup are interruption-recoverable and bounded. The watchdog restart count is also persisted and capped.
- `vcg-host launcher` now requires an absolute `--launch-replay-root` whenever native profiles are configured. HTTP 503 recovery codes are preserved as bounded typed failures in the Svelte client.
- D-141 records the mechanism. Q-123 through Q-125 preserve boot lifetime, cleanup ownership, and retention/privacy choices.

### Verification evidence

- Journal tests cover terminal replay, active-to-indeterminate recovery, cleanup-barrier persistence and acknowledgement, exclusive locking, empty acceptance, interrupted retirement, oldest-terminal retention, corruption, duplicate binding, unsafe root paths, pre-parse event bounds, and cancellation after a live persistence fault.
- Integrated launch tests prove durable terminal replay does not execute again and a recovered indeterminate launch blocks fresh execution until trusted cleanup acknowledgement.
- Rust formatting and Clippy with warnings denied pass. The Rust workspace passes 112 active library tests with five subprocess helpers ignored by the parent run, plus 14 CLI tests.
- TypeScript tests cover the two bounded host recovery errors without surfacing native details; the full workspace passes 117 unit tests.

### Remaining boundary

This is the durable at-most-once primitive, not production process-group recovery. A privileged service manager must own game descendants, prove their cgroup empty, and invoke the native-only acknowledgement. Boot-scoped root selection, age retention, protected directory ownership, target-Linux lock/rename/synchronization behavior, sudden-power testing, and operator reset/export policy remain open.

## 2026-07-24: launch-aware package retention planning

### Delivered

- Every accepted native launch now binds the exact trusted catalog generation in its private durable event record. The value is immutable across transitions and omitted from browser lifecycle responses.
- Native maintenance can obtain a sorted, deduplicated set of generations referenced by preparing, running, or stopping records. A recovered `HOST_RESTARTED_INDETERMINATE` record remains protected while the durable restart-cleanup barrier exists; trusted cleanup acknowledgement releases it.
- Package cleanup planning accepts only a bounded, unique, nonzero set of activated and installed protected generations. It retains their union with the newest-generation rollback floor and reports the validated protection as path-free metadata.
- Replay or protection ambiguity fails closed. The existing no-protection planner remains compatible and read-only; no activation marker, package directory, staging receipt, managed content, or save is deleted.
- D-142 records the cross-boundary invariant. Q-126 preserves the owner choice for automatic cleanup scheduling.

### Verification evidence

- Replay tests reject a catalog-generation change inside one lifecycle record.
- Integrated launch tests prove active generation protection, restart-indeterminate protection across another host instance, release after trusted cleanup acknowledgement, and no pinning by ordinary terminal history.
- Generation-store tests prove an old protected generation is retained beyond the ordinary two-generation floor and reject zero, duplicate, orphan, or unknown protection.
- Rust formatting and Clippy with warnings denied pass. The Rust workspace passes 115 active library tests with five subprocess helpers ignored by the parent run, plus 14 CLI tests.

### Remaining boundary

This is reference-safe classification, not garbage collection. A production coordinator must serialize launch admission, promotion/recovery, protection capture, filesystem mutation, and low-space accounting; recheck authority across interruption; preserve rollback and save boundaries; and pass target-Linux power-loss, lock, mount, and hostile-process tests before deletion is enabled.

## 2026-07-24: canonical generated launcher catalog

### Delivered

- Added a strict versioned launcher policy that owns museum destination, visible catalog placement/order, search metadata, status copy, summaries, and local/remote loading budgets separately from public author manifests.
- Added `@vcg/launcher-catalog`, which validates every public manifest, requires exact one-to-one policy membership, rejects duplicates and runtime/surface confusion, and permits an explicit `hidden` policy entry that does not enter the browser artifact.
- Added deterministic generation of a checked-in typed browser catalog. Ordinary manifest validation byte-compares the expected output and fails on stale hand edits or source drift.
- The generated artifact selects only browser-safe presentation and routing facts. It does not contain permissions, rights evidence, notes, hashes, installed paths, keys, commands, environments, profiles, or signed-package authority.
- Svelte home, universal search, museum destination and previews, retro candidate cards, and launch budgets now consume the generated artifact instead of copying game and policy facts.
- D-143 records the authority split. Q-127 preserves the choice between exact hosted-game deep links and museum-owned selection.

### Verification evidence

- Six launcher-catalog tests cover deterministic joining, browser-safe generation, missing/unknown/duplicate membership, duplicate positions, unsafe credential-bearing destinations, incoherent budgets, unknown fields, runtime/surface confusion, and hidden-entry omission.
- Manifest validation proves all four current manifests and the canonical launcher policy agree with the checked-in generated artifact.
- Svelte diagnostics report zero errors and warnings. All 18 Playwright flows pass, including canonical museum previews, manifest-derived search, retro handoff, and the narrow launcher layout.
- The TypeScript workspace passes 127 unit tests.

### Remaining boundary

This eliminates repository-local presentation drift and now reconciles exact signed local availability through the separate D-144 inventory. It does not make the external museum consume this artifact and does not join admission/emergency-disable state or grant browser-native authority. Exact hosted-game deep links remain disabled until the supervised top-level browser lane proves origin containment, global controls, cleanup, and return.

## 2026-07-24: signed installed-package inventory

### Delivered

- Added authenticated `GET /v1/packages` beside the existing single-package lookup. It returns the active positive catalog generation and every signed package's id, version, and runtime in canonical game-ID order.
- The response inherits the signed catalog's 1,024-record bound and discloses no paths, hashes, keys, commands, environments, permissions, profile data, or writable roots.
- The TypeScript client independently enforces a 1 MiB byte bound, 1,024-entry count, exact protocol and fields, positive safe generation, bounded id/version/runtime values, and strictly increasing unique IDs.
- The Svelte launcher checks inventory at startup and refreshes it when the player enters Retro or the shell regains focus. It labels and counts a generated local entry installed only when signed id, version, and runtime exactly match. Before `POST`, it requires that release in the current inventory and requires the per-ID response to match the inventory generation plus selected version/runtime. Concurrent refresh triggers share one in-flight request; unknown signed entries do not enter public lists or totals, an absent host/catalog remains visibly unavailable, and an empty signed inventory remains visibly empty.
- D-144 records the authority split. No new owner choice is required; Q-127 still owns exact hosted-game deep-link behavior.

### Verification evidence

- Rust tests prove path-free inventory disclosure and no inventory without a configured signed catalog.
- TypeScript tests prove successful authenticated listing, a valid inventory larger than the smaller status-document bound, and rejection of protocol/generation mismatch, duplicate or unsorted IDs, unknown fields, and excessive counts.
- Playwright proves the Retro hub rejects a release absent from the current inventory without any launch `POST`, refreshes the same shell session on hub re-entry, marks and counts the exact matching candidate Installed, rejects a stale per-ID generation/release without `POST`, hides an unknown signed entry from both presentation and totals, and submits only fixed game/profile intent after both signed views agree.
- The final workspace passes 127 TypeScript unit tests, 115 active Rust library tests with five subprocess helpers ignored by the parent run, 14 Rust CLI tests, and all 18 Playwright flows. Typecheck, production build, Rust formatting/Clippy, manifest/catalog freshness, JavaScript audit, and Rust advisory audit pass.

### Remaining boundary

Catalog membership is availability metadata, not proof that artifacts remain executable; launch re-verifies them. External museum consumption, admission/emergency-disable state, push-driven refresh while the shell remains continuously active, install/update UI, supervised exact-game deep links, and target-host lifecycle evidence remain open.

## 2026-07-24: explicit package-transfer cleanup

### Delivered

- Added an explicit abandoned-transfer cleanup that requires the signature-bound receiver and its exclusive transaction lock, refuses any published ready archive, and removes only the partial plus immutable binding.
- Added a full signed-descriptor receipt to every newly published inert staging transaction. It binds transaction, generation, archive format/hash/length, expanded byte/file facts, and catalog hash/length.
- Added explicit consumed-ready cleanup that re-verifies the inert staging release and requires that complete receipt to match the locked transfer before removing the ready archive and binding. Generation/catalog coincidence alone cannot authorize deletion.
- Both cleanup paths synchronize a strict cleanup intent before removing data. A later open completes an interrupted intent, returns `CleanupRecovered`, and does not silently accept new bytes in that call.
- Cleanup paths are exact transaction-local regular files. They cannot name active generations, activation history, managed content, runtime state, or saves. Lock files remain inert.
- D-145 records the mechanism while Q-121 continues to defer automatic age, pressure, and scheduling policy.

### Verification evidence

- Transfer tests prove explicit abandoned cleanup, refusal to treat a ready archive as abandoned, same-release restart after completion, and recovery from interrupted abandoned and consumed cleanup including state-first interruption.
- Store tests prove successful cleanup only after exact staging, fail-closed behavior for a tampered staged receipt, and refusal when another signed release occupies the same transaction name.
- Rust formatting and Clippy with warnings denied pass. The Rust workspace now contains 119 active library tests with five subprocess helpers ignored by the parent run, plus 14 CLI tests.

### Remaining boundary

The cleanup mechanism does not decide retention. No automatic age/space policy, low-space coordinator, network client, transfer scheduler, or generation deletion is enabled. Target-Linux directory synchronization/lock behavior, sudden-power removal, hostile noncooperating writers, service serialization, and operator-visible recovery still require qualification.

## 2026-07-24: serialized package maintenance planning

### Delivered

- Added one persistent inert generation-store operation lock. Cooperating archive staging, staged-transfer cleanup, health-gated promotion, recovery, and cleanup planning acquire it nonblockingly; contention fails closed.
- Added a host-only native maintenance lease over the same shared state used by launch reservation. Holding it freezes fresh launch admission, restart-cleanup acknowledgement, and lifecycle mutation while generation protection is consumed.
- Added `plan_cleanup_for_launch_service`, which always takes the launch lease before the store lock, derives generation protection internally, and validates the cleanup plan without accepting browser/package-supplied protection.
- Kept the result path-free and read-only. No activation marker, generation directory, staging state, managed content, runtime state, or save is deleted, and no retention count or scheduling policy was selected.
- D-146 records the fixed lock order and authority boundary. Q-113, Q-114, and Q-126 remain open for retention/deletion policy.

### Verification evidence

- Native-launch tests prove a fresh reservation cannot complete while the maintenance lease is held and that the accepted generation becomes protected immediately after release.
- Generation-store tests prove contention across independently opened handles fails with `Busy`, lock state contains no authority or progress, a non-regular lock path is rejected, and coordinated cleanup planning composes both leases.
- Rust formatting and Clippy with warnings denied pass. The Rust workspace contains 124 active library tests with five subprocess helpers ignored by the parent run, plus 14 CLI tests.

### Remaining boundary

This closes the cooperating planning race, not garbage collection. Crash-recoverable generation deletion must consume the validated plan without releasing either lease, preserve rollback and save boundaries, and stop on ambiguity. Target-Linux advisory-lock/directory-durability tests, hostile noncooperating-writer containment, actual service-manager ownership, automatic scheduling, low-space reservation, and uninstall remain open.

## 2026-07-24: cross-origin Motion bridge browser boundary

### Delivered

- Added a real cross-origin cooperative-game fixture with distinct exact console and game origins.
- The console fixture applies restrictive script/frame CSP; the game fixture denies all resource classes except its same-origin module and runs inside `sandbox="allow-scripts allow-same-origin"`.
- A narrowly scoped development/preview response lets only the cross-origin fixture document opt into embedding under the console's existing `COEP: require-corp` isolation.
- Navigation of the established game `WindowProxy` to an unapproved origin is ignored without a reply. Exact outbound `targetOrigin` also prevents the old session's publication from reaching that document.
- Returning to the allowlisted origin performs a new handshake and replaces the prior session before the cooperative client accepts another frame.

### Verification evidence

- The new Playwright flow proves cross-origin negotiation, frame receipt, the actual game origin, hostile-origin counting without reply or delivery, and successful renegotiation after returning.
- Svelte/TypeScript diagnostics report zero errors and warnings.
- No owner choice was required; this implements more of D-018's existing exact-origin cooperative bridge while preserving D-055's separate top-level hosted-game boundary.

### Remaining boundary

This fixture does not prove every CSP/sandbox/browser combination or trust arbitrary code sharing an allowlisted origin. Redirect chains, hostile same-origin code, game stalls, native cross-process transport, privileged Home/Back, target-Linux browser containment, and measured ARM64/x86-64 latency remain open.

## 2026-07-24: browser controller discovery and reconnect

### Delivered

- Made the browser Gamepad poll authoritative while retaining connection events as low-latency hints.
- Controllers attached before adapter startup are now announced on their first poll. Duplicate poll/event observations do not repeat connection notices.
- A missing polled index recovers from a missed disconnect event, clears held-action edges, and permits the replacement controller to emit a fresh action.
- A different browser ID or mapping at the same index produces an ordered disconnect/connect transition.
- Adapter shutdown removes both listeners and cancels its outstanding animation frame.
- Added `CONTROLLER_INPUT.md` with the exact browser mapping, edge and lifecycle semantics, session-only identity boundary, and remaining SDL3/product gates.

### Verification evidence

- Five new deterministic tests cover pre-attached discovery with single-edge input, event/poll deduplication, silent disconnect plus reconnect rearming, ordered same-index replacement, and clean stop.
- The console-lab suite now passes 66 unit tests with zero Svelte/TypeScript diagnostics.
- No owner choice was required; this strengthens the D-123 prototype without claiming the D-116 compatibility promise is qualified.

### Remaining boundary

Browser input is still cooperative page input. Native SDL3 discovery/mapping, real controllers/transports, player assignment, glyphs, ambiguity UI, battery and sleep/wake behavior, compositor-owned Home/Back, hostile focus/fullscreen tests, and both target tiers remain open under I-150 through I-152.

## 2026-07-24: native controller lifecycle reconciliation

### Delivered

- Added a platform-neutral complete-snapshot source contract for a future SDL3 adapter without exposing SDL handles, names, serials, paths, or binding types.
- Added a transactional registry bounded to 16 simultaneous observations. It validates duplicates, connection epochs, semantic action uniqueness, and mapping confidence before changing established state.
- Assigned opaque session-only controller IDs in deterministic backend-instance order. Disconnect/reconnect or connection-epoch/mapping replacement creates a fresh identity and action-edge epoch.
- Added deterministic press and release events. Disappearance, shutdown, sleep, or an explicit backend-fault reset synthesizes every release before disconnect so privileged actions cannot remain logically held.
- Ambiguous devices remain visible for future controller-accessible mapping UX but cannot publish Select, Back, Home, Pause, or other semantic actions.
- No new product choice was made; this implements more of D-116/D-123 while retaining Q-067 and Q-101 for real mapping and system ownership.

### Verification evidence

- Six new Rust tests cover order-independent discovery, edge-only updates, synthetic release and reconnect rearming, same-instance replacement ordering, ambiguous-mapping denial, transactional invalid/excessive observation rejection, and shutdown/restart lifecycle.
- Rust formatting and Clippy with warnings denied pass. The Rust workspace contains 130 active library tests with five subprocess helpers ignored by the parent run, plus 14 CLI tests.
- The RustSec advisory scan reports no known vulnerable dependency in the locked 43-crate graph.

### Remaining boundary

This is adapter-independent state, not SDL3 or Steam Input qualification. Exact bindings/mapping database, real USB/Bluetooth/receiver devices, player assignment, generic glyphs, guided ambiguous mapping, battery and sleep/wake observation, compositor-owned Home/Back, hostile-focus/fullscreen/hang tests, and ARM64/x86-64 Linux evidence remain open under I-150 through I-152 and I-209.

## 2026-07-24: pre-registered household motion benchmark

### Delivered

- Added a strict versioned benchmark plan/result contract to `@vcg/motion-contract`.
- Added the canonical `household-one-player-v1` plan with 14 blocks and 280 required attempts covering rest, stand, join, squat, jump, left/right punch, left/right step, shell Back, game Pause, occlusion, exit, and re-entry.
- Every trial fixes context, duration, repetition count, instruction, and a timed trigger, no-trigger, landmark-only, or session-transition expectation. Punch remains honestly landmark-only under current Motion API `0.3.0`.
- Result files bind the exact protocol, skeleton-trace SHA-256, timestamp quality, configuration, placement, persona class, concurrent workload, and every planned repetition.
- Scoring reports trigger and session-transition true positives, false positives, false negatives, precision, and recall. Invalid attempts remain visible and make the result incomplete.
- Added `pnpm validate:benchmarks`; I-052 closes without representing synthetic contract tests as player evidence.

### Verification evidence

- Four contract tests validate full canonical coverage, reject missing/duplicate/incoherent plans, prove timed trigger and transition arithmetic including false events and invalid attempts, and refuse omitted or duplicate results.
- The canonical plan validates as 14 trial blocks and 280 attempts.
- The motion-contract package passes 36 tests and typechecks without errors.

### Remaining boundary

No household benchmark has been run. I-053 and I-210 still require consented real-room ground truth, exact environment/configuration evidence, skeleton-only trace capture, concurrent workload, trustworthy exposure timestamps, latency distributions, threshold qualification, every failure, and per-persona/placement pass or fail.

## 2026-07-24: visible standardized-action lifecycle feedback

### Delivered

- Added a pure action-feedback model that consumes the Motion API lifecycle without authorizing behavior.
- Sustained join/select, Back, and Pause progress uses the same exported 450, 650, and 1,100 ms thresholds as the recognizer.
- The Motion Lab now presents gesture name, sampled hold percentage, accepted, cancelled, and released copy, an accessible progressbar, and redundant text/border/pattern state.
- Discrete actions become Accepted without fabricated duration. Terminal feedback remains visible until the next event rather than disappearing on an unrelated wall timer.

### Verification evidence

- Three focused tests cover threshold-derived progress, accepted/cancelled/released sustained states, and discrete acceptance without invented hold progress.
- The browser flow verifies the feedback card and named progressbar render in the real Motion Lab.
- The console-lab suite passes 69 unit tests with zero Svelte/TypeScript diagnostics.

### Remaining boundary

This is deterministic synthetic/UI evidence. Real-player comprehension, TV-distance visibility, threshold tuning, stable focus, one-handed and limited-range alternatives, feedback sound, accessibility review, false privileged actions, and cross-backend behavior remain under I-060, I-183, and I-210.

## 2026-07-24: reproducible OCR-A release evidence

### Delivered

- Completed the release evidence around the already pinned OCR-A 1.0 runtime font rather than committing a generated binary against D-122.
- The generated provenance now binds the exact version, upstream project and release-source locations, SourceForge's Public Domain label, retrieval date, 24,316-byte length, and SHA-256.
- Added a human third-party notice with the upstream author/contributor credits, modification-source filenames, exact artifact evidence, and the explicit boundary around the separately copyrighted ANSI specification.
- Kept `pnpm prepare:assets` as the single reproducible acquisition path; it accepts an existing font only after hashing it and rejects downloaded byte-length or digest drift.

### Verification evidence

- The prepared `OCRA.ttf` is exactly 24,316 bytes and hashes to `a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e`.
- A fresh `pnpm prepare:assets` run verifies the font and model, copies the pinned MediaPipe WASM runtime, and regenerates byte-identical provenance metadata.
- I-146 closes with an auditable source link and notice while preserving the generated-asset policy.

### Remaining boundary

This is artifact provenance, not font qualification or a complete release notice bundle. Glyph coverage, fallback behavior, TV-distance legibility, low-vision/accessibility testing, and target rendering remain under I-147 and Q-077. The complete dependency/model/game/core SBOM and notices process remains I-137.

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

## 2026-07-24: exact Motion bridge schema binding

### Delivered

- Advanced the cooperative browser bridge from protocol v1 to v2.
- Every hello now names exact Motion API schema `0.2.0`; every accepted welcome repeats that binding before either side treats the session as connected.
- A v2 host refuses bridge v1 and mismatched Motion-schema hellos before session creation or frame publication. A v2 client ignores legacy or mismatched welcomes and keeps its bounded retry active.
- Unknown fields remain ignored on otherwise valid wire objects, while known protocol and schema versions remain exact.
- Regenerated both checked-in bridge JSON Schemas and updated the hostile-origin browser fixture to send a current, otherwise valid hello.
- D-147 records the compatibility boundary without claiming a released-client migration matrix.

### Verification evidence

- Fifteen focused bridge tests pass, including legacy host/client snapshots, mismatched schema peers, current exact binding, unknown-field compatibility, capability projection, reconnect, bounded acknowledgement flow, and burst dropping.
- The bridge and console-lab packages typecheck with zero diagnostics.

### Remaining boundary

This is a source-snapshot compatibility matrix, not evidence from externally released clients. Hailo fixtures, a released old/new matrix, broader browser-policy combinations, separate-process transport, native integration, and measured ARM64/x86-64 latency remain under I-073 through I-076.

## 2026-07-24: blocking and exploratory player personas

### Delivered

- Turned D-105 into a versioned participant/evidence contract rather than leaving “child” and “adult” as unmeasured labels.
- Defined separate school-age-child and adult standing blocking classes with broad engineering height bands, actual measurement and comfortable-range fields, identical action/recovery gates, and results that cannot be rescued through aggregate averaging.
- Defined instruction demonstration, teach-back, visible cancellation, independent controller escape, and controller-familiarity recording without assuming comprehension from age.
- Defined informed adult consent plus child assent where applicable, opaque participant codes, raw-video-off evidence, separate consent records, and explicit exclusions for names, portraits, voices, exact birth dates, addresses, and diagnoses.
- Kept seated and limited-range sessions in two explicit exploratory matrices with safe prompt limits, exact adaptation recording, and claim language that cannot be confused with qualified support.
- Linked the persona contract into the pre-registered prototype criteria and contextualized the child height band with official CDC growth-chart sources without using those charts as a clinical screen.

### Verification evidence

- Every blocking benchmark field maps to the existing `school-age-child-standing` or `adult-standing` result classes and preserves per-persona scoring.
- The document supplies the required height, proportion/range, comprehension, privacy, controller-familiarity, environment, outcome, and stop/deviation fields.
- I-008 closes as definition work. No owner choice was required because the blocking/exploratory split was already fixed by D-105.

### Remaining boundary

No participant has been tested by this slice. Consent materials still need household review, and actual child/adult/seated/limited-range tracking, safety, comprehension, action accuracy, TV distance, clothing/lighting, and placement evidence remain under I-035, I-037, I-041, I-053, I-068, I-147, I-155, I-194, and I-210. Networked family beta and automatic identity/portrait features retain their separate privacy and legal gates.

## 2026-07-24: fail-closed household active-play checklist

### Delivered

- Defined one observed `pass`/`fail`/`not-applicable` pre-play gate; a waiver, warning, camera view, supervision, or consent cannot override a physical failure.
- Covered the clear 8 x 8 ft zone, falls and floor trips, television/furniture anchoring, falling objects, power/signal cable routing, enclosure stability/heat/ventilation, pets/passersby/spectators, participant readiness, water/rest access, and independent controller/physical stop paths.
- Defined runtime freeze/stop conditions for zone intrusion, moved equipment, falls/collisions, tracking ambiguity, participant stop or distress, thermal/power faults, and loss of supervision.
- Added a conservative 20-active-minute prototype break offer with Rest focused, controller parity, paused timing, no fitness/guilt language, and shorter child trial blocks. The cadence remains reviewable rather than a medical claim.
- Added post-play camera/idle/equipment checks and twelve required abuse scenarios, including cable tug, pet entry, camera shift, hung UI, controller loss, thermal fault, and mid-action stop.
- Bounded the evidence with CPSC furniture/tip/fall guidance and CDC heat/activity stop guidance without representing the room as a playground or the product as medically or regulatorily qualified.

### Verification evidence

- I-012's required furniture, cable, pet, fall, heat, and break-reminder hazards all have explicit block, pause, stop, and evidence behavior.
- The checklist connects to the existing room, persona, privacy, camera-state, reserved escape, and prototype-claim boundaries.
- I-012 closes as hazard identification. No room, enclosure, participant, anchor, cable installation, or runtime has passed it yet.

### Remaining boundary

The selected living room still needs its exact survey and marked zone. Anchor suitability, floor/cable installation, electrical/thermal/enclosure safety, break cadence, child comprehension, physical stop, and every abuse scenario require qualified hands-on review under I-001, I-002, I-037, I-046, I-140, I-143, I-144, I-192, I-194, I-195, and I-196.

## 2026-07-24: out-of-band tracker health and degraded control

### Delivered

- Advanced Motion API from `0.2.0` to `0.3.0` rather than changing exact-version health semantics silently.
- Added nine closed-vocabulary initializing, restarting, healthy, low-confidence, overload, fallback-backend, camera-unavailable, camera-disconnected, and backend-fault fixtures with coherent full, landmarks-only, or blocked control.
- Starting/fault frames cannot expose players. Every non-ready frame has no standardized actions, and degradation clears partial action holds before later recovery.
- Bridge v2 welcome now carries current health; ordered `vcg.motion.health` transitions remain deliverable without frames. The host binds each frame's source/status to current health and rejects stale sequence or regressing time.
- The browser tracker emits lifecycle events for initialization, retry, healthy worker, main-thread fallback, unavailable/ended camera, and backend failure without placing provider exception text on the game wire.
- The Motion Lab visibly demonstrates Ready, Low confidence, Overload, Restart, and Disconnect with redundant badge/title/detail/border/control-availability cues.
- Added a checked-in Draft 2020-12 health schema, regenerated all Motion/bridge/benchmark schemas, advanced the canonical benchmark binding, and documented D-149.
- I-081 closes; Q-039/I-063 remain for real per-limb thresholds and game pause-versus-landmarks-only qualification.

### Verification evidence

- The contract suite passes 47 tests, covering every valid health tuple, incoherent-tuple rejection, start/fault player denial, non-ready action denial, representable JSON constraints, and the updated `0.3.0` benchmark contract.
- Sixteen bridge tests cover welcome health, ordered out-of-band overload/restart delivery, late reconnect state, stale/time-regressing event refusal, source/status mismatch refusal, and degraded profile projection.
- Eighty console unit tests cover all visible copies/control modes and prove degradation suppresses actions and resets hold timing.
- Twenty real-Chrome flows exercise the five visible health fixtures, healthy worker, explicit fallback-backend status, and welcome/overload/recovery health across same-origin and sandboxed cross-origin clients through reload and hostile navigation.
- Workspace tests, typechecks, production build, schema/manifests/benchmark freshness, and the high-severity dependency audit pass.

### Remaining boundary

The low-confidence and overload states are contract/UI fixtures, not measured thresholds. Real camera disconnect/reconnect, sustained overload, fallback qualification, per-limb loss, freeze/pause behavior, accessibility comprehension, and ARM64/x86-64 timing remain under I-063, I-134, I-161, I-208, I-210, and Q-039.

## 2026-07-24: bounded crash-recoverable generation cleanup

### Delivered

- Added an explicit host-only generation remover that accepts a validated retention floor and per-transaction bound; no browser route or automatic scheduler invokes it.
- The coordinator holds the native launch-maintenance lease and then the package-store operation lock through fresh protection derivation, plan selection, durable intent publication, deletion, and completion.
- Cleanup selects inert orphan generations before the oldest retired activation history. It never targets the active generation, newest rollback floor, or any active/restart-ambiguous launch generation.
- A strict bounded cleanup intent records exact retired activation-marker identities and orphan generation numbers before mutation. It is synchronized as a temporary file and published by no-replace hard link, so a mid-write crash cannot create a truncated authoritative intent. Retired markers are then synchronized away before their directories, leaving only recoverable inert orphans.
- Restart recovery reacquires both leases, re-derives launch protection, validates target identity, and resumes after intent publication, marker removal, partial/already-complete directory removal, or an already-absent orphan.
- Pending cleanup blocks planning, intake staging, transfer-receipt cleanup, promotion, and promotion recovery. Malformed intent, changed identity, a newly retained/protected target, invalid bounds, unsafe paths, or simultaneous promotion recovery fails closed without clearing evidence.
- Fixed-width generation numbers derive direct-child paths; the remover cannot name or touch staging, transfer state, managed content, runtime roots, or player data/saves.
- D-150 records the crash-consistency boundary. I-101/I-142/I-209 and the generation-store/native-lifecycle docs now distinguish this implemented primitive from unselected automatic retention and uninstall policy.

### Verification evidence

- Rust regression tests cover bounded orphan-first selection, rollback/save preservation, clean no-op, restart after marker removal, already-absent target bytes, interrupted orphan removal, changed marker identity, newly protected targets, malformed intent, invalid limits, and mutation denial while recovery is pending.
- Workspace formatting and clippy with warnings denied pass; 136 Rust library tests plus 14 CLI tests pass, with five intentional subprocess helpers ignored. Checked-in schemas, the 14-trial/280-attempt benchmark, launcher manifests, TypeScript/Svelte diagnostics, 166 web/package unit tests, the production build, and all 20 Chromium flows also pass.

### Remaining boundary

No target Linux filesystem, sudden-power, noncooperating-writer, or service-manager run has qualified this remover. Automatic timing, generation/byte budget, low-space behavior, uninstall, managed-content garbage collection, and controller-confirmed save preservation/deletion remain Q-113/Q-114/Q-126 and I-101 work. The safe default is to keep automatic cleanup disabled.

## 2026-07-24: Motion service and bridge abuse review

### Delivered

- Added a dedicated browser Motion data-flow and trust-boundary review covering raw capture, worker inference, derived frames/actions/health, profile projection, bridge sessions, acknowledgements, and trace export.
- Recorded eleven enforceable invariants and eighteen abuse cases with current mitigation, evidence, and residual risk.
- Added negative proof that a correct-origin sibling window cannot spoof server health to a client or terminate another window's session with a copied session ID.
- Bounded distinct allowlisted source-window sessions to 16 by default and at most 64. Excess windows receive explicit rejection, while the already-known source can still replace its own session during reconnect.
- Kept compromised approved same-origin code, shell XSS, OS/GPU leakage, browser containment, admission/revocation, diagnostics, and native transport as explicit residual boundaries.
- I-083 closes as a threat-model artifact; I-084 remains active for timed soak, stalls, churn, memory telemetry, and native IPC.

### Verification evidence

- Eighteen focused bridge tests pass, including origin/source confusion, stolen session, capability/profile projection, version binding, health ordering, session bounds, frame flood, acknowledgement, expiry, and reconnect cases.
- Bridge typechecking passes with the bounded-session option and exported limits.

### Remaining boundary

This is a design-and-desk-test review, not production browser or native isolation. Same-origin compromise is intentionally not described as mitigated by an allowlist. Hostile popup/download/fullscreen/permission flows, emergency revocation, real resource exhaustion, native transport, OS-level body-data leakage, and redacted support tooling remain under I-076, I-084, I-115, I-116, I-134, I-136, I-141, I-180, and I-208.

## 2026-07-24: deterministic camera-free pose simulation

### Delivered

- Exported `MotionPoseSimulator` from the Motion contract package with nine exact poses, stable player identity, explicit loss/reacquisition, reset, snapshots, and deterministic schema-validated frame generation.
- Kept simulation below the action layer: frames contain only `body.core17` landmarks and the existing recognizer still owns action timing, context, hysteresis, cooldown, and side effects.
- Added an explicit Motion Lab simulator mode with latched UI poses, held W/A/S/D/J/K/Q/E keyboard controls, player hide/show, and continuous standard-controller pose state.
- Preserved Home and Back as console navigation rather than simulator input. Camera startup disables the simulator before capture permission is requested.
- Added a query-gated `window.__vcgMotionSimulator` automation seam that is absent by default and uses the same visible simulator instance.
- Documented the SDK, mappings, automation boundary, and non-qualification limits in `MOTION_SIMULATOR.md`; I-082 closes without changing the unresolved LAN developer-mode question Q-057.

### Verification evidence

- Fifty Motion contract tests validate every pose, repeatability, frame schema, player loss/reacquisition, reset, and invalid inputs.
- Eighty-seven console unit tests include obstacle, join/select, Back, swipe, loss/reappearance, held controller-state, release, and existing navigation/action regressions.
- Twenty-one real-Chrome flows pass, including visible simulator controls, keyboard hold/release, synthetic standard-controller polling, query-gated hooks, hidden-player telemetry, and compositor-path Home recovery.
- Workspace typechecks and production build pass; schema, manifest, and the 14-trial/280-attempt benchmark are fresh; the high-severity dependency audit reports no known vulnerabilities. Native formatting/clippy pass, 136 Rust library tests plus 14 CLI tests pass, and five intentional subprocess helpers remain ignored.

### Remaining boundary

The simulator is developer/test evidence, not a camera benchmark or accessibility substitute. It does not qualify real-room motion accuracy, child/adult/seated/limited-range behavior, physical controller mappings, native SDL3, compositor enforcement, target Linux, or LAN deployment security. Those remain under I-053, I-102, I-161, I-183, I-209, and I-210.

## 2026-07-24: deny-by-default game permission grants

### Delivered

- Exported the exact `vcg-game.json` v1 permission/input vocabularies and a permission-grant derivation boundary without tightening or silently reinterpreting the published v1 parser.
- Mapped `motion.core17` only to `body.core17` and `motion.actions.obstacle` only to `actions.obstacle.v1`; action authority also requires the core skeleton and matching input profile.
- Made non-offline network mode without `network` fail grant derivation. The existing parser continues rejecting `network` on offline manifests.
- Kept presence-only, rich/world skeletons, raw camera data, microphone, identity/profile data, and console-owned shell actions unavailable in v1. Unknown extension fields remain non-authoritative.
- Required every Motion bridge host to receive an explicit profile grant and intersected source capabilities with it before welcome, negotiation, or publication. Ungranted required profiles reject; optional ones degrade; richer tracker output cannot self-authorize.
- Updated same-origin and sandboxed cross-origin browser fixtures to use explicit core-only grants and documented the disclosure, versioning, and residual native enforcement boundary in `GAME_PERMISSION_MODEL.md`.
- I-079 closes as vocabulary and cooperative-boundary enforcement. Q-055 remains for signed install/launch disclosure and product-wide OS/runtime enforcement.

### Verification evidence

- Eighteen manifest tests cover exact vocabulary, grant mapping, network disagreement, obstacle/profile dependency, raw-video/microphone denial, and all prior v1 fixtures and diagnostics.
- Nineteen bridge tests cover explicit grant intersection, optional profile removal, required action escalation rejection, core authorization, existing projection, origin/source checks, health, backpressure, bounds, and reconnect behavior.
- TypeScript/Svelte package typechecks pass after making `authorizedProfiles` mandatory at every host construction site.

### Remaining boundary

The public manifest is not signed launch authority by itself. Production still needs the native host to derive grants from signature-verified installed package evidence, render a controller-accessible permission review, enforce network/storage/input/device isolation for every runtime lane, support revocation/family policy, and prove that top-level hosted or native games cannot obtain undeclared OS/browser capabilities.

## 2026-07-24: casual household-local obstacle leaderboard

### Delivered

- Added a versioned, bounded local obstacle-run store with exact game, rules, input, calibration, pause, tracking-dropout, player-assignment, score, and completion context.
- Kept the claim deliberately narrow and visible: `UNVERIFIED RUNS`, `NO UPLOAD`, no anti-cheat, no cross-household comparison, and explicit developer-build mutability.
- Recorded a run exactly once at game over, retained the highest 20 locally, displayed the highest five, and added a separate New Run action.
- Added deliberate two-step board reset, fail-whole malformed-document recovery, honest unavailable-storage feedback, and a profile-deletion operation that removes the profile link while preserving unassigned progress.
- Documented lifecycle, privacy, security, corruption, and production-save boundaries in `LOCAL_LEADERBOARD.md`; I-204 closes for the obstacle desk sample.

### Verification evidence

- One hundred console unit tests pass, including ordering, bounded retention, reload, profile unassignment, reset, malformed data, storage failure, and invalid run context.
- All twenty-two real-Chrome flows pass. The new flow completes an actual run, verifies the unverified/local-only disclosure and recorded context, reloads the page to prove persistence, and verifies the two-step reset clears the storage key.
- Workspace typechecks and production build pass; exported schemas, all four game manifests plus canonical launcher policy, and the 14-trial/280-attempt benchmark remain fresh.

### Remaining boundary

Browser local storage is not the final console-managed per-game writable mount. Package isolation, quotas, low-space behavior, healthy update/rollback preservation, sudden-power durability, factory reset, profile lifecycle integration, and hostile-package access remain under I-189, I-191, I-202, and I-209. No public, remote, prize-bearing, or anti-cheat leaderboard is authorized by this work.

## 2026-07-24: deterministic release-compliance inventory

### Delivered

- Added a deterministic CycloneDX 1.7 generator covering the project root, all first-party pnpm/Rust components, 81 installed npm packages, the complete 43-package locked Cargo graph, and both pinned runtime assets.
- Added a generated human dependency notice inventory with reported licenses, source links, and required/development scope.
- Added an evidence gate that rejects stale output, duplicate references, and any new unreviewed third-party license gap.
- Added a deliberately failing release gate for the two known blockers: first-party license selection and model-specific Pose Landmarker redistribution evidence.
- Documented target-architecture regeneration, notice/source collection, corresponding-source retention, OR-expression review, and required no-override release CI in `RELEASE_COMPLIANCE.md`.
- Isolated the two decisions that cannot be made autonomously in `OWNER_QUESTIONS_RELEASE_COMPLIANCE_2026-07-24.md`; I-137 moves to active rather than being overstated as closed.

### Verification evidence

- `pnpm prepare:compliance` reproducibly emits 132 CycloneDX components and the human notices annex.
- `pnpm validate:compliance` passes against the checked-in bytes and exact two-blocker set.
- `pnpm validate:release-compliance` fails as designed with an explicit project-license/model-license error.

### Remaining boundary

The inventory is based on this Windows installation plus the complete Cargo lock graph. ARM64/x86-64 release jobs, exact license/NOTICE text bundling, first-party license selection, model terms, OS/browser/system packages, emulator cores, game content, firmware, and enclosure artifacts remain release blockers or future selected-artifact inputs. No public binary/image release is represented as compliant.

## 2026-07-24: forward-compatible optional Motion capability query

### Delivered

- Added a separately versioned optional-feature inventory, query, and negotiation result rather than expanding the exact Motion `0.3.0` frame profile enum.
- Defined bounded open namespaced IDs with known authoring constants for depth, segmentation, and hands; future exact IDs require no v1 schema change.
- Added positive integer revisions, required-versus-optional requests, deterministic request-order results, complete missing-required rejection, optional degradation, and duplicate/overlap/malformed-input denial.
- Kept the inventory non-authoritative: advertised data-profile names do not grant manifest permission, add frame fields, or authorize bridge transport.
- Published three checked-in Draft 2020-12 schemas with open ID patterns and forward-compatible unknown-field behavior.
- Documented provider-advertisement rules, privacy minimization, authority separation, and non-implementation boundaries in `MOTION_OPTIONAL_CAPABILITIES.md`; I-085 closes.

### Verification evidence

- Fifty-five Motion contract tests pass. Five focused query tests cover known capabilities, minimum revisions, missing required features, optional degradation, unknown future IDs and fields, duplicate/overlap denial, malformed IDs, wrong schema version, and generated open-pattern schemas.
- Schema freshness, full workspace diagnostics/tests, production build, all twenty-two real-Chrome flows, benchmark/manifest validation, and the high-severity dependency audit pass.
- Native formatting and lint are clean; 136 Rust library tests and fourteen CLI tests pass, with five intentional subprocess helpers ignored in the primary library run.

### Remaining boundary

No depth, segmentation, or hand provider is implemented or qualified by this contract. Motion/manifest profile versions, permission review, provider adapters, bridge/native transport, hardware identity and privacy handling, real-room accuracy/latency, and cross-backend conformance still require separate evidence.

## 2026-07-24: bounded Motion bridge stalls and reconnect churn

### Delivered

- Bound each session to one exact pending frame sequence; stale or mismatched acknowledgements no longer release publication backpressure.
- Added timer-independent stale-session collection plus bounded active, peak, pending, expiry, and invalid-acknowledgement telemetry.
- Proved that a non-acknowledging session neither queues frames nor blocks a healthy neighboring session.
- Added 1,000 same-window reconnects and a five-minute virtual-time 100 Hz producer soak without retained frame history or session growth.
- Added a real-Chrome fixture that deliberately withholds acknowledgements, is collected after TTL, and is replaced by a healthy cooperative client.

### Verification evidence

- Twenty-two focused bridge tests pass, including exact ACK binding, explicit expiry, healthy-client isolation, churn, soak, and the existing 10,000-frame burst.
- The focused Chrome stall/recovery flow, bridge/console TypeScript diagnostics, and production console build pass.
- Full workspace tests, diagnostics, build, all twenty-three Chrome flows, schemas, manifests, benchmarks, compliance freshness, dependency audit, and native regressions pass.

### Remaining boundary

I-084 stays active. The virtual soak measures protocol-state bounds rather than wall-clock RSS or scheduler behavior, and the browser fixture withholds ACKs without suspending an OS renderer. Multi-process memory telemetry, renderer kill/suspend, tracker-process isolation, and selected native IPC backpressure still require target-system evidence.

## 2026-07-24: Motion SDK web reference game

### Delivered

- Added a tiny engine-independent TypeScript game consumer with one immutable state model behind live Motion bridge, deterministic replay, and controller input.
- Required only the portable core skeleton, requested obstacle actions as optional, and kept the client request explicitly subordinate to host permission grants.
- Demonstrated normalized landmark-driven lane selection plus edge-triggered jump/duck/dodge actions while ignoring console shell actions as gameplay.
- Made player loss and degraded frames fail visible to Waiting without stale-input continuation; controller fallback remains available.
- Published the authoring, health, action-phase, origin, privacy, replay, and fallback rules in `MOTION_SDK_AUTHORING.md`; I-086 moves to active with its web half complete.

### Verification evidence

- Twenty-four Motion bridge tests pass. Three focused reference-game tests cover landmark input, triggered action ownership, deterministic replay through the same consumer, player loss, and controller recovery.
- The Motion bridge package typechecks with its live and replay example imports.

### Remaining boundary

At that checkpoint, the Godot quickstart, live/replay Godot adapter, ARM64/x86-64/web exports, package-size/tooling/latency comparison, and final engine choice remained I-077/I-086/Q-058. The following tranche adds the source quickstart without overstating export or hardware qualification.

## 2026-07-24: Godot Motion SDK quickstart

### Delivered

- Added a self-contained Godot 4.7 project with a portable 17-landmark consumer, triggered obstacle actions, shell-action exclusion, visible loss/degradation, and controller fallback.
- Added deterministic skeleton-only replay with ordered injected-clock advancement and raw-frame denial.
- Added a Godot web-export adapter bound to an exact configured origin, bridge v2, Motion API 0.3, session IDs, health, and exact consumed-frame acknowledgements.
- Kept native live input unimplemented until I-074 selects a measured transport rather than inventing an unauthenticated socket.
- Expanded `MOTION_SDK_AUTHORING.md` with the Godot architecture, commands, authority rules, and qualification boundaries.

### Verification evidence

- Godot 4.7.1 was installed through WinGet for validation.
- Three headless GDScript tests pass for landmarks/actions/fallback, deterministic raw-free replay, and web-origin/runtime denial.
- Headless editor import parses all global classes and the main scene boots cleanly.
- Full workspace tests, diagnostics, build, all twenty-three Chrome flows, schemas, manifests, benchmarks, compliance freshness, dependency audit, and native regressions pass.

### Remaining boundary

I-077 and I-086 stay active. The web adapter still needs a reviewed live Godot browser-export flow, and ARM64/x86-64/web exports need measured size, tooling, and landmark/action latency. Native live Motion waits on I-074 transport selection; no target-hardware, real-player, or release-package qualification is claimed.

## 2026-07-24: action-specific missing-landmark behavior

### Delivered

- Added player-control availability schema v1 with global state, reason, six body regions, six control groups, exact missing landmarks, deterministic derivation, and a checked-in Draft 2020-12 artifact.
- Kept global tracker health authoritative while deriving ready-frame availability solely from the existing provider-neutral `observed` flags; no unqualified confidence threshold was added.
- Split action-engine shoulder, hip, and ankle measurements so a missing ankle suppresses Jump without cancelling hands-together or suppressing Dodge, while missing wrists terminate only their dependent holds.
- Added a live Body Signal card and Full, Left Arm, Legs, and Half Body replay fixtures that retain schema-complete skeletons and visibly identify unavailable controls.
- Documented contract, precedence, exact landmark requirements, fixture semantics, and remaining qualification work in `PLAYER_CONTROL_AVAILABILITY.md`; I-063 moves to active.

### Verification evidence

- Sixty-one Motion contract tests cover full, partial, unavailable, global-health, absent-player, exact-requirement, and schema behavior.
- One hundred five console tests cover schema-valid visibility fixtures, action-specific hold cancellation, unrelated hold continuity, and Dodge remaining available without an ankle.
- All twenty-three real-Chrome flows pass, including visible global-health denial, Legs-only Jump suppression, Left Arm control isolation, Half Body denial, and Full recovery.
- Workspace TypeScript/Svelte diagnostics, production build, schema/manifest/benchmark/compliance freshness, and visual review pass.

### Remaining boundary

The deterministic fixtures prove SDK and UI behavior, not tracker quality. Provider-specific confidence-to-observed thresholds and hysteresis, real-player recordings, per-game continuation/pause rules, seated/child/limited-range accessibility, TV-distance feedback comprehension, and cross-backend parity remain required before I-063 can close.

## 2026-07-24: first local Motion transport benchmark

### Delivered

- Added a bounded cross-platform Node harness for direct-library copy, one-slot worker shared memory, TCP loopback, OS local socket, and a real uncompressed WebSocket stack.
- Measured sequential 4 KiB echo RTT distributions, round trips per second, aggregate process CPU, declared queue models, and stalled-reader buffer signals.
- Added strict argument bounds, deterministic payloads, environment metadata, explicit process-layout limitations, and optional JSON report output.
- Recorded 5,000 measured samples after 500 warmups on the current Windows x64 development host.
- Kept I-074 active and D-004 unchanged rather than treating same-process Windows evidence as a target transport decision.

### Initial evidence

| Transport | p50 µs | p95 µs | p99 µs | Process CPU ms | Stall signal |
|---|---:|---:|---:|---:|---|
| Direct library copy | 1.4 | 4.6 | 6.9 | 31 | synchronous, no queue |
| One-slot shared memory | 2.2 | 13.3 | 19.8 | 31 | one frame |
| Windows named pipe | 17.8 | 39.0 | 88.6 | 172 | 3 full writes before stream backpressure |
| TCP loopback | 41.4 | 80.4 | 188.1 | 297 | 51 full writes before stream backpressure |
| WebSocket loopback | 73.1 | 142.7 | 292.2 | 547 | 303 frames before buffered amount exceeded 1 MiB |

The checked-in JSON report is `benchmarks/transport/windows-x64-node24-2026-07-24.json`.

Full workspace tests, diagnostics, build, all twenty-three Chrome flows, Godot validation, schemas, manifests, benchmarks, refreshed 133-component compliance inventory, dependency audit, and native formatting/lint/tests pass.

### Remaining boundary

The socket and WebSocket endpoints share one process, the shared-memory case uses a worker thread rather than cross-process ownership, and the run excludes schema parsing and camera/action work. Target Linux must rerun Unix-domain sockets and true process isolation on x86-64 and ARM64, including RSS, scheduler load, suspend/kill/reconnect, permission binding, stale-reader recovery, and identical Motion serialization. No production transport is selected.

## 2026-07-24: bounded native reserved-input routing

### Delivered

- Added a platform-neutral native router after controller reconciliation with explicit Launcher, Game, and Console Overlay contexts.
- Kept Home, Back, and Pause console-owned in every context while routing only directions and Select to a game.
- Bound every release to the recipient of its press and synthesized deterministic releases before a surface transition, preventing held movement or selection from carrying into an overlay.
- Ignored duplicate presses and orphan releases, bounded safe device identifiers before allocation, capped held state at the existing 16-controller by eight-action ceiling, and kept rejection transactional.
- Proved a registry-synthesized disconnect release reaches the original game target and documented the exact policy and remaining native-enforcement boundary; I-150 moves to active.

### Verification evidence

- Focused native tests cover all reserved actions, all game-routable actions, launcher routing, context transition/rearm, duplicate/orphan denial, bounded-state rejection, and registry disconnect integration.
- Native formatting and lint are clean; 143 Rust library tests and fourteen CLI tests pass, with five intentional subprocess helpers ignored in the primary library run.

### Remaining boundary

The router is privileged policy code, not a real SDL3 producer or compositor hook. It is not yet connected to host launch/runtime delivery and does not prove a hostile browser or native game cannot read physical input, capture focus, hang, or suppress the shell. SDL3 mapping, runtime delivery, compositor/service ownership, physical controllers, hostile fullscreen/pointer-lock/native tests, and ARM64/x86-64 Linux qualification remain under I-150, I-151, I-152, and I-209.

## 2026-07-24: exact Windows x86-64 automated qualification

### Delivered

- Captured an ignored exact-device inventory on the available Windows 11 x64 workstation and published only sanitized, non-unique evidence.
- Recorded Ryzen 9 5900X, RTX 3080 Ti with corrected `nvidia-smi` 12 GiB evidence, ~64 GiB memory, two online physical 2 TB SSDs, a present Logitech C920, Chrome 150, pinned Node/pnpm/Rust, and no detected controller.
- Extended the inventory with versioned format metadata, clean-tree state, physical disks, bounded structured NVIDIA evidence, Rust tools, and explicit WMI/device-ID caveats.
- Fixed non-interactive Windows bootstrap by scoping `CI=true` to frozen pnpm installation and restoring the caller's prior environment.
- Documented exact automated results and every unrun camera, controller, hosted-game, reboot, suspend, soak, disk-handoff, and native-Linux row in `WINDOWS_QUALIFICATION_RESULT_2026-07-24.md`.

### Verification evidence

- The pinned Windows bootstrap passes frozen install, asset/catalog/schema preparation, diagnostics, 215 unit tests, production build, manifest validation, native verification, and all 23 Chrome flows.
- Native doctor reports the x86-64 Windows process/catalog/package/controller capabilities and preserves explicit SDL3, compositor-readiness, and resource-detector gaps.

### Remaining boundary

This proves shared-stack portability on one Windows workstation, not the I-207 ordinary Linux premium reference. The present C920 was inventoried but not opened against a real room; no physical controller was detected; no reboot, suspend, hosted-game, or soak matrix ran; and neither physical SSD was modified. I-211 remains active pending hands-on evidence and a reviewed native-Linux disk/recovery plan.

## 2026-07-24: process-isolated Motion transport evidence

### Delivered

- Extended the bounded transport harness with an explicit `child-process` layout for TCP, OS local sockets, and WebSocket while retaining direct-copy and worker-shared-memory baselines.
- Added a narrow child protocol for ready, measurement, stats, stalled-reader mode, and shutdown; data still travels only through the transport under test.
- Recorded client and server CPU separately plus client RSS start/end and 5 ms sampled server RSS start/end/peak.
- Kept stalled-reader probes bounded and force-terminated the disposable child after the buffer signal so a deliberately paused peer cannot keep the harness alive.
- Added strict structural validation for both checked-in transport reports.

### Initial evidence

On the same Windows x64 host and 4 KiB/5,000-sample method, child-process p50/p95/p99 RTT was 34.8/81.6/181.7 µs for the named pipe, 56.9/114.5/202.8 µs for TCP, and 103.5/182.9/309.6 µs for WebSocket. Measured client/server CPU was 125/141 ms, 203/235 ms, and 391/359 ms respectively. Observed child peak RSS was 73.0, 75.3, and 71.7 MiB.

The checked-in report is `benchmarks/transport/windows-x64-node24-child-process-2026-07-24.json`. Both reports pass `validate:transport-benchmarks`; a fresh isolated smoke run also completes all five paths and teardown.

### Remaining boundary

I-074 remains active and D-004 remains unchanged. The shared-memory case is still a worker rather than a safe cross-process ownership/recovery design. Windows named pipes do not qualify Linux Unix-domain sockets. Target Linux x86-64 and ARM64, wall-clock CPU/RSS and scheduler soaks, identical Motion serialization/schema work, renderer/tracker suspend/kill/reconnect/churn, signed permission admission, and camera-to-action timing remain required before selecting a production transport.

## 2026-07-24: console-managed save lifecycle contract

### Delivered

- Added a pure Rust planner for remote-web, local-web, native/Godot, and Libretro save namespaces below separate host-owned data and cache roots.
- Kept package version out of the save namespace so healthy update/rollback preserves progress, while format changes receive a bounded opaque staging transaction.
- Added separate bounded save/cache quota reservations with existing-usage, remaining-byte, and integer-overflow checks.
- Defined exact local reset scope and an explicit remote-web boundary that never claims to delete hosted-service data.
- Added profile deletion transitions to fresh opaque unassigned ownership with no deleted profile ID in the returned persistent record, plus explicit conflict-blocking claim behavior.
- Documented D-089's no-backup/export/cross-console-migration/cloud boundary and kept profile-vault, diagnostics, package, content, cache, and save data distinct.

### Verification evidence

Ten focused native tests cover all four runtimes, managed-root and identifier traversal, separate quota limits, overflow, package-version namespace stability, migration bounds, wrong deleted owners, duplicate/unsafe unassigned tokens, profile-ID removal, same-name profile recreation, explicit claims, and unresolved slot conflicts. Focused Rust formatting, strict Clippy, and tests pass.

### Remaining boundary

I-100 closes as a design artifact, not a storage implementation claim. No directory, mount, quota, save, move, migration, unlink, claim, reset, or delete is performed. Signed release policy, browser/native/Libretro sandbox enforcement, atomic/power-loss-safe mutation, low/full-space behavior, hostile formats, metadata sanitation, Unassigned Progress UX, permanent-loss evidence, and proof on both reference platforms remain under I-022, I-162, I-188 through I-191, and I-209.

## 2026-07-24: crash-recoverable A/B system-update state

### Delivered

- Added a pre-provisioned, host-owned system-update journal over exactly two read-only slot identities with immutable, consecutive, SHA-256-linked complete records.
- Kept verified staging separate from boot selection; required the inactive slot, exact active target, canonical image/manifest hashes, and a strictly advancing generation.
- Added explicit arming with a bounded 1 through 10 attempt budget and a durable claim that consumes an attempt before a privileged boot coordinator transfers control.
- Required launcher, tracker, camera, controller, network, and storage health to pass in the same claimed attempt before the candidate becomes active.
- Rejected stale attempt reports, rolled back immediately on an unhealthy gate or watchdog deadline, retried an interrupted boot only while attempts remain, and rolled back automatically at exhaustion.
- Published records through a synchronized create-new temp file and no-replace hard link; recovery either discards an unpublished temp or removes a byte-identical duplicate temp after publication.
- Added `SYSTEM_AB_UPDATE_STATE.md`, D-151, an active I-110 evidence row, threat-model coverage, and deferred owner questions for trust roles, attempt/deadline policy, boot control, and migrations.

### Verification evidence

Twenty-one focused Rust tests cover initialization/reload, inactive staging, slot/target/generation denial, arming and globally monotonic claims, interruption retry/exhaustion, six-gate confirmation, missing-gate denial, failed health and timeout rollback, stale cross-update attempts, per-attempt health isolation, duplicate-health idempotency, failed-generation replay, alternating slots, bounds/conflicts, history tamper, rehashed impossible transitions, malformed/gapped/unknown records, both temporary-publication phases, and malformed evidence/temp state. Full native verification passes 174 library tests with five intentional helpers ignored and all fourteen CLI tests; formatting and strict Clippy are clean. The unchanged shared stack also passes 215 unit tests, typecheck, production build, schema/manifest/Motion/transport/Godot validation, the 133-component compliance freshness check, and a high-severity dependency audit with no known vulnerabilities. The first audit request received npm HTTP 503 after built-in retries; an immediate bounded retry succeeded.

### Remaining boundary

At this checkpoint the journal was metadata policy and crash-recovery logic, not a working Raspberry Pi updater. It did not download or sign-verify an image, reserve capacity, write/read back a partition, drive firmware or a bootloader, establish a protected monotonic anchor, authenticate health producers, perform migrations, compact the bounded journal, or touch writable content. The next slice adds signed regular-file verification only; target-Linux filesystem semantics, exact firmware selection, partition isolation, timed boots, update/write-volume measurements, hostile writers, and sudden-power injection across hundreds of qualified microSD cycles remain open under I-022, I-110 through I-114, I-141, I-202, and I-209.

## 2026-07-24: signature-first system-image evidence

### Delivered

- Added a domain-separated Ed25519 v1 manifest verifier for system images; exact signature verification occurs before closed JSON parsing.
- Bound positive generation, safe release ID, exact privileged target, raw format, signed byte length, and canonical SHA-256 while limiting the manifest to 64 KiB and image authority to 64 GiB.
- Required absolute regular manifest/signature/key/image inputs and canonical lowercase single-line public-key and signature encodings.
- Opened the raw image once, checked signed length before hashing, streamed every byte through SHA-256 with bounded memory, and rechecked the same handle's length afterward.
- Retained the exact verified file handle and exposed a consuming rewind handoff for the future privileged writer, preventing later path replacement from redirecting the copy.
- Added exact signed image length to persisted facts and a sealed, non-deserializable `VerifiedSystemImageEvidence` type as the only journal initialization/staging authority.
- Added `verify_inactive_readback` so sealed evidence exists only after an adapter-owned host-selected slot stream matches the signed length/hash; deserialized journal snapshots cannot be replayed as mutation authority.
- Added `SYSTEM_IMAGE_MANIFEST.md`, D-152, and updated I-110/I-141, offline behavior, native boundaries, owner questions, and the security threat model.

### Verification evidence

Ten focused tests cover signature-before-parse ordering, cross-domain signature denial, exact release/target/hash/length authority, complete verification, exact-handle rewind, path-replacement resistance, sealed matching read-back evidence, short/changed read-back denial, changed same-size and truncated source images, wrong target, unknown fields, unsupported schema/compression, zero generation and out-of-bound size, noncanonical/wrong keys, unsafe identifiers, uppercase hashes, relative/nonregular paths, and oversized metadata. Final isolated native verification passes 184 library tests with five intentional subprocess helpers ignored and all fourteen CLI tests; formatting and strict Clippy are clean.

### Remaining boundary

At this checkpoint the primitive verified one regular file under one provisioned key, retained its exact handle, and mechanically verified a supplied read-back stream; it was not a downloader or block-device update transaction. The later threshold-root tranche supersedes the public single-key admission path, while protected anti-rollback/time, TLS/resume/capacity/cleanup, concurrent-write exclusion or copy-time reverify, actual synchronized reader provenance, compression, signed migrations, bootloader selection, trustworthy health, target Linux, and power-loss campaigns remain open. The expected target, slot, reader, and root inputs are privileged configuration, but none is yet protected by verified boot or qualified provisioning.

## 2026-07-24: bounded storage layout and capacity boundary

### Delivered

- Added a pure four-partition planner for one firmware/boot extent, two equal runtime-read-only system extents, and one writable-data remainder over exact bounded device capacity.
- Represented D-048's selected card as 256,000,000,000 nominal manufacturer bytes without claiming final partition sizes; boot and slot inputs use 4 MiB alignment.
- Added nine fixed writable categories and host-derived direct-child namespaces for system state, production/developer packages, games/saves, profiles, retro content, logs, cache, and staging.
- Preserved explicit recovery headroom against every ordinary write while allowing a separately authorized recovery workspace to consume it without exceeding physical free space.
- Bound system-update capacity to sealed signed/read-back evidence, denied active-slot targets, and returned the writable-data extent unchanged as preservation evidence.
- Limited log/cache cleanup to policy, staging cleanup to its recovery coordinator, installed content to explicit lifecycle operations, and metadata/profile/save deletion to never automatic.
- Made factory-reset behavior explicit: sensitive/developer/transient domains delete, system metadata reinitializes from trusted state, and production-package/retro disposition remains an owner policy question.
- Added `STORAGE_LAYOUT_AND_CAPACITY.md`, D-153, an active I-111 evidence row, and a dedicated owner-question document.

### Verification evidence

Twelve focused Rust tests cover aligned contiguous derivation, equal read-only slots, one writable remainder, invalid/overflow/non-fitting input, fixed usage and full-threshold capacity, recovery-reserve consumption, sealed inactive-image fit, logical partition fault scope, cleanup and factory-reset disposition, fixed namespaces, and unsafe relative/root/traversal-like denial. Combined native verification passes 196 library tests with five intentional subprocess helpers ignored and all fourteen CLI tests; formatting and strict Clippy are clean.

### Remaining boundary

This code changes no disk. Exact card identity/capacity, final sizes, partition table, firmware compatibility, filesystems, runtime mount enforcement, real reservations/quotas, full-disk/corruption/update/reset/garbage-collection behavior, whole-card failure, computer-assisted reflash, endurance, write amplification, and sudden-power evidence remain open. The fixture's 512 MiB boot, 16 GiB slots, and 8 GiB reserve are illustrative qualification inputs only.

## 2026-07-24: threshold update root and delegated roles

### Delivered

- Added a bounded closed v1 root document with configurable out-of-band Ed25519 anchor and candidate-root thresholds.
- Verified bootstrap root bytes before parsing, then required the document to meet its own root threshold, a caller-supplied persisted generation floor, and caller-supplied trusted time.
- Required every rotation to advance exactly one generation and meet both current and candidate root thresholds over the same exact bytes.
- Added distinct channel/artifact/target roles for system images, installed catalogs, package releases, and an independently keyed offline recovery lane while retaining existing protocol domains and payload limits.
- Rejected root/role key-ID reuse, public-key reuse, impossible thresholds, duplicate roles/signatures, unknown fields, unsafe identifiers, noncanonical encodings, oversized payloads, rollback, generation skips, expiry, and cross-protocol signatures.
- Modeled delegated revocation by omission from the next authenticated root generation.
- Made delegated role authority the public system-image admission path before manifest parsing and retained the accepted root generation, role identity, and signer key IDs.
- Added `UPDATE_TRUST_ROOT.md`, a dedicated update-trust owner-question document, D-154, and updated I-110/I-112/I-141, offline/time behavior, native boundaries, and the threat model.

### Verification evidence

Fourteen focused root-policy tests cover signature-before-parse bootstrap, separate anchor/candidate thresholds, exact dual-threshold rotation, old-only/new-only denial, rollback/skip/expiry, persisted floor, exact role thresholds, domain/channel confusion, bootstrap/current-root-to-role reassignment denial during acceptance, independent recovery authority, revocation, duplicates/key reuse, malformed metadata, canonical encoding, and size bounds. One system-image integration test proves delegated authority precedes manifest parsing and is retained on the release. Final native verification passes 211 library tests with five intentional subprocess helpers ignored and all fourteen CLI tests; formatting and strict Clippy are clean.

The design is informed by TUF 1.0.35 root/role/rotation rules, Uptane 2.0.0 secure-time and image-verification requirements, and RFC 8032 Ed25519. It deliberately claims only the implemented subset, not framework conformance.

### Remaining boundary

This is an in-memory verification primitive. It does not choose production thresholds, provision anchors, establish trusted time, persist accepted roots/high-water state, acquire signatures or repository metadata, implement timestamp/snapshot/mirror/freeze defenses, wire installed-catalog/package-release loaders, protect artifact generation floors, or execute rotation/revocation/lost-quorum/recovery drills. An expired root blocks new artifact authority but does not define target long-offline UX. A maintained conformant update client should replace this subset if the complete repository workflow is required.

## 2026-07-24: delegated package trust across restart boundaries

### Delivered

- Added strict bounded JSON representations for out-of-band root anchors and
  key-ID-labeled detached signature sets so multi-signature thresholds remain
  representable through host integration.
- Added `TrustedUpdatePolicy` to bind one accepted root to an exact channel and
  caller-supplied trusted-time snapshot.
- Made delegated authority the only production entry point for installed
  catalogs and package-release descriptors. The former direct-key loaders now
  compile only for isolated tests.
- Retained accepted root generation, channel, target, artifact family, and
  signer IDs on typed catalog and release results.
- Carried the same update policy through archive intake, inert staging,
  catalog/artifact verification, candidate health and promotion, interruption
  recovery, active-generation reload, and launcher startup.
- Replaced `--catalog-public-key` with bounded root metadata, root signatures,
  out-of-band anchors, minimum root generation, channel, and trusted-time
  inputs. Loose catalog signatures and generation-store catalog/release
  signatures are now closed signature bundles.
- Added D-155 and updated the installed-catalog, package-intake,
  generation-store, update-root, offline, system-update, threat-model, native
  host, and investigation records.

### Verification evidence

Seventeen focused root-policy tests now include strict serialized anchor/signature
input, policy expiry/channel validation, and a dual-signed old/new role-key
cutover. Three artifact integrations prove
delegated authority precedes system-image, installed-catalog, and
package-release parsing and is retained. A generation-store adversarial test
proves changed release bytes and a package-release signer presented for the
installed-catalog role fail closed.

Final native verification passes 217 library tests with five intentional
subprocess helpers ignored and all fourteen CLI tests. Rust formatting, strict
all-target Clippy, and warning-denied Rustdoc pass. The shared stack also passes
215 TypeScript tests, typecheck, production build, schema/manifest/benchmark
validation, Godot 4.7.1 sample/contract/import/boot checks, all 23 Playwright
tests, the 133-component compliance freshness check, and a high-severity
dependency audit with no known vulnerabilities. Release blockers remain the
previous project-license (7) and pose-model-license (1) items.

### Remaining boundary

The CLI files and numbers are integration inputs, not evidence that anchors,
accepted-root history, generation floors, or time are protected. A long-running
host must obtain a fresh trustworthy time snapshot before later update
admission. Repository acquisition, timestamp/snapshot/mirror/freeze defenses,
production signer thresholds and custody, crash-recoverable protected root
rotation, physical recovery drills, automated bad-package rollback, uninstall,
and target power-loss qualification remain open. D-155 closes the production
single-key bypass; it does not claim TUF/Uptane conformance or protected
anti-rollback.

## 2026-07-24: crash-recoverable accepted-root history

### Delivered

- Added an already-provisioned, bounded accepted-root store with a fixed
  operation lock and append-only 20-digit generation directories.
- Persisted exact bounded root and detached-signature bytes through
  create-new synchronized files in a private generation directory, then made
  the atomic directory rename the only commit point.
- Replayed the complete bootstrap and old-and-new-threshold rotation chain on
  every load. Historical roots may be expired, while the final root must meet
  caller-supplied trusted time and the protected minimum generation.
- Failed closed on unpublished state, unexpected entries, unsafe direct-child
  paths, extra files, gaps, changed signed bytes, excessive history, expiry,
  rollback, and operation-lock contention.
- Added explicit recovery that removes only canonical unpublished
  `.incoming-*` directories and never rewrites or deletes committed history.
- Added separate `update-root bootstrap|rotate|recover` maintenance operations.
  Catalog-backed launcher startup replays the accepted-root store before
  package recovery or browser creation; dry-run remains read-only and refuses
  pending root recovery.
- Added `UPDATE_ROOT_STORE.md`, D-156/D-157, a root-history
  provisioning/repair owner question, and updated I-112/I-141, update trust,
  offline behavior, native boundaries, and the security threat model.

### Verification evidence

Twelve focused tests cover exact-byte persistence and reopen, consecutive
rotation, expired historical replay, an expired current root authenticating one
current successor, expired-current artifact denial, protected-floor rollback
denial, committed-byte tampering, history gaps, interrupted publication and
explicit recovery, committed-history preservation, unexpected entries,
nonblocking lock contention, and the final directory rename as the publication
point. Two CLI tests cover explicit unique maintenance inputs, launcher replay,
read-only dry-run behavior, and normal-start recovery ordering.

Final native verification passes 229 library tests with five intentional
subprocess helpers ignored and all sixteen CLI tests. Rust formatting, strict
all-target Clippy, and warning-denied Rustdoc pass. The 133-component
compliance inventory remains fresh; the existing project-license (7) and
pose-model-license (1) release blockers are unchanged.

### Remaining boundary

This is ordinary writable-filesystem crash monotonicity, not protected
anti-rollback. The launcher now replays the store, and separate maintenance
commands bootstrap, rotate, or recover it, but their privileged inputs still do
not establish protected provenance. Out-of-band anchor provenance, protected
high-water state, secure refreshed time, commit ordering with future monotonic
hardware, checkpoint/retention policy, same-account write isolation, and
target-Linux power-cut qualification remain open. Recovery must never lower the
protected floor or accept an unauthenticated latest root.

## 2026-07-24: exact protected-root commit binding

### Delivered

- Replaced the generation-only launcher floor with a strict bounded protected
  state containing the exact accepted-root generation and metadata SHA-256.
- Made root bootstrap/rotation publish durable history first and return the
  exact state an external monotonic adapter must commit. The new root cannot
  authorize artifacts while writable history is ahead of protected state.
- Rejected protected state ahead of history, same-generation digest
  substitution, missing protected history, malformed/unknown state fields, and
  noncanonical hashes.
- Made retry idempotent before and after the external commit. Maintenance
  output reports `protected-commit-required` with the exact generation/digest;
  it never rewrites the protected adapter itself.
- Replaced launcher and maintenance generation-number flags with bounded
  protected-state file inputs, while preserving the explicit warning that an
  ordinary writable file is not protected provenance.

### Verification evidence

Fifteen focused root-store tests now include strict protected-state documents,
two-phase pending/commit behavior, retry on both sides of the commit, and a
valid same-generation root substitution attack. The launcher integration test
loads the exact protected state before root replay.

### Remaining boundary

The software protocol is ready for a platform adapter but does not select or
qualify TPM, secure-element, verified-boot, or authenticated remote state on
either hardware tier. Trusted refreshed time, artifact-generation protection,
physical power-cut injection across the two commits, recovery-media repair,
and operator rotation/revocation drills remain open.

## 2026-07-24: signed native-package runtime dispatch

### Delivered

- Extended the strict installed catalog with an exclusive `native` runtime
  record containing one relative executable path and canonical SHA-256.
- Required the bound signed manifest to agree on native runtime identity and
  rejected missing, mixed Libretro/native, escaping, changed, and misbound
  records.
- Added a direct native planner with no shell or package-controlled arguments,
  a working directory derived from the installed executable, and host-derived
  profile/game runtime and persistent-data paths.
- Added `PackageLaunchPlan` as the shared Libretro/native boundary used by
  generation health, ordinary authenticated launch, and host-selected
  watchdog preparation.
- Kept health roots transaction-scoped so candidate native packages do not
  receive the intended player's data path during promotion.
- Added `NATIVE_PACKAGE_RUNTIME.md`, D-159, active I-094 evidence, and a
  separate Q-128 through Q-131 owner-question record.

### Verification evidence

Native tests cover direct no-argument planning and storage preparation,
artifact tamper, install-root escape, unsafe IDs/roots, signed catalog
resolution, runtime-record confusion, missing records, manifest runtime
misbinding, shared planner dispatch, candidate-health storage isolation, and
live/watchdog lifecycle preparation. The runtime-independent lifecycle,
watchdog, replay, cancellation, and generation-protection suites continue to
exercise both plans through the shared interface.

Final native verification passes 239 library tests with five intentional
subprocess helpers ignored and all sixteen CLI tests. Rust formatting, strict
all-target Clippy, and warning-denied Rustdoc pass.

### Remaining boundary

This is a process-only adapter. It does not select or qualify the production
Linux sandbox, inherited environment allowlist, fixed runtime arguments,
filesystem/network/device grants, immutable descriptor-bound execution,
descendant cgroup cleanup, compositor surface readiness, reserved global
controls, Godot packaging, or ARM64/x86-64 hardware behavior. A native catalog
entry is executable authority under the desk host; it is not family-mode
qualification or evidence that hostile native code is contained.

## 2026-07-24: persistent opaque launch-profile intake

### Delivered

- Added a strict 16 KiB v1 profile registry containing at most 64 unique safe
  opaque IDs and no names, portraits, body data, paths, permissions, or
  lifecycle commands.
- Added `--profile-registry` as the normal persistent launcher profile source.
  Repeated `--profile-id` remains a mutually exclusive development fallback.
- Kept an empty registry metadata-only, required the durable launch-replay root
  for nonempty profile configuration, and required at least one validated
  profile for watchdog games.
- Loaded and validated the profile source before accepted-root or package
  recovery, so malformed profile state cannot trigger those mutations and fail
  afterward.
- Passed only validated registry IDs into the existing authenticated
  `trusted-package-launch` capability; browser display text still cannot create
  a storage or launch identity.
- Added `PROFILE_REGISTRY.md`, D-160, and a separate Q-132 through Q-135 owner
  record without claiming a profile writer or deletion transaction.

### Verification evidence

Three library tests cover ordered/empty state, closed-document and identifier
bounds, duplicate/oversize rejection, and registry-to-authenticated-capability
handoff. Two CLI tests cover source exclusivity, invalid-file denial, replay
requirements, and proof that registry validation precedes recovery.

The isolated `ab0c57b` verification tree passes 242 active library tests with
five intentional subprocess helpers ignored and all eighteen CLI tests. Rust
formatting, strict all-target Clippy, and warning-denied Rustdoc pass. This
isolated proof intentionally excludes a concurrent uncommitted
package-generation anti-rollback tranche in the shared worktree.

### Remaining boundary

This is read-only launch authority, not the complete persistent profile
lifecycle. A qualified privileged writer, synchronization and rollback policy,
guest lifetime, profile creation/removal, sensitive-data deletion, save
unassignment, encrypted-vault integration, backup/support/recovery exclusion,
target permissions, hostile-writer tests, and power-loss recovery remain open.

## 2026-07-24: exact protected package-generation state

### Delivered

- Added a strict 1 KiB v1 package protected-state document binding one exact
  update channel, compiled platform target, generation, and installed-catalog
  SHA-256. Generation zero is the only uninitialized form.
- Required every store open to match protected scope to its trusted update
  policy and target, and required writable activation history to equal the
  protected generation and digest before launch, generation cleanup, candidate
  health, or later promotion.
- Changed promotion into a two-phase transaction: verify and publish the
  activation first, return the exact next state, and keep the generation
  unusable until a privileged platform adapter commits that state.
- Made recovery report the same exact pending state after interruption without
  advancing it. Re-verified the signed catalog and every artifact before a
  pending state can be returned.
- Rejected protected history deletion/rollback, same-generation catalog
  substitution, cross-channel/target state, state ahead of history, and
  additional candidate execution while a commit is pending.
- Required generation-store launcher mode to supply
  `--package-protected-state`, rejected it in loose-catalog development mode,
  validated it after profile intake but before root/package recovery, and kept
  launcher startup unable to auto-acknowledge writable history.
- Added `PACKAGE_GENERATION_PROTECTED_STATE.md`, D-161, and a separate Q-136
  through Q-139 owner record.

### Verification evidence

Thirty-six focused generation-store tests cover strict document bounds and
scope, first and later two-phase promotion, pending launch/health/promotion
denial, exact retry, deletion to an older valid activation, same-generation
digest substitution, changed pending artifacts, interruption on both sides of
the generation move, cleanup composition, and the pre-existing signed
intake/health/recovery cases.

Nineteen CLI tests cover mandatory source-specific configuration and prove that
invalid package protected state is rejected before update-root recovery. Full
native verification passes 246 library tests with five intentional subprocess
helpers ignored and all nineteen CLI tests. Rust formatting, strict all-target
Clippy, and warning-denied Rustdoc pass.

The full parallel native suite also exposed a Windows temporary-fixture name
collision in the pre-existing installed-catalog tests. A process-local atomic
suffix now supplements the timestamp and process ID; the focused test passed
ten consecutive repetitions and two subsequent complete workspace test runs
passed.

### Remaining boundary

The JSON document is an adapter representation, not protected storage. The
Windows and Linux integrity/anti-rollback mechanism, exact compare-and-swap,
exclusive slot identity, authorized channel/target migration, disaster reset,
audit/product response, trusted refreshed time, hostile-writer qualification,
and physical power-loss campaigns remain Q-136 through Q-139 and
I-101/I-141/I-209 work. Loose-catalog mode remains development-only and has no
persistent package-generation anti-rollback history.

## 2026-07-24: Motion transport serialization and WSL2 evidence

### Delivered

- Added an explicit `opaque-bytes` versus `motion-json` benchmark mode. Every
  measured Motion round trip performs producer-side Motion `0.3.0` validation,
  UTF-8 JSON encoding, transport, consumer-side JSON decoding, and the same
  schema validation.
- Added fixed schema-valid core-17, ten-action, and
  MediaPipe-33-with-provider-world frame shapes. The harness rejects a caller
  byte size for Motion JSON and rejects a frame-shape selector for opaque
  bytes, so reported pairs cannot silently use different payload sizes.
- Recorded size-matched 5,000-round child-process Windows controls at 2,010,
  2,919, and 8,353 bytes. Validation and serialization are material across
  every candidate and scale with actual Motion shape; opaque transport numbers
  alone are no longer used as selection evidence.
- Versioned report provenance to record OS release plus an explicit WSL2 or
  native/unknown environment classification. Platform-specific limitations
  distinguish Windows named pipes, WSL2 Unix-domain sockets, and native Linux.
- Ran core and rich size-paired reports from a fresh frozen Ubuntu WSL2 install
  under kernel `6.6.87.2-microsoft-standard-WSL2`. Unix-domain sockets beat TCP
  and WebSocket at p50 in those runs, while rich-frame p99 spikes prevent a
  stability or production-selection claim.
- Expanded `MOTION_TRANSPORT_BENCHMARK.md` with exact commands, results,
  artifact names, comparison boundaries, and the remaining decision gates.

### Verification evidence

Five payload tests cover deterministic opaque bytes, stable full Motion round
trips, core/rich/action shape separation, malformed JSON, schema-invalid
landmarks, and unsupported modes/shapes. The structural validator accepts the
two historical v1 reports, six Windows v2 reports, and four
provenance-bearing WSL2 v3 reports while enforcing version-specific fields and
exact supported frame descriptions.

The full shared gate set passes 215 TypeScript/Svelte tests, clean typecheck,
the production build, schema and manifest validation, motion benchmark
validation, all twelve transport reports, and the deterministic 133-component
compliance inventory with the unchanged seven project-license and one
pose-model-license release blockers.

### Remaining boundary

WSL2 is Linux-kernel development evidence, not the ordinary native x86-64
reference and not ARM64 qualification. Shared memory still crosses only a
worker thread; safe cross-process ownership, permissions, crash/stale-reader
recovery, wall-clock CPU/RSS and scheduler soaks, live multi-player and
worst-case backend distributions, renderer/tracker suspend/kill/reconnect,
signed permission admission, and exposure-to-action latency remain. I-074
stays active and D-004 remains unchanged.

## 2026-07-24: Linux-native package fixture and advisory-lock portability

### Delivered

- Replaced host-metadata-derived package TAR fixture entries with explicit
  portable regular-file headers. Linux no longer copies the filesystem file
  type bits into the archive permission field, while production intake keeps
  rejecting non-portable modes.
- Explicitly unlock package-generation, package-transfer, update-root, and
  native-launch-replay advisory locks before their owning handles close. This
  prevents a concurrent Unix `fork` from briefly retaining a completed
  operation's lock through an inherited open-file description.

### Verification evidence

The original isolated Ubuntu WSL2 workspace reproduced four deterministic
`UnsafeMode` intake failures and three parallel-suite `Busy` failures. The TAR
failure reproduced alone; the lock failures appeared only beside subprocess
tests and disappeared with one test thread, separating archive construction
from Unix lock lifetime.

After the fixes, strict all-target Clippy, 246 library tests with five
intentional helpers ignored, all nineteen CLI tests, and warning-denied
Rustdoc pass in the isolated WSL2 workspace. The same library suite passes on
Windows.

### Remaining boundary

This is Linux-kernel development coverage, not the ordinary native x86-64
appliance qualification required by I-209. Physical power loss, hostile
writers, real service/process-tree behavior, filesystem/mount policy, and the
currently separate system-update tranche remain outside this result.

## 2026-07-24: explicit crash-recoverable save reset

### Delivered

- Added a host-only `SaveResetExecutor` over preprovisioned, canonical,
  mutually disjoint transaction/data/cache roots and one inert nonblocking
  operation lock.
- Consumed the existing `SaveStoragePlan` identity instead of accepting a
  caller path. The executor reconstructs and checks the exact
  game/owner/runtime save and cache targets.
- Published a strict bounded path-free intent before mutation, synchronized
  Unix directory boundaries, removed save then cache, and retained the intent
  until both targets were absent.
- Added recovery for unpublished temporary state, either deletion boundary,
  and already-absent targets. Malformed/oversized state, foreign roots,
  non-directory substitution, or lock contention fail closed.
- Kept the primitive out of browser and CLI surfaces. It cannot choose reset
  timing, uninstall packages, claim progress, export/upload payloads, delete
  hosted-service data, or touch profile-vault fields.
- Added `SAVE_RESET.md` and advanced I-191 from open to active without claiming
  reference-platform qualification.

### Verification evidence

Nine focused tests cover exact-scope deletion; preservation of other owners,
games, and package bytes; first-target interruption; idempotence; unpublished
temporary cleanup; strict/oversized intent; foreign roots; unsafe target
substitution; nonblocking contention; required preprovisioning; disjoint roots;
and absence of export/profile-claim authority.

The isolated Ubuntu WSL2 development workspace passes formatting, strict
all-target Clippy, the complete native workspace tests, and warning-denied
Rustdoc with this module. Focused and full native library tests pass on
Windows.

### Remaining boundary

There is intentionally no automatic or browser reset caller. A trusted
lifecycle service, deliberate controller/motion confirmation, safe Back,
runtime quiescence, browser/native confinement, quota coordination, durable
unlink/claim/migration, hostile-writer resistance, and native x86-64/Pi
power-loss/full-disk/corruption evidence remain I-189 through I-191 and I-209.

## 2026-07-24: exact protected system-update journal state

### Delivered

- Added a strict, closed 1 KiB v1 state document binding the delegated update
  channel, platform target, journal record sequence, and complete canonical
  latest-record SHA-256.
- Preserved the delegated channel through sealed inactive-slot read-back
  evidence and every persisted system image, advancing the internal journal
  record schema to v2 instead of silently redefining v1.
- Required exact protected state for initialization, snapshots, recovery,
  staging, arming, boot selection and claim, health transitions, interrupted
  boot recovery, confirmation, and rollback.
- Made every mutation a two-phase transaction that durably publishes one
  record and returns its exact next protected state without committing it.
  Candidate transfer requires the boot-claim state to be committed first.
- Added authenticated idempotent retry for exactly one record ahead. Only
  reconstructing the identical operation and canonical record returns pending
  commit state; ordinary reads and nonmatching retries disclose sequence
  diagnostics only.
- Added rollback, same-sequence substitution, scope-drift, stale-state,
  multiple-record-ahead, and ambiguous-temp refusal while preserving
  deterministic temporary publication recovery.
- Explicitly released the operation advisory lock before closing its handle,
  matching the native store portability discipline across concurrent Unix
  forks.
- Documented the adapter transaction in
  `SYSTEM_UPDATE_PROTECTED_STATE.md`, recorded D-162, and deferred the actual
  storage/CAS, firmware handoff, migration/reset, and incident response as
  Q-140 through Q-143.

### Verification evidence

Twenty-seven focused system-update tests cover strict protected-state intake,
two-phase behavior for every mutation, exact and nonmatching retry,
record deletion/substitution, channel and target drift, attempt/health
isolation, rollback, and temporary publication recovery. Eleven system-image
tests cover delegated channel retention together with signature-first source
and inactive-slot read-back verification. The storage-layout composition test
also passes against the channel-bearing evidence.

Strict all-target Clippy, warning-denied Rustdoc, 261 complete native library
tests with five intentional helpers ignored, all nineteen native CLI tests,
workspace formatting, 221 TypeScript/Svelte tests, typecheck, production
build, schema/manifest/benchmark/transport/Godot/compliance validation,
dependency audit, and all twenty-four browser E2E flows pass on Windows.
Release-mode compliance remains blocked only by the seven existing project
license entries and one pose-model redistribution decision.

### Remaining boundary

The bounded JSON state is an adapter contract, not protected storage.
Qualified integrity and anti-rollback storage, exact durable compare-and-swap,
secure write-rate/endurance evidence, Raspberry Pi bootloader coordination,
trusted health producers and deadlines, authorized migration/reset, audit
handling, reader/block-writer provenance, and target power-loss/full-disk
qualification remain open.

## 2026-07-24: fail-closed console operating modes

### Delivered

- Replaced the unrestricted Developer mode switch with a pure family/admin/
  developer controller and explicit launcher state.
- Made family mode the boot, reboot, lock, and identity-change default.
- Required separate one-shot 30-second local confirmations for admin and then
  developer state. Cancelled, expired, malformed, or impossible transitions
  grant nothing.
- Kept guest/local profile identity orthogonal to privilege and revoked
  elevation on identity change.
- Moved focus to the first safe action after every transition; controller Back
  cancels pending confirmation without leaving Settings.
- Kept pairing and deployment absent: the browser opens no listener, holds no
  credential/key, and cannot grant native authority.
- Added `CONSOLE_OPERATING_MODES.md`, Q-144 through Q-147, and advanced I-115.

### Verification evidence

Six unit tests cover boot/reboot denial, both confirmations, expiry,
cancellation, developer exit, family lock, profile non-authority,
identity-change revocation, invalid clocks, and impossible transitions.

Two Chrome flows verify visible family/admin/developer states, pairing
unavailability, profile-change revocation, controller Select through both
confirmations, controller Back cancellation/retry at both stages, and focus
continuity.

### Remaining boundary

This is browser policy/UX, not authentication. A privileged coordinator,
reserved local input, actual authenticated encrypted pairing, protected keys
and state, listener shutdown, audit, hostile same-origin tests, reboot/update
behavior, controller-only recovery, and accessibility review remain I-102/
I-115 work after Q-144 through Q-147.

## 2026-07-24: bounded local diagnostics and consented export

### Delivered

- Added a newest-256 in-memory diagnostic buffer using only a closed code
  vocabulary, derived subsystem/severity, monotonic page uptime, and sequence.
- Rejected unknown codes, malformed/reversed time, and arbitrary text/payload
  attachment; kept profile/game/package IDs, URLs, paths, tokens, frames,
  skeletons, wall-clock time, and exception text out of the schema.
- Capped JSON export at 64 KiB and made Prepare/Confirm export use the exact
  bytes frozen during review, so later events cannot enter silently.
- Allowed family-mode review but required local admin state to export or clear;
  clear removes events, eviction count, sequence, and time state.
- Used a local Blob download with no persistent browser store or network path.
- Added `LOCAL_DIAGNOSTICS.md`, Q-148 through Q-150, and advanced I-116.

### Verification evidence

Six unit tests cover closed metadata/privacy declarations, exact retention/
eviction, malformed input, hostile free-text/profile/path/token/frame
smuggling, deterministic bounded JSON, and complete clear.

The Chrome flow proves family export denial, admin gating, exact disclosure,
two-step download, expected filename/schema, false prohibited-data flags,
absence of active name/profile ID/URL secret, zero export network requests, and
complete clear. Visual review confirms the retained-code and privacy panels
remain legible at the reviewed desktop viewport.

All 227 TypeScript/Svelte tests, zero-warning typecheck, production build,
schema/manifest/benchmark/transport/compliance freshness, and all 25 Chrome
flows pass on Windows.

### Remaining boundary

This is volatile browser evidence, not trustworthy native logging. Native
crash-safe storage, producer authentication, every-producer redaction,
health-summary UX, final byte/boot/time rotation, trusted provenance/clock
policy, filesystem/full-disk/power-loss behavior, controller/accessibility
review, and an independently reviewed support artifact remain I-116 work after
Q-148 through Q-150.

## 2026-07-24: automatic body-profile matching threat model

### Delivered

- Added a feature-specific threat model without replacing or narrowing the
  repository-wide security model.
- Classified raw samples, landmark windows, probes, templates, candidates,
  scores, profile presentation, calibration, policy state, and the vault key
  by sensitivity and intended lifetime.
- Drew the planned capture-to-confirmation flow and made the portrait store,
  game runtimes, backup, diagnostics, support, recovery, and cloud explicit
  no-edge boundaries.
- Defined nine trust boundaries, eight actor classes, seven security/privacy
  objectives, and fail-closed behavior for absent consent, schema drift,
  vault/key failure, ambiguity, missing confirmation, withdrawal, and
  portrait/matching separation.
- Recorded sixteen attacker stories covering enumeration and membership
  oracles, removable-storage theft, rollback, false matches, unequal error,
  portrait creep, diagnostics/recovery leakage, developer misuse, incomplete
  deletion, key loss, hostile inputs, supply chain, accidental management,
  bystanders, and shared-TV disclosure.
- Specified the crash-recoverable deletion sequence, canary-based negative-
  leak matrix, feature inversion/linkability tests, stratified accuracy
  evidence, legal-jurisdiction screening, and Critical/High/Medium/Low
  severity calibration.
- Made explicit profile selection with transient calibration the complete
  fallback and kept automatic matching disabled until every release gate
  passes.
- Added Q-151 through Q-154 for the exact feature allowlist, household
  notice/consent/opt-out, launch jurisdictions/legal posture, and measurable
  residual-risk acceptance.

### Verification evidence

The artifact covers every proof class requested by I-184 and links the current
primary GDPR/UK ICO, COPPA/eCFR, Illinois, Colorado, Texas, and California
screening sources. Local Markdown links resolve, whitespace validation passes,
and the investigation remains `active` rather than claiming that a design
review proves implementation, legal compliance, target security, or household
acceptability.

### Remaining boundary

The exact minimized feature schema and consent state do not exist. Automatic
matching, the profile broker, encrypted vault, device-bound key, protected
deletion state, target sandboxing, exclusion tests, inversion/linkability
tests, accuracy and accessibility trials, household research, and legal review
are all unimplemented or unperformed. I-067, I-072, I-186, and I-187 must
produce that evidence, and the owner must answer Q-151 through Q-154 before
I-184 can close or any household beta can enable matching.

## 2026-07-24: local browser document policy and hostile boundary

### Delivered

- Added response-delivered, route-specific CSP for every Vite-served HTML
  navigation, including history fallbacks.
- Kept the trusted launcher frame-free, form-free, ancestor-free, and
  loopback-only for host API connectivity while allowing its pinned local
  worker, model, font, Blob, camera, and WebAssembly behavior.
- Added a closed Permissions Policy: camera/gamepad stay same-origin and
  microphone, location, display capture, fullscreen, sensors, payment,
  device APIs, credentials, wake lock, and sharing are denied.
- Added no-referrer, MIME-sniffing prevention, cross-origin opener/embedder
  isolation, origin-agent clustering, and default same-origin resource policy.
- Added exact frame-ancestor/resource exceptions only for the two
  cross-origin fixture documents that require embedding.
- Added a hostile cross-origin child with CSP and a sandbox that omits popup,
  top-navigation, download, form, pointer-lock, and presentation authority.
- Added `BROWSER_POLICY_BOUNDARY.md` and D-163; advanced I-136 to `active`.

### Verification evidence

The Chrome abuse flow grants camera, microphone, and location site permission
to the hostile child before load. It observes response headers and then proves
parent-DOM reads, camera/microphone/location requests, network, popup, top
navigation, download, form, fullscreen, and pointer-lock attempts are denied.
It also observes no escape request, popup, download, or top-page navigation.
Zero-warning typecheck and a production multi-page build pass with the new
policies and fixtures.

### Remaining boundary

These headers are emitted by Vite development/preview, not yet a qualified
production loopback server. The fixture is an iframe, not the planned
top-level hosted-game lane. Same-origin/XSS, post-launch redirects, custom
schemes/`file:`, service workers/storage, browser-profile destruction,
resource ceilings, crash/hang cleanup, compositor ownership, global
Home/Back/Pause, and both Linux targets remain under I-136, I-150, I-180, and
I-209.

## 2026-07-24: console-level accessibility preference prototype

### Delivered

- Added one closed, versioned, at-most-1-KiB device-wide accessibility
  document with conservative no-write defaults and complete reset.
- Added standard/large text, standard/high contrast, system/explicit reduced
  motion, posture, confirm-button preview, and local audio-cue On/Off controls
  under the new pre-profile Settings / Access panel.
- Applied text, contrast, and motion to the root shell contract, including
  redundant high-contrast focus outline/spacing/underline.
- Kept seated posture and remapping visibly preview-only; selecting West/X
  cannot change the canonical browser router, and Home/Back/Pause remain
  outside remapping.
- Reported saved/default/volatile state and retained usable session controls
  when browser storage fails.
- Added `ACCESSIBILITY_PREFERENCES.md`, Q-159 through Q-161, and D-164;
  advanced I-119 to `active`.

### Verification evidence

Six unit tests cover strict defaults, exact round-trip, the byte cap, malformed/
oversized/unknown/wrong-version/unknown-value denial, storage failures,
runtime-change validation, root application, and complete reset.

The real Chrome flow proves computed large text, high contrast, reduced motion,
seated/remap disclosures, local audio Off/On, exact bytes, reload restoration,
controller Select and Back, canonical South/A behavior after choosing the
West/X preview, and key removal on reset. Visual review of
`test-results/console-lab/accessibility-settings.png` confirms readable
hierarchy, redundant selected state, and the remap boundary at 1440x1000.
The complete Windows pass includes all 233 TypeScript/Svelte tests,
zero-warning typecheck, production build, schema/manifest/benchmark/transport/
Godot/device-data/compliance gates, and all 27 Chrome flows.

### Remaining boundary

Browser local storage is not the native settings service. Final device/profile
scope, migrations/update/rollback, SDL3 remapping and recovery, tracker/game
propagation, qualified seated play, assistive technology and audio design,
target-TV scaling/safe area, both hardware tiers, and household testing remain
under I-068, I-098, I-119, I-147, I-152, I-155, and I-206.

## 2026-07-24: device-only player-data exclusion verifier

### Delivered

- Added a strict 64-KiB v1 scan manifest with exact artifact, synthetic
  canary, forbidden path-segment, forbidden source-digest, and global limit
  fields.
- Required one through sixty-four disjoint materialized artifact directories
  from a closed backup/cloud/developer/diagnostics/export/factory-reset/game-
  storage/recovery/support/system-slot vocabulary.
- Accepted only synthetic `VCG-CANARY-*` values and detected literal UTF-8,
  lowercase, UTF-16LE/BE, Base64/Base64URL, and lower/uppercase hexadecimal,
  including matches divided across 64-KiB stream chunks.
- Added fixed path-segment and exact source-file SHA-256 signals so a copied
  encrypted or renamed vault cannot pass merely because plaintext canaries are
  hidden.
- Enforced manifest-relative containment, no symlinks or overlapping roots,
  regular-file/directory-only inventory, deterministic traversal, global
  entry/file/byte/finding caps, file identity checks, and post-scan
  reinventory.
- Refused recognized archive, compression, PDF, database, and disk/filesystem
  containers by extension or common magic instead of claiming absence over
  opaque bytes.
- Emitted no canary, snippet, input path, filename, or exception. Findings use
  only artifact ID, entry ordinal, signal ID/type, location, and encoding; each
  artifact also receives a path-free ordered content-tree commitment.
- Gave the CLI distinct exit states for pass (`0`), finding (`1`), and
  invalid/incomplete/no-claim (`2`).
- Added the complete producer/materialization/positive-control procedure,
  I-186 coverage ledger, explicit limits, and Q-155 through Q-158.

### Verification evidence

Ten focused tests cover strict manifests and synthetic values, deterministic
clean evidence, all eight encodings and stream-boundary overlap, filename
redaction, fixed path/source-digest signals, bounded finding truncation,
extension and magic refusal, cross-root global limits, overlap/symlink denial,
content-tree change detection, and closed CLI output/exit behavior. Node syntax
checks and the named `pnpm validate:data-exclusion` gate pass.

The complete Windows verification also passes 227 TypeScript/Svelte tests,
zero-warning typecheck, the production build, all 26 browser flows, schema/
manifest/benchmark/transport/Godot/compliance freshness, dependency audit,
native formatting, strict all-target Clippy, 261 native library tests with five
intentional helpers ignored, all 19 native CLI tests, and warning-denied
Rustdoc. Release compliance remains blocked only by the seven known project-
license entries and one pose-model redistribution decision.

### Remaining boundary

This is a verifier primitive, not proof that any production artifact is clean.
No profile vault, portrait store, body template, producer-specific injection,
positive-control harness, trusted archive/image/database materializer, raw-
artifact evidence binding, or target artifact inventory exists. RAM, swap,
crash capture, network traffic, filesystem slack, flash remanence, alternate
streams, and hostile-filesystem snapshots need separate evidence. Every I-186
path on Raspberry Pi and the premium PC target remains open until Q-155
through Q-158 are resolved and exact production artifacts pass.

## 2026-07-24: console-bound profile-vault qualification design

### Delivered

- Selected one common broker-owned envelope-encrypted object-store design
  under the fixed `profiles/` namespace, without representing a vault as
  implemented.
- Defined an on-device random console vault key, independent random
  per-profile keys, HKDF-SHA-256 subkey separation, and AES-256-GCM-SIV
  authenticated records with closed bounded associated-data headers.
- Defined per-profile cryptographic deletion, whole-vault key destruction,
  manifest-before-protected-state ordering, exact one-step retry, rollback and
  substitution refusal, and hard failure instead of plaintext fallback.
- Integrated the design with the existing A/B update attempt and protected
  state contracts, including simultaneous authorization of the healthy and
  candidate boot states and a synthetic vault health sentinel.
- Recorded caller-specific broker projections, developer/root limits,
  no-dump/no-swap requirements, loss/reset behavior, and a complete target
  fault, attack, power-loss, performance, and endurance qualification matrix.
- Reconciled current primary platform evidence: Pi 5 secure boot and
  device-private-key support do not provide a hardware-protected key store;
  the Infineon SLB 9672 Raspberry Pi SPI TPM HAT is an evaluation candidate,
  not qualified product hardware; and Valve does not publish the delivered
  Steam Machine TPM/measured-boot/custom-policy contract.
- Added D-165, advanced I-187 to `active`, and recorded Q-162 through Q-166.

### Verification evidence

The two new Markdown artifacts contain no trailing whitespace, tabs, or
duplicate headings. Their internal repository links resolve, Q-162 through
Q-166 do not collide with the accessibility tranche's Q-159 through Q-161,
and the decision/investigation/register references are cross-checked against
the current tree. Primary claims are linked to current Raspberry Pi, Infineon,
systemd, Valve, and RFC sources. No executable code or dependency changed, so
the previously passing build/test gates remain the applicable code evidence.

### Remaining boundary

Neither platform is qualified. The exact Pi protector branch and assembled
BOM, delivered Steam Machine capabilities, algorithm implementation and
schema, platform protected-state adapter, native broker/sandbox, encrypted
journal, profile registry and unassigned-save transaction, factory-reset
executor, I-186 producer canaries, target power-loss/storage/update campaigns,
and security review remain open. Persistent encrypted profiles and automatic
body-profile matching must stay disabled until their respective gates pass.

## 2026-07-24: bounded power and recovery state machine

### Delivered

- Added a pure fail-closed runtime controller for tier-native idle, wake,
  restart, and shutdown with exact coordinator-epoch/operation-ID references
  and monotonic deadlines.
- Required launch admission to close before game, tracker, camera, input,
  writable-state, and protected-update quiescence acknowledgements.
- Mapped a short physical power press to idle while active and wake while idle;
  kept Restart and Shut Down behind a separate expiring confirmation.
- Kept the entire transition, including platform handoff, inside one bounded
  window and made timeout, adapter failure, unsafe update state, and unclean
  electrical loss terminal rather than recoverable through page input.
- Added a separate boot-only service gate: a qualified dedicated-button hold
  plus release authorizes non-destructive service mode, while recovery requires
  a new press and release and yields one one-shot boot-bound authorization.
- Documented the state diagrams, exact gates, adapter responsibilities,
  emergency-cut semantics, security boundary, unresolved implementation, and
  Q-167 through Q-169.
- Added D-166 and advanced I-029 from `open` to `active`.

### Verification evidence

Nineteen focused Vitest cases cover both idle strategies, short-press mapping,
launch-admission-first ordering, all quiescence/wake gates, exact confirmation,
cancel/expiry, stale/cross-operation/cross-restart and open-enum rejection,
transition deadlines, adapter faults, one-shot handoff, unclean loss, monotonic
clock and identifier bounds, ordinary boot, service hold/release, separate
recovery press/release, cancellation, and wrong-boot/replayed/forged/misordered
physical evidence, including unknown-field rejection and release after a
canceled press. The focused suite and zero-warning Svelte typecheck pass.

### Remaining boundary

This is executable policy, not native power or recovery. Privileged service
coordination, authenticated acknowledgements, per-game suspend/checkpoint
manifest semantics, systemd/firmware/SteamOS/Pi adapters, physical controls,
display blanking and wake devices, signed recovery, data/reset disposition,
and target suspend/resume/power-cut/thermal/energy/endurance tests remain open.

## 2026-07-24: Unassigned Progress console UX

### Delivered

- Added a pure bounded controller for no-more-than-64 closed sanitized
  unassigned-progress projections, exact profile-slot conflict inspection,
  path-free play plans, revision-bound claim/delete plans, and stale
  confirmation refusal.
- Added an OCR-A launcher screen with representative synthetic local-web,
  native/Godot, Libretro, and remote-web records; compatibility and local-loss
  disclosures; Play Unassigned; explicit profile selection; conflict
  resolution; and deliberate permanent deletion.
- Kept opaque owner IDs out of rendered copy and omitted paths, arbitrary
  metadata, export, migration, cloud, portrait, calibration, and
  body-matching fields from the browser model.
- Added explicit Keep Both capability gating, destructive replacement copy,
  hosted-service separation, in-memory-only disclaimers, safe Back/Home, modal
  focus containment, and live unassigned count on the Profiles screen.
- Routed triggered shell motion swipe/select/Back through the same bounded
  launcher vocabulary as controller navigation while preserving deliberate
  player join.
- Documented the UX/data/security boundary, fixture/runtime matrix, abuse
  evidence, implementation map, remaining qualification, and Q-170 through
  Q-174.
- Advanced I-190 from `open` to `active`.

### Verification evidence

Ten focused Vitest cases cover the closed record schema, bounds, defensive
copies, duplicate and unsafe input, runtime/hosted-boundary consistency,
path-free nonmutating play, incompatible play refusal, exact conflict
detection, replace, capability-gated Keep Both, stale plans, absence of
display-name inference, runtime-forged plan rejection, and exact-entry
deletion. The production Svelte bundle builds.

Two focused Chrome flows prove controller modal focus containment, Select,
Back cancellation and focus restoration, conflict cancellation, confirmed
claim, hosted-service disclosure, destructive-delete cancellation and
confirmation, live count updates, viewport-bounded status copy, and a
camera-free Motion join/swipe/select/crossed-arm Back path. The screen was
reviewed at the 1440 by 1000 test viewport.

### Remaining boundary

This is an in-memory desk prototype over synthetic data. It does not enumerate
or mutate native saves. Authenticated host projections, trusted per-game
metadata extraction, signed compatibility and multi-slot policy, durable
unlink/claim/replace/delete transactions, loading and recovery, real browser,
native/Godot, Libretro and hosted-title local data, package lifecycle,
simultaneous-player behavior, target hardware, household, TV-distance,
accessibility, privacy, legal, low-space, fault, and power-loss evidence remain
under I-189 through I-191 and Q-170 through Q-174.

## 2026-07-24: verifiable recovery-image bundle

### Delivered

- Added a distinct `RecoveryImage` delegated artifact family and fixed
  `VCG-RECOVERY-IMAGE-MANIFEST-V1\0` signature domain rather than reusing
  ordinary system-image authority.
- Added a strict bounded v1 recovery manifest for exact generation, release ID,
  target, sorted compatible hardware IDs, archive format/size/SHA-256,
  expanded raw-image size/SHA-256, and minimum media size.
- Required signature and exact role/target verification before parsing,
  nonzero bounded sizes, canonical lowercase hashes, safe identifiers, and
  coherent identity for uncompressed raw images.
- Completely hashed one absolute regular archive through a retained open
  handle, detecting length/hash changes while preventing later path
  replacement from redirecting the verified source.
- Added sealed expanded-image read-back evidence while leaving reader
  provenance explicitly to a future privileged synchronized writer.
- Documented a draft Raspberry Pi Imager workflow for Windows, macOS, and
  Linux; exact verification/writer handoff; blank-card scope; first-boot and
  failure evidence; device-only-data exclusions; and current non-claims.
- Added D-167, advanced I-113 to `active`, and recorded Q-175 through Q-178.

### Verification evidence

Eight focused tests cover correct delegated verification, threshold evidence,
cross-role and cross-domain denial, signature-before-parse tamper rejection,
exact target and hardware binding, sorted/unique/bounded compatibility,
raw-versus-ZIP identities, schema/size/hash/identifier/unknown-field failures,
changed/truncated/replaced archives, exact expanded read-back, and unsafe or
oversized inputs. Native formatting, both focused recovery/update-trust suites,
and strict all-target Clippy pass.

The complete Windows native workspace passes 269 library tests with five
intentional subprocess helpers ignored plus all 19 CLI tests. Workspace
formatting, strict all-target Clippy, warning-denied Rustdoc, and the same eight
focused recovery tests under WSL Ubuntu also pass.

### Remaining boundary

This is verification policy, not a recovery product. No production image,
publisher, download/repository client, ZIP decoder, removable-media
enumerator/writer/synchronizer, device-reader provenance, destructive consent,
bootloader repair, first-boot health path, or household support flow exists.
The exact Pi assembly ID, signing custody, tool boundary, and recovery contents
remain Q-175 through Q-178. Real Windows/macOS/Linux household restores,
I-186 canary exclusion, hostile media/archive/fault testing, blank/replacement
card trials, and measured restore times are still required before I-113 can
close.

## 2026-07-24: camera-free profile portrait lifecycle rehearsal

### Delivered

- Added a pure clock-injected portrait lifecycle with dedicated notice,
  monotonic three-second countdown, exact session/attempt callback binding,
  temporary preview, Retake, acceptance planning, one-handle-per-profile
  replacement, cancellation, and bounded expiry.
- Rejected early/stale callbacks, time rollback, unsafe IDs, data URLs,
  arbitrary render handles, unknown/forged commit fields, changed replacement
  state, and acceptance outside the exact preview.
- Added a dedicated OCR-A launcher screen using geometric synthetic fixtures,
  explicit Camera Off / Synthetic / Not Saved copy, visible countdown,
  controller parity, hands-together acceptance, crossed-arm/controller Back,
  Home cancellation, and replacement without background promotion.
- Kept the implementation camera-free and storage-free: no media request,
  pixel/Blob/data URL, encoder, browser persistence, vault write, face
  analysis, export, network, diagnostic, support, or recovery-image operation
  exists.
- Added visible synthetic treatment to accepted profile tiles while preserving
  the prior accepted handle across cancelled replacement.
- Documented the required native broker/camera/indicator/vault shape, eleven
  invariants, data and trust boundaries, fourteen attacker/failure stories,
  negative-propagation matrix, qualification gates, and Q-179 through Q-183.
- Corrected the global threat model and data-flow map to distinguish present
  synthetic lifecycle attack surface from absent real capture/storage.
- Advanced I-185 from `open` to `active`.

### Verification evidence

Nine focused Vitest cases cover empty/frozen state, explicit notice,
countdown, exact callbacks, early/stale refusal, one-still replacement,
Retake invalidation, cancellation without promotion, expiry, forged plans,
unsafe handles/IDs, excessive state, backwards time, and refusal to infer
acceptance from names or non-preview states. Zero-warning Svelte typecheck and
the production bundle pass.

One Chrome flow proves notice/countdown/preview, zero `getUserMedia` calls in
the camera-free simulator lane, focused-but-not-automatic acceptance,
controller Back cancellation, controller acceptance, Retake followed by
hands-together replacement, Home cancellation preserving the prior accepted
handle, and visible synthetic profile-tile state. The 1440 by 1000 temporary
preview is reviewed.

### Remaining boundary

No real portrait exists. Consent and legal policy, exact encoding/crop/decoder,
native exclusive camera and activity-indicator authority, raw-frame
confinement, encrypted temporary and accepted vault records, protected-state
commit, delete/profile-reset/factory-reset/vault-loss behavior, I-186 producer
canaries and real artifact inspection, no-face dependency proof, household
misuse, child/guest/simultaneous-player/accessibility/TV tests, and both-target
fault/power/update/storage campaigns remain under I-185/I-186/I-187/I-188 and
Q-075/Q-099/Q-179 through Q-183. Non-photographic profile art remains the safe
release fallback.

## 2026-07-24: quote-date BOM and mini-PC procurement screens

### Delivered

- Recorded three same-time USD hardware BOMs: a $0 incremental owned-x86 reuse
  lane, the selected Pi 5 8GB plus AI HAT+ 26 reference, and a public
  Steam Machine premium comparison.
- Bound the reference quote to exact seller/manufacturer identifiers for the
  Pi, HAT, cooler, ABS case, 27W supply, HDMI cable, 256GB high-endurance card,
  and finished UVC camera; also recorded included HAT hardware, case feet, and
  cables so required parts are not silently omitted or bought twice.
- Calculated the $576.23 reference merchandise subtotal and the exact
  `$73.77` combined shipping-and-tax allowance under D-111. Destination tax,
  PiShop weight-based shipping, and any price change feed one explicit
  checkout predicate rather than an estimated delivered claim.
- Isolated supplier ambiguity: the HAT page says `SC1791 (SC1468)`, and the
  HDMI page says both 3ft and 6ft. Neither is silently normalized.
- Recorded substitutions, explicit exclusions, receipt/requote evidence,
  compatibility assumptions, and a six-part no-purchase gate. No cart,
  checkout, or order was opened.
- Assigned Q-184 through Q-187 to jurisdiction/evidence, Pi/HAT identity,
  camera cost/coverage, and the actual-versus-public premium comparison.
- Screened four manufacturer-direct low-power x86 mini-PC families against the
  same $169.99 camera and $650 ceiling. Exact configured Radeon 680M/780M and
  NPU candidates exceed the cap before tax/shipping; the only plausible budget
  lead has an unavailable, internally contradictory barebone/configured page.
- Advanced I-020, I-030, and I-203 to `active` without treating vendor
  specifications, merchandise subtotals, or unknown checkout amounts as
  physical qualification.

### Verification evidence

All 13 BOM source URLs and all four mini-PC manufacturer URLs were opened on
2026-07-24. Local Markdown targets resolve. Independent arithmetic reproduces
the $336.25 PiShop subtotal, $239.98 other-seller subtotal, $576.23 reference
subtotal, $73.77 cap allowance, $1,225.44 premium subtotal, and every mini-PC
comparison total. Content checks cover all D-111 categories, all three BOMs,
governing decisions, exact identifiers, exclusions, no-purchase language, and
the four owner questions. Git whitespace checks pass.

### Remaining boundary

I-030 and I-203 lack a delivered result until Q-184 supplies a non-sensitive
quote jurisdiction and a fresh checkout records every seller's shipping and
tax. Q-185 must resolve the HAT aliases and cable contradiction; Q-186/I-177
must select and physically qualify the shared camera, enclosure/mount, room
coverage, privacy, and both-platform capture behavior; Q-187 must provide the
redacted actual Steam Machine invoice/configuration if that owner-specific
comparison is wanted.

I-020 remains a procurement screen only. No screened mini PC has been
inventoried or measured. Native Linux drivers, accountless boot, recovery,
exposure-to-action p50/p95/p99, complete concurrent workloads, wall watts,
one-metre dBA, controller behavior, suspend/update/power-loss failure tests,
and exact delivered cost remain required. Continue the $0 owned-hardware lane;
purchase nothing from either screen.

## 2026-07-24: hash-bound x86-64 development baseline

### Delivered

- Closed I-013 at its development-host boundary with a sanitized exact
  Windows inventory: Ryzen 9 5900X, 12 cores / 24 threads, RTX 3080 Ti with
  12,288 MiB vendor-tool evidence, 68,625,489,920 bytes of physical memory,
  Windows 11 Pro build 26200, present C920, and no detected controller.
- Added a PowerShell capture that emits a closed, path-free schema without
  computer/user names, device instance IDs, serials, filesystem paths, or
  network addresses. Optional output is constrained below repository root.
- Bound the prior sanitized host report and all twelve Windows/WSL2 transport
  reports by repository-relative path, byte length, SHA-256 digest, declared
  environment, payload mode/size/shape, and process layout.
- Kept WSL 2.6.3.0 / Ubuntu 26.04 / kernel 6.6.87.2 explicitly virtualized;
  no WSL observation is promoted to native-Linux evidence.
- Reserved Q-203 for native-Linux disk/recovery authority and Q-204 for the
  hands-on camera/controller session. No disk, boot setting, camera stream, or
  purchase was touched.

### Verification evidence

- Seven Node tests pass for valid evidence plus changed bytes, path traversal,
  environment substitution, duplicate paths, captured filesystem paths, and
  expanded capture-schema rejection.
- The real baseline manifest passes its validator, including every evidence
  digest and declared environment.
- The independent transport gate passes five payload tests and validates all
  twelve bound benchmark reports.
- PowerShell parsing and a live sanitized capture succeed on the owned host;
  Git whitespace checks pass.

### Remaining boundary

I-013 closes because its required CPU/GPU/RAM/OS report and benchmark bundle
now exist. This does not close I-207 or I-211, select a production transport,
or prove native Linux, SDL3/compositor behavior, real camera/controller use,
accountless boot, representative games, 120 ms exposure-to-action latency,
power, thermals, acoustics, storage, update/recovery, Raspberry Pi, Hailo, or
SteamOS behavior. The tracked capture honestly records that unrelated
profile-calibration edits were active in the shared worktree and binds its
source commit and reused evidence bytes instead of claiming a clean tree.

## 2026-07-24: camera-to-action latency campaign contract

### Delivered

- Advanced I-015 from an unstructured hardware task to a strict, pre-registered
  plan/result contract without claiming that a camera configuration has run.
- Rejects capture-arrival timing and accepts only hardware exposure
  start/midpoint or an independently validated driver exposure timestamp,
  with exact exposure-semantics and clock-mapping proof digests.
- Freezes exact target, camera, pipeline, workload, room, placement, persona,
  and canonical household-motion-plan digests before results are visible.
- Requires 20 attempts for each of all ten Motion `0.4.0` actions in every
  declared persona/placement/workload cell, plus at least 15 minutes of
  negative/idle evidence per cell.
- Retains invalid attempts and dropped frames; binds skeleton, ground-truth,
  workload, and system traces; and forbids raw-frame claims or unknown fields.
- Derives action precision/recall and nearest-rank p50/p95/p99/worst from raw
  exposure and game-receipt timestamps. Per-attempt timing uncertainty is
  added as a conservative latency upper bound.
- Requires zero unintended Back, Pause, Home, Resume, or Exit activations in
  negative windows and can pre-register an independent 240 FPS-or-faster
  visible-response cross-check without substituting display timing for D-110.
- Reserved Q-211 for available exposure/optical reference equipment and Q-212
  for the consented blocking-persona room session. No equipment was ordered
  and no camera stream or participant evidence was captured.

### Verification evidence

Eighteen Node tests cover a qualifying synthetic cell, exact 20-attempt
coverage, benchmark substitution, path traversal, capture-arrival rejection,
clock mismatch, plan-byte substitution, missing cell evidence, nearest-rank
tail failure, conservative uncertainty, wrong/duplicate false actions, invalid
attempt preservation, drop accounting, privileged negative activation,
shortened negative windows, required optical-check omission, pre-exposure
receipt rejection, and raw-frame-policy rejection. Git whitespace checks pass.

### Remaining boundary

Synthetic tests prove only validation and arithmetic. I-015 remains active
until a frozen physical plan runs with trustworthy exposure timing, exact
camera/room/placement/persona evidence, both blocking personas and qualified
placements, representative concurrent workload, minimized trace artifacts,
and an honest derived result. Neither the browser capture-arrival metrics nor
the transport benchmarks can satisfy the 120 ms p95 gate.

## 2026-07-24: pinned RTMO x86 CPU spike

### Delivered

- Advanced I-051 to `active` with a real RTMO-s/rtmlib/ONNX Runtime execution
  path on the owned Windows x86-64 host.
- Added a strict RTMO COCO-17 adapter that validates shape, scores,
  coordinates, timing, thresholds, and player bounds; filters the all-zero
  no-detection sentinel; preserves finite out-of-frame coordinates; and emits
  only portable candidate landmarks without fabricating identity or actions.
- Issued Motion API `0.4.0` under D-168 because `source` is a closed vocabulary
  and honest `rtmo-native` provenance cannot be added silently to exact
  `0.3.0`. Landmark, action, health, coordinate, and bridge semantics remain
  unchanged. Current schemas, bridge peers, Godot sample, benchmark plan, and
  camera campaign contract move together; historical `0.3.0` transport
  evidence remains labeled as historical.
- Added a Python 3.13 `uv` lock, a bounded official-model downloader, exact ZIP
  and ONNX size/SHA-256 verification, and ignored model storage. No model bytes
  were added to Git or treated as redistribution-cleared.
- Ran RTMO-s and MediaPipe Lite sequentially in separate CPU processes on the
  exact same
  deterministic black/gray/gradient/seeded-noise 640 × 640 suite, with 20
  warm-ups and 100 measured calls each.
- Recorded RTMO-s at 56.334 ms p50 / 60.987 ms p95 / 17.923 FPS and MediaPipe
  Lite at 9.571 ms p50 / 10.090 ms p95 / 104.182 FPS. Both correctly produced
  zero detections on this no-person suite.
- Added a closed report validator that binds the benchmark implementation and
  dependency lock digests, exact models/providers/workload, monotonic latency
  summaries, memory, detection accounting, no-raw-frame claim, and explicit
  limitations across both reports.
- Reserved Q-213 for CUDA/cuDNN installation authority and Q-214 for a paired
  consented real-player comparison coordinated with Q-212.

### Verification evidence

- The Motion contract suite passes 70 tests, including nine RTMO mapping,
  sentinel, ranking, bounds, out-of-frame, malformed-output, and timing cases.
- Motion contract TypeScript checking passes; regenerated Draft 2020-12
  schemas bind exact `0.4.0` and include `rtmo-native`.
- Three Python helper tests pass; pinned model preparation verifies both
  archive and expanded ONNX bytes.
- Six adversarial report-validator tests pass, and both tracked CPU reports
  pass the real validator with identical suite, environment, implementation,
  lock, and source revision bindings.
- The updated 280-attempt household benchmark and 18-test camera-action
  campaign contract pass at Motion `0.4.0`.

### Remaining boundary

Synthetic no-person inputs prove executable compatibility and negative/idle
compute only. I-051 remains active: consented paired real-player accuracy,
one-player then two-player occlusion/identity/action/recovery evidence,
exposure-to-action latency, representative concurrent load, native Linux and
Rust-host integration, and distribution review remain. GPU is explicitly
unqualified because the local CUDA/cuDNN runtime is absent; a provider-name
attempt that fell back to CPU was discarded.

## 2026-07-24: appearance-free identity assignment baselines

### Delivered

- Advanced I-057 to `active` with five bounded skeleton-only identity
  baselines: nearest centroid, constant-velocity Kalman centroid, COCO-style
  OKS, Kalman+OKS, and a ByteTrack-inspired two-stage Kalman/IoU association.
- Kept the final baseline explicitly distinct from upstream ByteTrack: it
  borrows high-/low-confidence association structure but does not claim the
  detector, lifecycle, or exact implementation from the paper.
- Added global one-to-one assignment, exact input/threshold/time bounds,
  four-track capacity, six-frame expiry, non-reused opaque IDs, confidence
  recovery, and no appearance/name/profile/biometric inputs.
- Added six deterministic 30 FPS skeleton scenarios totaling 428 frames and
  899 truth observations: linear crossing, short central occlusion, crossing
  confidence loss, fast reversal, long exit/re-entry, and a three-player
  braided crossing. Truth IDs remain evaluator-only and are stripped before
  every tracker call.
- Added exact ID precision/recall/F1, switch, false-transfer, fragmentation,
  miss, and track-count scoring plus per-update latency measurement.
- Recorded the two-stage baseline as the synthetic leader at IDF1 `0.972191`,
  one switch, zero false transfers, 5.9 µs p50, and 15.5 µs p95. Every
  baseline deliberately starts a new opaque identity after the long
  post-expiry absence.
- Added a strict report validator binding tracker/suite/benchmark SHA-256
  values, Motion `0.4.0`, source revision, exact scenarios/method, derived
  arithmetic, timing distributions, no-raw-frame policy, and honest claim
  limits.
- Added D-169, reserved Q-215 for the consented paired physical session, and
  reserved Q-216 for the appearance-derived re-identification boundary.

### Verification evidence

- The Motion package passes 84 tests, including strict tracker validation,
  every baseline's basic order invariance, global assignment, expiry/no-ID
  reuse, low-confidence second-stage recovery, exact scenario coverage,
  deterministic generation, known crossing failure, and comparative scoring.
- TypeScript checking passes.
- Nine adversarial report tests cover raw-frame claims, truth leakage, suite
  and implementation substitution, impossible identity arithmetic, false
  upstream ByteTrack claims, non-monotonic latency, and undeclared fields.
- The tracked Windows x86 report passes its real hash/arithmetic validator;
  Git whitespace checks pass.

### Remaining boundary

Generated poses are method and regression evidence, not player qualification.
I-057 remains active pending paired MediaPipe/RTMO detector output from
consented people, independent identity/visibility annotations, duplicates and
misses, held-out parameter selection, one-player gates before multiplayer
authority, faithful/upstream ByteTrack if still relevant, full-workload native
Linux/Rust timing, and an explicit owner decision before any appearance data
is prototyped.

## 2026-07-24: explicit player leave and fresh re-entry

### Delivered

- Advanced I-056's remaining browser leave/re-entry gap with an exact
  `leave(slot)` state-machine operation available only during active play.
- Revokes the departed track's gameplay and Pause authority immediately,
  rejects unknown slots and unsafe phases without roster mutation, transfers
  a departed launcher owner's role only to the lowest already joined slot,
  and returns an empty roster to setup.
- Treats a still-visible former track as a candidate. Re-entry requires a
  fresh Join and receives the lowest available slot without restoring prior
  authority implicitly.
- Added an action-engine release gate so the hands-together selection that
  activates Leave cannot continue across the boundary and silently trigger
  Join.
- Replaced the disabled joined-state control with a reversible
  `LEAVE PLAYER 1` / `JOIN PLAYER 1` control. The browser controller can focus
  it with Down and confirm through a distinct Select input.

### Verification evidence

- Fourteen player-session tests cover fresh leave/re-entry, retained-owner
  transfer, empty-roster setup, revoked authority, and invalid slot/phase
  refusal alongside the existing join/loss/recovery/pause cases.
- Fifteen action-engine tests include the held-gesture release gate and fresh
  Join lifecycle.
- The real-Chrome simulator flow performs controller Join, Down-to-focus,
  Leave, and fresh Join against an observed synthetic player without a camera.
- Scoped console typechecking reports no diagnostics.

### Remaining boundary

This is deterministic prototype authority, not multiplayer or physical
qualification. I-056 remains active pending separate per-player calibration,
accessible number/pattern identities, real crossing and occlusion tracks,
physical controller and motion leave/re-entry comprehension, two-player
runtime/game-freeze integration, tracker restart on target Linux, and the
validator-passing household interference campaign.

## 2026-07-24: deterministic motion-smoothing comparison

### Delivered

- Advanced I-062 to `active` with a strict normalized two-dimensional point
  smoother implementing passthrough, fixed-alpha EMA, One Euro, and
  constant-velocity Kalman baselines.
- Added bounded parameters and timestamps, normalized input validation,
  explicit missing observations, no synthetic visible/control point during
  loss, short-gap state retention, and exact reset-to-measurement after a
  gap longer than 250 ms.
- Added five deterministic 60 FPS scenarios totaling 1,140 frames: static
  mixed-frequency jitter, abrupt step, constant-speed ramp, direction
  reversal, and an eight-frame bounded dropout. Truth coordinates remain
  evaluator-only and are stripped before every smoother call.
- Recorded static RMS/p95/delta, step RMS/90%-response/overshoot, ramp signed
  error, reversal maximum error, dropout reacquisition, and per-update
  latency.
- Made the tradeoff explicit: EMA and One Euro reduce static RMS by 59.3% and
  81.3% but add 83.333 ms and 50 ms step response; the frozen Kalman default
  is strongest on ramp/dropout but takes 383.333 ms and overshoots abrupt
  motion by `0.113049`.
- Kept backend-native smoothing as
  `unmeasured-no-comparable-backend-series`; no synthetic proxy or metric is
  presented as backend evidence, and no universal production filter is
  selected.
- Added a strict report validator binding the smoother/suite/benchmark
  SHA-256 values, Motion `0.4.0`, exact suite digest, deterministic metrics,
  timing shape, no-raw-frame policy, backend-native absence, and claim
  limits.
- Reserved Q-217 for smoothing acceptance/stream architecture and Q-218 for
  a minimized shared consented evidence session.

### Verification evidence

- The Motion package passes 102 tests, including all four filter contracts,
  bounded input and options, monotonic time, missing-output behavior,
  short-/long-gap semantics, deterministic scenario coverage, and visible
  jitter/step tradeoffs.
- TypeScript checking passes.
- Nine adversarial evidence-validator tests cover raw-frame claims, truth
  leakage, suite and implementation substitution, deterministic metric
  substitution, fabricated backend-native evidence, non-monotonic latency,
  and undeclared fields.
- The tracked Windows x86 report passes its real implementation-hash and
  method validator.

### Remaining boundary

Generated points are method and regression evidence, not real tracking,
action, gameplay, accessibility, or target-platform qualification. I-062
remains active pending paired consented backend traces, exact native smoothing
controls, pre-registered parameter grids and held-out scoring, action-level
precision/recall and end-to-end latency, perceived gameplay evidence, and
native Linux/Rust measurement under the full workload.

## 2026-07-24: camera-free Motion rule baselines

### Delivered

- Advanced I-061 to `active` with ten strict core17 research labels: Jump,
  Squat, anatomical left/right Lean, Step, Reach, and Punch.
- Kept the recognizer outside MotionAction wire authority. Jump/Squat/Step
  have documented candidate mappings to existing Jump/Duck/Dodge actions;
  Lean/Reach/Punch remain exploratory and do not silently widen Motion
  `0.4.0`.
- Added exact 24-sample neutral calibration, closed bounded thresholds,
  strictly increasing time, complete unique core17 intake, confidence gating,
  non-degenerate named axes/scales, entry/exit hysteresis, per-label cooldown,
  Punch/Reach mutual exclusion, and affected-rule-only missing-landmark
  suppression.
- Added five deterministic normalized skeleton-shape fixtures and 80 trials
  totaling 2,810 rule updates. The suite covers all ten movements, neutral
  jitter, global camera/crop-like upward shift, lateral translation, crossed
  arms, missing wrists, seated lower-body unavailability, and 45%-amplitude
  movement.
- Retained adverse results: every fixture misclassifies global upward shift as
  Jump, and the unchanged limited-range fixture matches only two of ten
  intended movements. This makes floor/camera reference and accessible
  calibration requirements executable rather than prose-only.
- Recorded synthetic event precision/recall and strict per-update timing. The
  aggregate `0.883721` / `0.826087` result is explicitly not real-person
  accuracy and cannot pass product gates.
- Added a hash-bound evidence report and validator covering exact
  implementation/suite/benchmark bytes, suite digest, thresholds, all trial
  results, arithmetic, candidate mappings, camera-shift failure, raw-frame
  exclusion, timing shape, and claim limits.
- Reserved Q-219 for whether Lean, Reach, or Punch belongs in the standardized
  Motion vocabulary; the safe default keeps them at landmark/research level.

### Verification evidence

- The Motion package passes 112 tests, including strict calibration/input,
  simulator Jump/Squat mapping, hysteresis/rearm, missing landmarks,
  malformed time/shape/threshold rejection, deterministic fixture generation,
  score arithmetic, seated unavailability, and the required camera-shift
  failure.
- TypeScript checking passes.
- Ten adversarial report-validator tests cover raw-frame claims, truth
  leakage, suite/implementation/result substitution, false Punch promotion,
  hidden camera-shift evidence, non-monotonic timing, and undeclared fields.
- The tracked Windows x86 report validates against its real implementation
  hashes and exact deterministic evaluation digest.

### Remaining boundary

Generated skeleton shapes prove method, strictness, and known failure
reproduction only. I-061 remains active pending consented separately reported
child/adult evidence, approved seated/limited-range exploration, floor/camera
reference, detector and backend parity, training/held-out threshold selection,
standardized lifecycle integration, action/gameplay precision and recall,
full exposure-to-game latency, and target Linux/native timing.

## 2026-07-24: exact-track Motion Lab action dispatch

### Delivered

- Closed the gap between the pure I-056 authority controller and Motion Lab
  dispatch. The runtime now carries each action with its producing opaque
  track ID instead of consuming only the first detected player's action list.
- Requires an exact visible joined track for obstacle actions; candidate
  reordering cannot transfer gameplay authority.
- Batches every same-frame triggered Pause completion through the controller's
  deterministic completion-time/player-slot rule before opening the overlay.
  Other actions from the opening frame are suppressed.
- Restricts shared launcher actions to the current launcher owner and manual
  overlay actions to the exact Pause owner. The overlay identifies the actual
  player slot; a recovery controller remains visibly distinct.
- Preserves D-070's deliberate one-player takeover by binding Resume to the
  exact candidate that produced the selection action. Multiplayer recovery
  navigation accepts only an original visible joined track, so an outsider
  cannot move focus, exit, or replace a player.
- Closes controller-owned Pause state on Resume/Exit and keeps failed Join
  callbacks synchronized with the actual session roster.

### Verification evidence

- Fourteen player-session cases now cover gameplay, launcher, Pause-overlay,
  one-player recovery, and multiplayer recovery authority independently.
- A camera-free integration case places a triggered spectator ahead of the
  joined player and proves only the exact joined track's action survives the
  same runtime authorization used by the lab.
- All 207 console unit tests pass; Svelte/TypeScript checking reports zero
  diagnostics and the production build succeeds.
- All 33 real-Chrome flows pass, including controller leave/re-entry,
  tracking recovery, shell navigation, hostile browser policy, and motion
  simulator coverage.

### Remaining boundary

This is fail-closed dispatch, not a two-player recognizer or tracker
qualification. The current browser action engine still recognizes only its
first player; a reordered active player therefore loses browser-derived
actions rather than transferring them. I-054/I-056 still require calibrated
per-player recognition, stable physical identity tracks, true simultaneous
Pause races, two-player runtime/game-freeze integration, target tracker
restart, and household adversarial evidence.

## 2026-07-24: anatomical laterality abuse comparison

### Delivered

- Advanced I-064 with a strict research-only laterality guard around the
  core17 rule baseline. It checks named shoulder and hip axis continuity
  before permitting directional Lean, Step, Reach, or Punch labels.
- Blocks directional output when anchors disappear, the named anatomical axis
  reverses, or the body is too foreshortened for reliable left/right claims.
  Non-directional Jump and Squat labels remain available.
- Resets rule temporal state across every ambiguity interval so stale
  activation cannot leak through a blocked frame.
- Added a deterministic 41-scenario adversarial suite covering clear frontal
  poses, complete anatomical swaps, distal-only swaps, mild turns, profile
  ambiguity, crossed arms, and self-occlusion.
- Added full confusion matrices, scenario-family counts, exact source hashes,
  deterministic evaluation digests, timing distributions, and a fail-closed
  evidence validator.

### Verification evidence

- The Motion contract package passes all 124 tests and TypeScript checking.
- Ten adversarial validator tests reject suite, guard, script, result, timing,
  confusion-matrix, and undeclared-field substitution.
- The continuity guard raised exact scenario outcomes from 15/41 to 31/41,
  explicitly blocked all 8 full anatomical swaps and all 8 profile-ambiguity
  cases, and reduced unsafe directional ambiguity outcomes from 14 to 4.
- Residual evidence remains explicit: distal-only swaps still caused four
  wrong-direction Reach/Punch outcomes and two silent Step misses, while mild
  turns caused four Lean/Step misses.

### Remaining boundary

Generated transformations prove bounded suppression behavior only. I-064
remains active pending approved real captures across camera mirrors, detector
label swaps, rotation/foreshortening, crossing, self-occlusion, varied bodies
and clothing, seated/limited-range motion, and backend/platform parity. The
guard is not a production identity, multiplayer, or anatomy reassignment
authority.

## 2026-07-24: fail-closed profile progress disposition

### Delivered

- Advanced I-188/Q-189 so local profile deletion no longer treats an opaque
  ownership unlink as sufficient sanitization. Every preserved link requires
  one exact closed qualification bound to profile, progress, game, slot,
  runtime, hosted boundary, sanitizer ID, and positive sanitizer revision.
- Caps the independent qualification fixture at 256 records, rejects unknown
  fields, duplicate IDs, multiple qualifications per progress record, unsafe
  IDs, invalid runtime boundaries, and scope substitutions, and supports exact
  revocation.
- Binds the sorted qualification-ID set into the destructive plan and resolves
  it again at commit. Missing or revoked evidence blocks the complete deletion
  before portrait, profile, or progress mutation.
- Adds the safe alternative required by Q-189: every unqualified
  game/slot/runtime starts unchecked and must be explicitly selected for
  permanent deletion. The plan binds a disjoint sorted exact progress-ID set;
  cancel or any intervening model revision clears the choices.
- Accepts only the exact frozen destructive plan object issued by the
  controller, preventing otherwise valid-looking cloned plans from widening
  irreversible scope. Svelte retains that object through raw state.
- Keeps Randy's two qualified records on the unassigned path and exposes the
  Guest native campaign as an executable blocked/opt-in fixture with exact
  disclosure, safe initial focus, cancellation, and focus recovery.

### Verification evidence

- Sixteen focused profile-management cases cover bounded/closed qualification
  records, exact planning and revocation, mixed unlink/delete disposition,
  outside/duplicate/non-delete refusal, immutable scope, issued-plan identity,
  no reassociation, and no mutation on failure.
- All 209 console unit tests, console typecheck/build, repository-wide
  JavaScript tests/typecheck/build, and all 33 real-Chrome flows pass.
- Chrome proves default-disabled Guest deletion, explicit exact-record opt-in,
  permanent-loss modal copy, safe cancel, cleared opt-in, and restored focus.

### Remaining boundary

This is volatile browser policy evidence, not a sanitizer registry or save
transaction. I-188/I-189 still require host-protected qualification
provenance, real reviewed per-runtime/title sanitizers, durable exact save
deletion, one crash-safe registry/vault/progress commit, target fault
injection, forensic revocation, and household/accessibility/privacy/legal
qualification under Q-103 and Q-188 through Q-192.

## 2026-07-24: exact-issued Unassigned mutation plans

### Delivered

- Hardened I-189/I-190 claim and permanent-delete mutations so commit accepts
  only the exact frozen plan object issued by the same
  `UnassignedProgressController`.
- Rejects identical clones, valid-looking game/slot or claim-destination
  substitutions, cross-controller plans, unknown fields, stale revisions, and
  unknown operation kinds before mutation.
- Preserves exact plan identity through Svelte raw modal state while retaining
  the existing controller, motion, keyboard-focus, conflict, and destructive
  disclosure flow.
- Makes the browser-model split explicit: profile deletion changes only its
  isolated link fixture and does not synthesize entries in the independent
  Unassigned sample list. The profile store lacks the package version,
  compatibility, byte count, summary, recency, and opaque launch-owner
  projection required by that list, and two sequential browser commits would
  not satisfy Q-191 atomicity.

### Verification evidence

- All eight focused Unassigned controller cases pass, including cloned,
  substituted, cross-controller, stale, and unknown-authority refusal.
- Both affected Chrome flows pass independently, then all 33 Chrome flows pass
  together.
- All 209 console unit tests and the complete workspace JavaScript
  test/typecheck/build gates pass alongside the concurrent Motion changes.

### Remaining boundary

Reference identity is an in-memory regression guard, not a durable native
capability. A privileged broker must atomically publish trusted sanitized
metadata, unlink or delete exact saves, update the profile registry/vault,
preserve stable unassigned launch ownership, recover after interruption, and
prove the result on both target tiers before the two browser rehearsals can be
wired together.

## 2026-07-24: fail-closed landmark confidence rearming

### Delivered

- Advanced I-063 with a strict research-only per-landmark observation gate.
  Provider loss or confidence below the release threshold blocks immediately;
  restoration requires bounded consecutive high-confidence observations.
- Rejects non-monotonic timestamps so duplicate/replayed samples cannot
  manufacture restoration, clears partial evidence on every loss, resets
  across epochs, validates closed bounded options, and never extrapolates a
  missing coordinate.
- Added a deterministic 10-scenario / 115-sample campaign covering stable
  confidence, threshold jitter, occlusion rebound, explicit provider loss,
  isolated and sustained loss, ambiguous alternation, retain-band behavior,
  and provider-flag oscillation.
- Added a hash-bound evidence artifact, exact strategy/scenario results, source
  and suite commitments, and ten adversarial report-validator tests.
- Added Q-234 for the owner-selected restoration-delay and multiplayer safety
  posture without assuming an answer.

### Verification evidence

- The Motion contract package passes all 133 tests and TypeScript checking.
- The memoryless `0.5` strategy records 14 unsafe-available samples, 2
  false-unavailable samples, and 32 transitions.
- Immediate loss plus a `0.75` / three-sample rearm records zero unsafe
  availability, 34 false-unavailable samples, and 20 transitions.
- Ten evidence-validator tests reject raw-frame/coordinate claims, truth
  leakage, implementation/suite/result substitution, hidden safety or
  availability costs, and undeclared report fields.

### Remaining boundary

Authored confidence values prove deterministic state behavior, not provider
calibration. I-063 remains active pending independently labeled MediaPipe and
RTMO sessions, held-out provider-specific and time-based threshold selection,
action/control accuracy, accessibility and recovery comprehension, integration
with identity/smoothing/calibration/global health, and ordinary x86-64 Linux
plus Raspberry Pi qualification. No Motion wire or runtime authority changed.

## 2026-07-24: exact-issued portrait and profile authority

### Delivered

- Hardened I-185 portrait capture so both countdown completion and final
  acceptance require the exact frozen reference/plan objects issued by the
  same controller.
- Rejects identical clones, field substitutions, cross-controller refs/plans,
  stale callbacks, and unknown fields before temporary preview promotion or
  accepted-portrait replacement.
- Preserves the exact attempt reference through Svelte raw state, preventing a
  reactive proxy from accidentally changing controller-local authority.
- Extended the same rule across I-188 profile creation, rename, calibration
  application, and destructive operations. Cloned or cross-controller create,
  substituted rename, cloned calibration, and substituted destructive plans
  fail before mutation; calibration clone rejection does not consume the
  separately issued result.
- Keeps field validation, revision checks, session/attempt binding, result
  consumption, destructive review timing, and exact state re-resolution as
  independent fail-closed layers.

### Verification evidence

- Nine focused portrait cases cover early, cloned, cross-controller, retaken,
  cancelled, expired, and stale callback/commit behavior.
- Sixteen focused profile cases cover uniform exact issuance alongside
  qualifier revocation, permanent-delete scope, calibration consumption, and
  same-name non-reassociation.
- All 209 console unit tests, complete workspace JavaScript
  test/typecheck/build gates, and all 33 Chrome flows pass. The portrait,
  profile-management, and calibration Chrome scenarios also pass as focused
  runs.

### Remaining boundary

Object reference identity is a volatile browser regression guard, not a
serialized or restart-safe capability. Production still requires
broker-issued authenticated session/operation authority, protected revisions,
exclusive camera leases, encrypted temporary/accepted portrait records, and
one atomic registry/vault/save transaction with target crash, rollback,
power-loss, household, accessibility, privacy, and legal evidence.

## 2026-07-24: RGB/depth floor-contact campaign contract

### Delivered

- Advanced I-065 from open to active with a pinned plan for comparing core17
  2D and MediaPipe-world RGB event estimates against a calibrated depth floor
  plane plus an independent synchronized foot-contact reference.
- Pre-registered two standing persona classes, five frame positions, Jump and
  left/right Step blocks, twenty attempts per cell, 30 complete cells / 600
  scheduled attempts, and ten 60-second negative windows.
- Requires exposure/reference timestamp provenance, at most 5 ms measured
  synchronization error, at most 8 ms reference uncertainty, exact device and
  configuration identities, and detached skeleton/depth/contact label hashes.
- Defines unique event matching and complete per-event counts, precision,
  recall, and signed-error distributions by participant, persona, and position.
- Added a strict plan/result validator that recomputes all totals, rates,
  synchronization status, and selection eligibility.
- Added Q-235 for the exact contact reference and owner-selected event-error
  gates; selection remains impossible while that gate is null.

### Verification evidence

- The checked-in 30-cell / 600-attempt / 10-window plan validates.
- Eleven adversarial tests accept a structurally complete result while still
  refusing selection, and reject missing cells, arrival-only timing,
  depth-only truth, retained raw frames, plan substitution, hidden count
  changes, false synchronization summaries, persona substitution, and
  undeclared result fields.
- The result contract preserves failed/invalid evidence rather than requiring
  only passing data.

### Remaining boundary

This is a campaign contract, not depth or RGB evidence. I-065 remains active
pending Q-235, exact devices and room geometry, consented participants,
qualified synchronization/reference uncertainty, all scheduled sessions,
per-player/per-position distributions, D-110 full action latency, false-action
scoring, backend parity, and ordinary x86-64 Linux/Raspberry Pi execution.

## 2026-07-24: rule versus MMAction2 temporal comparison plan

### Delivered

- Advanced I-066 from open to active with a pinned primary-source boundary for
  MMAction2 v1.2.0 and documentation revision `4d6c9347`.
- Defined a fair three-candidate comparison: the current core17 deterministic
  rules, 48-frame PoseC3D keypoint heatmaps, and 100-frame ST-GCN 2D joints.
- Freezes an 11-label vocabulary including Negative and requires the exact same
  Motion `0.4.0` core17 traces and independent labels for every candidate.
- Requires participant-disjoint splits frozen before tuning/training, three
  fixed seeds per temporal candidate, validation-only checkpoint/threshold
  selection, a single-use held-out test, and a common lifecycle/event adapter.
- Requires per-label accuracy, negative exposure, trigger timing,
  participant/persona slices, training/runtime/package resources,
  explainability artifacts, dependency/data/config/checkpoint hashes, and
  license/rights review.
- Added Q-236 for participant scale, candidate scope, metric gates, and
  compute/resource ceilings; all collection/selection fields remain null.

### Verification evidence

- The pinned three-candidate / eleven-label plan validates.
- Ten adversarial tests reject raw-frame retention, mutable upstream state,
  upstream checkpoint metrics presented as VCG evidence, participant leakage,
  unseeded single runs, missing Negative, premature collection/selection
  gates, aggregate-only selection, and undeclared candidate claims.
- Official upstream complexity figures remain labeled as the published NTU
  protocol, not VCG runtime or accuracy evidence.

### Remaining boundary

No MMAction2 environment, VCG dataset, training run, checkpoint, held-out
participant, runtime, package, or selection exists. I-066 remains active
pending Q-236, consented minimized data, exact dependency/config locks,
participant-disjoint traces and labels, repeated training, single-use
held-out scoring, common event timing, target x86/Pi resources, license review,
and an explicit no-selection or selected-candidate decision.

## 2026-07-24: exact browser diagnostic review and exclusion evidence

### Delivered

- Advanced I-186 with the first real producer integration: the exact confirmed
  `LocalDiagnosticBuffer` JSON is materialized and scanned against distinct
  synthetic profile, portrait, calibration, body-profile, and progress-link
  canaries.
- Added a separate materialized positive control that must find all five
  signal IDs without echoing their values. The negative result binds the exact
  producer bytes through a raw SHA-256 and the verifier's content-tree
  commitment.
- Hardened I-116 so prepared diagnostic reviews are deeply immutable and only
  the current exact object issued by the same buffer can be confirmed.
  Clones, cross-buffer objects, replaced reviews, clear, close, component
  destruction, and loss of local-admin authority fail closed or revoke the
  current review.
- Added a closed path-free review summary for complete versus evicted history,
  retained warning count, and fixed launcher/package/access subsystem counts.
  It is explicitly historical record quality, not a current-health claim, and
  does not change exported JSON v1.

### Verification evidence

- Ten adversarial verifier cases and the actual diagnostic producer
  negative/positive integration pass under `pnpm validate:data-exclusion`.
- Nine focused diagnostic-buffer tests cover closed input, bounds, exact
  issuance, deep immutability, replacement/cross-buffer refusal, clear
  revocation, and summary derivation.
- All 394 workspace unit tests, workspace typecheck, and production build pass.
  All 33 Chrome flows passed after exact review authority was added; the
  subsequently updated diagnostics flow separately passes its summary and
  privilege-revocation assertions.

### Remaining boundary

This is one volatile browser producer and a browser-admin rehearsal, not a
trusted native log or support pipeline. I-116/I-186 still require
source-authenticated bounded native storage, selected retention/rotation and
destination policy, independently reviewed support materialization, crash and
swap policy, and positive/negative canary evidence across every real update,
rollback, save, developer, log, support, recovery, clone, reflash,
replacement, deletion, reset, and target-hardware path.

## 2026-07-24: exact allowlisted hosted-browser preview

### Delivered

- Advanced I-180 from a raw external Museum link to one exact-issued
  generated-catalog preview plan containing only a safe destination ID, exact
  credential-free HTTPS origin, schema version, and explicit
  `unsupervised-browser-preview` disclosure.
- Removed caller-supplied `href` authority from the generic launch screen.
  Remote actions now pass through the same trusted callback path as other
  launch actions, with the exact plan retained as raw Svelte state.
- Rejects unsafe or duplicate destination registries, unknown destinations,
  clones, cross-controller plans, replaced/discarded plans, replay, and
  reentrant opening before another URL can be selected.
- Consumes the plan before `window.open`, requests `noopener,noreferrer`,
  clears a writable opener, and reissues only the same catalog destination
  after a blocked popup.
- Replaced false native-reachability and supervision copy with an explicit
  browser-only, unsupervised, uncontained preview boundary.

### Verification evidence

- Fourteen focused controller cases cover exact opening, immutability,
  one-shot authority, every substitution/replay boundary, unsafe registries,
  popup failure, reentrancy, and a restrictive `WindowProxy`.
- Three focused real-Chrome flows cover the visible boundary, generic remote
  launch presentation, offline/retry, blocked-popup reissue, and two exact
  observed handoffs without making an external request.
- All 419 workspace unit tests, workspace typecheck, production build, and all
  33 real-Chrome flows pass with the button-only action path and concurrent
  Motion trace v2 changes present.

### Remaining boundary

This is browser-prototype intent hygiene, not the supervised top-level hosted
game lane. Same-origin compromise can bypass it. I-180 still requires a
no-chrome isolated browser process/profile, post-launch redirect/origin,
popup/download/custom-scheme/permission/storage containment, controller focus,
unstealable compositor Home/Back/Pause, crash/hang/resource/network/login
recovery and cleanup, authenticated native readiness, and ARM64/x86-64 Linux
qualification.

## 2026-07-24: skeleton-trace debugging adequacy

### Delivered

- Advanced I-070 from open to active with a backward-compatible strict v2
  Motion trace envelope while retaining v1 replay parsing.
- Bounded v2 to 600 frames, 128 stable health events, four concurrent players,
  64 trace-local track identities, and 4 MiB; requires exact sorted content
  provenance, increasing sequences, monotonic timestamps, and at least one
  frame.
- Added exact dropped-frame/dropped-health counters and player/track-limit
  flags; capacity eviction is disclosed and an unrepresentable frame is
  skipped without throwing into the shell.
- Minimized browser exports to portable core17 x/y, visibility, and observed
  state; strips rich/world/z/presence data and maps source IDs to trace-local
  pseudonyms that reset with the volatile buffer.
- Added explicit privacy and retention declarations that acknowledge derived
  skeletons, trace-local IDs, exact export time, user-managed downloaded
  files, and the absence of raw frames, audio, portraits, profile IDs, free
  text, or automatic persistence.
- Added stable tracker-health reasons to the same bounded trace epoch and
  disabled empty export.
- Added the generated draft 2020-12 JSON Schema.
- Ran an eight-case automated blind-to-truth synthetic exercise with a
  pre-triage truth commitment and separate bundle, submission, and result.
- Added Q-237 for retention, independent reviewer authority, and
  defect-specific escalation.

### Verification evidence

- All seven defect symptoms were detected and the healthy control produced no
  false positive.
- Only two roots were identifiable: unsafe action authority under missing
  required observations, and an exact stable camera-disconnected health
  reason.
- Laterality reversal, track discontinuity, and landmark loss preserve the
  symptom but not the physical/upstream root.
- Floor contact and camera-exposure latency correctly remain insufficient
  under portable core17/capture-arrival evidence.
- Nine new contract cases and seven browser-buffer cases cover
  replay compatibility, closed envelopes, provenance, sequence bounds,
  pseudonymization, minimization, health retention, clear/reset, and mutation
  isolation.
- Ten adversarial artifact-validator tests reject privacy, identity, trace,
  truth, aggregate, field, case, and timestamp-provenance substitution.
- All 423 workspace unit tests, workspace typecheck, production build, schema,
  benchmark, transport, manifest, device-only data-exclusion, compliance,
  Godot 4.7, and prior Motion evidence validators pass. All 35 real-Chrome
  flows pass, including the downloaded v2 byte/privacy/provenance inspection.

### Remaining boundary

I-070 remains active. The exercise is deterministic synthetic automation whose
triage function is blind to its truth object by interface; it is not an
independent human or consented real-camera study. Production still needs
Q-237, selected retention/deletion policy, an independent reviewer, frozen
real bug reports, target traces, export/delete usability and filesystem
inspection, and separately approved minimum evidence for physical cause,
floor truth, exposure timing, discarded detector/association state, and target
telemetry. Raw video remains excluded by default.

## 2026-07-24: seated, partial-body, and assisted-play matrix

### Delivered

- Advanced I-068 from open to active with a strict camera-free capability
  exercise covering seven full, seated, upper-body-only, missing-leg,
  missing-side, and visible-helper conditions with and without a controller.
- Kept landmark observation separate from action support: 42 assessments
  produce 17 synthetic motion paths, 13 explicit existing-controller-only
  alternates, and 12 unsupported paths.
- Blocked 18 apparently observable paths under conservative seated-gameplay
  and helper-identity gates instead of silently treating geometry as
  authorization.
- Preserved I-063 action-specific behavior, including unrelated upper-body and
  hip controls when knees/ankles are missing, with no joint extrapolation.
- Limited alternates to `canonical-controller-v1`; no new body mapping is
  authorized, and Home/Back/Pause remain reserved and non-remappable.
- Added a generated Draft 2020-12 schema and a hash-bound deterministic
  artifact, generator, strict validator, and adversarial mutation suite.
- Added Q-238 for supported scope, exact alternatives, participant scale, and
  per-case safety/accessibility/performance gates.

### Verification evidence

- Nine focused Motion contract cases cover full standing, seated gating,
  upper-body-only availability, missing legs, unsupported half-body input,
  helper overlap, explicit reserved controller routes, bounded totals, schema
  claims, and unknown-field rejection.
- Eleven artifact-validator cases cover the exact artifact plus seated/helper
  bypass, extrapolation, score normalization, new remap authority, reserved
  remapping, implicit alternates, scenario substitution, stale provenance, and
  undeclared fields.
- All 432 workspace package unit tests, workspace typecheck, production build,
  schema freshness, benchmark/transport/manifest validation, device-only data
  exclusion, compliance inventory, and Godot 4.7 validation pass.

### Remaining boundary

I-068 remains active. This evidence used authored skeletons only: no camera,
tracker backend, target device, room, game, or participant. It cannot support
seated, partial-body, accessible-motion, or assisted-play claims. Q-238,
accessibility/safety review, consented separately reported cohorts, exact
camera/backend and both target tiers, action and full-latency measurements,
comfort/fatigue and stop-rule evidence, deliberate controller assignment,
visible-helper/identity/takeover testing with I-069, and TV-distance
supported/unsupported communication remain required.

## 2026-07-24: pinned player-session interference result

### Delivered

- Reconciled I-069 from open to active: the authority state machine,
  camera-free rehearsal, UI evidence, and strict future physical campaign
  contract already existed, while the investigation row and retained
  synthetic-result evidence lagged behind them.
- Pinned the five-scenario camera-free authority result as a bounded JSON
  artifact with 15 passing checks across spectator, pet, mirror,
  television-person, passerby, deliberate replacement, and multiplayer
  outsider-recovery cases.
- Preserved 12 interference-candidate observations separately from the safety
  outcome: false joins, false controls, unintended takeovers, and false
  actions are all zero, while exactly one explicit post-recovery Resume
  takeover occurs.
- Bound normalized SHA-256 digests for the player-session controller,
  adversarial rehearsal, generator, and validator so the report cannot drift
  from its implementation silently.
- Added strict UTF-8 and 64 KiB bounds, exact scenario/check ordering, closed
  metrics/privacy/provenance fields, recomputation, and prohibited body/image
  report keys.
- Reused the existing Q-220 through Q-226 owner-question set for
  real-room/camera/tracker authorization, participant consent/assent and
  safeguarding, replacement ceremony, interference scripts, animal welfare,
  evidence retention, reliability scope, and independent review.

### Verification evidence

- Ten artifact-validator cases accept the pinned report and reject false join,
  false control/action, unintended takeover, missing explicit takeover,
  scenario/check substitution, raw-frame/biometric/durable-identity claims,
  prohibited fields, stale provenance, and undeclared physical
  qualification.
- The existing 232 Console Lab unit tests and Svelte typecheck remain green,
  including the underlying player-session and adversarial rehearsal coverage.
- All 432 workspace package tests, workspace typecheck, production build,
  schema freshness, benchmark/transport/manifest validation, device-only data
  exclusion, compliance inventory, and Godot 4.7 validation pass.

### Remaining boundary

I-069 remains active. The pinned result only replays authored opaque tracks;
it does not measure a detector, identity tracker, action recognizer, camera,
room, runtime, target device, participant, animal, mirror, television, or
passerby. The separately pre-registered 70-cell / 840-trial physical campaign
has no real manifest-bound plan or result. Q-220 through Q-226, independent
harness/oracle dry runs, consented child/adult sessions, safe interference
and animal-welfare protocols, every planned ledger entry, reviewed failures,
and reruns after material fixes remain required.

## 2026-07-24: same-server opaque browser sandbox

### Delivered

- Advanced I-136 with a second hostile-frame fixture whose parent and child
  are both served from `http://127.0.0.1:4173`.
- Granted the child exactly `sandbox="allow-scripts"` and deliberately omitted
  `allow-same-origin`, giving hostile content an opaque security origin even
  though its URL is served by the launcher's server.
- Kept the child deny-by-default for network, forms, descendants, media,
  images, objects, styles, popups, navigation, downloads, fullscreen, and
  pointer lock.
- Limited wildcard CORS and cross-origin resource policy to the exact fixture
  source and hashed fixture/module-preload assets needed by the opaque module;
  no launcher script, host capability, model, font, general asset, or fallback
  HTML receives the exception.

### Verification evidence

- The focused same-server Chrome test passes.
- The existing cross-origin and new same-server hostile tests pass together.
- The test grants camera, microphone, and location permission to the URL
  origin first, then proves parent-DOM, device, network, popup, top-navigation,
  download, form, fullscreen, and pointer-lock attempts remain blocked.
- It asserts the exact sandbox plus actual host/child CSP and asset CORS/CORP
  response headers.

### Remaining boundary

This is an intentionally sandbox-compatible fixture, not proof that arbitrary
same-origin code or a signed local-web package works safely under an opaque
origin. Production serving, same-origin/XSS resistance, service workers and
storage, local-package runtime compatibility, target browser policy, global
controls, process/resource ownership, and ARM64/x86-64 Linux evidence remain.

## 2026-07-24: actively contained hosted-browser desk lane

### Delivered

- Advanced I-180 from an opt-in uncontained process launch to a default
  fail-closed top-level Node/CDP supervisor. Removed
  `VCG_ALLOW_UNCONTAINED_BROWSER`.
- Derived a smaller immutable launch policy from a parsed remote-web manifest:
  one safe game ID, one credential-free HTTPS entrypoint, one to eight unique
  exact HTTPS origins, one in-scope health URL, and one bounded load deadline.
- Changed the health check to manual redirect processing with a five-hop
  ceiling, validating every next origin before issuing its request.
- Starts Chrome with a fresh temporary profile, random loopback DevTools port,
  fixed blank app target, normal sandbox/web security, and no entrypoint on
  the process command line. It attaches before navigation, denies downloads,
  resets permissions, and explicitly denies camera, microphone, geolocation,
  MIDI, and notifications for every allowed origin.
- Enforces every top-frame and page-target URL after navigation is armed.
  HTTP, `file:`, `data:`, `chrome:`, custom, malformed, credentialed,
  undeclared-subdomain, and foreign-origin navigation terminate the attempt.
  A second page target, download, or renderer crash does the same.
- Bounded CDP payloads, outstanding commands, and command deadlines. The first
  terminal violation is stable.
- Cleanup accepts only a branded direct child of the OS temporary directory,
  rejects links and non-directories, requests `Browser.close`, then uses the
  exact Windows PID tree or POSIX process group as a desk fallback. It removes
  the profile only after process exit.
- Kept the launcher Museum path explicitly unsupervised; this external
  developer command does not silently upgrade browser-only preview authority.

### Verification evidence

- Fifteen focused supervisor cases cover strict policy authority, all URL and
  lifecycle refusal classes, first-violation stability, safe manual redirects,
  destructive-profile scope, and fixed browser arguments without disabling
  sandbox or web security.
- The final case launches installed Chrome 150.0.7871.182 headlessly through
  the real random DevTools endpoint, arms the production guard, injects a
  forbidden `data:` navigation, observes
  `NAVIGATION_ORIGIN_DENIED`, closes the browser with exit code 0, and proves
  the temporary profile is removed.
- `pnpm supervise:game catalog/determined.vcg-game.json --dry-run` emits the
  exact policy, fixed arguments, ephemeral-profile boundary, and honest
  limitations without external mutation.
- All 447 workspace unit tests, workspace typecheck, production build, schema,
  manifest/catalog, compliance, benchmark, transport, Godot 4.7, and
  device-only data-exclusion gates pass.
- All 35 real-Chrome console flows pass.

### Remaining boundary

I-180 remains active. This is a Windows developer-command result, not
privileged native-host or target qualification. Compositor-owned Home, Back,
Pause, focus, fullscreen/pointer-lock recovery, exact browser/version and
enterprise policy, cgroup/service-manager/resource/hang containment, explicit
game readiness, in-page network and storage controls, login/offline recovery,
popup-auth and permission-requiring compatibility, same-account profile-path
swap resistance, and ARM64/ordinary x86-64 Linux evidence remain.

## 2026-07-24: bounded Motion-to-gamepad research adapter

### Delivered

- Advanced I-071 from open to active with a strict research-only,
  title/mapping/epoch-bound virtual-gamepad adapter.
- Added an exact bounded sample contract with increasing sequence, monotonic
  time, tracker health, explicit pre-authorized player state, injected
  `[-1, 1]` lean, and at most ten parsed Motion actions.
- Applied a symmetric 0.15 lean deadzone and full-range left-stick X rescale;
  the adapter does not derive lean from a camera or claim calibration.
- Added title-specific platformer and simple-arcade mappings for obstacle
  triggers with fixed 80 ms pulses; repeated events cannot extend a pulse and
  late events cannot synthesize delayed presses.
- Kept racing unsupported because steering alone cannot supply the required
  continuous throttle and brake functions; incomplete mappings emit a fully
  released state.
- Blocked all shell actions and omitted Home/Back/Pause from the output button
  vocabulary. Non-ready health, authority loss, and incomplete mappings clear
  every axis and held pulse immediately.
- Added generated sample/output schemas plus a hash-bound three-genre evidence
  artifact, generator, strict validator, and mutation suite.
- Added Q-239 for exact games, per-title mappings, native virtual-device
  authority, participant scope, and play/latency/comfort gates.

### Verification evidence

- Eleven focused Motion contract cases cover title-specific platformer and
  arcade bindings, deadzone/rescale, pulse release, repeated and stale events,
  shell/reserved blocking, health/authority release, incomplete racing
  refusal, replay/epoch/time/shape denial, and honest schema comments.
- The three-genre artifact passes 12/12 deterministic software checks,
  classifies two mappings as camera-free software paths only, classifies
  racing unsupported, and keeps play-test, latency, and comfort counts at
  zero.
- Ten artifact-validator cases reject fabricated play/latency/comfort,
  incomplete-racing promotion, hidden throttle/brake coverage,
  shell/reserved delivery, missing title/player/health binding, stuck
  buttons, reserved output fields, mapping substitution, stale provenance,
  and undeclared qualification.
- All 443 workspace package tests and 15 hosted-browser supervisor tests pass,
  together with workspace typecheck, production build, schema freshness,
  benchmark/transport/manifest validation, device-only data exclusion,
  compliance inventory, and Godot 4.7 validation.

### Remaining boundary

I-071 remains active. No unmodified game, native virtual gamepad, Linux input
stack, compositor, target appliance, camera, tracker, or participant was used.
The fixed pulse and authored function coverage are not playability, latency,
comfort, accessibility, or catalog evidence. Q-239, exact rights-cleared game
builds, signed host-owned mappings, native release/fault behavior, both target
tiers, physical controller recovery, full latency distributions, and
consented separately reported three-genre play sessions remain required.

## 2026-07-24: pinned libretro 2048 source-candidate SBOM

### Delivered

- Advanced I-124 from open to active with a deterministic per-core
  source-candidate SBOM for libretro 2048.
- Pinned exact observed upstream revision
  `c90437d3c3913999624deca3fb55ecfa632b72c4`, its revision-specific source
  archive URL, pinned license evidence, contentless/no-BIOS behavior,
  documented RetroPad features, and four open upstream issue dispositions.
- Kept the unfetched archive hash, published release, build recipe, artifact
  hash/length, and both requested architecture results explicitly absent or
  unverified. The record cannot claim qualification or a distributable binary.
- Recorded the vendored libretro API header's observed MIT notice while
  keeping the selected libretro-common subset at `NOASSERTION` pending an
  exact build recipe and complete selected-file review.
- Added a 64 KiB bounded UTF-8 parser, duplicate-member rejection, closed
  object shapes, deterministic generation/freshness checking, and exact
  reviewed-evidence locking.
- Added `RETRO_CORE_SBOM.md` with source-backed component, license, build,
  issue, and remaining-gate boundaries. No source archive or executable was
  downloaded, produced, or distributed.

### Verification evidence

- Thirteen focused tests cover canonical generation plus malformed, invalid
  UTF-8, oversized, duplicate-member, unknown/missing-field, source,
  qualification, architecture, content/BIOS, license, dependency, crash,
  issue/evidence identity, and digest-format substitutions.
- `pnpm validate:retro-core-sbom` verifies the checked-in artifact byte for
  byte and passes the complete adversarial suite.
- The root unit gate passes all 443 workspace package tests, 15 hosted-browser
  supervisor tests, and 13 SBOM tests: 471 tests total.
- Workspace TypeScript/Svelte checking reports zero diagnostics and the
  production build succeeds.
- Schema freshness, manifest/catalog validation, compliance inventory,
  benchmark and transport validation, Godot 4.7, and device-only data
  exclusion all pass.

### Remaining boundary

I-124 remains active. Controlled archive retrieval and hashing, source-tree
equivalence, one exact reproducible build path, complete selected dependency
and license closure, legal approval, source/notice bundle policy, signed and
scanned ARM64/x86-64 artifacts, open-crash reproduction or closure,
TV-distance legibility, one-action startup, runtime behavior, and target
package lifecycle evidence remain. The public candidate manifest stays
`unverified`; this source-candidate SBOM cannot promote it.

## 2026-07-24: bounded body-profile prediction and confirmation contract

### Delivered

- Advanced I-072 from open to active with a strict research-only,
  camera-free body-profile predictor and exact confirmation controller.
- Froze a closed six-ratio synthetic feature inventory with exact
  feature/extractor IDs, bounded sample count, opaque profile ID, template and
  calibration revisions, calibration-context digest, and explicit active,
  opted-out, or invalidated state.
- Added conservative standardized-distance and candidate-separation gates.
  Matching-disabled, tracker-not-ready, multiple-person, context-mismatch,
  no-template, distance, and ambiguity cases abstain without exposing vectors,
  distances, ranks, or exact scores.
- Required the exact controller-issued prediction object within 20 seconds.
  Acceptance, deliberate correction, New Player, and opt-out remain advisory;
  every result grants zero profile, calibration, and save authority.
- Added strict portrait/face/name exclusion canaries and four generated Draft
  2020-12 schemas for template, probe, prediction, and confirmed selection.
- Added a hash-bound 10-scenario evidence artifact, deterministic generator,
  128 KiB strict validator, mutation suite, evidence report, and Q-240.

### Verification evidence

- Sixteen focused contract cases cover separated candidates, ambiguity and
  distance abstention, policy/health/multi-person/context gates,
  opted-out/invalidated exclusion, exact issuance/replay/expiry, correction,
  New Player, opt-out, inactive correction, version/duplicate refusal,
  portrait/face/name canaries, loss/recreation modeling, authority denial, and
  closed schema export.
- The tracked artifact contains 10 prediction scenarios: 2 predicted, 1
  ambiguous, 3 no-match, and 4 unavailable. Four deliberate confirmation
  routes and 9/9 guard checks pass; participant and real-image counts remain
  zero and error rates remain null.
- Ten artifact-validator cases reject fabricated authority, weakened
  confirmation/correction, portrait/face/score use, product/persistence or
  participant/rate claims, ambiguity or inactive-template promotion, removed
  canaries/checks, factory-reset claims, stale provenance, and undeclared
  identity qualification.

### Remaining boundary

I-072 remains active. The fixed vector is not an approved extractor, model, or
biometric design. No person, camera, tracker backend, encrypted vault, broker,
protected-state commit, persistence, schema migration, crash-recoverable
invalidation/deletion/reset, backup/export/recovery exclusion, memory
clearing, privacy/legal review, household/accessibility study, false-rate
campaign, or target appliance was exercised. Matching remains absent from
product builds pending Q-240 and the complete I-067/I-072/I-184/I-186/I-187
release gates.

## 2026-07-24: libretro 2048 source closure and build observation

### Delivered

- Extended the I-124 source-candidate SBOM with Git tree
  `5b8bcab69dc90185f10356b5780bf9d827684474` and a revision-archive SHA-256
  of `e60494b1b9b5483227c1f1c3cc06bddba256e9f82c9d6fa7abb1e7b31239f554`
  over 2,761,393 bytes.
- Downloaded the archive twice through the GitHub archive route and once
  through codeload. All three were byte-identical. The extracted 475 files
  matched all 475 pinned Git blobs with no missing, changed, or extra file,
  and all 22 executable modes matched.
- Enumerated the upstream Unix non-Cairo path as 16 translation units and 39
  total tracked compiler/build inputs, bound by an exact closure digest.
- Confirmed that all 31 selected libretro-common inputs contain the exact MIT
  grant. Kept the upstream top-level Unlicense claim under legal review.
- Identified `noncairo/font2.c` as compiled bitmap data labeled “Apple IIgs
  Original fonts” without an in-file license or provenance statement. Added a
  separate `NOASSERTION` component that blocks distribution qualification.
- Built two independent source extractions with the existing WSL2 Ubuntu
  26.04 / GCC 15.2.0 environment. Both ephemeral 90,864-byte x86-64 ELF
  outputs were byte-identical at SHA-256
  `0f5c3a9b12dbe013da4e2cc29a01f41efd2186cce40bd7463cb8ad5bfabd0a9d`.
- Recorded the exact observed packages, flags, source epoch, inputs, linked
  libraries, glibc symbol versions, build ID, and limitations. The output was
  not retained, signed, scanned, frontend-loaded, executed, or target-tested,
  so x86-64 is only `software-build-observed-unqualified`; ARM64 remains
  `unverified`.

### Verification evidence

- Fifteen focused SBOM tests now cover archive tree-equivalence counts,
  revision/tree/hash/length substitution, exact architecture status, the
  selected MIT closure, embedded-font uncertainty, full build-input closure,
  two-build identity, ephemeral-output non-promotion, and all prior strict
  parsing, rights, BIOS, issue, and crash-blocker cases.
- `pnpm validate:retro-core-sbom` verifies the 10,875-byte tracked artifact
  byte for byte and passes the complete adversarial suite.
- The combined root gate passes 459 workspace package tests, 15 hosted-browser
  tests, 15 SBOM tests, and 10 body-profile evidence tests: 499 tests total.
- Workspace TypeScript/Svelte checking reports zero diagnostics and the
  production build succeeds.
- Schema freshness, manifest/catalog validation, compliance inventory,
  benchmark and transport validation, Godot 4.7, and device-only data
  exclusion all pass.

### Remaining boundary

I-124 remains active. This is a same-host WSL software observation, not a
hermetic or independent release build. Compiler binaries, package-repository
snapshot, sysroot contents, native dependency hashes, and target image remain
unpinned. The Apple IIgs font bitmap provenance and redistribution rights,
complete legal approval and notice/source bundle, independent reproduction,
signed/scanned/frontend-loaded ARM64 and x86-64 target artifacts, open-crash
disposition, one-action startup, legibility, runtime behavior, and package
lifecycle evidence remain. The public manifest stays `unverified`.

## 2026-07-24: Motion bridge wall-clock child-process stall rehearsal

### Delivered

- Extended I-084 beyond virtual-time and same-process evidence with one
  bounded wall-clock Windows x64 desk rehearsal.
- Connected an acknowledging child and a non-acknowledging child to the actual
  `MotionBridgeHost` through real Node child-process IPC, forcibly terminated
  the stalled child, then forcibly terminated the first healthy child and
  connected a fresh healthy replacement.
- Retained exact per-child offered/received/acknowledged frame counts, RSS,
  heap, cumulative user/system CPU, termination result, parent RSS/CPU,
  per-callback scheduler delay, and final bridge stats.
- Preserved requested and achieved rates separately. An 8-second requested
  100 Hz producer produced 514 callbacks, or 64.25 Hz, on this Windows lane;
  it still exceeded the 60 FPS bridge ceiling and exercised backpressure.
- Added a hash-bound artifact, bounded strict validator, ten mutation tests,
  detailed evidence report, and Q-241 for target process topology, duration,
  failure injection, resource, latency, and recovery gates.

### Verification evidence

- The host published 257 per-session frames and rate/ACK-limited 382
  publication opportunities.
- The non-acknowledging client received one frame. The initial and replacement
  healthy clients received 114 and 142 offered frames respectively.
- Both failed sessions expired. Peak active sessions were two; final state
  before shutdown was one active healthy session, zero pending frames, and
  zero invalid acknowledgements.
- Parent peak RSS was 98,942,976 bytes with 11,235,328 bytes peak growth.
  Child peaks ranged from 68,669,440 through 69,427,200 bytes. Scheduler
  positive-delay p99 was 6.363 ms and maximum was 13.151 ms.
- All 12 harness-integrity assertions and all 10 validator mutation tests
  pass. The mutation suite rejects target/native/suspend/tracker/product
  claims, participant/camera fabrication, weakened isolation/expiry/state,
  scheduler/RSS substitution, assertion/configuration drift, stale
  provenance, and undeclared claims.

### Remaining boundary

I-084 remains active. This is one Windows Node IPC observation with synthetic
frames, not a repeated long soak, achieved 100 Hz result, Chromium renderer or
OS suspend test, tracker-process isolation, selected native transport, target
Linux evidence, product resource budget, or full latency/recovery result.
Q-241 and repeated ARM64/x86-64 target campaigns under the actual
tracker/renderer/compositor/service-manager topology remain required.

## 2026-07-24: Epoch supervised top-level load evidence

### Delivered

- Added a bounded `probeHostedBrowserTopLevelLoad` helper that reuses the
  hosted-browser policy derivation, blank-target attachment, active
  navigation guard, browser shutdown, and ephemeral-profile cleanup.
- Fixed the supervisor's load-event boundary so each `Page.navigate` receives
  a fresh promise. The prior shared promise could be satisfied by Chrome's
  startup `about:blank` load before the reviewed entrypoint navigation.
- Captured one live Windows x64 Chrome `150.0.7871.182` observation of
  `https://epoch-theta.vercel.app/`.
- Preserved the exact restrictive CSP and X-Frame-Options response rather than
  proxying, stripping, or weakening them. The evidence uses top-level
  navigation and does not claim that VCG framing is permitted.
- Added a 64 KiB-bounded hash-bound artifact, strict validator, eight mutation
  tests, a detailed evidence report, and an offline root validation command.

### Verification evidence

- Epoch returned HTTP 200 with
  `frame-ancestors 'self' https://randroid.dev https://www.randroid.dev` and
  `X-Frame-Options: ALLOW-FROM https://randroid.dev`.
- The sole guarded page retained the exact reviewed HTTPS entrypoint, reported
  title `Epoch` and `document.readyState=complete`, and triggered zero policy
  violations.
- Chrome exited with code 0 and the fresh temporary profile was removed.
- The artifact records one HTTP success and one top-level load, but zero play
  tests, controller tests, or participants.
- Eight adversarial cases reject framing authorization, header/origin drift,
  weakened load/cleanup facts, fabricated play/controller/recovery evidence,
  playability promotion, stale provenance, and unknown fields.

### Remaining boundary

I-090 is closed only at the framing-mode boundary. Epoch remains ineligible for
VCG-origin embedding, and this result does not qualify game readiness or
playability. Q-046 and Q-048 still require compositor-owned Home/Back and
hostile full-screen, pointer-lock, focus, hang, and crash recovery on the
selected Linux browser lane. Q-049 still requires controller-only hands-on
play. I-180 remains active for the native-host, service-manager, browser
policy, and ARM64/x86-64 Linux evidence.

## 2026-07-24: Godot release exports and live browser desk evidence

### Delivered

- Installed only the exact web and Linux ARM64/x86-64 files from Godot's
  official 4.7.1 standard export-template archive after verifying its
  1,280,486,955-byte length and SHA-256.
- Added checked-in unthreaded Web, Linux x86-64, and Linux ARM64 release
  presets to the tiny Motion sample.
- Added a six-field browser-only diagnostic probe so exported state and
  fallback transitions can be checked without player, camera, or Motion data
  and without treating the probe as readiness authority.
- Added a bounded generator that verifies all selected templates, rebuilds
  three ignored output sets, checks exact file identities and ELF machines,
  serves only the web export on loopback, drives installed Chrome, and boots
  x86-64 headlessly through WSL2.
- Added a strict 128 KiB-bounded tracked artifact, a detailed report, an
  offline validator, and ten adversarial mutation tests.

### Verification evidence

- Two complete generations produced identical hashes and sizes for all 13
  release files.
- The Web set is 39,866,665 bytes; Linux x86-64 is 73,489,216 bytes; Linux
  ARM64 is 67,065,624 bytes. All share the same 18,952-byte project pack.
- Chrome `150.0.7871.182` reached a complete document and one 960×540 canvas,
  exposed the exact waiting state, and accepted Left then Jump keyboard
  fallback transitions with zero console or page errors.
- Required HTML, JavaScript, pack, and WASM assets returned HTTP 200. Chrome
  also reported one non-fatal aborted WASM fetch; it is retained in the
  evidence rather than normalized away.
- The x86-64 and ARM64 executables identify as ELF64 machine 62 and 183. The
  x86-64 build booted under WSL2 with exit code 0; ARM64 execution was not
  attempted.
- All ten mutation tests pass and reject toolchain/output substitution plus
  physical-controller, Motion, target, package, latency, participant, and ARM
  execution promotion.

### Remaining boundary

I-077 and I-086 remain active. The browser actions were keyboard fallback, not
a physical gamepad or recovery remote. No live Motion bridge, camera, tracker,
participant, native IPC, signed package, target compositor/service manager,
ordinary x86-64 Linux, ARM64 execution, GPU/audio, or camera-to-action latency
was tested. WSL2 remains same-host virtualized evidence, so Q-058 cannot close.

## 2026-07-24: Godot cross-origin Web Motion bridge evidence

### Delivered

- Wired the Web main scene to an exact parent origin supplied only through a
  frozen response-injected host configuration object; no URL parameter gains
  origin authority and a normal unconfigured export stays offline.
- Added a console-lab fixture using the existing `MotionBridgeHost`, served the
  actual byte-pinned Godot export from a distinct sandboxed loopback origin,
  and applied restrictive parent and child response policies.
- Fixed a defect found by the first live run: Godot JSON parsing materialized
  integral frame sequences as floats, but the game required integers. The
  adapter now bounds values to finite, non-negative, exactly integral
  JavaScript-safe numbers and normalizes before consumption and ACK.
- Added a 64 KiB-bounded hash-bound artifact, strict validator, ten mutation
  tests, an offline validation command, and a detailed evidence report.

### Verification evidence

- Chrome `150.0.7871.182` negotiated one bridge v2/Motion 0.4 session across
  distinct random `127.0.0.1` and `localhost` origins.
- The host published two deterministic `body.core17` frames. Godot reached
  `inputSource=motion` and `LANDMARKS ACTIVE`, and both exact ACKs cleared
  pending state before the next publication.
- The injected config matched the exact parent, was frozen/non-writable, and
  the child URL query was empty. Console, page, request-failure, and invalid-ACK
  counts were all zero.
- Four Godot headless tests and ten evidence mutation tests pass. The mutation
  suite rejects origin/config/query drift, protocol/schema substitution,
  frame/ACK/state changes, hidden errors, physical evidence fabrication,
  authority/target/latency promotion, stale provenance, and unknown claims.

### Remaining boundary

I-077 and I-086 remain active. This is a synthetic same-host desk fixture, not
the privileged native package server, signed permission admission, production
compositor, physical controller, real tracker, participant, target Linux or
ARM64 system, native IPC, package lifecycle, or latency qualification.

## 2026-07-24: Godot Web bridge health and reload resilience

### Delivered

- Added a successor two-origin fixture without changing the immutable v1
  bridge fixture or artifact.
- Drove ordered overload/degraded and healthy/ready events through the actual
  host and Godot adapter, then required the visible game probe to block Motion,
  recover to ready, and resume exact frame acknowledgements.
- Reloaded the sandboxed Godot document in place, required a second accepted
  session with active and peak counts held at one, verified current ready
  health in the replacement document, and ACKed a post-reload frame.
- Added a separately built fixture, 96 KiB-bounded hash-bound successor
  artifact, strict validator, ten mutation tests, an offline validation
  command, and a detailed report.

### Verification evidence

- Chrome `150.0.7871.182` completed one initial and one replacement Godot
  document across distinct random `127.0.0.1` and `localhost` origins.
- Three frames were published and ACKed, two ordered health events were
  delivered, pending and invalid-ACK counts remained zero, and the replacement
  session did not overlap the prior session.
- Each HTML, JavaScript, pack, WASM, image, and audio-worklet resource was
  fetched twice. The tracked run had zero console/page errors and one recorded
  non-fatal aborted WASM fetch during replacement.
- The generator records a narrowly bounded optional unload-side WASM abort
  rather than hiding it; any other request failure fails.
- Ten adversarial tests reject base substitution, missing health/reconnect
  state, session/frame/ACK drift, incomplete resource reload, authority or
  target promotion, stale provenance, and unknown claims.

### Remaining boundary

I-077 and I-086 remain active. This was an authored synthetic health sequence
and ordinary same-host iframe reload, not hostile-origin navigation,
session-expiry, renderer kill, OS suspend, network loss, repeated soak,
production launcher authority, signed permission admission, physical
controller, real tracker, participant, target system, or latency evidence.

## 2026-07-24: Q-050 prototype closure reconciliation

The open-question register no longer lists Q-050 as unresolved. Its explicit
closure checklist is now directly satisfied: bridge v2 implements a handshake,
exact origin/source allowlisting, generated JSON schemas, bounded publication
and expiry, reconnect, and runnable TypeScript and Godot samples. Generic
Chrome fixtures cover hostile navigation and return; the actual Godot export
adds exact-origin negotiation, ACK recovery, ordered degraded/ready health, and
reload into one replacement session.

This register change does not close I-076's production boundary. Signed-package
permission wiring, hostile same-origin code, broader browser policy, native
integration, and target measurements remain active under I-076/I-094/I-209;
stall and process evidence remains I-084.

## 2026-07-24: shared retro import contract and native plain-file transaction

### Delivered

- Added one strict TypeScript coordinator and closed installed-library schema
  for USB and paired-LAN import planning. It binds visible bounded sessions,
  selected-file entitlement, family-mode denial, exact policy/system/core/
  controller mappings, portable path and archive limits, scanner evidence,
  duplicate/conflict/capacity decisions, and one-shot terminal intents.
- Added a strict Rust transaction that authorizes the exact canonical terminal
  intent, receives only an already-opened source handle, verifies regular-file
  metadata, streams exact length and SHA-256, and binds a pluggable clean scan
  to the same inspection and subject hash.
- Added preprovisioned same-filesystem staging and operation locking,
  synchronized no-replace content publication, contiguous append-only
  installed-library generations, path-free audits, exact replacement cleanup,
  cancellation, and deterministic recovery across copy, scan, object, library,
  audit, and cleanup interruption windows.
- Added terminal reuse without copying, full managed-object revalidation
  against the current native policy, refusal of same-revision mapping
  substitution and missing or tampered managed objects, idempotent retry after
  unrelated library advancement, storage-namespace derivation, and a
  recovery-aware path-free current-library snapshot.
- Bound cancellation to every exact pending-intent field, retained
  cancellation after expiry or revocation, refused eight same-plan
  substitutions without removing pending state, and kept the plan-ID-only
  cancellation helper private to native tests.
- Added a checked-in TypeScript/Rust interoperability fixture and an
  adversarial proof that replacing a source path after the capability is
  opened cannot redirect the imported bytes. Follow-on proofs reject a
  reported free-space shortfall before mutation and preserve seeded
  package/core/save/state/remap/profile/log/cache/package-staging namespaces
  through a real derived-root import.
- Pinned Unicode normalization, regenerated the Cargo/npm/asset compliance
  inventory, and recorded RI-001 through RI-009 for production mappings,
  content shape, conflict UX, legal wording, LAN authority, scanner policy,
  archives, library compaction, and privileged coordinator ownership.

### Verification evidence

- All 24 TypeScript retro-contract tests pass, including exact emission of the
  checked-in native interoperability fixture.
- All 18 Windows and 19 Linux native retro-import tests pass. They cover strict
  parsing and authority binding, source mutation and path replacement,
  clean/rejected/unavailable/misbound scans, capacity overflow and reported
  free-space admission, history bounds, operation locking, exact pending-intent
  cancellation and substitution refusal, publication recovery, replacement,
  reuse with current-policy mapping and managed-object revalidation, derived
  namespace isolation, path-free snapshots/audits, and Linux symlink refusal.
- Windows workspace compilation, formatting, strict Clippy, and Rustdoc pass.
  The final complete Ubuntu/WSL workspace run passes 288 library tests with
  five intentional helper ignores plus all 19 CLI tests and Rustdoc tests.
- Root tests, workspace typechecking, production build, and every ordinary
  checked-in validation command pass. Compliance inventory contains 137
  components: 82 npm, 46 Cargo, and two assets. The release-only compliance
  gate correctly remains blocked by the recorded project-license and
  pose-model redistribution decisions.

### Remaining boundary

I-199 and I-200 remain active. Production still requires a signed system/core/
controller/BIOS policy and reviewed entitlement wording; privileged USB
enumeration and readonly handle brokering; an authenticated paired-LAN
receiver with bounded resume and revocation; a selected isolated scanner and
rules lifecycle; ZIP implementation or continued disablement; real block
reservation; explicit deletion and library compaction; product service and
controller UI wiring; target-architecture, hostile-media/LAN, full-disk,
reboot, and physical power-loss campaigns; legal review and entitled
fixtures; and proof that supervised RetroArch never opens source-media paths.

## 2026-07-24: bounded Chrome DevTools endpoint lock recovery

### Delivered

- Reproduced an integrated Windows failure where Chrome had created
  `DevToolsActivePort` but the supervisor's first read received `EBUSY`.
- Kept the original startup deadline and fail-closed endpoint parser, while
  retrying only ordinary pre-creation `ENOENT` and transient `EBUSY`.
- Added an injected deterministic case that returns `EBUSY` once, then exact
  bounded endpoint bytes, and requires precisely two reads.
- Reproduced the live Epoch top-level artifact on the same evidence date so
  its provenance binds the corrected supervisor source.

### Verification evidence

- All 16 hosted-browser supervisor tests pass, including three installed
  Chrome 150 forbidden-navigation, popup, and download termination probes.
- The Epoch validator and all eight adversarial mutation tests pass against
  the regenerated artifact. Its HTTP 200, exact response headers, sole guarded
  page, complete document, clean exit, and removed profile facts are unchanged.
- The integrated root test suite, workspace typecheck, production build, and
  every ordinary checked-in validator pass.

### Remaining boundary

I-180 remains active. Retrying one transient development-host file lock does
not select or qualify the production browser, native authority, service/
cgroup ownership, compositor controls, explicit readiness, resource/hang
recovery, or either target Linux architecture.

## 2026-07-24: candidate television compatibility conformance

### Delivered

- Added a standalone television-authoring surface with a visible five-percent
  safe area, responsive critical text, four deterministic focus targets,
  keyboard select/Back behavior, reduced-motion handling, and a closed
  geometry/input/frame-sampling probe.
- Added a frozen Windows x64 installed-Chrome generator for 1280x720,
  1920x1080, and 3840x2160 CSS viewports. It uses a random loopback server
  with exactly three deny-by-default resources and records pixel screenshots,
  computed rectangles/text/target sizes, input counters, 120 animation
  deltas, request counts, and browser errors.
- Added a bounded offline validator that re-hashes every source and exact PNG,
  requires canonical keys and observations, and refuses physical-TV,
  controller, overscan, compositor, catalog-game, or frame-rate promotion.
- Added 11 validator tests covering resolution/environment substitution,
  safe-area escape, weakened text/targets, focus/select/Back drift, invalid
  elapsed-time samples, screenshot substitution, hidden browser errors,
  fabricated participants/hardware/games, stale provenance, and widened
  claims.
- Published the candidate contract, author checklist, strict evidence
  boundary, and Q-242/Q-243 owner handoff; advanced I-098 from open to active
  without closing Q-056.

### Verification evidence

- The three pixel-bound captures contain all five declared critical regions
  inside their exact five-percent safe rectangles. Minimum critical text is
  24, 31.68, and 38 CSS px; minimum action targets are 256.609x64,
  385.391x64, and 803x70 CSS px.
- Every run records focus order 0/1/2/3, two keyboard selections, one Back
  request, 120 nonnegative elapsed-time samples, complete document state, and
  zero console, page, or request errors.
- `pnpm validate:tv-conformance` validates the tracked JSON, exact PNG bytes,
  current provenance, and all 11 adversarial tests.

### Remaining boundary

I-098/Q-056 remain active. Physical televisions, actual EDID/output and
compositor scaling, reserved Home/Back and controller recovery, real catalog
titles, localization/accessibility, seating-distance comprehension, overscan,
audio, frame pacing, concurrent tracking load, and ARM64/x86-64 Linux remain
unproven. Q-242 and Q-243 select the final visual and output/performance
policies; until then 5% / 24 CSS px / 48 CSS px is only a conservative
automated authoring floor.

## 2026-07-24: isolated community admission and removal exercise

### Delivered

- Added `COMMUNITY_GAME_ADMISSION.md`, defining exact release-scope review,
  mandatory authority/content/controller/permission/privacy/loading/security/
  update/removal categories, separate signed publication authority, monotonic
  revocation, and an explicit user-data disposition boundary.
- Added a deterministic evidence generator over one checked-in hosted manifest
  and one strict local-web fixture. Both remain synthetic test submissions
  with explicit production blockers and zero publisher-authority claim.
- Exercised test-only scoped decisions, isolated catalog publication,
  emergency disable, revocation, new-launch denial, user-data disposition, and
  seven ordered path-free audit events for each case without changing a
  production catalog, package, save, process, or external service.
- Added a bounded canonical-JSON validator that recomputes both manifest
  identities and all source provenance. Eleven adversarial tests reject
  identity/scope substitution, missing/reordered review categories, family or
  production promotion, incomplete disable/revocation, fabricated runtime
  termination, production file mutation, audit tampering, stale provenance,
  weakened boundaries, and unknown claims.
- Recorded CA-001 through CA-008 for submitter authority, reviewer thresholds,
  family content policy, update ownership, active-session removal, user-data
  disposition, audit privacy/retention, and reinstatement.

### Verification evidence

- `pnpm validate:community-admission` passes the tracked canonical artifact and
  all 11 mutation tests.
- The artifact contains exactly one `remote-web` and one `local-web` case, two
  completed isolated workflow exercises, zero product approvals, zero family
  visibility, zero production catalog/package mutations, and zero claimed
  real-runtime terminations.
- The ordinary root test command now includes the mutation suite.

### Remaining boundary

I-205 is active, not closed. Production still requires authenticated submitter
and publisher authority; reviewer identities, separation of duties, and
approval thresholds; final content/privacy/accessibility policy; signed
catalog/package publication and anti-rollback; real hosted and local package
review; emergency-disable delivery to discovery and launch authority;
active-session termination behavior; durable save/data disposition; appeal or
reinstatement; target compositor/input/sandbox evidence; and a complete audit
retention and privacy policy.

## 2026-07-24: strict retro firmware readiness and launch binding

### Delivered

- Added `@vcg/retro-firmware-contract` with strict v1 host policy and installed
  inventory schemas. Policies bind an opaque ID/revision, exact system/core,
  and at most 64 sorted unique requirements; inventories bind the same scope,
  a generation, and at most 128 sorted unique ID/hash/scan records.
- Kept the contract data-minimal: paths, filenames, URLs, display names,
  source-device identity, encoded bytes, unknown fields, duplicates, unsafe
  IDs, invalid hashes, and ambiguous ordering are rejected. Canonical JSON is
  capped at 64 KiB.
- Enforced that console-bundled firmware has separately approved
  redistribution status. Restricted or unverified firmware can be represented
  only as locally user-supplied; the contract never downloads, names, locates,
  copies, or distributes it.
- Added immutable readiness diagnostics for no-requirement, ready,
  optional-attention, and blocked states, with separate missing, wrong-hash,
  and blocked/unavailable opaque IDs plus stable reviewed-help/import/rescan
  action codes.
- Made readiness an in-memory authority. Launch binding requires the exact
  parsed policy, parsed inventory, and readiness object evaluated together;
  clones, policy revisions, inventory generations, system/core substitution,
  and blocked readiness fail.
- Added `RETRO_FIRMWARE_HANDLING.md` and RF-001 through RF-006 for exact first
  systems, legal wording, reviewed labels, storage sharing/protection,
  removal/reset, and policy/hash migration.

### Verification evidence

- All 12 focused firmware tests pass.
- The package strict TypeScript check passes.
- Full root tests, workspace typechecking, production build, and the ordinary
  compliance gate pass. The regenerated inventory contains 138 components;
  the release-only gate retains the known project-license and pose-model
  decision classes.
- Tests cover empty/no-BIOS readiness, exact required identity, missing/
  mismatched/blocked/unavailable required objects, optional attention, bounds,
  sorting and uniqueness, forbidden data fields, redistribution gating,
  system/core confusion, clone/stale authority, parsed-object branding,
  canonical UTF-8 and duplicate refusal, and deeply frozen path-free output.

### Remaining boundary

I-127 is active, not closed. The 2048 candidate remains correctly no-BIOS.
Production still requires exact selected system/core/firmware identities,
legal approval for every object and user-facing instruction, privileged
selected-file import, retained-handle hashing and scanning, protected storage,
launch-specific read-only sandbox mounts, native generation binding, reviewed
per-system UI/help, dependency-aware removal and reset, signed policy updates,
target RetroArch diagnostics, and real corrupt/missing/wrong-revision tests.

## 2026-07-24: versioned arcade parent/clone preflight

### Delivered

- Added a separate strict arcade-set module without loosening retro import v1.
  It binds policy/revision, exact core and core version, exact set version,
  sorted unique title/set identities, parent/clone relationships, exact
  hashes, and explicit test-versus-user-supplied rights status.
- Added a same-scope installed inventory with exact generation and clean/
  blocked/unavailable scan state. Paths, filenames, display names, download
  URLs, content bytes, unknown fields, duplicates, unsafe IDs, and ambiguous
  ordering fail.
- Added stable missing, wrong-hash, and unsafe-set diagnostics. Clone readiness
  requires both exact parent and child; launch binding accepts only the exact
  parsed policy, inventory, and readiness capability.
- Added synthetic rights-cleared parent/clone identities only. No ROM/archive
  bytes, real commercial title, real MAME compatibility, or import permission
  is claimed.
- Added `RETRO_ARCADE_SET_DIAGNOSTICS.md` and RA-001 through RA-006 for exact
  core/set organization, rights-cleared fixtures, dependency scope, import
  packaging, reviewed diagnostics, and update/removal.

### Verification evidence

- All 10 focused arcade tests pass; the retro import-contract package now has
  34 passing tests.
- Strict package typechecking passes.
- Tests cover exact parent, exact parent-plus-clone, independently missing
  sets, wrong hash, unsafe scan, core/core-version/set-version confusion,
  malformed graphs/order, forbidden data fields, clone/stale authority,
  unknown titles, unparsed objects, and canonical JSON.

### Remaining boundary

I-126 is active, not closed. Retro import v1 still intentionally rejects MAME
sets and other multi-file content. Production requires a selected real core/
set organization and metadata source, genuinely rights-cleared fixtures,
archive/member and BIOS/device/sample/CHD validation, an atomic multi-object
import/removal/recovery transaction, reviewed UI, target frontend execution on
both architectures, and real corrupt/incomplete/version-mismatch evidence.

## 2026-07-24: launcher-home television conformance

### Delivered

- Applied the candidate television floor to the production launcher home with
  explicit critical-text and action markers, a five-percent viewport inset,
  responsive TV typography, 48 CSS-pixel action minima, bounded fixed-height
  layout, and a no-request favicon.
- Added three production-build Playwright cases at 1280x720, 1920x1080, and
  3840x2160. They require 24 marked critical texts and 12 actions, exact
  safe-area containment, minimum sizes, pairwise critical-text and
  heading/destination/status non-overlap, zero launcher overflow, and a real
  Home/Search/Enter/Escape focus round trip.
- Added a frozen installed-Chrome generator with deterministic clock input,
  three byte-stable screenshots, exact build-resource accounting, and a
  truthful no-native-host projection.
- Added a strict offline validator and 11 mutation tests that bind the base TV
  contract, production sources, build inputs, exact screenshots, geometry,
  focus trace, errors, limitations, and zero physical/native/other-view/
  target claims.
- Published the dated evidence report and linked the launcher application from
  the candidate authoring contract.

### Verification evidence

- All 72 marked-text observations and 36 marked-action observations pass
  across the three resolutions. Critical-text minima are 24/24/48 CSS px;
  action minima are 125.813x48, 125.813x48, and 211.609x60 CSS px.
- All six critical/section overlap counts and all six horizontal/vertical
  overflow values are zero. All three focus traces are exactly Home, Search
  trigger, Search input, restored Search trigger.
- The production build loads with zero console, page, and request errors.
  `pnpm validate:launcher-tv-conformance` passes the artifact and all 11
  adversarial cases.

### Remaining boundary

I-098/Q-056 remain active. This is one launcher home view on a Windows desk.
Every other launcher/game/failure surface; physical TV, controller, reserved
Home, native host, and people; actual target Linux output/scaling, overscan,
seating distance, accessibility/localization, audio, concurrent load, frame
pacing, and performance remain unproven. Q-242 and Q-243 still select the
final visual and tier output policies.

## 2026-07-24: canonical controller mapping authority

### Delivered

- Added a strict v1 controller profile binding opaque mapping identity and
  revision to exact lowercase SDL GUID, USB vendor/product identity, fixed
  console-and-consenting-games scope, and the host-owned Home/Back/Pause
  declaration.
- Required unique action-sorted controls and the complete shell navigation
  plus confirm set. Bounded physical vocabulary covers buttons, directional
  axis halves, and hats without accepting arbitrary keys or game commands.
- Added deterministic snapshot projection with separately sorted mapped
  ordinary actions and valid-but-unmapped diagnostics. Reserved-action output
  is structurally empty and every result is deeply frozen.
- Added `CONTROLLER_MAPPING_CONTRACT.md` and CM-001 through CM-006 for database
  ownership, physical device cohort, guided mapping, storage scope, recovery,
  and per-game remap policy.

### Verification evidence

- All 9 focused mapping tests pass; the Motion-contract package has 187
  passing tests and passes strict TypeScript checking.
- Tests cover full shell projection, unmapped input, missing or duplicate
  actions, duplicate controls, noncanonical ordering, reserved-action
  exclusion, mapping/revision substitution, cloned and malformed inputs,
  unknown fields, unsafe control/device identity, and exact reserved policy.
- Full root tests, workspace typechecking, production build, and the ordinary
  compliance gate passed with the combined working tree.

### Remaining boundary

I-128 is active, not closed. The contract does not select or distribute a
mapping database, observe a physical controller, connect the native SDL/Steam
Input adapter, persist or sign custom profiles, handle hot-plug/reconnect or
multiple controllers, implement the controller-only mapper and independent
recovery path, define glyph/accessibility/per-game-remap UX, or qualify the
representative physical cohort on target Linux/SteamOS.

## 2026-07-24: host-derived RetroArch sandbox intent

### Delivered

- Added an immutable sandbox plan to every successfully verified
  `RetroArchPlan`. It exposes the exact frontend, core, base configuration,
  and optional managed-content files read-only.
- Exposed only the exact session, saves, states, remaps, screenshots, system,
  and core-options namespaces read-write; complete install/content roots and
  source media are absent.
- Allowed display, audio, and mediated gamepad capability while explicitly
  denying network, camera, microphone, raw input, source media, and desktop
  authority. Contentless launches expose no content-store path.
- Canonicalized the deepest existing ancestor of planned writable paths and
  rejected a verified artifact nested beneath them, including before private
  directories exist.
- Added `RETRO_SANDBOX_PLAN.md` and RS-001 through RS-006 for the enforcement
  adapter, runtime surface, device mediation, network policy, firmware mounts,
  and descendant cleanup.

### Verification evidence

- All 14 focused RetroArch tests pass, including four new mount, capability,
  contentless, and unsafe-overlap cases.
- The full native library suite passes with 291 tests and 5 intentional helper
  ignores.
- Workspace compilation, formatting, strict Clippy with warnings denied, and
  Rustdoc all pass.

### Remaining boundary

I-129 is active, not closed. This is a reviewable host policy plan, not an OS
sandbox. `LaunchSpec` still starts an ordinary direct child. Production still
requires a fail-closed Linux adapter; exact dynamic-library, locale/font,
GPU/audio/display and controller surfaces; read-only firmware projection;
artifact hash-to-exec retention; descendant, namespace, cgroup and compositor
containment; crash/restart cleanup; malicious real-content tests; and
ARM64/x86-64 target evidence.

## 2026-07-24: representative launcher television surfaces

### Delivered

- Applied the candidate television floor to Motion Hub catalog discovery,
  Wi-Fi offline settings, and the injected offline launch-recovery dialog.
- Marked exact critical copy and actions; kept all marked text inside the
  five-percent safe rectangle at 720p, 1080p, and 4K; and tightened launch
  overlay spacing so its header, body, footer, metrics, and actions remain
  bounded.
- Expanded the production-build Playwright suite from three to twelve
  launcher-TV cases. The new cases require exact counts, at least 24 CSS px
  text, at least 48 x 48 CSS px actions, zero marked-text/section overlap,
  zero root overflow, and exact Escape/focus restoration.
- Added a frozen nine-observation generator, nine byte-stable screenshots, a
  bounded artifact, an offline validator, and eleven adversarial tests.
- Published the evidence report plus LTV-001 through LTV-004 for remaining
  state priority, dense-screen scrolling, failure-dialog focus, and capture
  retention.

### Verification evidence

- Motion catalog records 24 critical texts and 13 actions per resolution;
  Wi-Fi offline records 21 and 15; launch offline records 21 and 3.
- Minimum text is 24 CSS px at 720p/1080p and 48 CSS px at 4K. Every minimum
  action dimension is at least 48 CSS px.
- All nine critical-overlap, section-overlap, horizontal-overflow, and
  vertical-overflow counts are zero.
- Focus returns from Motion and Wi-Fi to Home. The launch dialog starts on
  Exit, wraps to Retry and back, then restores the exact Offline opener.
- `pnpm validate:launcher-tv-surfaces` passes the exact artifact and all
  eleven claim-boundary mutation tests.

### Remaining boundary

I-098/Q-056 remain active. The result covers four launcher states on one
Windows desk when combined with launcher Home. It does not prove every shell
state, any game, a real network failure or successful retry, physical TV,
controller, reserved Home, native supervision, target Linux display output,
overscan, seating-distance comprehension, localization/accessibility, audio,
concurrent tracking load, or frame timing. Q-242/Q-243 and LTV-001 through
LTV-004 retain those decisions and evidence needs.

## 2026-07-24: retro target performance authority

### Delivered

- Added a separate strict performance package requiring one 8-bit, 16-bit,
  32-bit, 64-bit, and arcade run for every declared target.
- Bound each target to exact architecture, hardware-inventory and OS hashes,
  frontend identity, output mode, four probe IDs, and instrumentation-policy
  hash. Each case binds exact system, core/version/hash, content/hash, and
  thresholds selected before results.
- Added physical-target versus development-dry-run results with calibration
  and raw-telemetry hashes, frame distributions/misses, audio latency and
  underruns, power, temperature, throttle, crash, hang, and known-limit
  evidence.
- Added exact identity matching, full-matrix refusal, stable failure codes,
  safe-integer missed-frame arithmetic, conflicting known-limit refusal, and
  exact parsed-object authority.
- Published `RETRO_PERFORMANCE_BENCHMARK_CONTRACT.md` and RP-001 through
  RP-008 for systems/content, targets, thresholds, instrumentation, soak, and
  known-limit policy.

### Verification evidence

- All 17 focused tests pass with strict TypeScript checking.
- Recursive workspace tests, root typechecking, production build, and
  compliance pass. The regenerated inventory has 139 components; the added
  first-party package joins the existing unresolved project-license class and
  adds no third-party version.
- The full root test reached only an in-progress stale launcher-TV artifact
  before the concurrent TV tranche landed; that unrelated mismatch is
  superseded by the later landed TV evidence and final combined gates.

### Remaining boundary

I-130 is active, not closed. No emulator, physical target, controller,
display, audio loopback, power meter, thermal probe, or rights-cleared content
was measured. Exact representative cases, target identities, limits,
instrument methods/calibration, raw-evidence retention, one-hour and
four-hour campaign requirements, and complete physical ARM64/x86-64 results
remain.

## 2026-07-24: fail-closed retro starter candidate screen

### Delivered

- Captured six exact upstream heads: Dinothawr, libretro 2048, libretro
  samples, two Lutro demos, and Mr.Boom.
- Recorded separate code/content status, runtime shape, artifact/dependency,
  trademark, architecture, required gates, pinned evidence URLs, and exact
  blockers for every candidate.
- Preserved zero admissions, zero package/catalog mutations, and zero
  downloaded artifacts. “Homebrew,” “public domain,” “open source,” sample,
  or download availability grant no authority.
- Published the source-backed candidate report and SC-001 through SC-007 for
  noncommercial terms, first deep-review target, catalog size, trademark,
  content notes, ownership, and developer fixtures.
- Added an offline exact validator and root gate for the bounded canonical
  artifact.

### Verification evidence

- The exact six-candidate artifact validates with all candidates blocked.
- Eight test groups reject admission/mutation promotion, revision/source
  substitution, weakened rights or trademark findings, hidden artifact/
  dependency/architecture gaps, removed gates/blockers, summary/date/
  limitation drift, unknown claims, and noncanonical/oversized/invalid JSON.
- All six source heads were observed with `git ls-remote`; 2048 matches its
  separately pinned source-candidate SBOM revision.

### Remaining boundary

I-131 is active, not closed. This is a metadata screen, not legal approval or
a starter catalog. No source archive or binary was downloaded by the screen.
No complete asset authorship/trademark review, artifact hash, dependency
closure, content/age review, controller/reserved-action test, signed
reproducible ARM64/x86-64 package, update owner, removal path, or admitted
title exists.

## 2026-07-24: conservative retro experience baseline

### Delivered

- Added an explicit generated-config baseline disabling shaders, run-ahead,
  preemptive frames, rewind, frame delay/automatic frame delay, hard GPU sync,
  and threaded video. Package or frontend defaults can no longer silently
  enable those features in a VCG session.
- Published `RETRO_DISPLAY_LATENCY_ACCESSIBILITY_POLICY.md` with current
  upstream constraints, exact target/core/content/display authority,
  one-change-at-a-time qualification, state-replay mutual exclusions,
  ARM64/x86-64 starting points, and a no-shader reduced-effects fallback.
- Published RX-001 through RX-008 for the visual default, first low-cost
  shader, performance priority, state-replay engine, rewind semantics,
  accessibility ownership, advanced controls, and the first physical matrix.

### Verification evidence

- The focused RetroArch config test requires every conservative setting.
- Source review used current official Libretro/RetroArch run-ahead, VSync,
  troubleshooting, shader, CRT preset, FBNeo, and configuration-default
  documentation. It does not treat upstream recommendations as VCG target
  evidence.

### Remaining boundary

I-132 is active, not closed. No physical Raspberry Pi 5 or x86-64 target,
frontend/core/content combination, renderer, display mode, shader artifact,
frame count, rewind buffer, controller, save-state determinism, audio/frame
timing, power/thermal result, photosensitivity review, or signed installed
profile was qualified. The implementation is the safe baseline only.

## 2026-07-24: unified data-retention register

### Delivered

- Published `DATA_RETENTION_AND_DELETION_POLICY.md` as one current-state
  register for raw/current Motion data, bounded skeleton traces and exports,
  local diagnostics and exports, accessibility state, profile identity and
  sensitive records, console saves/cache, and separately hosted data.
- Separated volatile, bounded volatile, device-local persistent,
  user-managed export, separately hosted, and not-implemented states so
  browser rehearsals cannot be mistaken for durable deletion.
- Defined exact profile-delete ordering, save/reset behavior, failure rules,
  and the boundary that elapsed time never silently deletes a profile/save
  while local deletion never claims hosted-service deletion.
- Published DR-001 through DR-009 for native logs, crash evidence, trace
  export, sanitizer admission, erasure standard, saves, factory reset,
  hosted guidance, and support transfer.

### Existing evidence consolidated

- Motion trace bounds/exclusions and active camera no-egress observation.
- Bounded closed-code diagnostics with exact reviewed export and clear.
- Revision/scope-bound profile reset/delete rehearsal with qualified
  unassignment or explicit exact-record deletion.
- Fixed save namespaces, quotas, preservation, migration staging, and the
  crash-recoverable exact save/cache reset primitive.

### Remaining boundary

I-139 is active, not closed. No unified native lifecycle service, persistent
native diagnostic store, native tracker/crash/swap non-retention proof,
protected cross-store profile-delete transaction, real identity-stripping
sanitizer, durable unassignment/claim/permanent-delete broker, final
factory-reset scope, target fault/forensic campaign, or privacy/legal/support
approval exists.

## 2026-07-24: fail-closed game and asset redistribution register

### Delivered

- Published `REDISTRIBUTION_REGISTER.md` covering every checked-in catalog
  game, built-in first-party experience, OCR-A, the MediaPipe model, copied
  MediaPipe JS/WASM runtime, and launcher-authored presentation output.
- Retained zero offline approvals. Determined, Mi Casa Es Su Casa, and
  VibeBots remain remote-only with `NOASSERTION`; 2048 remains a blocked
  metadata-only candidate; the repository license and pose-model terms remain
  release blockers.
- Separated exact strong evidence from approval: OCR-A's pinned Public Domain
  provenance and the npm runtime's Apache-2.0 metadata are candidates pending
  their complete target release/notice review.
- Defined one ten-part admission floor and explicit absence rules for
  emulator/core/ROM/BIOS, starter candidates, offline hosted-game copies,
  shaders, and unselected system/runtime artifacts.
- Published RR-001 through RR-009 for project licensing, hosted-game
  authority/local editions, the model/runtime, OCR-A, 2048 font,
  title/trademark review, and final release authority.

### Existing enforcement consolidated

- Public manifests retain distribution/license/review status.
- Remote entries stay on exact HTTPS origins.
- Signed installed authority requires target-specific hashes.
- Compliance rejects new unlicensed third-party components and release
  compliance fails closed on known project/model blockers.
- Retro SBOM and candidate screens retain their exact rights/artifact gaps.

### Remaining boundary

I-138 is active, not closed. The project license, owner/title/code/content
authority, pose-model terms, copied MediaPipe file/NOTICE closure, 2048 font,
exact target browser/OS/native/GPU/AI/emulator inventories, audited-local
manifest cross-field gate, independent target SBOMs, complete notice/source
bundle, and final qualified release review remain unresolved.

## 2026-07-24: child and family privacy counsel brief

### Delivered

- Published `CHILD_PRIVACY_REVIEW_BRIEF.md` with frozen product facts for the
  intended school-age/adult audience, shared appliance, accountless core,
  camera/Motion, portraits/body matching, profiles, saves, diagnostics,
  hosted games, network, providers, and support.
- Used current official FTC COPPA/final-rule, UK ICO Children's Code, and
  European Commission children's-data guidance only as issue spotters; the
  brief makes no jurisdiction or legal conclusion.
- Defined a conservative networked-beta boundary that disables portraits,
  persistent automatic body matching, child accounts/social identity,
  ads/analytics/training, telemetry/support upload, and unreviewed hosted
  titles while preserving meaningful offline local use.
- Added exact counsel fact requests, engineering evidence, and requalification
  triggers for every new account/cloud/social/ad/notification/portrait/body/
  recording/support/market/provider/retention change.
- Published CP-001 through CP-013 for operator, markets, age, parent role,
  sensitive identity, hosted services, public identity, data uses, notices,
  rights operations, schools/research, providers/transfers, and claims.

### Remaining boundary

I-140 is active, not closed. The operator, business model, intended markets
and ages, lawful basis, parent/age verification, notices/consent/rights flows,
provider roles/contracts/transfers, production local deletion/non-egress
evidence, child/parent usability, institutional-use policy, operational
security/incident response, and dated qualified counsel approval remain.

## 2026-07-24: launcher Search television evidence

### Delivered

- Applied the candidate five-percent safe inset, 24 CSS-pixel marked critical
  text floor, and 48 CSS-pixel marked action floor to the Search overlay.
- Added exact keyboard focus evidence for initial input focus, ArrowDown into
  results, Tab wrapping, Escape closure, and opener-focus restoration.
- Captured the exact five-result `motion` query and fixed no-result query at
  1280x720, 1920x1080, and 3840x2160 in the production build.
- Added six pixel-bound screenshots, one strict evidence artifact, a generator,
  validator, and eleven adversarial mutation tests.

### Verification evidence

- All six observations stayed inside the candidate safe area with zero marked
  critical-text overlap, zero overlay overflow, and no browser page, console,
  or request failures.
- The result state exposed five results and six actions; the empty state
  exposed zero results and one action.
- Artifact provenance binds the exact launcher/Search/styles/test sources,
  production source tree, representative-surface base evidence, requests, and
  screenshots.

### Remaining boundary

I-098 remains active. Only two exact Search queries were exercised on one
Windows x64 Chrome 150 desk host. Arbitrary text, empty query, scrolling result
sets, activation, localization, voice input, physical TV/controller, target
Linux/compositor, overscan, seating-distance comprehension, output modes, and
frame pacing remain unqualified.

## 2026-07-24: bounded OCR-A structural inventory

### Delivered

- Added a dependency-free bounded TrueType parser for table directories,
  Unicode cmap format 4/12, names, selected metrics, and glyph bounds.
- Generated a strict artifact for the exact 24,316-byte OCR-A 1.0 font with 13
  sfnt tables, 117 glyphs, and 114 mapped Unicode code points.
- Scanned 83 production CSS/Svelte/TypeScript files under explicit file and
  byte limits, recording every non-ASCII code point and occurrence.
- Published OF-001 through OF-006 for deterministic fallback, text-vs-icon
  policy, language scope, legacy metrics, physical-TV review, and release
  approval.

### Verification evidence

- OCR-A maps all 95 printable ASCII code points.
- It maps only `U+00B7 MIDDLE DOT` among 11 distinct non-ASCII code points in
  current production source. Ten punctuation marks, geometric symbols, status
  markers, and check marks require fallback.
- Eleven tests accept the exact artifact and reject sfnt/source/provenance/
  claim mutations, truncation, oversize input, duplicate tables, escaped table
  ranges, and unsupported sfnt versions.

### Remaining boundary

I-147/Q-077 remain active. This is structural inventory, not raster or
legibility evidence. The current platform-selected CSS fallback is not
deterministic. Glyph shape, the unusual zero horizontal-header ascent/descent,
target rendering, TV seating distance, visually similar characters,
localization, accessibility, and final redistribution approval remain.

## 2026-07-24: Windows OCR-A platform fallback observation

### Delivered

- Built the production app and injected a diagnostic-only 1920x1080 grid for
  the exact 12-code-point observation set: one ASCII baseline, one covered
  non-ASCII character, and ten current-source fallback characters.
- Queried installed Chrome's platform-font report per single-character node
  after the production `OCRA.ttf` and CSS stack loaded.
- Bound the exact environment, base structural evidence, production source
  tree, resource requests, resolved font resources, zero-overflow capture, and
  screenshot in a strict artifact.
- Published PFO-001 through PFO-005 for mixed appearance, font-vs-icon policy,
  target-image dependency, first comparison candidates, and Search-symbol
  semantics.

### Verification evidence

- OCR-A rendered only the `A` baseline and `U+00B7 MIDDLE DOT`.
- Windows Chrome selected Consolas for six missing characters, Cambria Math
  for three, and Segoe UI Symbol for one.
- Eleven adversarial tests reject environment/base/probe/font/request/
  screenshot/provenance/claim substitutions.

### Remaining boundary

I-147/Q-077 remain active. This is one Windows Chrome diagnostic injection,
not a user-facing route, target-Linux/native-renderer result, deterministic
fallback selection, glyph-shape or TV-legibility result, accessibility/
localization qualification, bundling authority, or release approval.

## 2026-07-24: catalog-wide remote-game offline observation

### Delivered

- Preserved a bounded live Chrome observation over all 26 entries in the
  2026-07-19 catalog snapshot using a fresh anonymous context per title.
- Recorded two online loads, manifest/worker endpoint identity, active worker
  registrations, explicit update attempts, storage container/key names
  without values, offline reload, and exact environment.
- Added a canonical bounded validator, eight adversarial test groups, and
  RGO-001 through RGO-009 owner questions.
- Registered deterministic validation in the root gate while keeping live
  network regeneration behind the explicit `refresh:remote-game-offline`
  command.

### Verification evidence

- All 26 titles completed both online loads.
- VibeBots, Asymptotic Bitrot, and Block-You exposed parseable manifests.
- Only Block-You had an active service worker and loaded a document after the
  context went offline; gameplay was not exercised.
- The artifact derives and requires `offlinePackageQualifiedCount: 0`.

### Remaining boundary

I-096/Q-051 remain active. No title has complete offline gameplay, assets,
cold restart, save/reset, update/rollback, source/deploy identity,
installability, hosted-service, controller/recovery, target Linux/architecture,
or rights evidence. A successful cached document is not an admitted signed
offline package.

## 2026-07-24: remove Search's unrelated Unicode fallback

### Delivered

- Replaced the visible `U+2315 TELEPHONE RECORDER` character in Search with a
  first-party CSS-drawn search mark.
- Marked the decorative shape `aria-hidden` and retained the visible
  “Search everything” label as the accessible authority.
- Added a browser assertion that the mark has no text and is hidden from
  assistive technology.

### Evidence refresh

- After this Search-only change, the structural inventory contained 15
  distinct non-ASCII production source code points, 14 of which required
  fallback. The later shared navigation-icon tranche reduced those current
  totals further.
- At this intermediate point, the Windows Chrome probe contained 16
  observations: two OCR-A glyphs and 14 platform fallbacks. Cambria Math fell
  from five observed symbols to four.
- The structural, Windows fallback, launcher Home, representative-surface, and
  Search evidence chains were regenerated against the exact new source tree.

### Remaining boundary

This removed one semantic and platform-font dependency; it did not by itself
select the remaining fallback or shared icon system. The subsequent shared
navigation-icon tranche removes four more font dependencies. Target
Linux/native/physical-TV qualification remains.

## 2026-07-24: first-party exact-head rights screen

### Delivered

- Preserved an exact public-HEAD/tree screen for all 23 first-party entries in
  the 2026-07-19 catalog snapshot without cloning or packaging a game.
- Recorded root license/notice paths and bytes, package-license declarations,
  asset-like extension counts, submodules, repository state, and mandatory
  fail-closed blockers.
- Added a canonical bounded validator, eight adversarial test groups, and
  FPR-001 through FPR-011 owner questions.
- Registered deterministic validation in the root gate while keeping GitHub
  refresh behind the explicit `refresh:first-party-game-rights` command.

### Verification evidence

- Twenty repositories expose no observed root grant.
- Block Punch Kick has only an ISC package declaration; Clankers has MIT text
  with an explicit upstream-design-document exclusion; VibeGear2 has MIT
  signals but 207 asset-like paths requiring separate review.
- The artifact derives and requires zero recorded owner authorizations, zero
  redistribution approvals, and zero production catalog mutations.

### Remaining boundary

I-095/Q-051 remain active. Public visibility and organization membership are
not redistribution authority. Every title still needs exact code/content/
asset/title/trademark/dependency/submodule provenance, source-to-deployment
and signed-package binding, notices/corresponding source, ARM64/x86-64 release
artifacts, named authorization, and qualified legal/release review.

## 2026-07-24: remove navigation-critical font fallbacks

### Delivered

- Added one shared first-party CSS primitive for left, right, external, and
  retry navigation marks.
- Replaced production `U+2190`, `U+2192`, `U+2197`, and `U+21BB` decoration
  across Home destinations, Search results, launch recovery, Museum entry,
  profile flows, calibration, portrait capture, unassigned progress, and the
  active Settings marker.
- Kept visible adjacent action text as the semantic authority and marked every
  element-backed icon `aria-hidden`.
- Added browser assertions for empty, assistive-technology-hidden Home,
  Search-result, and retry marks.

### Verification evidence

- The affected 18-case TV matrix passes at 720p, 1080p, and 4K with zero
  overflow or critical-text overlap. Search motion results now contain 13
  marked critical-text elements rather than counting five decorative arrows.
- The strict structural inventory now contains 11 distinct non-ASCII
  production-source code points: one OCR-A mapping and ten fallback
  requirements.
- The regenerated Windows Chrome observation contains 12 probes: two custom
  OCR-A glyphs and ten platform fallbacks. Consolas supplies six, Cambria Math
  three, and Segoe UI Symbol one.
- Home, representative-surface, Search, structural-font, and platform-fallback
  artifacts were regenerated against the exact source tree; their validators
  require the new screenshots, asset requests, measurements, and provenance.
- The complete root unit gate, workspace typecheck, production build, schema,
  manifest, and compliance freshness checks pass. All 53 Chromium flows pass,
  including every profile/calibration view changed by the shared icon
  primitive.

### Remaining boundary

I-147/Q-077 remain active. Shared CSS geometry removes platform-font
dependencies for navigation-critical decoration, but it is not yet a
versioned release icon package or a physical-TV, target-Linux, native-renderer,
localization, low-vision, or accessibility qualification. Ten current
punctuation/status/profile/controller characters still require a selected,
rights-reviewed deterministic fallback or first-party treatment. OF-001
through OF-006 and PFO-001 through PFO-005 retain the owner decisions.

## 2026-07-24: catalog service and candidate evidence gates

### Delivered

- Registered the already recorded 26-title game-service dependency screen and
  full-catalog candidate ledger in the deterministic root unit gate.
- Added named offline validation commands for both artifacts, an explicit live
  refresh command for the bounded source/browser service screen, and a
  deterministic local refresh command for the derived candidate ledger.
- Advanced I-097 from a three-title compatibility note to the exact
  23-source/three-source-gap catalog-wide signal screen without promoting a
  signal into service necessity, privacy approval, or degradation support.
- Advanced I-104 from four checked-in examples to a strict non-authoritative
  26-entry ledger while preserving zero admission, zero host authority, and
  zero production catalog mutation.

### Verification evidence

- The game-service artifact validates 26 games, 23 exact source screens, and
  zero degradation/offline qualifications; all nine adversarial test groups
  pass.
- The candidate ledger validates 26 entries, the three existing public
  manifest/launcher facts, and zero admissions/host grants/mutations; all
  eight adversarial test groups pass.
- Both validators are network-free. Only
  `refresh:game-service-dependencies` performs the documented bounded live
  source/archive and browser refresh.
- The first root-gate run rejected stale launcher evidence because the new
  package commands changed the bound production-source commitment. Home,
  representative-surface, Search, and OCR-A fallback records were regenerated
  in dependency order; the complete root unit gate, workspace typecheck, and
  production build then pass.

### Remaining boundary

I-097/I-104 remain active. Static names and anonymous route observations are
not a complete service/data-flow inventory, and candidate metadata is not a
manifest, signed catalog, permission grant, package descriptor, admission
record, or owner authorization. The isolated owner questions and exact
promotion gates in the two dedicated evidence documents remain authoritative.

## 2026-07-24: committed research evidence root coverage

### Delivered

- Audited every committed `scripts/validate-*.test.*` file against the root
  package commands and found 16 research-evidence suites with no named or root
  validation path.
- Added one explicit `validate:research-evidence` command with a closed file
  list and registered it in `pnpm test`.
- Used the TypeScript-aware runner for the entire set. Three `.mjs` suites
  import project TypeScript and fail under plain Node module resolution, while
  the chosen runner exercises their real source dependencies.
- Excluded the then-concurrent remote-game input-surface tranche from the
  closed list; it landed independently as `a5f7e38` after the list was frozen,
  and this gate cannot silently absorb it or any future file.

### Verification evidence

- All 164 tests pass across camera-to-action timing, tracker identity,
  gamepad projection, laterality, rule baselines, smoothing, confidence,
  seated/partial-body support, player-session authority/interference, backend
  comparison, power-cut campaigns, RGB-depth floor contact, temporal-rule
  comparison, blind skeleton debugging, and the x86 development baseline.
- The suites retain their exact hash, privacy, raw-frame, truth-leakage,
  authority, coverage, failure-oracle, provenance, and claim boundaries.
- The expanded root unit gate, workspace typecheck, and production build pass.
  The four package-bound launcher/OCR-A records were regenerated after the
  command changed their production-source commitment.

### Remaining boundary

Root execution prevents these committed artifacts from drifting silently; it
does not turn synthetic, planned, incomplete, developer-host, or camera-free
evidence into physical participant, target-device, production, accessibility,
latency, safety, or release qualification. Each artifact’s existing owner
questions and investigation disposition remain unchanged.

## 2026-07-24: catalog input-surface evidence gate

### Delivered

- Preserved the separate `a5f7e38` 26-title neutral browser observation and
  its exact API/listener/control counts without turning an initial-route signal
  into a required-input or controller-compatibility declaration.
- Registered its deterministic validator and eight adversarial tests in the
  root gate, plus named offline validation and explicit live refresh commands
  in `fc51d7b`.
- Refreshed Home, representative-surface, Search, and OCR-A fallback evidence
  against the changed package source commitment in `a37bab4`.
- Updated I-089’s evidence column while deliberately retaining `open`: the
  investigation requires hands-on television/gamepad/remote sessions, which
  this synthetic neutral fixture did not perform.

### Verification evidence

- All 26 URLs loaded in isolated contexts. Five exposed a Gamepad API signal,
  25 keyboard, 21 pointer, 19 touch, and 12 initial text-entry surfaces.
- Zero titles requested pointer lock or fullscreen without interaction, made a
  mutating HTTP request, or received input qualification.
- The validator and all eight mutation groups pass and retain the bounded
  canonical artifact, prior-catalog provenance, privacy exclusions,
  zero-qualification summary, and exact limitation set.

### Remaining boundary

I-089/Q-049 remain open. API polling and listener registration do not prove
correct mappings, controller-only menus/gameplay, pause/exit/recovery,
hot-plug/reconnect/replacement, battery/sleep, simultaneous devices,
keyboard/pointer/touch/text requirements, reserved Home/Back authority,
fullscreen/focus/hang/crash behavior, physical-TV/audio behavior, or either
target tier. The dedicated owner-question document retains the decisions.

## 2026-07-24: paired developer trust and session admission

### Delivered

- Added a new isolated native `developer_pairing` authority module without
  opening a LAN listener or integrating browser-controlled mode state.
- Defined one canonical 16 KiB registry with at most 32 key-derived Ed25519
  workstation identities and no names, addresses, paths, URLs, secrets,
  profiles, or arbitrary permissions.
- Bound usable trust to exact external generation and registry SHA-256. Pairing
  and revocation publish the next predecessor-bound registry first and require
  the platform to commit the exact returned state before it can authenticate a
  workstation.
- Added a non-persistent developer-mode epoch capped at 15 minutes, exact
  60-second domain-separated key-possession challenges, single active
  workstation authority, close/expiry invalidation, and 1,024 request-ID replay
  bounds.
- Restricted output to integrity-bound Push plus fixed Launch, ReadLogs,
  Restart, and Rollback operations. No path, command, argument, environment,
  URL, credential, production package, profile, arbitrary method, or free-text
  log authority exists in the request type.
- Recorded D-170 and isolated transport, key-storage, pairing-ceremony,
  listener, namespace, audit, recovery, semantics, and workflow choices in a
  new owner-question document.

### Verification evidence

- Eleven focused Rust tests pass across canonical intake, key/entry/byte
  bounds, two-phase pairing,
  rollback/substitution/jump/predecessor refusal, two-phase revocation,
  protected-state strictness, exact signatures, wrong/stale/expired challenges,
  close/expiry/randomness bounds, immediate trust-change invalidation, unsafe
  operations, and exact replay capacity.
- Explicit-file Rust formatting and strict crate Clippy pass.
- The complete native suite passes with 302 library tests, five intentional
  helper ignores, and 19 CLI tests. Workspace typecheck, production build, 33
  launcher evidence tests, and 22 OCR-A evidence tests also pass.

### Remaining boundary

I-102 is active, not closed. This admission layer is neither an authenticated
encrypted transport nor a deployment service. Production still needs
reserved-input enable/pair/revoke authority; target-protected console and
workstation keys plus monotonic state; listener/discovery/firewall/link
lifecycle; complete receipt hashing; developer-only storage, install, sandbox,
launch, logs, restart, rollback, cleanup, and audit; family/reboot closure;
hostile-LAN/stolen-key/interruption tests; both Linux tiers; and measured
controller-only time to first launch.

## 2026-07-24: developer-only artifact receipt

### Delivered

- Added an isolated native `developer_artifact` store that accepts only the
  non-serializable Push authority produced by the paired-session layer.
- Required an absolute preprovisioned root with exact real `staging`, `ready`,
  and inert regular lock children; one nonblocking lock serializes cooperating
  receipt, load, and recovery operations.
- Consumed the authorization, retained only a canonical path-free
  request/workstation/session/deployment/length/SHA-256 receipt, read at most
  declared length plus one, and synchronized exact bytes before an atomic
  staging-directory rename.
- Blocked all later publication while incomplete session state exists. Explicit
  recovery prevalidates every staging name/type/child before removing only
  those direct incomplete directories and never touches ready artifacts.
- Reopened ready state through exact direct canonical children, rejected extra
  files or noncanonical receipt bytes, completely rehashed the retained open
  artifact handle, and rewound it before returning.
- Recorded D-171 and updated the existing DL-006/DL-009 owner questions without
  turning the 8 GiB/1,024-entry parser ceilings into product quota or retention
  choices.

### Verification evidence

- Eight focused Rust tests pass for exact publication/reload, non-Push denial,
  short/long/changed source refusal, recovery barrier and cleanup, durable
  request replay, artifact/receipt/layout tamper, lock contention, provisioned
  path boundaries, and foreign staging refusal.
- Explicit-file formatting and strict crate Clippy pass.

### Remaining boundary

At this checkpoint the whole-artifact handoff was not a LAN receiver or
developer package system. The following D-172 tranche closes only
same-process active-transfer retry/cancellation and live-session publication.
Encrypted transport/durable resume, target-protected keys/state, archive
selection/parsing, capacity reservation, installer/activation, immutable
execution handoff, sandbox, launch/log/restart/rollback/removal,
retention/save/audit policy, hostile same-account writers,
disk-full/corruption/power-loss behavior, and both target tiers remain under
I-102 and the dedicated owner questions.

## 2026-07-24: session-bound developer transfer control

### Delivered

- Extended every authorized developer operation with shared volatile session
  liveness. Closing, dropping, or expiring the developer authority waits for a
  current admitted mutation and prevents every later use of the operation.
- Replaced one-shot receipt internals with a non-cloneable,
  non-serializable pending Push capability that retains its exact authorization,
  receipt binding, current length, and incremental SHA-256 only in memory.
- Added nonempty same-process chunks capped at 1 MiB. Every append requires
  fresh trusted monotonic time, the originating live session, the exact store,
  the exact canonical receipt/layout, and the current file length.
- Made retry explicit and narrow: lock contention proves no byte was written,
  so the same chunk may be retried; any write/synchronization ambiguity leaves
  staging inert for exact cancellation or recovery.
- Required the live-session gate through complete staged readback, exact
  incremental/full digest agreement, and the publication rename. Windows
  verification closes the pre-publication handle before directory rename, then
  ready loading opens and completely revalidates the published bytes.
- Added exact cancellation that consumes the pending capability and removes
  only its bound canonical incomplete receipt/artifact, including after
  session loss. Dropped transfers and reboot never reconstruct authority or
  SHA state from writable staging.
- Recorded D-172 and updated DL-009 without selecting network framing,
  acknowledgements, or durable cross-process resume.

### Verification evidence

- Thirteen pairing tests and fifteen artifact tests pass. New adversarial cases
  cover shared close/drop/expiry liveness, close linearization against a
  current mutation, lock-contention retry without duplicate bytes, publication
  after close, empty/oversized/overrun chunks, cross-store transfer misuse,
  wrong complete digest, exact cancellation, and dropped-transfer recovery.
- Explicit-file formatting and strict crate Clippy pass.

### Remaining boundary

I-102 remains active. This tranche controls a same-process inert receipt; it
does not provide the mutually authenticated encrypted listener, protected
console/workstation keys and monotonic state, durable network resume, reserved
input/UI, archive parsing, installation/activation, sandbox, launch/log/restart/
rollback/removal, capacity/retention/audit policy, hostile same-account
containment, target-filesystem power-loss evidence, or either Linux-tier
qualification.

## 2026-07-24: exact native restart-cleanup proof

### Delivered

- Added `restart_cleanup`, a separate privileged adapter boundary with one
  closed result vocabulary: `Empty`, `NotEmpty`, or `Unavailable`.
- Replaced the public no-argument restart-cleanup acknowledgement with an
  opaque non-cloneable request issued only for a persistent service's active
  recovered barrier and a consumed non-serializable proof produced only from
  `Empty`.
- Bound request/proof to a fresh in-memory allocation for the exact service
  barrier. Pointer identity rejects proofs from another journal/service,
  another process, or the same barrier after it has already been cleared.
  Retaining a stale proof retains its allocation, preventing address reuse for
  a later identity.
- Preserved the durable ordering: proof match precedes synchronized barrier
  removal; only successful removal releases restart-indeterminate catalog
  generation protection and fresh launch admission. Persistence ambiguity
  faults replay state.
- Kept request, inspection, proof, and acknowledgement absent from the
  browser/JSON API. Its impossible internal proof-mismatch case maps to generic
  replay unavailability if it ever reaches browser error handling.
- Added `RESTART_CLEANUP_PROOF.md`, recorded D-173, and updated Q-124 without
  claiming a real systemd/cgroup implementation.

### Verification evidence

- Four integrated launch cases cover memory-only/no-barrier request denial,
  one-call nonempty/unavailable inspection with continued launch denial,
  cross-service and post-clear stale-proof refusal, exact matching
  acknowledgement, package-generation protection release, and fresh-launch
  admission.
- Focused tests and strict crate Clippy pass.

### Remaining boundary

I-109 and I-209 remain active. The proof type prevents accidental or
cross-instance acknowledgement; it cannot determine whether an operating
system process scope is actually empty. Production still needs the exact
service-manager/cgroup owner, descendant containment, forced termination and
empty inspection, boot-epoch/age retention, protected service configuration,
launcher restart policy, hostile-descendant and service-crash tests, target
filesystem/power-loss evidence, and ordinary x86-64/ARM64 Linux qualification.

## 2026-07-24: rollback-resistant profile-registry intake

### Delivered

- Added a separate canonical protected profile-registry v2 without changing
  the launcher's current legacy v1 input.
- Bound every provisioned registry to a strict random 128-bit registry
  identity, monotonic generation, exact predecessor SHA-256, and complete
  canonical registry SHA-256.
- Added a closed 512-byte protected-state adapter document containing only
  schema, registry identity, generation, and digest. Generation zero is one
  canonical empty authority-free registry.
- Implemented publish-before-protect recovery: writable state exactly one
  generation ahead returns only `ProtectionCommitRequired`; its profile IDs
  cannot become launch authority until exact protected state is committed and
  read back.
- Reject rollback, same-generation byte substitution, jumps, cross-registry
  scope, broken predecessor chains, noncanonical/padded/open state, sensitive
  or unknown registry fields, invalid IDs, duplicates, and existing size/count
  violations.
- Recorded D-174 and Q-244. The protected-state JSON remains only an adapter
  boundary; storing it beside writable registry bytes is explicitly
  insufficient.

### Verification evidence

- Seven focused Rust cases pass. Four protected-v2 cases cover canonical and
  bounded state, safe empty initialization, pre-commit denial, exact
  post-commit activation, rollback, substitution, jumps, scope drift,
  predecessor drift, sensitive fields, and noncanonical bytes.
- The three existing v1/launcher cases continue to prove ordered opaque IDs,
  strict legacy input, and the existing authenticated launch-capability path.

### Remaining boundary

The launcher intentionally still consumes unprotected v1. Q-244 must select
the authenticated maintenance migration/provisioning ceremony before v2 is
wired into `main.rs`. No production writer, protected platform slot/CAS,
profile broker, registry/vault/save transaction, deletion meaning, target
rollback/power-loss evidence, or Linux-tier qualification is implemented.

## 2026-07-24: Search empty-query television evidence

### Delivered

- Extended the strict Search artifact from two fixed states to three at
  1280x720, 1920x1080, and 3840x2160 without selecting the final empty-query
  product policy.
- Counted all 18 current destinations and all 39 marked critical-text nodes
  while measuring only text fully visible within the internal results
  viewport. Offscreen text is no longer confused with safe-area evidence.
- Recorded exact results-viewport density: 523/910 CSS px client/scroll height
  at 720p, 798/877 at 1080p, and an exact 1158/1158 fit at 4K. Last-result focus
  reaches 387 px and 79 px maximum scroll respectively in the two overflowing
  modes and remains fully visible in all three.
- Focused the exact Profiles result, pressed keyboard Enter, and proved Search
  closes into the local `Who is playing?` destination at every resolution.
- Added three pixel-bound scrolled-state screenshots and expanded the strict
  artifact, generator, validator, browser checks, evidence note, owner handoff,
  and I-098 disposition.

### Verification evidence

- The three focused empty-query TV browser cases pass.
- The artifact validates with eleven adversarial test groups covering clipped
  visibility, exact scroll geometry, interaction traces, activation, evidence
  promotion/demotion, screenshots, provenance, and the prior strict checks.
- Generation loaded the production build in installed Chrome 150 with zero
  console errors, page errors, or failed requests across all nine observations.

### Remaining boundary

I-098/Q-056 remain active. STV-001 still owns the default empty-query policy,
and STV-004 still requires offline package, remote-web, unavailable,
destructive-setting, and external-origin activation plus failure/denial and
Back recovery. Long/localized text, accessibility variants, physical
controller/TV use, reserved Home, native recovery, target Linux/compositors,
overscan, output modes, seating-distance comprehension, and frame timing also
remain unqualified.

## 2026-07-24: transactional native standard shell mapping

### Delivered

- Added a stateful `StandardShellControllerMapper` before native controller
  reconciliation.
- Froze the closed standard shell projection: South to Select, East to Back,
  Start to Pause, Guide to Home, D-pad to directions, and primary X/Y axes to
  directions.
- Added primary-axis hysteresis with a 0.55 press threshold and 0.35 release
  threshold. Latches bind exact backend instance plus volatile connection
  epoch and clear on absence, replacement, ambiguity, or explicit adapter
  reset.
- Made complete-poll validation transactional. Excessive/duplicate devices,
  zero epochs, duplicate buttons, non-finite/out-of-range axes, and
  standardized signals attributed to an ambiguous mapping change no latch
  state.
- Preserved neutral ambiguous-device visibility while granting it zero
  semantic signal authority, and emitted complete snapshots in deterministic
  backend order for the existing opaque-ID/edge registry.

### Verification evidence

- Nineteen focused native input cases pass. Five new cases cover complete
  button/axis mapping, deterministic order, press/release hysteresis, fresh
  connection epochs, fault reset, transactional invalid-poll refusal,
  empty-poll latch removal, neutral ambiguity, standardized-signal denial, and
  every declared observation bound.
- This adds no controller names, serials, paths, transport addresses, profile
  identity, or durable device association.

### Remaining boundary

I-151 and I-209 remain active. This is a pure standard shell mapper, not an
SDL3 producer, SDL mapping database, complete gameplay-device projection,
player assignment flow, glyph/battery layer, compositor-reserved Home/Back/
Pause route, physical-device campaign, or ARM64/x86-64 Linux qualification.

## 2026-07-24: Search offline-package activation and focus recovery

### Delivered

- Changed Search result activation to await overlay closure and exact opener
  restoration before invoking the selected action. Launch supervisors no
  longer capture a soon-hidden Search result as their Back return target.
- Added one exact lowercase `obstacle` Search state at 720p, 1080p, and 4K.
  Each observation verifies five marked critical-text nodes, two action
  targets, no overlap or overlay overflow, and the existing candidate TV
  geometry floor.
- Focused the exact Obstacle result, pressed keyboard Enter, proved the
  `LOCAL WEB` Obstacle launch dialog appeared, pressed Back, and proved the
  dialog closed with focus restored to the Search trigger in every mode.
- Extended the Profiles activation trace through Back to the focused Home
  navigation action.
- Added three pixel-bound Obstacle-result screenshots and expanded the strict
  Search artifact to four states, twelve observations, four exact queries,
  twelve screenshots, and two local activation classes.

### Verification evidence

- The normal Chrome Search launch/recovery flow passes with a frozen clock.
- Six focused TV cases pass across Profiles Back recovery and Obstacle
  activation/recovery at all three resolutions.
- The strict Search validator and eleven adversarial test groups pass,
  including activation outcome, adapter, Back focus, scroll geometry,
  screenshots, provenance, and claim-promotion/demotion mutations.
- The complete root test command, workspace production build, and all sixty
  Playwright cases pass. The dependent OCR-A structural and Windows Chrome
  platform-fallback artifacts were regenerated and both eleven-group
  adversarial validators pass.

### Remaining boundary

I-098/Q-056 remain active. This proves one built-in local-web launch surface,
not a signed installed package, completed gameplay, native-host execution, or
target runtime. STV-004 still requires remote-web, unavailable-package,
destructive-settings, and external-origin result classes plus their
failure/denial paths. Final empty-query policy, arbitrary/localized text,
accessibility variants, physical controller/TV use, reserved Home, target
Linux/compositors, overscan, output modes, seating-distance comprehension, and
frame timing remain unqualified.

## 2026-07-24: native power ordering and launch exclusion

### Delivered

- Added a non-serializable Rust `PowerCoordinator` for the D-166 runtime
  protocol with positive coordinator epoch, monotonic operation IDs, checked
  30/60/30-second confirmation/quiescence/wake windows, closed phases, exact
  operation references, both tier idle targets, and terminal ambiguity.
- Closed fresh `NativeLaunchService` admission before exposing quiescence.
  The non-cloneable closure does not reopen on drop and remains retained
  through idle, fault, unclean loss, and restart/shutdown handoff.
- Serialized power admission closure against direct process spawn and every
  watchdog attempt. Closing admission cancels already-reserved active work;
  the direct and watchdog paths recheck under the same activation boundary
  before spawning.
- Made launch admission the automatic first gate. The other six quiescence
  gates and three wake gates invoke host-selected Rust adapter traits with an
  exact operation-bound request; no public string/JSON acknowledgement exists.
- Made duplicate successful gates idempotent without reinvoking an adapter.
  Failed, unavailable, or incorrectly placed unsafe-update results enter a
  terminal fault and retain launch exclusion.
- Required a host-selected input adapter to qualify a short physical power
  press and all wake sources. Only completion of launcher, display, and input
  readiness consumes the exact launch closure and returns to Active.
- Added stable host-API handling for a launch attempted during a power
  transition without exposing a power-control route.
- Added Q-245 for the unresolved privileged-process, authenticated-IPC,
  coordinator-epoch, service-adapter, and tier handoff decision.

### Verification evidence

- Thirteen focused coordinator tests cover launch-admission-first state, exact
  adapter requests, both idle targets, duplicate behavior, unsafe/ambiguous
  terminal results, restart confirmation/expiry/no-late-cancel, transition
  deadline, physical-input qualification, all wake gates, wake-only reopen,
  platform failure and one-shot transfer, stale/cross-epoch refusal, monotonic
  clock/deadline/identifier bounds, late service/platform/wake completion
  refusal, and honest unclean loss.
- One native-launch test proves closure cancels pending activation, rejects
  fresh admission, reopens only by exact consuming authority, and remains
  closed when that authority is dropped.
- One process test proves the atomic watchdog launch callback can cancel before
  any child spawn.
- Repository formatting and strict all-target/all-feature Clippy pass. The
  complete native suite passes with 346 library tests, five intentional
  subprocess helpers ignored, and all 19 CLI tests. Workspace typecheck,
  production build, and the complete root test command also pass against the
  current shared tree.

### Remaining boundary

I-029 remains active. No launcher/daemon wiring, authenticated IPC, concrete
tracker/camera/input/storage/update/display adapter, per-game signed suspend
policy, systemd/logind/firmware/SteamOS/Raspberry Pi adapter, physical button,
GPIO, compositor wake path, boot-only recovery coordinator, or target
suspend/resume/shutdown/power-cut/thermal/energy/endurance evidence is claimed.
The Rust traits are privileged integration boundaries, not proof that an
implementation returning `Complete` is trustworthy.

## 2026-07-24: bounded native diagnostic persistence

### Delivered

- Added an exclusive Rust diagnostic store with explicit caller-selected
  event, byte, and boot-epoch bounds inside fixed 4,096-event, 4-MiB, and
  64-boot hard ceilings.
- Added one closed producer and code vocabulary. Move-only leases bind an
  exact producer to an exact store instance; code derives producer, subsystem,
  and severity, leaving no arbitrary string, path, identifier, payload,
  wall-clock, frame, skeleton, profile, save, or credential field.
- Added positive global ordinals, positive caller-supplied boot epochs, and
  producer-local monotonic boot-relative time. The store rejects epoch
  rollback, time reversal, gaps, changed derived metadata, noncanonical names,
  symlinks, and unexpected layout.
- Added at-most-512-byte create-new incoming records, complete-file flush,
  canonical rename publication, directory synchronization where available,
  incomplete-incoming recovery, nonblocking exclusive locking, bounded
  enumeration, and oldest-first complete-record rotation.
- Added a path-free nonserializable snapshot with retained/bounded byte and
  event facts, eviction count, fixed privacy exclusions, warning count, and
  closed subsystem counts. The persistence layer grants no review, clear,
  download, upload, share, or support authority.
- Added empty canonical per-producer time watermarks under a fixed 18-entry
  ceiling. Event publication precedes watermark publication, which precedes
  eviction; reopen reconstructs an interrupted missing watermark from retained
  history before cleanup, so eviction plus restart cannot erase the monotonic
  source-time floor.
- Added a consuming complete-clear transaction with a fixed flushed marker as
  the deletion commit point. It validates the whole event/watermark scope
  before removal, completes after restart, resets sequence/eviction/time, and
  grants no browser or producer clear authority.
- Recorded D-175 and Q-246 without selecting the unresolved product retention,
  privileged service/IPC, boot provenance, export destination, or support
  workflow.

### Verification evidence

- Seventeen focused Rust tests cover exact source/store binding, derived metadata,
  producer-local monotonic time, committed reopen and ordinal continuation,
  incomplete-write recovery, event/byte/boot eviction, path-free exclusions,
  boot rollback, interleaved and evicted/restarted source time, missing
  watermark reconstruction, legitimate new-boot reset, future-watermark and
  metadata tamper refusal, complete and interrupted clear, pre-delete scope
  validation, unsafe policy/path/layout, and lock contention.
- Rust formatting and strict all-target/all-feature Clippy pass for the
  current shared tree.

### Remaining boundary

I-116 and I-108 remain active. No runtime opens the store or issues a real
producer lease. The current capability is in-process separation, not OS peer
authentication; the caller-supplied boot epoch has no platform provenance.
There is no rollback protection, age policy, admin review/clear transaction,
native export serializer, destination, support transport, health UI,
real-producer canary suite, core-dump approval, or Raspberry Pi/SteamOS
filesystem, full-disk, corruption, sudden-power-loss, and forensic evidence.
Oldest-prefix deletion can resemble ordinary retention, so these records never
grant launch, update, recovery, save, profile, or power authority.

## 2026-07-24: native accessibility preference persistence

### Delivered

- Added a Rust representation of the exact D-164 device-wide accessibility v1
  document with the same closed text, contrast, motion, posture, confirm, and
  audio vocabularies and complete 1,024-byte input ceiling.
- Added an exclusive absolute-path store with create-flush-rename ordinal
  generation publication. Reopen removes canonical incomplete files, selects
  the newest complete generation, discloses malformed latest state as full
  conservative defaults, and removes superseded generations.
- Added a durable reset marker that makes complete reset recoverable across
  restart. Reset validates every generation name and file type before removal
  and never sweeps an unexpected file into its authority.
- Preserved the non-authoritative boundary: posture/remap remain previews,
  reserved controls are unchanged, and preferences grant no admin, developer,
  package, launch, camera, profile, or game authority.
- Recorded D-176 without choosing Q-159 through Q-161 or inventing implicit v2
  migration.

### Verification evidence

- Nine focused Rust tests cover exact browser-v1 round trip, parser/bound
  refusal, defaults, atomic save/reopen/cleanup, incomplete publication,
  rejected-state replacement, reset recovery, pre-publication directory
  headroom refusal, unsafe path/layout, and lock contention.

### Remaining boundary

I-119 remains active. No launcher or native service opens this store, browser
local storage is not migrated, and no native input/tracker/game component
consumes the preferences. Final device/profile scope, remapping and recovery,
audio design, future schema migration, mount/service/reset/update ownership,
Windows directory durability, physical full-disk/power-loss behavior, target
TV behavior, and household accessibility qualification remain open.

## 2026-07-24: Search remote-web failure and denial recovery

### Delivered

- Changed the canonical `VibeCoded Museum` Search result to enter its closed
  remote-web launch supervisor directly after Search restores the exact
  opener. Catalog-title results continue to enter the bounded Museum catalog.
- Added exact ready/blocked-preview and offline-failure Museum Search states at
  720p, 1080p, and 4K. Each state has one result, five marked critical-text
  nodes, two marked actions, no overlap or overlay overflow, and the candidate
  TV geometry floor.
- Proved the ready supervisor exposes `VIBECODED.GAMES / ONLINE`, deliberately
  forced the separate preview to be blocked, retained the launch dialog with a
  visible denial, and restored Back focus to the Search trigger.
- Proved activation after the already-loaded page context becomes offline
  exposes `OFFLINE`, `No network connection`, and Retry without a remote
  request, then restores Back focus to the same Search trigger.
- Expanded the strict artifact to six states, eighteen observations and
  screenshots, five distinct queries, and three activation classes. The
  launcher contract and Search owner-question record now distinguish the
  qualified launcher-side disclosure from unqualified remote content.

### Verification evidence

- Seven focused Chrome cases pass: one combined normal flow plus ready/denial
  and offline-failure cases at all three resolutions.
- The Home, representative-surface, Search, OCR-A structural, and OCR-A
  platform-fallback artifacts were regenerated against the new production
  source. All five strict validators and their eleven adversarial groups pass.
- The complete root test command and workspace production build pass, followed
  by all sixty-seven Playwright cases.

### Remaining boundary

I-098/Q-056 remain active. No remote page opened, and no reachability,
containment, remote gameplay, catalog title, physical TV/controller, target
Linux, or native host was qualified. STV-004 still needs unavailable-package
and destructive-settings activation and denial. STV-001 through STV-003 still
own default density, query/localization, and no-result recovery policy.

## 2026-07-24: Search unavailable-package denial

### Delivered

- Routed only retro catalog Search results into the existing signed-package
  launch supervisor. Museum catalog-title Search results retain their bounded
  catalog navigation, while the exact 2048 result now exercises its own retro
  package identity.
- Added one exact lowercase `2048` Search state at 720p, 1080p, and 4K with
  one result, five marked critical-text nodes, two marked actions, no overlap
  or overlay overflow, and the candidate TV geometry floor.
- Proved the absent release fails closed as `NOT AVAILABLE`, retains the exact
  signed-inventory refusal text and `PACKAGE_RELEASE_MISMATCH` diagnostic,
  exposes Retry, contacts no package runtime, and restores Back focus to the
  Search trigger in every mode.
- Expanded the strict Search artifact to seven states, twenty-one observations
  and screenshots, six distinct queries, and four activation classes. Search
  documentation and I-098 now leave only the destructive-settings STV-004
  class among the ordered activation classes.

### Verification evidence

- Four focused Chrome cases pass: one normal Search refusal plus the same
  unavailable-package denial and recovery at all three resolutions.
- The Home, representative-surface, Search, OCR-A structural, and OCR-A
  platform-fallback artifacts were regenerated against the new launcher build.
  All five strict validators and their eleven adversarial groups pass.
- The complete root test command and workspace production build pass, followed
  by all seventy-one Playwright cases.

### Remaining boundary

I-098/Q-056 remain active. No signed package, native host, package runtime,
gameplay, physical TV/controller, or target Linux environment was qualified.
STV-004 still needs destructive-settings activation and denial. STV-001
through STV-003 still own default density, query/localization, and no-result
recovery policy.

## 2026-07-24: Native cgroup-v2 restart cleanup candidate

### Delivered

- Added an unwired Linux-only implementation of the existing privileged
  restart-cleanup adapter using the kernel's recursive `cgroup.kill` and
  `cgroup.events` contract.
- Bound cleanup to retained descriptor-relative, no-follow control handles so
  replacing the configured scope path after construction cannot redirect the
  kill or empty inspection.
- Made the adapter single-use and bounded its evidence to 512 bytes, 256
  inspections, 250 ms between inspections, and five seconds total sleep.
  Missing, duplicate, malformed, non-UTF-8, nonempty, timed-out, unavailable,
  or reused evidence cannot create an empty-scope proof.
- Recorded D-179 and Q-247 without selecting a systemd service, scope
  lifecycle, process attachment/escape policy, replay binding, polling
  default, mount permissions, or target support.

### Verification evidence

- Two portable tests cover strict policy and parser bounds.
- Four Ubuntu WSL2 tests cover exact one-shot kill/empty proof,
  nonempty/malformed denial, single-use refusal, path replacement, relative
  paths, missing controls, and symlink controls.
- Focused Windows and Linux tests pass, with strict Linux library Clippy clean.

### Remaining boundary

I-209 remains active. WSL2 is development compatibility only and the fixtures
are regular files, not a delegated live cgroup. The adapter is not wired.
Q-247 still requires exact systemd units/identities, atomic child attachment,
anti-escape and anti-entry enforcement, durable scope/barrier binding,
production polling behavior, cleanup/removal, hostile-descendant evidence,
and qualification on ordinary x86-64 Linux and Raspberry Pi OS.

## 2026-07-24: Search destructive-settings denial

### Delivered

- Made the Unassigned progress permanent-delete review fail safe by default:
  Cancel is the initially focused action, while the destructive confirmation
  retains its separate exact control.
- Added the exact `delete local progress` Search state at 720p, 1080p, and 4K
  with one result, five marked critical-text nodes, two marked actions, no
  overlap or overlay overflow, and the candidate TV geometry floor.
- Proved keyboard activation opens the exact synthetic Unassigned progress
  route with Obstacle focused. The permanent-delete review discloses no
  backup, export, cloud copy, migration, or undo and states that no filesystem
  mutation occurs.
- Proved controller Back denies the deletion, preserves all four entries,
  restores focus to `Delete permanently`, and a second Back returns to focused
  Profiles navigation at all three resolutions.
- Expanded the strict Search artifact to eight states, twenty-four
  observations and screenshots, seven distinct queries, and five activation
  classes. The recommended STV-004 desk sequence is now covered without
  claiming a real destructive storage operation.

### Verification evidence

- Four focused Chrome cases pass: one normal destructive denial plus the same
  activation, safe-default, retained-entry, and recovery path at all three
  resolutions.
- Svelte reports zero errors and warnings.
- The Home, representative-surface, Search, OCR-A structural, and OCR-A
  platform-fallback artifacts were regenerated against the new launcher build.
  All five strict validators and their eleven adversarial groups pass.
- The complete root test command and workspace production build pass, followed
  by all seventy-five Playwright cases.

### Remaining boundary

I-098/Q-056 remain active. No filesystem deletion, native save broker,
destructive persistence, restart/power-loss recovery, physical TV/controller,
or target Linux environment was qualified. STV-001 through STV-003 still own
default density, query/localization, and no-result recovery policy, and
STV-004 remains an owner selection rather than a final product decision.

## 2026-07-24: Native cgroup-v2 OOM evidence candidate

### Delivered

- Added an unwired Linux health probe that retains the exact hierarchical
  cgroup-v2 `memory.events` control and baselines canonical `oom_kill` before
  each watchdog attempt.
- Reports `out-of-memory` only when the kernel counter increases. Counter
  reversal, missing reset, duplicate/missing/overflowing counters, malformed
  or non-UTF-8 state, symlinks, unavailable controls, and documents above
  1,024 bytes fail closed.
- Added a terminal resource-fault hook so trusted OOM evidence observed with a
  reaped child takes precedence over a generic process-exit reason. The
  default remains no terminal fault, and the fixed file probe inspects only
  its separate fault token rather than heartbeat state.
- Recorded D-180 and Q-248 without selecting memory limits, group-kill,
  service/cgroup attachment, restart entitlement, user messaging, GPU
  evidence, or target qualification.

### Verification evidence

- Four portable tests cover strict memory-events parsing, fixed terminal
  fault tokens, invalid terminal evidence, and OOM precedence over a nonzero
  process exit.
- Four Ubuntu WSL2 tests cover per-attempt baselines, heartbeat coexistence,
  OOM increase, counter reversal, malformed state, retained-handle path
  replacement, relative paths, missing controls, and symlink controls.

### Remaining boundary

I-109/I-209 remain active. The adapter is unwired and regular-file WSL2
fixtures do not inject kernel OOM. Q-247/Q-248 still require exact systemd
scope creation, atomic attachment and anti-escape/entry rules, memory
controller/limit/group policy, non-reuse, recovery selection, real target OOM
and hostile-descendant campaigns, and separate qualified GPU evidence.

## 2026-07-24: Search no-result recovery

### Delivered

- Replaced the no-result dead end with one explicit Clear search action and
  fixed Motion, System, and Settings shortcuts. Every shortcut remains an
  exact local substring query; no fuzzy, remote, personalized, or hidden-entry
  suggestion path was added.
- Added controller-safe focus behavior: ArrowDown from the empty result input
  reaches Clear search, clearing restores the current 18-result empty query
  with input focus, and selecting Motion produces five results with Obstacle
  focused.
- Expanded the strict no-result state at 720p, 1080p, and 4K from four to nine
  marked critical-text nodes and from one to five marked actions. All remain
  within the candidate TV geometry floor with no overlap or overlay overflow.
- Bound exact recovery evidence into every resolution: clear label/query/count
  and focus, category label/query/count, first result/title/focus, Escape, and
  exact Search-opener restoration.
- Kept STV-001 and STV-003 open. The current 18-result clear destination and
  three fixed categories are reversible prototype behavior, not final density,
  taxonomy, spelling, ranking, or localization policy.

### Verification evidence

- Four focused Chrome cases pass: one normal no-result recovery flow plus the
  same geometry, Clear, Motion, first-result focus, and Back recovery at all
  three resolutions.
- Svelte reports zero errors and warnings.
- The Home, representative-surface, Search, OCR-A structural, and OCR-A
  platform-fallback artifacts were regenerated against the new JavaScript and
  CSS production resources. All five strict validators and their eleven
  adversarial groups pass.
- The complete root test command and workspace production build pass, followed
  by all seventy-six Playwright cases.

### Remaining boundary

I-098/Q-056 remain active. Final empty-query density, category taxonomy,
arbitrary/localized queries, spelling and fuzzy recovery, physical
TV/controller behavior, target Linux, and every game remain unqualified.
STV-001 through STV-003 remain owner decisions.

## 2026-07-24: explicit hosted-browser initial readiness

### Delivered

- Removed the live runner's false `Page.loadEventFired` to `ready` transition.
  Allowed load now emits only `document-loaded`.
- Required one fixed top-level `html[data-vcg-ready="1"]` claim before `ready`;
  the selector/value are host code and cannot be weakened by manifest input.
- Bound navigation, initial load, and readiness polling to one remaining
  monotonic launch deadline. Missing readiness returns stable
  `EXPLICIT_READY_TIMEOUT`, stops the browser, and makes the CLI fail.
- Added bounded boolean producer checks, exact polling success, and no-marker
  timeout tests while preserving Epoch as explicitly load-only evidence.
- Recorded D-182 and Q-250 without claiming post-ready heartbeat, hang/login/
  offline recovery, compositor focus, playability, or target qualification.

### Verification evidence

- All 22 focused supervisor cases pass, including three readiness cases and
  the real Chrome 150 navigation/popup/download containment probes.
- A new immutable Epoch v3 successor binds the changed supervisor source while
  preserving the load-only/no-playability boundary; its strict validator and
  eight mutation cases pass without overwriting v1 or v2.
- Complete TypeScript and Svelte workspace typechecking passes with zero
  Svelte errors or warnings.

### Remaining boundary

I-180 remains active. Q-250 must select the reviewed signed wrapper, per-game
deadline, post-ready challenge/recovery contract, login/offline states, and
target timing. Native/service/cgroup/compositor authority and ordinary
x86-64/ARM64 Linux qualification remain required.

## 2026-07-24: persistent native diagnostic data-exclusion integration

### Delivered

- Added a qualification-only Rust example that materializes the actual
  bounded `NativeDiagnosticStore` with one fixed closed code from every
  producer and accepts no diagnostic text, identity, or payload.
- Added an I-186 integration that inventories the complete released
  13-file/15-entry layout, requires every file to stay bounded, scans it twice
  for a repeatable path-free commitment, and rejects five synthetic field
  canaries, two stable vault path segments, and an exact seeded-source digest.
- Added a separate materialized positive tree that must find all eight signal
  IDs without disclosing canary or path values.
- Recorded D-181 and Q-249 without adding native export authority or claiming
  production support, crash, RAM/swap/core, target, or general
  personal-information absence.

### Verification evidence

- The ten reusable verifier-contract cases, native persistent-store
  integration, and existing volatile browser-export integration pass through
  `pnpm validate:data-exclusion`.
- The native integration covers all six closed producer types and invokes the
  actual Rust persistence code through a disposable host fixture.

### Remaining boundary

I-186 remains active. Production producer wiring, exact quiesced/read-only
materialization, signed evidence envelope, support/export/crash inventory,
RAM/swap/core-dump policy, target filesystem faults, and Raspberry
Pi/ordinary-Linux evidence remain under Q-155 through Q-158 and Q-249.

## 2026-07-24: tracker worker runtime-crash recovery

### Delivered

- Made every live worker inference fault, uncaught runtime error, and
  frame-transfer failure discard the poisoned worker backend before exposing
  the existing blocked `backend-fault` state.
- The fault path now releases and resets one-frame backpressure, advances the
  run identity, stops every camera track, clears the video source, removes
  worker listeners, terminates the worker, and restores the explicit Start
  Camera control.
- Each asynchronous frame transfer is bound to the worker and run that started
  it, so completion after a stop, fault, or retry cannot feed a stale frame to
  the replacement backend.
- An explicit retry constructs a new worker rather than reusing the failed
  backend. Worker initialization failure still enters the already disclosed
  landmarks-only main-thread fallback.
- Kept automatic retry and repeated-crash policy open in
  `OWNER_QUESTIONS_TRACKER_WORKER_RECOVERY_2026-07-24.md`; no runtime fault can
  silently resume motion authority.

### Verification evidence

- A real Chrome case starts the pinned live worker, injects an uncaught
  exception inside that worker, observes the blocked fault and enabled retry,
  proves retry creates a distinct worker that reaches Ready, and proves a
  frame transfer held across the fault is closed rather than posted to the
  replacement worker.
- The normal worker lifecycle, unavailable-worker fallback, and runtime-crash
  retry cases pass together.
- All 232 console unit tests pass, and Svelte reports zero errors and warnings.
- The complete root test command and workspace production build pass, followed
  by all seventy-seven Playwright cases.

### Remaining boundary

I-208 remains active. Synthetic browser-camera evidence does not qualify real
camera faults, repeated crashes, automatic recovery, UI responsiveness under
load, exposure timestamps, native-process comparison, target x86-64 Linux, or
Raspberry Pi. Product retry ceilings and fallback timing remain owner
questions.

## 2026-07-24: remote-game cold offline browser restart

### Delivered

- Preserved the existing 26-title v1 same-context observation as immutable
  history and added a v2 successor with one separate persistent profile per
  title.
- Primed every persistent profile through two online loads, cleanly closed
  Chrome, relaunched the exact same profile with context-level offline mode set
  before navigation, cleanly closed again, and verified profile removal.
- Kept the persistent-profile evidence bounded to browser-state names/counts,
  stable load errors, and aggregate request/response/failure counts; no
  storage values, cookies, request paths, queries, bodies, messages, or direct
  identifiers enter the artifact.
- Extended the closed validator and mutation suite for exact restart,
  offline-before-navigation, cleanup, request-count, and hidden-value refusal.
- Preserved the input, service, candidate-ledger, and runtime-scorecard v1
  artifacts, then generated v2 successors in dependency order so every
  downstream provenance edge binds offline v2 without rewriting history.
- Corrected two live-evidence validators that falsely required a UTC timestamp
  to share the Pacific evidence-date calendar day; both now require exact
  canonical UTC ISO timestamps.

### Verification evidence

- All 26 titles completed both persistent-profile online loads and every
  close/restart/profile-removal step.
- Block-You alone loaded a complete worker-controlled document after the cold
  offline restart; the other 25 returned
  `net::ERR_INTERNET_DISCONNECTED`.
- The same three manifests, one active worker, two caches, one same-context
  offline load, and all six meaningful manifest/worker byte identities remain
  consistent with v1.
- The strict validator reports 26 games, one cold-restart document load, zero
  offline packages qualified, and all nine adversarial groups passing.
- Input v2 retains 26 loads, five neutral Gamepad API signals, and zero input
  qualifications; service v2 retains 23 exact-source screens and zero
  degradation/offline qualifications; ledger v2 retains 26 blocked entries
  and zero authority; runtime scorecard v2 retains 20 unqualified target cells
  and zero payload selections. Their 8/9/8/9 adversarial groups all pass.
- The complete root test gate passes through all evidence validators, 164
  research tests, every package suite, and all 232 console tests. Workspace
  typechecking reports zero Svelte errors/warnings, and the production build
  passes.

### Remaining boundary

I-096 remains active. A cached restarted document is not complete offline play
or a signed package. RGO-003 and Q-051 still require ordinary gameplay/assets,
input/audio, save/reset/quota/cache deletion, mixed-version update/rollback,
source-to-deployment identity, hosted-service behavior, rights, operating-
system network isolation, controller/recovery, and both target architectures.

## 2026-07-24: controller-safe curated community discovery

### Delivered

- Kept the existing canonical, detached-signature, exact-generation
  `vcg-community-discovery/v1` feed and URL-free approved-family projection as
  the only input to a new pure discovery controller.
- Required the exact privately branded projection; clones, deserialized
  copies, plain objects, and unverified projections fail before navigation or
  action planning.
- Tightened the feed's safe disclosure boundary so invisible Unicode control
  and formatting characters fail, remote-web records must be hosted and
  network-required, non-remote runtimes must be installed, and offline
  records cannot claim an external service boundary.
- Added bounded browse focus, clamped Previous/Next, Select-to-detail,
  detail-to-browse Back, collection exit Back, host-owned Home disposition,
  and deterministic empty-feed behavior.
- Bound Launch and Report to one exact frozen intent carrying the current
  catalog generation, game, version, and opaque host identifiers. Only the
  same controller may dispatch the same object once.
- Consumed an intent before invoking the host callback, preventing reentrant
  replay. Replacement planning, navigation, cloned objects, another
  controller, and feed refresh invalidate the old intent.
- Accepted feed replacement only from another exact verified family
  projection with a strictly greater generation. Same-generation
  substitution and rollback fail; a successful refresh returns to browse,
  preserves focus only for a still-approved game, and removes a disabled or
  revoked current game and action together.
- Reused the existing dedicated CCD-001 through CCD-009 owner-question
  register. This tranche introduced no additional owner choice.

### Verification evidence

- Thirteen focused community-discovery cases now cover the signed projection,
  unsafe metadata and authority exclusion, deterministic navigation and empty
  state, exact one-shot launch/report dispatch, clone/cross-controller/
  superseded/reentrant refusal, navigation invalidation, and forward-only
  emergency refresh.
- All nineteen `@vcg/launcher-catalog` tests pass.
- Package TypeScript typechecking passes.
- Refreshed the OCR-A structural/platform-fallback and launcher
  home/representative/Search provenance artifacts from an isolated snapshot
  containing exactly HEAD plus this tranche.
- Full workspace `pnpm typecheck`, `pnpm test`, and `pnpm build` pass in that
  isolated snapshot.

### Remaining boundary

I-106 advances from open to active but does not close. This is a pure
controller model, not a rendered or native-authoritative surface. Production
feed keys, protected generation state, acquisition/offline expiry, admission
publication, native installed-catalog and hosted-origin joins, controller and
accessibility UI, report/removal/emergency operations, cross-surface bypass
tests, runtime containment, target Linux evidence, and one actually reviewed
community release remain under CCD-001 through CCD-009.

## 2026-07-24: versioned monochrome visual-token contract

### Delivered

- Added a closed immutable `visual-tokens` v1 contract and applied its exact
  version plus default cyan accent to the document root before application
  rendering.
- Bound the production stylesheet to named shell font, surface, spacing, grid,
  48 CSS-pixel control, focus, motion, fault, standard accent, and
  high-contrast accent tokens without changing the intended default visual
  result.
- Added exact cyan, amber, and violet standard/high-contrast candidate pairs.
  Unknown accent values fail before root state changes, and only one accent is
  active at a time.
- Tokenized the shared grid, focus outlines, representative control floors,
  view/feedback/progress/ambient motion, and retained both system and explicit
  reduced-motion paths.
- Documented the semantic fault exception, redundant-state rules, evidence
  boundary, remaining target work, and VTS-001 through VTS-006 owner choices.

### Verification evidence

- Five focused tests bind the immutable TypeScript contract to exact
  production CSS values, reject unknown accents, require root version/accent
  markers, enforce at least 7:1 accent-to-ink ratios, retain paper/ink and
  muted/panel contrast floors, and require redundant focus, minimum-control,
  grid, and reduced-motion rules.
- All 237 console-lab tests pass; focused console-lab typechecking reports zero
  Svelte errors or warnings, and the production application build passes.
- Refreshed seven exact OCR-A, legacy/launcher TV, and runtime-scorecard
  artifacts plus the two frozen build-resource validators from an isolated
  snapshot containing exactly HEAD and this tranche. The 39 tracked TV
  screenshots remained pixel-identical.
- Full workspace `pnpm typecheck`, `pnpm test`, and `pnpm build` pass in that
  isolated snapshot.

### Remaining boundary

I-148 advances from open to active but does not close. Computed sRGB contrast
and Windows browser regressions are not target-TV or participant evidence.
Representative state audit, fallback/icon qualification, actual accent/fault
policy, sound and illustration systems, seating-distance and
low-vision/color-vision testing, child/adult comprehension, animation/GPU
measurement, both reference tiers, release review, Q-077, I-206, and
VTS-001 through VTS-006 remain.

## 2026-07-24: hosted-game post-ready liveness candidate

### Delivered

- Added immutable desk policy v1 for one-second top-level challenges,
  two-second acknowledgement deadlines, and termination after two consecutive
  unavailable probes.
- Added a fixed non-manifest-selected
  `globalThis.vcgHostedLifecycleV1.acknowledgeChallenge` wrapper boundary.
  Each probe carries a fresh random 128-bit lowercase-hex value, uses no user
  gesture, and accepts only the exact current value.
- Added distinct stable terminal results for an initially missing contract, a
  contract lost after a valid acknowledgement, a wrong/malformed/throwing
  acknowledgement, and bounded consecutive timeouts. Results expose only
  counts, never challenge values or page exceptions.
- Wired every liveness failure through the existing browser stop, process-tree
  ownership, and ephemeral-profile removal path with no automatic restart or
  page-selected recovery.
- Recorded D-183 and HBL-001 through HBL-006 without treating a JavaScript echo
  as rendering, focus, playability, login/network health, containment, or
  target qualification.

### Verification evidence

- Four new focused cases cover policy immutability/bounds, missing versus lost
  contracts, invalid/replayed/malformed acknowledgements, exact fresh echoes,
  consecutive-miss reset, transport failure, and unresolved acknowledgements.
- All 26 hosted-browser supervisor cases pass.
- Installed Chrome 150 runs four fresh-profile probes: the existing forbidden
  navigation, popup, and download terminations plus a new production-CDP
  exact-echo probe. Every owned browser exits cleanly and every profile is
  removed.
- Captured and validated versioned Epoch top-level-load evidence v4 against
  the changed supervisor. The artifact remains explicitly load-only and
  claims zero readiness, liveness, play, controller, or participant tests.
- Focused TypeScript checking for the supervisor, tests, and command passes.
- In an isolated snapshot containing exactly HEAD plus this tranche,
  workspace typechecking passes, all 62 workspace test files and 575 tests
  pass through `pnpm -r test`, and the full production build passes.
- The root `pnpm test` evidence chain reaches the pre-existing runtime-payload
  scorecard after the hosted-browser and preceding evidence validators pass,
  then stops because committed raw SHA-256 expectations for
  `action-engine.ts` and `main.ts` do not match the normalized Windows
  checkout. No liveness assertion fails at that boundary; the unrelated raw
  line-ending commitment remains unresolved rather than being rewritten here.

### Remaining boundary

I-180 remains active. The wrapper is synthetic and unbound to signed hosted
admission; the fixed timings are desk candidates. Exact reviewed wrappers,
deployment/release binding, service/login/offline status, controller-safe
recovery overlay, restart policy, overlay/suspend semantics, compositor-owned
Home/Back/Pause and focus, browser/version policy, native service/cgroup
ownership, adversarial main-thread/service-worker/storage/network evidence,
and ARM64/ordinary x86-64 Linux timing remain under Q-250 and HBL-001 through
HBL-006.

## 2026-07-25: deterministic calibration-rehearsal evidence

### Delivered

- Advanced I-059 from open to active by binding the existing camera-free
  calibration controller, focused tests, and contract to one deterministic
  adversarial evidence artifact.
- Exercised eight exact scenarios: full Ready, required floor guidance,
  unsafe-zone blocking, explicit neutral/range fallback, changed-room
  revocation, stale-attempt refusal, exact one-shot result consumption, and
  expiry revocation.
- Repeated the entire scenario set twice and committed the exact scenario
  digest while labeling that result as software determinism rather than
  physical repeatability.
- Added a strict bounded validator that rejects production/safety promotion,
  hidden camera/participant/measurement claims, weakened guidance or
  blocking, widened fallback, authority substitution/replay, fabricated
  physical results, stale provenance, unknown fields, invalid UTF-8, and
  oversized artifacts.
- Recorded Q-251 for the independent physical references, equipment, and room
  protocol needed to establish ground truth before threshold selection. No
  purchase or participant/camera campaign was authorized.

### Verification evidence

- The tracked artifact contains eight scenarios, eight passing closed guards,
  two exactly equal deterministic runs, zero physical trials, zero gameplay
  error measurements, and zero room-change detection trials.
- Ten focused validator cases pass.
- All fourteen existing calibration-controller cases pass.
- In an exact isolated snapshot containing HEAD plus only this tranche, pinned
  Corepack pnpm 10.30.3 reports zero TypeScript/Svelte diagnostics, all 190
  research-evidence tests pass, all 63 workspace test files and 584 tests
  pass, exact prepared OCR-A/model/WASM assets verify, and the production
  build passes without the missing-font warning.
- The root `pnpm test` chain passes the hosted-browser, Epoch, Godot, bridge,
  and base TV validators, then stops in the pre-existing launcher-home TV
  validator because its committed production-source-tree digest does not
  match the raw Windows checkout. The isolated research suite and workspace
  tests pass independently; no calibration assertion fails at that boundary.

### Remaining boundary

I-059 is active, not closed. The artifact proves a bounded synthetic state
machine only. Actual floor/zone/scale/stance/range estimation, independent
ground truth, confidence calibration, physical repeatability and gameplay
error, privileged room/camera change detection, per-action requirements,
representative accessibility and household cohorts, persistent native
transactions, target fault evidence, and safety/privacy/security/legal review
remain under Q-031 and Q-205 through Q-210 plus Q-251.

## 2026-07-25: pose edge-accuracy campaign contract

### Delivered

- Advanced I-035 from open to active with an exact blocked plan for MediaPipe
  core-17 landmark accuracy at the center, four quarters, and four distortion
  edges.
- Froze two separate blocking personas, seven postures, 20 valid trials in
  each of 126 ordered cells, and a 2,520-trial blocking total. Seated evidence
  remains exploratory and cannot rescue a blocking cell.
- Bound the repository's canonical unmirrored normalized image coordinate
  system, pixel-space Euclidean error, and shoulder-midpoint-to-hip-midpoint
  ground-truth normalization so camera aspect ratio cannot silently alter the
  metric.
- Added a strict bounded plan/result validator. It requires exact camera,
  room, placement, persona, ground-truth, timestamp, and data-handling digests
  before collection; exact plan hashing; independent labels; per-landmark
  missing/error/outlier accounting; per-cell gates; and an exact derived
  summary with no aggregate rescue.
- Kept raw room video, retained raw frames, participant identifiers, and free
  text out of the release boundary. A ready manual-label plan must explicitly
  authorize its temporary image workflow and still release skeleton-only
  evidence.
- Recorded Q-252 for pre-collection accuracy gates and operational placement
  geometry, and Q-253 for temporary image consent, protection, retention, and
  verified deletion authority.

### Verification evidence

- The tracked plan validates as blocked with 126 required cells, 2,520 valid
  trials, five explicit blockers, null acceptance thresholds, and no camera,
  participant, ground-truth, data-handling, or result authority.
- Fourteen focused tests cover the blocked and ready states, LF/CRLF plan
  identity, a complete passing result, matrix/trial weakening, hidden blocked
  values, ground-truth substitution, noncanonical/malformed/oversized input,
  forged hashes, missing/duplicate/reordered cells, landmark accounting,
  non-monotonic statistics, aggregate rescue, honest failure, summary drift,
  and prohibited retained material.

### Remaining boundary

I-035 is active, not closed. No camera, participant, room, target, physical
trial, independent label, threshold, scorer, or result exists. The validator
checks the plan/result admission envelope and derived accounting; the future
detached-artifact scorer must independently recompute landmark statistics.
Exact equipment and physical references remain under Q-251, accuracy and
placement decisions under Q-252, and any temporary image workflow under
Q-253. This work establishes no action, latency, calibration, floor-contact,
identity, accessibility, safety, population, or production qualification.

## 2026-07-25: executable microSD qualification envelope

### Delivered

- Advanced I-022 from a prose-only pre-registration boundary to a canonical
  blocked machine-checkable umbrella plan without authorizing a purchase,
  write, power cut, corruption injection, or recovery-media operation.
- Bound the existing SanDisk High Endurance 256GB candidate facts while
  leaving the quoted `AN6IA` versus manufacturer-listed `GN6IA` relationship
  unresolved. A ready plan must approve exactly one named part boundary and
  cannot add a silent substitute.
- Froze nine ordered qualification phases spanning intake, destructive
  capacity, final image, console workload, full disk, power cuts, corruption,
  blank-card recovery, and accelerated endurance/drift.
- Added exact per-card power-cut accounting for valid pass, valid fail,
  harness-invalid, and not-run trials. The four counts must equal the frozen
  schedule; at least 200 valid cuts per card are required; invalid cuts never
  count as valid; a valid failed cut derives rejection; and not-run or
  insufficient-valid coverage derives incompleteness.
- Added a service-write target derived from projected host writes times a
  pre-registered margin, exact capacity and p95 performance gates, opaque
  eight-hex card/lot IDs, and five immutable zero ceilings for media/filesystem
  errors, committed corruption, unverified/uncommitted launches, unauthorized
  reclamation, and recovery failures.
- Derived qualified, rejected, and incomplete conclusions from every tested
  card, independent lot, retained control, phase, fault ledger, endurance,
  capacity, and performance row. Averages, extra good cards, advertised video
  endurance, or desktop throughput cannot rescue one failed card.
- Added `OWNER_QUESTIONS_MICROSD_ENVELOPE_2026-07-25.md` without answering or
  widening Q-193 through Q-196.

### Verification evidence

- The tracked plan validates as blocked with nine exact phases, seven
  blockers, null part/cohort/service/performance gates, false purchase and
  destructive-test authority, and no physical result.
- Seventeen focused tests cover blocked and ready plans, LF/CRLF identity, a
  complete three-card/two-lot qualification, part substitution, hidden
  authority, safety-gate weakening, phase drift, policy key reordering,
  sensitive fields, malformed/oversized input, forged plan hashes, incomplete
  cohort/control evidence, every-card failure, power-cut derivation,
  harness-invalid exclusion, unrun and unfinished endurance, capacity/write
  under-run, opaque IDs, duplicate cards, summary drift, and retained data.
- In an exact isolated snapshot containing current HEAD plus only this tranche,
  pinned Corepack pnpm 10.30.3 passes all 236 research-evidence tests, reports
  zero TypeScript/Svelte diagnostics, passes all 63 workspace test files and
  595 tests, verifies the pinned OCR-A/model assets and copies the pinned WASM
  runtime, and completes the production build.

### Remaining boundary

I-022 is active, not closed. The validator checks a bounded admission and
conclusion envelope; it does not authenticate physical logs behind digests or
prove any card behavior. Q-193 through Q-196 still control part equivalence,
cohort/purchase/destructive authority, service horizon and margin, and
failure/retest/fallback policy. I-162 and I-202 retain the physical build,
workload, hundreds-cut, corruption, full-disk, recovery, and endurance work.
I-021 remains a separate qualification if a valid microSD failure invokes it;
no USB SSD has been selected or qualified.

## 2026-07-25: no-purchase ABS project-box candidate screen

### Delivered

- Advanced I-196 from an unbounded sourcing task to a dated, primary-source
  comparison of exact Polycase `WA-36*16`, `WA-25*16`, and `WA-40*16` ABS
  parts without selecting, ordering, reserving, or cutting a box.
- Recorded quantity-one merchandise price, page stock label, external and
  approximate internal dimensions, nominal wall thickness, material and
  ratings separately from still-unknown shipping, tax and delivered price.
- Named `WA-40*16` as the least-constrained CAD/cardboard candidate and kept
  `WA-25*16` as the low-profile comparison. This is a work-ordering judgment,
  not a hardware or purchase decision.
- Compared only an optimistic 102 x 83 mm bare Pi/camera footprint lower bound
  and explicitly excluded the camera jig, shutter, cables, connectors, cooler,
  HAT stack height, bosses, vents, fasteners and safety margins from any fit
  claim.
- Removed I-196's stale reference to absent Q-021 and registered Q-254 through
  Q-256 for the exact camera assembly, numeric fit/thermal/RF/stability gates,
  and destination/purchase authority.

### Verification evidence

- Every price, stock label, dimension, wall, material and rating entry links to
  the dated manufacturer page; component lower bounds link to the Raspberry Pi
  and Logitech primary sources.
- The merchandise-to-delivered-price equation remains explicit: shipping and
  tax are `TBD` because Polycase calculates shipping only after a
  destination-aware cart.
- The fit packet enumerates the drawing/STEP, received-revision, CAD,
  cardboard, routing, thermal, safety, center-of-gravity, nonslip, quote and
  pre-cut artifacts still required.

### Remaining boundary

I-196 is active, not closed. No exact camera assembly, installed stack,
connector keep-out, bend radius, jig, cutout, vent, fastener, thermal result,
radio result, center of gravity, tip/slip result, delivered quote, purchase
authority, box, physical mockup or cut plan exists. The catalog screen proves
neither fit nor safety, and IP/NEMA catalog ratings are not claimed to survive
modification.

## 2026-07-25: source-pinned Pi 5 and Hailo image recipe boundary

### Delivered

- Advanced I-157 from an unpinned future image to a strict blocked plan that
  names the exact 2026-06-18 Raspberry Pi OS Trixie desktop artifact, download
  URL, nominal kernel family and published compressed SHA-256.
- Pinned Hailo Apps release `26.03.1` to tag object `8887f605...` and peeled
  commit `891ce701...`; recorded HailoRT 4.23 and TAPPAS Core 5.1.0 only as the
  release guide's Hailo-8/Hailo-8L candidate families.
- Left received hardware, firmware, exact camera/UVC path, locally verified
  image hashes, apt/Python inputs, installed Hailo tuple, HEF/resources/compiled
  post-processor, browser/VCG/build and data-exclusion hashes null.
- Froze eight blockers and false download, build, removable-write and
  destructive-test authority. Added a ten-row boot-capture contract and nine
  prohibited image-data classes.
- Added Q-257 for the desktop-versus-Lite and exact graphical-stack decision;
  retained Q-087 for immutable Hailo inputs and Q-254 for the camera tuple.

### Verification evidence

- Ten focused tests accept the tracked blocked plan and reject base-image or
  Hailo substitution, fabricated hardware/camera identity, populated
  unverified hashes, hidden authority, blocker drift, extra/sensitive keys,
  weakened capture/boundary claims, malformed UTF-8, BOM, oversize, duplicate
  and noncanonical JSON.
- The source commit was independently resolved with `git ls-remote`; both the
  tag object and peeled commit are recorded so a moving branch is never an
  installation input.
- The recipe separates immutable input admission, target build/capture and
  qualification/recovery, including offline cold rebuild and blank-card
  recovery rather than treating one successful boot as appliance evidence.

### Remaining boundary

I-157 is active, not closed. No large image download, tag-signature
authentication, package cache, image build, card write, Pi boot, Hailo device,
camera, runtime/model load, offline run, update, rollback or recovery test was
performed. The published compressed hash has not been locally recomputed and
the source pins do not establish installed compatibility, performance,
playability, privacy, thermal behavior, storage durability or release fitness.

## 2026-07-25: strict Hailo 13 TOPS versus 26 TOPS comparison plan

### Delivered

- Advanced I-158 from an unbounded benchmark request to a canonical blocked
  plan for exact 13 TOPS Hailo-8L/YOLOv8s Pose and 26 TOPS
  Hailo-8/YOLOv8m Pose variants on one Raspberry Pi 5 8GB host boundary.
- Separated literal same-byte paired replay from counterbalanced live sessions
  and sustained concurrent game load. Replay timing cannot be reported as
  camera-exposure timing, and repeated live human motion is not called
  identical input.
- Froze required accuracy, action, timing, drops, pose/game FPS, resource,
  wall-power, thermal, throttle, recovery and delivered-cost measurements
  across idle, obstacle and three compatibility-game workloads.
- Retained D-110's 120 ms live exposure-to-action p95 ceiling, zero privileged
  false activations, every-cell pass and no aggregate rescue. All other
  qualification/value thresholds remain null pending Q-259.
- Retained D-041's 26 TOPS baseline, prohibited automatic selection and
  required a superseding decision for any replacement.
- Added Q-258 for an authorized identical-input corpus and Q-259 for all
  remaining pre-result qualification and value thresholds.

### Verification evidence

- The plan binds normalized SHA-256 values for the Pi image, Hailo-versus-
  MediaPipe and pose edge-accuracy plans.
- Ten adversarial tests accept the tracked zero-result artifact and reject
  source/model/host substitution, hidden received values, replay/live claim
  collapse, matrix or metric drift, weakened gates, unauthorized collection or
  purchase, premature results, extra fields, malformed UTF-8, BOM, duplicate,
  oversized and noncanonical JSON.
- The plan keeps raw replay retention, live raw-frame retention, audio,
  participant identifiers and free text unauthorized; release evidence remains
  skeleton-only.

### Remaining boundary

I-158 is active, not closed. No 13 TOPS or 26 TOPS HAT was accessed, received,
purchased, borrowed, installed, run or measured. No corpus, participant
session, HEF, runtime tuple, exposure timestamp, accuracy, action, latency,
FPS, resource, power, thermal, game, price or recovery result exists. The plan
does not prove either variant compatible, qualified or better value.

## 2026-07-25: strict concurrent tracker and game workload plan

### Delivered

- Advanced I-159 from an unbounded sixty-minute request to a canonical blocked
  plan for the selected Pi 5 8GB plus 26 TOPS Hailo lane and the exact current
  obstacle, VibeBots, Mi Casa Es Su Casa and Determined workload boundaries.
- Required a five-minute warmup followed by one uninterrupted 3,600-second
  measured soak per workload with continuous camera/tracker activity,
  representative audio and one-second telemetry. One run remains first-soak
  evidence, not a reliability-rate estimate.
- Preserved D-113: only the obstacle sample consumes Motion actions. A separate
  versioned qualification client may measure tracker latency while a hosted
  compatibility game runs, but cannot establish title motion integration,
  controller playability, service correctness, focus or visible response.
- Froze thirteen measurement groups spanning timestamp proof, latency,
  action quality, pose/game FPS, drops, frame pacing, resources, power,
  thermals, acoustics, process health, services, recovery and exact digests.
- Retained D-106/D-108/D-110 launch, acoustic and latency gates; required zero
  privileged false activations, zero unrecovered failures, zero unexpected
  soak exits, every-cell pass and no aggregate rescue.
- Added Q-260 for per-title hosted activity/account/service evidence authority
  and Q-261 for all remaining sustained thresholds, fault counts and recovery
  ceilings.

### Verification evidence

- Eight stable source bindings cover the three current catalog manifests,
  obstacle component, action engine, hosted supervisor, blocked Pi image plan
  and blocked Hailo accelerator plan without binding another agent's active
  launcher/evidence files.
- Eleven focused adversarial tests accept the tracked blocked plan and reject
  source, hardware/model/clock, workload/version/network/motion-role, duration,
  claim-boundary, metric/gate, fault, authority, result, schema and encoding
  substitutions.
- The existing 256-test research suite also passes. The new focused test is
  wired into that suite separately by the package integration in this tranche.

### Remaining boundary

I-159 is active, not closed. No exact target hardware, qualified image/runtime,
trusted exposure clock, immutable hosted session, activity script, participant,
Motion qualification client, monitoring calibration, target supervisor,
compositor-owned recovery, sixty-minute soak, fault attempt or result exists.
The plan establishes no load, readiness, liveness, playability, focus,
latency, accuracy, performance, thermal, acoustic, recovery or platform claim.

## 2026-07-25: refreshed Hailo core17 versus MediaPipe richer-profile boundary

### Delivered

- Advanced I-161 from an open register row to an active, source-refreshed
  blocked comparison without inventing a result path before its sample sizes,
  thresholds or execution authorities exist.
- Extended the strict plan's one-way source bindings from the Hailo projection,
  MediaPipe adapter, Motion schema and game-manifest vocabulary to the current
  Pi image recipe, pose edge-accuracy plan and exposure-to-action validator.
- Avoided a digest cycle: I-158 continues to bind I-161 and I-159 continues to
  bind I-158; I-161 does not bind either downstream plan. Both downstream
  digests were refreshed mechanically.
- Added Q-262 through Q-265 for honest Hailo Motion provenance, the trusted
  native conversion tuple, blocking participant/metric gates and the narrowly
  conditional same-exposure fanout fallback.

### Verification evidence

- Sixteen I-161 adversarial tests pass, including exact source reconstruction,
  capability/unavailable-value behavior, same-exposure/no-raw-media policy,
  timestamp authority, confusion matrices, target/runtime/persona/placement
  locks, no premature result/selection, canonical JSON and bounded parsing.
- The complete downstream I-161/I-158/I-159 focused chain passes 37 tests and
  all three command-line validators report zero attempts/results.
- The refreshed plan records the current pre-commit source revision and dirty
  worktree honestly; neither field is promoted into target-hardware evidence.

### Remaining boundary

I-161 is active, not closed. Motion `0.4.0` still has no honest Hailo source;
no trusted Hailo runtime converter, target tuple, same-exposure fanout,
participant minimum, consent, privacy/deletion audit, independent ground truth,
schedule, complete gate set, attempt, result, backend selection or richer game
profile requirement exists. Sequential live sessions and capture-arrival time
remain invalid substitutes.

## 2026-07-25: same-date Raspberry Pi accelerator quote comparison

### Delivered

- Advanced I-163 from an open row to an active, machine-checked merchandise
  comparison without claiming destination-specific shipping, tax or delivered
  totals.
- Re-observed every shared Pi 5 8GB, cooler, case, power, display-cable,
  microSD and exact Brio camera page plus the three HAT pages on 2026-07-25;
  held the shared non-HAT subtotal fixed at $456.28 across all variants.
- Verified PiShop.us is listed in Raspberry Pi's live Approved Reseller
  directory and recorded the exact official outbound reseller link.
- Recorded complete merchandise subtotals of $533.23 for 13 TOPS, $576.23 for
  26 TOPS and $656.28 for 40 TOPS. The first two retain $116.77 and $73.77 of
  shipping/tax headroom; the 40 TOPS row fails D-111 by $6.28 before delivery.
- Preserved D-041's 26 TOPS baseline and the distinction between the 40 TOPS
  INT4 generative figure and the vendor's comparable-to-26 computer-vision
  claim. No item-page number is promoted into performance evidence.
- Added Q-266 for the unresolved 13/26/40 manufacturer identifier aliases.

### Verification evidence

- The strict JSON binds the complete reference BOM and accelerator comparison
  plan, preserves all exact shared line identities and direct source URLs, and
  keeps destination, shipping, tax, delivered totals, purchase authority,
  physical/runtime qualification and selected variant null or false.
- Nine focused adversarial tests recompute all money in integer cents and
  reject source, BOM, identity, SKU, stock, price, arithmetic, delivery,
  authority, qualification, selection, 40-TOPS claim, blocker, result, schema
  and encoding drift.

### Remaining boundary

I-163 is active, not closed. Q-184 must supply non-sensitive quote jurisdiction
and evidence authority; Q-185/Q-266 must resolve exact HAT identities; Q-186
must qualify the camera/mount; and Q-259 must freeze value gates before any
selection change. No cart, checkout, approved reseller quote, delivered total,
order, receipt, physical fit, target runtime, performance result or purchase
authorization exists.

## 2026-07-25: ordinary x86-64 native-Linux premium-reference plan

### Delivered

- Advanced I-207 from an open row to a strict blocked qualification campaign
  without selecting the owned Ryzen/RTX workstation or treating its Windows and
  WSL2 evidence as native Linux.
- Bound the development-host context, prototype and offline contracts,
  exposure-to-action validator, obstacle workload, hosted supervisor and four
  representative game manifests by normalized SHA-256.
- Pre-registered seven workloads, eleven separate qualification phases, twenty
  launch trials per path, twenty action trials per cell, fifteen-minute
  negative windows, one-hour workload soaks and one hundred suspend/resume
  cycles.
- Preserved D-106 launch gates, D-110's exposure-to-game-action boundary and
  D-130's action gates while leaving unapproved FPS, frame/drop, power, thermal,
  acoustic and recovery-attempt values null.
- Added Q-267 through Q-269 for exact host selection, the native-Linux runtime
  tuple and premium performance/recovery gates. Q-203 still exclusively
  controls disk, boot, Secure Boot and installation authority.

### Verification evidence

- Twenty focused tests accept the tracked plan and reject source drift or
  substitution, hidden fields, premature target selection, Windows/WSL2/Steam
  substitution, invented Linux-image evidence, deleted workloads, weakened
  trials, false phase completion, the lower-cost 35 dBA gate, capture-arrival
  latency, disk authority, fabricated results, noncanonical JSON, UTF-8 BOM
  input and bare carriage returns.
- The command-line validator reports seven workloads, eleven phases and twelve
  blockers with no result.

### Remaining boundary

I-207 is active, not closed. No ordinary x86 host is selected; no native-Linux
image/runtime tuple, disk or installation authority, exact peripherals, room,
meters, participant/data authority, signed local package, exposure clock,
execution protocol, premium numeric thresholds, physical run, recovery result,
second rebuild or common premium comparison exists. No hardware or external
service was changed.

## 2026-07-25: cross-tier boot, resume, and launch timing plan

### Delivered

- Advanced I-023 from an open timing row to a strict blocked campaign spanning
  the required ordinary x86-64 native-Linux and Pi 5/Hailo 26 targets plus a
  separately optional Steam Machine row.
- Bound the prototype timing, accountless/offline, power-recovery, launcher,
  idle/wake, hosted-supervisor and blocked target-plan sources by normalized
  SHA-256 without binding another agent's active native files.
- Pre-registered eight exact cold-boot, warm-resume, offline-local and
  online-hosted paths with external timer starts, observable input/phase ends,
  twenty trials per target/path cell and D-106's fixed deadlines.
- Separated 320 required x86/Pi trials from 160 optional Steam trials so the
  optional row cannot rescue or block the common comparison.
- Required hardware-backed idle/wake privacy, write, update, power, controller
  and lifecycle evidence while keeping UI, process exit, first pixels, load,
  readiness and liveness outside their unsupported claim boundaries.
- Added Q-270 through Q-272 for the ordinary-PC idle strategy, cross-tier power
  and thermal gates, and the physical timing/interaction harness.
- Registered both the I-207 and I-023 focused validators in the package scripts
  and complete research-evidence suite after the concurrent microphone manifest
  tranche committed.

### Verification evidence

- Twenty-six focused tests accept the tracked plan and reject source drift or
  substitution, hidden fields, Windows promotion, target/path changes,
  premature strategy selection, invented hardware/wake evidence, relaxed
  deadlines, reduced trials, schedule drift, discarded warmups, privacy-gate
  deletion, UI-only device claims, invented power ceilings, hosted-phase
  playability promotion, optional-target rescue, physical authority, fabricated
  results, noncanonical JSON, UTF-8 BOM input and bare carriage returns.
- The validator reports three targets, eight paths, 320 required trials, 160
  optional trials and eleven blockers with no result.

### Remaining boundary

I-023 is active, not closed. No exact target/runtime, ordinary-PC strategy,
qualified power adapter, harness, interaction or hardware-state oracle, wake
source, meter, threshold, accountless local runtime, hosted-service exercise,
physical authority, trial, timing distribution, power trace or comparison
result exists. No device or external service was changed.

## 2026-07-25: cross-tier controller lifecycle qualification plan

### Delivered

- Advanced I-152 from an open physical-test row to a strict blocked campaign
  without treating browser, policy-model, Windows, WSL2 or database evidence as
  physical SDL/compositor qualification.
- Bound the existing controller protocol, mapping contract, browser and
  canonical mapping policies, idle/wake policy, timing campaign and both
  required target plans by normalized SHA-256; active native-host files remain
  outside this tranche.
- Fixed two required Linux target roles plus optional Steam, five sample roles
  and 51 individually named discovery, reconnect, sleep, simultaneous,
  ambiguous-mapping, hostile-focus and battery scenarios.
- Required at least twenty valid cycles for every applicable
  target/device/transport/revision/scenario cell, preserving invalid cycles and
  forbidding replacement of product failures or aggregate rescue.
- Fixed zero tolerance for lifecycle faults, stuck/fabricated actions,
  reserved-action leakage or swallowing, ambiguous authority, wrong assignment,
  old-epoch actions, false battery claims and keyboard/mouse recovery.
- Preserved Q-227 through Q-232 as the owner boundary; exact cell/cycle totals
  and response/freshness/sample thresholds remain null until those answers
  freeze the matrix.

### Verification evidence

- Twenty-six focused tests accept the tracked plan and reject source drift or
  substitution, hidden fields, browser/native promotion, optional-target
  rescue, invented SDL/device evidence, target/sample/scenario changes, family
  resemblance, guessed ambiguous mapping, duplicate scenarios, reduced cycles,
  failure replacement, weakened reserved gates, post-hoc thresholds, inferred
  battery, stable identifiers, physical authority, fabricated results,
  noncanonical JSON, UTF-8 BOM input and bare carriage returns.
- The command-line validator reports three targets, five sample roles, 51
  scenarios and twelve blockers with no result.

### Remaining boundary

I-152 is active, not closed. No exact device set, loan/purchase authority,
target SDL/compositor/runtime tuple, physical sample, privileged routing,
assignment/mapper/glyph/battery UI, response or freshness threshold,
applicability matrix, cycle total, schedule, ledger/result schema, fault
authority, cycle, compatibility report or public support claim exists. No
hardware was changed.

## 2026-07-25: Raspberry Pi 5 CPU-only pose plus game benchmark plan

### Delivered

- Advanced I-014 from an open benchmark row to a strict blocked campaign
  without treating the Windows MediaPipe result, selected Hailo lane, exported
  ARM64 file or advertised Raspberry Pi capability as target evidence.
- Bound the Pi image, concurrent workload, Hailo/MediaPipe provider and Godot
  export artifacts by normalized SHA-256.
- Separated immutable decoded-frame replay from the live camera pipeline so
  replay admission timing cannot be promoted to camera-exposure latency and
  separate live performances cannot be described as identical inputs.
- Fixed five required workload rows: the local-web obstacle sample, native
  Godot ARM64 Tiny Motion sample and three remote-web compatibility titles.
  Compatibility load cannot establish title Motion integration or playability.
- Required explicit accelerator physical/runtime state and processor telemetry
  to prove CPU-only inference; GPU/NPU pose delegation remains prohibited.
- Preserved D-110's 120 ms p95 exposure-to-action gate, zero privileged false
  activations, zero unrecovered failures/exits and D-108's lower-cost 35 dBA
  ceiling while leaving all unapproved quality, FPS, frame/drop, memory, power,
  thermal, throttle and recovery gates null.
- Added a local owner-question handoff for backend/model, accelerator state,
  pre-result thresholds, replay/live authority and native Godot execution so
  concurrent central question numbering was not modified.

### Verification evidence

- Eleven focused tests accept the tracked blocked plan and reject source drift,
  invented target/runtime/results, unproven accelerator state, GPU/NPU
  delegation, replay/exposure claim substitution, workload deletion or
  reclassification, reduced duration, weakened fixed gates, aggregate rescue,
  load/playability promotion, post-result thresholds, hidden authority or data
  retention, blocker drift, undeclared fields, noncanonical JSON, UTF-8 BOM,
  invalid UTF-8 and oversized inputs.
- The command-line validator reports two lanes, five workloads and eleven
  blockers with no result.

### Remaining boundary

I-014 is active, not closed. No Pi, peripheral, image, CPU backend/model,
pre/post-processor, tracker, accelerator non-use proof, native ARM64 Motion
path, camera/room/clock, replay corpus, participant/service authority,
interaction script, schedule, threshold, run, performance distribution,
recovery result or product conclusion exists. No hardware or external service
was changed.

## 2026-07-25: Raspberry Pi 5 memory-tier qualification plan

### Delivered

- Advanced I-016 from an open memory-pressure row to a strict blocked campaign
  without recommending a memory tier from advertised capacity, price or
  another target's telemetry.
- Bound the committed I-014 CPU-only, accelerated concurrent-workload,
  microSD-qualification and Pi-image plans by normalized SHA-256.
- Preserved D-042's sequence: the selected 8GB reference completes first, 4GB
  is the later minimum candidate, and optional 2GB evidence cannot rescue a
  required row or become product-eligible without a superseding decision.
- Pre-registered 40 required cells across two tiers, five workloads and four
  phases: cold launch/headroom, one-hour representative load, bounded
  cgroup-v2 pressure/reclaim and kernel-owned OOM containment/recovery.
- Required memory/cgroup, PSI, fault/refault, swap/zram, storage-write, OOM,
  pose/game, latency, power, thermal, acoustic, cost and fresh-recovery
  evidence under one exact common target tuple.
- Preserved D-110's 120 ms p95, zero privileged activations, zero unrecovered
  failures, zero unexpected representative OOM kills and D-108's 35 dBA gate;
  all outcome-sensitive memory, FPS/drop, power, thermal, recovery and savings
  thresholds remain null.
- Kept D-085 vault plaintext and keys out of swap/dumps and prohibited raw
  frame/audio/skeleton/credential/hosted-body/identifier retention.

### Verification evidence

- Eight focused tests accept the tracked plan and reject source substitution,
  invented target policy, tier/order/eligibility drift, optional-tier rescue,
  workload/phase/duration weakening, failure replacement, fixed-gate changes,
  aggregate or synthetic-only qualification, post-result thresholds,
  premature recommendation/cost, hidden authority, sensitive retention,
  blocker drift, unknown fields, noncanonical JSON, UTF-8 BOM, invalid UTF-8
  and oversized input.
- The validator reports three tiers, 40 required cells and nine blockers with
  no result.

### Remaining boundary

I-016 is active, not closed. The 8GB reference has not passed; no received 8GB
or 4GB board, exact image/runtime/storage/swap/cgroup policy, workload/data
authority, pressure/OOM permission, schedule, monitoring, threshold, run,
memory trace, cost or recommendation exists. No hardware, image, storage or
external service was changed.

## 2026-07-25: Pi thermal/acoustic and cooling comparison plan

### Delivered

- Advanced I-024/I-025 to one strict blocked campaign covering four cooling
  roles, four representative workloads and one-hour plus four-hour soaks: 32
  required cells under one exact enclosed target tuple.
- Bound concurrent-workload, memory-pressure, ABS-box-screen and active-play
  safety sources by normalized SHA-256.
- Required ambient cooldown, counterbalancing, one-second thermal/performance/
  power/acoustic telemetry, tonal and mechanical evidence, and preserved
  product failures without aggregate rescue.
- Preserved 35 dBA, 120 ms p95 and zero shutdown/unrecovered/privileged gates;
  open temperature, throttle, FPS/drop, power, tonal, recovery and cost gates
  remain null. Numeric dBA, open-enclosure or one-hour evidence cannot excuse
  the corresponding failure.
- Eight focused adversarial tests pass; no physical authority or result exists.

### Remaining boundary

I-024/I-025 remain active. No received target/cooler/enclosure, exact fan or
vent policy, target runtime, instrument, room, schedule, safety protocol,
numeric gate, purchase/cut/load authority, soak or selection exists.

## 2026-07-25: Pi Wi-Fi/Bluetooth coexistence plan

### Delivered

- Advanced I-026 to a strict blocked 32-cell campaign across required 2.4 GHz
  risk and 5 GHz control bands, open diagnostic and closed product placements,
  and eight idle/camera/controller/download/hosted/update/fault scenarios.
- Bound the controller, shared-camera, concurrent-workload and enclosed thermal
  plans by normalized SHA-256.
- Required 30-minute measurements, twenty physical input trials and twenty
  reconnect cycles with counterbalancing, retained invalid attempts and no
  product-failure replacement.
- Preserved genuine 1080p60, 120 ms p95 and zero controller lifecycle,
  stuck/fabricated, wrong-player/old-epoch and unrecovered-disconnect gates;
  open network/input/drop/FPS/power/thermal gates remain null.
- Prohibited 5GHz rescue of 2.4GHz, open-enclosure promotion and throughput
  rescue of input/camera/recovery failure; prohibited raw identifiers,
  credentials, payloads, descriptors, frames and audio.
- Eight focused adversarial tests pass; no traffic, hosted use, fault injection
  or physical result is authorized.

### Remaining boundary

I-026 remains active. No received target/radio/controller/camera/AP, exact
firmware/regulatory/channel/enclosure/USB/network/room tuple, RF survey,
instrument, payload authority, schedule, stimulus, recovery oracle, numeric
gate, trial or product result exists.

## 2026-07-25: Pi HDMI video/audio and CEC qualification plan

### Delivered

- Advanced I-027/I-028 to one strict blocked campaign with three SDR/60 display
  candidates, direct-TV stereo plus optional receiver audio, eight AV checks,
  24 required direct-TV cells and one-hour sustained runs.
- Defined ten CEC power/input/source/volume/wake/fault/recovery scenarios with
  100 valid cycles each and mandatory controller/physical fallbacks.
- Bound settings rehearsal, boot/wake timing, browser geometry and sustained
  load sources without promoting screenshots, EDID, compositor or Web Audio to
  physical evidence.
- Preserved five-second wake, 120 ms p95 and zero AV/CEC/dropout/blanking/
  recovery failures; open physical/video/audio/CEC/performance gates remain
  null. HDR/surround and all physical mutations remain unauthorized.
- Eight focused adversarial tests pass; no target TV result exists.

### Remaining boundary

I-027/I-028 remain active. No exact TV/cable/receiver/port/firmware stack,
physical observation, room, CEC policy, schedule, gate, mutation authority,
trial, cycle, qualified mode/audio route or vendor-quirk result exists.

## 2026-07-25: cross-tier TV appliance qualification plan

### Delivered

- Advanced I-118 from an open row to a strict blocked campaign for the required
  ordinary x86-64 native-Linux and Pi 5/Hailo 26 targets, with the later Steam
  Machine isolated as optional and unable to rescue either common target.
- Bound the existing Pi HDMI/CEC, ordinary-x86 target, cross-tier timing,
  display/audio settings and power-recovery sources by normalized SHA-256.
- Defined eight sleep/wake, deliberate/external input-switch, direct/alternate
  audio-route and HDMI hot-plug scenarios with 100 valid cycles per target and
  1,600 required cycles overall.
- Required independent physical picture, audible stereo, controller/fallback
  and timing evidence. EDID/ELD, compositor/audio API state, CEC traffic,
  browser pixels and a running launcher cannot manufacture those claims.
- Preserved the five-second warm-wake deadline and zero unrecovered, false-
  ready, control-loop, takeover, fallback-loss, privacy/quiescence and crash/
  hang gates. Result-dependent recovery, reliability, power and thermal gates
  remain null.
- Allowed exact I-027/I-028 cycle reuse only once under identical protocol and
  cell identity; partial Pi evidence and cross-target aggregates cannot promote
  the campaign.
- Nine focused adversarial tests pass. No TV, target or product result and no
  power/input/audio/CEC/hot-plug mutation authority exists.

### Remaining boundary

I-118 remains active. Exact received target, TV, port, cable, source and
optional receiver tuples; the ordinary-x86 idle strategy; target display,
audio, CEC and controller stacks; physical/timing oracles; counterbalanced
schedule; fault protocol; numeric gates; authority; and all 1,600 required
cycles remain absent.

## 2026-07-25: cross-tier Bluetooth controller qualification plan

### Delivered

- Advanced I-117 from an open row to a strict blocked campaign for required
  ordinary x86-64 native Linux and Pi 5/Hailo 26, with Steam optional and no
  cross-target, Windows, WSL2 or Pi-radio substitution.
- Bound the existing cross-tier controller, Pi radio coexistence, controller
  protocol, timing and power-recovery sources by normalized SHA-256.
- Reused I-152's four representative sample roles and separated Bluetooth from
  wired and 2.4 GHz receiver claims. Family resemblance, mapping entries,
  discovery, stored bonds, connected flags and one attempt cannot qualify.
- Defined five normal/low/critical/unavailable/stale battery conditions and
  fourteen fresh-pair, cold-boot, reconnect, service/radio/power fault,
  forget/re-pair, two-device and low-battery scenarios.
- Fixed 20 valid cycles per applicable target/sample/scenario cell: 68 required
  cells and 1,360 cycles. Exact I-152/I-026 cycles may be reused once only when
  complete protocol and cell identity match.
- Preserved five-second warm reconnect plus zero pairing/reconnect, false-state,
  stale-action, wrong-player, reserved-action, recovery and disclosure gates;
  result-dependent latency/reliability/battery gates remain null.
- Prohibited raw Bluetooth identity, bond credentials, HID/packet data, radio
  traces and free text. Nine focused adversarial tests pass; no physical
  controller result or mutation authority exists.

### Remaining boundary

I-117 remains active. No exact received controller sample/revision/firmware,
target radio/BlueZ/SDL/mapping/compositor/bond-store tuple, pairing UX, bond and
assignment policy, battery source, applicability ledger, harness, schedule,
numeric gate, mutation authority, physical cycle or compatibility result exists.

## 2026-07-25: cross-tier unattended idle energy qualification plan

### Delivered

- Advanced I-120 from an open row to a strict blocked physical campaign for
  ordinary x86-64 native Linux and Pi 5/Hailo 26, with optional Steam isolated.
- Bound the timing, power-recovery, physical-TV wake, Bluetooth-controller wake
  and Pi thermal plans by normalized SHA-256.
- Required ordinary x86 to compare platform suspend with low-power launcher
  idle before Q-270 selection; retained D-095 low-power launcher idle for Pi and
  optional suspend for Steam without automatic or cross-target selection.
- Defined accountless-offline, online-quiescent, post-local-game and post-hosted
  entry profiles across one-hour, eight-hour and 24-hour durations, five runs
  per cell, 180 required idle runs and at least 600 required controller/physical
  wake cycles.
- Required calibrated wall energy, thermal, namespace-write, network,
  privacy/lifecycle and physical-wake evidence with explicit launch-admission,
  camera/tracker/microphone/display/update and controller readiness invariants.
- Preserved five-second warm wake plus zero failed/false wakes, privacy faults,
  unsafe writes/update transitions, lost sources and crash/hang faults. Open
  power/energy/thermal/write/network/reliability gates remain null.
- Forbade cross-strategy, cross-target, optional, shorter-duration and aggregate
  rescue. Power savings cannot rescue safety/reliability, and host-reported
  power cannot establish wall energy.
- Nine focused adversarial tests pass. No strategy, physical result or
  power-state/unattended authority exists.

### Remaining boundary

I-120 remains active. Exact target/power/display/controller tuples, idle and
suspend adapters, wake sources, x86 selection authority, calibrated instruments,
state/privacy/write/network oracles, schedule, numeric gates, hardware authority,
180 idle runs and at least 600 required wake cycles remain absent.

## 2026-07-25: sudden-power campaign status reconciliation

### Delivered

- Audited the existing `219b53b` sudden-power tranche against the still-open
  I-114 and I-202 investigation rows and corrected both statuses to active.
- Mapped I-114's OS, game, retro import, profile and save requirements to the
  validator's boot/system-update/filesystem-recovery, package update/rollback,
  retro-import, profile-vault and save-checkpoint operation classes.
- Confirmed the campaign also freezes idle, log-rotation and low-space classes,
  at least 200 ordered valid cuts, exact plan-byte result binding, complete
  ledger accounting, four mandatory oracles and zero product failures.
- Re-ran all twelve focused tests successfully and recorded exact SHA-256
  identities for the campaign contract, owner questions, validator and tests.
- Added an explicit audit boundary rather than creating a second incompatible
  power-cut schema or treating synthetic test digests as a physical plan.

### Remaining boundary

I-114/I-202 are active, not complete. No exact Pi/card/supply/image/filesystem/
service/transition/fixture tuple, frozen physical plan, destructive authority,
cut, evidence ledger, restore, result or hardware qualification exists. Q-197
and Q-198 remain unresolved in the existing owner-question document.

## 2026-07-25: camera and microphone status reconciliation

### Delivered

- Audited the committed shared-camera (`e69be7e`, `6230bf8`) and microphone-
  disablement (`d0013db`, `d23fdd9`) tranches against open I-177/I-179 rows and
  corrected both statuses to active without touching concurrent I-178 work.
- Confirmed the shared-camera plan/result boundary derives 40 exact cells across
  all three targets, preserves genuine 1080p60 and exposure-to-action evidence,
  and withholds selection, purchase and BOM authority.
- Confirmed the microphone plan/result boundary derives 192 exact cells across
  three targets, eight enforcement layers and eight lifecycle phases, treating
  any returned buffer or byte as failure even when silent.
- Re-ran all 26 shared-camera and all 25 microphone focused tests successfully.
- Added an explicit status audit and retained the existing dedicated owner-
  question documents rather than duplicating or silently answering them.

### Remaining boundary

I-177/I-179 remain active, not complete. No received camera, delivered price,
exact target stack, room/optical/exposure-clock evidence, microphone policy
probe, approved schedule/gate/authority, physical cell, qualified camera or
default-disablement result exists. The administrative microphone diagnostic
path remains unresolved.

## 2026-07-25: dependent hardware campaign status reconciliation

### Delivered

- Corrected I-160 to active because the I-016 plan already contains its gated
  4GB-after-passing-8GB comparison and 40-cell evidence surface.
- Corrected I-162 to active because the I-022/microSD umbrella already contains
  its build, full-disk, power-cut, corruption, recovery and endurance phases
  plus the measured USB-SSD fallback rule.
- Corrected I-197 to active because the D-166 coordinator and I-023/I-117/I-118/
  I-120 plans now divide its implementation, timing, controller, TV/CEC and
  energy/privacy/write/reliability requirements without collapsing evidence.
- Re-ran 78 focused plan tests: 8 memory, 17 microSD and 53 timing/controller/
  TV/idle-energy tests all pass.
- Did not rerun or modify native code while a concurrent package-generation
  tranche intentionally leaves the shared crate incomplete.

### Remaining boundary

All three rows remain active, not complete. Stable prerequisites, received
hardware, exact production adapters/wiring, instruments, schedules, gates,
authority, physical/destructive/unattended trials and target results are absent.

## 2026-07-25: living-room and play-zone survey plan

### Delivered

- Advanced I-001/I-002 from open rows to one strict blocked survey without
  inventing private room facts or authorizing home access.
- Defined a millimetre coordinate frame at the primary TV face plane and twelve
  exact room, TV, viewing, furniture, egress, window/light, power/network,
  floor, below-TV enclosure and external-camera measurement groups.
- Fixed twelve collision/safety hazard classes and the one contiguous measured
  2438.4 by 2438.4 mm one/two-player zone, with zero overlap, preserved egress,
  normal-furniture validity, subzones and child/adult reach review.
- Kept seated and later four-player evidence exploratory and unable to rescue a
  failed required zone; camera previews and diagrams cannot prove coverage.
- Prohibited raw home photos in repository/released evidence; required EXIF/GPS
  stripping and identity/screen/reflection redaction; prohibited SSIDs,
  credentials, addresses, traffic and stable serials.
- Added QROOM-001 through QROOM-005 for room/privacy, normal configuration,
  instruments, clearances and optical/viewing gates.
- Nine focused adversarial tests pass. No room measurement or safety result and
  no photography/participant/furniture/electrical/network/mounting authority
  exists.

### Remaining boundary

I-001/I-002 remain active. The selected room, consent, tools, normal and worst-
open configuration, exact equipment, body/reach protocol, numeric gates, access,
photographs, floor plan, hazard map, play zone, coverage and safety result are
absent.

## 2026-07-25: body-profile campaign status reconciliation

### Delivered

- Corrected I-067 from open to active because I-072/I-184/I-186/I-187/I-188/
  I-191 already divide its prediction, privacy, exclusion, vault, management and
  save-separation boundaries.
- Audited camera-free calibration, conservative prediction/abstention, exact
  confirmation/correction and credential-free profile-management evidence.
- Preserved zero authority from predictions, no portrait/face/name/score/vector
  use, explicit opt-out/invalidation and product matching disabled under Q-240.
- Verified 16 motion-contract body-profile unit tests, 30 console-lab
  calibration/profile-management tests and 20 evidence-validator tests.
- Recorded that an initial Node-runner invocation of Vitest files caused three
  harness initialization errors; the correctly scoped owning Vitest suites pass.

### Remaining boundary

I-067 remains active, not complete. No approved extractor/model, encrypted
broker/vault/protector, consent/legal authority, real cohort/room/target test,
accuracy/ambiguity/repeat-session gate, competitive normalization, persistence
qualification or product result exists.

## 2026-07-25: camera policy, lighting and shutter-state status reconciliation

### Delivered

- Corrected I-036 from open to active because the committed capture-policy
  campaign already pre-registers three ordered presets, 252 exact cells and
  5,040 physical trials across exposure, white balance, sustained frame rate,
  blur, low light, landmark accuracy and action outcomes.
- Corrected I-040 from open to active because the same campaign explicitly
  covers daylight, backlight, warm-lamp, cool-lamp, television-only and dim
  strata with measured lux ranges, per-condition gates and no aggregate rescue.
- Corrected I-046 from open to active because the Motion Lab already implements
  a closed camera-state truth table for disabled, starting, permission, active,
  unavailable, disconnected and failed states while always reporting physical
  shutter position as unsensed.
- Mapped I-046's remaining physical shutter and activity-indicator work to the
  existing shared-camera plan without representing that blocked plan as a
  result or treating a live stream as proof of an unobstructed lens.
- Re-ran 15 capture-policy, 15 camera-state unit and 26 shared-camera contract
  tests, plus four focused Chrome camera-state flows; all 60 checks pass.

### Remaining boundary

I-036/I-040/I-046 are active, not complete. No exact camera/room/control/
lighting policy, exposure-clock authority, participant collection, physical
shutter blocking, indicator truth table, across-room comprehension, enclosure
check, selected preset, physical result or product qualification exists.

## 2026-07-25: first real-room one-player campaign plan

### Delivered

- Advanced I-053/I-210 from open rows to one strict blocked campaign over the
  existing `household-one-player-v1` attempt and scoring contract.
- Bound the benchmark plan/protocol, prototype gates, blocking personas,
  living-room survey, camera capture-policy and exposure-action latency sources
  by normalized SHA-256 so source drift invalidates the campaign.
- Required the school-age-child-standing and adult-standing personas at center
  plus four zone edges: ten independent 280-attempt runs and 2,800 scheduled
  attempts total across all 14 shell/game/session blocks.
- Required a separate 15-minute negative session for every persona/placement
  cell, producing ten sessions and 150 minutes total with zero unintended
  privileged-action tolerance.
- Kept pose FPS, core-17 coverage/jitter, action and transition scores, drops,
  loss/reacquisition/overlay timing, skeleton-only reproduction, independent
  ground truth and exposure-authoritative action latency as separate evidence.
- Preserved the decided 95% precision, 90% recall and 120 ms p95 gates while
  leaving pose FPS/coverage/jitter thresholds null for owner review.
- Added QRR-001 through QRR-009 for target/build, room/placements, camera and
  lighting, participation, pose gates, ground truth/exposure clocks, negative
  script, data handling and operators/schedule.
- Nine focused adversarial groups pass. One initial invalid-UTF-8 case exposed
  only the platform decoder message; the validator now reports an explicit
  bounded UTF-8 error and the corrected suite passes.

### Remaining boundary

I-053/I-210 are active, not complete. The current validator intentionally
accepts only the blocked zero-result plan; a reviewed ready-plan/result
transition remains required before collection. No selected room/safe zone,
target/build, camera/capture policy, participant consent/assent, ground truth,
exposure clock, negative script, data authority, schedule, physical attempt,
trace, score, latency result or product qualification exists.

## 2026-07-25: cross-tier camera placement and optical-geometry plan

### Delivered

- Advanced I-037/I-193/I-194 from open rows to one strict blocked campaign
  that keeps the integrated appliance and external PC/Steam packaging paths
  mechanically separate under one camera/Motion evidence contract.
- Bound the packaging decisions, safety boundary, ABS-box screen, room survey,
  shared-camera, pose-edge, floor-contact and real-room action plans by
  normalized SHA-256.
- Defined 405 integrated screening cells across three enclosure heights, TV-
  stand depths, player distances and room widths plus five upward-pitch roles,
  without inventing their millimetre/degree values.
- Defined 50 external geometry cells across supported-PC and Steam targets,
  five mount roles and five zone points, with no cross-target rescue.
- Required one selected integrated fixed axis plus all ten external target/mount
  combinations to enter the child/adult, five-zone-point, five-motion matrix:
  550 cells and 11,000 retained physical trials.
- Required 20 calibration/relocation cycles for each of 11 configurations,
  producing 220 cycles plus ten fail-closed setup-error classes.
- Kept measured optical/floor/action, calibration/change-detection, mount/cable/
  USB, shutter and indicator evidence separate; preview, calibration state,
  landmarks and static dimensions cannot substitute for physical truth.
- Added QCG-001 through QCG-012 for grid values, selection, exact hardware,
  targets/mounts, gates, calibration, ground truth, safety/USB, participation,
  redacted evidence, publication and workload staging.
- Nine focused adversarial groups pass. No package-script registration was
  added while concurrent I-178 work owns `package.json`.

### Remaining boundary

I-037/I-193/I-194 are active, not complete. The validator accepts only the
blocked zero-result plan. No selected room, shared camera, integrated box,
external mount, supported-PC/Steam tuple, numeric geometry/gates, participant
authority, ground truth, safety/data/schedule protocol, physical screen, trial,
calibration cycle, fixed pitch, external setup envelope or qualification result
exists. Construction and purchase remain unauthorized.

## 2026-07-25: cross-tier camera cable qualification plan

### Delivered

- Advanced I-038 from an open row to a strict blocked passive-UVC cable
  campaign across ordinary x86 Linux, SteamOS and integrated Raspberry Pi.
- Bound camera/packaging decisions, active-play safety, ABS-box, shared-camera,
  geometry, Pi radio-coexistence and boot/suspend recovery sources by normalized
  SHA-256.
- Defined four passive length roles and six routing/stress states per target:
  72 one-hour genuine-1080p60 cells and 72 hours of sustained capture.
- Defined five recovery scenarios across all target/length combinations with 20
  valid cycles per cell: 60 cells and 1,200 retained cycles.
- Required integrated/internal and three external route roles, five pull
  directions and 20 cycles per direction, or 100 pull cycles per qualified
  route, with no loose-loop, trip, child/pet snag, adhesive-only or service-
  obstruction qualification.
- Kept enumeration, received frames and host-reported USB speed separate from
  sustained signal and physical safety evidence; short cable or target
  aggregates cannot rescue a failed path.
- Kept active USB extension disabled until a documented passive failure and
  separate owner-approved matrix; kept CSI disabled absent a superseding
  shared-UVC failure decision.
- Added QCC-001 through QCC-011 for length roles, identities, topology/power,
  gates, bend/retention, installation, oracles, RF, active USB, CSI and
  instruments/schedule.
- Nine focused adversarial groups pass. No package-script registration was
  added while concurrent I-178 work owns `package.json`.

### Remaining boundary

I-038 is active, not complete. The validator accepts only the blocked zero-
result plan. No received cable, exact length/radius, target port/topology,
route/retention method, numeric electrical/recovery/RF/safety gate, mutation or
installation authority, sustained stream, USB trace, mechanical pull, recovery
cycle, maximum supported length, active extension or CSI result exists.

## 2026-07-25: lens distortion and rectification campaign contract

- Added a strict blocked-state I-039 campaign comparing raw-unrectified,
  pre-inference-rectified and post-inference-coordinate-transform control lanes
  on ordinary x86 Linux, SteamOS and Raspberry Pi target tiers.
- Pre-registered 90 calibration images, 60 disjoint independent-validation
  images, 1,134 school-age/adult position/posture cells, 22,680 valid trials and
  9,000 exposure-timed live frames. Center, aggregate, persona, strategy and
  target evidence cannot rescue a failed blocking cell.
- Required instrumented proof at the actual inference-input boundary. Preview,
  configuration text, calibration UI and post-inference coordinates cannot
  claim that inference received rectified pixels.
- Proposed the bounded `vcg-lens-calibration/v1` adapter contract with exact
  camera, target, capture path, mode, orientation, mirroring and crop binding;
  intrinsics/distortion/rectification matrices and mappings; provenance,
  validation and validity metadata; no raw images/video; fail-closed mismatch;
  and no authority merely from writable storage.
- Preserved D-110's 120 ms exposure-to-action p95 gate and the current 95%
  precision/90% recall floors while leaving every new calibration, pose, edge,
  crop, floor and rectification-overhead threshold null for pre-collection
  owner review.
- Added nine adversarial validator cases covering stale sources, invented
  authority, strategy and sampling drift, trial/timing weakening, unsafe or
  reusable artifacts, evidence shortcuts, premature results and malformed or
  noncanonical input.

This is a canonical zero-result plan only. No camera, participant, room,
calibration, model selection, rectification path, inference-input state,
accuracy, latency, floor contact, action outcome, persistent artifact or target
qualification has been measured or approved. Physical execution remains
blocked on `OWNER_QUESTIONS_LENS_DISTORTION_RECTIFICATION_2026-07-25.md` and the
plan's exact source, protocol, threshold and authority bindings.

## 2026-07-25: visual robustness campaign contract

- Advanced I-041 from open to a strict blocked campaign for patterned and loose
  clothing, stationary blanket occlusion, five opaque skin-tone sampling
  strata and measured static/moving visual clutter.
- Crossed two blocking personas, twelve full-motion scenarios, five real-room
  placements, five motions and 20 trials into 3,000 cells and 60,000 trials.
  Added three separately safety-bounded blanket scenarios with 300 cells and
  6,000 stationary/slow trials, for 3,300 cells and 66,000 trials total.
- Required 150 separate 15-minute negative sessions across every persona,
  stratum and appearance scenario, preserving every gameplay and privileged
  action with no shortened or substituted failed session.
- Kept opaque skin-tone strata as consented sampling/analysis roles only: no
  tracker inference, identity, ethnicity, health, profile or authentication
  authority; no participant may fill multiple strata; no post-result exclusion
  or cross-stratum rescue is allowed.
- Prohibited jump/duck/dodge/rapid-turn blanket probes plus head/face/neck/
  airway covering, floor drag, wrapping, tying, pinning and restraint. Tracking
  success or consent cannot waive trip, entanglement, heat or balance failure.
- Preserved 95% trigger precision, 90% recall, zero unintended privileged
  actions and 120 ms exposure-to-game p95 while leaving new detection, error,
  jitter, dropout, reacquisition, disparity and cohort gates null.
- Added nine adversarial validator groups covering source drift, invented
  authority, cohort/stratum weakening, condition substitution, matrix drift,
  evidence shortcuts, unsafe/privacy-weakening changes, premature results and
  malformed or noncanonical input.

This is a canonical zero-result plan only. No participant, skin-tone stratum,
garment, blanket, clutter fixture, room, camera, target, physical trial,
accuracy, fairness, safety, latency or product result exists. Physical execution
remains blocked on `OWNER_QUESTIONS_VISUAL_ROBUSTNESS_2026-07-25.md` and exact
camera/room/fixture/cohort/ground-truth/data/threshold/authority bindings.

## 2026-07-25: OAK-D Pro W RGB/depth comparison contract

- Recorded current official-source candidate facts for USB OAK-D Pro W IMX378
  SKU `A00573`, including the 2026-07-25 US $529/In Stock merchandise snapshot,
  without treating vendor specifications, stock or price as selection,
  delivered cost, purchase authority or physical evidence.
- Separated shared-UVC RGB, OAK central-RGB camera-only, passive stereo,
  active-dot stereo and exploratory flood/mono-IR lanes. Blocking lanes prohibit
  on-device neural inference so camera, depth and model changes are not
  confounded; OAK RGB-only improvement cannot be credited to depth.
- Distinguished same participant/session context from same exposure. Internal
  OAK ablations require volatile same-exposure fan-out, while UVC/OAK comparison
  requires independent exposure/skew evidence and never promotes sequential
  movement to exact-exposure equivalence.
- Pre-registered 4,500 one-player cells and 90,000 trials across five lanes,
  three targets, both blocking personas, five placements, six lighting states
  and five motions. A later 675-cell/13,500-trial overlap phase remains gated on
  completed one-player and I-054 authority.
- Required depth/pose/floor/overlap/low-light/synchronization/latency/frame/
  power/thermal/resource/recovery/cost/maintenance evidence and a frozen
  material-benefit-with-no-regression selection rule.
- Kept emitters off absent exact received-device, official-firmware, intensity,
  distance, duration, temperature, reflection, participant and I-045 review;
  vendor laser classification or successful accuracy cannot waive safety.
- Added nine adversarial validator groups covering stale sources/candidate
  promotion, invented authority, lane attribution, timing honesty, matrix drift,
  self-labeling and aggregate rescue, unsafe IR/data/cost weakening, premature
  results and malformed or noncanonical input.

This is a source-backed candidate screen and canonical zero-result plan only.
No OAK device was purchased, received, powered, configured, synchronized,
calibrated, mounted or tested. No depth, floor, overlap, low-light, latency,
power, cost, participant, room, target, IR-safety or product result exists.
Execution remains blocked on `OWNER_QUESTIONS_OAK_D_PRO_W_COMPARISON_2026-07-25.md`
and every exact hardware/runtime/protocol/gate/authority binding in the plan.

## 2026-07-26: capture and inference mode result contract

- Advanced I-178 from an open comparison to an active, machine-checked blocked
  plan plus the only accepted ready-plan/result transition.
- Preserved the exact four 1080p/720p and 60/30 FPS candidates, paired-session
  fairness, blocking personas, Motion action set, fixed 120 ms p95, 95%
  precision, 90% recall and zero privileged-action gates, privacy exclusions,
  and the zero-result boundary while requiring every execution and numeric
  binding before collection.
- Expanded a ready plan into every ordered mode/persona/placement/lighting
  cell, with four detached evidence digests, all ten actions at exactly twenty
  attempts each, and one complete negative window per cell.
- Derived attempt, action, cell, mode and overall outcomes from ordered game-API
  events, exposure-authoritative timing, capture/inference rates, drops,
  exposure, CPU, RAM and USB observations. A valid product failure rejects even
  when another attempt is invalid; all-invalid or interrupted work remains
  incomplete.
- Kept qualified mode reporting separate from product selection:
  `selectedModeId` remains null and `productDefaultChanged` remains false in
  every accepted result.
- Added fourteen ready/result adversarial groups; together with the twelve
  blocked-plan groups, all twenty-six pass. The full repository test gate,
  including 452 research tests and every workspace package, and the full
  typecheck gate also pass.

This is validator and synthetic-fixture evidence only. No received camera,
genuine camera mode, target, participant, room, capture-policy result,
exposure-clock proof, physical attempt, mode qualification or default-mode
decision exists. Execution remains blocked on
`OWNER_QUESTIONS_CAPTURE_INFERENCE_MODE_2026-07-25.md` and the exact bindings
required by the ready-plan transition.
