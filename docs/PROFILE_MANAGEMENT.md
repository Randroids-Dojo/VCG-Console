# Credential-free local profile management

Last updated: 2026-07-24

Status: bounded in-memory lifecycle rehearsal implemented; native
transactions, durable progress unassignment, target fault evidence, household
abuse qualification, and legal review remain disabled

Authority: D-061, D-062, D-081, D-083, D-084, D-085, D-086, D-087, I-072,
I-184, I-185, I-186, I-187, I-188, I-189, I-190, I-191, Q-098, Q-099, and
Q-103

## Claim boundary

The console lab now rehearses profile creation, rename, portrait entry,
recalibration, reset, and deletion without a password or administrator. It
uses only bounded synthetic records and volatile browser state. The screen
states that:

- anyone using the console can manage a local profile;
- a display name, portrait, body match, or current player is not a credential;
- every operation begins from one explicitly selected opaque profile;
- destructive scope is shown before a confirmation becomes available;
- Back, Home, route change, or the safe focused choice cancels without a
  mutation;
- profile deletion removes synthetic identity data while changing each linked
  console-progress record to unassigned;
- a recreated same-name profile receives a different opaque ID and no prior
  progress links; and
- hosted-service data is separate and is not deleted by the console.

The implementation does not call the native profile registry, profile vault,
save broker, game runtime, camera, network, hosted service, filesystem, or
browser persistence. It therefore proves the UI and pure state-policy shape,
not a durable deletion or power-loss-safe transaction.

## Current synthetic model

The model accepts at most 64 profiles and 256 progress links. A profile seed
contains exactly:

| Field | Use | Boundary |
|---|---|---|
| `id` | Stable operation authority | Lowercase opaque host-intent grammar; never derived from the name |
| `name` | Household-readable display text | Trimmed, 1 through 24 characters, control-free; duplicates allowed |
| `detail` | Bounded fixture label | Control-free, at most 32 characters |
| `calibrationRevision` | Synthetic calibration presence | Positive safe integer or null |
| `bodyProfilePresent` | Synthetic body-match presence | Boolean only |

Accepted portrait handles live in the same bounded collection used by the
portrait rehearsal. The management model observes only whether the selected
opaque profile has a handle. Reset and delete use an exact expected handle and
remove it from that shared collection, so the profile tile immediately loses
the synthetic portrait.

A progress-link seed contains exactly:

| Field | Use | Boundary |
|---|---|---|
| `id` | Stable link record | Opaque host-intent grammar |
| `profileId` | Current local owner | Existing opaque profile ID or null |
| `unassignedOwnerId` | Stable owner after unlink | Fixed 128-bit lowercase hexadecimal fixture; never rendered or included in confirmation plans |
| `gameId`, `slotId` | Exact local progress scope | Opaque host-intent grammar; not paths |
| `gameTitle` | Review copy | Control-free, at most 48 characters |
| `runtime` | Boundary treatment | Remote web, local web, native, or Libretro |
| `hostedServiceSeparate` | Required hosted disclosure | True only for remote-web records; false for local runtimes |

Unknown fields, traversal-like IDs, control characters, invalid owner IDs,
orphaned links, duplicate profiles/records/owners, invalid runtime and hosted
combinations, and excessive counts fail construction. Snapshots expose
sanitized profile summaries and counts, not owner IDs, paths, payloads,
portraits, body measurements, credentials, network destinations, or arbitrary
metadata.

## Operation contract

Create and rename use closed, revision-bound plans. The synthetic allocator
issues a fresh opaque fixture ID for creation. Production must use the
privileged authority selected under Q-132; the browser must not choose a real
profile ID.

Recalibration, reset, and deletion use a closed plan bound to:

- exact model revision and opaque profile ID;
- exact current display name for review, but never for authority;
- exact portrait handle or absence;
- exact calibration revision or absence;
- exact body-profile presence;
- a sorted exact set of linked progress record IDs;
- a sorted exact set of separately hosted game IDs;
- a 1.5-second review deadline; and
- a 30-second confirmation expiry.

