import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/system-economics/complete-system-economics-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const COMPLETE_SYSTEM_ECONOMICS_FORMAT =
  "vcg-complete-system-economics-comparison-plan/v1";
export const COMPLETE_SYSTEM_ECONOMICS_CANDIDATES = Object.freeze([
  [
    "optional-steam-machine",
    "optional-compatibility-candidate",
    "x86_64",
    "finished-steamos-appliance",
    false,
  ],
  [
    "custom-amd-mini-pc",
    "general-purpose-x86-comparator",
    "x86_64",
    "custom-amd-mini-pc-system",
    false,
  ],
  [
    "pi5-ai-hat26",
    "required-lower-cost-reference",
    "aarch64",
    "diy-pi5-plus-hailo8-system",
    true,
  ],
  [
    "jetson-orin-nano-super",
    "arm-accelerated-comparator",
    "aarch64",
    "nvidia-developer-kit-system",
    false,
  ],
  [
    "owned-x86-linux",
    "required-premium-reference",
    "x86_64",
    "owned-general-purpose-linux-pc",
    false,
  ],
]);
export const COMPLETE_SYSTEM_ECONOMICS_WORKLOADS = Object.freeze([
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
export const COMPLETE_SYSTEM_ECONOMICS_PHASES = Object.freeze([
  "accountless-cold-start-to-interactive",
  "one-hour-concurrent-steady-state",
  "update-fault-recovery-and-offline-restart",
]);
export const COMPLETE_SYSTEM_ECONOMICS_METRICS = Object.freeze([
  "exact-candidate-hardware-software-firmware-runtime-model-peripheral-room-and-workload-digests",
  "dated-item-subtotal-discount-shipping-tax-delivered-total-stock-return-warranty-and-support-ledger",
  "reuse-replacement-amortization-residual-value-evaluation-horizon-duty-cycle-energy-rate-and-uncertainty-ledger",
  "idle-startup-steady-state-peak-recovery-and-annualized-wall-energy",
  "one-metre-background-corrected-idle-steady-state-peak-and-recovery-acoustics",
  "assembled-volume-mass-cable-clearance-ventilation-service-access-and-tv-fit",
  "disassembly-fastener-tool-part-availability-repair-time-reassembly-and-post-repair-validation",
  "os-firmware-driver-runtime-model-package-update-rollback-offline-restart-and-maintenance-time",
  "accountless-first-path-offline-restart-network-loss-account-removal-service-and-identity-boundary",
  "controller-mapping-glyph-focus-hotplug-reconnect-home-back-pause-text-entry-and-exit",
  "camera-exposure-clock-uncertainty-drop-duplicate-inference-action-and-game-api-delivery-percentiles",
  "per-action-precision-recall-f1-miss-false-event-and-privileged-activation-counts",
  "pose-fps-game-fps-frame-time-long-frame-stall-cpu-gpu-accelerator-memory-storage-network-and-log-growth",
  "thermal-sensor-clock-throttle-fan-power-mode-and-performance-per-watt-behavior",
  "fault-containment-descendant-reap-fresh-instance-state-integrity-rebuild-and-mean-time-to-recovery",
  "failed-invalid-stopped-retried-adverse-worst-case-and-no-rescue-cell-ledger",
]);
export const COMPLETE_SYSTEM_ECONOMICS_BLOCKERS = Object.freeze([
  "cse-001-exact-five-candidate-model-revision-hardware-software-and-peripheral-tuples",
  "cse-002-same-date-jurisdiction-currency-seller-stock-shipping-tax-and-delivered-quotes",
  "cse-003-common-camera-controller-storage-power-cooling-enclosure-cable-and-display-parity",
  "cse-004-owned-x86-reuse-replacement-opportunity-cost-and-amortization-policy",
  "cse-005-evaluation-horizon-duty-cycle-electricity-labor-discount-residual-and-uncertainty-policy",
  "cse-006-common-seven-workload-content-interaction-service-account-and-mutation-contract",
  "cse-007-target-runtime-driver-model-package-update-rollback-and-clean-rebuild-tuples",
  "cse-008-room-participant-camera-exposure-clock-ground-truth-accessibility-and-safety-protocol",
  "cse-009-controller-mapping-glyph-focus-hotplug-reserved-action-and-text-entry-protocol",
  "cse-010-accountless-first-path-offline-restart-network-loss-account-removal-and-identity-protocol",
  "cse-011-wall-power-energy-thermal-clock-throttle-and-uncertainty-instrumentation",
  "cse-012-background-corrected-acoustic-size-mass-clearance-and-tv-fit-instrumentation",
  "cse-013-repair-disassembly-tools-parts-labor-reassembly-warranty-and-post-repair-protocol",
  "cse-014-update-fault-storage-pressure-power-cut-recovery-maintenance-and-rebuild-protocol",
  "cse-015-all-open-quality-performance-resource-cost-horizon-and-value-gates",
  "cse-016-randomized-schedule-invalidity-retry-no-imputation-independent-review-ranking-and-selection-rule",
  "cse-017-data-rights-privacy-retention-deletion-redaction-incident-and-publication-policy",
  "cse-018-purchase-build-account-service-participant-operation-fault-repair-qualification-and-publication-authority",
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
  "candidates",
  "comparisonContract",
  "economicProtocol",
  "workloads",
  "operationalMatrix",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "authorityBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];
const sourceDefinitions = [
  ["complete-bom-boundary", "docs/QUOTE_DATE_BOMS_2026-07-24.md"],
  ["amd-mini-pc-boundary", "docs/X86_MINI_PC_COMPARATOR_2026-07-24.md"],
  ["pi-ai-hat-boundary", "docs/RASPBERRY_PI_AI_HAT.md"],
  ["steam-machine-boundary", "docs/STEAM_MACHINE_2026.md"],
  [
    "jetson-boundary",
    "docs/JETSON_ORIN_NANO_SUPER_TENSORRT_SCREEN_2026-07-26.md",
  ],
  [
    "jetson-plan-boundary",
    "benchmarks/jetson/jetson-orin-nano-super-tensorrt-plan-v1.json",
  ],
  [
    "ordinary-x86-boundary",
    "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
  ],
  [
    "common-workload-boundary",
    "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json",
  ],
  [
    "idle-energy-boundary",
    "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json",
  ],
  [
    "controller-boundary",
    "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
  ],
  [
    "steamos-shell-boundary",
    "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
  ],
];
const candidateKeys = [
  "candidateId",
  "comparisonRole",
  "architecture",
  "platformClass",
  "lowerCostCeilingApplies",
  "exactCandidateSha256",
  "deliveredQuoteSha256",
  "completeSystemManifestSha256",
  "integratedResultSha256",
  "receivedOrAvailableForOperation",
  "mayQualifyOrRescueAnotherCandidate",
];
const workloadKeys = [
  "workloadId",
  "runtimeClass",
  "networkClass",
  "motionRole",
  "exactContentAndInteractionSha256",
];
const openAcceptanceKeys = [
  "minimumPerActionPrecisionPpm",
  "minimumPerActionRecallPpm",
  "minimumPoseFrameRateMilliHzByCandidateWorkload",
  "minimumGameFrameRateMilliHzByCandidateWorkload",
  "maximumGameFrameTimeP95UsByCandidateWorkload",
  "maximumDroppedCaptureRatePpmByCandidate",
  "maximumExposureTimestampUncertaintyUsByCandidate",
  "maximumWallPowerMilliwattsByCandidatePhase",
  "maximumAnnualEnergyMilliwattHoursByCandidate",
  "maximumOneMetreAcousticsMilliDbaByCandidatePhase",
  "maximumAssembledVolumeCubicMillimetresByCandidate",
  "maximumAssembledMassMilligramsByCandidate",
  "maximumRepairLaborSecondsByCandidateScenario",
  "maximumUpdateMaintenanceSecondsByCandidateScenario",
  "maximumFaultRecoveryP95MsByCandidateScenario",
  "maximumDeliveredCostCentsByNonPiCandidate",
  "evaluationHorizonMonths",
  "annualDutyCycleHoursByPhase",
  "electricityRateMicrosPerKwh",
  "laborRateCentsPerHour",
  "discountRatePpm",
  "residualValueCentsByCandidate",
  "ownedX86ReuseCostCents",
  "ownedX86ReplacementDeliveredCostCents",
  "minimumMaterialValueDifferenceCents",
];
const authorityNullKeys = [
  "selectedExactCandidateSetSha256",
  "approvedQuoteJurisdictionCurrencySellerAndCollectionProtocolSha256",
  "commonProductWorkloadPeripheralRoomAndInstrumentationProtocolSha256",
  "powerAcousticPhysicalRepairUpdateAccountControllerAndRecoveryProtocolSha256",
  "numericGateEconomicAssumptionUncertaintyRankingAndSelectionRuleSha256",
  "dataRightsPrivacyRetentionDeletionAndPublicationProtocolSha256",
];
const authorityFalseKeys = [
  "candidatePurchaseReturnBuildOrInstallationAuthorized",
  "candidateCameraControllerAccountServiceOrWorkloadOperationAuthorized",
  "updateFaultRepairPowerCutRecoveryOrDestructiveMutationAuthorized",
  "qualificationRankingSelectionPublicationOrTierMutationAuthorized",
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
  let value;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(value), `${label} has a bare CR`);
  return value.replaceAll("\r\n", "\n");
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

export async function validateCompleteSystemEconomicsPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, COMPLETE_SYSTEM_ECONOMICS_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "five-candidate-complete-system-economics-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-172"]);
  for (const phrase of [
    "strict zero-result complete-system economics comparison plan",
    "advertised TOPS",
    "The Raspberry Pi lower-cost ceiling applies only to its complete delivered reference build",
    "optional Steam Machine is not the default premium reference",
    "owned x86 is not free",
    "no purchase, operation, fault injection, qualification, publication, ranking, or tier mutation is authorized",
  ]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.ok(Array.isArray(plan.candidates));
  assert.equal(plan.candidates.length, COMPLETE_SYSTEM_ECONOMICS_CANDIDATES.length);
  for (const [index, candidate] of plan.candidates.entries()) {
    exactKeys(candidate, candidateKeys, `candidates[${index}]`);
    assert.deepEqual(
      [
        candidate.candidateId,
        candidate.comparisonRole,
        candidate.architecture,
        candidate.platformClass,
        candidate.lowerCostCeilingApplies,
      ],
      COMPLETE_SYSTEM_ECONOMICS_CANDIDATES[index],
    );
    for (const key of candidateKeys.slice(5, 9)) {
      assert.equal(candidate[key], null, `blocked candidate cannot bind ${key}`);
    }
    for (const key of candidateKeys.slice(9)) {
      assert.equal(candidate[key], false, `${key} must remain false`);
    }
  }

  assert.deepEqual(plan.comparisonContract, {
    candidateIds: COMPLETE_SYSTEM_ECONOMICS_CANDIDATES.map(([id]) => id),
    requiredReferenceIds: ["pi5-ai-hat26", "owned-x86-linux"],
    optionalSteamMachineId: "optional-steam-machine",
    defaultPremiumReferenceId: "owned-x86-linux",
    sameProductWorkloadPeripheralRoomAndAcceptanceContractRequired: true,
    candidateSpecificRuntimeDriverAndPackagingDifferencesMustRemainBehindReviewedInterfaces:
      true,
    proxyOrDifferentHardwareMaySubstituteExactCandidate: false,
    advertisedTopsMayRankSelectOrRescueCandidate: false,
    componentOrListPriceMaySubstituteCompleteDeliveredSystem: false,
    ownedHardwareAvailabilityMaySetEconomicCostToZero: false,
    steamMachineMayBecomeDefaultPremiumWithoutSupersedingDecision: false,
    candidateOrAggregateMayRescueAnotherCandidate: false,
  });

  assert.deepEqual(plan.economicProtocol, {
    quoteJurisdictionCurrencyAndCollectionDateSha256: null,
    sameDateCandidateQuoteSetSha256: null,
    commonPeripheralStorageCameraControllerCableAndDisplayParitySha256: null,
    evaluationHorizonDutyCycleElectricityAndDiscountPolicySha256: null,
    repairLaborToolsSparesWarrantyReturnAndReplacementPolicySha256: null,
    ownedX86ReuseReplacementAndOpportunityCostPolicySha256: null,
    currencyConversionSourceAndTimestampSha256: null,
    requiredQuoteFields: [
      "candidate-and-component-id",
      "manufacturer-model-revision-and-part-number",
      "seller-and-item-url-digest",
      "quote-observed-at-and-stock-state",
      "currency-and-destination-jurisdiction",
      "item-subtotal-discount-shipping-tax-and-delivered-total",
      "return-window-warranty-and-support-category",
    ],
    requiredCompleteSystemLines: [
      "compute-board-or-finished-system",
      "qualified-camera-and-mount",
      "required-inference-accelerator",
      "qualified-storage",
      "power-supply-and-cable",
      "cooling-and-enclosure",
      "display-audio-adapter-and-cable",
      "network-camera-and-service-cables",
      "required-fasteners-feet-and-mounting-hardware",
      "shipping-and-tax",
    ],
    piDeliveredCeilingCents: 65000,
    piCeilingExcludesTelevisionControllersToolsSparesAndPreorderedSteamMachine:
      true,
    piCeilingIncludesCameraStoragePowerCoolingAbsCablesFastenersShippingAndTax:
      true,
    steamMachinePreorderMustUseActualPaidAndDeliveredLedger: true,
    jetsonDeveloperKitMustBeDisclosedAsNonProductionReferenceHardware: true,
    ownedX86MustReportBothReuseAndReplacementParityViews: true,
    baseMsrpSubtotalOrComponentPriceMayProveDeliveredTotal: false,
    staleOrMixedDateQuoteMayProveSameDateComparison: false,
    unboundCurrencyConversionAllowed: false,
    costOrAvailabilityMayRescueFailedProductGate: false,
  });

  assert.ok(Array.isArray(plan.workloads));
  assert.equal(plan.workloads.length, COMPLETE_SYSTEM_ECONOMICS_WORKLOADS.length);
  for (const [index, workload] of plan.workloads.entries()) {
    exactKeys(workload, workloadKeys, `workloads[${index}]`);
    assert.deepEqual(
      [
        workload.workloadId,
        workload.runtimeClass,
        workload.networkClass,
        workload.motionRole,
      ],
      COMPLETE_SYSTEM_ECONOMICS_WORKLOADS[index],
    );
    assert.equal(workload.exactContentAndInteractionSha256, null);
  }

  assert.deepEqual(plan.operationalMatrix, {
    candidateIds: COMPLETE_SYSTEM_ECONOMICS_CANDIDATES.map(([id]) => id),
    workloadIds: COMPLETE_SYSTEM_ECONOMICS_WORKLOADS.map(([id]) => id),
    lifecyclePhaseIds: [...COMPLETE_SYSTEM_ECONOMICS_PHASES],
    candidateCount: 5,
    workloadCount: 7,
    lifecyclePhaseCount: 3,
    validCyclesPerCell: 20,
    cellCount: 105,
    requiredCycleCount: 2100,
    minimumSteadyStateSecondsPerCandidateWorkload: 3600,
    everyCandidateRunsEveryWorkloadAndLifecyclePhase: true,
    sameScenarioOrderingInstrumentationAndAcceptanceRulesRequired: true,
    failedInvalidStoppedRetriedAdverseAndWorstCaseCyclesRemainVisible: true,
    missingFailedOrDifferentCandidateCellMayBeImputed: false,
    aggregateMayMaskOrRescueCandidateFailure: false,
  });

  assert.deepEqual(plan.measurements, {
    requiredMetricIds: [...COMPLETE_SYSTEM_ECONOMICS_METRICS],
    independentQuotePowerAcousticPhysicalRepairUpdateAccountControllerTimingQualityPerformanceAndRecoveryOraclesRequired:
      true,
    everyCostLineCandidateCellFailureAndUncertaintyMustRemainVisible: true,
    advertisedVendorSyntheticProxyComponentOrAggregateEvidenceMaySubstituteIntegratedCandidateEvidence:
      false,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidCyclesPerCell: 20,
    minimumSteadyStateSecondsPerCandidateWorkload: 3600,
    maximumExposureToActionP95Ms: 120,
    maximumPiDeliveredReferenceBuildCents: 65000,
    maximumSteamAccountDependenciesForCoreLocalOperation: 0,
    maximumPrivilegedFalseActivations: 0,
    maximumMissingCandidateWorkloadPhaseResults: 0,
    maximumUnboundCurrencyConversions: 0,
    maximumBasePriceAsDeliveredTotalSubstitutions: 0,
    maximumAdvertisedTopsSelectionOrRescueUses: 0,
    maximumOwnedHardwareZeroCostClaims: 0,
    maximumCandidateOrAggregateRescues: 0,
    allOpenGatesMustBeFrozenBeforeOperation: true,
    everyCandidateCellMustRetainIndependentPassFailEvidence: true,
    failedProductGateMayBeOffsetByLowerCost: false,
    rankingOrSelectionAllowedBeforeCompleteReviewedMatrix: false,
  });

  exactKeys(plan.openAcceptance, openAcceptanceKeys, "openAcceptance");
  for (const key of openAcceptanceKeys) {
    assert.equal(plan.openAcceptance[key], null, `blocked plan cannot fix ${key}`);
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

  assert.deepEqual(plan.dataPolicy, {
    opaqueCandidateBuildWorkloadPhaseCycleAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawRoomPlayerCameraScreenAudioVideoOrSkeletonAllowedInRepositoryReleaseOrResult:
      false,
    namesFacesVoicesExactAgesStableDeviceIdsSerialsPathsCheckoutUrlsOrFreeTextAllowed:
      false,
    credentialsTokensCookiesAccountsProfileSaveStorageEnvironmentOrArgumentValuesAllowed:
      false,
    sellerOrderReturnWarrantyOrSupportIdentifiersAllowed: false,
    arbitraryDriverProviderServiceConsoleCrashOrCheckoutMessagesAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(
    plan.executionGate,
    [
      "status",
      "blockerCodes",
      "candidateSelectionSha256",
      "quoteSetSha256",
      "protocolSetSha256",
      "scheduleAndGateSetSha256",
      "operationAuthoritySha256",
      "independentReviewSha256",
      "mayExecute",
    ],
    "executionGate",
  );
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(
    plan.executionGate.blockerCodes,
    [...COMPLETE_SYSTEM_ECONOMICS_BLOCKERS],
  );
  for (const key of [
    "candidateSelectionSha256",
    "quoteSetSha256",
    "protocolSetSha256",
    "scheduleAndGateSetSha256",
    "operationAuthoritySha256",
    "independentReviewSha256",
  ]) {
    assert.equal(plan.executionGate[key], null, `blocked gate cannot bind ${key}`);
  }
  assert.equal(plan.executionGate.mayExecute, false);

  assert.deepEqual(plan.result, {
    status: null,
    completeMatrixResultSha256: null,
    candidateResultsById: null,
    rankedRecommendation: null,
    lowerCostReferenceMutation: null,
    premiumReferenceMutation: null,
    purchaseRecommendation: null,
  });
  return plan;
}

export async function readCompleteSystemEconomicsPlan(path = trackedPath) {
  const bytes = await readFile(path);
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  return JSON.parse(normalizedText(bytes, path));
}

async function main() {
  const plan = await readCompleteSystemEconomicsPlan();
  await validateCompleteSystemEconomicsPlan(plan);
  console.log(
    `Complete-system economics plan valid: ${plan.candidates.length} candidates, ${plan.operationalMatrix.cellCount} cells, ${plan.operationalMatrix.requiredCycleCount} cycles, ${plan.measurements.requiredMetricIds.length} metrics, ${Object.keys(plan.openAcceptance).length} open gates, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
