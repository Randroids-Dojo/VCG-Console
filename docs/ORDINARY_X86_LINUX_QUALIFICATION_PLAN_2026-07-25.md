# Ordinary x86-64 Linux premium-reference qualification plan — 2026-07-25

Status: I-207 plan complete; target selection and execution blocked

Authority: D-007, D-036, D-091, D-106, D-110, D-118, D-119, D-130,
I-015, I-023, I-053, I-152, I-173, I-177, I-180, I-181, I-197, I-207,
I-208, I-209, I-210, Q-011, Q-047, Q-203, Q-204

## Outcome

`benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json` is the
strict zero-result plan for selecting and qualifying the ordinary x86-64
native-Linux premium reference independently of Steam Machine.

The plan records the owned Ryzen 9 5900X / RTX 3080 Ti workstation only as a
development candidate. It does not select that machine. The existing Windows
and WSL2 bundle cannot count as native-Linux evidence, and Steam Machine cannot
substitute for the ordinary-PC row.

No physical host, disk, partition, boot order, Secure Boot state, firmware,
operating-system installation, account, package store, network service, camera,
controller, or participant session was changed or exercised for this tranche.

## Bound evidence

The plan binds ten current repository sources using SHA-256 over strict UTF-8
with CRLF normalized to LF:

- the sanitized Windows/WSL2 development-host bundle;
- the first-prototype acceptance contract and online/offline service matrix;
- the exposure-to-action validator;
- the obstacle workload and hosted-browser supervisor boundaries; and
- the VibeBots, Mi Casa Es Su Casa, Determined, and retro 2048 manifests.

Changing, deleting, reordering, or substituting a binding makes validation
fail. This freezes the planning inputs; it does not prove that any bound
workload loaded, became ready, was playable, retained focus, worked offline, or
met a performance gate.

## Required target tuple

Qualification cannot start until one exact target record identifies:

- selected host, CPU, GPU, RAM, storage role, power supply, cooling, and
  firmware;
- native-Linux image digest, release, kernel, bootloader, Secure Boot state,
  GPU driver, display server, compositor, and service manager;
- browser, SDL, controller database, Node, pnpm, Rust, launcher, native host,
  tracker, model, and package/runtime builds;
- UVC camera, exposure-clock proof, physical shutter and indicator, operating-
  system microphone disablement, controller mapping and reserved-action proof;
  and
- TV/display/audio, room, power meter, acoustic meter, thermal instrumentation,
  and participant protocol.

Every qualification field remains `null`. The plan cannot be edited into a
partial success artifact: populated blocked-target fields, relaxed evidence
boundaries, or a fabricated result are rejected.

## Workload matrix

Each required workload has twenty launch trials and a 3,600-second measured
soak:

| Workload | Runtime | Network contract | Motion role |
|---|---|---|---|
| VCG launcher shell | Console shell | Offline required | Shell and reserved-action owner |
| Obstacle motion sample | Console-lab component | Offline required | Primary Motion action consumer |
| Selected signed local package | Controlled installed package | Offline required | Exact declared profile still pending |
| Retro 2048 | Libretro | Offline required | Controller only |
| VibeBots | Remote web | Network required | Compatibility only; no title Motion delivery |
| Mi Casa Es Su Casa | Remote web | Network required | Compatibility only; no title Motion delivery |
| Determined | Remote web | Network required | Compatibility only; no title Motion delivery |

The hosted rows require a credential-free compatible route, deliberate network
loss, and explicit retry. Load, a ready marker, or heartbeat is never enough to
claim playability, controller ownership, service correctness, or focus.

## Qualification sequence

The eleven required phases are deliberately separated so one kind of evidence
cannot rescue another:

1. read-only hardware, firmware, disk-role, peripheral, and meter inventory;
2. target selection plus backup, recovery-media, and install-plan review;
3. authorized native-Linux installation and repeatable cold rebuild;
4. accountless cold boot, offline launcher, network restoration, and recovery;
5. display, audio, camera, microphone-disablement, controller, and reserved
   actions;
6. package/runtime, local package, retro, obstacle, and hosted workloads;
7. motion accuracy and exposure-to-game-action latency under concurrent load;
8. suspend, low-power idle, wake, privacy shutdown, and reboot cycles;
9. package/system update, interruption, rollback, and blank-drive recovery;
10. sustained game/tracker performance, wall power, thermals, throttling, and
    one-metre acoustics; and
11. a second clean rebuild, complete cell ledger, and common premium comparison
    handoff for the Pi lane.

Every phase is `blocked` and has a `null` evidence digest. Every required cell
must pass independently; an aggregate cannot rescue a failed persona,
placement, action, workload, fault, or recovery cell.

## Frozen gates

The plan carries forward only already-authorized requirements:

- visible branded feedback within 250 ms;
- controller-usable cold boot within 60 seconds and warm resume within 5
  seconds;
- local launch within 15 seconds and hosted interaction or truthful real phase
  progress within 30 seconds;
- at least twenty launch trials per path and twenty action trials per cell;
- a fifteen-minute negative-action window per cell;
- at least 95% precision and 90% recall for each required action;
- zero unintended privileged Back, Pause, Home, Resume, or Exit activations;
- at most 120 ms p95 from camera exposure to action receipt at the game API;
- one hundred suspend/resume cycles with zero failed cycles; and
- zero unrecovered failures, accountless core operation, offline core operation,
  and complete publication of attempts and failures.

Capture-arrival timing cannot prove the exposure-to-action gate. Windows, WSL2,
Steam Machine, load, readiness, or liveness observations cannot prove this
native-Linux premium row.

## Gates intentionally left open

The plan leaves pose FPS, game FPS, frame-time, capture/pose drop ratios, wall
power, idle/suspend power, CPU/GPU temperature, one-metre acoustics, and update,
rollback, and blank-drive recovery attempt counts as `null`.

D-108's 35 dBA ceiling is expressly for the lower-cost enclosure. Applying it
to the premium x86 reference without a separate decision would turn a
tier-specific requirement into an unsupported cross-tier claim.

The remaining choices are recorded in
`OWNER_QUESTIONS_ORDINARY_X86_LINUX_2026-07-25.md`. Q-203 continues to govern
disk, boot, Secure Boot, and installation authority; this tranche does not
duplicate or weaken it.

## Data and authority boundary

Raw-frame/video retention, audio recording, skeleton retention, credentials,
request/response bodies, cookies/storage values, URL query/fragment values,
participant identifiers, and free text are not authorized. User-content-free
system telemetry is allowed, but tracked evidence must omit stable machine and
person identifiers.

Only repository planning was performed. Target selection, disk and boot
mutation, Linux installation, physical sessions, participants, derived trace
retention, service mutation, fault injection, and purchases all remain false.

## Validation

Run:

```powershell
node scripts/validate-ordinary-x86-linux-qualification.mjs
node --test scripts/validate-ordinary-x86-linux-qualification.test.mjs
```

The validator enforces exact fields and ordering, current normalized source
digests, the unselected target, all null evidence slots, workload and phase
coverage, fixed gates, open premium thresholds, authority denials, blocker set,
zero-result state, strict UTF-8, and canonical two-space JSON. Twenty focused
tests cover the valid plan plus source drift, source substitution, hidden
fields, premature selection, Windows/WSL2/Steam substitution, invented image
evidence, deleted workloads, weakened trials, false phase completion,
misapplied acoustics, capture-arrival timing, disk authority, fabricated
results, noncanonical JSON, UTF-8 BOM input, and bare carriage returns.
