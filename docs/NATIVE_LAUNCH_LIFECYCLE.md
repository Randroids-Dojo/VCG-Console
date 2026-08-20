# Native package launch lifecycle

Last updated: 2026-07-24

This document defines the authenticated path from a signed installed package to a host-owned child process. It proves narrow intent, artifact verification, direct process start, observation, cancellation, cleanup, and opt-in bounded heartbeat recovery. It does not yet prove a visible or responsive game window, controller ownership, compositor containment, descendant containment, or target-Linux qualification.

## Authority and configuration

The launch capability exists only when `vcg-host launcher` receives:

- a valid signed installed catalog and all host-owned roots;
- an absolute `--launch-replay-root <path>`;
- a nonempty strict `--profile-registry <path>`, or repeated
  `--profile-id <opaque-id>` only for development compatibility.

The profile sources are mutually exclusive. The registry is bounded, closed
JSON containing opaque IDs only and is validated before any root/package
recovery mutation. The Svelte launcher may select one of those IDs but cannot
create an accepted native profile merely by sending a new string. An empty
registry and catalog-only configuration expose metadata without exposing
process launch.

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

Before execution, the host durably accepts the immutable request/game/profile intent and exact trusted catalog generation in one exclusively locked replay journal. Each lifecycle transition is an append-only, synchronized event. The journal retains at most 64 records and 128 events per record, rejects duplicate request IDs or ordinals, and fails closed on malformed, conflicting, oversized, or unavailable state. The catalog generation is private maintenance authority and never appears in browser lifecycle documents.

An identical terminal request replays after host restart without execution. Any
recovered `preparing`, `running`, or `stopping` record becomes terminal
`failed` with `HOST_RESTARTED_INDETERMINATE`; it is never executed again.

The journal declares a schema version and a host reads only its own. A journal
written by the previous version is migrated by discarding its records behind the
restart-cleanup barrier, so nothing replays across that boundary and the first
launch afterwards waits until a privileged adapter proves the prior process
scope empty. Mixed or unrecognised versions fail closed rather than migrating.
See [the host API contract](NATIVE_HOST_API.md) for the migration record.
Recovery also persists a cleanup barrier that rejects every fresh launch with
`LAUNCH_RESTART_CLEANUP_REQUIRED`. The service issues an opaque in-memory
request tied to that exact barrier. Only a privileged adapter result of
`Empty` creates the non-serializable proof consumed by cleanup acknowledgement;
`NotEmpty`, `Unavailable`, stale, and cross-service evidence fail closed. The
browser API has no request, proof, or acknowledgement operation. See
`RESTART_CLEANUP_PROOF.md`. An unwired Linux cgroup-v2 candidate now retains
the exact kill/events controls, writes one recursive kill, and accepts only
bounded recursive `populated 0`; Q-247 still selects and qualifies the actual
service-owned scope. If replay state cannot be verified, launch fails with
`LAUNCH_REPLAY_UNAVAILABLE`.

Package maintenance can query a sorted, path-free set of protected catalog generations. Every active record protects the generation from which it was resolved. A recovered indeterminate record remains protected while the cleanup barrier exists, even though its browser-visible lifecycle is terminal; trusted cleanup acknowledgement removes that protection. Ordinary terminal history does not pin package storage. A persistence fault makes the query fail closed.

## Host-owned preparation

For an accepted intent, Rust:

1. verifies that the profile ID is in the host allowlist;
2. reserves a bounded lifecycle record before expensive work;
3. resolves the game through the signature-verified target catalog;
4. verifies the bound game manifest and exact runtime artifacts;
5. dispatches the catalog runtime and prepares the Libretro or native package
   plan through one shared boundary;
6. selects process-only or watchdog monitoring from the host-owned game configuration;
7. starts the executable directly without a shell and transfers ownership to a
   bounded monitor thread.

The native adapter accepts only the catalog-signed executable, supplies no
package-controlled arguments, and derives its working and writable paths.
This is process ownership, not an OS sandbox. See
[the native package runtime contract](NATIVE_PACKAGE_RUNTIME.md).

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

The host retains at most 64 lifecycle records and retires the oldest terminal history before accepting more. Retirement is crash-recoverable and bounded. It permits only one preparing/running/stopping child in this first slice. The exact boot scope, age retention, protected storage ownership, and production service/cgroup lifecycle remain deployment decisions rather than browser policy.

## Remaining qualification boundary

- Replace the development CLI fallback with a qualified registry writer and
  crash-recoverable creation, removal, sensitive-data deletion, and save
  unassignment transactions.
- Wire the cgroup-v2 candidate only after Q-247 selects the production
  service/unit, atomic child attachment, anti-escape rules, durable scope
  binding, polling policy, and target ownership; prove it owns/empties every
  interrupted descendant before returning `Empty`.
- Qualify the implemented explicit crash-recoverable generation remover on target Linux under sudden power loss and lock/filesystem faults; automatic retention scheduling, byte policy, uninstall, managed-content cleanup, and save disposition remain separate.
- Select and enforce the journal's operating-system boot scope and age retention; qualify lock, rename, file synchronization, and sudden-power behavior on the target Linux filesystems.
- Add compositor/window identity, visible readiness, continued responsiveness, and focus/input ownership events.
- Decide whether the production browser transport retains bounded polling or moves lifecycle changes to an authenticated event stream.
- Bind verified files immutably through process creation and contain descendant processes/cgroups.
- Qualify the exact signed wrapper assigned to every watchdog game; RetroArch alone does not satisfy the heartbeat contract.
- Protect probe files from child spoofing or suppression and connect real Linux cgroup/GPU fault producers.
- Prove hostile-child cancellation, browser crash, host shutdown, compositor crash, GPU reset, OOM, and service restart on ordinary x86-64 Linux and ARM64.
- Qualify real signed RetroArch/core artifacts and one-action contentless startup before any package is called playable.
