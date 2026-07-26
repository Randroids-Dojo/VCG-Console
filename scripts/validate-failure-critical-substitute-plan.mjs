import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/failure-critical-substitutes/cross-tier-failure-critical-substitute-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const FAILURE_CRITICAL_SUBSTITUTE_FORMAT =
  "vcg-cross-tier-failure-critical-substitute-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "targetPolicy",
  "targets",
  "roleDefinitions",
  "candidateAndVendorPolicy",
  "acceptanceStageIds",
  "qualificationMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "authorityBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  [
    "quote-date-primary-bom-and-unapproved-substitution-screen",
    "docs/QUOTE_DATE_BOMS_2026-07-24.md",
  ],
  [
    "quote-vendor-revision-and-cost-owner-boundary",
    "docs/OWNER_QUESTIONS_QUOTE_DATE_BOMS_2026-07-24.md",
  ],
  [
    "cross-tier-product-contract",
    "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json",
  ],
  [
    "complete-system-economics-boundary",
    "benchmarks/system-economics/complete-system-economics-plan-v1.json",
  ],
  [
    "shared-camera-qualification-boundary",
    "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json",
  ],
  [
    "primary-storage-qualification-boundary",
    "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json",
  ],
  [
    "storage-fallback-qualification-boundary",
    "benchmarks/usb3-ssd-fallback/pi5-usb3-ssd-fallback-plan-v1.json",
  ],
  [
    "cooling-thermal-acoustic-boundary",
    "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json",
  ],
  [
    "controller-and-recovery-remote-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "camera-interconnect-boundary",
    "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json",
  ],
  [
    "display-audio-power-recovery-boundary",
    "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json",
  ],
];

export const SUBSTITUTE_REQUIRED_TARGET_IDS = Object.freeze([
  "pi5-lower-cost-reference",
  "ordinary-x86-linux-reference",
]);

export const SUBSTITUTE_OPTIONAL_TARGET_IDS = Object.freeze([
  "steam-machine-steamos",
]);

export const SUBSTITUTE_ROLE_DEFINITIONS = Object.freeze([
  [
    "compute-platform",
    "bootable-accountless-compute-platform",
    [
      "architecture-memory-and-io",
      "boot-firmware-update-and-recovery",
      "complete-workload-performance-and-resource",
      "power-thermal-acoustic-and-fault",
    ],
  ],
  [
    "pose-inference-device",
    "camera-to-action-pose-inference",
    [
      "runtime-model-and-driver-closure",
      "action-quality-and-d110-latency",
      "concurrent-game-resource-and-thermal",
      "fault-update-rollback-and-recovery",
    ],
  ],
  [
    "primary-writable-storage",
    "boot-update-profile-save-and-package-storage",
    [
      "capacity-layout-and-full-disk",
      "latency-writes-endurance-and-health",
      "power-cut-corruption-and-atomicity",
      "blank-media-recovery-and-permanent-loss",
    ],
  ],
  [
    "shared-rgb-camera",
    "shared-wide-angle-motion-capture",
    [
      "genuine-1080p60-uvc-modes-and-controls",
      "coverage-distortion-lighting-and-action-quality",
      "exposure-to-action-latency-and-timestamps",
      "privacy-reconnect-suspend-and-replacement",
    ],
  ],
  [
    "primary-power-supply",
    "safe-complete-system-power",
    [
      "voltage-current-profiles-and-identity",
      "inrush-peak-steady-margin-and-brownout",
      "thermal-electrical-household-safety",
      "load-fault-unplug-reconnect-and-recovery",
    ],
  ],
  [
    "cooling-assembly",
    "sustained-thermal-and-acoustic-control",
    [
      "mechanical-interface-and-airflow",
      "one-hour-and-four-hour-thermal-soak",
      "one-metre-acoustics-tone-rattle-and-oscillation",
      "fan-fault-stall-recovery-and-service",
    ],
  ],
  [
    "enclosure-chassis",
    "abs-household-integration-and-service",
    [
      "material-fit-clearance-ports-and-insulation",
      "thermal-airflow-radio-and-emi",
      "tip-pull-impact-cable-and-household-load",
      "assembly-opening-replacement-and-service",
    ],
  ],
  [
    "display-interconnect",
    "television-video-audio-and-recovery-link",
    [
      "connector-length-and-received-identity",
      "required-resolution-refresh-audio-and-signal",
      "hotplug-mode-change-cec-and-recovery",
      "bend-retention-routing-and-service",
    ],
  ],
  [
    "camera-interconnect",
    "camera-data-power-and-physical-routing",
    [
      "genuine-1080p60-signal-and-usb-errors",
      "length-bend-retention-pull-and-routing",
      "radio-emi-power-and-concurrent-load",
      "cold-hotplug-suspend-and-recovery",
    ],
  ],
  [
    "assembly-retention-and-fasteners",
    "board-hat-camera-storage-and-cable-retention",
    [
      "dimensions-material-thread-and-package-identity",
      "fit-clearance-insulation-and-torque",
      "pull-vibration-cycle-and-household-load",
      "service-removal-reassembly-and-damage",
    ],
  ],
  [
    "primary-controller",
    "ordinary-play-and-reserved-system-control",
    [
      "exact-mapping-glyph-and-transport",
      "input-latency-repeat-deadzone-and-battery",
      "reserved-home-back-pause-and-focus",
      "disconnect-reconnect-replacement-and-recovery",
    ],
  ],
  [
    "recovery-remote",
    "independent-controller-loss-and-shell-recovery",
    [
      "system-action-mapping-and-ownership",
      "primary-controller-loss-focus-and-forced-exit",
      "power-input-audio-and-accessibility-recovery",
      "battery-pairing-reconnect-and-replacement",
    ],
  ],
]);

