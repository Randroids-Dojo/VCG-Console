import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBoundedCalibrationEvidence,
  validateCalibrationRehearsalEvidence,
  validateTrackedCalibrationRehearsalEvidence,
} from "./validate-calibration-rehearsal-evidence.mjs";

async function fixture() {
  return structuredClone(
    await validateTrackedCalibrationRehearsalEvidence(),
  );
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  const expected = structuredClone(artifact);
  mutator(artifact);
  const operation = () =>
    validateCalibrationRehearsalEvidence(artifact, expected);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts exact deterministic calibration rehearsal evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.scenarioCount, 8);
  assert.equal(artifact.summary.passedClosedGuardCount, 8);
  assert.equal(artifact.repeatability.exactScenarioEquality, true);
});

test("rejects production threshold or physical-safety promotion", async () => {
  await rejects((artifact) => {
    artifact.policy.productionThresholdSelected = true;
  });
  await rejects((artifact) => {
    artifact.policy.physicalSafetyQualified = true;
  });
  await rejects((artifact) => {
    artifact.qualification = "production-calibration-qualified";
  });
});

test("rejects camera, participant, or retained-measurement fabrication", async () => {
  await rejects((artifact) => {
    artifact.policy.realCameraUsed = true;
  });
  await rejects((artifact) => {
    artifact.policy.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.policy.bodyMeasurementsRetained = true;
  });
});

test("rejects weakening required floor guidance or unsafe-zone blocking", async () => {
  await rejects((artifact) => {
    artifact.scenarioResults[1].requiredGuidanceSkipRejected = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[2].terminalPhase = "ready";
    artifact.scenarioResults[2].readyLimited = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[2].dimensionStatuses[0].status = "ready";
  });
});

test("rejects widening optional fallback dimensions", async () => {
  await rejects((artifact) => {
    artifact.scenarioResults[3].dimensionStatuses[0].status = "conservative";
  });
  await rejects((artifact) => {
    artifact.scenarioResults[3].readyLimited = false;
  });
});

test("rejects stale-attempt, substitution, replay, or revocation weakening", async () => {
  await rejects((artifact) => {
    artifact.scenarioResults[5].staleAttemptRejected = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[6].substitutedResultRejected = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[6].replayConsumeRejected = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[4].invalidationRevoked = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults[7].expiryRevoked = false;
  });
});

test("rejects fabricated gameplay, room-change, or persistence evidence", async () => {
  await rejects((artifact) => {
    artifact.summary.gameplayErrorMeasurementCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.roomChangeDetectionTrialCount = 1;
  });
  await rejects((artifact) => {
    artifact.policy.persistentCalibrationImplemented = true;
  });
});

test("rejects repeatability, scenario inventory, and summary substitution", async () => {
  await rejects((artifact) => {
    artifact.repeatability.exactScenarioEquality = false;
  });
  await rejects((artifact) => {
    artifact.scenarioResults.reverse();
  });
  await rejects((artifact) => {
    artifact.summary.terminalPhaseCounts.ready = 4;
  });
});

test("rejects stale provenance, weakened boundary, and undeclared fields", async () => {
  await rejects((artifact) => {
    artifact.provenance.implementationSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "Synthetic calibration is production ready.";
  });
  await rejects(
    (artifact) => {
      artifact.realFloorQualified = true;
    },
    /artifact keys must be exactly/,
  );
});

test("bounded parser rejects empty, oversized, and invalid UTF-8 evidence", () => {
  assert.throws(
    () => parseBoundedCalibrationEvidence(Buffer.alloc(0)),
    /byte size/,
  );
  assert.throws(
    () => parseBoundedCalibrationEvidence(Buffer.alloc(128 * 1024 + 1)),
    /byte size/,
  );
  assert.throws(
    () => parseBoundedCalibrationEvidence(Uint8Array.from([0xff])),
    /encoded data was not valid/,
  );
});
