# Data retention and deletion policy

Status: repository-wide current-state policy; unified native lifecycle service
not implemented

Date: 2026-07-24

This document advances I-139 by making the retention and deletion behavior for
skeletons, diagnostics, profiles, and saves explicit. It distinguishes
implemented browser/native behavior from selected product behavior and
unimplemented authority.

No elapsed-time rule silently deletes a profile or save. No profile deletion
silently deletes compatible console-managed progress. No local action claims
to delete separately hosted service data.

## Policy vocabulary

- **Volatile**: application memory only; reload/process exit destroys the
  current implementation.
- **Bounded volatile**: volatile plus an exact item/byte cap and eviction or
  refusal behavior.
- **Device-local persistent**: intended to survive healthy restart/update on
  the writable data partition.
- **User-managed export**: a deliberate local download whose later retention
  is outside VCG authority.
- **Separate service**: data controlled by another service; VCG can disclose
  and guide but cannot promise deletion.
- **Not implemented**: a selected behavior with no production storage or
  transaction authority yet.

## Current retention register

| Data class | Current location and bound | Automatic lifecycle | Deliberate action | Product deletion rule | Evidence and status |
|---|---|---|---|---|---|
| Raw camera pixels | One accepted `ImageBitmap` or direct video element in volatile browser/GPU memory; no application queue or serialization edge | Accepted images close after inference; dropped/late images close immediately; Stop/page close releases tracks and worker | Stop Camera | Never persist in normal mode; no retention window | Browser path and active synthetic-camera no-egress observation implemented; OS/GPU/crash/swap/native capture remain unqualified |
| Current Motion frame and tracker health | Current volatile state only | Replaced by newer state; run/input-mode shutdown removes current authority | Stop camera/replay or leave mode | No automatic persistent storage | Browser/Motion contract implemented |
| Skeleton trace buffer | At most 600 portable frames and 128 health events with trace-local pseudonyms | Oldest bounded state is evicted; input-mode change clears buffer and trace-local identity map | Explicit Clear or deliberate Export when nonempty | No automatic persistent trace. Export is a separate user-managed JSON file | Bounded buffer/export implemented; final support retention and native parity open |
| Skeleton trace export | User-selected browser download; schema excludes raw frames, audio, portraits, persistent profile IDs, and free text | Browser download handling only | User deletes the downloaded file | VCG keeps no hidden copy and performs no upload | Implemented synthetic/browser contract; operating-system download retention is outside VCG |
| Local browser diagnostics | Newest 256 closed-code events, monotonic page uptime only, volatile | Oldest event evicted and counted; reload clears all | Local admin-gated Clear; separately prepared/confirmed export | No native persistence or upload | Browser buffer, review, clear, and export tests implemented |
| Diagnostic export | Exact reviewed at-most-64-KiB local JSON download | No VCG-held copy after download | User deletes the downloaded file | Contains no frames, skeletons, profiles, identifiers, credentials, paths, exception text, or free text | Implemented browser contract |
| Future native diagnostics | No production store exists | None | None | Must be bounded, local, redacted, reviewable, clearable, and excluded from automatic telemetry | Not implemented; duration/size and crash evidence policy unresolved |
| Accessibility preferences | At most 1,024 bytes in `vcg.accessibility.v1` browser storage | Invalid state defaults in full; storage failure remains session-only | Reset accessibility settings | Device-wide prototype only; not profile deletion scope | Browser prototype implemented; native settings service absent |
| Profile-management rehearsal | Closed bounded synthetic profiles and links in Svelte memory | Reload loses all rehearsal state | Create, rename, recalibrate, reset, delete | Prototype mutation only; no durable-deletion claim | UI/unit/browser evidence implemented |
| Portrait, calibration, and body-profile data | Future encrypted device-local vault; no real persistent data currently stored | Selected design survives healthy restart until explicit reset/delete or invalidation | Retake, recalibrate, identity reset, profile delete | Reset/delete revokes portrait render authority and deletes exact sensitive records; automatic body matching cannot authenticate deletion | Vault, protected registry, transaction, and forensic evidence not implemented |
| Opaque profile registry record | Strict host registry carries opaque IDs only | Persistent host state by deployment; no mutation service | Future exact create/delete transaction | Removing an ID alone is not complete deletion | Legacy v1 launch intake plus a separate protected-v2 exact identity/generation/predecessor/digest loader are implemented; platform protection, migration, mutation, and deletion integration remain absent |
| Console-managed saves | Native planner derives exact per-game/owner/runtime namespaces; reset executor can delete one exact save/cache scope | Survive healthy package/system update and rollback while writable data survives; no time expiry or automatic cleanup | Exact deliberate game reset; unassigned progress can later be deliberately claimed, played, or deleted | Profile deletion preserves compatible progress as unassigned only after exact sanitizer qualification; incompatible progress requires explicit exact-record permanent deletion | Planner and crash-recoverable exact reset primitive implemented; production UI/broker/unassignment transaction open |
| Save cache | Separate exact derived cache namespace | May be removed only through exact reset/qualified cache policy; never used as save authority | Exact deliberate game reset | Reset removes only matching save and cache roots | Native reset primitive implemented |
| Hosted-service progress/account data | Service-controlled | Service policy | Service-specific sign-out/delete flow | Local reset/profile delete does not claim deletion | Disclosure boundary implemented in prototype; service guidance open |

