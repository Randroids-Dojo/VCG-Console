# Native launcher-host API

Last updated: 2026-07-24

This document defines the first reversible transport between the local Svelte launcher and the privileged Rust host. It is a desk-prototype boundary, not a general local RPC service and not proof of target-Linux containment.

## Scope

The implemented `0.1.0` surface answers status and installed-package queries and accepts one narrow privileged operation: start, observe, or cancel a package that the Rust host resolves from its signature-verified catalog.

It never accepts a browser-provided manifest, executable, path, hash, command, environment, or writable root. It does not return logs, change settings, grant a game access to the host API, or prove a visible game window. Host-selected installed games may use the existing heartbeat watchdog, but process/runtime health is only observable; compositor readiness remains deliberately unproven.

## Launch and authority flow

1. `vcg-host launcher` validates an explicit loopback HTTP launcher URL and absolute browser/profile paths.
2. For a non-dry run, the host binds an operating-system-selected port on `127.0.0.1` only.
3. The host obtains 32 random bytes from the operating-system random source and encodes the per-launch capability as 64 lowercase hexadecimal characters.
4. The host starts Chromium directly, without a shell, and appends `vcg-host-port` and `vcg-host-token` to the launcher URL fragment.
5. The Svelte launcher parses exactly one port and token, sends the token as `Authorization: Bearer …`, omits credentials and referrer data, and applies bounded deadlines and response sizes.
6. The host requires the launcher's exact validated origin for browser CORS requests and constant-time-compares the bearer capability.
7. Dropping the host closes the listener and terminates/reaps the browser if it is still owned by the process supervisor.

The fragment is not sent to the launcher HTTP server and is not included in ordinary referrers. It is still visible to the launched browser process and code executing in the trusted launcher origin. Browser-profile, crash-report, process-inspection, and hostile-navigation behavior remain target qualification work.

## Protocol `0.1.0`

The status endpoint is `GET /v1/status`. Cross-origin browser use performs a route-specific `OPTIONS` preflight. The host permits only the declared `GET`, `POST`, or `DELETE` method and only the `Authorization` and, for launch creation, `Content-Type` request headers.

A successful response is JSON with:

- `protocolVersion`: exactly `0.1.0` for this client;
- `hostVersion`: the compiled `vcg-host` package version;
- `target`: the compiled Rust architecture and operating system;
- `capabilities`: stable capability identifiers compiled into this host.

Responses are non-cacheable, close the connection, and disclose no status body on a rejected token or origin. The server caps each complete request at 8 KiB and a launch JSON body at 1 KiB, applies bounded read/write timeouts, rejects duplicate security/framing headers, rejects transfer encoding and unexpected bodies, and handles one request per connection.

The launcher rejects malformed or oversized `Content-Length` declarations and streams at most 16 KiB for ordinary response documents; the bounded package inventory has a separate 1 MiB ceiling. It distinguishes absent or malformed fragment authority, unreachable/timed-out host, rejected authority, malformed or oversized status, protocol mismatch, and a valid host with no trusted installed package. A host connection alone never makes a game appear installed or launchable.

When the host has loaded a signature-verified installed catalog, status includes the `trusted-package-catalog` capability.

- `GET /v1/packages` returns the positive catalog generation and every installed package's id, version, and runtime in canonical game-ID order. The signed catalog bounds the list to 1,024 entries; the launcher independently enforces that count, a 1 MiB body limit, exact fields, unique increasing IDs, and protocol version.
- `GET /v1/packages/<game-id>` accepts only the bounded package-ID grammar and returns that package's id, version, `libretro` runtime, and catalog generation.

Both operations return stable absent/invalid codes and never expose paths, hashes, keys, permissions, commands, environment, or writable roots. Inventory is availability metadata for the trusted launcher, not admission, installation, or execution authority. See [the signed installed-package catalog contract](INSTALLED_PACKAGE_CATALOG.md).

When at least one host-configured profile ID is also present, status adds `trusted-package-launch`. The lifecycle endpoints are:

- `POST /v1/launches`: create or replay one launch;
- `GET /v1/launches/<request-id>`: read its current state;
- `DELETE /v1/launches/<request-id>`: request cancellation.

Creation accepts exactly:

```json
{
  "protocolVersion": "0.1.0",
  "requestId": "32-lowercase-hex-characters",
  "gameId": "retro-2048",
  "profileId": "profile-randy"
}
```

