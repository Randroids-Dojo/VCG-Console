# VCG-Console

An open home game console for the games at [VibeCoded.Games](https://vibecoded.games), new body-controlled games, and an optional rights-respecting retro arcade.

Turn it on, stand in front of a wide-angle camera, and pick a game with a controller or remote. Games built for the Motion API play through body movement alone — no wearables, no controller required once you're in one; the rest of the catalog plays with a controller like any console game. Camera frames are processed on the console and never leave it.

## Why it's interesting

- **Body control without a black box.** A single RGB camera feeds a pluggable pose tracker behind a versioned Motion API, so games never couple to a specific camera, model, or engine. A camera-free pose simulator drives the same API with deterministic keyboard/controller fixtures, so motion features are testable without a camera or a body.
- **Three catalogs, one appliance.** The existing VibeCoded.Games web catalog, new body-controlled games, and an optional retro arcade all launch through the same TV-safe launcher, with a controller or remote escape path from every screen, independent of tracking.
- **Privacy by construction.** Camera pixels are never displayed or written; the only diagnostic export is a skeleton trace. Player identity, profiles, and saves stay device-local.
- **A real native host, not a browser trick.** `vcg-host`, a Rust process, owns the parts a browser tab can't: child-process supervision, heartbeat/restart, signed package resolution, and launch lifecycle. The web launcher stays a client of that host, not a privileged process itself.
- **No emulator code vendored.** The retro path (RetroArch + libretro cores) is built from pinned, hash-verified upstream sources by a local recipe rather than checked into the repo — see [Retro arcade](#retro-arcade) below.
- **Reproducible, not just documented.** Every architectural claim in this repo traces to a decision, evidence, or an open question in `docs/`, and hundreds of automated `pnpm validate:*` checks hold that trail to the code.

## Components

| Component | What it is |
|---|---|
| `apps/console-lab` | The Svelte 5 boot-to-launcher desk prototype: launcher, Motion hub, skeletal replay, body-control lab, and cooperative web bridge test harnesses. |
| `native/vcg-host` | The Rust boundary for privileged console behavior — process supervision, watchdog, signed package/profile intake, native and RetroArch launch adapters. See [its README](native/vcg-host/README.md). |
| `packages/motion-contract`, `packages/motion-web-bridge` | The versioned Motion API and the transport that carries it between the native host and web games. |
| `packages/game-manifest`, `packages/launcher-catalog` | The canonical game manifest format and the catalog the launcher reads. |
| `packages/retro-*` | Contracts for the retro import, firmware, and performance boundaries, plus the pinned RetroArch/2048 development package. |
| `scripts/pi/` | Raspberry Pi bring-up, and the pinned build recipes for the retro cores and frontend (see below). |
| `catalog/`, `schemas/`, `benchmarks/`, `compliance/` | Game manifests, exported JSON schemas, hardware/motion benchmark evidence, and release compliance (SBOM) output. |

## Retro arcade

The retro lane runs real emulator software under a hard rule: **no third-party emulator, frontend, or core source or binary is vendored in this repository.** Instead, `docs/DECISIONS.md` records exact provenance for each component — repository, revision, archive SHA-256, byte length, and license — and `scripts/pi/build-retro-cores.sh` / `scripts/pi/build-retro-frontend.sh` fetch, hash-verify, and build from those pins on demand, refusing to continue on any mismatch.

Selected so far: the FCEUmm libretro core for NES (GPL-2.0), Genesis Plus GX for Mega Drive/Master System/Game Gear, Snes9x for SNES, and RetroArch 1.22.2 as the frontend. Licenses differ — two of the three cores forbid commercial use — so read the decision log before redistributing anything a recipe produces. Both build scripts are linted with `shellcheck` in CI; neither runs there, since both depend on upstream archive availability.

## Hardware targets

Raspberry Pi 5 (8GB) plus AI HAT+ (26 TOPS) is the selected lower-cost reference candidate; ordinary x86-64 Linux/PC hardware is the premium reference class. Both remain subject to reproducible room, latency, thermal, storage, and multi-player qualification — nothing here claims that qualification yet. The preordered 2026 Steam Machine is an optional compatibility target, not a requirement of the core console.

## Current architecture

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
vcg-host (privileged native process: launch, watchdog, package intake)
       |
VibeCoded games | body games | optional retro frontend
```

The first useful milestone is not a finished enclosure. It is a wired living-room prototype that launches a small representative game set and sustains responsive one-player tracking in the real target room. Four-player tracking, appliance packaging, offline bundles, and retro support follow behind measured gates.

## Get started

Setup, dev commands, verification, and the retro build recipes live in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

This project runs as an open research trail: every architectural claim traces to a decision, an experiment, or an explicitly open question, and `docs/` holds 380+ of them. Start here:

- [System research and proposed architecture](docs/RESEARCH.md)
- [Decision log](docs/DECISIONS.md)
- [Prioritized investigation backlog](docs/INVESTIGATIONS.md)
- [Open-question register](docs/OPEN_QUESTIONS.md)
- [Canonical game manifest v1 contract](docs/GAME_MANIFEST_CONTRACT.md)
- [Deny-by-default game permission model](docs/GAME_PERMISSION_MODEL.md)
- [RetroArch integration contract](docs/RETROARCH_INTEGRATION.md)
- [Repository security threat model](docs/SECURITY_THREAT_MODEL.md)
- [Release compliance and CycloneDX SBOM](docs/RELEASE_COMPLIANCE.md)
- [Source ledger](docs/SOURCES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Everything else — hardware BOMs, per-feature contracts, benchmark campaigns, and every deferred owner question — is in `docs/`, one Markdown file per topic, named for what it covers.

## Experience principles

- Minimal, sleek television UI using a freely redistributable OCR-A typeface.
- Back and Home actions remain easy to reach through menus, loading states, and games.
- Supported controllers work automatically, including reconnect and player assignment.
- Consistent branded loading screens distinguish active progress, slow work, failures, and recovery.
- Every experience has a controller or remote escape path independent of body tracking.
