# Raspberry Pi Sudden-Power Campaign Contract

Status: strict plan/result validator and abuse tests implemented; physical cut
fixture, instrumented target services, frozen campaign, and Raspberry Pi
results remain open.

Authority: D-047, D-050, D-051, D-083, D-084, D-089, D-098, D-109, D-137,
D-141, D-145, D-150 through D-153, D-156, D-158, D-161, D-162, D-165,
I-022, I-110 through I-114, I-162, I-187, I-191, I-199, I-200, I-202,
I-209, Q-086, Q-197, and Q-198.

## Outcome

[`validate-power-cut-campaign.mjs`](../scripts/validate-power-cut-campaign.mjs)
defines a closed, bounded, machine-checkable boundary between:

1. an immutable pre-registered Raspberry Pi power-cut plan; and
2. one result ledger that accounts for every scheduled trial exactly once.

The validator does not control a relay, infer a commit point, read a card,
inspect a boot, or qualify any hardware. It prevents a later evidence package
from silently shrinking the campaign, changing allowed outcomes, dropping a
failed trial, relabeling a harness miss as a pass, or calling a campaign
qualified when its own ledger contradicts that conclusion.

Run its focused tests with:

```powershell
node --test scripts/validate-power-cut-campaign.test.mjs
```

Validate one real frozen plan and result with:

```powershell
node scripts/validate-power-cut-campaign.mjs `
  evidence/power-cut/plan.json `
  evidence/power-cut/result.json
```

The evidence paths are illustrative. No result or evidence directory currently
exists.

## Qualification claim

I-202 may close only when the exact Raspberry Pi assembly, production-intended
power supply, qualified microSD, final filesystems/mounts, production update
and storage services, and independently validated fixture execute a frozen
campaign with:

- at least 200 valid scheduled cuts;
- coverage of every required operation class and every implemented durable
  transition;
- zero valid product failures;
- authoritative bootability, committed-state, authority-consistency, and
  trial-provenance oracle passes after every cut;
- complete accounting for every scheduled trial; and
- a separately reviewed evidence package bound to the plan, environment, and
  per-trial artifacts.

The 200-trial floor makes “hundreds of cycles” concrete. It does not establish
a field failure rate or replace transition-derived coverage. Two hundred cuts
at one idle instant cannot qualify the appliance.

## Frozen plan format

The plan is strict JSON with:

```text
format = vcg-power-cut-campaign-plan
formatVersion = 1
platform = raspberry-pi-5
```

It binds:

- one closed campaign ID and UTC creation timestamp;
- SHA-256 commitments for the exact hardware manifest, software/image
  manifest, physical-media intake record, and fixture manifest;
- a minimum valid-trial count from 200 through 10,000;
- the canonical ordered operation and core-oracle lists;
- bounded oracle definitions; and
- 200 through 10,000 exact ordered trials.

The result carries SHA-256 of the exact plan file bytes, not a reserialized
object. Whitespace or ordering changes therefore create a different plan.

Each planned trial binds:

- unique ID and strictly consecutive sequence;
- one required operation class;
- one instrumented transition identifier;
- one named cut boundary;
- `before-boundary`, `boundary-window`, `after-boundary`, or
  `randomized-window` timing plus signed millisecond offset;
- the exact outcomes that may count as a pass; and
- the exact ordered oracle set that must report.

Boundary-window cuts use offset zero. Before-boundary offsets must be negative;
after-boundary offsets must be positive. The plan records the requested
trigger. The result separately records when the cut controller acted and when
loss of power was observed.

## Required operation classes

Every plan covers all eleven classes:

1. `idle`
2. `boot`
3. `system-update`
4. `package-update`
5. `package-rollback`
6. `retro-import`
7. `save-checkpoint`
8. `profile-vault`
9. `log-rotation`
10. `low-space`
11. `filesystem-recovery`

This is the minimum I-202 surface. A frozen campaign may add trials and
application-specific oracles but cannot add unknown operation enum values to
v1. A new product operation requires a format revision or classification under
one existing class with documented rationale.

## Transition inventory

The final plan must be generated from the instrumented production transition
inventory below. A transition without a trustworthy trigger and post-boot
oracle is not executable coverage; it remains a campaign prerequisite.

