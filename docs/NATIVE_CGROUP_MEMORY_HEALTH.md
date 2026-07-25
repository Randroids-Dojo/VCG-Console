# Native cgroup-v2 memory health candidate

Status: bounded Linux OOM-evidence candidate implemented and tested on Ubuntu
WSL2; not wired to authenticated package launch and not target-qualified.

## Purpose

The watchdog already accepts closed `gpu-reset` and `out-of-memory` reasons,
but its optional file token does not itself prove an operating-system fault.
`CgroupV2MemoryHealthProbe` is a Linux candidate that combines the existing
host-selected heartbeat path with the exact hierarchical cgroup-v2
`memory.events` control for one process scope.

The Linux kernel defines `oom_kill` as the number of processes in the cgroup
hierarchy killed by an OOM killer. The adapter uses that counter rather than
interpreting memory pressure, `memory.high`, `memory.max`, allocation failure,
exit codes, or child-written text as an OOM kill. Authoritative reference:
[Linux kernel cgroup-v2 documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html).

## Exact binding and attempt flow

Construction requires a host-selected absolute existing cgroup scope. It:

1. opens the scope directory with `O_DIRECTORY`, `O_NOFOLLOW`, and
   `O_CLOEXEC`;
2. opens hierarchical `memory.events` read-only and no-follow relative to the
   retained directory descriptor;
3. requires a regular kernel-style control;
4. validates the initial document within 1,024 bytes; and
5. retains that control handle across later path replacement.

Before each watchdog attempt, `reset()` removes stale heartbeat state and
records the current `oom_kill` baseline. Polling:

- returns the existing heartbeat result when `oom_kill` is unchanged;
- returns `out-of-memory` when it increases by any positive amount;
- rejects a decrease as invalid evidence; and
- rejects missing, duplicate, noncanonical, overflowing, malformed, non-UTF-8,
  or oversized counters.

The document may add other lowercase/underscore counter keys in any order, but
every value must remain a canonical unsigned decimal. Exactly one `oom_kill`
is required.

The watchdog now asks a probe for trusted terminal resource-fault evidence
after the direct child is reaped but before classifying its exit. This closes
the race where an OOM-killed child becomes a generic process exit. The default
hook returns no fault, so heartbeat-only probes retain immediate ordinary
completion. The existing fixed fault-file probe checks only its separate
resource token in that terminal hook; heartbeat absence or corruption cannot
override an already completed process.

## Authority boundary

This candidate does not choose or create the cgroup, attach a process, enforce
memory limits, configure `memory.oom.group`, prevent process escape, or select
watchdog recovery. Browser, game, package, manifest, heartbeat, and journal
inputs cannot select the scope or write the retained counter.

An increase is authoritative only if the production service has proven that:

- the scope belongs to exactly the current launch attempt;
- every relevant descendant is inside it before package code executes;
- unrelated processes cannot enter it;
- game code cannot move itself or descendants out;
- the memory controller and hierarchical counter are enabled and correctly
  delegated; and
- a stale scope/counter cannot be reused for a later attempt.

Q-247 owns the common service/cgroup lifecycle. Q-248 owns the memory-specific
controller, limit, group-kill, scope-reuse, and recovery policy.

## Automated evidence

Four portable tests cover:

- strict bounded `memory.events` parsing;
- terminal resource-fault precedence over generic nonzero process exit; and
- malformed terminal evidence as bounded invalid-probe recovery; and
- terminal parsing of the existing fixed resource-fault token.

Four Linux tests cover:

- per-attempt baseline, heartbeat coexistence, and OOM increase;
- counter-decrease and malformed-evidence refusal;
- retained-handle resistance to scope-path replacement; and
- relative, missing, and symlink-control refusal.

These are regular-file Ubuntu WSL2 fixtures. They prove parser, binding, and
watchdog ordering only; they do not inject real memory pressure or observe a
kernel OOM kill.

## Remaining qualification

- Resolve Q-247 and Q-248 before wiring.
- Prove atomic child attachment and descendant containment in the same scope
  used by cleanup and memory health.
- Select and test `memory.max`, `memory.oom.group`, ancestor limits, swap, and
  protected-task behavior without treating ordinary pressure as a kill.
- Inject real leaf and descendant OOM kills, partial/group kills, fork storms,
  successful exits racing counter updates, and restart attempts.
- Verify cgroup removal/recreation cannot redirect or replay a baseline.
- Keep GPU-reset evidence separate and implement it only for a qualified
  driver/compositor producer.
- Qualify ordinary x86-64 Linux and Raspberry Pi OS under the final
  kernel/systemd/mount/LSM configuration.
