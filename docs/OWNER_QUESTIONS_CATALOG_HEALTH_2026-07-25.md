# Owner questions: catalog health

Last updated: 2026-07-25

These answers do not block the implemented credentialless hosted HTTP
boundary. They block complete I-099 semantics, target qualification, and final
user-facing health behavior.

## CH-001: successful HTTP status set

Should hosted health accept every `2xx` status, or require a smaller set such
as `200` and `204`?

Safe default: accept `200` through `299` at the transport layer and prefer a
dedicated `204 No Content` route in reviewed manifests. Treat the body as
untrusted and unread. Narrow a specific title only when its owner and service
contract justify the exact status behavior.

## CH-002: GET versus HEAD

Should the final hosted contract require `HEAD`, retain bodyless `GET`, or
permit either per manifest?

Safe default: retain a bodyless, credentialless `GET` until every selected
service proves correct `HEAD` behavior. Require a dedicated side-effect-free
route. Do not use a gameplay, account, save, or mutation endpoint as health
merely because it returns successfully.

## CH-003: cross-origin health redirects

May a reviewed game redirect health to another origin in its allowlist?

Safe default: allow it only as a title-specific reviewed exception. Prefer one
stable same-origin health route. Never follow a redirect to an unreviewed
origin or one containing credentials, query data, or fragments, and never
forward cookies or authorization.

## CH-004: authentication-required services

How should the launcher represent a title whose service is reachable but whose
gameplay requires a user-specific login?

Safe default: generic health remains account-independent. Report the service
as reachable only if its public health route passes, then let the supervised
game present login inside its own reviewed flow. Do not send account
credentials, inspect login state, or label an individual profile healthy or
unhealthy from catalog health.

## CH-005: explicit-ready schema

Which minimal phase vocabulary should bundled-web and native producers use?

Safe default: a closed host vocabulary such as `starting`, `ready`,
`degraded`, and `failed`, with a host-issued challenge, exact release/runtime
binding, monotonic sequence, expiry, and bounded host-owned reason code. Permit
no free text, paths, URLs, profile IDs, player IDs, saves, environment,
process details, or game-authored metadata.

## CH-006: process survival

When, if ever, is process survival sufficient instead of explicit readiness?

Safe default: only for a specifically reviewed simple runtime where no safer
ready producer exists, and label the result `process-alive`, not `ready`.
Require compositor focus, controller routing, and a short stability window
before launch success. Prefer explicit readiness for native, Godot, and
Libretro payloads once the authenticated adapter exists.

## CH-007: probe cadence and retention

How often may the console probe health before and during play, and how much
history may local diagnostics retain?

Safe default: probe once before launch, then use the runtime watchdog or a
bounded low-frequency check only when the adapter needs it. Apply exponential
backoff after failure, stop during suspend/offline policy states, retain only
bounded host codes and timestamps under the diagnostics policy, and never
retain URLs, headers, bodies, cookies, or transport exception text.

## CH-008: user-visible failure detail

Which health distinctions should appear in the launcher?

Safe default: use the existing bounded categories such as offline,
service-unavailable, timed-out, process-exited, recovering, and failed. Show
Retry, Details, and Exit without exposing HTTP bodies, internal service names,
paths, response headers, exception messages, or account state. Details should
remain host-authored and privacy-reviewed.
