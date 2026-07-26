# Owner questions: hosted-game post-ready liveness

Last updated: 2026-07-24

The supervised browser now contains a strict desk-only v1 challenge/ack
candidate. These questions do not block its bounded tests. They block
production admission, timing, recovery behavior, and any claim that a hosted
game remains playable after initial readiness.

## HBL-001: signed wrapper binding

Which exact reviewed wrapper artifact and version may install
`globalThis.vcgHostedLifecycleV1`, and which signed catalog/admission record
binds that wrapper to a hosted release?

Safe default: no game inherits qualification by ID or origin. Bind the exact
wrapper digest, hosted release/deployment identity, contract version, and
timing envelope in reviewed admission state. Re-review any changed wrapper or
authority-bearing deployment boundary.

## HBL-002: production timing

Should production retain the desk candidate of a one-second challenge,
two-second acknowledgement deadline, and two consecutive misses?

Safe default: keep those values explicitly desk-only. Select target values
from foreground frame-time and main-thread-stall distributions on both
hardware tiers under representative games, overlays, controller input,
network transitions, and storage pressure. Preserve a fixed upper bound and
never let page JavaScript extend it.

## HBL-003: suspension semantics

What happens to liveness deadlines while a console-owned overlay, system idle,
display-mode transition, or visibility suspension is active?

Safe default: the native browser owner explicitly pauses challenges only while
it also owns and records the covering state; on resume require a fresh exact
acknowledgement before returning control. A page visibility event, focus claim,
or hidden iframe cannot pause its own deadline.

## HBL-004: recovery surface

Which controller-safe actions follow a missing, lost, invalid, or timed-out
contract: Retry, Return to launcher, a bounded automatic restart, or different
choices by failure?

Safe default: first freeze input and show one console-owned overlay with Return
to launcher always available. Do not auto-restart until the native scope can
prove descendant cleanup and a reviewed per-release policy selects a bounded
attempt count. Never let the page render or choose its terminal recovery.

## HBL-005: truthful non-hang states

How do reviewed wrappers report login-required, offline, service-unavailable,
permission-required, storage-full, and maintenance states without confusing
them with a heartbeat timeout?

Safe default: add a separate closed, bounded, non-authoritative status
contract. Continuing acknowledgements may prove the wrapper responds while
the console shows the exact service state; they must not convert that state
into playability. Unknown or contradictory status fails to a generic
recoverable service error, not a fabricated hang diagnosis.

## HBL-006: qualification evidence

Who owns the representative wrapper review and the ordinary x86-64 Linux plus
ARM64 campaigns?

Safe default: require exact early/late/missing/replayed/spoofed acknowledgements;
top-level reload and redirect; iframe/popup/service-worker attempts;
main-thread infinite loops and promise/microtask starvation; renderer and
browser crash; network/login/storage faults; overlay and suspend transitions;
reserved Home/Back/Pause; target compositor focus; service/cgroup cleanup; and
complete timing distributions before closing Q-250 or qualifying I-180.
