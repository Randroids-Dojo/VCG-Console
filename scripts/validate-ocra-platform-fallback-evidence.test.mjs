import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import {
  validateOcraPlatformFallbackEvidence,
} from "./validate-ocra-platform-fallback-evidence.mjs";

const artifactPath = resolve(
  "benchmarks/font-coverage/windows-x64-chrome-150-ocra-platform-fallback-v1.json",
);
let baseline;
let temporaryRoot;
let sequence = 0;

before(async () => {
  baseline = JSON.parse(await readFile(artifactPath, "utf8"));
  temporaryRoot = await mkdtemp(join(tmpdir(), "vcg-ocra-fallback-"));
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
  await assert.rejects(validateOcraPlatformFallbackEvidence(path));
}

test("accepts the exact Windows Chrome OCR-A fallback observation", async () => {
  const artifact = await validateOcraPlatformFallbackEvidence();
  assert.equal(artifact.summary.customFontObservationCount, 2);
  assert.equal(artifact.summary.platformFallbackObservationCount, 10);
  assert.deepEqual(artifact.summary.distinctFamilyNames, [
    "Cambria Math",
    "Consolas",
    "OCRA",
    "Segoe UI Symbol",
  ]);
});

test("rejects format, date, platform, browser, or viewport substitution", async () => {
  await validateMutation((artifact) => {
    artifact.format = "vcg-ocra-platform-fallback-observation/v2";
  });
  await validateMutation((artifact) => {
    artifact.evidenceDate = "2026-07-25";
  });
  await validateMutation((artifact) => {
    artifact.environment.platform = "linux-x64";
  });
  await validateMutation((artifact) => {
    artifact.environment.browserProduct = "Chrome/151.0.0.0";
  });
  await validateMutation((artifact) => {
    artifact.environment.viewport.width = 1280;
  });
});

test("rejects base structural evidence substitution", async () => {
  await validateMutation((artifact) => {
    artifact.baseStructuralEvidence.fontSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.baseStructuralEvidence.productionSourceNonAsciiMissingCount = 13;
  });
  await validateMutation((artifact) => {
    artifact.baseStructuralEvidence.path = "untrusted.json";
  });
});

test("rejects probe stack, ordering, character, role, or overflow drift", async () => {
  await validateMutation((artifact) => {
    artifact.probe.cssFontFamily = "OCRA, sans-serif";
  });
  await validateMutation((artifact) => {
    artifact.probe.observations.reverse();
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[2].character = "÷";
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[6].role = "previous";
  });
  await validateMutation((artifact) => {
    artifact.probe.overflowCssPx.vertical = 1;
  });
});

test("rejects custom OCR-A identity or glyph-count drift", async () => {
  await validateMutation((artifact) => {
    artifact.probe.observations[0].fonts[0].familyName = "OCR-A";
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[1].fonts[0].customFont = false;
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[0].fonts[0].glyphCount = 2;
  });
});

test("rejects platform fallback identity or custom-font promotion", async () => {
  await validateMutation((artifact) => {
    artifact.probe.observations[2].fonts[0].familyName = "Arial";
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[8].fonts[0].postScriptName = "Consolas";
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[9].fonts[0].customFont = true;
  });
  await validateMutation((artifact) => {
    artifact.probe.observations[11].fonts = [];
  });
});

test("rejects hidden browser failures or request drift", async () => {
  await validateMutation((artifact) => {
    artifact.browser.pageErrorCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.consoleErrors.push("hidden");
  });
  await validateMutation((artifact) => {
    artifact.browser.requestFailureCount = 1;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/fonts/OCRA.ttf"] = 0;
  });
  await validateMutation((artifact) => {
    artifact.browser.requestCounts["/unexpected"] = 1;
  });
});

test("rejects screenshot or summary substitution", async () => {
  await validateMutation((artifact) => {
    artifact.screenshot.sha256 = "f".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.screenshot.bytes += 1;
  });
  await validateMutation((artifact) => {
    artifact.summary.platformFallbackObservationCount = 9;
  });
  await validateMutation((artifact) => {
    artifact.summary.distinctFamilyNames.pop();
  });
});

test("rejects stale or substituted provenance", async () => {
  await validateMutation((artifact) => {
    artifact.provenance.stylePathSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.provenance.baseEvidenceSha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    artifact.provenance.productionSourceTree.sha256 = "0".repeat(64);
  });
  await validateMutation((artifact) => {
    delete artifact.provenance.validatorPathSha256;
  });
});

test("rejects unsupported qualification, selection, or release claims", async () => {
  for (const key of [
    "deterministicCrossPlatformFallbackVerified",
    "fallbackSelected",
    "glyphShapesVerified",
    "tvLegibilityVerified",
    "localizationQualified",
    "accessibilityQualified",
    "redistributionApproved",
    "productionReady",
  ]) {
    await validateMutation((artifact) => {
      artifact.disposition[key] = true;
    });
  }
  await validateMutation((artifact) => {
    artifact.disposition.diagnosticGridOnly = false;
  });
});

test("rejects weakened claim boundary, limitations, or unknown fields", async () => {
  await validateMutation((artifact) => {
    artifact.claimBoundary = "The fallback stack is qualified.";
  });
  await validateMutation((artifact) => {
    artifact.limitations.pop();
  });
  await validateMutation((artifact) => {
    artifact.selectedFallback = "Consolas";
  });
});
