# Signed package release intake

Last updated: 2026-07-24

This document defines the implemented host-owned admission and extraction boundary between a completed package archive and the [signed generation store](PACKAGE_GENERATION_STORE.md). The separate [resumable transfer contract](PACKAGE_TRANSFER.md) supplies a durable transport-neutral local sink. Network discovery/client policy, mirrors, update scheduling, cleanup, and activation remain separate.

## Signed release descriptor

The host first requires the exact descriptor bytes to meet the selected
channel/package-release/compiled-target threshold in a bootstrapped update
root. The strict detached-signature bundle is at most 32 KiB and contains
1–32 unique `{keyId, signature}` records under schema version 1. Ed25519
verification uses the domain-separated message prefix
`VCG-PACKAGE-RELEASE-V1\0` and occurs before descriptor JSON parsing.
Descriptor, signature-bundle, archive, and staging paths plus the update policy
are absolute host inputs; browser or package content cannot choose them.

Schema v1 binds:

- positive generation and exact compiled target;
- archive format, SHA-256, and byte length;
- exact expanded regular-file payload bytes and file count; and
- exact installed-catalog SHA-256 and byte length.

Unknown fields, noncanonical lowercase hashes/signatures, wrong target,
unsupported schema, absent/cross-role/expired authority, zero or excessive
bounds, arithmetic overflow, and inconsistent uncompressed-TAR sizes fail
closed. `tar` is implemented. `tar-zstd` is reserved in the descriptor
vocabulary but has no extractor and is rejected before staging.

The package-release and installed-catalog roles must use distinct key IDs and
public keys in one accepted root. Their fixed signed-message domains remain
separate as defense in depth. The production release loader has no direct
single-key alternative; that former path exists only inside isolated unit
fixtures.

## Capacity admission

Before a download, the arithmetic admission function requires:

```text
available >= archive bytes + expanded bytes + nonzero reserve
```

After an archive already exists, extraction admission requires:

```text
available on staging filesystem >= expanded bytes + nonzero reserve
```

The host can read non-privileged available bytes for the staging filesystem. These are point-in-time checks, not reservations. The future update coordinator must serialize competing writers and repeat admission at bounded transfer/extraction boundaries.

## Narrow TAR contract

The current extractor accepts an uncompressed TAR containing regular files only. Directory entries, links, hard links, devices, FIFOs, sparse/special entries, and metadata-only records are rejected. Parent directories are created by the host.

Every path must be UTF-8, at most 512 bytes and 32 components, use `/`, contain only portable ASCII letters/digits/`.`/`_`/`-`, avoid traversal, absolute paths, empty components, Windows reserved names, trailing dot/space, drive/alternate-stream syntax, duplicate names, and case-insensitive prefix collisions.

The only allowed release paths are:

```text
installed-catalog.json
installed-catalog.sig
install/<portable path>
```

The archive, expanded bytes, individual file bytes, and entry count are bounded before or while bytes are written. Files are created with no replacement. Unsafe mode bits are rejected; Unix permissions are normalized to `0644` or `0755` based only on whether the archive declares an executable bit. Ownership, timestamps, xattrs, and archive permissions are not restored. Extracted files and directories are synchronized on Unix.

Extraction must occur in a new private empty directory. Concurrent mutation of that directory is outside this primitive's contract and must be prevented by service ownership/sandboxing.

## Store integration

`PackageGenerationStore::stage_package_tar` performs:

1. transaction and pending-recovery validation;
2. delegated-role, signature-first descriptor load;
3. exact archive length/hash verification;
4. post-download staging-filesystem capacity admission;
5. bounded extraction into `.incoming-<transaction-id>`;
6. exact expanded byte/file and extracted-catalog evidence checks;
7. separately delegated installed-catalog threshold plus every referenced artifact verification;
8. descriptor/catalog generation agreement and monotonic-generation check;
9. synchronized host receipt of the exact signed descriptor identity; and
10. atomic rename to inert `staging/<transaction-id>`.

Failure before the rename removes the private incoming directory after validating that it remains a direct staging child. Existing staging, activation markers, generations, managed content, and saves are not overwritten. Successful intake does not publish promotion intent or change the active generation; signed candidate health and ordinary promotion still run afterward.

The staged descriptor receipt lets the transfer coordinator later prove that the exact generation, archive format/hash/length, expanded facts, and catalog hash/length reached inert staging before it removes a consumed ready archive. A catalog-generation/hash coincidence alone is insufficient.

## Remaining boundary

Network discovery/client behavior, HTTP range/TLS/mirror policy, exact
protected root-state provenance, secure continuously refreshed time,
real disk reservation, cross-writer low-space coordination and cleanup,
`tar-zstd` decompression, hostile concurrent destination mutation, target-Linux
permission/mount qualification, and sudden-power campaigns remain open. See
[the owner intake questions](OWNER_QUESTIONS_PACKAGE_INTAKE_2026-07-23.md) and
[transfer questions](OWNER_QUESTIONS_PACKAGE_TRANSFER_2026-07-24.md).
