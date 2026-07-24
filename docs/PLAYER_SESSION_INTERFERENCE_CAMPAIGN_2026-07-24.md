# Player-session household-interference campaign

Last updated: 2026-07-24

Status: deterministic camera-free rehearsal implemented; physical campaign
contract implemented and tested; no physical campaign has run.

This document advances I-069 without claiming that a camera, tracker, room,
person, animal, mirror, television, or target appliance has passed. It
separates two kinds of evidence:

1. a deterministic synthetic rehearsal proving the current session state
   machine's authority boundaries; and
2. a pre-registered physical campaign that must measure the complete tracking
   stack in the selected living room.

## Safety and product claim

The required product invariant is:

> Detection alone never joins, controls, acts for, silently reacquires, or
> takes over a player session. An exact visible joined track is the only source
> of gameplay or Pause authority. After recovery opens, a one-player transfer
> requires explicit Resume directed at a currently visible candidate.

The system is not expected to identify whether a detection is a person, pet,
mirror reflection, television image, or passerby. Those semantic labels belong
to the campaign oracle, not the runtime identity model. A non-player detection
may therefore appear as a candidate. The safety property is containment:
candidate status alone has no authority.

This distinction prevents a misleading "zero false candidates" claim from
substituting for the actual product requirement. The physical report records
false-candidate observations as a measured count while requiring exactly zero:

- false joins;
- false controls;
- unintended takeovers; and
- false actions.

The only expected takeover is a deliberately selected replacement player in
the `recovery-explicit-replacement` scene.

## Implemented authority boundary

`PlayerSessionController` now exposes two exact-track authority operations:

- `authorizeGameplayAction(trackId)` returns a player slot only while the
  session is `playing` and the exact track is visible, joined, and healthy;
- `openPauseForTracks(completions)` rejects non-joined track completions before
  applying the existing earliest-completion/lower-slot tie rule.

Authority is withheld during setup, loss confirmation, frozen recovery,
manual pause, and recovery. An unknown but syntactically safe track receives no
slot. A malformed track identifier is rejected rather than normalized.
Visible-track and action-completion batches reject more than 16 entries before
changing session state.

These methods centralize track-to-slot authorization so an action recognizer
does not need to infer membership from array order, similarity, or the first
visible body.

## Camera-free synthetic rehearsal

The launcher exposes **Motion / Session authority** and universal search entry
**Session authority rehearsal**. The view runs five deterministic scenarios
against the real `PlayerSessionController`:

| Scenario | Injected interference | Proof |
|---|---|---|
| Passive spectator | Spectator before join | Candidate detection does not create a player, control slot, or Pause action. |
| Household interference | Pet, mirror, television person beside Player 1 | The exact joined track remains stable; outsider actions are ignored; Player 1 can still Pause. |
| Loss and passerby | Passerby during silent-recovery and recovery windows | Wrong track cannot silently reacquire, resume, or control; explicit original-player Resume succeeds. |
| Deliberate replacement | Replacement player plus spectator after recovery opens | Replacement does not auto-take over; explicit Resume transfers Player 1 exactly once. |
| Multiplayer recovery | Spectator and passerby while Player 2 is lost | Outsiders cannot substitute for Player 2; explicit non-empty roster reduction is required. |

The report is deterministic, bounded, camera-free, and contains no images,
frames, landmarks, embeddings, body measurements, names, paths, or durable
identity. It reports:

- false-candidate observations;
- false joins;
- false controls;
- unintended takeovers;
- false actions; and
- explicit takeovers.

Current synthetic outcome: every named interference class is covered, all
checks pass, the four authority-failure counts are zero, and one deliberate
replacement takeover occurs. This is state-machine evidence only.

### Pinned synthetic result

The deterministic outcome is now preserved as
`benchmarks/player-session-interference/camera-free-authority-rehearsal-v1.json`.
It contains five scenarios, 15 passing checks, 12 interference-candidate
observations, zero false joins, zero false controls, zero unintended
takeovers, zero false actions, and exactly one explicit takeover.

