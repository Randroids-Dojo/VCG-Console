import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/shutdown-reserve/pi5-shutdown-reserve-comparison-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const SHUTDOWN_RESERVE_FORMAT = "vcg-pi5-shutdown-reserve-comparison-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "incumbentPolicy",
  "alternatives",
  "operationIds",
  "commonElectricalEventProfileIds",
  "reserveFaultProfileIds",
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
  [
    "d109-selected-software-storage-incumbent-boundary",
    "docs/OPEN_QUESTIONS.md",
  ],
  [
    "sudden-power-operation-oracle-and-result-contract",
    "docs/POWER_CUT_CAMPAIGN_2026-07-24.md",
  ],
  [
    "current-power-cut-zero-result-status",
    "docs/POWER_CUT_CAMPAIGN_STATUS_AUDIT_2026-07-25.md",
  ],
  [
    "power-cut-reliability-and-electrical-scope-owner-boundary",
    "docs/OWNER_QUESTIONS_POWER_CUT_CAMPAIGN_2026-07-24.md",
  ],
  [
    "safe-shutdown-and-unclean-loss-state-machine-boundary",
    "docs/POWER_RECOVERY_STATE_MACHINE.md",
  ],
  [
    "qualified-microsd-incumbent-boundary",
    "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json",
  ],
  [
    "usb3-ssd-first-storage-fallback-boundary",
    "benchmarks/usb3-ssd-fallback/pi5-usb3-ssd-fallback-plan-v1.json",
  ],
  [
    "complete-system-value-and-lifecycle-boundary",
    "benchmarks/system-economics/complete-system-economics-plan-v1.json",
  ],
  [
    "pi5-complete-product-and-cost-contract",
    "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json",
  ],
  [
    "current-reference-bom-and-no-purchase-boundary",
    "docs/QUOTE_DATE_BOMS_2026-07-24.md",
  ],
];

export const SHUTDOWN_RESERVE_ALTERNATIVES = Object.freeze([
  ["software-microsd-incumbent", "software-storage-only", "required-incumbent"],
  [
    "software-usb3-ssd-fallback",
    "software-storage-only",
    "required-d109-storage-fallback-comparator",
  ],
  ["small-external-ups", "backup-power", "candidate-non-selected"],
  ["supercapacitor-shutdown-reserve", "backup-power", "candidate-non-selected"],
]);

export const SHUTDOWN_RESERVE_OPERATION_IDS = Object.freeze([
  "idle",
  "boot",
  "system-update",
  "package-update",
  "package-rollback",
  "retro-import",
  "save-checkpoint",
  "profile-update",
  "log-rotation",
  "low-space",
  "filesystem-recovery",
]);

export const SHUTDOWN_RESERVE_COMMON_EVENT_IDS = Object.freeze([
  "abrupt-production-input-removal",
  "sustained-brownout",
  "short-dropout",
  "undervoltage-ramp",
  "oscillating-loss-and-reconnect",
]);

export const SHUTDOWN_RESERVE_FAULT_IDS = Object.freeze([
  "reserve-depleted-before-event",
  "reserve-disconnected-before-event",
  "reserve-health-or-capacity-fault",
  "shutdown-signal-or-control-path-fault",
  "restore-or-boot-during-insufficient-reserve",
]);

export const SHUTDOWN_RESERVE_BLOCKER_CODES = Object.freeze([
  "I032-001-d109-trigger-and-incumbent-power-cut-result",
  "I032-002-qualified-microsd-and-usb3-ssd-storage-results",
  "I032-003-exact-final-pi-target-image-workload-and-power-manifest",
  "I032-004-exact-ups-supercapacitor-revision-cell-firmware-and-wiring-candidates",
  "I032-005-reviewed-electrical-fixture-waveform-safety-and-emergency-stop",
  "I032-006-operation-transition-trigger-oracle-baseline-and-restore-readiness",
  "I032-007-samples-trials-environments-aging-faults-and-stop-rules",
  "I032-008-hold-up-shutdown-voltage-false-trigger-and-availability-thresholds",
  "I032-009-cost-energy-volume-mass-service-lifecycle-and-supply-thresholds",
  "I032-010-decision-horizon-ranking-tie-break-expiry-and-retest-policy",
  "I032-011-result-data-rights-retention-incident-and-independent-review-policy",
  "I032-012-purchase-operation-selection-and-d109-supersession-authority",
]);

