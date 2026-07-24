import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMotionLateralityEvidence,
  validateTrackedMotionLateralityEvidence,
} from "./validate-motion-laterality-evidence.mjs";

async function fixture() {
  const report = structuredClone(
    await validateTrackedMotionLateralityEvidence(),
  );
  const expectedDigests = {
    guardSha256: report.implementation.guardSha256,
    suiteSha256: report.implementation.suiteSha256,
    benchmarkSha256: report.implementation.benchmarkSha256,
  };
  return { report, expectedDigests };
}

test("accepts the tracked hash-bound synthetic laterality evidence", async () => {
  const { report } = await fixture();
  assert.equal(report.results.length, 2);
});

test("rejects a raw-frame claim", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsRawFrames = true;
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /containsRawFrames/,
  );
});

test("rejects truth exposure to either strategy", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.truthVisibility = "expected prediction supplied to strategy";
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /truthVisibility/,
  );
});

test("rejects suite substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.serializedSuiteSha256 = "a".repeat(64);
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /serializedSuiteSha256/,
  );
});

test("rejects guard implementation substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.implementation.guardSha256 = "b".repeat(64);
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /guardSha256/,
  );
});

test("rejects confusion-result substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[1].evaluation.scenarios[0].prediction = "none";
  report.results[1].evaluation.scenarios[0].exact = false;
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /evaluation SHA-256/,
  );
});

test("rejects relabel-instead-of-block policy", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.ambiguityPolicy = "guess left/right from screen position";
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /ambiguityPolicy/,
  );
});

test("rejects hidden distal-swap residual failures", async () => {
  const { report, expectedDigests } = await fixture();
  report.findings.distalSwapUnsafeDirectionalEvents = 0;
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /distalSwapUnsafeDirectionalEvents/,
  );
});

test("rejects non-monotonic timing", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[0].latencyMicroseconds.p99 =
    report.results[0].latencyMicroseconds.p50 / 2;
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /percentiles must be monotonic/,
  );
});

test("rejects undeclared report fields", async () => {
  const { report, expectedDigests } = await fixture();
  report.faceOrientation = [];
  assert.throws(
    () => validateMotionLateralityEvidence(report, expectedDigests),
    /report keys must be exactly/,
  );
});