The artifact binds normalized SHA-256 digests for the session controller,
adversarial rehearsal, generator, and validator. Its strict validator
recomputes the complete report and rejects authority-failure substitution,
missing explicit takeover, scenario/check reordering, raw-frame or identity
claims, prohibited report fields, stale provenance, and undeclared
qualification fields. It is bounded to 64 KiB and decoded as strict UTF-8.

Reproduce it with:

```text
pnpm tsx scripts/generate-player-session-adversarial-evidence.mjs
pnpm tsx scripts/validate-player-session-adversarial-evidence.mjs
pnpm tsx --test scripts/validate-player-session-adversarial-evidence.test.mjs
```

The tracked result does not make the synthetic actors more realistic. It
prevents the passing claim from drifting away from the exact state machine
and fixture that produced it.

## Physical campaign formats

[`validate-player-session-interference-campaign.mjs`](../scripts/validate-player-session-interference-campaign.mjs)
defines two closed JSON formats:

- `vcg-player-session-interference-plan`, version 1; and
- `vcg-player-session-interference-result`, version 1.

Unknown fields, reordered cells, duplicate or malformed identifiers, unsafe
timestamps, invalid digests, missing trials, reordered trials, missing
oracles, raw-frame retention, non-zero qualification ceilings, and
self-declared conclusions that disagree with the ledger are rejected.

Run validator tests with:

```text
node --test scripts/validate-player-session-interference-campaign.test.mjs
```

Validate a frozen plan before any session:

```text
node scripts/validate-player-session-interference-campaign.mjs \
  evidence/player-session-interference/plan.json
```

Validate a complete result against the exact plan bytes:

```text
node scripts/validate-player-session-interference-campaign.mjs \
  evidence/player-session-interference/plan.json \
  evidence/player-session-interference/result.json
```

The repository does not contain either evidence file yet. Creating fake
digests or a synthetic physical result would weaken the pre-registration.

## Frozen target bindings

Before execution, the plan must bind lowercase SHA-256 digests for:

- dimensioned room sheet and zone/hazard record;
- exact camera, firmware, mount, cable, mode, controls, and optical placement;
- tracker build, model, configuration, thresholds, and identity settings;
- launcher, Motion API, game, OS, browser/runtime, and native-host build;
- consent, assent, safeguarding, stop, animal-welfare, and operator protocol;
- harness scripts, clocks, controller, action injection, and evidence
  collectors.

The platform is exactly `raspberry-pi-5` or `x86-64-linux`. Windows, WSL2,
macOS, development-browser fixtures, and synthetic tracks cannot satisfy this
target field.

Any material room, camera, tracker, software, protocol, or harness change
requires a new plan and campaign ID. Results bind the exact plan bytes by
SHA-256 and bind a complete environment manifest separately.

## Qualification matrix

The closed matrix has:

- five interference classes;
- two blocking standing-player personas;
- seven authority scenes;
- twelve scheduled repetitions per cell; and
- at least ten valid trials required per cell.

That is 70 cells and 840 scheduled trials, with at least 700 valid trials
required for qualification.

### Interference classes

1. `spectator`
2. `pet`
3. `mirror`
4. `television-person`
5. `passerby`

The physical script for each class must define distances, dwell time, movement
path, overlap/crossing, lighting, clothing or display content, camera
occlusion, and operator stop conditions without trying to provoke or restrain
an animal. A recorded video of a pet is not interchangeable with a live pet;
it belongs to `television-person` or another separately named display fixture.

### Blocking player personas

1. `school-age-child-standing`
2. `adult-standing`

The campaign uses the consented, measured fields and separate reporting rules
in `PLAYER_PERSONAS.md`. It does not include seated, assisted, or limited-range
qualification; those remain I-068. The plan must not store a participant name,
face, portrait, credential, or biometric identity.

### Authority scenes

