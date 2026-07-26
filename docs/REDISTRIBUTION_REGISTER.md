# Game and bundled-asset redistribution register

Status: fail-closed current inventory; no offline game package is approved

Date: 2026-07-24

This register advances I-138. It covers every checked-in catalog game and
every asset prepared into the current console-lab runtime. `NOASSERTION`,
unreviewed rights, a package-manager license string, an upstream category, or
the ability to download a file never becomes redistribution authority.

The current release remains blocked. This is an engineering inventory, not
legal advice.

## Status vocabulary

- **Remote-only**: VCG may launch the named service under its network policy;
  no code/content copy is admitted to an offline console package.
- **Candidate**: positive provenance or license evidence exists, but one or
  more blocking gates remain.
- **Blocked**: VCG has no current authority to include the item in a public
  image/package.
- **Approved**: exact artifact, code/content/title rights, obligations,
  ownership, and release evidence are complete. The current approved count is
  zero.

## Catalog games

| Manifest | Distribution now | Recorded evidence | Blocking evidence | Offline package |
|---|---|---|---|---|
| `determined.vcg-game.json` | Remote-only | Exact HTTPS origin and hosted revision label; publisher recorded as Randroid's Dojo | Code and content are `NOASSERTION`; rights review is `unreviewed`; hosted Groq/KV/leaderboard behavior needs deliberate local replacements; no artifact, owner authorization, title/content, dependency, notice, or removal evidence | Blocked |
| `mi-casa-es-su-casa.vcg-game.json` | Remote-only | Exact HTTPS origin and hosted revision label; publisher recorded as Randroid's Dojo | Code and content are `NOASSERTION`; rights review is `unreviewed`; hosted routes are part of the experience; no artifact, owner authorization, title/content, dependency, notice, or removal evidence | Blocked |
| `vibebots.vcg-game.json` | Remote-only | Exact HTTPS origin and hosted revision label; publisher recorded as Randroid's Dojo | Code and content are `NOASSERTION`; rights review is `unreviewed`; hosted server/account/persistence behavior remains; no artifact, owner authorization, title/content, dependency, notice, or removal evidence | Blocked |
| `retro-2048.vcg-game.json` | Redistributable candidate metadata only | Pinned source-candidate SBOM; contentless core; separate RetroArch/core identities; public-domain core claim; GPL frontend claim | No frontend/core binary is bundled; exact versions/hashes and signed packages absent; embedded Apple IIgs font remains `NOASSERTION`; legal/title, source/notice, ARM64, controller, target, update, and removal gates remain | Blocked |

The three remote games are launcher links, not release artifacts. Their
catalog titles, publisher strings, logos/screenshots if ever added, and
service affiliation still require owner/title review before a public product
claims endorsement or local redistribution.

The retro candidate's manifest value
`distribution: "redistributable"` describes the intended rights shape, not an
approval. Its `reviewStatus` is `unreviewed`, compatibility is `unverified`,
and the installed host requires hashes that the candidate does not contain.

## Built-in first-party experiences

The console-lab shell contains the obstacle-game prototype, synthetic fixtures,
Motion simulator/replay paths, profile/calibration rehearsals, and other
developer/test experiences. They are not separately admitted catalog games or
offline packages.

All repository-authored TypeScript, Svelte, Rust, scripts, schemas,
documentation, benchmark policy, and those built-in experience assets remain
blocked for public redistribution because the repository has no selected
first-party license. The current compliance inventory reports ten
first-party/project-license blockers. Copyright ownership, contributor
authority, chosen license, notices, and any source/binary distribution terms
must be resolved together rather than assigning licenses file by file without
owner authority.

## Prepared runtime assets

