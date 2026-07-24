# Owner questions: package watchdog qualification

Last updated: 2026-07-23

No answer here blocks the current desk implementation. The host uses explicit game-scoped configuration, bounded retry, cancellation, and no compositor-readiness claim. Direct RetroArch remains process-only.

## Q-111: exact release binding

Should watchdog qualification be bound to an exact installed package version and signed artifact identity, or may a later release with the same game ID inherit it?

Safe default: never inherit qualification by game ID alone. Add a signed installed-package health capability that binds the exact release, target, frontend or wrapper digest, heartbeat protocol version, and policy envelope. Require requalification after any bound artifact or capability changes. Treat the current `--watchdog-game-id` option as desk-only service configuration against the catalog loaded for that host process.

## Q-112: health producer ownership

Should the production heartbeat come from a cooperative signed wrapper, a compositor/session observer, or both?

Safe default: use a signed least-privilege wrapper for runtime liveness and a separate trusted compositor observer for the visible contained window. Require both where the runtime supports cooperation; never let either signal substitute for the other. Protect host probe channels from the child before accepting GPU/OOM or compositor events as authoritative.

Cross-restart replay and authoritative readiness remain Q-108 and Q-109 in [the native-launch questions](OWNER_QUESTIONS_NATIVE_LAUNCH_2026-07-23.md).
