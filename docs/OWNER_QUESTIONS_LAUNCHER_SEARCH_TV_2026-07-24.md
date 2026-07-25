# Owner questions: launcher Search on television

Date opened: 2026-07-24

These questions do not block the three fixed desk-only Search states or the
single local-shell activation check. Q-242 and Q-243 remain authoritative for
final physical-TV and output policy.

## STV-001: empty-query density

Should opening Search show every destination immediately, show curated recent
or featured destinations, or require a query before results appear?

Recommended provisional answer: show a short curated set that fits without
scrolling, then switch to ranked query results. Do not render the whole
catalog as an unbounded television list.

## STV-002: query normalization and localization

Which case folding, diacritic handling, transliteration, tokenization, typo
tolerance, and localized aliases are required?

Recommended provisional answer: retain deterministic Unicode-aware
case-insensitive substring matching for the prototype, then select a bounded
offline index only after the supported-language and catalog policies exist.
Never send household queries to a network service by default.

## STV-003: no-result recovery

Should the no-result state offer clear-query, category shortcuts, spelling
suggestions, or only explanatory copy?

Recommended provisional answer: add one explicit Clear search action plus
stable category shortcuts after controller navigation is available. Avoid
unreviewed fuzzy suggestions that could expose hidden or disallowed catalog
entries.

## STV-004: activation evidence

Which result classes must be activated in the next Search qualification?

Recommended order: a local shell view, offline package, remote-web title,
unavailable package, destructive settings route, and external-origin
disclosure. Each must restore focus safely after Back, failure, and denial.

## Handoff

Record selected behavior as later product decisions. Until then, retain the
three exact states, one local-shell activation boundary, bounded claims,
offline processing, and opener restoration documented in
[`LAUNCHER_SEARCH_TV_EVIDENCE_2026-07-24.md`](LAUNCHER_SEARCH_TV_EVIDENCE_2026-07-24.md).
