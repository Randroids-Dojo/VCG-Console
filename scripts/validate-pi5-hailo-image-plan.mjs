import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPlanPath = resolve(
  root,
  "benchmarks/pi-image/pi5-hailo-image-plan-v1.json",
);
const MAX_PLAN_BYTES = 64 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;

export const PI5_HAILO_IMAGE_PLAN_FORMAT = "vcg-pi5-hailo-image-plan/v1";
export const PI5_HAILO_IMAGE_BLOCKERS = Object.freeze([
  "hardware-receipt-and-revision",
  "accelerator-part-identity",
  "camera-selection-and-uvc-identity",
  "immutable-apt-and-python-inputs",
  "hailo-package-and-firmware-tuple",
  "hef-resource-and-postprocessor-hashes",
  "vcg-release-and-build-recipe",
  "write-and-destructive-test-authority",
]);

const expectedTopLevelKeys = [
  "format",
  "status",
  "observedAt",
  "claimBoundary",
  "hardware",
  "baseImage",
  "hailoSourceCandidate",
  "immutableInputs",
  "executionGate",
  "requiredBootCapture",
  "prohibitedImageData",
];
const expectedImmutableKeys = [
  "aptSnapshotManifestSha256",
  "aptPackageManifestSha256",
  "pythonLockSha256",
  "hailoResourceManifestSha256",
  "poseHefSha256",
  "posePostProcessorSha256",
  "browserArtifactSha256",
  "vcgReleaseManifestSha256",
  "buildRecipeSha256",
  "dataExclusionScanSha256",
];
const forbiddenKeyPattern = /(password|secret|credential|privatekey|wifissid)/iu;

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function rejectForbiddenKeys(value, path = "plan") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assert.ok(!forbiddenKeyPattern.test(key), `${path}.${key} is prohibited`);
    rejectForbiddenKeys(entry, `${path}.${key}`);
  }
}

export function validatePi5HailoImagePlan(plan) {
  assert.ok(plan && typeof plan === "object" && !Array.isArray(plan));
  exactKeys(plan, expectedTopLevelKeys, "plan");
  assert.equal(plan.format, PI5_HAILO_IMAGE_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Source-pinned, non-executing/u);
  assert.match(plan.claimBoundary, /No image has been downloaded, built, written/u);

  exactKeys(plan.hardware, ["board", "accelerator", "camera"], "hardware");
  assert.deepEqual(plan.hardware.board, {
    product: "Raspberry Pi 5 8GB",
    quotedManufacturerPartNumber: "SC1112",
    receivedRevision: null,
    eepromVersion: null,
  });
  assert.deepEqual(plan.hardware.accelerator, {
    product: "Raspberry Pi AI HAT+ 26 TOPS",
    architecture: "hailo8",
    quotedManufacturerIdentifiers: ["SC1791", "SC1468"],
    approvedManufacturerPartNumber: null,
    receivedRevision: null,
    firmwareVersion: null,
  });
  assert.deepEqual(plan.hardware.camera, {
    contract: "wide-angle UVC USB RGB; 1920x1080 at 60 FPS required",
    manufacturerPartNumber: null,
    usbVendorProductId: null,
    firmwareVersion: null,
    uvcPath: null,
  });

  assert.deepEqual(plan.baseImage, {
    product: "Raspberry Pi OS with desktop, 64-bit",
    debianRelease: "13 (trixie)",
    releaseDate: "2026-06-18",
    nominalKernelVersion: "6.18",
    downloadUrl:
      "https://downloads.raspberrypi.com/raspios_arm64/images/raspios_arm64-2026-06-19/2026-06-18-raspios-trixie-arm64.img.xz",
    compressedSha256:
      "123287c05f27b0eebd8f65456f6369b8f6635fa50a3d440a4f9f6223bf58c8e2",
    locallyVerifiedCompressedSha256: null,
    expandedImageSha256: null,
  });
  assert.match(plan.baseImage.compressedSha256, SHA256);

  assert.deepEqual(plan.hailoSourceCandidate, {
    repository: "https://github.com/hailo-ai/hailo-apps.git",
    tag: "26.03.1",
    tagObject: "8887f6057fd570ff182134a5a0a66ca3d914e603",
    commit: "891ce701c2ebe239a5d277759eb75a30f76678a9",
    hailoRtCandidateFamily: "4.23",
    tappasCoreCandidateVersion: "5.1.0",
    installedHailoRtVersion: null,
    installedPcieDriverVersion: null,
    installedTappasCoreVersion: null,
    installedPythonBindingVersions: null,
    sourceTreeSha256: null,
  });
  assert.match(plan.hailoSourceCandidate.tagObject, COMMIT);
  assert.match(plan.hailoSourceCandidate.commit, COMMIT);

  exactKeys(plan.immutableInputs, expectedImmutableKeys, "immutableInputs");
  for (const [key, value] of Object.entries(plan.immutableInputs)) {
    assert.equal(value, null, `blocked plan cannot populate ${key}`);
  }

  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    downloadAuthorized: false,
    imageBuildAuthorized: false,
    removableMediaWriteAuthorized: false,
    destructiveTestAuthorized: false,
    blockerCodes: [...PI5_HAILO_IMAGE_BLOCKERS],
  });
  assert.equal(plan.requiredBootCapture.length, 10);
  assert.equal(new Set(plan.requiredBootCapture).size, 10);
  assert.equal(plan.prohibitedImageData.length, 9);
  assert.equal(new Set(plan.prohibitedImageData).size, 9);
  assert.ok(plan.requiredBootCapture.every((entry) => typeof entry === "string"));
  assert.ok(plan.prohibitedImageData.every((entry) => typeof entry === "string"));
  rejectForbiddenKeys(plan);
  return plan;
}

export function parsePi5HailoImagePlanBytes(bytes) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_PLAN_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Pi image plan must be valid UTF-8 JSON");
  }
  validatePi5HailoImagePlan(value);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "Pi image plan must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

export async function validateTrackedPi5HailoImagePlan() {
  return parsePi5HailoImagePlanBytes(await readFile(trackedPlanPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5HailoImagePlan();
  console.log(
    `Pi image plan valid: status=${plan.status} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
