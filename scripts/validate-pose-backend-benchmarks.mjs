import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedReports = [
  "benchmarks/pose-backends/windows-x64-mediapipe-lite-cpu.json",
  "benchmarks/pose-backends/windows-x64-rtmo-s-cpu.json",
];
const inputNames = ["black", "gray-114", "horizontal-gradient", "seeded-noise"];

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys must be exactly ${expected.join(", ")}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be non-empty text`);
}

function requireNumber(value, minimum, maximum, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number between ${minimum} and ${maximum}`);
  }
}

function requireInteger(value, minimum, maximum, name) {
  requireNumber(value, minimum, maximum, name);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validatePoseBackendReport(report, expectedDigests) {
  requireRecord(report, "report");
  requireExactKeys(
    report,
    [
      "format",
      "formatVersion",
      "generatedAt",
      "sourceCommit",
      "workingTreeClean",
      "implementationSha256",
      "dependencyLockSha256",
      "environment",
      "backend",
      "workload",
      "results",
      "claimBoundary",
      "limitations",
    ],
    "report",
  );
  requireEqual(report.format, "vcg-pose-backend-benchmark", "format");
  requireEqual(report.formatVersion, 1, "formatVersion");
  if (typeof report.generatedAt !== "string" || !Number.isFinite(Date.parse(report.generatedAt))) {
    throw new Error("generatedAt must be an ISO date-time");
  }
  if (typeof report.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(report.sourceCommit)) {
    throw new Error("sourceCommit must be a lowercase Git commit");
  }
  if (typeof report.workingTreeClean !== "boolean") throw new Error("workingTreeClean must be boolean");
  requireSha256(report.implementationSha256, "implementationSha256");
  requireSha256(report.dependencyLockSha256, "dependencyLockSha256");
  requireEqual(report.implementationSha256, expectedDigests.implementation, "implementationSha256");
  requireEqual(report.dependencyLockSha256, expectedDigests.lock, "dependencyLockSha256");

  requireRecord(report.environment, "environment");
  requireExactKeys(report.environment, ["platform", "architecture", "python", "logicalCpuCount"], "environment");
  requireEqual(report.environment.platform, "win32", "environment.platform");
  requireEqual(report.environment.architecture, "amd64", "environment.architecture");
  if (typeof report.environment.python !== "string" || !/^3\.13\.\d+$/.test(report.environment.python)) {
    throw new Error("environment.python must be a Python 3.13 patch version");
  }
  requireInteger(report.environment.logicalCpuCount, 1, 4096, "environment.logicalCpuCount");

  requireRecord(report.backend, "backend");
  requireExactKeys(
    report.backend,
    [
      "name",
      "library",
      "libraryVersion",
      "runtime",
      "runtimeVersion",
      "provider",
      "inputColorOrder",
      "modelRepositoryPath",
      "modelBytes",
      "modelSha256",
    ],
    "backend",
  );
  for (const field of ["name", "library", "libraryVersion", "runtime", "runtimeVersion", "provider", "inputColorOrder", "modelRepositoryPath"]) {
    requireString(report.backend[field], `backend.${field}`);
  }
  requireInteger(report.backend.modelBytes, 1, 100_000_000, "backend.modelBytes");
  requireSha256(report.backend.modelSha256, "backend.modelSha256");

  if (report.backend.name === "rtmo-s") {
    requireEqual(report.backend.library, "rtmlib", "backend.library");
    requireEqual(report.backend.libraryVersion, "0.0.15", "backend.libraryVersion");
    requireEqual(report.backend.runtime, "onnxruntime", "backend.runtime");
    requireEqual(report.backend.runtimeVersion, "1.27.0", "backend.runtimeVersion");
    requireEqual(report.backend.provider, "CPUExecutionProvider", "backend.provider");
    requireEqual(report.backend.inputColorOrder, "bgr-assumed-by-rtmlib", "backend.inputColorOrder");
    requireEqual(report.backend.modelBytes, 39_617_685, "backend.modelBytes");
    requireEqual(
      report.backend.modelSha256,
      "d0703d40d19f3921da51ae725402d5fdae4d2478c7442072d3101bd396f370d8",
      "backend.modelSha256",
    );
  } else if (report.backend.name === "mediapipe-pose-landmarker-lite") {
    requireEqual(report.backend.library, "mediapipe", "backend.library");
    requireEqual(report.backend.libraryVersion, "0.10.35", "backend.libraryVersion");
    requireEqual(report.backend.runtime, "mediapipe-tasks-cpu", "backend.runtime");
    requireEqual(report.backend.runtimeVersion, "0.10.35", "backend.runtimeVersion");
    requireEqual(report.backend.provider, "CPU", "backend.provider");
    requireEqual(report.backend.inputColorOrder, "srgb", "backend.inputColorOrder");
    requireEqual(report.backend.modelBytes, 5_777_746, "backend.modelBytes");
    requireEqual(
      report.backend.modelSha256,
      "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
      "backend.modelSha256",
    );
  } else {
    throw new Error("backend.name must identify the pinned RTMO-s or MediaPipe Lite backend");
  }

  requireRecord(report.workload, "workload");
  requireExactKeys(
    report.workload,
    [
      "width",
      "height",
      "motionApiSchemaVersion",
      "timer",
      "latencyBoundary",
      "latencySummaryMethod",
      "inputs",
      "suiteSha256",
      "warmupIterations",
      "measuredIterations",
      "containsRawFrames",
      "inputClass",
    ],
    "workload",
  );
  requireEqual(report.workload.motionApiSchemaVersion, "0.4.0", "workload.motionApiSchemaVersion");
  requireEqual(report.workload.width, 640, "workload.width");
  requireEqual(report.workload.height, 640, "workload.height");
  requireEqual(report.workload.timer, "python-time.perf_counter", "workload.timer");
  requireEqual(report.workload.latencyBoundary, "backend-call-only", "workload.latencyBoundary");
  requireEqual(
    report.workload.latencySummaryMethod,
    "linear-interpolation-r7",
    "workload.latencySummaryMethod",
  );
  if (JSON.stringify(report.workload.inputs) !== JSON.stringify(inputNames)) {
    throw new Error("workload.inputs must contain the exact deterministic suite");
  }
  requireSha256(report.workload.suiteSha256, "workload.suiteSha256");
  requireInteger(report.workload.warmupIterations, 20, 10_000, "workload.warmupIterations");
  requireInteger(report.workload.measuredIterations, 100, 10_000, "workload.measuredIterations");
  requireEqual(report.workload.containsRawFrames, false, "workload.containsRawFrames");
  requireEqual(
    report.workload.inputClass,
    "deterministic-synthetic-negative-and-idle-compute-only",
    "workload.inputClass",
  );

  requireRecord(report.results, "results");
  requireExactKeys(report.results, ["latencyMs", "throughputFps", "detections", "memoryBytes"], "results");
  requireRecord(report.results.latencyMs, "results.latencyMs");
  requireExactKeys(report.results.latencyMs, ["mean", "p50", "p95", "p99", "worst"], "results.latencyMs");
  for (const field of ["mean", "p50", "p95", "p99", "worst"]) {
    requireNumber(report.results.latencyMs[field], 0.001, 60_000, `results.latencyMs.${field}`);
  }
  const { p50, p95, p99, worst } = report.results.latencyMs;
  if (!(p50 <= p95 && p95 <= p99 && p99 <= worst)) {
    throw new Error("latency percentiles must be monotonic through worst");
  }
  requireNumber(report.results.throughputFps, 0.001, 1_000_000, "results.throughputFps");

  requireRecord(report.results.detections, "results.detections");
  requireExactKeys(report.results.detections, ["total", "maximumPerFrame", "byInput"], "results.detections");
  requireInteger(report.results.detections.total, 0, 1_000_000, "results.detections.total");
  requireInteger(report.results.detections.maximumPerFrame, 0, 1000, "results.detections.maximumPerFrame");
  requireRecord(report.results.detections.byInput, "results.detections.byInput");
  requireExactKeys(report.results.detections.byInput, inputNames, "results.detections.byInput");
  const detectionSum = inputNames.reduce((total, name) => {
    requireInteger(report.results.detections.byInput[name], 0, 1_000_000, `results.detections.byInput.${name}`);
    return total + report.results.detections.byInput[name];
  }, 0);
  requireEqual(report.results.detections.total, detectionSum, "results.detections.total");

  requireRecord(report.results.memoryBytes, "results.memoryBytes");
  requireExactKeys(
    report.results.memoryBytes,
    ["rssBeforeLoad", "rssAfterLoad", "rssAtEnd", "processPeakWorkingSet"],
    "results.memoryBytes",
  );
  for (const field of ["rssBeforeLoad", "rssAfterLoad", "rssAtEnd", "processPeakWorkingSet"]) {
    requireInteger(report.results.memoryBytes[field], 1_000_000, Number.MAX_SAFE_INTEGER, `results.memoryBytes.${field}`);
  }
  const peakInputs = [
    report.results.memoryBytes.rssBeforeLoad,
    report.results.memoryBytes.rssAfterLoad,
    report.results.memoryBytes.rssAtEnd,
  ];
  if (report.results.memoryBytes.processPeakWorkingSet < Math.max(...peakInputs)) {
    throw new Error("processPeakWorkingSet must cover every recorded RSS observation");
  }

  requireString(report.claimBoundary, "claimBoundary");
  for (const excludedClaim of ["accuracy", "identity stability", "live-camera latency", "action quality", "target hardware"]) {
    if (!report.claimBoundary.includes(excludedClaim)) {
      throw new Error(`claimBoundary must explicitly exclude ${excludedClaim}`);
    }
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 8) {
    throw new Error("limitations must contain at least eight explicit entries");
  }
  report.limitations.forEach((value, index) => requireString(value, `limitations[${index}]`));
}

export function validatePoseBackendComparison(reports, expectedDigests) {
  if (!Array.isArray(reports) || reports.length !== 2) throw new Error("comparison requires exactly two reports");
  reports.forEach((report) => validatePoseBackendReport(report, expectedDigests));
  const byName = new Map(reports.map((report) => [report.backend.name, report]));
  if (byName.size !== 2 || !byName.has("rtmo-s") || !byName.has("mediapipe-pose-landmarker-lite")) {
    throw new Error("comparison requires exactly one RTMO-s and one MediaPipe Lite report");
  }
  const rtmo = byName.get("rtmo-s");
  const mediapipe = byName.get("mediapipe-pose-landmarker-lite");
  for (const field of ["sourceCommit", "implementationSha256", "dependencyLockSha256"]) {
    requireEqual(rtmo[field], mediapipe[field], `cross-report ${field}`);
  }
  requireEqual(JSON.stringify(rtmo.environment), JSON.stringify(mediapipe.environment), "cross-report environment");
  requireEqual(JSON.stringify(rtmo.workload), JSON.stringify(mediapipe.workload), "cross-report workload");
}

export async function validateTrackedPoseBackendReports(root = repositoryRoot) {
  const implementation = await readFile(resolve(root, "experiments/rtmo/benchmark.py"));
  const lock = await readFile(resolve(root, "experiments/rtmo/uv.lock"));
  const expectedDigests = { implementation: sha256(implementation), lock: sha256(lock) };
  const reports = await Promise.all(
    expectedReports.map(async (repositoryPath) => JSON.parse(await readFile(resolve(root, repositoryPath), "utf8"))),
  );
  validatePoseBackendComparison(reports, expectedDigests);
  return reports;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedPoseBackendReports();
  console.log("validated 2 pinned pose-backend benchmark reports");
}
