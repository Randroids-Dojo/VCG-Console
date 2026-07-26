import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedMotionBridgeWallClockProvenance,
  validateMotionBridgeWallClockEvidence,
  validateTrackedMotionBridgeWallClockEvidence,
} from "./validate-motion-bridge-wall-clock-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedMotionBridgeWallClockEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const provenance = await expectedMotionBridgeWallClockProvenance();
  const operation = () =>
    validateMotionBridgeWallClockEvidence(artifact, provenance);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact Windows child-process stall evidence", async () => {
  const artifact = await fixture();
  assert.deepEqual(artifact.summary, {
    childProcessCount: 3,
    forcedTerminationCount: 2,
    gracefulShutdownCount: 1,
    assertionCount: 12,
    passedAssertionCount: 12,
    failedAssertionCount: 0,
    participantCount: 0,
    cameraFrameCount: 0,
  });
});

test("rejects target, native, suspend, tracker, or product qualification", async () => {
  for (const key of [
    "osSuspendUsed",
    "trackerProcessUsed",
    "nativeIpcUsed",
    "targetLinuxUsed",
    "productThresholdQualified",
  ]) {
    await rejects((artifact) => {
      artifact.policy[key] = true;
    });
  }
});

test("rejects fabricating participants or real camera frames", async () => {
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.cameraFrameCount = 800;
  });
});

test("rejects hidden stalled-client delivery or missing expiry", async () => {
  await rejects((artifact) => {
    artifact.observations.clients[1].framesOfferedByHost = 2;
    artifact.observations.host.publishedFrames += 1;
  });
  await rejects((artifact) => {
    artifact.observations.host.expiredSessions = 1;
  });
});

test("rejects loss of the healthy initial or replacement path", async () => {
  await rejects((artifact) => {
    artifact.observations.clients[0].framesOfferedByHost = 99;
  });
  await rejects((artifact) => {
    artifact.observations.clients[2].framesOfferedByHost = 99;
  });
});

test("rejects pending state, extra sessions, or invalid acknowledgements", async () => {
  await rejects((artifact) => {
    artifact.observations.host.pendingFrames = 1;
  });
  await rejects((artifact) => {
    artifact.observations.host.peakSessions = 3;
  });
  await rejects((artifact) => {
    artifact.observations.host.invalidAcknowledgements = 1;
  });
});

test("rejects scheduler and RSS ceiling substitution", async () => {
  await rejects((artifact) => {
    artifact.observations.scheduler.p99DriftMs = 250;
  });
  await rejects((artifact) => {
    artifact.observations.mainProcess.peakRssBytes = 512 * 1024 * 1024;
    artifact.observations.mainProcess.rssGrowthBytes =
      artifact.observations.mainProcess.peakRssBytes
      - artifact.observations.mainProcess.rssStartedBytes;
  });
  await rejects((artifact) => {
    artifact.observations.clients[0].peakRssBytes = 256 * 1024 * 1024;
  });
});

test("rejects failed or removed assertions", async () => {
  await rejects((artifact) => {
    artifact.assertions[0].passed = false;
    artifact.summary.passedAssertionCount = 11;
    artifact.summary.failedAssertionCount = 1;
  });
  await rejects((artifact) => {
    artifact.assertions.pop();
    artifact.summary.assertionCount = 11;
    artifact.summary.passedAssertionCount = 11;
  });
});

test("rejects configuration drift and stale provenance", async () => {
  await rejects((artifact) => {
    artifact.configuration.sessionTtlMs = 5_000;
  });
  await rejects((artifact) => {
    artifact.provenance.hostImplementationPathSha256 = "0".repeat(64);
  });
});

test("rejects undeclared claims", async () => {
  await rejects(
    (artifact) => {
      artifact.browserSuspendQualified = true;
    },
    /artifact keys must be exactly/,
  );
});
