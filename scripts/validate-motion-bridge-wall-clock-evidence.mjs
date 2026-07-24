import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MOTION_BRIDGE_WALL_CLOCK_FORMAT } from "./run-motion-bridge-wall-clock-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/motion-bridge/windows-x64-child-stall-recovery-v1.json",
);
const MAX_ARTIFACT_BYTES = 128 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CLIENT_LABELS = [
  "initial-healthy",
  "stalled",
  "replacement-healthy",
];
const ASSERTION_IDS = [
  "stalled-client-received-one-frame-only",
  "stalled-and-killed-sessions-expired",
  "healthy-initial-delivery-continued",
  "healthy-replacement-delivery-continued",
  "one-healthy-session-remained-before-shutdown",
  "session-state-remained-bounded",
  "acknowledgements-remained-exact",
  "backpressure-dropped-producer-excess",
  "child-ipc-send-errors-absent",
  "scheduler-observation-remained-bounded",
  "main-rss-observation-remained-bounded",
  "child-rss-observations-remained-bounded",
];
const provenancePaths = {
  hostImplementationPath: "packages/motion-web-bridge/src/host.ts",
  clientPath: "scripts/motion-bridge-wall-clock-client.mjs",
  runnerPath: "scripts/run-motion-bridge-wall-clock-evidence.mjs",
  validatorPath: "scripts/validate-motion-bridge-wall-clock-evidence.mjs",
};

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function finiteNumber(value, path, minimum = 0, maximum = Number.MAX_VALUE) {
  assert.equal(typeof value, "number", `${path} must be a number`);
  assert.ok(Number.isFinite(value), `${path} must be finite`);
  assert.ok(value >= minimum && value <= maximum, `${path} is out of bounds`);
}

function safeInteger(value, path, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  assert.ok(Number.isSafeInteger(value), `${path} must be a safe integer`);
  assert.ok(value >= minimum && value <= maximum, `${path} is out of bounds`);
}

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

