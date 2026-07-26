# Owner questions: curated community discovery

Last updated: 2026-07-25

These choices do not block the strict no-browser family projection. They
block production signing, final UI behavior, reporting, emergency response,
and release qualification.

## CCD-001: community feed signing role

Which production root/delegated role, threshold, key custodians, and protected
generation store authorize the discovery feed?

Safe default: use a distinct curated-community catalog role under the existing
offline-root hierarchy, with no key reuse across owner production,
developer-session, package, system-image, or recovery roles. Require a
rollback-protected exact generation and independently protected accepted
digest before projection.

## CCD-002: disabled-entry visibility

Should a temporarily disabled reviewed game remain visible as unavailable, or
disappear from ordinary discovery?

Safe default: retain it in owned/recent/detail contexts with a bounded
unavailable reason and Report action, but remove it from promotion and
recommendation surfaces. It must have no launch action. Revoked and removed
releases stay out of family discovery.

## CCD-003: report route and recipient

Who receives a community-game report, what categories may be selected, and
what data may leave the console?

Safe default: the signed admission record supplies only an opaque host route
ID. The host presents closed categories, an explicit review/confirm step, and
a minimal report containing release identity, bounded category, and optional
user-authored text only after separate consent. Send no profile, portrait,
body, save, URL, credential, diagnostic log, or household identifier by
default.

## CCD-004: active emergency response

Which emergency reasons terminate an already-running session rather than only
blocking the next launch?

Safe default: signed security, privacy, rights, or severe safety revocations
may invoke the console-owned bounded exit path; service and compatibility
holds block new launches and offer a normal exit/retry path. Freeze the exact
reason-to-action table before target tests.

## CCD-005: listing, package, and local-data removal

When a reviewed installed release is removed, should its package and local
progress be preserved, quarantined, or offered for deletion?

Safe default: immediately remove launch authority, preserve local data, and
separate listing withdrawal, package uninstall, and permanent data deletion.
Any deletion requires controller-confirmed exact-scope review and must not
affect hosted accounts or another release.

## CCD-006: external accounts and payments

Are community releases requiring external accounts or payments eligible for
the first family-mode cohort?

Safe default: exclude payments and required external accounts from the first
cohort. If later admitted, show the boundary before launch, keep credentials
outside VCG, and require separate privacy, child/family, refund, service,
deletion, and territory review.

## CCD-007: first UI surfaces

Which surfaces may consume the community projection initially?

Safe default: begin with one explicit Community collection and exact
browse/detail flow. Add global search only after tests prove candidate,
developer, revoked, removed, stale-cache, deep-link, recent-history, and
Museum data cannot bypass the same verified projection. Do not begin with
recommendations or personalized ranking.

## CCD-008: offline retention and expiry

How long may the last verified community feed remain usable offline, and how
does trusted-time uncertainty affect it?

Safe default: continue using the last rollback-protected verified generation
for already admitted local releases unless an installed revocation applies.
A network timeout is not revocation. Do not admit a new feed when signature,
generation, expiry, or trusted time cannot be established; retain a truthful
offline state without opening a browser fallback.

## CCD-009: first reviewed release

Which exact community release should exercise the production workflow first?

Safe default: select one small controller-only release with source, code and
asset rights, reproducible local artifacts, no account/payment, no ordinary
network, no Motion/raw-device permissions, simple save behavior, and a named
maintainer/emergency contact. Treat the current three promoted remote entries
as candidates until their source, rights, service, controller, privacy, and
origin evidence is complete.
