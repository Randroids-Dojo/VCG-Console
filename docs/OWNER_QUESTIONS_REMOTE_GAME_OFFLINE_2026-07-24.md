# Owner questions: remote-game offline and update behavior

Date opened: 2026-07-24

Related work: I-096, Q-051, D-013, D-034, D-051, D-056

The v2 live 26-title browser observation qualifies zero offline packages.
Block-You alone loaded a document after a clean browser close and same-profile
offline restart, but no gameplay or complete-asset path was exercised. These
questions must be answered before expanding the claim or product lane. Until
then, keep mutable hosted deployments supervised, network-required, and
separate from independently signed local packages.

## RGO-001: authoritative catalog scope

Is the 2026-07-19 set of 26 VibeCoded.Games entries the admission inventory, or
are only VibeBots, Mi Casa Es Su Casa, and Determined in the first console
release?

Safe default: keep all 26 in compatibility research, but admit only exact
origin/version records that complete the trust, content, controller, service,
failure, and owner review. Do not interpret inclusion in the museum website as
family-mode console approval.

## RGO-002: PWA installation as a product lane

Should any hosted game be installed through browser PWA machinery, or should
the console expose only supervised remote browsing and independently signed
VCG packages?

Safe default: do not make PWA installation a production lane. A mutable
origin-controlled service worker does not provide the artifact identity,
signature, rollback, health check, uninstall semantics, or redistribution
record required by D-051. If a PWA lane is wanted, define its trust authority,
update ownership, storage/reset behavior, origin-loss recovery, and family-mode
review separately.

## RGO-003: Block-You offline candidate

Should Block-You receive the first complete hosted-offline play qualification?

Safe default: yes, as a research candidate only. Exercise a complete ordinary
session, every required asset, save/reload, audio, network loss during play,
cold offline restart, cache deletion, quota failure, worker update, mixed
versions, and recovery. Keep `network: required` and make no offline package
until rights and exact build authority are also resolved.

Current bounded evidence: the candidate completed two online priming loads,
cleanly closed, relaunched the same temporary profile with browser-context
offline mode set before navigation, loaded a complete document controlled by
its active worker, cleanly closed again, and removed the profile. This closes
only the document-restart observation. It does not answer the requested
ordinary-session, asset, input, audio, save, quota, update, mixed-version,
recovery, target-network-isolation, rights, or build-authority evidence.

## RGO-004: source-to-deployment identity

Who can supply a reproducible mapping from each public origin to an exact
source revision, dependency lock, build inputs, deploy identity, and service
schema?

Safe default: treat endpoint hashes as dated observation only. Do not admit or
mirror a deployment whose owner cannot bind the reviewed source and assets to
the bytes served to the console.

## RGO-005: test accounts and hosted data

May qualification create dedicated test accounts or hosted game records for
identity, messaging, leaderboard, AI, notification, and persistence paths?

Safe default: use owner-provided non-production tenants and synthetic data
only after the service inventory, retention/deletion rules, child/privacy
boundary, rate limits, cleanup owner, and credentials-handling procedure are
documented. Never use a family member's real account or data as qualification
evidence.

## RGO-006: offline promise vocabulary

Which user-visible terms distinguish:

- a network-required hosted game;
- a cached shell that cannot complete play;
- a hosted game with a verified offline primary loop;
- a signed local package with optional services; and
- a completely offline package?

Safe default: reserve “Works offline” for a complete tested primary loop,
restart, save/load, and required-asset closure on exact target releases. Label
anything weaker with the specific unavailable features and preserve
controller-accessible Retry, Details, Back, and Exit.

## RGO-007: service-worker update ownership

Who owns waiting-worker activation, cache-schema migrations, mixed old/new
assets, failed updates, rollback, origin compromise, and emergency disable for
the three manifest-bearing titles?

Safe default: the hosted game owner owns web deployment correctness, while the
console supervisor owns timeouts, termination, storage reset, origin
allowlisting, and safe return to the launcher. Do not silently clear saves or
keep a known-vulnerable worker to preserve availability.

## RGO-008: qualification depth and cadence

How often must mutable hosted origins repeat the browser, controller,
network-loss, storage, privacy, and content review?

Safe default: bind approval to an exact deploy identity when available; rerun
on every material deployment and on a bounded scheduled cadence. Immediately
recheck after origin ownership, TLS, manifest, worker, authentication, payment,
analytics, permissions, or service behavior changes.

## RGO-009: cache and save deletion UX

Should uninstall/reset expose separate controls for cached executable assets,
anonymous local progress, hosted-account data, and notification permission?

Safe default: separate them and describe the boundary truthfully. Console-local
deletion cannot claim to delete hosted data. Cache cleanup must not silently
erase saves, and removing a catalog entry must not erase either without a
separate confirmed action.
