import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedGodotWebBridgeProvenance,
  validateGodotWebBridgeEvidence,
  validateTrackedGodotWebBridgeEvidence,
} from "./validate-godot-web-bridge-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedGodotWebBridgeEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const provenance = await expectedGodotWebBridgeProvenance();
  const operation = () =>
    validateGodotWebBridgeEvidence(artifact, provenance);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact cross-origin Godot bridge evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.bridge.originsDistinct, true);
  assert.equal(artifact.summary.publishedFrameCount, 2);
  assert.equal(artifact.summary.acknowledgedFrameCount, 2);
});

test("rejects origin, response configuration, or URL authority drift", async () => {
  await rejects((artifact) => {
    artifact.bridge.originsDistinct = false;
  });
  await rejects((artifact) => {
    artifact.bridge.responseInjectedConfig.matchesParentOrigin = false;
  });
  await rejects((artifact) => {
    artifact.bridge.responseInjectedConfig.queryEmpty = false;
  });
  await rejects((artifact) => {
    artifact.disposition.urlParameterAuthorityUsed = true;
  });
});

test("rejects protocol or Motion schema substitution", async () => {
  await rejects((artifact) => {
    artifact.bridge.bridgeProtocolVersion = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.motionApiSchemaVersion = "0.5.0";
  });
  await rejects((artifact) => {
    artifact.disposition.bridgeV2Negotiated = false;
  });
});

test("rejects session, publication, acknowledgement, or pending-frame drift", async () => {
  await rejects((artifact) => {
    artifact.bridge.acceptedSessionCount = 2;
  });
  await rejects((artifact) => {
    artifact.bridge.publishedFrameCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.acknowledgedFrameCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.finalHost.pending = "1";
  });
  await rejects((artifact) => {
    artifact.bridge.finalHost.invalidAck = "1";
  });
});

test("rejects missing Godot frame application", async () => {
  await rejects((artifact) => {
    artifact.bridge.afterFirstFrame.inputSource = "waiting";
  });
  await rejects((artifact) => {
    artifact.bridge.afterFirstFrame.status = "MOTION READY";
  });
  await rejects((artifact) => {
    artifact.disposition.syntheticCoreFramesApplied = false;
  });
});

test("rejects hidden browser, page, request, or resource drift", async () => {
  await rejects((artifact) => {
    artifact.bridge.consoleErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.pageErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.requestFailureCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.childRequestCount = 8;
  });
});

test("rejects physical controller or real tracker fabrication", async () => {
  await rejects((artifact) => {
    artifact.disposition.physicalControllerVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.realTrackerVerified = true;
  });
  await rejects((artifact) => {
    artifact.summary.physicalControllerCount = 1;
  });
});

test("rejects production authority, permission, target, or latency promotion", async () => {
  await rejects((artifact) => {
    artifact.disposition.productionHostAuthorityVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.signedPermissionAdmissionVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.targetPlatformQualified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.latencyQualified = true;
  });
});

test("rejects fabricated participants or target hardware", async () => {
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.targetHardwareCount = 1;
  });
});

test("rejects stale provenance, weakened boundaries, and unknown claims", async () => {
  await rejects((artifact) => {
    artifact.provenance.bridgeScriptPathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "The Godot SDK is product-qualified.";
  });
  await rejects((artifact) => {
    artifact.limitations[0] = "The native host supplied authority.";
  });
  await rejects(
    (artifact) => {
      artifact.productionQualified = true;
    },
    /artifact keys must be exactly/u,
  );
});
