import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const strategies = [
  "memoryless-release-threshold",
  "fail-closed-confidence-rearm",
];
const scenarioIds = [
  "stable-high",
  "stable-low",
  "visible-threshold-jitter",
  "occluded-medium-rebound",
  "provider-loss-high-score",
  "single-low-blip",
  "sustained-loss-recovery",
  "ambiguous-alternation",
  "retain-band-visible",
  "provider-flag-oscillation",
];
const scenarioSamples = [12, 12, 12, 12, 10, 8, 12, 14, 11, 12];
const reasons = [
  "observed",
  "blocked-provider",
  "blocked-confidence",
  "rearming",
];
const expectedTotals = [
  {
    samples: 115,
    exact: 99,
    unsafeAvailable: 14,
    falseUnavailable: 2,
    transitions: 32,
    accuracy: 0.86087,
  },
  {
    samples: 115,
    exact: 81,
    unsafeAvailable: 0,
    falseUnavailable: 34,
    transitions: 20,
    accuracy: 0.704348,
  },
];
const resultDigests = [
  "b023fa93825c998093d1c1a839960faa90f062b173ba89ce373f7c0339314a5c",
  "787b11070e149da306bf3b182a8f4b61634df5a141bc3f5154e6236d9d3b87e9",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextSha256(bytes) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n");
  return sha256(Buffer.from(text, "utf8"));
}

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

function requireInteger(value, minimum, maximum, name) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function validateSuite(suite) {
  requireRecord(suite, "suite");
  requireExactKeys(
    suite,
    [
      "source",
      "serializedSuiteSha256",
      "containsCoordinates",
      "containsRawFrames",
      "scenarioCount",
      "sampleCount",
      "scenarioIds",
    ],
    "suite",
  );
  requireEqual(
    suite.source,
    "deterministic authored confidence and provider-observation sequences",
    "suite.source",
  );
  requireEqual(
    suite.serializedSuiteSha256,
    "a4cab2a1315b62536c72b7240752a29dbd2e45aa06f170fffef7c7129252c322",
    "suite.serializedSuiteSha256",
  );
  requireEqual(suite.containsCoordinates, false, "suite.containsCoordinates");
  requireEqual(suite.containsRawFrames, false, "suite.containsRawFrames");
  requireEqual(suite.scenarioCount, 10, "suite.scenarioCount");
  requireEqual(suite.sampleCount, 115, "suite.sampleCount");
  requireEqual(
    JSON.stringify(suite.scenarioIds),
    JSON.stringify(scenarioIds),
    "suite.scenarioIds",
  );
}

function validateMethod(method) {
  requireRecord(method, "method");
  requireExactKeys(
    method,
    [
      "strategies",
      "gateParameters",
      "memorylessReleaseConfidence",
      "lossPolicy",
      "restorePolicy",
      "truthVisibility",
      "outputAuthority",
    ],
    "method",
  );
  requireEqual(
    JSON.stringify(method.strategies),
    JSON.stringify(strategies),
    "method.strategies",
  );
  requireRecord(method.gateParameters, "method.gateParameters");
  requireExactKeys(
    method.gateParameters,
    ["releaseConfidence", "acquireConfidence", "acquireSamples"],
    "method.gateParameters",
  );
  requireEqual(
    method.gateParameters.releaseConfidence,
    0.5,
    "method.gateParameters.releaseConfidence",
  );
  requireEqual(
    method.gateParameters.acquireConfidence,
    0.75,
    "method.gateParameters.acquireConfidence",
  );
  requireEqual(
    method.gateParameters.acquireSamples,
    3,
    "method.gateParameters.acquireSamples",
  );
  requireEqual(
    method.memorylessReleaseConfidence,
    0.5,
    "method.memorylessReleaseConfidence",
  );
  requireEqual(
    method.lossPolicy,
    "block immediately when providerObserved is false or confidence is below releaseConfidence",
    "method.lossPolicy",
  );
  requireEqual(
    method.restorePolicy,
    "require acquireSamples consecutive provider-observed samples at or above acquireConfidence",
    "method.restorePolicy",
  );
  requireEqual(
    method.truthVisibility,
    "expectedObserved is retained only by the evaluator and is never passed to either strategy",
    "method.truthVisibility",
  );
  requireEqual(
    method.outputAuthority,
    "research observation state only; no Motion wire, health, action, player-session, or gameplay authority",
    "method.outputAuthority",
  );
}

