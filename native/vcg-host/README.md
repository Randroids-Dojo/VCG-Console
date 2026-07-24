# VCG Host

`vcg-host` is the Rust boundary for privileged console behavior. The Svelte launcher and games remain clients of versioned contracts; they do not own global input, child-process recovery, operating-system settings, or raw camera frames.

The host implements direct child-process supervision, bounded heartbeat recovery, an operating-system resource-fault boundary, a bounded platform-neutral controller lifecycle/edge registry, an authenticated launcher channel, durable resumable package receipt, signature-first bounded package and system-image intake, strict installed-package resolution, crash-recoverable package-generation activation, idempotent profile-allowlisted launch/cancel lifecycle, crash-recoverable A/B system-update metadata, threshold root/delegated image authority, bounded storage-layout/capacity planning, and a contained RetroArch launch adapter. It does not yet claim protected update-root/time persistence, a repository/downloader/block-device writer, physical partitioner/mounter, bootloader adapter, package-role integration, SDL3, compositor-reserved input, compositor readiness, navigation containment, persistent profile storage, RetroArch artifact/window qualification, Wi-Fi, general storage services, tracker, or target-Linux resource-detector qualification.

## Commands

```sh
cargo run -p vcg-host -- doctor
cargo run -p vcg-host -- launcher --windowed \
  --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  --profile-dir "C:\Users\<you>\AppData\Local\VCG-Console\browser-profile" \
  --url http://127.0.0.1:5173/
# Add the signed-catalog/root options documented below, then include:
#   --launch-replay-root /var/lib/vcg/launch-replay
# and repeat:
#   --profile-id profile-randy
# to enable native package launch for that host-owned profile.
# Add a signed installed game ID with:
#   --watchdog-game-id retro-2048
# only when that game's trusted wrapper implements the heartbeat contract.
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
  --frontend-sha256 <manifest-sha256> \
  --core /var/lib/vcg/packages/cores/2048_libretro.so \
  --core-sha256 <manifest-sha256> \
  --base-config /var/lib/vcg/packages/retroarch/vcg-base.cfg \
  --base-config-sha256 <manifest-sha256> \
  --profile player-one \
  --game retro-2048
```

`launcher` is the first native-host entry point for the existing local console
surface. It accepts only an explicit loopback HTTP URL, uses a dedicated
Chromium profile, launches app mode directly without shell interpretation, and
keeps the Rust host attached to the browser lifecycle. Start the local Vite
server first during desk development. Omit `--windowed` for fullscreen. For a
real launch, the host also binds an ephemeral IPv4-loopback status endpoint,
mints a 256-bit per-launch bearer capability, and passes only its port and token
in the app URL fragment. The launcher checks the protocol and host capabilities
before attempting a native or RetroArch handoff. See the
[native launcher-host API contract](../../docs/NATIVE_HOST_API.md).

Add the all-or-nothing `--catalog`, `--catalog-signature`,
`--catalog-public-key`, `--install-root`, `--runtime-root`, and `--data-root`
launcher options (plus `--content-root` when needed) to expose signed
installed-package metadata. These paths are privileged service configuration,
not launcher input. See the
[signed installed-package catalog contract](../../docs/INSTALLED_PACKAGE_CATALOG.md).
Add an absolute `--launch-replay-root <path>` and one or more repeated
`--profile-id <opaque-id>` options to enable
`trusted-package-launch` for exactly those host-owned profiles. With no profile
IDs, the same catalog remains discovery-only. See the
[native launch lifecycle contract](../../docs/NATIVE_LAUNCH_LIFECYCLE.md).
The host durably accepts each launch before execution and replays retained
terminal requests across restart. Recovered nonterminal work becomes
indeterminate and blocks fresh execution until trusted native service code
proves the old process group empty and acknowledges cleanup. This
acknowledgement is intentionally absent from the browser API; a production
service-manager/cgroup adapter and boot-retention policy remain required.
An optional repeated `--watchdog-game-id <opaque-id>` must name a package in the
verified installed catalog and applies bounded heartbeat/restart supervision to
that game for every player profile. Other games remain process-only when they
do not have a qualified heartbeat producer. A heartbeat still does not prove a
visible or usable window.

`--package-store-root <absolute-path>` may replace the loose `--catalog`,
`--catalog-signature`, and `--install-root` inputs. Normal startup completes a
valid interrupted promotion and re-verifies the active generation before the
API or browser starts. `--dry-run` never mutates package state and fails if
recovery is pending. The provisioned store must include the inert regular
`.vcg-package-store.lock`; cooperating staging, promotion, recovery, and
cleanup-planning operations take it nonblockingly. The store and loose source
modes cannot be combined. See
the [signed generation-store contract](../../docs/PACKAGE_GENERATION_STORE.md).

