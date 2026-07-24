# Native launcher-host API

Last updated: 2026-07-23

This document defines the first reversible transport between the local Svelte launcher and the privileged Rust host. It is a desk-prototype boundary, not a general local RPC service and not proof of target-Linux containment.

## Scope

The implemented `0.1.0` surface answers two read-only questions: is the Rust host instance that launched this browser still present and compatible, and does its signature-verified installed catalog contain one fixed game ID?

It does not yet launch a game, accept a browser-provided manifest, expose filesystem paths, return logs, change settings, or grant a web game any host access. A found catalog entry ends in `PACKAGE_LAUNCH_PENDING` until a privileged launch operation and readiness stream exist.

## Launch and authority flow

1. `vcg-host launcher` validates an explicit loopback HTTP launcher URL and absolute browser/profile paths.
2. For a non-dry run, the host binds an operating-system-selected port on `127.0.0.1` only.
3. The host obtains 32 random bytes from the operating-system random source and encodes the per-launch capability as 64 lowercase hexadecimal characters.
4. The host starts Chromium directly, without a shell, and appends `vcg-host-port` and `vcg-host-token` to the launcher URL fragment.
5. The Svelte launcher parses exactly one port and token, sends the token as `Authorization: Bearer …`, omits credentials and referrer data, and applies a 1.5-second deadline to both headers and body.
6. The host requires the launcher's exact validated origin for browser CORS requests and constant-time-compares the bearer capability.
7. Dropping the host closes the listener and terminates/reaps the browser if it is still owned by the process supervisor.

The fragment is not sent to the launcher HTTP server and is not included in ordinary referrers. It is still visible to the launched browser process and code executing in the trusted launcher origin. Browser-profile, crash-report, process-inspection, and hostile-navigation behavior remain target qualification work.

## Protocol `0.1.0`

The status endpoint is `GET /v1/status`. Cross-origin browser use performs an `OPTIONS` preflight for `GET` plus the `Authorization` header.

A successful response is JSON with:

- `protocolVersion`: exactly `0.1.0` for this client;
- `hostVersion`: the compiled `vcg-host` package version;
- `target`: the compiled Rust architecture and operating system;
- `capabilities`: stable capability identifiers compiled into this host.

Responses are non-cacheable, close the connection, and disclose no status body on a rejected token or origin. The server caps request headers at 8 KiB, applies bounded read/write timeouts, rejects ambiguous duplicate Origin/Authorization/preflight-method headers, and handles one request per connection.

The launcher rejects malformed or oversized `Content-Length` declarations and streams at most 16 KiB for the response document. It distinguishes absent or malformed fragment authority, unreachable/timed-out host, rejected authority, malformed or oversized status, protocol mismatch, and a valid host with no trusted installed package. A host connection alone never makes a game appear installed or launchable.

When the host has loaded a signature-verified installed catalog, status includes the `trusted-package-catalog` capability. `GET /v1/packages/<game-id>` accepts only the bounded package-ID grammar and returns id, version, `libretro` runtime, and catalog generation. It returns stable missing/invalid codes and never exposes paths, hashes, keys, permissions, commands, environment, or writable roots. See [the signed installed-package catalog contract](INSTALLED_PACKAGE_CATALOG.md).

## Security invariants for future endpoints

- Keep the listener loopback-only, per launcher process, and closed when that process ends.
- Keep authority per launch; do not store the bearer capability in profiles, local storage, logs, query strings, or catalog data.
- Validate exact launcher origin in addition to the capability for browser requests.
- Version every request and response and fail closed on incompatible protocol data.
- Accept high-level operations such as a catalog game identifier and active profile identifier only.
- Resolve signed manifests, installed paths, expected hashes, permissions, and launch adapters inside the Rust host.
- Never accept an arbitrary executable, command line, shell text, artifact hash, content path, environment map, or writable root from the browser as launch authority.
- Bind launch attempts to host-owned supervision, readiness, reserved Home/Back, bounded recovery, and branded launcher re-entry.
- Do not expose this API or its capability to hosted games, local game origins, the cooperative Motion bridge, or developer-LAN deployment.

## Evidence and remaining boundary

Rust tests cover authenticated status, exact-origin preflight, wrong tokens/origins, unsafe configured origins, ambiguous security headers, per-launch token uniqueness, fragment rather than query placement, signed-catalog capability discovery, and metadata-only package lookup. TypeScript tests cover strict fragment parsing, request options, host error classes, protocol validation, malformed status, bounded bodies, fixed package IDs, absent catalogs, missing packages, and mismatched metadata. Playwright proves the Svelte flow sends the bearer token and only the package ID.

Still required are a hostile-navigation and process-inspection threat test, privileged launch requests, event delivery, replay and idempotency policy, anti-rollback state, immutable-key and artifact provisioning, compositor readiness, global recovery controls, target-Linux sandboxing, and service-manager restart evidence. D-129 remains a working transport decision until those tests justify retaining it.
