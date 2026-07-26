# Curated community discovery

Last updated: 2026-07-25

Status: strict family projection and controller-safe session implemented;
production feed, rendered UI, and host integration remain open

## Purpose

Community discovery is a projection of host-approved release records. It is
not a web browser, URL directory, submission inbox, developer-session view,
package installer, search engine, or substitute for manual admission.

The discovery surface may describe an exact reviewed release and request that
the host launch its existing binding. It cannot navigate to a supplied URL,
create installation authority, raise a trust tier, change admission state, or
turn public metadata into approval.

## Implemented feed boundary

`@vcg/launcher-catalog` now accepts one detached-signature feed only after:

- bounded fatal UTF-8 decoding;
- a maximum size of 128 KiB and 256 entries;
- strict version-1 parsing with no unknown fields;
- exact `vcg-community-discovery/v1` domain and `family-community` audience
  binding;
- canonical single-line JSON with one trailing newline;
- exact expected protected catalog generation;
- unique admission, game, and host-launch binding IDs;
- strict game-ID order and unique sorted input profiles;
- one literal `curated-community` trust tier; and
- exact runtime/delivery coherence, network-required remote web, and no
  external-service boundary on an offline release; and
- a caller-supplied signature verifier accepting the exact canonical bytes,
  key ID, and generation.

Verifier exceptions are replaced with one fixed failure. After verification,
the module brands the exact deeply frozen object in a private identity set.
Clones, deserialized copies, ordinary objects, and modified records cannot be
projected.

This is an authority handoff, not a cryptographic implementation. The
production host must supply a verifier backed by the selected signed catalog
role and rollback-protected generation state.

## Admission and emergency behavior

The feed may retain candidate, approved, temporarily disabled, revoked, and
removed records, but the family projection applies these rules:

| Admission state | Family discovery | Launch action |
|---|---|---|
| Candidate | omitted | none |
| Approved | visible as `Community reviewed` | opaque request to the existing host binding |
| Temporarily disabled | omitted immediately | none |
| Revoked | omitted | none |
| Removed | omitted | none |

Only an approved record may carry a launch binding, and it must carry exactly
one. Temporarily disabled and revoked records require a bounded host reason.
A newly verified disable generation therefore removes the release from family
discovery without granting any file or data mutation. A future owned/history
status surface may explain unavailability, but it must remain separate from
discovery and have no launch action. The projection never turns availability,
health, metadata, or a valid manifest into launch authority.

## Closed family projection

Each visible entry contains only:

- exact game and version identity;
- bounded title, publisher, and summary text;
- the fixed `Community reviewed` trust label;
- controlled runtime, hosted/installed, network, input, account/payment, and
  availability labels;
- an opaque host launch request for an approved release;
- the literal `installAction: none`;
- an opaque report-route ID; and
- a controlled local-data removal notice.

The feed and projection contain no URL, origin, entrypoint, path, arbitrary
action, browser target, package location, manifest body, signature, public
key, or free-form emergency reason. Display text rejects controls,
invisible Unicode formatting, line/paragraph separators, backslashes, and web
addresses. A UI must render it as text rather than autolinking it.

Hosted releases must declare `no-local-data` at this console projection
boundary. Installed releases may say that local data is preserved or that
removal requires a separate user choice. Neither declaration deletes data.

## Controller-safe browse and detail session

`FamilyCommunityDiscoveryController` accepts only the exact privately branded
family projection. A clone, deserialized copy, plain object, or projection
from outside the verifier-to-projector path is refused.

The pure controller provides a bounded model for one eventual controller-first
surface:

- browse focus is either one exact approved game or `null` for an empty feed;
- Previous and Next clamp at the first and last entry rather than wrapping;
- Select opens only the focused approved detail;
- Back returns detail to the same browse focus, then requests exit from the
  Community collection;
- Home returns a host-owned Home disposition and resets the internal route to
  browse; and
- invalid commands fail closed.

The view contains only the sanitized family projection. It cannot accept or
produce a URL, arbitrary destination, manifest, signature, package path,
installation request, or candidate/developer/revoked record.

Launch and Report require the current detail. Planning creates one deeply
frozen intent bound to the exact catalog generation, game, version, and opaque
host IDs. Only the exact same object may be dispatched once through the same
controller. A clone, another controller, a replacement plan, navigation,
re-entry, or feed refresh invalidates it. The controller consumes the intent
before calling the host adapter, so reentrant replay is also refused.

Feed replacement accepts only another exact verified family projection whose
generation is strictly greater. It rejects rollback and same-generation
substitution, invalidates every pending intent, returns to browse, and
preserves focus only if that approved game remains visible. If an emergency
generation disables or revokes the current game, the game and its action
disappear together before another dispatch can occur.

## Install, launch, report, and removal separation

Discovery never installs a release. A production pipeline must first complete
manual admission, signed catalog publication, package or hosted-deployment
binding, runtime containment, and any required installed-package transaction.

An approved card can only request the opaque host launch binding from that
verified record. The host must independently revalidate the current
catalog/admission generation, exact release, disable/revocation state,
installed package or hosted origin policy, health, and runtime prerequisites.

Reporting uses an opaque host-owned route ID so community content cannot
choose a recipient or navigate the launcher. Removal is a separate
host-controlled listing/package/data workflow. Removing a listing does not
silently uninstall a package, erase local progress, delete a hosted account,
or transfer data to a replacement release.

## Executable coverage

The launcher-catalog package has nineteen tests total, including thirteen
community-discovery cases that prove:

- exact active-approved projection;
- candidate, temporarily disabled, revoked, and removed exclusion;
- fixed trust/runtime/network/input/service/removal disclosures;
- no URL, navigation, manifest, signature, or install authority;
- invalid developer-tier and modified-content refusal;
- detached-signature and exact-generation enforcement;
- verifier-error redaction and clone refusal;
- bounded canonical UTF-8, duplicate-key, unknown-field, and oversize
  rejection;
- duplicate, reordered, unsafe-text, and unsorted-input rejection; and
- launch, disable, hosted-data, and removal-state consistency;
- deterministic browse/detail/Back/Home and empty-feed behavior;
- exact same-controller, one-shot, non-reentrant launch/report dispatch;
- clone, cross-controller, superseded-plan, invalid-command, invalid-action,
  and invalid-dispatcher refusal;
- navigation-driven intent invalidation; and
- strict forward-only replacement, rollback/same-generation refusal, focus
  repair, and emergency-disable invalidation.

Run:

```sh
pnpm --filter @vcg/launcher-catalog typecheck
pnpm --filter @vcg/launcher-catalog test
```

## Remaining I-106 work

This tranche does not close I-106. Still required:

- the production signed community feed role, keys, thresholds, repository,
  acquisition, rollback protection, offline retention, and trusted-time
  policy;
- an authenticated admission-record database and publication workflow;
- exact joining to the native installed catalog and hosted origin policy;
- rendering and controller/input wiring for the pure
  browse/detail/launch/report session, plus the separate removal UI;
- proof search, recommendations, Museum, recent history, deep links, stale
  cache, and developer mode cannot bypass the projection;
- production report intake, moderation, appeal, reinstatement, emergency
  disable, active-session, package, and data-disposition operations;
- navigation/origin and local-runtime containment;
- target Linux, family-mode, accessibility, privacy, offline, update,
  rollback, crash, and hostile-content evidence; and
- at least one actually reviewed and qualified community release.

Owner decisions are isolated in
[`OWNER_QUESTIONS_COMMUNITY_DISCOVERY_2026-07-25.md`](OWNER_QUESTIONS_COMMUNITY_DISCOVERY_2026-07-25.md).
