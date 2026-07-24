# VCG game manifest v1

Last updated: 2026-07-23

`vcg-game.json` is the public, author-facing description of one game release. Version 1 declares presentation identity, runtime lane, architecture, input, permissions, network behavior, launch health policy, rights-review state, and the optional Libretro contract.

The authoritative runtime parser is `GameManifestSchema` in [`packages/game-manifest/src/index.ts`](../packages/game-manifest/src/index.ts). [`schemas/game-manifest.schema.json`](../schemas/game-manifest.schema.json) is its checked-in Draft 2020-12 export for editors and non-TypeScript tooling, identified as `urn:vcg:schema:game-manifest:1`. The repository validation command rejects a stale export.

## Compatibility rule

- `schemaVersion` is exactly `1`. An unsupported version fails closed; consumers must not guess or coerce it.
- Adding or removing a required field, changing a field's meaning or type, tightening a value constraint, or adding a value to a closed enum requires a new schema version.
- An optional field may remain within v1 only when every v1 consumer can safely ignore it and it cannot grant permission, change trust, weaken containment, select native authority, or alter destructive lifecycle behavior.
- The v1 parser preserves unknown fields for forward-compatible advisory metadata. Unknown fields have no authority. New manifests should prefix such fields with `x-<owner>-`; a future major schema may enforce that namespace.
- `minimumConsoleVersion` is a separate product-compatibility gate. It does not make an unknown schema version readable and does not authorize installation or launch.

The package version and schema version are independent. `version` identifies the game release. `schemaVersion` identifies how to interpret its manifest.

## Runtime rules

All manifests declare:

- a stable lower-kebab-case `id`, release `version`, title, publisher, and minimum console version;
- one runtime: `remote-web`, `local-web`, `native`, or `libretro`;
- supported architectures, requested permissions, input profiles, and network class;
- allowed HTTPS origins, compatibility status, launch timeout and health-check kind;
- distribution and license review state; and
- notes that do not override machine-readable policy.

Cross-field rules enforced by the parser include:

- `remote-web` entrypoints use HTTPS and their normalized origin appears in `allowedOrigins`;
- `offline` games cannot request `network`;
- `libretro` games are offline, have no web origin or web architecture, request only gamepad and persistent storage, and use process or explicit-ready health;
- Libretro entrypoint, selected core, architecture coverage, content mode, and no-game support agree; and
- a `qualified` Libretro manifest includes frontend and core hashes.

Standard JSON Schema cannot compare normalized URL origins or two arbitrary property values. The exported schema includes every representable rule and carries a comment identifying the parser-only checks. Passing only a generic JSON Schema validator is therefore insufficient for admission.

## Validation and diagnostics

Run:

```sh
pnpm prepare:schemas
pnpm test
pnpm validate:manifests
```

`pnpm validate:manifests` first compares the checked-in game-manifest schema byte-for-byte with the current generated export, then validates either every `catalog/*.vcg-game.json` file or the explicit paths supplied on the command line.

Author diagnostics use sorted `path: [issue-code] message` lines. Path and issue code are the stable automation surface. Human-readable messages are explanatory and may improve without a schema-version change.

Canonical fixtures live under [`packages/game-manifest/fixtures/v1`](../packages/game-manifest/fixtures/v1):

- `valid` covers every declared runtime lane;
- `invalid` pairs each rejected manifest with an `.errors.json` diagnostic expectation; and
- package tests require every checked-in fixture to keep its expected result.

## Migration policy

There is no implicit launch-time migration. A consumer either supports the declared schema version or rejects the manifest.

When v2 is introduced:

1. keep the v1 parser and fixtures while any supported package or rollback can reference v1;
2. publish a deterministic, side-effect-free v1-to-v2 authoring migration;
3. validate both the source and migrated destination and report any information that cannot be represented;
4. review changed permissions, network, rights, storage, health, and runtime authority explicitly;
5. issue a new game release and, for installed packages, a new independently signed catalog binding the exact new manifest bytes;
6. never rewrite a signed installed manifest in place; and
7. keep rollback metadata paired with the manifest version it originally bound.

A migration may populate a safe default only when the new-version contract defines that default. It must not infer distribution rights, qualification, permissions, origins, native paths, hashes, profile identity, or network access.

## Trust boundary

A valid public manifest is necessary but not sufficient for installation or launch. It is not a signature, entitlement record, qualification result, installed-path authority, or artifact-integrity envelope.

The Rust installed catalog separately verifies a detached signature, target, generation, qualification state, exact manifest hash and identity, and runtime artifact hashes. The browser may request a game by ID; it cannot turn advisory or unknown manifest fields into native authority.
