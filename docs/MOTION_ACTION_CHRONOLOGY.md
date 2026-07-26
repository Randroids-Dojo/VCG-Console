# Motion action chronology boundary

The console-lab action recognizer treats frame continuity as action authority,
not merely as telemetry. A frame can contribute to calibration, gesture
progress, or an action only while all of these invariants hold within one
explicit tracker epoch:

- sequence is a non-negative safe integer and strictly increases;
- source and timestamp-quality identifiers do not change;
- source and publication timestamps do not regress; and
- `source <= inference start <= inference completion <= publication`.

A gap in sequence values is permitted because upstream backpressure may drop frames.
Equal source or publication timestamps are permitted because clocks can have
coarser resolution than the producer cadence.

The first violation clears calibration, holds, latches, cooldowns, and local
join state, then latches one bounded fault code. The violating frame cannot
begin a replacement gesture. Later frames remain action-suppressed even if
their values appear valid. Recovery requires the existing explicit camera or
replay restart, which calls `ActionEngine.reset()` and creates a fresh epoch.

The shell projects the latched condition as a tracker backend fault, clears
players from the fault frame, records the ordered health event, freezes motion
control through the existing player-session path, and keeps controller and
keyboard recovery available. The invalid frame is not added to the skeleton
trace. Its timing can still increment the local invalid-timestamp diagnostic;
no latency claim is derived from it.

Action authority is also local to this recognizer. Every incoming player's
`actions` array is cleared before recognition, including players the current
one-player engine does not enrich. A producer therefore cannot smuggle an
already-triggered action through a schema-valid frame.

This is camera-free contract behavior. It does not establish real tracker
clock quality, choose action thresholds, qualify recovery usability, or prove
the exposure-to-action gate. There are no new owner choices: fail-closed
continuity and explicit restart follow the existing tracker-loss, action, and
controller-recovery decisions.
