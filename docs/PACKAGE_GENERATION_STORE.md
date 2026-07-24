# Signed package generation store

Last updated: 2026-07-24

This document defines the implemented host-owned signed-archive intake, staging, signed-policy candidate health, monotonic activation, interruption recovery, retention planning, explicit crash-recoverable generation cleanup, and launcher-startup boundary for production game packages. It composes with the [signed release intake](PACKAGE_INTAKE.md) and [signed installed-package catalog](INSTALLED_PACKAGE_CATALOG.md); it is not a network downloader, automatic retention policy, uninstall UI, live-runtime qualification, or target-hardware result.

## Store layout

An already provisioned store has this shape:

```text
<store-root>/
  .vcg-package-store.lock
  staging/
    <transaction-id>/
      .vcg-transfer-receipt.json
      installed-catalog.json
      installed-catalog.sig
      install/
  generations/
    00000000000000000007/
      installed-catalog.json
      installed-catalog.sig
      install/
  activations/
    00000000000000000007.json
  promotion.intent

<managed-content-root>/  # optional, configured separately
```

`.vcg-package-store.lock` is a provisioned inert persistent regular file. It
contains no authority or progress. Every cooperating staging, staged-receipt
cleanup, health/promotion, recovery, and cleanup-planning operation takes it
nonblockingly; contention fails closed instead of running two mutations
concurrently. `promotion.intent` exists only while one durable promotion is
incomplete. The store root, bootstrapped update policy, optional
managed-content root, ephemeral runtime root, and persistent data/save root are
host configuration. A browser, game, public manifest, hosted origin, or package
payload cannot choose them.

The store opener requires absolute paths, the existing direct-child regular lock file, and existing real `staging`, `generations`, and `activations` directories. A staged transaction ID uses the same bounded lowercase identifier grammar as other host intent. Canonical candidate and generation directories must be direct children of their expected host-owned parent; an escaping symlink or reparse point is rejected.

## Verification and promotion

One staging directory is a complete candidate snapshot. Before publishing any durable promotion intent, the Rust host:

1. verifies the exact catalog bytes under the selected delegated
   channel/installed-catalog/target threshold before parsing JSON;
2. requires the exact compiled target, a positive generation, qualified entries, safe paths, and bound manifest identities;
3. verifies SHA-256 for every manifest, frontend, core, base configuration, and managed-content artifact;
4. requires the candidate generation to be greater than the highest committed generation;
5. binds the intended catalog bytes into a durable marker with their SHA-256.

Only then does it atomically publish `promotion.intent` as a no-replace hard-link entry, move the candidate directory within the same store filesystem to its zero-padded generation path, re-verify the catalog and every path from the moved location, and publish a second no-replace hard link as the append-only activation marker. After the activation directory is synchronized, the intent name is removed. The old activation markers and generation directories remain available; this slice performs no garbage collection or operating-system immutability enforcement.

The active generation is the numerically greatest valid activation marker. Every load re-verifies that marker, the signed catalog, and every artifact. A malformed greatest marker fails closed instead of silently selecting an older valid release.

An equal or lower signed generation is rejected while the activation history remains intact. A deliberate bad-release rollback therefore requires a newly signed, higher generation whose catalog selects the prior package versions.

This is crash-monotonic selection, not tamper-resistant anti-rollback. The current history lives in the writable store; protected per-channel state, deletion resistance, and authenticated recovery remain open under I-141.

## Signed archive intake

`stage_package_tar` accepts a completed archive only through the signature-first release descriptor defined in [PACKAGE_INTAKE.md](PACKAGE_INTAKE.md). The [resumable transfer sink](PACKAGE_TRANSFER.md) can durably publish that completed archive without granting staging authority. `stage_ready_transfer` keeps the receiver's exclusive lock, independently re-verifies the descriptor under the store's delegated package-release role, requires the exact transfer/release binding, and re-hashes the ready archive before using the same intake path. Intake verifies exact archive evidence, admits extraction capacity with nonzero reserved headroom, extracts a narrow uncompressed TAR into a private incoming directory, checks exact signed expanded/catalog evidence, verifies the separately delegated installed catalog and every artifact, requires descriptor/catalog generation agreement, and synchronizes a strict host receipt for the complete signed descriptor identity.

