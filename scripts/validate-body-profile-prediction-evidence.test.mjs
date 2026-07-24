import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBodyProfilePredictionEvidence,
  validateTrackedBodyProfilePredictionEvidence,
} from "./validate-body-profile-prediction-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedBodyProfilePredictionEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  const expected = structuredClone(artifact);
  mutator(artifact);
  const operation = () =>
    validateBodyProfilePredictionEvidence(artifact, expected);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact camera-free prediction evidence", async () => {
  const artifact = await fixture();
  assert.deepEqual(artifact.summary, {
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
});

test("rejects authority claimed by a prediction or confirmation", async () => {
  await rejects((artifact) => {
    artifact.policy.predictionGrantsAuthority = true;
  });
  await rejects((artifact) => {
    artifact.confirmationResults[0].result.grantsProfileAuthority = true;
  });
  await rejects((artifact) => {
    artifact.confirmationResults[0].result.grantsCalibrationAuthority = true;
  });
  await rejects((artifact) => {
    artifact.confirmationResults[0].result.grantsSaveAuthority = true;
  });
});

test("rejects removal of mandatory confirmation or correction routes", async () => {
  await rejects((artifact) => {
    artifact.policy.explicitConfirmationRequired = false;
  });
  await rejects((artifact) => {
    artifact.confirmationResults.splice(1, 1);
    artifact.summary.explicitConfirmationCount = 3;
  });
});

test("rejects portrait, face, or score use", async () => {
  await rejects((artifact) => {
    artifact.policy.portraitInputAccepted = true;
  });
  await rejects((artifact) => {
    artifact.policy.facialInputAccepted = true;
  });
  await rejects((artifact) => {
    artifact.policy.exactScoresExposedToUi = true;
  });
  await rejects((artifact) => {
    artifact.predictionScenarios[0].prediction.score = 0.99;
  });
});

test("rejects fabricated product, persistence, participant, or rate claims", async () => {
  await rejects((artifact) => {
    artifact.policy.productMatchingEnabled = true;
  });
  await rejects((artifact) => {
    artifact.policy.persistentEncryptedStoreImplemented = true;
    artifact.lifecycleDisposition.encryptedPersistenceImplemented = true;
  });
  await rejects((artifact) => {
    artifact.summary.participantCount = 10;
  });
  await rejects((artifact) => {
    artifact.summary.measuredFalseAcceptRate = 0;
  });
});

test("rejects turning an ambiguous case into a candidate", async () => {
  await rejects((artifact) => {
    artifact.predictionScenarios[1].prediction.state = "predicted";
    artifact.predictionScenarios[1].prediction.reason = "candidate-separated";
    artifact.predictionScenarios[1].prediction.predictedProfileId = "profile-a";
    artifact.predictionScenarios[1].prediction.confidenceBand = "candidate-high";
    artifact.summary.predictedCount = 3;
    artifact.summary.ambiguousCount = 0;
  });
});

test("rejects activating opted-out or invalidated templates", async () => {
  await rejects((artifact) => {
    artifact.predictionScenarios[7].prediction.state = "predicted";
    artifact.predictionScenarios[7].prediction.reason = "candidate-separated";
    artifact.predictionScenarios[7].prediction.predictedProfileId =
      "profile-opted-out";
    artifact.predictionScenarios[7].prediction.confidenceBand =
      "candidate-high";
  });
});

test("rejects deleting privacy canaries or guard checks", async () => {
  await rejects((artifact) => {
    artifact.featureInventory.forbiddenInputKeys.pop();
  });
  await rejects((artifact) => {
    artifact.guardChecks.pop();
    artifact.summary.guardCheckCount = 8;
    artifact.summary.passedGuardCheckCount = 8;
  });
});

test("rejects claiming a factory-reset transaction ran", async () => {
  await rejects((artifact) => {
    artifact.lifecycleDisposition.factoryResetTransactionTested = true;
  });
});

test("rejects stale provenance and undeclared fields", async () => {
  await rejects((artifact) => {
    artifact.provenance.implementationSha256 = "0".repeat(64);
  });
  await rejects(
    (artifact) => {
      artifact.biometricIdentityVerified = true;
    },
    /artifact keys must be exactly/,
  );
});
