import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import {
  MOTION_API_SCHEMA_VERSION,
  MotionRuleBaselineRecognizer,
  RULE_BASELINE_BENCHMARK_VERSION,
  RULE_BASELINE_DEFAULT_THRESHOLDS,
  RULE_BASELINE_VERSION,
  countRuleBenchmarkUpdates,
  evaluateRuleBaseline,
  generateRuleBaselineBenchmarkSuite,
} from "@vcg/motion-contract";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutput = resolve(
  repositoryRoot,
  "benchmarks",
  "rule-baselines",
  "windows-x64-synthetic-core17-rules-v1.json",
);
const warmupPasses = 10;
const measuredPasses = 100;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
  const evidenceRoot = resolve(repositoryRoot, "benchmarks", "rule-baselines");
  const rootRelative = relative(evidenceRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error(
      "output must be a JSON file below benchmarks/rule-baselines",
    );
  }
  return output;
}

function percentile(sortedValues, fraction) {
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const upperWeight = position - lower;
  return (
    sortedValues[lower] * (1 - upperWeight) +
    sortedValues[upper] * upperWeight
  );
}

function microseconds(milliseconds) {
  return Math.round(milliseconds * 1_000_000) / 1000;
}

function runPass(suite, recordLatency) {
  const latencies = [];
  for (const fixture of suite) {
    for (const trial of fixture.trials) {
      const recognizer = new MotionRuleBaselineRecognizer(fixture.calibration);
      for (const frame of trial.frames) {
        const input = {
          timestampMs: frame.timestampMs,
          landmarks: frame.landmarks.map((landmark) => ({ ...landmark })),
        };
        const started = recordLatency ? performance.now() : 0;
        recognizer.update(input);
        if (recordLatency) latencies.push(performance.now() - started);
      }
    }
  }
  return latencies;
}

function measureLatency(suite) {
  for (let pass = 0; pass < warmupPasses; pass += 1) {
    runPass(suite, false);
  }
  const latencyMilliseconds = [];
  for (let pass = 0; pass < measuredPasses; pass += 1) {
    latencyMilliseconds.push(...runPass(suite, true));
  }
  const sorted = latencyMilliseconds.sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    samples: sorted.length,
    mean: microseconds(total / sorted.length),
    p50: microseconds(percentile(sorted, 0.5)),
    p95: microseconds(percentile(sorted, 0.95)),
    p99: microseconds(percentile(sorted, 0.99)),
    worst: microseconds(sorted.at(-1)),
    measuredThroughputUpdatesPerSecond:
      Math.round((sorted.length / (total / 1000)) * 1000) / 1000,
  };
}

