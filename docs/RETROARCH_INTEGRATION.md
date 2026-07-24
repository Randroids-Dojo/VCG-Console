# RetroArch integration contract

Status: implemented software foundation; artifacts and target behavior unqualified

Last updated: 2026-07-23

VCG launches RetroArch as a supervised local application. RetroArch does not become a second operating system, own the console launcher, scan removable media, or select arbitrary cores. The VCG shell retains branded loading/return, package policy, profile identity, storage boundaries, and eventually compositor-reserved Home/Back.

## Manifest boundary

A `runtime: "libretro"` game must include a `libretro` contract:

- exact frontend and core identities, versions, licenses, sources, and native architectures;
- frontend and core SHA-256 hashes before `compatibilityStatus: "qualified"` is allowed;
- either contentless startup or one hashed console-managed content artifact;
- one curated controller profile and save namespace;
- exact hashed BIOS inventory, including whether each item is required;
- offline networking, no web origins, native-only architecture, and only gamepad/persistent-storage permissions;
- process or explicit-ready health, never an HTTP health check.

The entrypoint is `libretro:<core-id>` and must match the selected core. A contentless candidate must explicitly declare a core that supports no-game startup. These cross-field constraints are enforced by the runtime parser; representable constraints are also exported to `schemas/game-manifest.schema.json`.

`catalog/retro-2048.vcg-game.json` is deliberately `unverified`. It records the rights-simple candidate while omitting artifact hashes and qualification claims until exact builds exist.

## Native invocation

The Rust host accepts resolved package and storage locations:

```sh
vcg-host retroarch --dry-run \
  --install-root /var/lib/vcg/packages \
  --runtime-root /run/vcg \
  --data-root /var/lib/vcg \
  --frontend /var/lib/vcg/packages/retroarch/retroarch \
  --core /var/lib/vcg/packages/cores/2048_libretro.so \
  --base-config /var/lib/vcg/packages/retroarch/vcg-base.cfg \
  --profile player-one \
  --game retro-2048
```

For games with content, both arguments are required:

```text
--content-root /var/lib/vcg/retro-content
--content /var/lib/vcg/retro-content/<managed-id>/game.rom
```

The frontend, core, and base configuration must resolve to regular files beneath `--install-root`. Content must resolve beneath `--content-root`. Symlink resolution occurs before containment checks, so a link cannot escape either root. Profile/game identifiers use a bounded lowercase package-ID grammar and cannot add path segments.

The launch is a direct `Command`; no string is interpreted by a shell. The generated RetroArch arguments use an explicit base config, a console-generated append config, verbose diagnostics, exact core, and optional exact content. Contentless launch adds `--menu` because the official CLI requires a menu when no content is passed. One-action `Start Core` remains a qualification gate rather than an assumed behavior.

## Storage boundary

Ephemeral session state:

```text
<runtime-root>/retroarch/<profile>/<game>/
  vcg-session.cfg
  cache/
  logs/
  playlists/
```

Persistent local state:

```text
<data-root>/profiles/<profile>/games/<game>/
  saves/
  states/
  remaps/
  screenshots/
  system/
  config/retroarch-core-options.cfg
```

The host creates private directories and atomically replaces the generated append config. On Unix, directories are mode `0700` and the configuration is `0600`. Content, cores, saves, states, remaps, BIOS/system files, and runtime cache remain distinct.

The generated configuration disables configuration persistence, history, command interfaces, achievements, online/core updaters, load-core/load-content entries, general configuration/information entries, and enables kiosk/fullscreen behavior. It redirects every mutable directory used by this slice into the paths above. OS/compositor sandboxing remains required because configuration is defense in depth, not a security boundary.

## Lifecycle boundary

Current stable lines:

```text
retroarch:prepared game=<id> profile=<id> config=<path>
retroarch:started pid=<pid>
retroarch:completed exit_code=<code|signal>
```

The direct child is always reaped, and dropping its managed handle terminates it. A non-zero exit returns command failure. This slice intentionally does not fabricate readiness or heartbeats: RetroArch does not implement the VCG heartbeat file contract. A trusted compositor/window adapter must prove visible readiness and continued responsiveness before the existing watchdog can enforce startup/hang recovery.

## 2048 smoke candidate

The Libretro 2048 core is the first integration candidate because it:

- requires no separately distributed ROM;
- is documented as public domain;
- accepts RetroPad controls;
- supports saves, save states, and remapping;
- can exercise both persistent and runtime isolation.

The repository does not currently contain or download RetroArch or the 2048 core. Exact release/commit selection, reproducible ARM64/x86-64 builds, hashes, GPL/public-domain notices, signatures, controller behavior, one-action startup, video/audio behavior, and uninstall cleanup must be recorded before the manifest can move beyond `unverified`.

## Tests and remaining gates

Native tests cover:

- direct content and contentless argument construction;
- package and imported-content root escapes;
- path traversal and relative host-root rejection;
- missing content authority;
- private directory/config preparation;
- generated network/menu/storage policy.

Manifest tests cover runtime/entrypoint identity, architecture parity, qualification hashes, contentless support, offline/origin/permission constraints, and runtime exclusivity.

Still required:

- signed, pinned frontend/core artifacts on ARM64 and x86-64;
- hash verification during manifest resolution, before this adapter is called;
- native launcher IPC and event mapping;
- compositor/window ready and hang detection;
- process-group/cgroup containment for descendants;
- SDL3 mapping, player assignment, and compositor-reserved Home/Back;
- save/load UI and allowed per-game override UX;
- target audio/video/latency/shader/suspend testing;
- package update, rollback, uninstall, and no-leftovers proof;
- shared USB/LAN importer and capacity/failure campaign.
