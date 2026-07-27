import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/csi-fallback/pi5-camera-module-3-wide-csi-fallback-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CSI_FALLBACK_FORMAT = "vcg-pi5-csi-fallback-comparison-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "triggerPolicy",
  "cameraPaths",
  "attributionPolicy",
  "phaseIds",
  "comparisonMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "decisionProtocol",
  "authorityBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  ["d043-uvc-incumbent-and-q013-conditional-csi-boundary", "docs/OPEN_QUESTIONS.md"],
  ["camera-module-3-wide-source-capability-note", "docs/RASPBERRY_PI_AI_HAT.md"],
  [
    "shared-wide-uvc-incumbent-qualification-boundary",
    "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json",
  ],
  [
    "usb-and-conditional-csi-cabling-boundary",
    "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json",
  ],
  [
    "integrated-camera-placement-and-coverage-boundary",
    "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json",
  ],
  [
    "lens-distortion-and-inference-input-boundary",
    "benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json",
  ],
  [
    "capture-controls-lighting-and-frame-quality-boundary",
    "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
  ],
  [
    "center-quarter-edge-pose-accuracy-boundary",
    "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json",
  ],
  [
    "real-room-action-and-negative-session-boundary",
    "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json",
  ],
  [
    "pi5-complete-product-cost-and-latency-contract",
    "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json",
  ],
];

export const CSI_CAMERA_PATHS = Object.freeze([
  ["shared-wide-uvc-incumbent", "usb-uvc", "required-incumbent-control"],
  ["camera-module-3-wide-csi", "pi-csi", "conditional-fallback-candidate"],
]);

export const CSI_PHASE_IDS = Object.freeze([
  "receipt-identity-install-and-mode-enumeration",
  "calibrated-coverage-distortion-crop-and-floor-geometry",
  "exposure-to-memory-latency-jitter-buffering-and-timestamps",
  "capture-controls-lighting-image-quality-and-motion-blur",
  "pose-edge-action-accuracy-and-exposure-to-action-latency",
  "sustained-complete-workload-power-thermal-radio-and-frame-integrity",
  "boot-update-reconnect-fault-recovery-and-calibration-invalidation",
  "enclosure-privacy-service-maintenance-cost-and-independent-review",
]);

const upstreamCoverageIds = [
  "shared-camera-qualification",
  "integrated-camera-geometry",
  "lens-distortion-rectification",
  "capture-policy-and-lighting",
  "center-quarter-edge-pose",
  "real-room-one-player-action-and-negative-sessions",
  "d110-camera-to-action-latency",
  "complete-pi5-product-workload",
];

export const CSI_BLOCKER_CODES = Object.freeze([
  "I033-001-valid-shared-uvc-failure-result-and-exact-failed-gate",
  "I033-002-owner-reviewed-q013-fallback-opening-and-d043-boundary",
  "I033-003-exact-final-pi5-image-workload-enclosure-and-camera-manifests",
  "I033-004-exact-received-uvc-and-camera-module-3-wide-units-lots-and-accessories",
  "I034-005-matched-schedule-exposure-clock-optical-pose-action-and-ground-truth-protocol",
  "I034-006-capture-mode-driver-control-buffer-and-inference-input-authority",
  "I034-007-samples-repetitions-soak-lighting-placements-faults-and-stop-rules",
  "I034-008-material-improvement-latency-jitter-quality-coverage-and-action-thresholds",
  "I034-009-power-thermal-radio-enclosure-privacy-safety-and-recovery-thresholds",
  "I034-010-cost-service-maintenance-supply-attribution-ranking-expiry-and-retest-policy",
  "I034-011-result-data-rights-retention-incident-and-independent-review-policy",
  "I034-012-purchase-installation-operation-selection-and-d043-supersession-authority",
]);

