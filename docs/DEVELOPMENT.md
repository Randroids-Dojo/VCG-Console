# Development setup

This is the practical guide to running the desk prototype, verifying a change, and building the retro path locally. For product direction and the evidence behind decisions, start at [the research brief](RESEARCH.md) and [the decision log](DECISIONS.md) instead.

## Prerequisites

- Node.js 22.12.0 or newer (Vite 8's `engines` constraint excludes earlier 22.x releases)
- pnpm 10.30.3, directly or through Corepack
- Chrome, for the end-to-end camera test
- The exact Rust toolchain pinned in `rust-toolchain.toml`, for native-host development

## Run the desk prototype

```sh
pnpm install
pnpm prepare:assets
pnpm prepare:catalog
pnpm prepare:schemas
pnpm dev
```

Open the printed local URL. The boot sequence resolves into the launcher; Motion opens the existing synthetic skeletal replay and camera lab. Select **Enable Pose Simulator** for deterministic camera-free keyboard/controller fixtures, or **Start Camera** to run the pinned MediaPipe model locally. Camera pixels are not displayed or written. **Export Skeleton Trace** is the only diagnostic export in this prototype.

The camera is asked for the low-power 640x480 at 30 FPS mode by default, because browser pose inference on the Raspberry Pi 5 candidate runs on the CPU. Append `?capture=balanced` (1280x720 at 30) or `?capture=target` (1920x1080 at 60, the camera contract mode) to request a larger one. Every dimension is requested as `ideal`, and the running status line reports the requested mode alongside the mode the camera actually reported.

To serve a built console instead of the dev server, use `pnpm serve`. It applies the same cross-origin isolation, CSP, and camera permission policy as the dev server; a plain static file server returns the same bytes without them and silently breaks threaded inference and the camera. `pnpm serve` runs in the foreground like `pnpm dev`, so start it in its own terminal, then check it from another:

```sh
pnpm serve                    # separate terminal, stays running
pnpm verify:console-headers   # checks the server started above
```

## Verification commands

The rest run one after another and each exit on their own:

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

`pnpm test` runs the full JavaScript/TypeScript suite; `pnpm native:verify` runs `cargo fmt`, `cargo clippy -D warnings`, and `cargo test` across the Rust workspace. There are many more `pnpm validate:*` scripts than are listed above — see `package.json` for the complete set, one per evidence contract.

## Building the retro path

The repository vendors no emulator code (`RetroArch`, libretro cores). Instead, `scripts/pi/` carries pinned provenance — exact repository, revision, archive SHA-256, and byte length — and fetches, verifies, and builds from that:

```sh
scripts/pi/build-retro-cores.sh [--out DIR] [--cross-aarch64] [--only ID]
scripts/pi/build-retro-frontend.sh [--out DIR] [--jobs N]
```

Both refuse to build on a digest or size mismatch. Read `docs/DECISIONS.md` before redistributing anything they produce — two of the three selected cores forbid commercial use. Neither script runs in CI, since both depend on upstream archive availability; `scripts/pi/*.sh` is linted with `shellcheck` in CI instead.

## Target hardware

For a first session on delivered Raspberry Pi hardware, follow [the day-one bring-up guide](PI_DAY_ONE_BRINGUP.md) and its `scripts/pi/bootstrap.sh`.

For an x86-64 Windows compatibility workstation, follow [the Windows qualification guide](WINDOWS_QUALIFICATION.md). Its bootstrap script verifies prerequisites and runs the same repository checks without treating Windows or WSL as Linux-console qualification.

## Scope of what's proven so far

The browser Gamepad API and Chrome app-mode supervisor are desk spikes, not proof of the Rust/SDL3 input boundary, compositor-level Home/Back, origin containment, or target-Linux behavior. The Rust host (`vcg-host`) now owns direct child lifecycle, heartbeat timeouts, bounded restart, an explicit resource-fault signal boundary, signed installed-package resolution, strict persistent opaque profile intake, idempotent game/profile launch intent, cancellation, contained RetroArch planning, and a signed native-executable adapter with artifact SHA-256 enforcement and per-profile storage. The native adapter is process-only: actual packages, RetroArch/2048 startup, OS sandboxing, environment/device/network filtering, descendant ownership, window readiness, Linux GPU/OOM detectors, compositor containment, a qualified profile writer/lifecycle, and target-hardware behavior remain unqualified.

See [`native/vcg-host/README.md`](../native/vcg-host/README.md) for the full command reference and adapter-by-adapter boundary.
