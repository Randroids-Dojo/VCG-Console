import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
} from "@vcg/motion-contract";
import {
  MOTION_BRIDGE_PROTOCOL_VERSION,
  MotionBridgeHost,
} from "@vcg/motion-web-bridge";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = resolve(root, "scripts/motion-bridge-wall-clock-client.mjs");
const outputPath = resolve(
  root,
  "benchmarks/motion-bridge/windows-x64-child-stall-recovery-v1.json",
);

export const MOTION_BRIDGE_WALL_CLOCK_FORMAT =
  "vcg-motion-bridge-wall-clock-evidence/v1";

const configuration = Object.freeze({
  durationMs: 8_000,
  requestedProducerFrequencyHz: 100,
  hostMaximumFramesPerSecond: 60,
  sessionTtlMs: 1_000,
  maximumSessions: 3,
  telemetryIntervalMs: 100,
  stalledTerminationAtMs: 2_000,
  healthyTerminationAtMs: 3_500,
});

const gameOrigin = "https://wall-clock-fixture.example";
const provenancePaths = {
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  clientPath: "scripts/motion-bridge-wall-clock-client.mjs",
  runnerPath: "scripts/run-motion-bridge-wall-clock-evidence.mjs",
  validatorPath: "scripts/validate-motion-bridge-wall-clock-evidence.mjs",
};

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

class Receiver {
  listeners = new Set();

  addEventListener(_type, listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type, listener) {
    this.listeners.delete(listener);
  }

  dispatch(event) {
    for (const listener of this.listeners) listener(event);
  }
}

const capabilities = {
  profiles: ["body.core17"],
  maxPlayers: 1,
  coordinateSpecVersion: COORDINATE_SPEC_VERSION,
  coordinateSystem: "image.normalized.top-left",
  timestampQuality: "capture-arrival",
};

function frame(sequence, nowMs) {
  return MotionFrameSchema.parse({
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    sourceTimestampMs: nowMs,
    inferenceStartedAtMs: nowMs,
    inferenceCompletedAtMs: nowMs,
    publishedAtMs: nowMs,
    health: "ready",
    capabilities,
    players: [
      {
        id: "player-1",
        sessionSlot: 1,
        confidence: 1,
        state: "joined",
        coreLandmarks: CORE_LANDMARK_NAMES.map((name) => ({
          name,
          position: { x: 0.5, y: 0.5, z: 0 },
          visibility: 1,
          observed: true,
        })),
        bounds: { left: 0.25, top: 0.1, right: 0.75, bottom: 0.9 },
        actions: [],
      },
    ],
  });
}

function percentile(values, probability) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(
    ordered.length - 1,
    Math.ceil(probability * ordered.length) - 1,
  )];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { exitCode: child.exitCode, signal: child.signalCode };
  }
  return Promise.race([
    new Promise((resolveExit) => {
      child.once("exit", (exitCode, signal) =>
        resolveExit({ exitCode, signal }),
      );
    }),
    delay(timeoutMs).then(() => {
      throw new Error("child process did not exit within the bounded deadline");
    }),
  ]);
}

function createClient(receiver, label, mode) {
  const child = fork(clientPath, [], {
    cwd: root,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
  });
  const telemetry = [];
  let framesOfferedByHost = 0;
  let sendErrorCount = 0;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolveReady, rejectReady) => {
    readyResolve = resolveReady;
    readyReject = rejectReady;
  });
  const target = {
    postMessage(data, targetOrigin) {
      if (data?.type === "vcg.motion.frame") framesOfferedByHost += 1;
      if (!child.connected) return;
      child.send({ kind: "bridge", data, targetOrigin }, (error) => {
        if (error) sendErrorCount += 1;
      });
    },
  };
  child.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.kind === "bridge") {
      receiver.dispatch({
        data: message.data,
        origin: gameOrigin,
        source: target,
      });
    } else if (message.kind === "ready") {
      readyResolve(message.sessionId);
    } else if (message.kind === "telemetry" || message.kind === "final") {
      telemetry.push(message);
    }
  });
  child.once("error", (error) => readyReject(error));
  child.send({
    kind: "configure",
    label,
    mode,
    hello: {
      type: "vcg.motion.hello",
      protocolVersion: MOTION_BRIDGE_PROTOCOL_VERSION,
      motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
      clientId: label,
      request: {
        requiredProfiles: ["body.core17"],
        optionalProfiles: [],
      },
    },
  });
  return {
    label,
    mode,
    child,
    ready,
    telemetry,
    framesOffered: () => framesOfferedByHost,
    sendErrors: () => sendErrorCount,
  };
}

async function terminateClient(client, graceful) {
  if (graceful) client.child.send({ kind: "shutdown" });
  else client.child.kill();
  return waitForExit(client.child);
}