### Idle and boot

Cut around:

- ordinary active idle before quiescence;
- launch admission closing;
- each game, tracker, camera, input, write, and update-state quiescence
  acknowledgement;
- writes becoming synchronized;
- platform idle/restart/shutdown handoff;
- firmware/bootloader initialization and slot selection;
- root/system/data mount and filesystem replay;
- protected-state adapter availability;
- launcher, controller, storage, tracker, camera, and offline network-health
  readiness; and
- controller-ready shell plus the explicit bounded recovery alternative.

The current power lifecycle prototype supplies ordering vocabulary, not trusted
physical triggers. Production acknowledgements must come from the privileged
coordinator.

### A/B system update

Cut before, during, and after:

- archive/image receipt and delegated verification;
- inactive-slot write, device synchronization, and signed read-back;
- each journal temporary write, record publication, and directory
  synchronization;
- each exact protected-state compare-and-swap;
- staging, arming, and durable attempt claim;
- claim protection before boot transfer;
- candidate boot and each same-attempt health record/protected commit;
- confirmation, timeout/failure rollback, and interrupted-boot recovery; and
- retention of the prior healthy slot.

A journal record one step ahead of protected state may pass only as the exact
authenticated pending commit produced by replaying the same operation. A
record behind protected state, same-sequence substitution, unexplained
multi-record advance, unclaimed candidate boot, or wrong slot is a valid
product failure.

### Package update and rollback

Cut before, during, and after:

- transfer receipt, signed intake, artifact synchronization, and staging
  publication;
- candidate health and its exact catalog-digest binding;
- promotion intent publication;
- staged-to-generation move;
- activation-marker publication and directory synchronization;
- completed-intent removal;
- exact package protected-state compare-and-swap;
- launcher reopen and complete catalog/artifact verification;
- cleanup intent, retired activation removal, generation removal, and cleanup
  completion; and
- new higher-generation promotion that deliberately selects prior package
  content.

Rollback never means lowering the generation floor. Old protected state may
not launch a newly published activation; writable history may not be deleted
to make an older signed generation appear current.

### Retro import

Cut around:

- scoped source-media admission and entitlement acknowledgement;
- scan/parser completion;
- capacity reservation and private staging creation;
- bounded copy, synchronization, and content hash;
- metadata/catalog publication and installed-content promotion;
- duplicate/conflict decision;
- cancellation and abandoned-staging cleanup; and
- source removal at each stage.

The repository does not yet implement this production transaction. Retro
trials cannot be replaced with filesystem copy commands; the transition
instrumentation and authoritative installed-library oracle are prerequisites.

### Save and checkpoint

Cut around:

- reservation and quota admission;
- create-new temporary payload;
- data and metadata synchronization;
- atomic replacement and parent-directory synchronization;
- acknowledgement to the game;
- format migration staging and commit;
- profile unlink to unassigned progress;
- claim, conflict resolution, and permanent deletion; and
- durable exact-scope reset intent, save deletion, cache deletion, and intent
  completion.

The committed-state oracle uses synthetic known payloads and semantic save
validation. File existence alone is insufficient. A pass may lose only the
write whose documented acknowledgement/commit boundary had not completed.

### Profile vault

Cut around:

- ciphertext object create and synchronization;
- manifest-record publication;
- exact vault protected-state compare-and-swap;
- broker acknowledgement;
- obsolete ciphertext cleanup;
- portrait and calibration replacement;
- profile-key deletion/tombstone publication;
- unassigned-save transition; and
- factory-reset key destruction and filesystem cleanup.

Only synthetic profiles, portraits, and canaries are permitted. A prior
manifest or one exact authenticated pending protected commit may pass. Old
profile resurrection, plaintext fallback, same-sequence substitution, or reuse
after committed key destruction is a valid product failure.

### Log rotation

Cut around:

- bounded append and explicit synchronization boundary;
- rotation-file creation;
- active-log rename/replacement;
- compression if retained in the final design;
- retention trimming;
- diagnostic materialization; and
- full-log-volume cleanup.

