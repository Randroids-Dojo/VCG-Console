# Owner question: generation cleanup

Last updated: 2026-07-24

No answer here blocks generation binding, serialized store operations, launch-frozen planning, or the explicit crash-recoverable cleanup primitive. Automatic cleanup remains disabled.

## Q-126: automatic cleanup trigger

The host can now explicitly remove a bounded set of old unprotected package generations under the existing launch-maintenance and package-store leases, with restart recovery and desk failure tests. After target-Linux power-loss/lock qualification, should this run automatically during ordinary idle maintenance, only under qualified low-space pressure, or only through an explicit owner action?

Safe default: keep automatic scheduling disabled until target evidence and the generation/byte policy are selected. The eventual scheduler should perform bounded cleanup only during an idle maintenance window, never while a launch, promotion, recovery, or cleanup acknowledgement is in progress. Preserve the configured rollback floor and every protected generation, stop on the first ambiguous or failed mutation, and surface low-space state rather than weakening those protections. Keep a deliberate diagnostic/manual trigger for testing and recovery, not as the only household maintenance path.
