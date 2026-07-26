import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-state/physical-shutter-camera-state-experience-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const PHYSICAL_CAMERA_STATE_FORMAT =
  "vcg-physical-shutter-camera-state-experience-plan/v1";
export const PHYSICAL_CAMERA_TARGET_IDS = Object.freeze([
  "ordinary-x86-linux-external-camera",
  "steamos-external-camera",
  "raspberry-pi5-ai-hat-integrated-camera",
]);
export const PHYSICAL_CAMERA_CAPTURE_PATH_IDS = Object.freeze([
  "primary-motion-tracking",
  "calibration-and-room-setup",
  "profile-image-capture",
  "authorized-local-diagnostics",
]);
export const PHYSICAL_CAMERA_SOFTWARE_STATE_IDS = Object.freeze([
  "disabled",
  "starting",
  "requesting-permission",
  "active",
  "permission-denied",
  "unavailable",
  "disconnected",
  "failed",
]);
export const PHYSICAL_CAMERA_SURFACE_IDS = Object.freeze([
  "motion-lab-camera-card",
  "setup-settings-camera-surface",
  "pause-recovery-camera-surface",
]);
export const PHYSICAL_CAMERA_PERSONAS = Object.freeze([
  "school-age-child-standing",
  "adult-standing",
  "seated-or-limited-range-adult",
  "low-vision-adult",
  "color-vision-deficiency-adult",
]);
export const PHYSICAL_CAMERA_BLOCKERS = Object.freeze([
  "cs-001-exact-received-camera-enclosure-revision-firmware-cable-mount-power-shutter-indicator-and-condition",
  "cs-002-shutter-construction-position-observer-optical-fixture-instrument-force-wear-and-quarantine",
  "cs-003-indicator-electrical-authority-color-pattern-luminance-field-latency-failure-and-probe",
  "cs-004-complete-capture-path-inventory-native-lease-owner-state-reconciliation-and-stale-stop",
  "cs-005-blocking-product-surface-location-and-console-owned-visibility-policy",
  "cs-006-stop-idle-suspend-crash-disconnect-resume-retry-confirmation-and-quarantine-policy",
  "cs-007-room-display-placement-zone-distance-angle-lighting-instrument-and-repeat-protocol",
  "cs-008-personas-accessibility-consent-assent-guardian-safety-rest-stop-privacy-and-adverse-events",
  "cs-009-pre-result-optical-indicator-force-wear-transition-release-stale-state-and-recovery-gates",
  "cs-010-uncoached-comprehension-reach-visibility-time-force-error-discomfort-and-zone-entry-gates",
  "cs-011-diagnostic-data-security-retention-deletion-incident-and-closed-release-evidence",
  "cs-012-purchase-operation-fault-participant-surface-publication-qualification-and-claim-authority",
]);

