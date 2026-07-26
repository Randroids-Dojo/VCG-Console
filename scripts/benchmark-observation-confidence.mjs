import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  MOTION_API_SCHEMA_VERSION,
  OBSERVATION_CONFIDENCE_BENCHMARK_VERSION,
  OBSERVATION_CONFIDENCE_GATE_DEFAULTS,
  OBSERVATION_CONFIDENCE_GATE_VERSION,
  OBSERVATION_CONFIDENCE_STRATEGIES,
  evaluateObservationConfidenceStrategy,
  generateObservationConfidenceBenchmarkSuite,
} from "@vcg/motion-contract";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceRoot = resolve(
  repositoryRoot,
  "benchmarks",
  "confidence-degradation",
);
const defaultOutput = resolve(
  evidenceRoot,
  "windows-x64-synthetic-confidence-v1.json",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalTextSha256(bytes) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n");
  return sha256(Buffer.from(text, "utf8"));
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr?.trim() || result.status}`,
    );
  }
  return result.stdout.trim();
}

function requireBoundedOutput(argument) {
  const output = argument ? resolve(repositoryRoot, argument) : defaultOutput;
  const rootRelative = relative(evidenceRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error(
      "output must be a JSON file below benchmarks/confidence-degradation",
    );
  }
  return output;
}

const output = requireBoundedOutput(process.argv[2]);
const suite = generateObservationConfidenceBenchmarkSuite();
const evaluations = OBSERVATION_CONFIDENCE_STRATEGIES.map((strategy) =>
  evaluateObservationConfidenceStrategy(strategy, suite),
);
const [gateBytes, suiteBytes, benchmarkBytes] = await Promise.all([
  readFile(
    resolve(
      repositoryRoot,
      "packages/motion-contract/src/observation-confidence.ts",
    ),
  ),
  readFile(
    resolve(
      repositoryRoot,
      "packages/motion-contract/src/observation-confidence-benchmark.ts",
    ),
  ),
  readFile(fileURLToPath(import.meta.url)),
]);
const report = {
  format: "vcg-observation-confidence-evidence",
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCommit: git(["rev-parse", "HEAD"]),
  workingTreeClean: git(["status", "--porcelain"]) === "",
  motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
  gateVersion: OBSERVATION_CONFIDENCE_GATE_VERSION,
  benchmarkVersion: OBSERVATION_CONFIDENCE_BENCHMARK_VERSION,
  implementation: {
    hashNormalization: "utf8-lf",
    gateSha256: canonicalTextSha256(gateBytes),
    suiteSha256: canonicalTextSha256(suiteBytes),
    benchmarkSha256: canonicalTextSha256(benchmarkBytes),
  },
  environment: {
    platform: platform(),
    architecture: arch(),
    node: process.version,
  },
  suite: {
    source: "deterministic authored confidence and provider-observation sequences",
    serializedSuiteSha256: sha256(
      Buffer.from(JSON.stringify(suite), "utf8"),
    ),
    containsCoordinates: false,
    containsRawFrames: false,
    scenarioCount: suite.length,
    sampleCount: suite.reduce(
      (sum, scenario) => sum + scenario.samples.length,
      0,
    ),
    scenarioIds: suite.map(({ id }) => id),
  },
  method: {
    strategies: OBSERVATION_CONFIDENCE_STRATEGIES,
    gateParameters: OBSERVATION_CONFIDENCE_GATE_DEFAULTS,
    memorylessReleaseConfidence:
      OBSERVATION_CONFIDENCE_GATE_DEFAULTS.releaseConfidence,
    lossPolicy:
      "block immediately when providerObserved is false or confidence is below releaseConfidence",
    restorePolicy:
      "require acquireSamples consecutive provider-observed samples at or above acquireConfidence",
    truthVisibility:
      "expectedObserved is retained only by the evaluator and is never passed to either strategy",
    outputAuthority:
      "research observation state only; no Motion wire, health, action, player-session, or gameplay authority",
  },
  results: evaluations,
  findings: {
    unsafeAvailableBefore: evaluations[0].totals.unsafeAvailable,
    unsafeAvailableAfter: evaluations[1].totals.unsafeAvailable,
    falseUnavailableBefore: evaluations[0].totals.falseUnavailable,
    falseUnavailableAfter: evaluations[1].totals.falseUnavailable,
    transitionsBefore: evaluations[0].totals.transitions,
    transitionsAfter: evaluations[1].totals.transitions,
    occludedMediumUnsafeBefore:
      evaluations[0].scenarios.find(
        ({ id }) => id === "occluded-medium-rebound",
      ).unsafeAvailable,
    occludedMediumUnsafeAfter:
      evaluations[1].scenarios.find(
        ({ id }) => id === "occluded-medium-rebound",
      ).unsafeAvailable,
    ambiguousUnsafeBefore:
      evaluations[0].scenarios.find(
        ({ id }) => id === "ambiguous-alternation",
      ).unsafeAvailable,
    ambiguousUnsafeAfter:
      evaluations[1].scenarios.find(
        ({ id }) => id === "ambiguous-alternation",
      ).unsafeAvailable,
  },
  claimBoundary:
    "Camera-free authored confidence sequences prove deterministic state-machine behavior only. They do not select MediaPipe or RTMO thresholds, model real confidence calibration, prove landmark truth, quantify action accuracy, or qualify a camera, player, room, backend, platform, or game policy.",
  limitations: [
    "Expected observation state is authored rather than independently labeled from real video.",
    "Confidence values are synthetic and do not represent a measured provider distribution.",
    "MediaPipe visibility and presence calibration are not measured.",
    "RTMO keypoint-score calibration is not measured.",
    "Confidence values are not comparable across providers without separate calibration.",
    "The default thresholds are research parameters, not production selections.",
    "Three samples are frame-rate dependent until converted to a time-bound policy.",
    "The gate operates on one landmark and does not prove multi-landmark region policy.",
    "No action precision, recall, false trigger, or latency is measured.",
    "No child, adult, seated, limited-range, clothing, or occlusion session has run.",
    "No target Linux, native host, camera, tracker, or game integration has run.",
    "False-unavailability cost and recovery comprehension are not user-tested.",
  ],
};

await mkdir(resolve(output, ".."), { recursive: true });
const temporary = `${output}.tmp-${process.pid}`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
await rename(temporary, output);
console.log(relative(repositoryRoot, output));
