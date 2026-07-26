# First-party game repository rights audit

Evidence date: 2026-07-24

Status: exact-head public-repository screen; I-095 remains active

Qualification result: zero offline redistribution approvals

## Outcome

All 23 first-party entries in the 2026-07-19 VibeCoded.Games snapshot map to
public, non-archived repositories in the `Randroids-Dojo` GitHub organization.
Each repository was screened at the exact public `HEAD` listed below. Public
visibility and organization membership grant no implicit redistribution
authority.

The screen found:

- 20 repositories with no root license text and no root package-license
  declaration;
- BlockPunchKick with an `ISC` string in `package.json`, but no root license
  text;
- Clankers with MIT text plus an explicit scope exclusion for an upstream game
  design document;
- VibeGear2 with root MIT text, an MIT package declaration, and GitHub SPDX
  detection; and
- zero recorded owner authorizations, content/title clearances,
  source-to-deployment bindings, or redistribution approvals.

The authoritative artifact is
[`repository-rights-screen-v1.json`](../compliance/first-party-game-rights/repository-rights-screen-v1.json).
Its 23 game records are bound by SHA-256
`a74854b7041f9c206433dd35cd8370825e26c710ceb58e2d1c0ddc2ae99f1e81`.
The artifact records `redistributionApprovedCount: 0` and
`productionCatalogMutationCount: 0`.

## Claim boundary

This is a repository metadata and file-inventory screen, not legal advice. It
does not decide whether a contributor had authority to license a work or
whether a repository grant covers every image, audio file, font, model,
trademark, title, design document, dependency, generated build, service, or
deployed byte.

An asset-extension count is a review locator, not proof that the file is
third-party or unlicensed. A zero count does not prove that a repository
contains no protectable content: content can be procedural, embedded in code,
stored under another extension, generated, fetched at runtime, or held in a
service.

The three promoted community entries—Asymptotic Bitrot, Bone Cleaver, and
Vibeman (Hangman)—do not have first-party repository links in the catalog
snapshot and are outside this artifact. They remain blocked by the separate
curated-community admission process.

## Exact repository screen

`No grant` means no root license text or root package declaration was observed.
`Declaration only` is not treated as license text. `Grant observed` still
requires content, title, owner, notices, build, and deployment review.

| Game | Repository | Exact HEAD | Repository signal | Asset-like files | Result |
|---|---|---|---|---:|---|
| VibeBots | `VibeBots` | `f9b988ca72bb` | No grant | 70 | Blocked |
| VibePinball | `VibePinball` | `a9c324d13dac` | No grant | 4 | Blocked |
| VibeRacer | `VibeRacer` | `4ff30a43d52f` | No grant | 15 | Blocked |
| VibePins | `VibePins` | `554da94c403e` | No grant | 0 | Blocked |
| Fracking Asteroids | `FrackingAsteroids` | `02e3804487b0` | No grant | 1 | Blocked |
| Hoops | `Hoops` | `49eee13a3855` | No grant | 2 | Blocked |
| Mi Casa Es Su Casa | `mi-casa-es-su-casa` | `c296f181d94d` | No grant | 2 | Blocked |
| Block Punch Kick | `BlockPunchKick` | `cf6b48c239de` | `package.json`: `ISC`; declaration only | 1 | Blocked |
| Epoch | `epoch` | `6fb5052954f3` | No grant | 1 | Blocked |
| GameTape | `GameTape` | `22f5a48ac0a6` | No grant | 0 | Blocked |
| GoPit | `GoPit` | `3210032b0b80` | No grant | 0 | Blocked |
| Block-You | `Block-You` | `f01884999966` | No grant | 2 | Blocked |
| Determined | `Determined` | `7d9a38dc2c64` | No grant | 0 | Blocked |
| SoftwareDevSim | `SoftwareDevSim` | `2fc19ea64f5e` | No grant | 0 | Blocked |
| Baby Piano | `BabyPiano` | `f4e286eac374` | No grant | 0 | Blocked |
| Clankers | `Clankers` | `9e2bae34a735` | MIT text with explicit upstream-GDD exclusion | 0 | Blocked |
| VibeCity | `VibeCity` | `8c8896f4ba53` | No grant | 13 | Blocked |
| Flatline | `Flatline` | `8f2ecf4720c1` | No grant | 0 | Blocked |
| VibeGear2 | `VibeGear2` | `6f1eda21bbe2` | Root MIT text, package MIT, GitHub MIT | 207 | Blocked |
| Text Racer | `text-racer` | `385cf6c39867` | No grant | 0 | Blocked |
| Drop Dead Keep | `drop-dead-keep` | `f814e8702cfc` | No grant | 0 | Blocked |
| Streamer Billboard | `StreamerBillboard` | `4260e913855c` | No grant | 0 | Blocked |
| GoDig | `GoDig` | `bbb1271d1812` | No grant; one submodule | 42 | Blocked |