Only then is the private directory atomically renamed to `staging/<transaction-id>`. This creates an inert promotion candidate; it does not publish `promotion.intent`, run candidate health, or change active state. Failure validates and removes only the private incoming direct child.

The handoff initially retains the ready archive and immutable transfer binding after successful staging. They are a durable receipt across a crash between staging and later coordination. A repeated handoff reports the existing staging transaction. A later explicit `cleanup_staged_transfer_receipt` call may remove only that ready archive and binding while holding the receiver lock and only after the exact staged descriptor receipt and release re-verify. A synchronized cleanup intent makes interruption recoverable. Automatic timing remains separate policy.

## Health-gated promotion

The production promotion entry point is `promote_health_checked`. Artifact-only activation is private to generation-state tests and cannot be called by another host module.

Before health execution, the native catalog authority re-hashes the bound manifest and extracts only:

- `launch.timeoutMs`, bounded to 1,000–120,000 milliseconds; and
- `healthCheck.type`, currently `process` or `explicit-ready` for the implemented local Libretro lane.

No browser value or unsigned host default may select this policy. HTTP health remains a hosted/local-web service concern and is rejected for the current installed Libretro runtime.

Each candidate package resolves through the same signed catalog and adapter as a real launch, but the host replaces its runtime and data roots with transaction/game-specific paths beneath the configured ephemeral runtime root. It never passes a player profile or persistent save root.

- `process` health requires the direct child to remain alive for the complete signed window. The host then terminates and reaps it. This is compatibility smoke evidence only.
- `explicit-ready` adds only a host-derived `VCG_READY_FILE`. A bounded non-empty UTF-8 token must appear before the signed timeout; the host then terminates and reaps the child. A missing, oversized, invalid, or non-regular token fails.

Every health failure occurs before `promotion.intent`, so the previous active generation remains authoritative. After every package passes, promotion re-loads the stage and requires the exact catalog digest observed by health before publishing intent. This prevents health evidence from being reused after candidate catalog replacement.

Neither policy proves a visible, focused, responsive, or contained compositor window. Exact producer authority remains [Q-115 and Q-116](OWNER_QUESTIONS_PACKAGE_HEALTH_2026-07-23.md); target qualification still needs real wrappers, compositor observation, hostile-child tests, and measured startup behavior.

## Launcher startup integration

The native launcher accepts the generation store as an alternative to loose catalog, signature, and install-root paths:

```text
--package-store-root <absolute-store-root>
--update-root-store <absolute-accepted-root-store-path>
--update-root-anchors <absolute-out-of-band-anchor-set-path>
--update-root-min-generation <protected-generation-floor>
--update-channel <host-selected-channel>
--trusted-unix-seconds <trusted-time-snapshot>
--runtime-root <absolute-runtime-root>
--data-root <absolute-data-root>
[--content-root <absolute-managed-content-root>]
```

Loose catalog options and `--package-store-root` are mutually exclusive. Profile and watchdog-game allowlists retain the same host-owned semantics in either mode.

The launcher bounds and parses the closed anchor document, explicitly recovers
only unpublished accepted-root directories during normal startup, replays the
complete root chain under the supplied generation floor and time, and creates
one `TrustedUpdatePolicy` snapshot used by every store revalidation in that
startup transaction. Dry-run refuses pending root recovery. This CLI form is
an integration boundary, not proof that anchors, the floor, or time came from
protected storage. A host must obtain a fresh trustworthy time snapshot for
later update admission rather than treat an old process value as a permanent
clock.