function summarizeClient(client, termination) {
  const reports = client.telemetry;
  const last = reports.at(-1) ?? {
    receivedFrames: 0,
    acknowledgedFrames: 0,
    receivedHealthEvents: 0,
    rssBytes: 0,
    heapUsedBytes: 0,
    cpuUserMicros: 0,
    cpuSystemMicros: 0,
  };
  return {
    label: client.label,
    mode: client.mode,
    framesOfferedByHost: client.framesOffered(),
    lastReportedFramesReceived: last.receivedFrames,
    lastReportedFramesAcknowledged: last.acknowledgedFrames,
    receivedHealthEvents: last.receivedHealthEvents,
    telemetrySampleCount: reports.length,
    peakRssBytes: Math.max(0, ...reports.map(({ rssBytes }) => rssBytes)),
    peakHeapUsedBytes: Math.max(
      0,
      ...reports.map(({ heapUsedBytes }) => heapUsedBytes),
    ),
    lastReportedCpuUserMicros: last.cpuUserMicros,
    lastReportedCpuSystemMicros: last.cpuSystemMicros,
    sendErrorCount: client.sendErrors(),
    termination,
  };
}

export async function runMotionBridgeWallClockEvidence() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("this evidence run is frozen to the Windows x64 desk lane");
  }

  const receiver = new Receiver();
  const host = new MotionBridgeHost({
    receiver,
    allowedOrigins: [gameOrigin],
    capabilities,
    authorizedProfiles: ["body.core17"],
    initialHealth: {
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence: 0,
      source: "synthetic",
      occurredAtMs: 0,
      status: "ready",
      reason: "healthy",
      controlAvailability: "full",
    },
    maximumFramesPerSecond: configuration.hostMaximumFramesPerSecond,
    maximumSessions: configuration.maximumSessions,
    sessionTtlMs: configuration.sessionTtlMs,
  });
  host.start();

  const initialHealthy = createClient(receiver, "initial-healthy", "healthy");
  const stalled = createClient(receiver, "stalled", "stalled");
  await Promise.all([initialHealthy.ready, stalled.ready]);

  const wallStarted = performance.now();
  const startedAtUtc = new Date().toISOString();
  const processCpuStarted = process.cpuUsage();
  const mainRssStarted = process.memoryUsage().rss;
  const mainMemorySamples = [];
  const schedulerDriftMs = [];
  let producerTickCount = 0;
  let nextSequence = 1;
  let replacementHealthy;
  let stalledTermination;
  let initialTermination;

  const memoryTimer = setInterval(() => {
    mainMemorySamples.push(process.memoryUsage().rss);
  }, configuration.telemetryIntervalMs);
  const producerIntervalMs =
    1_000 / configuration.requestedProducerFrequencyHz;
  let previousTickAt = performance.now();
  const producerTimer = setInterval(() => {
    const now = performance.now();
    schedulerDriftMs.push(
      Math.max(0, now - previousTickAt - producerIntervalMs),
    );
    previousTickAt = now;
    host.publish(frame(nextSequence++, now));
    producerTickCount += 1;
  }, producerIntervalMs);

  const lifecycle = (async () => {
    await delay(configuration.stalledTerminationAtMs);
    stalledTermination = await terminateClient(stalled, false);
    await delay(
      configuration.healthyTerminationAtMs
        - configuration.stalledTerminationAtMs,
    );
    initialTermination = await terminateClient(initialHealthy, false);
    replacementHealthy = createClient(
      receiver,
      "replacement-healthy",
      "healthy",
    );
    await replacementHealthy.ready;
  })();

  await delay(configuration.durationMs);
  clearInterval(producerTimer);
  clearInterval(memoryTimer);
  await lifecycle;
  await delay(configuration.sessionTtlMs + 100);
  host.collectExpiredSessions();
  const finalHostStats = host.stats();
  const replacementTermination = await terminateClient(
    replacementHealthy,
    true,
  );
  host.stop();

  const elapsedMs = performance.now() - wallStarted;
  const mainCpu = process.cpuUsage(processCpuStarted);
  const clients = [
    summarizeClient(initialHealthy, {
      requested: "forced-termination",
      exitCode: initialTermination.exitCode,
      signal: initialTermination.signal,
    }),
    summarizeClient(stalled, {
      requested: "forced-termination",
      exitCode: stalledTermination.exitCode,
      signal: stalledTermination.signal,
    }),
    summarizeClient(replacementHealthy, {
      requested: "graceful-shutdown",
      exitCode: replacementTermination.exitCode,
      signal: replacementTermination.signal,
    }),
  ];
  const peakMainRss = Math.max(mainRssStarted, ...mainMemorySamples);
  const totalSendErrors = clients.reduce(
    (sum, client) => sum + client.sendErrorCount,
    0,
  );
  const observations = {
    elapsedMs: round(elapsedMs),
    producerTickCount,
    achievedProducerFrequencyHz: round(
      producerTickCount / (configuration.durationMs / 1_000),
    ),
    host: {
      ...finalHostStats,
      activeSessionsBeforeShutdown: finalHostStats.activeSessions,
    },
    clients,
    mainProcess: {
      rssStartedBytes: mainRssStarted,
      peakRssBytes: peakMainRss,
      rssGrowthBytes: peakMainRss - mainRssStarted,
      cpuUserMicros: mainCpu.user,
      cpuSystemMicros: mainCpu.system,
      memorySampleCount: mainMemorySamples.length,
    },
    scheduler: {
      sampleCount: schedulerDriftMs.length,
      p50DriftMs: round(percentile(schedulerDriftMs, 0.5)),
      p95DriftMs: round(percentile(schedulerDriftMs, 0.95)),
      p99DriftMs: round(percentile(schedulerDriftMs, 0.99)),
      maximumDriftMs: round(Math.max(0, ...schedulerDriftMs)),
    },
  };

  const assertions = [
    {
      id: "stalled-client-received-one-frame-only",
      passed: clients[1].framesOfferedByHost === 1,
    },
    {
      id: "stalled-and-killed-sessions-expired",
      passed: finalHostStats.expiredSessions === 2,
    },
    {
      id: "healthy-initial-delivery-continued",
      passed: clients[0].framesOfferedByHost >= 100,
    },
    {
      id: "healthy-replacement-delivery-continued",
      passed: clients[2].framesOfferedByHost >= 100,
    },
    {
      id: "one-healthy-session-remained-before-shutdown",
      passed:
        finalHostStats.activeSessions === 1
        && finalHostStats.pendingFrames === 0,
    },
    {
      id: "session-state-remained-bounded",
      passed:
        finalHostStats.peakSessions <= 2
        && finalHostStats.peakSessions <= configuration.maximumSessions,
    },
    {
      id: "acknowledgements-remained-exact",
      passed: finalHostStats.invalidAcknowledgements === 0,
    },
    {
      id: "backpressure-dropped-producer-excess",
      passed:
        observations.achievedProducerFrequencyHz
          > configuration.hostMaximumFramesPerSecond
        && finalHostStats.rateLimitedFrames > 0,
    },
    {
      id: "child-ipc-send-errors-absent",
      passed: totalSendErrors === 0,
    },
    {
      id: "scheduler-observation-remained-bounded",
      passed:
        observations.scheduler.p99DriftMs < 250
        && observations.scheduler.maximumDriftMs < 1_000,
    },
    {
      id: "main-rss-observation-remained-bounded",
      passed: peakMainRss < 512 * 1024 * 1024,
    },
    {
      id: "child-rss-observations-remained-bounded",
      passed: clients.every(({ peakRssBytes }) => peakRssBytes < 256 * 1024 * 1024),
    },
  ];
  if (assertions.some(({ passed }) => !passed)) {
    throw new Error(
      `wall-clock evidence assertion failed: ${assertions
        .filter(({ passed }) => !passed)
        .map(({ id }) => id)
        .join(", ")}`,
    );
  }

  return {
    format: MOTION_BRIDGE_WALL_CLOCK_FORMAT,
    evidenceDate: "2026-07-24",
    evidenceClass: "windows-x64-wall-clock-node-child-process-rehearsal",
    qualification: "desk-observation-not-target-qualification",
    environment: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      logicalCpuCount: cpus().length,
      executionLayer: "windows-node-child-process-ipc",
      startedAtUtc,
    },
    configuration,
    policy: {
      realChildProcessesUsed: true,
      wallClockUsed: true,
      nonAcknowledgingClientUsed: true,
      forcedRendererTerminationModeled: true,
      osSuspendUsed: false,
      trackerProcessUsed: false,
      nativeIpcUsed: false,
      targetLinuxUsed: false,
      productThresholdQualified: false,
    },
    observations,
    assertions,
    summary: {
      childProcessCount: clients.length,
      forcedTerminationCount: clients.filter(
        ({ termination }) =>
          termination.requested === "forced-termination",
      ).length,
      gracefulShutdownCount: clients.filter(
        ({ termination }) =>
          termination.requested === "graceful-shutdown",
      ).length,
      assertionCount: assertions.length,
      passedAssertionCount: assertions.filter(({ passed }) => passed).length,
      failedAssertionCount: assertions.filter(({ passed }) => !passed).length,
      participantCount: 0,
      cameraFrameCount: 0,
    },
    provenance: await provenance(),
    claimBoundary:
      "One Windows x64 desk observation using Node child-process IPC. It proves that this run preserved one healthy bridge client while one client stopped acknowledging and another was forcibly terminated, with bounded host session state and recorded process/scheduler telemetry. It does not qualify Linux, native IPC, browser/OS suspension, tracker isolation, latency, resource budgets, gameplay, or product reliability.",
    limitations: [
      "The run used synthetic Motion frames and Node IPC on one Windows x64 development host, not the selected ARM64 or ordinary x86-64 Linux appliances.",
      "A child that intentionally omitted acknowledgements models application-level stall only; no process was suspended by the operating system.",
      "Forced Node child termination models a renderer disappearance but is not Chromium renderer, compositor, cgroup, service-manager, or crash-dump evidence.",
      "RSS, CPU, and scheduler values are one observational run with generous harness ceilings, not pre-registered product performance budgets or statistical distributions.",
      "No camera, tracker process, native transport, game, player, full pipeline, end-to-end action latency, thermal, or long-duration soak was exercised.",
    ],
  };
}

async function main() {
  const artifact = await runMotionBridgeWallClockEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.childProcessCount} child processes / ${artifact.summary.assertionCount} assertions to ${outputPath}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