export const SUBSTITUTE_ACCEPTANCE_STAGE_IDS = Object.freeze([
  "procurement-and-identity",
  "interface-fit-and-safety",
  "target-bringup-firmware-and-driver",
  "complete-product-workload-and-performance",
  "sustained-environmental-and-coexistence",
  "fault-recovery-and-service-replacement",
  "delivered-cost-supply-warranty-and-expiry",
  "independent-review-and-approval",
]);

export const SUBSTITUTE_BLOCKER_CODES = Object.freeze([
  "I031-001-failure-critical-role-target-and-product-ownership-review",
  "I031-002-exact-qualified-primary-baseline-manifests-by-target-role",
  "I031-003-exact-substitute-candidates-approved-vendors-and-fresh-quotes",
  "I031-004-received-unit-revision-firmware-lot-alias-and-retest-policy",
  "I031-005-role-specific-acceptance-harness-oracles-safety-and-stop-rules",
  "I031-006-common-integrated-product-workload-and-inherited-gates",
  "I031-007-sample-counts-schedule-retest-family-scope-ranking-and-tie-break",
  "I031-008-delivered-cost-volume-mass-warranty-return-and-supply-continuity",
  "I031-009-service-replacement-recovery-and-data-continuity-protocol",
  "I031-010-result-schema-data-rights-retention-adverse-evidence-and-incident-policy",
  "I031-011-independent-review-vendor-list-publication-expiry-and-requalification",
  "I031-012-purchase-destructive-operation-qualification-substitution-and-bom-authority",
]);

const metricIds = [
  "exact-receipt-revision-firmware-lot-and-vendor-disposition",
  "interface-fit-electrical-mechanical-and-household-safety-disposition",
  "boot-bringup-driver-firmware-update-and-rollback-disposition",
  "complete-product-functional-performance-latency-and-resource-disposition",
  "sustained-thermal-acoustic-power-radio-emi-and-coexistence-disposition",
  "fault-recovery-service-replacement-and-data-continuity-disposition",
  "fresh-delivered-cost-volume-mass-warranty-return-and-supply-disposition",
  "independent-review-approval-expiry-and-retest-disposition",
  "failed-invalid-stopped-retried-adverse-and-worst-case-ledger",
];

