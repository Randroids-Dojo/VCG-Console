# Raspberry Pi microSD Qualification Protocol

Status: pre-registered physical qualification plan; no card has been acquired,
written, benchmarked, fault-injected, or accepted.

Authority: D-047, D-048, D-049, D-050, D-089, D-109, D-151 through D-153,
D-162, D-167, I-022, I-111 through I-114, I-162, I-191, I-200, I-202, and
Q-086.

## Decision this campaign may support

The selected Raspberry Pi baseline may use one qualified 256GB high-endurance
microSD card for firmware, two read-only system slots, packages, saves,
profiles, retro content, logs, caches, staging, and update state only if the
exact received card and final console image pass every mandatory gate below.

The campaign has three possible outcomes:

1. **Qualify** one exact manufacturer/model/capacity/revision or receipt-lot
   boundary for the measured workload and declared service assumptions.
2. **Reject** the candidate and run I-021 against USB 3 SSD without weakening
   the higher-level storage contract.
3. **No conclusion** when identity, workload, equipment, sample coverage, or
   evidence is incomplete.

No advertised endurance hour count, speed class, reseller description,
single-card success, or desktop benchmark can produce a qualification result
by itself.

## Candidate identity and published envelope

The quote-date candidate is:

| Field | Current evidence |
|---|---|
| Product family | SanDisk High Endurance microSD UHS-I |
| Quoted reseller part | `SDSQQNR-256G-AN6IA` |
| Current manufacturer-listed 256GB part | `SDSQQNR-256G-GN6IA` |
| Nominal capacity | 256GB, or 256,000,000,000 manufacturer bytes |
| Published interface/form | microSDXC, UHS-I |
| Published performance ceiling | up to 100 MB/s sequential read and 40 MB/s sequential write |
| Published video endurance | up to 20,000 hours of Full HD recording |
| Published warranty | two-year limited warranty |
| Quoted source | [B&H product page](https://www.bhphotovideo.com/c/product/1466564-REG/sandisk_sdsqqnr_256g_an6ia_high_endurance_microsd_256gb.html) |
| Primary specifications | [SanDisk product page](https://www.sandisk.com/products/memory-cards/microsd-cards/sandisk-high-endurance-uhs-i-microsd?sku=SDSQQNR-256G-GN6IA) and [manufacturer data sheet](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/sandisk/product/memory-cards/high-endurance-uhs-i-microsd/data-sheet-high-endurance-uhs-i-microsd.pdf) |
| Identity guidance | [SanDisk registration guidance](https://support-en.sandisk.com/app/answers/detailweb/a_id/53116) says removable cards use date/batch codes rather than serial numbers |

The `AN6IA`/`GN6IA` suffix difference is unresolved. It must not be treated as
a harmless regional alias until manufacturer or authorized-reseller evidence
maps the quoted and received parts. Silent substitution is a test invalidation,
not an equivalent sample.

SanDisk defines the 20,000-hour figure around Full HD video recording. The VCG
workload contains small synchronous mutations, filesystem metadata, package
staging, A/B image writes, logs, caches, and abrupt power removal. Therefore
the published figure is only a candidate-selection fact. It is not a write
budget, TBW claim, console service-life claim, or acceptance result.

## Scope and fixed invariants

The test image and harness must preserve these product invariants:

- firmware/boot, equal system A, equal system B, and writable data remain
  separate extents;
- the active system slot is read-only during ordinary runtime;
- ordinary writes cannot consume reserved recovery headroom;
- logs and caches are bounded, while saves, profiles, production packages,
  developer packages, and retro content are never silently reclaimed;
- a system update writes and verifies only the inactive slot before promotion;
- committed state never silently corrupts after a tested power cut;
- a bad candidate returns to a prior healthy slot or an explicit recovery
  state without claiming success;
- healthy OS and game update/rollback preserve device-local saves;
- blank-card recovery installs only the signed base image and does not restore
  saves, profiles, portraits, achievements, scores, or unassigned progress;
- whole-card loss, destructive reflash, or replacement permanently loses that
  local data under D-089; and
- every accepted result binds the exact card, reader, Pi assembly, firmware,
  kernel, filesystem, mount policy, console image, workload, and test-harness
  revision.

Changing any bound component requires an explicit comparability review. A new
card controller/date-code lot, filesystem, mount option, kernel, firmware,
power supply, reader, partition layout, update algorithm, or materially larger
write trace cannot inherit qualification silently.

## Required equipment and controls

Record exact make, model, hardware revision, firmware, and connection path for:

- Raspberry Pi 5 board and production-intended power supply;
- microSD reader used for intake and recovery;
- independently controlled power-cut fixture that removes Pi input power
  without corrupting the harness computer;
- inline power measurement if used;
- console camera, AI HAT+, USB devices, controller receivers, cooling, and
  display chain used in the concurrent appliance workload;
- host computer and operating system used for destructive capacity testing and
  recovery writing;
- stable monotonic harness clock and externally retained event log; and
- one non-test storage device for evidence, never mounted as console writable
  storage during a run.

A proposed destructive cohort is at least three retail cards spanning at least
two independently purchased date/batch-code lots when obtainable, plus one
retained unpowered control from one tested lot. This proposal is not authorized
procurement; sample count, lot coverage, and retained-control budget remain in
the companion owner-question document.

## Intake and chain of custody

Create one immutable intake record per physical card before the first write:

- purchase source, receipt line, order date, and authorized-reseller evidence;
- sealed package photographs and exact front/back card photographs;
- printed part number, country/region markings, date/batch code, capacity, and
  every other visible label;
- host-reported CID, CSD, OCR, SCR, capacity in bytes, logical sector size, and
  any controller identity the production Pi path can expose;
- cryptographic digest of the raw identity dump;
- reader, adapter, port, host OS, kernel/driver, and tool versions;
- assigned opaque test ID that appears in published evidence instead of
  receipt/account data; and
- custody transitions, destructive-test start, and final disposition.

SanDisk says these cards do not carry a conventional serial number. Do not
invent one or publish a date/batch code as a serial. Store sensitive receipts
and full-resolution label photographs outside public evidence; publish the
minimum redacted facts needed to reproduce the hardware boundary.

Reject intake before console testing if:

- quoted, packaged, printed, and host-reported identities cannot be reconciled;
- the package is opened, relabeled, damaged, or from an unapproved substitute;
- the card reports a different capacity or inconsistent identity across cold
  insertions and readers;
- any identity field changes unexpectedly after testing; or
- full-device destructive capacity verification reports an error.

## Phase 0: freeze the qualification build

Before measurement, publish a campaign manifest containing exact digests or
version IDs for:

- recovery archive, recovery manifest, expanded image, and signing roles;
- partition table, sizes, alignment, filesystem formats, labels/UUIDs, mount
  options, and recovery reserve;
- bootloader/firmware, kernel, device tree, modules, and userspace image;
- package-generation, protected-state, system-update, save, profile-vault,
  retro-import, log, cache, and low-space implementations;
- workload fixtures and their signed package/catalog identities;
- fault schedule generator, random seed source, cut controller, and harness;
- health checks, committed-state oracles, and recovery classification rules;
- benchmark tool versions, parameters, direct-I/O/synchronization behavior,
  cache-dropping policy, and temperature/power sampling; and
- every numerical acceptance threshold derived before the first outcome is
  inspected.

Qualification is invalid if the tested image differs from the read-back image
or if the build cannot be reproduced from the retained manifest.

## Phase 1: counterfeit and capacity screen

On a non-console host, perform a destructive whole-address-space write/read
verification using a reviewed current tool such as F3 or H2testw. Record exact
command/options, tool digest/version, wall time, byte count, pattern or seed,
and all errors. Then:

1. discard any factory filesystem;
2. write deterministic pseudorandom data across the entire reported address
   space;
3. synchronize, power-cycle or safely remove/reinsert as the tool requires;
4. read and verify the complete address space;
5. compare measured capacity with the nominal-capacity rule;
6. perform a second cold insertion and capture identity again; and
7. retain the complete path-free summary and raw log digest.

Acceptance requires zero address, read, write, or compare errors and a stable
identity. Passing only proves addressability in that reader at that time.

## Phase 2: final-image baseline

Write the exact signed recovery image through the intended household recovery
path, synchronize, and read back the exact expanded-image prefix. Boot the
fully assembled Pi offline and record:

- cold-boot time distribution to controller-ready launcher;
- every boot/recovery reason and active slot;
- filesystem recovery messages and kernel/card-controller errors;
- sequential and random read/write throughput at relevant block sizes;
- synchronous small-write and rename/replace latency distributions;
- package install/promote/remove and save/checkpoint latency distributions;
- A/B system-image write, verify, promote, health, rollback, and cleanup time;
- temperatures, throttling, wall power, and free/headroom bytes; and
- complete hashes of immutable slots plus semantic hashes of committed
  writable fixtures.

Run uncached and warm-cache cases deliberately; never label page-cache speed as
media performance. Report p50, p95, p99, maximum, sample count, and the exact
measurement grain. Manufacturer maxima are comparison annotations only.

## Phase 3: derive and replay the console write workload

Instrument a representative complete console session before accelerating it.
The trace must include, separately:

- cold boot, idle launcher, and normal shutdown;
- web, native/Godot, Libretro, and permitted remote-web launches;
- package download, durable receipt, verification, promotion, rollback,
  cleanup, and explicit removal;
- system-image download, inactive-slot write/read-back, protected transition,
  health, rollback, and journal compaction;
- save/checkpoint create, replace, conflict, claim, delete, and reset;
- profile-vault create/update/portrait/delete and unassigned-progress changes;
- retro scan, copy, duplicate/conflict, cancellation, promotion, and removal;
- log rotation, diagnostics, cache churn, abandoned-staging cleanup, and
  low-space transitions; and
- concurrent camera/AI/controller/network/display activity representative of
  the final appliance.

Record application payload bytes, filesystem-level bytes, and block-device
write requests where the kernel exposes them. microSD provides no standard
SSD-like NAND TBW or SMART counter, so do not claim internal NAND write
amplification. Instead report observable host/block amplification:

```text
observable amplification =
  block-device bytes submitted / durable application payload bytes
```

State omissions, buffered-write uncertainty, discard behavior, and sampling
error. Use the trace to compute low, expected, and high daily write cases. The
campaign service projection is:

```text
projected host writes =
  high daily host writes * selected service days * workload growth factor
```

The service horizon and required margin over that projection remain owner
inputs. Until resolved, report results without a service-life qualification.

Replay the frozen trace at normal timing for interaction/latency evidence and
at accelerated timing only where equivalence is justified. A 60-minute or
four-hour synthetic loop is not a 30-day endurance result unless the submitted
writes and all omitted idle/thermal/recovery effects are disclosed.

## Phase 4: capacity, quota, and full-disk matrix

At minimum exercise these boundaries with real byte accounting:

| State | Required operation |
|---|---|
| Fresh image | Install representative base library and create every writable namespace |
| Above low-space warning | Continue ordinary play and expose reviewed cleanup choices |
| Exactly at ordinary-write limit | Prove recovery reserve remains unavailable to ordinary writes |
| One byte/block beyond admission | Refuse before partial durable mutation |
| Logs/cache over policy cap | Bound or trim only the authorized disposable class |
| Abandoned staging | Recover only through its owning transaction coordinator |
| Save/profile/package/retro pressure | Never silently delete durable content |
| Recovery workspace uses reserve | Complete or roll back while remaining within physical capacity |
| Physical filesystem full | Remain bootable, truthful, and controller-operable |
| Space reclaimed | Resume only after measured free space and state reconcile |

For every denial, prove the prior committed state remains readable and no
partially promoted package, profile, save, retro item, or system generation is
advertised. Measure the largest observed update and recovery workspace, then
derive—not guess—the final reserve and warning thresholds.

## Phase 5: update and operation interruption matrix

Generate cut points from durable transition boundaries plus randomized offsets,
not from a handful of hand-selected moments. Remove input power during:

- firmware/boot and ordinary boot;
- each system-image receive, verify, inactive-slot write, read-back, publish,
  protected-state commit, reboot, health, accept, rollback, and cleanup stage;
- each game-package receive, verify, catalog publish, protected generation
  commit, launch, rollback, removal, and recovery stage;
- save/checkpoint, profile-vault, portrait, unassigned-progress, retro import,
  log rotation, cache, staging cleanup, and factory-reset transitions;
- low-space admission and filesystem-recovery work; and
- simultaneous combinations of the above representative of real use.

The harness must not infer success merely because the launcher appears. After
every cut:

1. record the cut command and observed loss-of-power time;
2. restore power using a fixed procedure;
3. enforce a pre-registered boot/recovery timeout;
4. obtain authoritative active-generation and health evidence;
5. hash/parse every committed oracle and verify cross-object invariants;
6. classify bounded uncommitted loss separately from committed corruption;
7. capture filesystem/kernel/card errors without modifying the evidence first;
8. return to a known state or reimage before the next independent trial; and
9. account for every scheduled trial, including harness failures.

Mandatory acceptance is zero silent committed-state corruption and zero launch
of an unverified or uncommitted generation. Every valid cut must return to the
prior healthy state, complete the exact valid candidate, or enter an explicit
bounded recovery state. Latest uncommitted progress may be lost only within the
operation's documented commit boundary.

The final campaign must cover hundreds of valid cuts. The exact count and
distribution are frozen from transition coverage and a statistical confidence
target before results are reviewed; aborted or harness-invalid trials do not
count as passes.

## Phase 6: corruption and removal matrix

On expendable samples or restorable images, independently inject:

- partition-table primary and backup damage;
- firmware/boot-file deletion, truncation, and bit flips;
- active- and inactive-slot image damage;
- update journal, protected-state adapter record, package catalog/generation
  history, save, profile-vault manifest/object, retro metadata, log, cache, and
  staging corruption;
- filesystem metadata damage, orphaned temporary files, truncated atomic
  replacements, wrong ownership/mode, and exhausted inodes if applicable;
- block read failures or deterministic read corruption through a fault layer;
- card removal during reads and writes where mechanically safe; and
- whole-card replacement with a blank, older, cloned, or unrelated card.

Expected results are component-specific and pre-registered. Immutable signed
content must fail verification; writable authoritative state must fail closed
or recover from an authenticated prior state; disposable data may be dropped
only within policy; and the console must never silently reinterpret corrupt
bytes as a new valid profile, save, package, or generation.

## Phase 7: blank-card and replacement recovery

Run the D-049 household procedure on Windows, macOS, and Linux where those
platforms are intended to be supported:

1. start with a blank or unrelated removable card and at least one other
   attached storage device;
2. acquire the release from its stable public location;
3. verify delegated signature, exact archive identity, expanded-image identity,
   target hardware, generation, and minimum media;
4. select the target with an explicit destructive confirmation that names
   capacity and device identity without exposing private paths;
5. write, synchronize, read back, and safely eject;
6. boot the exact Pi assembly offline;
7. verify base-image integrity, controller-ready launcher, and expected system
   generation; and
8. verify that no prior saves, profiles, portraits, scores, achievements,
   packages, or household identifiers were restored.

Time the complete novice-oriented procedure and record every intervention.
Accidentally targeting another attached disk, ambiguous device identity,
unbounded retry, unverifiable read-back provenance, or a recovery image that
contains user data is a mandatory failure.

## Phase 8: accelerated endurance and drift

Use at least one destructive test sample and preserve the control. Replay the
high write case with the final filesystem, mounts, quotas, log bounds, update
algorithm, temperature envelope, and periodic cold boots. At fixed submitted
write intervals:

- repeat the complete read/compare scan outside mounted console operation;
- hash immutable slots and validate all committed writable fixtures;
- repeat latency/throughput/boot baselines;
- inspect kernel, controller, filesystem, and recovery error counts;
- capture identity, usable capacity, temperature, throttling, and power;
- perform representative update interruption and recovery trials; and
- record cumulative application payload and block-submitted bytes.

Continue through the pre-registered service-write target plus margin or until a
stop condition occurs. Do not erase failing evidence merely to continue.
Performance drift must be compared with the baseline distribution and workload
deadlines, not an arbitrary percentage chosen after seeing results.

## Acceptance gates

All gates are mandatory for the exact qualified boundary:

| Gate | Passing evidence |
|---|---|
| Identity | Reconciled quoted/package/card/host identity; approved part suffix and lot scope; no silent substitution |
| Capacity/authenticity | Complete destructive address-space verification with zero errors on every qualification sample |
| Image/layout | Exact signed image read-back; final aligned layout; runtime read-only slots; measured reserve and namespace isolation |
| Workload | Frozen representative trace, observable byte accounting, latency distributions, and no missed product deadline caused by storage |
| Full disk | Truthful bounded denial, preserved reserve, no unauthorized reclamation, no partial advertised state, and recovery after cleanup |
| Power loss | Zero committed corruption and no unverified/uncommitted launch across every valid scheduled cut; only declared bounded uncommitted loss |
| Updates | Prior healthy system/package remains usable or exact verified candidate completes; protected state and writable history never disagree permissively |
| Corruption | Fail-closed detection or authenticated recovery for every injected authoritative-state fault |
| Recovery | Verified write/read-back and offline first boot from blank/replacement media; no user-data recovery claim or leakage |
| Endurance | Entire cohort reaches the selected service-write target and margin without a stop condition or unacceptable workload drift |
| Evidence | Complete campaign manifest, raw-log digests, trial ledger, exclusions, failures, and independent reproducibility review |

The microSD candidate fails and I-021 becomes the first fallback investigation
if any valid trial shows:

- silent corruption of committed state;
- launch or promotion of unverified, substituted, rolled-back, or uncommitted
  system/package state;
- inability to return to a healthy or explicit recovery state within the
  frozen bound;
- failure to maintain non-consumable recovery headroom or bounded writes;
- repeated workload deadline/latency failure attributable to the card;
- unreconciled identity or qualification-sample substitution;
- failure before the selected service-write target and margin;
- recovery tooling that cannot reliably identify, write, read back, and boot a
  blank/replacement card; or
- any requirement to weaken D-047, D-048, D-049, D-089, or D-109 to call the
  campaign a pass.

A failed card does not automatically qualify an arbitrary SSD. I-021 must bind
and test the exact SSD, bridge/enclosure, cable, port, power behavior,
disconnect cases, recovery path, and changed cost/volume boundary.

## Evidence package

Publish a redacted, append-only campaign package containing:

- campaign and component manifests;
- per-card intake record and identity-dump digest;
- exact commands, tool versions, configurations, and random seeds;
- raw-log digests plus bounded reviewable summaries;
- trial ledger with scheduled/valid/invalid/pass/fail counts and reason codes;
- performance distributions and cumulative submitted-write plots/tables;
- pre/post immutable hashes and semantic committed-state oracle results;
- recovery-platform runs and timed interventions;
- every deviation, retest, replacement, and excluded result;
- sample disposition and retained-control identity; and
- a signed conclusion limited to the exact tested boundary.

Do not publish addresses, account/order identifiers, full receipt data, host
usernames, filesystem paths, Wi-Fi credentials, signing secrets, vault
material, portraits, saves, or raw player data. Evidence redaction must not
remove the facts needed to distinguish cards, lots, builds, readers, or tests.

## Work that remains before execution

- resolve the candidate suffix/revision mapping and substitution policy;
- authorize a cohort, purchase lots, destructive use, and retained control;
- select service horizon, duty cycle, growth factor, and endurance margin;
- freeze final partition sizes, filesystems, mounts, quotas, log bounds,
  recovery reserve, and low-space thresholds from real image/workload data;
- finish the production update/package/profile/save/retro/recovery boundaries
  the workload must exercise;
- build and independently validate the power-cut and corruption harness;
- define transition-derived cut coverage and statistical confidence;
- define performance deadlines from the complete console workload;
- produce the signed recovery release and cross-platform writer;
- obtain every required physical component; and
- execute the campaign without treating planned gates as measured evidence.
