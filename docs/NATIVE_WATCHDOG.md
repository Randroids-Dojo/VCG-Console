# Native game watchdog contract

Status: implemented desk contract with unwired Linux cgroup-v2 OOM candidate

Last updated: 2026-07-23

The Rust host owns a game child so a crash, silence, or explicit resource fault cannot strand the console inside that process. This contract is intentionally narrow: it defines child lifecycle and recovery signals plus a candidate Linux OOM detector, not compositor containment, GPU-reset detection, or target qualification.

## Invocation

```sh
vcg-host watchdog \
  --heartbeat-file /run/vcg/session-123/game.heartbeat \
  --fault-file /run/vcg/session-123/game.fault \
  --startup-timeout-ms 15000 \
  --heartbeat-timeout-ms 8000 \
  --poll-ms 100 \
  --restart-backoff-ms 250 \
  --max-restarts 1 \
  -- /approved/game-wrapper --game-id example
```

The host launches the executable directly. It does not invoke a shell. `--dry-run` prints the resolved program, child arguments, probe paths, and recovery policy without starting the child or changing probe files.

The heartbeat file is required. The fault file is optional. They must be distinct, explicit paths in a host-owned per-session runtime directory. The launcher selects the paths; an untrusted game does not select them.

The authenticated package-launch path enables the same policy only for host-selected installed games:

```sh
vcg-host launcher \
  <signed-catalog, root, browser, and URL options> \
  --profile-registry /var/lib/vcg/profiles.json \
  --watchdog-game-id retro-2048
```

`--watchdog-game-id` is repeatable, unique, and must name a package in the signature-verified installed catalog. It applies identically across player profiles because heartbeat support belongs to the game's exact runtime wrapper. For this path the host derives only the heartbeat path below the selected runtime plan's prepared private session directory. The browser request remains only `{requestId, gameId, profileId}` and cannot toggle watchdog behavior, change policy, or supply a path. Authenticated package launch does not configure the optional resource-fault file until a trusted OS producer and child containment exist.

## Child environment

The child receives `VCG_HEARTBEAT_FILE`. It does not receive the resource-fault path.

A qualified wrapper atomically replaces the heartbeat file with changing, non-empty UTF-8 content. A monotonic sequence number is sufficient. A newly observed value marks the watchdog runtime healthy on its first occurrence and refreshes health thereafter. It does not prove compositor/window readiness. Rewriting the same value or only touching metadata is not a heartbeat.

Probe contents are limited to 4 KiB. The host removes stale heartbeat and fault files before each attempt. A wrapper must tolerate the file being absent during startup and must not store unrelated data at either path.

## Resource-fault adapter

The launcher configures a separate trusted operating-system adapter with the fault path. That adapter may atomically replace the file with exactly one UTF-8 token:

- `gpu-reset`;
- `out-of-memory`.

Unknown, non-UTF-8, or oversized values fail inspection explicitly. The game
must not self-report these tokens as authoritative platform diagnosis.

`CgroupV2MemoryHealthProbe` is an unwired Linux alternative for
`out-of-memory`. It retains the exact no-follow hierarchical `memory.events`
control, snapshots `oom_kill` before each attempt, and reports OOM only when
that counter increases. It also checks the counter after child exit so kernel
OOM evidence cannot race into a generic process-exit reason. Counter reversal,
malformed/duplicate/oversized state, missing reset, or unavailable controls
fail closed. See `NATIVE_CGROUP_MEMORY_HEALTH.md`.

This does not configure the memory controller, choose a cgroup, contain
descendants, select memory limits, or implement GPU detection. Q-247 and Q-248
must be resolved before authenticated package launch can use it.

## Recovery semantics

The default local-game policy is:

| Gate | Default |
|---|---:|
| First heartbeat | 15 seconds |
| Silence after ready | 8 seconds |
| Poll interval | 100 ms |
| Restart backoff | 250 ms |
| Restarts after initial attempt | 1 |

- A zero exit completes and returns control to the launcher.
- A non-zero exit consumes the bounded restart budget.
- Missing first heartbeat is `startup-timeout`.
- Silence after the first heartbeat is `heartbeat-timeout`.
- A recognized resource token is `gpu-reset` or `out-of-memory`.
- Empty, non-UTF-8, oversized, or unknown probe content is `invalid-probe-data`.
- Timeout and resource-fault paths force-kill and reap the child before restart.
- Invalid probe content also consumes bounded recovery; genuine file-access errors remain direct host I/O failures.
- Recovery exhaustion returns failure to the launcher; it does not leave the child running.
- Host cancellation terminates and reaps the active attempt, interrupts restart backoff, and prevents a later attempt from spawning.

The restart budget counts restarts after the initial attempt. `--max-restarts 0` disables automatic retry. A zero duration is invalid.

## Lifecycle events

The current CLI emits stable line-oriented events:

```text
watchdog:started attempt=1 pid=1234
watchdog:ready attempt=1 recovered=false
watchdog:restarting attempt=1 next_attempt=2 reason=heartbeat-timeout
watchdog:ready attempt=2 recovered=true
watchdog:completed attempt=2 exit_code=0 recovered=true
watchdog:cancelled attempt=2
```

Failure reports `watchdog:failed attempts=<n> reason=<reason>`. Cancellation reports the last started attempt, or zero if cancellation arrived before the first spawn. Healthy heartbeat changes refresh the internal deadline without producing a line every poll, keeping ordinary logs bounded. The package-launch API maps these events into the existing monotonic request record without exposing process IDs or probe paths. I-154 remains the presentation/state contract; I-109 owns native enforcement.

## Qualification boundary

The desk tests inject fault signals, real subprocess failures, active-attempt cancellation, and cancellation during restart backoff. They prove bounded direct-child ownership, termination, reaping, retry policy, no post-cancel spawn, and event ordering on the development host. Native-launch tests also prove that a host-selected installed game retries inside one retained request record and reports the terminal watchdog reason. Portable and Ubuntu WSL2 tests separately cover strict cgroup memory parsing, per-attempt baselines, terminal OOM precedence, heartbeat coexistence, counter reversal, malformed state, symlinks, and path replacement.

They do not prove:

- real Linux cgroup OOM injection and production scope/controller binding;
- GPU-reset detection for any driver;
- compositor, browser, or whole-session recovery;
- descendant process-group/cgroup containment beyond the direct child;
- protection against a compromised same-account child spoofing or deleting probe files;
- a qualified heartbeat wrapper or compositor producer for the current RetroArch package;
- service-manager restart of a crashed launcher;
- ARM64/x86-64 target parity;
- recovery under actual memory pressure or GPU reset.

I-109 stays active until those target-system faults are injected and the launcher visibly returns without a keyboard.
Exact-release qualification and production health-producer ownership are preserved in [the watchdog owner questions](OWNER_QUESTIONS_WATCHDOG_2026-07-23.md).
