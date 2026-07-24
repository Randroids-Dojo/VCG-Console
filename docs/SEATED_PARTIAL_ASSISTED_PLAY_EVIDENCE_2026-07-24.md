# Seated, partial-body, and assisted play evidence

Status: I-068 advanced from open to active; camera-free contract evidence
implemented, human and target qualification not started.

Last updated: 2026-07-24

Authority: D-002, D-031, D-032, D-065, D-077, D-103, D-105, D-110,
I-063, I-068, I-069, Q-031, Q-032, Q-034, Q-039, Q-160, and Q-238.

## Outcome

The repository now has one strict, deterministic capability exercise for
seated, partial-body, and visible-helper conditions. It separates three facts
that must not be collapsed:

1. whether the current player-availability contract sees the landmarks needed
   by a control group;
2. whether an unresolved posture or helper-identity condition blocks that
   body path; and
3. whether the already-existing standard controller path is explicitly
   available as the alternate.

The exercise makes 42 control assessments across seven scenarios. It reports
17 synthetic motion paths, 13 controller-alternate-only paths, and 12
unsupported paths. Eighteen apparently observable paths are deliberately
blocked by the posture/assistance safety gate.

These labels are software dispositions, not support claims. The artifact says
`qualification: "not-product-qualification"` and its schema grants no action,
remapping, score-normalization, or product-qualification authority.

## Frozen scenario matrix

| Scenario | Availability before safety gate | Synthetic motion path | Controller alternate only | Unsupported | Safety blocked |
|---|---:|---:|---:|---:|---:|
| Full standing, independent, controller present | 6 | 6 | 0 | 0 | 0 |
| Full seated, independent, controller present | 6 | 3 | 3 | 0 | 3 |
| Seated upper body only, controller present | 4 | 3 | 3 | 0 | 3 |
| Standing with knees/ankles missing, controller present | 5 | 5 | 1 | 0 | 0 |
| Standing left side missing, no controller | 0 | 0 | 0 | 6 | 0 |
| Seated helper overlap, controller present | 6 | 0 | 6 | 0 | 6 |
| Seated helper overlap, no controller | 6 | 0 | 0 | 6 | 6 |

The six control groups are Select/Join, Back/Pause, Swipe, Dodge, Duck, and
Jump. The matrix preserves I-063's action-specific landmark behavior: for
example, missing knees and ankles blocks Jump without suppressing hip-only
Dodge or unrelated upper-body controls. It never synthesizes a missing joint.

## Fail-closed posture and assistance rules

The camera-free exercise applies these conservative research rules:

- seated Select/Join, Back/Pause, and Swipe may remain visible as synthetic
  motion paths when their exact upper-body landmarks are observed;
- seated Dodge, Duck, and Jump body paths remain blocked even when all
  landmarks are observed, because comfortable geometry, calibration,
  false-event rate, and game semantics have not been qualified;
- any visible helper in the play space blocks every body path because the
  current authored skeleton cannot prove which person's movement supplied a
  landmark or action;
- a safety-blocked body path can never be labeled as a synthetic motion path;
  and
- without an explicit controller alternate, an unavailable path is reported
  as unsupported.

This is a pre-registered conservative boundary, not a production
multi-person/helper detector. I-069 and identity-tracking work must eventually
provide the real control-transfer and overlap evidence.

## Explicit alternate mapping boundary

`canonical-controller-v1` is the only alternate in the artifact:

| Motion control group | Existing controller route |
|---|---|
| Select / Join | Canonical controller Confirm |
| Back / Pause | Reserved controller Back/Pause |
| Swipe | Canonical directional navigation |
| Dodge | Title-declared controller Dodge binding |
| Duck | Title-declared controller Duck binding |
| Jump | Title-declared controller Jump binding |

This does not create a new remap. It points only to an existing controller
route and says nothing about whether a controller is present, deliberately
assigned, reachable, or usable by a participant. Home, Back, and Pause remain
reserved and non-remappable. No hand raise, lean, blink, helper movement, or
other body gesture is silently substituted for a missing action. Q-238 must be
resolved before a candidate body alternative can enter a consented comparison.

## Reproducible artifacts

- implementation:
  `packages/motion-contract/src/play-support-matrix.ts`;
- generated evidence:
  `benchmarks/play-support/seated-partial-assisted-synthetic-matrix-v1.json`;
- generated schema: `schemas/play-support-matrix.schema.json`;
- generator: `scripts/generate-play-support-matrix.mjs`;
- strict validator: `scripts/validate-play-support-matrix.mjs`; and
- adversarial validator tests:
  `scripts/validate-play-support-matrix.test.mjs`.

The artifact binds SHA-256 digests of the implementation, generator, and
validator. Validation recomputes the complete matrix and rejects scenario
substitution/reordering, implicit alternates, safety-gate bypass, landmark
extrapolation, score normalization, new remap authority, reserved-input
remapping, stale provenance, and undeclared fields.

Reproduce with:

```text
pnpm tsx scripts/generate-play-support-matrix.mjs
pnpm tsx scripts/validate-play-support-matrix.mjs
pnpm tsx --test scripts/validate-play-support-matrix.test.mjs
pnpm validate:schemas
```

## What this evidence does not establish

No camera, tracker backend, target Linux device, room, game, or participant
was used. Authored hidden-landmark flags cannot estimate provider accuracy,
comfort, fatigue, pain, balance, reach, helper overlap, identity transfer,
false actions, latency, controller accessibility, or gameplay outcomes.

The seven scenarios are boundary cases, not a representative population.
They do not authorize the console to advertise seated, partial-body,
accessible-motion, or assisted-play support. They also do not alter
calibration, action thresholds, scoring, competitive normalization, profile
matching, or title permissions.

## Required next evidence

I-068 remains active until, at minimum:

1. Q-238 selects the candidate action set, alternate mappings, participant
   scale, and pass/fail gates;
2. an accessibility/safety review approves participant-authored comfortable
   movement prompts and stop rules;
3. consented sessions report seated, partial-body, limited-range, one-handed,
   assistive-device, helper-present, controller-only, and mobility-changing
   cases separately rather than pooling them;
4. the exact selected camera/backend and both target tiers measure
   availability, false action, missed action, cancellation, rearm, full
   exposure-to-game latency, comfort/fatigue, and recovery;
5. deliberate controller assignment and controller-only completion are tested
   without treating them as proof of body-play support;
6. visible helper, spectator, crossing, takeover, and identity ambiguity are
   tested jointly with I-069; and
7. every supported, alternate-only, and unsupported result is communicated
   clearly at TV distance without pressure to attempt an unsafe movement.
