import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { WebSocket, WebSocketServer } from "ws";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseOptions(process.argv.slice(2));
const payload = deterministicPayload(options.payloadBytes);
const results = [];

await record(benchmarkDirect(payload, options));
await record(benchmarkSharedMemory(payload, options));
await record(benchmarkStream("tcp-loopback", payload, options, { host: "127.0.0.1", port: 0 }));

const localEndpoint =
  process.platform === "win32"
    ? `\\\\.\\pipe\\vcg-motion-benchmark-${process.pid}-${Date.now()}`
    : join(tmpdir(), `vcg-motion-benchmark-${process.pid}-${Date.now()}.sock`);
try {
  await record(benchmarkStream("local-socket", payload, options, localEndpoint));
} finally {
  if (process.platform !== "win32") await rm(localEndpoint, { force: true });
}
await record(benchmarkWebSocket(payload, options));

const report = {
  format: "vcg-motion-transport-benchmark",
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpuModel: cpus()[0]?.model.trim() ?? "unknown",
    logicalCpuCount: cpus().length,
  },
  method: {
    iterations: options.iterations,
    warmupIterations: options.warmup,
    payloadBytes: payload.byteLength,
    pattern: "sequential request/echo round trip",
    compression: false,
    schemaValidation: false,
    processLayout:
      "direct, socket, and WebSocket endpoints share one Node process; shared memory uses one worker thread",
  },
  results,
  limitations: [
    "This is transport overhead, not camera-to-action latency.",
    "Same-process socket servers understate scheduler and process-isolation costs.",
    "Windows local-socket results use a named pipe; target Linux must rerun the same harness for Unix-domain evidence.",
    "Shared memory uses a one-slot worker-thread handoff and does not establish a safe cross-process ownership protocol.",
    "No result grants authority or selects the production transport.",
  ],
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (options.output) {
  const outputPath = resolve(repositoryRoot, options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, "utf8");
  console.error(`wrote ${outputPath}`);
}
process.stdout.write(json);

async function record(pendingResult) {
  const result = await pendingResult;
  results.push(result);
  console.error(`completed ${result.transport}`);
}

async function benchmarkDirect(payload, { iterations, warmup }) {
  const invoke = () => {
    const response = Buffer.from(payload);
    if (response[0] !== payload[0] || response.at(-1) !== payload.at(-1)) {
      throw new Error("direct response mismatch");
    }
  };
  return measureSync("direct-library", invoke, iterations, warmup, {
    queueModel: "synchronous call; no retained queue",
    stallCapacityFrames: 0,
  });
}

async function benchmarkSharedMemory(payload, { iterations, warmup }) {
  const controlBytes = Int32Array.BYTES_PER_ELEMENT * 4;
  const shared = new SharedArrayBuffer(controlBytes + payload.byteLength * 2);
  const control = new Int32Array(shared, 0, 4);
  const request = new Uint8Array(shared, controlBytes, payload.byteLength);
  const response = new Uint8Array(shared, controlBytes + payload.byteLength, payload.byteLength);
  const worker = new Worker(
    `
      const { parentPort, workerData } = require("node:worker_threads");
      const control = new Int32Array(workerData.shared, 0, 4);
      const request = new Uint8Array(workerData.shared, workerData.controlBytes, workerData.payloadBytes);
      const response = new Uint8Array(
        workerData.shared,
        workerData.controlBytes + workerData.payloadBytes,
        workerData.payloadBytes,
      );
      let observed = 0;
      parentPort.postMessage("ready");
      while (true) {
        Atomics.wait(control, 0, observed);
        if (Atomics.load(control, 2) === 1) break;
        observed = Atomics.load(control, 0);
        response.set(request);
        Atomics.store(control, 1, observed);
        Atomics.notify(control, 1);
      }
    `,
    {
      eval: true,
      workerData: {
        shared,
        controlBytes,
        payloadBytes: payload.byteLength,
      },
    },
  );
  await new Promise((resolveReady, reject) => {
    worker.once("message", resolveReady);
    worker.once("error", reject);
  });
  let sequence = 0;
  const invoke = () => {
    request.set(payload);
    sequence += 1;
    Atomics.store(control, 0, sequence);
    Atomics.notify(control, 0);
    while (Atomics.load(control, 1) !== sequence) {
      const wait = Atomics.wait(control, 1, Atomics.load(control, 1), 5_000);
      if (wait === "timed-out") throw new Error("shared-memory worker timed out");
    }
    if (response[0] !== payload[0] || response.at(-1) !== payload.at(-1)) {
      throw new Error("shared-memory response mismatch");
    }
  };
  try {
    return measureSync("shared-memory-slot", invoke, iterations, warmup, {
      queueModel: "one request slot and one response slot",
      stallCapacityFrames: 1,
    });
  } finally {
    Atomics.store(control, 2, 1);
    Atomics.notify(control, 0);
    await worker.terminate();
  }
}

