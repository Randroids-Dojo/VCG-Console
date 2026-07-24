# Player session state machine

Last updated: 2026-07-24

This contract turns D-065 through D-076 into deterministic one- and two-player session behavior. The console lab currently exercises the one-player path. The pure state machine and adversarial tests cover the next two-player milestone without claiming that tracking, calibration, room coverage, or multiplayer gameplay is qualified.

## Identity boundary

A tracker supplies a bounded opaque `trackId` for the current process/session. It is continuity evidence, not a person, profile, credential, face match, or durable identity.

Passive detection creates only a candidate. `join(trackId)` succeeds only for a candidate visible in the latest observation, assigns the lowest available session slot, and never changes an existing assignment. Player 1 joins before Player 2. A production UI must pair each number with a pattern/shape and color, never color alone.

Assignments are session-local. Restart, explicit session reset, factory reset, or loss of local state does not attempt biometric recovery.

## Explicit leave and fresh re-entry

Leaving is an explicit console action, never a consequence of disappearance,
candidate ordering, or a replacement track. `leave(slot)` is available only
while the session is playing and removes the exact assigned slot immediately.
That track loses gameplay and Pause authority before the operation returns.
Paused, frozen, recovery, unknown-slot, and duplicate leave attempts fail
without changing the roster. Recovery-phase roster reduction remains the
separate explicit `keepSlots` flow described below.

If joined players remain, play continues and a departed launcher owner
transfers deterministically to the lowest retained joined slot. If the final
player leaves, the session returns to `setup` with no launcher or overlay
owner. A still-visible former track is only a candidate. It must complete a
fresh `join(trackId)` operation, receives the lowest available slot, and does
not recover its former authority implicitly.

The action recognizer also requires hands to separate after a motion-selected
Leave before it can begin another Join hold. One continuous hands-together
gesture therefore cannot both leave and silently re-enter. A controller can
focus the Motion Lab assignment control with Down, explicitly select Leave,
and select Join again as a distinct input.

## States

The global phases are:

| Phase | Meaning | Gameplay |
|---|---|---|
| `setup` | No joined player exists. Visible bodies remain candidates. | Not started |
| `playing` | Every required joined track is safe. | May run |
| `paused` | A joined player owns the console manual-pause overlay. | Frozen |
| `frozen` | At least one joined player has confirmed loss or a hard continuity fault. | Frozen for everyone |
| `recovery` | Silent same-track reacquisition expired. Deliberate Resume or Exit is required. | Frozen |

Each joined slot is `joined`, `confirming-loss`, `reacquiring`, or `awaiting-resume`. Array order and detection order never assign ownership; session slot is authoritative.

## Loss and recovery

Ordinary loss requires both:

- at least 300 ms from the first missing observation; and
- at least two missing updates.

This uses elapsed time plus repeated evidence rather than assuming a frame rate. An isolated miss that recovers before confirmation has no state event.

Confirmed loss of any joined player moves the entire session to `frozen`. Simulation, timers, hazards, scoring, and motion actions must remain frozen for every player. Each lost slot retains its original session track for a two-second silent reacquisition window.

The session returns automatically only when every unsafe slot has its original track again before the first recovery deadline. A spectator, different track, or merely similar body cannot satisfy silent reacquisition.

When the deadline expires, `recovery` remains frozen even if an original track later reappears. Resume is deliberate:

- in a one-player session, any currently visible candidate may confirm Resume and take over Player 1;
- in a two-player session, every retained original track must be visible;
- reducing a multiplayer roster requires an explicit non-empty `keepSlots` choice; removed slots do not rejoin implicitly;
- Resume never accepts an invisible candidate, unknown slot, empty roster, or unretained controller.

Exit resets the active one-player lab session and returns to a candidate state. A later join is a new assignment.

## Hard faults and time

Camera disconnect, permission loss, tracker-process failure, and other authoritative hard faults bypass ordinary debounce and freeze immediately.

A publication-time regression also freezes immediately and starts a new recovery epoch. It never produces a negative duration, silently clears a joined roster, or treats a stale observation as proof of continuity.

Observations reject duplicate or malformed track IDs and non-finite time. Configuration rejects zero/negative timing and missing-update limits.

## Shared menu ownership