The full 40-character commit identities, repository URLs, package-manifest
hashes, license/notice path inventories, root-license hashes, extension
category counts, and submodule paths are in the JSON artifact.

## Three non-empty license signals

### VibeGear2

At commit `6f1eda21bbe2152ecd43ed0de05522a8c58c726c`, the root
`LICENSE` is 1,079 bytes with SHA-256
`a76ed9d1bc3e3df0bda019fab0d6f06ce59b6d14e6f789394f6fd15445ff59e8`.
The root package manifest also declares `MIT`, and GitHub detects `MIT`.

That is useful code-license evidence, but the repository contains 156
image-like and 51 audio-like paths. This screen does not establish authorship,
source, notices, or grant scope for those 207 files, the game title, or the
deployed build. VibeGear2 therefore remains blocked.

### Clankers

At commit `9e2bae34a7357067f6cd2fd86c418fa5deaa7224`, the root
`LICENSE` is 1,473 bytes with SHA-256
`71fc08d912557571b115b1f09303ed1070072353ec2da143100d0373c957417b`.
It contains the standard MIT grant, followed by a repository-specific note
that the upstream game design document arrived without an explicit license
and is not retroactively covered.

The exact boundary between the licensed ghost-library material and the
excluded upstream document must be inventoried and approved. GitHub reports
`NOASSERTION`, consistent with the file not being a plain unmodified SPDX
template. Clankers remains blocked.

### Block Punch Kick

At commit `cf6b48c239de7cd046d2ccfff01391d763346352`, the 740-byte
root `package.json` has SHA-256
`674140772fcae4106c6bccd80473e3b66b90978fa3bcd7802db72ec653bea63b`
and declares `ISC`. No root license text was observed, and GitHub reports no
detected license.

A package metadata string identifies an intended license but does not supply
the actual grant and notice text needed for a distributable source/package
record. Block Punch Kick remains blocked pending a reviewed license file and
scope closure.

## Additional dependency boundary

GoDig's exact tree contains one Git submodule path, `dots`. The artifact does
not recurse into or identify that submodule's pinned repository, revision, or
rights. The submodule must be resolved and reviewed before GoDig can have a
complete source or package closure.

Every title also retains the following blockers:

- exact source/build/deployment binding;
- accountable owner authorization;
- content and asset rights;
- title and trademark review;
- attribution and notices;
- build and dependency license closure; and
- an exact reviewed local-package artifact for ARM64 and x86-64 if offline
  redistribution is proposed.

The 20 no-grant repositories additionally retain a code-license blocker.
Clankers retains a license-scope blocker, and Block Punch Kick retains both
license-text and code-license blockers.

## Method

The live generator:

1. resolves each repository's public `HEAD` with `git ls-remote`;
2. requests the recursive Git tree for that exact commit and fails if GitHub
   reports a truncated tree;
3. records all paths whose basename is `LICENSE`, `LICENCE`, `COPYING`, or
   `NOTICE`, including common extensions;
4. hashes and classifies root license text without treating its heuristic as a
   legal conclusion;
5. hashes and parses the root `package.json`, if present;
6. counts image, audio, font, model, and video extensions;
7. records Git submodule paths; and
8. emits a zero-approval fail-closed finding for every title.

No repository was cloned into the product, no game artifact was downloaded or
installed, and no launcher/catalog source was changed.

## Remaining work

I-095 cannot close until:

- the project owner names the authoritative rights holder and reviewer for
  each title;
- every repository has an explicit reviewed code-license or written private
  distribution authorization;
- asset, font, audio, model, data, design, title, and trademark provenance is
  mapped to exact files;
- third-party dependencies and submodules have versioned license/notice
  closure;
- the reviewed source is reproducibly bound to the hosted deployment or exact
  signed local artifact;
- required notices and corresponding-source obligations are generated and
  verified on both release architectures; and
- a qualified legal/release reviewer records the final per-title disposition.

Owner decisions are isolated in
[`OWNER_QUESTIONS_FIRST_PARTY_GAME_RIGHTS_2026-07-24.md`](OWNER_QUESTIONS_FIRST_PARTY_GAME_RIGHTS_2026-07-24.md).

## Reproduction and validation

The generator contacts GitHub and rewrites the dated observation:

```text
node scripts/generate-first-party-game-rights-screen.mjs
```

The validator and adversarial tests are deterministic and perform no network
access:

```text
node scripts/validate-first-party-game-rights-screen.mjs
node --test scripts/validate-first-party-game-rights-screen.test.mjs
```

The validator requires canonical bounded UTF-8 JSON, the exact 23-entry
catalog-to-repository map, safe public URLs and repository paths, 40-character
commit identities, closed license/package/asset/submodule records, internally
supported grant classifications, mandatory blockers, a record digest, derived
summary counts, zero approvals, zero production mutations, and exact claim
limitations. Eight adversarial test groups prevent inventory substitution,
approval/authorization promotion, digest/summary drift, unsupported grant or
scope promotion, unsafe paths/URLs, unknown fields, stale evidence identity,
and encoding/size violations.