async function buildReport() {
  const suite = generateRuleBaselineBenchmarkSuite();
  const [recognizerImplementation, suiteImplementation, benchmarkImplementation] =
    await Promise.all([
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "rule-baselines.ts",
        ),
      ),
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "rule-baseline-benchmark.ts",
        ),
      ),
      readFile(fileURLToPath(import.meta.url)),
    ]);
  const evaluation = evaluateRuleBaseline(suite);
  return {
    format: "vcg-motion-rule-baseline-evidence",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    ruleBaselineVersion: RULE_BASELINE_VERSION,
    implementation: {
      recognizerSha256: sha256(recognizerImplementation),
      suiteSha256: sha256(suiteImplementation),
      benchmarkSha256: sha256(benchmarkImplementation),
    },
    environment: {
      platform: platform(),
      architecture: arch(),
      node: process.version,
    },
    suite: {
      version: RULE_BASELINE_BENCHMARK_VERSION,
      serializedSuiteSha256: sha256(
        Buffer.from(JSON.stringify(suite), "utf8"),
      ),
      containsRawFrames: false,
      source:
        "deterministic generated normalized core17 skeleton-shape fixtures",
      updateCount: countRuleBenchmarkUpdates(suite),
      fixtures: suite.map((fixture) => ({
        id: fixture.id,
        description: fixture.description,
        evidenceClass: fixture.evidenceClass,
        calibrationSampleCount: fixture.calibration.length,
        trialCount: fixture.trials.length,
        frameCount: fixture.trials.reduce(
          (total, trial) => total + trial.frames.length,
          0,
        ),
        expectedEventTrials: fixture.trials.filter(
          ({ expectation }) => expectation === "event",
        ).length,
        noEventTrials: fixture.trials.filter(
          ({ expectation }) => expectation === "no-event",
        ).length,
        unavailableTrials: fixture.trials.filter(
          ({ expectation }) => expectation === "unavailable",
        ).length,
      })),
    },
    method: {
      thresholds: RULE_BASELINE_DEFAULT_THRESHOLDS,
      calibrationSamples: 24,
      warmupPasses,
      measuredPasses,
      latencyBoundary:
        "one rule-recognizer update over one pre-generated core17 skeleton",
      latencyTimer: "node-performance-now",
      latencySummaryMethod: "linear-interpolation-r7",
      truthVisibility:
        "expected movement exists only in evaluator trial metadata and is never passed to the recognizer",
      missingLandmarkPolicy:
        "a missing or below-confidence required landmark suppresses and releases only affected rules",
      outputAuthority:
        "exploratory research labels only; no MotionAction wire event or gameplay authority",
    },
    mappingBoundary: {
      standardizedCandidates: {
        jump: "jump",
        squat: "duck",
        step_left: "dodge_left",
        step_right: "dodge_right",
      },
      exploratoryOnly: [
        "lean_left",
        "lean_right",
        "reach_left",
        "reach_right",
        "punch_left",
        "punch_right",
      ],
    },
    evaluation,
    latencyMicroseconds: measureLatency(suite),
    findings: {
      globalUpwardShiftFalseJumpFixtures: evaluation.fixtures.filter(
        ({ trials }) =>
          trials
            .find(({ id }) => id === "global-upward-shift")
            ?.emittedMovements.includes("jump"),
      ).length,
      limitedRangeMatchedTrials:
        evaluation.fixtures.find(
          ({ fixtureId }) => fixtureId === "limited-range-exploratory",
        )?.matchedTrials ?? null,
      limitedRangeExpectedTrials:
        evaluation.fixtures.find(
          ({ fixtureId }) => fixtureId === "limited-range-exploratory",
        )?.expectedTrials ?? null,
      seatedUnavailableLowerBodyTrials: 4,
    },
    claimBoundary:
      "Camera-free generated skeleton-shape method evidence only. It is not precision/recall across people, a child or accessibility result, floor-referenced jump proof, standardized-action qualification, perceived gameplay evidence, camera latency, or target-hardware evidence.",
    limitations: [
      "Truth labels and landmark trajectories are generated by the same repository and are not independent annotation.",
      "The standing fixtures vary scale but do not reproduce real body proportions, clothing, pose-estimator error, or movement style.",
      "The child-shaped fixture is not evidence from or about a child participant.",
      "The seated and limited-range fixtures are exploratory geometry, not accessibility qualification.",
      "Image-space jump remains confounded with global camera or crop movement in every fixture.",
      "Two-dimensional lateral punch is not a reliable model of a punch toward the camera.",
      "Rule confidence is threshold distance, not calibrated event probability.",
      "No smoothing, detector, identity association, floor calibration, action lifecycle, or game workload is included.",
      "Per-update JavaScript timing excludes calibration, capture, inference, IPC, actions, and rendering.",
      "One Windows x64 development host does not qualify native Rust or target-Linux performance.",
      "No image, video frame, participant identifier, biometric template, or appearance descriptor is generated or retained.",
    ],
  };
}

const argumentsList = process.argv.slice(2);
if (
  argumentsList.length !== 0 &&
  (argumentsList.length !== 2 ||
    argumentsList[0] !== "--output" ||
    !argumentsList[1])
) {
  throw new Error(
    "usage: benchmark-motion-rule-baselines.mjs [--output <path>]",
  );
}
const output = requireBoundedOutput(argumentsList[1]);
await mkdir(resolve(output, ".."), { recursive: true });
const report = await buildReport();
const pending = `${output}.pending`;
await writeFile(pending, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await rename(pending, output);
console.log(relative(repositoryRoot, output).replaceAll("\\", "/"));
