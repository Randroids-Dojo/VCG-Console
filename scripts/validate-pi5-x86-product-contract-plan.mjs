import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const PI5_X86_PRODUCT_CONTRACT_FORMAT =
  "vcg-pi5-x86-product-contract-comparison-plan/v1";
export const PI5_X86_TARGETS = Object.freeze([
  [
    "pi5-ai-hat26",
    "required-lower-cost-reference",
    "aarch64",
    "hailo8-ai-hat-plus-26-tops",
    true,
  ],
  [
    "ordinary-x86-linux",
    "required-premium-reference",
    "x86_64",
    "qualified-platform-pose-backend",
    true,
  ],
  [
    "steam-machine-optional-later",
    "optional-compatibility-row",
    "x86_64",
    "separate-steamos-candidate",
    false,
  ],
]);
export const PI5_X86_WORKLOADS = Object.freeze([
  [
    "launcher-shell",
    "console-shell",
    "offline-required",
    "shell-and-reserved-action-owner",
  ],
  [
    "obstacle-motion-sample",
    "local-web",
    "offline-required",
    "primary-motion-action-consumer",
  ],
  [
    "selected-signed-local-package",
    "installed-controlled-package",
    "offline-required",
    "manifest-declared-profile",
  ],
  ["retro-2048", "libretro", "offline-required", "none-controller-only"],
  [
    "vibebots-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
  [
    "mi-casa-es-su-casa-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
  [
    "determined-compatibility",
    "remote-web",
    "network-required",
    "no-title-motion-delivery",
  ],
]);
export const PI5_X86_SCENARIOS = Object.freeze([
  "reproducible-package-build-signature-install-and-uninstall",
  "accountless-first-boot-or-supported-path-launcher-tracker-and-profile",
  "offline-signed-local-package-launch-save-return-and-restart",
  "offline-retro-2048-launch-save-return-and-restart",
  "shared-camera-motion-ready-exposure-to-action-and-action-quality",
  "obstacle-motion-concurrent-one-hour-workload",
  "vibebots-compatibility-concurrent-one-hour-workload",
  "mi-casa-compatibility-concurrent-one-hour-workload",
  "determined-compatibility-concurrent-one-hour-workload",
  "controller-only-navigation-mapping-hotplug-and-reserved-actions",
  "tv-display-audio-sleep-wake-input-switch-and-hotplug",
  "cold-boot-warm-resume-low-power-idle-wake-and-launch-timing",
  "package-os-model-update-health-failure-rollback-and-offline-restart",
  "camera-tracker-game-browser-launcher-fault-containment-and-recovery",
  "storage-pressure-interrupted-write-power-cut-and-state-recovery",
  "blank-storage-rebuild-reinstall-and-data-disposition",
  "sustained-performance-power-thermal-acoustic-resource-and-log-growth",
]);
export const PI5_X86_METRICS = Object.freeze([
  "exact-target-source-package-runtime-model-camera-controller-room-workload-and-schedule-digests",
  "package-build-install-signature-size-startup-uninstall-and-writable-root-integrity",
  "motion-schema-capability-profile-epoch-frame-action-and-delivery-health",
  "camera-exposure-clock-uncertainty-drop-duplicate-and-exposure-to-action-percentiles",
  "per-action-precision-recall-f1-miss-false-event-and-privileged-activation-counts",
  "pose-fps-game-fps-frame-time-long-frame-stall-and-controlled-response",
  "controller-mapping-glyph-focus-hotplug-reconnect-home-back-pause-and-exit",
  "accountless-first-path-offline-restart-network-loss-profile-package-retro-and-steam-identity-boundary",
  "display-mode-safe-area-audio-route-cec-sleep-wake-input-switch-and-hotplug",
  "cold-boot-warm-resume-idle-wake-launch-feedback-interactive-and-camera-state-timing",
  "package-os-model-update-rollback-restart-root-write-and-version-integrity",
  "fault-injection-containment-descendant-reap-fresh-instance-recovery-and-state-integrity",
  "storage-pressure-write-interruption-power-cut-recovery-rebuild-and-data-disposition",
  "cpu-gpu-accelerator-ram-vram-swap-storage-network-and-log-growth",
  "wall-power-idle-energy-thermals-clocks-throttle-fan-and-one-metre-acoustics",
  "dated-exact-model-seller-item-subtotal-shipping-tax-delivered-cost-and-exclusion-ledger",
  "maintenance-update-repair-replaceability-size-and-supported-lifecycle-categories",
  "failed-invalid-stopped-retried-adverse-and-worst-case-cell-ledger",
]);
export const PI5_X86_BLOCKERS = Object.freeze([
  "rxc-001-selected-received-pi5-hat26-and-ordinary-x86-hardware-software-peripheral-room-tuples",
  "rxc-002-common-source-package-game-motion-ux-schema-action-and-acceptance-contract",
  "rxc-003-qualified-runtime-neutral-aarch64-and-x86-package-build-install-and-update-paths",
  "rxc-004-shared-camera-microphone-exposure-clock-calibration-and-room-qualification",
  "rxc-005-controller-mapping-glyph-focus-reserved-action-and-tv-audio-qualification",
  "rxc-006-accountless-first-path-offline-profile-package-retro-network-and-identity-protocol",
  "rxc-007-exact-pi-image-hailo-runtime-model-driver-and-package-recovery-result",
  "rxc-008-exact-ordinary-x86-linux-image-driver-backend-package-and-recovery-result",
  "rxc-009-seven-workload-content-interaction-service-account-and-non-destructive-mutation-policy",
  "rxc-010-participant-room-ground-truth-accessibility-safety-and-collection-authority",
  "rxc-011-boot-idle-wake-suspend-display-audio-update-and-version-integrity-protocol",
  "rxc-012-fault-storage-pressure-power-cut-rebuild-reinstall-and-data-disposition-protocol",
  "rxc-013-performance-power-thermal-acoustic-resource-log-and-uncertainty-instrumentation",
  "rxc-014-all-open-quality-performance-resource-recovery-update-rebuild-and-cost-gates",
  "rxc-015-dated-jurisdictional-pi-delivered-bom-x86-reuse-replacement-and-maintenance-costs",
  "rxc-016-schedule-randomization-invalidity-independent-review-no-rescue-and-selection-rule",
  "rxc-017-data-rights-privacy-retention-deletion-incident-and-adverse-evidence-policy",
  "rxc-018-hardware-purchase-build-camera-participant-service-fault-power-cut-qualification-and-publication-authority",
]);

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetTiers",
  "authorityBoundary",
  "commonProductContract",
  "workloads",
  "operationalMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "costReportBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["reference-tier-policy", "docs/RESEARCH.md"],
  [
    "ordinary-x86-campaign",
    "docs/ORDINARY_X86_LINUX_QUALIFICATION_PLAN_2026-07-25.md",
  ],
  [
    "ordinary-x86-plan",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  [
    "standard-concurrent-workload-campaign",
    "docs/CONCURRENT_GAME_WORKLOAD_CAMPAIGN_2026-07-25.md",
  ],
  [
    "standard-concurrent-workload-plan",
    "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
  ],
  ["pi-image-boundary", "benchmarks/pi-image/pi5-hailo-image-plan-v1.json"],
  [
    "hailo-package-model-recovery-boundary",
    "benchmarks/hailo-recovery/hailo-package-model-recovery-plan-v1.json",
  ],
  [
    "hailo-26-accelerator-boundary",
    "benchmarks/hailo-accelerator/ai-hat-13-26-comparison-plan-v1.json",
  ],
  [
    "runtime-neutral-package-boundary",
    "benchmarks/signed-local-package/runtime-neutral-signed-local-package-plan-v1.json",
  ],
  [
    "shared-camera-boundary",
    "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json",
  ],
  [
    "microphone-boundary",
    "benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json",
  ],
  [
    "controller-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "boot-resume-launch-boundary",
    "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
  ],
  [
    "tv-appliance-boundary",
    "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json",
  ],
  [
    "idle-energy-boundary",
    "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json",
  ],
  [
    "pi-thermal-acoustic-boundary",
    "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json",
  ],
  ["accountless-offline-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["complete-bom-boundary", "docs/QUOTE_DATE_BOMS_2026-07-24.md"],
  [
    "pi-same-date-quote-boundary",
    "benchmarks/hardware-quotes/pi5-ai-hat-same-date-quote-v1.json",
  ],
  [
    "optional-steam-workload-boundary",
    "benchmarks/steamos-workload/steamos-pose-game-workload-plan-v1.json",
  ],
];
const targetKeys = [
  "targetId",
  "tierRole",
  "architecture",
  "accelerationClass",
  "requiredForComparison",
  "hardwareSoftwarePeripheralAndRoomManifestSha256",
  "qualifiedPackageCameraControllerAndRuntimeResultSha256",
  "targetResultSha256",
  "receivedBuiltOrQualified",
  "otherTargetOrComponentEvidenceMayQualify",
  "mayRescueAnotherTarget",
];
const workloadKeys = [
  "workloadId",
  "runtimeClass",
  "networkClass",
  "motionRole",
  "exactContentAndInteractionSha256",
  "targetSpecificResultSha256",
];
const authorityNullKeys = [
  "selectedPiConfigurationSha256",
  "selectedOrdinaryX86ConfigurationSha256",
  "commonSourcePackageGameMotionAndUxContractSha256",
  "targetSpecificBuildRuntimeModelAndDriverProtocolSha256",
  "cameraControllerDisplayRoomAndParticipantProtocolSha256",
  "accountlessOfflineProfilePackageRetroAndServiceProtocolSha256",
  "updateRollbackPowerCutRecoveryAndRebuildProtocolSha256",
  "performancePowerThermalAcousticCostAndUncertaintyProtocolSha256",
  "scheduleNumericGateIndependentReviewAndSelectionRuleSha256",
  "dataRightsPrivacyRetentionDeletionAndIncidentProtocolSha256",
];
const authorityFalseKeys = [
  "hardwarePurchaseBuildOrInstallationAuthorized",
  "cameraControllerParticipantOrServiceOperationAuthorized",
  "updatePowerCutRecoveryOrDestructiveMutationAuthorized",
  "qualificationSelectionPublicationOrTierMutationAuthorized",
];
const openAcceptanceKeys = [
  "minimumPerActionPrecisionPpm",
  "minimumPerActionRecallPpm",
  "minimumPoseFrameRateMilliHz",
  "minimumGameFrameRateMilliHz",
  "maximumGameFrameTimeP95Us",
  "maximumDroppedCaptureRatePpm",
  "maximumDroppedPoseRatePpm",
  "maximumExposureTimestampUncertaintyUs",
  "maximumCpuUtilizationPpmByTarget",
  "maximumGpuOrAcceleratorUtilizationPpmByTarget",
  "maximumResidentMemoryBytesByTarget",
  "maximumPersistentStorageGrowthBytesPerHourByTarget",
  "maximumWallPowerMilliwattsByTarget",
  "maximumIdleEnergyMilliwattHoursByTargetAndDuration",
  "maximumSustainedTemperatureMilliCByTargetAndSensor",
  "maximumThermalThrottleEventsByTarget",
  "maximumFaultRecoveryP95MsByScenarioAndTarget",
  "maximumUpdateRollbackRecoveryP95MsByTarget",
  "maximumRebuildAndReinstallP95MsByTarget",
  "ordinaryX86ReuseCostCents",
  "ordinaryX86ReplacementDeliveredCostCents",
  "minimumRequiredReferenceCostDifferenceCents",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has a bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings), "sourceBindings must be an array");
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(
      relativePath.length > 0 &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validatePi5X86ProductContractPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_X86_PRODUCT_CONTRACT_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(
    plan.campaignId,
    "pi5-ai-hat26-vs-ordinary-x86-product-contract-v1",
  );
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-173"]);
  for (const phrase of [
    "strict zero-result comparison plan",
    "Both required reference targets must pass every applicable cell independently",
    "optional Steam Machine row",
    "No purchase, operation, qualification, publication, or reference-tier mutation is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.ok(Array.isArray(plan.targetTiers));
  assert.equal(plan.targetTiers.length, PI5_X86_TARGETS.length);
  for (const [index, target] of plan.targetTiers.entries()) {
    exactKeys(target, targetKeys, `targetTiers[${index}]`);
    assert.deepEqual(
      [
        target.targetId,
        target.tierRole,
        target.architecture,
        target.accelerationClass,
        target.requiredForComparison,
      ],
      PI5_X86_TARGETS[index],
    );
    for (const key of targetKeys.slice(5, 8)) {
      assert.equal(target[key], null, `blocked target cannot bind ${key}`);
    }
    for (const key of targetKeys.slice(8)) {
      assert.equal(target[key], false, `${key} must remain false`);
    }
  }

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of authorityFalseKeys) {
    assert.equal(plan.authorityBoundary[key], false, `${key} must remain false`);
  }

  assert.deepEqual(plan.commonProductContract, {
    motionApiVersion: "0.4.0",
    requiredProfileIds: [
      "body.core17",
      "actions.obstacle.v1",
      "actions.shell.v1",
    ],
    sameSourceGameManifestsSchemasActionsUxAndAcceptanceGatesRequired: true,
    sameSharedWideAngleUvcCameraContractRequired: true,
    sameStandardsConformantControllerAndReservedActionContractRequired: true,
    sameAccountlessLauncherTrackerProfilesPackagesAndRetroContractRequired: true,
    architectureAcceleratorDriverAndPackagingDifferencesMustRemainBehindReviewedInterfaces:
      true,
    targetSpecificDowngradedGameMotionUxOfflineOrRecoveryScopeAllowed: false,
    optionalSteamMachineMayRedefineOrRescueCommonContract: false,
    componentOrPlanEvidenceMaySubstituteIntegratedTargetEvidence: false,
  });

  assert.ok(Array.isArray(plan.workloads));
  assert.equal(plan.workloads.length, PI5_X86_WORKLOADS.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(workload, workloadKeys, `workloads[${index}]`);
    assert.deepEqual(
      [
        workload.workloadId,
        workload.runtimeClass,
        workload.networkClass,
        workload.motionRole,
      ],
      PI5_X86_WORKLOADS[index],
    );
    assert.equal(workload.exactContentAndInteractionSha256, null);
    assert.equal(workload.targetSpecificResultSha256, null);
  }

  assert.deepEqual(plan.operationalMatrix, {
    scenarioIds: [...PI5_X86_SCENARIOS],
    requiredTargetIds: ["pi5-ai-hat26", "ordinary-x86-linux"],
    optionalTargetIds: ["steam-machine-optional-later"],
    scenarioCount: 17,
    requiredTargetCount: 2,
    validCyclesPerRequiredTargetScenario: 20,
    requiredCellCount: 34,
    requiredCycleCount: 680,
    optionalCellCount: 17,
    optionalCycleCount: 340,
    everyRequiredTargetRunsEveryScenario: true,
    sameScenarioProtocolAndAcceptanceGatesAcrossRequiredTargets: true,
    failedInvalidStoppedRetriedAdverseAndWorstCaseCyclesRemainVisible: true,
    optionalTargetMayQualifyOrRescueRequiredTarget: false,
    otherScenarioTargetComponentOrAggregateMayRescueFailure: false,
  });

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: [...PI5_X86_METRICS],
    independentTimingMotionGameInputOfflineDisplayUpdateRecoveryPowerAcousticAndCostOraclesRequired:
      true,
    everyRequiredCellCycleFailureAndCostLineMustRemainVisible: true,
    deskPlanComponentOptionalTargetOrAggregateMaySubstituteIntegratedTargetEvidence:
      false,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidCyclesPerRequiredTargetScenario: 20,
    minimumConcurrentMeasuredSecondsPerWorkload: 3600,
    maximumExposureToActionP95Ms: 120,
    maximumColdBootToLauncherReadyMs: 60000,
    maximumWarmResumeToLauncherReadyMs: 5000,
    maximumLocalLaunchToInteractiveMs: 15000,
    maximumHostedLaunchToInteractiveMs: 30000,
    maximumOneMeterAcousticsDba: 35,
    maximumPiDeliveredReferenceBuildCents: 65000,
    maximumSteamAccountDependenciesForCoreLocalOperation: 0,
    maximumPrivilegedFalseActivations: 0,
    maximumReservedActionsDeliveredToGamesOrSwallowed: 0,
    maximumCameraMicrophoneTrackBufferSampleOrReturnedByteSuccesses: 0,
    maximumUntrustedCameraAccessOrRetainedRawMediaEvents: 0,
    maximumUndeclaredRootWriteNetworkIpcFilesystemOrDeviceAccesses: 0,
    maximumCredentialAccountProfileSaveParticipantStableIdentifierPathOrFreeTextDisclosures:
      0,
    maximumUnrecoveredUpdatePowerCutFaultOrRebuildFailures: 0,
    maximumValidRequiredTargetProductFailures: 0,
    everyRequiredTargetCellMustPass: true,
    optionalTargetMayRescueFailure: false,
    aggregateMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }

  assert.deepEqual(plan.costReportBoundary, {
    quoteJurisdictionAndCurrencySha256: null,
    piExactDeliveredBomSha256: null,
    ordinaryX86ReuseAndReplacementCostSha256: null,
    optionalSteamMachineDeliveredCostSha256: null,
    maintenanceRepairUpdateAndReplacementAssumptionSha256: null,
    piDeliveredCeilingCents: 65000,
    televisionControllersToolsAndSpareExperimentsExcludedFromPiCeiling: true,
    shippingTaxAndRequiredBuildHardwareIncludedInPiCeiling: true,
    quotedSubtotalMayProveDeliveredCost: false,
    ownedReuseCostMayProveReplacementEconomics: false,
    costMayRescueAProductContractFailure: false,
    purchaseAuthorized: false,
  });

  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetBuildWorkloadScenarioCycleAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawRoomPlayerCameraScreenAudioVideoOrSkeletonAllowedInRepositoryReleaseOrResult:
      false,
    retainedRawFramesAudioBuffersSkeletonsTypedTextOrServiceBodiesAllowed: false,
    namesFacesVoicesExactAgesStableDeviceIdsSerialsPathsOrQueryUrlsAllowed: false,
    credentialsTokensCookiesAccountsProfileSaveStorageEnvironmentOrArgumentValuesAllowed:
      false,
    arbitraryDriverProviderServiceConsoleCrashOrCheckoutMessagesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressOutsideDeclaredPackageHostedServiceAndProbeTrafficAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...PI5_X86_BLOCKERS]);

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "blocked",
    completedRequiredCellCount: 0,
    completedRequiredCycleCount: 0,
    targetResults: [],
    qualifiedRequiredTargetIds: [],
    piDeliveredReferenceBuildCents: null,
    ordinaryX86ReuseCostCents: null,
    ordinaryX86ReplacementDeliveredCostCents: null,
    piLowerCostReferenceQualified: false,
    ordinaryX86PremiumReferenceQualified: false,
    steamMachineOptionalRowQualified: false,
    referenceTierSelectionChanged: false,
    publishedClaims: [],
  });
}

export async function parsePi5X86ProductContractPlanBytes(bytes) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan is not valid JSON", { cause: error });
  }
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must use canonical two-space JSON with one trailing LF",
  );
  await validatePi5X86ProductContractPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parsePi5X86ProductContractPlanBytes(
    await readFile(trackedPath),
  );
  console.log(
    `${trackedPath}: valid blocked ${plan.operationalMatrix.requiredCellCount}-cell, ${plan.operationalMatrix.requiredCycleCount}-cycle I-173 plan`,
  );
}
