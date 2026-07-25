# Owner questions: launcher Search on television

Date opened: 2026-07-24

These questions do not block the four fixed desk-only Search states or the
local-shell and built-in offline local-web activation checks. Q-242 and Q-243
remain authoritative for final physical-TV and output policy.

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

Current desk evidence covers the first two classes at all three target
resolutions. Profiles returns through Back to the focused Home navigation
action. Obstacle opens the `LOCAL WEB` launch surface and Back returns focus to
the exact Search opener. Remote web, unavailable content, destructive
settings, external-origin disclosure, failure, denial, physical controllers,
and physical televisions remain unqualified.

## Handoff

Record selected behavior as later product decisions. Until then, retain the
four exact states, two local activation classes, bounded claims, offline
processing, and focus recovery documented in
[`LAUNCHER_SEARCH_TV_EVIDENCE_2026-07-24.md`](LAUNCHER_SEARCH_TV_EVIDENCE_2026-07-24.md).
