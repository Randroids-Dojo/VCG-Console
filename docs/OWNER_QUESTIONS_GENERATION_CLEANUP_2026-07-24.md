# Owner question: generation cleanup

Last updated: 2026-07-24

No answer here blocks generation binding, serialized store operations, or launch-frozen read-only cleanup planning. Actual deletion remains disabled.

## Q-126: automatic cleanup trigger

When crash-recoverable deletion is implemented under the existing launch-maintenance and package-store leases and target failure tests pass, should old unprotected package generations be removed automatically during ordinary idle maintenance, only under qualified low-space pressure, or only through an explicit owner action?

Safe default: perform bounded automatic cleanup only during an idle maintenance window, never while a launch, promotion, recovery, or cleanup acknowledgement is in progress. Preserve the configured rollback floor and every protected generation, stop on the first ambiguous or failed mutation, and surface low-space state rather than weakening those protections. Keep a deliberate diagnostic/manual trigger for testing and recovery, not as the only household maintenance path.
