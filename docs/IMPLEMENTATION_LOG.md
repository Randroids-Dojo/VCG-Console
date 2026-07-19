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

1. MediaPipe `detectForVideo` is synchronous in the browser API. I-208 compares worker and native-process boundaries before the shell can claim load isolation.
2. Browser capture records capture-arrival time, not camera exposure time. No current latency number can pass D-110's 120 ms p95 gate.
3. Action thresholds have unit and synthetic tests but no consented real-room precision/recall score. I-210 is the next motion evidence task.
4. Browser Gamepad input is not SDL3, and page code cannot reserve Home/Back. I-209 owns the native Linux boundary.
5. Chrome app mode does not yet enforce allowed origins, report game readiness, render all branded launch phases, or survive hostile full-screen/pointer-lock/hang cases.
6. No current result qualifies ordinary x86-64 Linux, Raspberry Pi, Hailo, or Steam Machine hardware.
7. Model and font artifact provenance is pinned, but full redistribution/SBOM/notice review remains required before a public release bundle.
