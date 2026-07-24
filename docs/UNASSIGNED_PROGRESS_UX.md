# Unassigned Progress console UX

Last updated: 2026-07-24

Status: bounded in-memory desk prototype implemented; native mutations and
target qualification remain

Authority: D-026, D-050, D-051, D-056, D-057, D-061, D-062, D-084, D-087,
D-088, D-089, I-189, I-190, and I-191

## Product boundary

Unassigned progress is console-managed local game data whose prior profile
link has been removed. It is not a profile, credential, portrait, calibration
record, body-matching input, cloud save, export archive, or hosted-service
account. The console may:

- play a compatible slot without assigning it;
- deliberately claim it to an existing local profile;
- resolve a same-game/same-slot conflict explicitly; or
- permanently delete the selected local slot.

The console never guesses ownership from a display name, portrait, body
measurement, newly created profile, recent player, or game-authored string.
There is no console backup, export, migration, or cloud synchronization.
Storage loss, destructive reflash, factory reset, or console replacement
permanently removes the data.

The Svelte screen uses four synthetic records and an in-memory controller.
It says so on-screen. It does not call the native host, read a save, persist a
claim, delete a file, or assert that any current game has compatible progress.

## Entry projection

The browser receives one closed bounded projection rather than a path or save
payload. The prototype admits no more than 64 entries. Each entry has exactly:

| Field | UI use | Boundary |
|---|---|---|
| `id` | Stable selection within the current projection | Host intent grammar; not a profile ID |
| `ownerId` | Opaque unassigned launch authority | Exactly 32 lowercase hexadecimal characters; never rendered |
| `gameId` | Fixed game intent | Host intent grammar |
| `gameTitle` | Household-readable game label | Bounded synthetic/catalog copy |
| `slotId` | Fixed save-slot intent | Host intent grammar; not rendered as a path |
| `slotLabel` | Household-readable slot label | Bounded sanitized copy |
| `progressSummary` | Optional understandable progress preview | Bounded sanitized copy; production extractor policy is Q-171 |
| `runtime` | Remote web, local web, native, or Libretro treatment | Closed vocabulary |
| `packageVersion` | Version that last wrote the record | Closed bounded version string |
| `requiredVersion` | Required compatible package, if known | Closed bounded version or null |
| `compatibility` | Ready, update required, or package unavailable | Closed vocabulary with text and symbol |
| `hostedProgressBoundary` | Disclose separate service data | Only remote web may carry the hosted-service boundary |
| `supportsAdditionalSlot` | Admit keep-both conflict handling | Host-owned capability, never inferred from content |
| `bytesUsed` | Local storage disclosure | Safe integer under the existing 64 GiB ceiling |
| `lastPlayedAt` | Local recency disclosure | Canonical ISO timestamp |

Unknown fields, unsafe identifiers, control characters, excessive text,
invalid timestamps, invalid runtime/boundary combinations, duplicate entries,
duplicate opaque owners, and excessive counts fail construction. The model
contains no display-name lookup, portrait, body signal, path, network
destination, export target, or arbitrary metadata bag.

## Screen flow

```text
Profiles
   |
   v
Unassigned list -- choose --> sanitized detail
   |                              |
   |                              +-- Play unassigned
   |                              |      |
   |                              |      +-- exact path-free play plan
   |                              |          ownership unchanged
   |                              |
   |                              +-- Claim to profile
   |                              |      |
   |                              |      +-- choose explicit profile ID
   |                              |             |
   |                              |             +-- no conflict -> confirm
   |                              |             |
   |                              |             +-- conflict
   |                              |                    |
   |                              |                    +-- keep both, only if allowed
   |                              |                    +-- replace existing slot
   |                              |                    +-- cancel safely
   |                              |
   |                              +-- Delete permanently
   |                                     |
   |                                     +-- scoped warning + confirm
   |
   +-- Back --> Profiles
```

Every confirmation is bound to the model revision. A changed list makes an
older claim or delete plan stale; the user must review the current record
again. A committed prototype claim or deletion removes only that entry from
the in-memory projection and increments the revision.

## Conflict behavior

A target profile conflicts only when it already owns the same fixed game and
slot IDs. The browser never compares titles or display names.

- No conflict: show the target profile and scope, then confirm the move.
- Keep both: show only when the host says the game supports another slot. The
  production host must create a distinct fixed slot; the browser does not
  invent a path.
- Replace: warn that the target profile's existing slot would be permanently
  removed and require another explicit confirmation.
- Keep current profile progress: cancel the claim with no mutation.

Merge is absent. A generic merge would let browser or game data select how two
save formats combine and could silently corrupt or misassociate progress.

## Runtime fixtures

The screen deliberately exercises distinct presentation boundaries without
claiming real data:

| Synthetic title | Runtime | Compatibility | Required disclosure |
|---|---|---|---|
| Obstacle | Bundled local web | Ready | Console-local slot; can play unassigned |
| Godot Motion Game | Native / Godot | Update required | Required package version; play disabled |
| 2048 | Libretro | Package unavailable | Record remains visible; play disabled |
| VibeBots | Remote web | Ready | Only console-local browser data is in scope; hosted account/service data is separate |

