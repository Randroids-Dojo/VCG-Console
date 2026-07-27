import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  installFrozenLauncherClock,
  LAUNCHER_TV_BROWSER_CLOCK,
} from "./generate-launcher-tv-conformance-evidence.mjs";

import {
  expectedLauncherTvProvenance,
  expectedLauncherTvScreenshots,
  validateLauncherTvConformanceEvidence,
  validateTrackedLauncherTvConformanceEvidence,
} from "./validate-launcher-tv-conformance-evidence.mjs";

async function fixture() {
  return structuredClone(
    await validateTrackedLauncherTvConformanceEvidence(),
  );
}

async function baseContractSha256() {
  const bytes = await readFile(
    new URL(
      "../benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json",
      import.meta.url,
    ),
  );
  return createHash("sha256").update(bytes).digest("hex");
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const [provenance, screenshots, baseSha256] = await Promise.all([
    expectedLauncherTvProvenance(),
    expectedLauncherTvScreenshots(),
    baseContractSha256(),
  ]);
  const operation = () =>
    validateLauncherTvConformanceEvidence(
      artifact,
      provenance,
      screenshots,
      baseSha256,
    );
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact launcher-home TV conformance evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.resolutionCount, 3);
  assert.equal(artifact.summary.launcherViewCount, 1);
  assert.equal(artifact.summary.physicalTelevisionCount, 0);
});

test("installs a real frozen page Date before launcher navigation", async () => {
  let installedTime;
  let initScript;
  let initArgument;
  await installFrozenLauncherClock({
    clock: {
      async install({ time }) {
        installedTime = time;
      },
    },
    async addInitScript(callback, argument) {
      initScript = callback;
      initArgument = argument;
    },
  });

  assert.equal(
    installedTime.toISOString(),
    new Date(LAUNCHER_TV_BROWSER_CLOCK).toISOString(),
  );
  assert.equal(initArgument, Date.parse(LAUNCHER_TV_BROWSER_CLOCK));
  const context = {};
  runInNewContext(`(${initScript.toString()})(${initArgument})`, context);
  assert.equal(runInNewContext("Date.now()", context), initArgument);
  assert.equal(
    runInNewContext("new Date().toISOString()", context),
    new Date(LAUNCHER_TV_BROWSER_CLOCK).toISOString(),
  );
  assert.equal(
    runInNewContext("new Date('2024-01-02T03:04:05.000Z').toISOString()", context),
    "2024-01-02T03:04:05.000Z",
  );
});

test("rejects base contract, resolution, or environment substitution", async () => {
  await rejects((artifact) => {
    artifact.baseContract.sha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.contract.resolutions[0].width = 1920;
  });
  await rejects((artifact) => {
    artifact.environment.devicePixelRatio = 2;
  });
  await rejects((artifact) => {
    artifact.environment.browserClock =
      "2026-07-24T20:00:00-07:00";
  });
});

test("rejects safe-area escape, missing critical text, or weak text", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].safeArea.left = 63;
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].criticalTextInsideSafeArea = 23;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].criticalTextCount = 23;
  });
  await rejects((artifact) => {
    artifact.browser.observations[0].minimumCriticalTextCssPx = 23;
  });
});

test("rejects critical, section, or launcher overflow", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].criticalTextOverlapCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].sectionOverlapCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].launcherOverflowCssPx.vertical = 1;
  });
  await rejects((artifact) => {
    artifact.disposition.criticalAndSectionOverlapRejected = false;
  });
});

test("rejects weak or missing action targets", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].actionTargetCount = 11;
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

test("rejects focus, select, Back, or native-projection drift", async () => {
  await rejects((artifact) => {
    artifact.browser.observations[0].focusTrace[1] = "launcher-home";
  });
  await rejects((artifact) => {
    artifact.browser.observations[1].searchVisibleAfterSelect = false;
  });
  await rejects((artifact) => {
    artifact.browser.observations[2].searchHiddenAfterBack = false;
  });
  await rejects((artifact) => {
    artifact.browser.observations[0].nativePackageProjection =
      "available";
  });
});

test("rejects screenshot substitution", async () => {
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

test("rejects hidden browser errors or build-resource drift", async () => {
  await rejects((artifact) => {
    artifact.browser.consoleErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.requestFailureCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.requestCounts["/fonts/OCRA.ttf"] = 2;
  });
  await rejects((artifact) => {
    artifact.browser.requestCounts["/favicon.ico"] = 3;
  });
});

test("rejects physical, native, other-view, target, or rate promotion", async () => {
  await rejects((artifact) => {
    artifact.disposition.physicalTelevisionVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.physicalControllerVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.nativeHostVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.otherLauncherViewsVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.targetPlatformQualified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.frameRateQualified = true;
  });
});

test("rejects fabricated views, participants, games, or hardware", async () => {
  await rejects((artifact) => {
    artifact.summary.launcherViewCount = 2;
  });
  await rejects((artifact) => {
    artifact.summary.physicalTelevisionCount = 1;
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
    artifact.provenance.launcherPathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.provenance.productionSourceTree.sha256 =
      "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "The launcher is TV-qualified.";
  });
  await rejects((artifact) => {
    artifact.limitations[0] = "Every launcher view passed.";
  });
  await rejects(
    (artifact) => {
      artifact.productQualified = true;
    },
    /artifact keys must be exactly/u,
  );
});
