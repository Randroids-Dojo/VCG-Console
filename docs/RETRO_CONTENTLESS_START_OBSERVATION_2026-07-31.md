# Contentless RetroArch start-policy observation — 2026-07-31

Status: bounded Windows x86-64 frontend observation; no gameplay, input, save,
Linux, AArch64, or packaged-launch result

Authority: D-096, I-122, I-123, I-198

## Question

[`RETRO_2048_WINDOWS_DEVELOPMENT_PACKAGE_2026-07-25.md`](RETRO_2048_WINDOWS_DEVELOPMENT_PACKAGE_2026-07-25.md)
recorded that a contentless launch stopped at `MAIN MENU > Start Core` and that
one-action playability was **not qualified**. The host passed `--menu` for every
contentless launch on the stated ground that the official CLI requires a menu
when no content is passed.

This observation asks one narrow question: on the pinned frontend build, does
`--menu` cause the stop, and does omitting it start the declared core?

## Exact inputs

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `retroarch.exe` (1.22.2, Git `69a4f0e`, built 2025-11-20) | 18,641,482 | `81c11b6f24932bf7918f05eee8928035bff3887335fd2a081507c75e9d94d06a` |
| `2048_libretro.dll` | 113,152 | `60227525eb9b222497dde0c6b8707876f6458e65675b9f24d91e333372bdc151` |

Both hashes match the artifacts already recorded by the 2026-07-25 development
package. The frontend was run from the complete upstream extraction, not from
the signed installed generation, because the materialized runtime set does not
carry the Qt libraries the upstream executable loads.

Host: Windows 11, AMD Ryzen 9 5900X, NVIDIA GeForce RTX 3080 Ti.

## Exact commands

Both runs used the same throwaway configuration (`config_save_on_exit=false`,
`video_fullscreen=false`, `kiosk_mode_enable=true`,
`load_dummy_on_core_shutdown=false`), a separate log file, and a 10-second
bounded lifetime terminated by the operator.

```text
retroarch.exe --config <cfg> --verbose --log-file <log> -L <2048_libretro.dll>
retroarch.exe --config <cfg> --verbose --log-file <log> -L <2048_libretro.dll> --menu
```

## Observation

Without `--menu`, the declared core is loaded and initialized at its own
geometry:

```text
[INFO] [Core] Loading dynamic libretro core from: "...\2048_libretro.dll".
[INFO] [Environ] SET_SUPPORT_NO_GAME: yes.
[INFO] [Environ] SET_PIXEL_FORMAT: XRGB8888.
[INFO] [Core] Geometry: 376x464, Aspect: 0.000, FPS: 60.00, Sample rate: 0.00 Hz.
[INFO] [Video] Set video size to: 752x928.
```

With `--menu`, the log contains **no core-loading line at all**. RetroArch
initializes its built-in dummy core and loads menu state instead:

```text
[INFO] [Environ] SET_PIXEL_FORMAT: RGB565.
[INFO] [Core] Geometry: 320x240, Aspect: 1.333, FPS: 60.00, Sample rate: 48000.00 Hz.
[INFO] [Video] Set video size to: 640x480.
[INFO] [Playlist] Loading favorites file: "...\content_favorites.lpl".
```

Both processes were still running when the operator terminated them at ten
seconds.

## What this establishes

On this exact frontend build, `--menu` is not a required companion to `-L` for a
contentless core. It is the cause of the recorded stop: the flag makes RetroArch
start in the menu without loading the core named by `-L`, so the player must
supply a second action. Omitting it makes RetroArch load the declared core
directly, and the core advertises `SET_SUPPORT_NO_GAME`.

## What this does not establish

- No pixels were captured. A core geometry line is not a rendered 2048 board.
- No input was exercised, so playability, controller mapping, and the reserved
  Home/Back path remain unqualified.
- No save or state round trip was produced.
- Neither run used the signed installed generation, the Rust host, the generated
  session configuration, or the console storage boundary.
- Nothing was observed on Linux or AArch64. The Raspberry Pi 5 reference
  candidate remains entirely unmeasured.
- A ten-second supervised run says nothing about soak behavior, shutdown,
  restart cleanup, or recovery.
- A core that requires content was not tested under the new policy. The
  expectation that it fails closed rather than falling back to a menu is
  unverified.

## Change made

`vcg-host` now defaults a contentless libretro launch to loading the declared
core directly, and keeps the menu handoff available as an explicit diagnostic:

```sh
vcg-host retroarch ... --contentless-start menu
```

The signed installed-catalog path always takes the default; the override is
CLI-only. `--dry-run` prints the selected policy as `contentless-start:`. See
[`RETROARCH_INTEGRATION.md`](RETROARCH_INTEGRATION.md).