async function benchmarkStream(name, payload, { iterations, warmup }, endpoint) {
  const server = createServer((socket) => socket.pipe(socket));
  await listen(server, endpoint);
  const address = server.address();
  const connectionOptions =
    typeof address === "string" ? { path: address } : { host: "127.0.0.1", port: address.port };
  const { createConnection } = await import("node:net");
  const socket = createConnection(connectionOptions);
  await once(socket, "connect");
  socket.setNoDelay?.(true);
  const invoke = createFixedEchoInvoker(socket, payload);
  try {
    const result = await measureAsync(name, invoke, iterations, warmup);
    result.queueModel = "Node stream high-water mark plus kernel buffers; publisher must stop when write returns false";
    result.stallCapacityFrames = await probeStreamBackpressure(connectionOptions, payload);
    return result;
  } finally {
    socket.destroy();
    await closeServer(server);
  }
}

async function benchmarkWebSocket(payload, { iterations, warmup }) {
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    perMessageDeflate: false,
  });
  server.on("connection", (socket) => {
    socket.on("message", (data, isBinary) => {
      socket.send(data, { binary: isBinary, compress: false });
    });
  });
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string") throw new Error("WebSocket benchmark expected TCP address");
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`, {
    perMessageDeflate: false,
  });
  await once(client, "open");
  const invoke = () =>
    new Promise((resolveEcho, reject) => {
      const onError = (error) => {
        client.off("message", onMessage);
        reject(error);
      };
      const onMessage = (data) => {
        client.off("error", onError);
        const response = Buffer.from(data);
        if (response[0] !== payload[0] || response.at(-1) !== payload.at(-1)) {
          reject(new Error("WebSocket response mismatch"));
        } else {
          resolveEcho();
        }
      };
      client.once("error", onError);
      client.once("message", onMessage);
      client.send(payload, { binary: true, compress: false });
    });
  try {
    const result = await measureAsync("websocket-loopback", invoke, iterations, warmup);
    result.queueModel = "WebSocket bufferedAmount; publisher must enforce an application-level frame bound";
    result.stallCapacityFrames = await probeWebSocketBackpressure(server, payload);
    return result;
  } finally {
    client.close();
    await once(client, "close");
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function measureSync(name, invoke, iterations, warmup, extra = {}) {
  for (let index = 0; index < warmup; index += 1) invoke();
  const samples = new Float64Array(iterations);
  const cpuStart = process.cpuUsage();
  const wallStart = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    invoke();
    samples[index] = Number(process.hrtime.bigint() - start) / 1_000;
  }
  return summarize(name, samples, cpuStart, wallStart, extra);
}

async function measureAsync(name, invoke, iterations, warmup) {
  for (let index = 0; index < warmup; index += 1) await invoke();
  const samples = new Float64Array(iterations);
  const cpuStart = process.cpuUsage();
  const wallStart = process.hrtime.bigint();
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    await invoke();
    samples[index] = Number(process.hrtime.bigint() - start) / 1_000;
  }
  return summarize(name, samples, cpuStart, wallStart);
}

function summarize(name, samples, cpuStart, wallStart, extra = {}) {
  const cpu = process.cpuUsage(cpuStart);
  const wallMs = Number(process.hrtime.bigint() - wallStart) / 1_000_000;
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    transport: name,
    latencyMicroseconds: {
      p50: rounded(percentile(sorted, 0.5)),
      p95: rounded(percentile(sorted, 0.95)),
      p99: rounded(percentile(sorted, 0.99)),
      max: rounded(sorted.at(-1)),
    },
    elapsedMs: rounded(wallMs),
    roundTripsPerSecond: rounded((samples.length * 1_000) / wallMs),
    processCpuMs: rounded((cpu.user + cpu.system) / 1_000),
    ...extra,
  };
}

function createFixedEchoInvoker(socket, payload) {
  let waiting;
  let received = 0;
  socket.on("data", (chunk) => {
    received += chunk.byteLength;
    if (received < payload.byteLength) return;
    if (received !== payload.byteLength || !waiting) {
      waiting?.reject(new Error("stream response framing mismatch"));
    } else {
      waiting.resolve();
    }
    waiting = undefined;
    received = 0;
  });
  socket.on("error", (error) => waiting?.reject(error));
  return () =>
    new Promise((resolveEcho, reject) => {
      if (waiting) {
        reject(new Error("stream benchmark permits only one pending frame"));
        return;
      }
      waiting = { resolve: resolveEcho, reject };
      socket.write(payload);
    });
}

async function probeStreamBackpressure(connectionOptions, payload) {
  let serverPeer;
  const stalledServer = createServer((socket) => {
    serverPeer = socket;
    socket.pause();
  });
  const stalledEndpoint = connectionOptions.path
    ? `${connectionOptions.path}-stall`
    : { host: "127.0.0.1", port: 0 };
  try {
    await listen(stalledServer, stalledEndpoint);
    const address = stalledServer.address();
    const { createConnection } = await import("node:net");
    const client = createConnection(
      typeof address === "string" ? { path: address } : { host: "127.0.0.1", port: address.port },
    );
    await once(client, "connect");
    let frames = 0;
    while (frames < 100_000 && client.write(payload)) frames += 1;
    const result = {
      framesAcceptedBeforeSignal: frames,
      writableLengthBytes: client.writableLength,
      writableHighWaterMarkBytes: client.writableHighWaterMark,
    };
    client.destroy();
    serverPeer?.destroy();
    await closeServer(stalledServer);
    return result;
  } finally {
    if (typeof stalledEndpoint === "string" && process.platform !== "win32") {
      await rm(stalledEndpoint, { force: true });
    }
  }
}

async function probeWebSocketBackpressure(server, payload) {
  const address = server.address();
  if (typeof address === "string") throw new Error("WebSocket benchmark expected TCP address");
  const stalled = new WebSocket(`ws://127.0.0.1:${address.port}`, { perMessageDeflate: false });
  await once(stalled, "open");
  const serverPeer = [...server.clients].at(-1);
  serverPeer?._socket.pause();
  let frames = 0;
  while (frames < 100_000 && stalled.bufferedAmount <= 1_048_576) {
    stalled.send(payload, { binary: true, compress: false });
    frames += 1;
  }
  const result = {
    framesAcceptedBeforeOneMiBBuffered: frames,
    bufferedAmountBytes: stalled.bufferedAmount,
    applicationFrameBoundRequired: true,
  };
  stalled.terminate();
  serverPeer?.terminate();
  return result;
}