The 128-bit random request ID is a durable idempotency key. Before execution, the host synchronizes the immutable request/game/profile binding into an exclusively locked, bounded append-only replay journal. Repeating identical intent returns the existing record and cannot start a second child, including after host restart while the record is retained. Reusing the ID for different intent fails with `REQUEST_ID_CONFLICT`. The host permits one active native game, keeps at most 64 lifecycle records with at most 128 events each, and retires the oldest terminal records first.

On restart, a nonterminal record is made terminal with `HOST_RESTARTED_INDETERMINATE` and is never re-executed. Fresh launches then fail with HTTP 503 `LAUNCH_RESTART_CLEANUP_REQUIRED` until trusted native service code proves the old process group empty and synchronizes a cleanup acknowledgement. The browser cannot acknowledge cleanup. Unavailable or corrupt replay state fails with HTTP 503 `LAUNCH_REPLAY_UNAVAILABLE`.

The profile ID must be in the host's strict persistent
`--profile-registry` allowlist. Repeated `--profile-id` remains only as an
explicit development fallback and is mutually exclusive with that registry.
Browser-created or renamed display text cannot create a storage namespace.
After accepting intent, Rust re-resolves and verifies the signed catalog,
manifest, runtime artifacts, and content, prepares host-owned storage, and
invokes the executable directly without a shell.

If privileged host configuration names the signed game ID with `--watchdog-game-id`, the same request record owns bounded heartbeat/restart recovery for every player profile. The browser cannot enable watchdog mode, set its policy, or provide probe paths, and a runtime heartbeat does not satisfy compositor/window readiness.

A lifecycle response contains protocol version, request ID, game ID, profile ID, monotonic per-launch sequence, state, stable detail code, replay marker, and an exit code only for terminal completed/failed states. It never contains a process ID or native path. States are `preparing`, `running`, `stopping`, `completed`, `failed`, and `cancelled`.

Process start is not window readiness. Svelte polls while the launch screen remains in progress and cancels the child when its absolute local-launch deadline expires, the operator exits, or the lifecycle becomes invalid. No response currently produces the launcher `READY` state.

## Security invariants

- Keep the listener loopback-only, per launcher process, and closed when that process ends.
- Keep authority per launch; do not store the bearer capability in profiles, local storage, logs, query strings, or catalog data.
- Validate exact launcher origin in addition to the capability for browser requests.
- Version every request and response and fail closed on incompatible protocol data.
- Accept high-level operations such as a catalog game identifier and active profile identifier only.
- Resolve signed manifests, installed paths, expected hashes, permissions, and launch adapters inside the Rust host.
- Never accept an arbitrary executable, command line, shell text, artifact hash, content path, environment map, or writable root from the browser as launch authority.
- Bind launch attempts to host-owned supervision and cancellation now; readiness, reserved Home/Back, bounded watchdog recovery, and branded re-entry remain mandatory before qualification.
- Do not expose this API or its capability to hosted games, local game origins, the cooperative Motion bridge, or developer-LAN deployment.

## Evidence and remaining boundary

Rust tests cover authenticated status, route-specific exact-origin preflight, wrong tokens/origins, unsafe configured origins, ambiguous security and framing headers, transfer/body rejection, per-launch token uniqueness, signed-catalog discovery and path-free inventory, strict persistent profile-registry intake, development-source mutual exclusion, fixed-intent launch, durable at-most-once replay/conflict, restart-indeterminate recovery, cleanup-barrier enforcement, journal corruption and contention, bounded lifecycle, direct process start/observation, and idempotent cancellation. TypeScript tests cover strict bridge parsing, bounded bodies, canonical bounded package inventory, fixed package/profile/request IDs, lifecycle identity and sequence validation, bounded recovery failures, failure records, polling, and cancellation. Playwright proves the Svelte flow derives installed labeling from signed inventory, sends only versioned package/profile intent, and reports process failure without inventing readiness.

Still required are hostile-navigation and process-inspection tests, service-manager descendant cleanup acknowledgement, boot-scoped replay retention, target-filesystem power-loss qualification, push/event delivery or a measured polling decision, immutable key/artifact provisioning, anti-rollback state, compositor window identity/readiness, watchdog and descendant-process integration, reserved global controls, target-Linux sandboxing, and service-manager restart evidence. D-129, D-132, and D-141 remain working decisions until those tests justify retaining them.
