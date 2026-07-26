# Camera-state truth boundary — 2026-07-25

Status: software state model implemented and tested; physical shutter and
across-room qualification remain open

Authority: D-016, D-045, I-046

## Purpose

The Motion Lab now presents camera software access, capture-stream activity,
and physical shutter position as three separate facts. This prevents an active
browser stream from being presented as proof that the camera has an
unobstructed view, and prevents a stopped stream from being presented as proof
that camera hardware has no power.

The implementation is a development UI and state-machine proof. It does not
qualify a physical shutter, camera indicator, selected camera, enclosure, room,
or across-room comprehension.

## Truth table

| Software state | Software access | Capture activity | Meaning |
| --- | --- | --- | --- |
| `disabled` | released | no stream | The application stopped or did not request a stream. |
| `starting` | preparing | no stream | The local pose backend is loading before a camera request. |
| `requesting-permission` | requesting | no stream | The browser permission decision is pending. |
| `active` | enabled | stream active | The hidden local media stream has started; this does not prove an unobstructed lens view or useful frames. |
| `permission-denied` | blocked | no stream | A permission or security rejection prevented stream creation. |
| `unavailable` | unavailable | no stream | A missing, busy, unreadable, or unsupported camera prevented stream creation. |
| `disconnected` | lost | no stream | A previously active camera track ended unexpectedly. |
| `failed` | failed | no stream | Local model, playback, transfer, worker, or inference startup/runtime failed. |

Every row reports the physical shutter as `NOT SENSED` and instructs the user
to check it directly. The current software has no shutter-sensor input and no
state that can represent a physical shutter position.

`STREAM ACTIVE` means only that `getUserMedia` returned a stream and the hidden
video element started playback. It does not mean that a first useful frame has
arrived, a body is visible, landmarks are healthy, actions are enabled, or the
physical shutter position is known. Tracker health and body-signal availability
remain separate UI surfaces.

## Failure handling

Browser start failures are reduced to a closed software state before visible
fallback copy is produced:

- `NotAllowedError` and `SecurityError` become `permission-denied`;
- `NotFoundError`, `NotReadableError`, and `OverconstrainedError` become
  `unavailable`; and
- every other value becomes `failed`.

Provider exception messages are not appended to camera-start fallback copy.
Replay starts automatically after a failed start, while camera retry,
controller, and keyboard paths remain available. Runtime tracker health still
controls whether motion actions are allowed.

## Evidence completed

- Unit coverage enumerates every tracker-to-camera state transition, every
  bounded start-failure classification, and every visible presentation.
- Unit coverage rejects accidental affirmative shutter-position copy.
- Browser coverage exercises disabled, active, stopped, permission-denied, and
  runtime-failed presentation; confirms the shutter remains unsensed; and
  confirms provider exception text is not displayed after permission denial.
- Existing browser coverage separately exercises local-only capture, raw-frame
  non-persistence/non-egress, worker fallback, worker crash, and retry.

This evidence proves the software truth boundary in the checked build only. It
does not complete I-046's physical optical-blocking or across-room usability
requirements.

## Remaining physical evidence

I-046 remains incomplete until the exact camera/enclosure candidate has:

1. an optical-blocking test showing that the physical shutter blocks the lens;
2. a hardware and software indicator truth table observed during start, active,
   stop, permission denial, disconnect, failure, idle, suspend, and recovery;
3. an across-room comprehension test with the intended household personas;
4. reachability and visibility checks from outside the active play zone; and
5. evidence that capture and truthful activity indication stop after tracking,
   idle, and suspend.

The questions and safe defaults for that work are recorded in
`docs/OWNER_QUESTIONS_CAMERA_STATE_2026-07-25.md`.