export async function expectedMotionBridgeWallClockProvenance() {
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

function validateClient(client, index) {
  const path = `artifact.observations.clients[${index}]`;
  exactKeys(
    client,
    [
      "label",
      "mode",
      "framesOfferedByHost",
      "lastReportedFramesReceived",
      "lastReportedFramesAcknowledged",
      "receivedHealthEvents",
      "telemetrySampleCount",
      "peakRssBytes",
      "peakHeapUsedBytes",
      "lastReportedCpuUserMicros",
      "lastReportedCpuSystemMicros",
      "sendErrorCount",
      "termination",
    ],
    path,
  );
  assert.equal(client.label, CLIENT_LABELS[index]);
  assert.equal(client.mode, index === 1 ? "stalled" : "healthy");
  for (const key of [
    "framesOfferedByHost",
    "lastReportedFramesReceived",
    "lastReportedFramesAcknowledged",
    "receivedHealthEvents",
    "telemetrySampleCount",
    "peakRssBytes",
    "peakHeapUsedBytes",
    "lastReportedCpuUserMicros",
    "lastReportedCpuSystemMicros",
    "sendErrorCount",
  ]) {
    safeInteger(client[key], `${path}.${key}`);
  }
  assert.ok(
    client.lastReportedFramesReceived <= client.framesOfferedByHost,
    `${path} cannot report more received than offered`,
  );
  assert.ok(
    client.lastReportedFramesAcknowledged <= client.lastReportedFramesReceived,
    `${path} cannot acknowledge more than received`,
  );
  assert.ok(client.telemetrySampleCount > 0, `${path} requires telemetry`);
  assert.ok(client.receivedHealthEvents >= 1, `${path} requires welcome health`);
  assert.ok(client.peakRssBytes > 0 && client.peakRssBytes < 256 * 1024 * 1024);
  assert.ok(
    client.peakHeapUsedBytes > 0
      && client.peakHeapUsedBytes <= client.peakRssBytes,
  );
  assert.equal(client.sendErrorCount, 0);
  exactKeys(
    client.termination,
    ["requested", "exitCode", "signal"],
    `${path}.termination`,
  );
  assert.equal(
    client.termination.requested,
    index === 2 ? "graceful-shutdown" : "forced-termination",
  );
  assert.ok(
    client.termination.exitCode === null
      || Number.isSafeInteger(client.termination.exitCode),
  );
  assert.ok(
    client.termination.signal === null
      || typeof client.termination.signal === "string",
  );
}

function validateObservations(observations) {
  exactKeys(
    observations,
    [
      "elapsedMs",
      "producerTickCount",
      "achievedProducerFrequencyHz",
      "host",
      "clients",
      "mainProcess",
      "scheduler",
    ],
    "artifact.observations",
  );
  finiteNumber(observations.elapsedMs, "artifact.observations.elapsedMs", 8_500, 12_000);
  safeInteger(
    observations.producerTickCount,
    "artifact.observations.producerTickCount",
    400,
    850,
  );
  finiteNumber(
    observations.achievedProducerFrequencyHz,
    "artifact.observations.achievedProducerFrequencyHz",
    50,
    106.25,
  );
  exactKeys(
    observations.host,
    [
      "acceptedConnections",
      "rejectedConnections",
      "hostileOriginMessages",
      "invalidMessages",
      "publishedFrames",
      "rateLimitedFrames",
      "publishedHealthEvents",
      "expiredSessions",
      "invalidAcknowledgements",
      "peakSessions",
      "activeSessions",
      "pendingFrames",
      "activeSessionsBeforeShutdown",
    ],
    "artifact.observations.host",
  );
  for (const [key, value] of Object.entries(observations.host)) {
    safeInteger(value, `artifact.observations.host.${key}`);
  }
  assert.equal(observations.host.acceptedConnections, 3);
  assert.equal(observations.host.rejectedConnections, 0);
  assert.equal(observations.host.hostileOriginMessages, 0);
  assert.equal(observations.host.invalidMessages, 0);
  assert.equal(observations.host.publishedHealthEvents, 0);
  assert.equal(observations.host.expiredSessions, 2);
  assert.equal(observations.host.invalidAcknowledgements, 0);
  assert.equal(observations.host.peakSessions, 2);
  assert.equal(observations.host.activeSessions, 1);
  assert.equal(observations.host.activeSessionsBeforeShutdown, 1);
  assert.equal(observations.host.pendingFrames, 0);
  assert.ok(observations.host.publishedFrames >= 200);
  assert.ok(observations.host.rateLimitedFrames > 0);
  assert.ok(observations.achievedProducerFrequencyHz > 60);

  assert.ok(Array.isArray(observations.clients) && observations.clients.length === 3);
  observations.clients.forEach(validateClient);
  assert.equal(observations.clients[1].framesOfferedByHost, 1);
  assert.ok(observations.clients[0].framesOfferedByHost >= 100);
  assert.ok(observations.clients[2].framesOfferedByHost >= 100);
  assert.equal(
    observations.host.publishedFrames,
    observations.clients.reduce(
      (sum, client) => sum + client.framesOfferedByHost,
      0,
    ),
  );

  exactKeys(
    observations.mainProcess,
    [
      "rssStartedBytes",
      "peakRssBytes",
      "rssGrowthBytes",
      "cpuUserMicros",
      "cpuSystemMicros",
      "memorySampleCount",
    ],
    "artifact.observations.mainProcess",
  );
  for (const [key, value] of Object.entries(observations.mainProcess)) {
    safeInteger(value, `artifact.observations.mainProcess.${key}`, 0, 1024 ** 4);
  }
  assert.ok(
    observations.mainProcess.peakRssBytes
      >= observations.mainProcess.rssStartedBytes,
  );
  assert.equal(
    observations.mainProcess.rssGrowthBytes,
    observations.mainProcess.peakRssBytes
      - observations.mainProcess.rssStartedBytes,
  );
  assert.ok(observations.mainProcess.peakRssBytes < 512 * 1024 * 1024);
  assert.ok(observations.mainProcess.memorySampleCount >= 60);

  exactKeys(
    observations.scheduler,
    [
      "sampleCount",
      "p50DriftMs",
      "p95DriftMs",
      "p99DriftMs",
      "maximumDriftMs",
    ],
    "artifact.observations.scheduler",
  );
  safeInteger(
    observations.scheduler.sampleCount,
    "artifact.observations.scheduler.sampleCount",
  );
  for (const key of [
    "p50DriftMs",
    "p95DriftMs",
    "p99DriftMs",
    "maximumDriftMs",
  ]) {
    finiteNumber(
      observations.scheduler[key],
      `artifact.observations.scheduler.${key}`,
      0,
      1_000,
    );
  }
  assert.equal(
    observations.scheduler.sampleCount,
    observations.producerTickCount,
  );
  assert.ok(
    observations.scheduler.p50DriftMs <= observations.scheduler.p95DriftMs
      && observations.scheduler.p95DriftMs <= observations.scheduler.p99DriftMs
      && observations.scheduler.p99DriftMs
        <= observations.scheduler.maximumDriftMs,
  );
  assert.ok(observations.scheduler.p99DriftMs < 250);
  assert.ok(observations.scheduler.maximumDriftMs < 1_000);
}

export function validateMotionBridgeWallClockEvidence(value, expectedProvenance) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "environment",
      "configuration",
      "policy",
      "observations",
      "assertions",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, MOTION_BRIDGE_WALL_CLOCK_FORMAT);
  assert.equal(value.evidenceDate, "2026-07-24");
  assert.equal(
    value.evidenceClass,
    "windows-x64-wall-clock-node-child-process-rehearsal",
  );
  assert.equal(value.qualification, "desk-observation-not-target-qualification");

  exactKeys(
    value.environment,
    [
      "platform",
      "architecture",
      "nodeVersion",
      "logicalCpuCount",
      "executionLayer",
      "startedAtUtc",
    ],
    "artifact.environment",
  );
  assert.equal(value.environment.platform, "win32");
  assert.equal(value.environment.architecture, "x64");
  assert.match(value.environment.nodeVersion, /^v\d+\.\d+\.\d+$/);
  safeInteger(
    value.environment.logicalCpuCount,
    "artifact.environment.logicalCpuCount",
    1,
    1024,
  );
  assert.equal(
    value.environment.executionLayer,
    "windows-node-child-process-ipc",
  );
  assert.ok(Number.isFinite(Date.parse(value.environment.startedAtUtc)));

  exactKeys(
    value.configuration,
    [
      "durationMs",
      "requestedProducerFrequencyHz",
      "hostMaximumFramesPerSecond",
      "sessionTtlMs",
      "maximumSessions",
      "telemetryIntervalMs",
      "stalledTerminationAtMs",
      "healthyTerminationAtMs",
    ],
    "artifact.configuration",
  );
  assert.deepEqual(value.configuration, {
    durationMs: 8_000,
    requestedProducerFrequencyHz: 100,
    hostMaximumFramesPerSecond: 60,
    sessionTtlMs: 1_000,
    maximumSessions: 3,
    telemetryIntervalMs: 100,
    stalledTerminationAtMs: 2_000,
    healthyTerminationAtMs: 3_500,
  });

  exactKeys(
    value.policy,
    [
      "realChildProcessesUsed",
      "wallClockUsed",
      "nonAcknowledgingClientUsed",
      "forcedRendererTerminationModeled",
      "osSuspendUsed",
      "trackerProcessUsed",
      "nativeIpcUsed",
      "targetLinuxUsed",
      "productThresholdQualified",
    ],
    "artifact.policy",
  );
  assert.deepEqual(value.policy, {
    realChildProcessesUsed: true,
    wallClockUsed: true,
    nonAcknowledgingClientUsed: true,
    forcedRendererTerminationModeled: true,
    osSuspendUsed: false,
    trackerProcessUsed: false,
    nativeIpcUsed: false,
    targetLinuxUsed: false,
    productThresholdQualified: false,
  });

  validateObservations(value.observations);
  assert.ok(Array.isArray(value.assertions) && value.assertions.length === 12);
  assert.deepEqual(
    value.assertions.map(({ id }) => id),
    ASSERTION_IDS,
  );
  for (const [index, assertion] of value.assertions.entries()) {
    exactKeys(assertion, ["id", "passed"], `artifact.assertions[${index}]`);
    assert.equal(assertion.passed, true);
  }

  exactKeys(
    value.summary,
    [
      "childProcessCount",
      "forcedTerminationCount",
      "gracefulShutdownCount",
      "assertionCount",
      "passedAssertionCount",
      "failedAssertionCount",
      "participantCount",
      "cameraFrameCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    childProcessCount: 3,
    forcedTerminationCount: 2,
    gracefulShutdownCount: 1,
    assertionCount: 12,
    passedAssertionCount: 12,
    failedAssertionCount: 0,
    participantCount: 0,
    cameraFrameCount: 0,
  });

  exactKeys(
    value.provenance,
    [
      "hostImplementationPath",
      "hostImplementationPathSha256",
      "clientPath",
      "clientPathSha256",
      "runnerPath",
      "runnerPathSha256",
      "validatorPath",
      "validatorPathSha256",
    ],
    "artifact.provenance",
  );
  assert.deepEqual(value.provenance, expectedProvenance);
  for (const [key, digest] of Object.entries(value.provenance)) {
    if (key.endsWith("Sha256")) assert.match(digest, SHA256_PATTERN);
  }
  assert.ok(Array.isArray(value.limitations) && value.limitations.length === 5);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function validateTrackedMotionBridgeWallClockEvidence() {
  const [bytes, expectedProvenance] = await Promise.all([
    readFile(artifactPath),
    expectedMotionBridgeWallClockProvenance(),
  ]);
  return validateMotionBridgeWallClockEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
  );
}

async function main() {
  const artifact = await validateTrackedMotionBridgeWallClockEvidence();
  console.log(
    `validated ${artifact.summary.childProcessCount} child processes / ${artifact.summary.assertionCount} assertions; ${artifact.summary.participantCount} participants claimed`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
