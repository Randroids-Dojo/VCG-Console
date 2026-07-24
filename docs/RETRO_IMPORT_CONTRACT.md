# Shared retro import contract

Status: implemented pure contract/planner and native plain-file transaction
foundation; acquisition, scanner, product wiring, and qualification not
implemented

Last updated: 2026-07-24

## Scope

`@vcg/retro-import-contract` is the common policy, session, candidate,
installed-library, planning, and terminal-intent boundary for removable USB
and explicitly paired-LAN retro imports.

Both transports terminate in the same coordinator. Transport changes only the
bounded session authority and path-free provenance label; it does not change
file validation, entitlement, hashing, scan evidence, system mapping,
duplicate/conflict handling, capacity arithmetic, or installed-library
format.

The package performs no filesystem or network I/O. It does not enumerate USB
media, receive LAN bytes, decode ZIP files, compute hashes, run a malware
scanner, reserve blocks, write staging, atomically promote content, mutate the
library, or persist an audit log. It accepts strict host-produced evidence and
emits an exact one-shot terminal intent for a future privileged coordinator.

## Authority flow

1. A trusted host loads one versioned import policy. The policy selects
   supported system IDs, plain extensions, archive formats, exact default core
   and controller profile IDs, session/plan lifetimes, source/archive limits,
   and installed-library quotas.
2. The host opens one visible USB or paired-LAN session with an opaque
   authority ID, absolute expiry, family-mode state, and exact
   `vcg-user-entitled-content-v1` acknowledgement for selected files only.
3. Native intake supplies an opaque source handle, byte count and SHA-256,
   bounded inspection result, and scan result bound to the same inspection
   and source hash. No browser path is accepted.
4. The coordinator validates the current closed installed-library generation,
   applies the signed system policy, checks duplicates/conflicts and
   overflow-safe capacity/quota arithmetic, and issues one deeply frozen plan.
5. Only the exact issued plan object may produce one terminal intent. Clones,
   replays, expired or revoked non-cancel actions, unbound replacement
   targets, and decisions outside the plan fail closed. Cancellation remains
   available after expiry or revocation so staging can be removed.

The output is an intent, not evidence that installation occurred. A native
transaction must revalidate policy, session, source, scan, library generation,
capacity reservation, and filesystem state before mutation.

## Native plain-file transaction

`vcg_host::retro_import` now consumes an exact `install-new` or
`replace-existing` terminal-intent document plus native inspection, expiry,
revocation, and release-policy context. Authorization retains a canonical
SHA-256 of the whole intent. Changing the plan, source handle/hash, installed
entry, replacement target, provenance, or audit projection afterward fails
before filesystem mutation.

The store requires preprovisioned, canonical, non-symlinked roots:

```text
staging/retro-imports/
  retro-import.lock

retro/
  objects/
  libraries/
    generation-00000000000000000001.json
  audit/
```

On Linux, staging and content must have the same device ID. The transaction:

1. takes one nonblocking operation lock;
2. revalidates the strict bounded intent, current contiguous library
   generation, live context snapshot, release mapping, quota, replacement
   object, and physical free space plus reserve;
3. durably publishes a path-free pending record before copying;
4. streams from an already-opened regular source handle into a private staged
   file while enforcing exact length and SHA-256;
5. invokes a pluggable scanner over a separately opened read-only staged
   subject and accepts only exact inspection/hash-bound clean evidence;
6. rehashes and seals the staged payload, then hard-links it into the
   console-managed object store without replacement;
7. publishes the next full installed-library generation through a synchronized
   no-replace hard link;
8. persists a path-free terminal audit record containing the exact clean scan
   evidence;
9. removes an exact replaced object only after the new generation and audit
   are durable; and
10. cleans scan/staging/temporary/pending state last.

An interruption before a complete staged hash discards only that bound stage.
A complete unscanned stage can be scanned and committed without the original
USB/LAN source. Once content or a library generation is published, recovery
moves the same exact authorized transaction forward. Generation files are
append-only, contiguous from generation one, and currently capped at 4,096
retained generations pending a qualified compaction policy.

The Rust module accepts no source path and returns none. Its generated object
name derives only from validated system ID, full content hash, and canonical
extension. It does not create an HTTP endpoint or treat a browser-submitted
intent as native authority.

The two no-copy terminal actions are native as well. `reuse-existing`
requires active authority, the exact current library generation and entry,
and a fresh full-hash check of the console-managed object. It writes an
idempotent `retro-import-reused` audit record without copying or advancing the
library. `cancel-and-cleanup` remains available after plan expiry or session
revocation, removes only a same-plan pre-publication stage, never rolls back
published content, and writes an idempotent `retro-import-cancelled` record.
An exact retry returns the original audit generation even if unrelated
imports have since advanced the library.

