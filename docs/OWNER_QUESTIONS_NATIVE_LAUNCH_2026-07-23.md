# Owner questions: native launch qualification

Last updated: 2026-07-24

No answer here blocks the current desk implementation. The host uses the safest reversible limits available now: one active child, bounded durable lifecycle, explicit cancellation, no readiness claim, and no automatic retry after host failure.

## Q-108: cross-restart launch replay

Should a request remain idempotent across Rust-host/service restart, across one operating-system boot, or only while its original host process remains alive?

Implemented primitive: the host now persists a bounded crash-safe journal, never re-executes an indeterminate request, and blocks fresh execution behind a native-only cleanup barrier. Production still needs the service manager or cgroup to prove every old game descendant is gone, the selected boot scope, and age-based retention. Those deployment choices are isolated in [the July 24 replay questions](OWNER_QUESTIONS_LAUNCH_REPLAY_2026-07-24.md).

## Q-109: authoritative window readiness

Should readiness require only compositor observation, or compositor observation plus a cooperative runtime heartbeat?

Safe default: require the compositor to identify a visible, correctly contained game window associated with the host-owned process group. Treat a runtime heartbeat as additional health evidence, never as proof that the intended window is visible. Keep the launcher in progress and allow cancellation until both the runtime-specific minimum and compositor gate pass.

## Q-110: lifecycle delivery

Should the final local lifecycle use short polling, bounded long-polling, server-sent events, or a replacement local transport?

Safe default: preserve monotonically increasing sequence numbers and resumable state regardless of transport. Measure short polling first because it is already bounded and easy to audit; prefer bounded long-polling if it materially reduces wakeups without weakening cancellation, shutdown, response limits, or reconnect behavior. Do not select a push mechanism before target-Linux process and navigation threat tests.

Profile identity and key hierarchy remain Q-107 and Q-105 in [the installed-catalog questions](OWNER_QUESTIONS_INSTALLED_CATALOG_2026-07-23.md).
