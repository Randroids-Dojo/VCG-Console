import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/kiosk-compositor/cross-tier-kiosk-compositor-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_REVISION = /^[a-f0-9]{40}$/u;

export const KIOSK_COMPOSITOR_FORMAT =
  "vcg-cross-tier-kiosk-compositor-plan/v1";
export const KIOSK_REQUIRED_TARGET_IDS = Object.freeze([
  "pi5-ai-hat26",
  "ordinary-x86-linux",
]);
export const KIOSK_OPTIONAL_TARGET_IDS = Object.freeze([
  "steam-machine-steamos",
]);
export const KIOSK_ROUTE_IDS = Object.freeze([
  "cage-chromium-vcg-wrapper",
  "gamescope-chromium-vcg-wrapper",
  "vcg-wrapper-base-compositor-control",
]);
export const KIOSK_WORKLOAD_DEFINITIONS = Object.freeze([
  ["controlled-static-local-ready", "local-web-controlled-fixture", "offline-required"],
  ["obstacle-local-web-motion", "local-web-motion-consumer", "offline-required"],
  ["vibebots-hosted-top-level", "supervised-hosted-web", "network-required"],
  ["mi-casa-hosted-top-level", "supervised-hosted-web", "network-required"],
  ["determined-hosted-top-level", "supervised-hosted-web", "network-required"],
  [
    "epoch-hosted-top-level",
    "supervised-hosted-web-restrictive-framing-case",
    "network-required",
  ],
]);
export const KIOSK_SCENARIO_IDS = Object.freeze([
  "cold-launch-visible-focused-ready",
  "warm-relaunch-fresh-profile-clean",
  "fullscreen-enter-exit-output-scale",
  "pointer-lock-relative-input-capture",
  "focus-stolen-backgrounded-and-returned",
  "popup-child-or-secondary-surface-attempt",
  "foreign-origin-or-scheme-navigation-attempt",
  "download-and-permission-request-attempt",
  "main-thread-or-wrapper-liveness-hang",
  "renderer-process-crash",
  "browser-parent-exit-or-signal-race",
  "compositor-or-session-process-loss",
  "network-loss-redirect-loop-or-readiness-stall",
  "controller-disconnect-reconnect-and-input-flood",
  "reserved-home-back-and-forced-exit",
  "profile-storage-corruption-and-cold-restart",
  "audio-device-loss-focus-and-recovery",
  "display-hotplug-mode-loss-and-recovery",
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
  "sourceScreen",
  "targetPolicy",
  "targets",
  "routeCandidates",
  "workloads",
  "hostileScenarios",
  "commonBrowserContract",
  "authorityBoundary",
  "qualificationMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  [
    "upstream-candidate-source-screen",
    "docs/KIOSK_COMPOSITOR_SOURCE_SCREEN_2026-07-26.md",
  ],
  ["hosted-browser-supervision-boundary", "docs/HOSTED_BROWSER_SUPERVISION.md"],
  ["offline-and-service-boundary", "docs/ONLINE_OFFLINE_SERVICE_MATRIX.md"],
  ["security-boundary", "docs/SECURITY_THREAT_MODEL.md"],
  [
    "reserved-recovery-boundary",
    "benchmarks/reserved-home/reserved-home-action-plan-v1.json",
  ],
  [
    "controller-qualification-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "tv-appliance-boundary",
    "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json",
  ],
  [
    "boot-resume-launch-boundary",
    "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
  ],
  [
    "ordinary-x86-target-boundary",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  [
    "pi-target-boundary",
    "benchmarks/pi5-cpu-only/pi5-cpu-only-pose-game-plan-v1.json",
  ],
  ["desk-wrapper-implementation-boundary", "scripts/hosted-browser-supervisor.ts"],
];

const routeDefinitions = [
  [
    "cage-chromium-vcg-wrapper",
    "dedicated-single-application-wayland-candidate",
    true,
    "cage",
    "5491610293a59123710861330be92e4c2ec93840",
  ],
  [
    "gamescope-chromium-vcg-wrapper",
    "dedicated-game-session-micro-compositor-candidate",
    true,
    "gamescope",
    "17baf4abd1ab3353fb705e4d0d023f84e870f7e8",
  ],
  [
    "vcg-wrapper-base-compositor-control",
    "wrapper-control-requiring-an-exact-owner-selected-base-compositor",
    false,
    "owner-selected-base-compositor-required",
    null,
  ],
];

const metricIds = [
  "request-to-first-visible-frame-ms",
  "request-to-top-level-ready-ms",
  "request-to-visible-focused-usable-ms",
  "wrapper-challenge-acknowledgement-ms",
  "compositor-surface-generation-and-focus-state",
  "ordinary-controller-input-delivery-ms",
  "reserved-action-pre-game-and-game-delivery-counts",
  "focus-revocation-return-and-wrong-surface-counts",
  "top-level-origin-navigation-popup-download-and-permission-counts",
  "owned-process-session-surface-and-descendant-counts",
  "profile-storage-cache-service-worker-and-cleanup-bytes",
  "browser-compositor-and-game-exit-recovery-ms",
  "video-frame-pacing-fps-long-frame-and-stall-counts",
  "audio-start-underrun-device-loss-focus-and-recovery-counts",
  "cpu-gpu-memory-storage-network-power-thermal-and-acoustic-metrics",
  "offline-network-attempt-and-explicit-degradation-counts",
  "display-mode-hotplug-black-frame-and-recovery-counts",
  "controller-disconnect-reconnect-stuck-repeat-and-owner-counts",
];

export const KIOSK_BLOCKER_CODES = Object.freeze([
  "I092-001-exact-target-image-driver-display-audio-input-and-power-tuples",
  "I092-002-exact-cage-revision-build-package-closure-and-invocation",
  "I092-003-exact-gamescope-revision-build-package-closure-and-invocation",
  "I092-004-exact-wrapper-base-compositor-privilege-and-invocation",
  "I092-005-exact-chromium-wrapper-origin-permission-profile-and-update-policy",
  "I092-006-exact-workload-build-deployment-rights-admission-and-interactions",
  "I092-007-controller-reserved-action-focus-and-recovery-policy",
  "I092-008-hostile-fault-harness-stop-cleanup-and-safety-protocol",
  "I092-009-independent-input-focus-surface-process-media-storage-and-clock-oracles",
  "I092-010-schedule-open-gates-ranking-tie-break-and-review-protocol",
  "I092-011-result-schema-sanitization-retention-incident-and-adverse-evidence-policy",
  "I092-012-operation-qualification-selection-compatibility-and-publication-authority",
]);

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
    assert.deepEqual(
      [binding.role, binding.path],
      sourceDefinitions[index],
      `sourceBindings[${index}] identity drifted`,
    );
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

function validateSourceScreen(sourceScreen) {
  exactKeys(sourceScreen, ["capturedAt", "cage", "gamescope", "chromium"], "sourceScreen");
  assert.equal(sourceScreen.capturedAt, "2026-07-26");
  assert.deepEqual(sourceScreen.cage, {
    repository: "https://github.com/cage-kiosk/cage",
    observedRevision: "5491610293a59123710861330be92e4c2ec93840",
    readmeUrl:
      "https://raw.githubusercontent.com/cage-kiosk/cage/5491610293a59123710861330be92e4c2ec93840/README.md",
    readmeBytes: 2518,
    readmeSha256: "7ad6d2850c21dc9c958ae4107c4e8729763397033bdf23503563a0087de58b10",
    manpageUrl:
      "https://raw.githubusercontent.com/cage-kiosk/cage/5491610293a59123710861330be92e4c2ec93840/cage.1.scd",
    manpageBytes: 1456,
    manpageSha256: "4612f4499a6c60c65049625efbaf6a66a822c773db4c29f35785ba3d910fab08",
    observedFacts: [
      "single-maximized-application-wayland-kiosk",
      "nested-virtual-output-or-tty-kms-drm-modes",
      "observed-source-based-on-wlroots-0.20",
      "xwayland-support-depends-on-build-and-installed-binary",
    ],
    sourceFactsMayQualifyBuildTargetOrProduct: false,
  });
  assert.deepEqual(sourceScreen.gamescope, {
    repository: "https://github.com/ValveSoftware/gamescope",
    observedRevision: "17baf4abd1ab3353fb705e4d0d023f84e870f7e8",
    readmeUrl:
      "https://raw.githubusercontent.com/ValveSoftware/gamescope/17baf4abd1ab3353fb705e4d0d023f84e870f7e8/README.md",
    readmeBytes: 5595,
    readmeSha256: "d01cc26db47f9f69fabcda36abf48f26cbff3db1bb6fd7313b8e523db0c023aa",
    observedFacts: [
      "embedded-and-nested-micro-compositor-modes",
      "private-xwayland-desktop-described-for-nested-use",
      "virtual-game-and-output-resolution-controls",
      "documented-keyboard-shortcuts-include-screenshot-and-grab",
    ],
    sourceFactsMayQualifyBuildTargetOrProduct: false,
  });
  assert.deepEqual(sourceScreen.chromium, {
    officialFlagsDocumentationUrl:
      "https://chromium.googlesource.com/playground/chromium-org-site/+/master/developers/how-tos/run-chromium-with-flags.md",
    observedFacts: [
      "command-line-switches-change-browser-behavior",
      "switches-are-not-supported-or-recommended",
      "switches-may-break-in-the-future",
    ],
    flagsAppModeOrKioskMayQualifyContainmentOrRecovery: false,
  });
  assert.match(sourceScreen.cage.observedRevision, GIT_REVISION);
  assert.match(sourceScreen.gamescope.observedRevision, GIT_REVISION);
}

export async function validateKioskCompositorPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, KIOSK_COMPOSITOR_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i092-cross-tier-kiosk-compositor-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-092", "Q-047", "Q-101"]);
  for (const phrase of [
    "zero-result Cage, Gamescope, and VCG-wrapper comparison plan",
    "do not prove a visible focused usable contained browser session",
    "No download",
    "publication operation is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  validateSourceScreen(plan.sourceScreen);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: [...KIOSK_REQUIRED_TARGET_IDS],
    optionalTargetIds: [...KIOSK_OPTIONAL_TARGET_IDS],
    windowsOrWslMayQualifyRequiredLinuxTarget: false,
    optionalTargetMayRescueRequiredTarget: false,
    oneRequiredTargetMayRescueAnother: false,
    successfulNestedDesktopRunMayQualifyTtyOrApplianceSession: false,
    sourceBuildOrProcessSurvivalMayQualifyTarget: false,
  });

  assert.ok(Array.isArray(plan.targets));
  assert.equal(plan.targets.length, 3);
  assert.deepEqual(
    plan.targets.map(({ targetId }) => targetId),
    [...KIOSK_REQUIRED_TARGET_IDS, ...KIOSK_OPTIONAL_TARGET_IDS],
  );
  const targetRoles = [
    "required-lower-cost-aarch64-reference",
    "required-premium-x86-64-reference",
    "optional-steamos-compatibility-target",
  ];
  const targetNullKeys = [
    "hardwareFirmwareDisplayAndInputSha256",
    "osKernelGpuDriverAndSessionSha256",
    "browserCompositorAndWrapperBuildSha256",
    "audioStorageNetworkAndPowerSha256",
    "faultHarnessClockAndOracleSha256",
  ];
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(
      target,
      ["targetId", "role", "required", ...targetNullKeys, "receivedInventoriedAndAuthorized"],
      `targets[${index}]`,
    );
    assert.equal(target.role, targetRoles[index]);
    assert.equal(target.required, index < 2);
    for (const key of targetNullKeys) {
      assert.equal(target[key], null, `${target.targetId}.${key} must remain open`);
    }
    assert.equal(target.receivedInventoriedAndAuthorized, false);
  }

  assert.ok(Array.isArray(plan.routeCandidates));
  assert.equal(plan.routeCandidates.length, KIOSK_ROUTE_IDS.length);
  const routeNullKeys = [
    "exactCompositorBuildAndDependencyManifestSha256",
    "exactBrowserAndSignedWrapperBuildManifestSha256",
    "exactSessionInvocationAndEnvironmentPolicySha256",
    "exactPrivilegeInputFocusAndProcessPolicySha256",
  ];
  for (const [index, route] of plan.routeCandidates.entries()) {
    exactKeys(
      route,
      [
        "routeId",
        "role",
        "dedicatedCompositor",
        "compositorFamily",
        "observedUpstreamRevision",
        ...routeNullKeys,
        "sourceDescriptionMayQualifyRoute",
        "qualified",
      ],
      `routeCandidates[${index}]`,
    );
    assert.deepEqual(
      [
        route.routeId,
        route.role,
        route.dedicatedCompositor,
        route.compositorFamily,
        route.observedUpstreamRevision,
      ],
      routeDefinitions[index],
    );
    for (const key of routeNullKeys) {
      assert.equal(route[key], null, `${route.routeId}.${key} must remain open`);
    }
    assert.equal(route.sourceDescriptionMayQualifyRoute, false);
    assert.equal(route.qualified, false);
  }

  assert.ok(Array.isArray(plan.workloads));
  assert.equal(plan.workloads.length, KIOSK_WORKLOAD_DEFINITIONS.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(
      workload,
      [
        "workloadId",
        "runtimeClass",
        "networkClass",
        "exactArtifactOrDeploymentSha256",
        "exactRightsAdmissionAndInteractionSha256",
        "qualified",
      ],
      `workloads[${index}]`,
    );
    assert.deepEqual(
      [workload.workloadId, workload.runtimeClass, workload.networkClass],
      KIOSK_WORKLOAD_DEFINITIONS[index],
    );
    assert.equal(workload.exactArtifactOrDeploymentSha256, null);
    assert.equal(workload.exactRightsAdmissionAndInteractionSha256, null);
    assert.equal(workload.qualified, false);
  }
  assert.deepEqual(plan.hostileScenarios, KIOSK_SCENARIO_IDS);

  assert.deepEqual(plan.commonBrowserContract, {
    engineFamily: "chromium",
    exactBrowserVersionAndBuildSha256: null,
    exactSignedWrapperAdmissionAndBuildSha256: null,
    exactOriginNavigationPermissionAndProfilePolicySha256: null,
    maximumRemoteOriginAllowlistCount: 8,
    credentialedUrlsAllowed: false,
    httpFileDataOrCustomSchemeNavigationAllowed: false,
    downloadsAllowed: false,
    popupsOrSecondaryTargetsAllowed: false,
    directGameCameraMicrophoneLocationMidiOrNotificationPermissionsAllowed: false,
    topLevelExplicitReadyContractRequired: true,
    postReadyFreshChallengeAcknowledgementRequired: true,
    freshPerGameProfileRequired: true,
    sameBrowserWrapperAndPolicyRequiredAcrossRoutes: true,
    wrapperLivenessMaySubstituteForVisibleFocusedCompositorReadiness: false,
    processSurvivalMaySubstituteForPlayabilityOrRecovery: false,
  });

  const authorityNullKeys = [
    "exactTargetImageDriverDisplayAudioInputAndPowerTupleSha256",
    "exactCageBuildPackageClosureAndInvocationSha256",
    "exactGamescopeBuildPackageClosureAndInvocationSha256",
    "exactWrapperBaseCompositorPrivilegeAndInvocationSha256",
    "exactChromiumWrapperOriginPermissionProfileAndUpdatePolicySha256",
    "exactWorkloadBuildDeploymentRightsAdmissionAndInteractionSha256",
    "exactControllerReservedActionFocusAndRecoveryPolicySha256",
    "exactFaultHarnessStopCleanupAndSafetyProtocolSha256",
    "exactIndependentOracleClockAndEvidenceSchemaSha256",
    "exactScheduleOpenGatesRankingAndReviewProtocolSha256",
  ];
  const authorityFalseKeys = [
    "downloadBuildInstallOrTargetMutationAuthorized",
    "targetDisplayAudioControllerOrPowerOperationAuthorized",
    "hostedNetworkLoginOrAccountOperationAuthorized",
    "fullscreenFocusProcessStorageNetworkDisplayOrAudioFaultAuthorized",
    "qualificationSelectionCompatibilityOrPublicationAuthorized",
  ];
  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) assert.equal(plan.authorityBoundary[key], null);
  for (const key of authorityFalseKeys) assert.equal(plan.authorityBoundary[key], false);

  const matrix = plan.qualificationMatrix;
  exactKeys(
    matrix,
    [
      "requiredTargetIds",
      "optionalTargetIds",
      "routeIds",
      "workloadIds",
      "scenarioIds",
      "requiredTargetCount",
      "optionalTargetCount",
      "routeCount",
      "workloadCount",
      "scenarioCount",
      "requiredCellCount",
      "optionalCellCount",
      "validCyclesPerCell",
      "requiredCycleCount",
      "optionalCycleCount",
      "requiredSoakCellCount",
      "optionalSoakCellCount",
      "validOneHourSoakRunsPerCell",
      "minimumMeasuredSecondsPerSoakRun",
      "requiredOneHourSoakRunCount",
      "optionalOneHourSoakRunCount",
      "counterbalancedOrderRequired",
      "everyDeclaredCellAndSoakMustRun",
      "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
      "routeEligibilityRequiresEveryRequiredTargetWorkloadAndScenarioCellPass",
      "oneRouteMayNotQualifyAnotherRoute",
      "oneTargetWorkloadScenarioSoakOrAggregateMayRescueFailure",
    ],
    "qualificationMatrix",
  );
  assert.deepEqual(matrix.requiredTargetIds, KIOSK_REQUIRED_TARGET_IDS);
  assert.deepEqual(matrix.optionalTargetIds, KIOSK_OPTIONAL_TARGET_IDS);
  assert.deepEqual(matrix.routeIds, KIOSK_ROUTE_IDS);
  assert.deepEqual(
    matrix.workloadIds,
    KIOSK_WORKLOAD_DEFINITIONS.map(([workloadId]) => workloadId),
  );
  assert.deepEqual(matrix.scenarioIds, KIOSK_SCENARIO_IDS);
  assert.equal(matrix.requiredTargetCount, 2);
  assert.equal(matrix.optionalTargetCount, 1);
  assert.equal(matrix.routeCount, 3);
  assert.equal(matrix.workloadCount, 6);
  assert.equal(matrix.scenarioCount, 18);
  assert.equal(
    matrix.requiredCellCount,
    matrix.requiredTargetCount * matrix.routeCount * matrix.workloadCount * matrix.scenarioCount,
  );
  assert.equal(matrix.requiredCellCount, 648);
  assert.equal(matrix.optionalCellCount, 324);
  assert.equal(matrix.validCyclesPerCell, 20);
  assert.equal(matrix.requiredCycleCount, matrix.requiredCellCount * 20);
  assert.equal(matrix.requiredCycleCount, 12960);
  assert.equal(matrix.optionalCycleCount, matrix.optionalCellCount * 20);
  assert.equal(matrix.optionalCycleCount, 6480);
  assert.equal(
    matrix.requiredSoakCellCount,
    matrix.requiredTargetCount * matrix.routeCount * matrix.workloadCount,
  );
  assert.equal(matrix.requiredSoakCellCount, 36);
  assert.equal(matrix.optionalSoakCellCount, 18);
  assert.equal(matrix.validOneHourSoakRunsPerCell, 3);
  assert.equal(matrix.minimumMeasuredSecondsPerSoakRun, 3600);
  assert.equal(
    matrix.requiredOneHourSoakRunCount,
    matrix.requiredSoakCellCount * matrix.validOneHourSoakRunsPerCell,
  );
  assert.equal(matrix.requiredOneHourSoakRunCount, 108);
  assert.equal(matrix.optionalOneHourSoakRunCount, 54);
  for (const key of [
    "counterbalancedOrderRequired",
    "everyDeclaredCellAndSoakMustRun",
    "failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible",
    "routeEligibilityRequiresEveryRequiredTargetWorkloadAndScenarioCellPass",
    "oneRouteMayNotQualifyAnotherRoute",
  ]) {
    assert.equal(matrix[key], true, `${key} must remain true`);
  }
  assert.equal(matrix.oneTargetWorkloadScenarioSoakOrAggregateMayRescueFailure, false);

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentInputFocusSurfaceProcessOriginPermissionStorageAudioVideoDisplayAndClockOraclesRequired:
      true,
    wrapperGameUiCopyProcessSurvivalOrSyntheticInputMayNotSubstitute: true,
    everyAttemptFaultTransitionFailureRecoveryAndWorstCaseMustRemainVisible: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidCyclesPerCell: 20,
    minimumMeasuredSecondsPerSoakRun: 3600,
    maximumInteractiveLaunchP95Ms: 15000,
    maximumFirstControllerFeedbackP95Ms: 250,
    maximumUnauthorizedOriginsSchemesPopupsDownloadsOrPermissions: 0,
    maximumReservedHomeOrBackDeliveriesToGame: 0,
    maximumKeyboardMouseShellOrOperatorRecoveries: 0,
    maximumUnownedOrEscapedProcessesSurfacesOrSessions: 0,
    maximumCrossGameOrCrossRunProfileStorageLeaks: 0,
    maximumMissingStaleOrSelfAssertedCompositorReadinessEvidence: 0,
    maximumUnrecoveredAudioVideoFocusInputDisplayOrNetworkFailuresPerCell: 0,
    sameBrowserWrapperWorkloadInputDisplayAudioAndEvidenceContractAcrossRoutesRequired:
      true,
    candidateFailureMustRemainARejectedOrIneligibleRoute: true,
    routeEligibilityRequiresEveryRequiredTargetCellPass: true,
    sourceFactsBuildSuccessFlagsProcessSurvivalOrWrapperLivenessMayQualifyRoute: false,
    oneRouteTargetWorkloadScenarioSoakOrAggregateMayRescueFailure: false,
    allOpenGatesRankingAndReviewRulesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(
    plan.openAcceptance,
    [
      "maximumVisibleFocusedUsableP99Ms",
      "maximumVisibleFocusedUsableWorstMs",
      "maximumWrapperChallengeP99Ms",
      "maximumReservedActionRecoveryP95Ms",
      "maximumCompositorOrBrowserCrashReturnP95Ms",
      "maximumDisplayAndAudioRecoveryP95Ms",
      "minimumSustainedGameFpsMilliFps",
      "maximumGameFrameTimeP95Us",
      "maximumAudioUnderrunsPerHour",
      "maximumBrowserCompositorAndWrapperRssBytes",
      "maximumGpuMemoryBytes",
      "maximumWallPowerMilliwatts",
      "maximumOneMeterAcousticsMilliDba",
      "maximumPerGameProfileGrowthBytesPerHour",
      "minimumPhysicalControllerSamplesPerMappingAndTransport",
      "minimumPhysicalTvAndAudioConfigurationsPerTarget",
      "candidateRankingWeightsTieBreakAndMaintenanceReviewSha256",
    ],
    "openAcceptance",
  );
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `${key} must remain open`);
  }

  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetRouteWorkloadScenarioCellCycleFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsAndRedactedCategoriesRequired: true,
    rawControllerHidBluetoothUsbOrRemotePayloadsAllowed: false,
    stableDeviceDisplayControllerNetworkOrHouseholdIdentifiersAllowed: false,
    urlsQueriesTitlesHeadersBodiesCookiesTokensCredentialsOrEnteredTextAllowed: false,
    pathsEnvironmentArgumentsWindowTitlesStorageValuesOrCrashLogsAllowed: false,
    screenVideoAudioCameraParticipantOrHouseholdMediaAllowed: false,
    freeTextBrowserCompositorDriverGameServiceOrResultLogsAllowed: false,
    externalEgressOutsideExactAuthorizedHostedOriginsAllowed: false,
    failedBlockedInvalidStoppedRetriedAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, KIOSK_BLOCKER_CODES);
  assert.equal(plan.result, null);
}

export async function parseKioskCompositorPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "kiosk compositor plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  await validateKioskCompositorPlan(plan, repositoryRoot);
  return plan;
}

export async function readKioskCompositorPlan(path = trackedPath) {
  return parseKioskCompositorPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readKioskCompositorPlan();
  console.log(
    `Kiosk compositor plan valid: ${plan.qualificationMatrix.requiredCellCount} required cells, ${plan.qualificationMatrix.requiredCycleCount} required cycles, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
