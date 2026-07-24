# Owner questions: community admission and emergency removal

Date: 2026-07-24

The repository now contains an isolated hosted/local review exercise. It does
not silently choose the following production policies.

## CA-001: submitter and publisher authority

Who may submit a game, and what exact evidence proves authority over its code,
content, trademarks, hosted origin, package artifacts, and future updates?

Safe default: block admission unless a durable reviewed record binds an
identified submitter to every relevant right and exact release scope.

## CA-002: reviewer roles and approval threshold

Which roles review content, rights, privacy, security, accessibility/runtime,
and operations, and which categories require two-person or specialist
approval?

Safe default: no reviewer may approve their own submission; unresolved
specialist categories block publication.

## CA-003: family content policy

What age, content, monetization, advertising, social, generated-content, and
external-link rules define family-mode eligibility?

Safe default: no ads, purchases, open chat, arbitrary external navigation, or
unreviewed generated content in the first community cohort.

## CA-004: update ownership and re-review

What monitoring and response window must an update owner provide, and which
changes require full versus focused re-review?

Safe default: any version, origin, runtime, manifest, payload, permission,
privacy, service, or ownership change suspends the prior decision until the
new exact scope is reviewed.

## CA-005: active sessions during emergency removal

Must emergency disable immediately terminate active sessions, request a
bounded graceful shutdown, or permit an offline session to finish?

Safe default: deny new launches immediately; terminate an active session after
a short visible save/exit window unless the incident class requires immediate
containment.

## CA-006: package and user-data disposition

On rejection, revocation, or uninstall, should saves and other user data be
preserved, exported, quarantined, or deleted, and who may choose?

Safe default: remove executable/package authority, preserve isolated local
user data without exposing it to another release, and require explicit local
confirmation before deletion.

## CA-007: audit retention and privacy

How long are submission, reviewer, decision, incident, and revocation records
retained, who may inspect them, and which personal identifiers are necessary?

Safe default: retain stable IDs and decision facts without free text or
unnecessary personal data; keep operational logs household-local unless a
reviewer explicitly exports a redacted record.

## CA-008: reinstatement and appeal

Who may appeal a rejection or revocation, what new evidence is required, and
can reinstatement ever reuse the revoked decision?

Safe default: never erase or reverse the historical revocation. A separate
review issues a new exact-scope decision and publication generation.
