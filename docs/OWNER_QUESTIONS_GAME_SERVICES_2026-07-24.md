# Owner questions: game services and degradation

Date opened: 2026-07-24

Related work: I-096, I-097, I-104, I-136, I-139, I-140, Q-051, Q-060

The source/browser signal screen qualifies no service contract, degradation
mode, or offline game. Keep every title network-required until the responsible
owners answer and verify the questions below.

## GSV-001: authoritative per-game service owner

Who owns the complete production-service declaration for each of the 26
catalog entries, and who verifies it independently?

Safe default: require one dated, versioned declaration per exact deploy. It
must name every client/server origin, provider, tenant, region, data class,
support contact, and removal path. Do not treat static source matching as the
owner declaration.

## GSV-002: required versus optional features

For each title, which services are required for the ordinary primary loop and
which are optional enhancements?

Safe default: classify the title `network: required` until a complete primary
loop passes cold offline. For optional services, name the unavailable feature
before launch and prove that failure does not stall, corrupt, or misrepresent
the local loop.

## GSV-003: database and hosted persistence

What player or device data is stored by the 13 titles with database/KV/Redis
signals, under which key/tenant, for how long, and through which export,
correction, unlink, and deletion operations?

Safe default: send no VCG profile identity, portrait, body measurement, Motion
data, or diagnostic identifier. Use title-scoped opaque identifiers only after
the child/privacy, retention, access-control, tenancy, and deletion design is
approved.

## GSV-004: VibeBots and Streamer Billboard authentication

Is authentication required for ordinary play in VibeBots or Streamer
Billboard, and may a child or shared-appliance profile create or link an
account?

Safe default: keep guest/local play separate from cloud identity. Require a
guardian/admin-confirmed link for any child-related account, expose unlink and
hosted-deletion boundaries, and never infer a VCG identity from Clerk/session
state.

## GSV-005: Determined AI boundary

What exact data does Determined send to Groq, what prompt/output controls
apply, who retains it, and what gameplay remains when generation or KV is
unavailable?

Safe default: send no profile, body, Motion, portrait, voice, or free-form child
identifier. Provide labeled deterministic fallback content, bounded timeouts,
and a complete non-fabricated failure state before considering an optional
service classification.

## GSV-006: VibeBots push notifications

Are Web Push notifications part of the console product, who can subscribe,
what subscription data is retained, and how are consent, expiry, opt-out,
deletion, and abusive content handled?

Safe default: disable notification permission in family mode. Treat push as a
separate opt-in future feature requiring an explicit privacy, guardian,
content, rate-limit, indicator, revocation, and service-failure design.

## GSV-007: analytics, monitoring, ads, and payments

Do any production deployments inject analytics, error monitoring, session
replay, advertising, sponsorship tracking, payment, or fraud services that are
not visible in the screened runtime source?

Safe default: declare them explicitly even when injected by hosting
configuration. Ship the family beta with no ads, behavioral profiling, session
replay, or payments, and with only bounded privacy-reviewed operational
telemetry.

## GSV-008: third-party asset/CDN origins

May games depend at launch time on Google Fonts, unpkg, jsDelivr, cdnjs, or
GitHub APIs/raw content?

Safe default: treat each as a declared network service with integrity,
availability, privacy, version, CSP, update, and removal review. For a signed
local package, vendor only rights-cleared hash-pinned assets rather than
silently preserving mutable CDN dependencies.

## GSV-009: community implementation evidence

Who supplies source/service declarations for Asymptotic Bitrot, Bone Cleaver,
and Vibeman (Hangman)?

Safe default: keep their service inventory `unknown`, their runtime supervised
and network-required, and their admission version/origin scoped. Do not infer
service absence from an anonymous initial load.

## GSV-010: GoDig submodule and generated dependencies

What exact repository/revision does GoDig's `dots` submodule resolve to, and
which services or generated files can enter from it?

Safe default: block source/service closure until the submodule is identified,
available, scanned, rights-reviewed, reproducibly fetched, and bound into the
build/SBOM.

## GSV-011: service outage and permanent removal UX

For timeout, quota, authentication denial, malformed response, provider
outage, revoked API key, discontinued service, and origin loss, what does each
title show and preserve?

Safe default: use bounded timeouts and truthful named states; preserve
controller-accessible Retry, Details, Back, and Exit; never fabricate progress;
never erase local saves to recover a hosted service; and retain a catalog
disable/removal path that does not silently erase data.

## GSV-012: test tenants and synthetic accounts

May qualification create dedicated provider tenants, test accounts, messages,
leaderboard rows, AI prompts, and push subscriptions?

Safe default: use isolated non-production tenants and synthetic data only after
credentials custody, rate limits, cleanup ownership, retention/deletion, and
child/privacy boundaries are approved. Never use a household member's real
account as test evidence.

## GSV-013: requalification cadence

Which service or deployment changes invalidate a catalog approval?

Safe default: invalidate on origin, provider, tenant, authentication, data
schema, environment key, route, storage, analytics, notification, payment,
privacy, content, build, manifest, worker, or degradation change. Bind approval
to an exact deploy identity and rerun on every material change plus a bounded
scheduled cadence.
