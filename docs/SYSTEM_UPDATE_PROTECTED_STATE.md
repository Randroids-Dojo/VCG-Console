# System-Update Journal Protected State

Status: native protocol implemented; platform storage, boot coordination, and
target qualification remain required before this is a production
anti-rollback boundary.

## Purpose

The A/B update journal is append-only and hash-linked, but its files remain
writable local history. Deleting its newest records could restore an older
active slot, retry a rejected image generation, or reuse boot-attempt IDs.
Protecting only the highest image generation would also permit substitution of
different boot, health, or rollback state at the same generation.

Every journal read and mutation therefore binds to the exact latest canonical
record through a small state document stored outside the journal in
platform-protected monotonic storage. Copying this JSON into the writable
journal directory does not provide rollback protection.

The protected document is v1. The channel-bearing journal record is v2; old
prototype v1 journal history is rejected rather than silently reinterpreted.

## Protected document

The closed v1 document is limited to 1,024 bytes and binds the delegated update
channel, platform target, exact record sequence, and SHA-256 of the complete
canonical record bytes:

```json
{
  "schemaVersion": 1,
  "channel": "stable",
  "target": "raspberry-pi-5",
  "sequence": 0,
  "recordSha256": null
}
```

Sequence zero is the only uninitialized state and must have a null digest.
After journal initialization or another transition, the operation returns the
exact next document:

```json
{
  "schemaVersion": 1,
  "channel": "stable",
  "target": "raspberry-pi-5",
  "sequence": 42,
  "recordSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Every nonzero sequence requires canonical lowercase SHA-256. Unknown fields,
unsafe channel or target identifiers, inconsistent sequence/digest pairs, and
oversized or malformed documents fail closed.

## Required transaction

1. The privileged coordinator reads the current document from protected
   storage.
2. The journal replays and validates the complete hash-linked history, then
   requires its latest record to equal that exact target, channel, sequence,
   and digest.
3. The caller presents the operation-specific authority: sealed verified image
   evidence, an attempt budget, a boot claim, a same-attempt health result, or
   interrupted-boot recovery.
4. The journal validates the transition and durably publishes one canonical
   next record.
5. The operation returns `SystemUpdateTransition`, containing its outcome and
   the exact next protected document.
6. No snapshot, boot selection, health transition, rollback, or later mutation
   may use the new record until the platform adapter atomically
   compare-and-swaps the old document to that exact returned document.
7. A boot claim's returned state must be committed before control transfers to
   the candidate slot. Confirmation or rollback state must be committed before
   it guides later boot selection.

Every record transition—not merely image staging or confirmation—uses this
protocol. That preserves globally monotonic attempt IDs, same-attempt health
facts, consumed attempt budgets, rejected-generation history, and active-slot
selection.

## Authenticated retry and interruption

If a crash occurs after record publication but before the protected commit,
ordinary reads return `ProtectionCommitRequired` with sequence numbers only.
They do not return a digest or state that writable history could promote into
authority.

The coordinator can repeat the exact operation with the prior protected
document. The journal applies that operation to the protected prior snapshot,
reconstructs the exact canonical next record, and returns the pending state
only when its hash exactly equals the one existing record ahead. This makes
initialization, image staging, arming, boot claim, health pass, health failure,
timeout rollback, and interrupted-boot recovery idempotent across publication
crashes. A different sealed image, attempt budget, health gate, or rollback
reason cannot claim the pending record.

An unpublished temporary record remains inert and may be discarded after the
committed journal record is authenticated. A published duplicate temporary
name is removed only after either the exact operation retry authenticates the
record or the supplied protected state already equals it. Multiple unexplained
records ahead are never collapsed into one commit.

## Failure behavior

- Journal sequence below protected state: reject as deletion or rollback.
- Same sequence with another record digest: reject as substitution.
- Journal one record ahead during an ordinary read or a nonmatching retry:
  reject without returning commit authority.
- Journal more than one record ahead: reject without guessing intermediate
  operations.
- Protected channel or target differs from the initialized journal: reject.
- Candidate sealed evidence uses another channel, target, active slot, or
  nonadvancing generation: reject before publication.
- Any malformed record, broken hash link, impossible transition, unexpected
  entry, or ambiguous temporary state: reject.

The journal record hash covers the complete snapshot, including active and
pending image facts, highest generation, global attempt ID, attempt budget and
phase, passed health gates, and rollback diagnostic. It is an additional
anti-rollback boundary, not a replacement for delegated signature verification,
inactive-slot read-back, or bootloader enforcement.

## Adapter obligations

The production adapter must provide:

- integrity, anti-rollback, and durable exact compare-and-swap;
- one exclusive slot whose identity cannot be redirected by writable journal,
  launcher, game, profile, or package input;
- record publication before protected-state advancement;
- no boot transfer before a boot-claim state advance succeeds;
- no later state transition or boot selection while a commit is pending;
- separately authorized channel/target migration and destructive reset;
- audit events for successful advances and every mismatch;
- recovery behavior that never derives authority from unexplained writable
  journal contents.

Confidentiality is optional because the document contains only update scope,
sequence, and a digest. The selected Windows/Linux/Raspberry Pi protected
storage mechanism, boot-coordinator transaction, channel migration, reset
authority, and product response remain owner and target-qualification work.

## Development boundary

The test-only direct image-signature loader marks its sealed evidence as the
`development` channel. Production image evidence inherits the exact delegated
channel from `VerifiedUpdateRole`; that channel is persisted in every image
record and must match both active history and protected state.
