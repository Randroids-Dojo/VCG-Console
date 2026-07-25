# Owner questions: observed OCR-A platform fallback — 2026-07-24

These questions are isolated from the reproducible observation. No answer is
required to retain the evidence, but the current Windows result must not be
promoted into a release font policy without them.

## PFO-001: Dynamic platform fallback

May user-authored profile names, future localization, or other dynamic strings
fall through to OS-installed fonts when OCR-A lacks a character?

Safe default: no for release qualification. The current static source has zero
observed platform fallbacks, but a pinned, rights-reviewed dynamic-text fallback
or an explicitly narrower input/locale contract is still required.

## PFO-002: Navigation-critical symbols

Should Back, Continue/Open, Retry, external-navigation, and Search marks be
font glyphs at all?

Safe default: keep adjacent accessible text as the authority, mark decorative
glyphs hidden from assistive technology, and replace navigation-critical
decoration with a small first-party SVG set whose geometry is tested at every
required scale.

Current prototype status: all current static navigation, status, profile,
controller, empty-state, and pass-check decoration either uses shared
first-party CSS geometry or OCR-A-safe text. Visible adjacent text remains the
authority and decoration is `aria-hidden`. The remaining decision is whether
that primitive is the release asset or an interim implementation before a
versioned icon set.

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

Current prototype status: the Search mark remains within the shared CSS icon
boundary and has browser coverage for empty text and `aria-hidden`.

## Handoff

If a fallback or icon policy is selected, record it as a new decision and bind
the exact files, licenses, metrics, and source inputs. Then rerun structural
coverage, Windows Chrome, both target Linux images, native/browser renderers,
and physical-TV accessibility tests rather than editing this observation.
