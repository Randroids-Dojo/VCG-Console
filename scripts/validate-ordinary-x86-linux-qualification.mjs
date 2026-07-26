import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const ORDINARY_X86_LINUX_FORMAT =
  "vcg-ordinary-x86-linux-qualification-plan/v1";
export const ORDINARY_X86_LINUX_BLOCKERS = Object.freeze([
  "exact-ordinary-x86-host-selection",
  "native-linux-disk-backup-and-recovery-authority-q203",
  "exact-native-linux-image-kernel-firmware-driver-display-browser-and-sdl-tuple",
  "exact-tv-camera-controller-room-and-meter-inventory",
  "package-runtime-and-representative-local-game-artifacts",
  "production-motion-exposure-clock-and-qualification-client",
  "participant-hands-on-and-derived-data-authority",
  "launch-suspend-update-recovery-fault-protocol-and-repetitions",
  "premium-performance-power-thermal-and-acoustic-thresholds",
  "accountless-offline-runtime-and-service-boundary",
  "cold-rebuild-and-repeatability-evidence",
  "ordinary-x86-linux-execution-and-common-comparison-report",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "candidateEvidence",
  "selectionPolicy",
  "targetBoundary",
  "softwareBoundary",
  "peripheralBoundary",
  "workloads",
  "qualificationPhases",
  "runProtocol",
  "acceptance",
  "dataPolicy",
  "authority",
  "executionGate",
  "result",
];

const expectedSources = [
  [
    "development-host-context",
    "benchmarks/x86-development/windows-wsl2-owned-2026-07-24.json",
  ],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["accountless-offline-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  [
    "exposure-to-action-boundary",
    "scripts/validate-camera-action-latency-campaign.mjs",
  ],
  ["obstacle-workload-boundary", "apps/console-lab/src/obstacle-game.ts"],
  ["hosted-supervisor-boundary", "scripts/hosted-browser-supervisor.ts"],
  ["vibebots-catalog-boundary", "catalog/vibebots.vcg-game.json"],
  ["mi-casa-catalog-boundary", "catalog/mi-casa-es-su-casa.vcg-game.json"],
  ["determined-catalog-boundary", "catalog/determined.vcg-game.json"],
  ["retro-2048-catalog-boundary", "catalog/retro-2048.vcg-game.json"],
];

const targetNullKeys = [
  "targetCandidateId",
  "hardwareManifestSha256",
  "cpuModel",
  "gpuModel",
  "ramBytes",
  "storageManifestSha256",
  "powerSupplyManifestSha256",
  "coolingManifestSha256",
  "firmwareManifestSha256",
  "linuxImageSha256",
  "installationReceiptSha256",
  "recoveryPlanSha256",
  "bootChainProofSha256",
  "qualifiedConfigurationSha256",
  "cleanRebuildProofSha256",
];

const softwareNullKeys = [
  "distribution",
  "release",
  "kernelRelease",
  "bootloader",
  "secureBootMode",
  "gpuDriver",
  "displayServer",
  "compositor",
  "browserBuildSha256",
  "sdlBuildSha256",
  "controllerDatabaseSha256",
  "nodeRuntime",
  "pnpmRuntime",
  "rustToolchain",
  "serviceManager",
  "launcherBuildSha256",
  "nativeHostBuildSha256",
  "trackerBuildSha256",
  "modelManifestSha256",
  "packageRuntimeReportSha256",
];

const peripheralNullKeys = [
  "cameraIdentitySha256",
  "cameraModeProofSha256",
  "cameraExposureClockProofSha256",
  "cameraShutterAndIndicatorProofSha256",
  "cameraMicrophoneDisablementProofSha256",
  "controllerIdentitySha256",
  "controllerMappingProofSha256",
  "reservedActionProofSha256",
  "displayAudioProofSha256",
  "tvIdentitySha256",
  "roomManifestSha256",
  "powerMeterIdentitySha256",
  "acousticMeterIdentitySha256",
  "thermalInstrumentationSha256",
  "participantProtocolSha256",
];

const expectedWorkloads = [
  [
    "launcher-shell",
    "VCG launcher shell",
    "console-shell",
    null,
    "offline-required",
    "shell-and-reserved-action-owner",
    [
      "accountless-cold-boot",
      "all-network-interfaces-disabled",
      "wan-disabled",
      "online-restored",
    ],
  ],
  [
    "obstacle-motion-sample",
    "Obstacle motion sample",
    "console-lab-component",
    null,
    "offline-required",
    "primary-motion-action-consumer",
    ["accountless-offline", "concurrent-tracker-load"],
  ],
  [
    "selected-signed-local-package",
    "Selected signed local package",
    "installed-controlled-package",
    null,
    "offline-required",
    "manifest-declared-profile-pending",
    ["accountless-offline", "update-and-rollback", "blank-drive-recovery"],
  ],
  [
    "retro-2048",
    "2048 through the local retro lane",
    "libretro",
    "catalog/retro-2048.vcg-game.json",
    "offline-required",
    "none-controller-only",
    ["accountless-offline", "save-state-and-return"],
  ],
  [
    "vibebots-compatibility",
    "VibeBots",
    "remote-web",
    "catalog/vibebots.vcg-game.json",
    "network-required",
    "no-title-motion-delivery",
    ["credential-free-compatible-route", "network-loss-and-explicit-retry"],
  ],
  [
    "mi-casa-es-su-casa-compatibility",
    "Mi Casa Es Su Casa",
    "remote-web",
    "catalog/mi-casa-es-su-casa.vcg-game.json",
    "network-required",
    "no-title-motion-delivery",
    ["credential-free-compatible-route", "network-loss-and-explicit-retry"],
  ],
  [
    "determined-compatibility",
    "Determined",
    "remote-web",
    "catalog/determined.vcg-game.json",
    "network-required",
    "no-title-motion-delivery",
    ["credential-free-compatible-route", "network-loss-and-explicit-retry"],
  ],
];

const expectedPhases = [
  [
    "read-only-inventory",
    "read-only",
    [
      "sanitized-hardware-manifest",
      "firmware-and-boot-state",
      "disk-role-and-backup-review",
      "peripheral-and-meter-inventory",
    ],
  ],
  [
    "target-selection-and-recovery-review",
    "requires-owner-authority",
    [
      "owner-selected-reference",
      "backup-verification",
      "recovery-media-verification",
      "approved-install-plan",
    ],
  ],
  [
    "native-linux-cold-rebuild",
    "requires-owner-authority",
    [
      "image-and-package-digests",
      "installation-receipt",
      "clean-rebuild-log",
      "qualified-configuration-manifest",
    ],
  ],
  [
    "accountless-offline-boot",
    "non-destructive-hands-on",
    [
      "accountless-cold-boot-trials",
      "offline-launcher-trials",
      "network-restoration-and-explicit-retry",
      "controller-usable-recovery",
    ],
  ],
  [
    "display-audio-controller-camera",
    "non-destructive-hands-on",
    [
      "display-and-audio-matrix",
      "camera-mode-timestamp-shutter-indicator",
      "camera-microphone-disablement",
      "controller-hotplug-mapping-and-reserved-actions",
    ],
  ],
  [
    "package-runtime-and-games",
    "controlled-local-runtime",
    [
      "package-runtime-report",
      "signed-local-package",
      "retro-runtime-and-core",
      "hosted-session-content-and-service-boundary",
    ],
  ],
  [
    "motion-accuracy-latency-and-load",
    "participant-and-derived-data",
    [
      "exposure-clock-proof",
      "skeleton-only-ground-truth-bundle",
      "camera-action-latency-result",
      "concurrent-system-and-game-telemetry",
    ],
  ],
  [
    "suspend-idle-and-reboot",
    "non-destructive-hands-on",
    [
      "suspend-resume-cycle-log",
      "idle-privacy-and-power-log",
      "reboot-cycle-log",
      "state-integrity-report",
    ],
  ],
  [
    "update-rollback-and-recovery",
    "destructive-fault-qualified",
    [
      "update-and-interruption-log",
      "rollback-log",
      "blank-drive-recovery-log",
      "post-recovery-integrity-report",
    ],
  ],
  [
    "performance-power-thermal-acoustic-soak",
    "non-destructive-hands-on",
    [
      "per-workload-soak-log",
      "frame-and-drop-distribution",
      "wall-power-and-thermal-log",
      "calibrated-acoustic-log",
    ],
  ],
  [
    "repeatability-and-comparison-handoff",
    "report-only",
    [
      "second-clean-rebuild",
      "complete-cell-ledger",
      "ordinary-x86-linux-result",
      "common-premium-comparison-report",
    ],
  ],
];

const openAcceptanceKeys = [
  "minimumPoseFps",
  "minimumGameFps",
  "maximumGameFrameTimeP95Ms",
  "maximumDroppedCaptureRatio",
  "maximumDroppedPoseRatio",
  "maximumWallPowerW",
  "maximumIdleWallPowerW",
  "maximumSuspendWallPowerW",
  "maximumSustainedCpuTemperatureC",
  "maximumSustainedGpuTemperatureC",
  "maximumOneMeterAcousticsDba",
  "minimumUpdateInterruptionAttempts",
  "minimumRollbackAttempts",
  "minimumBlankDriveRecoveryAttempts",
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

export async function validateOrdinaryX86LinuxQualificationPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, ORDINARY_X86_LINUX_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "ordinary-x86-linux-premium-reference-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.match(plan.claimBoundary, /^Pre-registered ordinary x86-64 native-Linux/u);
  assert.match(plan.claimBoundary, /Windows and WSL2 evidence is development-host context/u);
  assert.match(plan.claimBoundary, /No host is selected/u);
  assert.match(plan.claimBoundary, /No .* disk, firmware, boot configuration/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSourceBindings(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.candidateEvidence, {
    role: "owned-x86-64-development-candidate-only",
    bundlePath: "benchmarks/x86-development/windows-wsl2-owned-2026-07-24.json",
    operatingSystem: "Microsoft Windows 11 Pro 10.0.26200 build 26200",
    cpuModel: "AMD Ryzen 9 5900X 12-Core Processor",
    gpuModel: "NVIDIA GeForce RTX 3080 Ti",
    physicalMemoryBytes: 68_625_489_920,
    cameraVendorProduct: "046d:082d",
    controllerCount: 0,
    nativeLinuxQualificationEvidenceAvailable: false,
    qualificationUse:
      "Candidate context only; selection, native-Linux installation, and every physical qualification claim remain blocked.",
  });
  assert.deepEqual(plan.selectionPolicy, {
    ordinaryX86LinuxRequired: true,
    windowsMayQualify: false,
    wsl2MayQualify: false,
    steamMachineMaySubstitute: false,
    automaticCandidateSelection: false,
    selectedReferenceId: null,
    selectedByDecision: null,
    selectedAt: null,
  });

  exactKeys(plan.targetBoundary, targetNullKeys, "targetBoundary");
  for (const key of targetNullKeys) {
    assert.equal(plan.targetBoundary[key], null, `blocked target cannot populate ${key}`);
  }

  exactKeys(
    plan.softwareBoundary,
    ["architecture", "nativeLinuxRequired", "motionApiVersion", ...softwareNullKeys],
    "softwareBoundary",
  );
  assert.equal(plan.softwareBoundary.architecture, "x86_64");
  assert.equal(plan.softwareBoundary.nativeLinuxRequired, true);
  assert.equal(plan.softwareBoundary.motionApiVersion, "0.4.0");
  for (const key of softwareNullKeys) {
    assert.equal(plan.softwareBoundary[key], null, `blocked software cannot populate ${key}`);
  }

  exactKeys(
    plan.peripheralBoundary,
    ["cameraPackagingContract", "controllerContract", ...peripheralNullKeys],
    "peripheralBoundary",
  );
  assert.equal(
    plan.peripheralBoundary.cameraPackagingContract,
    "stable freely positionable external UVC camera permitted for the PC tier",
  );
  assert.equal(
    plan.peripheralBoundary.controllerContract,
    "standards-conformant SDL controller with console-owned reserved actions",
  );
  for (const key of peripheralNullKeys) {
    assert.equal(plan.peripheralBoundary[key], null, `blocked peripheral cannot populate ${key}`);
  }

  assert.equal(plan.workloads.length, expectedWorkloads.length);
  const workloadIds = new Set();
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(
      workload,
      [
        "workloadId",
        "title",
        "runtime",
        "manifestPath",
        "networkClass",
        "motionRole",
        "requiredModes",
        "requiredLaunchTrials",
        "minimumSoakSeconds",
        "interactionScriptSha256",
        "observedContentSha256",
      ],
      `workloads[${index}]`,
    );
    assert.deepEqual(
      [
        workload.workloadId,
        workload.title,
        workload.runtime,
        workload.manifestPath,
        workload.networkClass,
        workload.motionRole,
        workload.requiredModes,
      ],
      expectedWorkloads[index],
    );
    assert.ok(!workloadIds.has(workload.workloadId), `${workload.workloadId} is duplicated`);
    workloadIds.add(workload.workloadId);
    assert.equal(workload.requiredLaunchTrials, 20);
    assert.equal(workload.minimumSoakSeconds, 3600);
    assert.equal(workload.interactionScriptSha256, null);
    assert.equal(workload.observedContentSha256, null);
  }

  assert.equal(plan.qualificationPhases.length, expectedPhases.length);
  const phaseIds = new Set();
  for (const [index, phase] of plan.qualificationPhases.entries()) {
    exactKeys(
      phase,
      ["phaseId", "purpose", "mutationClass", "status", "requiredEvidence", "evidenceSha256"],
      `qualificationPhases[${index}]`,
    );
    const [phaseId, mutationClass, requiredEvidence] = expectedPhases[index];
    assert.equal(phase.phaseId, phaseId);
    assert.ok(!phaseIds.has(phase.phaseId), `${phase.phaseId} is duplicated`);
    phaseIds.add(phase.phaseId);
    assert.ok(typeof phase.purpose === "string" && phase.purpose.length >= 80);
    assert.equal(phase.mutationClass, mutationClass);
    assert.equal(phase.status, "blocked");
    assert.deepEqual(phase.requiredEvidence, requiredEvidence);
    assert.equal(phase.evidenceSha256, null);
  }

  assert.deepEqual(plan.runProtocol, {
    coldBuildRequired: true,
    cleanSourceCommitRequired: true,
    minimumLaunchTrialsPerPath: 20,
    minimumActionTrialsPerCell: 20,
    minimumNegativeDurationMsPerCell: 900_000,
    minimumMeasuredSoakSecondsPerWorkload: 3600,
    requiredSuspendResumeCycles: 100,
    updateInterruptionAttempts: null,
    rollbackAttempts: null,
    blankDriveRecoveryAttempts: null,
    faultAttemptsPerClass: null,
    allAttemptsAndFailuresPublished: true,
    monotonicClockRequired: true,
    representativeWorkloadConcurrentWithTracking: true,
    rawFramesRequired: false,
    runOrderSha256: null,
    operatorProtocolSha256: null,
    faultScheduleSha256: null,
    monitoringCalibrationSha256: null,
  });

  exactKeys(
    plan.acceptance,
    [
      "maximumVisibleFeedbackMs",
      "maximumColdBootToControllerUsableMs",
      "maximumWarmResumeToControllerUsableMs",
      "maximumLocalLaunchToInteractiveMs",
      "maximumHostedLaunchToInteractiveOrTruthfulPhaseMs",
      "maximumExposureToActionP95Ms",
      "minimumPerActionPrecision",
      "minimumPerActionRecall",
      "maximumPrivilegedFalseActivations",
      "maximumUnrecoveredFailures",
      "maximumFailedSuspendResumeCycles",
      ...openAcceptanceKeys,
      "accountlessCoreRequired",
      "offlineCoreRequired",
      "everyRequiredCellMustPass",
      "aggregateMayRescueFailedCell",
      "loadReadinessOrHeartbeatAloneMayEstablishPlayability",
      "captureArrivalMayEstablishExposureLatency",
      "windowsOrWslEvidenceMayQualifyNativeLinux",
      "steamMachineEvidenceMaySubstitute",
      "lowerCostAcousticGateMayBeAppliedWithoutDecision",
    ],
    "acceptance",
  );
  assert.equal(plan.acceptance.maximumVisibleFeedbackMs, 250);
  assert.equal(plan.acceptance.maximumColdBootToControllerUsableMs, 60_000);
  assert.equal(plan.acceptance.maximumWarmResumeToControllerUsableMs, 5_000);
  assert.equal(plan.acceptance.maximumLocalLaunchToInteractiveMs, 15_000);
  assert.equal(
    plan.acceptance.maximumHostedLaunchToInteractiveOrTruthfulPhaseMs,
    30_000,
  );
  assert.equal(plan.acceptance.maximumExposureToActionP95Ms, 120);
  assert.equal(plan.acceptance.minimumPerActionPrecision, 0.95);
  assert.equal(plan.acceptance.minimumPerActionRecall, 0.9);
  assert.equal(plan.acceptance.maximumPrivilegedFalseActivations, 0);
  assert.equal(plan.acceptance.maximumUnrecoveredFailures, 0);
  assert.equal(plan.acceptance.maximumFailedSuspendResumeCycles, 0);
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  }
  assert.equal(plan.acceptance.accountlessCoreRequired, true);
  assert.equal(plan.acceptance.offlineCoreRequired, true);
  assert.equal(plan.acceptance.everyRequiredCellMustPass, true);
  assert.equal(plan.acceptance.aggregateMayRescueFailedCell, false);
  assert.equal(plan.acceptance.loadReadinessOrHeartbeatAloneMayEstablishPlayability, false);
  assert.equal(plan.acceptance.captureArrivalMayEstablishExposureLatency, false);
  assert.equal(plan.acceptance.windowsOrWslEvidenceMayQualifyNativeLinux, false);
  assert.equal(plan.acceptance.steamMachineEvidenceMaySubstitute, false);
  assert.equal(plan.acceptance.lowerCostAcousticGateMayBeAppliedWithoutDecision, false);

  assert.deepEqual(plan.dataPolicy, {
    rawFrameRetentionAuthorized: false,
    rawVideoRetentionAuthorized: false,
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
    trackedEvidenceMustOmitStableMachineAndPersonIdentifiers: true,
  });
  assert.deepEqual(plan.authority, {
    readOnlyRepositoryPlanningAuthorized: true,
    targetHardwareSelected: false,
    physicalDiskMutationAuthorized: false,
    bootOrderMutationAuthorized: false,
    secureBootMutationAuthorized: false,
    nativeLinuxInstallationAuthorized: false,
    handsOnCameraControllerSessionAuthorized: false,
    participantCollectionAuthorized: false,
    derivedSkeletonRetentionAuthorized: false,
    serviceAccountOrMutationAuthorized: false,
    faultInjectionAuthorized: false,
    purchaseAuthorized: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...ORDINARY_X86_LINUX_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    selectedReferenceId: null,
    passedPhases: [],
    qualifiedWorkloads: [],
    commonPremiumComparisonEligible: false,
  });
  return plan;
}

export async function parseOrdinaryX86LinuxQualificationPlanBytes(
  bytes,
  repositoryRoot = root,
) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Ordinary x86 Linux qualification plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(source);
  } catch {
    throw new Error("Ordinary x86 Linux qualification plan must be valid JSON");
  }
  await validateOrdinaryX86LinuxQualificationPlan(plan, repositoryRoot);
  assert.equal(
    source,
    `${JSON.stringify(plan, null, 2)}\n`,
    "Ordinary x86 Linux qualification plan must use canonical two-space JSON with one trailing newline",
  );
  return plan;
}

export async function validateTrackedOrdinaryX86LinuxQualificationPlan() {
  return parseOrdinaryX86LinuxQualificationPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedOrdinaryX86LinuxQualificationPlan();
  console.log(
    `Ordinary x86 Linux qualification plan valid: workloads=${plan.workloads.length} phases=${plan.qualificationPhases.length} blockers=${plan.executionGate.blockerCodes.length}`,
  );
}
