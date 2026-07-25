import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRuntimePayloadScorecardSummary,
  generateRuntimePayloadScorecard,
  RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES,
  RUNTIME_PAYLOAD_SCORECARD_DATE,
  RUNTIME_PAYLOAD_SCORECARD_FORMAT,
  RUNTIME_PAYLOAD_SCORECARD_LIMITATIONS,
  RUNTIME_PAYLOAD_SCORECARD_PAYLOADS,
  RUNTIME_PAYLOAD_SCORECARD_RUBRIC,
  RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS,
  runtimePayloadScorecardObservationSha256,
} from "./generate-runtime-payload-scorecard.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/runtime-scorecard/runtime-payload-scorecard-desk-baseline-v1.json",
);
export const RUNTIME_PAYLOAD_SCORECARD_MAX_BYTES = 256 * 1024;
const expected = await generateRuntimePayloadScorecard();

function exactKeys(value, expectedKeys, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value),
    expectedKeys,
    `${label} has unknown or missing fields`,
  );
}

export function parseCanonicalRuntimePayloadScorecard(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= RUNTIME_PAYLOAD_SCORECARD_MAX_BYTES,
    "runtime payload scorecard byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "runtime payload scorecard must be canonical JSON",
  );
  return value;
}

export function validateRuntimePayloadScorecard(value) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "policy",
      "provenance",
      "scope",
      "rubric",
      "subjects",
      "observationSha256",
      "summary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, RUNTIME_PAYLOAD_SCORECARD_FORMAT);
  assert.equal(value.evidenceDate, RUNTIME_PAYLOAD_SCORECARD_DATE);
  assert.equal(
    value.evidenceClass,
    "source-browser-and-export-derived-prequalification-scorecard",
  );
  assert.equal(value.qualification, "zero-final-payload-selections");
  assert.deepEqual(value.policy, expected.policy);
  assert.deepEqual(value.provenance, expected.provenance);
  assert.deepEqual(value.scope, {
    investigation: "I-182",
    decision: "D-057",
    subjectIds: [...RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS],
    targetArchitectures: [...RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES],
    candidatePayloads: [...RUNTIME_PAYLOAD_SCORECARD_PAYLOADS],
    targetHardwareRuns: 0,
    physicalControllerRuns: 0,
    participantRuns: 0,
  });
  assert.deepEqual(
    value.rubric,
    structuredClone(RUNTIME_PAYLOAD_SCORECARD_RUBRIC),
    "runtime rubric drifted",
  );
  assert.deepEqual(
    value.subjects,
    expected.subjects,
    "scorecard subjects do not exactly match bound evidence",
  );
  assert.deepEqual(
    value.subjects.map((subject) => subject.id),
    [...RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS],
  );
  for (const subject of value.subjects) {
    assert.deepEqual(
      subject.rubricAssessments.map((assessment) => assessment.id),
      RUNTIME_PAYLOAD_SCORECARD_RUBRIC.map((entry) => entry.id),
      `${subject.id} rubric coverage drifted`,
    );
    assert.deepEqual(
      subject.payloadCandidates.map((candidate) => candidate.payload),
      [...RUNTIME_PAYLOAD_SCORECARD_PAYLOADS],
      `${subject.id} payload ordering drifted`,
    );
    for (const candidate of subject.payloadCandidates) {
      assert.deepEqual(
        candidate.architectures.map((cell) => cell.architecture),
        [...RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES],
        `${subject.id}/${candidate.payload} architecture ordering drifted`,
      );
      assert.ok(
        candidate.architectures.every((cell) => cell.qualified === false),
        `${subject.id}/${candidate.payload} cannot claim a qualified target cell`,
      );
    }
    assert.equal(subject.selection.status, "blocked");
    assert.equal(subject.selection.selectedPayload, null);
    assert.equal(subject.selection.exception, null);
    assert.equal(subject.selection.maintenanceEstimate, null);
    assert.ok(subject.selection.blockerCodes.length >= 8);
    assert.equal(
      subject.serviceAndAuthority.admissionAuthorityGranted,
      false,
    );
    assert.equal(subject.serviceAndAuthority.hostAuthorityGranted, false);
  }
  assert.match(value.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    value.observationSha256,
    runtimePayloadScorecardObservationSha256(value.subjects),
    "observation digest does not bind the scorecard subjects",
  );
  assert.deepEqual(
    value.summary,
    buildRuntimePayloadScorecardSummary(value.subjects),
    "scorecard summary does not match the subjects",
  );
  assert.deepEqual(value.summary, expected.summary);
  assert.equal(value.summary.subjectCount, 5);
  assert.equal(value.summary.payloadCandidateCount, 10);
  assert.equal(value.summary.targetCellCount, 20);
  assert.equal(value.summary.targetQualifiedCellCount, 0);
  assert.equal(value.summary.finalSelectionCount, 0);
  assert.equal(value.summary.maintenanceEstimateCount, 0);
  assert.equal(value.summary.admissionAuthorityCount, 0);
  assert.equal(value.summary.hostAuthorityCount, 0);
  assert.equal(value.summary.productionCatalogMutationCount, 0);
  assert.deepEqual(value.limitations, [
    ...RUNTIME_PAYLOAD_SCORECARD_LIMITATIONS,
  ]);
  return value;
}

export async function validateTrackedRuntimePayloadScorecard() {
  return validateRuntimePayloadScorecard(
    parseCanonicalRuntimePayloadScorecard(await readFile(artifactPath)),
  );
}

async function main() {
  const artifact = await validateTrackedRuntimePayloadScorecard();
  console.log(
    `validated runtime payload scorecard; subjects=${artifact.summary.subjectCount}; cells=${artifact.summary.targetCellCount}; qualified=${artifact.summary.targetQualifiedCellCount}; selections=${artifact.summary.finalSelectionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
