import { createServer } from "node:net";
import { WebSocketServer } from "ws";

const options = parseOptions(process.argv.slice(2));
const streamSockets = new Set();
let mode = "echo";
let measurement;

const server =
  options.transport === "websocket"
    ? createWebSocketServer()
    : createStreamServer(options.transport === "local-socket" ? options.endpoint : undefined);

process.on("message", (message) => {
  void handleCommand(message).catch((error) => fail(error));
});
process.on("disconnect", () => {
  void shutdown();
});
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

function createStreamServer(endpoint) {
  const value = createServer((socket) => {
    streamSockets.add(socket);
    socket.once("close", () => streamSockets.delete(socket));
    if (mode === "stalled") {
      socket.pause();
    } else {
      socket.pipe(socket);
    }
  });
  value.listen(endpoint ?? { host: "127.0.0.1", port: 0 }, () => {
    const address = value.address();
    send({
      kind: "ready",
      connectionOptions:
        typeof address === "string"
          ? { path: address }
          : { host: "127.0.0.1", port: address.port },
    });
  });
  return value;
}

function createWebSocketServer() {
  const value = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    perMessageDeflate: false,
  });
  value.on("connection", (socket) => {
    if (mode === "stalled") {
      socket._socket.pause();
      return;
    }
    socket.on("message", (data, isBinary) => {
      socket.send(data, { binary: isBinary, compress: false });
    });
  });
  value.on("listening", () => {
    const address = value.address();
    send({
      kind: "ready",
      connectionOptions: { host: "127.0.0.1", port: address.port },
    });
  });
  return value;
}

async function handleCommand(message) {
  if (message?.kind === "begin") {
    if (measurement) throw new Error("measurement already active");
    const rssStartBytes = process.memoryUsage().rss;
    measurement = {
      cpuStart: process.cpuUsage(),
      rssStartBytes,
      rssPeakBytes: rssStartBytes,
      sampler: setInterval(() => {
        measurement.rssPeakBytes = Math.max(measurement.rssPeakBytes, process.memoryUsage().rss);
      }, 5),
    };
    send({ kind: "begun" });
    return;
  }
  if (message?.kind === "stats") {
    if (!measurement) throw new Error("measurement is not active");
    clearInterval(measurement.sampler);
    const cpu = process.cpuUsage(measurement.cpuStart);
    const rssEndBytes = process.memoryUsage().rss;
    const stats = {
      kind: "stats",
      processCpuMs: rounded((cpu.user + cpu.system) / 1_000),
      rssStartBytes: measurement.rssStartBytes,
      rssEndBytes,
      rssPeakBytes: Math.max(measurement.rssPeakBytes, rssEndBytes),
    };
    measurement = undefined;
    send(stats);
    return;
  }
  if (message?.kind === "set-mode" && message.mode === "stalled") {
    if (measurement) throw new Error("cannot change mode during measurement");
    mode = "stalled";
    send({ kind: "mode-set" });
    return;
  }
  if (message?.kind === "shutdown") {
    await shutdown();
    send({ kind: "shutdown" });
    process.disconnect();
    return;
  }
  throw new Error("unknown transport child command");
}

async function shutdown() {
  if (measurement) {
    clearInterval(measurement.sampler);
    measurement = undefined;
  }
  if (options.transport === "websocket") {
    for (const socket of server.clients) {
      socket._socket.resume();
      socket.terminate();
      socket._socket.destroy();
    }
  } else {
    for (const socket of streamSockets) socket.destroy();
  }
  if (server.listening) {
    await closeServerWithTimeout(server);
  }
}

function closeServerWithTimeout(value) {
  return new Promise((resolveClose, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("transport server shutdown timed out")),
      5_000,
    );
    value.close((error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolveClose();
    });
  });
}

function send(message) {
  if (process.connected) process.send(message);
}

function fail(error) {
  send({
    kind: "failure",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
  void shutdown().finally(() => process.disconnect());
}

function parseOptions(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("transport child expects paired options");
    }
    values.set(name, value);
  }
  for (const name of values.keys()) {
    if (!["--transport", "--endpoint"].includes(name)) throw new Error(`unknown option ${name}`);
  }
  const transport = values.get("--transport");
  if (!["tcp", "local-socket", "websocket"].includes(transport)) {
    throw new Error("transport must be tcp, local-socket, or websocket");
  }
  const endpoint = values.get("--endpoint");
  if (transport === "local-socket" && (!endpoint || endpoint.length > 240)) {
    throw new Error("local-socket requires a bounded endpoint");
  }
  if (transport !== "local-socket" && endpoint !== undefined) {
    throw new Error("endpoint is valid only for local-socket");
  }
  return { transport, endpoint };
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}
