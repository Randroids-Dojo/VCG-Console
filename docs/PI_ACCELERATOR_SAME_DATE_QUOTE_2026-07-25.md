# Raspberry Pi accelerator same-date quote — 2026-07-25

Observation: 2026-07-25 20:06 PDT (`UTC-07:00`)

Investigation: I-163

Authority: D-021, D-041, D-043, D-111, Q-083, Q-084, Q-184,
Q-185, Q-186, and Q-259

Machine-checkable record:
[`pi5-ai-hat-same-date-quote-v1.json`](../benchmarks/hardware-quotes/pi5-ai-hat-same-date-quote-v1.json)

## Result

The three complete Raspberry Pi 5 8GB merchandise comparisons were refreshed
from their direct item pages on the same date. Every non-HAT line is held
identical at **$456.28**:

The live [Raspberry Pi Approved Reseller directory](https://www.raspberrypi.com/resellers/?country=1&q=usa)
listed `PiShop.us` and linked its Raspberry Pi category on the observation
date. This closes the reseller-membership part of I-163 for the HAT, Pi,
cooler, case, power, and cable lines; it does not turn item pages into a
destination-specific formal quote.

| Variant-only HAT | Architecture | HAT price | Complete merchandise subtotal | Shipping + tax headroom under $650 | Pre-delivery result |
|---|---|---:|---:|---:|---|
| [AI HAT+ 13 TOPS](https://www.pishop.us/product/raspberry-pi-ai-hat-13-tops/) | Hailo-8L | $76.95 | **$533.23** | **$116.77** | Blocked pending destination quote |
| [AI HAT+ 26 TOPS](https://www.pishop.us/product/raspberry-pi-ai-hat-26-tops/) | Hailo-8 | $119.95 | **$576.23** | **$73.77** | Blocked pending destination quote |
| [AI HAT+ 2, 40 TOPS](https://www.pishop.us/product/raspberry-pi-ai-hat-2/) | Hailo-10H | $200.00 | **$656.28** | $0.00 | **Fails by $6.28 before shipping and tax** |

This is not a delivered quote and does not close I-163. Q-184 still withholds
the destination state/ZIP, tax status, and approved checkout evidence path.
Shipping, tax, and delivered total therefore remain `null` for all three rows.
No cart was opened, no checkout was started, and no purchase is authorized or
recommended.

D-041's 26 TOPS baseline remains unchanged. The 13 TOPS merchandise saving is
$43.00 versus that baseline, but Q-259 has not frozen the complete accuracy,
throughput, thermal, power, and delivered-savings gates needed to reconsider
the selection. The 40 TOPS number is INT4 generative-inference capacity, not
evidence of faster VCG pose inference: Raspberry Pi and PiShop both describe
its computer-vision performance as comparable to the 26 TOPS AI HAT+.

## Same-date shared lines

All three variants retain the exact Pi RAM, camera, cooler, power, storage,
case, and cable choices from the complete reference BOM. Their direct pages
were re-observed on 2026-07-25; the prices were unchanged from the 2026-07-24
baseline.

| Role | Exact item | 2026-07-25 item-page state | Price |
|---|---|---|---:|
| Compute | [Raspberry Pi 5 8GB](https://www.pishop.us/product/raspberry-pi-5-8gb/), `SC1112`, PiShop `8GB-9028` | In stock | $175.00 |
| Cooling | [Raspberry Pi Active Cooler](https://www.pishop.us/product/raspberry-pi-active-cooler/), `SC1148`, PiShop `374-1` | In stock | $10.95 |
| Enclosure | [HighPi Pro 5S](https://www.pishop.us/product/highpi-pro-5s-case-for-raspberry-pi-5/), PiShop `9015`, UPC `990317300194` | In stock | $10.95 |
| Power | [Raspberry Pi 27W USB-C supply, black US](https://www.pishop.us/product/raspberry-pi-27w-usb-c-power-supply-black-us/), `SC1158`, PiShop `1795-1` | In stock | $12.95 |
| Display cable | [Cableshop.ca micro-HDMI to HDMI cable](https://www.pishop.us/product/micro-hdmi-to-hdmi-cable-for-pi-4-3ft-black/), PiShop `CS-PID-301` | In stock | $6.45 |
| Writable storage | [SanDisk 256GB High Endurance microSDXC](https://www.bhphotovideo.com/c/product/1466564-REG/sandisk_sdsqqnr_256g_an6ia_high_endurance_microsd_256gb.html), `SDSQQNR-256G-AN6IA`, B&H `SAMSDHE256GB` | In stock; item page displays free 2-day shipping | $69.99 |
| Shared RGB camera | [Logitech Brio Pro](https://www.staples.com/logitech-brio-pro-ultra-hd-webcam-black-960-001105/product_2705146), `960-001105`, Staples `2705146` | Add to cart; item page displays free delivery | $169.99 |
| **Shared merchandise subtotal** |  |  | **$456.28** |

The displayed B&H and Staples delivery claims are not substituted for a
destination-specific final basket. PiShop shipping is also unknown. Every
seller's actual shipping and tax must be retained independently at the
authorized quote destination.

## Exact HAT evidence

### 13 TOPS

PiShop listed SKU `1129-1` in stock at $76.95 and identified a Hailo-8L with
13 TOPS. The listing supplies the 16mm stacking header, spacers, and screws,
says the Active Cooler can remain installed, and recommends the HighPi Pro 5S
case. Its title and description expose three conflicting or unexplained
manufacturer identifiers: `SC1676`, `SC1785`, and `SC1430`. Paper compatibility
is not physical qualification, and Q-266 keeps this row non-orderable.

### 26 TOPS

PiShop listed SKU `1243-1` in stock at $119.95 and identified a Hailo-8 with
26 TOPS. It carries the same supplied mounting hardware and paper compatibility
chain. The page still says `SC1791 (SC1468)`, so Q-185 remains open. This is the
current baseline only because D-041 selected it; the quote is not new
performance evidence.

### 40 TOPS

PiShop listed SKU `1435-1`, `SC2166`, in stock at $200.00 with a two-to-three
business-day high-demand handling notice. The seller and the
[official Raspberry Pi product page](https://www.raspberrypi.com/products/ai-hat-plus-2/?pubDate=20260413)
identify Hailo-10H, 40 TOPS at INT4, and 8GB of on-board RAM. Both describe
computer-vision performance as comparable to the 26 TOPS AI HAT+. Both say an
optional heatsink plus the 16mm header, spacers, and screws are supplied and
that the Pi Active Cooler may remain installed. PiShop lists the HighPi Pro 5S,
27W supply, and Active Cooler as essential extras.

The supplied heatsink is recorded at $0.00; package contents still require
receipt inspection. The paper chain does not prove case closure, airflow,
thermals, power, runtime compatibility, pose-model availability, or VCG
performance.

## Arithmetic

```text
Shared non-HAT merchandise:
  175.00 + 10.95 + 10.95 + 12.95 + 6.45 + 69.99 + 169.99
  = 456.28

13 TOPS:
  456.28 + 76.95 = 533.23
  650.00 - 533.23 = 116.77 maximum shipping + tax
  533.23 - 576.23 = -43.00 versus 26 TOPS

26 TOPS:
  456.28 + 119.95 = 576.23
  650.00 - 576.23 = 73.77 maximum shipping + tax

40 TOPS:
  456.28 + 200.00 = 656.28
  656.28 - 650.00 = 6.28 minimum pre-delivery cap failure
  656.28 - 576.23 = 80.05 versus 26 TOPS
```

The machine validator recomputes every subtotal, headroom, overage, and
baseline delta in integer cents. It also rejects line substitution, price or
identity drift, invented delivery values, purchase authority, premature
qualification or selection, and any implication that 40 advertised TOPS
establishes faster computer vision.

## Closure path

I-163 can move from blocked comparison to a complete delivered-price artifact
only after:

1. Q-184 supplies the state/ZIP, tax status, evidence-retention authority, and
   seller-specific quote method without exposing a street address.
2. Q-185 and Q-266 resolve the manufacturer identifier aliases and prohibit
   unapproved substitutions.
3. The exact three baskets are refreshed during one quote window, with each
   seller's shipping, tax, stock, quantity, and total captured.
4. The delivered arithmetic is checked against $650 separately for every
   variant; a pass in one row cannot rescue another.
5. Q-186/I-177 qualify the exact camera and mount rather than treating retail
   compatibility as room or latency proof.
6. I-158 and Q-259 provide the pre-registered evidence required for any
   accelerator-selection change.

Prices and stock are volatile. Requote all lines immediately before any
separately authorized purchase.
