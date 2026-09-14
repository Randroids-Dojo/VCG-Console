# Randroid's Dojo VCG Console Case

This package customizes WrenchWorks3D's **Pi 5 AI Case** for the VCG Console. It preserves the original Raspberry Pi 5 and Hailo AI HAT enclosure geometry and adds a recessed Randroid's Dojo logo with a separately printable insert.

## Design summary

- Original enclosure: WrenchWorks3D Pi 5 AI Case
- Hardware target: Raspberry Pi 5 with the official Raspberry Pi AI HAT+ / Hailo-8 configuration
- Enclosure color: black PETG
- Logo insert color: red PETG
- Recess depth: 1.00 mm
- Insert thickness: 0.90 mm
- XY clearance: 0.25 mm per side
- Finished insert top: 0.05 mm below the lid surface
- Logo envelope: approximately 41.05 x 19.00 mm

The logo is in the verified clear band below the ventilation field. It does not alter the enclosure envelope, vents, ports, power-button opening, snaps, ribs, or internal HAT clearance.

## Manufacturing files

Use the files in `Manufacturing/` for production:

- `VCG-Console-Case-Bottom.stl` and `.3mf`
- `VCG-Console-Case-Lid-Randroids-Dojo.stl` and `.3mf`
- `VCG-Console-Randroids-Dojo-Logo-Insert.stl` and `.3mf`

The editable model is `Source/Working/Randroids-Dojo-VCG-Console-Case.FCStd`. STEP exports of the edited lid and insert are beside it.

## Previews

The `Previews/Final/` folder contains assembled top, front, rear/ports, close-up, recess, separate-insert, and exploded views.

## Verification

All three final STL meshes are closed solids. The generated 3MF packages contain valid model resources and one build item each. The branded lid and insert are valid, closed single-solid BReps, and the finished lid keeps the original 62.5001 x 95.0000 x 28.2603 mm envelope.

See `Source/Working/manufacturing-verification.json` and `Source/Working/final-geometry-report.json` for the machine-readable results.

## Ordering status

Paid through X3D Studios on 2026-08-30: one black PETG bottom, one black PETG branded lid, and one red PETG logo insert, all at standard 0.20 mm and 20% infill. The verified total was **$12.60**, comprising $9.00 in parts, $5.00 standard US shipping, and a -$1.40 first-order discount; no separate tax line was shown.

X3D displayed `Order placed successfully!` and said confirmation and shipping emails would follow. No order/reference number or delivery date was displayed. Shipment, receipt, physical fit, assembly, thermals, and finished appearance remain unverified. See `Quotes/print-service-quotes.md` for the quote and purchase record.
