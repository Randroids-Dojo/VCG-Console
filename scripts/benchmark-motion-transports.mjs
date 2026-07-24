import { fork } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { cpus, release, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { WebSocket, WebSocketServer } from "ws";

import { createTransportPayloadCodec } from "./motion-transport-payload.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const transportServerScript = fileURLToPath(
  new URL("./benchmark-motion-transport-server.mjs", import.meta.url),
);
const options = parseOptions(process.argv.slice(2));
const payloadCodec = createTransportPayloadCodec(
  options.payloadMode,
  options.payloadBytes,
  options.motionFrameShape,
);
const payload = payloadCodec.referencePayload;
const results = [];
const osRelease = release();

await record("direct-library", benchmarkDirect(payloadCodec, options));
await record("shared-memory-slot", benchmarkSharedMemory(payloadCodec, options));
await record(
  "tcp-loopback",
  options.serverLayout === "child-process"
    ? benchmarkIsolatedStream("tcp-loopback", "tcp", payloadCodec, options)
    : benchmarkStream("tcp-loopback", payloadCodec, options, { host: "127.0.0.1", port: 0 }),
);

const localEndpoint =
  process.platform === "win32"
    ? `\\\\.\\pipe\\vcg-motion-benchmark-${process.pid}-${Date.now()}`
    : join(tmpdir(), `vcg-motion-benchmark-${process.pid}-${Date.now()}.sock`);
try {
  await record(
    "local-socket",
    options.serverLayout === "child-process"
      ? benchmarkIsolatedStream(
          "local-socket",
          "local-socket",
          payloadCodec,
          options,
          localEndpoint,
        )
      : benchmarkStream("local-socket", payloadCodec, options, localEndpoint),
  );
} finally {
  if (process.platform !== "win32") await rm(localEndpoint, { force: true });
}
await record(
  "websocket-loopback",
  options.serverLayout === "child-process"
    ? benchmarkIsolatedWebSocket(payloadCodec, options)
    : benchmarkWebSocket(payloadCodec, options),
);

const report = {
  format: "vcg-motion-transport-benchmark",
  formatVersion: 3,
  createdAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpuModel: cpus()[0]?.model.trim() ?? "unknown",
    logicalCpuCount: cpus().length,
    osRelease,
    environmentKind:
      process.platform === "linux" &&
      (process.env.WSL_DISTRO_NAME || /microsoft/i.test(osRelease))
        ? "wsl2"
        : "native-or-unknown",
  },
  method: {
    iterations: options.iterations,
    warmupIterations: options.warmup,
    payloadBytes: payload.byteLength,
    pattern: "sequential request/echo round trip",
    compression: false,
    ...payloadCodec.metadata,
    processLayout:
      options.serverLayout === "child-process"
        ? "socket and WebSocket echo servers run in separate child processes; client, direct baseline, and shared-memory worker orchestration run in the parent"
        : "direct, socket, and WebSocket endpoints share one Node process; shared memory uses one worker thread",
  },
  results,
  limitations: [
    "This is transport overhead, not camera-to-action latency.",
    options.serverLayout === "child-process"
      ? "Client and server CPU/RSS are process-isolated, but both processes still share one development host and scheduler."
      : "Same-process socket servers understate scheduler and process-isolation costs.",
    process.platform === "win32"
      ? "Windows local-socket results use a named pipe; target Linux must rerun the same harness for Unix-domain evidence."
      : process.env.WSL_DISTRO_NAME || /microsoft/i.test(osRelease)
        ? "WSL2 local-socket results use a Unix-domain socket under a virtualized Linux kernel; target native Linux must rerun the same harness."
        : "Linux local-socket results use a Unix-domain socket; each target architecture and operating image must rerun the same harness.",
    "Shared memory uses a one-slot worker-thread handoff and does not establish a safe cross-process ownership protocol.",
    options.payloadMode === "motion-json"
      ? "The representative frame is synthetic; live backend distributions, multi-player traffic, and worst-case frames require separate measurements."
      : "Opaque-byte mode excludes Motion serialization and schema validation.",
    "No result grants authority or selects the production transport.",
  ],
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (options.output) {
  const outputPath = resolve(repositoryRoot, options.output);
  const repositoryRelativePath = relative(repositoryRoot, outputPath);
  if (repositoryRelativePath.startsWith("..") || isAbsolute(repositoryRelativePath)) {
    throw new Error("output must remain inside the repository");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, "utf8");
  console.error(`wrote ${outputPath}`);
}
process.stdout.write(json);

