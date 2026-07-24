# Owner questions: durable launch replay

Last updated: 2026-07-24

The Rust host now has a fail-closed durable replay primitive. These questions select the production service and retention policy without weakening the implemented rule that an indeterminate accepted request is never automatically executed again.

## Q-123: journal lifetime and boot epoch

Should retained launch dispositions survive an operating-system reboot, or should the production service scope them to one verified boot epoch?

Safe default: have the service manager supply a protected boot-scoped journal root or a host-created boot epoch whose transition is explicit and auditable. Do not silently replay or discard records outside the selected scope. Preserve the 64-record and 128-event implementation ceilings, add an age bound, and keep indeterminate requests non-executable in every scope.

## Q-124: trusted descendant-cleanup proof

Which production component owns the game process group and is authorized to clear `LAUNCH_RESTART_CLEANUP_REQUIRED` after a host crash?

Safe default: the service manager owns a cgroup or equivalent process group, proves it empty after terminating survivors, and only then invokes native startup code that calls `acknowledge_restart_cleanup`. Never expose the acknowledgement to the browser, hosted content, a game process, or the ordinary loopback API.

## Q-125: retention, audit, and privacy

How long should terminal launch intent remain for replay and diagnostics, and which operator-visible audit facts are allowed?

Safe default: retain no more than the implementation's 64 records and the selected boot/age window. Store only opaque request, game, profile, lifecycle, and stable detail/exit facts already required by the protocol. Do not add paths, commands, process IDs, tokens, user display names, or free-form child errors. Protect the directory as privileged service state and document reset/export behavior.
