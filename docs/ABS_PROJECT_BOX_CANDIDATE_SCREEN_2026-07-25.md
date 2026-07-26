# ABS project-box candidate screen

Date observed: 2026-07-25

Investigation: I-196

Decision boundary: D-041, D-042, D-045, D-090, D-094, D-095

Status: no purchase, no selection, no fit qualification

## Outcome

`WA-40*16` is the least-constrained catalog candidate for the first CAD and
cardboard fit exercise. It is **not selected**. `WA-25*16` is the useful
low-profile comparison, and `WA-36*16` is the compact stress case. None may be
ordered or cut from this screen.

The screen cannot prove I-196 because the exact camera assembly, shutter and
adjustable-jig envelope is not frozen; the Pi stack, connector bend radii,
ventilation, indicator, wake control, fasteners, center of gravity and feet
have not been laid out; and no destination-aware delivered quote exists.
Q-254 through Q-256 own those blockers.

## Source boundary

The three boxes use one manufacturer series so dimensions, material claims,
ratings and quote semantics are directly comparable. Polycase describes the
WA series as flame-retardant ABS for indoor use with PCB bosses, gasketed
covers and machine screws. Product-page dimensions are expressly approximate;
the manufacturer drawing and STEP model remain required for fit work.

Primary sources:

- [Polycase WA series](https://www.polycase.com/wa-series)
- [WA-36 product page](https://www.polycase.com/wa-36)
- [WA-25 product page](https://www.polycase.com/wa-25)
- [WA-40 product page](https://www.polycase.com/wa-40)
- [Polycase shipping policy](https://www.polycase.com/shipping-information)
- [Raspberry Pi 5 mechanical drawing](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf)
- [Raspberry Pi AI HAT+ documentation](https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html)
- [Logitech Brio `960-001105`](https://www.logitech.com/en-us/products/webcams/brio-4k-hdr-webcam.960-001105.html)

## Dated candidate ledger

All prices are quantity-one USD merchandise prices observed on the linked
manufacturer pages. “In stock” is the page label, not a reserved unit or a
delivery promise. Tax and shipping are unknown.

| Exact part | Observed stock | Merchandise | External L x W x H | Approx. internal L x W x H | Nominal wall | Material / rating | Screen disposition |
|---|---|---:|---|---|---|---|---|
| Polycase `WA-36*16` | In stock; low-stock warning | $17.77 | 120 x 120 x 60 mm | 112 x 112 x 54 mm | 0.125 in / 3.175 mm | ABS; UL94 HB; IP65; indoor | Compact stress case only. Catalog rectangles fit with little camera-width reserve, before jig, shutter, cables, vents or fasteners. |
| Polycase `WA-25*16` | In stock; low-stock warning | $29.41 | 222 x 146 x 55 mm | 214 x 138 x 49 mm | 0.123 in / 3.124 mm | ABS; UL94 HB; IP65; indoor | Low-profile comparison. Best planar reserve of the smaller candidates, but its 49 mm approximate internal height is the most serious stack/jig risk. |
| Polycase `WA-40*16` | In stock; low-stock warning | $34.79 | 240 x 160 x 91 mm | 230 x 150 x 84 mm | 0.114 in / 2.896 mm | ABS; UL94 HB; IP65; indoor | First CAD/cardboard candidate because it has the largest three-axis reserve. Size, stability and cut layout remain unproved. |

Polycase says shipping is calculated after items are added to the cart and
ships prepaid from Avon, Ohio by UPS or FedEx. Therefore:

```text
delivered price = observed merchandise + destination shipping + destination tax
                 = observed merchandise + TBD + TBD
```

A `TBD` delivered price does not meet I-196's dated-delivered-price proof.

## Known component lower bounds

These are catalog/mechanical lower bounds, not mounting envelopes:

| Component | Bound used | What it excludes |
|---|---|---|
| Raspberry Pi 5 | 85 x 56 mm board outline | Port protrusions, plugs, cable bends, standoffs, base clearance and fastener heads |
| AI HAT+ | approximately 66 x 56.5 mm; supplied 16 mm stacking hardware | Component/connector maxima, ribbon routing, cooler airflow and installed-stack height |
| Logitech Brio `960-001105` reference camera | 102 x 27 x 26.5 mm camera body | Cable bend, removable clip, attachable shutter sweep, retention, aiming jig and optical opening |

The current BOM's Brio is only a camera reference candidate. This screen does
not authorize disassembly and does not assume the camera clip, housing,
indicator or attachable shutter can be altered.

One deliberately optimistic planar packing places the 85 x 56 mm Pi footprint
and 102 x 27 mm camera-body footprint in adjacent rows, yielding a bare
102 x 83 mm rectangle. It is useful only for exposing how little catalog slack
exists:

| Part | Internal L x W | Bare-rectangle slack L x W | Interpretation |
|---|---|---|---|
| `WA-36*16` | 112 x 112 mm | 10 x 29 mm | Only 5 mm per side around the 102 mm camera dimension if centered; no mount/shutter/cable claim is possible. |
| `WA-25*16` | 214 x 138 mm | 112 x 55 mm | Planar room exists, but 49 mm height still needs an exact installed-stack and jig model. |
| `WA-40*16` | 230 x 150 mm | 128 x 67 mm | Largest reserve for routing and a secured adjustable test jig; still not proof of fit. |

No rotation or stacking arrangement may convert this lower-bound arithmetic
into a fit claim. Bosses, ribs, screw wells and wall draft reduce usable space.

## Required fit packet before selection or cutting

1. Freeze exact received revisions for Pi 5, AI HAT+ 26 TOPS, Active Cooler,
   camera, camera cable, shutter, indicator and wake control.
2. Measure the assembled Pi/cooler/HAT stack and every protrusion; compare it
   against manufacturer STEP/drawing geometry, not approximate box dimensions.
3. Define connector keep-outs and minimum bend radii for USB-C power, two
   micro-HDMI options, camera USB, optional Ethernet, and any service USB.
4. Model the camera's full adjustable prototype pitch range, retention,
   physical shutter motion, indicator visibility and unobstructed optical cone.
5. Define intake/exhaust openings, fan clearance, hot-part/finger protection,
   radio keep-outs and a thermal test configuration without claiming that an
   IP rating survives modifications.
6. Specify inserts/standoffs, fastener engagement, edge distance, strain
   relief, deburring and repeatable service access.
7. Print a 1:1 cut template and build a cardboard/foam-board mockup. Record
   connector access, assembly order, collisions and the exact rejected layouts.
8. Weigh the received parts, compute and then test center of gravity across
   cable pulls and camera pitch; define nonslip feet and a tip/slip gate.
9. Obtain a destination-aware cart with part, quantity, shipping, tax,
   timestamp and screenshot. Recalculate the complete delivered BOM cap.
10. Select one exact part only after the CAD, mockup, safety, thermal and quote
    packets pass; then publish the cut plan before touching the box.

## Evidence boundary

This artifact establishes a reproducible market screen and names the current
least-constrained candidate. It establishes no component compatibility,
thermal performance, acoustic result, radio performance, optical coverage,
mechanical safety, tip resistance, water/dust protection after cutting,
delivered cost, purchase approval, cut approval or final enclosure choice.
