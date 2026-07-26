import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CALIBRATION_REHEARSAL_EVIDENCE_FORMAT,
  generateCalibrationRehearsalEvidence,
} from "./generate-calibration-rehearsal-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/calibration/camera-free-calibration-rehearsal-v1.json",
);
const MAX_ARTIFACT_BYTES = 128 * 1024;
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

const scenarioKeys = [
  "scenarioId",
  "terminalPhase",
  "terminalSampleCount",
  "dimensionStatuses",
  "issues",
  "guidedSteps",
  "readyLimited",
  "readyResultIssued",
  "requiredGuidanceSkipRejected",
  "staleAttemptRejected",
  "substitutedResultRejected",
  "firstConsumeAccepted",
  "replayConsumeRejected",
  "invalidationRevoked",
  "expiryRevoked",
];

function validateScenarios(scenarios) {
  assert.ok(Array.isArray(scenarios) && scenarios.length === 8);
  assert.deepEqual(
    scenarios.map(({ scenarioId }) => scenarioId),
    [
      "all-required-ready",
      "floor-guidance-required",
      "unsafe-zone-blocked",
      "optional-limited-fallback",
      "changed-room-revocation",
      "replaced-attempt-rejects-stale-sample",
      "exact-result-consumed-once",
      "expired-result-revoked",
    ],
  );
  for (const [index, scenario] of scenarios.entries()) {
    exactKeys(scenario, scenarioKeys, `artifact.scenarioResults[${index}]`);
    assert.ok(Array.isArray(scenario.dimensionStatuses));
    assert.deepEqual(
      scenario.dimensionStatuses.map(({ dimension }) => dimension),
      [
        "floor",
        "play-zone",
        "player-scale",
        "neutral-stance",
        "usable-range",
      ],
    );
    for (const [dimensionIndex, dimension] of
      scenario.dimensionStatuses.entries()) {
      exactKeys(
        dimension,
        ["dimension", "status", "confidence"],
        `artifact.scenarioResults[${index}].dimensionStatuses[${dimensionIndex}]`,
      );
    }
  }

  const ready = scenarios[0];
  assert.equal(ready.terminalPhase, "ready");
  assert.equal(ready.readyLimited, false);
  assert.equal(ready.readyResultIssued, true);
  assert.deepEqual(ready.issues, []);
  assert.ok(ready.dimensionStatuses.every(({ status }) => status === "ready"));

  const floorGuidance = scenarios[1];
  assert.equal(floorGuidance.terminalPhase, "guided");
  assert.deepEqual(floorGuidance.issues, [
    "feet-missing",
    "floor-low-confidence",
  ]);
  assert.deepEqual(floorGuidance.guidedSteps, ["camera-placement"]);
  assert.equal(floorGuidance.requiredGuidanceSkipRejected, true);
  assert.equal(floorGuidance.readyLimited, null);

  const unsafe = scenarios[2];
  assert.equal(unsafe.terminalPhase, "blocked");
  assert.deepEqual(unsafe.issues, ["unsafe-zone"]);
  assert.ok(unsafe.dimensionStatuses.every(({ status }) => status === "blocked"));
  assert.equal(unsafe.requiredGuidanceSkipRejected, true);
  assert.equal(unsafe.readyResultIssued, false);

  const limited = scenarios[3];
  assert.equal(limited.terminalPhase, "ready");
  assert.equal(limited.readyLimited, true);
  assert.equal(limited.readyResultIssued, true);
  assert.deepEqual(
    limited.dimensionStatuses
      .filter(({ status }) => status === "conservative")
      .map(({ dimension }) => dimension),
    ["neutral-stance", "usable-range"],
  );

  const invalidated = scenarios[4];
  assert.equal(invalidated.terminalPhase, "invalidated");
  assert.equal(invalidated.invalidationRevoked, true);
  assert.equal(invalidated.readyLimited, null);

  const stale = scenarios[5];
  assert.equal(stale.terminalPhase, "observing");
  assert.equal(stale.staleAttemptRejected, true);
  assert.equal(stale.terminalSampleCount, 0);

  const consumed = scenarios[6];
  assert.equal(consumed.substitutedResultRejected, true);
  assert.equal(consumed.firstConsumeAccepted, true);
  assert.equal(consumed.replayConsumeRejected, true);
  assert.equal(consumed.readyResultIssued, false);

  const expired = scenarios[7];
  assert.equal(expired.terminalPhase, "idle");
  assert.equal(expired.expiryRevoked, true);
  assert.equal(expired.readyLimited, null);
}

