# Owner question: protected profile-registry provisioning

Last updated: 2026-07-24

The native library now has a strict protected profile-registry v2 loader, but
the launcher intentionally still reads legacy unprotected v1. The following
choice must be resolved before production wiring; the loader itself does not
grant migration or mutation authority.

## Q-244: v1 provisioning and migration ceremony

How should an existing v1 opaque-ID registry become the first protected v2
registry, and which component is authorized to provision its random registry
identity and initial platform state?

Safe default: do not automatically adopt writable v1 bytes during family-mode
startup. Enter an authenticated maintenance-only transaction, validate the
legacy IDs, allocate a fresh random 128-bit registry identity inside the
privileged profile service, publish one canonical generation-1 v2 registry
whose predecessor is the canonical empty v2 digest, commit its exact state to
the dedicated platform-protected slot, and only then enable family launch.
Failure at any boundary leaves the host metadata-only. Retire v1 only after
the protected commit is durably read back.

The transaction must not infer deletion, vault ownership, save ownership, or
same-name reassociation from the v1 list. It must coordinate with Q-134 and
Q-191, use a registry-specific protected slot and atomic compare-and-swap, and
record only path-free success/failure facts. A JSON state file stored beside
the writable registry is not an acceptable protector.

Evidence needed to close Q-244:

- the exact privileged writer and maintenance authorization ceremony;
- platform slot identity, rollback resistance, atomic compare-and-swap, and
  write-budget evidence on both hardware tiers;
- interrupted publication/commit/readback/retry tests at every boundary;
- hostile same-account v1/v2 replacement, deletion, rollback, clone, and scope
  substitution tests;
- proof that no v2 profile ID becomes launch authority before the exact
  protected commit;
- explicit disposition for a missing, corrupt, empty, or already-migrated v1
  source; and
- coordination with the vault/save deletion transaction without treating
  registry migration as identity-data migration.
