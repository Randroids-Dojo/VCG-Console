# Package Generation Protected State

Status: native core and fail-closed launcher intake implemented; a qualified
platform adapter is required before this is a production anti-rollback
boundary.

## Purpose

Signed package metadata prevents unauthorized package substitution, but a
writable generation store can still be deleted or replaced with an older,
previously valid snapshot. The host therefore binds package activation to a
small exact state document that must be persisted outside the package store in
platform-protected monotonic storage.

The JSON file accepted by `vcg-host` is an adapter representation. Copying that
file into the writable package store does **not** provide rollback protection.

## Protected document

The v1 document is closed JSON, limited to 1,024 bytes, and binds one update
scope:

```json
{
  "schemaVersion": 1,
  "channel": "stable",
  "target": "x86_64-windows",
  "generation": 0,
  "catalogSha256": null
}
```

After generation 42 is verified, health-qualified, and durably published, the
promotion result supplies the exact next document:

```json
{
  "schemaVersion": 1,
  "channel": "stable",
  "target": "x86_64-windows",
  "generation": 42,
  "catalogSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Generation zero is the only uninitialized state and must have a null digest.
Every nonzero generation requires a canonical lowercase SHA-256 digest.
Unknown fields, unsafe scope identifiers, malformed digests, and mismatched
channel or target values fail closed.

## Required state machine

1. The coordinator reads the current document from platform-protected storage.
2. `PackageGenerationStore` verifies that the highest writable activation
   marker exactly matches the protected generation and catalog digest.
3. Candidate signature, artifact, and health verification run only after that
   equality check succeeds.
4. Promotion durably publishes the generation and activation marker.
5. The promotion result returns `ProtectionCommitRequired` state. The old
   protected state can no longer launch, run generation cleanup, health-check,
   or promote another generation.
6. The trusted coordinator atomically advances protected storage to the exact
   returned document.
7. A newly opened store with that protected document re-verifies the signed
   catalog and artifacts before exposing the active catalog.

Recovery may rediscover the same exact pending document after an interruption.
It does not grant generic permission to trust the highest writable marker.
Only the trusted promotion/recovery coordinator may commit a state returned by
the authenticated promotion protocol. Launcher startup must report a pending
commit and stop; it must never auto-acknowledge it.

## Failure behavior

- Writable history below protected generation: reject as rollback or deletion.
- Same generation with another catalog digest: reject as substitution.
- Writable history above protected generation: report an exact pending commit;
  do not load it.
- Protected channel or target differs from the active update policy: reject.
- A prior commit is pending: reject candidate execution and later promotion.
- Protected state is ahead of all writable history: reject; never reconstruct
  a lower floor from package-store contents.

The active catalog and every referenced artifact are still signature- and
hash-verified after protected-state equality succeeds. Protected state is an
additional rollback boundary, not a replacement for update trust.

## Adapter obligations

The production adapter must provide:

- confidentiality is optional; integrity and anti-rollback are mandatory;
- atomic compare-and-swap from the exact old document to the exact promotion
  result;
- durable ordering: activation publication before protected-state advancement;
- no reset, channel switch, or target switch through ordinary writable
  configuration;
- a separately authorized recovery process for lost hardware or protected
  storage;
- audit events for successful advances and rejected mismatches;
- an exclusive slot whose identity cannot be redirected to another
  installation by package-store or browser-controlled input.

Platform mechanism selection and reset/channel-migration policy remain owner
decisions in
`docs/OWNER_QUESTIONS_PACKAGE_GENERATION_PROTECTION_2026-07-24.md`.

## Development boundary

The loose-catalog launcher source does not have persistent generation history
and cannot satisfy this protocol. It remains a development/diagnostic input,
not a production package source. Production launch must use the generation
store plus platform-protected state.
