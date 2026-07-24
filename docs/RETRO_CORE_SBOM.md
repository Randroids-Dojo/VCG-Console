# Libretro 2048 source-candidate SBOM

Status: active I-124 evidence; source candidate only, not approved or qualified

Last reviewed: 2026-07-24

## Purpose

`compliance/retro-cores/libretro-2048.candidate.json` is the first
per-core software bill of materials in the repository. It fixes one observed
upstream source revision and preserves all unresolved qualification boundaries
as machine-checked data.

The record is not a release SBOM and does not authorize distribution,
installation, or launch. The repository contains no downloaded source archive,
executable, or signature. It records a temporary source/archive audit and an
ephemeral x86-64 software-build observation without retaining or qualifying
the output.

## Fixed evidence

| Subject | Recorded evidence | Current conclusion |
|---|---|---|
| Upstream identity | [libretro/libretro-2048](https://github.com/libretro/libretro-2048) | The candidate is the upstream 2048 libretro core, not a similarly named package. |
| Source revision | [`c90437d3c3913999624deca3fb55ecfa632b72c4`](https://github.com/libretro/libretro-2048/commit/c90437d3c3913999624deca3fb55ecfa632b72c4) | Exact observed `master` revision; no published release is asserted. |
| Git tree | `5b8bcab69dc90185f10356b5780bf9d827684474` | Exact tree reached by the pinned commit. |
| Revision archive | SHA-256 `e60494b1b9b5483227c1f1c3cc06bddba256e9f82c9d6fa7abb1e7b31239f554`, 2,761,393 bytes | Three temporary downloads were byte-identical; all committed blobs and executable modes matched. |
| Core license text | [pinned `COPYING`](https://raw.githubusercontent.com/libretro/libretro-2048/c90437d3c3913999624deca3fb55ecfa632b72c4/COPYING) | Recorded as `LicenseRef-Unlicense`; legal review remains pending. |
| Runtime behavior | [Libretro 2048 documentation](https://docs.libretro.com/library/2048/) | Contentless/no-game start, no separately listed BIOS, RetroPad controls, and documented save/state/remap capabilities. |
| License context | [Libretro license index](https://docs.libretro.com/development/licenses/) | Libretro components have component-specific licenses; a frontend license does not qualify a core. |
| Known issues | [Upstream issue list](https://github.com/libretro/libretro-2048/issues) | Open reports are recorded individually and are not erased by source pinning. |

The revision archive was downloaded twice through the GitHub archive URL and
once through the equivalent codeload URL. All three byte streams matched. The
extracted archive contained exactly 475 files corresponding to all 475
committed Git blobs; every blob ID matched, there were no missing or extra
files, and all 22 executable modes matched the Git tree. This is a dated source
observation, not a promise that GitHub-generated archive bytes will remain
stable indefinitely. The absence of a published upstream release is still
represented as `null`, not as an invented version.

## Component boundary

The observed Unix non-Cairo compilation closure contains 39 tracked inputs:
two Makefiles, 16 C translation units, and the recursively included project
headers/source data. Within that closure:

- the pinned [`libretro.h`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/libretro-common/include/libretro.h)
  and all 30 other selected libretro-common inputs contain the exact MIT grant;
- the core/build inputs are covered by the repository's pinned Unlicense text
  as an upstream claim, with legal review still pending;
- [`noncairo/font2.c`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/noncairo/font2.c)
  embeds bitmap data labeled “Apple IIgs Original fonts” without an in-file
  license or provenance statement. It entered the repository in
  [`ff49f8c`](https://github.com/libretro/libretro-2048/commit/ff49f8c19ca5acf9650e5a0583bfe9e87e40f20c)
  as part of an “r-type” non-Cairo backend. It remains a distinct
  `NOASSERTION` component and blocks distribution qualification;
- the pinned
  [`Makefile.common`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/Makefile.common)
  and
  [`README.md`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/README.md)
  describe different dependency surfaces for non-Cairo and other build paths.

The 39-input inventory has deterministic digest
`d8e6bfd77bdd20226130f10044196863db8f687c1786ae8db28b4c07c50b6b4c`.
It describes one observed upstream path, not a selected production recipe.
Compiler and sysroot content hashes, target image, hermetic build environment,
and native package closure must still be fixed before a release SBOM can be
produced.

## Ephemeral x86-64 build observation

Two independent extractions of the hashed source archive were built in the
existing WSL2 Ubuntu 26.04 environment with:

```sh
SOURCE_DATE_EPOCH=1775830798 \
make -f Makefile.libretro \
  platform=unix \
  CC=gcc \
  GIT_VERSION=c90437d3
```

The recorded environment used GCC 15.2.0 package
`gcc-15=15.2.0-16ubuntu1`, binutils `2.46-3ubuntu2`, GNU Make `4.4.1-3`,
and glibc `2.43-2ubuntu2`. Both 90,864-byte outputs were byte-identical:

```text
SHA-256  0f5c3a9b12dbe013da4e2cc29a01f41efd2186cce40bd7463cb8ad5bfabd0a9d
format   ELF64 LSB shared object, x86-64
build ID 065233a8a805690890b95c6318efe3d0a9e8d982
needed   libc.so.6, libm.so.6
```

No temporary audit path was found in the output. The output was then left
outside the repository and is not a package artifact: it was not retained,
signed, vulnerability-scanned, loaded by a libretro frontend, executed,
tested on target hardware, or independently reproduced in another
environment. The x86-64 architecture status is therefore
`software-build-observed-unqualified`; ARM64 remains `unverified`.

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
- source archive hash, length, Git-tree, download-count, blob, or mode audit
  substitution;
- production build recipes, artifacts, or qualification claims;
- promotion or mutation of the ephemeral x86-64 build observation;
- missing, duplicate, unsupported, or falsely qualified architectures;
- content or BIOS requirements added to the contentless candidate;
- weakened license review, notice, or source-retention statements;
- mutation of the selected 31-file libretro-common MIT closure;
- removal or license promotion of the embedded Apple IIgs font bitmap;
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

1. Move the observed source path into a controlled hermetic build with pinned
   compiler binaries, package-repository snapshot, sysroot contents, flags,
   and exact dependency hashes, then reproduce it independently.
2. Resolve the provenance and redistribution rights for the embedded Apple
   IIgs font bitmap; replace or remove it if those rights cannot be proven.
3. Complete legal review of the Unlicense/public-domain wording, attribution,
   source-retention practice, selected MIT inputs, font data, and the public
   manifest's current `LicenseRef-Public-Domain` representation.
4. Build, scan, sign, hash, frontend-load, and target-run exact `aarch64` and
   `x86_64` artifacts. The WSL output does not satisfy this gate.
5. Reproduce or close the open crash blocker and execute the legibility and
   one-action startup cases on target-class displays.
6. Verify controls, save/state/remap behavior, audio/video timing, supervision,
   update/rollback, and uninstall cleanup through the signed package lane.
7. Generate a release SBOM and notice bundle from the exact selected build,
   rather than promoting this source-candidate document.

No owner decision is required to keep gathering this evidence. Artifact
distribution and a change from `unverified` remain prohibited until the
technical and legal gates above are independently satisfied.
