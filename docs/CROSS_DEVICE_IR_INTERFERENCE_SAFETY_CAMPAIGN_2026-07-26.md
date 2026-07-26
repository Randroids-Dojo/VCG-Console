# Cross-device IR interference and safety campaign

Date: 2026-07-26

Status: strict zero-result I-045 plan. No camera purchase, device operation,
emitter use, sunlight staging, reflective fixture, external IR source,
participant collection, fault injection, result, selection, or publication is
authorized.

## Scope and candidate boundary

`benchmarks/depth-interference/cross-device-ir-interference-safety-plan-v1.json`
pre-registers the interference, failure, recovery, and safety evidence required
by I-045 for the three current no-purchase depth candidates:

- OAK-D Pro W IMX378 SKU `A00573`: passive stereo, 940 nm dot-projector
  stereo, and 940 nm flood/mono-IR rows;
- Orbbec Gemini 335L model `G40055-170`: passive stereo and 850 nm active
  stereo rows; and
- RealSense D455 product `82635DSD455`, material `999WCT`: passive stereo
  and projector-on stereo rows. The current D455 nominal projector wavelength
  is intentionally not inferred and must be bound from exact official
  received-unit documentation before operation.

The seven rows are independent. Flood illumination cannot stand in for a dot
projector, active cannot rescue passive, and one vendor cannot rescue another.
I-045 cannot establish material depth benefit, target compatibility, camera
selection, distribution safety, or certification.

## Official-source safety boundary

Luxonis documents the OAK-D Pro W dot projector and flood LED as disabled by
default, the dot source as 940 nm, and the product as Class 1 under EN/IEC
60825-1. Its instructions prohibit operation when damaged, opening or
modification, magnifying optics, and unofficial firmware.

Orbbec documents Gemini 330-series devices as Class 1 under EN/IEC 60825-1 and
warns against damaged-device operation, opening, modification, direct beam
exposure, nonmatching firmware, and controls outside its instructions. The
Gemini 335L candidate screen binds an 850 nm emitter, but vendor claims about
sunlight performance are not VCG evidence.

RealSense documents D400 glare, sunlight washout/saturation, repetitive-pattern
false depth, reflection-angle effects, and multi-camera operation. Its current
multi-D400 guide says D4xx cameras generally have no significant overlapping-
FOV crosstalk; I-045 tests rather than adopts that claim. The D455 remains the
unfiltered D455, not D455f, and no filter may be silently added.

Class 1 classifications are vendor facts, not VCG permission to operate around
adults or children. Exact received-unit condition, firmware, enclosure,
projector/flood identity, intensity, temperature, state observation, distance,
duration, regulatory geography, legal review, operator stop, barriers, and
instruments must be frozen first.

## Participant-free bench phase

Every mode first completes four independent bench matrices with a calibrated,
non-human fixture and no person in any direct or specular beam path:

1. Six sunlight conditions at 1.5 m, 2.5 m, and 3.5 m: indoor control, diffuse
   window daylight, oblique sun patch outside the optical axis, backlit window,
   moving background sun patch, and bright-sky window reflection. Deliberately
   aiming a camera at the sun is forbidden.
2. Six surfaces at 0, 45, and 75 degree fixture incidence: matte control,
   powered-off glossy TV, clear window glass, household mirror, polished metal,
   and glossy floor fixture.
3. Six other-IR states at 1 m, 2 m, and 3 m and three orientations: none,
   second same-model active camera, cross-vendor 850 nm camera, cross-vendor
   940 nm camera, TV remote bursts, and a reviewed IR night-vision illuminator.
4. Six fixed compound scenes at the same three subject distances. The scenes
   are frozen before results and cannot be chosen from worst or best observed
   cases.

This yields 756 bench cells and 15,120 ordered runs at twenty valid runs per
cell. Every saturation, invalid depth, false depth, drop, corruption, emitter
state mismatch, thermal event, stop, retry, and invalid run remains visible.

