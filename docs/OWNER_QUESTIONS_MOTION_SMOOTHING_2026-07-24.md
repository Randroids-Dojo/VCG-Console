# Owner questions: motion smoothing

Date: 2026-07-24

The deterministic normalized-point comparison is complete without these
answers. They gate action/profile selection and real-player evidence. No
answer is assumed.

## Q-217: smoothing acceptance and stream architecture

What first-product acceptance thresholds should govern jitter, step response,
false actions, and perceived control lag, and should games receive both
unsmoothed and profile-smoothed landmark streams?

The synthetic comparison shows that one aggregate score is unsafe: the
constant-velocity Kalman default is excellent on a ramp but poor at an abrupt
step/reversal; One Euro and EMA occupy different jitter/lag points; and
passthrough retains transient fidelity with visible noise. The choice also
changes whether standardized action recognition and custom landmark mechanics
observe the same temporal signal.

Safe default:

- keep the canonical source frame unsmoothed internally;
- suppress missing landmarks rather than predicting visible/control points;
- apply a declared, versioned smoother only inside each action/profile
  pipeline;
- expose no second smoothed landmark stream to games until capability,
  timestamp, and double-smoothing semantics are specified;
- measure exposure-to-action latency, trigger precision/recall, false
  triggers, reacquisition, and a real gameplay task together; and
- do not select a universal filter or tolerance from the synthetic aggregate.

Please identify any maximum acceptable 90% step response below the existing
120 ms p95 exposure-to-action envelope and whether custom games need a
separately negotiated smoothed landmark profile.

## Q-218: minimized paired smoothing session

May I coordinate one consented adult-first session that records synchronized
skeleton-only MediaPipe and RTMO outputs for I-051, I-053, I-057, I-062, and
the Q-214/Q-215 evidence plan?

The useful session needs:

- exact camera/backend/runtime/parameter and timestamp provenance;
- quiet stance, slow reach, fast reach, abrupt direction reversal, short
  occlusion, tracking loss, and relevant action/game blocks;
- paired raw backend landmarks plus any exact backend-native-smoothed output
  the same invocation can expose;
- pre-registered filter grids, training/held-out segmentation, and action
  scoring;
- no raw-video retention by default;
- explicit consent, stop, access, deletion, and retention procedures; and
- no child participation until the separate child/privacy requirements are
  approved.

Safe default:

- do not schedule or capture participants yet;
- use generated traces only for method and regression work;
- share one minimized session across the related investigations rather than
  duplicating recordings; and
- keep camera frames ephemeral unless you approve a specific encrypted
  retention/review/deletion plan.
