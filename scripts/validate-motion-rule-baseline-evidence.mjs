import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureIds = [
  "adult-standing",
  "child-standing",
  "tall-standing",
  "seated-exploratory",
  "limited-range-exploratory",
];
const movements = [
  "jump",
  "squat",
  "lean_left",
  "lean_right",
  "step_left",
  "step_right",
  "reach_left",
  "reach_right",
  "punch_left",
  "punch_right",
];
const trialIds = [
  ...movements,
  "neutral",
  "global-upward-shift",
  "global-left-translation",
  "global-right-translation",
  "crossed-arms",
  "wrist-occlusion",
];
const fixtureExpectations = [
  [10, 10, 1, 0.909091, 1],
  [10, 10, 1, 0.909091, 1],
  [10, 10, 1, 0.909091, 1],
  [6, 6, 1, 0.857143, 1],
  [10, 2, 1, 0.666667, 0.2],
];
const expectedEvaluationSha256 =
  "eb9cf2e852f66f2d79d953f173bedc6234f284acb06597c4fb7f335c653a78ff";
const expectedThresholds = {
  jumpEnterBodyHeights: 0.08,
  jumpExitBodyHeights: 0.04,
  squatEnterBodyHeights: 0.1,
  squatExitBodyHeights: 0.06,
  leanEnterShoulderWidths: 0.3,
  leanExitShoulderWidths: 0.18,
  stepEnterShoulderWidths: 0.45,
  stepExitShoulderWidths: 0.25,
  reachEnterTorsoLengths: 0.55,
  reachExitTorsoLengths: 0.35,
  punchMinimumExtensionGainTorsoLengths: 0.12,
  punchMinimumExtensionRateTorsoLengthsPerSecond: 1.8,
  minimumLandmarkConfidence: 0.5,
  cooldownMs: 500,
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

function roundedRate(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
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
      "updateCount",
      "fixtures",
    ],
    "suite",
  );
  requireEqual(
    suite.version,
    "core17-rule-baseline-synthetic/v1",
    "suite.version",
  );
  requireEqual(
    suite.serializedSuiteSha256,
    "808a3fa144065043dd3d3d90eb6373e5c0db3dab3aa30787596867ed789b5421",
    "suite.serializedSuiteSha256",
  );
  requireEqual(suite.containsRawFrames, false, "suite.containsRawFrames");
  requireEqual(
    suite.source,
    "deterministic generated normalized core17 skeleton-shape fixtures",
    "suite.source",
  );
  requireEqual(suite.updateCount, 2_810, "suite.updateCount");
  if (!Array.isArray(suite.fixtures) || suite.fixtures.length !== 5) {
    throw new Error("suite.fixtures must contain exactly five fixtures");
  }
  suite.fixtures.forEach((fixture, index) => {
    const name = `suite.fixtures[${index}]`;
    requireRecord(fixture, name);
    requireExactKeys(
      fixture,
      [
        "id",
        "description",
        "evidenceClass",
        "calibrationSampleCount",
        "trialCount",
        "frameCount",
        "expectedEventTrials",
        "noEventTrials",
        "unavailableTrials",
      ],
      name,
    );
    requireEqual(fixture.id, fixtureIds[index], `${name}.id`);
    requireText(fixture.description, `${name}.description`);
    requireEqual(
      fixture.evidenceClass,
      index < 3 ? "blocking-shape-fixture" : "exploratory-shape-fixture",
      `${name}.evidenceClass`,
    );
    requireEqual(fixture.calibrationSampleCount, 24, `${name}.calibrationSampleCount`);
    requireEqual(fixture.trialCount, 16, `${name}.trialCount`);
    requireEqual(fixture.frameCount, 562, `${name}.frameCount`);
    requireEqual(
      fixture.expectedEventTrials,
      fixtureExpectations[index][0],
      `${name}.expectedEventTrials`,
    );
    requireEqual(fixture.noEventTrials, 6, `${name}.noEventTrials`);
    requireEqual(
      fixture.unavailableTrials,
      index === 3 ? 4 : 0,
      `${name}.unavailableTrials`,
    );
  });
}

