# Persistent Launch-Profile Registry

Last updated: 2026-07-24

Status: strict legacy v1 read-only launcher intake and a separate
rollback-resistant protected v2 loader are implemented. The launcher is not
yet wired to v2. Profile creation, mutation, deletion, save unassignment,
encryption, backup exclusion, platform protection, and target authorization
remain open.

## Purpose

The native launch API accepts a `profileId`, which selects host-derived runtime
and persistent-data namespaces. Browser display text must never create that
authority. The profile registry gives launcher restarts one persistent,
host-supplied allowlist instead of requiring every opaque ID to be repeated on
the command line.

The registry is deliberately not a user profile database. It contains no
display name, portrait, body-derived feature, calibration, save path,
permission, credential, or deletion instruction.

## Registry v1

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "profile-randy"
    },
    {
      "id": "guest-01"
    }
  ]
}
```

The parser:

- accepts at most 16 KiB and 64 entries;
- requires closed JSON objects and schema version `1`;
- accepts only the same bounded lowercase opaque IDs used by privileged launch
  intent;
- rejects duplicates, traversal-like or otherwise unsafe IDs, unknown fields,
  and trailing malformed data;
- preserves host-authored order; and
- permits an empty registry, which leaves the host metadata-only.

The launcher reads `--profile-registry <absolute-path>` as a bounded regular
non-symlink file. It is mutually exclusive with repeated `--profile-id`,
which remains a development-only compatibility input. Any nonempty launch
profile source requires the durable launch-replay root. Watchdog games require
at least one validated profile.

Registry parsing occurs before accepted-root or package-generation recovery.
An invalid profile document therefore cannot cause those recovery mutations
and then fail later during launch-service construction.

## Protected registry v2

The native library now also accepts a separate canonical protected form:

```json
{
  "schemaVersion": 2,
  "registryId": "11111111111111111111111111111111",
  "generation": 1,
  "previousRegistrySha256": "<lowercase SHA-256>",
  "profiles": [
    {
      "id": "profile-randy"
    }
  ]
}
```

Its exact external protected-state adapter document is:

```json
{
  "schemaVersion": 1,
  "registryId": "11111111111111111111111111111111",
  "generation": 1,
  "registrySha256": "<lowercase SHA-256>"
}
```

The 128-bit random registry identity is scope, not a person or credential.
Generation is monotonic. Each nonzero registry record binds the exact prior
canonical registry SHA-256, and protected state binds the complete current
canonical bytes.

Generation zero is one canonical empty registry with null identity and
predecessor. It grants no launch authority. A writable generation exactly one
step ahead of protected state is returned only as
`ProtectionCommitRequired`; none of its IDs are exposed for launch until the
platform protector commits the exact returned identity, generation, and
digest. Exact retry after that commit becomes `Active`.

The loader rejects:

- rollback behind protected generation;
- a same-generation byte or digest substitution;
- a jump of more than one generation;
- registry-identity substitution;
- a broken predecessor digest;
- noncanonical, padded, oversized, open, or malformed JSON;
- invalid or duplicate profile IDs; and
- display names, portraits, paths, or any other undeclared field.

This is a library boundary only. The current launcher still reads unprotected
v1 through `--profile-registry`; it does not accept a protected-state option
or activate v2. That integration must wait for an explicit migration and a
qualified platform protected-state adapter.

## Authority and privacy boundary

A registry ID authorizes only the existing minimal launch-intent profile field.
The host still re-resolves the signed installed package and derives all paths.
The document cannot select a package, executable, catalog, trust root, update
channel, runtime argument, environment name, or filesystem path.

Neither file representation is self-protecting. Production must establish
which privileged component writes it, its filesystem ownership and mode, how
updates are synchronized, how a hostile same-account writer is excluded, and
which protected platform slot performs durable atomic compare-and-swap. A
protected-state JSON file beside the registry is explicitly insufficient.

An empty or removed record does not define deletion. In particular, registry
absence must not delete saves, attach unassigned progress to another person,
erase portraits or calibration, or imply that sensitive profile material was
removed. Those require separately durable lifecycle transactions.

## Automated evidence

Focused Rust tests cover:

- ordered opaque IDs and a valid empty registry;
- unknown document and record fields;
- unsupported schema, unsafe IDs, duplicates, excessive entries, and payload
  size;
- canonical bounded protected state and safe empty generation zero;
- publish-before-protect denial followed by exact post-commit activation;
- rollback, same-generation substitution, generation jump, registry-scope
  drift, and predecessor substitution;
- protected-v2 rejection of sensitive fields and noncanonical bytes;
- launcher parsing, registry/development-ID mutual exclusion, and invalid-file
  denial; and
- passing only validated IDs into the existing authenticated launch-capability
  path.

## Explicitly unproven

- No production writer or mutation transaction exists.
- The protected high-water parser exists, but no platform protected-state
  adapter, slot, compare-and-swap, or launcher integration exists.
- No automatic v1-to-v2 migration exists.
- No deletion journal exists.
- No profile display metadata, portrait, calibration, body-profile prediction,
  or encrypted vault is implemented here.
- No save unassignment, claim, deletion, reset, factory-reset, backup, support,
  or recovery-image behavior is implemented here.
- Filesystem ownership, target-Linux hostile-writer tests, power loss, and
  multi-process read/write races are unqualified.
- The development `--profile-id` fallback remains accepted and must not be used
  as the production profile lifecycle.

Owner selections are recorded separately in
[the profile-registry questions](OWNER_QUESTIONS_PROFILE_REGISTRY_2026-07-24.md).
The remaining v1 provisioning/migration choice is isolated in
[the protected-registry handoff](OWNER_QUESTIONS_PROFILE_REGISTRY_PROTECTION_2026-07-24.md).
