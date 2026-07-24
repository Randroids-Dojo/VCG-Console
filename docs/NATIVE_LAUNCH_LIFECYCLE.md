# Native package launch lifecycle

Last updated: 2026-07-23

This document defines the authenticated path from a signed installed package to a host-owned child process. It proves narrow intent, artifact verification, direct process start, observation, cancellation, cleanup, and opt-in bounded heartbeat recovery. It does not yet prove a visible or responsive game window, controller ownership, compositor containment, descendant containment, or target-Linux qualification.

## Authority and configuration

The launch capability exists only when `vcg-host launcher` receives:

- a valid signed installed catalog and all host-owned roots;
- at least one repeated `--profile-id <opaque-id>` option.

The profile list is privileged host configuration. The Svelte launcher may select one of those IDs but cannot create an accepted native profile merely by sending a new string. Catalog-only configuration continues to expose metadata without exposing process launch.

The host may additionally repeat `--watchdog-game-id <opaque-id>`. Every watchdog game must name a package in the signature-verified installed catalog. A selected game requires the default startup/heartbeat policy for every player profile; other games retain process-only observation when they do not implement a qualified heartbeat. Neither the browser nor a public manifest can enable this mode or select probe paths.

When launch is configured, `/v1/status` advertises `trusted-package-launch`. The browser still never supplies a program, path, hash, runtime adapter, argument, environment variable, content location, writable root, or qualification state.

## Start request

The trusted launcher generates a fresh 128-bit lowercase hexadecimal request ID and sends:

```http
POST /v1/launches
Authorization: Bearer <per-launch-capability>
Content-Type: application/json
```

```json
{
  "protocolVersion": "0.1.0",
  "requestId": "11111111111111111111111111111111",
  "gameId": "retro-2048",
  "profileId": "profile-randy"
}
```

The JSON rejects unknown fields and is limited to 1 KiB inside the existing 8 KiB request bound. The server rejects transfer encoding, duplicate or noncanonical content lengths, bodies on read methods, invalid request targets, unknown preflight headers, wrong origin, and wrong bearer authority.

The request ID is correlation and replay protection, not launch authority. Repeating the same ID with identical game/profile intent returns the retained lifecycle record without starting another child. Reusing it for different intent fails with `REQUEST_ID_CONFLICT`. A second ID cannot start another child while one launch is active.

Records are memory-only and idempotency currently lasts only for the originating Rust-host process. A host or operating-system restart does not prove that an old request is safe to execute again; durable replay disposition and descendant cleanup remain qualification work.

## Host-owned preparation

For an accepted intent, Rust:

1. verifies that the profile ID is in the host allowlist;
2. reserves a bounded lifecycle record before expensive work;
3. resolves the game through the signature-verified target catalog;
4. verifies the bound game manifest and exact runtime artifacts;
5. builds and prepares the contained RetroArch plan;
6. selects process-only or watchdog monitoring from the host-owned game configuration;
7. starts the executable directly without a shell and transfers ownership to a bounded monitor thread.

For a watchdog game, the host derives `vcg.heartbeat` below the already prepared private session directory and passes it in `VCG_HEARTBEAT_FILE`. Stale heartbeat data is removed before every attempt. The integrated path does not configure a resource-fault file: same-account direct children are not contained yet, so a trusted Linux cgroup/GPU producer cannot be distinguished from child spoofing at this boundary.

Preparation and start failures become terminal, idempotently replayable records. They do not disclose internal paths or error strings to the browser.

## Lifecycle document

`POST /v1/launches`, `GET /v1/launches/<request-id>`, and `DELETE /v1/launches/<request-id>` return the same bounded shape:

```json
{
  "protocolVersion": "0.1.0",
  "requestId": "11111111111111111111111111111111",
  "gameId": "retro-2048",
  "profileId": "profile-randy",
  "state": "running",
  "sequence": 2,
  "detailCode": "PROCESS_STARTED",
  "replayed": false
}
```

`sequence` increases whenever host state changes. Completed or failed process records also contain `exitCode`, which is an integer or `null` when the operating system exposes no numeric code. The only states are:

- `preparing`: the host has reserved the request and is resolving/verifying it;
- `running`: the process started and remains owned by the host;
- `stopping`: cancellation was accepted and termination is in progress;
- `completed`: the process exited successfully;
- `failed`: verification, preparation, start, status observation, or the process itself failed;
- `cancelled`: the host terminated and reaped the child.

Watchdog games publish bounded detail codes within the same state document: preparing advances to `WATCHDOG_STARTING`, followed by `WATCHDOG_HEALTHY`, `WATCHDOG_RESTARTING`, `PROCESS_RESTARTED`, `WATCHDOG_HEALTH_RECOVERED`, and terminal reason codes for startup timeout, heartbeat timeout, invalid health data, or process exit. A retry does not create another request record and cannot bypass the one-active-launch rule. GPU-reset and out-of-memory reasons remain available to the generic watchdog CLI but are not wired into authenticated package launch yet.

`running` explicitly does not mean `ready`. `WATCHDOG_HEALTHY` proves only that the configured game wrapper changed the bounded heartbeat value. No current response claims a visible window, usable core, audio/video readiness, focus/input ownership, or compositor containment. The Svelte loading screen shows runtime recovery while continuing to wait for the separate compositor gate.

## Polling, cancellation, and shutdown

The Svelte loading screen polls only while one native launch is active. It validates protocol, exact request/game/profile identity, the bounded state enum, monotonic sequence, detail-code grammar, and the absence of unknown fields. Leaving the loading screen, retrying after a timeout, or pressing the console Back path sends `DELETE` for the opaque request ID.

Cancellation is idempotent. The monitor force-terminates and reaps the direct child before publishing `cancelled`. A controlled watchdog also checks cancellation before spawn, during each attempt, and during restart backoff, so cancellation cannot race into another retry. Dropping the per-browser host API signals every monitor, joins the bounded worker set, and relies on `ManagedChild` cleanup as a final kill-and-reap guard. Finished monitor handles are joined before another start so repeated launches do not accumulate threads.

The host retains at most 64 lifecycle records and prunes terminal history before accepting more. It permits only one preparing/running/stopping child in this first slice.

## Remaining qualification boundary

- Replace development CLI profile allowlisting with a host-owned persistent profile registry and deletion/unassignment semantics.
- Add compositor/window identity, visible readiness, continued responsiveness, and focus/input ownership events.
- Decide whether the production browser transport retains bounded polling or moves lifecycle changes to an authenticated event stream.
- Bind verified files immutably through process creation and contain descendant processes/cgroups.
- Qualify the exact signed wrapper assigned to every watchdog game; RetroArch alone does not satisfy the heartbeat contract.
- Protect probe files from child spoofing or suppression and connect real Linux cgroup/GPU fault producers.
- Prove hostile-child cancellation, browser crash, host shutdown, compositor crash, GPU reset, OOM, and service restart on ordinary x86-64 Linux and ARM64.
- Qualify real signed RetroArch/core artifacts and one-action contentless startup before any package is called playable.
