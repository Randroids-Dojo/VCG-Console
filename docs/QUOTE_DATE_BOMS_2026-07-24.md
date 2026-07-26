# Quote-date hardware BOMs — 2026-07-24

Quote snapshot: 2026-07-24 08:47 PDT (`UTC-07:00`)

Currency and market: USD, United States storefronts

Investigation: I-030

Governing decisions: D-021, D-036, and D-111

## Result

Three comparable bills of materials are recorded below:

1. the owned-hardware reuse prototype has **$0 incremental cost** and is the
   only lane recommended for immediate work;
2. the complete Raspberry Pi reference has a **$576.23 merchandise subtotal**
   and therefore only **$73.77 of combined tax and shipping headroom** under
   the $650 delivered ceiling; and
3. the public Steam Machine comparison has a **$1,225.44 provisional
   merchandise subtotal**, pending the owner's actual preorder configuration,
   invoice, included-cable inventory, shipping, and tax.

The Raspberry Pi quote is not yet a passing delivered-cost quote. A destination
is required to obtain tax and shipping, PiShop calculates shipping only in the
cart/checkout path, and two supplier listings contain unresolved exact-part
ambiguities. No cart was submitted, no checkout was started, and no purchase is
authorized or recommended.

Prices, stock, delivery claims, and product pages are volatile. Requote every
line and retain a checkout screenshot or invoice immediately before any
authorized order.

## Quote method

- A line is exact only when the manufacturer or seller exposes a stable model,
  manufacturer part number, seller SKU, or other revision-bearing identifier.
- The observed item-page price is recorded separately from shipping and tax.
  “Free delivery” on an item page is not treated as a final delivered quote
  until the destination-specific checkout agrees.
- Included cables, mounts, headers, spacers, screws, and feet are shown so the
  same accessory is not silently purchased twice.
- Marketing compatibility is evidence for selection, not qualification.
  Physical fit, Linux enumeration, performance, thermals, acoustics, room
  coverage, durability, and recovery still require the project acceptance
  tests.
- The $650 ceiling applies to the complete lower-cost reference only. The
  television, controllers, tools, and spare experimental parts remain excluded
  by D-111.

## BOM A — reuse prototype

This lane spends nothing and continues D-036's x86-first work. The inventory
comes from the ignored exact local inventory and its sanitized tracked report,
[`WINDOWS_QUALIFICATION_RESULT_2026-07-24.md`](WINDOWS_QUALIFICATION_RESULT_2026-07-24.md).

| Role | Exact owned item | Incremental price | Qualification role and limitation |
|---|---|---:|---|
| Compute | AMD Ryzen 9 5900X, 12 cores / 24 threads; NVIDIA GeForce RTX 3080 Ti, 12,288 MiB; approximately 63.9 GiB RAM | $0.00 | Strong Windows compatibility and benchmark workstation. It is not the ordinary x86-64 Linux reference. |
| Writable storage | Samsung 990 EVO Plus 2 TB NVMe and WDC WDS200T2B0A 2 TB SATA | $0.00 | Existing physical storage. Neither disk is authorized for repartitioning or destructive Linux work. |
| Camera | Logitech HD Pro Webcam C920, USB `046d:082d` | $0.00 | Suitable for the first real-camera capture and privacy-path test. It does not establish the required shared 1920×1080-at-60-FPS wide-angle camera contract. |
| Display, power, and ordinary cables | Existing household/workstation equipment; exact models not yet inventoried | $0.00 | Reuse is assumed for desk testing only. Record exact display, PSU, camera cable, and connection path before claiming a reproducible physical benchmark. |
| Controller | None detected | $0.00 | Controller qualification remains unavailable until an owned controller is inventoried or one is separately authorized. Controllers are outside D-111's reference-build cap. |
| Shipping and tax | No order | $0.00 | Not applicable. |
| **Incremental total** |  | **$0.00** | **Proceed with evidence gathering; do not purchase around unrun tests.** |

The reuse lane can complete C920 mode enumeration, sustained capture, privacy
behavior, timestamps, worker/fallback observation, hosted-game concurrency, and
the ordinary native-Linux handoff plan. It cannot close the final camera,
controller, Pi, SteamOS, room, or 120 ms camera-to-action gates by itself.

## BOM B — $650-capped Raspberry Pi 5 reference

