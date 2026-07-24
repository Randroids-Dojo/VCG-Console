# Libretro 2048 source-candidate SBOM

Status: active I-124 evidence; source candidate only, not approved or qualified

Last reviewed: 2026-07-24

## Purpose

`compliance/retro-cores/libretro-2048.candidate.json` is the first
per-core software bill of materials in the repository. It fixes one observed
upstream source revision and preserves all unresolved qualification boundaries
as machine-checked data.

The record is not a release SBOM and does not authorize download, compilation,
distribution, installation, or launch. It contains no executable, source
archive, signature, artifact hash, or claim that either requested architecture
works.

## Fixed evidence

| Subject | Recorded evidence | Current conclusion |
|---|---|---|
| Upstream identity | [libretro/libretro-2048](https://github.com/libretro/libretro-2048) | The candidate is the upstream 2048 libretro core, not a similarly named package. |
| Source revision | [`c90437d3c3913999624deca3fb55ecfa632b72c4`](https://github.com/libretro/libretro-2048/commit/c90437d3c3913999624deca3fb55ecfa632b72c4) | Exact observed `master` revision; no published release is asserted. |
| Core license text | [pinned `COPYING`](https://raw.githubusercontent.com/libretro/libretro-2048/c90437d3c3913999624deca3fb55ecfa632b72c4/COPYING) | Recorded as `LicenseRef-Unlicense`; legal review remains pending. |
| Runtime behavior | [Libretro 2048 documentation](https://docs.libretro.com/library/2048/) | Contentless/no-game start, no separately listed BIOS, RetroPad controls, and documented save/state/remap capabilities. |
| License context | [Libretro license index](https://docs.libretro.com/development/licenses/) | Libretro components have component-specific licenses; a frontend license does not qualify a core. |
| Known issues | [Upstream issue list](https://github.com/libretro/libretro-2048/issues) | Open reports are recorded individually and are not erased by source pinning. |

The source archive URL is revision-specific, but its SHA-256 is deliberately
`null`: the archive has not been fetched into a controlled qualification
workflow. The absence of an upstream release is represented as `null`, not as
an invented version.

## Component boundary

The source tree vendors libretro API and libretro-common material:

- the pinned [`libretro.h`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/libretro-common/include/libretro.h)
  carries an observed MIT header;
- the vendored libretro-common subset remains `NOASSERTION` until every file
  selected by the final build recipe receives a complete license review;
- the pinned
  [`Makefile.common`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/Makefile.common)
  and
  [`README.md`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/README.md)
  describe different dependency surfaces for non-Cairo and other build paths.

Consequently, the candidate does not claim a selected recipe or complete
dependency closure. Compiler, flags, sysroot, target image, reproducibility
environment, and transitive native libraries must be fixed before a release
SBOM can be produced.

## Known-issue dispositions

- [Issue 11](https://github.com/libretro/libretro-2048/issues/11), a reported
  segmentation fault during ordinary gameplay, blocks qualification until it
  is reproduced and resolved or closed with target-specific evidence.
- [Issue 33](https://github.com/libretro/libretro-2048/issues/33) requires
  TV-distance and low-resolution font-legibility testing.
- [Issue 42](https://github.com/libretro/libretro-2048/issues/42) requires the
  planned one-action `Start Core` and recovery-flow test.
- [Issue 25](https://github.com/libretro/libretro-2048/issues/25) requests a
  5x5 mode and is explicitly non-required for this candidate.

The checked record requires every issue to remain open and preserves the crash
as a blocking disposition. A later observation may update the record only
through a new evidence review; validation cannot silently treat an upstream
change as qualification.

## Machine-enforced boundary

`scripts/retro-core-sbom.mjs` accepts at most 64 KiB of valid UTF-8 JSON and
rejects:

- duplicate JSON member names, including escape-equivalent names;
- unknown or missing fields at every object boundary;
- alternate source revisions, archives, evidence links, or reviewed facts;
- release or archive-hash claims that have not been established;
- build recipes, artifact hashes, byte lengths, or qualification claims;
- missing, duplicate, unsupported, or falsely qualified architectures;
- content or BIOS requirements added to the contentless candidate;
- weakened license review, notice, or source-retention statements;
- removal of the libretro-common `NOASSERTION` boundary;
- duplicate evidence, dependency, or issue identifiers; and
- removal or weakening of the open gameplay-crash blocker.

Generation is deterministic. Verify the tracked record and its adversarial
tests from the repository root:

```sh
node scripts/generate-retro-core-sbom.mjs --check
node --test scripts/validate-retro-core-sbom.test.mjs
```

Running `node scripts/generate-retro-core-sbom.mjs` intentionally rewrites only
the tracked candidate JSON from the reviewed in-code source record.

## Remaining qualification gates

I-124 remains active. All of the following still require direct evidence:

1. Download and hash the exact source archive in the controlled build
   workflow, then prove it resolves to the reviewed source tree.
2. Select one reproducible build recipe and close the complete source and
   native dependency/license inventory.
3. Complete legal review of the Unlicense/public-domain wording, attribution,
   source-retention practice, and the public manifest's current
   `LicenseRef-Public-Domain` representation.
4. Build, scan, sign, hash, and execute exact `aarch64` and `x86_64` artifacts.
5. Reproduce or close the open crash blocker and execute the legibility and
   one-action startup cases on target-class displays.
6. Verify controls, save/state/remap behavior, audio/video timing, supervision,
   update/rollback, and uninstall cleanup through the signed package lane.
7. Generate a release SBOM and notice bundle from the exact selected build,
   rather than promoting this source-candidate document.

No owner decision is required to keep gathering this evidence. Artifact
distribution and a change from `unverified` remain prohibited until the
technical and legal gates above are independently satisfied.
