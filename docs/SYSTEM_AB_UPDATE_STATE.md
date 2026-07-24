# Atomic A/B System Update State

Status: implemented metadata primitive, sealed delegated-image/read-back
evidence, and exact protected-journal protocol; Raspberry Pi image writer,
protected-storage adapter, bootloader, and target qualification remain open.

## Scope

`native/vcg-host/src/system_update.rs` implements the crash-recoverable host
state needed to coordinate two read-only system slots and binds every journal
use to exact externally protected channel/target/record state. It does not
download an image, implement protected platform storage, write a partition,
alter a bootloader, run migrations, or touch game packages, saves, profiles,
logs, imports, or other writable content.

The privileged image service must:

1. download a target-specific signed manifest and image;
2. verify the signature before trusting either;
3. write only the inactive system slot;
4. use the signature-first verifier in `system_image.rs` to bind the exact release ID, target, generation, manifest SHA-256, image SHA-256, and length while retaining the exact opened source handle;
5. write from that handle, synchronize, then pass a trusted inactive-slot read-back stream through the signed verifier;
6. stage and arm only the resulting sealed slot evidence;
7. atomically commit every returned exact journal protected state before
   invoking the next transition;
8. let the boot coordinator durably claim the attempt, commit the claim's
   returned protected state, and only then transfer control.

Treating caller-supplied strings or deserialized snapshot facts as proof of
verification is forbidden. Journal initialization and staging accept
non-deserializable `VerifiedSystemImageEvidence`, obtained only after the
delegated signed manifest, complete source file, and privileged inactive-slot
read-back stream match as documented in `SYSTEM_IMAGE_MANIFEST.md`. The
verified update channel is retained in that evidence and journal history.
Partition writing, synchronization, protected-state provenance, and read-back
provenance remain platform responsibilities.

## State flow

```text
healthy A
   |
   | verified bytes written to inactive B
   v
staged B  -- ordinary boot still selects A
   |
   | arm with 1..=10 attempts
   v
armed B   -- eligible only through a durable claim
   |
   | durable claim consumes one attempt
   v
booting B
   | \
   |  \ restart before confirmation
   |   +--> retry B while attempts remain
   |   +--> rollback to A when exhausted
   |
   +--> any failed gate / health deadline --> rollback to A
   |
   +--> launcher + tracker + camera + controller
        + network + storage all pass in one attempt
        |
        v
      healthy B
```

A staged image never changes boot selection. An armed candidate becomes bootable only after its attempt claim is durably appended. A `booting` record found after restart requires explicit recovery; it cannot silently select another candidate boot.

Every arrow that appends a record is a two-phase transition. The record is
published first, then its exact `{channel, target, sequence, recordSha256}`
state must be committed through the platform adapter. Until that commit,
snapshot reads, boot selection, and later transitions fail closed. See
[the protected-state protocol](SYSTEM_UPDATE_PROTECTED_STATE.md).

## Journal layout

The pre-provisioned host-owned metadata root contains:

```text
<system-update-root>/
  .vcg-system-update.lock
  records/
    00000000000000000001.json
    00000000000000000002.json
    ...
```

The protected-state document is stored in a separate platform-owned slot, not
under `<system-update-root>`.

Journal record schema v2 adds the authoritative delegated channel to every
persisted image. The prototype deliberately does not reinterpret or silently
migrate v1 records; an existing v1 journal fails closed until a separately
authorized migration or destructive reset is qualified.

Each immutable record contains the complete bounded snapshot, a strictly consecutive sequence, and the SHA-256 of the exact previous record bytes. Publishing uses a synchronized create-new temporary file and a no-replace hard link. The Linux target synchronizes the records directory before and after removing the temporary name. Non-Unix builds validate logical recovery but do not claim portable directory durability.

Recovery has two unambiguous temporary-file outcomes:

- no published final link: discard the unpublished record and keep the prior state;
- byte-identical final link exists: retain the committed record and remove only the duplicate temporary name.

A conflicting link, malformed record, unknown entry, noncanonical name, gap, changed hash link, unsafe path, oversized record, or invalid state fails closed.

