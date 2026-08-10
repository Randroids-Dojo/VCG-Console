# Raspberry Pi day-one bring-up

Last updated: 2026-07-31

Goal of this document: get one motion game and one emulated game running on the
delivered Raspberry Pi 5 the day the hardware arrives, with an honest record of
what that does and does not prove.

Nothing described here is a qualification result. A working session on this path
does not qualify the Pi 5, the AI HAT+, a camera, a controller, a room, a
thermal envelope, a latency budget, or a retro title. Use
[the prototype success criteria](PROTOTYPE_SUCCESS_CRITERIA.md) when a measured
claim is wanted.

## 0. What the order does not include

[The hardware ledger](HARDWARE_PURCHASES.md) covers the Pi 5 8GB, the AI HAT+
26 TOPS, the Active Cooler, and the 27W supply. Day one is blocked without the
following, none of which is in that order:

| Item | Why it blocks |
| --- | --- |
| microSD card (or an NVMe drive plus HAT) | No boot media. The screened candidate is the 256GB SanDisk High Endurance in `benchmarks/microsd-qualification/`. |
| microSD writer for the workstation | The image is written from another machine. |
| micro-HDMI to HDMI cable | The Pi 5 exposes micro-HDMI only. |
| Controller (USB or Bluetooth) | Launcher navigation, the escape path from a body-tracked game, and all retro input. |
| USB keyboard and mouse | First boot and diagnosis. |
| Camera | The owned Logitech C920 (`046d:082d`) is adequate to exercise the path. It is 1080p30 with a narrow field of view, so it is **not** the shared wide-angle contract in [the camera plan](SHARED_CAMERA_QUALIFICATION_PLAN_2026-07-25.md). |

Confirm the AI HAT+ standoff and riser contents against the Active Cooler
before planning the stack.

## 1. Operating system

Use the base image already pinned by
[the image recipe](PI5_HAILO_IMAGE_RECIPE_2026-07-25.md): Raspberry Pi OS with
desktop, 64-bit, released 2026-06-18, compressed SHA-256
`123287c05f27b0eebd8f65456f6369b8f6635fa50a3d440a4f9f6223bf58c8e2`. Verify the
compressed hash before writing.

Do not wait for the version-locked appliance image. That recipe is a blocked
plan with null hardware, package, and authority fields; it is not a prerequisite
for a first session. Equally, do not claim the recipe is satisfied because this
bring-up worked.

Skip `hailo-all` for now. See section 6.

## 2. Prerequisites on the Pi

- Node.js 22 or newer.
- Corepack, or pnpm at the exact version pinned by `packageManager` in
  `package.json`.
- Chromium. The camera path runs in the browser.
- Cage. It owns the single fullscreen Wayland application without starting a
  desktop session.
- For the retro path only: the rustup toolchain declared in
  `rust-toolchain.toml` (1.97.1).
- Optional but useful: `v4l-utils`, to record the exact camera modes.

## 3. Bootstrap

```sh
git clone <repository> vcg-console
cd vcg-console
scripts/pi/bootstrap.sh
```

The script installs pinned dependencies, prepares the pinned assets, builds the
app, builds and runs the release `vcg-host doctor`, then starts the real preview
server and verifies the browser boundary against it. Add `--full-verify` to also
run `typecheck` and the test suite; add `--skip-native` to skip the Rust host.

`prepare:assets` downloads the pinned pose model and typeface by exact SHA-256,
so run the bootstrap while the Pi still has network access. After that the built
app serves both from disk.

## 4. Motion game

The day-one motion game is the built-in Obstacle game in the Motion hub, not a
catalog title. Catalog entries such as `determined` are hosted remote-web games
and need working network plus their own services.

Install the appliance services, then reboot:

```sh
sudo scripts/pi/install-appliance.sh --user "$USER"
sudo systemctl reboot
```

The console then owns tty1 and opens fullscreen by itself. The desktop is not
entered and there is no manual browser step. See
[the appliance boot guide](PI_APPLIANCE_BOOT.md) for the exact service shape,
diagnostics, and recovery commands.

Two things about that URL matter and both fail quietly if ignored:

- **Use the served app, not a static file server.** The console documents must
  carry `Cross-Origin-Embedder-Policy: require-corp`,
  `Cross-Origin-Opener-Policy: same-origin`, the launcher CSP, and
  `Permissions-Policy: camera=(self)`. A plain static server returns the same
  bytes without those headers, which disables cross-origin isolation and the
  camera permission policy without any visible error. `pnpm serve` applies them;
  `pnpm verify:console-headers` proves it against a running server and exits
  non-zero when it is not true.