const metricIds = [
  "cut-command-to-observed-input-and-rail-loss-microseconds",
  "event-detection-to-shutdown-request-and-completion-microseconds",
  "usable-hold-up-and-required-shutdown-margin-microseconds",
  "rail-voltage-current-power-energy-and-brownout-waveform",
  "bootability-committed-state-authority-and-filesystem-disposition",
  "wrong-slot-package-profile-save-retro-and-recovery-counts",
  "false-shutdown-missed-event-loop-and-degraded-mode-counts",
  "recharge-time-state-of-charge-health-capacity-and-cycle-count",
  "fresh-aged-hot-cold-and-depleted-reserve-margin",
  "standby-load-charge-thermal-acoustic-radio-and-emi-effects",
  "complete-delivered-cost-energy-cost-volume-mass-and-service-time",
  "warranty-return-supply-maintenance-lifecycle-and-expiry-disposition",
  "invalid-stopped-retried-adverse-and-worst-case-ledger",
];

const openAcceptanceKeys = [
  "repeatedInterruptionFailureTriggerCountAndWindow",
  "minimumReceivedUnitsAndIndependentLotsPerAlternative",
  "minimumValidTrialsPerCommonScenarioCell",
  "minimumValidTrialsPerReserveFaultScenarioCell",
  "minimumFreshAndEndOfLifeReserveMarginMicroseconds",
  "maximumEventDetectionLatencyMicroseconds",
  "maximumSafeShutdownCompletionMicroseconds",
  "minimumSustainedOutputVoltageMillivoltsByLoadPhase",
  "maximumFalseShutdownMissedEventOrReconnectLoopCount",
  "maximumRechargeTimeMicroseconds",
  "maximumStandbyAndChargingPowerMilliwatts",
  "maximumTemperatureRiseMillicelsiusByPhase",
  "minimumServiceLifeSecondsAndChargeDischargeCycles",
  "maximumDeliveredCostDeltaCents",
  "maximumLifetimeEnergyAndReplacementCostCents",
  "maximumAssembledVolumeAndMassDelta",
  "maximumInstallationAndServiceTimeSeconds",
  "maximumAvailabilityOrUserRecoveryPenaltyMicroseconds",
  "decisionHorizonRankingWeightsTieBreakExpiryAndRetestPolicySha256",
];

const authorityNullKeys = [
  "exactTargetStorageImageWorkloadAndElectricalFixtureManifestSha256",
  "exactUpsSupercapacitorRevisionCellFirmwareWiringAndSafetyManifestSha256",
  "eventScheduleTriggerObservationOracleAndRestoreProtocolSha256",
  "agingTemperatureChargeDepletionFaultAndLifecycleProtocolSha256",
  "costEnergyVolumeMassServiceSupplyWarrantyAndExpiryProtocolSha256",
  "resultSchemaDataRightsRetentionIncidentAndIndependentReviewProtocolSha256",
];

