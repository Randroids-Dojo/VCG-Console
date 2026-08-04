# Camera purchase derisk plan

Research snapshot: 2026-07-26

## Recommendation

Do not buy the Logitech BRIO or the 5MP ELP module as the first camera experiment. The lower-risk first qualification candidate is the ELP `ELP-USBGS1200P01` board using the AR0234 global-shutter sensor and a seller-confirmed low-distortion lens near the required field of view.

The board is advertised as Linux UVC, 1920x1200 or 1920x1080 at 90 FPS over MJPEG, fixed focus, 38 x 38 mm, with adjustable exposure and interchangeable M12 lens options around 68, 85, 101, 112, and 126 degrees. The current manufacturer marketplace listing for the H120 variant is about $75 to $80 before tax or import charges. Those are vendor claims and a quote, not qualification evidence.

This candidate cuts the camera experiment from about $153 to about $80, preserves the required 1080p60 capability, provides larger 3.0 micrometer pixels than the 5MP module's 2.2 micrometer pixels, and keeps the more useful global shutter. Its 2.3MP native resolution is sufficient for a 1920x1080 stream.

Do not assume H120 is the correct lens. The target room geometry should choose among H100, H110, and H120 before ordering. The exact delivered board, lens, USB identity, return terms, and total price must be confirmed in writing.

## What can be proved before purchase

### 1. Optical geometry screen

Run:

```sh
node scripts/camera-optics.mjs
```

This is invoked directly rather than through a root `package.json` script. The
root manifest is inside the production source tree that the launcher TV
conformance, launcher TV surface, launcher search TV, and OCRA platform
fallback evidence commit to by hash, and those artifacts were generated from a
recorded Windows x64 Chrome browser run. A research-only geometry helper must
not invalidate that provenance.

The default calculation assumes a lens center 1.5 ft above the floor, an 8 ft wide zone from 4 ft to 12 ft away, a 0.5 ft margin on each side, a 6.5 ft player, and 0.5 ft of headroom. Change those values once the room is measured:

```sh
node scripts/camera-optics.mjs --camera-height-ft 2 --near-ft 5 --far-ft 13 --zone-width-ft 8
```

The calculation eliminates lenses that cannot geometrically see the zone. It deliberately does not claim distortion, useful pose area, exposure, or latency results.

With the default conservative assumptions, the required envelope is approximately 97 degrees horizontal and 75 degrees vertical. A 90-degree-diagonal BRIO fails that geometry. H100 preserves the most pixel density but may miss the nearest tall player's head or feet. H110 is near the boundary. H120 provides margin but spends more pixels on the room. The planned minimum player distance is therefore the highest-value measurement before selecting the lens.

### 2. No-purchase framing rehearsal

Before opening a specialty camera, place any phone with an ultra-wide camera at the planned lens center and record a short 1080p60 clip while a consenting adult marks the near and far corners, stands at each corner, jumps, ducks, and extends both arms. This does not qualify UVC, global shutter, latency, or Pi behavior. It can reject a bad lens-center location or field-of-view class without purchasing a module.

The clip should remain local and should be deleted after the derived skeletal and coverage observations are retained. Do not use a child for this preflight.

### 3. Seller evidence request

Obtain all of the following for the exact offered unit before paying:

- exact board model and revision;
- exact installed lens code, and whether the quoted angle is horizontal, vertical, or diagonal;
- a full-resolution unedited 1920x1080 frame from that lens;
- a five-second original 1920x1080 60 FPS or faster clip with a fast-moving person near the center and both edges;
- Linux output from `v4l2-ctl --all` and `v4l2-ctl --list-formats-ext`;
- USB vendor ID, product ID, and product string from `lsusb`;
- confirmation that 1920x1080 at 60 FPS works continuously in MJPEG, plus any YUYV limits;
- exposure-control ranges and whether automatic exposure can be disabled;
- whether capture timestamps represent exposure, USB arrival, or host dequeue time;
- cable connector type at the board and replacement-cable availability;
- exact single-unit delivered price, warranty, return window, return shipping, and restocking fee.

No answer, a substituted model, or screenshots instead of original files is a purchase rejection.

Copy-ready request:

> I am qualifying one camera for a Linux Raspberry Pi motion-tracking prototype. Please quote quantity one of the ELP-USBGS1200P01 board with the exact H100, H110, and H120 lens options separately, including delivery to the United States. For each option, confirm the board revision, installed lens code, whether its field-of-view number is horizontal, vertical, or diagonal, USB VID/PID and product string, and return terms. Please attach the original output from `v4l2-ctl --all` and `v4l2-ctl --list-formats-ext`, plus an unedited five-second 1920x1080 60 FPS or faster file showing a fast-moving person at the center and both edges. Confirm whether that mode is MJPEG or YUYV, whether automatic exposure can be disabled, and which timestamp the driver supplies. I will not accept a substituted board or lens.

## Staged purchase boundary

1. Complete the room geometry and phone framing rehearsal.
2. Request the exact evidence above from ELP.
3. Prefer the AR0234 H100, H110, or H120 unit that matches the measured geometry, not the widest label by default.
4. Buy one unit only, from a seller with a written return window. Keep all packaging and do not cut or glue the board, cable, or lens assembly.
5. Use a reversible camera jig and external cardboard shutter during qualification. The final optical shutter and indicator remain separate enclosure work.
6. Start the acceptance run on the delivery day and return immediately on a hard failure.

## Return-window acceptance run

### First hour

- photograph labels and packaging;
- record exact delivered cost and seller;
- capture `lsusb`, `udevadm info`, and complete V4L2 formats and controls;
- verify that the advertised lens and board arrived;
- verify 1920x1080 at 60 FPS is selectable;
- run ten minutes of capture and record actual frames, drops, disconnects, CPU, and memory;
- test manual exposure, fixed white balance, unplug/replug, and application restart.

### First day

- run the optical-zone matrix at the intended lens center and several reversible pitch angles;
- test daylight, ordinary evening lighting, and backlighting;
- score adult head, wrists, ankles, feet, floor contact, jump, duck, and lateral dodge at the near, center, far, and edge positions;
- compare 1080p60 capture with downscaled inference against 720p60;
- record MJPEG decode cost and capture-arrival jitter on owned x86 hardware.

### First available Pi session

- repeat sustained capture on Pi 5 while the launcher and representative game run;
- record camera-to-action p50, p95, and p99 using trustworthy timestamp evidence;
- record dropped frames, CPU, GPU, NPU, memory, temperature, clocks, and reconnect recovery;
- fail the candidate if the complete system cannot meet the 120 ms p95 action gate.

## Hard return criteria

Return the camera if any of these occur within the seller window:

- delivered board or lens differs from the written model;
- no stable Linux UVC 1920x1080 60 FPS mode;
- 60 FPS is duplicated or materially below the claimed cadence;
- automatic exposure cannot be bounded enough to preserve motion;
- hands, feet, or head repeatedly leave the frame in the qualified zone;
- edge distortion or blur breaks action accuracy;
- MJPEG decode or buffering makes the latency gate implausible;
- hot-plug recovery requires a reboot;
- physical dimensions, connector, or heat prevent reversible enclosure fit.

## Remaining financial exposure

This plan can reduce the initial camera spend to roughly $80 plus tax or import costs and can reject bad geometry before purchase. It cannot remove the need to test one real UVC camera. The largest remaining risk is seller and revision variance, so written exact-model evidence and a usable return policy are more valuable than a nominally lower listing price.

Do not buy multiple lens or camera variants simultaneously. If one AR0234 board accepts ordinary M12 lenses, qualify the board first and change only the lens through a documented reversible experiment.
