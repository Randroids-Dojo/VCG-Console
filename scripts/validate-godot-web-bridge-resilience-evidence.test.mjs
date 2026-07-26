import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  expectedGodotWebBridgeResilienceProvenance,
  validateGodotWebBridgeResilienceEvidence,
  validateTrackedGodotWebBridgeResilienceEvidence,
} from "./validate-godot-web-bridge-resilience-evidence.mjs";

async function fixture() {
  return structuredClone(
    await validateTrackedGodotWebBridgeResilienceEvidence(),
  );
}

async function baseBridgeSha256() {
  const bytes = await readFile(
    new URL(
      "../benchmarks/godot/windows-x64-godot-web-bridge-v1.json",
      import.meta.url,
    ),
  );
  return createHash("sha256").update(bytes).digest("hex");
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const [provenance, baseSha256] = await Promise.all([
    expectedGodotWebBridgeResilienceProvenance(),
    baseBridgeSha256(),
  ]);
  const operation = () =>
    validateGodotWebBridgeResilienceEvidence(
      artifact,
      provenance,
      baseSha256,
    );
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact Godot bridge resilience evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.acceptedSessionCount, 2);
  assert.equal(artifact.summary.publishedHealthEventCount, 2);
  assert.equal(artifact.summary.acknowledgedFrameCount, 3);
});

test("rejects base bridge or Web export substitution", async () => {
  await rejects((artifact) => {
    artifact.baseBridgeEvidence.sha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.baseWebBuild.totalBytes += 1;
  });
  await rejects((artifact) => {
    artifact.baseWebBuild.packSha256 = "0".repeat(64);
  });
});

test("rejects missing degraded or recovered Godot state", async () => {
  await rejects((artifact) => {
    artifact.bridge.afterDegradedHealth.inputSource = "motion";
  });
  await rejects((artifact) => {
    artifact.bridge.afterDegradedHealth.status = "MOTION READY";
  });
  await rejects((artifact) => {
    artifact.bridge.afterRecoveredHealth.status = "MOTION OVERLOAD";
  });
  await rejects((artifact) => {
    artifact.disposition.orderedReadyHealthRestored = false;
  });
});

test("rejects missing reload negotiation or post-reload application", async () => {
  await rejects((artifact) => {
    artifact.bridge.afterReloadHost.status = "CONNECTED";
  });
  await rejects((artifact) => {
    artifact.bridge.afterReloadHost.accepted = "1";
  });
  await rejects((artifact) => {
    artifact.bridge.afterReloadProbe.status = "WAITING FOR PLAYER";
  });
  await rejects((artifact) => {
    artifact.disposition.postReloadFrameAcknowledged = false;
  });
});

test("rejects session, frame, ACK, pending, or overlap drift", async () => {
  await rejects((artifact) => {
    artifact.bridge.acceptedSessionCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.acknowledgedFrameCount = 2;
  });
  await rejects((artifact) => {
    artifact.bridge.finalHost.pending = "1";
  });
  await rejects((artifact) => {
    artifact.bridge.afterReloadHost.peak = "2";
  });
});

test("rejects hidden errors or incomplete repeated asset fetches", async () => {
  await rejects((artifact) => {
    artifact.bridge.consoleErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.requestFailureCount = 2;
    artifact.bridge.abortedWasmFetchCount = 2;
  });
  await rejects((artifact) => {
    artifact.bridge.childRequestCounts["/index.wasm"] = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.hostRequestCounts[
      "/godot-bridge-resilience-host.html"
    ] = 2;
  });
});

test("rejects origin, config, protocol, or schema drift", async () => {
  await rejects((artifact) => {
    artifact.bridge.originsDistinct = false;
  });
  await rejects((artifact) => {
    artifact.bridge.responseInjectedConfig.queryEmptyBeforeAndAfterReload =
      false;
  });
  await rejects((artifact) => {
    artifact.bridge.bridgeProtocolVersion = 1;
  });
  await rejects((artifact) => {
    artifact.bridge.motionApiSchemaVersion = "0.5.0";
  });
});

test("rejects hostile, physical, production, target, or latency promotion", async () => {
  await rejects((artifact) => {
    artifact.disposition.hostileOriginNavigationVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.physicalControllerVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.productionHostAuthorityVerified = true;
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
    artifact.summary.physicalControllerCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.targetHardwareCount = 1;
  });
});

test("rejects stale provenance, weakened boundaries, and unknown claims", async () => {
  await rejects((artifact) => {
    artifact.provenance.hostFixturePathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "The Godot client is product-qualified.";
  });
  await rejects((artifact) => {
    artifact.limitations[1] = "Target Linux restart passed.";
  });
  await rejects(
    (artifact) => {
      artifact.productionQualified = true;
    },
    /artifact keys must be exactly/u,
  );
});
