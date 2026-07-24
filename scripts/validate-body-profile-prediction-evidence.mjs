import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_PROFILE_PREDICTION_EVIDENCE_FORMAT,
  generateBodyProfilePredictionEvidence,
} from "./generate-body-profile-prediction-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/body-profile-prediction/camera-free-abstention-confirmation-v1.json",
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

function validatePrediction(prediction, path) {
  exactKeys(
    prediction,
    [
      "schemaVersion",
      "predictionId",
      "attemptId",
      "epochId",
      "occurredAtMs",
      "expiresAtMs",
      "state",
      "reason",
      "predictedProfileId",
      "confidenceBand",
      "requiresExplicitConfirmation",
      "grantsProfileAuthority",
      "portraitInputUsed",
      "facialInputUsed",
    ],
    path,
  );
  assert.equal(prediction.schemaVersion, 1);
  assert.equal(prediction.requiresExplicitConfirmation, true);
  assert.equal(prediction.grantsProfileAuthority, false);
  assert.equal(prediction.portraitInputUsed, false);
  assert.equal(prediction.facialInputUsed, false);
  assert.ok(!("features" in prediction), `${path} must not expose features`);
  assert.ok(!("distance" in prediction), `${path} must not expose distance`);
  assert.ok(!("score" in prediction), `${path} must not expose scores`);
}

function validatePredictions(scenarios) {
  assert.ok(Array.isArray(scenarios) && scenarios.length === 10);
  assert.deepEqual(
    scenarios.map(({ scenarioId }) => scenarioId),
    [
      "separated-candidate",
      "lookalike-ambiguity",
      "distant-body-vector",
      "matching-disabled",
      "tracker-degraded",
      "multiple-people-visible",
      "calibration-context-changed",
      "opted-out-and-invalidated-only",
      "vault-or-factory-loss-empty",
      "fresh-profile-after-loss",
    ],
  );
  const expectedStates = [
    "predicted",
    "ambiguous",
    "no-match",
    "unavailable",
    "unavailable",
    "unavailable",
    "unavailable",
    "no-match",
    "no-match",
    "predicted",
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const path = `artifact.predictionScenarios[${index}]`;
    exactKeys(scenario, ["scenarioId", "prediction"], path);
    validatePrediction(scenario.prediction, `${path}.prediction`);
    assert.equal(scenario.prediction.state, expectedStates[index]);
  }
}

function validateConfirmations(confirmations) {
  assert.ok(Array.isArray(confirmations) && confirmations.length === 4);
  assert.deepEqual(
    confirmations.map(({ confirmationId }) => confirmationId),
    [
      "accept-separated-candidate",
      "correct-to-visible-profile",
      "choose-new-player",
      "disable-future-matching",
    ],
  );
  for (const [index, confirmation] of confirmations.entries()) {
    const path = `artifact.confirmationResults[${index}]`;
    exactKeys(confirmation, ["confirmationId", "result"], path);
    exactKeys(
      confirmation.result,
      [
        "schemaVersion",
        "predictionId",
        "attemptId",
        "epochId",
        "confirmedAtMs",
        "disposition",
        "selectedProfileId",
        "matchingPreference",
        "advisorySelectionOnly",
        "grantsProfileAuthority",
        "grantsCalibrationAuthority",
        "grantsSaveAuthority",
      ],
      `${path}.result`,
    );
    assert.equal(confirmation.result.advisorySelectionOnly, true);
    assert.equal(confirmation.result.grantsProfileAuthority, false);
    assert.equal(confirmation.result.grantsCalibrationAuthority, false);
    assert.equal(confirmation.result.grantsSaveAuthority, false);
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
      implementationPath:
        "packages/motion-contract/src/body-profile-prediction.ts",
      contractTestPath:
        "packages/motion-contract/tests/body-profile-prediction.test.ts",
      generatorPath:
        "scripts/generate-body-profile-prediction-evidence.mjs",
      validatorPath:
        "scripts/validate-body-profile-prediction-evidence.mjs",
    },
  );
  for (const key of [
    "implementationSha256",
    "contractTestSha256",
    "generatorSha256",
    "validatorSha256",
  ]) {
    assert.match(provenance[key], SHA256_PATTERN);
  }
}

