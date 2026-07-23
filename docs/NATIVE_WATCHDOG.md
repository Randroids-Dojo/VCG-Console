# Native game watchdog contract

Status: implemented desk contract

Last updated: 2026-07-22

The Rust host owns a game child so a crash, silence, or explicit resource fault cannot strand the console inside that process. This contract is intentionally narrow: it defines child lifecycle and recovery signals, not compositor containment or Linux GPU/OOM detection.

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

## Child environment

The child receives `VCG_HEARTBEAT_FILE`. It does not receive the resource-fault path.

A qualified wrapper atomically replaces the heartbeat file with changing, non-empty UTF-8 content. A monotonic sequence number is sufficient. A newly observed value marks the process ready on its first occurrence and refreshes health thereafter. Rewriting the same value or only touching metadata is not a heartbeat.

Probe contents are limited to 4 KiB. The host removes stale heartbeat and fault files before each attempt. A wrapper must tolerate the file being absent during startup and must not store unrelated data at either path.

## Resource-fault adapter

The launcher configures a separate trusted operating-system adapter with the fault path. That adapter may atomically replace the file with exactly one UTF-8 token:

- `gpu-reset`;
- `out-of-memory`.

Unknown, non-UTF-8, or oversized values fail inspection explicitly. The game must not self-report these tokens as authoritative platform diagnosis. Linux cgroup and driver-specific producers are not implemented or qualified yet.

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

The restart budget counts restarts after the initial attempt. `--max-restarts 0` disables automatic retry. A zero duration is invalid.

## Lifecycle events

The current CLI emits stable line-oriented events:

```text
watchdog:started attempt=1 pid=1234
watchdog:ready attempt=1 recovered=false
watchdog:restarting attempt=1 next_attempt=2 reason=heartbeat-timeout
watchdog:ready attempt=2 recovered=true
watchdog:completed attempt=2 exit_code=0 recovered=true
```

Failure reports `watchdog:failed attempts=<n> reason=<reason>`. Healthy heartbeat changes refresh the internal deadline without producing a line every poll, keeping ordinary logs bounded. These lines are a native-host integration boundary, not yet the final launcher IPC transport. I-154 remains the presentation/state contract; I-109 owns native enforcement.

## Qualification boundary

The desk tests inject fault signals and real subprocess failures. They prove bounded child ownership, termination, reaping, restart policy, and event ordering on the development host.

They do not prove:

- Linux cgroup OOM classification;
- GPU-reset detection for any driver;
- compositor, browser, or whole-session recovery;
- descendant process-group/cgroup containment beyond the direct child;
- service-manager restart of a crashed launcher;
- ARM64/x86-64 target parity;
- recovery under actual memory pressure or GPU reset.

I-109 stays active until those target-system faults are injected and the launcher visibly returns without a keyboard.
