# Native diagnostic store boundary

Status: bounded crash-recoverable Rust store implemented as an unwired native
library boundary; production service ownership, platform provenance, clear and
export authorization, and target qualification remain open.

## Purpose

`native/vcg-host/src/diagnostics.rs` supplies a local diagnostic record without
turning diagnostics into telemetry, arbitrary logging, or security authority.
It is deliberately independent of launcher availability, package activation,
updates, saves, recovery, and power coordination.

The trusted host must choose three positive retention limits when opening the
store:

- retained event count, at most 4,096;
- retained serialized bytes, from 512 bytes through 4 MiB; and
- retained boot epochs, at most 64.

These are hard implementation ceilings, not selected product defaults. Q-148
and DR-001 still own the final byte, event, boot, and any age policy.

## Closed producer contract

The only admitted producers are the access controller, launcher, package
manager, power coordinator, process supervisor, and system update coordinator.
The store issues a move-only capability bound to one exact store instance and
one exact producer. Each diagnostic code has a fixed producer, subsystem, and
severity; callers cannot provide or override any of them.

The initial vocabulary covers:

- family/admin/developer access transitions;
- launcher ready and launch start;
- package inventory available/unavailable;
- power idle, wake, and terminal transition failure;
- process activation denial and unexpected child exit; and
- update health failure and rollback start.

There is no string, path, identifier, payload, error text, exit code, process
ID, URL, network address, device label, wall-clock timestamp, frame, skeleton,
profile, portrait, calibration value, save value, credential, or extension
map. Adding a code is a schema and privacy review, not a caller choice.

The capability separates mutually distrusting in-process adapters after the
host hands them their leases. It does not authenticate an operating-system
peer. A component that owns the store can mint leases and remains inside the
trusted host boundary. Q-246 owns the exact privileged process and IPC
identity integration.

## Durable record

Each committed event contains only:

```text
schema version
global positive ordinal
positive caller-supplied boot epoch
boot-relative monotonic milliseconds
closed producer
derived subsystem
derived severity
closed code
```

Producer uptime may stay equal but cannot move backward within one boot.
Global ordinals are contiguous after the oldest retained prefix. Boot epochs
cannot move backward. The store does not claim its boot epoch is trustworthy:
the future platform adapter must supply that provenance.

An append writes one bounded incoming file with create-new semantics, flushes
the complete file, renames it to its canonical ordinal name, and synchronizes
the event directory where the platform exposes that primitive. Reopen removes
only canonical incomplete incoming files, validates every retained file and
its derived metadata, rejects gaps and unexpected layout, and continues the
next ordinal. One nonblocking file lock excludes cooperating concurrent
writers.

Each retained event is at most 512 bytes. Directory enumeration stops beyond
the hard event ceiling. Selected event, byte, and boot bounds are enforced
oldest-first after open and append. Rotation removes complete event files.
Interruption during rotation can leave extra valid oldest records for the next
open; it cannot publish a partial event as committed.

Windows does not expose the Unix directory `fsync` primitive through this
implementation, so current Windows tests are logical crash-recovery evidence,
not storage-controller durability evidence.

## Review boundary

`snapshot()` returns immutable-by-ownership Rust values with fixed false
answers for raw frames, skeletons, profiles, personal identifiers,
credentials, and free text. It reports retained bytes, configured bounds,
oldest-prefix eviction count, warning count, and closed-subsystem counts.

The snapshot is intentionally not serializable and grants no export, upload,
share, clear, or support authority. The browser's existing reviewed 64-KiB
export is a separate volatile prototype and is not backed by this native
store.

## Failure and attacker boundaries

Diagnostic failure must remain non-authoritative. A full, unavailable,
malformed, or busy store must not block boot, Home/Back, local play, launch
cleanup, update rollback, save commit, profile deletion, or power recovery.
The integrating host may surface a fixed "diagnostics unavailable" condition,
but must not copy an I/O error or path into another diagnostic payload.

The journal is not rollback-protected. A same-account or storage attacker can
delete an oldest prefix, which is indistinguishable from ordinary retention,
or replace files and cause the store to refuse. The store must never be used
to authorize a launch, prove health, consume a retry, select an update, or
settle a security dispute.

No runtime currently opens the store or hands a lease to a real producer.
There is no authenticated cross-process adapter, trusted boot epoch, admin
review/clear transaction, consented export destination, support workflow,
age-based retention, health UI, target filesystem/full-disk/power-cut test,
or independently inspected production artifact. General core dumps and memory
snapshots remain excluded.

## Automated evidence

Eleven focused Rust tests cover:

- closed code/source/subsystem/severity derivation;
- exact store and producer capability binding;
- producer-local monotonic time;
- committed reopen and ordinal continuation;
- incomplete incoming-file recovery;
- oldest-first event, byte, and boot retention;
- path-free fixed privacy exclusions and summary counts;
- boot rollback, interleaved-producer time reversal, and changed derived
  metadata refusal; and
- invalid bounds, relative paths, unexpected layout, and lock contention.

Strict all-target/all-feature Clippy and the complete native suite remain
required gates. Physical qualification must repeat interrupted publication and
rotation under target filesystem, full-disk, read-only, corruption, and
sudden-power-loss conditions.
