import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TV_CONFORMANCE_BROWSER_PRODUCT,
  TV_CONFORMANCE_CLAIM_BOUNDARY,
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_EVIDENCE_FORMAT,
  TV_CONFORMANCE_LIMITATIONS,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";
import {
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 96 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const frozenScreenshots = Object.freeze({
  "720p": Object.freeze({
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-720p.png",
    bytes: 147137,
    sha256:
      "b7ace5a55df45fb33b94f09eda5c51eb580cbbc0f65c27b99e7b89417f38eb79",
  }),
  "1080p": Object.freeze({
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-1080p.png",
    bytes: 245554,
    sha256:
      "5596fe634fccbf8aaecbdbef09aebfe90168e85fb13d44f90a85da9d9e8f6199",
  }),
  "4k": Object.freeze({
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-4k.png",
    bytes: 576578,
    sha256:
      "2510881cd855acb7db63f88c4f489b123ebd5b8e485e9a1662be6d8396edfe87",
  }),
});
const provenancePaths = Object.freeze({
  documentPath: "examples/tv-conformance/index.html",
  stylePath: "examples/tv-conformance/styles.css",
  scriptPath: "examples/tv-conformance/app.js",
  generatorPath: "scripts/generate-tv-conformance-evidence.mjs",
  validatorPath: "scripts/validate-tv-conformance-evidence.mjs",
});
const observationExpectations = Object.freeze({
  "720p": Object.freeze({
    safeArea: Object.freeze({
      left: 64,
      top: 36,
      right: 1216,
      bottom: 684,
      width: 1152,
      height: 648,
    }),
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 256.609,
    minimumActionTargetHeightCssPx: 64,
  }),
  "1080p": Object.freeze({
    safeArea: Object.freeze({
      left: 96,
      top: 54,
      right: 1824,
      bottom: 1026,
      width: 1728,
      height: 972,
    }),
    minimumCriticalTextCssPx: 31.68,
    minimumActionTargetWidthCssPx: 385.391,
    minimumActionTargetHeightCssPx: 64,
  }),
  "4k": Object.freeze({
    safeArea: Object.freeze({
      left: 192,
      top: 108,
      right: 3648,
      bottom: 2052,
      width: 3456,
      height: 1944,
    }),
    minimumCriticalTextCssPx: 38,
    minimumActionTargetWidthCssPx: 803,
    minimumActionTargetHeightCssPx: 70,
  }),
});

function exactKeys(value, expected, path) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${path} must be an object`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${path} keys must be exactly ${expected.join(", ")}`,
  );
}

function normalizedSha256(bytes) {
  return createHash("sha256")
    .update(bytes.toString("utf8").replaceAll("\r\n", "\n"))
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function expectedTvConformanceProvenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return Object.fromEntries(
    entries.flatMap(([key, path, digest]) => [
      [key, path],
      [`${key}Sha256`, digest],
    ]),
  );
}

export async function expectedTvConformanceScreenshots() {
  const entries = await Promise.all(
    TV_CONFORMANCE_RESOLUTIONS.map(async ({ id }) => {
      const expected = frozenScreenshots[id];
      const bytes = await readFile(resolve(root, expected.path));
      assert.ok(
        bytes.length > PNG_SIGNATURE.length
          && bytes.length <= MAX_SCREENSHOT_BYTES,
        `${expected.path} byte size is invalid`,
      );
      assert.ok(
        bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
        `${expected.path} must have a PNG signature`,
      );
      assert.equal(
        bytes.length,
        expected.bytes,
        `${expected.path} byte identity changed`,
      );
      assert.equal(
        sha256(bytes),
        expected.sha256,
        `${expected.path} digest identity changed`,
      );
      return [id, expected];
    }),
  );
  return Object.fromEntries(entries);
}

function validateAnimation(animation, path) {
  exactKeys(
    animation,
    [
      "sampleCount",
      "p50DeltaMs",
      "p95DeltaMs",
      "worstDeltaMs",
      "negativeDeltaCount",
    ],
    path,
  );
  assert.equal(animation.sampleCount, 120);
  assert.equal(animation.negativeDeltaCount, 0);
  for (const [name, value] of [
    ["p50DeltaMs", animation.p50DeltaMs],
    ["p95DeltaMs", animation.p95DeltaMs],
    ["worstDeltaMs", animation.worstDeltaMs],
  ]) {
    assert.ok(
      Number.isFinite(value) && value >= 0 && value <= 1_000,
      `${path}.${name} must be a bounded nonnegative observation`,
    );
  }
  assert.ok(
    animation.p50DeltaMs <= animation.p95DeltaMs
      && animation.p95DeltaMs <= animation.worstDeltaMs,
    `${path} percentiles must be ordered`,
  );
}

