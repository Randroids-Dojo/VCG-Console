# Owner questions: package retention

Last updated: 2026-07-24

No answer here blocks the read-only planner or explicit crash-recoverable cleanup primitive. Automatic deletion remains disabled until these product choices and target process/filesystem evidence are resolved.

## Q-113: retained generation budget

How many complete signed generations should each console retain during ordinary operation, and should the bound be a generation count, reserved byte budget, or both?

Safe default: retain at least the two newest activated generations and stop cleanup before the device's separately qualified reserved-free-space threshold is threatened. Treat the exact count and byte budget as hardware-tier policy after representative package-size and rollback drills.

## Q-114: cleanup while games may be running

May maintenance remove a retired generation while a game launched from that generation is still active?

Safe default: no. Durable launches bind active or restart-ambiguous generations, and explicit cleanup holds a host-only launch-maintenance lease while it derives protection, validates history, publishes its durable intent, and deletes under the generation-store operation lock. Restart recovery re-derives protection and refuses a target that has become retained or protected.
