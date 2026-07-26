# Versioned arcade parent/clone diagnostics

Status: strict synthetic preflight implemented; real MAME content unqualified

Last updated: 2026-07-24

Arcade ROM-set compatibility depends on the exact emulator/core version, set
version and organization, and parent/clone relationship. A familiar title or
archive name is not authority. Emulator licensing also does not grant content
rights.

## Implemented contract

The separate arcade preflight in `@vcg/retro-import-contract` binds:

- opaque policy ID/revision;
- exact core ID and version;
- exact set version/organization string;
- sorted unique title and set IDs;
- parent versus clone relationship;
- exact child and, for clones, parent SHA-256 identities; and
- `rights-cleared-test` or `user-supplied-unverified` status.

The installed inventory binds the same core/version/set scope, a generation,
and sorted unique opaque set ID/hash/scan records. It accepts no path,
filename, display name, download URL, or content bytes.

Preflight reports stable missing, mismatched, and blocked/unavailable set IDs.
A clone requires both its exact parent and child set. Launch authorization is
an in-memory capability and accepts only the exact parsed policy, exact parsed
inventory generation, and exact ready result evaluated together. Unknown
titles, clones, policy revisions, inventory generations, and version
substitution fail.

Canonical JSON is limited to 64 KiB. Policies are capped at 256 titles and
inventories at 512 sets.

## Evidence

Ten tests use synthetic `rights-cleared-test` parent and clone identities.
They cover:

- exact parent launch;
- exact parent-plus-clone launch;
- independently missing parent or clone;
- wrong hash and unsafe scan status;
- core, core-version, and set-version confusion;
- malformed graphs, duplicates, and ordering;
- path/name/URL/byte data exclusion;
- clone and stale authority rejection;
- unknown titles and unparsed objects; and
- bounded canonical JSON.

No ROM or archive bytes are checked in. The exercise does not identify a real
commercial title or claim compatibility with a real MAME release.

## Import boundary

Retro import v1 still rejects multi-file archives and MAME parent/clone sets.
This module evaluates a future console-managed inventory; it does not loosen
the importer, parse ZIP/7z/CHD content, derive set identity from filenames, or
grant rights. A future multi-object transaction must atomically import,
hash, scan, publish, audit, remove, and recover all required objects before
this preflight can be used by a production launch.

## Remaining boundary

I-126 remains active. Completion requires an exact selected MAME/libretro core
and set version, an audited metadata source, at least one genuinely
rights-cleared parent/clone fixture, archive/member verification, BIOS/device/
sample/CHD dependency handling, import and removal transactions, reviewed
user-facing diagnostics, real frontend launch results, both architectures,
and corrupt/incomplete/version-mismatch testing.