function validateMethod(method) {
  requireRecord(method, "method");
  requireExactKeys(
    method,
    [
      "thresholds",
      "calibrationSamples",
      "warmupPasses",
      "measuredPasses",
      "latencyBoundary",
      "latencyTimer",
      "latencySummaryMethod",
      "truthVisibility",
      "missingLandmarkPolicy",
      "outputAuthority",
    ],
    "method",
  );
  requireRecord(method.thresholds, "method.thresholds");
  requireExactKeys(
    method.thresholds,
    Object.keys(expectedThresholds),
    "method.thresholds",
  );
  for (const [key, value] of Object.entries(expectedThresholds)) {
    requireEqual(method.thresholds[key], value, `method.thresholds.${key}`);
  }
  requireEqual(method.calibrationSamples, 24, "method.calibrationSamples");
  requireEqual(method.warmupPasses, 10, "method.warmupPasses");
  requireEqual(method.measuredPasses, 100, "method.measuredPasses");
  requireEqual(
    method.latencyBoundary,
    "one rule-recognizer update over one pre-generated core17 skeleton",
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
    "expected movement exists only in evaluator trial metadata and is never passed to the recognizer",
    "method.truthVisibility",
  );
  requireEqual(
    method.missingLandmarkPolicy,
    "a missing or below-confidence required landmark suppresses and releases only affected rules",
    "method.missingLandmarkPolicy",
  );
  requireEqual(
    method.outputAuthority,
    "exploratory research labels only; no MotionAction wire event or gameplay authority",
    "method.outputAuthority",
  );
}

function validateMapping(mapping) {
  requireRecord(mapping, "mappingBoundary");
  requireExactKeys(
    mapping,
    ["standardizedCandidates", "exploratoryOnly"],
    "mappingBoundary",
  );
  requireRecord(
    mapping.standardizedCandidates,
    "mappingBoundary.standardizedCandidates",
  );
  const expectedCandidates = {
    jump: "jump",
    squat: "duck",
    step_left: "dodge_left",
    step_right: "dodge_right",
  };
  requireExactKeys(
    mapping.standardizedCandidates,
    Object.keys(expectedCandidates),
    "mappingBoundary.standardizedCandidates",
  );
  for (const [key, value] of Object.entries(expectedCandidates)) {
    requireEqual(
      mapping.standardizedCandidates[key],
      value,
      `mappingBoundary.standardizedCandidates.${key}`,
    );
  }
  requireEqual(
    JSON.stringify(mapping.exploratoryOnly),
    JSON.stringify(movements.slice(2, 4).concat(movements.slice(6))),
    "mappingBoundary.exploratoryOnly",
  );
}

function validateScoreFields(score, expected, name) {
  for (const field of [
    "expectedTrials",
    "matchedTrials",
    "falseNegativeTrials",
    "emittedEvents",
    "truePositiveEvents",
    "falsePositiveEvents",
  ]) {
    requireInteger(score[field], 0, 1_000, `${name}.${field}`);
  }
  for (const field of ["precision", "recall"]) {
    requireNumber(score[field], 0, 1, `${name}.${field}`);
  }
  requireEqual(score.expectedTrials, expected[0], `${name}.expectedTrials`);
  requireEqual(score.matchedTrials, expected[1], `${name}.matchedTrials`);
  requireEqual(score.falsePositiveEvents, expected[2], `${name}.falsePositiveEvents`);
  requireEqual(score.precision, expected[3], `${name}.precision`);
  requireEqual(score.recall, expected[4], `${name}.recall`);
  requireEqual(
    score.falseNegativeTrials,
    score.expectedTrials - score.matchedTrials,
    `${name}.falseNegativeTrials`,
  );
  requireEqual(
    score.emittedEvents,
    score.truePositiveEvents + score.falsePositiveEvents,
    `${name}.emittedEvents`,
  );
  requireEqual(score.truePositiveEvents, score.matchedTrials, `${name}.truePositiveEvents`);
  requireEqual(
    score.precision,
    roundedRate(
      score.truePositiveEvents,
      score.truePositiveEvents + score.falsePositiveEvents,
    ),
    `${name}.precision arithmetic`,
  );
  requireEqual(
    score.recall,
    roundedRate(score.matchedTrials, score.expectedTrials),
    `${name}.recall arithmetic`,
  );
}

