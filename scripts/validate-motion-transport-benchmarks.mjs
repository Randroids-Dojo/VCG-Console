import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const expectedTransports = [
  "direct-library",
  "shared-memory-slot",
  "tcp-loopback",
  "local-socket",
  "websocket-loopback",
];
const requested = process.argv.slice(2);
const paths =
  requested.length > 0
    ? requested.map((path) => resolve(path))
    : (await readdir(resolve("benchmarks", "transport")))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => resolve("benchmarks", "transport", name));

let failures = 0;
for (const path of paths) {
  try {
    const report = JSON.parse(await readFile(path, "utf8"));
    validateReport(report);
    console.log(
      `${path}: valid (${report.method.processLayout.includes("separate child processes") ? "child-process" : "same-process"})`,
    );
  } catch (error) {
    failures += 1;
    console.error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures > 0) process.exitCode = 1;

function validateReport(report) {
  requireRecord(report, "report");
  requireEqual(report.format, "vcg-motion-transport-benchmark", "format");
  requireEqual(report.formatVersion, 1, "formatVersion");
  requireString(report.createdAt, "createdAt");
  if (!Number.isFinite(Date.parse(report.createdAt))) throw new Error("createdAt must be ISO date text");

  requireRecord(report.environment, "environment");
  for (const field of ["platform", "architecture", "node", "cpuModel"]) {
    requireString(report.environment[field], `environment.${field}`);
  }
  requireInteger(report.environment.logicalCpuCount, 1, 4_096, "environment.logicalCpuCount");

  requireRecord(report.method, "method");
  requireInteger(report.method.iterations, 100, 100_000, "method.iterations");
  requireInteger(report.method.warmupIterations, 0, 10_000, "method.warmupIterations");
  requireInteger(report.method.payloadBytes, 256, 1_048_576, "method.payloadBytes");
  requireEqual(report.method.pattern, "sequential request/echo round trip", "method.pattern");
  requireEqual(report.method.compression, false, "method.compression");
  requireEqual(report.method.schemaValidation, false, "method.schemaValidation");
  requireString(report.method.processLayout, "method.processLayout");
  const isolated = report.method.processLayout.includes("separate child processes");

  if (!Array.isArray(report.results) || report.results.length !== expectedTransports.length) {
    throw new Error(`results must contain ${expectedTransports.length} transports`);
  }
  report.results.forEach((result, index) =>
    validateResult(result, expectedTransports[index], isolated),
  );

  if (!Array.isArray(report.limitations) || report.limitations.length < 4) {
    throw new Error("limitations must contain at least four explicit entries");
  }
  report.limitations.forEach((value, index) => requireString(value, `limitations[${index}]`));
}

function validateResult(result, expectedTransport, isolated) {
  requireRecord(result, expectedTransport);
  requireEqual(result.transport, expectedTransport, `${expectedTransport}.transport`);
  requireRecord(result.latencyMicroseconds, `${expectedTransport}.latencyMicroseconds`);
  const latency = result.latencyMicroseconds;
  for (const field of ["p50", "p95", "p99", "max"]) {
    requireNumber(latency[field], 0, `${expectedTransport}.latencyMicroseconds.${field}`);
  }
  if (!(latency.p50 <= latency.p95 && latency.p95 <= latency.p99 && latency.p99 <= latency.max)) {
    throw new Error(`${expectedTransport} latency percentiles must be monotonic`);
  }
  requireNumber(result.elapsedMs, Number.MIN_VALUE, `${expectedTransport}.elapsedMs`);
  requireNumber(
    result.roundTripsPerSecond,
    Number.MIN_VALUE,
    `${expectedTransport}.roundTripsPerSecond`,
  );
  requireNumber(result.processCpuMs, 0, `${expectedTransport}.processCpuMs`);
  requireString(result.queueModel, `${expectedTransport}.queueModel`);

  if (expectedTransport === "direct-library") {
    requireEqual(result.stallCapacityFrames, 0, `${expectedTransport}.stallCapacityFrames`);
  } else if (expectedTransport === "shared-memory-slot") {
    requireEqual(result.stallCapacityFrames, 1, `${expectedTransport}.stallCapacityFrames`);
  } else if (expectedTransport === "websocket-loopback") {
    requireRecord(result.stallCapacityFrames, `${expectedTransport}.stallCapacityFrames`);
    requireInteger(
      result.stallCapacityFrames.framesAcceptedBeforeOneMiBBuffered,
      1,
      100_000,
      `${expectedTransport}.stallCapacityFrames.framesAcceptedBeforeOneMiBBuffered`,
    );
    requireNumber(
      result.stallCapacityFrames.bufferedAmountBytes,
      1_048_577,
      `${expectedTransport}.stallCapacityFrames.bufferedAmountBytes`,
    );
    requireEqual(
      result.stallCapacityFrames.applicationFrameBoundRequired,
      true,
      `${expectedTransport}.stallCapacityFrames.applicationFrameBoundRequired`,
    );
  } else {
    requireRecord(result.stallCapacityFrames, `${expectedTransport}.stallCapacityFrames`);
    requireInteger(
      result.stallCapacityFrames.framesAcceptedBeforeSignal,
      0,
      100_000,
      `${expectedTransport}.stallCapacityFrames.framesAcceptedBeforeSignal`,
    );
    requireInteger(
      result.stallCapacityFrames.writableLengthBytes,
      1,
      1_048_576,
      `${expectedTransport}.stallCapacityFrames.writableLengthBytes`,
    );
    requireInteger(
      result.stallCapacityFrames.writableHighWaterMarkBytes,
      1,
      1_048_576,
      `${expectedTransport}.stallCapacityFrames.writableHighWaterMarkBytes`,
    );
  }

  const usesChild = isolated && !["direct-library", "shared-memory-slot"].includes(expectedTransport);
  for (const field of [
    "clientRssStartBytes",
    "clientRssEndBytes",
    "serverProcessCpuMs",
    "serverRssStartBytes",
    "serverRssEndBytes",
    "serverRssPeakBytes",
  ]) {
    if (usesChild) requireNumber(result[field], 0, `${expectedTransport}.${field}`);
    else if (field in result) throw new Error(`${expectedTransport}.${field} is unexpected`);
  }
  if (
    usesChild &&
    result.serverRssPeakBytes < Math.max(result.serverRssStartBytes, result.serverRssEndBytes)
  ) {
    throw new Error(`${expectedTransport}.serverRssPeakBytes cannot be below start or end RSS`);
  }
}

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be text`);
}

function requireNumber(value, minimum, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}`);
  }
}

function requireInteger(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
}
