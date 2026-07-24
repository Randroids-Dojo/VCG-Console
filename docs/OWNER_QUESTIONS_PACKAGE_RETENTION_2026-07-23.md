# Owner questions: package retention

Last updated: 2026-07-23

No answer here blocks the read-only cleanup planner. Actual package deletion remains disabled until these product choices and process-coordination evidence are resolved.

## Q-113: retained generation budget

How many complete signed generations should each console retain during ordinary operation, and should the bound be a generation count, reserved byte budget, or both?

Safe default: retain at least the two newest activated generations and stop cleanup before the device's separately qualified reserved-free-space threshold is threatened. Treat the exact count and byte budget as hardware-tier policy after representative package-size and rollback drills.

## Q-114: cleanup while games may be running

May maintenance remove a retired generation while a game launched from that generation is still active?

Safe default: no. The native coordinator must prove that no live child, restart attempt, or prepared launch references a generation before deleting its activation marker or files. Until that ownership is implemented and tested, expose only a read-only cleanup plan.
