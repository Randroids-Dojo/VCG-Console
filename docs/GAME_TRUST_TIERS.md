# Game trust tiers and admission lifecycle

Last updated: 2026-07-23

VCG Console uses four game trust tiers: owner production, manually curated community, local developer session, and untrusted URL. A tier describes how a release earns launch authority; it is not a claim that code is bug-free, suitable for every household, offline-capable, or entitled to every permission.

Trust tier is host-owned catalog/admission metadata outside `vcg-game.json` v1. A game, web page, public manifest, developer build, or package signature cannot assign or raise its own tier. The [manifest contract](GAME_MANIFEST_CONTRACT.md), [signed installed catalog](INSTALLED_PACKAGE_CATALOG.md), [online/offline matrix](ONLINE_OFFLINE_SERVICE_MATRIX.md), and [security threat model](SECURITY_THREAT_MODEL.md) remain separate gates.

## Tier matrix

| Tier | Admission authority | Normal launch surface | Baseline containment | Visible state |
|---|---|---|---|---|
| Owner production | VCG-controlled release process binds an exact local package release or exact hosted deployment origin after compatibility and rights review. | Family-mode catalog. | Local releases require independently signed target packages and runtime sandboxing. Hosted exceptions use the supervised top-level browser lane with exact origins and global recovery. | `Verified local` or `Hosted service`, plus network/input/offline disclosures. |
| Curated community | A human review approves one exact version/hash for local content or one exact origin/deployment record for hosted content. Approval is not inherited by later versions, redirects, mirrors, owners, or sibling origins. | Family-mode catalog while approval is active. | Signed local packages use the same production installer and sandbox. Hosted games use supervised top-level launch, navigation/origin policy, watchdog, and external Home/Back. | `Community reviewed`, release/origin scope, network/input requirements, and report/removal path. |
| Developer session | A previously paired workstation authenticates during a visibly enabled, controller-confirmed session and supplies an integrity-hashed build. Release signature may be absent only here. | Developer-only namespace; never family search, recommendations, Museum, auto-start, or production updates. | Strongest practical runtime sandbox, no production signing/key authority, session-scoped listener, explicit termination and cleanup when the session ends or the console reboots. | Persistent developer banner/border and source workstation/build identity; never production artwork alone. |
| Untrusted URL | No launch authority. Discovery, a submitted link, reachability, or public catalog presence is insufficient. | No normal-console launch. Review intake may inspect it on a separate or purpose-built evaluator. | No Motion bridge, native host, profile/save broker, trusted origin, production storage, package install, or family-mode browser session. | `Not reviewed — blocked` with a review/report path, not a warning-through button. |

Owner production and curated community may use the same runtime. A signature proves that trusted release metadata selected bytes; it does not prove owner control, community approval, rights, content suitability, controller recovery, privacy, sandbox safety, or current health. Conversely, hosted owner code remains web content and does not receive native authority merely because VCG controls its deployment.

## Admission record

Every production or curated admission is an immutable review record for one release subject. It contains:

- stable game ID, trust tier, runtime lane, and admission state;
- local package identity/version/manifest hash/target, or normalized hosted entrypoint and exact allowed origins;
- submitter/publisher provenance and reviewed distribution authority;
- content/age notes and the exact code, asset, service, and territory rights evidence available;
- requested permissions, Motion profiles, input methods, controller-only result, and reserved Home/Back result;
- declared network class, destinations/services, authentication, payment, identity, external navigation, and offline degradation;
- storage/save scope, quotas, reset/uninstall behavior, hosted-data boundary, and profile unlink behavior;
- privacy data flows, retention/deletion behavior, diagnostics, and any child/family implications;
- launch timeout, readiness and health evidence, crash/hang recovery, update owner, emergency contact route, and removal procedure;
- architecture/build provenance, security review references, compatibility evidence, known limitations, reviewer, and review timestamp; and
- a new record identity for every later version, artifact hash, origin set, deployment owner, permission increase, runtime change, or material service/data-flow change.

The host-owned admission record may reference a public v1 manifest, but unknown manifest fields remain advisory. Authority-affecting additions require a new supported manifest/catalog version or separate versioned host record; old clients must not infer them.

## Permission and data policy

All tiers default to deny. A higher tier permits consideration of a capability, not automatic grant.

| Capability or data | Owner production | Curated community | Developer session | Untrusted URL |
|---|---|---|---|---|
| Controller/keyboard/pointer/touch | Only declared and compatibility-tested inputs. Controller recovery remains independent. | Same, with controller-only limitations visible before launch. | Explicit developer-session grant; cannot redefine reserved controls. | None. |
| Derived Motion landmarks/actions | Only declared, reviewed profiles negotiated by exact origin/session or local runtime identity. | Same; raw frames remain unavailable. | Explicit per-session grant with developer UI; never inherited into family mode. | None. |
| Raw camera or microphone | Unavailable under the current baseline. A future product decision, OS permission, visible consent, and new review are all required. | Unavailable. | Unavailable by default and not unlocked merely by developer mode. | None. |
| Network | Only the declared class and destinations/services; offline packages receive no ordinary network authority. | Same, with hosted-service and identity/payment boundaries disclosed. | Session/build-scoped policy; no access to release keys or hidden production services. | None. |
| Persistent storage | Per-game isolated quota and lifecycle only. No profile/body data is copied into game storage. | Same; revocation/removal does not silently erase or upload local data. | Separate developer namespace that cannot overwrite or silently adopt production saves. | None. |
| Profiles and identity | Only opaque session/player outputs explicitly needed by the game. Body matching and portraits never act as authentication. | Same; hosted identity remains a separately disclosed service boundary. | Test identities only unless a deliberate safe fixture is used; no production profile vault access. | None. |
| Native process/package | Signed installed package selected by host-owned metadata. | Signed reviewed package selected by host-owned metadata. | Integrity-hashed unsigned build only inside the active developer namespace/session. | None. |

