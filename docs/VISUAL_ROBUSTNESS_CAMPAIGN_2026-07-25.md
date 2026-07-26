# Visual robustness campaign — 2026-07-25

Status: strict zero-result I-041 plan pre-registered; participant recruitment,
camera collection, fixture use, physical mutation and purchase remain blocked

Authority: D-002, D-003, D-031, D-032, D-043, D-044, D-077, D-102, D-103,
D-105, D-110, I-035, I-036, I-039, I-040, I-041, I-053, I-210 and Q-034

## Purpose

Existing plans qualify camera controls, lighting, lens behavior, frame-edge
accuracy and one-player actions, but they mention clothing and occlusion only
as limitations or incidental notes. An aggregate room score could therefore
hide a patterned-clothing, loose-garment, blanket, skin-tone or background-
clutter failure.

`benchmarks/visual-robustness/cross-tier-visual-robustness-plan-v1.json`
pre-registers those factors as independent blocking evidence. It contains no
selected participant, skin-tone assignment method, garment, blanket, clutter
fixture, room, camera, target, threshold, authority or result.

## Cohort and sampling boundary

The campaign keeps school-age-child-standing and adult-standing as separate
blocking personas. Each is crossed with five opaque skin-tone sampling strata.
Those IDs are analysis strata only. They grant no identity, ethnicity, health,
profile, authentication or calibration authority, and a tracker may not infer
or assign them.

The exact colorimetric or reviewed human-assignment protocol, stratum ranges,
minimum distinct participants and statistical analysis remain null. One person
cannot populate multiple strata, and results cannot exclude a participant or
stratum after outcomes are visible. Every persona/stratum result remains
separate; a better-performing stratum cannot rescue another.

## Appearance and clutter conditions

Twelve full-motion scenarios include:

- a solid, fitted, uncluttered control;
- fine and large high-contrast upper-body patterns;
- patterned upper- and lower-body clothing;
- loose sleeves, loose trouser legs and layered loose outerwear;
- static high-texture, household-boundary and moving-television clutter; and
- pattern/clutter and loose-garment/moving-display interactions.

Every exact item and fixture must be frozen before collection. Pattern contrast
and spatial frequency, garment fit and occluded regions, background occupancy
and edge density, and display motion must be measured. A control garment,
synthetic image, public dataset or different fixture cannot substitute for a
failed household condition.

## Trial matrix

The full-motion matrix crosses:

- two blocking personas;
- five opaque skin-tone strata;
- twelve motion scenarios;
- center plus four real-room zone-edge placements;
- neutral, jump, duck, dodge-left and dodge-right; and
- 20 valid trials per cell.

That produces 3,000 cells and 60,000 trials.

Blankets are deliberately separate from full motion. Three stationary blanket
conditions cross the same personas, strata and placements with only neutral
stationary and slow-arms-raised probes: 300 cells and 6,000 trials. Combined,
the plan contains 3,300 cells and 66,000 trials.

Each of the 15 appearance scenarios also runs one 15-minute center-placement
negative session per persona/stratum combination. That is 150 sessions and
2,250 minutes. Ordinary setup, rest, controller use and non-action movement are
included, and every emitted gameplay or privileged action remains visible.

## Blanket and garment safety

Blanket probes permit no jump, duck, dodge, rapid turn, face/head/neck/airway
covering, floor-dragging fabric, wrapping, tying, pinning or restraint. Any trip,
entanglement, heat or balance risk fails or stops the cell; successful tracking
and participant consent cannot waive a safety failure. The participant's stop
request ends the session immediately, and an independent physical stop plus
controller recovery must remain available.

Loose-garment full-motion cases require a separately approved safety protocol.
Until item dimensions, clearances, footwear/floor interaction and stop rules
are reviewed, no fixture use is authorized.

## Measurements and gates

Every cell retains measured lighting/exposure, appearance-fixture facts,
independently labeled core-17 detection/missing/error/jitter, dropout,
action outcomes, loss/reacquisition, recovery, exposure-to-game timing, invalid
attempts, stop/discomfort/safety events and exact disposition.

The fixed product gates remain:

- at least 95% trigger precision;
- at least 90% trigger recall;
- zero unintended privileged actions per negative session; and
- at most 120 ms p95 from exposure to the game API.

Detection, missing, landmark-error, jitter, dropout, reacquisition, worst-
stratum disparity and minimum-cohort gates remain null. They must be frozen
before collection. Candidate confidence cannot label ground truth, capture-
arrival timing cannot satisfy the exposure gate, and no aggregate may rescue a
failed or incomplete cell.

## Privacy and release boundary

Raw room video and frames are prohibited from the repository and release.
Temporary diagnostic images require a separate protocol and exact consent,
encrypted and role-bounded access, a retention clock, and verified deletion.

Released evidence prefers bounded skeleton, numeric and sufficiently aggregated
cell metrics. It excludes names, portraits, voices, exact ages, addresses,
stable identifiers and individual-level skin-tone, garment or appearance data.
Even opaque stratum aggregates require a frozen minimum cohort and
reidentification review. Network egress and free-text result evidence are
forbidden.

## Execution boundary

Before physical execution:

1. resolve `OWNER_QUESTIONS_VISUAL_ROBUSTNESS_2026-07-25.md`;
2. qualify and bind the camera, geometry, capture policy, lens calibration,
   target configurations, room and safe play zone;
3. freeze every garment, blanket and clutter fixture plus skin-tone sampling,
   cohort, safety, ground-truth, exposure and analysis protocol;
4. freeze all open gates before looking at results;
5. add and review a strict ready-plan/result transition—the current validator
   accepts only the blocked zero-result state; and
6. obtain explicit room, adult/child, camera, fixture, mutation, purchase,
   operator and schedule authority.

Validate the tracked plan with:

```powershell
node scripts/validate-visual-robustness-plan.mjs `
  benchmarks/visual-robustness/cross-tier-visual-robustness-plan-v1.json
node --test scripts/validate-visual-robustness-plan.test.mjs
```

Passing these commands proves only canonical plan structure, source freshness,
matrix arithmetic, safety/privacy invariants and a zero-result state. It proves
no person, demographic group, appearance condition, room, target, accuracy,
fairness, latency, safety or product outcome.
