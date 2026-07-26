# Owner questions: boot, resume, and launch timing — 2026-07-25

I-023 now has a strict zero-result campaign plan. These questions cover the
remaining choices that cannot be inferred safely from D-095 and D-106.

## Q-270: ordinary x86-64 Linux quick-resume mechanism

Should the selected ordinary x86-64 native-Linux premium reference use
platform suspend or a low-power launcher-idle state as its default quick-resume
mechanism?

Why this matters:

- D-095 assigns suspend to Steam Machine and low-power idle to Raspberry Pi,
  but does not explicitly select the ordinary-PC mechanism introduced by
  D-119;
- suspend may reduce power while increasing driver, controller, camera,
  compositor, storage, and update recovery risk; and
- launcher idle is simpler but may consume materially more energy and needs an
  exact game-disposition and workload-quiescence policy.

Proposed default:

- leave the ordinary-PC strategy unset until Q-267 and Q-268 identify its exact
  hardware and native-Linux tuple;
- compare both mechanisms read-only where the target supports them;
- select only after repeated power, privacy, wake, state-integrity, controller,
  camera, update, and thermal evidence; and
- keep the same 5-second user-visible resume gate regardless of mechanism.

## Q-271: cross-tier idle power, resume energy, and transition-temperature gates

What numeric idle/suspend watts, resume energy, and maximum transition
temperature should qualify each target in I-023?

Why this matters:

- D-095 requires measured low-power behavior but does not set a numeric power
  or energy ceiling;
- a fast wake can still waste energy or cause unsafe thermal cycling; and
- different meters, sample rates, stabilization windows, AC power factors, and
  ambient conditions can make superficially similar numbers incomparable.

Proposed default:

- keep all power, energy, and transition-temperature values `null` and blocking;
- reuse Q-269's selected premium-x86 values rather than creating conflicting
  thresholds;
- separately freeze Pi and optional-Steam thresholds before execution; and
- require calibrated meter identity, sample rate, stabilization window,
  ambient conditions, uncertainty, and complete traces around every transition.

## Q-272: physical timing harness and interaction oracle

Which exact external timing harness, controller/input injector, visible-feedback
observer, power-control boundary, and per-path interaction oracle should be
used for the 480 declared trials?

Why this matters:

- the clock must span power-off and suspend/idle intervals;
- process timestamps cannot observe physical power application reliably;
- first pixels, load, readiness, liveness, and a UI label are weaker than the
  required controller response and hardware privacy-state evidence; and
- automated power and input control can become destructive or unsafe if the
  target, recovery path, or operator stop procedure is ambiguous.

Proposed default:

- permit no physical run until exact harness, calibration, target connection,
  monotonic clock, input action, response oracle, stop conditions, run order,
  environment schedule, artifact schema, and operator protocol are digest-bound;
- schedule 320 required x86/Pi trials separately from the optional 160 Steam
  trials;
- preserve every failed, invalid, retried, and interrupted attempt; and
- request separate physical power-control and hosted-network exercise authority
  after the non-destructive plan review.
