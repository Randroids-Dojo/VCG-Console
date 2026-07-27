import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/enclosure/pi5-integrated-enclosure-reference-build-plan-v1.json",
);
const MAX_BYTES = 384 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const ENCLOSURE_PLAN_FORMAT =
  "vcg-pi5-integrated-enclosure-reference-build-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "prerequisiteGate",
  "specimens",
  "designPackage",
  "stageIds",
  "buildMatrix",
  "safetyScenarioIds",
  "safetyMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "reproductionProtocol",
  "decisionProtocol",
  "authorityBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  [
    "d090-through-d095-d102-d103-owner-selected-enclosure-room-and-idle-boundary",
    "docs/OPEN_QUESTIONS.md",
  ],
  [
    "off-the-shelf-abs-candidate-and-no-selection-boundary",
    "docs/ABS_PROJECT_BOX_CANDIDATE_SCREEN_2026-07-25.md",
  ],
  [
    "household-active-play-enclosure-cable-and-stop-safety-boundary",
    "docs/ACTIVE_PLAY_SAFETY.md",
  ],
  [
    "prototype-product-success-and-latency-boundary",
    "docs/PROTOTYPE_SUCCESS_CRITERIA.md",
  ],
  [
    "primary-room-and-required-eight-by-eight-zone-boundary",
    "benchmarks/room-survey/living-room-play-zone-plan-v1.json",
  ],
  [
    "shared-wide-uvc-1080p60-shutter-and-indicator-boundary",
    "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json",
  ],
  [
    "integrated-fixed-axis-coverage-and-calibration-boundary",
    "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json",
  ],
  [
    "camera-cable-routing-strain-relief-and-recovery-boundary",
    "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json",
  ],
  [
    "enclosed-cooling-thermal-and-acoustic-boundary",
    "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json",
  ],
  [
    "closed-enclosure-wifi-bluetooth-camera-and-controller-boundary",
    "benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json",
  ],
  [
    "physical-shutter-indicator-idle-and-lifecycle-truth-boundary",
    "benchmarks/camera-state/physical-shutter-camera-state-experience-plan-v1.json",
  ],
  [
    "ordinary-fastener-camera-service-and-recalibration-boundary",
    "benchmarks/camera-service/camera-replacement-recalibration-plan-v1.json",
  ],
  [
    "pi-low-power-idle-wake-privacy-and-reliability-boundary",
    "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json",
  ],
  [
    "complete-delivered-pi-cost-and-no-cost-rescue-boundary",
    "benchmarks/system-economics/complete-system-economics-plan-v1.json",
  ],
  [
    "failure-critical-component-substitute-qualification-boundary",
    "benchmarks/failure-critical-substitutes/cross-tier-failure-critical-substitute-plan-v1.json",
  ],
  [
    "pi-safe-shutdown-storage-and-reserve-boundary",
    "benchmarks/shutdown-reserve/pi5-shutdown-reserve-comparison-plan-v1.json",
  ],
];

export const ENCLOSURE_SPECIMEN_IDS = Object.freeze([
  "primary-i192-integrated-prototype",
  "independent-i195-reference-reproduction",
]);

export const ENCLOSURE_STAGE_IDS = Object.freeze([
  "receipt-identity-dimensions-material-and-delivered-cost",
  "measured-component-stack-connector-keepout-and-tolerance-model",
  "editable-cut-template-camera-datum-fixed-axis-jig-and-source-review",
  "one-to-one-paper-cardboard-fit-assembly-order-and-collision-review",
  "cut-edge-deburr-fastener-vent-guard-and-rating-inspection",
  "mounted-assembly-tip-slip-cable-pull-and-strain-relief",
  "shutter-indicator-wake-power-and-ordinary-fastener-service-access",
  "fixed-axis-room-coverage-calibration-floor-contact-and-action",
  "enclosed-thermal-acoustic-power-and-sustained-complete-workload",
  "closed-enclosure-wifi-bluetooth-camera-controller-radio-coexistence",
  "shutdown-idle-wake-disconnect-fault-recovery-and-recalibration",
  "disassembly-reassembly-cost-household-safety-and-independent-review",
]);