function validateEvaluation(evaluation) {
  requireRecord(evaluation, "evaluation");
  requireExactKeys(evaluation, ["fixtures", "totals"], "evaluation");
  if (!Array.isArray(evaluation.fixtures) || evaluation.fixtures.length !== 5) {
    throw new Error("evaluation.fixtures must contain exactly five scores");
  }
  evaluation.fixtures.forEach((fixture, index) => {
    const name = `evaluation.fixtures[${index}]`;
    requireRecord(fixture, name);
    requireExactKeys(
      fixture,
      [
        "fixtureId",
        "expectedTrials",
        "matchedTrials",
        "falseNegativeTrials",
        "emittedEvents",
        "truePositiveEvents",
        "falsePositiveEvents",
        "precision",
        "recall",
        "trials",
      ],
      name,
    );
    requireEqual(fixture.fixtureId, fixtureIds[index], `${name}.fixtureId`);
    validateScoreFields(fixture, fixtureExpectations[index], name);
    if (!Array.isArray(fixture.trials) || fixture.trials.length !== 16) {
      throw new Error(`${name}.trials must contain exactly sixteen trials`);
    }
    fixture.trials.forEach((trial, trialIndex) => {
      const trialName = `${name}.trials[${trialIndex}]`;
      requireRecord(trial, trialName);
      requireExactKeys(
        trial,
        [
          "id",
          "expectation",
          "expectedMovement",
          "emittedMovements",
          "matched",
        ],
        trialName,
      );
      requireEqual(trial.id, trialIds[trialIndex], `${trialName}.id`);
      if (!["event", "no-event", "unavailable"].includes(trial.expectation)) {
        throw new Error(`${trialName}.expectation is invalid`);
      }
      if (
        trial.expectedMovement !== null &&
        !movements.includes(trial.expectedMovement)
      ) {
        throw new Error(`${trialName}.expectedMovement is invalid`);
      }
      if (
        !Array.isArray(trial.emittedMovements) ||
        trial.emittedMovements.some((movement) => !movements.includes(movement))
      ) {
        throw new Error(`${trialName}.emittedMovements is invalid`);
      }
      if (trial.matched !== null && typeof trial.matched !== "boolean") {
        throw new Error(`${trialName}.matched must be boolean or null`);
      }
    });
  });
  requireRecord(evaluation.totals, "evaluation.totals");
  requireExactKeys(
    evaluation.totals,
    [
      "expectedTrials",
      "matchedTrials",
      "falseNegativeTrials",
      "emittedEvents",
      "truePositiveEvents",
      "falsePositiveEvents",
      "precision",
      "recall",
    ],
    "evaluation.totals",
  );
  validateScoreFields(
    evaluation.totals,
    [46, 38, 5, 0.883721, 0.826087],
    "evaluation.totals",
  );
  for (const field of [
    "expectedTrials",
    "matchedTrials",
    "falseNegativeTrials",
    "emittedEvents",
    "truePositiveEvents",
    "falsePositiveEvents",
  ]) {
    requireEqual(
      evaluation.totals[field],
      evaluation.fixtures.reduce(
        (sum, fixture) => sum + fixture[field],
        0,
      ),
      `evaluation.totals.${field} fixture sum`,
    );
  }
  requireEqual(
    sha256(Buffer.from(JSON.stringify(evaluation), "utf8")),
    expectedEvaluationSha256,
    "evaluation SHA-256",
  );
}