Store configuration can derive its exact `retro` and
`staging/retro-imports` roots from `StorageNamespacePlan`; it does not accept
browser-selected roots. A public bounded `current_library_json()` snapshot
returns only the closed installed-library document and refuses to serve a
planner while authoritative or unpublished recovery state exists.

## Closed policy

The package contains no product system allowlist. Tests use a synthetic
Game Boy-shaped policy only to exercise the contract; it does not qualify a
core, game format, archive decoder, or title.

A production policy must be host-owned and release-bound. Each system entry
contains:

- a bounded lowercase system ID;
- sorted canonical plain extensions;
- explicitly allowed archive formats;
- one exact default core ID;
- one exact controller profile ID; and
- a per-content byte ceiling.

The global policy bounds sessions, plans, source bytes, archive entry count,
expanded bytes, compression ratio, library entries, and library bytes.
Unknown fields, duplicate system IDs, unsorted/duplicate extensions, unsafe
IDs, unsupported archive formats, and unsafe integers are rejected.

## Session and entitlement

Every request is bound to one opaque `ris-<32 lowercase hex>` session and the
same `usb` or `paired-lan` transport on both session and candidate.

The entitlement record is deliberately a user representation, not proof that
the console creates ownership:

```text
statementVersion = vcg-user-entitled-content-v1
scope            = selected-files-only
acceptedAtMs     = within the active session
profileId        = opaque local profile ID
```

Family mode can deny import regardless of other validity. Policy bounds the
maximum session lifetime. Paired-LAN authority cannot become a permanent file
share: expiry or explicit revocation blocks every non-cancel terminal intent.

## Native candidate evidence

A candidate includes:

- opaque session, source-handle, and inspection IDs;
- a portable NFC basename, never a source path;
- exact received byte length and canonical SHA-256;
- the requested signed-policy system ID;
- either a plain-file or archive inspection; and
- scanner engine/rule revision, exact source/inspection binding,
  `container-and-expanded-payloads` scope, and `clean`, `blocked`, or `error`
  result.

Planning accepts only exact clean evidence. This is a contract for a scanner;
no scanner is bundled or simulated by the package.

Names reject path separators, drive/URI delimiters, controls, Windows-invalid
characters, trailing dot/space, dot segments, and reserved portable names.
Archive paths are NFC, relative, at most eight segments and 240 characters,
and collision-checked after NFKC plus case folding.

## Archive v1 boundary

The only representable archive format is ZIP, and the active system policy
must explicitly allow it. V1 accepts exactly one inspected regular payload.
It rejects:

- outer extension/format mismatch;
- empty or multi-file archives;
- nested archives;
- unsafe, duplicate, case-colliding, or compatibility-colliding paths;
- entry-byte totals that differ from the declared expansion;
- unsupported payload extensions;
- excessive entry count or expanded bytes; and
- expansion ratios above policy, compared with overflow-safe integer
  arithmetic.

This intentionally does not support cue/bin sets, MAME parent/clone sets,
multi-disc games, CHD conversion, encrypted archives, nested containers,
symlinks, or archive metadata sidecars. Those need separately qualified
formats and atomic multi-file installed entries rather than a loosened v1.

## Installed-library v1

The tracked
`schemas/retro-installed-library.schema.json` is a closed Draft 2020-12
schema exported by the package and freshness-checked in its unit suite.

Each entry contains only:

- `content-<full SHA-256>` entry ID and the matching full SHA-256;
- system ID, byte size, canonical extension, bounded visible title;
- exact core and controller-profile IDs from signed policy; and
- path-free USB/LAN, session, entitlement-version, and import-time provenance.

Runtime validation additionally requires unique entry IDs, unique
system/hash pairs, exact ID-from-hash derivation, safe visible titles, and
agreement with the current signed system/core/controller/extension policy.
Source paths, USB device identities, workstation names, IP addresses,
pairing keys, profile names, artwork URLs, and scanner details are not
representable.

## Duplicate, conflict, and capacity semantics

- Same system plus full content hash is a duplicate. The plan requires no
  staging capacity and permits only `use-existing` or `cancel`.
- The same normalized title and system with a different hash is a conflict.
  The plan identifies exact existing entries and independently exposes only
  the choices that fit policy: Keep Both, replacement of one exact entry, or
  cancel.
