# Release compliance and SBOM

Status: deterministic evidence gate implemented; release gate intentionally blocked

Authority: D-104, Q-074, and I-137

## Generated artifacts

`pnpm prepare:compliance` produces two tracked files:

- `compliance/vcg-console.cdx.json`: a CycloneDX 1.7 JSON SBOM; and
- `compliance/DEPENDENCY_NOTICES.md`: a human-readable inventory of package,
  crate, and pinned-asset license metadata.

The generator inventories the installed frozen pnpm graph, the complete locked
Cargo resolver graph, every first-party workspace component, and the two pinned
runtime assets in `ASSET_PROVENANCE.json`. Component references, ordering,
serial number, scope, hashes, and output bytes are deterministic.

The current evidence contains 132 components: the project root, six
first-party subcomponents, 81 npm packages, 43 Cargo packages including the
native host, and two pinned assets. npm dependencies present only for
development are marked `excluded`; installed production dependencies and the
locked Rust graph are `required`.

## Two separate gates

Run:

```sh
pnpm validate:compliance
```

This reproducibility/evidence gate:

- regenerates from installed package metadata, `Cargo.lock`, and pinned assets;
- fails if either tracked artifact is missing or stale;
- fails on duplicate component references;
- fails on any new third-party component without reported license metadata; and
- accepts only the two explicitly named release blockers below.

Run:

```sh
pnpm validate:release-compliance
```

The release gate performs the same checks and then fails while any named
blocker remains. Its current nonzero result is intentional and must not be
waived or relabeled as release-ready.

## Current release blockers

1. The repository has no selected first-party code/documentation/hardware-file
   license. The SBOM leaves the root, five TypeScript packages, console app, and
   Rust host unresolved rather than inventing an SPDX expression.
2. The exact redistribution/license terms for the pinned MediaPipe Pose
   Landmarker Lite `.task` artifact are not recorded. The Apache-2.0 package
   metadata for `@mediapipe/tasks-vision` is evidence for that npm package, not
   automatic evidence for a separately downloaded model binary.

The requested owner decisions and closure evidence are isolated in
`OWNER_QUESTIONS_RELEASE_COMPLIANCE_2026-07-24.md`.

## Notices and source-offer plan

For every release candidate:

1. build independently on each target architecture from the frozen lockfiles;
2. regenerate the SBOM on ARM64 and x86-64 so platform-conditional packages are
   not hidden by the Windows development inventory;
3. archive exact project source, lockfiles, package manifests, build scripts,
   patches, and reproducibility instructions at the release tag;
4. collect the exact upstream LICENSE, NOTICE, attribution, and source files
   required by the selected license path for every shipped component;
5. include the curated `THIRD_PARTY_NOTICES.md`, generated dependency notices,
   machine SBOM, checksums, signatures, and a durable corresponding-source
   location in the release bundle;
6. resolve every `OR` license expression deliberately rather than assuming all
   alternatives apply or silently choosing the most convenient one;
7. review reciprocal terms, including required MPL-2.0 build components and
   any selected LGPL alternative, against the exact files actually
   distributed; and
8. make the release gate a required CI job with no known-blocker override.

This is an engineering process, not a legal conclusion. A counsel or qualified
release-compliance review remains required before public binary/image
distribution.

## Evidence boundary

The current npm inventory reflects installed packages for this Windows
workstation. It is reproducible and exposes platform scope honestly, but it
does not substitute for ARM64/x86-64 release-job inventories. The generated
notices list upstream metadata; they do not yet embed every verbatim license
and NOTICE file. Emulator cores, game content, firmware, operating-system
images, browser binaries, native system libraries, and enclosure sources enter
the release SBOM only when exact artifacts are selected.

For those reasons I-137 is active, not closed.