function validateObservation(
  observation,
  resolution,
  expectedScreenshot,
) {
  const path = `artifact.browser.observations[${resolution.id}]`;
  exactKeys(
    observation,
    [
      "id",
      "width",
      "height",
      "documentReadyState",
      "safeInsetPercent",
      "safeArea",
      "criticalRegionCount",
      "criticalRegionsInsideSafeArea",
      "minimumCriticalTextCssPx",
      "actionTargetCount",
      "minimumActionTargetWidthCssPx",
      "minimumActionTargetHeightCssPx",
      "focusOrder",
      "finalFocusedOrder",
      "keyboardActivationCount",
      "keyboardBackRequestCount",
      "animation",
      "screenshot",
    ],
    path,
  );
  assert.equal(observation.id, resolution.id);
  assert.equal(observation.width, resolution.width);
  assert.equal(observation.height, resolution.height);
  assert.equal(observation.documentReadyState, "complete");
  assert.equal(observation.safeInsetPercent, 5);
  exactKeys(
    observation.safeArea,
    ["left", "top", "right", "bottom", "width", "height"],
    `${path}.safeArea`,
  );
  const expected = observationExpectations[resolution.id];
  assert.deepEqual(observation.safeArea, expected.safeArea);
  assert.equal(observation.criticalRegionCount, 5);
  assert.equal(
    observation.criticalRegionsInsideSafeArea,
    observation.criticalRegionCount,
  );
  assert.equal(
    observation.minimumCriticalTextCssPx,
    expected.minimumCriticalTextCssPx,
  );
  assert.ok(observation.minimumCriticalTextCssPx >= 24);
  assert.equal(observation.actionTargetCount, 4);
  assert.equal(
    observation.minimumActionTargetWidthCssPx,
    expected.minimumActionTargetWidthCssPx,
  );
  assert.equal(
    observation.minimumActionTargetHeightCssPx,
    expected.minimumActionTargetHeightCssPx,
  );
  assert.ok(
    observation.minimumActionTargetWidthCssPx >= 48
      && observation.minimumActionTargetHeightCssPx >= 48,
  );
  assert.deepEqual(observation.focusOrder, [0, 1, 2, 3]);
  assert.equal(observation.finalFocusedOrder, 1);
  assert.equal(observation.keyboardActivationCount, 2);
  assert.equal(observation.keyboardBackRequestCount, 1);
  validateAnimation(observation.animation, `${path}.animation`);
  exactKeys(
    observation.screenshot,
    ["path", "bytes", "sha256"],
    `${path}.screenshot`,
  );
  assert.deepEqual(observation.screenshot, expectedScreenshot);
  assert.match(observation.screenshot.sha256, SHA256_PATTERN);
}