function listen(server, endpoint) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

function once(emitter, event) {
  return new Promise((resolveEvent, reject) => {
    const onError = (error) => {
      emitter.off(event, onEvent);
      reject(error);
    };
    const onEvent = (...values) => {
      emitter.off("error", onError);
      resolveEvent(values.length <= 1 ? values[0] : values);
    };
    emitter.once("error", onError);
    emitter.once(event, onEvent);
  });
}

function deterministicPayload(size) {
  const value = Buffer.allocUnsafe(size);
  for (let index = 0; index < size; index += 1) value[index] = (index * 31 + 17) & 0xff;
  return value;
}

function percentile(sorted, quantile) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function parseOptions(arguments_) {
  if (arguments_[0] === "--") arguments_ = arguments_.slice(1);
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("Expected --iterations, --warmup, --payload-bytes, or --output with a value");
    }
    values.set(name, value);
  }
  const iterations = boundedInteger(values.get("--iterations") ?? "2000", 100, 100_000, "iterations");
  const warmup = boundedInteger(values.get("--warmup") ?? "200", 0, 10_000, "warmup");
  const payloadBytes = boundedInteger(
    values.get("--payload-bytes") ?? "4096",
    256,
    1_048_576,
    "payload-bytes",
  );
  const output = values.get("--output");
  for (const name of values.keys()) {
    if (!["--iterations", "--warmup", "--payload-bytes", "--output"].includes(name)) {
      throw new Error(`Unknown option ${name}`);
    }
  }
  return { iterations, warmup, payloadBytes, output };
}

function boundedInteger(value, minimum, maximum, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}
