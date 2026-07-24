# Third-party notices

This file records notices for third-party material that VCG Console prepares for
its runtime. It is not yet the complete software bill of materials or notices
bundle required by I-137.

## OCR-A font 1.0

The console's prepared runtime uses `OCRA.ttf` from the OCR-A font project,
release 1.0.

| Field | Recorded value |
|---|---|
| Upstream project | <https://sourceforge.net/projects/ocr-a-font/> |
| Exact release files | <https://sourceforge.net/projects/ocr-a-font/files/OCR-A/1.0/> |
| Prepared file | `apps/console-lab/public/fonts/OCRA.ttf` |
| Byte length | `24,316` |
| SHA-256 | `a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e` |
| Upstream license label | `Public Domain` |
| Retrieval date | 2026-07-19 |

SourceForge describes the project as a free OCR-A font with sources and labels
the project Public Domain. The upstream 1.0 release supplies the TrueType file
alongside the modification inputs `ocr.mf`, `ocr10.mf`, and `OCRA.sdf`, plus
PostScript and bitmap artifacts. Its `ReadMe.txt` credits John Sauter, Tor
Lillqvist, and Richard B. Wales and explains the FontForge/potrace conversion.

The repository does not redistribute the ANSI X3.17-1977 specification. The
upstream readme says that document is copyrighted by ANSI and is not part of
the font project.

`pnpm prepare:assets` downloads only the exact TrueType artifact, rejects any
byte-length or digest drift, and records the same evidence in
`apps/console-lab/public/ASSET_PROVENANCE.json`. The generated font directory is
excluded from source control under D-122; clean builds reproduce it from this
pinned record.

This notice records upstream provenance and the upstream license label. It is
not legal advice and does not close the separate glyph-coverage, TV-legibility,
accessibility, or complete release-compliance work.
