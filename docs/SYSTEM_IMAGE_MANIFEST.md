# Signed System Image Manifest

Status: Rust verification primitive implemented; key hierarchy, acquisition, block-device writer, boot control, and target qualification remain open.

## Purpose

`native/vcg-host/src/system_image.rs` turns one detached-signed, exact-target manifest plus one completely verified regular image file into a release record and retained exact open handle for a future privileged A/B writer. It creates sealed journal evidence only after a privileged adapter supplies a synchronized inactive-slot read-back stream with the same signed length and hash.

The boundary is intentionally ordered:

1. bound and read the manifest, signature text, and public-key text;
2. decode only canonical lowercase hexadecimal key/signature material;
3. verify Ed25519 over the exact domain-separated manifest bytes;
4. only then parse the closed JSON document;
5. validate schema, identifiers, exact configured target, format, size, and SHA-256;
6. open the raw image once, require its exact signed length, stream every byte through SHA-256, and recheck the opened handle's length;
7. retain and rewind that exact verified handle for a future privileged writer;
8. require that writer to copy from the retained handle and synchronize the inactive partition;
9. hash the signed-length prefix from the adapter's trusted inactive-slot read-back stream; and
10. only then construct sealed, non-deserializable journal evidence.

No launcher, game, browser origin, manifest field, or image file selects the trusted public key, expected target, or A/B slot.

## Manifest v1

The detached signature covers:

```text
VCG-SYSTEM-IMAGE-MANIFEST-V1\0 || exact manifest bytes
```

Example:

```json
{
  "schemaVersion": 1,
  "generation": 42,
  "releaseId": "pi-stable-2026.07.24",
  "target": "raspberry-pi-5",
  "image": {
    "format": "raw",
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "sizeBytes": 8589934592
  }
}
```

The parser rejects unknown fields. Meanings are:

- `schemaVersion`: exactly `1`;
- `generation`: positive release authority that must later advance the journal high-water mark;
- `releaseId`: 1 through 128 ASCII letters, digits, dots, underscores, or hyphens;
- `target`: 1 through 64 characters from the same safe alphabet and exactly equal to privileged host configuration;
- `image.format`: exactly `raw`; `raw-zstd` is parsed but rejected until a bounded streaming decompressor/writer is qualified;
- `image.sha256`: exactly 64 canonical lowercase hexadecimal characters;
- `image.sizeBytes`: 1 through 64 GiB.

The manifest file is bounded to 64 KiB. Signature and public key files are single-line canonical lowercase hexadecimal, optionally ending in one LF, and bounded to 256 and 128 bytes respectively.

## Evidence handoff

`VerifiedSystemImageRelease::load` establishes signed release authority without opening the image. `verify_image` then binds the signed facts to the complete regular file and returns `VerifiedSystemImageFile`, which owns the still-open verified handle. `into_rewound_parts` consumes that result and returns the release authority plus the exact handle at byte zero.

After writing and synchronizing the inactive partition, the platform adapter passes its trusted read-back stream and host-selected slot to `verify_inactive_readback`. Only a matching signed-length prefix produces `VerifiedSystemImageEvidence`. Journal initialization and staging accept that sealed, non-deserializable type; deserialized `SystemImage` snapshot facts cannot be replayed as mutation authority. The adapter still owns proof that its reader actually names the synchronized inactive slot.

The journal separately enforces:

- exact target continuity with the active image;
- inactive-slot selection;
- strict generation advancement;
- one pending update;
- bounded globally unique attempts;
- same-attempt six-gate health confirmation;
- automatic rollback metadata.

Manifest or source-file validity never stages a candidate, makes it active, or changes boot selection.

## Automated evidence

Ten focused Rust tests cover:

- signature verification before JSON parsing;
- rejection of a valid Ed25519 signature made without the system-image domain;
- exact generation, release, target, manifest hash, image hash, and size binding;
- complete image verification, retained release authority, rewind of the exact handle, and sealed matching read-back evidence;
- resistance to source-path replacement after verification;
- short and changed inactive-slot read-back rejection;
- same-size changed image and truncated image rejection;
- wrong target, unknown field, unsupported schema, and unsupported compression rejection;
- zero generation and image size outside the signed bounds;
- noncanonical key, wrong key, unsafe release ID, and uppercase hash rejection;
- relative path, directory, and oversized-manifest rejection.

## Explicitly unproven

This is a signed-file verifier, not a production update service.

- The public key is supplied as host configuration. Offline root roles, online delegation, expiration, threshold policy, rotation, revocation, and recovery are still Q-069/I-112/I-141.
- The writable journal remains an unprotected high-water mark. A TPM/secure element/verified boot or another qualified monotonic anchor is still required.
- No downloader, TLS metadata policy, resumable transfer, capacity reservation, or partial cleanup exists.
- The verified source is a regular file. No raw block device is opened, erased, partitioned, written, or synchronized by this module.
- The exact verified source handle is retained and path replacement cannot redirect it. Concurrent in-place writes through another handle remain possible, so the privileged writer must reverify during copy and hash the complete inactive partition after synchronization.
- `verify_inactive_readback` proves bytes, not reader provenance, synchronization, device identity, offset, or partition isolation. The target adapter must own those facts and the final power-loss-safe write sequence.
- No Raspberry Pi firmware, `tryboot`, U-Boot, RAUC, or other boot-control mechanism consumes the evidence yet.
- `raw-zstd` has no verifier/writer. Compression must remain rejected until decompressed byte limits, disk headroom, cancellation, corruption, and power-loss behavior are proved.
- Target-Linux permission, symlink/race, hostile same-account writer, removable-card, filesystem, and sudden-power campaigns remain open.
- The manifest intentionally contains no writable-data migration. Migration compatibility needs a separately signed/versioned contract that preserves rollback readability.

Until those controls are implemented and measured, this primitive proves manifest authority, complete regular-file integrity, and the bytes supplied through read-back—not the provenance or durability of a real partition transaction.
