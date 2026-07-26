# First real-room one-player campaign — 2026-07-25

Status: strict zero-result I-053/I-210 plan pre-registered; room, participant,
camera and collection authority remain blocked

Authority: D-002, D-031, D-032, D-060, D-069, D-077, D-102, D-103, D-105,
D-110, D-130, I-015, I-035, I-036, I-040, I-052, I-053, I-178, I-183,
I-210, Q-019, Q-027, Q-031, Q-032, Q-034, Q-100

## Purpose

`household-one-player-v1` already fixes and scores one complete 14-block,
280-attempt motion run. It deliberately does not choose a room, participant,
camera, placement, target, lighting policy or exposure clock. I-053 and I-210
need a campaign envelope that binds those facts before a first real-room result
is observed.

`benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json`
creates that envelope. Its validator accepts only the tracked blocked state. It
does not authorize entry into a home, participant recruitment, camera capture,
temporary images or collection.

## Bound source contracts

The plan binds the current bytes of:

- the household benchmark plan and scoring protocol;
- the first-prototype success criteria;
- the blocking adult and school-age-child persona contract;
- the living-room/play-zone survey plan;
- the camera capture-policy campaign; and
- the separate exposure-to-game-API latency campaign.

A source change makes this plan stale. It cannot silently inherit a changed
action set, persona boundary, room rule, privacy rule or timing claim.

## Required matrix

Both blocking persona classes independently run the complete household
benchmark at five required placements:

1. center;
2. near-left edge;
3. near-right edge;
4. far-left edge; and
5. far-right edge.

That is ten benchmark runs. Each run contains all 14 canonical blocks and all
280 scheduled attempts across shell, obstacle-game and session/recovery
contexts, for 2,800 scheduled attempts total. An invalid or failed attempt
remains visible; it cannot be discarded and replaced.

Each persona/placement cell also requires its own 15-minute negative session,
for ten independent sessions and 150 minutes total. A passing center, adult,
lighting or aggregate result cannot rescue a failed child or edge cell.

## Evidence layers remain separate

Every persona/placement cell must eventually bind three distinct artifacts:

- a validated household benchmark result and skeleton-only trace;
- an exposure-authoritative action-latency result; and
- a negative-session record with a privileged-action oracle.

The campaign additionally requires pose FPS, core-17 coverage and normalized
jitter; trigger and transition precision/recall; capture and processing drops;
tracking-loss confirmation; silent reacquisition; and recovery-overlay timing.

The capture-policy campaign cannot substitute for action evidence. Inference
time or capture-arrival time cannot substitute for exposure-to-game-API
latency. `STREAM ACTIVE` cannot prove that a useful frame arrived or that the
lens view was usable.

## Fixed and open gates

The current decided gates are preserved exactly:

- trigger precision at least 95%;
- trigger recall at least 90%;
- zero unintended privileged actions in every negative session;
- exposure-to-game-API p95 no greater than 120 ms; and
- zero invalid benchmark attempts in a qualifying run.

Minimum pose FPS, minimum core-17 coverage and maximum normalized jitter remain
null. Those values require owner review before a ready plan exists. Result data
must not be inspected and then used to choose them.

## Privacy and authority

Normal evidence is skeleton-only. Raw room video and raw frames are forbidden
from repository and released evidence. Names, stable participant identifiers,
face templates, body-profile vectors and free-text result evidence are also
forbidden.

Any temporary diagnostic image requires a separate consent/data protocol,
bounded access and verified deletion. The tracked plan grants no such
authority. Child participation requires both the selected household consent
process and age-appropriate assent/comprehension handling; the engineering
persona label is not recruitment authority.

## Workflow

1. Resolve the owner-held inputs in
   `OWNER_QUESTIONS_FIRST_REAL_ROOM_ONE_PLAYER_2026-07-25.md`.
2. Complete and validate the selected-room survey and safe play zone.
3. Freeze the exact target/build, camera/mode/placement, selected capture
   policy, lighting state, participant protocol, independent ground truth,
   exposure-clock proof, negative-session script, data handling and schedule.
4. Add and review a strict ready-plan/result transition before any physical
   collection. The current validator intentionally accepts no ready state.
5. Run every scheduled attempt and negative session without replacement.
6. Publish minimized machine-readable evidence and separate per-persona,
   per-placement dispositions.

Validate the current blocked plan with:

```powershell
node scripts/validate-first-real-room-one-player-plan.mjs `
  benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json
```

Contract tests run with:

```powershell
node --test scripts/validate-first-real-room-one-player-plan.test.mjs
```

## Current boundary

This tranche advances I-053/I-210 from unstructured execution rows to a strict
blocked campaign. It records no home, person, camera frame, trace, action,
latency, ground truth, physical session or product result. The Windows C920
development fixture is not a selected shared camera or a real-room result.
