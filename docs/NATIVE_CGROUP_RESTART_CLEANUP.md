# Native cgroup-v2 restart cleanup candidate

Status: bounded Linux candidate adapter implemented and tested on Ubuntu WSL2;
not wired to the launcher service and not qualified on either target.

## Purpose

A recovered indeterminate launch keeps fresh launch admission closed until the
host proves every process from the prior game scope is gone. The existing
`RestartCleanupRequest` and `VerifiedRestartCleanup` values bind that proof to
one in-process replay barrier. `CgroupV2RestartCleanupAdapter` now supplies a
candidate Linux implementation of the privileged operating-system step.

This does not make WSL2 or an arbitrary cgroup a production process manager.
Q-247 still selects the exact systemd/service owner, unit hierarchy, process
admission mechanism, permissions, boot scope, and target evidence.

## Kernel contract

The adapter follows the Linux kernel's cgroup-v2 interface:

- a non-root `cgroup.kill` accepts only `1` and kills the cgroup plus all
  descendants; and
- `cgroup.events` reports recursive `populated 0` only when the cgroup and its
  descendants contain no live process.

Authoritative reference:
[Linux kernel cgroup-v2 documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html).

The adapter does not parse process IDs, enumerate `/proc`, send individual
signals, trust a child heartbeat, or infer emptiness from the host process
exiting.

## Exact binding and flow

Construction requires an absolute existing scope directory and an explicit
bounded polling policy. On Linux it:

1. opens the scope directory with `O_DIRECTORY`, `O_NOFOLLOW`, and
   `O_CLOEXEC`;
2. opens `cgroup.kill` write-only and `cgroup.events` read-only relative to
   that retained directory descriptor, both with `O_NOFOLLOW`;
3. requires both retained controls to be regular kernel-style files;
4. validates one bounded initial events document; and
5. retains only those open controls, not a path used later for authority.

Cleanup is single-use. It writes exactly `1`, then immediately inspects the
retained events descriptor. Later inspections occur only under the explicit
policy. The hard ceiling is 256 inspections, at most 250 ms between
inspections, at most five seconds total sleep, and at most 512 bytes per
events read.

Exactly one `populated` field is required with value `0` or `1`. Duplicate,
missing, malformed, non-UTF-8, or oversized evidence returns `Unavailable`.
`populated 0` returns `Empty`; exhausting the policy with `populated 1`
returns `NotEmpty`. A second adapter invocation returns `Unavailable`.

Retaining the controls matters: replacing the configured directory path after
construction cannot redirect the later kill or inspection to another scope.
This does not defend a compromised kernel or privileged process that can
mutate the live cgroup hierarchy.

## Authority boundary

Only trusted startup code may construct this adapter and pass it to
`verify_restart_cleanup`. Browser, game, package, manifest, journal, diagnostic
record, and ordinary loopback inputs cannot choose:

- the cgroup path;
- the polling policy;
- whether the adapter is used;
- the returned inspection state; or
- which replay barrier receives the resulting proof.

`Empty` remains security authority. The production service must prevent every
game descendant from escaping or being moved out of the owned subtree before
cleanup. It must also prevent another process from entering the scope between
the kill and proof handoff. This candidate does not create a cgroup, attach a
process, configure systemd, remove the empty scope, or acknowledge replay by
itself.

## Automated evidence

Two portable tests cover the policy ceiling and strict bounded events parser.
Four Linux tests cover:

- one exact kill and empty proof followed by single-use refusal;
- retained `populated 1` and malformed-evidence denial;
- exact control-handle binding across scope-path replacement; and
- relative, missing, and symlink-control refusal.

The six focused tests and strict Linux Clippy pass under Ubuntu WSL2. That is a
development compatibility result only; it does not exercise a real delegated
cgroup or qualify ordinary x86-64 Linux, SteamOS, Raspberry Pi OS, systemd,
host restart, or hostile descendants.

## Remaining qualification

- Resolve Q-247 and pin the exact systemd unit/slice and service identities.
- Prove every launch starts inside the scope before package/game code runs and
  cannot migrate or fork outside it.
- Test real `cgroup.kill` and recursive `populated` transitions during host
  crash, child fork storms, process escape attempts, frozen tasks, and service
  restart.
- Bind the scope to the exact replay barrier without accepting a writable path
  or reusable scope identity.
- Qualify kernel, unified cgroup mount, delegation, ownership, modes, and LSM
  policy on ordinary x86-64 Linux and Raspberry Pi OS.
- Run timeout, reboot, power-loss, read-only, missing-control, and permission
  fault campaigns without ever releasing launch admission ambiguously.