Logs are disposable only within the selected bounds. Log recovery must not
block boot indefinitely, consume recovery reserve, leak sensitive canaries, or
mutate authoritative save/profile/package/update state.

### Low space

At fresh, warning, ordinary-write-limit, one-unit-over-limit, and physical-full
states, cut around:

- shared capacity measurement;
- per-domain quota check;
- recovery-headroom reservation;
- ordinary write denial;
- authorized log/cache trimming;
- abandoned-staging recovery;
- privileged recovery-workspace use; and
- space-release reconciliation.

No trial passes by automatically deleting a save, profile, production package,
developer package, or retro item. The pre-cut committed corpus must remain
valid after truthful denial and reboot.

### Filesystem recovery

Cut around:

- dirty-filesystem detection;
- journal replay or filesystem check;
- repair decision and each supported repair phase;
- read-only or failed mount;
- transition to explicit recovery;
- post-repair authoritative-state replay; and
- return to the controller-ready shell.

A repair that makes the filesystem mountable but silently loses or rewrites
committed authority is a product failure. Recovery evidence must distinguish
filesystem repair, A/B rollback, package/update protected-state recovery, and
blank-card reflash.

## Schedule construction

Build the schedule before any outcome is inspected:

1. enumerate every durable publication, synchronization, rename/link, removal,
   protected-state commit, acknowledgement, boot transfer, and recovery
   boundary in the exact production build;
2. assign at least one before, boundary-window, and after trial to every
   safety-critical boundary;
3. add deterministic randomized-window trials across long writes, boots,
   health deadlines, full-disk cleanup, and filesystem recovery;
4. distribute trials across cold/warm media, early/middle/late campaign age,
   relevant capacity states, and cards/lots authorized by the microSD
   campaign;
5. include offline operation and the complete concurrent appliance workload;
6. freeze the ordered schedule and all allowed outcomes;
7. verify every referenced trigger and oracle through a no-cut rehearsal; and
8. hash the exact plan bytes before the first destructive trial.

Random selection uses a recorded CSPRNG seed or complete pre-expanded schedule.
The seed alone is insufficient if tool/version differences could expand it
differently. The result order must match the plan exactly.

## Core oracles

Every trial includes these exact IDs and kinds:

| Oracle | Passing evidence |
|---|---|
| `bootability` | Within the frozen deadline, reaches an exact controller-ready healthy shell or a named bounded explicit recovery state; no boot loop or ambiguous black screen |
| `committed-state` | Every pre-cut acknowledged synthetic save/profile/package/update/retro authority remains semantically valid; only specifically allowed uncommitted work is absent |
| `authority-consistency` | Writable history, signed content, selected slot/generation, and independently protected exact state agree or expose the one authenticated pending commit allowed by the plan |
| `trial-provenance` | Fixture command, actual electrical loss observation, target epoch, plan/trial ID, environment, and captured evidence prove that the scheduled cut really occurred |

Application-specific oracles may be added for filesystem health, card health,
save semantics, profile-vault confidentiality, package launch, retro library,
low-space accounting, or other bounded claims. Every oracle result is
`pass`, `fail`, or `not-run` and carries an evidence digest unless it was not
run.

The authoritative state corpus is generated before the cut and retained
outside the console. It contains synthetic expected semantic values and
cryptographic commitments, not real household data or signing/protector
secrets. Post-cut verification must not “repair” state before recording the
first oracle result.

## Result ledger

The strict result binds:

```text
format = vcg-power-cut-campaign-result
formatVersion = 1
campaignId = exact plan campaign ID
planSha256 = SHA-256 of exact plan file bytes
```

It also records UTC start/completion, exact environment-manifest SHA-256, one
ordered result per trial, derived conclusion, and a stop reason only when one
or more planned trials were not run.

Every trial result records:

- exact planned ID and sequence;
- `valid-pass`, `valid-fail`, `harness-invalid`, or `not-run`;
- monotonic controller time, observed power-loss delay, and restore interval
  when a cut occurred;
- observed outcome;
- one ordered result for every planned oracle;
- bounded machine-readable failure codes; and
- bounded artifact kind, byte length, and SHA-256 commitments.

