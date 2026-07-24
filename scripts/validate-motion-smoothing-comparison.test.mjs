import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMotionSmoothingComparison,
  validateTrackedMotionSmoothingComparison,
} from "./validate-motion-smoothing-comparison.mjs";

async function fixture() {
  const report = structuredClone(
    await validateTrackedMotionSmoothingComparison(),
  );
  const expectedDigests = {
    smootherSha256: report.implementation.smootherSha256,
    suiteSha256: report.implementation.suiteSha256,
    benchmarkSha256: report.implementation.benchmarkSha256,
  };
  return { report, expectedDigests };
}

test("accepts the tracked hash-bound synthetic smoothing comparison", async () => {
  const { report } = await fixture();
  assert.equal(report.results.length, 4);
});

test("rejects a raw-frame claim", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsRawFrames = true;
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /containsRawFrames/,
  );
});

test("rejects truth-coordinate exposure to the smoother", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.truthVisibility = "truth coordinates supplied to smoother";
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /truthVisibility/,
  );
});

test("rejects scenario-suite substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.serializedScenarioSha256 = "a".repeat(64);
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /serializedScenarioSha256/,
  );
});

test("rejects implementation substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.implementation.smootherSha256 = "b".repeat(64);
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /smootherSha256/,
  );
});

test("rejects deterministic metric substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[1].metrics.step.response90Milliseconds = 0;
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /response90Milliseconds/,
  );
});

test("rejects a fabricated backend-native result", async () => {
  const { report, expectedDigests } = await fixture();
  report.backendNative.status = "measured";
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /backendNative.status/,
  );
});

test("rejects non-monotonic latency summaries", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[0].latencyMicroseconds.p99 =
    report.results[0].latencyMicroseconds.p50 / 2;
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /percentiles must be monotonic/,
  );
});

test("rejects undeclared report fields", async () => {
  const { report, expectedDigests } = await fixture();
  report.videoFrames = [];
  assert.throws(
    () => validateMotionSmoothingComparison(report, expectedDigests),
    /report keys must be exactly/,
  );
});