| Asset | Exact identity | Evidence | Status and blocker |
|---|---|---|---|
| OCR-A 1.0 `OCRA.ttf` | 24,316 bytes; SHA-256 `a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e` | Pinned SourceForge project/release links, upstream `Public Domain` label, authors/conversion provenance, deterministic downloader, and curated notice | Candidate. Strongest current asset evidence, but final release review, exact notice/source bundle, glyph/accessibility qualification, and project-license closure remain |
| MediaPipe Pose Landmarker Lite float16 model | 5,777,746 bytes; SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | Exact Google storage URL and deterministic byte/hash verification | Blocked. No model-specific redistribution/license evidence; the npm package's Apache-2.0 metadata does not automatically cover the separate `.task` file |
| MediaPipe Tasks Vision JavaScript/WASM runtime | Generated copy from pinned `@mediapipe/tasks-vision@0.10.35` | npm component reports Apache-2.0 and is present in the CycloneDX inventory | Candidate, not approved. Release needs the exact copied-file inventory/hashes, upstream LICENSE/NOTICE inclusion, target build verification, and review of whether generated/copied binary obligations are fully met |
| Launcher presentation, icons, CSS, synthetic geometry, and screenshots | Repository-authored source/build output | Source is present; benchmark screenshots are evidence outputs rather than third-party game art | Blocked with the unresolved first-party project license; any future third-party logo, cover, portrait, screenshot, sound, or music must receive its own entry |

Generated runtime assets are excluded from source control and recreated by
`pnpm prepare:assets`. Exclusion from Git does not exclude them from a release
image or its obligations.

## Explicitly absent from the current release bundle

The repository does not currently bundle:

- RetroArch, a libretro core binary, ROM, BIOS, firmware, key, or commercial
  game artwork;
- any of the six screened starter-catalog candidate source archives or
  binaries;
- an offline copy of Determined, Mi Casa Es Su Casa, or VibeBots;
- a third-party shader preset;
- a browser/system image, Linux distribution, GPU/AI runtime, or enclosure
  artifact selected for release; or
- a rights-cleared public starter title.

Those absences must remain true until the exact artifact enters the SBOM and
this register with approved evidence.

## Admission rule

An offline game or bundled asset is admitted only when one reviewed record
binds:

1. exact artifact version, byte length, and SHA-256;
2. source revision and reproducible build or trusted upstream release;
3. separate code, content/asset, font/model, and title/trademark rights;
4. owner/contributor authority and review owner;
5. redistribution, modification, commercial-use, attribution, NOTICE,
   corresponding-source, and patent obligations;
6. complete dependency and auxiliary-asset closure;
7. target architectures and signed package identity;
8. content/age/accessibility notes where applicable;
9. update/security/license-change ownership; and
10. uninstall/removal and retained-data behavior.

Any `NOASSERTION`, unreviewed scope, missing artifact, missing owner, or
unresolved obligation yields **Blocked**, not a partial approval.

## Enforcement currently present

- Manifests distinguish `remote-only`, `owner-authorized-local`, and
  `redistributable` and record code/content licenses plus review status.
- Remote catalog entries point only to their allowed HTTPS origins.
- The installed native catalog requires signed target-specific exact artifact
  hashes; public metadata cannot promote the retro candidate into launch
  authority.
- The compliance evidence gate rejects new third-party components without
  reported license metadata.
- The release-compliance gate intentionally fails for the known first-party
  and pose-model blockers.
- The retro-core SBOM and starter-candidate screen preserve their specific
  font, asset, trademark, artifact, architecture, and ownership blockers.

The public manifest schema does not yet require audited rights before a local
entry can be called `qualified`. That cross-field rule should be added after
the concurrent launcher evidence tranche lands because manifest source is
part of its production-source commitment.

## Remaining closure

I-138 remains active. Required work includes:

- owner selection of the repository license and contributor/asset authority;
- model-specific MediaPipe `.task` redistribution evidence;
- exact copied MediaPipe JS/WASM inventory plus license/NOTICE closure;
- owner/title/code/content confirmation for every hosted game and a decision
  whether any receives a local edition;
- removal of 2048's embedded-font ambiguity or documented rights evidence;
- final OCR-A release review and notice/source packaging;
- exact target browser/OS/native/GPU/AI/emulator/core/runtime inventories;
- schema enforcement that local `qualified` entries are audited and contain
  no `NOASSERTION`;
- independent ARM64/x86-64 release SBOMs and complete license/NOTICE/source
  bundle; and
- qualified legal/release review with the release gate green and no override.
