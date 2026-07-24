# Accepted Update-Root Store

Status: bounded crash-recoverable local history and launcher replay wiring
implemented; protected high-water provenance, trusted time, and target
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
- a protected minimum accepted-root generation; and
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

The final directory rename is the commit point. There is no mutable `current`
pointer whose contents can disagree with history. The highest member of a
fully verified consecutive chain is current.

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
final root to be unexpired at caller-supplied trusted time. It also rejects a
final generation below the caller's protected floor. Stored bytes never become
authority merely because they are present.

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
  --minimum-generation <protected-floor> \
  --trusted-unix-seconds <trusted-time>

vcg-host update-root rotate <same options>
vcg-host update-root recover --store-root <absolute-store-root>
```

Catalog-backed launcher startup instead takes
`--update-root-store`, `--update-root-anchors`,
`--update-root-min-generation`, `--update-channel`, and
`--trusted-unix-seconds`. Normal startup explicitly removes only validated
unpublished directories, replays the complete stored chain, and constructs the
delegated policy before package-store recovery or browser startup. `--dry-run`
does not recover root state and fails if recovery is pending.

Production integration must still:

1. provision the fixed layout and out-of-band anchors outside browser/package
   control;
2. read the protected generation floor and trusted time from qualified
   platform adapters;
3. supply the protected floor and trusted time through platform adapters
   rather than operator-selected command-line values;
4. replay the store before accepting a root candidate or update artifact;
5. advance the protected floor only after the committed generation is durable;
6. define repair behavior if protected state is ahead of writable history; and
7. power-cut qualify file and directory synchronization on each target
   filesystem.

Never repair a missing committed generation by lowering the protected floor or
copying an unauthenticated "latest" root into place.

## Automated evidence

Twelve focused tests cover exact-byte persistence and reopen, dual-threshold
rotation, an expired current root authenticating one exact current successor,
an expired historical link with a current final root, expired-current artifact
denial, protected-floor rollback denial, changed committed bytes, history gaps,
interrupted publication and explicit recovery, committed-history preservation,
unexpected entries, nonblocking lock contention, and the directory rename as
the publication point. Two CLI tests cover explicit unique maintenance inputs,
read-only launcher replay, and normal-startup recovery ordering.

These are desk filesystem tests. They do not prove Linux mount options,
same-account write isolation, storage-device flush behavior, protected
monotonic hardware, secure time, or sudden-power survival.
