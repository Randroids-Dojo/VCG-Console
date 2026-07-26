# Crash-recoverable console save reset

Last updated: 2026-07-24

Status: explicit host primitive implemented; confirmation UI, runtime
confinement, and target-filesystem qualification remain

Authority: D-051, D-089, I-100, I-191, Q-052

## Boundary

`native/vcg-host/src/save_reset.rs` executes one deliberately confirmed reset
scope produced by `SaveStoragePlan`. It removes exactly that
game/owner/runtime save directory and its separate cache directory. It does
not choose when to reset, expose a browser or CLI operation, uninstall a
package, remove managed retro content, alter another owner, delete a profile,
claim unassigned progress, or affect hosted-service data.

The transaction carries no save payload, absolute path, package path, profile
vault field, export destination, network destination, portrait, or calibration
data. D-089 remains unchanged: the console provides no save backup, export,
migration to another console, or cloud synchronization.

## Provisioned roots and authority

Trusted startup supplies three existing absolute directories:

- a transaction root containing the preprovisioned inert
  `save-reset.lock`;
- the console-managed save data root; and
- the disposable save-cache root.

All three are canonicalized and must be mutually disjoint, real directories
rather than links. A nonblocking advisory lock serializes reset publication,
mutation, inspection, and recovery. The lock contains no authority or
progress.

The caller supplies a validated `SaveStoragePlan`. The executor reconstructs
the exact expected paths from the plan's game ID, owner kind/ID, and runtime,
then requires both plan paths to equal the configured-root derivation. Existing
targets must be real directories and resolve to the exact canonical
counterpart beneath the appropriate root. A file, link, changed target, or
root mismatch fails closed.

## Durable transaction

The strict bounded intent is at most 4 KiB and contains only:

```json
{
  "schemaVersion": 1,
  "gameId": "native-game",
  "ownerKind": "profile",
  "ownerId": "player-one",
  "runtime": "native"
}
```

Unknown fields, unsupported versions/runtimes, unsafe IDs, oversized input,
and non-regular intent/temp entries are rejected before deletion.

The executor:

1. takes the save-reset operation lock;
2. rejects any prior authoritative or unpublished state;
3. writes and synchronizes a create-new temporary intent;
4. publishes it with a no-replace hard link and synchronizes the transaction
   root;
5. removes the temporary name;
6. validates and removes the save target if present, then synchronizes its
   parent;
7. validates and removes the cache target if present, then synchronizes its
   parent; and
8. removes the authoritative intent only after both targets are absent and
   synchronizes the transaction root.

On non-Unix development hosts the same state machine is tested, but directory
flush is not claimed.

## Recovery

| Observed state | Result |
|---|---|
| No intent or temporary | Clean; no mutation |
| Temporary only | Remove the unpublished temporary; preserve save/cache |
| Authoritative intent, both targets present | Revalidate and remove both |
| Authoritative intent, either target already absent | Idempotently finish the remaining target |
| Malformed/oversized intent or unsafe target | Fail closed; retain authoritative evidence |

A completed reset is idempotent. Recovery does not guess a path, weaken an
identity, select a different owner, or silently treat a hosted account as
deleted.

## Evidence and remaining work

Focused Windows and Linux-kernel development tests cover exact-scope
save/cache deletion, preservation of other owners/games/package bytes,
interruption after the first target, unpublished-temp recovery, malformed and
oversized intent, foreign roots, non-directory substitution, nonblocking lock
contention, required preprovisioning, overlapping roots, idempotence, and the
absence of export/profile-claim authority.

Still required:

- controller/motion-accessible deliberate confirmation and safe Back behavior;
- a trusted lifecycle service that is the only production caller;
- browser-profile and native mount confinement against hostile game code;
- runtime quiescence so no process writes the target during reset;
- durable unassignment, claim, migration, and permanent-delete transactions;
- filesystem quota and low-space coordination;
- hostile same-account writer and link-swap qualification; and
- native x86-64 Linux and Raspberry Pi power-loss/full-disk/corruption tests.
