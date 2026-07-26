import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steamos-camera/steamos-uvc-permission-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAMOS_UVC_PLAN_FORMAT =
  "vcg-steamos-uvc-permission-qualification-plan/v1";
export const STEAMOS_UVC_ROUTES = Object.freeze([
  ["flatpak-direct-v4l2", "flatpak-writable-content", "v4l2-direct"],
  [
    "flatpak-pipewire-mediated",
    "flatpak-writable-content",
    "pipewire-mediated",
  ],
  [
    "steam-runtime-direct-v4l2",
    "self-contained-steam-runtime-content",
    "v4l2-direct",
  ],
  [
    "steam-runtime-pipewire-mediated",
    "self-contained-steam-runtime-content",
    "pipewire-mediated",
  ],
]);
export const STEAMOS_UVC_SCENARIOS = Object.freeze([
  "device-absent-at-launch",
  "permission-denied-before-open",
  "deliberate-permission-grant-and-cold-open",
  "format-frame-size-and-interval-enumeration",
  "sustained-genuine-1080p60-and-timestamp-observation",
  "uvc-control-apply-readback-stream-and-reopen",
  "tracker-consumer-under-representative-load",
  "hotplug-before-open",
  "disconnect-while-streaming",
  "same-port-and-different-port-reconnect",
  "permission-revoke-while-streaming-and-regrant",
  "suspend-resume-while-streaming",
  "package-update-rollback-and-permission-restoration",
  "steamos-update-offline-restart-and-permission-restoration",
]);
export const STEAMOS_UVC_CHECKS = Object.freeze([
  "usb-descriptor-video-audio-and-interface-inventory",
  "v4l2-node-provenance-ownership-and-permission",
  "pipewire-node-portal-session-format-and-permission",
  "format-frame-size-frame-interval-and-buffer-enumeration",
  "genuine-1920x1080-60000-millihertz-capture",
  "unique-exposure-frame-drop-and-duplicate-accounting",
  "exposure-timestamp-authority-monotonicity-domain-and-uncertainty",
  "exposure-gain-white-balance-focus-power-line-and-buffer-controls",
  "tracker-consumer-backpressure-clock-and-clean-stop",
  "microphone-audio-function-track-buffer-and-byte-denial",
  "software-access-stream-activity-indicator-and-unsensed-shutter-truth",
  "no-camera-access-for-launcher-browser-games-or-untrusted-descendants",
]);
export const STEAMOS_UVC_METRICS = Object.freeze([
  "exact-target-os-kernel-driver-pipewire-package-camera-usb-port-and-route-digests",
  "usb-video-audio-interface-v4l2-node-and-pipewire-node-provenance",
  "declared-and-effective-flatpak-or-steam-runtime-permissions",
  "pixel-format-frame-size-frame-interval-color-space-buffer-and-control-enumeration",
  "captured-unique-duplicate-dropped-late-and-out-of-order-exposure-counts",
  "exposure-timestamp-domain-authority-offset-regression-jitter-and-uncertainty",
  "control-request-readback-stream-effective-and-reopen-values",
  "open-first-frame-steady-capture-revoke-reconnect-resume-and-recovery-timing",
  "tracker-input-backpressure-delivery-clean-stop-and-component-health",
  "camera-access-stream-activity-indicator-shutter-and-microphone-state",
  "network-ipc-device-filesystem-process-and-descendant-access-ledger",
  "cpu-gpu-memory-usb-bandwidth-frame-rate-and-frame-time-under-load",
  "failed-invalid-stopped-retried-adverse-and-worst-case-cycle-ledger",
]);
export const STEAMOS_UVC_BLOCKERS = Object.freeze([
  "sucam-001-exact-received-steamos-target-image-kernel-driver-pipewire-and-gamescope",
  "sucam-002-selected-shared-camera-receipt-firmware-cable-port-and-usb-topology",
  "sucam-003-predeclared-four-route-comparison-and-selection-rule",
  "sucam-004-flatpak-manifest-runtime-portal-device-and-permission-policy",
  "sucam-005-steam-runtime-content-manifest-sandbox-device-and-permission-policy",
  "sucam-006-v4l2-and-pipewire-node-provenance-format-session-and-access-protocol",
  "sucam-007-uvc-mode-format-control-buffer-and-genuine-1080p60-protocol",
  "sucam-008-exposure-timestamp-authority-common-clock-and-uncertainty-proof",
  "sucam-009-tracker-consumer-backpressure-load-process-and-clean-stop-protocol",
  "sucam-010-microphone-disablement-privacy-indicator-shutter-and-camera-state-protocol",
  "sucam-011-hotplug-revoke-reconnect-suspend-package-update-os-update-and-recovery-protocol",
  "sucam-012-root-device-network-ipc-process-audio-indicator-and-recovery-oracles",
  "sucam-013-schedule-independent-review-and-all-numeric-gates",
  "sucam-014-data-rights-privacy-retention-deletion-incident-and-adverse-evidence-policy",
  "sucam-015-target-camera-permission-suspend-update-recovery-qualification-and-publication-authority",
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
  "targetAndDeviceBoundary",
  "authorityBoundary",
  "accessRoutes",
  "lifecycleMatrix",
  "modeControlAndPrivacyChecks",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["steam-machine-camera-boundary", "docs/STEAM_MACHINE_2026.md"],
  [
    "flatpak-camera-research-boundary",
    "docs/AUTONOMOUS_RESEARCH_2026-07-19.md",
  ],
  ["flatpak-source-register", "docs/SOURCES.md"],
  [
    "steamos-update-safe-content-campaign",
    "docs/STEAMOS_UPDATE_SAFE_CONTENT_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-update-safe-content-plan",
    "benchmarks/steamos-content/steamos-update-safe-content-plan-v1.json",
  ],
  [
    "shared-camera-qualification-campaign",
    "docs/SHARED_CAMERA_QUALIFICATION_PLAN_2026-07-25.md",
  ],
  [
    "shared-camera-qualification-plan",
    "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json",
  ],
  [
    "microphone-disablement-campaign",
    "docs/MICROPHONE_DISABLEMENT_QUALIFICATION_PLAN_2026-07-25.md",
  ],
  [
    "microphone-disablement-plan",
    "benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json",
  ],
  [
    "camera-capture-policy-campaign",
    "docs/CAMERA_CAPTURE_POLICY_CAMPAIGN_2026-07-25.md",
  ],
  [
    "camera-capture-policy-plan",
    "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
  ],
  [
    "camera-action-latency-boundary",
    "docs/CAMERA_ACTION_LATENCY_CAMPAIGN_2026-07-24.md",
  ],
  ["camera-state-truth-boundary", "docs/CAMERA_STATE_TRUTH_2026-07-25.md"],
  [
    "physical-camera-state-campaign",
    "docs/PHYSICAL_SHUTTER_CAMERA_STATE_EXPERIENCE_CAMPAIGN_2026-07-26.md",
  ],
  ["device-only-data-exclusion-boundary", "docs/DEVICE_ONLY_DATA_EXCLUSION.md"],
  ["prototype-gate-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
];
const targetKeys = [
  "targetClassId",
  "exactReceivedHardwareAndInventorySha256",
  "steamOsImageKernelDriverPipeWireAndGamescopeSha256",
  "selectedSharedCameraCandidateAndReceiptSha256",
  "usbDescriptorsFirmwareCablePortAndTopologySha256",
  "physicalShutterIndicatorAndMicrophoneInventorySha256",
  "cameraSelectedPurchasedReceivedOrQualified",
  "targetCameraOrPackagingMayBeInferredFromOtherPlatform",
  "steamMachineMayReplaceRequiredReferenceTargets",
];
const authorityNullKeys = [
  "selectedAccessRouteId",
  "flatpakManifestRuntimeAndPermissionPolicySha256",
  "steamRuntimeContentManifestAndPermissionPolicySha256",
  "v4l2NodeProvenanceAndAccessPolicySha256",
  "pipeWirePortalNodeSessionAndAccessPolicySha256",
  "uvcModeFormatControlAndBufferPolicySha256",
  "exposureTimestampAuthorityAndUncertaintySha256",
  "trackerConsumerBackpressureAndCommonClockSha256",
  "microphoneDisablementQualificationResultSha256",
  "cameraStateIndicatorAndPrivacyProtocolSha256",
  "hotplugRevokeSuspendUpdateAndRecoveryProtocolSha256",
  "rootDeviceNetworkIpcAndProcessOracleSha256",
  "scheduleNumericGateAndIndependentReviewProtocolSha256",
  "dataRightsPrivacyRetentionDeletionAndIncidentProtocolSha256",
];
const authorityFalseKeys = [
  "targetOperationAuthorized",
  "cameraOrUsbOperationAuthorized",
  "permissionPolicyMutationAuthorized",
  "screenRoomAudioOrParticipantCollectionAuthorized",
  "suspendUpdateOrRecoveryAuthorized",
  "qualificationSelectionPublicationOrTierMutationAuthorized",
];
const routeKeys = [
  "routeId",
  "packageCandidateId",
  "accessPath",
  "exactManifestAndPermissionSha256",
  "runtimeDependencyAndPortalSha256",
  "targetResultSha256",
  "broadAllDeviceGrantRequired",
  "rawUsbPermissionMayProveV4l2NodeAccess",
  "documentationOrOtherRouteMayQualify",
  "failedRouteEvidenceMayBeDiscarded",
];
const openAcceptanceKeys = [
  "minimumIndependentPhysicalCameraSamples",
  "minimumSustainedCaptureDurationMs",
  "maximumDroppedExposureRatePpm",
  "maximumFrameIntervalJitterP95Us",
  "maximumExposureTimestampUncertaintyUs",
  "maximumOpenToFirstExposureP95Ms",
  "maximumCaptureToTrackerDeliveryP95Us",
  "maximumPermissionGrantOrRevokeP95Ms",
  "maximumReconnectP95Ms",
  "maximumSuspendResumeRecoveryP95Ms",
  "maximumUpdateRecoveryP95Ms",
  "maximumCpuPpm",
  "maximumGpuPpm",
  "maximumResidentMemoryBytes",
  "maximumUsbBandwidthBytesPerSecond",
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

export async function validateSteamOsUvcPermissionPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, STEAMOS_UVC_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "steamos-uvc-permission-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-167"]);
  for (const phrase of [
    "strict zero-result qualification plan",
    "do not prove a received camera",
    "No route may be selected",
    "optional Steam Machine tier",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.targetAndDeviceBoundary, targetKeys, "targetAndDeviceBoundary");
  assert.equal(
    plan.targetAndDeviceBoundary.targetClassId,
    "optional-steamos-compatibility-target",
  );
  for (const key of targetKeys.slice(1, 6)) {
    assert.equal(
      plan.targetAndDeviceBoundary[key],
      null,
      `blocked plan cannot bind ${key}`,
    );
  }
  for (const key of targetKeys.slice(6)) {
    assert.equal(
      plan.targetAndDeviceBoundary[key],
      false,
      `${key} must remain false`,
    );
  }

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(
      plan.authorityBoundary[key],
      null,
      `blocked plan cannot bind ${key}`,
    );
  }
  for (const key of authorityFalseKeys) {
    assert.equal(
      plan.authorityBoundary[key],
      false,
      `blocked plan cannot authorize ${key}`,
    );
  }

  assert.ok(Array.isArray(plan.accessRoutes));
  assert.equal(plan.accessRoutes.length, STEAMOS_UVC_ROUTES.length);
  for (const [index, route] of plan.accessRoutes.entries()) {
    exactKeys(route, routeKeys, `accessRoutes[${index}]`);
    assert.deepEqual(
      [route.routeId, route.packageCandidateId, route.accessPath],
      STEAMOS_UVC_ROUTES[index],
    );
    for (const key of routeKeys.slice(3, 7)) {
      assert.equal(route[key], null, `blocked route cannot bind ${key}`);
    }
    for (const key of routeKeys.slice(7)) {
      assert.equal(route[key], false, `${key} must remain false`);
    }
  }

  exactKeys(
    plan.lifecycleMatrix,
    [
      "scenarioIds",
      "routeCount",
      "validCyclesPerRouteScenario",
      "requiredCellCount",
      "requiredCycleCount",
      "everyRouteMustBeAttempted",
      "routeSelectionRuleMustBeFrozenBeforeOperation",
      "nonselectedRouteFailureMayBeHidden",
      "selectedRouteMustPassEveryScenario",
      "otherRouteScenarioOrAggregateMayRescueSelectedRouteFailure",
    ],
    "lifecycleMatrix",
  );
  assert.deepEqual(plan.lifecycleMatrix.scenarioIds, [...STEAMOS_UVC_SCENARIOS]);
  assert.equal(plan.lifecycleMatrix.routeCount, 4);
  assert.equal(plan.lifecycleMatrix.validCyclesPerRouteScenario, 20);
  assert.equal(plan.lifecycleMatrix.requiredCellCount, 56);
  assert.equal(plan.lifecycleMatrix.requiredCycleCount, 1120);
  for (const key of [
    "everyRouteMustBeAttempted",
    "routeSelectionRuleMustBeFrozenBeforeOperation",
    "selectedRouteMustPassEveryScenario",
  ]) {
    assert.equal(plan.lifecycleMatrix[key], true, `${key} must remain true`);
  }
  for (const key of [
    "nonselectedRouteFailureMayBeHidden",
    "otherRouteScenarioOrAggregateMayRescueSelectedRouteFailure",
  ]) {
    assert.equal(plan.lifecycleMatrix[key], false, `${key} must remain false`);
  }

  exactKeys(
    plan.modeControlAndPrivacyChecks,
    [
      "requiredCheckIds",
      "everyRouteRequiresEveryCheck",
      "advertisedModeOrEnumerationMayProveSustainedCapture",
      "captureArrivalCallbackOrInferenceTimeMayProveExposureTime",
      "duplicatedFramesMayCountTowardRequiredFrameRate",
      "rawUsbPermissionMayProveV4l2OrPipeWireAccess",
      "uiPromptToggleOrSilentAudioMayProvePermissionOrMicrophonePolicy",
      "selectedRouteCameraAuthorityRestrictedToTrustedTracker",
    ],
    "modeControlAndPrivacyChecks",
  );
  assert.deepEqual(
    plan.modeControlAndPrivacyChecks.requiredCheckIds,
    [...STEAMOS_UVC_CHECKS],
  );
  assert.equal(plan.modeControlAndPrivacyChecks.everyRouteRequiresEveryCheck, true);
  assert.equal(
    plan.modeControlAndPrivacyChecks.selectedRouteCameraAuthorityRestrictedToTrustedTracker,
    true,
  );
  for (const key of [
    "advertisedModeOrEnumerationMayProveSustainedCapture",
    "captureArrivalCallbackOrInferenceTimeMayProveExposureTime",
    "duplicatedFramesMayCountTowardRequiredFrameRate",
    "rawUsbPermissionMayProveV4l2OrPipeWireAccess",
    "uiPromptToggleOrSilentAudioMayProvePermissionOrMicrophonePolicy",
  ]) {
    assert.equal(
      plan.modeControlAndPrivacyChecks[key],
      false,
      `${key} must remain false`,
    );
  }

  exactKeys(
    plan.measurements,
    [
      "requiredMetricIds",
      "independentUsbExposurePermissionAudioIndicatorProcessAndRecoveryOraclesRequired",
      "everyScheduledCycleAndFailureMustRemainVisible",
      "vendorDocsEnumerationOtherTargetRouteOrAggregateMaySubstituteTargetEvidence",
    ],
    "measurements",
  );
  assert.deepEqual(plan.measurements.requiredMetricIds, [...STEAMOS_UVC_METRICS]);
  assert.equal(
    plan.measurements
      .independentUsbExposurePermissionAudioIndicatorProcessAndRecoveryOraclesRequired,
    true,
  );
  assert.equal(plan.measurements.everyScheduledCycleAndFailureMustRemainVisible, true);
  assert.equal(
    plan.measurements
      .vendorDocsEnumerationOtherTargetRouteOrAggregateMaySubstituteTargetEvidence,
    false,
  );

  assert.deepEqual(plan.fixedAcceptance, {
    requiredWidthPixels: 1920,
    requiredHeightPixels: 1080,
    requiredFrameRateMilliHz: 60000,
    minimumValidCyclesPerRouteScenario: 20,
    maximumUntrustedLauncherBrowserGameOrDescendantCaptureSuccesses: 0,
    maximumAudioTrackBufferOrReturnedByteSuccesses: 0,
    maximumRetainedRawFramesAudioOrNetworkEgressEvents: 0,
    maximumDuplicatedStaleOutOfOrderOrCrossEpochExposures: 0,
    maximumUnexplainedTimestampRegressionsOrDomainSubstitutions: 0,
    maximumControlApplyReadbackStreamOrReopenMismatches: 0,
    maximumUnrecoveredPermissionHotplugRevokeSuspendUpdateOrRestartEvents: 0,
    maximumCameraGrantsOutsideSelectedTrustedTrackerRoute: 0,
    maximumStableDeviceParticipantAccountPathOrFreeTextDisclosures: 0,
    maximumValidSelectedRouteProductFailures: 0,
    allSelectedRouteCellsAndChecksMustPass: true,
    aggregateMayRescueFailure: false,
    allOpenGatesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
  }

  assert.deepEqual(plan.dataPolicy, {
    opaqueTargetCameraRouteBuildCycleAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsControlsModesAndRedactedCategoriesRequired: true,
    rawRoomPlayerCameraScreenAudioOrVideoAllowedInRepositoryReleaseOrResult: false,
    retainedRawFramesAudioBuffersOrSampleBytesAllowed: false,
    namesFacesVoicesExactAgesStableDeviceIdsSerialsPathsOrQueryUrlsAllowed: false,
    credentialsTokensCookiesProfileSaveStorageEnvironmentOrArgumentValuesAllowed: false,
    arbitraryKernelDriverPortalProviderOrConsoleMessagesAllowed: false,
    freeTextResultEvidenceAllowed: false,
    networkEgressOutsideDeclaredPackageAndProbeTrafficAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, [...STEAMOS_UVC_BLOCKERS]);

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "blocked",
    completedRouteScenarioCellCount: 0,
    completedCycleCount: 0,
    routeResults: [],
    qualifiedRouteIds: [],
    selectedAccessRouteId: null,
    qualifiedCameraIdentitySha256: null,
    microphoneDisablementQualified: false,
    targetQualified: false,
    sharedCameraSelected: false,
    steamMachinePrimaryTierChanged: false,
    publishedClaims: [],
  });
}

export async function parseSteamOsUvcPermissionPlanBytes(bytes) {
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
  await validateSteamOsUvcPermissionPlan(plan);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await parseSteamOsUvcPermissionPlanBytes(await readFile(trackedPath));
  console.log(
    `${trackedPath}: valid blocked ${plan.accessRoutes.length}-route, ${plan.lifecycleMatrix.requiredCycleCount}-cycle I-167 plan`,
  );
}
