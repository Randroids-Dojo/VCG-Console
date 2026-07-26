import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedTvConformanceProvenance,
  expectedTvConformanceScreenshots,
  validateTrackedTvConformanceEvidence,
  validateTvConformanceEvidence,
} from "./validate-tv-conformance-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedTvConformanceEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const [provenance, screenshots] = await Promise.all([
    expectedTvConformanceProvenance(),
    expectedTvConformanceScreenshots(),
  ]);
  const operation = () =>
    validateTvConformanceEvidence(
      artifact,
      provenance,
      screenshots,
    );
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact candidate TV conformance evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.resolutionCount, 3);
  assert.equal(artifact.summary.screenshotCount, 3);
  assert.equal(artifact.summary.physicalTelevisionCount, 0);
});

test("rejects resolution, ordering, or environment substitution", async () => {
  await rejects((artifact) => {
    artifact.contract.resolutions[0].width = 1920;
  });
  await rejects((artifact) => {
    artifact.browser.observations.reverse();
  });
  await rejects((artifact) => {
    artifact.environment.devicePixelRatio = 2;
  });
  await rejects((artifact) => {
    artifact.environment.browserProduct = "Chrome/151.0.0.0";
  });
});

test("rejects safe-area geometry drift or escaped critical content", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].safeArea.left = 63;
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].safeInsetPercent = 4;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].criticalRegionsInsideSafeArea = 4;
  });
  await rejects((artifact) => {
    artifact.disposition.candidateSafeAreaGeometryVerified = false;
  });
});

test("rejects weakened critical text or action targets", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].minimumCriticalTextCssPx = 23;
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].minimumActionTargetWidthCssPx = 47;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].minimumActionTargetHeightCssPx = 47;
  });
  await rejects((artifact) => {
    artifact.contract.minimumActionTargetCssPx = 40;
  });
});

test("rejects focus, activation, or Back behavior drift", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].focusOrder = [0, 2, 1, 3];
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].finalFocusedOrder = 2;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].keyboardActivationCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.observations[0].keyboardBackRequestCount = 0;
  });
});

test("rejects invalid elapsed-time samples or frame-rate promotion", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].animation.sampleCount = 119;
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].animation.negativeDeltaCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].animation.p95DeltaMs = 1_001;
  });
  await rejects((artifact) => {
    artifact.browser.observations[0].animation.p50DeltaMs = 17;
    artifact.browser.observations[0].animation.p95DeltaMs = 16;
  });
  await rejects((artifact) => {
    artifact.disposition.frameRateQualified = true;
  });
});

test("rejects screenshot path, byte, or digest substitution", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].screenshot.path =
      "benchmarks/tv-conformance/replacement.png";
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].screenshot.bytes += 1;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].screenshot.sha256 =
      "0".repeat(64);
  });
});

test("rejects hidden browser errors or incomplete fixture fetches", async () => {
  await rejects((artifact) => {
    artifact.browser.consoleErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.requestFailureCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.requestCounts["/app.js"] = 2;
  });
  await rejects((artifact) => {
    artifact.browser.requestCounts["/favicon.ico"] = 3;
  });
});

test("rejects physical, catalog, compositor, or overscan promotion", async () => {
  await rejects((artifact) => {
    artifact.disposition.physicalTelevisionVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.physicalControllerVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.hardwareOverscanVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.targetCompositorScalingVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.catalogGameCompatibilityVerified = true;
  });
});

test("rejects fabricated participants, hardware, controllers, or games", async () => {
  await rejects((artifact) => {
    artifact.summary.physicalTelevisionCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.physicalControllerCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.catalogGameCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.targetHardwareCount = 1;
  });
});

test("rejects stale provenance, weakened boundaries, or unknown claims", async () => {
  await rejects((artifact) => {
    artifact.provenance.documentPathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "All television targets are qualified.";
  });
  await rejects((artifact) => {
    artifact.limitations[0] = "The values are the final product standard.";
  });
  await rejects(
    (artifact) => {
      artifact.productQualified = true;
    },
    /artifact keys must be exactly/u,
  );
});
