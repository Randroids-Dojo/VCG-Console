import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCommunityAdmissionEvidence,
  COMMUNITY_ADMISSION_DATE,
} from "./generate-community-admission-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/community-admission/community-admission-exercise-v1.json",
);
const MAX_ARTIFACT_BYTES = 128 * 1024;

export async function validateCommunityAdmissionEvidence(value) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "artifact must be an object",
  );
  assert.equal(typeof value.generatedAtUtc, "string");
  assert.ok(Number.isFinite(Date.parse(value.generatedAtUtc)));
  assert.ok(value.generatedAtUtc.startsWith(`${COMMUNITY_ADMISSION_DATE}T`));
  const expected = await buildCommunityAdmissionEvidence(value.generatedAtUtc);
  assert.deepEqual(
    value,
    expected,
    "community admission evidence must match the exact current exercise",
  );
  return value;
}

function parseCanonicalBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "artifact must be canonical JSON with no duplicate or reordered fields",
  );
  return value;
}

export async function validateTrackedCommunityAdmissionEvidence() {
  const bytes = await readFile(artifactPath);
  return validateCommunityAdmissionEvidence(parseCanonicalBoundedJson(bytes));
}

async function main() {
  const artifact = await validateTrackedCommunityAdmissionEvidence();
  console.log(
    `validated isolated community admission exercise; submissions=${artifact.summary.submissionCount}; approved=${artifact.summary.productApprovedCount}; productionMutations=${artifact.summary.productionCatalogMutationCount + artifact.summary.productionPackageMutationCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
