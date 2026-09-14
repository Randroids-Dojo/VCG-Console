import { launcherBaselines } from "./launcher-evidence-baselines.mjs";
import { exactKeys } from "./evidence-primitives.mjs";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OCRA_FALLBACK_CLAIM_BOUNDARY,
  OCRA_FALLBACK_EVIDENCE_FORMAT,
  OCRA_FALLBACK_LIMITATIONS,
  OCRA_FALLBACK_PROBES,
} from "./generate-ocra-platform-fallback-evidence.mjs";
import {
  normalizedSha256,
  sha256,
  sourceTreeCommitment,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
} from "./generate-tv-conformance-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  root,
  "benchmarks/font-coverage/windows-x64-installed-chrome-ocra-platform-fallback-v1.json",
);
const baseEvidencePath = resolve(
  root,
  "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json",
);
const MAX_ARTIFACT_BYTES = 128 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const EXPECTED_SCREENSHOT = launcherBaselines.fontFallback.screenshot;
const EXPECTED_REQUEST_COUNTS = launcherBaselines.fontFallback.requestCounts;
const expectedFontByProbe = Object.freeze({
  "ascii-a": ["OCRA", "OCRA", true],
  "middle-dot": ["OCRA", "OCRA", true],
});
const provenancePaths = Object.freeze({
  stylePath: "apps/console-lab/src/styles.css",
  baseEvidencePath:
    "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json",
  generatorPath: "scripts/generate-ocra-platform-fallback-evidence.mjs",
  validatorPath: "scripts/validate-ocra-platform-fallback-evidence.mjs",
});

function expectedObservations() {
  return OCRA_FALLBACK_PROBES.map((probe) => {
    const [familyName, postScriptName, customFont] = expectedFontByProbe[probe.id];
    return {
      ...probe,
      fonts: [{ familyName, postScriptName, customFont, glyphCount: 1 }],
    };
  });
}

async function validateScreenshot(screenshot) {
  assert.deepEqual(screenshot, EXPECTED_SCREENSHOT);
  const absolute = resolve(root, screenshot.path);
  assert.equal(
    absolute.startsWith(resolve(root, "benchmarks/font-coverage")),
    true,
  );
  const metadata = await stat(absolute);
  assert.equal(metadata.isFile(), true);
  assert.ok(metadata.size > 0 && metadata.size <= MAX_SCREENSHOT_BYTES);
  assert.equal(metadata.size, screenshot.bytes);
  const bytes = await readFile(absolute);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
  assert.equal(sha256(bytes), screenshot.sha256);
}

async function validateProvenance(provenance) {
  const expectedKeys = Object.keys(provenancePaths).flatMap((key) => [
    key,
    `${key}Sha256`,
  ]);
  expectedKeys.push("baseEvidenceBytes", "baseEvidenceSha256", "productionSourceTree");
  exactKeys(provenance, expectedKeys, "provenance");
  for (const [key, path] of Object.entries(provenancePaths)) {
    assert.equal(provenance[key], path);
    assert.equal(
      provenance[`${key}Sha256`],
      normalizedSha256(await readFile(resolve(root, path))),
    );
  }
  const baseBytes = await readFile(baseEvidencePath);
  assert.equal(provenance.baseEvidenceBytes, baseBytes.length);
  assert.equal(provenance.baseEvidenceSha256, sha256(baseBytes));
  assert.deepEqual(provenance.productionSourceTree, await sourceTreeCommitment());
}

export async function validateOcraPlatformFallbackEvidence(
  path = defaultArtifactPath,
) {
  const metadata = await stat(resolve(path));
  assert.equal(metadata.isFile(), true);
  assert.ok(metadata.size > 0 && metadata.size <= MAX_ARTIFACT_BYTES);
  const artifact = JSON.parse(await readFile(resolve(path), "utf8"));
  exactKeys(
    artifact,
    [
      "format",
      "evidenceDate",
      "environment",
      "baseStructuralEvidence",
      "probe",
      "browser",
      "screenshot",
      "summary",
      "provenance",
      "disposition",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(artifact.format, OCRA_FALLBACK_EVIDENCE_FORMAT);
  assert.equal(artifact.evidenceDate, launcherBaselines.fontFallback.observation.evidenceDate);
  assert.deepEqual(artifact.environment, {
    buildMode: "lab",
    platform: "windows-x64",
    browserProduct: launcherBaselines.fontFallback.observation.environment.browserProduct,
    node: launcherBaselines.fontFallback.observation.environment.node,
    headless: true,
    devicePixelRatio: 1,
    viewport: { width: 1920, height: 1080 },
  });

  const baseEvidence = JSON.parse(await readFile(baseEvidencePath, "utf8"));
  assert.deepEqual(
    OCRA_FALLBACK_PROBES.slice(1).map(({ codePoint }) => codePoint),
    baseEvidence.coverage.productionSource.nonAsciiCodePoints.map(
      ({ codePoint }) => codePoint,
    ),
  );
  assert.deepEqual(artifact.baseStructuralEvidence, {
    path: "benchmarks/font-coverage/ocra-font-structural-evidence-v1.json",
    format: baseEvidence.format,
    fontPath: baseEvidence.subject.path,
    fontBytes: baseEvidence.subject.bytes,
    fontSha256: baseEvidence.subject.sha256,
    productionSourceNonAsciiCodePointCount:
      baseEvidence.coverage.summary.productionSourceNonAsciiCodePointCount,
    productionSourceNonAsciiMissingCount:
      baseEvidence.coverage.summary.productionSourceNonAsciiMissingCount,
  });
  assert.deepEqual(artifact.probe, {
    cssFontFamily: "OCRA, ui-monospace, SFMono-Regular, monospace",
    cssFontSizePx: 88,
    observationCount: 2,
    observations: expectedObservations(),
    overflowCssPx: { horizontal: 0, vertical: 0 },
  });
  assert.deepEqual(artifact.browser, {
    documentReadyState: "complete",
    pageErrorCount: 0,
    requestFailureCount: 0,
    consoleErrors: [],
    requestCounts: EXPECTED_REQUEST_COUNTS,
  });
  await validateScreenshot(artifact.screenshot);
  assert.deepEqual(artifact.summary, {
    probeCodePointCount: 2,
    customFontObservationCount: 2,
    platformFallbackObservationCount: 0,
    distinctFamilyNames: ["OCRA"],
    distinctPostScriptNames: ["OCRA"],
  });
  await validateProvenance(artifact.provenance);
  assert.deepEqual(artifact.disposition, {
    exactWindowsChromeObservationVerified: true,
    productionCssStackUsed: true,
    diagnosticGridOnly: true,
    deterministicCrossPlatformFallbackVerified: false,
    fallbackSelected: false,
    glyphShapesVerified: false,
    tvLegibilityVerified: false,
    localizationQualified: false,
    accessibilityQualified: false,
    redistributionApproved: false,
    productionReady: false,
  });
  assert.equal(artifact.claimBoundary, OCRA_FALLBACK_CLAIM_BOUNDARY);
  assert.deepEqual(artifact.limitations, [...OCRA_FALLBACK_LIMITATIONS]);
  return artifact;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const artifact = await validateOcraPlatformFallbackEvidence(process.argv[2]);
  console.log(
    `validated OCR-A platform fallback observation: ${artifact.summary.customFontObservationCount} ` +
      `custom-font and ${artifact.summary.platformFallbackObservationCount} platform-fallback probes`,
  );
}
