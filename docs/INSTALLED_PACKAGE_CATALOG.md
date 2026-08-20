# Signed installed-package catalog

Last updated: 2026-08-19

This document defines the host-owned trust bridge from an approved installed package to the local launcher and native launch coordinator. The companion [signed package generation store](PACKAGE_GENERATION_STORE.md) supplies signed staging, candidate health gating, monotonic activation, interruption recovery, and the preferred launcher startup source; downloader, uninstall, and target qualification remain separate.

The implemented slice can:

- load one bounded catalog only after its exact bytes meet the delegated
  channel/installed-catalog/target threshold in a bootstrapped update root;
- reject the document before JSON parsing when its signature fails;
- validate target, generation, qualification, identifiers, hashes, and relative paths;
- hash every artifact the signed catalog binds — manifest, frontend, core,
  frontend auxiliary files, base configuration, managed content, and native
  executable — at launcher catalog load, in normal startup and `--dry-run`
  alike;
- bind one installed-root game manifest to the signed package identity, version, runtime, and qualification, rejecting any manifest that does not declare itself the installed-root document;
- resolve a fixed `{gameId, profileId}` intent, optionally carrying one
  host-published retro-library entry, into a trusted Libretro or native runtime
  request;
- disclose only bounded id, version, runtime, and catalog-generation inventory to the authenticated trusted launcher;
- start the resolved child only when the profile ID is in the host-owned
  allowlist and store-backed activation exactly matches externally protected
  channel/target/generation/catalog-digest state.

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
[--profile-registry <absolute-host-profile-registry> |
 --profile-id <development-profile-id>...]