function validateResult(result, strategyIndex) {
  const name = `results[${strategyIndex}]`;
  requireRecord(result, name);
  requireExactKeys(result, ["strategy", "scenarios", "totals"], name);
  requireEqual(result.strategy, strategies[strategyIndex], `${name}.strategy`);
  if (!Array.isArray(result.scenarios) || result.scenarios.length !== 10) {
    throw new Error(`${name}.scenarios must contain exactly ten scenarios`);
  }
  result.scenarios.forEach((scenario, index) => {
    const scenarioName = `${name}.scenarios[${index}]`;
    requireRecord(scenario, scenarioName);
    requireExactKeys(
      scenario,
      [
        "id",
        "samples",
        "exact",
        "unsafeAvailable",
        "falseUnavailable",
        "transitions",
        "predictions",
        "reasons",
      ],
      scenarioName,
    );
    requireEqual(scenario.id, scenarioIds[index], `${scenarioName}.id`);
    requireEqual(
      scenario.samples,
      scenarioSamples[index],
      `${scenarioName}.samples`,
    );
    for (const field of [
      "exact",
      "unsafeAvailable",
      "falseUnavailable",
      "transitions",
    ]) {
      requireInteger(
        scenario[field],
        0,
        scenario.samples,
        `${scenarioName}.${field}`,
      );
    }
    if (
      !Array.isArray(scenario.predictions) ||
      scenario.predictions.length !== scenario.samples ||
      scenario.predictions.some((value) => typeof value !== "boolean")
    ) {
      throw new Error(`${scenarioName}.predictions must be bounded booleans`);
    }
    if (
      !Array.isArray(scenario.reasons) ||
      scenario.reasons.length !== scenario.samples ||
      scenario.reasons.some((value) => !reasons.includes(value))
    ) {
      throw new Error(`${scenarioName}.reasons must be bounded known values`);
    }
  });
  requireRecord(result.totals, `${name}.totals`);
  requireExactKeys(
    result.totals,
    Object.keys(expectedTotals[strategyIndex]),
    `${name}.totals`,
  );
  for (const [field, expected] of Object.entries(
    expectedTotals[strategyIndex],
  )) {
    requireEqual(result.totals[field], expected, `${name}.totals.${field}`);
  }
  requireEqual(
    sha256(Buffer.from(JSON.stringify(result), "utf8")),
    resultDigests[strategyIndex],
    `${name} SHA-256`,
  );
}

export function validateObservationConfidenceEvidence(
  report,
  expectedDigests,
) {
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
      "gateVersion",
      "benchmarkVersion",
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
  requireEqual(
    report.format,
    "vcg-observation-confidence-evidence",
    "format",
  );
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
    report.gateVersion,
    "fail-closed-confidence-rearm/v1",
    "gateVersion",
  );
  requireEqual(
    report.benchmarkVersion,
    "synthetic-confidence-degradation/v1",
    "benchmarkVersion",
  );

  requireRecord(report.implementation, "implementation");
  requireExactKeys(
    report.implementation,
    [
      "hashNormalization",
      "gateSha256",
      "suiteSha256",
      "benchmarkSha256",
    ],
    "implementation",
  );
  requireEqual(
    report.implementation.hashNormalization,
    "utf8-lf",
    "implementation.hashNormalization",
  );
  for (const field of ["gateSha256", "suiteSha256", "benchmarkSha256"]) {
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
  requireEqual(
    report.environment.architecture,
    "x64",
    "environment.architecture",
  );
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
  report.results.forEach(validateResult);

  const expectedFindings = {
    unsafeAvailableBefore: 14,
    unsafeAvailableAfter: 0,
    falseUnavailableBefore: 2,
    falseUnavailableAfter: 34,
    transitionsBefore: 32,
    transitionsAfter: 20,
    occludedMediumUnsafeBefore: 5,
    occludedMediumUnsafeAfter: 0,
    ambiguousUnsafeBefore: 5,
    ambiguousUnsafeAfter: 0,
  };
  requireRecord(report.findings, "findings");
  requireExactKeys(
    report.findings,
    Object.keys(expectedFindings),
    "findings",
  );
  for (const [field, expected] of Object.entries(expectedFindings)) {
    requireEqual(report.findings[field], expected, `findings.${field}`);
  }

  requireText(report.claimBoundary, "claimBoundary");
  for (const phrase of [
    "Camera-free",
    "do not select MediaPipe or RTMO thresholds",
    "landmark truth",
    "action accuracy",
    "platform",
  ]) {
    if (!report.claimBoundary.includes(phrase)) {
      throw new Error(`claimBoundary must explicitly address ${phrase}`);
    }
  }
  if (!Array.isArray(report.limitations) || report.limitations.length < 12) {
    throw new Error("limitations must contain at least twelve entries");
  }
  report.limitations.forEach((value, index) =>
    requireText(value, `limitations[${index}]`),
  );
}

export async function validateTrackedObservationConfidenceEvidence(
  root = repositoryRoot,
) {
  const [reportBytes, gateBytes, suiteBytes, benchmarkBytes] =
    await Promise.all([
      readFile(
        resolve(
          root,
          "benchmarks/confidence-degradation/windows-x64-synthetic-confidence-v1.json",
        ),
      ),
      readFile(
        resolve(
          root,
          "packages/motion-contract/src/observation-confidence.ts",
        ),
      ),
      readFile(
        resolve(
          root,
          "packages/motion-contract/src/observation-confidence-benchmark.ts",
        ),
      ),
      readFile(resolve(root, "scripts/benchmark-observation-confidence.mjs")),
    ]);
  if (reportBytes.length > 200_000) {
    throw new Error("tracked observation confidence report is too large");
  }
  const expectedDigests = {
    gateSha256: canonicalTextSha256(gateBytes),
    suiteSha256: canonicalTextSha256(suiteBytes),
    benchmarkSha256: canonicalTextSha256(benchmarkBytes),
  };
  const report = JSON.parse(reportBytes);
  validateObservationConfidenceEvidence(report, expectedDigests);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await validateTrackedObservationConfidenceEvidence();
  console.log("validated pinned synthetic observation-confidence evidence");
}
