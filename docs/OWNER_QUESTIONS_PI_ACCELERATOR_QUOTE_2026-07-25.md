# Owner questions: Raspberry Pi accelerator quote comparison

These questions are non-blocking for continued no-purchase research. They
block an orderable delivered quote or accelerator-selection change.

## Existing gates carried forward

- Q-184: provide the non-sensitive state/ZIP, tax status, and approved
  checkout/quotation evidence path.
- Q-185: resolve the 26 TOPS `SC1791 (SC1468)` identity before order.
- Q-186: select and qualify the exact shared UVC camera and mount.
- Q-259: freeze all performance, quality, thermal, power, and minimum delivered
  savings gates before using quote results to reconsider the 26 TOPS baseline.

Conservative default: leave shipping, tax, delivered totals, purchase
authority, and selection null; retain D-041's 26 TOPS baseline; do not order.

## Q-266: accepted HAT manufacturer identifier aliases

Which manufacturer identifiers may an approved reseller use for each exact
accelerator package, and which label must appear on the quote, packaging, and
received board?

The 2026-07-25 PiShop pages expose these unresolved sets:

- 13 TOPS, seller SKU `1129-1`: title `SC1676`; description `SC1785 SC1430`;
- 26 TOPS, seller SKU `1243-1`: `SC1791 (SC1468)`; and
- 40 TOPS AI HAT+ 2, seller SKU `1435-1`: `SC2166`.

Current conservative default: none of these strings is treated as an
interchangeable alias without authoritative Raspberry Pi or reseller
confirmation. Require the seller to state the exact manufacturer identity to
be shipped, prohibit substitutions, compare quote/package/board labels at
receipt, and return any mismatch before qualification.

Needed decision/evidence: authoritative alias mapping; permitted region,
packaging, and board revisions; quote wording; substitution policy; receipt
photos/fields allowed in tracked evidence; and return procedure for mismatch.

## Recorded result that does not need an owner decision

At the observed $200 item-page price, the 40 TOPS build is $656.28 before
shipping and tax, so it cannot satisfy D-111's $650 delivered ceiling. It
remains a transparent comparison row, not a purchase candidate. The official
product page also says its computer-vision performance is comparable to the
26 TOPS AI HAT+, so its 40 TOPS INT4 figure cannot be used as a VCG pose-speed
claim.