[--launch-replay-root <absolute-replay-journal-root>]
[--retro-library-root <absolute-writable-data-root>]
[--watchdog-game-id <installed-game-id>]...
```

As an alternative to `--catalog`, `--catalog-signature`, and `--install-root`,
the launcher accepts `--package-store-root <absolute-root>` together with
mandatory `--package-protected-state <absolute-platform-state-path>` and the
same update trust, runtime, data, optional content, profile, and watchdog
options. The two source modes cannot be mixed, and loose-catalog mode rejects
package protected state. Normal store-backed startup completes valid
interrupted promotion only when writable history exactly matches protected
state; pending commit, rollback/deletion, substitution, or scope mismatch
prevents browser startup. See the
[generation-store contract](PACKAGE_GENERATION_STORE.md).

The paths come from service/image configuration, never from Svelte, a game, a public manifest, or a hosted origin. A partial catalog configuration fails before Chromium starts. Dry-run mode verifies the catalog and prints generation, target, and only the counts of configured profiles, watchdog games, and installed library entries.

Both modes verify the same artifacts. After the signed catalog is loaded — from
a loose catalog or from the generation store — the launcher streams every
artifact that catalog binds through SHA-256 before it serves anything or starts
Chromium. A changed artifact fails the whole load with the artifact role, its
path, the expected digest, and the actual digest, so `--dry-run` is an
integrity check rather than a configuration check and a tampered core cannot
wait until the first launch that resolves it to be caught. Measured on the Pi 5
target: the frontend and four cores total roughly 30 MB, against 1.5 GB hashed
in about a second. A `library` package binds no content file, so its
per-launch entry is verified at resolution instead.

`--retro-library-root` is optional: the console starts and serves its catalog
with no library configured, and then omits the `retro-library` capability.
Supplying it joins the same all-or-nothing group, so the rest of the catalog
configuration becomes mandatory. It names the writable data root that
`vcg-host retro-provision --writable-root` provisions, and the launcher opens
that store read-only and takes one snapshot at startup. A missing, unreadable,
malformed, or recovery-pending library fails before Chromium starts rather than
starting without it. The library combines with `--bluetoothctl` and
`--watchdog-game-id`: controller pairing is required to play a library entry,
and one launcher process serves every configured capability. See the
[retro import contract](RETRO_IMPORT_CONTRACT.md).

Normal launch authority comes from the strict bounded
`--profile-registry`. Repeated `--profile-id` is a mutually exclusive
development fallback. An empty registry or no profile source leaves the API
metadata-only. With one or more validated IDs, it also advertises
`trusted-package-launch`; submitted profile IDs must exactly match that host
allowlist. Registry validation happens before root/package recovery. See the
[persistent registry contract](PROFILE_REGISTRY.md).

An optional watchdog game must name a package in the verified installed catalog. It is privileged host configuration, not browser or public-manifest metadata, and means that game's exact qualified runtime producer must satisfy the bounded heartbeat contract for every player profile.

The production loader has no single-public-key entry point. It retains the
accepted root generation, channel, target, artifact family, and signer IDs with
the parsed catalog. The launcher replays every stored root transition before
creating this policy. Normal startup recovers only unpublished root directories
first; dry-run refuses pending root recovery. The CLI representation does not
itself prove that the anchor file, exact root-state document, or time snapshot
came from protected storage. Target images still need verified provisioning
plus protected state/time adapters under I-112/I-141. The same caveat applies
to package-generation protected state under D-161: a writable JSON file beside
writable history is not a production anti-rollback boundary.

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

Library content uses:

```json
{
  "mode": "library",
  "systemId": "nes",
  "coreId": "mesen"
}
```

`library` is how a package opts in to the operator's installed retro library.
It names no file: the record states only which library system and core the
package can run, and the host selects one entry per launch from the library it
published itself. This is the opt-in that makes `entryId` admissible, and it is
signed, so a package that binds one fixed managed file — or none — can never be
handed a library entry. The mode is libretro-only. Unlike `managed`, it does
not require a managed content root, because library objects live in the
console-managed retro object store rather than beneath that root.

Rules:

- `schemaVersion` is exactly `1`.
- `generation` is greater than zero. Generation-store mode binds the highest
  accepted generation and exact catalog digest to externally protected state;
  loose-catalog development mode has no persistent package anti-rollback
  history.
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
- A library content record requires `systemId` and `coreId` to use the bounded
  lowercase identifier grammar, and applies only to a `libretro` entry.

## Resolution and integrity

`resolve(gameId, profileId)` validates both browser-safe IDs and finds exactly one signed package. Library content adds one optional host-selected entry to that intent; the browser contributes only the entry ID, and the system, core, digest, and path all come from the host's own library. Resolution then enforces the signed content mode before anything else happens:

| Signed content mode | No entry | One entry |
| --- | --- | --- |
| `none` | resolves | rejected |
| `managed` | resolves | rejected |
| `library` | rejected | resolves when the entry's system and core match |

A `native` package rejects an entry outright. A rejected entry is never partially applied: no storage is prepared and no child is started. Resolution then continues:

1. resolves the bound manifest beneath the canonical install root;
2. verifies the full manifest SHA-256;
3. requires `"documentType": "vcg-installed-game-manifest"`, then manifest
   schema `1` and exact signed id, version, selected runtime, and `qualified`
   status;
4. resolves runtime-specific signed records;
5. creates a `RetroArchRequest` or `NativePackageRequest` from host-owned roots
   and signed relative paths;
6. lets the selected adapter canonicalize and verify every executable/runtime
   artifact immediately before it creates runtime state.

For a library launch, step 5 supplies the console-managed object root and the
host-resolved object path, so step 6 canonicalizes that object, requires it to
stay beneath that root, and re-verifies its SHA-256 — the same treatment a
fixed managed file receives. A library object is not part of the signed
catalog, so promotion-time `verify_all_artifacts` has nothing to check for a
`library` package; its content is verified per launch instead.

The base-configuration digest is now required by the direct `vcg-host retroarch` CLI as well as by catalog resolution.

### Bound manifest

A bound manifest is the installed-root game manifest, not the public
curated-shelf manifest; both are written to the filename `vcg-game.json`. The
host reads seven fields: `documentType`, `schemaVersion`, `id`, `version`,
`runtime`, `compatibilityStatus`, and `launch`. It does not reject the authored
fields it has no use for, so an installed manifest may carry more.

`documentType` must be exactly `vcg-installed-game-manifest`. A manifest that
omits it, or that declares the public document `vcg-game-manifest`, is rejected
naming the package and the required type, so a shelf manifest cannot be bound
into an installed package. See the
[game manifest contract](GAME_MANIFEST_CONTRACT.md) for both documents.

The native authority also re-hashes the bound manifest before interpreting its
1,000–120,000 ms launch timeout and local `process` or `explicit-ready` health
kind. It rejects HTTP/unknown health for both installed runtime lanes. These
signed fields drive candidate promotion health; they remain distinct from
watchdog heartbeat and compositor/window readiness.

Load-time verification is defence in depth, not a replacement for any of this. Resolution and adapter use still hash every artifact they touch, exactly as before, and a package can be tampered with after a clean load. Path canonicalization and repeated hashes narrow substitution risk, but target qualification still requires immutable package/content mounts or file-descriptor-bound execution and handoff. A compromised account able to rewrite artifacts between verification and process use can otherwise race path-based verification.

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
evidence, valid signed Libretro/native resolution, library-mode admission for
exactly the signed system and core plus refusal for fixed-content and native
packages, per-launch library content re-verification, runtime-record confusion,
changed/cross-role signature denial, wrong target, unknown fields, duplicates,
unsafe paths, malformed trust material, oversized catalogs, invalid launcher
IDs, missing packages, canonical summaries, manifest tamper and runtime
misbinding, refusal of a bound manifest that omits the installed-root
`documentType` or declares the public one, executable/base-config tamper at
adapter use,
core/frontend/manifest tamper at launcher catalog load under both dry-run and
normal startup, shared plan dispatch, profile allowlisting, candidate-health
isolation, and lifecycle preparation.
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
- production implementation/qualification of the exact service-manager
  cleanup-proof adapter, boot-scoped replay retention, and target-filesystem
  durability;
- qualified heartbeat producers, window readiness events, compositor containment, reserved Home/Back, and target-Linux sandboxing;
- update and removal cleanup plus architecture-parity evidence.