const openAcceptanceKeys = [
  "minimumReceivedUnitsPerCandidateTargetRole",
  "minimumIndependentLotsOrManufacturingBatchesPerCandidate",
  "minimumValidCyclesPerBehavioralCheck",
  "minimumSustainedSoakSecondsByRole",
  "maximumPerformanceRegressionRatioPpmByRoleMetric",
  "maximumPowerRegressionRatioPpmByRolePhase",
  "maximumThermalRegressionMillicelsiusByRolePhase",
  "maximumAcousticRegressionMilliDbaByRolePhase",
  "maximumAssembledVolumeRegressionRatioPpmByRole",
  "maximumAssembledMassRegressionRatioPpmByRole",
  "maximumServiceReplacementSecondsByRole",
  "maximumFreshQuoteAgeSeconds",
  "minimumDocumentedSupplyContinuitySeconds",
  "minimumWarrantySeconds",
  "minimumReturnWindowSeconds",
  "maximumDeliveredCostDeltaCentsByNonPiTargetRole",
  "candidateRankingTieBreakExpiryRetestAndFamilyScopeSha256",
];

const authorityNullKeys = [
  "failureCriticalRoleAndTargetOwnershipReviewSha256",
  "exactPrimaryBaselineAndSubstituteCandidateManifestSha256",
  "approvedVendorRevisionFirmwareLotQuoteAndSupplyPolicySha256",
  "roleSpecificAcceptanceHarnessOraclesSafetyAndStopProtocolSha256",
  "commonIntegratedProductWorkloadAndInheritedGateProtocolSha256",
  "sampleScheduleRetestFamilyScopeRankingExpiryAndIndependentReviewSha256",
  "serviceReplacementRecoveryDataContinuityAndIncidentProtocolSha256",
  "resultSchemaDataRightsRetentionRedactionAndPublicationProtocolSha256",
];

const authorityFalseKeys = [
  "purchaseReturnOrVendorContactAuthorized",
  "firmwareUpdateDestructiveFaultPowerOrTargetOperationAuthorized",
  "approvedVendorListPublicationAuthorized",
  "qualificationSelectionSubstitutionPublicationOrBomMutationAuthorized",
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

function validateTargets(plan) {
  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: [...SUBSTITUTE_REQUIRED_TARGET_IDS],
    optionalTargetIds: [...SUBSTITUTE_OPTIONAL_TARGET_IDS],
    requiredTargetCount: 2,
    optionalTargetCount: 1,
    oneRequiredTargetMayQualifyOrRescueAnother: false,
    optionalTargetMayQualifyOrRescueRequiredTarget: false,
    proxyDevelopmentOrVendorEvidenceMayQualifyTarget: false,
  });
  assert.equal(plan.targets.length, 3);
  assert.deepEqual(
    plan.targets.map(({ targetId, requirement }) => [targetId, requirement]),
    [
      ["pi5-lower-cost-reference", "required"],
      ["ordinary-x86-linux-reference", "required"],
      ["steam-machine-steamos", "optional-non-rescuing"],
    ],
  );
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(
      target,
      [
        "targetId",
        "requirement",
        "exactPrimaryProductAndRoleBaselineManifestSha256",
        "exactTargetImageDriverFirmwarePowerAndPeripheralManifestSha256",
        "receivedInventoriedAndAuthorized",
      ],
      `targets[${index}]`,
    );
    assert.equal(target.exactPrimaryProductAndRoleBaselineManifestSha256, null);
    assert.equal(target.exactTargetImageDriverFirmwarePowerAndPeripheralManifestSha256, null);
    assert.equal(target.receivedInventoriedAndAuthorized, false);
  }
}

