# Native launcher-host API

Last updated: 2026-08-18

This document defines the first reversible transport between the local Svelte launcher and the privileged Rust host. It is a desk-prototype boundary, not a general local RPC service and not proof of target-Linux containment.

## Scope

The implemented `0.1.0` surface answers status, installed-package, retro-library, and privacy-safe Bluetooth-controller queries. It accepts two narrow privileged operation families: start, observe, or cancel a package that the Rust host resolves from its signature-verified catalog, optionally carrying one library entry that same host published; and scan, pair/reconnect, or deliberately forget a gaming controller through host-configured `bluetoothctl`.

It never accepts a browser-provided manifest, executable, path, hash, command, environment, or writable root. It does not return logs, change settings, grant a game access to the host API, or prove a visible game window. Host-selected installed games may use the existing heartbeat watchdog, but process/runtime health is only observable; compositor readiness remains deliberately unproven.

## Launch and authority flow

1. `vcg-host launcher` validates an explicit loopback HTTP launcher URL,
   absolute browser/profile paths, the persistent profile registry, and—when
   using the package generation store—exact externally protected
   channel/target/generation/catalog-digest state before any recovery can
   create the API.
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

plus one optional `entryId` described under
[the installed retro library](#installed-retro-library). Any other field is an
error.

The 128-bit random request ID is a durable idempotency key. Before execution, the host synchronizes the immutable request/game/profile/entry binding into an exclusively locked, bounded append-only replay journal. Repeating identical intent returns the existing record and cannot start a second child, including after host restart while the record is retained. Reusing the ID for different intent fails with `REQUEST_ID_CONFLICT`. The host permits one active native game, keeps at most 64 lifecycle records with at most 128 events each, and retires the oldest terminal records first.

On restart, a nonterminal record is made terminal with
`HOST_RESTARTED_INDETERMINATE` and is never re-executed. Fresh launches then
fail with HTTP 503 `LAUNCH_RESTART_CLEANUP_REQUIRED` until a privileged native
adapter consumes the exact in-process barrier request, reports the prior scope
`Empty`, and supplies the matching non-serializable cleanup proof. The browser
cannot request, construct, submit, or acknowledge cleanup. Unavailable or
corrupt replay state fails with HTTP 503 `LAUNCH_REPLAY_UNAVAILABLE`. See
`RESTART_CLEANUP_PROOF.md`.

The journal is written at schema version 3. Version 2, the one prior version,
is migrated on open by discarding it: the restart-cleanup barrier is set and
the version it came from is recorded beside the journal before any record is
removed. A discarded record is not replayed, so the first launch after the
upgrade fails with `LAUNCH_RESTART_CLEANUP_REQUIRED` until cleanup is proven,
and repeating a discarded request ID then starts a new launch instead of
returning the old record. A discarded record also stops protecting the catalog
generation it resolved from. Any other schema version fails with
`LAUNCH_REPLAY_UNAVAILABLE`.

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

When the launcher is configured with one fixed absolute `--bluetoothctl` path,
status adds `bluetooth-controller-pairing`. The controller endpoints are:

- `GET /v1/bluetooth`: refresh the current gaming-controller roster;
- `POST /v1/bluetooth/scan`: power on the adapter and run one bounded scan;
- `POST /v1/bluetooth/devices/<session-id>/pair`: pair a nearby controller or
  reconnect an already-paired controller; and
- `DELETE /v1/bluetooth/devices/<session-id>`: deliberately remove its bond.

The two POST operations accept only `{"protocolVersion":"0.1.0"}`. The host
invokes its fixed executable directly with fixed operations and a Bluetooth
address that it parsed and validated itself; browser text never becomes a
command or address. Responses contain only sorted session-local identifiers
such as `controller-1` plus `paired` and `connected` booleans. Advertised
names, Bluetooth addresses, keys, descriptors, command output, and executable
paths never cross the API. The Svelte client independently enforces that exact
schema and a 16-controller maximum.

Pairing uses the `NoInputNoOutput` agent capability and is therefore intended
for gaming controllers that support a compatible non-interactive pairing
flow. A successful bond or Bluetooth connection is not a gameplay-readiness
claim: Chromium must still report fresh standard-mapped input. Raspberry Pi
radio behavior, controller-model compatibility, range, sleep/wake, reconnect,
simultaneous devices, and controller-only first-pair recovery remain physical
qualification gates.

## Installed retro library

When the launcher is configured with one fixed absolute
`--retro-library-root`, naming the writable data root
`vcg-host retro-provision` provisions, status adds the `retro-library`
capability and two read routes exist:

- `GET /v1/library`: the first page;
- `GET /v1/library/<cursor>`: the page that cursor names.

Both use the same per-launch bearer capability, exact launcher origin, bounded
request handling, and no-store response as status. A page is:

```json
{
  "protocolVersion": "0.1.0",
  "libraryGeneration": 2,
  "entryCount": 1635,
  "entries": [
    {
      "entryId": "content-<64 lowercase hex>",
      "title": "Balloon Fight",
      "systemId": "nes",
      "coreId": "mesen",
      "sizeBytes": 40976
    }
  ],
  "nextCursor": "<32 lowercase hex>"
}
```

`nextCursor` is present only when another page follows. Entries are ordered by
system, then title, then entry ID, so a client can render a browse list without
holding the whole library. `entryCount` is the size of the whole library, which
is what lets a paged client size its list.

A page carries at most 256 entries and its serialized `entries` array at most
64 KiB, whichever bound closes first. The host computes both bounds when it
takes the snapshot, so no page can exceed either. The library itself holds at
most 100,000 entries. A client must therefore allow 64 KiB plus the document
envelope for this route, and must enforce both bounds itself.

A cursor is a per-launch random 128-bit token, not an offset. It names one page
of one snapshot, cannot be constructed or decoded by the browser, and does not
survive a host restart. An unrecognized cursor returns `400
LIBRARY_CURSOR_INVALID`. There is no random access to an arbitrary page; a
client walks forward. A host with no configured library returns `404
LIBRARY_UNAVAILABLE` and omits the capability.

The snapshot is read once when the launcher process starts, so every page of a
walk describes the same library generation and a cursor never straddles a
change. A generation committed while the console is running appears after the
next launcher start. A configured root that is missing, unreadable, malformed,
or awaiting import recovery fails the launcher before Chromium starts, so this
route never answers from a partial library. `--retro-library-root` combines
with `--bluetoothctl` and `--watchdog-game-id`; one launcher process serves
every capability the operator configured.

An entry discloses only what selecting and presenting it requires. Filesystem
paths, host roots, content digests, the digest-derived object name, the file
extension, the controller profile, and import provenance never cross this
boundary.

### Launching one library entry

`POST /v1/launches` accepts one optional additional field:

```json
{
  "protocolVersion": "0.1.0",
  "requestId": "32-lowercase-hex-characters",
  "gameId": "nes-library",
  "profileId": "profile-randy",
  "entryId": "content-<64 lowercase hex>"
}
```

`entryId` is an opaque identifier this API published; the browser still names
no path, no core, and no argument. Omitting it is exactly the behavior every
package had before this field existed.

A package must opt in through its signed catalog record. Only a package whose
signed libretro content mode is `library` accepts an entry, and only for the
system and core that record names. See
[the signed installed-package catalog contract](INSTALLED_PACKAGE_CATALOG.md).
The host rejects, before it reserves the request ID:

- `400 LAUNCH_REQUEST_INVALID` for an entry ID outside `content-<64 lowercase
  hex>`;
- `404 LIBRARY_UNAVAILABLE` when no library is configured;
- `404 LIBRARY_ENTRY_NOT_FOUND` when the snapshot holds no such entry;
- `409 PACKAGE_REJECTS_LIBRARY_CONTENT` when the package binds fixed content,
  or none, or is a native package;
- `409 LIBRARY_ENTRY_INCOMPATIBLE` when the entry's system or core disagrees
  with the signed package.

A package whose signed record accepts library content cannot start without an
entry: the launch fails with `PACKAGE_RESOLUTION_FAILED` rather than starting
the frontend with no content.

The entry joins the immutable request binding. Reusing a request ID with a
different entry ID fails with `REQUEST_ID_CONFLICT`, in memory and across a
restart, exactly as a changed game or profile does. Before the child starts,
the adapter canonicalizes the resolved object, requires it to stay beneath the
console-managed object root, and re-verifies its SHA-256 — the same
verification the fixed managed-content path performs.

## Security invariants

- Keep the listener loopback-only, per launcher process, and closed when that process ends.
- Keep authority per launch; do not store the bearer capability in profiles, local storage, logs, query strings, or catalog data.
- Validate exact launcher origin in addition to the capability for browser requests.
- Version every request and response and fail closed on incompatible protocol data.
- Accept high-level operations such as a catalog game identifier, active profile identifier, and host-published library entry identifier only.
- Resolve signed manifests, installed paths, expected hashes, permissions, and launch adapters inside the Rust host.
- Never accept an arbitrary executable, command line, shell text, artifact hash, content path, environment map, or writable root from the browser as launch authority.
- Bind launch attempts to host-owned supervision and cancellation now; readiness, reserved Home/Back, bounded watchdog recovery, and branded re-entry remain mandatory before qualification.
- Do not expose this API or its capability to hosted games, local game origins, the cooperative Motion bridge, or developer-LAN deployment.

## Evidence and remaining boundary

Rust tests cover authenticated status, route-specific exact-origin preflight,
wrong tokens/origins, unsafe configured origins, ambiguous security and framing
headers, transfer/body rejection, per-launch token uniqueness, signed-catalog
discovery and path-free inventory, strict persistent profile-registry intake,
package protected-state ordering and rollback/substitution refusal,
development-source mutual exclusion, fixed-intent launch, durable at-most-once
replay/conflict, restart-indeterminate recovery, cleanup-barrier enforcement,
journal corruption and contention, bounded lifecycle, privacy-safe Bluetooth
parsing and session identifiers, fixed pairing/reconnect/forget commands,
Bluetooth route preflight and stable path-free failures, bounded path-free
library paging under both the entry-count and response-byte bounds, unknown
cursor and unconfigured-library refusal, library-entry admission for exactly
the signed system and core, entry refusal for fixed-content and native
packages, unchanged behavior when the entry ID is omitted, durable entry
binding across replay recovery, direct process start/observation, and
idempotent cancellation. TypeScript tests cover strict
bridge parsing, bounded bodies, canonical bounded package inventory, fixed
package/profile/request IDs, lifecycle identity and sequence validation,
bounded recovery failures, failure records, polling, and cancellation.
Playwright proves the Svelte flow derives installed labeling from signed
inventory, sends only versioned package/profile intent, and reports process
failure without inventing readiness. A focused browser flow also exercises
scan, pair, two-step forget, and the identity-exclusion boundary without real
Bluetooth hardware.

Still required are hostile-navigation and process-inspection tests,
qualified service-manager descendant cleanup adapter, boot-scoped replay
retention, target-filesystem power-loss qualification, push/event delivery or a
measured polling decision, immutable key/artifact provisioning, qualified
platform provenance and compare-and-swap for protected state, compositor window
identity/readiness, watchdog and descendant-process integration, reserved
global controls, target-Linux sandboxing, and service-manager restart evidence.
D-129, D-132, D-141, and D-161 remain working decisions until those tests
justify retaining them.