const authorityFalseKeys = [
  "purchaseReturnOrVendorContactAuthorized",
  "wiringChargingFirmwareMutationOrElectricalAssemblyAuthorized",
  "destructivePowerFaultTargetOrReserveOperationAuthorized",
  "candidateSelectionD109SupersessionBomMutationPublicationOrProductClaimAuthorized",
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

function validateAlternatives(plan) {
  assert.equal(plan.alternatives.length, SHUTDOWN_RESERVE_ALTERNATIVES.length);
  assert.deepEqual(
    plan.alternatives.map(({ alternativeId, alternativeClass, comparisonRole }) => [
      alternativeId,
      alternativeClass,
      comparisonRole,
    ]),
    SHUTDOWN_RESERVE_ALTERNATIVES,
  );
  for (const [index, alternative] of plan.alternatives.entries()) {
    exactKeys(
      alternative,
      [
        "alternativeId",
        "alternativeClass",
        "comparisonRole",
        "exactReceivedHardwareStorageImageAndWorkloadManifestSha256",
        "exactReserveCandidateRevisionCellFirmwareAndWiringManifestSha256",
        "candidateReceivedInventoriedAndAuthorized",
      ],
      `alternatives[${index}]`,
    );
    assert.equal(alternative.exactReceivedHardwareStorageImageAndWorkloadManifestSha256, null);
    assert.equal(
      alternative.exactReserveCandidateRevisionCellFirmwareAndWiringManifestSha256,
      null,
    );
    assert.equal(alternative.candidateReceivedInventoriedAndAuthorized, false);
  }
}

function validateMatrix(plan) {
  const matrix = plan.comparisonMatrix;
  exactKeys(
    matrix,
    [
      "alternativeIds",
      "backupPowerAlternativeIds",
      "operationIds",
      "commonElectricalEventProfileIds",
      "reserveFaultProfileIds",
      "alternativeCount",
      "backupPowerAlternativeCount",
      "operationCount",
      "commonElectricalEventProfileCount",
      "reserveFaultProfileCount",
      "commonScenarioCellCount",
      "reserveFaultScenarioCellCount",
      "totalScenarioCellCount",
      "minimumValidPowerCutTrialsPerAlternative",
      "sameExactTargetWorkloadOperationEventScheduleAndOraclesRequired",
      "everyAttemptFailureInvalidationRetryAndWorstCaseMustRemainVisible",
      "alternativeOperationEventOrAggregateMayRescueFailure",
    ],
    "comparisonMatrix",
  );
  const alternativeIds = SHUTDOWN_RESERVE_ALTERNATIVES.map(([id]) => id);
  const reserveIds = SHUTDOWN_RESERVE_ALTERNATIVES.filter(
    ([, alternativeClass]) => alternativeClass === "backup-power",
  ).map(([id]) => id);
  assert.deepEqual(matrix.alternativeIds, alternativeIds);
  assert.deepEqual(matrix.backupPowerAlternativeIds, reserveIds);
  assert.deepEqual(matrix.operationIds, SHUTDOWN_RESERVE_OPERATION_IDS);
  assert.deepEqual(matrix.commonElectricalEventProfileIds, SHUTDOWN_RESERVE_COMMON_EVENT_IDS);
  assert.deepEqual(matrix.reserveFaultProfileIds, SHUTDOWN_RESERVE_FAULT_IDS);
  assert.equal(matrix.alternativeCount, 4);
  assert.equal(matrix.backupPowerAlternativeCount, 2);
  assert.equal(matrix.operationCount, 11);
  assert.equal(matrix.commonElectricalEventProfileCount, 5);
  assert.equal(matrix.reserveFaultProfileCount, 5);
  assert.equal(matrix.commonScenarioCellCount, 4 * 11 * 5);
  assert.equal(matrix.reserveFaultScenarioCellCount, 2 * 11 * 5);
  assert.equal(matrix.totalScenarioCellCount, 330);
  assert.equal(matrix.minimumValidPowerCutTrialsPerAlternative, 200);
  assert.equal(matrix.sameExactTargetWorkloadOperationEventScheduleAndOraclesRequired, true);
  assert.equal(matrix.everyAttemptFailureInvalidationRetryAndWorstCaseMustRemainVisible, true);
  assert.equal(matrix.alternativeOperationEventOrAggregateMayRescueFailure, false);
}

export async function validateShutdownReserveComparisonPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, SHUTDOWN_RESERVE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i032-pi5-shutdown-reserve-comparison-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, [
    "I-032",
    "Q-022",
    "D-047",
    "D-050",
    "D-084",
    "D-089",
    "D-109",
    "D-111",
  ]);
  assert.ok(
    typeof plan.claimBoundary === "string" &&
      plan.claimBoundary.length >= 1000 &&
      plan.claimBoundary.includes("cannot establish") &&
      plan.claimBoundary.includes("No purchase"),
    "claimBoundary is incomplete",
  );
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.incumbentPolicy, {
    selectedAlternativeId: "software-microsd-incumbent",
    backupPowerRequiredByCurrentDecision: false,
    softwareAndStorageResilienceMustQualifyIndependently: true,
    latestUncommittedProgressMayBeLost: true,
    completedCommittedStateMaySilentlyCorrupt: false,
    usb3SsdIsFirstDocumentedStorageFallbackAfterQualifiedMicrosdFailure: true,
    reserveEvidenceMayRelabelFailedSoftwareOrStorageEvidence: false,
    reserveSelectionRequiresSupersedingD109Decision: true,
  });
  validateAlternatives(plan);
  assert.deepEqual(plan.operationIds, SHUTDOWN_RESERVE_OPERATION_IDS);
  assert.deepEqual(plan.commonElectricalEventProfileIds, SHUTDOWN_RESERVE_COMMON_EVENT_IDS);
  assert.deepEqual(plan.reserveFaultProfileIds, SHUTDOWN_RESERVE_FAULT_IDS);
  validateMatrix(plan);

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentElectricalTimingStateSafetyCostAndLifecycleOraclesRequired: true,
    vendorSpecificationCalculatedCapacityOrCleanShutdownMaySubstituteForIntegratedEvidence:
      false,
    preRepairFirstFailureEvidenceAndEveryAttemptMustRemainVisible: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidPowerCutTrialsPerAlternative: 200,
    maximumValidProductFailures: 0,
    maximumBootLoopsOrUnboundedRecoveryStates: 0,
    maximumCommittedStateCorruptionsOrUnauthorizedAuthorityChanges: 0,
    maximumMissedRequiredShutdownsOrUnsafeReserveTransitions: 0,
    maximumElectricalThermalFireShockLeakageSwellingOrHouseholdSafetyFailures: 0,
    maximumUnmeasuredOrHarnessInvalidTrialsCountedAsValid: 0,
    maximumAlternativeOperationEventOrAggregateFailureRescues: 0,
    maximumPiLowerCostDeliveredReferenceCents: 65000,
    sameExactProductWorkloadScheduleAndOraclesRequiredAcrossAlternatives: true,
    softwareAndStorageQualificationRemainsIndependentOfReserveEvidence: true,
    qualifiedMicrosdSoftwareBaselinePassKeepsNoBackupPowerAsIncumbent: true,
    failedMicrosdRequiresDocumentedUsb3SsdFallbackEvaluationBeforeReserveSelection: true,
    reserveFailureOrDepletionMustFailSafeWithoutFalseBootabilityOrCommitClaims: true,
    exactReceivedCandidateRevisionCellFirmwareWiringAndLifecycleEvidenceRequired: true,
    backupPowerSelectionRequiresSupersedingD109OwnerDecision: true,
    allOpenSamplesThresholdsSchedulesCostRulesAndRankingMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }

  assert.deepEqual(plan.decisionProtocol, {
    softwareMicrosdPowerCutResultSha256: null,
    softwareUsb3SsdPowerCutResultSha256: null,
    smallExternalUpsPowerCutLifecycleAndCostResultSha256: null,
    supercapacitorPowerCutLifecycleAndCostResultSha256: null,
    completeComparisonResultSha256: null,
    recommendedAlternativeId: null,
    recommendedDisposition: null,
    d109SupersedingDecisionId: null,
    passingReserveAutomaticallyOverridesD109: false,
    fewerFailuresAverageOrLowerCostMayRescueAnyFixedGateFailure: false,
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
    opaqueAlternativeUnitLotEventOperationTrialFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawSerialUsbPciFirmwareBatteryCellSmartOrDeviceIdentifiersAllowed: false,
    sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed: false,
    hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed: false,
    profileSaveBrowserCameraAudioVideoControllerPayloadOrParticipantDataAllowed: false,
    credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed: false,
    freeTextElectricalFirmwareKernelShutdownFaultServiceOrResultLogsAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, SHUTDOWN_RESERVE_BLOCKER_CODES);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseShutdownReserveComparisonPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "shutdown reserve comparison plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateShutdownReserveComparisonPlan(plan, repositoryRoot);
}

export async function readShutdownReserveComparisonPlan(path = trackedPath) {
  return parseShutdownReserveComparisonPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readShutdownReserveComparisonPlan();
  console.log(
    `Shutdown reserve comparison plan valid: ${plan.comparisonMatrix.totalScenarioCellCount} scenario cells, ${plan.comparisonMatrix.minimumValidPowerCutTrialsPerAlternative} minimum valid trials per alternative, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
