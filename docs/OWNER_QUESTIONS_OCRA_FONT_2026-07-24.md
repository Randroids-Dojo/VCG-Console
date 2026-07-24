# Owner questions: OCR-A fallback and qualification — 2026-07-24

No answer is required to retain the structural evidence. These decisions are
required before Q-077 can be closed or OCR-A can be described as a qualified
release font.

## OF-001: Deterministic fallback

Which freely redistributable fallback family should be bundled for characters
and languages that OCR-A does not cover, and must it remain visually
monospaced?

Safe default: bundle and hash a rights-reviewed fallback with broad Unicode
coverage, put it immediately after OCR-A in the CSS stack, and prohibit target
qualification from depending on an OS-installed font.

## OF-002: Icons as text or assets

Should the remaining status marks, profile diamonds, and controller symbols
remain font characters, and should the prototype’s shared CSS navigation
geometry become the release icon asset?

Safe default: use accessible text labels for meaning and a small first-party
SVG/icon set for decoration. Do not depend on a fallback font for the identity
or geometry of navigation-critical icons.

Current prototype status: Search, Back, Continue/Open, Retry, and external
navigation no longer depend on font glyphs. Their shared CSS geometry is
decorative, `aria-hidden`, and adjacent to visible authoritative text.

## OF-003: Supported language scope

Which languages and user-entered character sets are required for the first
release?

Safe default: do not infer support from partial Latin coverage. Define the
release locale and user-input matrix, then require every string and input code
point to resolve through the pinned font stack without tofu, clipping, or
silent transliteration.

## OF-004: Legacy font metrics

Should the target renderer matrix accept the original font’s zero horizontal
header ascender/descender, or should a reproducible derived font repair those
metrics?

Safe default: preserve the upstream artifact until browser, native text, and
target-compositor tests show a defect. If repair is necessary, generate a new
named derivative from recorded source inputs, preserve upstream provenance,
pin its bytes, and repeat license and rendering review.

## OF-005: TV legibility protocol

Who owns the physical-TV review for OCR-A sizes, weights, spacing, and visually
similar characters such as `0/O`, `1/I/l`, `5/S`, and `8/B`?

Safe default: require representative setup, launcher, recovery, and gameplay
copy at 720p, 1080p, and 4K on the target output path, with the intended seating
distance, standard and enlarged text scales, low-vision review, and recorded
failure criteria. Browser CSS measurements alone do not close this question.

## OF-006: Release approval

Who supplies the final redistribution approval for the exact upstream
Public-Domain-labelled font and any selected fallback or derived font?

Safe default: keep the exact digest, source/release links, upstream modification
inputs, and curated notice; require the named release reviewer to approve the
actual packaged font set without treating `fsType = 0` as a substitute for
license review.
