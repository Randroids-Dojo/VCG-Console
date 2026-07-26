import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CONCURRENT_GAME_WORKLOAD_FORMAT =
  "vcg-concurrent-game-workload-plan/v1";
export const CONCURRENT_GAME_WORKLOAD_BLOCKERS = Object.freeze([
  "received-pi-hat-camera-and-room-identities",
  "qualified-image-runtime-hef-and-postprocessor",
  "production-tracker-exposure-clock-and-qualification-client",
  "exact-hosted-session-content-and-service-boundary",
  "non-destructive-interaction-account-and-test-data-authority",
  "participant-room-ground-truth-and-derived-data-authority",
  "run-order-operator-protocol-and-monitoring-calibration",
  "sustained-performance-and-fault-recovery-gates",
  "reserved-home-back-and-supervisor-on-target",
  "hardware-purchase-participant-service-and-fault-authority",
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
  "trackerBoundary",
  "workloads",
  "runProtocol",
  "faultExercises",
  "requiredMetrics",
  "acceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const targetNullKeys = [
  "receivedBoardRevision",
  "receivedAcceleratorPartNumber",
  "receivedAcceleratorRevision",
  "operatingSystemImageSha256",
  "kernelRelease",
  "eepromVersion",
  "hailoRuntimeManifestSha256",
  "poseHefSha256",
  "postProcessorSha256",
  "browserBuildSha256",
  "launcherBuildSha256",
  "storageIdentitySha256",
  "powerSupplyIdentitySha256",
  "coolingAssemblyIdentitySha256",
  "enclosureStateSha256",
  "cameraIdentitySha256",
  "roomManifestSha256",
];
const openAcceptanceKeys = [
  "minimumPerActionPrecision",
  "minimumPerActionRecall",
  "minimumPoseFps",
  "minimumGameFps",
  "maximumGameFrameTimeP95Ms",
  "maximumDroppedCaptureRatio",
  "maximumDroppedPoseRatio",
  "maximumSustainedSocTemperatureC",
  "maximumSustainedAcceleratorTemperatureC",
  "maximumWallPowerW",
  "maximumServiceErrorRatio",
  "maximumFaultRecoveryMs",
];

const expectedSources = [
  ["vibebots-catalog-boundary", "catalog/vibebots.vcg-game.json"],
  ["mi-casa-catalog-boundary", "catalog/mi-casa-es-su-casa.vcg-game.json"],
  ["determined-catalog-boundary", "catalog/determined.vcg-game.json"],
  ["obstacle-component-boundary", "apps/console-lab/src/obstacle-game.ts"],
  ["action-engine-boundary", "apps/console-lab/src/action-engine.ts"],
  ["hosted-supervisor-boundary", "scripts/hosted-browser-supervisor.ts"],
  ["pi-image-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
  [
    "hailo-accelerator-boundary",
    "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json",
  ],
];

const expectedWorkloads = [
  [
    "obstacle-motion-sample",
    "Obstacle motion sample",
    "console-lab-component",
    null,
    null,
    "console-lab:#obstacle",
    "offline-required",
    "primary-motion-consumer",
  ],
  [
    "vibebots-compatibility",
    "VibeBots",
    "remote-web",
    "catalog/vibebots.vcg-game.json",
    "hosted-5b5d17ef-2026-07-19",
    "https://vibebots.randroid.dev/mine",
    "required",
    "no-title-motion-delivery",
  ],
  [
    "mi-casa-es-su-casa-compatibility",
    "Mi Casa Es Su Casa",
    "remote-web",
    "catalog/mi-casa-es-su-casa.vcg-game.json",
    "hosted-0c868be6-2026-07-19",
    "https://mi-casa-es-su-casa.vercel.app",
    "required",
    "no-title-motion-delivery",
  ],
  [
    "determined-compatibility",
    "Determined",
    "remote-web",
    "catalog/determined.vcg-game.json",
    "hosted-7d9a38dc-2026-07-19",
    "https://determined-khaki.vercel.app",
    "required",
    "no-title-motion-delivery",
  ],
];
const allWorkloadIds = expectedWorkloads.map(([id]) => id);
const hostedWorkloadIds = allWorkloadIds.slice(1);

const expectedFaults = [
  [
    "camera-loss-and-restoration",
    allWorkloadIds,
    "Tracking becomes explicitly unavailable, gameplay cannot receive stale body actions, shell recovery remains available, and a fresh camera stream is proven before tracking resumes.",
  ],
  [
    "tracker-process-termination-and-restart",
    allWorkloadIds,
    "The game is contained, body actions fail closed, the fault is visible, and a distinct fresh tracker is proven before action delivery resumes.",
  ],
  [
    "game-renderer-hang-or-exit",
    allWorkloadIds,
    "The launcher retains outside-game recovery authority, reports the failure truthfully, cleans the failed child, and returns without granting playability from load or heartbeat evidence.",
  ],
  [
    "network-loss-and-restoration",
    hostedWorkloadIds,
    "Required-network state is visible, no offline-play claim is made, retry is deliberate, and restoration cannot hide lost hosted state or duplicate a mutating request.",
  ],
  [
    "reserved-home-back-responsive-and-hung",
    allWorkloadIds,
    "Reserved recovery remains outside game authority in responsive, fullscreen, focus-captured and hung states and never depends on the game acknowledging input.",
  ],
  [
    "launcher-restart-and-return",
    allWorkloadIds,
    "Launcher restart does not orphan capture or a child process, falsely claim preserved hosted state, leak participant data, or bypass a fresh readiness check.",
  ],
];

const expectedMetrics = [
  "valid warmup and measured monotonic duration plus every phase transition",
  "camera exposure timestamp authority, clock mapping, uncertainty, capture frames and capture drops",
  "exposure-to-pose and exposure-to-action p50, p95, p99 and worst with uncertainty",
  "per-action precision, recall, F1, misses, false events and privileged false activations under load",
  "pose FPS, admitted frames, inference completions, post-process drops and action-delivery drops",
  "game FPS, frame-time p50, p95, p99 and worst, long frames, render stalls and input-response samples",
  "CPU, GPU, RAM, swap, storage IO, network and accelerator utilization",
  "wall power, SoC and accelerator temperatures, clocks, throttle state and fan speed",
  "one-metre acoustics with ambient floor and calibrated meter identity",
  "launcher, browser, tracker and game process lifecycle, health transitions, uncaught errors, crashes and hangs",
  "launch-to-feedback, launch-to-interactive, loading truth, service availability and sanitized network failure counts",
  "fault injection, containment, recovery time, fresh-instance proof and state-integrity outcome",
  "exact hardware, image, runtime, model, game-session, configuration, schedule and evidence artifact digests",
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
  assert.equal(bindings.length, expectedSources.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expectedSources[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const repositoryRelative = relative(repositoryRoot, absolute);
    assert.ok(
      repositoryRelative.length > 0 &&
        !repositoryRelative.startsWith("..") &&
        !isAbsolute(repositoryRelative),
      `${binding.path} must remain inside the repository`,
    );
    assert.equal(
      normalizedDigest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateConcurrentGameWorkloadPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CONCURRENT_GAME_WORKLOAD_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-hailo26-four-workload-soak-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered concurrent tracker and game workload campaign only/u);
  assert.match(plan.claimBoundary, /No Raspberry Pi, AI HAT, camera/u);
  assert.match(plan.claimBoundary, /sixty-minute soak/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  exactKeys(
    plan.targetBoundary,
    [
      "hostProduct",
      "acceleratorProduct",
      "acceleratorArchitecture",
      "poseModel",
      "landmarkLayout",
      ...targetNullKeys,
    ],
    "targetBoundary",
  );
  assert.deepEqual(
    [
      plan.targetBoundary.hostProduct,
      plan.targetBoundary.acceleratorProduct,
      plan.targetBoundary.acceleratorArchitecture,
      plan.targetBoundary.poseModel,
      plan.targetBoundary.landmarkLayout,
    ],
    ["Raspberry Pi 5 8GB", "Raspberry Pi AI HAT+ 26 TOPS", "hailo8", "yolov8m_pose", "COCO-17"],
  );
  for (const key of targetNullKeys) {
    assert.equal(plan.targetBoundary[key], null, `blocked target cannot populate ${key}`);
  }

  exactKeys(
    plan.trackerBoundary,
    [
      "motionApiVersion",
      "requiredProfiles",
      "playerCount",
      "compatibilityGamesReceiveMotionFrames",
      "obstacleConsumesMotionActions",
      "privilegedActionsOwnedOutsideGame",
      "compatibilityTimingClaim",
      "exposureTimestampAuthority",
      "clockMappingProofSha256",
      "trackerConfigurationSha256",
      "motionQualificationClientSha256",
    ],
    "trackerBoundary",
  );
  assert.equal(plan.trackerBoundary.motionApiVersion, "0.4.0");
  assert.deepEqual(plan.trackerBoundary.requiredProfiles, [
    "body.core17",
    "actions.obstacle.v1",
    "actions.shell.v1",
  ]);
  assert.equal(plan.trackerBoundary.playerCount, 1);
  assert.equal(plan.trackerBoundary.compatibilityGamesReceiveMotionFrames, false);
  assert.equal(plan.trackerBoundary.obstacleConsumesMotionActions, true);
  assert.equal(plan.trackerBoundary.privilegedActionsOwnedOutsideGame, true);
  assert.equal(
    plan.trackerBoundary.compatibilityTimingClaim,
    "A separate versioned Motion qualification client may measure the tracker under compatibility-game load; it cannot establish title motion integration, controller playability, service correctness, focus ownership, or visual response.",
  );
  for (const key of [
    "exposureTimestampAuthority",
    "clockMappingProofSha256",
    "trackerConfigurationSha256",
    "motionQualificationClientSha256",
  ]) assert.equal(plan.trackerBoundary[key], null, `blocked tracker cannot populate ${key}`);

  assert.equal(plan.workloads.length, expectedWorkloads.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(
      workload,
      [
        "workloadId",
        "title",
        "runtime",
        "manifestPath",
        "manifestVersion",
        "entrypoint",
        "networkPolicy",
        "motionRole",
        "minimumMeasuredSeconds",
        "requiredRuns",
        "observedSessionContentSha256",
        "interactionScriptSha256",
      ],
      `workloads[${index}]`,
    );
    assert.deepEqual(
      [
        workload.workloadId,
        workload.title,
        workload.runtime,
        workload.manifestPath,
        workload.manifestVersion,
        workload.entrypoint,
        workload.networkPolicy,
        workload.motionRole,
      ],
      expectedWorkloads[index],
    );
    assert.equal(workload.minimumMeasuredSeconds, 3600);
    assert.equal(workload.requiredRuns, 1);
    assert.equal(workload.observedSessionContentSha256, null);
    assert.equal(workload.interactionScriptSha256, null);
  }

  assert.deepEqual(plan.runProtocol, {
    warmupSeconds: 300,
    measuredSecondsPerRun: 3600,
    requiredRunsPerWorkload: 1,
    samplingPeriodMs: 1000,
    coldLaunchBeforeEachRun: true,
    oneWorkloadAtATime: true,
    backgroundTrackerContinuous: true,
    cameraCaptureContinuous: true,
    representativeAudioEnabled: true,
    passiveIdleMayQualify: false,
    scheduledFaultsOutsideMeasuredSoak: true,
    oneRunIsReliabilityRateEvidence: false,
    runOrderSha256: null,
    operatorProtocolSha256: null,
    monitoringCalibrationSha256: null,
  });

  assert.equal(plan.faultExercises.length, expectedFaults.length);
  for (const [index, exercise] of plan.faultExercises.entries()) {
    exactKeys(
      exercise,
      [
        "exerciseId",
        "workloadIds",
        "requiredOutcome",
        "attemptsPerWorkload",
        "maximumRecoveryMs",
        "scheduleSha256",
      ],
      `faultExercises[${index}]`,
    );
    assert.deepEqual(
      [exercise.exerciseId, exercise.workloadIds, exercise.requiredOutcome],
      expectedFaults[index],
    );
    assert.equal(exercise.attemptsPerWorkload, null);
    assert.equal(exercise.maximumRecoveryMs, null);
    assert.equal(exercise.scheduleSha256, null);
  }

  assert.deepEqual(plan.requiredMetrics, expectedMetrics);
  assert.equal(new Set(plan.requiredMetrics).size, expectedMetrics.length);

  exactKeys(
    plan.acceptance,
    [
      "minimumMeasuredSecondsPerWorkload",
      "requiredRunsPerWorkload",
      "maximumExposureToActionP95Ms",
      "maximumPrivilegedFalseActivations",
      "maximumUnrecoveredFailures",
      "maximumUnexpectedProcessExitsDuringSoak",
      "maximumLocalLaunchToInteractiveMs",
      "maximumHostedLaunchToInteractiveMs",
      "maximumOneMeterAcousticsDba",
      ...openAcceptanceKeys,
      "everyWorkloadAndFaultCellMustPass",
      "aggregateMayRescueFailedCell",
      "loadOrHeartbeatAloneMayEstablishPlayability",
      "compatibilityLoadMayEstablishMotionIntegration",
    ],
    "acceptance",
  );
  assert.equal(plan.acceptance.minimumMeasuredSecondsPerWorkload, 3600);
  assert.equal(plan.acceptance.requiredRunsPerWorkload, 1);
  assert.equal(plan.acceptance.maximumExposureToActionP95Ms, 120);
  assert.equal(plan.acceptance.maximumPrivilegedFalseActivations, 0);
  assert.equal(plan.acceptance.maximumUnrecoveredFailures, 0);
  assert.equal(plan.acceptance.maximumUnexpectedProcessExitsDuringSoak, 0);
  assert.equal(plan.acceptance.maximumLocalLaunchToInteractiveMs, 15000);
  assert.equal(plan.acceptance.maximumHostedLaunchToInteractiveMs, 30000);
  assert.equal(plan.acceptance.maximumOneMeterAcousticsDba, 35);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  }
  assert.equal(plan.acceptance.everyWorkloadAndFaultCellMustPass, true);
  assert.equal(plan.acceptance.aggregateMayRescueFailedCell, false);
  assert.equal(plan.acceptance.loadOrHeartbeatAloneMayEstablishPlayability, false);
  assert.equal(plan.acceptance.compatibilityLoadMayEstablishMotionIntegration, false);

  assert.deepEqual(plan.dataPolicy, {
    rawFrameRetentionAuthorized: false,
    audioRecordingAuthorized: false,
    skeletonTraceRetentionAuthorized: false,
    typedOrGeneratedTextRetentionAuthorized: false,
    credentialOrTokenUseAuthorized: false,
    requestOrResponseBodyRetentionAuthorized: false,
    cookieOrStorageValueRetentionAuthorized: false,
    urlQueryOrFragmentRetentionAuthorized: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    systemTelemetryWithoutUserContentAllowed: true,
    releaseEvidenceAggregateOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    purchaseAuthorized: false,
    participantCollectionAuthorized: false,
    serviceAccountOrMutationAuthorized: false,
    faultInjectionAuthorized: false,
    blockerCodes: [...CONCURRENT_GAME_WORKLOAD_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedWorkloads: 0,
    qualifiedWorkloads: [],
  });
  return plan;
}

export async function parseConcurrentGameWorkloadPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Concurrent game workload plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(source);
  } catch {
    throw new Error("Concurrent game workload plan must be valid JSON");
  }
  await validateConcurrentGameWorkloadPlan(plan, repositoryRoot);
  assert.equal(
    source,
    `${JSON.stringify(plan, null, 2)}\n`,
    "Concurrent game workload plan must use canonical two-space JSON with one trailing newline",
  );
  return plan;
}

export async function validateTrackedConcurrentGameWorkloadPlan() {
  return parseConcurrentGameWorkloadPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedConcurrentGameWorkloadPlan();
  console.log(
    `Concurrent game workload plan valid: workloads=${plan.workloads.length} faults=${plan.faultExercises.length} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
