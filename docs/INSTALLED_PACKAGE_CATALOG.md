# Signed installed-package catalog

Last updated: 2026-07-23

This document defines the first host-owned trust bridge from an approved installed package to the local launcher. It is deliberately narrower than an installer or launch service.

The implemented slice can:

- load one bounded Ed25519-signed catalog from explicit host configuration;
- reject the document before JSON parsing when its signature fails;
- validate target, generation, qualification, identifiers, hashes, and relative paths;
- bind one installed game manifest to the signed package identity, version, runtime, and qualification;
- resolve a fixed `{gameId, profileId}` intent into a trusted `RetroArchRequest`;
- disclose only id, version, runtime, and catalog generation to the authenticated trusted launcher.

It cannot install, update, revoke, roll back, or launch a package through the browser API. The launcher therefore reports `PACKAGE_LAUNCH_PENDING` after finding a signed catalog entry.

## Host configuration

`vcg-host launcher` accepts the catalog only as an all-or-nothing privileged configuration:

```text
--catalog <absolute-catalog-path>
--catalog-signature <absolute-signature-path>
--catalog-public-key <absolute-public-key-path>
--install-root <absolute-installed-package-root>
--runtime-root <absolute-ephemeral-runtime-root>
--data-root <absolute-persistent-data-root>
[--content-root <absolute-managed-retro-content-root>]
```

These values come from the service/image configuration, never from Svelte, a game, a public manifest, or a hosted origin. A partial configuration fails before Chromium starts. Dry-run mode verifies the catalog and prints only generation and target.

The public-key file is currently a host-configured path. Target images still need to pin that key in a verified read-only system slot and define rotation/revocation under I-112/I-141. A writable key path beside a writable catalog is not a production trust root.

## Signature envelope

- Algorithm: Ed25519.
- Public key file: exactly 32 bytes encoded as 64 lowercase hexadecimal characters, with at most one trailing newline.
- Signature file: exactly 64 bytes encoded as 128 lowercase hexadecimal characters, with at most one trailing newline.
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
- Only the implemented `libretro` runtime is accepted.
- Every catalog path is a non-empty relative normal path with no root, prefix, `.` or `..` component.
- Hashes are canonical lowercase SHA-256.
- A managed content record requires a configured managed content root.

## Resolution and integrity

`resolve(gameId, profileId)` validates both browser-safe IDs and finds exactly one signed package. It then:

1. resolves the bound manifest beneath the canonical install root;
2. verifies the full manifest SHA-256;
3. requires manifest schema `1` and exact signed id, version, `libretro` runtime, and `qualified` status;
4. resolves and verifies the signed base configuration;
5. creates a `RetroArchRequest` from host-owned roots and signed relative paths;
6. lets the RetroArch adapter canonicalize and verify frontend, core, base configuration, and managed content immediately before it creates runtime state.

The base-configuration digest is now required by the direct `vcg-host retroarch` CLI as well as by catalog resolution.

Path canonicalization and repeated hashes narrow substitution risk, but target qualification still requires immutable package/content mounts or file-descriptor-bound execution and handoff. A compromised account able to rewrite artifacts between verification and process use can otherwise race path-based verification.

## Launcher API

When a catalog is configured, `/v1/status` adds `trusted-package-catalog` to its capabilities.

`GET /v1/packages/<game-id>` uses the same per-launch bearer capability, exact launcher origin, bounded request handling, and no-store response as status. A success discloses only:

```json
{
  "id": "retro-2048",
  "version": "1.0.0",
  "runtime": "libretro",
  "catalogGeneration": 7
}
```

Missing packages return `404 PACKAGE_NOT_INSTALLED`; invalid IDs return `400 PACKAGE_ID_INVALID`. Paths, hashes, keys, permissions, environment, command lines, and writable roots never cross this endpoint.

The metadata lookup proves only that a valid signed catalog contains the entry. Artifact and manifest verification occurs during host-owned resolution, and no browser launch operation exists yet.

## Evidence and remaining boundary

Native tests cover valid signed resolution, signature-before-parse failure, wrong target, unknown fields, duplicates, unsafe paths, malformed key material, oversized catalogs, invalid launcher IDs, missing packages, manifest tamper and misbinding, base-config tamper at resolve and adapter use, and final RetroArch plan acceptance. Host-API tests verify capability discovery and metadata-only disclosure. TypeScript and Playwright tests verify fixed-ID requests with no browser-provided path, hash, program, or command fields.

Still required:

- verified read-only public-key provisioning, rotation, and revocation;
- persisted monotonic generation and rollback protection;
- signed package installation and atomic catalog promotion;
- immutable or descriptor-bound artifact use;
- a narrow authenticated launch operation with replay and idempotency policy;
- readiness events, watchdog integration, compositor containment, reserved Home/Back, and target-Linux sandboxing;
- update and removal cleanup plus architecture-parity evidence.
