# Privacy-safe catalog health

Last updated: 2026-07-25

Status: hosted HTTP request boundary implemented; I-099 remains active

## Purpose

Catalog health answers one narrow question: may the launcher continue the
selected launch or present the title as unavailable? It is not telemetry,
analytics, diagnostics export, account introspection, save inspection, player
presence, content enumeration, or proof that gameplay is correct.

Health authority comes from the signed reviewed game manifest and the
host-owned runtime adapter. A game cannot invent a health endpoint after
launch, expand its reviewed origins, report another title's status, or turn
private response data into launcher state.

## Implemented hosted HTTP boundary

The supervised remote-web adapter now creates one immutable health policy
before starting the browser:

- the manifest must use the `remote-web` runtime and `http` health-check kind;
- the entrypoint and every allowed origin must be credential-free HTTPS;
- the health route must be one absolute path beginning with `/`;
- the path is limited to 1,024 Unicode scalar values, including the leading
  slash;
- scheme-relative paths, backslashes, malformed percent encoding, unsafe
  invisible/control Unicode (including encoded forms), queries, and fragments
  are rejected;
- the resulting origin must already be in the manifest's bounded exact-origin
  allowlist; and
- redirects are manual, limited to five, revalidated before the next request,
  and may not introduce credentials, query data, fragments, or foreign
  origins.

Every probe sends a fixed request:

| Property | Required value |
|---|---|
| Method | `GET` |
| Body | none |
| Credentials | `omit` |
| Cache | `no-store` |
| Referrer policy | `no-referrer` |
| Redirect mode | `manual` |
| Accept | `application/vnd.vcg.health+json, application/json;q=0.1` |

The host accepts an ordinary successful HTTP status, cancels the response
stream, and does not parse or retain the body, cookies, response headers, URL
path, query, fragment, account state, player state, save state, or service
message. Only bounded host-authored failure classes and numeric HTTP status can
reach the caller. Arbitrary transport exceptions are replaced with
`hosted browser health check transport failed`; their original messages are
not propagated.

This makes the current result deliberately less expressive than many web
health APIs. A body containing a private profile, token, save, internal
exception, or account status cannot become catalog metadata because the
adapter never reads it.

## Executable coverage

Twenty-eight hosted-supervisor tests include:

- exact immutable policy construction;
- malformed, downgraded, credentialed, foreign, excessive, duplicate, and
  non-origin authority rejection;
- relative, scheme-relative, scalar-oversized, query-bearing, fragment-bearing,
  backslash, malformed-encoding, and unsafe-Unicode health-path rejection;
- exact bodyless, credentialless, no-cache, no-referrer request assertions;
- permitted bounded redirect handling;
- foreign-origin and query-bearing redirect refusal before the next request;
- response-stream cancellation even when the response contains private
  canaries and `Set-Cookie`;
- arbitrary transport-error redaction;
- redirect-loop, missing-location, and unhealthy-status handling; and
- the existing real-Chrome navigation, popup, download, process cleanup, and
  temporary-profile cases.

Focused verification:

```text
pnpm exec tsx --test scripts/hosted-browser-supervisor.test.ts
```

The complete root test command also runs this suite.

## Data minimization rules

Health producers and adapters must preserve these invariants:

1. No profile ID, display name, portrait, body data, player/session ID, save
   slot, progress, account, credential, token, URL query, request body, or
   arbitrary response text is needed to decide generic readiness.
2. The host resolves the health target from signed policy. Browser content,
   game output, and the launcher UI cannot supply a URL.
3. Health results are scoped to one exact game release and runtime instance.
   They do not imply that another version, architecture, payload, profile, or
   service is healthy.
4. A successful transport response proves only that the declared health
   endpoint returned an accepted status. It does not prove interactive
   readiness, controller focus, compositor control, save integrity, offline
   play, or recovery.
5. User-visible details use bounded host vocabulary. Arbitrary game or service
   strings stay out of logs and the launcher.
6. Repeated probes require a separately bounded cadence and retention policy;
   a safe individual request does not authorize continuous telemetry.

## Remaining adapters

I-099 cannot close from hosted HTTP alone.

### Bundled local web

The manifest currently selects `explicit-ready`. A production producer still
needs a versioned host-issued challenge, exact game/release/runtime binding,
bounded monotonic phase vocabulary, expiry, one active instance, and proof
that ready cannot contain or depend on player/save/private state. The producer
must also compose with compositor focus, Home/Back ownership, watchdog, and
process cleanup.

### Native and Godot

Process survival is not interactive readiness. Native producers need a
selected authenticated IPC transport, release and process binding, bounded
ready/health states, expiry, restart behavior, and target service-manager
evidence without returning paths, process arguments, environment, logs, or
game-authored free text.

### Libretro

The installed signed policy can select process-survival or explicit-ready
candidate checks, but target frontend/core/content launch, compositor focus,
controller readiness, and failure semantics remain unqualified. A running
RetroArch process is not proof that the selected core and content reached an
interactive state.

### Launcher and target evidence

Still required:

- unavailable/retry/details/exit projection using bounded host codes;
- stale, replayed, cross-release, cross-profile, and cross-runtime refusal;
- probe cadence, timeout, backoff, suspend/resume, network-change, and
  crash/restart behavior;
- no-egress and local-log retention checks;
- target ARM64 and ordinary Linux x86-64 observations; and
- proof that health failure cannot disclose private data through UI,
  diagnostics, support export, or recovery paths.

Owner decisions are isolated in
[`OWNER_QUESTIONS_CATALOG_HEALTH_2026-07-25.md`](OWNER_QUESTIONS_CATALOG_HEALTH_2026-07-25.md).
