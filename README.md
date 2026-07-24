# VCG-Console

An open home game console for the games at [VibeCoded.Games](https://vibecoded.games), new body-controlled games, and an optional rights-respecting retro arcade.

The target experience is a living-room appliance: turn it on, stand in front of a wide-angle camera, select a game with a controller or remote, and play through body movement. Camera processing is intended to stay on the console by default.

This repository now contains the first reversible desk prototype alongside the research workspace: a Svelte 5 boot-to-launcher experience, Motion hub, cooperative web bridge, skeletal replay, body-control lab, and initial Rust native host. Raspberry Pi 5 8GB plus AI HAT+ 26 TOPS is the selected lower-cost reference candidate, while ordinary x86-64 Linux/PC hardware is the premium reference class. Both remain subject to reproducible room, latency, thermal, storage, and multi-player qualification. The preordered 2026 Steam Machine is an optional compatibility target, not a requirement of the core console.

## Run the desk prototype

Prerequisites: Node.js 22 or newer, pnpm 10.30.3 (directly or through Corepack), and Chrome for the end-to-end camera test. Native-host development also uses the exact Rust toolchain declared in `rust-toolchain.toml`.

```sh
pnpm install
pnpm prepare:assets
pnpm prepare:catalog
pnpm prepare:schemas
pnpm dev
```

Open the printed local URL. The boot sequence resolves into the launcher; Motion opens the existing synthetic skeletal replay and camera lab. Select **Enable Pose Simulator** for deterministic camera-free keyboard/controller fixtures, or **Start Camera** to run the pinned MediaPipe model locally. Camera pixels are not displayed or written. **Export Skeleton Trace** is the only diagnostic export in this prototype.

Useful verification commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm validate:benchmarks
pnpm validate:manifests
pnpm validate:schemas
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
- [Deny-by-default game permission model](docs/GAME_PERMISSION_MODEL.md)
- [Canonical launcher catalog policy](docs/LAUNCHER_CATALOG_POLICY.md)
- [Game trust tiers and admission lifecycle](docs/GAME_TRUST_TIERS.md)
- [Raspberry Pi 5 and AI HAT feasibility brief](docs/RASPBERRY_PI_AI_HAT.md)
- [2026 Steam Machine feasibility brief](docs/STEAM_MACHINE_2026.md)
- [Latest autonomous research tranche](docs/AUTONOMOUS_RESEARCH_2026-07-19.md)
- [First implementation record](docs/IMPLEMENTATION_LOG.md)
- [First living-room prototype success criteria](docs/PROTOTYPE_SUCCESS_CRITERIA.md)
- [Player personas and evidence matrix](docs/PLAYER_PERSONAS.md)
- [Household active-play safety checklist](docs/ACTIVE_PLAY_SAFETY.md)
- [Online and offline service matrix](docs/ONLINE_OFFLINE_SERVICE_MATRIX.md)
- [Repository security threat model](docs/SECURITY_THREAT_MODEL.md)
- [Release compliance and CycloneDX SBOM](docs/RELEASE_COMPLIANCE.md)
- [Console-managed game save lifecycle](docs/GAME_SAVE_LIFECYCLE.md)
- [Atomic A/B system-update state](docs/SYSTEM_AB_UPDATE_STATE.md)
- [Signed system-image manifest](docs/SYSTEM_IMAGE_MANIFEST.md)
- [Update trust root and delegated roles](docs/UPDATE_TRUST_ROOT.md)
- [Storage layout and capacity boundary](docs/STORAGE_LAYOUT_AND_CAPACITY.md)
- [Motion service and bridge security review](docs/MOTION_SECURITY_REVIEW.md)
- [Motion web bridge protocol and boundary](docs/MOTION_WEB_BRIDGE.md)
- [Motion local-transport benchmark](docs/MOTION_TRANSPORT_BENCHMARK.md)
- [Motion standardized action semantics](docs/MOTION_ACTIONS_V1.md)
- [Motion SDK web authoring guide](docs/MOTION_SDK_AUTHORING.md)
- [Camera-free Motion pose simulator](docs/MOTION_SIMULATOR.md)
- [Optional Motion capability query](docs/MOTION_OPTIONAL_CAPABILITIES.md)
- [Player control availability and missing-landmark behavior](docs/PLAYER_CONTROL_AVAILABILITY.md)
- [Casual local obstacle leaderboard](docs/LOCAL_LEADERBOARD.md)
- [Tracker health and degraded-control contract](docs/TRACKER_HEALTH.md)
- [Household motion benchmark protocol](docs/MOTION_BENCHMARK_PROTOCOL.md)
- [Player session and recovery state machine](docs/PLAYER_SESSION_STATE_MACHINE.md)
- [Controller input prototype contract](docs/CONTROLLER_INPUT.md)
- [Native child watchdog contract](docs/NATIVE_WATCHDOG.md)
- [Native launcher-host API contract](docs/NATIVE_HOST_API.md)
- [Native package launch lifecycle](docs/NATIVE_LAUNCH_LIFECYCLE.md)
- [Signed installed-package catalog contract](docs/INSTALLED_PACKAGE_CATALOG.md)
- [RetroArch integration contract](docs/RETROARCH_INTEGRATION.md)
- [Windows compatibility workstation](docs/WINDOWS_QUALIFICATION.md)
- [Windows x86-64 qualification result (2026-07-24)](docs/WINDOWS_QUALIFICATION_RESULT_2026-07-24.md)
- [Deferred owner questions from autonomous work](docs/OWNER_QUESTIONS_AUTONOMOUS_2026-07-19.md)
- [Deferred owner questions from the RetroArch tranche](docs/OWNER_QUESTIONS_RETROARCH_2026-07-23.md)
- [Deferred owner questions from the native-host API tranche](docs/OWNER_QUESTIONS_HOST_API_2026-07-23.md)
- [Deferred owner questions from the release-compliance tranche](docs/OWNER_QUESTIONS_RELEASE_COMPLIANCE_2026-07-24.md)
- [Deferred owner questions from the prototype-gates tranche](docs/OWNER_QUESTIONS_PROTOTYPE_GATES_2026-07-23.md)
- [Deferred owner questions from the installed-catalog tranche](docs/OWNER_QUESTIONS_INSTALLED_CATALOG_2026-07-23.md)
- [Deferred owner questions from the native-launch tranche](docs/OWNER_QUESTIONS_NATIVE_LAUNCH_2026-07-23.md)
- [Deferred owner question from the launcher-catalog tranche](docs/OWNER_QUESTIONS_LAUNCHER_CATALOG_2026-07-24.md)
- [Deferred owner questions from the package-watchdog tranche](docs/OWNER_QUESTIONS_WATCHDOG_2026-07-23.md)
- [Deferred owner questions from the system-update tranche](docs/OWNER_QUESTIONS_SYSTEM_UPDATE_2026-07-24.md)
- [Deferred owner questions from the update-trust tranche](docs/OWNER_QUESTIONS_UPDATE_TRUST_2026-07-24.md)
- [Deferred owner questions from the storage-layout tranche](docs/OWNER_QUESTIONS_STORAGE_LAYOUT_2026-07-24.md)
- [Source ledger](docs/SOURCES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

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
