import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOTION_GAMEPAD_EVIDENCE_FORMAT,
  generateMotionGamepadEvidence,
} from "./generate-motion-gamepad-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/motion-gamepad/camera-free-three-genre-v1.json",
);
const MAX_ARTIFACT_BYTES = 96 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

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

function validateMappingResults(results) {
  assert.ok(Array.isArray(results) && results.length === 3);
  assert.deepEqual(
    results.map(({ mappingId }) => mappingId),
    [
      "platformer-lean-actions-v1",
      "racing-steer-only-v1",
      "arcade-lean-actions-v1",
    ],
    "mapping results must contain the exact ordered three-genre contract",
  );
  const expectedChecks = [5, 3, 4];
  for (const [index, result] of results.entries()) {
    const path = `artifact.mappingResults[${index}]`;
    exactKeys(
      result,
      [
        "mappingId",
        "genre",
        "coverage",
        "requiredFunctions",
        "missingFunctions",
        "disposition",
        "playTestCompleted",
        "measuredEndToEndLatencyMs",
        "comfortFinding",
        "checks",
      ],
      path,
    );
    assert.equal(result.playTestCompleted, false, `${path}.playTestCompleted must be false`);
    assert.equal(
      result.measuredEndToEndLatencyMs,
      null,
      `${path}.measuredEndToEndLatencyMs must remain null`,
    );
    assert.equal(result.comfortFinding, null, `${path}.comfortFinding must remain null`);
    assert.ok(Array.isArray(result.checks) && result.checks.length === expectedChecks[index]);
    for (const [checkIndex, check] of result.checks.entries()) {
      exactKeys(check, ["id", "passed", "detail"], `${path}.checks[${checkIndex}]`);
      assert.equal(check.passed, true, `${path}.checks[${checkIndex}].passed must be true`);
    }
  }
  assert.equal(results[0].coverage, "candidate-complete");
  assert.equal(results[0].disposition, "camera-free-software-path-only");
  assert.equal(results[1].coverage, "incomplete");
  assert.equal(results[1].disposition, "unsupported");
  assert.deepEqual(results[1].missingFunctions, [
    "continuous-throttle",
    "continuous-brake",
  ]);
  assert.equal(results[2].coverage, "candidate-complete");
  assert.equal(results[2].disposition, "camera-free-software-path-only");
}

function validateOutput(output, path) {
  exactKeys(
    output,
    [
      "schemaVersion",
      "mappingId",
      "gameId",
      "researchOnly",
      "sequence",
      "occurredAtMs",
      "state",
      "releaseReason",
      "axes",
      "buttons",
      "blockedActions",
      "staleActions",
      "repeatedActions",
    ],
    path,
  );
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.researchOnly, true);
  exactKeys(output.axes, ["leftStickX"], `${path}.axes`);
  exactKeys(
    output.buttons,
    ["south", "west", "leftShoulder", "rightShoulder", "dpadDown"],
    `${path}.buttons`,
  );
  for (const reserved of ["home", "back", "pause"]) {
    assert.ok(!(reserved in output.buttons), `${path}.buttons must not expose ${reserved}`);
  }
}

function validateProvenance(provenance) {
  exactKeys(
    provenance,
    [
      "implementationPath",
      "contractTestPath",
      "generatorPath",
      "validatorPath",
      "implementationSha256",
      "contractTestSha256",
      "generatorSha256",
      "validatorSha256",
    ],
    "artifact.provenance",
  );
  assert.deepEqual(
    {
      implementationPath: provenance.implementationPath,
      contractTestPath: provenance.contractTestPath,
      generatorPath: provenance.generatorPath,
      validatorPath: provenance.validatorPath,
    },
    {
      implementationPath: "packages/motion-contract/src/gamepad-emulation.ts",
      contractTestPath: "packages/motion-contract/tests/gamepad-emulation.test.ts",
      generatorPath: "scripts/generate-motion-gamepad-evidence.mjs",
      validatorPath: "scripts/validate-motion-gamepad-evidence.mjs",
    },
  );
  for (const key of [
    "implementationSha256",
    "contractTestSha256",
    "generatorSha256",
    "validatorSha256",
  ]) {
    assert.match(provenance[key], SHA256_PATTERN, `artifact.provenance.${key} is invalid`);
  }
}

export function validateMotionGamepadEvidence(value, expected) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "policy",
      "mappingResults",
      "representativeOutputs",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, MOTION_GAMEPAD_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, "2026-07-24");
  assert.equal(value.evidenceClass, "camera-free-synthetic-adapter");
  assert.equal(value.qualification, "not-a-play-test");
  exactKeys(
    value.policy,
    [
      "exactTitleMappingRequired",
      "exactAuthorizedPlayerRequired",
      "trackerReadyRequired",
      "shellActionsDeliverableToGame",
      "reservedHomeBackPauseDeliverableToGame",
      "incompleteMappingLaunchable",
      "nativeVirtualDeviceImplemented",
    ],
    "artifact.policy",
  );
  assert.deepEqual(value.policy, {
    exactTitleMappingRequired: true,
    exactAuthorizedPlayerRequired: true,
    trackerReadyRequired: true,
    shellActionsDeliverableToGame: false,
    reservedHomeBackPauseDeliverableToGame: false,
    incompleteMappingLaunchable: false,
    nativeVirtualDeviceImplemented: false,
  });
  validateMappingResults(value.mappingResults);
  exactKeys(
    value.representativeOutputs,
    [
      "platformerActive",
      "platformerReleased",
      "platformerShellBlocked",
      "platformerHealthReleased",
      "racingUnsupported",
      "arcadeActive",
      "arcadeAuthorityReleased",
    ],
    "artifact.representativeOutputs",
  );
  for (const [key, output] of Object.entries(value.representativeOutputs)) {
    validateOutput(output, `artifact.representativeOutputs.${key}`);
  }
  exactKeys(
    value.summary,
    [
      "genreCount",
      "checkCount",
      "passedCheckCount",
      "candidateSoftwarePathCount",
      "unsupportedCount",
      "completedPlayTestCount",
      "measuredLatencyCount",
      "comfortFindingCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    genreCount: 3,
    checkCount: 12,
    passedCheckCount: 12,
    candidateSoftwarePathCount: 2,
    unsupportedCount: 1,
    completedPlayTestCount: 0,
    measuredLatencyCount: 0,
    comfortFindingCount: 0,
  });
  validateProvenance(value.provenance);
  assert.ok(Array.isArray(value.limitations) && value.limitations.length === 5);
  assert.deepEqual(value, expected, "artifact must exactly match deterministic evidence");
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES, "artifact byte size is invalid");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function validateTrackedMotionGamepadEvidence() {
  const [bytes, expected] = await Promise.all([
    readFile(artifactPath),
    generateMotionGamepadEvidence(),
  ]);
  return validateMotionGamepadEvidence(parseBoundedJson(bytes), expected);
}

async function main() {
  const artifact = await validateTrackedMotionGamepadEvidence();
  console.log(
    `validated ${artifact.summary.genreCount} genres / ${artifact.summary.checkCount} checks; ${artifact.summary.completedPlayTestCount} play tests claimed`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
