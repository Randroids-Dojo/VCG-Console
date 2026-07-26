import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json",
);
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const HAILO_ACCELERATOR_PLAN_FORMAT =
  "vcg-hailo-accelerator-comparison-plan/v1";
export const HAILO_ACCELERATOR_BLOCKERS = Object.freeze([
  "exact-13-and-26-hardware-access",
  "received-host-and-hat-identities",
  "qualified-pi-image-and-runtime-tuple",
  "hef-postprocessor-and-score-calibration",
  "same-input-corpus-authority-and-digest",
  "camera-room-clock-and-ground-truth",
  "counterbalanced-schedule-and-trial-counts",
  "accuracy-performance-thermal-and-cost-gates",
  "purchase-participant-and-data-handling-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "fixedHostBoundary",
  "variants",
  "comparisonLanes",
  "requiredWorkloads",
  "requiredMetrics",
  "acceptance",
  "selectionPolicy",
  "dataPolicy",
  "executionGate",
  "result",
];
const hostNullKeys = [
  "boardRevision",
  "operatingSystemImageSha256",
  "kernelRelease",
  "eepromVersion",
  "storageIdentitySha256",
  "powerSupplyIdentitySha256",
  "coolingAssemblyIdentitySha256",
  "enclosureStateSha256",
  "cameraIdentitySha256",
  "roomManifestSha256",
];
const openAcceptanceKeys = [
  "minimumPerCellDetectionRate",
  "maximumPerLandmarkP95TorsoNormalizedError",
  "minimumPerActionPrecision",
  "minimumPerActionRecall",
  "minimumPoseFps",
  "minimumGameFps",
  "maximumDroppedFrameRatio",
  "maximumSustainedSocTemperatureC",
  "maximumSustainedAcceleratorTemperatureC",
  "maximumThermalThrottleEvents",
  "minimumDeliveredSavingsUsdToReconsider26Tops",
];

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedDigest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256")
    .update(text.replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function validateSourceBindings(bindings, repositoryRoot) {
  const expected = [
    ["pi-image-recipe-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
    [
      "core17-provider-comparison-boundary",
      "benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json",
    ],
    [
      "edge-accuracy-campaign-boundary",
      "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json",
    ],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(
      normalizedDigest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateHailoAcceleratorComparisonPlan(plan, repositoryRoot = root) {
  assert.ok(plan && typeof plan === "object" && !Array.isArray(plan));
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, HAILO_ACCELERATOR_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-ai-hat-13-vs-26-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered accelerator comparison only/u);
  assert.match(plan.claimBoundary, /No 13 TOPS or 26 TOPS AI HAT has been received/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  exactKeys(
    plan.fixedHostBoundary,
    ["boardProduct", ...hostNullKeys],
    "fixedHostBoundary",
  );
  assert.equal(plan.fixedHostBoundary.boardProduct, "Raspberry Pi 5 8GB");
  for (const key of hostNullKeys) {
    assert.equal(plan.fixedHostBoundary[key], null, `blocked plan cannot populate ${key}`);
  }

  assert.equal(plan.variants.length, 2);
  const expectedVariants = [
    ["ai-hat-plus-13-hailo8l-yolov8s-pose", "Raspberry Pi AI HAT+ 13 TOPS", "hailo8l", 13, "yolov8s_pose"],
    ["ai-hat-plus-26-hailo8-yolov8m-pose", "Raspberry Pi AI HAT+ 26 TOPS", "hailo8", 26, "yolov8m_pose"],
  ];
  for (const [index, variant] of plan.variants.entries()) {
    exactKeys(
      variant,
      [
        "variantId",
        "acceleratorProduct",
        "architecture",
        "advertisedTops",
        "defaultPoseModel",
        "landmarkLayout",
        "receivedPartNumber",
        "receivedRevision",
        "hefSha256",
        "postProcessorSha256",
        "runtimeManifestSha256",
        "sameDateDeliveredCostUsd",
      ],
      `variants[${index}]`,
    );
    assert.deepEqual(
      [
        variant.variantId,
        variant.acceleratorProduct,
        variant.architecture,
        variant.advertisedTops,
        variant.defaultPoseModel,
      ],
      expectedVariants[index],
    );
    assert.equal(variant.landmarkLayout, "COCO-17");
    for (const key of [
      "receivedPartNumber",
      "receivedRevision",
      "hefSha256",
      "postProcessorSha256",
      "runtimeManifestSha256",
      "sameDateDeliveredCostUsd",
    ]) assert.equal(variant[key], null, `blocked variant cannot populate ${key}`);
  }

  const laneIds = [
    "paired-immutable-replay",
    "counterbalanced-live-full-pipeline",
    "sustained-concurrent-game-load",
  ];
  assert.deepEqual(plan.comparisonLanes.map((lane) => lane.laneId), laneIds);
  for (const [index, lane] of plan.comparisonLanes.entries()) {
    exactKeys(
      lane,
      [
        "laneId",
        "purpose",
        "inputRule",
        "timingBoundary",
        "counterbalanceRequired",
        "coldStartCount",
        "measuredTrialCountPerCell",
        "inputCorpusSha256",
        "scheduleSha256",
      ],
      `comparisonLanes[${index}]`,
    );
    assert.equal(lane.counterbalanceRequired, true);
    for (const key of [
      "coldStartCount",
      "measuredTrialCountPerCell",
      "inputCorpusSha256",
      "scheduleSha256",
    ]) assert.equal(lane[key], null, `blocked lane cannot populate ${key}`);
  }
  assert.match(plan.comparisonLanes[0].timingBoundary, /never reported as camera-exposure latency/u);
  assert.match(plan.comparisonLanes[1].inputRule, /sessions are not called identical inputs/u);

  assert.deepEqual(plan.requiredWorkloads, [
    "idle-tracker-and-launcher",
    "obstacle-motion-sample",
    "vibebots-compatibility-session",
    "mi-casa-es-su-casa-compatibility-session",
    "determined-compatibility-session",
  ]);
  assert.equal(plan.requiredMetrics.length, 11);
  assert.equal(new Set(plan.requiredMetrics).size, 11);

  assert.equal(plan.acceptance.maximumLiveExposureToActionP95Ms, 120);
  assert.equal(plan.acceptance.maximumPrivilegedFalseActivations, 0);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  }
  assert.equal(plan.acceptance.everyBlockingCellMustPass, true);
  assert.equal(plan.acceptance.aggregateMayRescueFailedCell, false);
  assert.deepEqual(plan.selectionPolicy, {
    currentBaselineVariantId: "ai-hat-plus-26-hailo8-yolov8m-pose",
    selectedVariantId: null,
    automaticSelectionAllowed: false,
    requireSupersedingDecisionToReplaceBaseline: true,
    accuracyAndThroughputAreJointlyCompared: true,
    replayAndLiveClaimsRemainSeparate: true,
    inferenceOnlyLatencyCannotQualifyProduct: true,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawReplayCorpusRetentionAuthorized: false,
    liveRawFrameRetentionAuthorized: false,
    audioCollectionAuthorized: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    releaseEvidenceSkeletonOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    purchaseAuthorized: false,
    participantCollectionAuthorized: false,
    blockerCodes: [...HAILO_ACCELERATOR_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    selectedVariantId: null,
  });
  return plan;
}

export async function parseHailoAcceleratorComparisonPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Hailo accelerator plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Hailo accelerator plan must be valid JSON");
  }
  await validateHailoAcceleratorComparisonPlan(value, repositoryRoot);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "Hailo accelerator plan must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

export async function validateTrackedHailoAcceleratorComparisonPlan() {
  return parseHailoAcceleratorComparisonPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedHailoAcceleratorComparisonPlan();
  console.log(
    `Hailo accelerator comparison plan valid: variants=${plan.variants.length} lanes=${plan.comparisonLanes.length} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
