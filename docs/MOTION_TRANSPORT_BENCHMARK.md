# Motion local-transport benchmark

Last updated: 2026-07-24

Status: first Windows development run recorded; no production transport selected

Authority: D-004, I-074, I-084

## Question

The Motion API needs a local delivery path for native games and future native
Godot exports. I-074 compares direct library calls, local sockets, WebSocket,
and shared memory before selecting that path. This benchmark measures transport
overhead and buffering only; it is not camera-to-action latency and grants no
game permission.

## Reproducible harness

`scripts/benchmark-motion-transports.mjs` sends a deterministic fixed-size
payload through five paths:

1. a synchronous direct-library copy baseline;
2. a one-request/one-response `SharedArrayBuffer` handoff to a worker;
3. length-stable TCP loopback echo;
4. the operating system's local socket (Windows named pipe or Unix-domain
   socket); and
5. an uncompressed `ws` WebSocket echo.

Every measured request waits for its response, so there is never more than one
benchmark RTT in flight. Warmups are excluded. The report records p50, p95,
p99, maximum RTT, aggregate process CPU, elapsed throughput, queue model, and a
separate stalled-reader probe. Schema parsing and JSON serialization are
deliberately excluded so the first run isolates the transport layer.

Run the default harness:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-bytes 4096
```

Write a reviewable report:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-bytes 4096 --output benchmarks/transport/<target>.json
```

Arguments are bounded to 100–100,000 measured iterations, 0–10,000 warmups,
and 256 bytes–1 MiB per payload.

## First Windows x64 result

The checked-in run used Node 24.18.0 on an AMD Ryzen 9 5900X, 4,096-byte
payloads, 500 warmups, and 5,000 measured round trips:

| Transport | p50 µs | p95 µs | p99 µs | Round trips/s | Process CPU ms |
|---|---:|---:|---:|---:|---:|
| Direct library copy | 1.4 | 4.6 | 6.9 | 540,774 | 31 |
| One-slot shared memory | 2.2 | 13.3 | 19.8 | 209,132 | 31 |
| Windows named pipe | 17.8 | 39.0 | 88.6 | 44,735 | 172 |
| TCP loopback | 41.4 | 80.4 | 188.1 | 20,698 | 297 |
| WebSocket loopback | 73.1 | 142.7 | 292.2 | 11,678 | 547 |

The result is in
`benchmarks/transport/windows-x64-node24-2026-07-24.json`. These are
development-machine observations, not portable thresholds.

## Backpressure observations

- Direct calls are synchronous and retain no transport queue.
- Shared memory has one request slot and one response slot by construction.
- The named-pipe writer signaled stream backpressure after three complete 4 KiB
  writes; its internal writable length was 16 KiB.
- TCP signaled after 51 complete writes; its internal writable length was also
  16 KiB because kernel buffering accepted more data first.
- A deliberately paused WebSocket peer allowed 303 frames before client
  `bufferedAmount` exceeded 1 MiB.

These numbers are not acceptable queue sizes. They show why every candidate
still needs the application-level one-frame bound already used by the web
bridge. A transport's default buffering must never become Motion latency.

## Why I-074 remains active

The direct, TCP, local-socket, and WebSocket endpoints currently share one Node
process. Shared memory crosses only to a worker thread and does not solve
cross-process lifetime, ownership, crash recovery, permissions, or stale-reader
reclamation. Windows named pipes are not evidence for Linux Unix-domain
sockets.

Before a decision:

- rerun the unchanged harness on target Linux x86-64 and ARM64;
- move servers and clients into separate processes and record both CPU and RSS;
- implement a bounded cross-process shared-memory ownership/recovery design;
- add identical Motion serialization/schema validation to every candidate;
- stall, suspend, kill, reconnect, and churn game and tracker processes;
- bind admission to signed host-owned permission grants; and
- measure end-to-end exposure-to-game-action latency under real tracker/game
  load.

Until that evidence exists, D-004 stays unchanged and native Godot does not
invent an ad hoc transport.
