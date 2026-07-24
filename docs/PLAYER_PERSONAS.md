# Player personas and evidence matrix

Last updated: 2026-07-24

This document closes the definition work in I-008. It turns D-105 into a
repeatable participant and evidence contract; it does not claim that any
persona has passed. The first complete body-play proof has two blocking persona
classes: a school-age child standing and an adult standing. Seated and
limited-range sessions are deliberately exploratory until their own mechanics,
calibration, safety, and accuracy gates are qualified.

The ranges below are engineering coverage targets, not medical norms,
eligibility rules, or statements that people outside them are unsupported.
Never reject or relabel a participant because their measurements fall outside a
band. Record the actual configuration, mark it out of the pre-registered band,
and report the evidence without generalizing it.

## Blocking matrix

| Persona ID | Motion benchmark class | Coverage target | Blocking interaction evidence | Comprehension and controller evidence | Privacy and consent |
|---|---|---|---|---|---|
| `child-standing` | `school-age-child-standing` | School-age participant, primarily standing; design-height band 105–170 cm. Record actual height, comfortable reach, neutral stance, and usable squat/jump/side-step range. | Full body and floor visible at center and every qualified zone edge; join, calibration, dodge left/right, duck, jump, shell focus/select/Back, game Pause, loss/recovery, controller-only escape, and safe stop. | Use short concrete instructions, demonstrate once without scoring, ask the participant to show or explain the next action, and record misunderstood wording. Record controller familiarity as none, occasional, or frequent; do not coach through a scored attempt beyond the pre-registered prompt. | Obtain informed household-adult consent and the child's affirmative assent for the exact session. Raw video is off and unrecorded by default. Use a participant code in traces/results; do not publish name, birth date, portrait, exact address, or a linkable room description. |
| `adult-standing` | `adult-standing` | Adult participant, primarily standing; design-height band 150–200 cm. Record the same reach, stance, and usable-range facts as the child session. | The identical blocking script and placements used for `child-standing`; no easier thresholds, hidden retries, or discarded failures. | Use the same plain instruction set and teach-back check. Record controller familiarity with the same three values so familiarity is visible rather than guessed from age. | Obtain informed consent for the exact session. Apply the same no-raw-video default, participant code, minimization, and publication exclusions as the child session. |

One person in each blocking class is the minimum first-proof participant count
already defined by the prototype criteria, not population qualification. The
result is scoped to those participants, exact room, camera, placement,
software/model hashes, action thresholds, and workload. Later claims need
additional pre-registered participants and coverage, not post-hoc averaging of
the first two.

The child band intentionally spans a broad school-age engineering envelope.
CDC stature-for-age material covers ages 2–20 and publishes sex-specific
percentile data; it is a reference for why one nominal “child height” is not
representative, not a clinical screen for this project. The adult band is
likewise a fixture/camera coverage target rather than an anthropometric promise.

## Exploratory accessibility matrix

Exploratory sessions never count as a blocking-persona pass and never justify
“seated support,” “accessible motion controls,” or a similar product claim.
They identify concrete failures and candidate alternatives for I-068.

| Persona ID | Setup to record | Attempted evidence | Required interpretation |
|---|---|---|---|
| `seated-exploratory` | Seat type, seat height, wheels/arms, transfer needs if voluntarily disclosed, camera framing, feet visibility, reachable floor area, torso rotation, and comfortable one-/two-hand range. Do not record a diagnosis. | Candidate/join, calibration, shell focus/select/Back, Pause, controller recovery, and only motion actions the participant says are comfortable. Use no standing, jumping, deep squat, or forced floor-contact prompt. | Report every unavailable or substituted action. A controller-only completion is recovery evidence, not proof of seated body play. Use benchmark class `exploratory-other` and identify this persona in the consented run record. |
| `limited-range-exploratory` | Participant-described comfortable movement envelope, affected side only if they choose to state it, one-/two-hand availability, safe stance or seat, assistive device interaction, and camera visibility. Do not infer cause or permanence. | Test candidate one-handed select/Back alternatives, reduced-amplitude calibration, clear cancellation, and controller recovery before optional game actions. Stop at pain, fatigue, instability, or participant request. | Record the exact adaptation and threshold; do not merge it into blocking precision/recall. One successful adaptation is a candidate, not a universal accessibility mapping. Use benchmark class `exploratory-other`. |

