import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EPOCH_CLAIM_BOUNDARY,
  EPOCH_ENTRYPOINT,
  EPOCH_EVIDENCE_DATE,
  EPOCH_EXPECTED_TITLE,
  EPOCH_LIMITATIONS,
  EPOCH_TOP_LEVEL_EVIDENCE_FORMAT,
} from "./generate-epoch-top-level-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/hosted-browser/epoch-top-level-windows-v3.json",
);
const MAX_ARTIFACT_BYTES = 64 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const provenancePaths = {
  supervisorPath: "scripts/hosted-browser-supervisor.ts",
  generatorPath: "scripts/generate-epoch-top-level-evidence.mjs",
  validatorPath: "scripts/validate-epoch-top-level-evidence.mjs",
};

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

export async function expectedEpochTopLevelProvenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

export function validateEpochTopLevelEvidence(value, expectedProvenance) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "environment",
      "response",
      "launchPolicy",
      "probe",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, EPOCH_TOP_LEVEL_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, EPOCH_EVIDENCE_DATE);
  assert.equal(
    value.evidenceClass,
    "live-windows-x64-supervised-top-level-load",
  );
  assert.equal(value.qualification, "top-level-load-only-not-playability");
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(value.retrievedAtUtc.startsWith(`${EPOCH_EVIDENCE_DATE}T`));

  exactKeys(
    value.environment,
    ["platform", "architecture", "nodeVersion", "browserVersion"],
    "artifact.environment",
  );
  assert.equal(value.environment.platform, "win32");
  assert.equal(value.environment.architecture, "x64");
  assert.match(value.environment.nodeVersion, /^v\d+\.\d+\.\d+$/);
  assert.match(
    value.environment.browserVersion,
    /^Chrome\/\d+\.\d+\.\d+\.\d+$/,
  );

  exactKeys(
    value.response,
    [
      "status",
      "finalUrl",
      "contentType",
      "contentSecurityPolicy",
      "xFrameOptions",
      "consoleOriginFramingAllowed",
    ],
    "artifact.response",
  );
  assert.deepEqual(value.response, {
    status: 200,
    finalUrl: EPOCH_ENTRYPOINT,
    contentType: "text/html; charset=utf-8",
    contentSecurityPolicy:
      "frame-ancestors 'self' https://randroid.dev https://www.randroid.dev",
    xFrameOptions: "ALLOW-FROM https://randroid.dev",
    consoleOriginFramingAllowed: false,
  });

  exactKeys(
    value.launchPolicy,
    [
      "schemaVersion",
      "gameId",
      "entrypoint",
      "allowedOrigins",
      "healthCheckUrl",
      "launchTimeoutMs",
    ],
    "artifact.launchPolicy",
  );
  assert.deepEqual(value.launchPolicy, {
    schemaVersion: 1,
    gameId: "epoch",
    entrypoint: EPOCH_ENTRYPOINT,
    allowedOrigins: ["https://epoch-theta.vercel.app"],
    healthCheckUrl: EPOCH_ENTRYPOINT,
    launchTimeoutMs: 15_000,
  });

  exactKeys(
    value.probe,
    [
      "loaded",
      "finalUrl",
      "title",
      "readyState",
      "browserProduct",
      "exitCode",
      "signal",
      "profileCreated",
      "profileRemoved",
    ],
    "artifact.probe",
  );
  assert.equal(value.probe.loaded, true);
  assert.equal(value.probe.finalUrl, EPOCH_ENTRYPOINT);
  assert.equal(value.probe.title, EPOCH_EXPECTED_TITLE);
  assert.equal(value.probe.readyState, "complete");
  assert.equal(value.probe.browserProduct, value.environment.browserVersion);
  assert.equal(value.probe.exitCode, 0);
  assert.equal(value.probe.signal, null);
  assert.equal(value.probe.profileCreated, true);
  assert.equal(value.probe.profileRemoved, true);

  exactKeys(
    value.disposition,
    [
      "consoleOriginFramingSupported",
      "supervisedTopLevelLoadVerified",
      "embeddingRequired",
      "headerChangeRequiredForTopLevel",
      "catalogPlayabilityVerified",
      "controllerExitVerified",
      "reservedHomeBackVerified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
    consoleOriginFramingSupported: false,
    supervisedTopLevelLoadVerified: true,
    embeddingRequired: false,
    headerChangeRequiredForTopLevel: false,
    catalogPlayabilityVerified: false,
    controllerExitVerified: false,
    reservedHomeBackVerified: false,
  });

  exactKeys(
    value.summary,
    [
      "httpSuccessCount",
      "topLevelLoadCount",
      "policyViolationCount",
      "playTestCount",
      "controllerTestCount",
      "participantCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    httpSuccessCount: 1,
    topLevelLoadCount: 1,
    policyViolationCount: 0,
    playTestCount: 0,
    controllerTestCount: 0,
    participantCount: 0,
  });

  exactKeys(
    value.provenance,
    [
      "supervisorPath",
      "supervisorPathSha256",
      "generatorPath",
      "generatorPathSha256",
      "validatorPath",
      "validatorPathSha256",
    ],
    "artifact.provenance",
  );
  assert.deepEqual(value.provenance, expectedProvenance);
  for (const [key, digest] of Object.entries(value.provenance)) {
    if (key.endsWith("Sha256")) assert.match(digest, SHA256_PATTERN);
  }
  assert.equal(value.claimBoundary, EPOCH_CLAIM_BOUNDARY);
  assert.deepEqual(value.limitations, EPOCH_LIMITATIONS);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function validateTrackedEpochTopLevelEvidence() {
  const [bytes, expectedProvenance] = await Promise.all([
    readFile(artifactPath),
    expectedEpochTopLevelProvenance(),
  ]);
  return validateEpochTopLevelEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
  );
}

async function main() {
  const artifact = await validateTrackedEpochTopLevelEvidence();
  console.log(
    `validated Epoch HTTP ${artifact.response.status} / ${artifact.probe.readyState} top-level load; ${artifact.summary.playTestCount} play tests claimed`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
