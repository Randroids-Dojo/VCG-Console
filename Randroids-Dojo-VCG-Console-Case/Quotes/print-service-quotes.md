# Print service comparison

Quotes checked live on **2026-08-26**. The selected X3D Studios order was paid and confirmed on **2026-08-30**; private shipping and payment details are intentionally omitted here.

Target configuration: one black PETG bottom, one black PETG branded lid, and one red PETG insert; 0.20 mm production layer height and 20% infill where the service exposes those controls.

| Service | Result | Parts | Shipping | Tax | Total | Turnaround |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| X3D Studios (Austin, TX) | **Purchased 2026-08-30.** Exact black/red PETG and 0.20 mm/20% controls were available. Checkout applied a 10% first-order discount. | $9.00 | $5.00 standard US shipping | No separate tax line shown | **$12.60 paid** | Site says orders ship in 1–2 business days and USPS Priority usually adds 2–3 days; actual shipment/delivery dates are not yet confirmed |
| Print a Thing | The current live builder accepts the lid and a 0.02 mm-error-bounded bottom quote mesh, and exposes 0.20 mm/20% controls, but its material list offers PLA and ABS only. | No valid PETG quote | — | — | **Unavailable for required PETG configuration** | Not applicable |
| 3D Printer on Demand | Complete three-part PETG instant quote. Bottom and lid passed all seven automated checks. The service does not expose layer-height/infill controls. | $33.90 | $8.50 domestic | Requires shipping address | **$42.40 pre-tax** | Standard 3–5 business days; carrier delivery date requires address |
| Breaker Printing | Standard 0.20 mm and adjustable infill are available, but the live PETG stock list contained only yellow, so it could not quote the black enclosure. | No valid black-PETG quote | — | — | **Unavailable for required color configuration** | Normally ships in 2–4 business days |

## Recommendation

**X3D Studios** was selected and purchased. It is local to Austin, supports the exact black PETG plus red PETG treatment, exposes the requested 0.20 mm and 20% settings, produced the lowest delivered price, and advertises the fastest turnaround. The verified Stripe checkout was $9.00 for the three parts plus $5.00 standard US shipping, less a $1.40 first-order discount, for **$12.60 total paid**.

3D Printer on Demand is the best fully anonymous fallback at $42.40 pre-tax. Its quote page allowed a white insert, but its Stripe checkout incorrectly reset every line item to black, so that checkout was canceled rather than leaving a wrong-color order staged.

The purchase-success page was verified, but it displayed no merchant order/reference number. X3D said a confirmation email would follow and that it would send a shipping notification later. No calendar delivery date is confirmed yet.

## Quote-only bottom mesh

`Quotes/Service-Uploads/VCG-Console-Case-Bottom-Quote-Optimized.stl` exists only because two web estimators timed out or routed the original 98,444-facet bottom to manual review. It was reduced to 29,532 facets with a maximum geometric error of 0.02 mm, remains a closed solid, and keeps the 62.5 x 95 x 28.3 mm envelope. The manufacturing master in `Manufacturing/` is unchanged and remains the file to print.
