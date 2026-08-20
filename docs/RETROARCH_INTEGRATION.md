# RetroArch integration contract

Status: implemented software foundation; artifacts and target behavior unqualified

Last updated: 2026-08-19

VCG launches RetroArch as a supervised local application. RetroArch does not become a second operating system, own the console launcher, scan removable media, or select arbitrary cores. The VCG shell retains branded loading/return, package policy, profile identity, storage boundaries, and the reserved gesture that exits a running game.

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

`catalog/retro-2048.vcg-game.json` is deliberately `unverified`. It records the rights-simple candidate while omitting artifact hashes and qualification claims until exact builds exist. Because the native adapter requires hashes, placing arbitrary files at the expected paths cannot make this candidate launchable.

## Native invocation

The Rust host accepts resolved package and storage locations:

```sh
vcg-host retroarch --dry-run \
  --install-root /var/lib/vcg/packages \
  --runtime-root /run/vcg \
  --data-root /var/lib/vcg \
  --frontend /var/lib/vcg/packages/retroarch/retroarch \
  --frontend-sha256 <64-lowercase-hex> \
  --core /var/lib/vcg/packages/cores/2048_libretro.so \
  --core-sha256 <64-lowercase-hex> \
  --base-config /var/lib/vcg/packages/retroarch/vcg-base.cfg \
  --base-config-sha256 <64-lowercase-hex> \
  --profile player-one \
  --game retro-2048
```

For games with content, both arguments are required:

```text
--content-root /var/lib/vcg/retro-content
--content /var/lib/vcg/retro-content/<managed-id>/game.rom
--content-sha256 <64-lowercase-hex>
```

The frontend, core, and base configuration must resolve to regular files beneath `--install-root`. Content must resolve beneath `--content-root`. Symlink resolution occurs before containment checks, so a link cannot escape either root. Profile/game identifiers use a bounded lowercase package-ID grammar and cannot add path segments.

The host streams each frontend, core, base configuration, and managed content file through SHA-256 before it creates runtime state or launches a process. Expected values must use the manifest's canonical 64-character lowercase hexadecimal form. Missing content hashes, hashes supplied for contentless launches, and mismatches fail closed with the artifact role, path, expected digest, and actual digest. The signed installed catalog binds the base-configuration digest even though the public game manifest has no separate field for it.

The direct command is a diagnostic adapter boundary. Normal launcher discovery begins from the [signed installed-package catalog](INSTALLED_PACKAGE_CATALOG.md), which accepts only a fixed game/profile intent and resolves these paths and hashes inside Rust.

Package and content storage must be immutable to the launched runtime account between verification and use. File-descriptor-bound execution/content handoff or an equivalent target-Linux mount/package guarantee remains required to close the verification-to-use race under a compromised local account.

The launch is a direct `Command`; no string is interpreted by a shell. The generated RetroArch arguments use an explicit base config, a console-generated append config, verbose diagnostics, exact core, and optional exact content.

A contentless launch passes `-L <core>` and nothing else. RetroArch does not load the core named by `-L` when `--menu` is also present: it starts in the menu with its built-in dummy core, which is the recorded cause of the earlier `MAIN MENU > Start Core` stop. See [the 2026-07-31 start-policy observation](RETRO_CONTENTLESS_START_OBSERVATION_2026-07-31.md). The menu handoff remains available as an explicit CLI diagnostic:

```sh
vcg-host retroarch ... --contentless-start menu
```

`--contentless-start` accepts exactly `core` or `menu`, may be supplied once, and is rejected when the launch carries managed content. The signed installed-catalog path always uses the `core` default; the override cannot enter through a package. `--dry-run` reports the selection as `contentless-start:`.

A core that requires content is expected to fail closed under the `core` default rather than fall back to a menu. That expectation is unverified. One-action playability — an observed, controllable game board on target hardware — remains a qualification gate rather than an assumed behavior.

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
  config/
    retroarch-core-options.cfg
    <core>/<core>.opt
