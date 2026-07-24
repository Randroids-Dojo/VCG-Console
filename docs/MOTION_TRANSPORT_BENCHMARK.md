# Motion local-transport benchmark

Last updated: 2026-07-24

Status: opaque and Motion-JSON child-process Windows development runs recorded; no production transport selected

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
separate stalled-reader probe. The default `opaque-bytes` mode excludes schema
parsing and JSON serialization so it isolates the transport layer. The
`motion-json` mode validates one representative `body.core17` frame with the
authoritative Motion `0.3.0` schema, encodes it as UTF-8 JSON, sends it through
the selected path, decodes the echoed bytes, and validates them again. Those
producer and consumer operations occur inside every measured round trip for
all five candidates.

Run the default harness:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-bytes 4096
```

Write a reviewable report:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-bytes 4096 --output benchmarks/transport/<target>.json
```

Run socket and WebSocket echo servers in separate child processes:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-bytes 4096 --server-layout child-process --output benchmarks/transport/<target>.json
```

Measure the canonical Motion JSON path. Its fixed frame determines the encoded
size, so `--payload-bytes` is deliberately rejected in this mode:

```powershell
pnpm benchmark:transports -- --iterations 5000 --warmup 500 --payload-mode motion-json --server-layout child-process --output benchmarks/transport/<target>-motion-json.json
```

Arguments are bounded to 100–100,000 measured iterations, 0–10,000 warmups,
and 256 bytes–1 MiB per payload. `--server-layout` accepts only
`same-process` or `child-process`; `--payload-mode` accepts `opaque-bytes` or
`motion-json`. Checked-in reports are structurally checked by
`pnpm validate:transport-benchmarks`, which also exercises deterministic,
malformed, and schema-invalid payload cases.

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

## Child-process Windows x64 result

The second checked-in run uses the same host, payload, warmups, and measured
sample count. TCP, named-pipe, and WebSocket echo servers each run in a fresh
child process. The parent remains the client. CPU is measured independently in
each process during measured RTTs; child RSS is sampled every 5 ms and records
start, end, and observed peak.

| Transport | p50 µs | p95 µs | p99 µs | Client CPU ms | Server CPU ms | Server peak RSS MiB |
|---|---:|---:|---:|---:|---:|---:|
| Direct library copy | 1.4 | 4.6 | 7.0 | 31 | — | — |
| One-slot worker shared memory | 2.3 | 6.0 | 20.9 | 48 | — | — |
| Windows named pipe | 34.8 | 81.6 | 181.7 | 125 | 141 | 73.0 |
| TCP loopback | 56.9 | 114.5 | 202.8 | 203 | 235 | 75.3 |
| WebSocket loopback | 103.5 | 182.9 | 309.6 | 391 | 359 | 71.7 |

The result is in
`benchmarks/transport/windows-x64-node24-child-process-2026-07-24.json`.
Direct copy remains a same-process baseline and shared memory still uses one
worker thread; neither is mislabeled as a child-process transport.

## Motion JSON Windows x64 result

The paired checked-in runs use the same child-process layout, host, Node
version, 500 warmups, 5,000 measured round trips, and exact 2,010-byte payload
size. The opaque run isolates transport behavior. The Motion run adds
producer-side Zod validation and JSON encoding plus consumer-side JSON decoding
and Zod validation to every candidate:

| Transport | Opaque p50 µs | Motion p50 µs | Motion p95 µs | Motion p99 µs | Motion client CPU ms |
|---|---:|---:|---:|---:|---:|
| Direct library copy | 0.6 | 36.0 | 53.5 | 85.3 | 250 |
| One-slot worker shared memory | 2.9 | 59.9 | 100.3 | 174.5 | 343 |
| Windows named pipe | 35.5 | 82.3 | 160.3 | 248.6 | 453 |
| TCP loopback | 58.8 | 118.7 | 200.2 | 271.5 | 609 |
| WebSocket loopback | 85.6 | 140.6 | 259.0 | 327.1 | 578 |

The reports are:

- `benchmarks/transport/windows-x64-node24-opaque-2010-child-process-2026-07-24.json`
- `benchmarks/transport/windows-x64-node24-motion-json-child-process-2026-07-24.json`

The paired observation shows that a real small Motion frame's validation and
serialization cost is material and must be included in transport selection.
It does not establish a portable budget: the frame is synthetic, carries one
core-landmark player and no actions, and both schema operations run in the
client process. Rich landmarks, action-heavy frames, other implementations,
and target Linux remain unmeasured.

## Backpressure observations

- Direct calls are synchronous and retain no transport queue.
- Shared memory has one request slot and one response slot by construction.
- The named-pipe writer signaled stream backpressure after three complete 4 KiB
  writes; its internal writable length was 16 KiB.
- TCP signaled after 51 complete writes; its internal writable length was also
  16 KiB because kernel buffering accepted more data first.
- A deliberately paused WebSocket peer allowed 303 frames before client
  `bufferedAmount` exceeded 1 MiB.

The child-process run produced the same three-frame named-pipe signal, 82 TCP
writes, and 307 WebSocket frames. Kernel and runtime buffering make those
counts observational rather than stable limits. Each isolated stalled-reader
probe runs after timing and the disposable server child is terminated once the
bound is observed, so a paused peer cannot keep the harness alive.

These numbers are not acceptable queue sizes. They show why every candidate
still needs the application-level one-frame bound already used by the web
bridge. A transport's default buffering must never become Motion latency.

## Why I-074 remains active

The socket and WebSocket paths now have separate-process Windows evidence.
Shared memory crosses only to a worker thread and does not solve cross-process
lifetime, ownership, crash recovery, permissions, or stale-reader reclamation.
Windows named pipes are not evidence for Linux Unix-domain sockets. Short
development runs do not establish wall-clock stability, scheduler isolation,
or an acceptable memory budget.

Before a decision:

- rerun the unchanged harness on target Linux x86-64 and ARM64;
- implement a bounded cross-process shared-memory ownership/recovery design;
- measure rich-profile and action-heavy frames with the same validation path;
- run wall-clock process-isolated CPU/RSS soaks and suspend, kill, reconnect,
  and churn game and tracker processes;
- bind admission to signed host-owned permission grants; and
- measure end-to-end exposure-to-game-action latency under real tracker/game
  load.

Until that evidence exists, D-004 stays unchanged and native Godot does not
invent an ad hoc transport.
