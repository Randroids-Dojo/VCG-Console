import assert from "node:assert/strict";
import test from "node:test";

import {
  validateObservationConfidenceEvidence,
  validateTrackedObservationConfidenceEvidence,
} from "./validate-observation-confidence-evidence.mjs";

async function fixture() {
  const report = structuredClone(
    await validateTrackedObservationConfidenceEvidence(),
  );
  const expectedDigests = {
    gateSha256: report.implementation.gateSha256,
    suiteSha256: report.implementation.suiteSha256,
    benchmarkSha256: report.implementation.benchmarkSha256,
  };
  return { report, expectedDigests };
}

test("accepts the tracked hash-bound confidence evidence", async () => {
  const { report } = await fixture();
  assert.equal(report.results.length, 2);
});

test("rejects raw-frame claims", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsRawFrames = true;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /containsRawFrames/,
  );
});

test("rejects coordinate claims", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.containsCoordinates = true;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /containsCoordinates/,
  );
});

test("rejects truth leakage", async () => {
  const { report, expectedDigests } = await fixture();
  report.method.truthVisibility = "expected state passed to strategy";
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /truthVisibility/,
  );
});

test("rejects implementation substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.implementation.gateSha256 = "a".repeat(64);
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /gateSha256/,
  );
});

test("rejects suite substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.suite.serializedSuiteSha256 = "b".repeat(64);
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /serializedSuiteSha256/,
  );
});

test("rejects result substitution", async () => {
  const { report, expectedDigests } = await fixture();
  report.results[1].scenarios[0].predictions[0] = true;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /results\[1\] SHA-256/,
  );
});

test("rejects hidden unsafe availability", async () => {
  const { report, expectedDigests } = await fixture();
  report.findings.unsafeAvailableAfter = 1;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /unsafeAvailableAfter/,
  );
});

test("rejects hidden availability cost", async () => {
  const { report, expectedDigests } = await fixture();
  report.findings.falseUnavailableAfter = 0;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /falseUnavailableAfter/,
  );
});

test("rejects undeclared report fields", async () => {
  const { report, expectedDigests } = await fixture();
  report.selectedProductionThreshold = 0.5;
  assert.throws(
    () => validateObservationConfidenceEvidence(report, expectedDigests),
    /report keys must be exactly/,
  );
});