function validateProvenance(provenance) {
  exactKeys(
    provenance,
    [
      "implementationPath",
      "contractTestPath",
      "contractPath",
      "generatorPath",
      "validatorPath",
      "implementationSha256",
      "contractTestSha256",
      "contractSha256",
      "generatorSha256",
      "validatorSha256",
    ],
    "artifact.provenance",
  );
  assert.deepEqual(
    {
      implementationPath: provenance.implementationPath,
      contractTestPath: provenance.contractTestPath,
      contractPath: provenance.contractPath,
      generatorPath: provenance.generatorPath,
      validatorPath: provenance.validatorPath,
    },
    {
      implementationPath:
        "apps/console-lab/src/launcher/calibration-rehearsal.ts",
      contractTestPath:
        "apps/console-lab/src/launcher/calibration-rehearsal.test.ts",
      contractPath: "docs/CALIBRATION_REHEARSAL.md",
      generatorPath: "scripts/generate-calibration-rehearsal-evidence.mjs",
      validatorPath: "scripts/validate-calibration-rehearsal-evidence.mjs",
    },
  );
  for (const key of [
    "implementationSha256",
    "contractTestSha256",
    "contractSha256",
    "generatorSha256",
    "validatorSha256",
  ]) {
    assert.match(provenance[key], SHA256_PATTERN);
  }
}

export function validateCalibrationRehearsalEvidence(value, expected) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "policy",
      "scenarioResults",
      "repeatability",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, CALIBRATION_REHEARSAL_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, "2026-07-25");
  assert.equal(
    value.evidenceClass,
    "camera-free-synthetic-state-machine-exercise",
  );
  assert.equal(
    value.qualification,
    "contract-evidence-only-not-physical-calibration",
  );
  exactKeys(
    value.policy,
    [
      "minimumSamplesPerAttempt",
      "maximumSamplesPerAttempt",
      "syntheticConfidenceGate",
      "sessionTtlMs",
      "maximumUnconsumedResults",
      "realCameraUsed",
      "participantCount",
      "bodyMeasurementsRetained",
      "physicalSafetyQualified",
      "productionThresholdSelected",
      "persistentCalibrationImplemented",
    ],
    "artifact.policy",
  );
  assert.deepEqual(value.policy, {
    minimumSamplesPerAttempt: 8,
    maximumSamplesPerAttempt: 24,
    syntheticConfidenceGate: 0.82,
    sessionTtlMs: 120_000,
    maximumUnconsumedResults: 64,
    realCameraUsed: false,
    participantCount: 0,
    bodyMeasurementsRetained: false,
    physicalSafetyQualified: false,
    productionThresholdSelected: false,
    persistentCalibrationImplemented: false,
  });
  validateScenarios(value.scenarioResults);
  exactKeys(
    value.repeatability,
    ["runCount", "exactScenarioEquality", "scenarioSha256"],
    "artifact.repeatability",
  );
  assert.deepEqual(
    {
      runCount: value.repeatability.runCount,
      exactScenarioEquality: value.repeatability.exactScenarioEquality,
    },
    { runCount: 2, exactScenarioEquality: true },
  );
  assert.match(value.repeatability.scenarioSha256, SHA256_PATTERN);
  exactKeys(
    value.summary,
    [
      "scenarioCount",
      "terminalPhaseCounts",
      "passedClosedGuardCount",
      "physicalTrialCount",
      "gameplayErrorMeasurementCount",
      "roomChangeDetectionTrialCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    scenarioCount: 8,
    terminalPhaseCounts: {
      ready: 3,
      guided: 1,
      blocked: 1,
      invalidated: 1,
      observing: 1,
      idle: 1,
    },
    passedClosedGuardCount: 8,
    physicalTrialCount: 0,
    gameplayErrorMeasurementCount: 0,
    roomChangeDetectionTrialCount: 0,
  });
  validateProvenance(value.provenance);
  assert.ok(
    typeof value.claimBoundary === "string"
    && value.claimBoundary.includes("camera-free")
    && value.claimBoundary.includes("does not estimate or qualify"),
  );
  assert.ok(Array.isArray(value.limitations) && value.limitations.length === 5);
  assert.deepEqual(
    value,
    expected,
    "artifact must exactly match deterministic calibration evidence",
  );
  return value;
}

export function parseBoundedCalibrationEvidence(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function validateTrackedCalibrationRehearsalEvidence() {
  const [bytes, expected] = await Promise.all([
    readFile(artifactPath),
    generateCalibrationRehearsalEvidence(),
  ]);
  return validateCalibrationRehearsalEvidence(
    parseBoundedCalibrationEvidence(bytes),
    expected,
  );
}

async function main() {
  const artifact = await validateTrackedCalibrationRehearsalEvidence();
  console.log(
    `validated ${artifact.summary.scenarioCount} calibration scenarios / ${artifact.summary.passedClosedGuardCount} closed guards; ${artifact.summary.physicalTrialCount} physical trials claimed`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
