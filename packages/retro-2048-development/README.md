# Retro 2048 Windows development package inputs

This directory contains only VCG-owned configuration and notices. It does not
bundle RetroArch, a libretro core, or any signing key.

`vcg-development-package` admits a local package only from the exact official
RetroArch 1.22.2 Windows x86_64 archives recorded in the development evidence.
The tool copies the portable runtime's direct files, adds the matching stable
`2048_libretro.dll`, hashes every executable/DLL/auxiliary file, creates a
deterministic uncompressed TAR, and signs the catalog and release descriptor
with distinct machine-local development-role keys.

The installed catalog entry is `qualification: development` and its bound game
manifest remains `compatibilityStatus: unverified`. The host accepts that state
only under the exact `development` update channel. Production/stable authority
continues to require `qualification: qualified` and a qualified manifest.

This is not a redistributable release. See `THIRD_PARTY_NOTICES.txt` and the
repository's Retro 2048 SBOM/legal records for the unresolved embedded-font and
release-obligation boundaries.

The current Windows x86_64 evidence qualifies signed/hash-bound installation,
process start, and a responsive RetroArch window at `MAIN MENU > Start Core`.
It does not qualify one-action 2048 gameplay: no game board was observed after
launch, synthetic keyboard input did not advance the menu, and no physical
controller or controlled save round trip was verified. The development package
must therefore remain visibly labeled unverified.

Build/install on the audited Windows x86_64 development machine with:

```powershell
cargo run -p vcg-host --bin vcg-development-package -- `
  --development-root "$env:LOCALAPPDATA\VCG Console\dev-retro-2048" `
  --frontend-archive "<absolute-path-to-RetroArch-1.22.2-Win64.7z>" `
  --cores-archive "<absolute-path-to-RetroArch-1.22.2-cores-Win64.7z>" `
  --base-config "<repo>\packages\retro-2048-development\vcg-base-windows.cfg" `
  --notices "<repo>\packages\retro-2048-development\THIRD_PARTY_NOTICES.txt"
```

The tool refuses a different archive, frontend, or core hash. Reusing an active
store re-verifies every signed catalog artifact instead of rebuilding it.
