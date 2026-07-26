import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-service/camera-replacement-recalibration-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CAMERA_REPLACEMENT_FORMAT = "vcg-camera-replacement-recalibration-plan/v1";
export const CAMERA_SERVICE_TARGET_IDS = Object.freeze([
  "ordinary-x86-linux-external-camera",
  "steamos-external-camera",
  "raspberry-pi5-ai-hat-integrated-camera",
]);
export const CAMERA_SERVICE_PHASE_IDS = Object.freeze([
  "admit-service-intent-and-release-capture",
  "bind-old-protected-identity-and-calibration-revision",
  "reach-powered-down-or-reviewed-safe-disconnect-state",
  "open-and-reach-ordinary-fastener-service-path",
  "remove-old-camera-cable-and-connector-path",
  "inspect-connector-mount-shutter-indicator-vents-and-restraint",
  "install-exact-eligible-replacement",
  "close-stabilize-and-restore-reviewed-cable-route",
  "boot-or-reenumerate-and-commit-new-protected-identity",
  "transactionally-invalidate-old-floor-calibration-and-body-match",
  "complete-fresh-room-floor-player-calibration-and-capture-verification",
  "verify-ready-shutter-indicator-camera-state-recovery-and-closeout",
]);
export const CAMERA_SERVICE_SCENARIO_IDS = Object.freeze([
  "same-exact-unit-reconnect-after-service",
  "same-qualified-revision-new-unit",
  "approved-substitute-revision",
  "unapproved-or-silent-revision-change",
  "wrong-camera-device",
  "ambiguous-simultaneous-camera-candidates",
  "disconnect-during-protected-identity-commit",
  "disconnect-during-fresh-recalibration",
  "host-reboot-during-identity-binding",
  "power-loss-after-invalidation-before-recalibration",
]);
export const CAMERA_SERVICE_PERSONAS = Object.freeze([
  "adult-standing",
  "seated-or-limited-range-adult",
  "low-vision-adult",
  "color-vision-deficiency-adult",
  "limited-dexterity-adult",
]);
export const CAMERA_SERVICE_TASK_IDS = Object.freeze([
  "identify-exact-replacement-eligibility",
  "enter-guided-powered-safe-service",
  "remove-old-camera-and-connector-path",
  "install-close-and-stabilize-replacement",
  "recognize-and-stop-on-identity-conflict",
  "complete-fresh-recalibration",
  "recover-a-declared-interruption",
  "verify-final-privacy-camera-state-and-ready-truth",
]);
export const CAMERA_SERVICE_BLOCKERS = Object.freeze([
  "crr-001-exact-target-and-service-fixtures",
  "crr-002-old-and-replacement-device-identities",
  "crr-003-protected-persisted-identity-implementation",
  "crr-004-complete-five-minute-service-clock-boundary",
  "crr-005-powered-down-and-hot-plug-policy",
  "crr-006-ordinary-fastener-and-service-access-steps",
  "crr-007-replacement-eligibility-and-substitute-qualification",
  "crr-008-calibration-invalidation-transaction",
  "crr-009-fresh-calibration-and-verification-gates",
  "crr-010-interruption-and-recovery-policy",
  "crr-011-repetitions-wear-failure-and-quarantine-policy",
  "crr-012-service-personas-accessibility-consent-and-safety",
  "crr-013-subphase-physical-and-accuracy-gates",
  "crr-014-data-diagnostics-serial-protection-and-deletion",
  "crr-015-qualification-publication-bom-and-setup-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "targetRoles",
  "protectedIdentityContract", "authorityBoundary", "workflowClockContract",
  "servicePhases", "servicePhaseMatrix", "replacementFaultMatrix",
  "humanServiceMatrix", "measurements", "fixedAcceptance", "openAcceptance",
  "dataPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["campaign-contract", "docs/CAMERA_REPLACEMENT_RECALIBRATION_CAMPAIGN_2026-07-26.md"],
  ["owner-question-ledger", "docs/OWNER_QUESTIONS_CAMERA_REPLACEMENT_RECALIBRATION_2026-07-26.md"],
  ["camera-calibration-and-diy-decisions", "docs/DECISIONS.md"],
  ["investigation-acceptance-boundary", "docs/INVESTIGATIONS.md"],
  ["substitute-qualification-question", "docs/OPEN_QUESTIONS.md"],
  ["shared-camera-replacement-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-cable-service-boundary", "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json"],
  ["camera-geometry-invalidation-boundary", "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json"],
  ["physical-camera-state-boundary", "benchmarks/camera-state/physical-shutter-camera-state-experience-plan-v1.json"],
  ["coordinate-frame-invalidation-boundary", "docs/COORDINATE_FRAMES.md"],
  ["calibration-failure-and-replay-boundary", "docs/CALIBRATION_REHEARSAL.md"],
  ["profile-recalibration-boundary", "docs/PROFILE_MANAGEMENT.md"],
  ["calibration-retention-and-deletion-boundary", "docs/DATA_RETENTION_AND_DELETION_POLICY.md"],
  ["active-play-service-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
];
const targetRoles = [
  {
    targetId: CAMERA_SERVICE_TARGET_IDS[0],
    packageClass: "ordinary-native-linux-reference",
    serviceAccess: "external-standard-connector",
    exactTargetAndServiceFixtureSha256: null,
    exactOldCameraManifestSha256: null,
    exactReplacementCameraManifestSha256: null,
    operationAuthorized: false,
  },
  {
    targetId: CAMERA_SERVICE_TARGET_IDS[1],
    packageClass: "steamos-reference",
    serviceAccess: "external-standard-connector",
    exactTargetAndServiceFixtureSha256: null,
    exactOldCameraManifestSha256: null,
    exactReplacementCameraManifestSha256: null,
    operationAuthorized: false,
  },
  {
    targetId: CAMERA_SERVICE_TARGET_IDS[2],
    packageClass: "raspberry-pi5-ai-hat-reference",
    serviceAccess: "integrated-ordinary-fastener-standard-connector",
    exactTargetAndServiceFixtureSha256: null,
    exactOldCameraManifestSha256: null,
    exactReplacementCameraManifestSha256: null,
    operationAuthorized: false,
  },
];
const measurementIds = [
  "exact-old-replacement-target-service-fixture-and-tool-manifest-digests",
  "protected-identity-store-generation-before-intent-and-after-commit",
  "camera-unit-revision-firmware-optical-connector-cable-and-enumeration-truth",
  "service-intent-capture-release-power-and-safe-disconnect-truth",
  "per-phase-start-end-duration-contiguity-and-total-time",
  "fastener-tool-torque-opening-damage-loss-and-closeout-ledger",
  "connector-insertion-retention-bend-route-strain-relief-and-wear",
  "mount-pitch-roll-yaw-stability-shutter-indicator-vent-and-control-clearance",
  "identity-match-mismatch-ambiguity-stale-generation-commit-and-recovery",
  "old-floor-room-player-calibration-crop-body-match-and-cache-invalidation",
  "fresh-calibration-revision-source-camera-binding-and-transaction-proof",
  "independent-optical-floor-zone-action-and-calibration-accuracy",
  "software-access-stream-activity-shutter-indicator-and-ready-truth",
  "unexpected-capture-restart-identity-fallback-calibration-reuse-and-egress",
  "reboot-power-loss-disconnect-abandonment-retry-stop-and-quarantine",
  "operator-task-time-reach-force-assistance-errors-damage-and-discomfort",
  "per-target-scenario-persona-task-failure-invalid-retry-and-worst-case",
  "temporary-diagnostic-capture-authority-retention-deletion-and-incident",
  "delivered-replacement-cost-and-approved-substitute-qualification-binding",
  "end-to-end-five-minute-disposition-without-clock-exclusion-or-aggregate-rescue",
];
const openAcceptanceKeys = [
  "maximumServiceAdmissionTimeMs", "maximumPowerReleaseOrShutdownTimeMs",
  "maximumDisassemblyTimeMs", "maximumReplacementInstallationAndReassemblyTimeMs",
  "maximumEnumerationAndIdentityCommitTimeMs", "maximumInvalidationTransactionTimeMs",
  "maximumFreshCalibrationAndVerificationTimeMs", "maximumFastenerTorqueMilliNewtonMm",
  "maximumServiceReachForceMilliNewton", "maximumConnectorInsertionForceMilliNewton",
  "minimumConnectorRetentionForceMilliNewton", "minimumConnectorAndFastenerWearCycleCount",
  "maximumCableRouteOrMountDisplacementMicrometers", "maximumPitchRollOrYawErrorMilliDegrees",
  "maximumFloorPlaneErrorMm", "minimumActionPrecisionPpm", "minimumActionRecallPpm",
  "maximumAssistanceEventsPerHumanCell", "maximumUnsafeReachDamageOrDiscomfortEventsPerHumanCell",
  "maximumServiceEnergyMilliWh", "maximumServiceThermalRiseMilliCelsius",
  "maximumDeliveredReplacementCostCents",
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

export async function validateCameraReplacementRecalibrationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CAMERA_REPLACEMENT_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "camera-replacement-recalibration-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-048"]);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /protected persisted camera-identity/u);
  assert.match(plan.claimBoundary, /five-minute workflow/u);
  assert.match(plan.claimBoundary, /No replacement/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  assert.deepEqual(plan.targetRoles, targetRoles);

  assert.deepEqual(plan.protectedIdentityContract, {
    persistenceDomain: "protected-local-host-state",
    identityAuthority: "exact-received-camera-manifest-digest",
    rawSerialBearingEvidenceMayEnterRepositoryReleaseOrUserInterface: false,
    stableCameraSerialMayEnterResultDiagnosticsSupportExportOrNetwork: false,
    usbVidPidProductTextPortOrderImageAppearanceOrProfileNameMayIndependentlyProveIdentity: false,
    cameraIdentityMayIdentifyAuthorizeOrReassociateAPlayerProfile: false,
    sameUnitSameRevisionNewUnitApprovedSubstituteUnapprovedRevisionWrongUnitAndAmbiguityRemainDistinct: true,
    identityMismatchAmbiguityStaleGenerationOrCommitInterruptionFailsClosed: true,
    cameraRemovalReplacementOrMountChangeInvalidatesCameraBoundDerivedState: true,
    profileAndProgressMaySurviveButOldCalibrationAndBodyMatchMayNot: true,
    browserGameOrCalibrationOutputMayMutateProtectedIdentity: false,
  });

  exactKeys(plan.authorityBoundary, [
    "protectedIdentityStoreSchemaTransactionAndRecoveryProtocolSha256",
    "exactServiceIntentAdmissionAndClockProtocolSha256",
    "targetPowerHotPlugAndElectricalSafetyProtocolSha256",
    "ordinaryFastenerDisassemblyInspectionAndReassemblyProtocolSha256",
    "replacementEligibilityAndSubstituteQualificationProtocolSha256",
    "calibrationInvalidationAndProfileStateTransactionProtocolSha256",
    "freshCalibrationOpticalFloorActionAndPrivacyVerificationProtocolSha256",
    "interruptionRecoveryRollbackAndAbandonmentProtocolSha256",
    "connectorFastenerCableMountAndEnclosureWearProtocolSha256",
    "participantAccessibilityConsentAndSafetyProtocolSha256",
    "dataHandlingSerialProtectionDiagnosticsAndDeletionProtocolSha256",
    "operatorScheduleToolsStopAndIncidentProtocolSha256",
    "cameraPurchaseOrSubstituteAdmissionAuthorized",
    "powerHotPlugDisassemblyEnclosureAccessOrReplacementAuthorized",
    "cameraCaptureCalibrationOrFaultInjectionAuthorized",
    "participantOrAccessibilityStudyAuthorized",
    "profileVaultRegistryOrProtectedIdentityMutationAuthorized",
    "bomSetupGuidanceWarrantyOrServiceClaimMutationAuthorized",
    "resultPublicationQualificationOrProductClaimAuthorized",
  ], "authorityBoundary");
  for (const [key, value] of Object.entries(plan.authorityBoundary)) {
    assert.equal(value, key.endsWith("Sha256") ? null : false, `authorityBoundary.${key} must remain blocked`);
  }

  assert.deepEqual(plan.workflowClockContract, {
    startEvent: "reviewed-service-intent-admitted",
    endEvent: "fresh-calibration-privacy-and-ready-verification-complete",
    maximumEndToEndDurationMs: 300000,
    preOpenedEnclosurePreBoundReplacementPreCalibrationOrHiddenSetupAllowed: false,
    clockPauseExclusionOrRestartAllowed: false,
    powerDisassemblyReplacementReassemblyEnumerationIdentityInvalidationCalibrationAndVerificationIncluded: true,
    phaseDurationsMustBeContiguousMonotonicAndSumToTotal: true,
    meanMedianOrAnotherAttemptMayRescueSlowAttempt: false,
  });
  assert.deepEqual(
    plan.servicePhases,
    CAMERA_SERVICE_PHASE_IDS.map((phaseId, index) => ({
      phaseId,
      captureMayRunInReadyExecution: index >= 10,
      oldCalibrationMayBeUsed: false,
    })),
  );

  assert.deepEqual(plan.servicePhaseMatrix, {
    targetIds: [...CAMERA_SERVICE_TARGET_IDS],
    phaseIds: [...CAMERA_SERVICE_PHASE_IDS],
    validCompleteServiceAttemptsPerTarget: 20,
    requiredTargetPhaseCellCount: 36,
    requiredPhaseObservationCount: 720,
    requiredCompleteServiceAttemptCount: 60,
    everyPhaseTimingToolFastenerCableMountIdentityCalibrationPrivacyAssistanceAndDispositionRequired: true,
    oneTargetPhaseAttemptMeanMedianOrAggregateMayRescueAnother: false,
  });
  assert.equal(
    CAMERA_SERVICE_TARGET_IDS.length * CAMERA_SERVICE_PHASE_IDS.length,
    plan.servicePhaseMatrix.requiredTargetPhaseCellCount,
  );
  assert.equal(
    plan.servicePhaseMatrix.requiredTargetPhaseCellCount
      * plan.servicePhaseMatrix.validCompleteServiceAttemptsPerTarget,
    plan.servicePhaseMatrix.requiredPhaseObservationCount,
  );
  assert.equal(
    CAMERA_SERVICE_TARGET_IDS.length
      * plan.servicePhaseMatrix.validCompleteServiceAttemptsPerTarget,
    plan.servicePhaseMatrix.requiredCompleteServiceAttemptCount,
  );

  assert.deepEqual(plan.replacementFaultMatrix, {
    targetIds: [...CAMERA_SERVICE_TARGET_IDS],
    scenarioIds: [...CAMERA_SERVICE_SCENARIO_IDS],
    validCyclesPerTargetScenarioCell: 20,
    requiredCellCount: 30,
    requiredCycleCount: 600,
    mismatchAmbiguityInterruptionDamageStaleStateAndAbandonmentRemainVisible: true,
    captureMustRemainDisabledUntilExactIdentityAndFreshCalibrationCommit: true,
    oldCalibrationAutomaticRestartLaterSuccessOrAnotherScenarioMayRescueFailure: false,
  });
  assert.equal(
    CAMERA_SERVICE_TARGET_IDS.length * CAMERA_SERVICE_SCENARIO_IDS.length,
    plan.replacementFaultMatrix.requiredCellCount,
  );
  assert.equal(
    plan.replacementFaultMatrix.requiredCellCount
      * plan.replacementFaultMatrix.validCyclesPerTargetScenarioCell,
    plan.replacementFaultMatrix.requiredCycleCount,
  );

  assert.deepEqual(plan.humanServiceMatrix, {
    status: "blocked",
    targetIds: [...CAMERA_SERVICE_TARGET_IDS],
    personaClasses: [...CAMERA_SERVICE_PERSONAS],
    taskIds: [...CAMERA_SERVICE_TASK_IDS],
    validTrialsPerCell: 20,
    requiredCellCount: 120,
    requiredTrialCount: 2400,
    adultsOnlyHandleHardwareUnlessSupersededByReviewedProtocol: true,
    independentTaskSafetyPrivacyAssistanceReachDamageAndDiscomfortGroundTruthRequired: true,
    completionMayHideUnsafeReachAssistanceFalsePrivacyBeliefDamageOrDiscomfort: false,
    oneTargetPersonaTaskTrialOrAggregateMayRescueAnother: false,
  });
  assert.equal(
    CAMERA_SERVICE_TARGET_IDS.length * CAMERA_SERVICE_PERSONAS.length * CAMERA_SERVICE_TASK_IDS.length,
    plan.humanServiceMatrix.requiredCellCount,
  );
  assert.equal(
    plan.humanServiceMatrix.requiredCellCount * plan.humanServiceMatrix.validTrialsPerCell,
    plan.humanServiceMatrix.requiredTrialCount,
  );

  assert.deepEqual(plan.measurements, {
    requiredMeasurementIds: measurementIds,
    independentIdentityOpticalFloorActionPrivacySafetyAndTimeGroundTruthRequired: true,
    enumerationVideoCalibrationOutputApplicationReadyOrProfileNameMaySelfLabelSuccess: false,
    vendorClaimSameModelMeanBestCaseOrLaterRecoveryMaySubstituteEvidence: false,
    perTargetPhaseScenarioPersonaTaskCycleAttemptAndWorstCaseRequired: true,
  });
  assert.deepEqual(plan.fixedAcceptance, {
    maximumEndToEndServiceDurationMs: 300000,
    minimumValidCompleteServiceAttemptsPerTarget: 20,
    minimumValidFaultCyclesPerTargetScenarioCell: 20,
    minimumValidHumanTrialsPerCellIfAuthorized: 20,
    maximumOldCalibrationFloorCropBodyMatchOrCachedDerivedStateUseAfterReplacementIntent: 0,
    maximumWrongUnapprovedAmbiguousOrStaleIdentityAdmissions: 0,
    maximumUnauthorizedCaptureAutomaticRestartOrNetworkEgressEvents: 0,
    maximumSkippedHiddenPausedRestartedOrExcludedWorkflowPhases: 0,
    maximumSafetyDamageCableMountFastenerShutterIndicatorVentOrControlFailures: 0,
    maximumSerialPathProfileIdentifierCredentialProviderTextOrFreeTextDisclosures: 0,
    maximumSilentlyDiscardedFailedStoppedInvalidRetriedAbandonedOrAdverseEvidence: 0,
    freshExactCameraBoundCalibrationAndPrivacyReadyVerificationRequired: true,
    sameModelExternalTargetMeanMedianOrLaterSuccessMayRescueFailure: false,
    everyOpenGateMustBeFrozenBeforeAnyOperation: true,
  });
  assert.equal(
    plan.workflowClockContract.maximumEndToEndDurationMs,
    plan.fixedAcceptance.maximumEndToEndServiceDurationMs,
  );
  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `openAcceptance.${key} must remain null before operation`);
  }
  assert.deepEqual(plan.dataPolicy, {
    rawRoomCameraVideoImagePortraitBodyMeasurementOrAudioAllowedInRepositoryOrRelease: false,
    profileIdentifiersParticipantNamesFacesVoicesExactAgesAddressesAccessibilityNotesOrStableIdentifiersAllowed: false,
    stableCameraSerialsPathsCredentialsSecretsProviderMessagesOrUnredactedLogsAllowed: false,
    freeTextResultEvidenceAllowed: false,
    temporaryFramesDiagnosticsOrSerialBearingEvidenceRequireSeparateAuthoritySecurityConsentAndVerifiedDeletion: true,
    pathFreeClosedVocabularyAggregateAndDigestEvidenceRequired: true,
    networkEgressRemoteIdentityResolutionOrCloudCalibrationAllowed: false,
    failedStoppedInvalidRetriedAbandonedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...CAMERA_SERVICE_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: null,
    boundTargetCount: 0,
    boundOldCameraCount: 0,
    boundReplacementCameraCount: 0,
    persistedIdentityImplementationSha256: null,
    completedTargetPhaseCellCount: 0,
    completedPhaseObservationCount: 0,
    completedServiceAttemptCount: 0,
    completedFaultCellCount: 0,
    completedFaultCycleCount: 0,
    completedHumanServiceCellCount: 0,
    completedHumanServiceTrialCount: 0,
    qualifiedTargetIds: [],
    qualifiedOldToReplacementIdentityPairs: [],
    maximumObservedEndToEndServiceDurationMs: null,
    fiveMinuteProcedureQualified: false,
    cameraReplacementOrSubstituteSelected: false,
    purchaseAuthorized: false,
    bomOrSetupGuidanceChanged: false,
    warrantyOrFormalServiceabilityClaimed: false,
    publishedQualificationOrProductClaim: false,
  });

  return {
    status: plan.status,
    sourceBindingCount: plan.sourceBindings.length,
    phaseObservationCount: plan.servicePhaseMatrix.requiredPhaseObservationCount,
    faultCycleCount: plan.replacementFaultMatrix.requiredCycleCount,
    humanTrialCount: plan.humanServiceMatrix.requiredTrialCount,
    maximumServiceDurationMs: plan.fixedAcceptance.maximumEndToEndServiceDurationMs,
  };
}

export async function loadCameraReplacementRecalibrationPlan(path = trackedPath) {
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

export async function validateTrackedCameraReplacementRecalibrationPlan(path = trackedPath) {
  const plan = await loadCameraReplacementRecalibrationPlan(path);
  return validateCameraReplacementRecalibrationPlan(plan, root);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await validateTrackedCameraReplacementRecalibrationPlan();
  console.log(
    `${trackedPath}: valid ${summary.status} ${summary.phaseObservationCount}-phase-observation, `
      + `${summary.faultCycleCount}-fault-cycle, ${summary.humanTrialCount}-blocked-human-trial, `
      + `${summary.maximumServiceDurationMs}-ms I-048 plan`,
  );
}
