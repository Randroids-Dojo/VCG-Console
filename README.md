# VCG-Console

An open home game console for the games at [VibeCoded.Games](https://vibecoded.games), new body-controlled games, and an optional rights-respecting retro arcade.

The target experience is a living-room appliance: turn it on, stand in front of a wide-angle camera, select a game with a controller or remote, and play through body movement. Camera processing is intended to stay on the console by default.

This repository now contains the first reversible desk prototype alongside the research workspace. Raspberry Pi 5 8GB plus AI HAT+ 26 TOPS is the selected lower-cost reference candidate, while ordinary x86-64 Linux/PC hardware is the premium reference class. Both remain subject to reproducible room, latency, thermal, storage, and multi-player qualification. The preordered 2026 Steam Machine is an optional compatibility target, not a requirement of the core console.

## Run the desk prototype

Prerequisites: Node.js 22 or newer, pnpm 10.30.3 (directly or through Corepack), and Chrome for the end-to-end camera test.

```sh
pnpm install
pnpm prepare:assets
pnpm prepare:schemas
pnpm dev
```

Open the printed local URL. The lab starts with a synthetic skeletal replay; select **Start Camera** to run the pinned MediaPipe model locally. Camera pixels are not displayed or written. **Export Skeleton Trace** is the only diagnostic export in this prototype.

Useful verification commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm validate:manifests
pnpm supervise:game catalog/determined.vcg-game.json --dry-run
```

For an x86-64 Windows compatibility workstation, follow [the Windows qualification guide](docs/WINDOWS_QUALIFICATION.md). Its bootstrap script verifies prerequisites and runs the same repository checks without treating Windows or WSL as Linux-console qualification.

The browser Gamepad API and Chrome app-mode supervisor are desk spikes, not proof of the native SDL3 input boundary, compositor-level Home/Back, origin containment, or target-Linux behavior.

## Research workspace

- [System research and proposed architecture](docs/RESEARCH.md)
- [Prioritized investigation backlog](docs/INVESTIGATIONS.md)
- [Decision log](docs/DECISIONS.md)
- [Open-question register](docs/OPEN_QUESTIONS.md)
- [VibeCoded game compatibility snapshot](docs/GAME_COMPATIBILITY.md)
- [Raspberry Pi 5 and AI HAT feasibility brief](docs/RASPBERRY_PI_AI_HAT.md)
- [2026 Steam Machine feasibility brief](docs/STEAM_MACHINE_2026.md)
- [Latest autonomous research tranche](docs/AUTONOMOUS_RESEARCH_2026-07-19.md)
- [First implementation record](docs/IMPLEMENTATION_LOG.md)
- [Windows compatibility workstation](docs/WINDOWS_QUALIFICATION.md)
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
