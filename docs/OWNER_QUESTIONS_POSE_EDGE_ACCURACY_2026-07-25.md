# Owner questions: pose edge-accuracy campaign

Last updated: 2026-07-25

The I-035 campaign shape is now exact and machine-checked, but its tracked plan
is deliberately blocked. These questions are needed before any camera or
participant collection; neither question authorizes spending or recruitment.

## Q-252: accuracy gates and operational placement geometry

Which exact per-cell detection threshold and per-landmark missing, p95 error,
worst error, and outlier thresholds qualify MediaPipe at the center, quarters,
and distortion edges, and what body anchor and tolerance define each physical
position?

Why this needs an owner: selecting thresholds after inspecting results would
turn the scorecard into a description rather than a pre-registered gate.
Position names alone do not define where a child or adult must stand, which
body point reaches an edge band, or how placement error is handled. These
choices affect accessibility, optics, safety, and whether one failed edge cell
can be hidden by center performance.

Conservative default while unanswered:

- keep every acceptance value null and the plan blocked;
- do not reuse provider confidence as geometric accuracy;
- require the same frozen per-landmark gates in all 126 blocking cells;
- require exact, independently measurable center/quarter/edge anchors and
  tolerances in the bound placement protocol;
- do not average away a failed persona, position, posture, or landmark; and
- treat seated evidence as exploratory and separately reported.

How to close: Vision, QA, accessibility, and safety owners approve a
pre-collection threshold rationale, exact placement geometry, uncertainty and
outlier definitions, failure handling, and the relationship to first-game
action error. Freeze that record by SHA-256 in a ready plan before any result
is opened.

## Q-253: temporary image labeling and deletion authority

May the campaign temporarily capture images for independent landmark labels,
and if so, what exact consent/assent, local access, encryption, retention,
deletion-verification, incident, and derived-artifact rules apply to adult and
school-age-child sessions?

Why this needs an owner: independent manual labels may require imagery even
though the product and release evidence are skeleton-only. Temporary images of
a household room and child remain sensitive; saying “local only” or deleting
them eventually is not a complete handling policy.

Conservative default while unanswered:

- authorize no camera or participant session;
- retain zero raw frames and no raw room video;
- include no participant identifiers or free text in traces or labels;
- do not substitute candidate output for independent ground truth to avoid the
  question;
- permit only a skeleton-only release artifact with numeric independent labels
  after the source-material policy is approved; and
- record and verify deletion before any result can be promoted.

How to close: Privacy, legal, security, QA, and the participant/guardian owners
approve one minimized data-flow and consent package, named local roles,
protection and access procedure, exact retention clock, deletion evidence,
backup/diagnostic exclusions, incident behavior, and allowed derived fields.
Freeze the approved procedure by SHA-256 in a ready plan.

No threshold, privacy policy, consent, or collection permission was inferred by
this tranche.
