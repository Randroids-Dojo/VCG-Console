# VCG game manifest v1

Last updated: 2026-08-19

Two different v1 documents are written to the filename `vcg-game.json`. They are not interchangeable.

| Document | Governs | Parser | Export |
| --- | --- | --- | --- |
| Public game manifest | the curated shelf: `catalog/*.vcg-game.json` and the generated launcher catalog | `GameManifestSchema` | [`schemas/game-manifest.schema.json`](../schemas/game-manifest.schema.json) |
| Installed-root game manifest | the file one signed installed package binds by SHA-256 beneath the install root | `InstalledGameManifestSchema` | [`schemas/installed-game-manifest.schema.json`](../schemas/installed-game-manifest.schema.json) |

`documentType` tells them apart from their own bytes. An installed-root manifest must declare `"documentType": "vcg-installed-game-manifest"`. Public manifests are already published without the field, so the public parser is unchanged and absence means the public document. `classifyGameManifestDocument` returns `public`, `installed-root`, or `unrecognized`, and `unrecognized` fails closed: neither parser applies. The native host requires it: `verify_bound_manifest` rejects a bound manifest that omits `documentType` or declares the public document's name, before it checks identity, qualification, timeout, or health kind.

## Public game manifest

`vcg-game.json` is the public, author-facing description of one game release. Version 1 declares presentation identity, runtime lane, architecture, input, permissions, network behavior, launch health policy, rights-review state, and the optional Libretro contract.

The authoritative runtime parser is `GameManifestSchema` in [`packages/game-manifest/src/index.ts`](../packages/game-manifest/src/index.ts). [`schemas/game-manifest.schema.json`](../schemas/game-manifest.schema.json) is its checked-in Draft 2020-12 export for editors and non-TypeScript tooling, identified as `urn:vcg:schema:game-manifest:1`. The repository validation command rejects a stale export.

## Compatibility rule

These rules govern both documents.

- `schemaVersion` is exactly `1`. An unsupported version fails closed; consumers must not guess or coerce it.
- Adding or removing a required field, changing a field's meaning or type, tightening a value constraint, or adding a value to a closed enum requires a new schema version.
- An optional field may remain within v1 only when every v1 consumer can safely ignore it and it cannot grant permission, change trust, weaken containment, select native authority, or alter destructive lifecycle behavior.
- The v1 parser preserves unknown fields for forward-compatible advisory metadata. Unknown fields have no authority. New manifests should prefix such fields with `x-<owner>-`; a future major schema may enforce that namespace.
- `minimumConsoleVersion` is a separate product-compatibility gate. It does not make an unknown schema version readable and does not authorize installation or launch.

The package version and schema version are independent. `version` identifies the game release. `schemaVersion` identifies how to interpret its manifest.

## Runtime rules

All public manifests declare:

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

Permission values are a closed v1 enum. Raw camera video, microphone, identity,
presence-only Motion, rich/world Motion, and console-owned shell actions are not
requestable. `deriveGamePermissionGrant` is the separate authority boundary:
after parsing, it rejects non-offline network modes without `network` and
requires `motion.core17`, `motion.actions.obstacle`, and
`motion.obstacle.v1` to agree before returning exact bridge profiles. These
launch-time checks preserve the already-published v1 parser acceptance contract
instead of silently tightening it. See the
[game permission model](GAME_PERMISSION_MODEL.md).

Standard JSON Schema cannot compare normalized URL origins or two arbitrary property values. The exported schema includes every representable rule and carries a comment identifying the parser-only checks. Passing only a generic JSON Schema validator is therefore insufficient for admission.

## Installed-root game manifest

The signed installed catalog binds one manifest per package by relative path and SHA-256. That document is not a shelf entry: it never enters the public catalog, and it carries no presentation, permission, rights, origin, or architecture obligation.

`InstalledGameManifestSchema` in [`packages/game-manifest/src/installed-manifest.ts`](../packages/game-manifest/src/installed-manifest.ts), reachable as `@vcg/game-manifest/installed`, requires exactly the fields the native host reads, plus the discriminator. Its Draft 2020-12 export is identified as `urn:vcg:schema:installed-game-manifest:1`. The module does not import the public parser: the two documents version independently, so each states its own leaf grammar.

