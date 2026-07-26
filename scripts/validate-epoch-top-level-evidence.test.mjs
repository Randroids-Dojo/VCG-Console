import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedEpochTopLevelProvenance,
  validateEpochTopLevelEvidence,
  validateTrackedEpochTopLevelEvidence,
} from "./validate-epoch-top-level-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedEpochTopLevelEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const provenance = await expectedEpochTopLevelProvenance();
  const operation = () =>
    validateEpochTopLevelEvidence(artifact, provenance);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact live Epoch top-level-load evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.response.status, 200);
  assert.equal(artifact.probe.loaded, true);
  assert.equal(artifact.probe.profileRemoved, true);
});

test("rejects claiming that the console may frame Epoch", async () => {
  await rejects((artifact) => {
    artifact.response.consoleOriginFramingAllowed = true;
  });
  await rejects((artifact) => {
    artifact.disposition.consoleOriginFramingSupported = true;
  });
});

test("rejects weakened or substituted response headers", async () => {
  await rejects((artifact) => {
    artifact.response.contentSecurityPolicy = "frame-ancestors *";
  });
  await rejects((artifact) => {
    artifact.response.xFrameOptions = null;
  });
});

test("rejects origin, entrypoint, or health-policy drift", async () => {
  await rejects((artifact) => {
    artifact.launchPolicy.allowedOrigins = ["https://example.com"];
  });
  await rejects((artifact) => {
    artifact.launchPolicy.entrypoint = "https://example.com/";
  });
  await rejects((artifact) => {
    artifact.launchPolicy.healthCheckUrl = "https://example.com/";
  });
});

test("rejects incomplete load, dirty exit, or retained profile", async () => {
  await rejects((artifact) => {
    artifact.probe.readyState = "interactive";
  });
  await rejects((artifact) => {
    artifact.probe.title = "Substituted page";
  });
  await rejects((artifact) => {
    artifact.probe.exitCode = 1;
  });
  await rejects((artifact) => {
    artifact.probe.profileRemoved = false;
  });
});

test("rejects fabricated play, controller, participant, or recovery claims", async () => {
  await rejects((artifact) => {
    artifact.summary.playTestCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.controllerTestCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.disposition.reservedHomeBackVerified = true;
  });
});

test("rejects relabeling load as catalog playability", async () => {
  await rejects((artifact) => {
    artifact.disposition.catalogPlayabilityVerified = true;
  });
});

test("rejects stale provenance and undeclared claims", async () => {
  await rejects((artifact) => {
    artifact.provenance.supervisorPathSha256 = "0".repeat(64);
  });
  await rejects(
    (artifact) => {
      artifact.gameplayReady = true;
    },
    /artifact keys must be exactly/,
  );
  await rejects((artifact) => {
    artifact.claimBoundary = "Top-level load proves catalog playability.";
  });
  await rejects((artifact) => {
    artifact.limitations[2] = "Controller exit was tested.";
  });
});
