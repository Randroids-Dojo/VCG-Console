import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import {
  validateLauncherSearchTvEvidence,
} from "./validate-launcher-search-tv-evidence.mjs";

const artifactPath = resolve(
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
);
let baseline;
let temporaryRoot;
let sequence = 0;

before(async () => {
  baseline = JSON.parse(await readFile(artifactPath, "utf8"));
  temporaryRoot = await mkdtemp(join(tmpdir(), "vcg-launcher-search-tv-"));
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
  await assert.rejects(validateLauncherSearchTvEvidence(path));
}

test("accepts the exact launcher Search TV evidence", async () => {
  const artifact = await validateLauncherSearchTvEvidence();
  assert.equal(artifact.summary.observationCount, 6);
});

test("rejects format, base evidence, environment, or resolution substitution", async () => {
  await validateMutation((artifact) => {
    artifact.format = "vcg-launcher-search-tv-conformance-evidence/v2";
  });
  await validateMutation((artifact) => {
    artifact.baseRepresentativeEvidence.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.environment.browserProduct = "Chrome/151.0.0.0";
  });
  await validateMutation((artifact) => {
    artifact.contract.resolutions[0].height = 719;
  });
});

test("rejects state, query, ordering, result, or empty-state substitution", async () => {
  await validateMutation((artifact) => {
    artifact.contract.states[0].id = "all-results";
  });
  await validateMutation((artifact) => {
    artifact.browser.observations.reverse();
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].query = "Motion";
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].resultCount = 4;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].emptyStateVisible = false;
  });
});

test("rejects safe-area escape or weakened critical text", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].safeArea.right += 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].criticalTextInsideSafeArea = 17;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].minimumCriticalTextCssPx = 23.999;
  });
});

test("rejects critical overlap or overlay overflow", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].criticalTextOverlapCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].overlayOverflowCssPx.vertical = 2;
  });
});

test("rejects weak or missing Search actions", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].actionTargetCount = 5;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].minimumActionTargetWidthCssPx = 47.999;
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].minimumActionTargetHeightCssPx = 47.999;
  });
});

test("rejects ArrowDown, Tab-wrap, Escape, or opener-focus drift", async () => {
  await validateMutation((artifact) => {
    artifact.browser.observations[0].focusTrace[1] = "result-last";
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[0].focusTrace[4] = "launcher-home";
  });
  await validateMutation((artifact) => {
    artifact.browser.observations[1].focusTrace.splice(1, 1);
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
    artifact.browser.pageErrorCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestFailureCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/"] = 5;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/unexpected"] = 6;
  });
});

test("rejects arbitrary-query, scrolling, activation, physical, target, or count promotion", async () => {
  for (const key of [
    "arbitraryQueryVerified",
    "scrollingResultsVerified",
    "resultActivationVerified",
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
    artifact.summary.distinctQueryCount = 3;
  });
  await validateMutation((artifact) => {
    artifact.summary.catalogGameCount = 1;
  });
});

test("rejects stale provenance, weakened boundaries, or unknown claims", async () => {
  await validateMutation((artifact) => {
    artifact.provenance.searchPathSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.provenance.productionSourceTree.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.claimBoundary = "Search is qualified everywhere.";
  });
  await validateMutation((artifact) => {
    artifact.limitations.pop();
  });
  await validateMutation((artifact) => {
    artifact.productionReady = true;
  });
});
