# Owner questions: motion rule baselines

Date: 2026-07-24

The deterministic core17 rule baseline is complete without this answer. The
question gates Motion API vocabulary and game-facing authority. No answer is
assumed.

## Q-219: Lean, Reach, and Punch action vocabulary

Should any of Lean, Reach, or Punch become a standardized Motion action in the
first product, or should they remain landmark-level examples for individual
games?

Current Motion `0.4.0` standardizes Jump, Duck, and left/right Dodge for the
obstacle profile. The new baseline deliberately emits Lean, Reach, and Punch
only as internal research labels. Promoting one would require:

- exact semantic direction, start/hold/trigger/end/cancel behavior;
- collision/priority rules with shell Back, Pause, Select, and other game
  movements;
- body-relative versus floor/world coordinate requirements;
- one-handed, seated, and limited-range alternatives;
- calibration, smoothing, hysteresis, cooldown, and confidence semantics;
- false-action and fatigue evidence for children and adults;
- permissions and capability negotiation;
- cross-backend conformance; and
- a versioned Motion schema and client compatibility plan.

Safe default:

- keep Lean, Reach, and Punch outside the standardized wire vocabulary;
- let a custom game consume negotiated core17 landmarks for those mechanics;
- retain them as labeled trials in the household benchmark;
- do not map a Punch onto another existing action;
- qualify Jump/Duck/Dodge first; and
- reopen the vocabulary only when one concrete owned game needs a shared
  mechanic and held-out real-player evidence shows it can meet the safety,
  false-action, accessibility, and latency gates.

If one should be standardized now, please identify the exact first game and
side effect that needs it. That concrete mechanic is necessary to define the
right lifecycle and failure policy.
