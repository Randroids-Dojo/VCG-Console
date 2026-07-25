# VCG Host

`vcg-host` is the Rust boundary for privileged console behavior. The Svelte launcher and games remain clients of versioned contracts; they do not own global input, child-process recovery, operating-system settings, or raw camera frames.

The host implements direct child-process supervision, bounded heartbeat recovery, an operating-system resource-fault boundary, a bounded platform-neutral controller lifecycle/edge registry, an authenticated launcher channel, strict protected-state developer-workstation trust and volatile signed-session admission, exact inert developer-only artifact receipt, durable resumable production-package receipt, signature-first bounded package and system-image intake, strict installed-package resolution, crash-recoverable exact protected-state package-generation activation, strict persistent opaque profile intake, idempotent profile-allowlisted launch/cancel lifecycle, crash-recoverable exact protected-state A/B system-update metadata, threshold root/delegated system-image/catalog/release authority, launcher-integrated crash-recoverable accepted-root history, bounded storage-layout/capacity planning, a contained RetroArch launch adapter, and a signed process-only native-executable adapter. It does not yet claim a qualified platform mechanism or provenance for developer/update-root/package-generation/system-update protected state and trusted time, a paired-LAN listener or encrypted transport, protected developer private keys, a developer archive/install/runtime/retention service, a repository/downloader/block-device writer, physical partitioner/mounter, bootloader adapter, SDL3, compositor-reserved input, compositor readiness, navigation containment, a qualified profile writer/deletion lifecycle, native/RetroArch artifact and window qualification, OS sandboxing, environment/device/network filtering, Wi-Fi, general storage services, tracker, or target-Linux resource-detector qualification.

## Commands

