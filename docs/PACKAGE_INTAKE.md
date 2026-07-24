# Signed package release intake

Last updated: 2026-07-24

This document defines the implemented host-owned admission and extraction boundary between a completed package archive and the [signed generation store](PACKAGE_GENERATION_STORE.md). The separate [resumable transfer contract](PACKAGE_TRANSFER.md) supplies a durable transport-neutral local sink. Network discovery/client policy, mirrors, update scheduling, cleanup, and activation remain separate.

## Signed release descriptor

The host first verifies a bounded detached Ed25519 descriptor with the domain-separated message prefix `VCG-PACKAGE-RELEASE-V1\0`. Signature verification occurs before JSON parsing. Descriptor, signature, archive, public key, and staging paths are absolute host inputs; browser or package content cannot choose them.

Schema v1 binds:

- positive generation and exact compiled target;
- archive format, SHA-256, and byte length;
- exact expanded regular-file payload bytes and file count; and
- exact installed-catalog SHA-256 and byte length.

Unknown fields, noncanonical lowercase hashes/keys/signatures, wrong target, unsupported schema, zero or excessive bounds, arithmetic overflow, and inconsistent uncompressed-TAR sizes fail closed. `tar` is implemented. `tar-zstd` is reserved in the descriptor vocabulary but has no extractor and is rejected before staging.

The release descriptor and installed catalog use the same configured prototype public key with different signed-message domains. A delegated release role remains an owner/security choice.

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
2. signature-first descriptor load;
3. exact archive length/hash verification;
4. post-download staging-filesystem capacity admission;
5. bounded extraction into `.incoming-<transaction-id>`;
6. exact expanded byte/file and extracted-catalog evidence checks;
7. installed-catalog signature plus every referenced artifact verification;
8. descriptor/catalog generation agreement and monotonic-generation check; and
9. atomic rename to inert `staging/<transaction-id>`.

Failure before the rename removes the private incoming directory after validating that it remains a direct staging child. Existing staging, activation markers, generations, managed content, and saves are not overwritten. Successful intake does not publish promotion intent or change the active generation; signed candidate health and ordinary promotion still run afterward.

## Remaining boundary

Network discovery/client behavior, HTTP range/TLS/mirror policy, real disk reservation, cross-writer low-space coordination and cleanup, `tar-zstd` decompression, hostile concurrent destination mutation, target-Linux permission/mount qualification, and sudden-power campaigns remain open. See [the owner intake questions](OWNER_QUESTIONS_PACKAGE_INTAKE_2026-07-23.md) and [transfer questions](OWNER_QUESTIONS_PACKAGE_TRANSFER_2026-07-24.md).
