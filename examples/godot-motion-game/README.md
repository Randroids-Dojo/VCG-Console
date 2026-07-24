# Godot Motion quickstart

This Godot 4.7 sample mirrors the TypeScript tiny game with one state consumer
behind three inputs:

- `VcgMotionWebBridge` for a reviewed Godot web export embedded by the console;
- `VcgMotionReplay` for deterministic skeleton-only traces; and
- controller fallback through `accept_controller`.

Run the headless contract tests:

```powershell
pnpm validate:godot
```

The validator runs the GDScript contract tests, a headless editor import, and a
main-scene boot. Set `GODOT_BIN` if Godot is not on `PATH`.

Open `project.godot` to run the minimal controller-driven scene. A production
web package must set a reviewed exact console origin in host-owned
configuration and construct `VcgMotionWebBridge` with that value. Do not accept
the target origin from an arbitrary URL parameter.

The checked-in `export_presets.cfg` defines release presets for unthreaded Web,
Linux x86-64, and Linux ARM64. Generated files go under the repository's
ignored `artifacts/godot-motion` directory:

```powershell
pnpm exec tsx scripts/generate-godot-export-evidence.mjs
pnpm validate:godot-exports
```

The dated generator requires exact Godot `4.7.1.stable` templates. It verifies
the official 1,280,486,955-byte archive identity and every selected installed
template before exporting.

Web builds publish a closed `globalThis.__vcgGodotExportProbe` snapshot with
only schema version, lane, stance, score, input source, and status. This makes
the browser export's initial state and fallback actions observable without
exposing player, camera, or Motion data. It is test instrumentation, not a
game-readiness or launcher-authority signal.

The web adapter requires `body.core17`, treats `actions.obstacle.v1` as
optional, binds welcome/health/frame messages to bridge v2 and Motion API 0.4,
and acknowledges only a successfully consumed exact frame sequence. The game
uses all 17 named portable landmarks, triggers gameplay only on obstacle
`triggered` actions, and ignores shell actions.

This sample does not implement native IPC. Native Godot must wait for I-074 to
select and measure the local transport; do not substitute an unauthenticated
ad hoc socket. Headless tests validate the GDScript consumer, replay ordering,
raw-frame denial, controller recovery, and non-web live-bridge denial. The
dated desk evidence proves three release exports, a Chrome web load with
keyboard fallback, ELF architecture identity, and a WSL2 x86-64 headless boot.
It does not prove physical gamepad input, live Motion negotiation, target
Linux/ARM64 execution, package launch, or latency qualification.