Normal launcher startup opens the store, recovers a valid durable intent, loads and re-verifies the greatest active generation, then creates the authenticated API and browser process. An empty store or invalid recovery/activation state prevents launcher startup. A recovery result is written only to the host log as `clean` or `activated` plus generation; it is not browser authority.

`--dry-run` remains read-only. It validates whether a durable intent exists and fails with recovery-required state rather than moving a generation or committing an activation. With no pending recovery it re-verifies the active generation and prints only source, generation, target, and configured allowlist counts.

## Interruption recovery

The durable intent is published before the staged directory moves. Recovery has three stable cases:

| Observed state | Recovery behavior |
|---|---|
| No `promotion.intent` | Keep the existing active generation; incomplete staging is inert. |
| Intent plus matching staging directory | Re-verify the marker, signature, catalog digest, and all artifacts; move the generation and commit the activation marker. |
| Intent plus matching generation directory | Re-verify the moved generation and commit the activation marker. |
| Matching activation marker plus remaining intent | Verify the two marker records are identical, remove the completed intent name, and retain the committed generation. |

Both candidate locations, neither candidate location, a changed catalog/artifact, a stale generation, or a malformed marker fail closed. Recovery does not guess, fall back, or delete evidence.

The marker file is synchronized before intent publication. On Unix, the store and rename-parent directories are also synchronized. Windows tests prove state-machine behavior but do not claim durable directory-flush semantics. Candidate ingestion must finish and synchronize its own files before invoking promotion. Sudden-power, filesystem, low-space, and removable-media tests on the selected Linux storage remain mandatory under I-114, I-200, and I-202.

## Save and namespace boundary

Package generations contain the catalog, signature, installed package/runtime artifacts, and the host-owned non-authoritative signed-descriptor receipt carried from staging. The optional console-managed content root and the persistent data/save root are configured separately from staging and generations. Promotion and recovery verify referenced managed content but never rename, copy, rewrite, or remove either external root; regression tests retain committed save bytes through installation and update.

This is necessary but not sufficient for uninstall. Package/runtime garbage collection and the separate controller-confirmed choice to preserve or delete saves remain unimplemented. Developer deployments also remain a different namespace and authority under D-054/I-102; this production store accepts only signed qualified catalogs and does not provide an unsigned exception.

## Implemented evidence and remaining work

Rust tests cover:

- signature-first capacity-admitted archive intake and failed partial-work cleanup;
- distinct delegated package-release and installed-catalog admission, retained
  authority evidence, changed-byte denial, and cross-role signer denial;
- portable bounded TAR paths/types/sizes plus exact expanded/catalog evidence;
- first install and higher-generation update;
- signature/catalog verification plus every referenced artifact, including managed content;
- signed process/explicit-ready policy parsing with timeout bounds;
- process survival, early-exit failure, explicit-ready success, invalid token failure, and child reaping;
- health failure before durable intent, exact catalog-digest binding, and save preservation;
- tamper rejection before durable intent publication;
- tamper rejection after the generation move but before activation;
- equal-generation rollback rejection;
- recovery before and after the generation-directory move;
- exclusive no-replace intent publication and recovery after activation-before-intent-unlink;
- required preprovisioning, nonblocking operation-lock contention across independently opened store handles, inert contents, and rejection of a non-regular lock path;
- launch-frozen cleanup planning composed with the store operation lock;
- explicit bounded cleanup of orphan and oldest-retired generations while preserving the rollback floor, active generation, live/restart-ambiguous launch generations, staging, managed content, and data/save roots;
- recovery after synchronized cleanup intent, activation-marker removal, generation-directory removal, or already-absent target bytes;
- refusal of malformed intent, changed target identity, newly protected targets, invalid bounds, promotion overlap, and all unrelated mutation until cleanup recovery completes;
- changed release bytes and a package-release signer presented as catalog authority fail before parsing or publication;
- fail-closed malformed newest activation state;
- preservation of data-root save bytes.

