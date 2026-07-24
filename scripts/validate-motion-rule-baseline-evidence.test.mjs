import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMotionRuleBaselineEvidence,
  validateTrackedMotionRuleBaselineEvidence,
} from "./validate-motion-rule-baseline-evidence.mjs";

async function fixture() {
  const report = structuredClone(
    await validateTrackedMotionRuleBaselineEvidence(),
  );
  const expectedDigests = {
    recognizerSha256: report.implementation.recognizerSha256,
    suiteSha256: report.implementation.suiteSha256,
    benchmarkSha256: report.implementation.benchmarkSha256,
  };
  return { report, expectedDigests };
}

test("accepts the tracked hash-bound synthetic rule evidence", async () => {
  const { report } = await fixture();
  assert.equal(report.evaluation.fixtures.length, 5);
});

test("rejects a raw-frame claim", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsRawFrames = true;
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /containsRawFrames/,
  );
});

test("rejects truth-label exposure to the recognizer", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.truthVisibility = "expected movement passed to recognizer";
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /truthVisibility/,
  );
});

test("rejects suite substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.serializedSuiteSha256 = "a".repeat(64);
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /serializedSuiteSha256/,
  );
});

test("rejects implementation substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.implementation.recognizerSha256 = "b".repeat(64);
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /recognizerSha256/,
  );
});

test("rejects deterministic trial-result substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.evaluation.fixtures[0].trials[0].emittedMovements = [];
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /evaluation SHA-256/,
  );
});

test("rejects promotion of punch into the standardized mapping", async () => {
  const { report, expectedDigests } = await fixture();
  report.mappingBoundary.standardizedCandidates.punch_left = "punch_left";
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /standardizedCandidates keys/,
  );
});

test("rejects hidden camera-shift false positives", async () => {
  const { report, expectedDigests } = await fixture();
  report.findings.globalUpwardShiftFalseJumpFixtures = 0;
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /globalUpwardShiftFalseJumpFixtures/,
  );
});

test("rejects non-monotonic latency summaries", async () => {
  const { report, expectedDigests } = await fixture();
  report.latencyMicroseconds.p99 = report.latencyMicroseconds.p50 / 2;
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /percentiles must be monotonic/,
  );
});

test("rejects undeclared report fields", async () => {
  const { report, expectedDigests } = await fixture();
  report.rawVideo = true;
  assert.throws(
    () => validateMotionRuleBaselineEvidence(report, expectedDigests),
    /report keys must be exactly/,
  );
});