- `documentType` is `vcg-installed-game-manifest`.
- `schemaVersion` is exactly `1`.
- `id` and `version` are the bounded lowercase ID and 1–128 visible ASCII version the signed catalog entry must match.
- `runtime` is `libretro` or `native`; those are the implemented installed lanes.
- `compatibilityStatus` is `qualified` or `unverified`, matching the signed qualification.
- `launch.timeoutMs` is 1,000–120,000 and `launch.healthCheck.type` is `process` or `explicit-ready`. HTTP health is rejected for both installed lanes.

An optional `libretro` record states the content mode. Installed packages have three:

| Mode | Meaning |
| --- | --- |
| `none` | the core starts with no content; requires `libretro.core.supportsNoGame` |
| `managed` | one fixed file, named by `format` and `sha256` |
| `library` | one entry the host selects from the installed retro library, bounded by `systemId` and `coreId` |

`library` exists only in this document. The public manifest keeps `none` and `managed` because a library package never reaches the curated shelf. The [signed installed catalog](INSTALLED_PACKAGE_CATALOG.md) holds the signed content record that admits a library entry and re-verifies that entry per launch.

The frontend, core, and base-configuration paths and digests come from the signed catalog rather than from this document, so the `libretro` record requires only `content`. Cross-field rules the parser enforces beyond the exported schema: a declared `entrypoint` must identify the selected core, and a `qualified` manifest must hash every Libretro artifact it names.

The native host reads seven fields: `documentType`, `schemaVersion`, `id`, `version`, `runtime`, `compatibilityStatus`, and `launch`. Its reader still does not deny unknown fields, so an installed-root manifest may carry authored fields the host never reads, but the document type itself is enforced rather than merely admitted. A package whose bound manifest omits it fails catalog load, which includes `--dry-run`.

## Validation and diagnostics

Run:

```sh
pnpm prepare:schemas
pnpm prepare:catalog
pnpm test
pnpm validate:manifests
```

`pnpm validate:manifests` first compares the checked-in game-manifest schema and browser-safe launcher catalog byte-for-byte with their current generated exports, validates exact launcher-policy membership, then validates either every `catalog/*.vcg-game.json` file or the explicit paths supplied on the command line. See [the canonical launcher policy](LAUNCHER_CATALOG_POLICY.md) for the presentation-only authority split.

`schemas/game-manifest.schema.json` is generated by `pnpm prepare:schemas` and gated by `pnpm validate:schemas`. `schemas/installed-game-manifest.schema.json` is not yet in that pipeline: it is checked in and compared byte-for-byte by a `packages/game-manifest` test, so `pnpm -r test` rejects a stale export. Adding `["installed-game-manifest.schema.json", installedGameManifestJsonSchema]` to `scripts/export-schemas.ts` puts it under `pnpm prepare:schemas` and `pnpm validate:schemas` as well.

Author diagnostics use sorted `path: [issue-code] message` lines. Path and issue code are the stable automation surface. Human-readable messages are explanatory and may improve without a schema-version change.

Canonical fixtures live under [`packages/game-manifest/fixtures/v1`](../packages/game-manifest/fixtures/v1):

- `valid` covers every declared runtime lane;
- `invalid` pairs each rejected manifest with an `.errors.json` diagnostic expectation; and
- package tests require every checked-in fixture to keep its expected result.

[`packages/game-manifest/fixtures/installed-root-v1`](../packages/game-manifest/fixtures/installed-root-v1) holds the installed-root fixture: a `library` package on a core that cannot start without content. Package tests require it to parse as an installed-root manifest and to be rejected by the public parser.

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

Neither document is authority. A valid public manifest is necessary but not sufficient for installation or launch. It is not a signature, entitlement record, qualification result, installed-path authority, or artifact-integrity envelope. A valid installed-root manifest is a document the signing operator must still bind by digest in a signed catalog; parsing it grants nothing.

The Rust installed catalog separately verifies a detached signature, target, generation, qualification state, exact manifest hash and identity, and runtime artifact hashes. The browser may request a game by ID; it cannot turn advisory or unknown manifest fields into native authority. Likewise, a parsed permission array is not authority until the host derives and enforces the bounded grant.