```sh
cargo run -p vcg-host -- doctor
cargo run -p vcg-host -- launcher --windowed \
  --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  --profile-dir "C:\Users\<you>\AppData\Local\VCG-Console\browser-profile" \
  --url http://127.0.0.1:5173/
# Add the signed-catalog/root options documented below, then include:
#   --launch-replay-root /var/lib/vcg/launch-replay
# and provide:
#   --profile-registry /var/lib/vcg/profiles.json
# to enable native package launch for its validated host-owned profiles.
# Repeated --profile-id is a development-only fallback.
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

Add the all-or-nothing `--catalog`, `--catalog-signature`, `--install-root`,
`--update-root-store`, `--update-root-anchors`,
`--update-root-protected-state`, `--update-channel`,
`--trusted-unix-seconds`, `--runtime-root`, and `--data-root` launcher options
(plus `--content-root` when needed) to expose delegated signed-package
metadata. These paths and policy values are privileged integration
configuration, not launcher input. Their CLI presence does not prove protected
anchor, exact protected-root-state, or trusted-time provisioning. Normal startup
recovers only unpublished root directories before replay; `--dry-run` refuses
pending root recovery. Bootstrap and rotation are separate privileged
`update-root` commands documented in
[the accepted-root store contract](../../docs/UPDATE_ROOT_STORE.md). See the
[signed installed-package catalog contract](../../docs/INSTALLED_PACKAGE_CATALOG.md).
Add an absolute `--launch-replay-root <path>` and a strict
`--profile-registry <path>` to enable `trusted-package-launch` for exactly its
validated host-owned opaque IDs. Repeated `--profile-id` remains a mutually
exclusive development fallback. An empty registry leaves the catalog
discovery-only. This CLI path currently reads legacy unprotected v1. The
library separately validates canonical protected v2 with exact external
identity/generation/digest state and withholds a one-step publication until
that state commits; platform protection, migration, and launcher wiring remain
absent. See the
[profile-registry contract](../../docs/PROFILE_REGISTRY.md) and
[native launch lifecycle contract](../../docs/NATIVE_LAUNCH_LIFECYCLE.md).
The host durably accepts each launch before execution and replays retained
terminal requests across restart. Recovered nonterminal work becomes
indeterminate and blocks fresh execution. A persistent service issues an opaque
request for its exact in-process cleanup barrier; only a closed privileged
adapter result of `Empty` creates the non-serializable proof consumed by
acknowledgement. The browser has no request/proof/acknowledgement route. See
the [restart-cleanup proof contract](../../docs/RESTART_CLEANUP_PROOF.md).
A production service-manager/cgroup adapter and boot-retention policy remain
required.
The library's `power` coordinator now closes fresh native launch admission
before any quiescence adapter runs, serializes that closure against both direct
and watchdog process activation, binds every gate and platform handoff to one
epoch/operation/deadline, and reopens admission only after all exact wake
readiness gates complete. Its service, input, wake, and platform traits are
privileged adapter boundaries, not browser acknowledgements or working
systemd/firmware implementations. The launcher CLI and loopback API do not
expose this coordinator yet. See the
[power and recovery contract](../../docs/POWER_RECOVERY_STATE_MACHINE.md).
An optional repeated `--watchdog-game-id <opaque-id>` must name a package in the
verified installed catalog and applies bounded heartbeat/restart supervision to
that game for every player profile. Other games remain process-only when they
do not have a qualified heartbeat producer. A heartbeat still does not prove a
visible or usable window.

Signed installed entries may also select the `native` runtime. The host accepts
exactly one catalog-hashed executable, supplies no package-controlled
arguments, derives its working/runtime/data paths, and uses the same plan for
candidate health and live/watchdog preparation. This does not restrict ambient
filesystem, environment, network, device, or descendant access. See the
[native package runtime contract](../../docs/NATIVE_PACKAGE_RUNTIME.md).

`--package-store-root <absolute-path>` plus mandatory
`--package-protected-state <absolute-platform-state-path>` may replace the loose
`--catalog`, `--catalog-signature`, and `--install-root` inputs. Normal startup
completes a valid interrupted promotion and re-verifies that the active
generation exactly matches protected channel, target, generation, and catalog
digest before the API or browser starts. Pending commit, rollback/deletion,
substitution, and scope mismatch fail closed; launcher startup never commits
protected state. `--dry-run` never mutates package state and fails if recovery
is pending. The provisioned store must include the inert regular
`.vcg-package-store.lock`; cooperating staging, promotion, recovery, and
cleanup-planning operations take it nonblockingly. The store and loose source
modes cannot be combined. See the
[signed generation-store contract](../../docs/PACKAGE_GENERATION_STORE.md) and
[protected-state adapter contract](../../docs/PACKAGE_GENERATION_PROTECTED_STATE.md).

`supervise` invokes the selected executable directly and never passes arguments through a shell. A managed child is killed and reaped if its Rust supervisor is dropped before normal exit.

`watchdog` additionally owns startup and heartbeat timeouts, force-reaps an unhealthy child, and performs one bounded restart by default. It passes only the host-selected heartbeat path to the child through `VCG_HEARTBEAT_FILE`; a separate trusted operating-system adapter owns the optional resource-fault path. See [the native watchdog contract](../../docs/NATIVE_WATCHDOG.md) before integrating a wrapper.

`retroarch` accepts only artifacts below the console package root and content below the optional console content root. It verifies the exact signed SHA-256 for the frontend, core, base configuration, and managed content before creating runtime state. It then generates a private per-session append configuration, separates saves/states/remaps by profile and game, disables mutable/network-facing menu features, and launches RetroArch directly. See [the RetroArch integration contract](../../docs/RETROARCH_INTEGRATION.md). Direct RetroArch remains process-only unless the signed frontend is a host-qualified cooperative wrapper for a watchdog game. A compositor/window probe is still required before readiness can be claimed.

## Boundary

- `developer_artifact`: consumes one authorized Push into a non-cloneable
  transfer that shares volatile session liveness, receives bounded retryable
  same-process chunks, supports exact cancellation, verifies incremental and
  full-readback SHA-256, atomically publishes a canonical path-free receipt
  plus inert developer-only blob only while live, fully revalidates a retained
  handle, blocks durable request replay, and explicitly removes only safe
  incomplete staging. It selects no transport/archive or durable resume,
  extracts nothing, installs nothing, grants no production authority, executes
  nothing, and has no retention/removal policy.
- `developer_pairing`: strict canonical key-derived workstation registry,
  exact external generation/digest protection, two-phase pair/revoke
  transitions, volatile Ed25519 possession challenges, shared operation
  liveness through close/drop/expiry, and replay-bounded
  Push/Launch/ReadLogs/Restart/Rollback admission. It opens no listener,
  protects no private key, encrypts no traffic, installs no artifact, and
  executes no operation.
- `input`: language-neutral shell actions, transactional bounded standard
  button/axis mapping with hysteresis, controller reconciliation, opaque
  session IDs, mapping confidence, deterministic edges/releases, and the
  complete-snapshot adapter trait that SDL3 will implement.
- `process`: direct process launch, observation, heartbeat/resource-fault
  supervision, bounded restart, termination, cleanup, and a host-owned atomic
  watchdog launch boundary used to close power admission before another
  attempt can spawn.
- `power`: non-serializable native idle/wake/restart/shutdown coordination,
  exact epoch/operation/deadline binding, launch-admission-first ordering,
  closed privileged service/input/wake/platform adapters, terminal ambiguity,
  and exact wake-only admission reopen. It implements no OS, hardware, IPC, or
  boot-recovery adapter.
- `host_api`: per-launch authenticated loopback status, package lookup, lifecycle operations, exact-origin CORS, protocol/capability discovery, and bounded HTTP parsing.
- `installed_catalog`: signature-first installed metadata, signed health-policy validation, and host-owned package resolution from fixed game/profile IDs.
- `package_launch`: shared Libretro/native dispatch for candidate health and
  live/watchdog lifecycle preparation.
- `native_package`: catalog-hashed direct executable planning plus host-derived
  per-profile runtime/data storage; process-only, with no OS sandbox claim.
- `package_health`: save-isolated signed process/explicit-ready candidate execution with direct-child reaping and no compositor-readiness claim.
- `save_lifecycle`: pure bounded planning for per-game/per-owner runtime namespaces, separate save/cache quotas, local reset scope, staged format migration, and profile-to-unassigned ownership transitions. It performs no filesystem mutation or network operation.
- `storage_layout`: aligned boot/equal read-only A/B/writable-data planning, fixed data namespaces, recovery-headroom admission, sealed inactive-image fit, and explicit cleanup/reset scope. It performs no partition, filesystem, mount, reservation, or deletion operation.
- `system_image`: delegated channel/system-image/target threshold verification before manifest parsing, retained exact source-handle hashing, and sealed journal evidence after a privileged inactive-slot read-back stream matches. It performs no download, decompression, partition write/synchronization, reader-provenance proof, boot control, or migration.
- `system_update`: hash-linked two-slot update state, inactive-only staging, bounded durably consumed boot attempts, same-attempt six-gate health confirmation, automatic rollback metadata, and deterministic temporary-record recovery. It performs no signature verification, image/partition write, bootloader mutation, migration, or user-data operation.
- `update_trust`: bounded serialized out-of-band anchor/signature inputs, root bootstrap, exact old-and-new-threshold generation rotation, expiry, non-reused channel/artifact/target roles, fixed signature domains, and delegated threshold authorization for system images, installed catalogs, and package releases. It does not protect anchor provenance, establish or refresh trusted time, fetch repository metadata, or itself persist/recover history.
- `update_root_store`: append-only exact-byte root/signature history,
  signature-chain replay, final expiry/exact protected-state enforcement,
  two-phase commit gating, atomic generation-directory publication,
  nonblocking serialization, and explicit unpublished-directory recovery. The
  launcher replays it before package or browser startup, but the module does
  not establish protected-state, anchor, or time provenance.
- `package_transfer`: exclusively locked exact-offset archive receipt, byte-identical replay, restart resume, remaining-byte capacity checks, full-hash verification, and no-replace ready publication.
- `package_intake`: signature-first release admission, capacity checks, exact archive/catalog evidence, and bounded portable regular-files-only TAR extraction.
- `package_generation`: receiver-locked ready-archive intake, serialized
  verify-before-intent and verify-after-move signed generation activation,
  exact externally protected channel/target/generation/catalog-digest gating,
  deterministic interrupted-promotion recovery, and launch-frozen path-free
  retention planning and explicit cleanup.
- `native_launch`: profile-allowlisted durable idempotent intent, one active
  child, bounded append-only replay, restart-indeterminate cleanup barrier,
  optional game-bound watchdog recovery, polling, cancellation, shutdown
  cleanup, and a fail-closed non-droppable power-admission closure serialized
  against direct and watchdog process activation.
- `restart_cleanup`: opaque exact-service barrier requests, one closed
  privileged `Empty`/`NotEmpty`/`Unavailable` inspection, and a consumed
  non-serializable proof required by cleanup acknowledgement. It contains no
  service-manager/cgroup implementation and grants no browser/game authority.
- `retro_import`: exact-intent-authorized plain-file copy from an opened host
  handle, streaming SHA-256, pluggable exact-subject scan evidence,
  same-filesystem no-replace content publication, append-only installed-library
  generations, path-free install/reuse/cancel audit records, exact object
  revalidation, replacement cleanup, post-expiry cancellation, nonblocking
  serialization, storage-namespace-derived roots, recovery-aware path-free
  library snapshots, and deterministic interruption recovery. It implements
  neither USB/LAN acquisition nor a scanner or archive decoder.
- `retroarch`: installed-artifact/content containment and SHA-256 verification, per-profile storage, generated family-mode configuration, direct launch, and stable lifecycle lines.
- future adapters: SDL3, compositor recovery controls and readiness, browser containment, system services, and native tracking.

The current Rust SDL3 bindings are intentionally not a core dependency. They still document incomplete SDL3 migration and missing features. Pin and qualify the adapter against exact Linux hardware without allowing binding-specific types to escape into the host contracts.
