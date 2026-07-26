# Retro firmware and BIOS handling

Status: strict diagnostic and launch-binding contract implemented; product
integration unqualified

Last updated: 2026-07-24

Some emulated systems require firmware commonly called BIOS files. Emulator
and frontend licenses do not grant rights to redistribute those files. VCG
therefore treats every firmware object as a separate exact identity and never
infers redistribution permission from a core, console, filename, or common
availability.

## Policy boundary

The host-owned v1 policy binds:

- an opaque policy ID and positive revision;
- exact system and core IDs; and
- at most 64 strictly sorted unique firmware requirements.

Each requirement contains only an opaque ID, lowercase SHA-256, requiredness,
acquisition class, reviewed rights status, bounded license expression, and
reviewed documentation ID. `bundled-by-console` is valid only with
`approved-redistributable`; restricted or unverified firmware remains
`user-supplied-only`.

The strict schema rejects paths, filenames, URLs, display names, source-device
identity, encoded bytes, unknown fields, duplicates, unsafe IDs, invalid
hashes, and ambiguous ordering. Canonical JSON input is capped at 64 KiB.
Nothing in this contract downloads, names, locates, copies, or distributes a
firmware file.

## Installed inventory and diagnostics

The host supplies a separately parsed inventory bound to the same system and
core, an exact generation, and at most 128 sorted unique opaque ID/hash/scan
records. Readiness distinguishes:

- no firmware required;
- all required firmware ready;
- optional firmware attention; and
- blocked required firmware.

The result separately lists missing, mismatched, and blocked/unavailable IDs
for required and optional objects. It emits only stable action codes:

- `open-reviewed-firmware-help`;
- `select-local-firmware-files`; and
- `retry-firmware-scan`.

The product UI must map those codes and documentation IDs to reviewed
per-system copy. It must not suggest download sites, copyrighted filenames,
ownership claims, hash bypasses, or unrestricted filesystem browsing.

## Launch binding

Readiness is an in-memory capability, not just a structurally valid object.
Launch authorization accepts only the exact parsed policy, exact parsed
inventory, and exact readiness object that were evaluated together. Clones,
policy revisions, inventory generations, and system/core substitutions fail.
Blocked readiness cannot authorize launch.

The resulting immutable binding contains the exact policy/revision,
system/core, inventory generation, and required opaque ID/hash pairs. A native
host must still rebind these identities to retained regular-file handles,
verify bytes and scan status at launch, mount only the selected objects into
the per-game sandbox, and prevent RetroArch or a core from scanning arbitrary
source or system paths.

## Verification

Twelve focused tests cover:

- no-firmware and exact-required ready states;
- missing, wrong-hash, blocked, and unavailable required firmware;
- optional attention without false launch blocking;
- unique sorted bounded policy and inventory objects;
- refusal of paths, filenames, URLs, labels, bytes, and source devices;
- restricted-firmware bundle refusal;
- system/core confusion;
- cloned, stale-policy, and stale-inventory authority;
- parsed-object branding;
- bounded canonical UTF-8 JSON and duplicate-field rejection; and
- deeply frozen path-free diagnostics.

Run:

```sh
pnpm --filter @vcg/retro-firmware-contract test
pnpm --filter @vcg/retro-firmware-contract typecheck
```

## Remaining boundary

The current 2048 candidate correctly declares no BIOS requirements. No real
restricted firmware fixture is checked in. Product completion still requires
the selected system/core matrix; legal review for every exact firmware
identity; privileged selected-file import; retained-handle hashing and
scanning; encrypted or otherwise protected storage if selected; sandbox
mounting; per-system reviewed help; removal/reset/update behavior; target
RetroArch diagnostics; and physical corrupt/missing/wrong-revision tests.
