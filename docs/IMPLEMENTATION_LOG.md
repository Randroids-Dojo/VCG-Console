# Implementation record

Last updated: 2026-07-24

This file records what has actually been built and verified. It does not convert desk evidence into Raspberry Pi, ordinary x86-64 Linux, SteamOS, real-room, or product qualification.

## 2026-07-19: first reversible desk slice

### Delivered

- pnpm workspace with independent Motion API, game-manifest, console-lab, asset-preparation, schema-export, catalog-validation, and hosted-process supervision surfaces.
- Motion API `0.3.0`: exact 17-point core, optional MediaPipe 33 and world-coordinate profiles, named timestamp quality, ordered out-of-band tracker health, temporal standardized obstacle/shell actions, skeleton-only traces, generated Draft 2020-12 schemas, and explicit required/optional capability negotiation.
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
