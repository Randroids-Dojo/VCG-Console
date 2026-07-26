import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json",
);
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const PI5_CPU_ONLY_PLAN_FORMAT =
  "vcg-pi5-cpu-only-pose-game-plan/v1";
export const PI5_CPU_ONLY_BLOCKERS = Object.freeze([
  "received-pi-and-peripheral-identities",
  "qualified-target-image-and-runtime-tuple",
  "cpu-backend-model-prepost-and-tracker-selection",
  "accelerator-state-and-non-use-proof",
  "native-godot-motion-transport-and-arm64-execution",
  "camera-room-exposure-clock-and-ground-truth",
  "replay-corpus-rights-labels-and-digest",
  "workload-interaction-and-hosted-service-authority",
  "counterbalanced-schedule-monitoring-and-trial-counts",
  "performance-resource-thermal-and-recovery-gates",
  "hardware-image-participant-and-data-handling-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetBoundary",
  "cpuOnlyBoundary",
  "lanes",
  "workloads",
  "requiredMetrics",
  "acceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const targetKeys = [
  "boardProduct",
  "receivedBoardRevision",
  "operatingSystemImageSha256",
  "kernelRelease",
  "eepromVersion",
  "cpuGovernorAndClockPolicySha256",
  "cpuPoseBackend",
  "cpuPoseModelSha256",
  "cpuPoseRuntimeManifestSha256",
  "prePostProcessorSha256",
  "trackerConfigurationSha256",
  "browserBuildSha256",
  "godotArm64BuildSha256",
  "launcherBuildSha256",
  "nativeMotionTransportSha256",
  "storageIdentitySha256",
  "powerSupplyIdentitySha256",
  "coolingAssemblyIdentitySha256",
  "enclosureStateSha256",
  "displayChainSha256",
  "controllerSetSha256",
  "cameraIdentitySha256",
  "roomManifestSha256",
];
const openAcceptanceKeys = [
  "minimumPerActionPrecision",
  "minimumPerActionRecall",
  "minimumPoseFps",
  "minimumGameFps",
  "maximumGameFrameTimeP95Ms",
  "maximumCaptureDropRatio",
  "maximumPoseDropRatio",
  "maximumRamBytes",
  "maximumSwapBytes",
  "maximumWallPowerW",
  "maximumSustainedSocTemperatureC",
  "maximumThermalThrottleEvents",
  "maximumRecoveryMs",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
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
    ["pi-image-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
    [
      "concurrent-workload-boundary",
      "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
    ],
    [
      "pose-provider-boundary",
      "benchmarks/pose-backends/hailo-mediapipe-core-comparison-plan-v1.json",
    ],
    [
      "godot-export-boundary",
      "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
    ],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(
      absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`),
      `${binding.path} escaped repository root`,
    );
    assert.equal(
      normalizedDigest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validatePi5CpuOnlyPoseGamePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_CPU_ONLY_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-cpu-only-pose-plus-game-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered I-014/u);
  assert.match(plan.claimBoundary, /accelerator absence or non-use has not been proven/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.targetBoundary, targetKeys, "targetBoundary");
  assert.equal(plan.targetBoundary.boardProduct, "Raspberry Pi 5 8GB");
  for (const key of targetKeys.slice(1)) {
    assert.equal(plan.targetBoundary[key], null, `blocked plan cannot populate ${key}`);
  }

  exactKeys(
    plan.cpuOnlyBoundary,
    [
      "poseInferenceProcessor",
      "acceleratorPhysicalState",
      "acceleratorKernelDriversLoaded",
      "acceleratorDeviceNodesPresent",
      "acceleratorRuntimeAvailableToTracker",
      "gpuOrNpuPoseDelegationAllowed",
      "cpuAffinityAndPriorityPolicySha256",
      "acceleratorNonUseProofSha256",
      "processorTelemetryProofSha256",
    ],
    "cpuOnlyBoundary",
  );
  assert.equal(plan.cpuOnlyBoundary.poseInferenceProcessor, "cpu-only");
  for (const key of [
    "acceleratorPhysicalState",
    "acceleratorKernelDriversLoaded",
    "acceleratorDeviceNodesPresent",
    "cpuAffinityAndPriorityPolicySha256",
    "acceleratorNonUseProofSha256",
    "processorTelemetryProofSha256",
  ]) assert.equal(plan.cpuOnlyBoundary[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.cpuOnlyBoundary.acceleratorRuntimeAvailableToTracker, false);
  assert.equal(plan.cpuOnlyBoundary.gpuOrNpuPoseDelegationAllowed, false);

  const expectedLanes = ["immutable-replay-capacity", "live-concurrent-pipeline"];
  assert.deepEqual(plan.lanes.map((lane) => lane.laneId), expectedLanes);
  for (const [index, lane] of plan.lanes.entries()) {
    exactKeys(
      lane,
      [
        "laneId",
        "purpose",
        "inputRule",
        "timingBoundary",
        "inputCorpusSha256",
        "labelProtocolSha256",
        "scheduleSha256",
        "warmupSeconds",
        "measuredSeconds",
        "requiredRunsPerWorkload",
      ],
      `lanes[${index}]`,
    );
    assert.equal(lane.inputCorpusSha256, null);
    assert.equal(lane.labelProtocolSha256, null);
    assert.equal(lane.scheduleSha256, null);
    assert.equal(lane.warmupSeconds, 300);
    assert.equal(lane.measuredSeconds, 3600);
    assert.equal(lane.requiredRunsPerWorkload, 1);
  }
  assert.match(plan.lanes[0].timingBoundary, /never camera-exposure latency/u);
  assert.match(plan.lanes[1].inputRule, /not called identical inputs/u);

  const expectedWorkloads = [
    ["obstacle-local-web-motion", "local-web", "primary-motion-consumer", "offline-required", "concurrent-workload-boundary"],
    ["tiny-motion-godot-native-arm64", "native-godot-arm64", "primary-motion-consumer", "offline-required", "godot-export-boundary"],
    ["vibebots-remote-web-compatibility", "remote-web", "no-title-motion-delivery", "required", "concurrent-workload-boundary"],
    ["mi-casa-remote-web-compatibility", "remote-web", "no-title-motion-delivery", "required", "concurrent-workload-boundary"],
    ["determined-remote-web-compatibility", "remote-web", "no-title-motion-delivery", "required", "concurrent-workload-boundary"],
  ];
  assert.equal(plan.workloads.length, expectedWorkloads.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(
      workload,
      [
        "workloadId",
        "runtime",
        "motionRole",
        "networkPolicy",
        "sourceArtifactRole",
        "interactionProtocolSha256",
        "buildOrSessionSha256",
      ],
      `workloads[${index}]`,
    );
    assert.deepEqual(
      [
        workload.workloadId,
        workload.runtime,
        workload.motionRole,
        workload.networkPolicy,
        workload.sourceArtifactRole,
      ],
      expectedWorkloads[index],
    );
    assert.equal(workload.interactionProtocolSha256, null);
    assert.equal(workload.buildOrSessionSha256, null);
  }
  assert.equal(plan.requiredMetrics.length, 14);
  assert.equal(new Set(plan.requiredMetrics).size, 14);

  exactKeys(
    plan.acceptance,
    [
      "minimumMeasuredSecondsPerWorkload",
      "requiredRunsPerWorkload",
      "maximumLiveExposureToActionP95Ms",
      "maximumPrivilegedFalseActivations",
      "maximumUnrecoveredFailures",
      "maximumUnexpectedProcessExits",
      "maximumOneMeterAcousticsDba",
      ...openAcceptanceKeys,
      "everyLaneWorkloadCellMustPass",
      "aggregateMayRescueFailedCell",
      "replayTimingMayQualifyExposureLatency",
      "loadOrHeartbeatMayEstablishPlayability",
      "compatibilityLoadMayEstablishMotionIntegration",
    ],
    "acceptance",
  );
  assert.equal(plan.acceptance.minimumMeasuredSecondsPerWorkload, 3600);
  assert.equal(plan.acceptance.requiredRunsPerWorkload, 1);
  assert.equal(plan.acceptance.maximumLiveExposureToActionP95Ms, 120);
  assert.equal(plan.acceptance.maximumPrivilegedFalseActivations, 0);
  assert.equal(plan.acceptance.maximumUnrecoveredFailures, 0);
  assert.equal(plan.acceptance.maximumUnexpectedProcessExits, 0);
  assert.equal(plan.acceptance.maximumOneMeterAcousticsDba, 35);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  }
  assert.equal(plan.acceptance.everyLaneWorkloadCellMustPass, true);
  for (const key of [
    "aggregateMayRescueFailedCell",
    "replayTimingMayQualifyExposureLatency",
    "loadOrHeartbeatMayEstablishPlayability",
    "compatibilityLoadMayEstablishMotionIntegration",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.dataPolicy, {
    rawReplayCorpusRetentionAuthorized: false,
    liveRawFrameRetentionAuthorized: false,
    audioRecordingAuthorized: false,
    skeletonTraceRetentionAuthorized: false,
    typedOrGeneratedTextRetentionAuthorized: false,
    credentialOrTokenUseAuthorized: false,
    requestOrResponseBodyRetentionAuthorized: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    systemTelemetryWithoutUserContentAllowed: true,
    releaseEvidenceAggregateOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    imageOrStorageMutationAuthorized: false,
    participantCollectionAuthorized: false,
    hostedServiceUseAuthorized: false,
    blockerCodes: [...PI5_CPU_ONLY_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedCells: 0,
    qualifiedCells: [],
  });
  return plan;
}

export async function parsePi5CpuOnlyPoseGamePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Pi 5 CPU-only plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Pi 5 CPU-only plan must be valid JSON");
  }
  await validatePi5CpuOnlyPoseGamePlan(value, repositoryRoot);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "Pi 5 CPU-only plan must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

export async function validateTrackedPi5CpuOnlyPoseGamePlan() {
  return parsePi5CpuOnlyPoseGamePlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5CpuOnlyPoseGamePlan();
  console.log(
    `Pi 5 CPU-only pose/game plan valid: lanes=${plan.lanes.length} workloads=${plan.workloads.length} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
