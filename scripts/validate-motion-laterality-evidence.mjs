import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const strategies = [
  "trust-provider-names",
  "anatomical-axis-continuity-guard",
];
const labels = [
  "lean_left",
  "lean_right",
  "step_left",
  "step_right",
  "reach_left",
  "reach_right",
  "punch_left",
  "punch_right",
  "none",
  "blocked",
];
const categories = [
  ["clear-frontal", 8],
  ["full-anatomical-swap", 8],
  ["distal-only-swap", 6],
  ["mild-turn", 8],
  ["profile-ambiguity", 8],
  ["crossed-arms", 1],
  ["self-occlusion", 2],
];
const expectedTotals = [
  {
    scenarios: 41,
    exact: 15,
    wrongSide: 0,
    unsafeDirectionalEvents: 14,
    explicitAmbiguityBlocks: 0,
    silentAmbiguitySuppressions: 8,
    extraDirectionalEvents: 0,
    accuracy: 0.365854,
  },
  {
    scenarios: 41,
    exact: 31,
    wrongSide: 0,
    unsafeDirectionalEvents: 4,
    explicitAmbiguityBlocks: 16,
    silentAmbiguitySuppressions: 2,
    extraDirectionalEvents: 0,
    accuracy: 0.756098,
  },
];
const evaluationDigests = [
  "64ee198f2763f0fb480f1c76b62fc165308ed4dd41266c050c4edb84544d6b03",
  "fe2d18f59354b7e8e767eb112b7cc23fd025877979b7d8bbc7da7f97f3835974",
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
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
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

function validateSuite(suite) {
  requireRecord(suite, "suite");
  requireExactKeys(
    suite,
    [
      "version",
      "serializedSuiteSha256",
      "containsRawFrames",
      "source",
      "scenarioCount",
      "updateCount",
      "categories",
    ],
    "suite",
  );
  requireEqual(
    suite.version,
    "core17-laterality-adversarial/v1",
    "suite.version",
  );
  requireEqual(
    suite.serializedSuiteSha256,
    "fead2cd57accb27d17d7a1da6798effa139a13490d17960e08ccc69ef9b1221e",
    "suite.serializedSuiteSha256",
  );
  requireEqual(suite.containsRawFrames, false, "suite.containsRawFrames");
  requireEqual(
    suite.source,
    "deterministic generated normalized core17 adversarial transformations",
    "suite.source",
  );
  requireEqual(suite.scenarioCount, 41, "suite.scenarioCount");
  requireEqual(suite.updateCount, 1_524, "suite.updateCount");
  if (!Array.isArray(suite.categories) || suite.categories.length !== 7) {
    throw new Error("suite.categories must contain exactly seven categories");
  }
  suite.categories.forEach((category, index) => {
    const name = `suite.categories[${index}]`;
    requireRecord(category, name);
    requireExactKeys(category, ["category", "count"], name);
    requireEqual(category.category, categories[index][0], `${name}.category`);
    requireEqual(category.count, categories[index][1], `${name}.count`);
  });
}

function validateMethod(method) {
  requireRecord(method, "method");
  requireExactKeys(
    method,
    [
      "strategies",
      "guardParameters",
      "warmupPasses",
      "measuredPasses",
      "latencyBoundary",
      "latencyTimer",
      "latencySummaryMethod",
      "truthVisibility",
      "ambiguityPolicy",
      "outputAuthority",
    ],
    "method",
  );
  requireEqual(
    JSON.stringify(method.strategies),
    JSON.stringify(strategies),
    "method.strategies",
  );
  requireRecord(method.guardParameters, "method.guardParameters");
  requireExactKeys(
    method.guardParameters,
    ["minimumAxisAlignment", "minimumWidthRatio"],
    "method.guardParameters",
  );
  requireEqual(
    method.guardParameters.minimumAxisAlignment,
    0.5,
    "method.guardParameters.minimumAxisAlignment",
  );
  requireEqual(
    method.guardParameters.minimumWidthRatio,
    0.35,
    "method.guardParameters.minimumWidthRatio",
  );
  requireEqual(method.warmupPasses, 5, "method.warmupPasses");
  requireEqual(method.measuredPasses, 50, "method.measuredPasses");
  requireEqual(
    method.latencyBoundary,
    "one strategy update over one pre-generated core17 skeleton",
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
    "expected prediction exists only in evaluator scenario metadata and is never passed to either strategy",
    "method.truthVisibility",
  );
  requireEqual(
    method.ambiguityPolicy,
    "never relabel left as right; emit an explicit block when named torso axes reverse, collapse, or disappear",
    "method.ambiguityPolicy",
  );
  requireEqual(
    method.outputAuthority,
    "research labels and suppression evidence only; no MotionAction wire or gameplay authority",
    "method.outputAuthority",
  );
}

function validateEvaluation(evaluation, strategyIndex) {
  const name = `results[${strategyIndex}].evaluation`;
  requireRecord(evaluation, name);
  requireExactKeys(
    evaluation,
    ["strategy", "scenarios", "confusionMatrix", "totals"],
    name,
  );
  requireEqual(evaluation.strategy, strategies[strategyIndex], `${name}.strategy`);
  if (!Array.isArray(evaluation.scenarios) || evaluation.scenarios.length !== 41) {
    throw new Error(`${name}.scenarios must contain exactly 41 scenarios`);
  }
  const seenIds = new Set();
  evaluation.scenarios.forEach((scenario, index) => {
    const scenarioName = `${name}.scenarios[${index}]`;
    requireRecord(scenario, scenarioName);
    requireExactKeys(
      scenario,
      [
        "id",
        "category",
        "expectedPrediction",
        "prediction",
        "emittedMovements",
        "blockedStatuses",
        "exact",
      ],
      scenarioName,
    );
    requireText(scenario.id, `${scenarioName}.id`);
    if (seenIds.has(scenario.id)) {
      throw new Error(`${name}.scenarios contains duplicate ${scenario.id}`);
    }
    seenIds.add(scenario.id);
    if (!categories.some(([category]) => category === scenario.category)) {
      throw new Error(`${scenarioName}.category is invalid`);
    }
    if (!labels.includes(scenario.expectedPrediction)) {
      throw new Error(`${scenarioName}.expectedPrediction is invalid`);
    }
    if (!labels.includes(scenario.prediction)) {
      throw new Error(`${scenarioName}.prediction is invalid`);
    }
    if (
      !Array.isArray(scenario.emittedMovements) ||
      scenario.emittedMovements.some(
        (movement) => !labels.slice(0, 8).includes(movement),
      )
    ) {
      throw new Error(`${scenarioName}.emittedMovements is invalid`);
    }
    if (
      !Array.isArray(scenario.blockedStatuses) ||
      scenario.blockedStatuses.some(
        (status) =>
          ![
            "blocked-missing-anchors",
            "blocked-axis-reversal",
            "blocked-foreshortened",
          ].includes(status),
      )
    ) {
      throw new Error(`${scenarioName}.blockedStatuses is invalid`);
    }
    requireEqual(
      scenario.exact,
      scenario.prediction === scenario.expectedPrediction,
      `${scenarioName}.exact`,
    );
  });

  requireRecord(evaluation.confusionMatrix, `${name}.confusionMatrix`);
  requireExactKeys(
    evaluation.confusionMatrix,
    labels,
    `${name}.confusionMatrix`,
  );
  let matrixTotal = 0;
  for (const truth of labels) {
    const row = evaluation.confusionMatrix[truth];
    requireRecord(row, `${name}.confusionMatrix.${truth}`);
    requireExactKeys(row, labels, `${name}.confusionMatrix.${truth}`);
    for (const prediction of labels) {
      requireInteger(
        row[prediction],
        0,
        41,
        `${name}.confusionMatrix.${truth}.${prediction}`,
      );
      matrixTotal += row[prediction];
    }
  }
  requireEqual(matrixTotal, 41, `${name}.confusionMatrix total`);

  requireRecord(evaluation.totals, `${name}.totals`);
  requireExactKeys(
    evaluation.totals,
    Object.keys(expectedTotals[strategyIndex]),
    `${name}.totals`,
  );
  for (const [field, value] of Object.entries(
    expectedTotals[strategyIndex],
  )) {
    requireEqual(evaluation.totals[field], value, `${name}.totals.${field}`);
  }
  requireEqual(
    sha256(Buffer.from(JSON.stringify(evaluation), "utf8")),
    evaluationDigests[strategyIndex],
    `${name} SHA-256`,
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
      "measuredThroughputUpdatesPerSecond",
    ],
    name,
  );
  requireEqual(latency.samples, 76_200, `${name}.samples`);
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
    throw new Error(`${name} percentiles must be monotonic`);
  }
  requireNumber(
    latency.measuredThroughputUpdatesPerSecond,
    0.001,
    100_000_000,
    `${name}.measuredThroughputUpdatesPerSecond`,
  );
}

