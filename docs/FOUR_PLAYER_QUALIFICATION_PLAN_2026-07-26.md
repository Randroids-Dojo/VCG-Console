# Four-player qualification plan — 2026-07-26

Status: strict blocked I-055 zero-result plan; the complete two-player gate has
not passed, the milestone has not been activated, and no four-player product
claim exists

Authority: D-015, D-031, D-071, D-103 and I-055

## Outcome

Pre-register the evidence required to decide whether one exact VCG product
configuration can support four simultaneous players. This is a later milestone,
not an implementation or execution order.

D-015 keeps four visible players as an API direction. D-071 requires the full
one-player and two-player milestones before attempting four. D-103 qualifies an
8 by 8 foot zone only for one and two players; a larger safe four-player zone
must be measured independently.

The tracked artifact is:

`benchmarks/four-player/four-player-qualification-plan-v1.json`

## Gate before any four-player work

Collection remains closed until all of these are bound:

1. one canonical complete I-054 result;
2. the exact two-player-qualified target, build, camera, capture policy, room,
   play zone, tracker and session configuration;
3. evidence that every required two-player cell passed without rescue;
4. an explicit owner decision activating the four-player milestone; and
5. the four-player authorities, protocols, gates and stop rules in this plan.

One-player evidence, a plan without a result, synthetic identity scenes,
aggregate performance, API shape, provider limits, vendor claims, or a different
target cannot open the gate.

## Current implementation boundary

The Motion `0.4.0` schema can declare `maxPlayers`, but declaration is not
qualification. The console lab is configured for one joined player. The
documented and tested session semantics stop at two players. Synthetic tracking
evidence includes at most three-person scenes and does not prove four-player
identity continuity, actions, latency, safety, recovery or playability.

Four-player work therefore requires an exact implementation of:

- sequential explicit joins for Players 1 through 4;
- independent calibration and accessible number, pattern, shape and color
  outlines for every slot;
- deterministic launcher and pause-overlay ownership;
- whole-game freeze after confirmed loss of any joined player;
- silent recovery only when every exact original session-local track returns;
- deliberate full-roster recovery, explicit roster reduction or exit after the
  silent window; and
- fail-closed camera, tracker, overload, clock and runtime recovery.

Opaque tracker IDs remain session-local continuity evidence. They cannot
identify a person, authenticate a profile or restore identity across sessions.

## Complete comparison matrix

The plan enumerates every ordered child/adult roster composition: all `2^4 = 16`
slot assignments. Slot order matters so a child or adult in Player 4 cannot be
rescued by the same class succeeding in Player 1.

Every roster class must exercise:

- 6 measured placement quartets;
- 22 identity, crossing, occlusion, exit and re-entry scenarios;
- 24 independent and simultaneous action scenarios;
- 36 join, calibration, menu-owner, freeze, recovery, leave and fault scenarios;
- 12 accessible identity, owner, recovery and controller-rescue tasks;
- 12 room-safety, separation, egress and emergency-stop scenarios; and
- both the console shell and obstacle sample.

At 20 valid trials per required cell, this produces:

- 4,224 identity cells and 84,480 identity trials;
- 4,608 action cells and 92,160 action trials;
- 1,152 session cells and 23,040 session cycles;
- 384 accessible-identity cells and 7,680 trials;
- 1,152 room-safety cells and 23,040 trials; and
- 192 one-hour runtime-soak cells.

No roster, placement, scenario, runtime, target, average or best case may rescue
a failed required cell. Invalid, stopped, excluded and failed attempts remain in
the evidence ledger.

## Room and physical-safety boundary

The one/two-player 8 by 8 foot plan is not four-player evidence. Before any
motion trial, an independently measured larger zone must bind:

- width, depth, ceiling and camera-visible usable volume;
- four marked player fixtures and movement envelopes;
- inter-player separation, limb reach and center-crossing clearance;
- furniture, television, wall, cable, outlet, doorway and egress hazards;
- school-age-child and adult reach and movement bounds;
- operator and controller-rescuer stop routes; and
- explicit abort rules before contact, collision or an unsafe-zone exit.

Self-report, tracker coordinates, camera visibility or a lack of observed injury
cannot establish safety. Independent physical truth and a zero-contact policy
are mandatory.

## Evidence and fixed gates

Every result must independently measure:

- each player's pose rate, core-17 coverage, jitter and missingness;
- identity switches, fragmentation, false transfers and missed players;
- each player's trigger precision, recall and cross-player attribution;
- exposure-to-correct-player API latency using one authoritative exposure clock;
- join, calibration, outline and owner comprehension;
- loss confirmation, whole-game freeze, roster recovery and menu ownership;
- separation, collision, egress, emergency stop and controller rescue;
- camera drops, buffering, timestamp quality and overload recovery;
- CPU, GPU, memory, wall power, temperature, game FPS and frame pacing; and
- camera, tracker, clock, process and runtime fault recovery.

The plan inherits zero identity switches, false control transfers, cross-player
actions, unintended privileged actions, missed freezes, state advances during
freeze, wrong-owner menu events, wrong-track recovery, automatic partial-roster
resume, player contact, unsafe-zone/egress violations, emergency-stop failures
and invalid required attempts. It also retains 95% per-player trigger precision,
90% recall and D-110's 120 ms exposure-to-correct-player p95 ceiling.

Outcome-sensitive cohort, pose, identity, setup, comprehension, recovery,
room-size, separation, resource, thermal, frame-pacing, drop and overload gates
remain null for owner review before collection. They cannot be filled after
seeing results.

## Decision boundary

A complete technical pass does not automatically activate this milestone,
promise four-player product quality, change a product maximum, select hardware,
publish compatibility or create room guidance. A complete failure does not
silently change the product maximum either.

Any product-scope decision must name the exact target, build, camera, tracker,
room, zone, roster protocol and evidence result. Partial qualification and
aggregate promotion are forbidden. Retest and expiry rules must be fixed before
the result can support a later decision.

## Authority and data boundary

This tranche authorizes no room access, participant recruitment, minor or adult
participation, camera collection, runtime mutation, equipment purchase,
publication or product claim.

Repository evidence excludes raw frames, room video, audio, depth, faces,
portraits, names, stable identifiers, profile IDs, body measurements,
calibration vectors, appearance embeddings, identity templates, paths and free
text. Temporary diagnostics require a separate approved protocol, consent,
authorization and verified deletion. Adverse attempts, stops, faults, collisions
or excluded quartets may never be hidden.

## Validation

Run:

```text
pnpm validate:four-player
```

The validator checks the closed schema, source digests, prerequisite and
authority gates, implementation boundary, all matrix identities and arithmetic,
fixed and open gates, privacy, decision protocol, blockers, canonical JSON,
strict UTF-8 and parser limits.
