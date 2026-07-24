const telemetryIntervalMs = 100;

let label = null;
let mode = null;
let sessionId = null;
let receivedFrames = 0;
let acknowledgedFrames = 0;
let receivedHealthEvents = 0;
let configured = false;
const startedCpu = process.cpuUsage();

function send(value) {
  if (!process.connected || typeof process.send !== "function") return;
  process.send(value, () => undefined);
}

function snapshot(kind = "telemetry") {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(startedCpu);
  return {
    kind,
    label,
    mode,
    receivedFrames,
    acknowledgedFrames,
    receivedHealthEvents,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
  };
}

const telemetry = setInterval(() => {
  if (configured) send(snapshot());
}, telemetryIntervalMs);

process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.kind === "configure" && !configured) {
    configured = true;
    label = message.label;
    mode = message.mode;
    send({ kind: "bridge", data: message.hello });
    return;
  }
  if (message.kind === "bridge") {
    const data = message.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "vcg.motion.welcome") {
      sessionId = data.sessionId;
      receivedHealthEvents += 1;
      send({ kind: "ready", label, sessionId });
      return;
    }
    if (data.type === "vcg.motion.health") {
      receivedHealthEvents += 1;
      return;
    }
    if (data.type === "vcg.motion.frame") {
      receivedFrames += 1;
      if (mode === "healthy" && sessionId !== null) {
        acknowledgedFrames += 1;
        send({
          kind: "bridge",
          data: {
            type: "vcg.motion.ack",
            protocolVersion: 2,
            sessionId,
            sequence: data.frame.sequence,
          },
        });
      }
    }
    return;
  }
  if (message.kind === "shutdown") {
    clearInterval(telemetry);
    send(snapshot("final"));
    setImmediate(() => {
      if (process.connected) process.disconnect();
      process.exit(0);
    });
  }
});

process.on("disconnect", () => {
  clearInterval(telemetry);
  process.exit(0);
});
