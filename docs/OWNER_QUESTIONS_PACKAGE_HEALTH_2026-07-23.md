# Owner questions: package health qualification

Last updated: 2026-07-23

No answer here blocks the isolated software health gate. The implementation uses the conservative defaults below and keeps product qualification open.

## Q-115: process-health observation window

For packages that cannot emit an explicit ready signal, should `process` health require survival for the complete signed `launch.timeoutMs`, or use a separate shorter smoke-test duration?

Safe default: require survival for the complete signed window. Treat this only as compatibility smoke evidence, never usable or visible readiness. A later separate duration requires a new signed manifest field/version rather than an unsigned host default.

## Q-116: explicit-ready producer authority

May an ordinary game process self-assert `explicit-ready`, or must the signal come from a separately qualified runtime wrapper/compositor observer?

Safe default: accept the mechanism for candidate gating only when the exact signed release includes a reviewed producer contract. A self-written token proves cooperation, not trustworthy window readiness or containment. Keep compositor/window readiness as a separate host-owned observation and do not assign explicit-ready qualification by game ID alone.
