# Owner questions: hosted-browser readiness and hang recovery

Last updated: 2026-07-24

The Node supervisor now requires the fixed initial marker
`html[data-vcg-ready="1"]` under the same bounded deadline as navigation and
document load. A load event no longer produces a `ready` phase. This does not
select the final game-side producer or post-ready liveness policy.

## Q-250: qualified readiness producer and post-ready recovery

What exact reviewed component may set hosted-game readiness, and what
subsequent signal distinguishes a responsive game from a loaded but hung,
logged-out, offline, or broken page?

Safe default:

- require each admitted hosted release to implement one reviewed wrapper that
  sets the fixed marker only after its controller input, reserved-action
  cooperation, Motion negotiation where applicable, save/storage handling,
  and initial recoverable error surface are installed;
- do not let an HTTP endpoint, service worker, arbitrary iframe, popup,
  document load, `document.readyState`, animation frame, or network response
  substitute for the top-level marker;
- treat the marker as an initial one-shot claim only, never proof of continuing
  responsiveness or compositor focus;
- use a host-clocked bounded post-ready challenge/acknowledgement contract
  owned by the reviewed wrapper, with missed challenges entering one fixed
  recovery overlay before termination;
- keep login-required, offline, service-unavailable, permission-required, and
  policy-violation states distinct rather than collapsing them into hang; and
- keep final termination/restart authority in the native host/service scope,
  unavailable to page JavaScript.

Decisions required:

1. Define the exact wrapper API/version and which signed admission record binds
   it to a hosted release.
2. Select the initial deadline by game class rather than silently accepting
   the current manifest value as production policy.
3. Select post-ready challenge interval, acknowledgement deadline, missed
   count, and maximum recovery attempts.
4. Define the controller-safe recovery overlay and whether Resume, Retry,
   Return to launcher, or a bounded automatic restart is offered per failure.
5. Define login and offline capability declarations plus the truthful
   user-visible state for each.
6. Decide whether visibility suspension, system idle, compositor overlay, and
   network transitions pause or reset liveness deadlines.

Evidence needed before closing Q-250:

- reviewed wrappers for representative hosted games;
- early/late/missing/repeated/spoofed marker tests across redirects and reloads;
- main-thread stalls, promise/microtask loops, renderer hangs/crashes, network
  loss, service-worker failure, login expiry, storage exhaustion, and server
  errors;
- proof that iframe/popup/foreign-origin code cannot satisfy the top-level
  contract or suppress host termination;
- controller Home/Back/Pause and recovery usability on the target compositor;
  and
- ordinary x86-64 Linux and ARM64 service/cgroup/browser qualification with
  exact timing distributions.
