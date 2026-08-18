import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import {
  validateLauncherTvSurfaceEvidence,
} from "./validate-launcher-tv-surface-evidence.mjs";

const artifactPath = resolve(
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
);
let baseline;
let temporaryRoot;
let sequence = 0;

before(async () => {
  baseline = JSON.parse(await readFile(artifactPath, "utf8"));
  temporaryRoot = await mkdtemp(join(tmpdir(), "vcg-launcher-tv-surfaces-"));
});

after(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

async function validateMutation(mutator) {
  const artifact = structuredClone(baseline);
  mutator(artifact);
  sequence += 1;
  const path = join(temporaryRoot, `mutation-${sequence}.json`);
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
  await assert.rejects(validateLauncherTvSurfaceEvidence(path));
}

test("accepts the exact representative launcher TV evidence", async () => {
  const artifact = await validateLauncherTvSurfaceEvidence();
  assert.equal(artifact.summary.observationCount, 9);
});

test("rejects format, base evidence, environment, or resolution substitution", async () => {
  await validateMutation((artifact) => {
    artifact.format = "vcg-launcher-representative-surfaces-tv-conformance-evidence/v2";
  });
  await validateMutation((artifact) => {
    artifact.baseLauncherHomeEvidence.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.environment.browserProduct = "Chrome/151.0.0.0";
  });
  await validateMutation((artifact) => {
    artifact.contract.resolutions[0].width = 1279;
  });
});

test("rejects surface, ordering, or declared-count substitution", async () => {
  await validateMutation((artifact) => {
    artifact.contract.surfaces[0].id = "museum";
  });
  await validateMutation((artifact) => {
    artifact.browser.observations.reverse();
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].criticalTextCount = 23;
  });
});

test("rejects safe-area escape or weakened critical text", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].safeArea.left -= 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].criticalTextInsideSafeArea = 23;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].minimumCriticalTextCssPx = 23.999;
  });
});

test("rejects critical, section, or root overflow", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].criticalTextOverlapCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].sectionOverlapCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[2].rootOverflowCssPx.horizontal = 2;
  });
});

test("rejects weak or missing action targets", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].actionTargetCount = 11;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].minimumActionTargetWidthCssPx = 47.999;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[2].minimumActionTargetHeightCssPx = 47.999;
  });
});

test("rejects focus or Back recovery drift", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].focusTrace = [
      "motion-first-entry",
      "settings",
    ];
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[2].focusTrace[3] = "launcher-home";
  });
});

test("rejects screenshot substitution", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].screenshot.sha256 = "f".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].screenshot =
      artifact.browser.observations[1].screenshot;
  });
});

test("rejects hidden browser errors or build-resource drift", async () => {
  await validateMutation((artifact) => {
    artifact.browser.consoleErrorCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestFailureCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/"] = 8;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/unexpected"] = 9;
  });
});

test("rejects real-failure, recovery, physical, target, all-state, or count promotion", async () => {
  for (const key of [
    "realNetworkFailureVerified",
    "retryRecoveryVerified",
    "physicalTelevisionVerified",
    "physicalControllerVerified",
    "reservedHomeVerified",
    "nativeHostVerified",
    "catalogGameCompatibilityVerified",
    "allLauncherStatesVerified",
    "targetPlatformQualified",
    "frameRateQualified",
  ]) {
    await validateMutation((artifact) => {
      artifact.disposition[key] = true;
    });
  }
  await validateMutation((artifact) => {
    artifact.summary.catalogGameCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.summary.launcherStateCount = 4;
  });
});

test("rejects stale provenance, weakened boundaries, or unknown claims", async () => {
  await validateMutation((artifact) => {
    artifact.provenance.stylePathSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.provenance.productionSourceTree.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.claimBoundary = "All launcher surfaces and televisions passed.";
  });
  await validateMutation((artifact) => {
    artifact.limitations.pop();
  });
  await validateMutation((artifact) => {
    artifact.productionReady = true;
  });
});