## Retention planning and explicit cleanup

`plan_cleanup(retain_count)` is a read-only host primitive. It accepts only a bounded count of at least two, refuses pending recovery, validates every activation marker and generation-directory name, requires every activated marker to retain a matching directory, and re-verifies the active generation.

Live native coordination calls `plan_cleanup_for_launch_service`. It first takes a host-only maintenance lease over the same mutex used by launch reservation, then takes the package-store operation lock, derives path-free generation protection from the locked launch state, and validates package history before releasing either lease. This fixed launch-then-store lock order prevents a fresh launch from appearing between protection capture and plan derivation. The internal planner rejects zero, duplicate, excessive, unactivated, or uninstalled protection and unions every valid protected generation with the ordinary newest-generation rollback set. Browser and package callers cannot supply protection values or acquire the maintenance lease.

The result exposes generation numbers only:

- `protected_generations`: the sorted, validated native launch references supplied for this plan;
- `retained_generations`: the newest requested activated snapshots, always including the active generation;
- `retired_generations`: older activated snapshots that a future coordinator may consider;
- `orphan_generations`: versioned directories with no activation marker.

The launch service binds the exact trusted catalog generation when accepting an intent. Preparing, running, and stopping records protect that generation. After restart, an indeterminate record continues protecting it until trusted native code proves old descendants gone and clears the durable cleanup barrier. Normal terminal history does not retain a generation.

Planning never returns filesystem paths and never mutates package state. `cleanup_for_launch_service(retain_count, max_removals, launch_service)` is a separate explicit host primitive. It takes the same launch-maintenance lease and then the store lock, recomputes protection, selects orphan generations before the oldest retired activation history, writes/synchronizes a bounded strict temporary intent, and publishes it with a no-replace hard link before mutation. A crash before publication leaves only a safe unpublished temporary file; after publication the authoritative intent is complete. The remover deletes a retired activation marker before its generation directory, making every later interruption either the original valid history or an inert orphan. `recover_cleanup_for_launch_service` reacquires both leases, validates the exact marker identity and current protection, and resumes idempotently. Newly protected/retained targets, target changes, malformed intent, or simultaneous promotion recovery fail closed and preserve the intent.

The remover cannot name arbitrary paths. It derives fixed-width generation paths from validated numbers, canonicalizes each direct child before recursive removal, deletes only activation markers and generation directories, and never touches staging, transfer state, managed content, runtime roots, or data/save roots. An in-progress cleanup blocks planning, staging, receipt cleanup, promotion, and promotion recovery until trusted cleanup recovery completes.

No browser endpoint or automatic scheduler invokes the remover. Exact generation-count/byte policy, low-space thresholds, and ordinary-versus-explicit timing remain [Q-113/Q-114](OWNER_QUESTIONS_PACKAGE_RETENTION_2026-07-23.md) and [Q-126](OWNER_QUESTIONS_GENERATION_CLEANUP_2026-07-24.md). Uninstall also remains separate because it needs controller-confirmed save preservation/deletion semantics and broader package/content lifecycle rules.

Still required:

- network discovery/client/TLS/range behavior, real capacity reservation, and low-space coordination/cleanup;
- automatic abandoned/consumed-transfer retention and cleanup scheduling;
- bounded `tar-zstd` streaming qualification or a decision to retain uncompressed TAR;
- automatic bad-release rollback expressed as a new signed generation;
- automatic retention scheduling/byte policy, uninstall, managed-content garbage collection, and controller-confirmed save disposition;
- protected provenance for the accepted-root floor, secure refreshed time, physical key-rotation/revocation drills, and protected per-channel artifact monotonic state;
- immutable/read-only artifact handoff and target-Linux crash/power-loss/directory-synchronization qualification;
- developer-namespace separation, target-Linux lock qualification, and hostile noncooperating-writer tests.
