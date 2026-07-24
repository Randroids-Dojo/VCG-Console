# Casual local obstacle leaderboard

Status: implemented desk contract; production save isolation unqualified

Authority: D-032, D-089, and D-112

Scope: the built-in obstacle sample only

## Product claim

The obstacle board is a casual household-local history, not a competitive
ranking. The visible surface always says `UNVERIFIED RUNS`, `NO UPLOAD`, and
that scores are neither anti-cheat protected nor comparable across households.
Developer builds also say that scores can be modified.

The board makes no claim of fairness across bodies, accessibility adaptations,
calibration modes, hardware, developer changes, game versions, rules versions,
or homes. No console request, trace upload, remote validation, public ranking,
or anti-cheat path exists in this feature.

## Stored contract

The browser desk prototype retains at most 20 completed runs under the
versioned local-storage key `vcg.console.obstacle-leaderboard.v1`. The visible
board shows the highest five. Each record contains:

| Field | Meaning |
|---|---|
| `score` | Nonnegative integer awarded by the obstacle sample |
| `endedAtMs` | Local completion time for ordering equal scores |
| `gameId` / `gameVersion` | Exact sample and code version |
| `rulesVersion` | Exact scoring-rules version |
| `playerSlot` | The version-1 single-player slot |
| `player` | An opaque local-profile reference and display label, or `unassigned` |
| `inputMode` | `camera`, `replay`, or `simulator` |
| `calibrationMode` | Explicitly `not-qualified` in this prototype |
| `pauseCount` | Deliberate console pauses during the run |
| `trackingDropoutCount` | Confirmed tracking-loss freezes during the run |

Entries sort by score descending and then completion time descending. The
retention bound is not a claim that different game or rules versions are fair
to compare; version context remains attached and visible in the developer
surface.

## Lifecycle and recovery

- A score is committed once, when the game reports `RUN ENDED`.
- `NEW RUN` resets score, lives, obstacles, and per-run context without clearing
  prior scores.
- Resetting the board requires `RESET LOCAL BOARD` followed by a separate
  `CONFIRM RESET` activation.
- Profile deletion calls `unassignProfile(profileId)`: matching records keep
  their score and run context but immediately lose the profile link and label.
  Recreating a profile with the same display name cannot reassociate them.
- Invalid JSON, the wrong document version, oversized history, invalid enums,
  unsafe profile identifiers, negative or fractional counters, and mismatched
  game/rules identity cause the complete stored document to be removed. No
  partial score is displayed.
- A storage read or write failure is shown honestly. The current in-memory
  board can continue for that page session, but the UI says it will not survive
  reload.

## Privacy and security boundary

This feature stores no skeleton, trace, portrait, body measurement, camera
frame, room identifier, account credential, network address, or raw input. A
profile reference is an opaque device-local identifier; its label is bounded
display copy and is removed on unassignment.

The schema checks accidental corruption. They do not authenticate scores and
must not be described as tamper resistance. Browser local storage is suitable
for this desk sample, not the final per-game native save boundary. Target
appliances still need isolated writable storage, quota and low-space behavior,
healthy update/rollback preservation, reset/factory-reset tests, and proof that
other packages cannot read or alter this board under I-189, I-191, and I-209.

## Verification

Unit tests cover ordering, the 20-run bound, durable reload, profile
unassignment, reset, malformed-document recovery, unavailable storage, and
invalid inputs. A real-Chrome flow completes an actual obstacle run, verifies
the disclosure and run context, reloads the app to prove persistence, and
proves the two-step reset removes the local key.

Those tests close I-204 for the obstacle desk sample. They do not qualify public
competition, anti-cheat, cross-household comparison, hosted-game leaderboards,
production save isolation, power-loss durability, or player-profile privacy.
