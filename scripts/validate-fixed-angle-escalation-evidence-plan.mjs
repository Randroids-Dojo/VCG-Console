import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-angle/fixed-angle-escalation-evidence-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const FIXED_ANGLE_ESCALATION_FORMAT =
  "vcg-fixed-angle-escalation-evidence-plan/v1";
export const ESCALATION_CANDIDATE_IDS = Object.freeze([
  "dynamic-local-software-auto-framing",
  "bounded-locking-manual-tilt",
  "motorized-aim-last-resort",
]);
export const ESCALATION_PERSONA_CLASSES = Object.freeze([
  "school-age-child-standing",
  "adult-standing",
  "seated-or-limited-range-adult",
  "low-vision-adult",
  "color-vision-deficiency-adult",
]);
export const ESCALATION_BLOCKERS = Object.freeze([
  "fae-001-complete-admissible-fixed-baseline-failure",
  "fae-002-closed-failure-ledger-and-retest-policy",
  "fae-003-exact-local-software-auto-framing-boundary",
  "fae-004-bounded-locking-manual-mechanism",
  "fae-005-motorized-last-resort-admission",
  "fae-006-exact-candidates-and-common-comparator",
  "fae-007-pre-result-functional-gates",
  "fae-008-privacy-disclosure-and-capture-authority",
  "fae-009-manual-reach-and-accessibility",
  "fae-010-motor-pinch-obstruction-and-unexpected-motion",
  "fae-011-noise-power-and-thermal-gates",
  "fae-012-thickness-mass-cost-and-manufacturing-evidence",
  "fae-013-reliability-update-and-service-protocol",
  "fae-014-participants-data-and-publication",
  "fae-015-pre-result-decision-rule",
  "fae-016-superseding-decision-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "baselineContract",
  "authorityBoundary", "candidateMechanisms", "fixedFailureImport",
  "remediationMatrix", "burdenEvidenceMatrix", "lifecycleFaultMatrix",
  "humanUseMatrix", "measurements", "fixedAcceptance", "openAcceptance",
  "decisionPolicy", "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["campaign-contract", "docs/FIXED_ANGLE_ESCALATION_EVIDENCE_CAMPAIGN_2026-07-26.md"],
  ["owner-question-ledger", "docs/OWNER_QUESTIONS_FIXED_ANGLE_ESCALATION_2026-07-26.md"],
  ["fixed-angle-product-decisions", "docs/DECISIONS.md"],
  ["investigation-acceptance-boundary", "docs/INVESTIGATIONS.md"],
  ["camera-geometry-campaign-contract", "docs/CROSS_TIER_CAMERA_GEOMETRY_CAMPAIGN_2026-07-25.md"],
  ["camera-geometry-baseline-plan", "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json"],
  ["shared-camera-qualification-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["physical-camera-state-boundary", "benchmarks/camera-state/physical-shutter-camera-state-experience-plan-v1.json"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["player-persona-boundary", "docs/PLAYER_PERSONAS.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["camera-cable-service-boundary", "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"],
  ["idle-power-boundary", "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json"],
];
const candidateMechanisms = [
  {
    mechanismId: "fixed-ultra-wide-axis-baseline",
    category: "fixed-baseline",
    physicalAimMechanism: "none",
    cropBehavior: "bounded-calibration-crop-only",
    allowedByD092: true,
    requiresSupersedingDecision: false,
    lastResort: false,
    exactImplementationSha256: null,
    exactControlPlaneSha256: null,
    exactBomAndServiceProtocolSha256: null,
    operationAuthorized: false,
    eligible: false,
    selected: false,
  },
  {
    mechanismId: ESCALATION_CANDIDATE_IDS[0],
    category: "software-escalation-candidate",
    physicalAimMechanism: "none",
    cropBehavior: "dynamic-local-auto-framing",
    allowedByD092: false,
    requiresSupersedingDecision: true,
    lastResort: false,
    exactImplementationSha256: null,
    exactControlPlaneSha256: null,
    exactBomAndServiceProtocolSha256: null,
    operationAuthorized: false,
    eligible: false,
    selected: false,
  },
  {
    mechanismId: ESCALATION_CANDIDATE_IDS[1],
    category: "manual-mechanical-escalation-candidate",
    physicalAimMechanism: "bounded-locking-manual-tilt",
    cropBehavior: "bounded-calibration-crop-only",
    allowedByD092: false,
    requiresSupersedingDecision: true,
    lastResort: false,
    exactImplementationSha256: null,
    exactControlPlaneSha256: null,
    exactBomAndServiceProtocolSha256: null,
    operationAuthorized: false,
    eligible: false,
    selected: false,
  },
  {
    mechanismId: ESCALATION_CANDIDATE_IDS[2],
    category: "motorized-mechanical-escalation-candidate",
    physicalAimMechanism: "motorized-aim",
    cropBehavior: "bounded-calibration-crop-only",
    allowedByD092: false,
    requiresSupersedingDecision: true,
    lastResort: true,
    exactImplementationSha256: null,
    exactControlPlaneSha256: null,
    exactBomAndServiceProtocolSha256: null,
    operationAuthorized: false,
    eligible: false,
    selected: false,
  },
];
const zonePointIds = [
  "center", "front-left-edge", "front-right-edge", "rear-left-edge", "rear-right-edge",
];
const motionIds = [
  "neutral-full-body-visibility", "jump", "duck", "dodge-left", "dodge-right",
];
const burdenDomainIds = [
  "fixed-failure-coverage-repair",
  "capture-and-privacy-boundary",
  "aim-crop-disclosure-and-consent",
  "security-control-plane-and-locality",
  "installation-and-supported-placement",
  "calibration-and-change-invalidation",
  "ordinary-user-reach-and-force",
  "accessibility-and-assistance",
  "stale-position-crop-and-state-detection",
  "delivered-bom-and-lifecycle-cost",
  "acoustic-event-and-sustained-noise",
  "idle-active-peak-and-recovery-power",
  "thermal-rise-and-cooling-interaction",
  "enclosure-thickness-and-volume",
  "mass-center-of-gravity-and-stability",
  "part-fastener-cable-and-connector-count",
  "manufacturing-assembly-yield-and-tooling",
  "durability-wear-jam-drift-and-vibration",
  "reliability-failure-rate-and-worst-case",
  "serviceability-and-diagnostic-boundary",
  "repair-replacement-and-recalibration",
  "software-firmware-update-and-rollback",
  "warranty-support-and-field-incident",
  "end-of-life-disassembly-and-recycling",
];
const transitionIds = [
  "cold-start-to-calibration-ready",
  "calibration-to-active-framing",
  "player-exit-to-no-tracking",
  "player-change-to-reframed",
  "placement-change-to-invalidated",
  "idle-timeout-to-released",
  "suspend-to-resume-awaiting-explicit-start",
  "capture-owner-crash-to-fail-closed",
  "camera-disconnect-to-explicit-recovery",
  "power-cut-to-stationary-safe-recovery",
];
const faultIds = [
  "aim-or-crop-state-corrupt",
  "sensor-or-position-truth-disagrees",
  "control-input-stuck-or-replayed",
  "adjustment-obstruction-or-jam",
  "cable-pull-or-connector-interruption",
  "calibration-state-stale",
  "activity-indicator-or-shutter-contradiction",
  "update-or-rollback-interruption",
  "network-unavailable-or-blocked",
  "repeated-recovery-wear-or-drift",
];
const humanTaskIds = [
  "understand-framing-capture-and-privacy-state",
  "complete-initial-calibration",
  "obtain-usable-supported-framing",
  "recover-after-placement-or-player-change",
  "stop-and-revoke-capture",
  "recover-a-declared-fault-with-allowed-action",
];
const measurementIds = [
  "frozen-fixed-failure-cell-identity-and-original-disposition",
  "head-feet-zone-edge-and-floor-margin",
  "horizontal-vertical-field-of-view-distortion-and-crop-loss",
  "per-cell-action-precision-recall-and-latency",
  "calibration-recalibration-change-detection-and-recovery-time",
  "capture-stream-indicator-shutter-aim-crop-and-position-truth",
  "unexpected-access-restart-aim-crop-motion-and-network-egress",
  "manual-range-detent-lock-force-time-wear-jam-and-drift",
  "motor-obstruction-pinch-stall-runaway-force-and-emergency-stop",
  "event-sustained-and-worst-case-acoustic-level",
  "idle-active-peak-fault-and-recovery-power",
  "thermal-rise-cooling-interaction-and-throttle-state",
  "enclosure-thickness-volume-mass-center-of-gravity-and-stability",
  "parts-fasteners-cables-connectors-tooling-assembly-yield-and-service",
  "dated-delivered-bom-warranty-repair-and-lifecycle-cost-range",
  "cycle-failure-wear-drift-recovery-and-replacement-rate",
  "update-rollback-corrupt-state-and-fail-closed-behavior",
  "setup-comprehension-reach-assistance-unsafe-zone-entry-and-discomfort",
  "privacy-comprehension-disclosure-cancel-stop-and-revoke-accuracy",
  "per-candidate-domain-worst-case-uncertainty-invalid-stop-retry-and-incident-ledger",
];
const openAcceptanceKeys = [
  "minimumHeadMarginMm", "minimumFeetMarginMm", "minimumZoneEdgeMarginMm",
  "maximumFloorPlaneErrorMm", "maximumCropLossPpm", "minimumActionPrecisionPpm",
  "minimumActionRecallPpm", "maximumFramingCorrectionLatencyUs",
  "maximumCalibrationOrRecoveryTimeUs", "maximumManualAdjustmentForceMilliNewton",
  "maximumManualAdjustmentTimeUs", "maximumAcousticEventMilliDbA",
  "maximumSustainedAcousticMilliDbA", "maximumIdlePowerMilliWatt",
  "maximumActivePowerMilliWatt", "maximumThermalRiseMilliCelsius",
  "maximumEnclosureThicknessDeltaMicrometers", "maximumMassDeltaMilligrams",
  "maximumDeliveredBomCostDeltaCents", "maximumReliabilityFailureRatePpm",
  "minimumAdjustmentOrMotionCycleCount", "maximumUnsafeReachAssistanceOrDiscomfortEventsPerCell",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
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
    assert.equal(binding.role, role, `sourceBindings[${index}].role drifted`);
    assert.equal(binding.path, path, `sourceBindings[${index}].path drifted`);
    assert.match(binding.sha256, SHA256, `sourceBindings[${index}].sha256 is invalid`);
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

export async function validateFixedAngleEscalationEvidencePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, FIXED_ANGLE_ESCALATION_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "fixed-angle-escalation-evidence-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-047"]);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /D-092 remains unchanged/u);
  assert.match(plan.claimBoundary, /No fixed pitch has failed or qualified/u);
  assert.match(plan.claimBoundary, /No mechanism selection/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.baselineContract, {
    decisionId: "D-092",
    baselineMechanismId: "fixed-ultra-wide-axis-baseline",
    integratedApplianceOnly: true,
    adjustablePrototypeIsProductionFeature: false,
    automaticRoomAndFloorCalibrationRequired: true,
    boundedCalibrationCropAllowed: true,
    manualOrMotorizedTiltAllowed: false,
    gamesMaySpecialCaseMechanismOrPackagingTier: false,
    oneCompleteQualifiedFixedPitchKeepsEscalationIneligible: true,
    campaignMaySupersedeDecision: false,
  });

  exactKeys(plan.authorityBoundary, [
    "completedCameraGeometryResultSha256", "fixedPlacementFailureLedgerSha256",
    "exactComparatorConfigurationSha256", "softwareAutoFramingImplementationAndControlPlaneSha256",
    "manualTiltDesignBomAndServiceProtocolSha256", "motorizedAimDesignBomControlAndSafetyProtocolSha256",
    "commonRoomTargetCameraEnclosureAndScheduleSha256", "independentOpticalFloorActionAndMechanismGroundTruthSha256",
    "privacySecurityAndCaptureAuthorityProtocolSha256", "lifecycleFaultReliabilityAndStopProtocolSha256",
    "costAcousticPowerThermalThicknessAndManufacturingProtocolSha256",
    "participantConsentAssentAccessibilityAndSafetyProtocolSha256",
    "dataHandlingRetentionDeletionAndIncidentProtocolSha256", "roomCameraOrParticipantWorkAuthorized",
    "prototypeConstructionFabricationOrModificationAuthorized",
    "softwareAutoFramingImplementationOrOperationAuthorized",
    "manualOrMotorizedMechanismImplementationOrOperationAuthorized",
    "purchaseBomSetupGuidanceOrProductMutationAuthorized",
    "resultPublicationQualificationOrProductClaimAuthorized", "supersedingDecisionAuthorized",
  ], "authorityBoundary");
  for (const [key, value] of Object.entries(plan.authorityBoundary)) {
    assert.equal(value, key.endsWith("Sha256") ? null : false, `authorityBoundary.${key} must remain blocked`);
  }
  assert.deepEqual(plan.candidateMechanisms, candidateMechanisms);

  assert.deepEqual(plan.fixedFailureImport, {
    requiredBaselineCampaignId: "cross-tier-camera-placement-geometry-v1",
    completedResultArtifactSha256: null,
    receivedCameraAndEnclosureIdentitySha256: null,
    integratedPrototypeConfigurationSha256: null,
    roomAndParticipantScheduleSha256: null,
    closedFailureCellLedgerSha256: null,
    qualifiedFixedPitchCount: null,
    failedGeometricScreenCellCount: null,
    failedBlockingCellCount: null,
    stoppedInvalidAndNotRunCellCount: null,
    everyScheduledCellAndAttemptPreserved: false,
    independentOpticalFloorAndActionGroundTruthPreserved: false,
    nullIncompleteInvalidOrSelectivelyRetriedEvidenceMayDeclareFailure: false,
    alternativeMayExecuteBeforeCompleteZeroQualifiedPitchProof: false,
    externalCameraSuccessMayDeclareIntegratedFixedPlacementAdequateOrFailed: false,
  });

  assert.deepEqual(plan.remediationMatrix, {
    candidateMechanismIds: [...ESCALATION_CANDIDATE_IDS],
    blockingPersonaClasses: ["school-age-child-standing", "adult-standing"],
    zonePointIds,
    motionIds,
    blockingCellsPerCandidateConfiguration: 50,
    validTrialsPerCell: 20,
    frozenFixedFailureConfigurationCount: null,
    requiredCandidateConfigurationCount: null,
    requiredBlockingCellCount: null,
    requiredBlockingTrialCount: null,
    exactCandidateSettingLedgerSha256: null,
    sameFrozenFailureLedgerAndCommonComparatorRequired: true,
    everyFailedStoppedInvalidRetriedAndNotRunAttemptRemainsVisible: true,
    oneMechanismRoomPersonaZoneMotionRetryOrAggregateMayRescueAnother: false,
  });
  assert.equal(
    plan.remediationMatrix.blockingPersonaClasses.length
      * zonePointIds.length * motionIds.length,
    plan.remediationMatrix.blockingCellsPerCandidateConfiguration,
  );

  assert.deepEqual(plan.burdenEvidenceMatrix, {
    candidateMechanismIds: [...ESCALATION_CANDIDATE_IDS],
    evidenceDomainIds: burdenDomainIds,
    requiredCandidateDomainCellCount: 72,
    independentMethodSourceUncertaintyWorstCaseAndDispositionRequiredPerCell: true,
    weightedScoreMeanOrPassingDomainMayRescueFailedMissingOrUnknownDomain: false,
  });
  assert.equal(
    ESCALATION_CANDIDATE_IDS.length * burdenDomainIds.length,
    plan.burdenEvidenceMatrix.requiredCandidateDomainCellCount,
  );

  assert.deepEqual(plan.lifecycleFaultMatrix, {
    candidateMechanismIds: [...ESCALATION_CANDIDATE_IDS],
    transitionIds,
    faultIds,
    validCyclesPerCandidateTransitionFaultCell: 20,
    requiredCellCount: 300,
    requiredCycleCount: 6000,
    notApplicableRequiresPreRegisteredIndependentProof: true,
    automaticCaptureRestartUnexpectedAimOrCropAndLaterRecoveryAreFailures: true,
    oneCandidateTransitionFaultCycleRetryOrLaterSuccessMayRescueAnother: false,
  });
  assert.equal(
    ESCALATION_CANDIDATE_IDS.length * transitionIds.length * faultIds.length,
    plan.lifecycleFaultMatrix.requiredCellCount,
  );
  assert.equal(
    plan.lifecycleFaultMatrix.requiredCellCount
      * plan.lifecycleFaultMatrix.validCyclesPerCandidateTransitionFaultCell,
    plan.lifecycleFaultMatrix.requiredCycleCount,
  );

  assert.deepEqual(plan.humanUseMatrix, {
    status: "blocked",
    candidateMechanismIds: [...ESCALATION_CANDIDATE_IDS],
    personaClasses: [...ESCALATION_PERSONA_CLASSES],
    taskIds: humanTaskIds,
    validTrialsPerCell: 20,
    requiredCellCount: 90,
    requiredTrialCount: 1800,
    uncoachedIndependentTaskPrivacySafetyAssistanceAndDiscomfortGroundTruthRequired: true,
    taskCompletionMayHideFalsePrivacyBeliefAssistanceUnsafeReachOrDiscomfort: false,
    oneCandidatePersonaTaskTrialOrAggregateMayRescueAnother: false,
  });
  assert.equal(
    ESCALATION_CANDIDATE_IDS.length * ESCALATION_PERSONA_CLASSES.length * humanTaskIds.length,
    plan.humanUseMatrix.requiredCellCount,
  );
  assert.equal(
    plan.humanUseMatrix.requiredCellCount * plan.humanUseMatrix.validTrialsPerCell,
    plan.humanUseMatrix.requiredTrialCount,
  );

  assert.deepEqual(plan.measurements, {
    requiredMeasurementIds: measurementIds,
    independentOpticalFloorActionMechanismPrivacyAndSafetyGroundTruthRequired: true,
    candidateOutputControlStateCalibrationOrAggregateMaySelfLabelSuccess: false,
    vendorClaimCadMeanBestCaseOnePersonaOrLaterRecoveryMaySubstituteEvidence: false,
    perCandidateConfigurationPersonaZoneMotionDomainTransitionFaultCycleAndWorstCaseRequired: true,
  });
  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidTrialsPerRemediationCellIfAuthorized: 20,
    minimumValidLifecycleCyclesPerCandidateTransitionFaultCellIfAuthorized: 20,
    minimumValidHumanTrialsPerCellIfAuthorized: 20,
    everyFrozenFixedFailureCellMustBeRepairedByAnEligibleCandidate: true,
    everyBurdenEvidenceDomainMustPassForAnEligibleCandidate: true,
    maximumSafetyPrivacyCaptureAuthorityOrSecurityFailures: 0,
    maximumUndisclosedAimCropPositionOrStateChanges: 0,
    maximumAutomaticCaptureRestartsAfterIdleSuspendCrashDisconnectOrPowerCut: 0,
    maximumNetworkEgressOrRemoteControlDependencies: 0,
    maximumMotorPinchEntrapmentRunawayOrUnsafeMotionEvents: 0,
    maximumSilentlyDiscardedFailedStoppedInvalidRetriedOrNotRunEvidence: 0,
    motorizedAdmissionRequiresCompleteRejectedSoftwareAndManualCandidates: true,
    incompleteUnknownNotRunInconvenientOrHigherCostNonmotorizedEvidenceMayAdmitMotorized: false,
    aggregateWeightedScoreMeanOrCrossCandidateRescueAllowed: false,
    allOpenGatesMustBeFrozenBeforeAnyAlternativeOperation: true,
  });
  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `openAcceptance.${key} must remain null before operation`);
  }
  assert.deepEqual(plan.decisionPolicy, {
    fixedBaselineRemainsDefaultUnlessCompleteEvidenceProvesZeroQualifiedPitches: true,
    oneQualifiedFixedPitchMakesAlternativeComparisonIneligible: true,
    sameFrozenFailureLedgerCommonComparatorAndFixedGatesRequired: true,
    candidateWithFailedMissingUnknownStoppedInvalidOrNotRunFixedDomainIsIneligible: true,
    motorizedCandidateMayBeEligibleOnlyAfterSoftwareAndManualAreCompleteAndRejected: true,
    eligibleNonmotorizedCandidatesReportedAsUnweightedParetoSetWithWorstCases: true,
    campaignMaySelectMechanismAuthorizePurchaseMutateBomOrSetupGuidance: false,
    ownerSupersedingDecisionMustCiteCompleteEvidenceAndRejectedSmallerRemedies: true,
    postResultThresholdWeightCandidateOrEvidenceDeletionAllowed: false,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawRoomCameraVideoImagePortraitOrAudioAllowedInRepositoryOrRelease: false,
    participantNamesFacesVoicesExactAgesAddressesAccessibilityNotesOrStableIdentifiersAllowed: false,
    deviceSerialsPathsCredentialsSecretsProviderMessagesOrUnredactedLogsAllowed: false,
    freeTextResultEvidenceAllowed: false,
    temporaryFrameOrDiagnosticCaptureRequiresSeparateAuthoritySecurityConsentAndVerifiedDeletion: true,
    pathFreeClosedVocabularyAggregateAndDigestEvidenceRequired: true,
    networkEgressOrRemoteInferenceAllowed: false,
    failedStoppedInvalidRetriedNotRunAndAdverseEvidenceMustRemainVisible: true,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...ESCALATION_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: null,
    boundBaselineResultSha256: null,
    qualifiedFixedPitchCount: null,
    frozenFixedFailureConfigurationCount: 0,
    boundAlternativeCandidateCount: 0,
    completedRemediationCellCount: 0,
    completedRemediationTrialCount: 0,
    completedBurdenDomainCellCount: 0,
    completedLifecycleFaultCellCount: 0,
    completedLifecycleFaultCycleCount: 0,
    completedHumanUseCellCount: 0,
    completedHumanUseTrialCount: 0,
    eligibleMechanismIds: [],
    rejectedMechanismIds: [],
    paretoMechanismIds: [],
    selectedMechanismId: null,
    supersedingDecisionId: null,
    purchaseAuthorized: false,
    bomOrSetupGuidanceChanged: false,
    d092Superseded: false,
    publishedQualificationComparisonOrProductClaim: false,
  });

  return {
    status: plan.status,
    sourceBindingCount: plan.sourceBindings.length,
    candidateCount: plan.candidateMechanisms.length,
    burdenCellCount: plan.burdenEvidenceMatrix.requiredCandidateDomainCellCount,
    lifecycleCycleCount: plan.lifecycleFaultMatrix.requiredCycleCount,
    humanTrialCount: plan.humanUseMatrix.requiredTrialCount,
  };
}

export async function loadFixedAngleEscalationEvidencePlan(path = trackedPath) {
  const bytes = await readFile(path);
  assert.ok(bytes.byteLength <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    throw new Error("plan must be valid JSON", { cause: error });
  }
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical two-space JSON with trailing LF");
  return plan;
}

export async function validateTrackedFixedAngleEscalationEvidencePlan(path = trackedPath) {
  const plan = await loadFixedAngleEscalationEvidencePlan(path);
  return validateFixedAngleEscalationEvidencePlan(plan, root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await validateTrackedFixedAngleEscalationEvidencePlan();
  console.log(
    `${trackedPath}: valid ${summary.status} ${summary.candidateCount}-candidate, `
      + `${summary.burdenCellCount}-burden-cell, ${summary.lifecycleCycleCount}-lifecycle-cycle, `
      + `${summary.humanTrialCount}-blocked-human-trial I-047 plan`,
  );
}
