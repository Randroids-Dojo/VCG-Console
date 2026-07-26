import assert from "node:assert/strict";
import test from "node:test";

import {
  validateIdentityTrackerComparison,
  validateTrackedIdentityTrackerComparison,
} from "./validate-identity-tracker-comparison.mjs";

async function fixture() {
  const report = structuredClone(
    await validateTrackedIdentityTrackerComparison(),
  );
  const expectedDigests = {
    trackerSha256: report.implementation.trackerSha256,
    suiteSha256: report.implementation.suiteSha256,
    benchmarkSha256: report.implementation.benchmarkSha256,
  };
  return { report, expectedDigests };
}

test("accepts the tracked hash-bound synthetic comparison", async () => {
  const { report } = await fixture();
  assert.equal(report.results.length, 5);
});

test("rejects a raw-frame claim", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsRawFrames = true;
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /containsRawFrames/,
  );
});

test("rejects truth-label exposure to the tracker", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.truthVisibility = "truthId supplied to tracker";
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /truthVisibility/,
  );
});

test("rejects scenario-suite substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.serializedScenarioSha256 = "a".repeat(64);
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /serializedScenarioSha256/,
  );
});

test("rejects implementation substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.implementation.trackerSha256 = "b".repeat(64);
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /trackerSha256/,
  );
});

test("rejects impossible identity arithmetic", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[0].metrics.totals.identityCorrectAssignments =
    report.results[0].metrics.totals.assignedObservations + 1;
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /identityCorrectAssignments/,
  );
});

test("rejects a full upstream ByteTrack claim", async () => {
  const { report, expectedDigests } = await fixture();
  report.results.at(-1).classification = "upstream ByteTrack";
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /must reject a full ByteTrack claim/,
  );
});

test("rejects non-monotonic latency summaries", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[0].latencyMicroseconds.p99 =
    report.results[0].latencyMicroseconds.p50 - 1;
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /percentiles must be monotonic/,
  );
});

test("rejects undeclared report fields", async () => {
  const { report, expectedDigests } = await fixture();
  report.appearanceEmbeddings = [];
  assert.throws(
    () => validateIdentityTrackerComparison(report, expectedDigests),
    /report keys must be exactly/,
  );
});