- A hash already assigned to another system is blocked rather than silently
  reinterpreted.
- New content requires policy entry/byte headroom and physical free bytes
  after the configured reserve.
- Plain content accounts one staged payload. An archive accounts both received
  container bytes and expanded payload bytes at peak.
- All sums and products fail closed on unsafe-integer overflow.

These checks do not reserve storage. A future native transaction must
serialize or reserve the accepted peak before intake can rely on it.

## Terminal intent

The coordinator retains plan identity in a `WeakMap`; structurally identical
clones have no authority. A plan can produce exactly one:

- `install-new`;
- `replace-existing` with an exact plan-bound entry;
- `reuse-existing`; or
- `cancel-and-cleanup`.

The intent binds policy ID/revision, expected library generation, session,
transport, source handle/hash, content hash, system, entitlement statement,
decision, installed entry, and any existing target. It always instructs the
future transaction to clean staging after terminal completion.

The audit projection is path-free and contains no display/profile identity.
The package does not persist it.

## Current verification

Twenty-four focused tests cover:

- closed/frozen policy and checked-in schema freshness;
- unknown/missing fields, policy ordering, duplicates, and unsupported
  archive formats;
- source-path and portable-name refusal;
- exact installed ID/hash identity and path-free provenance;
- shared USB/LAN planning;
- family-mode, entitlement-time, session, transport, scan, system, extension,
  and policy binding;
- valid archive planning, traversal, absolute/backslash/reserved paths,
  Unicode/case collisions, expansion bombs, nesting, multi-file denial, and
  byte accounting;
- duplicate reuse, cross-system hash conflict, same-title conflict,
  Keep-Both/replacement quota behavior, staging/quota/size/overflow refusal;
  and
- exact-plan identity, decision scope, one-shot authorization,
  expiry/revocation, and cleanup cancellation; and
- exact emission of the checked-in plain-install fixture consumed by Rust.

The native module adds seventeen Windows library tests and eighteen Linux tests.
One test consumes that same TypeScript fixture, hashes its real UTF-8 payload,
authorizes the exact intent, and commits it through the native store. The tests
cover shared USB/LAN intent handling, strict/unknown/path-bearing input,
exact-intent authorization, expiry/revocation/policy/generation checks before
mutation, source length/hash change, opened-source path replacement,
clean/blocked/error/unavailable/misbound scanner behavior, capacity overflow,
reported-free-space refusal before mutation, library history shape,
nonblocking lock and exact cancellation, incomplete-copy cleanup, recovery
after source removal, recovery across object/library publication windows,
replacement ordering, duplicate reuse with full object revalidation,
cancellation after expiry/revocation and after an unrelated generation
advance, path-free audit persistence, shared storage-namespace derivation,
an actual derived-root import that preserves package/core/save/state/remap/
profile/log/cache/package-staging sentinels, recovery-aware path-free library
snapshots, and Linux symlink refusal. Strict Clippy and Rustdoc pass on the
module; physical power removal has not been tested.

## Remaining implementation and evidence

I-199 remains active. Product activation still requires:

1. a signed production policy derived from qualified cores, controller
   profiles, BIOS rules, and exact supported systems/formats;
2. privileged USB enumeration and read-only source handles with removal/fault
   behavior;
3. a separately authorized authenticated paired-LAN receiver with bounded
   resume, timeout, revocation, and reboot closure;
4. a selected offline scanner with signed/updateable rules, rule-age policy,
   process isolation, and explicit unavailable/error behavior; native
   streaming hashing and an exact-subject scanner interface now exist;
5. a bounded ZIP inspector/extractor or a decision to keep archives disabled;
6. real block reservations and physical full-disk/power-loss qualification;
   the plain-file path now has durable same-filesystem staging, synchronized
   writes, hash revalidation, no-replace publication, and cleanup recovery;
7. library-history compaction, explicit deletion, and physical fault
   campaigns; append-only generation commits, exact replacement,
   duplicate reuse/cancel auditing, entry/byte quotas, and recovery now exist;
8. mount/sandbox and physical-fault qualification of the logical isolation
   from packages, cores, BIOS, saves, states, remaps, profiles, updates, and
   source media; the derived-root transaction now preserves seeded
   non-retro namespace sentinels;
9. family-mode/controller-accessible disclosure, progress, conflict,
   cancellation, and error UX; and
10. legal review, real entitled fixtures, both target architectures, hostile
    media/LAN tests, and proof that RetroArch never opens source paths.

No automatic commercial ROM, BIOS, key, metadata, or artwork acquisition is
authorized by this contract.