`supervise` invokes the selected executable directly and never passes arguments through a shell. A managed child is killed and reaped if its Rust supervisor is dropped before normal exit.

`watchdog` additionally owns startup and heartbeat timeouts, force-reaps an unhealthy child, and performs one bounded restart by default. It passes only the host-selected heartbeat path to the child through `VCG_HEARTBEAT_FILE`; a separate trusted operating-system adapter owns the optional resource-fault path. See [the native watchdog contract](../../docs/NATIVE_WATCHDOG.md) before integrating a wrapper.

`retroarch` accepts only artifacts below the console package root and content below the optional console content root. It verifies the exact signed SHA-256 for the frontend, core, base configuration, and managed content before creating runtime state. It then generates a private per-session append configuration, separates saves/states/remaps by profile and game, disables mutable/network-facing menu features, and launches RetroArch directly. See [the RetroArch integration contract](../../docs/RETROARCH_INTEGRATION.md). Direct RetroArch remains process-only unless the signed frontend is a host-qualified cooperative wrapper for a watchdog game. A compositor/window probe is still required before readiness can be claimed.

## Boundary

- `input`: language-neutral shell actions, transactional bounded controller reconciliation, opaque session IDs, mapping confidence, deterministic edges/releases, and the complete-snapshot adapter trait that SDL3 will implement.
- `process`: direct process launch, observation, heartbeat/resource-fault supervision, bounded restart, termination, and cleanup.
- `host_api`: per-launch authenticated loopback status, package lookup, lifecycle operations, exact-origin CORS, protocol/capability discovery, and bounded HTTP parsing.
- `installed_catalog`: signature-first installed metadata, signed health-policy validation, and host-owned package resolution from fixed game/profile IDs.
- `package_health`: save-isolated signed process/explicit-ready candidate execution with direct-child reaping and no compositor-readiness claim.
- `save_lifecycle`: pure bounded planning for per-game/per-owner runtime namespaces, separate save/cache quotas, local reset scope, staged format migration, and profile-to-unassigned ownership transitions. It performs no filesystem mutation or network operation.
- `storage_layout`: aligned boot/equal read-only A/B/writable-data planning, fixed data namespaces, recovery-headroom admission, sealed inactive-image fit, and explicit cleanup/reset scope. It performs no partition, filesystem, mount, reservation, or deletion operation.
- `system_image`: delegated channel/system-image/target threshold verification before manifest parsing, retained exact source-handle hashing, and sealed journal evidence after a privileged inactive-slot read-back stream matches. It performs no download, decompression, partition write/synchronization, reader-provenance proof, boot control, or migration.
- `system_update`: hash-linked two-slot update state, inactive-only staging, bounded durably consumed boot attempts, same-attempt six-gate health confirmation, automatic rollback metadata, and deterministic temporary-record recovery. It performs no signature verification, image/partition write, bootloader mutation, migration, or user-data operation.
- `update_trust`: bounded out-of-band root bootstrap, exact old-and-new-threshold generation rotation, expiry, non-reused channel/artifact/target roles, fixed signature domains, and delegated threshold authorization. It does not provision anchors, establish trusted time, persist root history, fetch repository metadata, wire package loaders, or perform recovery.
- `package_transfer`: exclusively locked exact-offset archive receipt, byte-identical replay, restart resume, remaining-byte capacity checks, full-hash verification, and no-replace ready publication.
- `package_intake`: signature-first release admission, capacity checks, exact archive/catalog evidence, and bounded portable regular-files-only TAR extraction.
- `package_generation`: receiver-locked ready-archive intake, serialized verify-before-intent and verify-after-move signed generation activation, deterministic interrupted-promotion recovery, and launch-frozen path-free read-only retention planning.
- `native_launch`: profile-allowlisted durable idempotent intent, one active child, bounded append-only replay, restart-indeterminate cleanup barrier, optional game-bound watchdog recovery, polling, cancellation, and shutdown cleanup.
- `retroarch`: installed-artifact/content containment and SHA-256 verification, per-profile storage, generated family-mode configuration, direct launch, and stable lifecycle lines.
- future adapters: SDL3, compositor recovery controls and readiness, browser containment, system services, and native tracking.

The current Rust SDL3 bindings are intentionally not a core dependency. They still document incomplete SDL3 migration and missing features. Pin and qualify the adapter against exact Linux hardware without allowing binding-specific types to escape into the host contracts.
