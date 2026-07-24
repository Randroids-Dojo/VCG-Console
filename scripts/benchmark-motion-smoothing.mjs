import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import {
  MOTION_API_SCHEMA_VERSION,
  MotionPointSmoother,
  SMOOTHING_ALGORITHMS,
  SMOOTHING_BENCHMARK_SUITE_VERSION,
  evaluateSmoothingAlgorithm,
  generateSmoothingBenchmarkSuite,
} from "@vcg/motion-contract";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutput = resolve(
  repositoryRoot,
  "benchmarks",
  "smoothing",
  "windows-x64-synthetic-smoothing-v1.json",
);
const warmupPasses = 10;
const measuredPasses = 100;

const classifications = {
  passthrough: "unsmoothed normalized observation baseline",
  ema: "fixed-alpha exponential moving average",
  "one-euro": "speed-adaptive low-pass filter",
  kalman: "constant-velocity two-state linear Kalman filter per axis",
};

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
  const evidenceRoot = resolve(repositoryRoot, "benchmarks", "smoothing");
  const rootRelative = relative(evidenceRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error("output must be a JSON file below benchmarks/smoothing");
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

function runPass(algorithm, suite, recordLatency) {
  const latencies = [];
  for (const scenario of suite) {
    const smoother = new MotionPointSmoother({ algorithm });
    for (const frame of scenario.frames) {
      const input = { ...frame.input };
      const started = recordLatency ? performance.now() : 0;
      smoother.update(input);
      if (recordLatency) latencies.push(performance.now() - started);
    }
  }
  return latencies;
}

function latencyForAlgorithm(algorithm, suite) {
  for (let pass = 0; pass < warmupPasses; pass += 1) {
    runPass(algorithm, suite, false);
  }
  const latencyMilliseconds = [];
  for (let pass = 0; pass < measuredPasses; pass += 1) {
    latencyMilliseconds.push(...runPass(algorithm, suite, true));
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
  const suite = generateSmoothingBenchmarkSuite();
  const [smootherImplementation, suiteImplementation, benchmarkImplementation] =
    await Promise.all([
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "smoothing.ts",
        ),
      ),
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "smoothing-benchmark.ts",
        ),
      ),
      readFile(fileURLToPath(import.meta.url)),
    ]);
  return {
    format: "vcg-motion-smoothing-comparison",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    implementation: {
      smootherSha256: sha256(smootherImplementation),
      suiteSha256: sha256(suiteImplementation),
      benchmarkSha256: sha256(benchmarkImplementation),
    },
    environment: {
      platform: platform(),
      architecture: arch(),
      node: process.version,
    },
    suite: {
      version: SMOOTHING_BENCHMARK_SUITE_VERSION,
      serializedScenarioSha256: sha256(
        Buffer.from(JSON.stringify(suite), "utf8"),
      ),
      containsRawFrames: false,
      source: "deterministic generated normalized two-dimensional points",
      scenarios: suite.map(
        ({ id, description, framesPerSecond, frames }) => ({
          id,
          description,
          framesPerSecond,
          frameCount: frames.length,
          missingObservationCount: frames.filter(
            ({ input }) => !input.observed,
          ).length,
        }),
      ),
    },
    method: {
      defaultParameters: {
        maxGapMs: 250,
        emaAlpha: 0.35,
        oneEuroMinCutoffHz: 1,
        oneEuroBeta: 4,
        oneEuroDerivativeCutoffHz: 1,
        kalmanProcessVariance: 0.002,
        kalmanMeasurementVariance: 0.001,
      },
      warmupPasses,
      measuredPasses,
      latencyBoundary: "one smoother update over one pre-generated point",
      latencyTimer: "node-performance-now",
      latencySummaryMethod: "linear-interpolation-r7",
      truthVisibility:
        "truth coordinates exist only in evaluator frames and are stripped before every smoother update",
      missingObservationPolicy:
        "missing observations produce no point; state resets after a gap longer than maxGapMs",
    },
    results: SMOOTHING_ALGORITHMS.map((algorithm) => ({
      algorithm,
      classification: classifications[algorithm],
      metrics: evaluateSmoothingAlgorithm(algorithm, suite),
      latencyMicroseconds: latencyForAlgorithm(algorithm, suite),
    })),
    backendNative: {
      status: "unmeasured-no-comparable-backend-series",
      reason:
        "No selected pose backend currently exposes both raw and native-smoothed normalized landmark series over the same consented capture.",
      evidenceRequired: [
        "paired raw and backend-native-smoothed landmark series from the same backend invocation",
        "documented native smoothing controls and defaults",
        "the same jitter, step, ramp, reversal, and dropout scoring boundary",
      ],
    },
    claimBoundary:
      "Camera-free deterministic normalized-point evidence only. It does not measure perceived gameplay quality, real pose noise, native backend smoothing, camera latency, full action latency, target hardware, or real players.",
    limitations: [
      "Generated noise is deterministic and does not reproduce pose-estimator error distributions.",
      "A single point does not represent articulated landmark covariance or confidence behavior.",
      "Step, ramp, reversal, and dropout traces are synthetic rather than consented captures.",
      "No gameplay task or human-perceived latency score is measured.",
      "Backend-native smoothing is explicitly unmeasured because no comparable paired series is available.",
      "Default parameters are illustrative baselines and are not qualified action-profile settings.",
      "Per-update JavaScript timing excludes capture, inference, association, IPC, actions, and rendering.",
      "One Windows x64 development host does not qualify native Rust or target-Linux performance.",
      "No image, video frame, biometric template, identity label, or appearance descriptor is generated or retained.",
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
  throw new Error("usage: benchmark-motion-smoothing.mjs [--output <path>]");
}
const output = requireBoundedOutput(argumentsList[1]);
await mkdir(resolve(output, ".."), { recursive: true });
const report = await buildReport();
const pending = `${output}.pending`;
await writeFile(pending, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await rename(pending, output);
console.log(relative(repositoryRoot, output).replaceAll("\\", "/"));