The selected architecture remains Raspberry Pi 5 8GB plus AI HAT+ 26 TOPS, a
shared wide-angle UVC camera, 256GB high-endurance microSD, official power and
active cooling, and an ABS HAT-compatible enclosure. This quote deliberately
uses a finished Logitech camera rather than pricing an uncovered industrial
camera board as a household-ready product.

| Role | Exact quote item and source | Seller identifier | Observed status | Price | Evidence and remaining qualification |
|---|---|---|---|---:|---|
| Compute | [Raspberry Pi 5 8GB — SC1112](https://www.pishop.us/product/raspberry-pi-5-8gb/) | PiShop SKU `8GB-9028` | In stock | $175.00 | Seller identifies SC1112, 8GB LPDDR4X, two USB 3 ports, two USB 2 ports, microSD, and 5V/5A USB-C. Verify board and RAM markings at receipt. |
| Inference | [Raspberry Pi AI HAT+ 26 TOPS](https://www.pishop.us/product/raspberry-pi-ai-hat-26-tops/) | PiShop SKU `1243-1`; page says `SC1791 (SC1468)` | In stock | $119.95 | Hailo-8, 26 TOPS. The listing's two manufacturer identifiers must be resolved before order. The supplied 16mm stacking header, spacers, and screws cover the HAT fastener requirement. |
| Cooling | [Raspberry Pi Active Cooler — SC1148](https://www.pishop.us/product/raspberry-pi-active-cooler/) | PiShop SKU `374-1` | In stock | $10.95 | Dedicated Pi 5 cooler with mounting pins and pre-applied thermal pads. Sustained AI/game load must prove temperature, throttling, and noise. |
| Enclosure | [HighPi Pro 5S Case for Raspberry Pi 5](https://www.pishop.us/product/highpi-pro-5s-case-for-raspberry-pi-5/) | PiShop SKU `9015`; UPC `990317300194` | In stock | $10.95 | ABS, tool-free, four rubber feet, Active Cooler support, and claimed HAT clearance of 14.5mm over cooler with 16mm standoffs. Physically verify AI HAT+ fit, airflow, ports, radio, and service access. |
| Power | [Raspberry Pi 27W USB-C Power Supply, black US — SC1158](https://www.pishop.us/product/raspberry-pi-27w-usb-c-power-supply-black-us/) | PiShop SKU `1795-1`; UPC `5056561803395` | In stock | $12.95 | 5.1V/5A profile and captive 1.2m cable. Verify delivered plug/revision and power behavior with camera, HAT, storage, and simultaneous load. |
| Display cable | [Cableshop.ca micro-HDMI to HDMI cable](https://www.pishop.us/product/micro-hdmi-to-hdmi-cable-for-pi-4-3ft-black/) | PiShop SKU `CS-PID-301` | In stock | $6.45 | Title/SKU say 3ft while description says 6ft. Confirm exact length before checkout and qualify at target resolution/refresh. |
| Writable storage | [SanDisk 256GB High Endurance microSDXC — `SDSQQNR-256G-AN6IA`](https://www.bhphotovideo.com/c/product/1466564-REG/sandisk_sdsqqnr_256g_an6ia_high_endurance_microsd_256gb.html) | B&H `SAMSDHE256GB`; manufacturer `SDSQQNR-256G-AN6IA` | In stock; item page shows free 2-day shipping | $69.99 | UHS-I, V30, U3, Class 10, quoted 100/40 MB/s. “High Endurance” video claims do not prove VCG write life, power-loss safety, full-disk behavior, update recovery, or blank-card restoration. |
| Shared RGB camera | [Logitech Brio Pro — `960-001105`](https://www.staples.com/logitech-brio-pro-ultra-hd-webcam-black-960-001105/product_2705146) | Staples item `2705146`; model `960-001105` | Item page shows free delivery | $169.99 | [Logitech specifies](https://hub.sync.logitech.com/brio/post/brio-brio-4k-specifications-BJKhhCqWmecRhPD) UVC, 1080p60, and adjustable 90°/78°/65° diagonal FOV. The exact Linux modes, latency, timestamps, distortion, low light, room coverage, hot-plug, suspend/resume, and physical mount remain unqualified. Built-in microphones remain disabled and unauthorized. |
| HAT fasteners | Header, spacers, and screws supplied with the AI HAT+ | Included with `1243-1` | Seller-stated | $0.00 | Confirm package contents at receipt; do not substitute generic spacers without a fit check. |
| Case retention and feet | Tool-free board retention and four feet supplied with case | Included with `9015` | Seller-stated | $0.00 | No separate board fastener purchase is presently required. Confirm secure retention and household tip/cable loads physically. |
| Power/camera cables | Power cable captive to SC1158; USB camera cable supplied with camera | Included | Manufacturer/seller-stated | $0.00 | Confirm connector, reach, strain relief, and replacement feasibility at receipt. |
| **Merchandise subtotal** |  |  |  | **$576.23** | Exact arithmetic below. |
| Shipping | PiShop unknown; B&H and Staples item pages display free shipping/delivery | Destination required | Not quoted | **TBD** | [PiShop's published policy](https://support.pishop.us/article/42-where-do-you-ship-orders-to-and-how) names carriers and regions but does not publish a rate for this basket. A destination-specific cart is required. |
| Tax | Destination and seller dependent | Destination required | Not quoted | **TBD** | Record each seller's checkout tax, not a guessed blended rate. |
| **Delivered total** |  |  |  | **TBD** | **Passes only if merchandise + all shipping + all tax is at most $650.00.** |

### Cap arithmetic

```text
PiShop merchandise:
  175.00 + 119.95 + 10.95 + 10.95 + 12.95 + 6.45 = 336.25

Other merchandise:
  69.99 + 169.99 = 239.98

Merchandise subtotal:
  336.25 + 239.98 = 576.23

Maximum combined shipping and tax:
  650.00 - 576.23 = 73.77
```

The checkout pass predicate is:

```text
PiShop shipping
+ B&H shipping
+ Staples shipping
+ PiShop tax
+ B&H tax
+ Staples tax
<= 73.77 USD
```

Any positive price change reduces the same $73.77 allowance. A free-shipping
claim, estimated tax rate, or cart total for another ZIP code does not close
the gate.

### Compatibility chain

- PiShop identifies the AI HAT+ as Pi 5-compatible and explicitly recommends
  the HighPi Pro 5S when the official case cannot close over the HAT.
- The HAT listing says the official Active Cooler can remain installed and
  supplies 16mm hardware; the case listing claims clearance for HATs up to
  14.5mm above that cooler on 16mm standoffs.
- The official 27W supply exposes the Pi 5's required 5.1V/5A power profile.
- The Brio is a UVC device with a manufacturer-stated 1080p60 mode, so it is a
  stronger compatibility candidate than a 30-FPS office camera. It is not yet
  a qualified whole-room tracking camera.
- The AI HAT uses the Pi 5 PCIe connector. The baseline therefore keeps
  microSD as primary writable storage and does not silently add an incompatible
  PCIe NVMe HAT.

These are paper checks only. Receipt inspection and the full tests in
[`RASPBERRY_PI_AI_HAT.md`](RASPBERRY_PI_AI_HAT.md) remain authoritative.

## BOM C — premium comparison

This is a public comparison quote, not a replacement for the owner's preorder
invoice and not a new purchase recommendation. Valve's 2026-06-22 launch
announcement lists the 512GB Steam Machine without controller at $1,049 USD.
Valve's compliance register identifies it as Steam Machine model 1016 and
states a minimum security-support period through 2028-12-31.

| Role | Exact quote item and source | Price | Evidence and limitation |
|---|---|---:|---|
| Premium compute appliance | [Valve Steam Machine 512GB](https://steamcommunity.com/groups/steam_hardware) / [product page](https://store.steampowered.com/hardware/steammachine) | $1,049.00 | Public base price without controller. The owner's preorder configuration, actual paid price, shipping, tax, serial/revision, included cables, and delivered inventory are not available in the repository. |
| Shared RGB camera | Logitech Brio Pro `960-001105`, same Staples quote as reference BOM | $169.99 | Keeps camera cost and intended capture contract comparable across Pi and x86. Actual SteamOS UVC permissions and performance remain open. |
| HDMI cable allowance | Cableshop.ca `CS-PID-301`, same PiShop quote as reference BOM | $6.45 | Conservative provisional allowance until delivered Steam Machine box contents and required cable length are inventoried. Remove if a qualified cable is included or already owned. |
| Camera/power cables | Included with camera and appliance | $0.00 | Verify delivered contents and reach. |
| **Provisional merchandise subtotal** |  | **$1,225.44** | $1,049.00 + $169.99 + $6.45. |
| Shipping and tax | Destination/order dependent | **TBD** | Use the actual preorder invoice and delivered charge, not a public launch announcement, for the final comparison. |
| **Delivered total** |  | **TBD** | Premium comparison is outside the $650 reference ceiling. |

The Steam Machine row compares a finished compact appliance, discrete graphics,
NVMe storage, cooling, power supply, firmware, SteamOS, and support with the Pi
reference. It does not make Steam account dependence, USB camera permissions,
pose inference, VCG shell ownership, or accountless operation qualified.

## Candidate substitutions — none approved yet

| Baseline line | Candidate | Quote-date effect | Why it is not an approved substitution |
|---|---|---:|---|
| Brio `960-001105` | Owned Logitech C920 `046d:082d` | Reference merchandise would fall to $406.24 | It saves $169.99 but does not establish 1080p60 or the required wide shared-camera contract. Use it for x86 evidence, not as a paper-qualified final camera. |
| Brio `960-001105` | [ELP `ELP-USBFHD08S-H110`](https://www.webcamerausb.com/elp-110degree-no-distortion-260fps-webcamwide-angle-2mp-1080p-camera-with-usb20-cmos-ov4689-mini-camera-module-high-speed-p-386.html), quoted $69.80 | Reference merchandise would fall to $476.04, saving $100.19 | The manufacturer page claims UVC, 110°, and 1080p60 but also lists a contradictory 1280×720 maximum resolution. It is a bare 38mm board with no qualified household enclosure, stable mount, privacy shutter, indicator, domestic delivered quote, return path, or receipt identity. |
| SanDisk `SDSQQNR-256G-AN6IA` | Any cheaper or higher-endurance 256GB card | Unknown until same-day exact quote | Endurance labels and capacity do not establish controller behavior, write amplification, power-loss safety, or recovery. A substitute needs exact MPN, seller, firmware/identity evidence, and the same destructive qualification. |
| HighPi case `9015` | Any other Pi 5 case | Unknown | Must remain ABS, retain Pi 5 + Active Cooler + exact AI HAT+ hardware, expose required ports, and pass thermal, acoustic, radio, cable, and service tests. |
| SC1112 / AI HAT+ 26 | Lower RAM, 13 TOPS, or 40 TOPS variants | Not part of I-030's selected baseline | They change the benchmark tier. Quote and qualify them under I-016/I-163 rather than silently substituting at checkout. |

## Explicit exclusions

The following are not omitted by accident:

- television/display;
- controllers and controller receivers;
- keyboard, mouse, SD writer, screwdriver, and other setup/service tools;
- spare cards, cables, cameras, boards, and experimental accelerators;
- the already-preordered Steam Machine from the $650 reference cap;
- optional VESA/wall mounts and custom camera brackets;
- paid software, games, cloud services, and network service;
- replacement media used only for destructive recovery testing.

If a required production camera mount, safety retainer, adapter, or other
non-tool part is discovered during qualification, add it to the reference BOM
and re-evaluate the delivered cap. It may not be hidden as a tool or household
assumption.

## No-purchase gate

**Recommendation: purchase nothing from these quotes. Continue the $0 reuse
prototype.**

An order remains prohibited until all of the following are true:

1. D-036's owned-x86 evidence includes the real camera/tracking workload and
   the planned ordinary x86-64 Linux baseline, or the owner explicitly changes
   that gate.
2. The final camera passes I-177's mode, room, latency, privacy, reconnect,
   suspend/resume, and cross-platform requirements.
3. Pi/HAT/case fit, software-stack support, storage/recovery design, and the
   complete acceptance plan are reviewed for the exact revisions.
4. The seller resolves `SC1791 (SC1468)` and the HDMI 3ft/6ft contradiction.
5. A destination-specific, same-session checkout records every item, shipping,
   tax, return policy, availability, and delivered total at or below $650.
6. The resulting order is separately authorized. A passing quote is not
   purchase authorization.

## Requote record required before authorization

For each seller, retain:

- timestamp, currency, country storefront, destination ZIP/state, and cart ID
  or screenshot;
- exact item title, manufacturer part/revision, seller SKU, quantity, unit
  price, stock status, and permitted substitution setting;
- shipping service and charge, tax by line/order, discounts, and final total;
- return window, restocking terms, warranty seller, and backorder behavior;
- confirmation that no marketplace seller or silent model substitution
  replaced the quoted source;
- delivered package labels, hardware IDs, and deviations from the order.

Unresolved owner choices are isolated in
[`OWNER_QUESTIONS_QUOTE_DATE_BOMS_2026-07-24.md`](OWNER_QUESTIONS_QUOTE_DATE_BOMS_2026-07-24.md).
