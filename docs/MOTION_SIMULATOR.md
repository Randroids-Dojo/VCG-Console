# Camera-free Motion pose simulator

Last updated: 2026-07-24

`MotionPoseSimulator` is a deterministic, camera-free source for game developers,
automated tests, and the Motion Lab. It emits schema-valid Motion API `0.4.0`
landmark frames. It does not request camera permission, inject standardized
actions, or bypass the normal action recognizer.

## SDK surface

The simulator is exported from `@vcg/motion-contract`:

```ts
import { MotionPoseSimulator } from "@vcg/motion-contract";

const simulator = new MotionPoseSimulator({ playerId: "fixture-player" });
simulator.setPose("hands-together");
const frame = simulator.frame(0, 1_000);

simulator.setPlayerVisible(false);
const lostFrame = simulator.frame(1, 1_020);
simulator.reset();
```

The supported exact pose names are:

- `neutral`
- `dodge-left` and `dodge-right`
- `duck` and `jump`
- `hands-together` and `crossed-arms`
- `swipe-left` and `swipe-right`

`frame(sequence, nowMs)` is deterministic for the same simulator snapshot and
arguments. Sequence must be a non-negative integer and time must be finite and
non-negative. Frames declare source `synthetic`, replay timestamp quality,
`body.core17`, one stable session-local player, and no actions. Hiding the player
produces an empty player array; showing it again retains the same explicit test
identity.

Pose names target the corresponding current desk recognizer. The coordinates
are test fixtures, not human movement guidance, calibrated thresholds, camera
accuracy evidence, or a promise that every future recognizer will use the same
landmark arrangement.

## Motion Lab controls

The Motion Lab starts with its existing passive replay. Select **Enable Pose
Simulator** to enter the explicit developer mode. Enabling or disabling it
resets calibration, player assignment, trace, and action continuity. Starting
the real camera disables the simulator before requesting capture.

Keyboard controls while the simulator is enabled:

| Key | Pose |
|---|---|
| W | jump |
| A / D | dodge left / right |
| S | duck |
| J | hands together |
| K | crossed arms |
| Q / E | swipe left / right |
| H | hide or show player |
| N | neutral and clear the latched UI pose |

Keyboard poses are held until key release, then fall back to the selected UI
pose. UI pose buttons latch until another pose is selected.

Standard browser-controller controls are sampled continuously rather than only
on button-down edges:

| Control | Pose |
|---|---|
| D-pad or left stick | dodge, jump, or duck |
| A / primary face button | hands together |
| Start / pause button | crossed arms |

Home and Back are never converted to poses. They retain the console navigation
path even while simulation is enabled. This browser adapter is desk evidence;
native SDL3 mappings and compositor-level reservation remain separate target
qualification.

## Automated browser hook

The browser hook is absent by default. Loading the lab with the explicit
`motionSimulatorTest=1` query flag exposes `window.__vcgMotionSimulator`:

```ts
window.__vcgMotionSimulator?.enable();
window.__vcgMotionSimulator?.setPose("jump");
window.__vcgMotionSimulator?.setPlayerVisible(false);
window.__vcgMotionSimulator?.snapshot();
```

The hook uses the same simulator instance and reset behavior as the visible
controls. It is a deterministic test seam, not a game-facing transport or
production privilege boundary. Cooperative games still receive Motion data
through the version-bound bridge.

## Evidence and limits

Unit tests parse every pose through the Motion frame schema, prove exact
repeatability, player loss/reacquisition, invalid-input rejection, and action
recognizer integration for obstacle, join/select, Back, and swipe behavior.
Router tests prove held-state delivery and release. Real-Chrome coverage drives
the UI, keyboard, a synthetic standard controller, the query-gated test hook,
tracking loss, and reserved Home navigation.

This closes I-082 as a developer/test facility. It does not qualify real player
accuracy, accessibility, controller hardware, target Linux, native input,
camera behavior, or LAN developer deployment. Those remain in their respective
investigations, including I-053, I-102, I-161, I-183, I-209, and I-210.