Raw serial output, logic/power traces, first-boot logs, filesystem/card reports,
protected-state snapshots, semantic oracle reports, and photographs remain
separate artifacts. The ledger commits to them; it does not embed unbounded
logs or sensitive material.

## Classification and conclusion rules

Use dispositions literally:

- `valid-pass`: the scheduled cut occurred, the observed outcome was
  pre-authorized, every oracle passed, there are no failure codes, and evidence
  artifacts exist;
- `valid-fail`: the scheduled cut occurred, at least one oracle failed, a
  failure code and artifacts exist, and the outcome is recorded;
- `harness-invalid`: fixture/provenance/environment behavior prevents a
  product inference; it is neither pass nor product failure; and
- `not-run`: the cut did not occur, every oracle is explicitly `not-run`, and
  a reason explains the missing execution.

The validator derives the only permitted conclusion:

| Ledger state | Conclusion |
|---|---|
| One or more `valid-fail` trials | `rejected` |
| Every planned trial is `valid-pass` and valid passes meet the frozen minimum | `qualified` |
| Otherwise | `incomplete` |

Thus a single valid committed-state failure cannot be hidden by 199 passes,
and an invalid fixture trial cannot be counted toward the floor. A rejected
campaign may stop to preserve evidence; every remaining scheduled trial must
still appear as `not-run` with one shared stop reason.

## Stop, preservation, and rerun rules

Stop immediately and preserve the affected card and raw evidence when:

- committed state silently corrupts;
- the wrong slot, package generation, profile generation, or retro library
  becomes authoritative;
- protected and writable state disagree outside the exact pending-commit
  allowance;
- an unverified/unclaimed candidate boots or launches;
- the target enters an unbounded loop or requires undocumented repair;
- the fixture creates an electrical/thermal safety hazard; or
- the evidence path can no longer distinguish target failure from harness
  failure.

Do not erase or reimage the affected sample until chain-of-custody evidence and
an independent triage image are retained. A later software or fixture fix
creates new hardware/software/harness manifest commitments and a new campaign
plan. It does not edit the failed ledger or reuse the old trial ID as though
the first result never happened.

Between independent trials, restore the exact baseline through the
pre-registered signed procedure, verify all baseline oracles, and record media
age/cumulative writes. If a trial intentionally continues from an earlier
trial's aged state, that dependency must be explicit in the frozen schedule.

## Validator evidence

Twelve Node tests currently prove that the format:

- accepts one complete 200-trial zero-failure campaign;
- exercises the file-based CLI over an exact plan/result pair;
- rejects fewer than 200 planned trials;
- rejects invalid UTF-8 before JSON parsing;
- rejects omission of any required I-202 operation;
- rejects open plan fields and contradictory timing semantics;
- binds the result to exact plan bytes;
- requires one ordered result per scheduled trial;
- refuses a passing disposition with a failed oracle;
- derives rejection from one valid product failure;
- refuses to understate that failure as incomplete; and
- treats harness-invalid and stopped trials as incomplete when no product
  failure exists.

The implementation uses only Node built-ins. It does not alter the repository
package scripts or claim production schema stability outside format v1.

## Limits and prerequisites

The validator cannot prove:

- that a digest names the claimed artifact;
- that an external evidence file is complete, private, or authentic;
- that the relay removed the correct rail or achieved the planned timing;
- that the Pi was the target producing a serial/log record;
- that a protected-state adapter is actually monotonic or independent;
- that an oracle implementation is authoritative;
- that a repair occurred before or after initial evidence capture;
- that 200 trials predict an acceptable field failure rate; or
- that a desk campaign used the final assembly and workload.

Before execution, the project still needs:

- a reviewed isolated power fixture and trigger/observation protocol;
- final Pi/card/power/cooling/AI/camera/USB/display/controller hardware;
- final bootloader, image, filesystems, mounts, quotas, and recovery reserve;
- privileged transition markers from every production transaction;
- independently retained semantic oracles and protected-state reads;
- signed baseline restore and blank-card recovery;
- campaign-data privacy and evidence-retention policy;
- no-cut, intentional-failure, missed-trigger, and wrong-target fixture
  controls;
- selected timing/reliability claim boundaries from the companion owner
  questions; and
- physical execution. Until then, I-114 and I-202 remain open.
