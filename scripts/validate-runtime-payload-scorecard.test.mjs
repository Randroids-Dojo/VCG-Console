import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimePayloadScorecardSummary,
  runtimePayloadScorecardObservationSha256,
} from "./generate-runtime-payload-scorecard.mjs";
import {
  parseCanonicalRuntimePayloadScorecard,
  RUNTIME_PAYLOAD_SCORECARD_MAX_BYTES,
  validateRuntimePayloadScorecard,
  validateTrackedRuntimePayloadScorecard,
} from "./validate-runtime-payload-scorecard.mjs";

const tracked = await validateTrackedRuntimePayloadScorecard();

function clone() {
  return structuredClone(tracked);
}

function reseal(artifact) {
  artifact.observationSha256 = runtimePayloadScorecardObservationSha256(
    artifact.subjects,
  );
  artifact.summary = buildRuntimePayloadScorecardSummary(artifact.subjects);
}

test("accepts the exact five-subject zero-selection scorecard", () => {
  const artifact = validateRuntimePayloadScorecard(clone());
  assert.equal(artifact.summary.subjectCount, 5);
  assert.equal(artifact.summary.payloadCandidateCount, 10);
  assert.equal(artifact.summary.targetCellCount, 20);
  assert.equal(artifact.summary.targetQualifiedCellCount, 0);
  assert.equal(artifact.summary.finalSelectionCount, 0);
});

test("rejects subject omission, reordering, or identity substitution", () => {
  const omitted = clone();
  omitted.subjects.pop();
  reseal(omitted);
  assert.throws(
    () => validateRuntimePayloadScorecard(omitted),
    /bound evidence/u,
  );

  const reordered = clone();
  [reordered.subjects[0], reordered.subjects[1]] = [
    reordered.subjects[1],
    reordered.subjects[0],
  ];
  reseal(reordered);
  assert.throws(
    () => validateRuntimePayloadScorecard(reordered),
    /bound evidence/u,
  );

  const identity = clone();
  identity.subjects[0].id = "substituted";
  reseal(identity);
  assert.throws(
    () => validateRuntimePayloadScorecard(identity),
    /bound evidence/u,
  );
});

test("rejects payload selection, exception, or maintenance promotion", () => {
  const selection = clone();
  selection.subjects[0].selection.status = "selected";
  selection.subjects[0].selection.selectedPayload = "bundled-web";
  reseal(selection);
  assert.throws(() => validateRuntimePayloadScorecard(selection));

  const exception = clone();
  exception.subjects[0].selection.exception = "ship remote instead";
  reseal(exception);
  assert.throws(() => validateRuntimePayloadScorecard(exception));

  const maintenance = clone();
  maintenance.subjects[0].selection.maintenanceEstimate = {
    hoursPerMonth: 1,
  };
  reseal(maintenance);
  assert.throws(() => validateRuntimePayloadScorecard(maintenance));
});

test("rejects target execution, performance, input, offline, or qualification promotion", () => {
  for (const [field, value] of [
    ["executionStatus", "target-qualified"],
    ["performanceStatus", "qualified"],
    ["inputStatus", "physical-controller-qualified"],
    ["offlineStatus", "complete-offline-play"],
  ]) {
    const artifact = clone();
    artifact.subjects[4].payloadCandidates[1].architectures[1][field] = value;
    reseal(artifact);
    assert.throws(() => validateRuntimePayloadScorecard(artifact));
  }

  const qualified = clone();
  qualified.subjects[4].payloadCandidates[1].architectures[1].qualified = true;
  reseal(qualified);
  assert.throws(() => validateRuntimePayloadScorecard(qualified));
});

test("rejects public source, browser, service, or input evidence drift", () => {
  const source = clone();
  source.subjects[0].source.totalBytes += 1;
  reseal(source);
  assert.throws(() => validateRuntimePayloadScorecard(source));

  const browser = clone();
  browser.subjects[1].measurements.offlineReloadOutcome = "loaded";
  reseal(browser);
  assert.throws(() => validateRuntimePayloadScorecard(browser));

  const service = clone();
  service.subjects[2].serviceAndAuthority.serviceSignalCounts.ai = 0;
  reseal(service);
  assert.throws(() => validateRuntimePayloadScorecard(service));

  const input = clone();
  input.subjects[0].measurements.gamepadApiPollCount += 1;
  reseal(input);
  assert.throws(() => validateRuntimePayloadScorecard(input));
});

test("rejects obstacle-source or Godot-export substitution", () => {
  const obstacle = clone();
  obstacle.subjects[3].source.files[0].sha256 = "0".repeat(64);
  reseal(obstacle);
  assert.throws(() => validateRuntimePayloadScorecard(obstacle));

  const godot = clone();
  godot.subjects[4].measurements.linuxArm64ExportBytes += 1;
  reseal(godot);
  assert.throws(() => validateRuntimePayloadScorecard(godot));
});

test("rejects rights, admission, host-authority, or production promotion", () => {
  const rights = clone();
  rights.subjects[0].serviceAndAuthority.redistributionStatus = "approved";
  rights.subjects[0].serviceAndAuthority.ownerAuthorizationStatus = "recorded";
  reseal(rights);
  assert.throws(() => validateRuntimePayloadScorecard(rights));

  const authority = clone();
  authority.subjects[0].serviceAndAuthority.admissionAuthorityGranted = true;
  authority.subjects[0].serviceAndAuthority.hostAuthorityGranted = true;
  reseal(authority);
  assert.throws(() => validateRuntimePayloadScorecard(authority));

  const production = clone();
  production.policy.productionCatalogMutation = true;
  assert.throws(() => validateRuntimePayloadScorecard(production));
});

test("rejects provenance, rubric, digest, summary, or limitation drift", () => {
  const provenance = clone();
  provenance.provenance.godotExportArtifactSha256 = "0".repeat(64);
  assert.throws(() => validateRuntimePayloadScorecard(provenance));

  const rubric = clone();
  rubric.rubric[0].requiredEvidence.pop();
  assert.throws(() => validateRuntimePayloadScorecard(rubric));

  const digest = clone();
  digest.subjects[0].title = "changed";
  assert.throws(
    () => validateRuntimePayloadScorecard(digest),
    /bound evidence|observation digest/u,
  );

  const summary = clone();
  summary.summary.finalSelectionCount = 1;
  assert.throws(
    () => validateRuntimePayloadScorecard(summary),
    /summary/u,
  );

  const limitations = clone();
  limitations.limitations.pop();
  assert.throws(() => validateRuntimePayloadScorecard(limitations));
});

test("rejects unknown fields and requires bounded canonical UTF-8 JSON", () => {
  const unknown = clone();
  unknown.subjects[0].selection.implicitApproval = true;
  reseal(unknown);
  assert.throws(
    () => validateRuntimePayloadScorecard(unknown),
    /bound evidence/u,
  );

  const canonical = new TextEncoder().encode(
    `${JSON.stringify(tracked, null, 2)}\n`,
  );
  assert.deepEqual(parseCanonicalRuntimePayloadScorecard(canonical), tracked);
  assert.throws(
    () =>
      parseCanonicalRuntimePayloadScorecard(
        new TextEncoder().encode(JSON.stringify(tracked)),
      ),
    /canonical/u,
  );
  assert.throws(
    () =>
      parseCanonicalRuntimePayloadScorecard(
        new Uint8Array(RUNTIME_PAYLOAD_SCORECARD_MAX_BYTES + 1),
      ),
    /byte size/u,
  );
  assert.throws(
    () => parseCanonicalRuntimePayloadScorecard(new Uint8Array([0xff])),
  );
});