async function record(name, pendingResult) {
  console.error(`starting ${name}`);
  const result = await pendingResult;
  results.push(result);
  console.error(`completed ${result.transport}`);
}

async function benchmarkDirect(codec, { iterations, warmup }) {
  const invoke = () => {
    const response = Buffer.from(codec.encode());
    codec.verify(response);
  };
  return measureSync("direct-library", invoke, iterations, warmup, {
    queueModel: "synchronous call; no retained queue",
    stallCapacityFrames: 0,
  });
}

async function benchmarkSharedMemory(codec, { iterations, warmup }) {
  const payload = codec.referencePayload;
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
    const encoded = codec.encode();
    if (encoded.byteLength !== payload.byteLength) {
      throw new Error("encoded payload length changed during benchmark");
    }
    request.set(encoded);
    sequence += 1;
    Atomics.store(control, 0, sequence);
    Atomics.notify(control, 0);
    while (Atomics.load(control, 1) !== sequence) {
      const wait = Atomics.wait(control, 1, Atomics.load(control, 1), 5_000);
      if (wait === "timed-out") throw new Error("shared-memory worker timed out");
    }
    codec.verify(response);
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

async function benchmarkStream(name, codec, { iterations, warmup }, endpoint) {
  const server = createServer((socket) => socket.pipe(socket));
  await listen(server, endpoint);
  const address = server.address();
  const connectionOptions =
    typeof address === "string" ? { path: address } : { host: "127.0.0.1", port: address.port };
  const socket = createConnection(connectionOptions);
  await once(socket, "connect");
  socket.setNoDelay?.(true);
  const invoke = createFixedEchoInvoker(socket, codec);
  try {
    const result = await measureAsync(name, invoke, iterations, warmup);
    result.queueModel = "Node stream high-water mark plus kernel buffers; publisher must stop when write returns false";
    result.stallCapacityFrames = await probeStreamBackpressure(
      connectionOptions,
      codec.referencePayload,
    );
    return result;
  } finally {
    socket.destroy();
    await closeServer(server);
  }
}

async function benchmarkIsolatedStream(
  name,
  childTransport,
  codec,
  { iterations, warmup },
  endpoint,
) {
  const childState = await startTransportChild(childTransport, endpoint);
  const socket = createConnection(childState.connectionOptions);
  let forceStop = false;
  try {
    await once(socket, "connect");
    socket.setNoDelay?.(true);
    const invoke = createFixedEchoInvoker(socket, codec);
    await commandTransportChild(childState.child, { kind: "begin" }, "begun");
    const clientRssStartBytes = process.memoryUsage().rss;
    const result = await measureAsync(name, invoke, iterations, warmup);
    const clientRssEndBytes = process.memoryUsage().rss;
    const serverStats = await commandTransportChild(childState.child, { kind: "stats" }, "stats");
    result.queueModel =
      "cross-process Node stream high-water mark plus kernel buffers; publisher must stop when write returns false";
    result.clientRssStartBytes = clientRssStartBytes;
    result.clientRssEndBytes = clientRssEndBytes;
    result.serverProcessCpuMs = serverStats.processCpuMs;
    result.serverRssStartBytes = serverStats.rssStartBytes;
    result.serverRssEndBytes = serverStats.rssEndBytes;
    result.serverRssPeakBytes = serverStats.rssPeakBytes;
    socket.destroy();
    await commandTransportChild(
      childState.child,
      { kind: "set-mode", mode: "stalled" },
      "mode-set",
    );
    forceStop = true;
    result.stallCapacityFrames = await probeStreamBackpressureClient(
      childState.connectionOptions,
      codec.referencePayload,
    );
    return result;
  } finally {
    socket.destroy();
    await stopTransportChild(childState.child, forceStop);
  }
}

async function benchmarkWebSocket(codec, { iterations, warmup }) {
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
  const invoke = createWebSocketEchoInvoker(client, codec);
  try {
    const result = await measureAsync("websocket-loopback", invoke, iterations, warmup);
    result.queueModel = "WebSocket bufferedAmount; publisher must enforce an application-level frame bound";
    result.stallCapacityFrames = await probeWebSocketBackpressure(
      server,
      codec.referencePayload,
    );
    return result;
  } finally {
    client.close();
    await once(client, "close");
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function benchmarkIsolatedWebSocket(codec, { iterations, warmup }) {
  const childState = await startTransportChild("websocket");
  const url = `ws://${childState.connectionOptions.host}:${childState.connectionOptions.port}`;
  const client = new WebSocket(url, { perMessageDeflate: false });
  let forceStop = false;
  try {
    await once(client, "open");
    const invoke = createWebSocketEchoInvoker(client, codec);
    await commandTransportChild(childState.child, { kind: "begin" }, "begun");
    const clientRssStartBytes = process.memoryUsage().rss;
    const result = await measureAsync("websocket-loopback", invoke, iterations, warmup);
    const clientRssEndBytes = process.memoryUsage().rss;
    const serverStats = await commandTransportChild(childState.child, { kind: "stats" }, "stats");
    result.queueModel =
      "cross-process WebSocket bufferedAmount; publisher must enforce an application-level frame bound";
    result.clientRssStartBytes = clientRssStartBytes;
    result.clientRssEndBytes = clientRssEndBytes;
    result.serverProcessCpuMs = serverStats.processCpuMs;
    result.serverRssStartBytes = serverStats.rssStartBytes;
    result.serverRssEndBytes = serverStats.rssEndBytes;
    result.serverRssPeakBytes = serverStats.rssPeakBytes;
    const clientClosed = once(client, "close");
    client.close();
    await clientClosed;
    await commandTransportChild(
      childState.child,
      { kind: "set-mode", mode: "stalled" },
      "mode-set",
    );
    forceStop = true;
    result.stallCapacityFrames = await probeWebSocketBackpressureEndpoint(
      url,
      codec.referencePayload,
    );
    return result;
  } finally {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.terminate();
    }
    await stopTransportChild(childState.child, forceStop);
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

function createFixedEchoInvoker(socket, codec) {
  let waiting;
  let received = 0;
  socket.on("data", (chunk) => {
    if (waiting?.response) {
      chunk.copy(waiting.response, received);
    }
    received += chunk.byteLength;
    if (received < codec.referencePayload.byteLength) return;
    if (received !== codec.referencePayload.byteLength || !waiting) {
      waiting?.reject(new Error("stream response framing mismatch"));
    } else {
      try {
        codec.verify(waiting.response ?? codec.referencePayload);
        waiting.resolve();
      } catch (error) {
        waiting.reject(error);
      }
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
      const payload = codec.encode();
      if (payload.byteLength !== codec.referencePayload.byteLength) {
        reject(new Error("encoded payload length changed during benchmark"));
        return;
      }
      waiting = {
        resolve: resolveEcho,
        reject,
        response: Buffer.allocUnsafe(codec.referencePayload.byteLength),
      };
      socket.write(payload);
    });
}

function createWebSocketEchoInvoker(client, codec) {
  return () =>
    new Promise((resolveEcho, reject) => {
      const onError = (error) => {
        client.off("message", onMessage);
        reject(error);
      };
      const onMessage = (data) => {
        client.off("error", onError);
        const response = Buffer.from(data);
        try {
          codec.verify(response);
          resolveEcho();
        } catch (error) {
          reject(error);
        }
      };
      const payload = codec.encode();
      if (payload.byteLength !== codec.referencePayload.byteLength) {
        reject(new Error("encoded payload length changed during benchmark"));
        return;
      }
      client.once("error", onError);
      client.once("message", onMessage);
      client.send(payload, { binary: true, compress: false });
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
    const result = await probeStreamBackpressureClient(
      typeof address === "string" ? { path: address } : { host: "127.0.0.1", port: address.port },
      payload,
    );
    serverPeer?.destroy();
    await closeServer(stalledServer);
    return result;
  } finally {
    if (typeof stalledEndpoint === "string" && process.platform !== "win32") {
      await rm(stalledEndpoint, { force: true });
    }
  }
}

async function probeStreamBackpressureClient(connectionOptions, payload) {
  const client = createConnection(connectionOptions);
  await once(client, "connect");
  let frames = 0;
  while (frames < 100_000 && client.write(payload)) frames += 1;
  const result = {
    framesAcceptedBeforeSignal: frames,
    writableLengthBytes: client.writableLength,
    writableHighWaterMarkBytes: client.writableHighWaterMark,
  };
  client.destroy();
  return result;
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
  const stalledClosed = once(stalled, "close");
  const serverPeerClosed = serverPeer ? once(serverPeer, "close") : Promise.resolve();
  stalled.terminate();
  serverPeer?.terminate();
  await Promise.all([stalledClosed, serverPeerClosed]);
  return result;
}

async function probeWebSocketBackpressureEndpoint(url, payload) {
  const stalled = new WebSocket(url, { perMessageDeflate: false });
  await once(stalled, "open");
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
  return result;
}

async function startTransportChild(transport, endpoint) {
  const arguments_ = ["--transport", transport];
  if (typeof endpoint === "string") arguments_.push("--endpoint", endpoint);
  const child = fork(transportServerScript, arguments_, {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  try {
    const ready = await waitForTransportChildMessage(child, "ready");
    return {
      child,
      connectionOptions: ready.connectionOptions,
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

function commandTransportChild(child, message, responseKind) {
  const response = waitForTransportChildMessage(child, responseKind);
  child.send(message);
  return response;
}

function waitForTransportChildMessage(child, kind) {
  return new Promise((resolveMessage, reject) => {
    const onMessage = (message) => {
      if (message?.kind === "failure") {
        cleanup();
        reject(new Error(`transport child failed: ${message.message}`));
      } else if (message?.kind === kind) {
        cleanup();
        resolveMessage(message);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(
        new Error(
          `transport child exited before ${kind} (code=${String(code)}, signal=${String(signal)})`,
        ),
      );
    };
    const cleanup = () => {
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function stopTransportChild(child, force = false) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  if (force) {
    child.kill();
    await exited;
    return;
  }
  await commandTransportChild(child, { kind: "shutdown" }, "shutdown");
  await exited;
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
      throw new Error(
        "Expected --iterations, --warmup, --payload-bytes, --payload-mode, --motion-frame-shape, --server-layout, or --output with a value",
      );
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
  const serverLayout = values.get("--server-layout") ?? "same-process";
  const payloadMode = values.get("--payload-mode") ?? "opaque-bytes";
  const motionFrameShape = values.get("--motion-frame-shape") ?? "core17";
  if (!["same-process", "child-process"].includes(serverLayout)) {
    throw new Error("server-layout must be same-process or child-process");
  }
  if (!["opaque-bytes", "motion-json"].includes(payloadMode)) {
    throw new Error("payload-mode must be opaque-bytes or motion-json");
  }
  if (!["core17", "mediapipe33-world", "action-heavy"].includes(motionFrameShape)) {
    throw new Error(
      "motion-frame-shape must be core17, mediapipe33-world, or action-heavy",
    );
  }
  if (payloadMode === "motion-json" && values.has("--payload-bytes")) {
    throw new Error(
      "payload-bytes cannot be set with motion-json; the canonical frame determines its encoded size",
    );
  }
  if (payloadMode === "opaque-bytes" && values.has("--motion-frame-shape")) {
    throw new Error("motion-frame-shape is available only with payload-mode motion-json");
  }
  for (const name of values.keys()) {
    if (
      ![
        "--iterations",
        "--warmup",
        "--payload-bytes",
        "--output",
        "--server-layout",
        "--payload-mode",
        "--motion-frame-shape",
      ].includes(name)
    ) {
      throw new Error(`Unknown option ${name}`);
    }
  }
  return {
    iterations,
    warmup,
    payloadBytes,
    output,
    serverLayout,
    payloadMode,
    motionFrameShape,
  };
}

function boundedInteger(value, minimum, maximum, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}