export function validateBodyProfilePredictionEvidence(value, expected) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "policy",
      "featureInventory",
      "predictionScenarios",
      "confirmationResults",
      "guardChecks",
      "lifecycleDisposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, BODY_PROFILE_PREDICTION_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, "2026-07-24");
  assert.equal(
    value.evidenceClass,
    "camera-free-synthetic-contract-exercise",
  );
  assert.equal(value.qualification, "not-product-or-identity-qualification");
  exactKeys(
    value.policy,
    [
      "matchingIsAuthentication",
      "predictionGrantsAuthority",
      "explicitConfirmationRequired",
      "matchingOptOutAvailable",
      "portraitInputAccepted",
      "facialInputAccepted",
      "exactScoresExposedToUi",
      "productMatchingEnabled",
      "persistentEncryptedStoreImplemented",
      "realCameraOrParticipantUsed",
      "networkUsed",
    ],
    "artifact.policy",
  );
  assert.deepEqual(value.policy, {
    matchingIsAuthentication: false,
    predictionGrantsAuthority: false,
    explicitConfirmationRequired: true,
    matchingOptOutAvailable: true,
    portraitInputAccepted: false,
    facialInputAccepted: false,
    exactScoresExposedToUi: false,
    productMatchingEnabled: false,
    persistentEncryptedStoreImplemented: false,
    realCameraOrParticipantUsed: false,
    networkUsed: false,
  });
  exactKeys(
    value.featureInventory,
    [
      "schemaId",
      "extractorId",
      "allowedRatioFields",
      "forbiddenInputKeys",
      "portraitRecordDisposition",
      "facialOrAppearanceFeatureCount",
    ],
    "artifact.featureInventory",
  );
  assert.deepEqual(value.featureInventory.allowedRatioFields, [
    "shoulderWidthOverTorso",
    "hipWidthOverTorso",
    "upperArmOverTorso",
    "forearmOverTorso",
    "thighOverTorso",
    "shinOverTorso",
  ]);
  assert.deepEqual(value.featureInventory.forbiddenInputKeys, [
    "portraitPixels",
    "portraitHandle",
    "faceEmbedding",
    "noseCoordinate",
    "displayName",
    "email",
  ]);
  assert.equal(
    value.featureInventory.portraitRecordDisposition,
    "separate-not-provided-to-matcher",
  );
  assert.equal(value.featureInventory.facialOrAppearanceFeatureCount, 0);
  validatePredictions(value.predictionScenarios);
  validateConfirmations(value.confirmationResults);
  assert.ok(Array.isArray(value.guardChecks) && value.guardChecks.length === 9);
  for (const [index, check] of value.guardChecks.entries()) {
    exactKeys(check, ["checkId", "passed"], `artifact.guardChecks[${index}]`);
    assert.equal(check.passed, true);
  }
  exactKeys(
    value.lifecycleDisposition,
    [
      "optOutTemplateExcluded",
      "invalidatedTemplateExcluded",
      "calibrationContextMismatchUnavailable",
      "emptyVaultProducesNoMatch",
      "freshRecreationUsesNewProfileOnly",
      "unsupportedSchemaMigrationRejected",
      "encryptedPersistenceImplemented",
      "factoryResetTransactionTested",
    ],
    "artifact.lifecycleDisposition",
  );
  assert.deepEqual(value.lifecycleDisposition, {
    optOutTemplateExcluded: true,
    invalidatedTemplateExcluded: true,
    calibrationContextMismatchUnavailable: true,
    emptyVaultProducesNoMatch: true,
    freshRecreationUsesNewProfileOnly: true,
    unsupportedSchemaMigrationRejected: true,
    encryptedPersistenceImplemented: false,
    factoryResetTransactionTested: false,
  });
  exactKeys(
    value.summary,
    [
      "predictionScenarioCount",
      "predictedCount",
      "ambiguousCount",
      "noMatchCount",
      "unavailableCount",
      "explicitConfirmationCount",
      "guardCheckCount",
      "passedGuardCheckCount",
      "participantCount",
      "realImageCount",
      "measuredFalseAcceptRate",
      "measuredFalseRejectRate",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    predictionScenarioCount: 10,
    predictedCount: 2,
    ambiguousCount: 1,
    noMatchCount: 3,
    unavailableCount: 4,
    explicitConfirmationCount: 4,
    guardCheckCount: 9,
    passedGuardCheckCount: 9,
    participantCount: 0,
    realImageCount: 0,
    measuredFalseAcceptRate: null,
    measuredFalseRejectRate: null,
  });
  validateProvenance(value.provenance);
  assert.ok(Array.isArray(value.limitations) && value.limitations.length === 5);
  assert.deepEqual(
    value,
    expected,
    "artifact must exactly match deterministic evidence",
  );
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

export async function validateTrackedBodyProfilePredictionEvidence() {
  const [bytes, expected] = await Promise.all([
    readFile(artifactPath),
    generateBodyProfilePredictionEvidence(),
  ]);
  return validateBodyProfilePredictionEvidence(
    parseBoundedJson(bytes),
    expected,
  );
}

async function main() {
  const artifact = await validateTrackedBodyProfilePredictionEvidence();
  console.log(
    `validated ${artifact.summary.predictionScenarioCount} prediction scenarios / ${artifact.summary.guardCheckCount} guard checks; ${artifact.summary.participantCount} participants claimed`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
