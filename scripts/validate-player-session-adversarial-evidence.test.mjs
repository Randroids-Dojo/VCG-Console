import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePlayerSessionAdversarialEvidence,
  validateTrackedPlayerSessionAdversarialEvidence,
} from "./validate-player-session-adversarial-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedPlayerSessionAdversarialEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  const expected = structuredClone(artifact);
  mutator(artifact);
  assert.throws(
    () => validatePlayerSessionAdversarialEvidence(artifact, expected),
    pattern,
  );
}

test("accepts the pinned five-scenario authority report", async () => {
  const artifact = await fixture();
  assert.deepEqual(artifact.summary, {
    scenarioCount: 5,
    checkCount: 15,
    interferenceClassCount: 5,
    falseCandidateObservations: 12,
    authorityFailureCount: 0,
    explicitTakeoverCount: 1,
    allChecksPassed: true,
  });
});

test("rejects passive detection that silently joins", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios[0].metrics.falseJoins = 1;
    artifact.report.totals.falseJoins = 1;
    artifact.summary.authorityFailureCount = 1;
  }, /Expected values|artifact must exactly match/);
});

test("rejects a false control or action hidden by zero summary", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios[1].metrics.falseControls = 1;
    artifact.report.totals.falseControls = 1;
  }, /Expected values|artifact must exactly match/);
  await rejects((artifact) => {
    artifact.report.scenarios[1].metrics.falseActions = 1;
    artifact.report.totals.falseActions = 1;
  }, /Expected values|artifact must exactly match/);
});

test("rejects an unintended takeover", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios[2].metrics.unintendedTakeovers = 1;
    artifact.report.totals.unintendedTakeovers = 1;
    artifact.summary.authorityFailureCount = 1;
  }, /Expected values|artifact must exactly match/);
});

test("requires the one explicit takeover in the frozen scenario", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios[3].metrics.explicitTakeovers = 0;
    artifact.report.totals.explicitTakeovers = 0;
    artifact.summary.explicitTakeoverCount = 0;
  }, /Expected values|artifact must exactly match/);
});

test("rejects scenario and check substitution or reordering", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios.reverse();
  }, /substituted or reordered/);
  await rejects((artifact) => {
    artifact.report.scenarios[0].checks.reverse();
  }, /checks are substituted or reordered/);
});

test("rejects raw-frame, biometric, or durable-identity claims", async () => {
  await rejects((artifact) => {
    artifact.privacy.rawFramesRetained = true;
  }, /Expected values|artifact must exactly match/);
  await rejects((artifact) => {
    artifact.privacy.biometricIdentityUsed = true;
  }, /Expected values|artifact must exactly match/);
  await rejects((artifact) => {
    artifact.privacy.durableIdentityUsed = true;
  }, /Expected values|artifact must exactly match/);
});

test("rejects prohibited report fields", async () => {
  await rejects((artifact) => {
    artifact.report.scenarios[0].landmarks = [];
  }, /keys must be exactly|prohibited/);
});

test("rejects stale source provenance", async () => {
  await rejects((artifact) => {
    artifact.provenance.controllerSha256 = "0".repeat(64);
  }, /artifact must exactly match deterministic evidence/);
});

test("rejects undeclared conclusions or qualification fields", async () => {
  await rejects((artifact) => {
    artifact.physicalCampaignQualified = true;
  }, /artifact keys must be exactly/);
});