const metricIds = [
  "exact-camera-lens-revision-cable-mode-driver-and-control-disposition",
  "calibrated-horizontal-vertical-diagonal-and-usable-pose-area",
  "distortion-crop-rectification-floor-and-edge-error",
  "exposure-to-first-authoritative-memory-p50-p95-p99-worst-microseconds",
  "capture-period-jitter-buffer-depth-drop-duplicate-corrupt-and-reorder-counts",
  "exposure-gain-white-balance-focus-flicker-blur-color-and-image-quality",
  "core17-coverage-jitter-landmark-error-action-precision-recall-and-recovery",
  "exposure-to-game-api-p50-p95-p99-worst-microseconds",
  "cpu-memory-bandwidth-power-thermal-radio-emi-and-coexistence",
  "boot-update-reconnect-fault-calibration-invalidation-and-replacement",
  "shutter-indicator-disablement-enclosure-cable-service-and-household-safety",
  "delivered-cost-volume-mass-installation-maintenance-and-supply",
  "invalid-stopped-retried-adverse-and-worst-case-ledger",
];

const openKeys = [
  "minimumRepeatedUvcFailureCountAndWindow",
  "minimumReceivedUnitsAndIndependentLotsPerCameraPath",
  "minimumValidTrialsPerPhaseAndUpstreamCoverageCell",
  "minimumSustainedSoakSeconds",
  "minimumMaterialImprovementOnExactFailedGate",
  "maximumGlassToMemoryP95P99AndWorstMicroseconds",
  "maximumCapturePeriodJitterAndBufferDepth",
  "maximumFrameDropDuplicateCorruptAndReorderCounts",
  "minimumCalibratedUsefulPoseAreaAndCoverage",
  "maximumDistortionCropFloorAndEdgeRegression",
  "maximumImageQualityBlurColorAndLightingRegression",
  "maximumPoseActionAccuracyAndRecoveryRegression",
  "maximumPowerThermalRadioAndResourceRegression",
  "maximumBootReconnectFaultAndCalibrationRecoveryTime",
  "maximumDeliveredCostVolumeMassInstallationAndMaintenanceDelta",
  "minimumSupplyWarrantyReturnAndServiceContinuity",
  "decisionRankingTieBreakExpiryRetestAndAttributionPolicySha256",
];

const authorityNullKeys = [
  "exactTriggerTargetCameraDriverModeEnclosureAndWorkloadManifestSha256",
  "opticalGeometryExposureClockPoseActionAndGroundTruthProtocolSha256",
  "sustainedFaultRecoveryCalibrationPrivacyAndSafetyProtocolSha256",
  "costServiceMaintenanceSupplyAttributionAndIndependentReviewProtocolSha256",
  "resultSchemaDataRightsRetentionIncidentAndPublicationProtocolSha256",
];