An exploratory participant may also satisfy a blocking class only by completing
the unchanged blocking script safely and voluntarily. Never use that possibility
to pressure a participant into an action outside their comfortable range.

## Required session fields

Record these fields before scored attempts begin. Freeze thresholds and prompts
with the run plan; do not tune them after seeing results.

| Group | Required fields |
|---|---|
| Participant | Opaque participant code; persona ID; benchmark persona class; age band (`school-age` or `adult`, never exact birth date in the result bundle); height in centimetres; standing/seated setup; controller familiarity; glasses or ordinary clothing only when relevant and voluntarily recorded. |
| Comfortable movement | Neutral stance/seat; left/right reach; two-hand availability; comfortable duck/squat, step, and jump capability; requested excluded actions; rest/stop signal. Do not collect a diagnosis. |
| Comprehension | Instruction version; language used; demonstration given; teach-back passed/repeated/reworded; misunderstood term or icon; independent controller escape demonstrated before motion scoring. |
| Consent/privacy | Adult consent; child assent where applicable; raw-recording state; intended retained artifacts; retention/deletion point; participant stop request; confirmation that no name, portrait, voice, exact birth date, or raw image entered the evidence bundle. |
| Environment | Configuration, placement, room/zone sheet, lighting, clothing notes relevant to tracking, camera/model/software hashes, timestamp quality, concurrent workload, and any observer/spectator condition. |
| Outcome | Every attempt, invalid attempt, retry, false action, recovery, stop, discomfort report, and deviation. Keep persona results separate; never rescue one failed persona with an aggregate average. |

## Instruction and comprehension contract

The baseline instruction set must:

1. state the action in ordinary language and show the expected movement once;
2. explain the visible hold/progress/cancel state before a scored hold;
3. show controller Back/Home and the physical stop path before camera-led play;
4. tell the participant they can stop or skip any movement without penalty;
5. use the same pre-registered prompt for every scored repetition;
6. ask for teach-back before scoring, without requiring reading ability; and
7. record a wording failure as a product failure rather than silently coaching
   until the attempt succeeds.

The child and adult receive the same action meaning and success threshold.
Presentation may use age-appropriate plain wording, but the exact variant must
be versioned and results must not be pooled across variants without showing the
split.

## Privacy boundary

The blocking matrix minimizes evidence because skeletal traces and body
measurements remain sensitive even without photographs.

- Raw camera frames are processed locally and are neither displayed nor retained
  by default.
- The scored bundle contains an opaque participant code, persona class, required
  measurement/configuration facts, skeleton-only trace digest, and results.
- Consent records stay separate from the technical result bundle.
- No portrait, face embedding, voice sample, name, contact information, exact
  birth date, or exact address belongs in a motion benchmark.
- Clothing, mobility, or body-range notes are optional, purpose-limited, and
  written only at the granularity needed to explain a test result.
- A participant may stop collection immediately. The session record preserves
  only the minimum audit fact that the run stopped; it does not speculate why.

This is a product evidence protocol, not a determination of child-privacy law.
Networked family beta, automatic body-profile matching, portraits, and legal
review remain separate gates under I-140 and I-184 through I-187.

## Claim rules

- A blocking pass requires each blocking persona to pass every relevant gate
  separately. Aggregate precision/recall cannot hide a failed persona.
- An untested point inside a design-height band is not implicitly qualified.
- An out-of-band success is useful evidence but does not expand the declared
  band without a superseding pre-registered matrix.
- Exploratory evidence is always labeled exploratory in UI captures, reports,
  and release notes.
- Controller-only recovery is required for everyone and is never treated as a
  substitute for a failed body-play claim.
- The first two-person evidence set supports only the repository's narrowly
  scoped “first living-room prototype” language, never population, medical,
  accessibility, child-safety, or fitness claims.

## Source boundary

- [CDC clinical growth charts](https://www.cdc.gov/growthcharts/cdc-charts.htm)
  and [stature-for-age data files](https://www.cdc.gov/growthcharts/cdc-data-files.htm)
  establish that child stature varies by age and that sex-specific percentile
  data exist. VCG does not use them to diagnose, screen, or assign a participant.
- [CDC child activity guidance](https://www.cdc.gov/physical-activity-basics/guidelines/children.html)
  describes active play for children and age-appropriate activity. It does not
  qualify this game's movements or replace the participant-specific safety and
  stop rules above.

The product decisions, benchmark protocol, and success criteria remain the
normative VCG sources. External health material is contextual only.
