# VCG Host

`vcg-host` is the Rust boundary for privileged console behavior. The Svelte launcher and games remain clients of versioned contracts; they do not own global input, child-process recovery, operating-system settings, or raw camera frames.

The first scaffold deliberately implements only direct child-process supervision and the canonical input boundary. It does not claim SDL3, compositor, origin-containment, readiness, RetroArch, Wi-Fi, storage, or tracker qualification yet.

## Commands

```sh
cargo run -p vcg-host -- doctor
cargo run -p vcg-host -- supervise --dry-run -- /path/to/program argument
cargo run -p vcg-host -- supervise -- /path/to/program argument
```

`supervise` invokes the selected executable directly and never passes arguments through a shell. A managed child is killed and reaped if its Rust supervisor is dropped before normal exit.

## Boundary

- `input`: language-neutral shell actions and the adapter trait that SDL3 will implement.
- `process`: direct process launch, observation, termination, and cleanup.
- future adapters: SDL3, compositor recovery controls, browser containment, system services, RetroArch, and native tracking.

The current Rust SDL3 bindings are intentionally not a core dependency. They still document incomplete SDL3 migration and missing features. Pin and qualify the adapter against exact Linux hardware without allowing binding-specific types to escape into the host contracts.