An ordinary read never derives a protected advance from a record found ahead
of protected state. Repeating the exact authenticated operation can recover
one published record by reconstructing its canonical bytes from the protected
prior snapshot and operation inputs. A mismatch or multiple-record advance
returns no commit authority.

## Safety invariants

- Exactly one active system image exists after initialization.
- A candidate must use the other slot, match the exact delegated channel and
  active target, and strictly advance the highest generation ever observed in
  retained journal history.
- Every read and mutation requires the latest journal sequence and complete
  record digest to equal externally protected state.
- Initialization, staging, arming, attempt claim, every new health gate,
  confirmation, retry, and rollback remain unusable until their returned exact
  state is committed.
- Boot transfer cannot occur until the claimed attempt record is both durable
  and exactly protected.
- Failed generation numbers cannot be replayed. A deliberate content rollback must be published as a newly signed higher generation.
- Only one update can be pending.
- Attempt budgets are bounded to 1 through 10.
- Boot attempt IDs strictly increase across every retained update, not merely within one candidate. A delayed health or timeout report from an older release cannot collide with a later update's first attempt.
- Health confirmation requires all six D-050 gates in the same claimed attempt.
- Gate producers must report subsystem health, not household peripheral presence or internet reachability. In particular, the network gate must be able to pass while intentionally offline under D-034; the camera and controller gates must distinguish a healthy service that truthfully represents an allowed absent/disconnected device from a broken service. The production policy for required-at-boot hardware is not selected here.
- Any reported unhealthy gate or watchdog deadline expiry immediately returns selection to the prior healthy slot.
- An interrupted boot consumes an attempt before it can retry.
- System-update records contain release metadata and hashes, never image bytes, signing keys, user data, profile data, save paths, package paths, or arbitrary filesystem targets.
- All cooperating mutations use one nonblocking host lock.

## Automated evidence

The focused Rust suite covers:

- initialization and reload of the hash-linked journal;
- inactive-slot staging without boot-selection change;
- active-slot, target-drift, and generation-rollback rejection;
- bounded arm and durable attempt claim;
- retry after interruption and automatic rollback at exhaustion;
- confirmation only after all six selected health gates;
- refusal to confirm when one gate is missing;
- immediate rollback on camera/network failures and health timeout;
- stale-attempt rejection;
- cross-update attempt-ID collision rejection and per-attempt health isolation;
- failed-generation replay rejection while history remains;
- rehashed but semantically impossible transition rejection;
- idempotent duplicate health without journal growth;
- malformed, gapped, and unexpected journal state failing closed;
- unpublished and already-published temporary-record recovery;
- malformed image evidence rejection.
- strict bounded protected-state parsing and channel/target scope binding;
- denial of ordinary use while any journal record awaits a protected commit;
- exact idempotent operation retry after record publication;
- rejection of a nonmatching retry without returning commit state;
- deletion/rollback, same-sequence record substitution, and scope-drift
  rejection;
- published temporary-name cleanup only after exact operation or protected
  state authentication.

Run:

```powershell
$env:PATH = "C:\Users\randr\.cargo\bin;" + $env:PATH
cargo test -p vcg-host system_update --lib
cargo clippy -p vcg-host --all-targets -- -D warnings
```

## Explicitly unproven

This primitive advances I-110 but does not close it. The following still require target implementation or evidence:

- qualified protected-root/journal-state and trusted-time provisioning,
  production threshold custody, repository metadata, physical
  rotation/revocation drills, exact compare-and-swap, authorized channel/target
  migration, and reset/recovery policy;
- resumable download, capacity reservation, inactive-partition writer, complete read-back verification, and update/write-volume measurement;
- exact Raspberry Pi bootloader adapter and atomic selection semantics;
- watchdog timing, service identity, and trustworthy health producers;
- system/data migration compatibility and rollback behavior;
- target-Linux directory/filesystem durability and hostile same-account writer containment;
- journal checkpoint/retention after the bounded 16,384-record limit;
- sudden-power injection at every write, selection, boot, health, confirmation, migration, and rollback phase;
- preservation of game packages, saves, profiles, logs, and imports on the final partition layout;
- boot time and hundreds-cycle microSD qualification.

Until those rows pass, this code is a reviewable update-state boundary, not evidence that a Raspberry Pi console can safely self-update.
