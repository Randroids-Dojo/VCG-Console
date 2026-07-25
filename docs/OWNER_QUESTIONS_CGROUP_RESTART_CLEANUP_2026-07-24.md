# Owner questions: native cgroup restart cleanup

Last updated: 2026-07-24

The Rust host now has a bounded Linux cgroup-v2 candidate adapter. It retains
the exact `cgroup.kill` and `cgroup.events` controls, writes the recursive kill
command once, and accepts only recursive `populated 0` as empty proof. It is
not wired or target-qualified.

## Q-247: production cgroup owner and scope lifecycle

Which exact privileged service creates, owns, populates, and retires one game
process scope on Raspberry Pi OS and ordinary x86-64 Linux, and how is that
scope bound to the native launch replay barrier across a host crash?

Safe default:

- use one systemd-managed non-root cgroup-v2 subtree per active launch;
- have a fixed root-owned launch service select the scope, never the browser,
  game, package, manifest, or writable journal;
- attach the child at creation before it can execute package code;
- deny migration out of the subtree and deny unrelated process entry;
- retain the scope until recursive kill plus `populated 0` has produced the
  exact in-process cleanup proof and durable barrier acknowledgement;
- use a short explicit polling policy within the implemented five-second hard
  ceiling, returning `NotEmpty` or `Unavailable` without reopening admission
  on timeout or ambiguity; and
- keep cleanup authority separate from package retention, save deletion,
  power handoff, diagnostics, and browser lifecycle state.

Decisions required before wiring:

1. Name the exact systemd service, slice/scope template, user/group, and
   delegation model on each target.
2. Define how process creation enters the cgroup atomically and how
   descendants are prevented from escaping or being moved by same-account
   code.
3. Define the durable binding between one replay barrier and one service-owned
   scope without storing an attacker-selectable filesystem path.
4. Select the polling attempts/interval within the hard ceiling and the
   operator-visible failure behavior.
5. Define when the empty cgroup is removed and how stale scopes are reconciled
   after reboot without killing an unrelated later process.
6. Pin the unified cgroup-v2 mount, kernel/systemd versions, ownership, modes,
   LSM policy, and service hardening for both targets.

Evidence needed to close Q-247:

- real target unit files and inspected cgroup hierarchy/mount evidence;
- hostile fork, double-fork, namespace, migration, frozen-task, and
  same-account escape tests;
- host crash and restart with surviving descendants;
- exact scope/replay binding and stale-scope non-reuse tests;
- kill/inspection timeout, missing control, permission, service restart,
  reboot, and sudden-power tests; and
- repeated ordinary x86-64 Linux and Raspberry Pi OS runs proving fresh launch
  admission never opens before the prior subtree is recursively empty.