Any joined player may complete the long-X Pause action while `playing`. If completions compete, the earliest `completedAtMs` wins; equal timestamps use the lower player number. The first accepted completion atomically moves the session to `paused`, so later events cannot steal the overlay.

Only that slot may close the manual overlay. Returning through an exit flow transfers launcher ownership to the pause owner. A tracking fault during manual pause preserves the owner through a successful silent reacquisition; an expired loss replaces the manual overlay with recovery.

Reserved controller Home/Back remains outside this motion ownership model. Controller input may navigate recovery and confirm a visible candidate, but it does not fabricate a body track or silently reassign a player.

Gameplay and motion-Pause authority are now resolved from the exact current
track, not from candidate order. `authorizeGameplayAction(trackId)` returns a
slot only while the session is playing and the exact track is visible and
joined. `openPauseForTracks(completions)` filters every completion through
that authority check before applying the existing timing and slot tie rules.
Setup, loss confirmation, frozen recovery, manual pause, recovery, and
non-joined tracks have no gameplay authority. Observation batches and action
completion batches are independently capped at 16 entries and reject overflow
before changing authority state.

The Motion Lab runtime applies those checks to every `(trackId, action)` pair,
not merely the first detected body. It batches all same-frame Pause
completions before opening the overlay, suppresses other actions from that
opening frame, and accepts obstacle actions only from an exact currently
authorized joined track. Candidate reordering therefore fails closed rather
than transferring gameplay.

Shared shell actions have narrower authority.
`authorizeLauncherAction(trackId)` accepts only the visible joined launcher
owner, while `authorizeOverlayAction(trackId)` accepts only the visible joined
manual-Pause owner. During one-player recovery, any visible candidate may
navigate and deliberately select Resume under D-070; the exact action track is
also the takeover track. During multiplayer recovery, only an original
visible joined track may navigate, and the existing complete-retained-roster
checks still govern Resume. A spectator cannot move focus, exit, or replace a
multiplayer player. Reserved controller recovery remains independent.

## Implemented evidence

`PlayerSessionController` is a pure, clock-injected TypeScript state machine.
Fourteen focused tests cover passive candidates, sequential join, explicit
leave, fresh re-entry, deterministic retained-owner transfer, invalid
phase/slot refusal, multiple-update debounce, global two-player freeze,
wrong-track rejection, all-player silent recovery, recovery expiry,
deliberate one-player takeover, explicit roster reduction, pause races, owner
isolation, hard faults, clock regression, duplicate tracks, and invalid
timing.

The console lab uses the state machine for its one-player
join/leave/re-entry/loss/recovery path. The previous boolean tracking-loss
controller was removed so there is one behavioral authority. The action
engine adds a focused release-gate case, and the real-Chrome simulator flow
proves controller Join, focus, Leave, and fresh Join without opening a camera.
The camera-free integration suite additionally reorders a spectator ahead of
the joined track, gives both tracks triggered actions, and proves that only
the exact joined track survives runtime authorization.

The camera-free Session authority rehearsal adds five deterministic scenarios
covering spectators, pets, mirrors, television people, passersby, deliberate
replacement, and multiplayer outsider substitution. The synthetic report
records false candidates separately from false joins, false controls,
unintended takeovers, false actions, and expected explicit takeovers. Unit and
browser tests prove all named classes execute, the four authority-failure
counts remain zero, explicit one-player Resume transfers exactly once, no
camera request is made, and controller Select/Back remains usable.

`PLAYER_SESSION_INTERFERENCE_CAMPAIGN_2026-07-24.md` and its strict validator
pre-register the later physical campaign as 70 class/persona/scene cells and
840 scheduled trials. This is future evidence, not a completed result.

## Remaining qualification boundary

This contract does not qualify a multi-person tracker or close I-056/I-069.
Still required are separate per-player calibration, accessible visual
identities, real crossing/occlusion tracks, stable identity evidence,
production candidate-selection and controller-only recovery UI, explicit
physical leave/re-entry usability, tracker restart on target Linux, two-player
action ownership, game freeze integration across runtimes, and a
validator-passing physical spectator/pet/mirror/television/passerby campaign.
Those remain under I-054, I-056, I-057, I-059, I-069, I-150, and I-161.
