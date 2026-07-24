# Owner questions: package transfer

Last updated: 2026-07-23

No answer here blocks the implemented transport-neutral durable sink.

## Q-120: production download transport

What network source, TLS trust, proxy, mirror, authentication, and HTTP range policy should production package downloads use?

Safe default: implement no embedded network client until release discovery and signing roles are fixed. A future client must receive the signed descriptor first, use ordinary validated TLS, treat redirects/mirrors/range responses as untrusted byte sources, feed exact sequential offsets into the durable sink, and require the final signed hash regardless of transport claims.

## Q-121: abandoned partial retention

How long should incomplete package transfers remain resumable, and when may low-space cleanup remove them?

Safe default: never remove an open/locked transfer; keep a closed partial until an explicit bounded age/space policy exists; expose only transaction-safe metadata; and delete state plus partial together under the same service ownership. Do not reclaim active generations, saves, managed content, or a verified ready archive as implicit transfer cleanup.

A verified ready archive retains its immutable release-binding state. The future intake coordinator should remove the ready archive and binding together only after it has durably consumed or deliberately abandoned that exact release.

## Q-122: update bandwidth and scheduling

What foreground/background bandwidth limits, retry cadence, metered-network behavior, and player-session deferral policy should package downloads use?

Safe default: do not begin a background transfer during latency-sensitive play; cap retry attempts with jittered backoff; expose pause/resume explicitly; and never let scheduling policy weaken exact offsets, signed-length limits, capacity checks, or final hash verification. Target-network and concurrent-play measurements should set numeric limits.
