# Persistent Launch-Profile Registry

Last updated: 2026-07-24

Status: strict read-only registry intake and launcher source selection are
implemented. Profile creation, mutation, deletion, save unassignment,
encryption, backup exclusion, and target authorization remain open.

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

## Authority and privacy boundary

A registry ID authorizes only the existing minimal launch-intent profile field.
The host still re-resolves the signed installed package and derives all paths.
The document cannot select a package, executable, catalog, trust root, update
channel, runtime argument, environment name, or filesystem path.

The file representation is not self-protecting. Production must establish
which privileged component writes it, its filesystem ownership and mode, how
updates are synchronized, and how a hostile same-account writer is excluded.
The current parser supplies deterministic fail-closed intake, not protected
identity storage.

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
- launcher parsing, registry/development-ID mutual exclusion, and invalid-file
  denial; and
- passing only validated IDs into the existing authenticated launch-capability
  path.

## Explicitly unproven

- No production writer or mutation transaction exists.
- No registry version rollback, deletion journal, or protected high-water state
  exists.
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
