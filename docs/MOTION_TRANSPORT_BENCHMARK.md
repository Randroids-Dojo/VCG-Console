# Motion local-transport benchmark

Last updated: 2026-07-24

Status: size-paired Windows and WSL2 Linux-kernel child-process development runs recorded; no production transport selected

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

Choose one of the three schema-valid fixed frame shapes with
`--motion-frame-shape core17`, `action-heavy`, or `mediapipe33-world`. The
option is valid only with `motion-json`; opaque mode takes an exact byte count
instead.

Arguments are bounded to 100–100,000 measured iterations, 0–10,000 warmups,
and 256 bytes–1 MiB per payload. `--server-layout` accepts only
`same-process` or `child-process`; `--payload-mode` accepts `opaque-bytes` or
`motion-json`; and `--motion-frame-shape` accepts only the three canonical
shapes above. Checked-in reports are structurally checked by
`pnpm validate:transport-benchmarks`, which also exercises deterministic,
malformed, schema-invalid, and unsupported-shape cases.

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
| Direct library copy | 0.6 | 36.6 | 55.7 | 91.3 | 359 |
| One-slot worker shared memory | 2.9 | 54.3 | 96.9 | 190.3 | 313 |
| Windows named pipe | 35.5 | 85.3 | 172.4 | 255.3 | 515 |
| TCP loopback | 58.8 | 114.2 | 204.5 | 270.3 | 500 |
| WebSocket loopback | 85.6 | 140.2 | 255.9 | 325.3 | 578 |

The reports are:

- `benchmarks/transport/windows-x64-node24-opaque-2010-child-process-2026-07-24.json`
- `benchmarks/transport/windows-x64-node24-motion-json-child-process-2026-07-24.json`

Two additional size-paired runs cover a ten-action peak frame and a
MediaPipe-33 frame carrying provider-world positions. Each table cell is
Motion p50 / same-size opaque p50 in microseconds:

| Frame shape | Bytes | Direct | Shared slot | Named pipe | TCP | WebSocket |
|---|---:|---:|---:|---:|---:|---:|
| Core 17, no actions | 2,010 | 36.6 / 0.6 | 54.3 / 2.9 | 85.3 / 35.5 | 114.2 / 58.8 | 140.2 / 85.6 |
| Core 17, ten actions | 2,919 | 50.5 / 1.3 | 70.5 / 3.2 | 107.0 / 36.2 | 131.5 / 59.6 | 163.8 / 94.1 |
| MediaPipe 33 + world | 8,353 | 135.5 / 2.7 | 159.1 / 13.7 | 208.1 / 53.6 | 239.5 / 88.8 | 316.1 / 162.7 |

The additional reports are:

- `benchmarks/transport/windows-x64-node24-opaque-2919-child-process-2026-07-24.json`
- `benchmarks/transport/windows-x64-node24-motion-json-actions-child-process-2026-07-24.json`
- `benchmarks/transport/windows-x64-node24-opaque-8353-child-process-2026-07-24.json`
- `benchmarks/transport/windows-x64-node24-motion-json-mediapipe33-world-child-process-2026-07-24.json`

The paired observations show that validation and serialization cost is
material and scales with actual Motion shape, so transport selection cannot
use opaque bytes alone. They do not establish a portable budget: every frame
is synthetic, both schema operations run in the client process, and live
backend distributions, multiple players, worst-case action lifecycles, other
implementations, and target Linux remain unmeasured.

## WSL2 Linux-kernel development result

The unchanged child-process harness also ran from a fresh frozen install inside
Ubuntu WSL2 on the same physical workstation. Report v3 records
`environmentKind: "wsl2"` and kernel
`6.6.87.2-microsoft-standard-WSL2`; Node is 22.22.1. Local-socket measurements
therefore exercise a Unix-domain socket, but this remains a virtualized
development environment, not the ordinary native x86-64 Linux reference and
not ARM64 evidence.

Each cell is Motion p50 / size-matched opaque p50 in microseconds:

| Frame shape | Bytes | Direct | Shared slot | Unix socket | TCP | WebSocket |
|---|---:|---:|---:|---:|---:|---:|
| Core 17, no actions | 2,010 | 36.77 / 0.66 | 95.39 / 38.25 | 150.41 / 99.74 | 329.16 / 262.61 | 386.80 / 296.46 |
| MediaPipe 33 + world | 8,353 | 146.90 / 5.22 | 202.58 / 39.21 | 294.33 / 104.30 | 531.43 / 332.33 | 563.03 / 445.42 |

The reports are:

- `benchmarks/transport/wsl2-ubuntu-x64-node22-opaque-2010-child-process-2026-07-24.json`
- `benchmarks/transport/wsl2-ubuntu-x64-node22-motion-json-child-process-2026-07-24.json`
- `benchmarks/transport/wsl2-ubuntu-x64-node22-opaque-8353-child-process-2026-07-24.json`
- `benchmarks/transport/wsl2-ubuntu-x64-node22-motion-json-mediapipe33-world-child-process-2026-07-24.json`

Unix-domain sockets had lower p50 than TCP and WebSocket for both shapes in
this WSL2 run. The rich-frame p99 values for the worker, socket, TCP, and
WebSocket paths ranged from 1.75 to 1.96 ms, so short p50 ordering is not a
stability result. WSL virtualization, a different Node major, process
scheduling, garbage collection, and the development host all prevent direct
platform conclusions.

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
WSL2 exercises a Unix-domain socket but is not native target-Linux evidence.
Short development runs do not establish wall-clock stability, scheduler
isolation, or an acceptable memory budget.

Before a decision:

- rerun the unchanged harness on native target Linux x86-64 and ARM64; WSL2
  does not satisfy either qualification row;
- implement a bounded cross-process shared-memory ownership/recovery design;
- measure live multi-player and worst-case backend frame distributions with
  the same validation path;
- run wall-clock process-isolated CPU/RSS soaks and suspend, kill, reconnect,
  and churn game and tracker processes;
- bind admission to signed host-owned permission grants; and
- measure end-to-end exposure-to-game-action latency under real tracker/game
  load.

Until that evidence exists, D-004 stays unchanged and native Godot does not
invent an ad hoc transport.
