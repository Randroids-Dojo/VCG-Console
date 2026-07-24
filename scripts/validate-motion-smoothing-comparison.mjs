import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const reportPath = resolve(
  repositoryRoot,
  "benchmarks",
  "smoothing",
  "windows-x64-synthetic-smoothing-v1.json",
);
const algorithms = ["passthrough", "ema", "one-euro", "kalman"];
const scenarios = [
  ["static-jitter", 300, 0],
  ["step", 180, 0],
  ["ramp", 240, 0],
  ["reversal", 240, 0],
  ["dropout", 180, 8],
];
const expectedMetrics = {
  passthrough: {
    overallRmsError: 0.005071,
    static: {
      rmsError: 0.009029,
      p95AbsoluteError: 0.013084,
      outputDeltaRms: 0.012425,
    },
    step: {
      rmsError: 0.001291,
      response90Milliseconds: 0,
      overshoot: 0.001885,
    },
    ramp: { rmsError: 0.002582, meanSignedXError: 0.000004 },
    reversal: { rmsError: 0.002582, maximumAbsoluteError: 0.004137 },
    dropout: {
      rmsError: 0.002582,
      missingOutputCount: 8,
      reacquisitionAbsoluteError: 0.002939,
      postReacquisitionRmsError: 0.002584,
    },
  },
  ema: {
    overallRmsError: 0.011697,
    static: {
      rmsError: 0.003678,
      p95AbsoluteError: 0.005609,
      outputDeltaRms: 0.003597,
    },
    step: {
      rmsError: 0.025517,
      response90Milliseconds: 83.333333,
      overshoot: 0.000765,
    },
    ramp: { rmsError: 0.004738, meanSignedXError: -0.004583 },
    reversal: { rmsError: 0.009208, maximumAbsoluteError: 0.010829 },
    dropout: {
      rmsError: 0.006766,
      missingOutputCount: 8,
      reacquisitionAbsoluteError: 0.024156,
      postReacquisitionRmsError: 0.011775,
    },
  },
  "one-euro": {
    overallRmsError: 0.01551,
    static: {
      rmsError: 0.001687,
      p95AbsoluteError: 0.002064,
      outputDeltaRms: 0.00108,
    },
    step: {
      rmsError: 0.016943,
      response90Milliseconds: 50,
      overshoot: 0.000252,
    },
    ramp: { rmsError: 0.014727, meanSignedXError: -0.014584 },
    reversal: { rmsError: 0.021879, maximumAbsoluteError: 0.027542 },
    dropout: {
      rmsError: 0.017526,
      missingOutputCount: 8,
      reacquisitionAbsoluteError: 0.018271,
      postReacquisitionRmsError: 0.017893,
    },
  },
  kalman: {
    overallRmsError: 0.069022,
    static: {
      rmsError: 0.001579,
      p95AbsoluteError: 0.003416,
      outputDeltaRms: 0.001215,
    },
    step: {
      rmsError: 0.100393,
      response90Milliseconds: 383.333333,
      overshoot: 0.113049,
    },
    ramp: { rmsError: 0.000549, meanSignedXError: -0.000104 },
    reversal: { rmsError: 0.122096, maximumAbsoluteError: 0.211892 },
    dropout: {
      rmsError: 0.000701,
      missingOutputCount: 8,
      reacquisitionAbsoluteError: 0.000445,
      postReacquisitionRmsError: 0.000459,
    },
  },
};

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

function requireSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateMetrics(metrics, expected, name) {
  requireRecord(metrics, name);
  requireExactKeys(
    metrics,
    ["overallRmsError", "static", "step", "ramp", "reversal", "dropout"],
    name,
  );
  requireEqual(metrics.overallRmsError, expected.overallRmsError, `${name}.overallRmsError`);
  const shapes = {
    static: ["rmsError", "p95AbsoluteError", "outputDeltaRms"],
    step: ["rmsError", "response90Milliseconds", "overshoot"],
    ramp: ["rmsError", "meanSignedXError"],
    reversal: ["rmsError", "maximumAbsoluteError"],
    dropout: [
      "rmsError",
      "missingOutputCount",
      "reacquisitionAbsoluteError",
      "postReacquisitionRmsError",
    ],
  };
  for (const [section, fields] of Object.entries(shapes)) {
    requireRecord(metrics[section], `${name}.${section}`);
    requireExactKeys(metrics[section], fields, `${name}.${section}`);
    for (const field of fields) {
      requireEqual(
        metrics[section][field],
        expected[section][field],
        `${name}.${section}.${field}`,
      );
    }
  }
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
      "measuredThroughputUpdatesPerSecond",
    ],
    name,
  );
  requireEqual(latency.samples, 114_000, `${name}.samples`);
  for (const field of ["mean", "p50", "p95", "p99", "worst"]) {
    requireNumber(latency[field], 0.001, 1_000_000, `${name}.${field}`);
  }
  if (
    !(
      latency.p50 <= latency.p95 &&
      latency.p95 <= latency.p99 &&
      latency.p99 <= latency.worst
    )
  ) {
    throw new Error(`${name} percentiles must be monotonic through worst`);
  }
  requireNumber(
    latency.measuredThroughputUpdatesPerSecond,
    0.001,
    100_000_000,
    `${name}.measuredThroughputUpdatesPerSecond`,
  );
}

