# Motion standardized actions v1

Last updated: 2026-07-23

Motion API `0.2.0` introduced the temporal contract for `actions.obstacle.v1` and `actions.shell.v1`; `0.3.0` added out-of-band tracker health, and current Motion API `0.4.0` retains both unchanged while adding the RTMO source identity. This contract separates player feedback from side effects: clients may animate `started`, `held`, `ended`, and `cancelled`, but they act only on `triggered`.

The Motion API version, coordinate specification version, and cooperative bridge protocol version are independent. Motion frames use `0.4.0`, the coordinate specification remains `0.1.0`, and the cooperative bridge protocol is version 2.

## Profile ownership

Every standardized action belongs to exactly one negotiated profile:

| Profile | Actions |
|---|---|
| `actions.obstacle.v1` | `jump`, `duck`, `dodge_left`, `dodge_right` |
| `actions.shell.v1` | `player_join`, `menu_swipe_left`, `menu_swipe_right`, `menu_select`, `menu_back`, `pause` |

A bridge removes an action unless its owning profile was granted. Unknown or ungranted actions are not projected as another profile.
An enriched frame advertises both action profiles implemented by the recognizer, even when no player or action is present. Runtime parsing and the generated wire schemas reject an emitted action whose owning profile is absent.

`pause` belongs to the shell family even when recognized in game context because it opens a console-owned overlay rather than changing game simulation. Games do not own or reinterpret it.

## Phases

| Phase | Meaning | May cause behavior |
|---|---|---|
| `started` | A sustained candidate first satisfied its entry condition. `durationMs` is zero. | No |
| `held` | The same candidate remains valid. `durationMs` is elapsed sampled time from `started`. | No |
| `triggered` | The action crossed its threshold while armed and outside its per-action cooldown. | Yes, exactly once per armed gesture |
| `ended` | A previously triggered sustained gesture released or left its valid context. | No |
| `cancelled` | A sustained candidate ended or became invalid before it triggered. | No |

A normal triggered hold is:

```text
started → held* → triggered → held* → ended
```

A hold that never qualifies is:

```text
started → held* → cancelled
```

The threshold-crossing sample contains `held` before `triggered`. A sustained gesture cannot trigger again until it releases and rearms. A new attempt may accumulate held duration during cooldown, but `triggered` cannot occur before the cooldown expires.

If a tracked player remains in the frame but landmarks required by one action disappear, the recognizer terminates that action's progress without suppressing unrelated controls. For example, a missing wrist cancels hands-together progress, while a missing ankle suppresses Jump without cancelling that hold or disabling hip-only Dodge. The separately versioned derivation and exact per-control requirements are documented in `PLAYER_CONTROL_AVAILABILITY.md`. If the player itself disappears, no player action array exists in which to fabricate a terminal event; player `lost` state, tracker health, and the multiplayer recovery state machine are the cancellation authority. A later reappearance starts a new hold.

Any non-`ready` frame has an empty action array. A degraded or blocked health transition clears recognizer continuity, so returning to `ready` begins a new hold rather than inheriting pre-degradation progress.

## Context

The desk recognizer uses three explicit contexts:

- `shell`: join, swipe, select, and crossed-forearms Back are eligible;
- `game`: obstacle actions and the longer crossed-forearms Pause are eligible; selection/swipe feedback is suppressed;
- `overlay`: shell focus, selection, and Back are eligible while game actions remain suppressed.

Changing context terminates an active context-specific hold before starting the replacement timer. A partial in-game Pause hold therefore cannot become an immediate shell Back, and a shell Back hold cannot carry progress into Pause.

The current prototype uses hands-together to join before assignment and to select afterward. After `player_join` triggers, the same uninterrupted hold remains a join lifecycle until release; it cannot turn into `menu_select` without rearming.

## Discrete actions, hysteresis, and cooldown

Jump, duck, dodge, and swipe are discrete: they emit only `triggered`. Each uses a stricter entry threshold and a looser release threshold. Remaining beyond the entry threshold does not repeat the action, even after cooldown. The signal must return through the release band before another trigger is possible.

The desk defaults retain the existing 650 ms per-action cooldown. Cooldown is keyed by action name, so a safe system action does not globally delay an unrelated action. Exact movement thresholds, smoothing, calibration inputs, accessibility variants, and backend parity remain action-profile qualification work; this temporal contract does not claim the current desk numbers fit real players.

## Confidence and time

`confidence` is the recognizer's confidence for that sampled phase, bounded from zero to one. `cancelled` uses zero because the candidate is no longer accepted; `ended` retains the last accepted confidence. Confidence never authorizes a side effect without `phase: "triggered"`.

`occurredAtMs` is the frame publication time used by the recognizer. `durationMs` is non-negative sampled elapsed time. A publication-time regression starts a new candidate epoch and clears calibration, cooldown, gesture, and joined state rather than emitting negative duration or replaying an old action.

## Within-frame order

`sortMotionActions` is the normative ordering helper:

1. earlier `occurredAtMs`;
2. terminal `cancelled`, then `ended`;
3. `started`;
4. `held`;
5. `triggered`, with console-owned Pause and Back before selection/navigation and gameplay actions.

Array order is deterministic feedback order, not permission to process non-trigger phases as commands. Replay expectation scoring also matches only `triggered`.

## Visible desk feedback

The Motion Lab renders every lifecycle phase through a dedicated live feedback card while retaining `triggered` as the only side-effecting phase. It uses the recognizer's shared 450 ms join/select, 650 ms Back, and 1,100 ms Pause thresholds to show sampled hold percentage. Accepted, cancelled, and released states use explicit text plus border/pattern changes; color is never the sole signal. Discrete actions move directly to Accepted without inventing hold duration.

Terminal feedback remains visible until the next action event so a cancellation or release is not erased by a timer. This is deterministic desk feedback, not evidence that real players can perceive, understand, or complete the gestures at TV distance.

## Remaining qualification boundary

This closes temporal semantics for the prototype contract, not action accuracy. Exact v1 threshold/calibration tables, one-handed and limited-range alternatives, real-player precision/recall and feedback comprehension, cross-backend conformance traces, multi-player ownership, tracker-loss delivery, and privileged compositor enforcement remain under I-056, I-060, I-161, I-183, and I-210.
