import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRetroStarterCandidateScreen,
} from "./generate-retro-starter-candidate-screen.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "compliance/retro-starter-candidates/candidate-screen-v1.json",
);
export const RETRO_STARTER_SCREEN_MAX_BYTES = 96 * 1024;

export function parseCanonicalRetroStarterScreen(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= RETRO_STARTER_SCREEN_MAX_BYTES,
    "candidate screen byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "candidate screen must be canonical JSON without duplicate or reordered fields",
  );
  return value;
}

export function validateRetroStarterCandidateScreen(value) {
  assert.deepEqual(
    value,
    buildRetroStarterCandidateScreen(),
    "candidate screen must match the exact reviewed fail-closed evidence",
  );
  assert.ok(
    value.candidates.every(
      ({ admissionStatus }) => admissionStatus === "blocked",
    ),
    "every screened candidate must remain blocked",
  );
  assert.equal(value.summary.admittedCount, 0);
  assert.equal(value.summary.packageMutationCount, 0);
  assert.equal(value.summary.downloadedArtifactCount, 0);
  return value;
}

export async function validateTrackedRetroStarterCandidateScreen() {
  const bytes = await readFile(artifactPath);
  return validateRetroStarterCandidateScreen(
    parseCanonicalRetroStarterScreen(bytes),
  );
}

async function main() {
  const artifact = await validateTrackedRetroStarterCandidateScreen();
  console.log(
    `validated retro starter candidate screen; candidates=${artifact.summary.candidateCount}; admitted=${artifact.summary.admittedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
