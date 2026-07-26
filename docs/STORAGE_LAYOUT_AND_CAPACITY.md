# Storage Layout and Capacity Boundary

Status: software planning primitive implemented; exact card, partition sizes, filesystems, mounts, and physical qualification remain open.

## Purpose

`native/vcg-host/src/storage_layout.rs` defines the storage boundary required by D-048, D-050, and D-051 without pretending to partition a disk. It models:

- one firmware/boot partition;
- two equal, runtime-read-only system partitions;
- one writable data partition outside both system slots;
- fixed host-derived namespaces for packages, saves, profiles, retro content, logs, caches, and staging;
- a recovery reserve that ordinary writes cannot consume;
- inactive-slot image-capacity admission from sealed system-image evidence;
- explicit logical fault, cleanup, and factory-reset scope.

It does not call a partitioner, format or mount a filesystem, reserve blocks, write an image, delete content, or inspect a physical card.

## Logical layout

```text
0
| 4 MiB leading reserve
| firmware / boot
| system A (equal size, read-only at runtime)
| system B (equal size, read-only at runtime)
| writable data
| <4 MiB unallocated alignment tail
device end
```

The planner accepts exact measured device capacity plus candidate boot, system-slot, and recovery-reserve sizes. Boot and system sizes must be nonzero multiples of 4 MiB. It derives a contiguous aligned layout, rejects arithmetic overflow and non-fitting plans, and requires writable data to remain larger than the recovery reserve.

D-048's selected nominal capacity is represented as `256_000_000_000` manufacturer bytes. The test fixture's 512 MiB boot partition, 16 GiB system slots, and 8 GiB reserve are illustrative qualification inputs, not selected production sizes.

## Writable namespaces

One trusted absolute writable root derives these direct-child domains:

| Data class | Relative root | Default cleanup authority |
|---|---|---|
| System/update metadata | `system-state/` | Never automatic |
| Signed production packages | `packages/` | Explicit package lifecycle only |
| Developer packages | `developer-packages/` | Explicit developer lifecycle only |
| Game saves and unassigned progress | `games/` | Never automatic |
| Profile vault and portraits | `profiles/` | Never automatic |
| Installed retro content | `retro/` | Explicit retro lifecycle only |
| Bounded logs | `logs/` | Policy-managed |
| Disposable caches | `cache/` | Policy-managed |
| Incomplete work | `staging/` | Recovery coordinator only |

Package and retro-import staging are fixed descendants of `staging/`. Relative roots, filesystem roots, and lexical `.`/`..` components are rejected. The planner creates no directory and grants no game a root.

## Capacity admission

`WritableDataUsage` has nine fixed categories and rejects duplicate categories or aggregate overflow. The plan computes:

```text
physical free = writable capacity - measured usage
ordinary available = max(physical free - recovery headroom, 0)
```

An ordinary write is admitted only if the full request leaves the configured recovery headroom free. A separate privileged recovery-workspace operation may consume that reserve but still cannot exceed physical free space. Neither result reserves blocks; the future coordinator must pair admission with a real filesystem reservation or serialized transaction.

Package intake, save quotas, log retention, and retro import still enforce their narrower domain limits. This plan is the outer shared-capacity ceiling, not a replacement for per-domain quotas.

## System updates and isolation

The update-capacity method consumes sealed `VerifiedSystemImageEvidence`, not an independently supplied byte count. It requires the evidence to target the inactive slot and its signed/read-back image length to fit that equal system partition. The writable-data extent is returned unchanged as preservation evidence.

A logical fault plan marks exactly one partition role affected. Losing one system slot leaves the other system slot and writable data outside that logical extent. Losing firmware/boot or writable data requires external recovery; a whole-card, controller, partition-table, or shared-filesystem failure can still affect every role and is not disproved by logical extents.

## Factory reset

The planner deliberately refuses to invent the remaining content policy:

- system metadata must be reinitialized from trusted system state;
- developer packages, saves, profiles, logs, caches, and staging must be deleted;
- production packages and installed retro content remain `RequiresInstalledContentPolicy`.

No executable reset should proceed while either required policy choice is unresolved. Both system slots and firmware are outside the writable reset domain, but real reset ordering, key destruction, interruption recovery, and post-reset boot validation remain unimplemented.

## Automated evidence

Twelve focused Rust tests cover:

- aligned contiguous layout over the selected nominal capacity;
- equal runtime-read-only A/B slots and one writable remainder;
- zero, excessive, unaligned, overflowing, and non-fitting denial;
- fixed unique usage categories and aggregate overflow;
- exact reserve-boundary admission and full-disk denial;
- explicit recovery-headroom consumption without physical overrun;
- sealed inactive-slot evidence and image-size fit;
- logical single-partition fault scope;
- cleanup denial for metadata, identity, saves, and installed content;
- unresolved factory-reset content policy;
- fixed distinct namespace derivation; and
- relative, root-level, and traversal-like writable-root denial.

## Explicitly unproven

I-111 remains active. Completion still requires:

- exact high-endurance 256GB card manufacturer/model/revision and measured usable capacity;
- selected boot/system/data sizes based on real image and rollback growth;
- GPT/MBR and Raspberry Pi firmware compatibility;
- selected filesystems, mount flags, runtime read-only enforcement, and partition identifiers;
- real block reservation, quotas, bounded logs, low-space UX, and cleanup coordination;
- proof packages, saves, profiles, retro content, logs, imports, and update state are absent from both replaceable system slots;
- system-update, game-update, rollback, garbage-collection, factory-reset, corruption, and full-disk tests on the final image;
- sudden-power cuts at every partition/write/reset boundary;
- whole-card failure and verified computer-assisted reflash;
- endurance, write amplification, update time, boot time, and hundreds-cycle evidence; and
- proof committed local saves survive healthy OS/game updates but are permanently lost under the selected destructive reset/reflash policy.

Until those results exist, this is an enforceable software plan, not a qualified microSD partition layout.