## Required deletion semantics

### Motion and traces

Normal play retains no application-level raw pixels. A current frame, health
state, or trace is not a profile record and never survives by being attached
to a display name, save, diagnostic, crash report, or support export.

The trace buffer fails closed at its fixed schema and bounds. Export requires
a deliberate action and produces a new user-managed file; Clear does not
claim to find or remove copies the user already downloaded.

### Diagnostics

The browser buffer has no duration setting because it is volatile and bounded
by 256 events. Native logging may not copy that implementation into a durable
store without selecting both an item/byte bound and a maximum age or explicit
session-generation rule.

Preparing export freezes exact reviewed bytes. Confirmation exports only that
snapshot; new events do not enter it. Clear and export are separate actions.
Neither action contacts a support service.

### Profiles

Profile identity, portrait, calibration, body-profile features, and
console-managed progress are separate records. A production delete must:

1. bind one opaque profile and protected current generation;
2. inventory every sensitive record and progress link from trusted schemas;
3. revoke portrait rendering and body-profile application;
4. delete exact portrait/calibration/body records;
5. sanitize and move qualified compatible progress to an already allocated
   unassigned owner;
6. permanently delete only exact incompatible progress records separately
   selected by the user;
7. publish the updated registry/protected state at one durable commit point;
8. recover idempotently at every interruption; and
9. return bounded path-free completion evidence.

Same display name, portrait, body similarity, or a later recreated profile
never reassociates unassigned progress.

### Saves

Console-managed saves have no automatic age expiry and are excluded from
ordinary storage cleanup. They survive healthy updates/rollbacks but not
factory reset, unrecoverable storage loss, or an exact confirmed deletion.
There is no console backup, export, migration to another console, or cloud
copy.

The implemented reset primitive deletes exactly one derived
game/owner/runtime save root and its separate cache root through a
crash-recoverable journal. It does not delete a profile, another slot, a game
package, retro content, or hosted data. Production still needs runtime
quiescence and an accessible confirmation UI.

## Failure rules

| Failure | Required result |
|---|---|
| Unknown data class, field, path, or owner | Refuse; do not widen deletion |
| Registry/vault/save generation changes during review | Refuse the complete operation before mutation |
| Unqualified progress sanitizer | Block profile deletion unless that exact record is separately selected for permanent deletion |
| Full disk while publishing deletion intent | Preserve authoritative state and recover; never report success |
| Process death or power loss | Resume or safely finish the exact journaled scope; never guess from remaining paths |
| Hosted service unavailable | Local operation may proceed only with clear disclosure that hosted data is unchanged |
| Export fails after preparation | Retain local source state; do not treat export as deletion |
| Native log corruption or unknown schema | Quarantine/refuse and report bounded status; do not parse arbitrary text into support output |

## Existing automated evidence

- Motion trace tests enforce the 600-frame/128-health-event bounds,
  pseudonymization, exclusion flags, and closed export schema.
- Active browser observation exercises a synthetic camera and finds no
  external/mutating request, request body, persistent browser store, cache, or
  service worker.
- Local diagnostic tests enforce the 256-event/64-KiB bounds, stable code
  vocabulary, monotonic time, exact prepared snapshot, admin confirmation,
  clear behavior, and sensitive-field exclusion.
- Profile-management unit and Chrome tests cover safe focus, review/expiry,
  revision/scope drift, sensitive-record reset, exact sanitizer qualification,
  explicit incompatible-progress deletion, unassignment, same-name
  recreation, and hosted-service separation.
- Save lifecycle tests cover fixed owner/runtime namespaces, quotas,
  version-independent preservation, migration staging, unassignment/claim
  conflicts, and unsafe IDs.
- Save-reset tests cover exact save/cache deletion, other-owner/game
  preservation, durable interruption recovery, malformed intent, root/path
  substitution, lock contention, and idempotence.

These separate proofs do not yet constitute one native deletion service or a
physical target campaign.

## Remaining qualification

I-139 remains active. Missing work includes:

- final native diagnostic duration/size/rotation/crash policy and durable
  implementation;
- native tracker/GPU/OS/crash-dump/swap proof that raw frames and skeletons
  do not persist;
- protected profile registry/vault/save generation binding and one durable
  cross-store profile-delete transaction;
- exact real portrait/calibration/body-record inventory and immediate key/
  render revocation;
- qualified per-runtime progress sanitizers and durable unassignment/claim/
  permanent-delete execution;
- production reset/delete/clear/export UI with controller, motion,
  accessibility, localization, coercion, and household review;
- factory-reset ordering and physical-card forensic expectations;
- full-disk, corruption, kill, update/rollback, and power-cut campaigns on
  ARM64 and x86-64; and
- final privacy/legal/support review for children and intended markets.
