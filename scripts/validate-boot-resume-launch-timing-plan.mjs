import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const BOOT_RESUME_LAUNCH_TIMING_FORMAT =
  "vcg-boot-resume-launch-timing-plan/v1";
export const BOOT_RESUME_LAUNCH_TIMING_BLOCKERS = Object.freeze([
  "exact-required-target-hardware-image-runtime-and-workload-tuples",
  "ordinary-x86-idle-strategy-selection-q270",
  "qualified-pi-idle-and-steam-suspend-adapters",
  "timing-harness-interaction-oracles-and-run-order-q272",
  "target-power-energy-thermal-thresholds-and-instrumentation-q271",
  "accountless-offline-package-retro-and-obstacle-runtime",
  "approved-hosted-content-service-and-network-exercise-boundary",
  "controller-remote-hdmi-cec-and-physical-wake-source-inventory",
  "hardware-backed-camera-microphone-display-write-and-update-state-oracles",
  "twenty-trial-per-cell-and-wake-source-physical-execution-authority",
  "complete-result-ledger-and-cross-tier-comparison-report",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetPolicy",
  "targets",
  "paths",
  "measurementProtocol",
  "idleWakeOracles",
  "requiredMetrics",
  "acceptance",
  "dataPolicy",
  "authority",
  "executionGate",
  "result",
];

const expectedSources = [
  ["prototype-timing-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["accountless-offline-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["power-recovery-policy-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
  [
    "launcher-timing-state-boundary",
    "apps/console-lab/src/launcher/launch-supervisor.ts",
  ],
  [
    "idle-wake-state-boundary",
    "apps/console-lab/src/launcher/power-lifecycle.ts",
  ],
  ["hosted-supervisor-boundary", "scripts/hosted-browser-supervisor.ts"],
  [
    "ordinary-x86-target-plan-boundary",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  ["pi-target-plan-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
];

const targetNullKeys = [
  "hardwareManifestSha256",
  "operatingSystemManifestSha256",
  "runtimeManifestSha256",
  "powerAdapterProofSha256",
  "wakeSourceProofSha256",
  "timingHarnessSha256",
  "powerMeterIdentitySha256",
  "stateOracleSha256",
];

const expectedTargets = [
  [
    "ordinary-x86-linux-premium",
    "common-premium-required",
    true,
    null,
    /^Q-270 must select platform suspend or low-power launcher idle/u,
  ],
  [
    "pi5-hailo26-reference",
    "lower-cost-reference-required",
    true,
    "low-power-launcher-idle",
    /^D-095 requires measured low-power launcher idle unless reliable Raspberry Pi suspend/u,
  ],
  [
    "steam-machine-optional",
    "later-optional-compatibility",
    false,
    "platform-suspend",
    /^D-095 assigns suspend to Steam Machine, but D-119 keeps this target optional/u,
  ],
];

const expectedPaths = [
  [
    "cold-boot-accountless-offline",
    "cold-boot",
    "launcher-shell",
    "all-network-interfaces-disabled-before-power",
    "physical power application observed by the independent timing harness",
    "launcher visibly accepts and responds to a supported controller action",
    60_000,
  ],
  [
    "warm-resume-accountless-offline",
    "warm-resume",
    "launcher-shell",
    "all-network-interfaces-disabled-before-idle",
    "supported deliberate wake action observed outside the sleeping or idle target",
    "prior safe state or launcher visibly accepts and responds to a supported controller action",
    5_000,
  ],
  [
    "obstacle-local-offline-launch",
    "local-launch",
    "obstacle-motion-sample",
    "all-network-interfaces-disabled",
    "deliberate controller launch selection accepted by the launcher",
    "obstacle sample visibly accepts and responds to the intended gameplay action",
    15_000,
  ],
  [
    "signed-package-local-offline-launch",
    "local-launch",
    "selected-signed-local-package",
    "all-network-interfaces-disabled",
    "deliberate controller launch selection accepted by the launcher",
    "selected installed package visibly accepts and responds to the intended gameplay action",
    15_000,
  ],
  [
    "retro-2048-local-offline-launch",
    "local-launch",
    "retro-2048",
    "all-network-interfaces-disabled",
    "deliberate controller launch selection accepted by the launcher",
    "retro 2048 visibly accepts and responds to the intended controller action",
    15_000,
  ],
  [
    "vibebots-hosted-online-launch",
    "hosted-launch",
    "vibebots-compatibility",
    "approved-online-credential-free-route",
    "deliberate controller launch selection accepted by the launcher",
    "hosted title visibly accepts intended input or the console reports an exact observable current phase",
    30_000,
  ],
  [
    "mi-casa-hosted-online-launch",
    "hosted-launch",
    "mi-casa-es-su-casa-compatibility",
    "approved-online-credential-free-route",
    "deliberate controller launch selection accepted by the launcher",
    "hosted title visibly accepts intended input or the console reports an exact observable current phase",
    30_000,
  ],
  [
    "determined-hosted-online-launch",
    "hosted-launch",
    "determined-compatibility",
    "approved-online-credential-free-route",
    "deliberate controller launch selection accepted by the launcher",
    "hosted title visibly accepts intended input or the console reports an exact observable current phase",
    30_000,
  ],
];

const expectedMetrics = [
  "every scheduled attempt with target, path, repetition, status, failure code and monotonic start, feedback and end timestamps",
  "per target and path valid, failed and invalid counts plus nearest-rank p50, p95 and worst duration",
  "visible-feedback duration and the exact branded state first shown",
  "interaction or truthful-phase end oracle and observable response evidence",
  "wall-power time series spanning pre-action, transition, idle or launch, and stable end state",
  "tracker, camera capture, camera indicator, microphone, display, input, write, update and workload state transitions",
  "wake source, device reconnect, controller mapping and first accepted action",
  "operating-system, service, launcher, native-host, tracker, browser and game lifecycle events",
  "network state and sanitized hosted phase or failure observations without credentials or content bodies",
  "exact hardware, image, runtime, workload, harness, oracle, schedule and calibration digests",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedDigest(bytes, label) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(source), `${label} has bare CR`);
  return createHash("sha256")
    .update(source.replaceAll("\r\n", "\n"))
    .digest("hex");
}

async function validateSourceBindings(bindings, repositoryRoot) {
  assert.equal(bindings.length, expectedSources.length);
  const paths = new Set();
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expectedSources[index]);
    assert.match(binding.sha256, SHA256);
    assert.ok(!paths.has(binding.path), `${binding.path} is duplicated`);
    paths.add(binding.path);
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

export async function validateBootResumeLaunchTimingPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, BOOT_RESUME_LAUNCH_TIMING_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-boot-resume-launch-timing-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered boot, resume, idle\/wake/u);
  assert.match(plan.claimBoundary, /Windows and WSL2 cannot substitute/u);
  assert.match(plan.claimBoundary, /first pixels, load, readiness and liveness cannot establish/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: ["ordinary-x86-linux-premium", "pi5-hailo26-reference"],
    optionalTargetIds: ["steam-machine-optional"],
    windowsMayQualifyOrdinaryLinux: false,
    wsl2MayQualifyOrdinaryLinux: false,
    steamMachineMaySubstituteRequiredTarget: false,
    requiredTargetMayBeRescuedByAnotherTarget: false,
    automaticTargetSelection: false,
  });

  assert.equal(plan.targets.length, expectedTargets.length);
  const targetIds = new Set();
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(
      target,
      [
        "targetId",
        "role",
        "requiredForCommonComparison",
        "idleStrategy",
        "idleStrategyBoundary",
        "hardwareManifestSha256",
        "operatingSystemManifestSha256",
        "runtimeManifestSha256",
        "powerAdapterProofSha256",
        "qualifiedWakeSources",
        "wakeSourceProofSha256",
        "timingHarnessSha256",
        "powerMeterIdentitySha256",
        "stateOracleSha256",
      ],
      `targets[${index}]`,
    );
    const [targetId, role, required, idleStrategy, boundary] = expectedTargets[index];
    assert.deepEqual(
      [target.targetId, target.role, target.requiredForCommonComparison, target.idleStrategy],
      [targetId, role, required, idleStrategy],
    );
    assert.match(target.idleStrategyBoundary, boundary);
    assert.ok(!targetIds.has(target.targetId), `${target.targetId} is duplicated`);
    targetIds.add(target.targetId);
    assert.deepEqual(target.qualifiedWakeSources, []);
    for (const key of targetNullKeys) {
      assert.equal(target[key], null, `blocked target cannot populate ${key}`);
    }
  }

  assert.equal(plan.paths.length, expectedPaths.length);
  const pathIds = new Set();
  for (const [index, path] of plan.paths.entries()) {
    exactKeys(
      path,
      [
        "pathId",
        "class",
        "workloadId",
        "networkCondition",
        "timerStart",
        "passingEnd",
        "maximumMs",
        "requiredTrialsPerTarget",
        "interactionOracleSha256",
        "scheduleSha256",
      ],
      `paths[${index}]`,
    );
    assert.deepEqual(
      [
        path.pathId,
        path.class,
        path.workloadId,
        path.networkCondition,
        path.timerStart,
        path.passingEnd,
        path.maximumMs,
      ],
      expectedPaths[index],
    );
    assert.ok(!pathIds.has(path.pathId), `${path.pathId} is duplicated`);
    pathIds.add(path.pathId);
    assert.equal(path.requiredTrialsPerTarget, 20);
    assert.equal(path.interactionOracleSha256, null);
    assert.equal(path.scheduleSha256, null);
  }

  assert.deepEqual(plan.measurementProtocol, {
    declaredTargetPathCells: 24,
    requiredCommonTargetPathCells: 16,
    requiredTrialsPerCell: 20,
    requiredCommonScheduledTrials: 320,
    optionalSteamScheduledTrials: 160,
    totalDeclaredTrials: 480,
    visibleFeedbackMaximumMs: 250,
    monotonicClockRequired: true,
    coldBootClockMustSpanPowerApplication: true,
    wakeClockMustBeIndependentOfSleepingTarget: true,
    endRequiresObservableInputResponse: true,
    allAttemptsFailuresAndRetriesPublished: true,
    warmupAttemptsMayBeDiscarded: false,
    failedAttemptsMayBeReplaced: false,
    trialOrderSha256: null,
    operatorProtocolSha256: null,
    instrumentCalibrationSha256: null,
    environmentScheduleSha256: null,
    resultSchemaSha256: null,
  });
  assert.equal(
    plan.measurementProtocol.declaredTargetPathCells,
    plan.targets.length * plan.paths.length,
  );
  assert.equal(
    plan.measurementProtocol.requiredCommonTargetPathCells,
    plan.targetPolicy.requiredTargetIds.length * plan.paths.length,
  );
  assert.equal(
    plan.measurementProtocol.requiredCommonScheduledTrials,
    plan.measurementProtocol.requiredCommonTargetPathCells *
      plan.measurementProtocol.requiredTrialsPerCell,
  );
  assert.equal(
    plan.measurementProtocol.optionalSteamScheduledTrials,
    plan.targetPolicy.optionalTargetIds.length *
      plan.paths.length *
      plan.measurementProtocol.requiredTrialsPerCell,
  );
  assert.equal(
    plan.measurementProtocol.totalDeclaredTrials,
    plan.measurementProtocol.requiredCommonScheduledTrials +
      plan.measurementProtocol.optionalSteamScheduledTrials,
  );

  assert.deepEqual(plan.idleWakeOracles, {
    quiesceGates: [
      "launch-admission-closed",
      "game-stopped-or-suspended-as-declared",
      "tracker-stopped",
      "camera-capture-stopped",
      "camera-active-indication-stopped",
      "camera-microphone-remains-os-disabled",
      "input-released-except-qualified-wake-path",
      "writes-quiesced",
      "update-state-safe",
      "unnecessary-workloads-stopped",
      "display-dimmed-or-blanked",
    ],
    wakeGates: [
      "launcher-or-prior-safe-state-ready",
      "display-ready",
      "supported-controller-input-ready",
      "camera-and-tracker-still-stopped-until-explicit-need",
      "no-passive-gameplay-resume",
    ],
    requiredWakeSourceCandidates: [
      "controller",
      "remote",
      "hdmi-cec",
      "physical-power-button",
    ],
    everyClaimedWakeSourceRequiresTwentyTrials: true,
    privacyStateMayBeInferredFromUi: false,
    processExitMayProveDevicePowerState: false,
    quiesceOracleSha256: null,
    wakeOracleSha256: null,
    powerTraceSchemaSha256: null,
  });
  assert.deepEqual(plan.requiredMetrics, expectedMetrics);
  assert.equal(new Set(plan.requiredMetrics).size, expectedMetrics.length);

  assert.deepEqual(plan.acceptance, {
    minimumTrialsPerTargetPathCell: 20,
    maximumVisibleFeedbackMs: 250,
    maximumColdBootMs: 60_000,
    maximumWarmResumeMs: 5_000,
    maximumLocalLaunchMs: 15_000,
    maximumHostedLaunchOrTruthfulPhaseMs: 30_000,
    maximumFailedRequiredTrials: 0,
    maximumFailedClaimedWakeTrials: 0,
    maximumIdlePowerWByTarget: {
      "ordinary-x86-linux-premium": null,
      "pi5-hailo26-reference": null,
      "steam-machine-optional": null,
    },
    maximumResumeEnergyWhByTarget: {
      "ordinary-x86-linux-premium": null,
      "pi5-hailo26-reference": null,
      "steam-machine-optional": null,
    },
    maximumTransitionTemperatureCByTarget: {
      "ordinary-x86-linux-premium": null,
      "pi5-hailo26-reference": null,
      "steam-machine-optional": null,
    },
    everyRequiredTrialMustMeetItsDeadline: true,
    everyRequiredTargetPathCellMustPass: true,
    aggregateMayRescueFailedTrialCellOrTarget: false,
    hostedTruthfulPhaseMaySatisfyOnlyTheLaunchTimingGate: true,
    hostedTruthfulPhaseMayEstablishPlayability: false,
    firstPixelsMayEstablishUsableInteraction: false,
    loadReadinessOrLivenessMayEstablishPlayability: false,
    uiStateMayEstablishHardwarePrivacyState: false,
    windowsOrWslMayEstablishOrdinaryLinux: false,
    optionalSteamMachineMayRescueCommonComparison: false,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawFrameRetentionAuthorized: false,
    rawVideoRetentionAuthorized: false,
    audioRecordingAuthorized: false,
    skeletonTraceRetentionAuthorized: false,
    credentialOrTokenUseAuthorized: false,
    requestOrResponseBodyRetentionAuthorized: false,
    cookieOrStorageValueRetentionAuthorized: false,
    urlQueryOrFragmentRetentionAuthorized: false,
    typedOrGeneratedTextRetentionAuthorized: false,
    participantIdentifiersAllowed: false,
    stableMachineIdentifiersAllowedInTrackedEvidence: false,
    systemTelemetryWithoutUserContentAllowed: true,
  });
  assert.deepEqual(plan.authority, {
    readOnlyRepositoryPlanningAuthorized: true,
    targetHardwareAccessAuthorized: false,
    physicalPowerControlAuthorized: false,
    operatingSystemMutationAuthorized: false,
    serviceAccountOrMutationAuthorized: false,
    networkFaultExerciseAuthorized: false,
    participantCollectionAuthorized: false,
    diagnosticDataRetentionAuthorized: false,
    purchaseAuthorized: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...BOOT_RESUME_LAUNCH_TIMING_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    requiredScheduledTrials: 320,
    optionalScheduledTrials: 160,
    completedRequiredTrials: 0,
    completedOptionalTrials: 0,
    passedRequiredCells: [],
    qualifiedTargets: [],
    commonComparisonEligible: false,
  });
  return plan;
}

export async function parseBootResumeLaunchTimingPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Boot, resume and launch timing plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(source);
  } catch {
    throw new Error("Boot, resume and launch timing plan must be valid JSON");
  }
  await validateBootResumeLaunchTimingPlan(plan, repositoryRoot);
  assert.equal(
    source,
    `${JSON.stringify(plan, null, 2)}\n`,
    "Boot, resume and launch timing plan must use canonical two-space JSON with one trailing newline",
  );
  return plan;
}

export async function validateTrackedBootResumeLaunchTimingPlan() {
  return parseBootResumeLaunchTimingPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedBootResumeLaunchTimingPlan();
  console.log(
    `Boot/resume/launch timing plan valid: targets=${plan.targets.length} paths=${plan.paths.length} requiredTrials=${plan.result.requiredScheduledTrials} optionalTrials=${plan.result.optionalScheduledTrials} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
