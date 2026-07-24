# VCG-Console

An open home game console for the games at [VibeCoded.Games](https://vibecoded.games), new body-controlled games, and an optional rights-respecting retro arcade.

The target experience is a living-room appliance: turn it on, stand in front of a wide-angle camera, select a game with a controller or remote, and play through body movement. Camera processing is intended to stay on the console by default.

This repository now contains the first reversible desk prototype alongside the research workspace: a Svelte 5 boot-to-launcher experience, Motion hub, cooperative web bridge, skeletal replay, body-control lab, and initial Rust native host. Raspberry Pi 5 8GB plus AI HAT+ 26 TOPS is the selected lower-cost reference candidate, while ordinary x86-64 Linux/PC hardware is the premium reference class. Both remain subject to reproducible room, latency, thermal, storage, and multi-player qualification. The preordered 2026 Steam Machine is an optional compatibility target, not a requirement of the core console.

## Run the desk prototype

Prerequisites: Node.js 22 or newer, pnpm 10.30.3 (directly or through Corepack), and Chrome for the end-to-end camera test. Native-host development also uses the exact Rust toolchain declared in `rust-toolchain.toml`.

```sh
pnpm install
pnpm prepare:assets
pnpm prepare:schemas
pnpm dev
```

Open the printed local URL. The boot sequence resolves into the launcher; Motion opens the existing synthetic skeletal replay and camera lab. Select **Start Camera** there to run the pinned MediaPipe model locally. Camera pixels are not displayed or written. **Export Skeleton Trace** is the only diagnostic export in this prototype.

Useful verification commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm validate:manifests
pnpm supervise:game catalog/determined.vcg-game.json --dry-run
pnpm native:verify
cargo run -p vcg-host -- doctor
cargo run -p vcg-host -- launcher --dry-run --browser /path/to/chromium --profile-dir /absolute/path/to/profile --url http://127.0.0.1:5173/
cargo run -p vcg-host -- watchdog --dry-run --heartbeat-file /tmp/vcg-game.heartbeat -- /path/to/game
cargo run -p vcg-host -- help
```

For an x86-64 Windows compatibility workstation, follow [the Windows qualification guide](docs/WINDOWS_QUALIFICATION.md). Its bootstrap script verifies prerequisites and runs the same repository checks without treating Windows or WSL as Linux-console qualification.

The browser Gamepad API and Chrome app-mode supervisor are desk spikes, not proof of the Rust/SDL3 input boundary, compositor-level Home/Back, origin containment, or target-Linux behavior. The Rust host now owns direct child lifecycle, heartbeat timeouts, bounded restart, an explicit resource-fault signal boundary, signed installed-package resolution, idempotent game/profile launch intent, cancellation, and contained RetroArch planning with artifact SHA-256 enforcement and per-profile storage. Actual RetroArch artifacts, one-action 2048 startup, window readiness, Linux GPU/OOM detectors, compositor containment, persistent native profiles, and target-hardware behavior remain unqualified.

## Research workspace

- [System research and proposed architecture](docs/RESEARCH.md)
- [Prioritized investigation backlog](docs/INVESTIGATIONS.md)
- [Decision log](docs/DECISIONS.md)
- [Open-question register](docs/OPEN_QUESTIONS.md)
- [VibeCoded game compatibility snapshot](docs/GAME_COMPATIBILITY.md)
- [Canonical game manifest v1 contract](docs/GAME_MANIFEST_CONTRACT.md)
- [Raspberry Pi 5 and AI HAT feasibility brief](docs/RASPBERRY_PI_AI_HAT.md)
- [2026 Steam Machine feasibility brief](docs/STEAM_MACHINE_2026.md)
- [Latest autonomous research tranche](docs/AUTONOMOUS_RESEARCH_2026-07-19.md)
- [First implementation record](docs/IMPLEMENTATION_LOG.md)
- [First living-room prototype success criteria](docs/PROTOTYPE_SUCCESS_CRITERIA.md)
- [Online and offline service matrix](docs/ONLINE_OFFLINE_SERVICE_MATRIX.md)
- [Motion web bridge protocol and boundary](docs/MOTION_WEB_BRIDGE.md)
- [Native child watchdog contract](docs/NATIVE_WATCHDOG.md)
- [Native launcher-host API contract](docs/NATIVE_HOST_API.md)
- [Native package launch lifecycle](docs/NATIVE_LAUNCH_LIFECYCLE.md)
- [Signed installed-package catalog contract](docs/INSTALLED_PACKAGE_CATALOG.md)
- [RetroArch integration contract](docs/RETROARCH_INTEGRATION.md)
- [Windows compatibility workstation](docs/WINDOWS_QUALIFICATION.md)
- [Deferred owner questions from autonomous work](docs/OWNER_QUESTIONS_AUTONOMOUS_2026-07-19.md)
- [Deferred owner questions from the RetroArch tranche](docs/OWNER_QUESTIONS_RETROARCH_2026-07-23.md)
- [Deferred owner questions from the native-host API tranche](docs/OWNER_QUESTIONS_HOST_API_2026-07-23.md)
- [Deferred owner questions from the prototype-gates tranche](docs/OWNER_QUESTIONS_PROTOTYPE_GATES_2026-07-23.md)
- [Deferred owner questions from the installed-catalog tranche](docs/OWNER_QUESTIONS_INSTALLED_CATALOG_2026-07-23.md)
- [Deferred owner questions from the native-launch tranche](docs/OWNER_QUESTIONS_NATIVE_LAUNCH_2026-07-23.md)
- [Source ledger](docs/SOURCES.md)

## Experience principles

- Minimal, sleek television UI using a freely redistributable OCR-A typeface.
- Back and Home actions remain easy to reach through menus, loading states, and games.
- Supported controllers work automatically, including reconnect and player assignment.
- Consistent branded loading screens distinguish active progress, slow work, failures, and recovery.
- Every experience has a controller or remote escape path independent of body tracking.

## Current direction

```text
wide RGB camera
       |
capture, calibration, privacy controls
       |
pluggable pose tracker
       |
versioned VCG Motion API
       |
gesture and action recognizers
       |
launcher + web bridge + native/Godot SDK
       |
VibeCoded games | body games | optional retro frontend
```

The first useful milestone is not a finished enclosure. It is a wired living-room prototype that launches a small representative game set and sustains responsive one-player tracking in the real target room. Four-player tracking, appliance packaging, offline bundles, and retro support follow behind measured gates.