export function validateMotionLateralityEvidence(report, expectedDigests) {
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
      "guardVersion",
      "implementation",
      "environment",
      "suite",
      "method",
      "results",
      "findings",
      "claimBoundary",
      "limitations",
    ],
    "report",
  );
  requireEqual(report.format, "vcg-motion-laterality-evidence", "format");
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
  requireEqual(
    report.guardVersion,
    "anatomical-axis-continuity/v1",
    "guardVersion",
  );

  requireRecord(report.implementation, "implementation");
  requireExactKeys(
    report.implementation,
    ["guardSha256", "suiteSha256", "benchmarkSha256"],
    "implementation",
  );
  for (const field of ["guardSha256", "suiteSha256", "benchmarkSha256"]) {
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

  validateSuite(report.suite);
  validateMethod(report.method);
  if (!Array.isArray(report.results) || report.results.length !== 2) {
    throw new Error("results must contain exactly two strategies");
  }
  report.results.forEach((result, index) => {
    const name = `results[${index}]`;
    requireRecord(result, name);
    requireExactKeys(
      result,
      ["strategy", "evaluation", "latencyMicroseconds"],
      name,
    );
    requireEqual(result.strategy, strategies[index], `${name}.strategy`);
    validateEvaluation(result.evaluation, index);
    validateLatency(result.latencyMicroseconds, `${name}.latencyMicroseconds`);
  });

  requireRecord(report.findings, "findings");
  const expectedFindings = {
    exactScenariosBefore: 15,
    exactScenariosAfter: 31,
    unsafeDirectionalEventsBefore: 14,
    unsafeDirectionalEventsAfter: 4,
    fullSwapExplicitBlocks: 8,
    profileExplicitBlocks: 8,
    distalSwapUnsafeDirectionalEvents: 4,
    distalSwapSilentSuppressions: 2,
    mildTurnMisses: 4,
    selfOcclusionExact: 2,
  };
  requireExactKeys(
    report.findings,
    Object.keys(expectedFindings),
    "findings",
  );
  for (const [field, value] of Object.entries(expectedFindings)) {
    requireEqual(report.findings[field], value, `findings.${field}`);
  }

  requireText(report.claimBoundary, "claimBoundary");
  for (const phrase of [
    "Camera-free",
    "provider anatomical consistency",
    "real turns or self-occlusion",
    "backend parity",
    "camera latency",
    "target hardware",
  ]) {
    if (!report.claimBoundary.includes(phrase)) {
      throw new Error(`claimBoundary must explicitly address ${phrase}`);
    }
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 11) {
    throw new Error("limitations must contain at least eleven entries");
  }
  report.limitations.forEach((limitation, index) =>
    requireText(limitation, `limitations[${index}]`),
  );
}

export async function validateTrackedMotionLateralityEvidence(
  root = repositoryRoot,
) {
  const [reportBytes, guard, suite, benchmark] = await Promise.all([
    readFile(
      resolve(
        root,
        "benchmarks/laterality/windows-x64-synthetic-laterality-v1.json",
      ),
    ),
    readFile(resolve(root, "packages/motion-contract/src/laterality-guard.ts")),
    readFile(
      resolve(root, "packages/motion-contract/src/laterality-benchmark.ts"),
    ),
    readFile(resolve(root, "scripts/benchmark-motion-laterality.mjs")),
  ]);
  const expectedDigests = {
    guardSha256: sha256(guard),
    suiteSha256: sha256(suite),
    benchmarkSha256: sha256(benchmark),
  };
  const report = JSON.parse(reportBytes);
  validateMotionLateralityEvidence(report, expectedDigests);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedMotionLateralityEvidence();
  console.log("validated pinned synthetic Motion laterality evidence");
}
