# VCG Host

`vcg-host` is the Rust boundary for privileged console behavior. The Svelte launcher and games remain clients of versioned contracts; they do not own global input, child-process recovery, operating-system settings, or raw camera frames.

The host implements direct child-process supervision, bounded heartbeat recovery, an operating-system resource-fault boundary, the canonical input boundary, and a contained RetroArch launch adapter. It does not yet claim SDL3, compositor, origin-containment, RetroArch artifact/window qualification, Wi-Fi, general storage services, tracker, or target-Linux resource-detector qualification.

## Commands

```sh
cargo run -p vcg-host -- doctor
cargo run -p vcg-host -- supervise --dry-run -- /path/to/program argument
cargo run -p vcg-host -- supervise -- /path/to/program argument
cargo run -p vcg-host -- watchdog --dry-run \
  --heartbeat-file /host/runtime/game.heartbeat \
  --fault-file /host/runtime/game.fault \
  -- /path/to/program argument
cargo run -p vcg-host -- retroarch --dry-run \
  --install-root /var/lib/vcg/packages \
  --runtime-root /run/vcg \
  --data-root /var/lib/vcg \
  --frontend /var/lib/vcg/packages/retroarch/retroarch \
  --core /var/lib/vcg/packages/cores/2048_libretro.so \
  --base-config /var/lib/vcg/packages/retroarch/vcg-base.cfg \
  --profile player-one \
  --game retro-2048
```

`supervise` invokes the selected executable directly and never passes arguments through a shell. A managed child is killed and reaped if its Rust supervisor is dropped before normal exit.

`watchdog` additionally owns startup and heartbeat timeouts, force-reaps an unhealthy child, and performs one bounded restart by default. It passes only the host-selected heartbeat path to the child through `VCG_HEARTBEAT_FILE`; a separate trusted operating-system adapter owns the optional resource-fault path. See [the native watchdog contract](../../docs/NATIVE_WATCHDOG.md) before integrating a wrapper.

`retroarch` accepts only artifacts below the console package root and content below the optional console content root. It generates a private per-session append configuration, separates saves/states/remaps by profile and game, disables mutable/network-facing menu features, and launches RetroArch directly. See [the RetroArch integration contract](../../docs/RETROARCH_INTEGRATION.md). Current readiness is process-only; a compositor/window probe must be added before hang recovery can be claimed.

## Boundary

- `input`: language-neutral shell actions and the adapter trait that SDL3 will implement.
- `process`: direct process launch, observation, heartbeat/resource-fault supervision, bounded restart, termination, and cleanup.
- `retroarch`: installed-artifact/content containment, per-profile storage, generated family-mode configuration, direct launch, and stable lifecycle lines.
- future adapters: SDL3, compositor recovery controls and readiness, browser containment, system services, and native tracking.

The current Rust SDL3 bindings are intentionally not a core dependency. They still document incomplete SDL3 migration and missing features. Pin and qualify the adapter against exact Linux hardware without allowing binding-specific types to escape into the host contracts.
