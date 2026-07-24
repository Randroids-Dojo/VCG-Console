# Signed installed-package catalog

Last updated: 2026-07-24

This document defines the host-owned trust bridge from an approved installed package to the local launcher and native launch coordinator. The companion [signed package generation store](PACKAGE_GENERATION_STORE.md) supplies signed staging, candidate health gating, monotonic activation, interruption recovery, and the preferred launcher startup source; downloader, uninstall, and target qualification remain separate.

The implemented slice can:

- load one bounded catalog only after its exact bytes meet the delegated
  channel/installed-catalog/target threshold in a bootstrapped update root;
- reject the document before JSON parsing when its signature fails;
- validate target, generation, qualification, identifiers, hashes, and relative paths;
- bind one installed game manifest to the signed package identity, version, runtime, and qualification;
- resolve a fixed `{gameId, profileId}` intent into a trusted Libretro or
  native runtime request;
- disclose only bounded id, version, runtime, and catalog-generation inventory to the authenticated trusted launcher;
- start the resolved child only when the profile ID is in the host-owned allowlist.

The launcher CLI cannot yet download, update, revoke, roll back, or uninstall; it also cannot prove window readiness, clean escaped descendants after restart, or provide target-Linux containment. Package installation currently exists as a separate signature-first inert staging and generation-promotion boundary. Catalog-only configuration continues to stop at `PACKAGE_LAUNCH_PENDING`; adding host profile IDs plus a durable replay root enables the separate launch lifecycle.

## Host configuration

`vcg-host launcher` accepts the catalog only as an all-or-nothing privileged configuration:

```text
--catalog <absolute-catalog-path>
--catalog-signature <absolute-signature-bundle-path>
--install-root <absolute-installed-package-root>
--update-root-store <absolute-accepted-root-store-path>
--update-root-anchors <absolute-out-of-band-anchor-set-path>
--update-root-protected-state <absolute-protected-state-path>
--update-channel <host-selected-channel>
--trusted-unix-seconds <trusted-time-snapshot>
--runtime-root <absolute-ephemeral-runtime-root>
--data-root <absolute-persistent-data-root>
[--content-root <absolute-managed-retro-content-root>]
[--profile-id <host-owned-profile-id>]...
[--watchdog-game-id <installed-game-id>]...
```

As an alternative to `--catalog`, `--catalog-signature`, and `--install-root`,
the launcher accepts `--package-store-root <absolute-root>` with the same update
trust, runtime, data, optional content, profile, and watchdog options. The two
source modes cannot be mixed. Normal store-backed startup completes valid
interrupted promotion before loading the active delegated catalog; dry-run
never performs recovery and fails if recovery is pending. See [the
generation-store contract](PACKAGE_GENERATION_STORE.md).

The paths come from service/image configuration, never from Svelte, a game, a public manifest, or a hosted origin. A partial catalog configuration fails before Chromium starts. Dry-run mode verifies the catalog and prints generation, target, and only the counts of configured profiles and watchdog games.

Without `--profile-id`, the API exposes metadata only. With one or more unique bounded IDs, it also advertises `trusted-package-launch`; submitted profile IDs must exactly match that host allowlist. The current Svelte profile IDs are desk-prototype identifiers and are not yet a persisted native profile registry.

An optional watchdog game must name a package in the verified installed catalog. It is privileged host configuration, not browser or public-manifest metadata, and means that game's exact qualified runtime producer must satisfy the bounded heartbeat contract for every player profile.

The production loader has no single-public-key entry point. It retains the
accepted root generation, channel, target, artifact family, and signer IDs with
the parsed catalog. The launcher replays every stored root transition before
creating this policy. Normal startup recovers only unpublished root directories
first; dry-run refuses pending root recovery. The CLI representation does not
itself prove that the anchor file, exact root-state document, or time snapshot
came from protected storage. Target images still need verified provisioning
plus protected state/time adapters under I-112/I-141. A writable anchor or
protected-state file beside writable history is not a production trust root.

## Signature envelope

- Algorithm: Ed25519.
- Authority: the exact `channel`/`installed-catalog`/compiled-target role in the
  accepted update root.
- Signature bundle: strict JSON
  `{"schemaVersion":1,"signatures":[{"keyId":"...","signature":"<128 lowercase hex>"}]}`
  with unique key IDs, 1–32 entries, no unknown fields, and at most 32 KiB.
- Signed message: the ASCII/domain-separation prefix `VCG-INSTALLED-CATALOG-V1` followed by one NUL byte and then the exact catalog file bytes.
- Catalog limit: 1 MiB.
- Package limit: 1,024.

Signature verification occurs before JSON parsing. Whitespace or field-order changes alter the signed bytes and require a new signature.

## Catalog schema version 1

The top-level document rejects unknown fields:

```json
{
  "schemaVersion": 1,
  "generation": 7,
  "target": "x86_64-linux",
  "packages": [
    {
      "id": "retro-2048",
      "version": "1.0.0",
      "qualification": "qualified",
      "runtime": "libretro",
      "manifest": {
        "path": "games/retro-2048/vcg-game.json",
        "sha256": "<64 lowercase hex>"
      },
      "libretro": {
        "frontend": {
          "path": "runtimes/retroarch/retroarch",
          "sha256": "<64 lowercase hex>"
        },
        "core": {
          "path": "cores/2048_libretro.so",
          "sha256": "<64 lowercase hex>"
        },
        "baseConfig": {
          "path": "runtimes/retroarch/vcg-base.cfg",
          "sha256": "<64 lowercase hex>"
        },
        "content": {
          "mode": "none"
        }
      }
    }
  ]
}
```