export const ENCLOSURE_SAFETY_SCENARIO_IDS = Object.freeze([
  "child-finger-probe-near-vents-openings-controls-and-connectors",
  "child-reach-pull-push-and-control-access",
  "pet-paw-tail-fur-and-body-contact-near-vents-and-base",
  "pet-snag-and-pull-on-every-external-cable",
  "walking-trip-and-cable-loop-interception",
  "forward-rear-left-and-right-tip-loading",
  "surface-slide-under-cable-and-control-load",
  "sharp-edge-burr-swarf-and-cutout-inspection",
  "fan-blade-hot-part-and-electrical-conductor-access",
  "fastener-loosening-small-part-and-choking-hazard-inspection",
  "assembly-disassembly-pinch-shear-and-tool-slip",
  "vent-partial-blockage-and-fan-stall-stop-response",
  "power-hdmi-usb-camera-connector-pull-and-bend",
  "shutter-indicator-wake-and-power-control-reach-without-zone-entry",
  "normal-furniture-door-egress-and-eight-by-eight-zone-preservation",
  "emergency-stop-power-isolation-and-safe-recovery",
]);

export const ENCLOSURE_BLOCKER_CODES = Object.freeze([
  "I192-001-exact-pi-target-image-runtime-complete-bom-and-incumbent-camera-manifest",
  "I192-002-complete-primary-room-survey-eight-by-eight-zone-and-household-safety-result",
  "I192-003-exact-received-box-components-accessories-tools-instruments-and-delivered-cost",
  "I192-004-reviewed-editable-template-tolerance-datum-jig-one-to-one-fit-and-inspection-package",
  "I192-005-reviewed-cut-deburr-fastener-vent-guard-tip-slip-cable-and-strain-relief-protocol",
  "I192-006-complete-camera-qualification-fixed-axis-coverage-calibration-floor-action-and-latency-protocol",
  "I192-007-complete-enclosed-cooling-thermal-acoustic-power-and-sustained-workload-protocol",
  "I192-008-complete-closed-enclosure-wifi-bluetooth-camera-controller-radio-protocol",
  "I192-009-complete-shutter-indicator-idle-wake-shutdown-fault-and-privacy-protocol",
  "I192-010-complete-ordinary-fastener-service-wear-reassembly-and-recalibration-protocol",
  "I192-011-frozen-samples-thresholds-instruments-oracles-stop-rules-ranking-expiry-and-retest-policy",
  "I192-012-construction-electrical-room-camera-fault-photo-and-result-authority",
  "I195-013-frozen-versioned-reference-source-bom-tool-photo-redaction-and-publication-package",
  "I195-014-independent-builder-build-result-review-publication-license-and-support-boundary",
]);

