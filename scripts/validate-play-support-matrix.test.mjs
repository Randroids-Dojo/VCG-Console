import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePlaySupportMatrix,
  validateTrackedPlaySupportMatrix,
} from "./validate-play-support-matrix.mjs";

async function fixture() {
  return structuredClone(await validateTrackedPlaySupportMatrix());
}

test("accepts the exact pinned seated, partial-body, and assisted matrix", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.scenarioCount, 7);
  assert.equal(artifact.summary.controlAssessmentCount, 42);
});

test("rejects a seated gameplay body-path authorization", async () => {
  const artifact = await fixture();
  artifact.scenarios[1].controls[3].supportLabel = "synthetic-motion-path";
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /cannot authorize a safety-blocked body path|alternateMapping must be null|exactly match/,
  );
});

test("rejects helper overlap that silently retains body control", async () => {
  const artifact = await fixture();
  artifact.scenarios[5].controls[0].safetyGate = "permitted";
  artifact.scenarios[5].controls[0].supportLabel = "synthetic-motion-path";
  artifact.scenarios[5].controls[0].alternateMapping = null;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /exactly match/,
  );
});

test("rejects landmark extrapolation authority", async () => {
  const artifact = await fixture();
  artifact.policy.silentLandmarkExtrapolationAuthorized = true;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /expected false|Invalid input/,
  );
});

test("rejects silent score normalization", async () => {
  const artifact = await fixture();
  artifact.policy.silentScoreNormalizationAuthorized = true;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /expected false|Invalid input/,
  );
});

test("rejects new body alternate-mapping authority", async () => {
  const artifact = await fixture();
  artifact.policy.newBodyAlternateMappingsAuthorized = true;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /expected false|Invalid input/,
  );
});

test("rejects remapping reserved controls", async () => {
  const artifact = await fixture();
  artifact.policy.reservedHomeBackPauseRemappable = true;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /expected false|Invalid input/,
  );
});

test("rejects an implicit controller alternate", async () => {
  const artifact = await fixture();
  artifact.scenarios[1].controls[3].alternateMapping = null;
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /alternateMapping must be explicit/,
  );
});

test("rejects substituted or reordered scenarios", async () => {
  const artifact = await fixture();
  artifact.scenarios.reverse();
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /every frozen scenario exactly once and in order/,
  );
});

test("rejects stale implementation provenance", async () => {
  const artifact = await fixture();
  const expectedProvenance = structuredClone(artifact.provenance);
  artifact.provenance.implementationSha256 = "0".repeat(64);
  assert.throws(
    () => validatePlaySupportMatrix(artifact, expectedProvenance),
    /provenance hashes must match sources/,
  );
});

test("rejects undeclared artifact fields", async () => {
  const artifact = await fixture();
  artifact.selectedBodyMapping = "raise-right-hand-for-jump";
  assert.throws(
    () => validatePlaySupportMatrix(artifact, artifact.provenance),
    /Unrecognized key/,
  );
});