export function validateTvConformanceEvidence(
  value,
  expectedProvenance,
  expectedScreenshots,
) {
  exactKeys(
    value,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "environment",
      "contract",
      "browser",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(value.format, TV_CONFORMANCE_EVIDENCE_FORMAT);
  assert.equal(value.evidenceDate, TV_CONFORMANCE_EVIDENCE_DATE);
  assert.equal(
    value.evidenceClass,
    "windows-x64-headless-chrome-tv-authoring-conformance",
  );
  assert.equal(
    value.qualification,
    "candidate-authoring-surface-only-not-tv-or-game-qualification",
  );
  assert.ok(Number.isFinite(Date.parse(value.retrievedAtUtc)));
  assert.ok(
    value.retrievedAtUtc.startsWith(`${TV_CONFORMANCE_EVIDENCE_DATE}T`),
  );

  exactKeys(
    value.environment,
    [
      "producerPlatform",
      "producerArchitecture",
      "nodeVersion",
      "browserProduct",
      "devicePixelRatio",
    ],
    "artifact.environment",
  );
  assert.deepEqual(value.environment, {
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: GODOT_EXPORT_NODE_VERSION,
    browserProduct: TV_CONFORMANCE_BROWSER_PRODUCT,
    devicePixelRatio: 1,
  });

  exactKeys(
    value.contract,
    [
      "safeInsetPercent",
      "minimumCriticalTextCssPx",
      "minimumActionTargetCssPx",
      "frameTimingModel",
      "resolutions",
    ],
    "artifact.contract",
  );
  assert.deepEqual(value.contract, {
    safeInsetPercent: 5,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetCssPx: 48,
    frameTimingModel: "request-animation-frame-elapsed-time",
    resolutions: TV_CONFORMANCE_RESOLUTIONS,
  });

  exactKeys(
    value.browser,
    [
      "browserProduct",
      "observations",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "requestCounts",
    ],
    "artifact.browser",
  );
  assert.equal(value.browser.browserProduct, TV_CONFORMANCE_BROWSER_PRODUCT);
  assert.ok(Array.isArray(value.browser.observations));
  assert.equal(
    value.browser.observations.length,
    TV_CONFORMANCE_RESOLUTIONS.length,
  );
  exactKeys(
    expectedScreenshots,
    TV_CONFORMANCE_RESOLUTIONS.map(({ id }) => id),
    "expectedScreenshots",
  );
  TV_CONFORMANCE_RESOLUTIONS.forEach((resolution, index) => {
    validateObservation(
      value.browser.observations[index],
      resolution,
      expectedScreenshots[resolution.id],
    );
  });
  assert.equal(value.browser.consoleErrorCount, 0);
  assert.equal(value.browser.pageErrorCount, 0);
  assert.equal(value.browser.requestFailureCount, 0);
  exactKeys(
    value.browser.requestCounts,
    ["/index.html", "/styles.css", "/app.js"],
    "artifact.browser.requestCounts",
  );
  assert.deepEqual(value.browser.requestCounts, {
    "/index.html": 3,
    "/styles.css": 3,
    "/app.js": 3,
  });

  exactKeys(
    value.disposition,
    [
      "candidateSafeAreaGeometryVerified",
      "candidateTextAndTargetMinimumsVerified",
      "keyboardFocusSelectAndBackVerified",
      "elapsedFrameSamplingVerified",
      "physicalTelevisionVerified",
      "physicalControllerVerified",
      "seatingDistanceLegibilityVerified",
      "hardwareOverscanVerified",
      "targetCompositorScalingVerified",
      "catalogGameCompatibilityVerified",
      "frameRateQualified",
    ],
    "artifact.disposition",
  );
  assert.deepEqual(value.disposition, {
    candidateSafeAreaGeometryVerified: true,
    candidateTextAndTargetMinimumsVerified: true,
    keyboardFocusSelectAndBackVerified: true,
    elapsedFrameSamplingVerified: true,
    physicalTelevisionVerified: false,
    physicalControllerVerified: false,
    seatingDistanceLegibilityVerified: false,
    hardwareOverscanVerified: false,
    targetCompositorScalingVerified: false,
    catalogGameCompatibilityVerified: false,
    frameRateQualified: false,
  });

  exactKeys(
    value.summary,
    [
      "resolutionCount",
      "screenshotCount",
      "physicalTelevisionCount",
      "physicalControllerCount",
      "participantCount",
      "catalogGameCount",
      "targetHardwareCount",
    ],
    "artifact.summary",
  );
  assert.deepEqual(value.summary, {
    resolutionCount: 3,
    screenshotCount: 3,
    physicalTelevisionCount: 0,
    physicalControllerCount: 0,
    participantCount: 0,
    catalogGameCount: 0,
    targetHardwareCount: 0,
  });

  exactKeys(
    value.provenance,
    Object.keys(expectedProvenance),
    "artifact.provenance",
  );
  assert.deepEqual(value.provenance, expectedProvenance);
  for (const [key, digest] of Object.entries(value.provenance)) {
    if (key.endsWith("Sha256")) assert.match(digest, SHA256_PATTERN);
  }
  assert.equal(value.claimBoundary, TV_CONFORMANCE_CLAIM_BOUNDARY);
  assert.deepEqual(value.limitations, TV_CONFORMANCE_LIMITATIONS);
  return value;
}

function parseBoundedJson(bytes) {
  assert.ok(
    bytes.length > 0 && bytes.length <= MAX_ARTIFACT_BYTES,
    "artifact byte size is invalid",
  );
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function validateTrackedTvConformanceEvidence() {
  const [bytes, expectedProvenance, expectedScreenshots] =
    await Promise.all([
      readFile(artifactPath),
      expectedTvConformanceProvenance(),
      expectedTvConformanceScreenshots(),
    ]);
  return validateTvConformanceEvidence(
    parseBoundedJson(bytes),
    expectedProvenance,
    expectedScreenshots,
  );
}

async function main() {
  const artifact = await validateTrackedTvConformanceEvidence();
  console.log(
    `validated candidate TV conformance; resolutions=${artifact.summary.resolutionCount}; screenshots=${artifact.summary.screenshotCount}; physicalTVs=${artifact.summary.physicalTelevisionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
