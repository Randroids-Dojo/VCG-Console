import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import {
  AppearanceFreeIdentityTracker,
  IDENTITY_BENCHMARK_SUITE_VERSION,
  IDENTITY_TRACKER_ALGORITHMS,
  MOTION_API_SCHEMA_VERSION,
  evaluateIdentityAlgorithm,
  generateIdentityBenchmarkSuite,
} from "@vcg/motion-contract";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutput = resolve(
  repositoryRoot,
  "benchmarks",
  "identity-tracking",
  "windows-x64-synthetic-appearance-free-v1.json",
);
const warmupPasses = 10;
const measuredPasses = 100;

const algorithmClassifications = {
  "nearest-centroid": "frame-local nearest torso centroid",
  "kalman-centroid": "constant-velocity Kalman torso-centroid prediction",
  oks: "consecutive-pose COCO-style object keypoint similarity",
  "kalman-oks-hybrid": "Kalman centroid plus object keypoint similarity",
  "two-stage-kalman-iou":
    "ByteTrack-inspired high/low-confidence association using Kalman centroid and box overlap; not the upstream ByteTrack implementation",
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
  const output = argument
    ? resolve(repositoryRoot, argument)
    : defaultOutput;
  const evidenceRoot = resolve(
    repositoryRoot,
    "benchmarks",
    "identity-tracking",
  );
  const rootRelative = relative(evidenceRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    output.endsWith(".json") === false
  ) {
    throw new Error(
      "output must be a JSON file below benchmarks/identity-tracking",
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
  return Math.round(milliseconds * 1000 * 1000) / 1000;
}

function runPass(algorithm, suite, recordLatency) {
  const latencies = [];
  for (const scenario of suite) {
    const tracker = new AppearanceFreeIdentityTracker({
      algorithm,
      maxTracks: 4,
      maxMissedFrames: 6,
      maxAssociationDistance: 0.22,
      minimumDetectionConfidence: 0.1,
      highConfidenceThreshold: 0.6,
      minimumOks: 0.15,
    });
    for (const frame of scenario.frames) {
      const input = {
        timestampMs: frame.timestampMs,
        detections: frame.detections.map(
          ({ confidence, landmarks }) => ({
            confidence,
            landmarks,
          }),
        ),
      };
      const started = recordLatency ? performance.now() : 0;
      tracker.update(input);
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
  const sorted = latencyMilliseconds.toSorted((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    samples: sorted.length,
    mean: microseconds(total / sorted.length),
    p50: microseconds(percentile(sorted, 0.5)),
    p95: microseconds(percentile(sorted, 0.95)),
    p99: microseconds(percentile(sorted, 0.99)),
    worst: microseconds(sorted.at(-1)),
    measuredThroughputFramesPerSecond:
      Math.round((sorted.length / (total / 1000)) * 1000) / 1000,
  };
}

async function buildReport() {
  const suite = generateIdentityBenchmarkSuite();
  const trackerImplementation = await readFile(
    resolve(
      repositoryRoot,
      "packages",
      "motion-contract",
      "src",
      "identity-tracking.ts",
    ),
  );
  const suiteImplementation = await readFile(
    resolve(
      repositoryRoot,
      "packages",
      "motion-contract",
      "src",
      "identity-benchmark.ts",
    ),
  );
  const benchmarkImplementation = await readFile(
    fileURLToPath(import.meta.url),
  );
  const scenarioSummary = suite.map(
    ({ id, description, framesPerSecond, frames }) => ({
      id,
      description,
      framesPerSecond,
      frameCount: frames.length,
      visibleTruthObservations: frames.reduce(
        (total, frame) => total + frame.detections.length,
        0,
      ),
    }),
  );
  const results = IDENTITY_TRACKER_ALGORITHMS.map((algorithm) => ({
    algorithm,
    classification: algorithmClassifications[algorithm],
    metrics: evaluateIdentityAlgorithm(algorithm, suite),
    latencyMicroseconds: latencyForAlgorithm(algorithm, suite),
  }));
  return {
    format: "vcg-identity-tracker-comparison",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    implementation: {
      trackerSha256: sha256(trackerImplementation),
      suiteSha256: sha256(suiteImplementation),
      benchmarkSha256: sha256(benchmarkImplementation),
    },
    environment: {
      platform: platform(),
      architecture: arch(),
      node: process.version,
    },
    suite: {
      version: IDENTITY_BENCHMARK_SUITE_VERSION,
      serializedScenarioSha256: sha256(
        Buffer.from(JSON.stringify(suite), "utf8"),
      ),
      containsRawFrames: false,
      source: "deterministic generated normalized core17 skeletons",
      scenarios: scenarioSummary,
    },
    method: {
      maxTracks: 4,
      maxMissedFrames: 6,
      maxAssociationDistance: 0.22,
      minimumDetectionConfidence: 0.1,
      highConfidenceThreshold: 0.6,
      minimumOks: 0.15,
      warmupPasses,
      measuredPasses,
      latencyBoundary: "one tracker update over pre-generated detections",
      latencyTimer: "node-performance-now",
      latencySummaryMethod: "linear-interpolation-r7",
      truthVisibility:
        "truthId exists only in evaluator frames and is stripped before every tracker update",
    },
    results,
    claimBoundary:
      "Camera-free deterministic skeleton assignment evidence only. It does not measure real-player identity, pose-detector errors, room behavior, camera latency, target hardware, appearance privacy, or upstream ByteTrack.",
    limitations: [
      "Synthetic poses do not reproduce real detector noise, missed limbs, duplicate detections, or camera geometry.",
      "Truth labels are generated rather than independently annotated from consented people.",
      "Body-proportion variants remain unrealistically stable through each scenario.",
      "Long exit and re-entry is intentionally unresolvable without persistent appearance or explicit player confirmation.",
      "The two-stage baseline borrows high/low-confidence association structure but is not the upstream ByteTrack implementation.",
      "Latency excludes pose inference, capture, serialization, process transport, player-session control, rendering, and actions.",
      "JavaScript timing on one Windows x86 development host does not qualify the Rust/native or target-Linux path.",
      "No image, biometric template, face embedding, or appearance descriptor is generated or retained.",
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
  throw new Error("usage: benchmark-identity-trackers.mjs [--output <path>]");
}
const output = requireBoundedOutput(argumentsList[1]);
await mkdir(resolve(output, ".."), { recursive: true });
const report = await buildReport();
const pending = `${output}.pending`;
await writeFile(pending, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await rename(pending, output);
console.log(relative(repositoryRoot, output).replaceAll("\\", "/"));