function validateLatency(latency) {
  requireRecord(latency, "latencyMicroseconds");
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
    "latencyMicroseconds",
  );
  requireEqual(latency.samples, 281_000, "latencyMicroseconds.samples");
  for (const field of ["mean", "p50", "p95", "p99", "worst"]) {
    requireNumber(
      latency[field],
      0.001,
      1_000_000,
      `latencyMicroseconds.${field}`,
    );
  }
  if (
    !(
      latency.p50 <= latency.p95 &&
      latency.p95 <= latency.p99 &&
      latency.p99 <= latency.worst
    )
  ) {
    throw new Error("latencyMicroseconds percentiles must be monotonic");
  }
  requireNumber(
    latency.measuredThroughputUpdatesPerSecond,
    0.001,
    100_000_000,
    "latencyMicroseconds.measuredThroughputUpdatesPerSecond",
  );
}

export function validateMotionRuleBaselineEvidence(report, expectedDigests) {
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
      "ruleBaselineVersion",
      "implementation",
      "environment",
      "suite",
      "method",
      "mappingBoundary",
      "evaluation",
      "latencyMicroseconds",
      "findings",
      "claimBoundary",
      "limitations",
    ],
    "report",
  );
  requireEqual(report.format, "vcg-motion-rule-baseline-evidence", "format");
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
    report.ruleBaselineVersion,
    "core17-rule-baselines/v1",
    "ruleBaselineVersion",
  );

  requireRecord(report.implementation, "implementation");
  requireExactKeys(
    report.implementation,
    ["recognizerSha256", "suiteSha256", "benchmarkSha256"],
    "implementation",
  );
  for (const field of [
    "recognizerSha256",
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

  validateSuite(report.suite);
  validateMethod(report.method);
  validateMapping(report.mappingBoundary);
  validateEvaluation(report.evaluation);
  validateLatency(report.latencyMicroseconds);

  requireRecord(report.findings, "findings");
  requireExactKeys(
    report.findings,
    [
      "globalUpwardShiftFalseJumpFixtures",
      "limitedRangeMatchedTrials",
      "limitedRangeExpectedTrials",
      "seatedUnavailableLowerBodyTrials",
    ],
    "findings",
  );
  requireEqual(
    report.findings.globalUpwardShiftFalseJumpFixtures,
    5,
    "findings.globalUpwardShiftFalseJumpFixtures",
  );
  requireEqual(
    report.findings.limitedRangeMatchedTrials,
    2,
    "findings.limitedRangeMatchedTrials",
  );
  requireEqual(
    report.findings.limitedRangeExpectedTrials,
    10,
    "findings.limitedRangeExpectedTrials",
  );
  requireEqual(
    report.findings.seatedUnavailableLowerBodyTrials,
    4,
    "findings.seatedUnavailableLowerBodyTrials",
  );

  requireText(report.claimBoundary, "claimBoundary");
  for (const phrase of [
    "Camera-free",
    "not precision/recall across people",
    "child or accessibility result",
    "floor-referenced jump proof",
    "camera latency",
    "target-hardware",
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

export async function validateTrackedMotionRuleBaselineEvidence(
  root = repositoryRoot,
) {
  const [reportBytes, recognizer, suite, benchmark] = await Promise.all([
    readFile(
      resolve(
        root,
        "benchmarks/rule-baselines/windows-x64-synthetic-core17-rules-v1.json",
      ),
    ),
    readFile(resolve(root, "packages/motion-contract/src/rule-baselines.ts")),
    readFile(
      resolve(root, "packages/motion-contract/src/rule-baseline-benchmark.ts"),
    ),
    readFile(resolve(root, "scripts/benchmark-motion-rule-baselines.mjs")),
  ]);
  const expectedDigests = {
    recognizerSha256: sha256(recognizer),
    suiteSha256: sha256(suite),
    benchmarkSha256: sha256(benchmark),
  };
  const report = JSON.parse(reportBytes);
  validateMotionRuleBaselineEvidence(report, expectedDigests);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedMotionRuleBaselineEvidence();
  console.log("validated pinned synthetic motion rule-baseline evidence");
}