No game receives console signing keys, arbitrary filesystem paths, commands, environment authority, another game's storage, browser host bearer tokens, unrestricted device access, raw RetroArch configuration, update policy, or the ability to change its own admission state.

## Admission states and transitions

Admission state is separate from trust tier:

| State | Meaning | Launch behavior |
|---|---|---|
| Candidate | Evidence is incomplete or under review. | Blocked from family mode. May be evaluated only through the appropriate isolated review/developer workflow. |
| Approved | The exact admission record is active and its runtime prerequisites remain healthy. | May appear and launch only on its tier's allowed surface. |
| Temporarily disabled | A reversible safety, availability, compatibility, or investigation hold. | New launches are blocked with a truthful reason and report path. Existing local data is preserved. |
| Revoked | Trust for the exact release/origin is withdrawn because authority, security, privacy, rights, content, or update ownership is no longer acceptable. | Install/update/new launch is denied. Active termination is allowed when continued execution creates material risk. |
| Removed | The catalog listing is withdrawn. | Not discoverable or launchable. Package uninstall and user-data deletion remain separate deliberate actions. |

Allowed forward transitions are Candidate → Approved, Approved ↔ Temporarily disabled, and Candidate/Approved/Temporarily disabled → Revoked or Removed. Re-approving a revoked subject creates a new admission record after fresh review; it does not rewrite history. A developer build becomes production only through an ordinary new signed release and production/community admission. No state transition is accepted from game content.

## Emergency disable, revocation, removal, and data

- Emergency disable data is signed or otherwise host-authenticated, bounded, versioned, rollback-protected, and usable from an offline maintenance path. A network timeout is not a revocation.
- The console keeps the last verified state while offline unless an already installed revocation applies. Hosted-service reachability is health, not trust.
- Disable and revoke block new execution before changing files. A high-confidence active exploit or illegal/harmful content event may also terminate an active session through the console-owned recovery path.
- Removing a listing does not silently uninstall packages, erase saves, delete hosted accounts, or merge data into a replacement release.
- Local uninstall removes package/runtime artifacts according to policy but preserves or deletes console-managed saves only after the documented controller-confirmed choice. Factory reset remains the separate whole-device destructive boundary.
- Developer-session cleanup removes partial staging and session processes. Developer data never becomes production data through rename, shared ID, hash collision, or copied directory.
- Reusing a game name, publisher, origin, or ID after deletion/revocation does not recover admission or reassociate unassigned profile/save data.

## UI and navigation requirements

- Family-mode search, recommendations, Museum, recently played, deep links, and offline caches consume only active host-approved admission records.
- Trust, runtime, installed/hosted status, network requirement, required input, and important service/identity/payment boundaries appear before launch.
- Community and developer labeling is redundant in text, icon/pattern, and layout; it does not rely on accent color.
- A blocked candidate or untrusted URL has no ordinary `Continue anyway` path. Entering developer mode requires the separate local flow.
- Every launched tier retains branded progress, truthful health/failure, Retry/Details/Exit where appropriate, and an unstealable controller/remote recovery path.
- A game cannot cover, imitate, or acknowledge away console-owned developer, permission, trust, revocation, or recovery UI.

## Abuse-test contract

Before I-105 policy is considered enforced, automated or target tests must prove:

1. a public manifest, valid HTTPS URL, catalog search result, game-controlled field, or compatible response cannot assign a tier or approval;
2. a community version/origin change, redirect, permission increase, owner change, service change, or local hash change returns to Candidate;
3. untrusted and Candidate entries never appear as family-approved through search, cache, stale browser state, Museum, deep links, or offline restart;
4. an unsigned developer build cannot install, launch, update, copy data into, or promote itself as production; ending the session or reboot closes its listener and execution;
5. exact Motion, network, storage, device, origin, and native-process grants are denied outside the active record and runtime identity;
6. hostile full-screen, pointer-lock, message flood, navigation, crash, and hung-process cases cannot suppress Home/Back/forced exit;
7. disable and revoke work offline from the last verified policy, resist rollback, block new launch before mutation, and preserve user data unless separately deleted;
8. removal/uninstall/reinstall/version rollback preserve the documented save scope without cross-game access or silent reassociation;
9. a compromised game cannot edit review evidence, its update owner, report route, admission state, trust label, or emergency policy;
10. developer and review logs are bounded and redact bearer tokens, signing material, household identifiers, raw frames, portraits, and body-profile data; and
11. family mode remains fully usable when developer pairing, review services, update services, hosted games, or WAN are unavailable.

## Current implementation boundary

The current repository has public manifest validation, signed installed-catalog resolution, narrow authenticated process launch, Motion origin/capability filtering, and prototype trust/runtime disclosures. It does not yet have a production admission database, curated-community UI, developer deployment service, emergency-disable feed, navigation containment, per-runtime sandbox, signed installer/update lifecycle, or persistent local data broker.

This document closes the tier-definition task, not enforcement or content review. I-095/I-096 supply per-game evidence; I-101/I-102 implement production and developer installation; I-106 implements curated discovery; I-115 defines console modes; I-136 enforces browser containment; and I-141 qualifies signing and rollback.