const LIGHTING_IDS = ["daylight", "warm-lamp", "tv-only", "dim"];
const SHUTTER_TRANSITION_IDS = [
  "open-to-closed",
  "closed-to-open",
  "active-capture-to-closed",
  "active-capture-to-open",
];
const LIFECYCLE_TRANSITION_IDS = [
  "active-to-explicit-stop",
  "active-to-idle-timeout",
  "active-to-host-suspend",
  "resume-without-automatic-restart",
  "resume-explicit-restart",
  "active-to-device-disconnect",
  "reconnect-without-automatic-restart",
  "capture-owner-process-crash-to-release",
];
const SOFTWARE_STATES = [
  ["disabled", "RELEASED", "NO STREAM"],
  ["starting", "PREPARING", "NO STREAM"],
  ["requesting-permission", "REQUESTING", "NO STREAM"],
  ["active", "ENABLED", "STREAM ACTIVE"],
  ["permission-denied", "BLOCKED", "NO STREAM"],
  ["unavailable", "UNAVAILABLE", "NO STREAM"],
  ["disconnected", "LOST", "NO STREAM"],
  ["failed", "FAILED", "NO STREAM"],
].map(([stateId, softwareAccess, streamActivity]) => ({
  stateId,
  softwareAccess,
  streamActivity,
}));
const LIFECYCLE_ROWS = [
  ["software-disabled", "disabled", false, "off"],
  ["backend-starting", "starting", false, "off"],
  ["permission-requesting", "requesting-permission", false, "off"],
  ["capture-active", "active", true, "on"],
  ["permission-denied", "permission-denied", false, "off"],
  ["device-unavailable", "unavailable", false, "off"],
  ["active-device-disconnected", "disconnected", false, "off"],
  ["tracker-failed", "failed", false, "off"],
  ["explicit-stop-complete", "disabled", false, "off"],
  ["idle-timeout-complete", "disabled", false, "off"],
  ["host-suspended", null, false, "off"],
  ["resume-awaiting-explicit-restart", "disabled", false, "off"],
].map(([
  stateId,
  softwareStateId,
  cameraCaptureExpected,
  hardwareActivityIndicatorExpected,
]) => ({
  stateId,
  softwareStateId,
  cameraCaptureExpected,
  hardwareActivityIndicatorExpected,
}));

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "targetPackageRoles",
  "capturePathRoles", "softwareTruthContract", "authorityBoundary",
  "opticalShutterMatrix", "shutterTransitionCampaign", "indicatorTruthMatrix",
  "lifecycleTransitionCampaign", "negativeSessionCampaign", "cameraFreeRenderMatrix",
  "humanComprehensionPhase", "humanReachVisibilityPhase", "measurements",
  "fixedAcceptance", "openAcceptance", "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["campaign-contract", "docs/PHYSICAL_SHUTTER_CAMERA_STATE_EXPERIENCE_CAMPAIGN_2026-07-26.md"],
  ["software-camera-state-truth-boundary", "docs/CAMERA_STATE_TRUTH_2026-07-25.md"],
  ["camera-state-status-audit", "docs/CAMERA_EXPOSURE_SHUTTER_STATUS_AUDIT_2026-07-25.md"],
  ["camera-state-implementation", "apps/console-lab/src/camera-state.ts"],
  ["camera-state-unit-proof", "apps/console-lab/src/camera-state.test.ts"],
  ["motion-lab-camera-state-surface", "apps/console-lab/src/main.ts"],
  ["motion-lab-camera-state-style", "apps/console-lab/src/styles.css"],
  ["camera-state-browser-proof", "apps/console-lab/tests/console-flow.spec.ts"],
  ["shared-camera-physical-check-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-geometry-reach-visibility-boundary", "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json"],
  ["camera-cable-service-boundary", "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"],
  ["idle-suspend-power-boundary", "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
];
const requiredMeasurements = [
  "independently-observed-open-partial-jammed-and-closed-shutter-position",
  "optical-attenuation-center-resolution-perimeter-leakage-and-moving-target-visibility",
  "shutter-force-cycle-wear-jam-rebound-partial-coverage-and-quarantine",
  "os-device-capture-lease-stream-frame-and-release-state",
  "application-software-access-stream-activity-and-stale-state",
  "hardware-indicator-electrical-authority-on-off-latency-color-pattern-luminance-contrast-and-view-field",
  "idle-suspend-disconnect-crash-stop-release-indicator-off-and-explicit-recovery-time",
  "unexpected-access-indicator-stream-frame-auto-retry-and-network-egress",
  "per-surface-state-resolution-safe-area-text-action-focus-overlap-and-overflow",
  "uncoached-access-activity-shutter-truth-and-recovery-comprehension",
  "indicator-shutter-connector-service-and-recovery-reach-time-force-errors-assistance-and-discomfort",
  "participant-target-room-lighting-distance-angle-approach-operator-stop-and-incident-ledger",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  assert.ok(!text.startsWith("\uFEFF"), `${label} must not contain a UTF-8 BOM`);
  assert.ok(!/\r(?!\n)/u.test(text), `${label} contains a bare carriage return`);
  return text.replaceAll("\r\n", "\n");
}