export function validateMotionSmoothingComparison(report, expectedDigests) {
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
      "backendNative",
      "claimBoundary",
      "limitations",
    ],
    "report",
  );
  requireEqual(report.format, "vcg-motion-smoothing-comparison", "format");
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
    ["smootherSha256", "suiteSha256", "benchmarkSha256"],
    "implementation",
  );
  for (const field of [
    "smootherSha256",
    "suiteSha256",
    "benchmarkSha256",
  ]) {
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
    "normalized-point-smoothing-synthetic/v1",
    "suite.version",
  );
  requireEqual(
    report.suite.serializedScenarioSha256,
    "3f8603ae1f21409d4c6d29e1475265c2b67981235d6ec0c2d47811015c8a6e6a",
    "suite.serializedScenarioSha256",
  );
  requireEqual(report.suite.containsRawFrames, false, "suite.containsRawFrames");
  requireEqual(
    report.suite.source,
    "deterministic generated normalized two-dimensional points",
    "suite.source",
  );
  if (
    !Array.isArray(report.suite.scenarios) ||
    report.suite.scenarios.length !== scenarios.length
  ) {
    throw new Error("suite.scenarios must contain exactly five scenarios");
  }
  report.suite.scenarios.forEach((scenario, index) => {
    const expected = scenarios[index];
    const name = `suite.scenarios[${index}]`;
    requireRecord(scenario, name);
    requireExactKeys(
      scenario,
      [
        "id",
        "description",
        "framesPerSecond",
        "frameCount",
        "missingObservationCount",
      ],
      name,
    );
    requireEqual(scenario.id, expected[0], `${name}.id`);
    requireText(scenario.description, `${name}.description`);
    requireEqual(scenario.framesPerSecond, 60, `${name}.framesPerSecond`);
    requireEqual(scenario.frameCount, expected[1], `${name}.frameCount`);
    requireEqual(
      scenario.missingObservationCount,
      expected[2],
      `${name}.missingObservationCount`,
    );
  });

  validateMethod(report.method);
  if (!Array.isArray(report.results) || report.results.length !== algorithms.length) {
    throw new Error("results must contain exactly four algorithms");
  }
  report.results.forEach((result, index) => {
    const algorithm = algorithms[index];
    const name = `results[${index}]`;
    requireRecord(result, name);
    requireExactKeys(
      result,
      ["algorithm", "classification", "metrics", "latencyMicroseconds"],
      name,
    );
    requireEqual(result.algorithm, algorithm, `${name}.algorithm`);
    requireText(result.classification, `${name}.classification`);
    validateMetrics(result.metrics, expectedMetrics[algorithm], `${name}.metrics`);
    validateLatency(result.latencyMicroseconds, `${name}.latencyMicroseconds`);
  });

  requireRecord(report.backendNative, "backendNative");
  requireExactKeys(
    report.backendNative,
    ["status", "reason", "evidenceRequired"],
    "backendNative",
  );
  requireEqual(
    report.backendNative.status,
    "unmeasured-no-comparable-backend-series",
    "backendNative.status",
  );
  requireText(report.backendNative.reason, "backendNative.reason");
  if (
    !Array.isArray(report.backendNative.evidenceRequired) ||
    report.backendNative.evidenceRequired.length !== 3
  ) {
    throw new Error("backendNative.evidenceRequired must contain exactly three entries");
  }
  report.backendNative.evidenceRequired.forEach((entry, index) =>
    requireText(entry, `backendNative.evidenceRequired[${index}]`),
  );
  requireText(report.claimBoundary, "claimBoundary");
  for (const phrase of [
    "Camera-free",
    "perceived gameplay quality",
    "native backend smoothing",
    "camera latency",
    "target hardware",
    "real players",
  ]) {
    if (!report.claimBoundary.includes(phrase)) {
      throw new Error(`claimBoundary must explicitly address ${phrase}`);
    }
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 9) {
    throw new Error("limitations must contain at least nine explicit entries");
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
      "defaultParameters",
      "warmupPasses",
      "measuredPasses",
      "latencyBoundary",
      "latencyTimer",
      "latencySummaryMethod",
      "truthVisibility",
      "missingObservationPolicy",
    ],
    "method",
  );
  requireEqual(method.warmupPasses, 10, "method.warmupPasses");
  requireEqual(method.measuredPasses, 100, "method.measuredPasses");
  requireEqual(
    method.latencyBoundary,
    "one smoother update over one pre-generated point",
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
    "truth coordinates exist only in evaluator frames and are stripped before every smoother update",
    "method.truthVisibility",
  );
  requireEqual(
    method.missingObservationPolicy,
    "missing observations produce no point; state resets after a gap longer than maxGapMs",
    "method.missingObservationPolicy",
  );
  requireRecord(method.defaultParameters, "method.defaultParameters");
  const expected = {
    maxGapMs: 250,
    emaAlpha: 0.35,
    oneEuroMinCutoffHz: 1,
    oneEuroBeta: 4,
    oneEuroDerivativeCutoffHz: 1,
    kalmanProcessVariance: 0.002,
    kalmanMeasurementVariance: 0.001,
  };
  requireExactKeys(
    method.defaultParameters,
    Object.keys(expected),
    "method.defaultParameters",
  );
  for (const [field, value] of Object.entries(expected)) {
    requireEqual(
      method.defaultParameters[field],
      value,
      `method.defaultParameters.${field}`,
    );
  }
}

export async function validateTrackedMotionSmoothingComparison(
  root = repositoryRoot,
) {
  const [reportBytes, smoother, suite, benchmark] = await Promise.all([
    readFile(
      resolve(
        root,
        "benchmarks/smoothing/windows-x64-synthetic-smoothing-v1.json",
      ),
    ),
    readFile(resolve(root, "packages/motion-contract/src/smoothing.ts")),
    readFile(
      resolve(root, "packages/motion-contract/src/smoothing-benchmark.ts"),
    ),
    readFile(resolve(root, "scripts/benchmark-motion-smoothing.mjs")),
  ]);
  const expectedDigests = {
    smootherSha256: sha256(smoother),
    suiteSha256: sha256(suite),
    benchmarkSha256: sha256(benchmark),
  };
  const report = JSON.parse(reportBytes);
  validateMotionSmoothingComparison(report, expectedDigests);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedMotionSmoothingComparison();
  console.log("validated pinned synthetic motion-smoothing comparison");
}