```

The host creates private directories and atomically replaces the generated append config. On Unix, directories are mode `0700` and the configuration is `0600`. Content, cores, saves, states, remaps, BIOS/system files, and runtime cache remain distinct.

The generated configuration disables configuration persistence, history, command interfaces, achievements, online/core updaters, load-core/load-content entries, general configuration/information entries, and enables kiosk/fullscreen behavior. It redirects the save, save-state, remap, screenshot, system, cache, playlist, and log directories, the global core-options file, the content-history file, and RetroArch's own configuration directory into the paths above.

The configuration directory is redirected by `rgui_config_directory`, pointed at the same per-game `config` directory that holds `retroarch-core-options.cfg`. That key is not redundant with `core_options_path`, which names only the global options file: RetroArch writes per-core option files beneath its configuration directory instead. Measured on the Pi 5 target on 2026-08-19, with the rest of this key set generated, `config_save_on_exit` disabled, and the base configuration supplied, a run wrote `~/.config/retroarch/config/Mesen/Mesen.opt` — outside every console-managed root. With `rgui_config_directory` added, the same run left nothing under `~/.config/retroarch` and wrote that file beneath the managed per-game path. Per-core options are shared by every title a core runs; per-title options would be the separate RetroArch `game_specific_options` feature and are not enabled.

OS/compositor sandboxing remains required because configuration is defense in depth, not a security boundary.

The append configuration also establishes the I-132 no-enhancement baseline:
shaders, run-ahead, preemptive frames, rewind, frame delay/automatic frame
delay, hard GPU sync, and threaded video are explicitly disabled. A base
configuration cannot silently opt the session into those features. Any later
non-baseline profile must follow
[`RETRO_DISPLAY_LATENCY_ACCESSIBILITY_POLICY.md`](RETRO_DISPLAY_LATENCY_ACCESSIBILITY_POLICY.md)
and bind exact target/frontend/core/content/display evidence; raw family-mode
RetroArch tuning remains unavailable.

## Reserved input

The host owns the exit from a running game. Before it starts a child, `vcg-host` opens every connected controller's own Linux event device read-only and watches for the reserved gesture itself, above the frontend. When the gesture completes, the host terminates the child and returns to the shell.

The reserved gesture is **Select and Start held together for one second**. On a pad that reports a dedicated Home button (`BTN_MODE`), holding that button for one second does the same thing. The dedicated button is an addition, never a replacement: not every pad has one, and the Select-plus-Start form is producible on every RetroPad layout.

The one-second hold is the debounce policy. Both buttons going down inside one frame is ordinary play — a player mashing produces it, and some titles bind the pair themselves — so a momentary chord is not enough. The gesture fires once and re-arms only after the buttons are released, so holding longer cannot repeat it. No other button, axis, or event type is inspected.

The host reads button transitions, not initial state. A button already held when the router opens the device produces no event, so a gesture held from before the launch must be released and pressed again.

Discovery reads sysfs capability data, not device names. A node is a controller when its key bitmap declares at least one code in the kernel's joystick and gamepad button blocks, which excludes the appliance's power button, its HDMI nodes, and a controller's separate motion-sensor node. A controller is observable when it also reports Select and Start or a Home button. The set is rescanned every 500 ms, so a controller connected or disconnected while the console runs is picked up or dropped without restarting the host. A vanished controller's held reserved action is released so a replacement can produce a fresh gesture.

The router **fails closed**. If it cannot start, or no connected controller can produce the reserved gesture, the launch is refused rather than started with no exit. On a platform with no Linux event devices the launch is refused for the same reason.

The reader is read-only. It never issues `EVIOCGRAB`, never writes to a device, and never consumes or modifies an event. With no exclusive grab held, the kernel delivers each event to every reader, which is why the host can observe a controller while RetroArch reads the same device. It is also why **the game still observes the same button presses**: this router owns the reserved gesture, it does not withhold it. The "never receives Home" clause of [the reserved Home invariant](RESERVED_HOME_ACTION_CAMPAIGN_2026-07-26.md) stays open and needs an exclusive grab plus re-emission through a virtual device — ioctl work that would live in a separate crate the way `native/vcg-cursor-nudge` does, outside `vcg-host`'s `unsafe_code = "forbid"` boundary.

Because the host owns the gesture, `scripts/pi/vcg-base.cfg` sets no `input_menu_toggle_gamepad_combo`, and the generated session configuration pins that key to `"0"` so a base-configuration edit cannot give the frontend a combination of its own.

Only the `vcg-host retroarch` launch path starts the router today. The launcher-driven native launch path does not.

## Lifecycle boundary

Current stable lines:

```text
retroarch:prepared game=<id> profile=<id> config=<path>
retroarch:reserved-input controllers=<count> hold-ms=<milliseconds>
retroarch:started pid=<pid>
retroarch:reserved-exit
retroarch:completed exit_code=<code|signal>
```

`retroarch:reserved-input` is printed before the child starts; a launch that cannot print it is refused. `retroarch:reserved-exit` appears only when the reserved gesture ended the session, and that session returns command success even though the child was terminated.

The direct child is always reaped, and dropping its managed handle terminates it. A reserved exit uses the same `ManagedChild` termination the watchdog uses for a cancelled child rather than a separate kill path. A non-zero exit returns command failure. This slice intentionally does not fabricate readiness or heartbeats: RetroArch does not implement the VCG heartbeat file contract. Host configuration may select the installed game for connected watchdog recovery only when its signed frontend is a qualified wrapper or platform producer. A trusted compositor/window adapter must separately prove visible readiness and continued responsiveness.

A controller that disappears mid-session is dropped from the observed set and the session continues. The host does not terminate a running game when the observed count reaches zero, because a pad that powers itself off during a cutscene would then end the session; the consequence is that the escape is unavailable until a controller reconnects.

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
- missing, unexpected, malformed, and mismatched artifact hashes;
- path traversal and relative host-root rejection;
- missing content authority;
- private directory/config preparation;
- generated network/menu/storage policy, including the redirected
  configuration directory that contains per-core option files and the pinned
  empty frontend menu combination.

Reserved-input tests run on any host, from a byte stream and a synthetic
controller source, and cover event-record decoding across a split read, sysfs
capability parsing, controller admission against power-button, HDMI, and
motion-sensor nodes, a controller that reports no reserved buttons, the
recognized reserved gesture, gameplay input that must not be mistaken for it, a
partial combination released before the hold, single-fire and re-arm, hotplug
add and remove, and refusal when no controller is observable.

Manifest tests cover runtime/entrypoint identity, architecture parity, qualification hashes, contentless support, offline/origin/permission constraints, and runtime exclusivity.

Still required:

- signed, pinned frontend/core artifacts on ARM64 and x86-64;
- production key rotation, catalog anti-rollback, and immutable verification-to-child binding;
- persistent host profile identity, compositor/readiness event mapping, and a qualified wrapper or platform heartbeat producer before assigning a RetroArch game to the connected API watchdog;
- compositor/window ready and hang detection;
- process-group/cgroup containment for descendants;
- SDL3 mapping and player assignment;
- withholding the reserved gesture from the game, which needs an exclusive
  grab plus re-emission through a virtual device;
- starting the reserved-input router from the launcher-driven native launch
  path, not only from `vcg-host retroarch`;
- physical multi-controller evidence on both reference targets, including a
  hung core, a pad with no Home button, and simultaneous controllers;
- save/load UI and allowed per-game override UX;
- target audio/video/latency/shader/suspend testing;
- package update, rollback, uninstall, and no-leftovers proof;
- product wiring from the shared USB/LAN planner and native plain-file
  transaction into this launch path, plus USB/LAN acquisition, scanner,
  reservation, deletion/compaction, capacity/failure, and source-path
  exclusion campaigns.