Eight condition-transition checks run twenty cycles per mode: sunlight enter
and exit, matte-to-mirror and mirror-to-matte, no-interferer-to-active and
active-to-off, commanded/observed emitter disagreement, and invalid-depth burst
recovery. That is 1,120 transition cycles. Three independent one-hour bench
soaks per mode add twenty-one soaks.

## Human phase remains separately blocked

A mode may enter the human phase only after every one of its bench cells,
transitions, soaks, safety observers, and pre-result numeric gates pass. A
failed or stopped mode remains failed; another mode cannot authorize it.

The registered human matrix has both blocking personas, five placements, five
motions, six fixed compound scenes, and all seven modes: 2,100 cells and 42,000
ordered trials at twenty valid trials per cell. It also requires 126 separate
participant-absent negative sessions. Exact people, consent/assent, guardian,
room, privacy, exposure, medical/accessibility exclusions, operator, stop,
deletion, and independent ground truth remain absent.

## Measurements and fail-closed behavior

Evidence must independently measure emitter/flood commanded and observed
state, irradiance or vendor-approved proxy, ambient visible and IR conditions,
surface geometry, camera/fixture geometry, temperature, USB and wall power,
RGB/IR saturation, valid-depth fill, false/missing depth, temporal instability,
alignment, timestamps, pose/action outcomes, and healthy-return time.

Depth output cannot label its own correctness. A calibrated geometric fixture
and later independent participant/action ground truth are required. A frame,
mean score, HDR/filter workaround, lower emitter intensity, later recovery, or
another mode cannot erase a failure.

Any independent observer disagreement forces the emitter state to unknown and
stops the run. Damaged enclosure, unexpected temperature, barrier breach,
participant discomfort, unexpected person/animal entry, unreviewed reflection,
or loss of operator control stops the campaign fail-closed.

## Result and authority boundary

Every numeric image, depth, interference, recovery, power, thermal, and benefit
gate remains null and must be approved before operation. No post-result
threshold may qualify a mode. Raw RGB, depth, IR, point clouds, faces, voices,
names, exact ages, addresses, device serials, paths, credentials, and free text
are forbidden from release evidence.

The plan records zero devices, fixtures, people, bench runs, transitions,
soaks, human trials, negative sessions, results, qualified modes, safety
conclusions, selection, or purchase recommendation. Resolve
`OWNER_QUESTIONS_CROSS_DEVICE_IR_INTERFERENCE_2026-07-26.md` and every blocker
before the first device operation.

## Official sources

Accessed 2026-07-26:

- [Luxonis OAK-D Pro W hardware and IR safety](https://docs.luxonis.com/hardware/products/OAK-D%20Pro%20W)
- [Luxonis IR projector controls](https://docs.luxonis.com/software-v3/depthai/examples/misc/projectors/)
- [Orbbec Gemini 330 Series USB datasheet index](https://doc.orbbec.com/documentation/Orbbec%20Gemini%20330%20Series%20Documentation/Gemini%20330%20Series%20Datasheet%20%28Overall%29)
- [Orbbec Gemini 330 Series quickstart and safety](https://doc.orbbec.com/documentation/Orbbec%20Gemini%20330%20Series%20Documentation/Gemini%20330%20Series%20Quickstart%20Guide%20%28USB%29)
- [Orbbec SDK common controls](https://orbbec.github.io/docs/OrbbecSDKv2_API_User_Guide/source/3_Application_Guide/ApplicationGuide.html)
- [RealSense D400 optical filters and reflection behavior](https://dev.realsenseai.com/docs/optical-filters-for-intel-realsense-depth-cameras-d400/)
- [RealSense D400 repetitive-pattern mitigation](https://dev.realsenseai.com/download/18784/)
- [RealSense D400 multi-camera configurations](https://dev.realsenseai.com/docs/multiple-depth-cameras-configuration/)
- [RealSense D400 product datasheet](https://realsenseai.com/wp-content/uploads/2025/08/Intel-RealSense-D400-Series-Datasheet-August-2025.pdf)

Vendor guidance is a hazard and test-design input only, not a VCG result.
