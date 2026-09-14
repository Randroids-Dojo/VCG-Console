import { exactKeys } from "./evidence-primitives.mjs";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildOcraFontEvidence,
  OCRA_CLAIM_BOUNDARY,
  OCRA_EVIDENCE_FORMAT,
  OCRA_LIMITATIONS,
} from "./generate-ocra-font-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  root,
  "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json",
);
const MAX_ARTIFACT_BYTES = 256 * 1024;

export async function validateOcraFontEvidence(path = defaultArtifactPath) {
  const absolutePath = resolve(path);
  const metadata = await stat(absolutePath);
  assert.equal(metadata.isFile(), true, "artifact must be a file");
  assert.ok(metadata.size > 0 && metadata.size <= MAX_ARTIFACT_BYTES, "artifact size is invalid");
  const artifact = JSON.parse(await readFile(absolutePath, "utf8"));

  exactKeys(
    artifact,
    [
      "format",
      "evidenceDate",
      "subject",
      "parserLimits",
      "sfnt",
      "coverage",
      "provenance",
      "disposition",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(artifact.format, OCRA_EVIDENCE_FORMAT);
  assert.equal(artifact.claimBoundary, OCRA_CLAIM_BOUNDARY);
  assert.deepEqual(artifact.limitations, [...OCRA_LIMITATIONS]);
  assert.match(artifact.evidenceDate, /^\d{4}-\d{2}-\d{2}$/u);
  const date = new Date(artifact.evidenceDate);
  assert.ok(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === artifact.evidenceDate && date.valueOf() <= Date.now());
  assert.deepEqual(artifact, await buildOcraFontEvidence(artifact.evidenceDate));
  return artifact;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const artifact = await validateOcraFontEvidence(process.argv[2]);
  console.log(
    `validated ${artifact.subject.path}: ${artifact.sfnt.cmap.mappingCount} cmap code points; ` +
      `${artifact.coverage.summary.productionSourceNonAsciiMissingCount} fallback code points remain`,
  );
}
