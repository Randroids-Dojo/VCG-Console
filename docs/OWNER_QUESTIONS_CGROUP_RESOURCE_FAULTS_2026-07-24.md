# Owner questions: native cgroup resource faults

Last updated: 2026-07-24

The Rust host now has an unwired Linux probe that binds a retained
`memory.events` handle, snapshots hierarchical `oom_kill` before each attempt,
and treats only a counter increase as `out-of-memory`. It does not configure
memory control or prove a production scope.

## Q-248: memory-controller and OOM recovery policy

What exact memory-controller configuration defines a trustworthy game OOM on
Raspberry Pi OS and ordinary x86-64 Linux, and should one such event consume
the existing single bounded watchdog restart?

Safe default:

- use the exact per-launch non-root cgroup selected under Q-247;
- require the unified cgroup-v2 memory controller and hierarchical
  `memory.events`;
- baseline `oom_kill` immediately before each child attempt, after proving the
  scope empty;
- set `memory.oom.group=1` for a contained game workload unless target evidence
  shows an essential host-owned helper must remain outside the kill group;
- keep host/launcher/tracker/compositor services outside the game subtree;
- classify only an `oom_kill` increase as `out-of-memory`; ordinary `low`,
  `high`, `max`, or `oom` pressure is diagnostic evidence, not kill authority;
- consume the same bounded restart budget and return to the launcher after
  exhaustion; and
- never accept a child token, exit code, log message, or browser report as
  equivalent kernel evidence.

Decisions required before wiring:

1. Select exact `memory.max`, `memory.swap.max`, `memory.oom.group`, ancestor
   limits, and per-tier headroom.
2. Define whether a first OOM retries once, fails immediately for some
   packages, or disables the package pending support action.
3. Define how the service proves the scope is empty before baseline and cannot
   be reused across unrelated launches.
4. Decide which signed package/runtime capability may opt into watchdog
   restart after OOM.
5. Define the user-visible closed message and diagnostic code without exposing
   process IDs, paths, memory contents, or free-form kernel logs.
6. Keep GPU-reset detection a separate target/driver question; do not infer it
   from cgroup memory evidence.

Evidence needed to close Q-248:

- exact target kernel/systemd/cgroup controller inventory;
- selected unit properties and inspected effective controller files;
- real contained leaf/descendant/group OOM injection on both target classes;
- races between OOM counter update, direct-child exit, descendant survival,
  cancellation, and restart;
- scope empty/baseline/reuse and counter rollover/recreation tests;
- host-service survival, launcher recovery, save integrity, and bounded
  diagnostic behavior; and
- repeated memory-pressure/thermal/game-load runs establishing safe per-tier
  limits rather than selecting them from desk fixtures.
