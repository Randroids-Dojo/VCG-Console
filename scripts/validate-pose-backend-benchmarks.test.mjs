import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePoseBackendComparison,
  validateTrackedPoseBackendReports,
} from "./validate-pose-backend-benchmarks.mjs";

async function fixture() {
  return structuredClone(await validateTrackedPoseBackendReports());
}

test("accepts the tracked pinned CPU comparison", async () => {
  const reports = await fixture();
  assert.equal(reports.length, 2);
});

test("rejects a raw-frame claim", async () => {
  const reports = await fixture();
  reports[0].workload.containsRawFrames = true;
  const expected = {
    implementation: reports[0].implementationSha256,
    lock: reports[0].dependencyLockSha256,
  };
  assert.throws(() => validatePoseBackendComparison(reports, expected), /containsRawFrames/);
});

test("rejects cross-backend workload drift", async () => {
  const reports = await fixture();
  reports[0].workload.suiteSha256 = "a".repeat(64);
  const expected = {
    implementation: reports[0].implementationSha256,
    lock: reports[0].dependencyLockSha256,
  };
  assert.throws(() => validatePoseBackendComparison(reports, expected), /cross-report workload/);
});

test("rejects an unqualified provider", async () => {
  const reports = await fixture();
  const rtmo = reports.find((report) => report.backend.name === "rtmo-s");
  rtmo.backend.provider = "CUDAExecutionProvider";
  const expected = {
    implementation: reports[0].implementationSha256,
    lock: reports[0].dependencyLockSha256,
  };
  assert.throws(() => validatePoseBackendComparison(reports, expected), /CPUExecutionProvider/);
});

test("rejects non-monotonic latency percentiles", async () => {
  const reports = await fixture();
  reports[0].results.latencyMs.p99 = reports[0].results.latencyMs.p50 - 1;
  const expected = {
    implementation: reports[0].implementationSha256,
    lock: reports[0].dependencyLockSha256,
  };
  assert.throws(() => validatePoseBackendComparison(reports, expected), /percentiles must be monotonic/);
});

test("rejects undeclared fields", async () => {
  const reports = await fixture();
  reports[0].rawFrames = [];
  const expected = {
    implementation: reports[0].implementationSha256,
    lock: reports[0].dependencyLockSha256,
  };
  assert.throws(() => validatePoseBackendComparison(reports, expected), /report keys must be exactly/);
});
