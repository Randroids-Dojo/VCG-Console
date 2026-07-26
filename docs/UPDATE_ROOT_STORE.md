# Accepted Update-Root Store

Status: bounded crash-recoverable local history and launcher replay wiring
implemented; protected-state provenance, trusted time, and target
power-loss qualification remain open.

## Purpose and claim

`native/vcg-host/src/update_root_store.rs` persists the exact root metadata and
detached signatures accepted by `update_trust`. It makes a normal crash or
interrupted publication recoverable without silently selecting an older local
root.

This is crash-monotonic evidence on an ordinary writable filesystem. It is not
tamper-resistant rollback protection. A privileged or same-account writer that
can delete the newest committed directory can still roll local history back.
Every load therefore requires:

- independently provisioned out-of-band root anchors;
- an exact protected accepted-root generation plus metadata SHA-256; and
- trusted Unix time for the final root's expiry check.

The store does not persist or derive those three authorities.

## Provisioned layout

The host opens only an absolute, normalized, already provisioned layout:

```text
<store-root>/
  .vcg-update-root-store.lock
  generations/
    00000000000000000007/
      root.json
      signatures.json
    00000000000000000008/
      root.json
      signatures.json
```

The operation lock must be a regular file. The store root, generations
directory, committed generation directories, and their two files must resolve
as direct non-symlink children. A committed directory contains exactly
`root.json` and `signatures.json`. Root bytes remain limited to 64 KiB,
signature bundles to 32 KiB, and history to 4,096 generations.

Generation names are fixed 20-digit nonzero decimals. The first bootstrapped
generation may be greater than one; every later directory must advance by
exactly one.

## Protected state v1

The platform adapter supplies a closed document limited to 4 KiB:

```json
{
  "schemaVersion": 1,
  "generation": 8,
  "rootMetadataSha256": "64-lowercase-hex-characters"
}
```

Before first provisioning it is exactly:

```json
{
  "schemaVersion": 1,
  "generation": 0,
  "rootMetadataSha256": null
}
```

Generation zero with a digest, a nonzero generation without a digest,
noncanonical hashes, unknown fields, and unsupported schemas fail closed. This
representation is not self-protecting. A normal file beside the writable store
does not satisfy the platform-adapter requirement.

## Publication protocol

Bootstrap and rotation take one nonblocking exclusive store lock. The host
verifies the candidate before creating writable state, then:

1. creates the exact private `.incoming-<generation>` directory with no
   replacement;
2. creates and synchronizes the exact root and signature files with no
   replacement;
3. synchronizes the incoming directory where the platform supports directory
   synchronization;
4. atomically renames the directory to the fixed 20-digit generation name; and
5. synchronizes the parent directory where supported.

The final directory rename is the writable-store commit point. There is no
mutable `current` pointer whose contents can disagree with history. A newly
committed highest member is only a staged root until the platform adapter
commits its exact generation and metadata digest.

Bootstrap or rotation returns `ProtectionCommitRequired` with that exact state.
Artifact authority remains unavailable while the stored root is ahead of
protected state. After the adapter commits it, replay returns the root as
active; retrying either side is idempotent. The adapter must never advance
before the root directory is durable.

An interrupted `.incoming-*` directory blocks bootstrap, rotation, and load
until explicit recovery. Recovery validates each direct-child name and path,
removes only unpublished incoming directories, and never changes a committed
generation. Unexpected names, unsafe paths, extra files, gaps, malformed
payloads, and excessive history fail closed.

## Replay and expiry

Every load starts from the stored bootstrap bytes and re-verifies:

- the out-of-band anchor threshold and bootstrap root's own threshold;
- all closed-document, key-separation, role, and bounds rules;
- both old and new root thresholds for every exact next generation; and
- the directory generation against the signed metadata generation.

An old root may naturally expire while a newer accepted root remains current.
Replay therefore defers expiry checking for historical links, then requires the
final root to be unexpired at caller-supplied trusted time. It requires the
latest stored generation and exact root digest to equal protected state. A
stored root ahead of protected state remains pending; a protected generation
ahead of history is rollback/corruption; and a same-generation digest mismatch
is substitution. Stored bytes never become authority merely because they are
present.

## Recovery and operational integration

The Rust module supplies `open`, `bootstrap`, `rotate`, `load_current`, and
`recover`. Root mutation is deliberately separate from ordinary launcher
startup:

```text
vcg-host update-root bootstrap \
  --store-root <absolute-store-root> \
  --root <absolute-root-metadata> \
  --root-signatures <absolute-signature-bundle> \
  --root-anchors <absolute-anchor-set> \
  --protected-state <absolute-protected-state> \
  --trusted-unix-seconds <trusted-time>

vcg-host update-root rotate <same options>
vcg-host update-root recover --store-root <absolute-store-root>
```

Catalog-backed launcher startup instead takes
`--update-root-store`, `--update-root-anchors`,
`--update-root-protected-state`, `--update-channel`, and
`--trusted-unix-seconds`. Normal startup explicitly removes only validated
unpublished directories, replays the complete stored chain, and constructs the
delegated policy before package-store recovery or browser startup. `--dry-run`
does not recover root state and fails if recovery is pending.

Production integration must still:

1. provision the fixed layout and out-of-band anchors outside browser/package
   control;
2. read the exact protected root state and trusted time from qualified
   platform adapters;
3. supply protected state and trusted time through platform adapters
   rather than operator-selected command-line values;
4. replay the store before accepting a root candidate or update artifact;
5. commit the returned generation and digest only after the root directory is
   durable, then replay before artifact use;
6. define repair behavior if protected state is ahead of writable history; and
7. power-cut qualify file and directory synchronization on each target
   filesystem.

Never repair a missing committed generation by lowering/replacing protected
state or copying an unauthenticated "latest" root into place.

## Automated evidence

Fifteen focused tests cover exact-byte persistence and reopen, strict protected
state parsing, two-phase pending/commit behavior, idempotent retry,
same-generation valid-root substitution denial, dual-threshold rotation, an
expired current root authenticating one exact current successor, an expired
historical link with a current final root, expired-current artifact denial,
protected rollback denial, changed committed bytes, history gaps, interrupted
publication and explicit recovery, committed-history preservation, unexpected
entries, nonblocking lock contention, and the directory rename as the
publication point. Two CLI tests cover explicit unique maintenance inputs,
read-only launcher replay, and normal-startup recovery ordering.

These are desk filesystem tests. They do not prove Linux mount options,
same-account write isolation, storage-device flush behavior, protected
monotonic hardware, secure time, or sudden-power survival.
