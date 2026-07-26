# Retro 2048 Windows development package evidence — 2026-07-25

Status: installed machine-local development generation; one-action gameplay is
not qualified.

## Exact inputs and trust result

The existing official RetroArch 1.22.2 Windows x86_64 archives were reused; no
second download was needed.

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `RetroArch-1.22.2-Win64.7z` | 202,509,078 | `b2139b1d0f9d4526dc6b5ce23cbb3efdc766096fa6f2c3df016818b486ac6372` |
| `RetroArch-1.22.2-cores-Win64.7z` | 229,761,684 | `86b871e11b9b4772ac644b40a38f2c8e9449da1f355eae7da08aa061148547b0` |
| `retroarch.exe` (1.22.2, Git `69a4f0e`) | — | `81c11b6f24932bf7918f05eee8928035bff3887335fd2a081507c75e9d94d06a` |
| `2048_libretro.dll` | — | `60227525eb9b222497dde0c6b8707876f6458e65675b9f24d91e333372bdc151` |

`vcg-development-package` generated distinct machine-local Ed25519 root,
catalog, and release roles, created a deterministic uncompressed TAR, verified
the signed release descriptor and installed catalog, health-gated the candidate,
and promoted generation `00000000000000000001`. Private development keys stay
under the local development trust root and are never added to the repository.

The active result is deliberately `qualification: development`,
`compatibilityStatus: unverified`, channel `development`, target
`x86_64-windows`. Stable/production catalog admission remains qualified-only.

| Installed object | Evidence |
| --- | --- |
| TAR | 159,964,672 bytes; SHA-256 `6098192f59146bbbbe3f0c0f47022b06461fefe988af881fb365f542886903f8` |
| Expanded generation | 74 files; 159,911,048 bytes |
| Catalog | SHA-256 `e9e3009ecac0833d09da8866e6fe317ec4b62a493fa2b5035aac568df473cfd8` |
| Manifest | SHA-256 `483dc39685a2e50b4bfe3639cd5932e093cb18b74ddd8653520be6880220a2db` |
| Release descriptor | SHA-256 `4e4eb269f7623955e6baf6758c20047be5aaa680e8eeb236f8ac3a517dd91ed2` |
| Release signatures | SHA-256 `8a890d5be2e17e563eeec93da2951be6b50394cd8b384107866a24b74b9f05ed` |

Machine-local evidence is at
`%LOCALAPPDATA%\VCG Console\dev-retro-2048\evidence\retro-2048-development-install.json`.

## Claim ledger

| Claim | Result | Exact boundary |
| --- | --- | --- |
| Package/install | Verified | Signed descriptor/catalog, exact hashes, health gate, and active generation 1 were verified. `launcher --dry-run` loaded exactly one profile from that generation. |
| Launch | Verified at process boundary | One authenticated launcher intent reached `running / PROCESS_STARTED`, sequence 2, and the observed process used the active generation's frontend and core. |
| Window/readiness | Verified only to responsive menu | A responsive top-level RetroArch window was visible. Captured pixels showed `MAIN MENU > Start Core`; they did not show a 2048 board. Process health and a responsive menu are not gameplay readiness. |
| One-action playability | **Not qualified** | Contentless startup stopped at `Start Core`. Synthetic keyboard and private input attempts did not produce observed gameplay. A content sentinel made the stock no-content core exit and was rejected. |
| Input | Not qualified | Synthetic keyboard attempts did not change captured pixels. No physical controller was identified or tested. |
| Saves | Not qualified | A pre-existing `2048.srm` was observed, but no controlled before/input/after save or state round trip was produced. |
| Failure/recovery | Partially verified | Intake rejected the first TAR because an upstream runtime filename was unsafe. A development-only signed `runtimeName` alias stored the file safely, re-materialized the required loader name per session, and re-hashed source and destination. Qualified packages cannot use this alias. The failed intake is preserved under `failed-build-unsafe-upstream-name`; the rejected content-sentinel experiment is preserved as `evidence/failed-content-sentinel.2048`. Installed-package tamper recovery, restart cleanup, and automated bad-release rollback were not exercised. |

The Windows process reported D3D11, video, audio, and input initialization. It
also reported microphone initialization, so the current sandbox description is
not evidence of enforced device denial.

## Evidence boundary

This is the safest locally launchable *candidate runtime*, not a demonstrated
one-action playable game and not a production release. Legal/redistribution
approval, complete source/notices delivery, the embedded Apple IIgs font's
provenance, production signing custody, compositor/controller qualification,
ordinary x86_64 Linux, ARM64, and broad Windows compatibility all remain open.

## Verification gates

- `cargo test -p vcg-host --lib`: 380 passed, 5 ignored.
- Focused installed-catalog tests: 18 passed.
- Focused RetroArch tests: 15 passed.
- `cargo check -p vcg-host --all-targets`: passed.
- Re-running `vcg-development-package` against the local trust/store reverified
  active generation 1 and printed the exact development launcher arguments.
- `cargo clippy` could not start because Windows Application Control blocked
  `cargo-clippy`; this is not recorded as a lint pass.
- `pnpm validate:manifests` validated all four catalog manifests but failed the
  repository-wide gate because `schemas/game-manifest.schema.json` and
  `apps/console-lab/src/launcher/catalog.generated.ts` were already stale.
