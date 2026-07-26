# OAK-D Pro W candidate screen — 2026-07-25

Status: current official-source candidate facts recorded; no device selected,
ordered, received, operated or qualified

Authority: D-002, D-003, D-043, D-044, D-090, D-091, D-104, D-110, I-042,
I-045, I-065, Q-018 and Q-025

## Exact candidate boundary

The first comparison candidate is the USB OAK-D Pro W with IMX378 central RGB
camera, currently shown by Luxonis as SKU `A00573`. The [official product
page](https://shop.luxonis.com/products/oak-d-pro-w) showed US $529 and In
Stock on 2026-07-25. That is a dated merchandise observation, not a delivered
quote, purchase authorization, received-unit identity or promise of future
availability. Tax, shipping, destination, power accessories and mounting are
not included in the comparison cost until quoted.

The OV9782 central-camera variant, PoE models, developer/custom variants and
any later OAK4 product are different candidates. None may substitute for
`A00573` without a new source-bound plan revision.

## Vendor-stated capabilities to verify

Luxonis' [hardware documentation](https://docs.luxonis.com/hardware/products/OAK-D%20Pro%20W)
and product page currently describe:

- RVC2 architecture and USB 2/3 connectivity;
- an IMX378 fixed-focus rolling-shutter color sensor, up to 60 FPS, with a
  vendor-stated roughly 95-degree horizontal wide field of view;
- two OV9282 fixed-focus global-shutter monochrome stereo sensors with a wider
  vendor-stated roughly 127-degree horizontal field of view;
- a 75 mm stereo baseline, on-device stereo processing and RGB/depth alignment;
- a 940 nm dot projector and flood illumination LED, both disabled by default;
- vendor ideal-depth and accuracy bands that depend on mode, distance,
  calibration, scene texture and filtering;
- an integrated IMU and status LED; and
- configurable processing, encoder, stereo and emitter loads.

Every value above is a vendor claim or device-category fact. The received unit,
sensor revision, calibration, exact modes, useful RGB/depth overlap, floor and
body accuracy, exposure timing, frame synchronization, latency, USB stability,
power and thermal behavior still require measurement.

The differing central-RGB and stereo fields of view mean advertised wide angle
cannot establish usable overlap. Results must publish raw, valid-depth and
qualified-action coverage separately; a full RGB image with missing or invalid
edge depth is not a passing depth cell.

## IR and safety boundary

Luxonis documents the product as a Class 1 laser product under the cited
EN/IEC 60825-1 edition and states that the enclosure must not be opened,
modified or used when externally damaged; unofficial firmware and magnifying
optics are prohibited. The vendor classification does not replace the
project's room, child-participant, distribution, accessibility or legal review.

The dot projector and flood LED remain off until an exact reviewed protocol
binds received-unit identity, official firmware, intensity, distance, duration,
temperature, reflections, other IR devices, operator stop rules and participant
authority. Passive, dot-projector and flood-assisted results remain separate.
No successful depth image may waive an IR/safety failure.

## Power and USB boundary

The product page describes subsystem power that can total roughly 7.5 W under
full feature use. Luxonis' [USB deployment guide](https://docs.luxonis.com/hardware/platform/deploy/usb-deployment-guide/)
separately warns that Pro devices can have higher peaks and recommends an
external 15 W supply through the Y-adapter. The campaign therefore measures
wall/device/USB power and brownout behavior rather than treating either number
as an observed maximum.

The exact supplied Y-adapter, 5 V supply, screw-locking cable, host port,
controller, hub policy and power topology must be frozen per target. USB
enumeration or one streamed frame cannot qualify bandwidth, synchronization,
recovery or sustained concurrent operation.

## Software boundary

The current [DepthAI v3 documentation](https://docs.luxonis.com/software-v3/depthai/)
supports OAK/RVC2 peripheral operation from Python or C++ and describes device-
deployed pipelines. The comparison must pin the exact DepthAI release, source
commit, dependencies, firmware/bootloader and pipeline graph; “latest” is not a
reproducible runtime. Installation guidance is not evidence that ordinary x86
Linux, SteamOS or Raspberry Pi meets the project's permissions, packaging,
restart, offline, latency or update gates.

OAK on-device neural inference is not part of the blocking camera/depth
attribution experiment. It may enter a separately named exploratory lane only
after its model, conversion, core-17 mapping and accuracy contract are pinned.
Otherwise a camera change, depth change and model change would be confounded.

## Candidate disposition

OAK-D Pro W `A00573` remains a no-purchase comparison candidate. It is not the
shared camera, an optional tier, a BOM item or a selected depth solution.
I-042 requires a same-session, independently labeled comparison against the
qualified wide-RGB baseline. I-045 separately gates sunlight, reflective
surfaces, other IR devices and emitter safety. I-065 separately governs floor-
contact truth; depth output cannot label itself.
