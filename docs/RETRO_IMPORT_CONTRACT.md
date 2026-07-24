# Shared retro import contract

Status: implemented pure contract and planner; native intake and installation
not implemented

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

Twenty-three focused tests cover:

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
  expiry/revocation, and cleanup cancellation.

## Remaining implementation and evidence

I-199 remains active. Product activation still requires:

1. a signed production policy derived from qualified cores, controller
   profiles, BIOS rules, and exact supported systems/formats;
2. privileged USB enumeration and read-only source handles with removal/fault
   behavior;
3. a separately authorized authenticated paired-LAN receiver with bounded
   resume, timeout, revocation, and reboot closure;
4. streaming hashing and a selected offline scanner with signed/updateable
   rules and explicit unavailable/error behavior;
5. a bounded ZIP inspector/extractor or a decision to keep archives disabled;
6. durable same-filesystem staging, real reservations, synchronized writes,
   hash revalidation, atomic no-replace promotion, and cleanup recovery;
7. crash-safe installed-library generation commits, conflict replacement,
   deletion, deduplication, quotas, and full-disk/power-loss campaigns;
8. isolation from packages, cores, BIOS, saves, states, remaps, profiles,
   updates, and source media;
9. family-mode/controller-accessible disclosure, progress, conflict,
   cancellation, and error UX; and
10. legal review, real entitled fixtures, both target architectures, hostile
    media/LAN tests, and proof that RetroArch never opens source paths.

No automatic commercial ROM, BIOS, key, metadata, or artwork acquisition is
authorized by this contract.
