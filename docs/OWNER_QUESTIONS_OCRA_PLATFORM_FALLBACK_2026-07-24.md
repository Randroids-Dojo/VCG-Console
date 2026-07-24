# Owner questions: observed OCR-A platform fallback — 2026-07-24

These questions are isolated from the reproducible observation. No answer is
required to retain the evidence, but the current Windows result must not be
promoted into a release font policy without them.

## PFO-001: Mixed platform appearance

Is it acceptable for current launcher symbols to come from three visually
different platform fonts on Windows?

Safe default: no. Treat the current result as a defect-discovery observation,
not approval. Require one pinned, rights-reviewed fallback or first-party icon
set before visual qualification.

## PFO-002: Navigation-critical symbols

Should Back, Continue/Open, Retry, external-navigation, and Search marks be
font glyphs at all?

Safe default: keep adjacent accessible text as the authority, mark decorative
glyphs hidden from assistive technology, and replace navigation-critical
decoration with a small first-party SVG set whose geometry is tested at every
required scale.

## PFO-003: Target-image dependency

May a release depend on fonts supplied by the target operating-system image?

Safe default: only for a documented system-UI fallback outside the product
identity, with exact target-image inventory and presence tests. Do not claim
cross-platform consistency or bundle Windows font files.

## PFO-004: First comparison candidates

Which freely redistributable fallback families should enter the first
rendering comparison?

Safe default: nominate two or three exact, versioned, rights-reviewed files
with broad required-locale and symbol coverage. Compare their bytes, cmap,
metrics, rendered symbols, text rhythm beside OCR-A, package cost, and target
availability before selecting one.

## PFO-005: Search symbol remediation

Should the prototype keep the first-party CSS Search mark that replaced
`U+2315 TELEPHONE RECORDER`, or should it move to the eventual shared icon
asset set?

Safe default: keep the mark decorative and hidden from assistive technology
beside the existing visible “Search everything” label. Preserve the current
removal of the semantically unrelated font character, then migrate the CSS
shape only when the versioned first-party icon set exists.

## Handoff

If a fallback or icon policy is selected, record it as a new decision and bind
the exact files, licenses, metrics, and source inputs. Then rerun structural
coverage, Windows Chrome, both target Linux images, native/browser renderers,
and physical-TV accessibility tests rather than editing this observation.