Claim and delete remain available when a package is unavailable because
ownership and retention are host data operations, not game execution.
Production must still prove each runtime adapter, compatible-version decision,
and actual save mutation.

## Input and accessibility

All operations are ordinary buttons with visible focus, accessible names, and
minimum 44-pixel targets. Status never relies on color alone. Compatibility
uses text plus a redundant circle, triangle, or cross. Warnings name permanent
loss rather than relying on a red border.

The launcher routes controller and triggered shell-motion actions into the same
closed input vocabulary:

| Input | Launcher action |
|---|---|
| D-pad / stick or swipe left/right | Previous/next visible control |
| South confirm or hands-together trigger | Activate focused control |
| Controller Back or crossed-arm Back trigger | Cancel the current dialog; otherwise return to Profiles |
| Home | Close the flow and return to launcher Home |

While a modal confirmation is open, controller and motion focus is restricted
to that dialog. Back closes the deepest pending state before it can leave the
screen. Controller Home remains a universal escape. The current browser
mapping is still a prototype; native remapping, simultaneous players,
TV-distance comprehension, screen-reader behavior, reduced-cognition testing,
and real-player motion timing remain qualification work.

## Destructive copy

Delete and replace state all of the following before confirmation:

- the exact game and slot being affected;
- that removal is permanent;
- that there is no backup, export, cloud copy, migration, or undo; and
- for remote web, that hosted-service account data is separate and unaffected.

Ordinary browsing and play do not repeat the permanent-loss warning. The
boundary appears where it changes a decision: the detail panel and destructive
confirmation.

## Abuse and regression evidence

The pure model tests prove:

- immutable snapshots and defensive copying;
- closed fields, bounded count/bytes/text, safe IDs, canonical timestamps, and
  runtime/boundary validation;
- duplicate entry and opaque-owner rejection;
- path-free play intent with unchanged ownership;
- play refusal while a package is incompatible or unavailable;
- exact profile-slot conflict detection;
- explicit replace and capability-gated keep-both handling;
- runtime-forged fields, mismatched delete scope, and unknown mutation
  authority rejection;
- stale confirmation refusal;
- no display-name-based claim; and
- exact-entry permanent deletion with no export field.

Chrome tests prove:

- the four representative records render with the prototype disclaimer;
- controller Select opens the claim flow;
- controller navigation stays trapped in the visible modal;
- keyboard Tab and Shift+Tab wrap inside the visible modal;
- controller Back cancels and restores focus without mutation;
- a conflicting claim requires a deliberate resolution;
- a non-conflicting claim removes only the chosen preview entry;
- hosted-service separation remains visible during remote-web deletion;
- Back cancels a destructive confirmation;
- confirmed deletion updates the entry count; and
- the toast remains inside the viewport and the screen does not overflow a
  520-pixel setup viewport.

A camera-free Motion simulator additionally proves a deliberate player join,
swipe focus change, hands-together selection, and crossed-arm Back through the
same launcher input path.

## Implementation map

| Artifact | Responsibility |
|---|---|
| `apps/console-lab/src/launcher/unassigned-progress.ts` | Closed bounded projection, conflict inspection, revision-bound plans, in-memory commit |
| `apps/console-lab/src/launcher/UnassignedProgressView.svelte` | Browse/detail/claim/conflict/delete UI and honest prototype boundary |
| `apps/console-lab/src/launcher/motion-input.ts` | Triggered shell-action to controller-safe launcher mapping |
| `apps/console-lab/src/launcher/ProfilesView.svelte` | Entry point and live unassigned count |
| `apps/console-lab/src/launcher/Launcher.svelte` | Shared profile state, modal focus scope, safe Back/Home routing |
| `apps/console-lab/src/launcher/unassigned-progress.test.ts` | Pure model abuse and lifecycle tests |
| `apps/console-lab/src/launcher/motion-input.test.ts` | Closed motion input mapping tests |
| `apps/console-lab/tests/console-flow.spec.ts` | Chrome controller, motion, disclosure, conflict, and destructive-flow tests |

## Remaining qualification

I-190 remains active. The desk prototype does not prove:

- authenticated native enumeration or push refresh;
- durable unlink, claim, keep-both, replacement, or deletion ordering;
- exact target profile-registry/vault integration;
- filesystem mutation, locks, quotas, full-disk handling, or crash recovery;
- trusted metadata extraction from hostile or old save formats;
- signed per-title compatibility and multi-slot capabilities;
- actual local-web browser stores, native/Godot mounts, Libretro directories,
  or hosted-title local storage;
- loading and long-operation recovery against a real broker;
- simultaneous-player ownership and controller assignment;
- package reinstall/rollback and same-name profile recreation;
- target Raspberry Pi and ordinary Linux evidence;
- TV-distance, child/household, accessibility, privacy, and legal review; or
- Q-170 through Q-174.

Production wiring must use the native `save_lifecycle` ownership contract and a
crash-recoverable mutation executor. It must not promote this browser model or
its synthetic fixtures into storage authority.