Managed content uses:

```json
{
  "mode": "managed",
  "path": "system/content-id/game.rom",
  "sha256": "<64 lowercase hex>"
}
```

Rules:

- `schemaVersion` is exactly `1`.
- `generation` is greater than zero. It is exposed for a future monotonic anti-rollback store; this slice does not persist or enforce the highest accepted generation.
- `target` exactly matches the compiled Rust `<architecture>-<operating-system>` pair.
- Package IDs are unique bounded lowercase package IDs. One catalog contains at most one active version of an ID.
- Version text is 1–128 visible ASCII characters.
- Only `qualification: qualified` is accepted.
- The implemented runtimes are `libretro` and `native`.
- A `libretro` entry requires exactly its `libretro` record and rejects a
  `native` record. A `native` entry requires exactly
  `native.executable.{path,sha256}` and rejects a `libretro` record.
- Every catalog path is a non-empty relative normal path with no root, prefix, `.` or `..` component.
- Hashes are canonical lowercase SHA-256.
- A managed content record requires a configured managed content root.

## Resolution and integrity

`resolve(gameId, profileId)` validates both browser-safe IDs and finds exactly one signed package. It then:

1. resolves the bound manifest beneath the canonical install root;
2. verifies the full manifest SHA-256;
3. requires manifest schema `1` and exact signed id, version, selected runtime,
   and `qualified` status;
4. resolves runtime-specific signed records;
5. creates a `RetroArchRequest` or `NativePackageRequest` from host-owned roots
   and signed relative paths;
6. lets the selected adapter canonicalize and verify every executable/runtime
   artifact immediately before it creates runtime state.

The base-configuration digest is now required by the direct `vcg-host retroarch` CLI as well as by catalog resolution.

The native authority also re-hashes the bound manifest before interpreting its
1,000–120,000 ms launch timeout and local `process` or `explicit-ready` health
kind. It rejects HTTP/unknown health for both installed runtime lanes. These
signed fields drive candidate promotion health; they remain distinct from
watchdog heartbeat and compositor/window readiness.

Path canonicalization and repeated hashes narrow substitution risk, but target qualification still requires immutable package/content mounts or file-descriptor-bound execution and handoff. A compromised account able to rewrite artifacts between verification and process use can otherwise race path-based verification.

## Launcher API

When a catalog is configured, `/v1/status` adds `trusted-package-catalog` to its capabilities.

`GET /v1/packages` and `GET /v1/packages/<game-id>` use the same per-launch bearer capability, exact launcher origin, bounded request handling, and no-store response as status. A single-item success discloses only:

```json
{
  "id": "retro-2048",
  "version": "1.0.0",
  "runtime": "libretro",
  "catalogGeneration": 7
}
```

Missing packages return `404 PACKAGE_NOT_INSTALLED`; invalid IDs return `400 PACKAGE_ID_INVALID`. Paths, hashes, keys, permissions, environment, command lines, and writable roots never cross these endpoints.

The inventory response moves the shared positive catalog generation to the document root and returns every package's id, version, and runtime in canonical ID order. Catalog load already limits the signed set to 1,024 entries. The TypeScript consumer additionally requires the exact protocol and fields, positive safe generation, at most 1,024 unique strictly increasing IDs, the bounded ID/version grammar, known runtime values, and no more than 1 MiB of UTF-8 JSON. A missing catalog returns no inventory.

These metadata lookups prove only that a valid signed catalog contains each entry. They let the launcher reconcile public presentation with actual installed availability without probing a copied ID list. The shell labels a public entry installed only after exact ID/version/runtime matching, keeps unknown or release-mismatched installed entries out of the public catalog, and reports an unavailable host/catalog instead of claiming an empty library. `POST /v1/launches` separately triggers host-owned artifact/manifest verification and direct process start from fixed game/profile intent. See [the native launcher-host API contract](NATIVE_HOST_API.md) for idempotency, lifecycle, cancellation, and current readiness limits.

## Evidence and remaining boundary

Native tests cover delegated authority before parsing and retained role
evidence, valid signed Libretro/native resolution, runtime-record confusion,
changed/cross-role signature denial, wrong target, unknown fields, duplicates,
unsafe paths, malformed trust material, oversized catalogs, invalid launcher
IDs, missing packages, canonical summaries, manifest tamper and runtime
misbinding, executable/base-config tamper at adapter use, shared plan dispatch,
profile allowlisting, candidate-health isolation, and lifecycle preparation.
Host-API tests verify conditional capabilities and metadata-only inventory
disclosure. TypeScript tests reject duplicate, unsorted, excessive,
version-mismatched, unknown-field, and otherwise malformed inventories.
Playwright tests verify signed availability labeling and fixed-intent requests
with no browser-provided path, hash, program, command, environment, or root
fields.

See [the native package runtime adapter](NATIVE_PACKAGE_RUNTIME.md) for its
storage contract and explicit process-only security boundary.

Still required:

- protected anchor/root-history provisioning, secure refreshed time, and witnessed rotation/revocation recovery;
- protected per-channel monotonic generation policy, authenticated recovery, and target power-loss qualification;
- immutable or descriptor-bound artifact use;
- production service-manager cleanup acknowledgement, boot-scoped replay retention, and target-filesystem durability qualification;
- qualified heartbeat producers, window readiness events, compositor containment, reserved Home/Back, and target-Linux sandboxing;
- update and removal cleanup plus architecture-parity evidence.
