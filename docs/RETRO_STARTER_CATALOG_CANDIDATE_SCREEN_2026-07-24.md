# Retro starter catalog candidate screen

Status: six candidates screened; zero approved for production catalog

Date: 2026-07-24

The deterministic evidence is
[`candidate-screen-v1.json`](../compliance/retro-starter-candidates/candidate-screen-v1.json).
It records source metadata and blockers only. It does not download, install,
package, or admit a title.

## Admission floor

D-115 requires per-title evidence rather than labels such as “homebrew,”
“public domain,” “open source,” or “free download.” A starter title needs:

- exact source revision and distributable artifact hash;
- separate code, content/asset, and title/trademark rights;
- attribution and corresponding-source obligations;
- exact core, firmware, and other runtime dependencies;
- content and age notes;
- controller behavior with console-owned Home/Back;
- reproducible ARM64 and x86-64 packages;
- update ownership; and
- removal and save-data behavior.

No candidate below satisfies that complete floor.

## Screened candidates

| Candidate | Captured source | Positive evidence | Blocking evidence | Disposition |
|---|---|---|---|---|
| Dinothawr | [`e608bc5`](https://github.com/libretro/Dinothawr/commit/e608bc507d4e76940be4af3d74b5fecb2dfa26a6) | The pinned [license](https://github.com/libretro/Dinothawr/blob/e608bc507d4e76940be4af3d74b5fecb2dfa26a6/LICENSE) separately addresses code and game data; the [Libretro documentation](https://docs.libretro.com/library/dinothawr/) records gamepad support and the separate data shape. | Code redistribution cannot be sold or used commercially; art/music/levels are CC BY-NC-SA 3.0. Those restrictions need an explicit public-DIY policy/legal decision. No artifact hash, dependency closure, title review, target package, or lifecycle evidence exists. | Blocked |
| libretro 2048 | [`c90437d`](https://github.com/libretro/libretro-2048/commit/c90437d3c3913999624deca3fb55ecfa632b72c4) | Existing source closure, contentless behavior, public-domain dedication candidate, controls, and no-BIOS evidence are unusually mature. [Libretro documentation](https://docs.libretro.com/library/2048/) records contentless Start Core behavior. | The compiled [`font2.c`](https://github.com/libretro/libretro-2048/blob/c90437d3c3913999624deca3fb55ecfa632b72c4/noncairo/font2.c) Apple IIgs bitmap remains `NOASSERTION`; legal/title review, signed target binaries, ARM64, controller/reserved-action evidence, and update/removal remain open. | Blocked |
| libretro samples | [`bce193b`](https://github.com/libretro/libretro-samples/commit/bce193bc1b8c9a3da43b2ead0158a69e28b37ed8) | The pinned [MIT license](https://github.com/libretro/libretro-samples/blob/bce193bc1b8c9a3da43b2ead0158a69e28b37ed8/license) expressly permits redistribution of the sample software. | These are API/input/audio/video samples, not a user-facing starter title. Individual build closure, artifacts, target tests, and ownership still need work before even an internal fixture is qualified. | Blocked for catalog; possible developer fixture |
| Lutro Game of Life | [`044d167`](https://github.com/libretro/lutro-game-of-life/commit/044d1678eac0163e25623f3f9e78301fe275cf87) | Small reviewable Lua demo. | The pinned tree has no license file, no release, no selected artifact, and no separate content-rights record. The Lutro core/runtime and every product gate remain unaudited. | Blocked |
| Lutro Snake | [`d176820`](https://github.com/libretro/lutro-snake/commit/d1768203e0a2fe2c765135a303a27592c94b03d9) | Libretro’s [Lutro guide](https://lutro.libretro.com/doc/gettingstarted.html) identifies it as the getting-started sample. The tree is very small. | The pinned tree has no license file or release. A tutorial/download statement is not redistribution permission. Lutro dependencies, content/title rights, packages, targets, input, and lifecycle remain unaudited. | Blocked |
| Mr.Boom | [`96f8955`](https://github.com/Javanaise/mrboom-libretro/commit/96f89550a3518dffe2e7561c971119a39d90de97) | The pinned repository [license](https://github.com/Javanaise/mrboom-libretro/blob/96f89550a3518dffe2e7561c971119a39d90de97/LICENSE) is MIT. [Libretro documentation](https://docs.libretro.com/library/mr_boom/) records contentless startup, 60 FPS/48 kHz output, controllers, and save-state support. | The repository license alone does not prove authorship/scope for every embedded game asset. The project describes itself as a Bomberman clone, so title, visual, sound, and trademark review is required. Exact release/hash, submodule/data closure, content notes, targets, controller ownership, update, and removal remain open. | Blocked |

## Result

The production admitted count remains zero. In particular:

- the 2048 catalog entry must remain an unverified candidate;
- no Lutro demo may be copied merely because Libretro offers it as a sample;
- Dinothawr’s clear noncommercial terms are evidence, not automatic
  compatibility with an open-source DIY release;
- Mr.Boom’s MIT file is a reason for deeper asset review, not a blanket rights
  conclusion; and
- libretro samples may be useful for internal host/controller qualification
  but cannot satisfy the promised starter-game experience.

All six repository heads were captured with `git ls-remote`; 2048 also matched
the revision already pinned by its source-candidate SBOM. This screen
downloaded no source archive or binary and computed no distributable artifact
hash.

## Verification

The offline validator reconstructs the exact six-candidate artifact and
requires zero admissions, zero package/catalog mutation, every blocker,
revision, evidence URL, limitation, and summary count. Eight test groups
reject:

- admission or production mutation;
- source/revision/evidence substitution;
- weakened code, content, or trademark findings;
- hidden artifact, dependency, or architecture gaps;
- required-gate or candidate-blocker removal;
- summary, date, limitation, or unknown-field drift; and
- noncanonical, oversized, or invalid UTF-8 JSON.

This advances I-131 from an unscreened category request to an explicit blocked
candidate queue. It does not yet deliver the starter catalog.
