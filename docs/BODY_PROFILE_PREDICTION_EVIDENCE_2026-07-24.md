# Camera-free body-profile prediction evidence

Status: research contract exercised; product matching remains disabled

Evidence date: 2026-07-24

Scope: I-072 and I-184

## Outcome

A strict research-only contract now exercises automatic body-profile
prediction without a camera, person, portrait, face feature, persistent vault,
or product integration. It establishes an executable boundary for conservative
abstention and mandatory deliberate confirmation; it does not establish that
body-profile matching is accurate, appropriate, lawful, private, accessible,
or ready to ship.

The tracked evidence is:

- `benchmarks/body-profile-prediction/camera-free-abstention-confirmation-v1.json`
- `scripts/generate-body-profile-prediction-evidence.mjs`
- `scripts/validate-body-profile-prediction-evidence.mjs`
- `scripts/validate-body-profile-prediction-evidence.test.mjs`

The artifact is regenerated from the implementation and hash-binds the
implementation, focused contract test, generator, and validator. The
validator accepts at most 128 KiB of strict UTF-8 JSON and requires an exact
deterministic result.

## Executable boundary

`packages/motion-contract/src/body-profile-prediction.ts` defines four closed
Draft 2020-12 contracts:

1. a versioned reference template;
2. a one-attempt probe;
3. a coarse advisory prediction; and
4. an advisory confirmed selection.

The template and probe accept exactly six synthetic body-ratio fields:

| Field | Intended research meaning |
|---|---|
| `shoulderWidthOverTorso` | Shoulder width normalized by torso scale |
| `hipWidthOverTorso` | Hip width normalized by torso scale |
| `upperArmOverTorso` | Upper-arm length normalized by torso scale |
| `forearmOverTorso` | Forearm length normalized by torso scale |
| `thighOverTorso` | Thigh length normalized by torso scale |
| `shinOverTorso` | Shin length normalized by torso scale |

This inventory is a software fixture, not an approved feature extractor or
model. There is no code here that derives these values from landmarks or
camera frames.

Every vector binds exact feature/extractor IDs and a bounded synthetic sample
count. Every template additionally binds an opaque profile ID, template and
calibration revisions, exact calibration-context digest, and active,
opted-out, or invalidated state. Only active templates with the probe's exact
calibration context can be compared.

## Prediction and abstention

The frozen research scorer uses standardized root-mean-square distance across
the six fields. It emits only one of:

- `predicted`, with one coarse `candidate-high` label;
- `ambiguous`;
- `no-match`; or
- `unavailable`.

It does not expose a vector, distance, rank list, or exact score in its
prediction output.

The controller fails closed when:

- matching is disabled;
- tracker health is not Ready;
- exactly one player is not visible;
- no active template exists;
- the calibration context changed;
- the nearest authored fixture exceeds the frozen distance ceiling; or
- two authored fixtures are insufficiently separated.

Opted-out and invalidated templates are never candidates. A vault-loss or
factory-reset model with no templates produces `no-match`; the only positive
post-loss fixture uses a newly supplied profile record. This is not proof of a
real destructive transaction or forensic erasure.

## Mandatory confirmation and correction

Prediction never grants profile, calibration, save, launch, mutation, or
security authority. The returned object always states that explicit
confirmation is required.

The controller accepts only the exact prediction object it issued, once, by
the same controller and before its 20-second expiry. Clones, cross-controller
objects, early timestamps, expiry, and replay fail before producing a
selection.

The deliberate routes are:

| Route | Result |
|---|---|
| Accept prediction | Advisory selection of the separated candidate |
| Select another active profile | Advisory correction |
| New Player | No persisted profile selected |
| Opt out | No profile selected; requested matching preference becomes disabled |

Even after one of these routes, a privileged profile service must separately
authorize any profile read or mutation.

## Portrait and face separation

The strict vector has no portrait, image, face, appearance, name, email, or
identity field. Both probe and template parsing reject authored canaries for:

- `portraitPixels`;
- `portraitHandle`;
- `faceEmbedding`;
- `noseCoordinate`;
- `displayName`; and
- `email`.

The prediction output also fixes `portraitInputUsed` and `facialInputUsed` to
false. The evidence artifact records zero real images and zero facial or
appearance features.

This proves only the closed TypeScript contract rejects those authored fields.
It is not a whole-program dependency/data-flow proof, memory inspection, model
inspection, native broker result, or I-186 negative-leak qualification.

## Exact synthetic result

The deterministic artifact contains:

- 10 prediction scenarios;
- 2 separated synthetic predictions;
- 1 ambiguity abstention;
- 3 no-match results;
- 4 unavailable results;
- 4 explicit confirmation/correction outcomes;
- 9 passing adversarial guard checks;
- 0 participants;
- 0 real images; and
- no measured false-accept or false-reject rate.

Ten validator mutation tests reject fabricated authority, removal of
confirmation/correction, portrait/face/score use, product or persistence
claims, fabricated participant/error-rate evidence, ambiguity promotion,
inactive-template promotion, removed canaries/checks, factory-reset claims,
stale provenance, and undeclared identity qualification.

## Persistence and lifecycle boundary

This tranche defines a closed record shape and inactive-template semantics. It
does not implement:

- encryption, console-bound keys, or a protected-state commit;
- a persistent registry, broker, or vault;
- template enrollment or feature extraction;
- schema migration from any deployed version;
- crash-recoverable invalidation, opt-out, deletion, or factory reset;
- backup/export/recovery/support exclusion;
- probe/template memory clearing or crash/swap behavior; or
- native authorization and isolation.

`PROFILE_VAULT_QUALIFICATION.md`, `DEVICE_ONLY_DATA_EXCLUSION.md`,
`PROFILE_MANAGEMENT.md`, and the body-matching threat model remain the
authoritative planned boundaries for those systems.

## Qualification still required

Before body-profile matching can enter any household or family build:

1. resolve Q-240 and freeze the product purpose, feature/model design,
   jurisdictions, cohorts, UI, and gates;
2. complete qualified legal and privacy review of the frozen design;
3. implement the feature extractor, broker, encrypted vault, protected state,
   deletion/reset, and exclusion boundaries;
4. pre-register and run consented, independently reviewed household,
   accessibility, child, similar-body, clothing, room-change, and
   change-over-time trials;
5. publish false-accept, false-reject, abstention, and correction distributions
   without hiding cohort failures in an aggregate;
6. complete inversion, membership, linkability, rollback, interruption,
   malformed-input, memory, and forensic abuse tests;
7. validate notice, opt-out, New Player, explicit selection, and false-match
   correction with people using the shared TV; and
8. pass I-186 and I-187 on both exact target assemblies.

Until every gate passes, the safe product path is explicit profile selection
and transient calibration with automatic matching disabled.
