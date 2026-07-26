# OCR-A font structural evidence — 2026-07-24

## Result

The exact prepared `OCRA.ttf` is structurally inventoried, byte-pinned, and
covered by a strict local validator plus adversarial mutation tests. The file
is 24,316 bytes with SHA-256
`a0f58809705d54108fe41409bae70fbb8315a64e989aaf2afa04d5cfbb94f54e`,
matching the preparation script, asset provenance record, third-party notice,
and compliance inventory.

This closes the current static-source fallback gap in the mechanical
glyph-inventory portion of Q-077. It does not close dynamically supplied text
coverage, fallback selection, rendered legibility, accessibility,
localization, or release approval.

## Evidence

The machine-readable artifact is
`benchmarks/font-coverage/ocra-font-structural-evidence-v1.json`. Generate and
validate it directly:

```text
node scripts/generate-ocra-font-evidence.mjs
node scripts/validate-ocra-font-evidence.mjs
node --test scripts/validate-ocra-font-evidence.test.mjs
```

The dependency-free parser applies explicit byte, table, cmap, name-record,
source-file, and source-tree bounds. It rejects malformed ranges, duplicate
tables, unsupported sfnt versions, and cmap expansion beyond its declared
limit. The validator rebuilds the complete expected artifact from the exact
font and production source tree, then requires deep equality.

The 11 tests include exact-artifact acceptance and rejection of substitutions
to:

- artifact identity, evidence date, font digest, or parser limits;
- sfnt tables, names, metrics, cmap selection, ranges, or code points;
- coverage sets, source occurrences, source-tree hashes, or summary claims;
- provenance, claim boundary, limitations, or release dispositions; and
- raw font truncation, oversize input, duplicate tables, escaped table ranges,
  or an unsupported sfnt version.

## Structural findings

| Observation | Exact result |
|---|---:|
| sfnt tables | 13 |
| glyphs | 117 |
| selected Unicode cmap | Windows Unicode BMP, format 4 |
| mapped Unicode code points | 114 |
| printable ASCII code points | 95 of 95 covered |
| production source files scanned | 83 |
| distinct non-ASCII source code points | 1 |
| non-ASCII source code points covered by OCR-A | 1 |
| non-ASCII source code points requiring fallback | 0 |

The only non-ASCII character remaining in current production source is
`U+00B7 MIDDLE DOT` (`·`), which OCR-A maps directly. The following former
static-source dependencies were removed:

| Code point | Former character | Current treatment |
|---|---:|---|
| `U+00D7` | `×` | OCR-A-safe `X` marker |
| `U+2014` | `—` | OCR-A-safe hyphen and double-hyphen text |
| `U+2019` | `’` | OCR-A-safe apostrophe |
| `U+2026` | `…` | OCR-A-safe three-dot status |
| `U+25B3` | `△` | OCR-A-safe `^` marker |
| `U+25C6` | `◆` | existing portrait background, with no overlay glyph |
| `U+25C7` | `◇` | first-party CSS diamond geometry |
| `U+25CB` | `○` | first-party CSS ring geometry |
| `U+25CF` | `●` | OCR-A-safe `*` marker |
| `U+2713` | `✓` | first-party CSS check geometry |

The replacement geometry is decorative, remains adjacent to authoritative
visible text, and is hidden from assistive technology. Back, Continue/Open,
external-navigation, Retry, and Search marks already use the same policy.

The current CSS still uses
`OCRA, ui-monospace, SFMono-Regular, monospace`. User-authored profile names,
future localization, service text, or other dynamically supplied strings can
therefore invoke platform fallback. Zero missing characters in the checked-in
source inventory is not a deterministic cross-platform dynamic-text contract.

The font reports `fsType = 0`, fixed-pitch behavior, a 1,000-unit em, and
typographic metrics of 800/-200 with a 90-unit gap. Its horizontal-header
ascender and descender are both zero while OS/2 and Windows metrics are
non-zero. This audit records that unusual metric combination without claiming
it is harmless across target renderers.

The bounded Western-European diagnostic probe covers only 7 of 64 code points.
It is deliberately not a supported-locale test; it demonstrates why OCR-A
alone cannot establish localization coverage.

## Claim boundary

This evidence proves exact local font identity, selected sfnt metadata, Unicode
cmap membership, printable-ASCII coverage, and direct OCR-A coverage of every
non-ASCII code point in the exact current static production-source inventory.
It does not prove dynamically supplied text coverage, inspect glyph outlines
for correctness, test a physical television or seating distance, qualify
languages, approve accessibility, or supply a legal redistribution conclusion.

The decisions needed to proceed are isolated in
`docs/OWNER_QUESTIONS_OCRA_FONT_2026-07-24.md`.
