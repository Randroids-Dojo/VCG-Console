import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import {
  LATERALITY_BENCHMARK_VERSION,
  LATERALITY_GUARD_DEFAULTS,
  LATERALITY_GUARD_VERSION,
  LATERALITY_STRATEGIES,
  LateralityGuardedRuleRecognizer,
  MOTION_API_SCHEMA_VERSION,
  MotionRuleBaselineRecognizer,
  countLateralityBenchmarkUpdates,
  evaluateLateralityStrategy,
  generateLateralityBenchmarkSuite,
} from "@vcg/motion-contract";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultOutput = resolve(
  repositoryRoot,
  "benchmarks",
  "laterality",
  "windows-x64-synthetic-laterality-v1.json",
);
const warmupPasses = 5;
const measuredPasses = 50;

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
  const evidenceRoot = resolve(repositoryRoot, "benchmarks", "laterality");
  const rootRelative = relative(evidenceRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error("output must be a JSON file below benchmarks/laterality");
  }
  return output;
}

function cloneSample(sample) {
  return {
    timestampMs: sample.timestampMs,
    landmarks: sample.landmarks.map((landmark) => ({ ...landmark })),
  };
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

function runPass(strategy, suite, recordLatency) {
  const latencies = [];
  for (const scenario of suite) {
    const recognizer =
      strategy === "trust-provider-names"
        ? new MotionRuleBaselineRecognizer(scenario.calibration)
        : new LateralityGuardedRuleRecognizer(scenario.calibration);
    for (const frame of scenario.frames) {
      const started = recordLatency ? performance.now() : 0;
      recognizer.update(cloneSample(frame));
      if (recordLatency) latencies.push(performance.now() - started);
    }
  }
  return latencies;
}

function measureLatency(strategy, suite) {
  for (let pass = 0; pass < warmupPasses; pass += 1) {
    runPass(strategy, suite, false);
  }
  const latencyMilliseconds = [];
  for (let pass = 0; pass < measuredPasses; pass += 1) {
    latencyMilliseconds.push(...runPass(strategy, suite, true));
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
  const suite = generateLateralityBenchmarkSuite();
  const [guardImplementation, suiteImplementation, benchmarkImplementation] =
    await Promise.all([
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "laterality-guard.ts",
        ),
      ),
      readFile(
        resolve(
          repositoryRoot,
          "packages",
          "motion-contract",
          "src",
          "laterality-benchmark.ts",
        ),
      ),
      readFile(fileURLToPath(import.meta.url)),
    ]);
  const results = LATERALITY_STRATEGIES.map((strategy) => ({
    strategy,
    evaluation: evaluateLateralityStrategy(strategy, suite),
    latencyMicroseconds: measureLatency(strategy, suite),
  }));
  const guarded = results.find(
    ({ strategy }) => strategy === "anatomical-axis-continuity-guard",
  ).evaluation;
  const trusted = results.find(
    ({ strategy }) => strategy === "trust-provider-names",
  ).evaluation;
  return {
    format: "vcg-motion-laterality-evidence",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    motionApiSchemaVersion: MOTION_API_SCHEMA_VERSION,
    guardVersion: LATERALITY_GUARD_VERSION,
    implementation: {
      guardSha256: sha256(guardImplementation),
      suiteSha256: sha256(suiteImplementation),
      benchmarkSha256: sha256(benchmarkImplementation),
    },
    environment: {
      platform: platform(),
      architecture: arch(),
      node: process.version,
    },
    suite: {
      version: LATERALITY_BENCHMARK_VERSION,
      serializedSuiteSha256: sha256(
        Buffer.from(JSON.stringify(suite), "utf8"),
      ),
      containsRawFrames: false,
      source:
        "deterministic generated normalized core17 adversarial transformations",
      scenarioCount: suite.length,
      updateCount: countLateralityBenchmarkUpdates(suite),
      categories: [
        "clear-frontal",
        "full-anatomical-swap",
        "distal-only-swap",
        "mild-turn",
        "profile-ambiguity",
        "crossed-arms",
        "self-occlusion",
      ].map((category) => ({
        category,
        count: suite.filter((scenario) => scenario.category === category)
          .length,
      })),
    },
    method: {
      strategies: LATERALITY_STRATEGIES,
      guardParameters: LATERALITY_GUARD_DEFAULTS,
      warmupPasses,
      measuredPasses,
      latencyBoundary:
        "one strategy update over one pre-generated core17 skeleton",
      latencyTimer: "node-performance-now",
      latencySummaryMethod: "linear-interpolation-r7",
      truthVisibility:
        "expected prediction exists only in evaluator scenario metadata and is never passed to either strategy",
      ambiguityPolicy:
        "never relabel left as right; emit an explicit block when named torso axes reverse, collapse, or disappear",
      outputAuthority:
        "research labels and suppression evidence only; no MotionAction wire or gameplay authority",
    },
    results,
    findings: {
      exactScenariosBefore: trusted.totals.exact,
      exactScenariosAfter: guarded.totals.exact,
      unsafeDirectionalEventsBefore:
        trusted.totals.unsafeDirectionalEvents,
      unsafeDirectionalEventsAfter: guarded.totals.unsafeDirectionalEvents,
      fullSwapExplicitBlocks: guarded.scenarios.filter(
        ({ category, prediction }) =>
          category === "full-anatomical-swap" && prediction === "blocked",
      ).length,
      profileExplicitBlocks: guarded.scenarios.filter(
        ({ category, prediction }) =>
          category === "profile-ambiguity" && prediction === "blocked",
      ).length,
      distalSwapUnsafeDirectionalEvents: guarded.scenarios.filter(
        ({ category, prediction }) =>
          category === "distal-only-swap" &&
          !["none", "blocked"].includes(prediction),
      ).length,
      distalSwapSilentSuppressions: guarded.scenarios.filter(
        ({ category, prediction }) =>
          category === "distal-only-swap" && prediction === "none",
      ).length,
      mildTurnMisses: guarded.scenarios.filter(
        ({ category, exact }) => category === "mild-turn" && !exact,
      ).length,
      selfOcclusionExact: guarded.scenarios.filter(
        ({ category, exact }) => category === "self-occlusion" && exact,
      ).length,
    },
    claimBoundary:
      "Camera-free transformation evidence only. It does not measure provider anatomical consistency, real turns or self-occlusion, real-player confusion, backend parity, action accuracy, camera latency, or target hardware.",
    limitations: [
      "The suite mutates generated landmarks and does not reproduce a detector's correlated errors.",
      "A full-name swap is an injected fault, not an observed provider failure rate.",
      "Horizontal compression is only a two-dimensional proxy for body yaw and perspective.",
      "The torso-axis guard detects full anatomical reversal and strong foreshortening but cannot detect distal-only swaps while torso names stay stable.",
      "Mild-turn misses show the underlying fixed thresholds are not rotation-qualified.",
      "Crossed-arm and wrist-occlusion paths omit clothing, depth, blur, and duplicate detections.",
      "Explicit suppression is safer than a wrong directional event but still requires visible feedback and controller recovery.",
      "No identity association, smoothing, floor calibration, action lifecycle, game context, or multi-player authority is included.",
      "JavaScript timing excludes calibration, capture, inference, IPC, rendering, and games.",
      "One Windows x64 host does not qualify native Rust or target-Linux performance.",
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
  throw new Error("usage: benchmark-motion-laterality.mjs [--output <path>]");
}
const output = requireBoundedOutput(argumentsList[1]);
await mkdir(resolve(output, ".."), { recursive: true });
const report = await buildReport();
const pending = `${output}.pending`;
await writeFile(pending, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await rename(pending, output);
console.log(relative(repositoryRoot, output).replaceAll("\\", "/"));
