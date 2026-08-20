# Shared retro import contract

Status: implemented pure contract/planner and native plain-file transaction
foundation; native operator provisioning implemented under a signed,
release-bound system policy; acquisition, scanner, product wiring, and
qualification not implemented

Last updated: 2026-08-19

## Scope

`@vcg/retro-import-contract` is the common policy, session, candidate,
installed-library, planning, and terminal-intent boundary for removable USB
and explicitly paired-LAN retro imports.

Both transports terminate in the same coordinator. Transport changes only the
bounded session authority and path-free provenance label; it does not change
file validation, entitlement, hashing, scan evidence, system mapping,
duplicate/conflict handling, capacity arithmetic, or installed-library
format.

A third transport, `operator-provisioned`, exists only in the native store.
It has no session, no browser surface, and no terminal intent, and the
TypeScript package neither emits nor accepts it. Its rules are in
[Operator-provisioned entries](#operator-provisioned-entries) below.

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
the current native policy's system/extension/core/controller/size mapping, and
a fresh full-hash check of the console-managed object. It writes an idempotent
`retro-import-reused` audit record without copying or advancing the library.
`cancel-and-cleanup` remains available after plan expiry or session
revocation, but a pending cleanup requires the exact inspection, expiry,
policy, generation, source, session, transport, system, entitlement, and audit
bindings of that transaction rather than plan ID alone. It removes only that
pre-publication stage, never rolls back published content, and writes an
idempotent `retro-import-cancelled` record. The plan-ID-only cleanup helper is
not public. An exact retry returns the original audit generation even if
unrelated imports have since advanced the library.

Store configuration can derive its exact `retro` and
`staging/retro-imports` roots from `StorageNamespacePlan`; it does not accept
browser-selected roots. A public bounded `current_library_json()` snapshot
returns only the closed installed-library document and refuses to serve a
planner while authoritative or unpublished recovery state exists.

## Operator-provisioned entries

An operator who stages their own collection from a workstation
([the deployment recipe](RETRO_CONTENT_DEPLOYMENT.md)) has no import session,
no acknowledgement recorded inside one, and no scanner result. Rather than
fabricate those, `vcg_host::retro_import` extends the transport vocabulary
with `operator-provisioned` and makes provenance a closed tagged union, so a
record can only carry the evidence its transport actually produced:

```text
{ "transport": "usb" | "paired-lan",
  "importSessionId": "ris-<32 hex>",
  "entitlementStatementVersion": "vcg-user-entitled-content-v1",
  "importedAtMs": <safe integer> }

{ "transport": "operator-provisioned" }
```

The operator-provisioned variant is a closed empty object. A document that
supplies `importSessionId`, `entitlementStatementVersion`, `importedAtMs`, or
any other field beside that transport is rejected, not stripped. The terminal
intent's transport vocabulary stays `usb` and `paired-lan`, so a browser or
planner cannot issue an operator-provisioned install, and an installed entry
carrying operator-provisioned provenance is refused by every terminal intent.

### What an operator-provisioned entry does carry

- the `content-<sha256>` entry ID, full SHA-256, byte size, canonical
  extension, and bounded visible title, on the same grammar as an imported
  entry;
- the exact core and controller-profile IDs from the release policy the
  provisioning run was given; and
- the position of its generation in the append-only library history, which is
  when it appeared.

### What it does not carry, and why

| Absent | Because |
| --- | --- |
| `importSessionId` | No session was opened. There is no bounded authority, expiry, or revocation to name. |
| `entitlementStatementVersion` | No one acknowledged anything inside a session. The operator's authority is shell access to the target, asserted by running the command, not a stored statement. |
| scan evidence | No scanner ran. The audit record has no scan field at all, and its absence is the claim. |
| an import or provision timestamp | The console has no trusted clock claim to make here, and the generation history already records order. Omitting it also makes the whole transaction deterministic, which is what lets an interrupted run be re-run rather than recovered. |

### What provisioning verifies

`vcg-host retro-provision` reads the staged payload's `staged-content.json`
and `objects/` directory, and:

- rejects a manifest whose document type, provenance label, core, controller
  profile, entry count, or total bytes disagree with either the signed system
  policy entry its system selects or its own entries, and rejects a system the
  signed policy does not describe at all;
- derives every object file name itself from the validated system ID, entry
  ID, and extension, and rejects a manifest whose `objectName` differs;
- **recomputes every SHA-256 itself.** The manifest's digests are never
  trusted. A new entry is hashed from the bytes copied into the console-managed
  object store; an entry the payload names that is already installed is
  rehashed in place. A dry run hashes the payload objects directly;
- refuses a hash already installed under another system, rather than
  reinterpreting it;
- enforces the policy's per-content ceiling, library entry count, and library
  byte quota, and the store's physical free-space reserve, before mutating
  anything.

The staged manifest's `sourceLabel` is the basename of a directory on the
operator's workstation. It is read and validated, and never persisted.
Nothing else in the payload reaches the library or the audit record.

The release policy provisioning enforces is a signed artifact, described in
[The signed system policy](#the-signed-system-policy) below. It is not an
operator claim: the system-to-core mapping and the capacity ceilings are
release-bound and tamper-evident, and adding a system or raising a ceiling
requires re-signing the document. The cores, controller profiles, BIOS rules,
and supported formats such a policy names are still unqualified; signing binds
the mapping, it does not qualify it.

### The signed system policy

`vcg-host retro-provision` loads its mapping from one signed document instead
of from per-system command-line arguments:

```text
vcg-host retro-provision [--dry-run]
  --writable-root <path>
  --payload <staged-payload-path>
  --system-policy <path>
  --system-policy-signature <path>
  --update-root-store <path>
  --update-root-anchors <path>
  --update-root-protected-state <path>
  --update-channel <channel>
  --trusted-unix-seconds <seconds>
  --reserve-bytes <bytes>
```

The policy is verified through the same trust path as the installed catalog,
not a second one. `vcg_host::update_trust` gains a `retro-system-policy`
artifact kind with its own `VCG-RETRO-SYSTEM-POLICY-V1` signing domain, so an
update root delegates it to a role exactly as it delegates `installed-catalog`:

```text
{"channel":"stable","artifact":"retro-system-policy","target":"aarch64-linux",
 "threshold":1,"keys":[{"keyId":...,"publicKey":...}]}
```

Verification uses the accepted-root store, out-of-band anchors, protected
generation state, channel, and trusted time the launcher already takes, and
replays that store read-only: a store awaiting recovery fails the run rather
than being repaired by it. Signature verification precedes JSON parsing, and
everything above happens before any root, object, generation, or audit record
is created.

The document itself:

```text
{
  "schemaVersion": 1,
  "policyId": "<bounded lowercase ID>",
  "policyRevision": <positive safe integer>,
  "target": "<arch-os>",
  "maxLibraryEntries": <1..=100000>,
  "maxLibraryBytes": <positive safe integer>,
  "systems": [
    {
      "systemId": "<bounded lowercase ID>",
      "extensions": [".fds", ".nes"],
      "coreId": "<exact core ID>",
      "controllerProfile": "<exact controller profile ID>",
      "maxContentBytes": <positive safe integer>
    }
  ]
}
```

One document describes every system a release supports, so provisioning NES
and SNES needs one policy rather than two. The staged payload's own system
selects its mapping; a payload naming a system the policy does not describe is
refused.

The vocabulary is closed. Rejected: unknown fields at either level, a schema
other than 1, a `target` other than the running target, an empty system list
or more than 64 systems, duplicate or unsorted system IDs, an empty extension
set or more than 16 extensions, unsorted or duplicate extensions, an extension
without a leading dot or outside
`[a-z0-9]{1,8}`, an identifier outside the
[identifier grammar](#identifier-grammar), a zero
revision or ceiling, a ceiling above the JavaScript safe-integer bound, and a
library-entry ceiling above the closed installed-library schema.

Policy revision is recorded, not enforced as a floor. An older signed policy
that is still within its root's authority can be replayed; what bounds that is
update-root expiry, generation floor, and role revocation, not a per-policy
monotonic counter.

### The provisioning audit record

One record per run, at `retro/audit/rop-<32 hex>.json`:

```text
event                = retro-operator-provisioned
provisioningId       = rop-<first 32 hex of the staged manifest's SHA-256>
policyId, policyRevision, systemId
stagedManifestSha256 = SHA-256 of the exact manifest bytes read
committedEntries, alreadyInstalledEntries, committedBytes
libraryGeneration    = the generation published
librarySha256        = SHA-256 of the exact generation document published
```

Both digests are checkable after the fact against files on the target. The
record carries no plan, session, entitlement, decision, scan, path, or
timestamp, because provisioning produces none of them.

### Interruption

Provisioning holds the same operation lock as an import and refuses to run
while an import awaits recovery. Because nothing in the transaction depends
on a clock, it needs no durable pending record: content objects are published
by no-replace hard link and are content-addressed, and the audit record is
published before the generation it names. Re-running the same payload
therefore converges — an already-published object is adopted after being
rehashed, an identical audit record and generation are recognized rather than
rewritten, and a changed policy or changed payload fails closed instead of
overwriting either. An interruption can leave a published object that no
generation references yet; it is inert, and the next run adopts it.

Policy verification does take a trusted time, because the accepted update root
expires. That check runs to completion before the transaction starts, so it
changes what a run is allowed to begin, not what an interrupted run has to
recover: a resumed run repeats the same verification and then converges on the
same content, generation, and audit record.

Provisioning never removes or rewrites an installed entry. Deletion remains
unimplemented for both transports.

### Transport-tagged provenance

`schemas/retro-installed-library.schema.json` and the TypeScript coordinator's
runtime library validation describe the same closed union the native host
records, tagged on `transport`. A `usb` or `paired-lan` entry requires
`importSessionId`, `entitlementStatementVersion`, and `importedAtMs`. An
`operator-provisioned` entry carries the tag alone, and any of those three
fields on it is rejected rather than ignored.

`operator-provisioned` is absent from the session, candidate, plan, and
terminal-intent vocabulary, which remains `usb` or `paired-lan`. A browser
cannot name it, so it cannot claim provisioning authority.

## Closed policy

The package contains no product system allowlist. Tests use a synthetic
Game Boy-shaped policy only to exercise the contract; it does not qualify a
core, game format, archive decoder, or title.

A production policy is host-owned and release-bound. Each system entry
contains:

- a system ID on the [identifier grammar](#identifier-grammar);
- sorted canonical plain extensions;
- explicitly allowed archive formats;
- one exact default core ID;
- one exact controller profile ID; and
- a per-content byte ceiling.

The global policy bounds sessions, plans, source bytes, archive entry count,
expanded bytes, compression ratio, library entries, and library bytes.
Unknown fields, duplicate system IDs, unsorted/duplicate extensions, unsafe
IDs, unsupported archive formats, and unsafe integers are rejected.

The native provisioning path implements this shape as a signed document:
[The signed system policy](#the-signed-system-policy). It carries no archive
formats, because provisioning decodes no archives — the staged payload is
already expanded, and its `container` field is a claim the console records
rather than acts on. The session, plan, source, and archive bounds belong to
the USB and paired-LAN transports, which have no host-owned policy source yet.

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
schema exported by the package and freshness-checked in its unit suite. That
suite also compiles the published document with a Draft 2020-12 validator and
runs it beside `parseRetroInstalledLibrary` over one corpus, so a schema that
accepted or rejected a document the parser did not would fail the build.

Each entry contains only:

- `content-<full SHA-256>` entry ID and the matching full SHA-256;
- system ID, byte size, canonical extension, bounded visible title;
- exact core and controller-profile IDs from signed policy; and
- path-free provenance: either USB/LAN session, entitlement-version, and
  import-time evidence, or the bare `operator-provisioned` transport described
  in [Operator-provisioned entries](#operator-provisioned-entries).

Runtime validation additionally requires unique entry IDs, unique
system/hash pairs, exact ID-from-hash derivation, NFC-normalized titles, and
agreement with the current signed system/core/controller/extension policy.
None of those five is expressible in Draft 2020-12; the schema carries every
other title rule, including the character set and the trimmed bounds.
Source paths, USB device identities, workstation names, IP addresses,
pairing keys, profile names, artwork URLs, and scanner details are not
representable.

### Identifier grammar

System and core IDs are 1-64 bytes of lowercase ASCII alphanumerics with
interior `-`. `.` is rejected. A signed installed-catalog package binds the
library entry it launches by system and core ID through the catalog's
intent-ID grammar, which admits no `.`, so an ID the library accepted but a
package could not name would describe a system or core nothing could launch.
The same grammar applies wherever those two IDs appear: signed policy,
staged manifest, installed entry, and terminal-intent audit projection.

Policy IDs, controller profiles, plan IDs, and scanner engine IDs are named
by no package. They keep the wider grammar, which admits interior `.` as well
as `-`.

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

The native module adds thirty-three Windows library tests and thirty-four
Linux tests.
One test consumes that same TypeScript fixture, hashes its real UTF-8 payload,
authorizes the exact intent, and commits it through the native store. The tests
cover shared USB/LAN intent handling, strict/unknown/path-bearing input,
exact-intent authorization, expiry/revocation/policy/generation checks before
mutation, source length/hash change, opened-source path replacement,
clean/blocked/error/unavailable/misbound scanner behavior, capacity overflow,
reported-free-space refusal before mutation, library history shape,
nonblocking lock and exact cancellation, refusal of eight same-plan pending
cancellation substitutions, incomplete-copy cleanup, recovery after source
removal, recovery across object/library publication windows, replacement
ordering, duplicate reuse with same-revision mapping substitution and
missing/tampered object refusal, cancellation after expiry/revocation and
after an unrelated generation advance, path-free audit persistence, shared
storage-namespace derivation,
an actual derived-root import that preserves package/core/save/state/remap/
profile/log/cache/package-staging sentinels, recovery-aware path-free library
snapshots, and Linux symlink refusal.

Provisioning adds tests for a closed operator-provisioned provenance that
rejects a supplied session ID, entitlement version, import time, or unknown
field; an operator payload that round-trips into a committed generation with
no session, entitlement, scan, or timestamp in either the library or the
audit record; a substituted staged object that fails closed before any
generation change and a corrected payload that then converges; adoption of an
object published before an interrupted run's generation; refusal of a changed
policy at the same revision and of a tampered installed object; refusal of a
hash already installed under another system and of provisioning while an
import awaits recovery; free-space refusal before mutation; fourteen rejected
manifest shapes including an unsafe object name, an undeclared extension, an
unknown field, and a duplicated entry; a sorted bounded extension set; and
continued refusal of every operator-provisioned or session-shaped terminal
intent. `vcg-host retro-provision` is covered end to end, from unprovisioned
roots through a committed generation.

The signed system policy adds tests for one document that provisions two
systems without re-signing; a policy signed by the installed-catalog role, by
a key the root does not know, with one appended byte, and with a raised
per-content ceiling, each refused; the command-line path refusing a raised
ceiling and a wrong-role signature before the writable root exists, and then
provisioning once the signed document is restored; a policy signed for another
target; a staged system the policy does not describe, refused with the
library, object store, audit directory, and staging root unchanged; and
twenty-five closed-vocabulary refusals covering unknown
fields at both levels, a wrong schema, unsafe identifiers, a dotted system and
core ID, zero and unsafe
ceilings, an oversized entry ceiling, an empty and an oversized system list,
duplicate and unsorted systems, and unsorted, duplicated, oversized, empty,
and dotless extension sets, and one policy whose dotted controller profile
still loads. Two further tests hold system and core IDs to the
[identifier grammar](#identifier-grammar): a dotted ID is refused in a
library generation, every identifier the wider grammar already refused is
still refused, and generations carrying the shipped `nes`/`mesen` and
`snes`/`snes9x` IDs still validate. `update_trust` adds tests that the
`retro-system-policy` role authorizes only its own artifact, bounds its
payload, and rejects catalog-domain signatures, catalog-role keys, and another
target's role.

Strict Clippy and Rustdoc pass on the module; physical power removal has not
been tested.

## Remaining implementation and evidence

I-199 remains active. Product activation still requires:

1. a signed production policy derived from qualified cores, controller
   profiles, BIOS rules, and exact supported systems/formats; operator
   provisioning now loads a signed, target-bound, release-signed policy
   through the update-root trust path, so what remains is qualifying the
   cores, profiles, BIOS rules, and formats a production document would name,
   and a policy source for the USB and paired-LAN transports;
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
