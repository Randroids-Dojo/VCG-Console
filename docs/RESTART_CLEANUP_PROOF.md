# Native restart-cleanup proof boundary

Status: exact in-process request/proof binding implemented; production
service-manager/cgroup adapter, boot scope, and target qualification are not
implemented.

## Purpose

Durable native-launch replay converts interrupted work into
`HOST_RESTARTED_INDETERMINATE`, preserves its package generation, and blocks
every fresh launch behind `LAUNCH_RESTART_CLEANUP_REQUIRED`. Clearing that
barrier asserts that no process from the prior launch can still use package,
save, input, display, or device authority.

A public no-argument acknowledgement cannot carry that proof. The
`restart_cleanup` module and `NativeLaunchService` now require an exact
non-serializable handoff before the durable barrier may be removed.

## Exact flow

1. A persistent launch service opens a journal containing a restart-cleanup
   barrier.
2. The service creates a fresh in-memory barrier identity. It is never written
   to disk or returned through the browser API.
3. Trusted startup code requests a non-cloneable opaque
   `RestartCleanupRequest` for that exact identity.
4. A privileged target adapter owns the prior game process scope, terminates
   survivors, and returns one closed result:
   - `Empty`;
   - `NotEmpty`; or
   - `Unavailable`.
5. `verify_restart_cleanup` invokes that adapter exactly once. Only `Empty`
   consumes the request into `VerifiedRestartCleanup`.
6. `acknowledge_restart_cleanup` consumes the proof, requires pointer identity
   with the service's current barrier, synchronously removes the durable
   barrier, and only then releases restart-ambiguous package protection.

Memory-only services and persistent services without a barrier cannot issue a
request. `NotEmpty` and `Unavailable` produce no proof. A proof from another
service, an earlier process, or an already-cleared barrier cannot acknowledge
anything.

## Authority boundary

The request and proof are Rust values with private fields. They are not
cloneable, serializable, or accepted by HTTP. Pointer identity is sufficient
for the in-process binding because a live proof retains the allocation; that
allocation cannot be reused for a later barrier while the stale proof exists.
Restart creates a different allocation and destroys every old proof.

`RestartCleanupAdapter` is a privileged platform boundary, not an automatic
security guarantee. Returning `Empty` grants authority to clear the barrier.
A production implementation must therefore be fixed by host configuration and
must not be implemented, selected, or influenced by:

- the browser launcher;
- hosted or local game content;
- a child game process;
- a manifest or package;
- the ordinary loopback API; or
- writable journal data.

## Closed failure behavior

- `NotEmpty` reports that descendants remain and leaves the barrier intact.
- `Unavailable` reports ambiguous/unavailable inspection and leaves the
  barrier intact.
- A stale or cross-service proof returns
  `RestartCleanupProofMismatch` and leaves the barrier intact.
- Journal persistence failure faults replay state and leaves launch admission
  closed.
- The browser-facing error mapper treats an impossible internal proof mismatch
  as generic replay unavailability; no proof identity or adapter detail is
  disclosed.

## Automated evidence

Four integrated native-launch tests cover:

- no request for memory-only or no-barrier services;
- `NotEmpty` and `Unavailable` invoking the adapter once and preserving launch
  denial;
- cross-service proof refusal;
- two requests for one barrier with the later stale proof refused after clear;
- no request after clear; and
- the original restart-indeterminate lifecycle, package-generation protection,
  matching proof, durable acknowledgement, and fresh-launch release.

Formatting, strict all-target Clippy, the complete native suite, and repository
gates must pass with this boundary.

## Remaining qualification

This contract does not prove that a real operating-system scope is empty.
Q-123 through Q-125 and I-109/I-209 still require:

- the exact systemd/cgroup or equivalent owner;
- a scope that includes every descendant and survives host-process failure;
- forced termination, empty verification, and race-free handoff;
- boot-epoch and journal-age retention policy;
- protected service configuration and journal permissions;
- launcher-service restart policy; and
- hostile-descendant, service-crash, reboot, power-loss, and target Linux
  evidence on ordinary x86-64 and ARM64.
