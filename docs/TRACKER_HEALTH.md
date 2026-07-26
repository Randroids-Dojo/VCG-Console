# Tracker health and degraded control

Last updated: 2026-07-24

Motion API `0.3.0` introduced tracker health transitions outside pose frames; current `0.4.0` retains those semantics unchanged. A frame still carries its source-local health snapshot, but a versioned `TrackerHealthEvent` remains deliverable when no frame exists—for example while a camera is unavailable, a backend restarts, or a stream disconnects.

## Event contract

Every event contains only:

- exact `schemaVersion`;
- a strictly increasing source-host sequence;
- `source`;
- monotonic `occurredAtMs`;
- coherent `status`, `reason`, and `controlAvailability`.

Arbitrary provider exceptions, device names, camera labels, paths, participant identifiers, and raw-frame data are not wire fields. The local operator UI may show a separately bounded diagnostic detail, but a cooperative game receives only the stable event vocabulary.

| Status | Reasons | Control availability | Required behavior |
|---|---|---|---|
| `starting` | `initializing`, `restarting` | `blocked` | No player data or motion actions; retain independent controller/keyboard recovery. |
| `ready` | `healthy` | `full` | Valid negotiated landmarks and standardized actions may be consumed. |
| `degraded` | `low-confidence`, `overload`, `fallback-backend` | `landmarks-only` | Landmarks may support visible feedback; standardized actions are empty and active holds are cleared. |
| `fault` | `camera-unavailable`, `camera-disconnected`, `backend-fault` | `blocked` | No player data or motion actions; freeze active play and offer restart/controller recovery. |

The global degraded policy is deliberately conservative. It does not authorize landmark extrapolation or silently preserve a partially completed action. Exact per-limb confidence thresholds, missing-body behavior, and whether a qualified game pauses rather than continues landmarks-only remain Q-039/I-063 evidence work.

## Frame invariants

- A `starting` or `fault` frame has no players.
- Any non-`ready` frame has no standardized actions.
- A degraded frame may carry observed/unobserved landmarks so the shell can explain what the tracker understands.
- Recovery does not resume a hold from its pre-degradation duration. A new ready sample must begin a new candidate.
- Motion API `0.2.0` consumers are incompatible with this contract. Version `0.3.0` was issued rather than silently changing `0.2.0` meaning.

## Cooperative bridge behavior

Bridge protocol v2 continues to bind the exact Motion API version during hello/welcome. The welcome includes the host's current health event, so a late client does not infer readiness from connection success. Later `vcg.motion.health` messages carry ordered transitions outside the acknowledgement-limited frame stream.

The host rejects:

- a frame whose source or health differs from current health;
- a non-increasing health sequence;
- a health timestamp that moves backwards;
- an incoherent reason/status/control combination;
- legacy Motion API `0.2.0` peers before session creation.

Health events do not grant capabilities, origin trust, launch authority, or raw-camera access. Frame profile projection and exact origin/source checks still apply independently.

## Browser lab evidence

The Motion Lab has visible Ready, Low confidence, Overload, Restart, and Disconnect fixtures. Status is redundant in badge text, title, detail, border treatment, and `FULL`, `LANDMARKS ONLY`, or `CONTROLLER ONLY` availability. The actual browser tracker emits initializing/restarting, healthy worker, fallback-backend, camera-unavailable/disconnected, and backend-fault transitions. A real Chrome fixture injects an uncaught exception into the live inference worker, proves the tracker stops and reports `backend-fault`, and then proves an explicit Start Camera retry creates a distinct fresh worker before returning to Ready. Same-origin and sandboxed cross-origin Chrome fixtures also display welcome-time health, later overload, recovery, reload, and return-after-hostile-navigation state.

The fixture proves deterministic contract and UI behavior, not the thresholds that should produce low-confidence or overload on real hardware. It does not select automatic retry, retry limits, or fallback policy after a runtime crash. Real camera disconnects, sustained overload, repeated crash recovery, per-limb loss, game pause behavior, accessibility comprehension, and ARM64/x86-64 latency remain qualification work.