function validateRoles(plan) {
  assert.equal(plan.roleDefinitions.length, 12);
  assert.deepEqual(
    plan.roleDefinitions.map(({ roleId, productFunction, mandatoryCheckIds }) => [
      roleId,
      productFunction,
      mandatoryCheckIds,
    ]),
    SUBSTITUTE_ROLE_DEFINITIONS,
  );
  for (const [index, role] of plan.roleDefinitions.entries()) {
    exactKeys(role, ["roleId", "productFunction", "mandatoryCheckIds"], `roleDefinitions[${index}]`);
    assert.equal(role.mandatoryCheckIds.length, 4);
    assert.equal(new Set(role.mandatoryCheckIds).size, 4);
  }
}

export async function validateFailureCriticalSubstitutePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, FAILURE_CRITICAL_SUBSTITUTE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i031-cross-tier-failure-critical-substitutes-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, [
    "I-031",
    "Q-072",
    "D-043",
    "D-044",
    "D-047",
    "D-094",
    "D-095",
    "D-108",
    "D-109",
    "D-110",
    "D-111",
  ]);
  assert.ok(
    typeof plan.claimBoundary === "string" &&
      plan.claimBoundary.length >= 800 &&
      plan.claimBoundary.includes("cannot establish") &&
      plan.claimBoundary.includes("No candidate"),
    "claimBoundary is incomplete",
  );
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  validateTargets(plan);
  validateRoles(plan);

  assert.deepEqual(plan.candidateAndVendorPolicy, {
    minimumQualifiedSubstitutesPerTargetRoleCell: 1,
    exactPrimaryBaselineManifestSha256: null,
    exactSubstituteCandidateManifestSha256: null,
    approvedVendorListSha256: null,
    manufacturerRevisionFirmwareLotAliasAndRetestPolicySha256: null,
    quoteJurisdictionSellerCurrencyTaxShippingAndFreshnessPolicySha256: null,
    warrantyReturnSupportSupplyContinuityAndExpiryPolicySha256: null,
    manufacturerOrAuthorizedDistributorEvidenceRequired: true,
    receivedUnitMustMatchExactQuotedIdentity: true,
    regionalPackagingOrRevisionAliasRequiresReviewedEvidence: true,
    marketplaceUsedOpenBoxOrUnidentifiedSellerAllowed: false,
    vendorApprovalMayQualifyPartOrAuthorizePurchase: false,
    stockPriceSpecificationOrConnectorMatchMayQualify: false,
    candidateMayChangeAfterFirstResult: false,
  });

  assert.deepEqual(plan.acceptanceStageIds, SUBSTITUTE_ACCEPTANCE_STAGE_IDS);
  const matrix = plan.qualificationMatrix;
  exactKeys(
    matrix,
    [
      "requiredTargetIds",
      "optionalTargetIds",
      "roleIds",
      "acceptanceStageIds",
      "requiredTargetCount",
      "optionalTargetCount",
      "roleCount",
      "acceptanceStageCount",
      "requiredTargetRoleCellCount",
      "optionalTargetRoleCellCount",
      "minimumCandidateRecordsPerTargetRoleCell",
      "requiredCandidateRecordCount",
      "optionalCandidateRecordCount",
      "requiredAcceptanceStageResultCount",
      "optionalAcceptanceStageResultCount",
      "everyRequiredTargetRolePrimaryAndSubstituteRunsEveryStage",
      "roleSpecificMandatoryChecksRequiredInsideEveryApplicableStage",
      "failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible",
      "primaryAndSubstituteMustUseSameTargetProductWorkloadAndAcceptanceContract",
      "candidateTargetRoleStageOrAggregateMayRescueFailure",
    ],
    "qualificationMatrix",
  );
  assert.deepEqual(matrix.requiredTargetIds, SUBSTITUTE_REQUIRED_TARGET_IDS);
  assert.deepEqual(matrix.optionalTargetIds, SUBSTITUTE_OPTIONAL_TARGET_IDS);
  assert.deepEqual(
    matrix.roleIds,
    SUBSTITUTE_ROLE_DEFINITIONS.map(([roleId]) => roleId),
  );
  assert.deepEqual(matrix.acceptanceStageIds, SUBSTITUTE_ACCEPTANCE_STAGE_IDS);
  assert.equal(matrix.requiredTargetCount, 2);
  assert.equal(matrix.optionalTargetCount, 1);
  assert.equal(matrix.roleCount, 12);
  assert.equal(matrix.acceptanceStageCount, 8);
  assert.equal(matrix.requiredTargetRoleCellCount, 24);
  assert.equal(matrix.optionalTargetRoleCellCount, 12);
  assert.equal(matrix.minimumCandidateRecordsPerTargetRoleCell, 2);
  assert.equal(matrix.requiredCandidateRecordCount, 48);
  assert.equal(matrix.optionalCandidateRecordCount, 24);
  assert.equal(matrix.requiredAcceptanceStageResultCount, 384);
  assert.equal(matrix.optionalAcceptanceStageResultCount, 192);
  for (const key of [
    "everyRequiredTargetRolePrimaryAndSubstituteRunsEveryStage",
    "roleSpecificMandatoryChecksRequiredInsideEveryApplicableStage",
    "failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible",
    "primaryAndSubstituteMustUseSameTargetProductWorkloadAndAcceptanceContract",
  ]) {
    assert.equal(matrix[key], true);
  }
  assert.equal(matrix.candidateTargetRoleStageOrAggregateMayRescueFailure, false);

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: metricIds,
    independentIdentityFitSafetyPerformancePowerThermalAcousticFaultRecoveryCostSupplyAndClockOraclesRequired:
      true,
    vendorUiSpecificationComponentSmokeOrSelfReportMaySubstituteForIntegratedEvidence: false,
    everyAttemptFailureInvalidationRetryExceptionAndWorstCaseMustRemainVisible: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumQualifiedSubstitutesPerRequiredTargetRoleCell: 1,
    maximumMissingRequiredTargetRoleCells: 0,
    maximumUnqualifiedOrSilentSubstitutions: 0,
    maximumUnreviewedRevisionFirmwareLotOrSellerChanges: 0,
    maximumWeakenedInheritedProductGates: 0,
    maximumFailedSafetyIntegrityPrivacyRecoveryOrReservedControlGates: 0,
    maximumCandidateTargetRoleStageOrAggregateRescues: 0,
    maximumPiLowerCostDeliveredReferenceCents: 65000,
    sameOrStricterProductContractRequiredForPrimaryAndSubstitute: true,
    exactReceivedIdentityAndCompleteIntegratedTargetEvidenceRequired: true,
    failureRemainsFailureForThatExactCandidateTargetAndRole: true,
    architectureTierOrFunctionalRoleChangeRequiresSupersedingDecision: true,
    approvedVendorEntryStockPriceSpecificationOrSmokeTestMayQualify: false,
    optionalSteamEvidenceMayQualifyOrRescueRequiredTier: false,
    allOpenSamplesThresholdsScheduleRetestExpiryAndReviewRulesMustBeFrozenBeforeOperation: true,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `openAcceptance.${key} must remain open`);
  }

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
    opaqueTargetRoleCandidateUnitLotVendorStageAttemptFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawSerialUsbPciBluetoothFirmwareSmartOrDeviceIdentifiersAllowed: false,
    sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed: false,
    hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed: false,
    profileSaveBrowserCameraAudioVideoControllerPayloadOrParticipantDataAllowed: false,
    credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed: false,
    freeTextVendorFirmwareDriverKernelFaultServiceOrResultLogsAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, SUBSTITUTE_BLOCKER_CODES);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseFailureCriticalSubstitutePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "failure-critical substitute plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateFailureCriticalSubstitutePlan(plan, repositoryRoot);
}

export async function readFailureCriticalSubstitutePlan(path = trackedPath) {
  return parseFailureCriticalSubstitutePlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readFailureCriticalSubstitutePlan();
  console.log(
    `Failure-critical substitute plan valid: ${plan.qualificationMatrix.requiredTargetRoleCellCount} required target-role cells, ${plan.qualificationMatrix.requiredAcceptanceStageResultCount} required stage results, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
