import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const reportPath = resolve(
  repositoryRoot,
  "benchmarks",
  "identity-tracking",
  "windows-x64-synthetic-appearance-free-v1.json",
);
const algorithms = [
  "nearest-centroid",
  "kalman-centroid",
  "oks",
  "kalman-oks-hybrid",
  "two-stage-kalman-iou",
];
const scenarios = [
  ["two-player-linear-crossing", 61, 122],
  ["brief-central-occlusion", 70, 135],
  ["crossing-confidence-dip", 64, 128],
  ["fast-direction-reversal", 72, 144],
  ["long-exit-and-reentry", 85, 142],
  ["three-player-braided-crossing", 76, 228],
];
const metricKeys = [
  "visibleTruthObservations",
  "assignedObservations",
  "missedAssignments",
  "idSwitches",
  "falseTrackTransfers",
  "assignmentFragmentations",
  "distinctTracks",
  "identityCorrectAssignments",
  "idPrecision",
  "idRecall",
  "idF1",
];

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
  if (actual !== expected) {
    throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be non-empty text`);
  }
}

function requireNumber(value, minimum, maximum, name) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be a finite number between ${minimum} and ${maximum}`,
    );
  }
}

function requireInteger(value, minimum, maximum, name) {
  requireNumber(value, minimum, maximum, name);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function roundedRate(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

function roundedF1(correct, assigned, visible) {
  const denominator = assigned + visible;
  if (denominator === 0) return 0;
  return Math.round(((2 * correct) / denominator) * 1_000_000) / 1_000_000;
}

export function validateIdentityTrackerComparison(report, expectedDigests) {
  requireRecord(report, "report");
  requireExactKeys(
    report,
    [
      "format",
      "formatVersion",
      "generatedAt",
      "sourceCommit",
      "workingTreeClean",
      "motionApiSchemaVersion",
      "implementation",
      "environment",
      "suite",
      "method",
      "results",
      "claimBoundary",
      "limitations",
    ],
    "report",
  );
  requireEqual(report.format, "vcg-identity-tracker-comparison", "format");
  requireEqual(report.formatVersion, 1, "formatVersion");
  if (
    typeof report.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(report.generatedAt))
  ) {
    throw new Error("generatedAt must be an ISO date-time");
  }
  if (
    typeof report.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(report.sourceCommit)
  ) {
    throw new Error("sourceCommit must be a lowercase Git commit");
  }
  if (typeof report.workingTreeClean !== "boolean") {
    throw new Error("workingTreeClean must be boolean");
  }
  requireEqual(report.motionApiSchemaVersion, "0.4.0", "motionApiSchemaVersion");

  requireRecord(report.implementation, "implementation");
  requireExactKeys(
    report.implementation,
    ["trackerSha256", "suiteSha256", "benchmarkSha256"],
    "implementation",
  );
  for (const field of ["trackerSha256", "suiteSha256", "benchmarkSha256"]) {
    requireSha256(report.implementation[field], `implementation.${field}`);
    requireEqual(
      report.implementation[field],
      expectedDigests[field],
      `implementation.${field}`,
    );
  }

  requireRecord(report.environment, "environment");
  requireExactKeys(
    report.environment,
    ["platform", "architecture", "node"],
    "environment",
  );
  requireEqual(report.environment.platform, "win32", "environment.platform");
  requireEqual(report.environment.architecture, "x64", "environment.architecture");
  if (
    typeof report.environment.node !== "string" ||
    !/^v24\.\d+\.\d+$/.test(report.environment.node)
  ) {
    throw new Error("environment.node must identify a Node 24 patch release");
  }

  requireRecord(report.suite, "suite");
  requireExactKeys(
    report.suite,
    [
      "version",
      "serializedScenarioSha256",
      "containsRawFrames",
      "source",
      "scenarios",
    ],
    "suite",
  );
  requireEqual(
    report.suite.version,
    "appearance-free-identity-synthetic/v1",
    "suite.version",
  );
  requireEqual(
    report.suite.serializedScenarioSha256,
    "1276dffb126f3182bfce942985f7b02cd9f92d056ab8e55fd8196e5fb8bf227d",
    "suite.serializedScenarioSha256",
  );
  requireEqual(report.suite.containsRawFrames, false, "suite.containsRawFrames");
  requireEqual(
    report.suite.source,
    "deterministic generated normalized core17 skeletons",
    "suite.source",
  );
  if (!Array.isArray(report.suite.scenarios) || report.suite.scenarios.length !== scenarios.length) {
    throw new Error("suite.scenarios must contain the exact six scenarios");
  }
  report.suite.scenarios.forEach((scenario, index) => {
    const expected = scenarios[index];
    const name = `suite.scenarios[${index}]`;
    requireRecord(scenario, name);
    requireExactKeys(
      scenario,
      ["id", "description", "framesPerSecond", "frameCount", "visibleTruthObservations"],
      name,
    );
    requireEqual(scenario.id, expected[0], `${name}.id`);
    requireText(scenario.description, `${name}.description`);
    requireEqual(scenario.framesPerSecond, 30, `${name}.framesPerSecond`);
    requireEqual(scenario.frameCount, expected[1], `${name}.frameCount`);
    requireEqual(
      scenario.visibleTruthObservations,
      expected[2],
      `${name}.visibleTruthObservations`,
    );
  });

  validateMethod(report.method);
  if (!Array.isArray(report.results) || report.results.length !== algorithms.length) {
    throw new Error("results must contain exactly five algorithms");
  }
  report.results.forEach((result, index) =>
    validateResult(result, algorithms[index], index),
  );

  requireText(report.claimBoundary, "claimBoundary");
  for (const phrase of [
    "Camera-free",
    "real-player identity",
    "camera latency",
    "target hardware",
    "upstream ByteTrack",
  ]) {
    if (!report.claimBoundary.includes(phrase)) {
      throw new Error(`claimBoundary must explicitly address ${phrase}`);
    }
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 8) {
    throw new Error("limitations must contain at least eight explicit entries");
  }
  report.limitations.forEach((limitation, index) =>
    requireText(limitation, `limitations[${index}]`),
  );
}

function validateMethod(method) {
  requireRecord(method, "method");
  requireExactKeys(
    method,
    [
      "maxTracks",
      "maxMissedFrames",
      "maxAssociationDistance",
      "minimumDetectionConfidence",
      "highConfidenceThreshold",
      "minimumOks",
      "warmupPasses",
      "measuredPasses",
      "latencyBoundary",
      "latencyTimer",
      "latencySummaryMethod",
      "truthVisibility",
    ],
    "method",
  );
  requireEqual(method.maxTracks, 4, "method.maxTracks");
  requireEqual(method.maxMissedFrames, 6, "method.maxMissedFrames");
  requireEqual(method.maxAssociationDistance, 0.22, "method.maxAssociationDistance");
  requireEqual(method.minimumDetectionConfidence, 0.1, "method.minimumDetectionConfidence");
  requireEqual(method.highConfidenceThreshold, 0.6, "method.highConfidenceThreshold");
  requireEqual(method.minimumOks, 0.15, "method.minimumOks");
  requireEqual(method.warmupPasses, 10, "method.warmupPasses");
  requireEqual(method.measuredPasses, 100, "method.measuredPasses");
  requireEqual(
    method.latencyBoundary,
    "one tracker update over pre-generated detections",
    "method.latencyBoundary",
  );
  requireEqual(method.latencyTimer, "node-performance-now", "method.latencyTimer");
  requireEqual(
    method.latencySummaryMethod,
    "linear-interpolation-r7",
    "method.latencySummaryMethod",
  );
  requireEqual(
    method.truthVisibility,
    "truthId exists only in evaluator frames and is stripped before every tracker update",
    "method.truthVisibility",
  );
}

function validateResult(result, expectedAlgorithm, index) {
  const name = `results[${index}]`;
  requireRecord(result, name);
  requireExactKeys(
    result,
    ["algorithm", "classification", "metrics", "latencyMicroseconds"],
    name,
  );
  requireEqual(result.algorithm, expectedAlgorithm, `${name}.algorithm`);
  requireText(result.classification, `${name}.classification`);
  if (
    expectedAlgorithm === "two-stage-kalman-iou" &&
    !result.classification.includes("not the upstream ByteTrack implementation")
  ) {
    throw new Error(`${name}.classification must reject a full ByteTrack claim`);
  }
  validateMetrics(result.metrics, expectedAlgorithm, `${name}.metrics`);
  validateLatency(result.latencyMicroseconds, `${name}.latencyMicroseconds`);
}

function validateMetrics(metrics, algorithm, name) {
  requireRecord(metrics, name);
  requireExactKeys(metrics, ["algorithm", "totals", "scenarios"], name);
  requireEqual(metrics.algorithm, algorithm, `${name}.algorithm`);
  if (!Array.isArray(metrics.scenarios) || metrics.scenarios.length !== scenarios.length) {
    throw new Error(`${name}.scenarios must contain the exact six scenarios`);
  }
  metrics.scenarios.forEach((metric, index) => {
    requireRecord(metric, `${name}.scenarios[${index}]`);
    requireExactKeys(
      metric,
      ["scenarioId", ...metricKeys],
      `${name}.scenarios[${index}]`,
    );
    requireEqual(
      metric.scenarioId,
      scenarios[index][0],
      `${name}.scenarios[${index}].scenarioId`,
    );
    validateMetricValues(metric, `${name}.scenarios[${index}]`);
    requireEqual(
      metric.visibleTruthObservations,
      scenarios[index][2],
      `${name}.scenarios[${index}].visibleTruthObservations`,
    );
  });
  requireRecord(metrics.totals, `${name}.totals`);
  requireExactKeys(metrics.totals, metricKeys, `${name}.totals`);
  validateMetricValues(metrics.totals, `${name}.totals`);
  for (const field of metricKeys.slice(0, 8)) {
    const total = metrics.scenarios.reduce(
      (sum, scenario) => sum + scenario[field],
      0,
    );
    requireEqual(metrics.totals[field], total, `${name}.totals.${field}`);
  }
  requireEqual(
    metrics.totals.visibleTruthObservations,
    899,
    `${name}.totals.visibleTruthObservations`,
  );
}

function validateMetricValues(metric, name) {
  for (const field of metricKeys.slice(0, 8)) {
    requireInteger(metric[field], 0, 100_000, `${name}.${field}`);
  }
  for (const field of ["idPrecision", "idRecall", "idF1"]) {
    requireNumber(metric[field], 0, 1, `${name}.${field}`);
  }
  requireEqual(
    metric.missedAssignments,
    metric.visibleTruthObservations - metric.assignedObservations,
    `${name}.missedAssignments`,
  );
  if (metric.identityCorrectAssignments > metric.assignedObservations) {
    throw new Error(`${name}.identityCorrectAssignments exceeds assignments`);
  }
  requireEqual(
    metric.idPrecision,
    roundedRate(
      metric.identityCorrectAssignments,
      metric.assignedObservations,
    ),
    `${name}.idPrecision`,
  );
  requireEqual(
    metric.idRecall,
    roundedRate(
      metric.identityCorrectAssignments,
      metric.visibleTruthObservations,
    ),
    `${name}.idRecall`,
  );
  requireEqual(
    metric.idF1,
    roundedF1(
      metric.identityCorrectAssignments,
      metric.assignedObservations,
      metric.visibleTruthObservations,
    ),
    `${name}.idF1`,
  );
}

function validateLatency(latency, name) {
  requireRecord(latency, name);
  requireExactKeys(
    latency,
    [
      "samples",
      "mean",
      "p50",
      "p95",
      "p99",
      "worst",
      "measuredThroughputFramesPerSecond",
    ],
    name,
  );
  requireEqual(latency.samples, 42_800, `${name}.samples`);
  for (const field of ["mean", "p50", "p95", "p99", "worst"]) {
    requireNumber(latency[field], 0.001, 1_000_000, `${name}.${field}`);
  }
  if (!(latency.p50 <= latency.p95 && latency.p95 <= latency.p99 && latency.p99 <= latency.worst)) {
    throw new Error(`${name} percentiles must be monotonic through worst`);
  }
  requireNumber(
    latency.measuredThroughputFramesPerSecond,
    0.001,
    100_000_000,
    `${name}.measuredThroughputFramesPerSecond`,
  );
}

export async function validateTrackedIdentityTrackerComparison(
  root = repositoryRoot,
) {
  const [reportBytes, tracker, suite, benchmark] = await Promise.all([
    readFile(resolve(root, "benchmarks/identity-tracking/windows-x64-synthetic-appearance-free-v1.json")),
    readFile(resolve(root, "packages/motion-contract/src/identity-tracking.ts")),
    readFile(resolve(root, "packages/motion-contract/src/identity-benchmark.ts")),
    readFile(resolve(root, "scripts/benchmark-identity-trackers.mjs")),
  ]);
  const expectedDigests = {
    trackerSha256: sha256(tracker),
    suiteSha256: sha256(suite),
    benchmarkSha256: sha256(benchmark),
  };
  const report = JSON.parse(reportBytes);
  validateIdentityTrackerComparison(report, expectedDigests);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedIdentityTrackerComparison();
  console.log("validated pinned synthetic identity-tracker comparison");
}
