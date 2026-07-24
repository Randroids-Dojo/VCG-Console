# Player control availability v1

Last updated: 2026-07-24

This contract makes missing-landmark behavior visible and action-specific without inventing a provider confidence threshold. Motion API `0.4.0` supplies per-landmark `observed` flags and global tracker health. `assessPlayerControlAvailability` derives a separate, versioned view from those existing signals.

The derived view is diagnostic. It does not grant manifest permission, negotiate a profile, bypass action context, complete calibration, override cooldown, or authorize side effects. Clients still act only on standardized actions with `phase: "triggered"`.

## Wire artifact

The SDK exports `PlayerControlAvailabilitySchema`, its TypeScript type, the derivation helper, and the checked-in Draft 2020-12 schema:

- schema version: `1`;
- schema ID: `urn:vcg:schema:player-control-availability:1`;
- generated file: `schemas/player-control-availability.schema.json`.

The result contains the player ID, overall state and reason, six body-region states, six control-group booleans, and the exact missing core-landmark names. Unknown fields remain forward-compatible under the repository schema policy.

## Inputs and precedence

The helper accepts one parsed player, if present, and the frame's global health status.

1. Any health other than `ready` makes every control unavailable. Region visibility is still reported for diagnostics, but cannot restore authority.
2. A missing player makes every region and control unavailable.
3. On a ready frame with a player, each control is available only when every landmark that action group needs is `observed`.

Visibility and presence numbers are deliberately not thresholded here. Provider adapters remain responsible for producing the existing `observed` signal. Exact confidence, hysteresis, and provider-parity thresholds require real-player evidence under I-063 and Q-039.

The separate `fail-closed-confidence-rearm/v1` research gate now makes one
candidate mechanism testable without changing this contract. It blocks
immediately on provider loss or low confidence and requires bounded
high-confidence evidence to restore. On the authored 115-sample comparison it
removes 14 unsafe openings but increases false unavailability from 2 to 34.
Those frozen values are an exposed safety/availability tradeoff, not provider
qualification or permission to reinterpret `observed`. See
`MOTION_CONFIDENCE_DEGRADATION_EVIDENCE_2026-07-24.md`.

## Region states

Each region is `observed` when all listed landmarks are observed, `partial` when some are observed, and `missing` when none are observed.

| Region | Core landmarks |
|---|---|
| Head | nose, left/right eye, left/right ear |
| Torso | left/right shoulder, left/right hip |
| Left arm | left shoulder, elbow, wrist |
| Right arm | right shoulder, elbow, wrist |
| Left leg | left hip, knee, ankle |
| Right leg | right hip, knee, ankle |

Region state is for feedback and diagnosis. Control suppression uses the smaller action-specific requirement sets below rather than suppressing everything because one region is incomplete.

## Control requirements

| Control group | Required observed landmarks |
|---|---|
| Select / Join | both shoulders and both wrists |
| Back / Pause | both shoulders, both elbows, and both wrists |
| Swipe | both shoulders and both wrists |
| Dodge | both hips |
| Duck | both shoulders |
| Jump | both hips and both ankles |

The overall state is:

- `full` when global health is ready and all 17 core landmarks are observed;
- `partial` when at least one control group remains available;
- `unavailable` when no motion control group is available.

A partial state does not mean all listed available controls will trigger. Context, join state, calibration, pose geometry, temporal phase, release hysteresis, and cooldown still apply.

## Recognizer behavior

The desk action engine now measures shoulder, hip, and ankle pairs independently:

- a missing ankle suppresses Jump but does not cancel a hands-together hold or suppress Dodge;
- a missing wrist cancels a hands-together hold because that gesture requires both wrists;
- a missing shoulder pair suppresses Select, Back/Pause, Swipe, and Duck while hip-only Dodge remains eligible after calibration;
- any non-ready global health state clears all gesture continuity and emits no actions.

Standing calibration still requires a complete shoulder, hip, and ankle sample. A partial frame does not silently synthesize or extrapolate a missing joint and does not contribute a partial baseline.

## Motion Lab fixtures

Motion Lab includes deterministic replay-only fixtures:

| Fixture | Hidden landmarks | Expected control effect |
|---|---|---|
| Full | none | all six groups available |
| Left Arm | left elbow and wrist | Select, Back/Pause, and Swipe unavailable |
| Legs | both knees and ankles | Jump unavailable; Dodge and upper-body controls remain available |
| Half Body | the left eye, ear, shoulder, elbow, wrist, hip, knee, and ankle | all six groups unavailable |

The live Body Signal card reports the overall state, every region, and unavailable control labels. Fixtures set hidden landmarks to unobserved with zero visibility/presence but retain the complete 17-landmark array. They run only on synthetic replay or the camera-free simulator; starting the camera resets the fixture to Full.

These fixtures prove deterministic software behavior, not tracker accuracy or a safe product threshold.

## Remaining qualification boundary

I-063 remains active. A strict research gate and hash-bound synthetic
comparison now define immediate loss, bounded rearm, replay refusal, and the
measured safety/availability tradeoff. Closure still needs provider-specific
observed/confidence calibration, time-based restoration, real-player
missing-limb and half-body recordings, gameplay continuation-versus-pause
policy by title, accessibility alternatives, seated/child/limited-range
cases, feedback comprehension at TV distance, controller recovery, and
cross-backend conformance. No silent landmark extrapolation is authorized.