const openKeys = [
  "maximumCompleteDeliveredEnclosureAndIncludedHardwareCostCents",
  "maximumCompleteDeliveredPiReferenceSystemCostCents",
  "maximumExternalLengthWidthHeightMm",
  "maximumCompleteAssemblyMassGrams",
  "minimumStaticTipAngleMilliDegreesByDirection",
  "minimumSlipForceMilliNewtonsByDirection",
  "minimumCableRetentionPullForceMilliNewtonsByConnector",
  "maximumPermanentMountCableJigOrEnclosureDisplacementMicrometers",
  "maximumTemplateCutoutAndFastenerLocationErrorMicrometers",
  "maximumFixedAxisPitchRollYawErrorMilliDegrees",
  "minimumCameraOpticalAndVentGuardClearanceMm",
  "maximumAllowedProbeOpeningAndReachMm",
  "maximumSustainedSocAcceleratorStorageCameraAndSurfaceTemperatureMilliC",
  "maximumThermalThrottleRattleOscillationOrFanFaultEvents",
  "maximumIdleAndActiveWallPowerMilliwatts",
  "maximumRadioThroughputInputLatencyAndRecoveryRegressionPpm",
  "maximumWakeP95AndWorstMilliseconds",
  "maximumAssemblyDisassemblyAndRecalibrationTimeMs",
  "maximumAssistanceDamageDiscomfortOrToolSubstitutionEvents",
  "minimumFastenerConnectorCableMountAndJigWearCycleCount",
  "minimumMeasurementSamplesTrialsSoaksAndFaultCyclesByStageSha256",
  "decisionRankingTieBreakExpiryRetestAndTemplateVersionPolicySha256",
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

function validateSpecimens(specimens) {
  assert.ok(Array.isArray(specimens));
  assert.equal(specimens.length, 2);
  assert.deepEqual(
    specimens.map(({ specimenId }) => specimenId),
    ENCLOSURE_SPECIMEN_IDS,
  );
  const roles = [
    "primary-adjustable-discovery-and-locked-fixed-axis-qualification-build",
    "independently-constructed-fixed-axis-reference-reproduction",
  ];
  const builders = ["first-build-team", "different-builder-with-source-package-only"];
  for (const [index, specimen] of specimens.entries()) {
    exactKeys(
      specimen,
      [
        "specimenId",
        "role",
        "builderIndependence",
        "experimentalPitchAdjustmentAllowedBeforeAxisFreezeOnly",
        "qualifyingEvidenceRequiresLockedFixedPitch",
        "exactReceivedBoxRevisionDimensionsMaterialAndDeliveredCostManifestSha256",
        "exactComputeCameraCoolingPowerStorageCableAndControlManifestSha256",
        "exactMountFastenerFeetVentGuardStrainReliefManifestSha256",
        "exactAssemblyToolBuilderEnvironmentAndSafetyManifestSha256",
        "exactFixedAxisCameraDatumAndJigManifestSha256",
        "receivedInventoriedAndAuthorized",
      ],
      `specimens[${index}]`,
    );
    assert.equal(specimen.role, roles[index]);
    assert.equal(specimen.builderIndependence, builders[index]);
    assert.equal(specimen.experimentalPitchAdjustmentAllowedBeforeAxisFreezeOnly, index === 0);
    assert.equal(specimen.qualifyingEvidenceRequiresLockedFixedPitch, true);
    for (const key of Object.keys(specimen).filter((key) => key.endsWith("Sha256"))) {
      assert.equal(specimen[key], null, `specimens[${index}].${key} must remain open`);
    }
    assert.equal(specimen.receivedInventoriedAndAuthorized, false);
  }
}

export async function validatePi5IntegratedEnclosurePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, ENCLOSURE_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-integrated-enclosure-reference-build-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26T23:59:59.000Z");
  assert.match(plan.qualificationScope, /I-192/u);
  assert.match(plan.qualificationScope, /I-195/u);
  assert.match(plan.claimBoundary, /No enclosure has been selected/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.prerequisiteGate, {
    exactSelectedPiTargetImageRuntimeAndCompleteBomManifestSha256: null,
    exactReceivedBoxComponentAccessoryToolAndInstrumentInventorySha256: null,
    completePrimaryRoomSurveyAndEightByEightZoneResultSha256: null,
    completeSharedWideUvcCameraQualificationResultSha256: null,
    reviewedConstructionElectricalHouseholdAndOperatorSafetyProtocolSha256: null,
    reviewedCutTemplateToleranceDatumJigAndInspectionProtocolSha256: null,
    reviewedThermalAcousticRadioPowerCableServiceAndFaultProtocolSha256: null,
    candidateScreenOrCatalogDimensionsMaySelectOrderOrAuthorizeCutting: false,
    vendorClaimsCadModelsCardboardFitOrOneSuccessfulAssemblyMayQualifyABox: false,
    sharedWideUvcRemainsIncumbentAbsentASeparateValidD043Supersession: true,
    collectionOpened: false,
  });
  validateSpecimens(plan.specimens);

  assert.deepEqual(plan.designPackage, {
    editableSourceDimensionsAndCutTemplateSha256: null,
    oneToOnePrintCalibrationAndScaleCheckSha256: null,
    componentEnclosureKeepoutBendRadiusToleranceStackSha256: null,
    cameraOpticalDatumFixedAxisJigAndAllowedToleranceSha256: null,
    mountFastenerTorqueFeetTipSlipVentGuardAndDeburrSpecificationSha256: null,
    powerHdmiUsbCameraCableRoutingAndStrainReliefSpecificationSha256: null,
    shutterIndicatorWakeRestartShutdownAndServiceAccessSpecificationSha256: null,
    coolingAirflowRadioKeepoutAndInstrumentationSpecificationSha256: null,
    assemblyDisassemblyRecalibrationInspectionAndFaultProcedureSha256: null,
    exactBomDeliveredCostToolListPhotoRedactionAndPublicationPackageSha256: null,
    undocumentedDimensionsToolsShimsOralInstructionsOrHiddenSetupAllowed: false,
    modifiedEnclosureMayRetainManufacturerIngressOrSafetyRatingWithoutEvidence: false,
  });

  assert.deepEqual(plan.stageIds, ENCLOSURE_STAGE_IDS);
  assert.deepEqual(plan.buildMatrix, {
    specimenIds: ENCLOSURE_SPECIMEN_IDS,
    stageCountPerSpecimen: 12,
    requiredSpecimenStageCellCount: 24,
    everySpecimenMustCompleteEveryStage: true,
    sameFrozenDesignPackageBomAxisGatesOraclesAndResultSchemaRequired: true,
    primaryAndReproductionEvidenceLedgersMustRemainSeparate: true,
    failedInvalidStoppedRetriedReworkedAndPreRepairEvidenceMustRemainVisible: true,
    firstBuildSecondBuildStageUpstreamPlanBestCaseOrAggregateMayRescueFailure: false,
  });
  assert.deepEqual(plan.safetyScenarioIds, ENCLOSURE_SAFETY_SCENARIO_IDS);
  assert.deepEqual(plan.safetyMatrix, {
    specimenCount: 2,
    scenarioCountPerSpecimen: 16,
    requiredSpecimenScenarioCellCount: 32,
    independentPhysicalGroundTruthAndPredefinedStopRulesRequired: true,
    absenceOfObservedInjuryMayEstablishSafety: false,
    successfulOperationSignalQualityOrLowCostMayRescueSafetyFailure: false,
  });

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: [
      "received-identities-revisions-dimensions-mass-material-and-delivered-cost",
      "source-template-scale-cutout-datum-jig-and-tolerance-errors",
      "component-mount-fastener-boss-rib-connector-keepout-and-bend-clearance",
      "edge-burr-swarf-opening-guard-probe-and-access-inspection",
      "center-of-gravity-tip-slip-cable-pull-strain-relief-and-displacement",
      "shutter-indicator-wake-power-port-control-and-service-access",
      "fixed-axis-pitch-roll-yaw-stability-room-coverage-calibration-and-floor-error",
      "camera-frame-integrity-pose-action-accuracy-and-exposure-to-game-api-latency",
      "soc-accelerator-storage-camera-surface-temperature-power-and-acoustics",
      "wifi-bluetooth-camera-controller-throughput-latency-drop-and-recovery",
      "shutdown-idle-wake-write-privacy-disconnect-fault-and-recovery",
      "disassembly-reassembly-fastener-connector-cable-mount-wear-and-recalibration",
      "assembly-service-tool-time-assistance-damage-discomfort-and-safety",
      "complete-bom-tools-consumables-shipping-tax-rework-and-replacement-cost",
      "invalid-stopped-retried-reworked-adverse-and-pre-repair-failure-ledger",
    ],
    independentDimensionalOpticalElectricalThermalAcousticRadioSafetyCostAndServiceOraclesRequired:
      true,
    catalogCadPreviewHostTelemetrySelfReportOrSuccessfulBootMaySubstitutePhysicalMeasurement:
      false,
    everyAttemptAndPreRepairFirstFailureMustRemainVisible: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    maximumMissingRequiredSpecimenStageCells: 0,
    maximumMissingRequiredSpecimenSafetyCells: 0,
    maximumUnmeasuredInvalidOrStoppedCellsCountedAsPassing: 0,
    maximumBurrSharpEdgeLooseSwarfOrUnsecuredFastenerFindings: 0,
    maximumAccessibleMovingHotOrConductiveHazards: 0,
    maximumUnstrainRelievedRequiredExternalCables: 0,
    maximumTipSlipPetSnagTripPinchEgressOrUnsafeZoneFailures: 0,
    maximumShutterIndicatorWakePowerPortVentGuardOrServiceAccessFailures: 0,
    maximumCameraDropDisconnectRadioControllerRecoveryOrPrivacyFailures: 0,
    requiredCaptureWidthPixels: 1920,
    requiredCaptureHeightPixels: 1080,
    requiredSustainedCaptureFramesPerSecond: 60,
    maximumExposureToGameApiP95Microseconds: 120000,
    minimumRequiredZoneWidthMm: 2438.4,
    minimumRequiredZoneDepthMm: 2438.4,
    maximumOneMeterAcousticsDba: 35,
    maximumEndToEndCameraServiceDurationMs: 300000,
    minimumValidCompleteDisassemblyReassemblyRecalibrationAttemptsPerSpecimen: 20,
    minimumIndependentReproductionBuilders: 1,
    minimumCompleteIndependentReproductions: 1,
    exactlyOneLockedIntegratedFixedPitchMustQualify: true,
    manualOrMotorizedPitchAdjustmentAllowedInQualifiedReferenceBuild: false,
    physicalOpticalShutterTruthfulCaptureIndicatorAndVisibleWakeFallbackRequired: true,
    ordinaryReversibleFastenersAndStandardCameraConnectorRequiredWherePractical: true,
    allOpenThresholdsProtocolsSamplesAndStopRulesMustBeFrozenBeforePhysicalWork: true,
    firstBuildSecondBuildUpstreamResultCostOrAggregateMayRescueFailure: false,
  });

  exactKeys(plan.openAcceptance, openKeys, "openAcceptance");
  for (const key of openKeys) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }

  assert.deepEqual(plan.reproductionProtocol, {
    primaryCompleteResultSha256: null,
    frozenReferenceSourcePackageSha256: null,
    independentBuilderAdmissionAndNoPriorHiddenSetupAttestationSha256: null,
    independentReproductionCompleteResultSha256: null,
    sameExactBoxBomSourceTemplateFixedAxisAndAcceptanceGatesRequired: true,
    differentBuilderUsingPublishedCandidatePackageOnlyRequired: true,
    oralCorrectionsUndocumentedShimsPreCutPartsOrFirstBuildTeamInterventionAllowed: false,
    reproductionFailureMayBeRepairedWithoutVersioningAndRestartingAffectedEvidence: false,
    firstBuildPassMayRescueReproductionFailure: false,
    referencePackageMayPublishBeforeBothCompleteResultsPassIndependentReview: false,
  });
  assert.deepEqual(plan.decisionProtocol, {
    completePrimaryBuildResultSha256: null,
    selectedFixedIntegratedPitchMilliDegrees: null,
    completeIndependentReproductionResultSha256: null,
    independentSafetyTechnicalCostAndPublicationReviewSha256: null,
    selectedExactBoxAndReferenceBuildDisposition: null,
    supersedingDecisionId: null,
    primaryBuildPassAutomaticallySelectsBoxAxisBomOrPublication: false,
    reproductionPassAutomaticallyCreatesProductWarrantyComplianceOrSupportClaim: false,
    lowerCostSmallerSizeBetterThermalsOrEasierAssemblyMayRescueAnyFixedFailure: false,
    selectionAndPublicationRequireFrozenCompleteEvidenceAndSeparateOwnerDecision: true,
  });
  assert.deepEqual(plan.authorityBoundary, {
    exactConstructionCuttingDrillingDeburringFasteningAndInspectionProtocolSha256: null,
    exactElectricalPowerThermalRadioCameraFaultAndRecoveryProtocolSha256: null,
    exactRoomParticipantPhotoDataRetentionAndIncidentProtocolSha256: null,
    exactIndependentBuildPublicationLicenseSupportAndExpiryProtocolSha256: null,
    purchaseReturnVendorContactOrDeliveredQuoteTransactionAuthorized: false,
    cuttingDrillingHeatingAdhesiveElectricalOrMechanicalConstructionAuthorized: false,
    devicePowerCameraCaptureRadioFaultThermalSoakOrDestructiveOperationAuthorized: false,
    roomAccessHouseholdParticipantChildPetOrHumanFactorsOperationAuthorized: false,
    photoVideoAudioRawTelemetryOrIdentifyingEvidenceCollectionAuthorized: false,
    boxCameraCoolingPowerPartAxisBomOrBuildSelectionAuthorized: false,
    referencePackagePublicationCompatibilityWarrantyComplianceOrSupportClaimAuthorized: false,
  });
  assert.deepEqual(plan.dataPolicy, {
    opaqueSpecimenBuilderSessionStageScenarioTrialFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsDimensionsMetricsCostsAndRedactedCategoriesRequired: true,
    rawRoomFacesBodiesChildrenPetsPortraitsAudioVideoOrCameraFramesAllowed: false,
    namesAddressesReceiptsOrdersPaymentTaxSellerSupportOrBuilderIdentifiersAllowed: false,
    serialsMacAddressesWifiNamesCredentialsHostnamesUsernamesPathsOrEnvironmentValuesAllowed: false,
    freeTextFailureToolElectricalThermalRadioServiceOrResultLogsAllowed: false,
    buildPhotosRequireSeparateAuthorityRedactionNoPeopleNoHomeIdentityAndMetadataRemoval: true,
    failedInvalidStoppedRetriedReworkedAdverseAndPreRepairEvidenceMustRemainVisible: true,
  });
  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, ENCLOSURE_BLOCKER_CODES);
  assert.equal(plan.result, null);
  return plan;
}

export async function parsePi5IntegratedEnclosurePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "Pi 5 integrated enclosure plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validatePi5IntegratedEnclosurePlan(plan, repositoryRoot);
}

export async function readPi5IntegratedEnclosurePlan(path = trackedPath) {
  return parsePi5IntegratedEnclosurePlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readPi5IntegratedEnclosurePlan();
  console.log(
    `Pi 5 integrated enclosure plan valid: ${plan.buildMatrix.requiredSpecimenStageCellCount} specimen-stage cells, ${plan.safetyMatrix.requiredSpecimenScenarioCellCount} safety cells, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