Unknown fields, an early or expired confirmation, stale model revision,
changed portrait, changed sensitive state, changed progress scope, time
rollback, or mismatched arrays fail closed. Plans contain no unassigned owner
ID, path, pixel, body feature, password, credential, export destination, or
network instruction.

## Provisional operation matrix

| Operation | Profile | Name | Portrait | Calibration | Body match | Console progress | Hosted service |
|---|---|---|---|---|---|---|---|
| Rename | Keep | Replace display text | Keep | Keep | Keep | Keep linked | No effect |
| Require recalibration | Keep | Keep | Keep | Clear | Clear | Keep linked | No effect |
| Reset local identity data | Keep | Keep | Remove | Clear | Clear | Keep linked | No effect |
| Delete local profile | Remove | Remove with profile | Remove | Clear | Clear | Preserve as unassigned | No effect; show guidance |

The reset row is a safe prototype choice, not a final product definition.
Exact reset scope remains Q-188. Accessibility preferences are not yet
profile-scoped in this model and are not silently claimed as deleted.

Delete changes every selected-profile progress record from that opaque
profile ID to its already allocated unassigned owner. It does not create an
owner from a display name, portrait, game string, current player, or body
signal. A later same-name creation gets a new opaque profile ID and zero linked
records.

The model records hosted-service count only to show the boundary. It does not
call, sign out of, delete, or claim authority over a hosted account.

## UI and input behavior

Profiles has one explicit `Manage selected profile` entry. The dedicated
screen shows:

- a credential-free household-management notice;
- the selected display name and synthetic portrait/calibration/body state;
- console-progress and hosted-service counts;
- a rename form that says duplicate names are allowed and do not move data;
- separate portrait, recalibration, reset, and delete choices; and
- exact-scope modal copy with a visible timing state.

The modal initially focuses `Keep profile`. The destructive button is disabled
until the review delay elapses, and focus does not move automatically when it
arms. This prevents a held or coincident Select signal from becoming a
destructive action. The user must deliberately move focus after review and
activate the destructive choice.

Controller D-pad/Select/Back and triggered shell-motion navigation use the
same launcher input vocabulary. Back cancels the modal before leaving the
screen. Home closes the flow. The dialog traps keyboard focus, uses ordinary
buttons and accessible names, and retains text/pattern disclosure instead of
depending on color.

## Non-negotiable invariants

1. Display names are never identity, authorization, uniqueness, or
   reassociation keys.
2. Portraits and body predictions never authorize profile management.
3. Every destructive operation names one exact opaque profile and current
   revision.
4. No destructive confirmation is accepted before its review delay or after
   expiry.
5. Safe cancellation is initially focused; arming never moves focus.
6. Recalibration invalidates body matching derived from the old calibration.
7. Reset and delete revoke portrait render authority immediately in the
   synthetic model.
8. Profile deletion removes the selected synthetic calibration and body-match
   state rather than merely hiding the tile.
9. Console-managed progress survives deletion only after losing the deleted
   opaque profile ID.
10. Unassigned progress never predicts or attaches to a new profile.
11. Hosted-service data is disclosed as separate and never represented as
    deleted.
12. Games, browser code, diagnostics, support, export, recovery, and network
    surfaces receive no management authority or sensitive identity payload.
13. Production remains disabled until the native transaction, vault,
    exclusion, failure recovery, household, accessibility, privacy, and legal
    gates pass.

## Required production transaction

The production broker must replace the in-memory commit with one durable,
recoverable transaction. The exact ordering remains Q-191, but it must prove
all of the following:

1. Resolve the selected opaque profile under a protected current registry and
   vault generation.
2. Enumerate every profile-owned sensitive record and every console-managed
   progress link from trusted schemas, not browser or game-authored paths.
