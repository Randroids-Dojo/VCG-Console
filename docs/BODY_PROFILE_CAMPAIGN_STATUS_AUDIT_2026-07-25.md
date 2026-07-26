# Body-profile calibration and prediction status audit

Date: 2026-07-25

Status: I-067 status reconciliation; product matching remains disabled

## Outcome

I-067 remained marked `open`, but its work has been deliberately decomposed
into active, committed investigation slices:

- I-072: camera-free body-profile prediction, abstention and mandatory
  confirmation/correction contract;
- I-184: automatic-matching privacy threat model and no-ship gate;
- I-186: device-only identity exclusion from recovery/support material;
- I-187: console-bound encrypted profile-vault design and target qualification;
- I-188: credential-free profile-management and protected registry semantics;
  and
- I-191: local-only save/unassigned-progress separation and permanent-loss
  behavior.

The accurate umbrella status is `active`, not complete. No change in this audit
enables automatic prediction, persistent body features or a household beta.

## Calibration evidence

The camera-free calibration rehearsal binds one exact issued attempt and frozen
plan, posture/range guidance, explicit blocking of unsafe floor/zone conditions,
bounded optional fallbacks, stale-attempt and cross-controller rejection,
revocation, repeatability and visible outcomes. It does not claim a camera,
person, room, physical safety, gameplay, persistence or production thresholds.

`apps/console-lab/src/launcher/calibration-rehearsal.ts` provides the desk-only
state boundary. Its evidence validator rejects camera/participant fabrication,
weakened safety guidance, widened fallbacks, stale or substituted authority,
invented room/gameplay/persistence results and stale provenance.

## Prediction and confirmation evidence

`packages/motion-contract/src/body-profile-prediction.ts` defines a strict
research-only contract over six synthetic body-ratio fields with exact feature,
extractor and calibration-context binding. Templates are active, opted out or
invalidated. Conservative distance/separation gates may predict a coarse local
profile or abstain as ambiguous/no-match/unavailable.

Every prediction carries zero profile, calibration, save or launch authority.
A distinct exact one-shot 20-second confirmation provides Accept, correction,
New Player and opt-out routes. Portraits, faces, names, raw scores and feature
vectors are outside the evidence format.

The checked-in camera-free artifact contains ten scenarios: two predictions,
one ambiguity, three no-match, four unavailable and four deliberate outcomes,
with nine guard checks and no people/images. It is behavioral software evidence,
not an accuracy or false-match estimate.

## Profile and persistence boundary

The console-lab profile manager rehearses create, rename, portrait/calibration
replacement and invalidation, reset and deletion using exact controller-issued
plans. Same-name profiles are not silently reassociated. Preserved progress
requires an exact sanitizer qualification; otherwise destructive scope remains
explicit.

The native profile registry separately protects an opaque v2 membership chain,
but it does not contain body features or an encrypted vault. I-187's selected
vault design still lacks an implementation, platform protector and complete
Pi/Steam qualification. Profile-vault failure must discard affected device-only
data and offer deliberate recreation; it cannot fall back to plaintext, backup,
cloud matching or save-derived reassociation.

## Current verification

The correctly scoped focused runs pass:

- 16 motion-contract body-profile unit tests;
- 30 console-lab calibration/profile-management unit tests; and
- 20 calibration and prediction evidence-validator tests.

The first audit command accidentally invoked three Vitest files through Node's
test runner; those runner-initialization errors were not code failures. The same
files passed under their owning workspace Vitest configurations, while the Node
evidence suites passed separately.

## Remaining boundary

I-067 remains active. Missing work includes the owner decision in Q-240,
consent/legal/jurisdiction review, an approved feature extractor and prediction
model, encrypted broker/vault/protected-state implementation, migrations,
crash-safe invalidation/deletion/reset, memory/swap/core exclusion, exact target
adapters and full consented standing/seated/child/adult/limited-range/assisted/
similar-body/clothing/time-separated/room-change tests.

No prediction/ambiguity/false-accept/false-reject/repeat-session threshold,
competitive normalization policy, persistence qualification or product result
exists. Existing dedicated owner-question documents remain authoritative:
`OWNER_QUESTIONS_BODY_PROFILE_PREDICTION_2026-07-24.md`,
`OWNER_QUESTIONS_BODY_PROFILE_MATCHING_2026-07-24.md`,
`OWNER_QUESTIONS_PROFILE_MANAGEMENT_2026-07-24.md`, and
`OWNER_QUESTIONS_PROFILE_VAULT_2026-07-24.md`.
