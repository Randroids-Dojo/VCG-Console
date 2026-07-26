# OAK-D Pro W RGB/depth comparison campaign — 2026-07-25

Status: official-source candidate screen and strict zero-result I-042 plan
pre-registered; no purchase, device, collection or emitter authority exists

Authority: D-002, D-003, D-031, D-043, D-044, D-090, D-091, D-104, D-105,
D-110, I-035, I-036, I-039, I-040, I-041, I-042, I-045, I-053, I-054, I-065,
I-210, Q-018 and Q-025

## Candidate, not selection

`OAK_D_PRO_W_CANDIDATE_SCREEN_2026-07-25.md` records the current official
Luxonis category facts for USB OAK-D Pro W with IMX378 central RGB, SKU
`A00573`. The official store showed US $529 and In Stock on 2026-07-25. No
shipping, tax, destination, power, mount or integration cost is known, and the
observation authorizes neither purchase nor BOM mutation.

No camera was ordered, received, powered or inspected. Vendor field-of-view,
range, accuracy, power and Class 1 laser statements are not measured VCG room,
participant, safety or target evidence.

## Attribution lanes

The comparison keeps five lanes separate:

1. qualified shared UVC RGB through host MediaPipe;
2. OAK central RGB through the same host MediaPipe pipeline, isolating the
   camera change;
3. OAK central RGB plus passive stereo and a pinned depth-fusion candidate;
4. OAK central RGB plus dot-projector active stereo and the same candidate; and
5. OAK monochrome IR plus flood/active stereo as a low-light exploratory lane.

On-device neural inference is prohibited in blocking lanes because changing
camera, depth and pose model together would confound attribution. OAK RGB-only
improvement cannot be credited to depth. Passive, active-dot and flood-assisted
results remain separate, and the exploratory mono-IR lane cannot rescue a
blocking failure.

## Same-session versus same-exposure truth

Every lane runs in the same participant, room, placement, lighting and action
session using a balanced randomized order, fixed warmup and drift checks.
That controls session context but does not make sequential UVC and OAK captures
the same exposure.

Internal OAK RGB/passive/active ablations must use one volatile exposure fan-
out where technically valid. Cross-camera UVC/OAK comparison requires an
independent exposure/synchronization protocol and reports actual skew; it never
claims exact-exposure equivalence from sequential movement. The maximum
permitted skew remains null.

## One-player matrix

The plan crosses five lanes, ordinary x86 Linux/SteamOS/Pi targets, both
blocking personas, five room placements, six I-040 lighting conditions, five
neutral/jump/duck/dodge motions and 20 valid trials. That is 4,500 cells and
90,000 trials.

Every lane/target/persona/placement/lighting/motion cell passes independently.
An average, easier lighting condition, target, adult result or RGB-only camera
improvement cannot rescue a depth failure.

## Conditional two-player overlap matrix

A complete claim that depth improves overlap also requires I-054's one-player-
first gates. Only afterward, the five lanes and three targets cross adult/adult,
adult/child and child/child pairs; five side-by-side/crossing/partial/full-
occlusion scenarios; three overlap placements; and 20 trials. That is 675 cells
and 13,500 trials.

Identity, action ownership and recovery use independent ground truth. Until the
one-player and I-054 gates pass, no overlap session is authorized and no depth
selection may claim overlap benefit.

## Measurements and selection rule

The campaign separately records:

- RGB, valid-depth and qualified-action overlap coverage;
- per-landmark pose and floor/contact/event error;
- two-player detection, identity switches, action ownership and recovery;
- passive/active/flood-assisted low-light behavior;
- exposure, cross-camera and RGB/depth synchronization;
- complete exposure-to-game latency and frame/drop accounting;
- wall, device and USB voltage/current/power plus brownouts;
- device/host temperature, throttling, CPU/GPU/VPU/memory/USB load;
- boot, reconnect, idle/suspend and fault recovery;
- fresh delivered hardware/mount/power/cable/integration cost; and
- pinned SDK/firmware/model packaging, update and maintenance surface.

The fixed action gates remain 95% precision, 90% recall, zero unintended
privileged actions and 120 ms exposure-to-game p95. Depth coverage/error,
floor/contact, identity-switch, synchronization, latency-overhead, power,
temperature, cost and minimum-material-benefit gates remain null.

Depth may be selected only when a predeclared benefit clears its frozen gate
without regressing another blocking accuracy, latency, reliability, safety,
privacy, maintenance or cost gate. Vendor figures and candidate depth cannot
label their own ground truth.

## IR, privacy and execution boundary

Emitters default off. No damaged, opened, modified or unofficially flashed
device may operate them; magnifying optics are prohibited. Exact intensity,
distance, duration, temperature, reflection, participant and state-observation
protocols remain required. I-045 separately governs sunlight, reflective
surfaces and other IR devices. Accuracy cannot rescue an IR or power failure.

Raw RGB, depth and IR frames are prohibited from the repository and release.
Volatile same-exposure fan-out and temporary diagnostic images each require a
separate consent/data/deletion protocol. Release evidence contains no names,
portraits, voices, addresses, stable participant IDs or device serial numbers.

Before execution:

1. resolve `OWNER_QUESTIONS_OAK_D_PRO_W_COMPARISON_2026-07-25.md`;
2. obtain a received exact-device identity and fresh destination-aware quote
   without treating either as selection;
3. qualify and bind the shared RGB camera, room, geometry, capture, lens,
   visual-robustness and target prerequisites;
4. pin DepthAI/firmware/pipelines, depth fusion, mount, power, USB,
   synchronization, ground-truth, data and IR-safety protocols;
5. freeze every open numeric gate and add a reviewed ready/result transition;
6. finish one-player gates before any two-player overlap execution; and
7. obtain explicit room, participant, camera, firmware, emitter, diagnostic,
   purchase, operator and schedule authority.

Validate the tracked plan with:

```powershell
node scripts/validate-oak-d-pro-w-comparison-plan.mjs `
  benchmarks/depth-comparison/oak-d-pro-w-rgb-depth-comparison-plan-v1.json
node --test scripts/validate-oak-d-pro-w-comparison-plan.test.mjs
```

Passing these commands proves only source freshness, canonical plan structure,
matrix arithmetic and zero-result/safety/privacy boundaries. It proves no OAK
device, depth, accuracy, overlap, low-light, latency, power, cost, participant,
room, target, safety or product result.
