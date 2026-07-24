# Signed package generation store

Last updated: 2026-07-23

This document defines the implemented host-owned staging, verification, monotonic activation, and interruption-recovery boundary for production game packages. It composes with the [signed installed-package catalog](INSTALLED_PACKAGE_CATALOG.md); it is not an update downloader, health-check service, uninstall UI, or target-hardware qualification result.

## Store layout

An already provisioned store has this shape:

```text
<store-root>/
  staging/
    <transaction-id>/
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

`promotion.intent` exists only while one durable promotion is incomplete. The store root, public key, optional managed-content root, ephemeral runtime root, and persistent data/save root are host configuration. A browser, game, public manifest, hosted origin, or package payload cannot choose them.

The store opener requires absolute paths and existing real `staging`, `generations`, and `activations` directories. A staged transaction ID uses the same bounded lowercase identifier grammar as other host intent. Canonical candidate and generation directories must be direct children of their expected host-owned parent; an escaping symlink or reparse point is rejected.

## Verification and promotion

One staging directory is a complete candidate snapshot. Before publishing any durable promotion intent, the Rust host:

1. verifies the detached Ed25519 catalog signature before parsing JSON;
2. requires the exact compiled target, a positive generation, qualified entries, safe paths, and bound manifest identities;
3. verifies SHA-256 for every manifest, frontend, core, base configuration, and managed-content artifact;
4. requires the candidate generation to be greater than the highest committed generation;
5. binds the intended catalog bytes into a durable marker with their SHA-256.

Only then does it atomically publish `promotion.intent` as a no-replace hard-link entry, move the candidate directory within the same store filesystem to its zero-padded generation path, re-verify the catalog and every path from the moved location, and publish a second no-replace hard link as the append-only activation marker. After the activation directory is synchronized, the intent name is removed. The old activation markers and generation directories remain available; this slice performs no garbage collection or operating-system immutability enforcement.

The active generation is the numerically greatest valid activation marker. Every load re-verifies that marker, the signed catalog, and every artifact. A malformed greatest marker fails closed instead of silently selecting an older valid release.

An equal or lower signed generation is rejected while the activation history remains intact. A deliberate bad-release rollback therefore requires a newly signed, higher generation whose catalog selects the prior package versions.

This is crash-monotonic selection, not tamper-resistant anti-rollback. The current history lives in the writable store; protected per-channel state, deletion resistance, and authenticated recovery remain open under I-141.

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

Package generations contain only the catalog, signature, and installed package/runtime artifacts. The optional console-managed content root and the persistent data/save root are configured separately from staging and generations. Promotion and recovery verify referenced managed content but never rename, copy, rewrite, or remove either external root; regression tests retain committed save bytes through installation and update.

This is necessary but not sufficient for uninstall. Package/runtime garbage collection and the separate controller-confirmed choice to preserve or delete saves remain unimplemented. Developer deployments also remain a different namespace and authority under D-054/I-102; this production store accepts only signed qualified catalogs and does not provide an unsigned exception.

## Implemented evidence and remaining work

Rust tests cover:

- first install and higher-generation update;
- signature/catalog verification plus every referenced artifact, including managed content;
- tamper rejection before durable intent publication;
- tamper rejection after the generation move but before activation;
- equal-generation rollback rejection;
- recovery before and after the generation-directory move;
- exclusive no-replace intent publication and recovery after activation-before-intent-unlink;
- fail-closed malformed newest activation state;
- preservation of data-root save bytes.

Still required:

- update download/intake, archive safety, capacity reservation, and low-space cleanup;
- a service/CLI integration that opens the active generation for the launcher;
- per-game health checks and promotion only after usable readiness;
- automatic bad-release rollback expressed as a new signed generation;
- bounded retention, uninstall, and garbage collection;
- offline-root delegation, key rotation/revocation, and per-channel monotonic state;
- immutable/read-only artifact handoff and target-Linux crash/power-loss qualification;
- developer-namespace separation and hostile concurrency tests.