function normalizedSha256(bytes, label) {
  return createHash("sha256")
    .update(Buffer.from(normalizedText(bytes, label), "utf8"))
    .digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length, "source binding count drifted");
  for (const [index, [role, path]] of sourceDefinitions.entries()) {
    const binding = bindings[index];
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.equal(binding.role, role);
    assert.equal(binding.path, path);
    assert.match(binding.sha256, SHA256);
    assert.equal(isAbsolute(path), false, "source path must be relative");
    const absolute = resolve(repositoryRoot, path);
    assert.ok(!relative(repositoryRoot, absolute).startsWith(".."), "source path escaped repository");
    assert.equal(
      normalizedSha256(await readFile(absolute), path),
      binding.sha256,
      `${path} digest drifted`,
    );
  }
}

export async function validatePhysicalShutterCameraStateExperiencePlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PHYSICAL_CAMERA_STATE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "physical-shutter-camera-state-experience-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-046", "I-177"]);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /remain separate facts/u);
  assert.match(plan.claimBoundary, /No camera or enclosure selection/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPackageRoles, [
    {
      targetId: PHYSICAL_CAMERA_TARGET_IDS[0],
      packageClass: "ordinary-native-linux-reference",
      cameraPlacement: "external-supported-placement",
      exactReceivedCameraEnclosureManifestSha256: null,
      exactUsbPowerMountAndCableManifestSha256: null,
      required: true,
      operationAuthorized: false,
    },
    {
      targetId: PHYSICAL_CAMERA_TARGET_IDS[1],
      packageClass: "steamos-reference",
      cameraPlacement: "external-supported-placement",
      exactReceivedCameraEnclosureManifestSha256: null,
      exactUsbPowerMountAndCableManifestSha256: null,
      required: true,
      operationAuthorized: false,
    },
    {
      targetId: PHYSICAL_CAMERA_TARGET_IDS[2],
      packageClass: "lower-cost-integrated-reference",
      cameraPlacement: "integrated-fixed-angle-placement",
      exactReceivedCameraEnclosureManifestSha256: null,
      exactUsbPowerMountAndCableManifestSha256: null,
      required: true,
      operationAuthorized: false,
    },
  ]);
  assert.deepEqual(plan.capturePathRoles, [
    {
      pathId: PHYSICAL_CAMERA_CAPTURE_PATH_IDS[0],
      currentStatus: "prototype-browser-path-present-native-authority-absent",
      requiredInConservativeInventory: true,
      operationAuthorized: false,
    },
    ...PHYSICAL_CAMERA_CAPTURE_PATH_IDS.slice(1).map((pathId) => ({
      pathId,
      currentStatus: "product-path-unbound",
      requiredInConservativeInventory: true,
      operationAuthorized: false,
    })),
  ]);

  assert.deepEqual(plan.softwareTruthContract, {
    physicalShutterState: "NOT SENSED",
    physicalShutterDetailMustRequireDirectCheck: true,
    streamActivityMayProveOpenShutterUsefulFramesTrackerHealthOrMotionAvailability: false,
    blackFrameMissingLandmarksStoppedTrackerIndicatorOrSoftwareBadgeMayProveShutterPosition: false,
    states: SOFTWARE_STATES,
    hostedGameMayReplaceContradictOrHideConsoleOwnedState: false,
    unknownStaleOrContradictoryAuthorityStopsCapture: true,
  });

  exactKeys(plan.authorityBoundary, [
    "exactReceivedTargetManifestSha256", "shutterConstructionOpticalTruthAndCycleProtocolSha256",
    "indicatorElectricalAuthorityAndVisibilityProtocolSha256",
    "completeCapturePathAndNativeLeaseInventorySha256",
    "lifecycleIdleSuspendCrashAndRecoveryProtocolSha256",
    "cameraFreeSurfaceBuildAndRenderProtocolSha256",
    "roomDisplayLightingDistanceAndAngleProtocolSha256",
    "participantConsentAssentAccessibilityAndSafetyProtocolSha256",
    "comprehensionAndReachGroundTruthProtocolSha256", "measurementAndAcceptanceProtocolSha256",
    "dataHandlingDiagnosticsAndDeletionProtocolSha256", "operatorScheduleStopAndIncidentProtocolSha256",
    "cameraOrEnclosureSelectionPurchaseOrReceiptAuthorized",
    "devicePowerCaptureOrShutterCyclingAuthorized", "indicatorObservationAuthorized",
    "idleSuspendDisconnectCrashOrRecoveryInjectionAuthorized",
    "cameraFreeProductSurfaceImplementationAuthorized", "adultParticipationAuthorized",
    "childParticipationAuthorized", "accessibilityStudyAuthorized",
    "temporaryDiagnosticCaptureAuthorized", "resultPublicationQualificationOrProductClaimAuthorized",
  ], "authorityBoundary");
  for (const key of Object.keys(plan.authorityBoundary).slice(0, 12)) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of Object.keys(plan.authorityBoundary).slice(12)) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.opticalShutterMatrix, {
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    operatorVerifiedShutterPositionIds: ["open", "closed"],
    lightingConditionIds: LIGHTING_IDS,
    calibratedFixtureIds: [
      "center-resolution-target", "perimeter-light-leak-target", "moving-geometric-target",
    ],
    validObservationsPerCell: 20,
    requiredCellCount: 72,
    requiredObservationCount: 1440,
    independentShutterPositionAndOpticalGroundTruthRequired: true,
    imageDarknessOrTrackerOutputMayLabelShutterPositionOrBlocking: false,
    oneTargetPositionLightingFixtureOrObservationMayRescueAnother: false,
  });
  const opticalCellCount = PHYSICAL_CAMERA_TARGET_IDS.length * 2 * LIGHTING_IDS.length * 3;
  assert.equal(plan.opticalShutterMatrix.requiredCellCount, opticalCellCount);
  assert.equal(
    plan.opticalShutterMatrix.requiredObservationCount,
    opticalCellCount * plan.opticalShutterMatrix.validObservationsPerCell,
  );

  assert.deepEqual(plan.shutterTransitionCampaign, {
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    transitionIds: SHUTTER_TRANSITION_IDS,
    validCyclesPerTargetTransitionCell: 50,
    requiredTargetTransitionCellCount: 12,
    requiredCycleCount: 600,
    jamPartialCoverageReboundWearForceContradictionStopRetryAndInvalidCyclesRemainVisible: true,
    laterSuccessOrAnotherTargetTransitionMayRescueFailure: false,
  });
  assert.equal(
    plan.shutterTransitionCampaign.requiredTargetTransitionCellCount,
    PHYSICAL_CAMERA_TARGET_IDS.length * SHUTTER_TRANSITION_IDS.length,
  );
  assert.equal(
    plan.shutterTransitionCampaign.requiredCycleCount,
    plan.shutterTransitionCampaign.requiredTargetTransitionCellCount
      * plan.shutterTransitionCampaign.validCyclesPerTargetTransitionCell,
  );

  assert.deepEqual(plan.indicatorTruthMatrix, {
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    capturePathIds: [...PHYSICAL_CAMERA_CAPTURE_PATH_IDS],
    lifecycleRows: LIFECYCLE_ROWS,
    lightingConditionIds: LIGHTING_IDS,
    validObservationsPerCell: 20,
    requiredCellCount: 576,
    requiredObservationCount: 11520,
    independentOsDeviceApplicationIndicatorAndShutterObservationRequired: true,
    powerOnlyOrApplicationIntentLampMayQualifyCaptureActivityIndicator: false,
    oneTargetPathStateLightingOrObservationMayRescueAnother: false,
  });
  const indicatorCellCount = PHYSICAL_CAMERA_TARGET_IDS.length
    * PHYSICAL_CAMERA_CAPTURE_PATH_IDS.length * LIFECYCLE_ROWS.length * LIGHTING_IDS.length;
  assert.equal(plan.indicatorTruthMatrix.requiredCellCount, indicatorCellCount);
  assert.equal(
    plan.indicatorTruthMatrix.requiredObservationCount,
    indicatorCellCount * plan.indicatorTruthMatrix.validObservationsPerCell,
  );

  assert.deepEqual(plan.lifecycleTransitionCampaign, {
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    capturePathIds: [...PHYSICAL_CAMERA_CAPTURE_PATH_IDS],
    transitionIds: LIFECYCLE_TRANSITION_IDS,
    validCyclesPerTargetPathTransitionCell: 20,
    requiredTargetPathTransitionCellCount: 96,
    requiredCycleCount: 1920,
    captureReleaseIndicatorOffStaleStateRejectionAndExplicitRecoveryRequired: true,
    automaticResumeRetryOrLaterSuccessMayHideFailure: false,
    oneTargetPathTransitionMayRescueAnother: false,
  });
  assert.equal(
    plan.lifecycleTransitionCampaign.requiredTargetPathTransitionCellCount,
    PHYSICAL_CAMERA_TARGET_IDS.length * PHYSICAL_CAMERA_CAPTURE_PATH_IDS.length
      * LIFECYCLE_TRANSITION_IDS.length,
  );
  assert.equal(
    plan.lifecycleTransitionCampaign.requiredCycleCount,
    plan.lifecycleTransitionCampaign.requiredTargetPathTransitionCellCount
      * plan.lifecycleTransitionCampaign.validCyclesPerTargetPathTransitionCell,
  );

  assert.deepEqual(plan.negativeSessionCampaign, {
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    capturePathIds: [...PHYSICAL_CAMERA_CAPTURE_PATH_IDS],
    lightingConditionIds: LIGHTING_IDS,
    minimumMeasuredSecondsPerSession: 900,
    requiredSessionCount: 48,
    unexpectedAccessIndicatorStreamFrameAutoRetryOrNetworkEgressIsFailure: true,
    oneSessionTargetPathOrLightingConditionMayRescueAnother: false,
  });
  assert.equal(
    plan.negativeSessionCampaign.requiredSessionCount,
    PHYSICAL_CAMERA_TARGET_IDS.length * PHYSICAL_CAMERA_CAPTURE_PATH_IDS.length
      * LIGHTING_IDS.length,
  );

  assert.deepEqual(plan.cameraFreeRenderMatrix, {
    surfaceIds: [...PHYSICAL_CAMERA_SURFACE_IDS],
    softwareStateIds: [...PHYSICAL_CAMERA_SOFTWARE_STATE_IDS],
    resolutionIds: ["1280x720", "1920x1080", "3840x2160"],
    requiredRenderCellCount: 72,
    unimplementedMissingOverflowingOverlappingOrInaccessibleSurfaceFails: true,
    renderEvidenceMayEstablishComprehensionPhysicalIndicatorVisibilityOrFinalLocation: false,
    oneSurfaceStateOrResolutionMayRescueAnother: false,
  });
  assert.equal(
    plan.cameraFreeRenderMatrix.requiredRenderCellCount,
    PHYSICAL_CAMERA_SURFACE_IDS.length * PHYSICAL_CAMERA_SOFTWARE_STATE_IDS.length * 3,
  );

  assert.deepEqual(plan.humanComprehensionPhase, {
    status: "blocked",
    personaClasses: [...PHYSICAL_CAMERA_PERSONAS],
    surfaceIds: [...PHYSICAL_CAMERA_SURFACE_IDS],
    softwareStateIds: [...PHYSICAL_CAMERA_SOFTWARE_STATE_IDS],
    viewingDistanceMm: [2500, 4500],
    viewingAngleDegrees: [0, 30, 60],
    lightingConditionIds: LIGHTING_IDS,
    taskIds: [
      "identify-software-access", "identify-stream-activity",
      "identify-that-physical-shutter-position-is-not-sensed",
      "select-available-non-motion-recovery",
    ],
    validTrialsPerCell: 20,
    requiredCellCount: 2880,
    requiredTrialCount: 57600,
    uncoachedSeparateFactQuestionsAndIndependentGroundTruthRequired: true,
    correctButtonUseMayHideFalsePrivacyInference: false,
    onePersonaSurfaceStateDistanceAngleLightingOrTrialMayRescueAnother: false,
  });
  const comprehensionCellCount = PHYSICAL_CAMERA_PERSONAS.length
    * PHYSICAL_CAMERA_SURFACE_IDS.length * PHYSICAL_CAMERA_SOFTWARE_STATE_IDS.length
    * 2 * 3 * LIGHTING_IDS.length;
  assert.equal(plan.humanComprehensionPhase.requiredCellCount, comprehensionCellCount);
  assert.equal(
    plan.humanComprehensionPhase.requiredTrialCount,
    comprehensionCellCount * plan.humanComprehensionPhase.validTrialsPerCell,
  );

  assert.deepEqual(plan.humanReachVisibilityPhase, {
    status: "blocked",
    personaClasses: [...PHYSICAL_CAMERA_PERSONAS],
    targetIds: [...PHYSICAL_CAMERA_TARGET_IDS],
    taskIds: [
      "locate-hardware-activity-indicator", "locate-and-operate-physical-shutter",
      "reach-connector-or-service-release", "use-non-motion-recovery-control",
    ],
    approachPositionIds: [
      "outside-zone-left", "outside-zone-center", "outside-zone-right",
      "seated-service-position",
    ],
    validTrialsPerCell: 20,
    requiredCellCount: 240,
    requiredTrialCount: 4800,
    independentReachVisibilityTaskSafetyAndDiscomfortGroundTruthRequired: true,
    unsafeZoneEntryOrAssistanceMayBeHiddenByTaskCompletion: false,
    onePersonaTargetTaskApproachOrTrialMayRescueAnother: false,
  });
  const reachCellCount = PHYSICAL_CAMERA_PERSONAS.length
    * PHYSICAL_CAMERA_TARGET_IDS.length * 4 * 4;
  assert.equal(plan.humanReachVisibilityPhase.requiredCellCount, reachCellCount);
  assert.equal(
    plan.humanReachVisibilityPhase.requiredTrialCount,
    reachCellCount * plan.humanReachVisibilityPhase.validTrialsPerCell,
  );

  assert.deepEqual(plan.measurements, {
    requiredMeasurements,
    independentGroundTruthRequired: true,
    cameraFrameTrackerSoftwareStateOrIndicatorMaySelfLabelAnotherFact: false,
    vendorClaimScreenshotOneParticipantMeanOrBestCaseMaySubstituteMeasurement: false,
    perTargetPathStateSurfacePersonaConditionCycleStopRetryAndWorstCaseReportingRequired: true,
  });
  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidObservationsPerPhysicalMatrixCell: 20,
    minimumValidShutterCyclesPerTargetTransitionCell: 50,
    minimumValidLifecycleCyclesPerTargetPathTransitionCell: 20,
    minimumValidHumanTrialsPerCellIfAuthorized: 20,
    maximumActiveCaptureWithoutQualifiedHardwareActivityIndicator: 0,
    maximumIndicatorOffObservationsDuringActiveCapture: 0,
    maximumFalseSoftwareStreamActivityObservations: 0,
    maximumSoftwareOpenOrClosedShutterClaims: 0,
    maximumAutomaticCaptureRestartsAfterIdleSuspendDisconnectOrCrash: 0,
    maximumSilentlyDiscardedInvalidStoppedRetriedOrInterruptedEvidence: 0,
    allOpenGatesMustBeFrozenBeforeOperation: true,
    aggregateRecoveryCrossTargetPathStateSurfaceOrPersonaRescueAllowed: false,
  });

  exactKeys(plan.openAcceptance, [
    "minimumClosedShutterOpticalAttenuation", "maximumClosedShutterPerimeterLeakage",
    "maximumShutterOperationForceMilliNewton", "maximumShutterWearOrJamRatePpm",
    "minimumIndicatorLuminance", "minimumIndicatorContrast",
    "minimumIndicatorViewingFieldMilliDegrees", "maximumIndicatorOnLatencyUs",
    "maximumCaptureReleaseTimeUs", "maximumIndicatorOffLatencyUs", "maximumStaleStateTimeUs",
    "maximumExplicitRecoveryTimeUs", "minimumSoftwareAccessComprehensionPpm",
    "minimumStreamActivityComprehensionPpm", "minimumNotSensedShutterComprehensionPpm",
    "minimumRecoverySelectionAccuracyPpm", "minimumIndicatorDetectionAccuracyPpm",
    "maximumShutterReachTimeUs", "maximumServiceReachTimeUs",
    "maximumUnsafeZoneEntriesPerCell", "maximumParticipantDiscomfortEventsPerCell",
  ], "openAcceptance");
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `pre-operation gate ${key} must remain null`);
  }

  assert.deepEqual(plan.dataPolicy, {
    rawCameraRoomOpticalAudioPortraitOrVideoAllowedInRepositoryOrRelease: false,
    participantNamesFacesVoicesExactAgesAddressesAccessibilityNotesOrStableIdentifiersAllowed: false,
    deviceSerialsPathsCredentialsProviderMessagesSecretsOrUnredactedLogsAllowed: false,
    freeTextResultEvidenceAllowed: false,
    temporaryDiagnosticsRequireSeparateAuthoritySecurityConsentAndVerifiedDeletion: true,
    pathFreeClosedVocabularyAggregateEvidenceRequired: true,
    audioCollectionAllowed: false,
    networkEgressAllowed: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...PHYSICAL_CAMERA_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    receivedTargetPackageCount: 0,
    boundCapturePathCount: 0,
    participantCount: 0,
    completedOpticalCellCount: 0,
    completedOpticalObservationCount: 0,
    completedShutterTransitionCycleCount: 0,
    completedIndicatorCellCount: 0,
    completedIndicatorObservationCount: 0,
    completedLifecycleTransitionCycleCount: 0,
    completedNegativeSessionCount: 0,
    completedRenderCellCount: 0,
    completedComprehensionCellCount: 0,
    completedComprehensionTrialCount: 0,
    completedReachVisibilityCellCount: 0,
    completedReachVisibilityTrialCount: 0,
    qualifiedTargetPathStateIds: [],
    qualifiedSurfaceIds: [],
    qualifiedPersonaIds: [],
    selectedCameraEnclosureOrSurfaceIds: [],
    publishedQualificationOrProductClaim: null,
  });
  return plan;
}

export async function parsePhysicalShutterCameraStateExperiencePlanBytes(
  bytes,
  repositoryRoot = root,
) {
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
  await validatePhysicalShutterCameraStateExperiencePlan(plan, repositoryRoot);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parsePhysicalShutterCameraStateExperiencePlanBytes(
      await readFile(absolute),
    );
    console.log(
      `${absolute}: valid blocked ${plan.opticalShutterMatrix.requiredObservationCount}-optical-observation,`
      + ` ${plan.indicatorTruthMatrix.requiredObservationCount}-indicator-observation,`
      + ` ${plan.lifecycleTransitionCampaign.requiredCycleCount}-lifecycle-cycle,`
      + ` ${plan.humanComprehensionPhase.requiredTrialCount}-blocked-comprehension-trial I-046 plan`,
    );
  }
}