| Scene | Required action and oracle |
|---|---|
| `candidate` | Interference enters before join. No player, action, or control may appear without deliberate join. |
| `joined` | Player is joined while interference enters, dwells, crosses, and exits. Exact joined track and action ownership must remain stable. |
| `loss-confirmation` | Player is briefly occluded or exits while interference is visible. Debounce must not grant outsider control; confirmed loss must freeze. |
| `recovery-no-input` | Same-track window expires with interference visible. Session must stay frozen with no takeover until input. |
| `recovery-explicit-original` | Original player returns and is deliberately selected. Resume must restore the original track with zero takeover. |
| `recovery-explicit-replacement` | A consented replacement player is deliberately selected while the interference fixture remains present. Exactly one takeover must be recorded. |
| `post-resume-action` | After original or replacement Resume, interference produces movement while the player performs control and Pause actions. Only the selected joined track may act. |

The harness must not use array position or "first detection" as the oracle for
the selected track. The selection event and exact session track must be
recorded independently.

## Required oracles

Every trial carries ordered evidence for all seven oracles:

1. `candidate-observation`
2. `joined-track`
3. `control-owner`
4. `takeover`
5. `action-owner`
6. `freeze-state`
7. `privacy`

Each oracle record contains only an artifact byte length and SHA-256 digest in
the campaign ledger. Artifact content must be minimized:

- monotonic timestamps and timestamp-quality metadata;
- opaque run-local track and player-slot identifiers;
- session phase and presence state;
- candidate, join, Resume, roster, and action events;
- tracker health and configuration identity;
- controller or deliberate-motion confirmation event;
- false-candidate and authority-failure classifications;
- operator/harness validity codes.

Raw camera frames are prohibited by both plan policy and every result trial.
If a visual debugging exception is later authorized, it requires a separate
consent, retention, access, deletion, and campaign contract and cannot be
smuggled into this format.

## Trial disposition and conclusion

Every planned trial appears exactly once and in canonical cell/repetition
order:

- `valid-pass`: all four authority-failure metrics are zero, the expected
  explicit-takeover count matches, and there are no failure codes;
- `valid-fail`: at least one authority failure or explicit-takeover mismatch
  occurred and at least one failure code is present;
- `harness-invalid`: no product metrics are asserted and a harness failure code
  explains why the trial is unusable;
- `not-run`: no product metrics are asserted and a stop/failure code explains
  why it did not run.

The validator derives:

- `rejected` from any valid product failure;
- `incomplete` if any trial is not run or any cell has fewer than ten valid
  trials;
- `qualified` only with no valid failure and at least ten valid trials in every
  cell.

A result cannot convert a valid product failure into a passing conclusion,
understate a missing cell, omit a planned trial, or qualify with a non-zero
false-join/control/takeover/action ceiling.

## Abort and invalidation conditions

Stop the current trial immediately for participant discomfort, child assent
withdrawal, unsafe traffic or collision risk, distressed animal behavior,
fall/cable/furniture hazard, camera/mount movement, unplanned room occupant,
operator uncertainty, or independent console stop.

Invalidate rather than score a trial when:

- target, room, camera, tracker, software, or harness digest differs;
- the planned interference class, persona, or scene was not executed;
- clocks regress or required timestamp quality is unavailable;
- selected-track evidence is ambiguous;
- an oracle artifact is missing, changed, or corrupt;
- raw frames were retained;
- the participant or animal-welfare protocol was violated.

Product failures remain failures. Tracker restart, session freeze, false
candidate, false join, false control, false action, or takeover evidence must
not be relabeled harness-invalid merely because the outcome is undesirable.

## Remaining work and closure boundary

I-069 remains active. Closure requires:

- Q-220 through Q-226 owner authorization for the real room, exact
  camera/tracker build, consented participants, replacement-player ceremony,
  interference scripts, animal-welfare protocol, evidence retention, and
  independent review;
- a frozen valid plan with real manifest digests;
- independent harness dry runs proving oracle truth and stop paths;
- all 840 planned trial ledger entries;
- validator-passing result;
- reviewed failure traces and issue disposition;
- a human-readable false-candidate, false-join, false-control,
  unintended-takeover, and false-action report;
- reruns after any material fix or target change.

The current synthetic pass may support development of those artifacts. It does
not support a household-safety, child, pet, tracking-accuracy, or appliance
qualification claim.