3. Detect games whose retained progress cannot be safely stripped of identity
   and require an explicit per-game decision rather than claiming anonymous
   preservation.
4. Allocate stable unassigned owner records before severing profile links.
5. Revoke portrait render authority and delete portrait, calibration,
   body-profile, and derived keys without exposing bytes or feature values.
6. Durably unlink sanitized progress without changing its game/slot identity,
   deleting it, or attaching it elsewhere.
7. Publish the new profile registry and protected manifest state only at the
   defined commit point.
8. Recover idempotently after process death, power loss, full disk, rollback,
   update, or restart at every boundary.
9. Return bounded path-free evidence that lets the launcher display success
   only after the native transaction is durable.
10. Feed producer canaries into I-186 and inspect every backup, update,
    rollback, recovery, diagnostic, support, export, migration, save, and
    hosted path.

Removing a launch-registry entry alone is never deletion. Deleting vault data
before progress is safely unassigned can lose the authority needed to
sanitize it; unlinking progress before identity deletion can leave a partial
operation. The selected journal and commit order require target fault
evidence, not inference from this browser controller.

## Abuse and regression evidence

Twelve focused unit cases prove:

- immutable, minimized snapshots and defensive copies;
- closed/bounded profile and progress schemas;
- unknown-field, path-like ID, orphan, owner, runtime, and hosted-boundary
  rejection;
- duplicate display names without ownership movement;
- fresh opaque IDs and no same-name reassociation;
- elapsed review delay, bounded expiry, and monotonic time;
- recalibration clearing calibration/body state only;
- exact synthetic calibration-result application advancing the calibration
  revision without creating body-match authority;
- reset removing the shared portrait plus calibration/body state while
  preserving profile and links;
- deletion removing the profile and shared portrait while unassigning every
  local progress link;
- final-profile deletion into an empty metadata-only state;
- separately hosted service counts remaining unchanged;
- stale revision and changed portrait-scope rejection; and
- forged plan, credential, owner, path, pixel, and feature-field exclusion.

One Chrome flow proves:

- explicit management entry and credential-free copy;
- no password control;
- visible synthetic portrait, calibration, body, local-progress, and hosted
  scope;
- initially safe focus and disabled destructive confirmation;
- an early motion Select choosing the safe action without mutation;
- controller Back cancelling the modal;
- controller focus movement and Select after the delay;
- immediate visible portrait/calibration/body reset with progress preserved;
- deletion copy naming two preserved unassigned items and one untouched hosted
  service;
- deliberate motion confirmation after focus movement;
- active-profile recovery after deletion;
- same-name recreation with no portrait or progress links; and
- no horizontal document overflow.

The reviewed 1440 by 1000 screenshots are
`test-results/console-lab/profile-management.png` and
`test-results/console-lab/profile-management-delete-review.png`.

## Remaining qualification

I-188 remains incomplete. Required evidence includes:

- answers to Q-103 and Q-188 through Q-192;
- integration with the privileged writer selected under Q-132;
- exact profile-registry/vault/progress journal and protected-state binding;
- trusted per-runtime sanitizers and game-specific delete blockers;
- real portrait, calibration, body-profile, accessibility, achievement,
  leaderboard, diagnostic, and support-data inventory;
- immediate key/render revocation and forensic deletion evidence;
- save preservation without hidden identity or later reassociation;
- full-disk, corruption, update, rollback, process-kill, and power-cut
  campaigns on both reference targets;
- sibling, guest, visitor, simultaneous-player, child, household-conflict,
  coercion, and shoulder-surfing studies;
- controller, motion false-positive, one-handed, seated, screen-reader,
  reduced-cognition, TV-distance, and localization qualification;
- hosted-service-specific sign-out/delete guidance;
- I-186 producer canaries and real materialized artifact inspection; and
- qualified privacy, security, and applicable legal review.

Until those gates pass, the safe release behavior is to keep native profile
mutation disabled and offer non-photographic profile art.