const authorityFalseKeys = [
  "purchaseReturnOrVendorContactAuthorized",
  "cameraInstallationRibbonRoutingDriverFirmwareOrPersistentCalibrationMutationAuthorized",
  "cameraTargetParticipantOrDestructiveFaultOperationAuthorized",
  "cameraPathSelectionD043SupersessionBomMutationPublicationOrCompatibilityClaimAuthorized",
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
  assert.ok(Array.isArray(bindings));
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
      relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

function validateCameraPaths(plan) {
  assert.equal(plan.cameraPaths.length, 2);
  assert.deepEqual(
    plan.cameraPaths.map(({ cameraPathId, interfaceClass, comparisonRole }) => [
      cameraPathId,
      interfaceClass,
      comparisonRole,
    ]),
    CSI_CAMERA_PATHS,
  );
  for (const [index, cameraPath] of plan.cameraPaths.entries()) {
    exactKeys(
      cameraPath,
      [
        "cameraPathId",
        "interfaceClass",
        "comparisonRole",
        "requiredTargetIds",
        "exactReceivedCameraRevisionLensAndCableManifestSha256",
        "exactDriverFirmwareModeControlAndTimestampManifestSha256",
        "exactIntegratedEnclosurePlacementPrivacyAndPowerManifestSha256",
        "receivedInventoriedAndAuthorized",
      ],
      `cameraPaths[${index}]`,
    );
    assert.deepEqual(cameraPath.requiredTargetIds, ["pi5-lower-cost-reference"]);
    assert.equal(cameraPath.exactReceivedCameraRevisionLensAndCableManifestSha256, null);
    assert.equal(cameraPath.exactDriverFirmwareModeControlAndTimestampManifestSha256, null);
    assert.equal(cameraPath.exactIntegratedEnclosurePlacementPrivacyAndPowerManifestSha256, null);
    assert.equal(cameraPath.receivedInventoriedAndAuthorized, false);
  }
}

export async function validateCsiFallbackComparisonPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CSI_FALLBACK_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(
    plan.campaignId,
    "i033-i034-pi5-camera-module-3-wide-csi-fallback-2026-07-26",
  );
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, [
    "I-033",
    "I-034",
    "Q-013",
    "D-043",
    "D-044",
    "D-045",
    "D-090",
    "D-091",
    "D-092",
    "D-110",
  ]);
  assert.ok(
    typeof plan.claimBoundary === "string" &&
      plan.claimBoundary.length >= 1500 &&
      plan.claimBoundary.includes("cannot open the fallback") &&
      plan.claimBoundary.includes("cannot be attributed to CSI alone") &&
      plan.claimBoundary.includes("No purchase"),
    "claimBoundary is incomplete",
  );
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.triggerPolicy, {
    incumbentCameraPathId: "shared-wide-uvc-incumbent",
    fallbackCameraPathId: "camera-module-3-wide-csi",
    requiredExactUvcFailureResultSha256: null,
    requiredFailedGateId: null,
    requiredFailureReproductionAndRootCauseProtocolSha256: null,
    ownerReviewedFallbackOpeningDecisionId: null,
    validSharedUvcProductFailureRequired: true,
    vendorSpecificationCableConvenienceDriverAvailabilityOrSingleRunMayOpenFallback: false,
    anotherTargetCameraModeCellOrAggregateMayOpenFallback: false,
    fallbackExecutionOpened: false,
  });
  validateCameraPaths(plan);

  assert.deepEqual(plan.attributionPolicy, {
    cameraModule3WideChangesSensorOpticsLensControlsAndInterfaceTogether: true,
    comparisonConclusionClass: "complete-camera-path-difference",
    matchedSensorOpticsLensControlInterfaceAttributionPlanSha256: null,
    pureCsiInterfaceBenefitMayBeClaimedWithoutMatchedControl: false,
    lowerLatencyWiderFieldOrBetterAccuracyMayBeAttributedToCsiAlone: false,
    combinedPathMayBeSelectedWithoutClosingExactTriggerAndAllProductGates: false,
  });
  assert.deepEqual(plan.phaseIds, CSI_PHASE_IDS);

  exactKeys(
    plan.comparisonMatrix,
    [
      "cameraPathIds",
      "phaseIds",
      "requiredUpstreamCoverageIds",
      "cameraPathCount",
      "phaseCount",
      "requiredPhaseCellCount",
      "requiredUpstreamCoverageCount",
      "everyPathRunsEveryPhaseAndApplicableUpstreamCoverage",
      "sameExactTargetImageWorkloadPlacementLightingScheduleAndOraclesRequired",
      "failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible",
      "pathPhaseCoveragePersonaPositionLightingOrAggregateMayRescueFailure",
    ],
    "comparisonMatrix",
  );
  assert.deepEqual(plan.comparisonMatrix.cameraPathIds, CSI_CAMERA_PATHS.map(([id]) => id));
  assert.deepEqual(plan.comparisonMatrix.phaseIds, CSI_PHASE_IDS);
  assert.deepEqual(plan.comparisonMatrix.requiredUpstreamCoverageIds, upstreamCoverageIds);
  assert.equal(plan.comparisonMatrix.cameraPathCount, 2);
  assert.equal(plan.comparisonMatrix.phaseCount, 8);
  assert.equal(plan.comparisonMatrix.requiredPhaseCellCount, 16);
  assert.equal(plan.comparisonMatrix.requiredUpstreamCoverageCount, 8);
  assert.equal(plan.comparisonMatrix.everyPathRunsEveryPhaseAndApplicableUpstreamCoverage, true);
  assert.equal(
    plan.comparisonMatrix.sameExactTargetImageWorkloadPlacementLightingScheduleAndOraclesRequired,
    true,
  );
  assert.equal(
    plan.comparisonMatrix.failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible,
    true,
  );
  assert.equal(
    plan.comparisonMatrix.pathPhaseCoveragePersonaPositionLightingOrAggregateMayRescueFailure,
    false,
  );

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentExposureClockOpticalPoseActionSystemSafetyCostAndServiceOraclesRequired: true,
    captureArrivalVendorUiAdvertisedFovPreviewOrInferenceOnlyTimingMaySubstitute: false,
    everyAttemptAndPreRepairFirstFailureMustRemainVisible: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    maximumValidProductFailures: 0,
    maximumMissingRequiredPhaseCells: 0,
    maximumUnmeasuredOrInvalidTrialsCountedAsPassing: 0,
    maximumPathPhaseCoveragePersonaPositionLightingOrAggregateRescues: 0,
    requiredCaptureWidthPixels: 1920,
    requiredCaptureHeightPixels: 1080,
    requiredSustainedCaptureFramesPerSecond: 60,
    maximumExposureToGameApiP95Microseconds: 120000,
    exactFailedUvcGateMustRemainFailedAndVisible: true,
    csiFallbackMustMateriallyCloseExactTriggerWithoutCreatingAnotherProductFailure: true,
    sameOrStricterProductSafetyPrivacyRecoveryAndActionGatesRequired: true,
    csiEvidenceMayQualifySharedUvcOrAnotherTarget: false,
    pureInterfaceAttributionRequiresMatchedHardwareControl: true,
    physicalOpticalShutterAndTruthfulSoftwareCameraStateRemainRequired: true,
    passingFallbackRequiresSupersedingD043OwnerDecisionBeforeSelection: true,
    allOpenTriggersSamplesThresholdsSchedulesRankingAndRetestRulesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openKeys, "openAcceptance");
  for (const key of openKeys) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }

  assert.deepEqual(plan.decisionProtocol, {
    exactUvcFailureAndTriggerReviewSha256: null,
    sharedUvcComparisonResultSha256: null,
    cameraModule3WideCsiComparisonResultSha256: null,
    completeMatchedComparisonResultSha256: null,
    recommendedCameraPathId: null,
    recommendedDisposition: null,
    d043SupersedingDecisionId: null,
    passingCsiPathAutomaticallyOverridesSharedUvc: false,
    lowerLatencyWiderCoverageLowerCostOrAggregateMayRescueFixedFailure: false,
    selectionMustBeDerivedFromFrozenCompleteEvidenceAndIndependentReview: true,
  });

  exactKeys(
    plan.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(plan.authorityBoundary[key], null, `authorityBoundary.${key} must remain open`);
  }
  for (const key of authorityFalseKeys) assert.equal(plan.authorityBoundary[key], false);

  assert.deepEqual(plan.dataPolicy, {
    opaqueCameraUnitLotSessionPersonaPositionLightingTrialFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawSerialUsbCsiFirmwareDeviceOrStableHardwareIdentifiersAllowed: false,
    sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed: false,
    hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed: false,
    rawFramesAudioVideoProfileSaveControllerPayloadOrParticipantIdentifiersAllowed: false,
    credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed: false,
    freeTextCameraDriverKernelOpticalFaultServiceOrResultLogsAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, CSI_BLOCKER_CODES);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseCsiFallbackComparisonPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "CSI fallback comparison plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateCsiFallbackComparisonPlan(plan, repositoryRoot);
}

export async function readCsiFallbackComparisonPlan(path = trackedPath) {
  return parseCsiFallbackComparisonPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readCsiFallbackComparisonPlan();
  console.log(
    `CSI fallback comparison plan valid: ${plan.comparisonMatrix.requiredPhaseCellCount} path-phase cells, ${plan.comparisonMatrix.requiredUpstreamCoverageCount} upstream coverage contracts, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