- **The service uses `127.0.0.1` on the Pi.** `getUserMedia` requires a secure context.
  Serving the app to another machine over plain HTTP on the LAN means the
  browser refuses the camera.

Then:

1. Boot sequence resolves into the launcher. Choose **Obstacle** (Motion group)
   or **Motion Lab** for skeleton diagnostics.
2. Press **ENABLE POSE SIMULATOR** first. This is the camera-free fixture path.
   If it plays, the app, the input plumbing, and the display are fine, and any
   later failure is in the camera or inference path specifically.
3. Press **START CAMERA** for the real path.

### Capture mode

The console requests the **low-power** mode by default: 640x480 at 30 FPS. This
is deliberate — browser pose inference on the Pi 5 runs on the CPU, and the
per-frame cost scales with capture size.

Request a larger mode explicitly with a query parameter:

```text
http://127.0.0.1:4173/?capture=balanced   # 1280x720 at 30
http://127.0.0.1:4173/?capture=target     # 1920x1080 at 60, the camera contract mode
```

All three request every dimension as `ideal`, so a camera that cannot deliver
the mode still opens. The running status line reports the requested mode and
what the camera actually reported; those are different facts, and only the
second one is an observation.

### What to expect and what it means

Frame rate on the Pi 5 CPU is unmeasured. `benchmarks/pi5-cpu-only/` holds the
plan and no results. If the session is too slow to play:

- confirm the tracker is on the worker backend, not the main-thread fallback
  (the running status line says which);
- stay on the low-power capture mode;
- treat the result as data, not failure — record it against the CPU-only plan.

## 5. Emulated game

Two independent problems stand between the current repository and a playable
retro title on the Pi. Solve them in this order.

### 5a. There is no AArch64 package

The only development generation that exists is Windows x86-64
([2026-07-25](RETRO_2048_WINDOWS_DEVELOPMENT_PACKAGE_2026-07-25.md)).
`catalog/retro-2048.vcg-game.json` is deliberately `unverified` and carries no
artifact hashes, and the native adapter refuses to launch without matching
SHA-256 values, so no file placed at the expected path can make it launchable.

Day one needs an AArch64 Linux RetroArch build plus `2048_libretro.so`, hashed,
and a Linux run of `vcg-development-package` to produce a signed development
generation. Keep it on the `development` channel with
`compatibilityStatus: unverified`; stable admission stays qualified-only.

### 5b. One-action start is fixed, and unverified on this target

The earlier stop at `MAIN MENU > Start Core` was caused by the `--menu` flag:
RetroArch does not load the core named by `-L` when `--menu` is present. The
host now defaults a contentless launch to loading the declared core directly.
See [the 2026-07-31 observation](RETRO_CONTENTLESS_START_OBSERVATION_2026-07-31.md)
for the exact A/B evidence, and [the integration contract](RETROARCH_INTEGRATION.md)
for the `--contentless-start` diagnostic override.

That observation is Windows x86-64 and log-level only. It has not been repeated
on Linux, on AArch64, through the Rust host, or with any input.

The supervised-frontend campaign has not absorbed this change yet: its source
binding is deliberately stale pending a re-read, recorded in
[the campaign's stale-binding note](SUPERVISED_LIBRETRO_FRONTEND_QUALIFICATION_CAMPAIGN_2026-07-26.md).
Decide there whether one-action core-direct start is a required lane outcome
before treating a Pi session as campaign evidence.

### 5c. Pragmatic hedge for day one

Installing stock RetroArch from apt on the Pi and starting the 2048 core by hand
proves the display, audio, and controller chain in minutes and de-risks the
evening. Do it, and record it as exactly what it is: not a console launch, not a
packaged title, not a qualification result, and not evidence about the signed
path.

## 6. The AI HAT+ is not part of day one

Do not plan the first session around the accelerator.

`packages/motion-contract/src/hailo-core17.ts` is a strict projection of a
Hailo-shaped observation into the portable landmark order. It returns
`motionFrameEmission: "blocked-pending-honest-source"` and cannot produce a
valid Motion frame, because the Motion API vocabulary has no honest Hailo source
value. There is also no HailoRT extractor, no pinned HEF, and no post-processing
tuple. See [the adapter boundary](HAILO_CORE17_ADAPTER.md).

Installing `hailo-all` before the CPU path works only adds variables to the
first failure you have to diagnose.

## 7. Record this

Before claiming anything from the first session, capture the evidence header
from [the success criteria](PROTOTYPE_SUCCESS_CRITERIA.md): commit, image,
kernel, browser version, camera identity and mode, controller identity, room
geometry, and the exact commands run. A session that produced a fun evening and
no record produced no evidence.
