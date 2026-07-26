import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/usb3-ssd-fallback/pi5-usb3-ssd-fallback-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const USB3_SSD_FALLBACK_FORMAT = "vcg-pi5-usb3-ssd-fallback-plan/v1";

const topKeys = [
  "format",
  "status",
  "campaignId",
  "observedAt",
  "qualificationScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "triggerContract",
  "candidatePolicy",
  "targetBoundary",
  "phaseIds",
  "scenarioDefinitions",
  "measurements",
  "fixedAcceptance",
  "openAcceptance",
  "authorityBoundary",
  "dataPolicy",
  "executionGate",
  "result",
];

const sourceDefinitions = [
  ["usb3-ssd-candidate-and-boundary-screen", "docs/USB3_SSD_FALLBACK_SCREEN_2026-07-24.md"],
  [
    "existing-usb3-ssd-owner-questions",
    "docs/OWNER_QUESTIONS_USB3_SSD_FALLBACK_2026-07-24.md",
  ],
  [
    "microsd-trigger-and-common-storage-contract",
    "docs/MICROSD_QUALIFICATION_PROTOCOL_2026-07-24.md",
  ],
  [
    "microsd-plan-result-envelope-boundary",
    "docs/MICROSD_QUALIFICATION_ENVELOPE_2026-07-25.md",
  ],
  [
    "tracked-blocked-microsd-plan",
    "benchmarks/microsd-qualification/sandisk-high-endurance-256gb-plan-v1.json",
  ],
  ["power-cut-plan-result-validator", "scripts/validate-power-cut-campaign.mjs"],
  ["lower-cost-reference-bom-boundary", "docs/QUOTE_DATE_BOMS_2026-07-24.md"],
  ["power-recovery-state-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
];

export const USB3_SSD_PHASE_IDS = Object.freeze([
  "trigger-and-intake",
  "identity-firmware-and-health",
  "image-layout-capacity-and-full-disk",
  "boot-enumeration-and-slot-selection",
  "performance-concurrent-load-and-endurance",
  "signed-update-promotion-and-rollback",
  "scheduled-power-cut",
  "disconnect-and-intermittent-contact",
  "corruption-and-substitution",
  "blank-device-recovery-and-offline-first-boot",
  "mechanics-power-thermal-and-emi",
  "delivered-cost-service-and-review",
]);

export const USB3_SSD_SCENARIO_DEFINITIONS = Object.freeze([
  ["valid-microsd-trigger-and-root-cause-review", "trigger-and-intake"],
  ["receipt-unit-cable-mount-and-host-intake", "trigger-and-intake"],
  ["firmware-health-before-and-after-approved-update", "identity-firmware-and-health"],
  ["cold-boot-with-no-microsd", "boot-enumeration-and-slot-selection"],
  ["warm-restart-and-correct-system-slot", "boot-enumeration-and-slot-selection"],
  ["missing-drive-fail-closed-recovery", "boot-enumeration-and-slot-selection"],
  ["late-enumerating-drive-fail-closed-recovery", "boot-enumeration-and-slot-selection"],
  ["multiple-usb-storage-and-wrong-target-denial", "boot-enumeration-and-slot-selection"],
  ["production-workload-clean-and-steady-state", "performance-concurrent-load-and-endurance"],
  ["production-workload-dirty-near-full-and-reserve", "image-layout-capacity-and-full-disk"],
  [
    "sustained-writes-with-ai-camera-controller-and-cooling",
    "performance-concurrent-load-and-endurance",
  ],
  ["signed-system-ab-update-stable-power", "signed-update-promotion-and-rollback"],
  ["signed-package-promotion-and-rollback", "signed-update-promotion-and-rollback"],
  ["scheduled-power-cut-every-authoritative-state", "scheduled-power-cut"],
  [
    "disconnect-every-boot-read-write-update-and-user-state",
    "disconnect-and-intermittent-contact",
  ],
  ["intermittent-contact-every-authoritative-state", "disconnect-and-intermittent-contact"],
  [
    "partition-slot-filesystem-metadata-data-and-controller-fault",
    "corruption-and-substitution",
  ],
  ["old-cloned-wrong-and-replacement-drive", "corruption-and-substitution"],
  [
    "blank-drive-write-readback-and-offline-first-boot",
    "blank-device-recovery-and-offline-first-boot",
  ],
  [
    "supported-writer-platform-target-selection-and-readback",
    "blank-device-recovery-and-offline-first-boot",
  ],
  [
    "cable-retention-bend-connector-cycle-and-household-handling",
    "mechanics-power-thermal-and-emi",
  ],
  [
    "inrush-steady-peak-brownout-reconnect-and-shared-usb-load",
    "mechanics-power-thermal-and-emi",
  ],
  [
    "enclosure-thermal-emi-camera-and-controller-coexistence",
    "mechanics-power-thermal-and-emi",
  ],
  ["delivered-cost-volume-service-replacement-and-review", "delivered-cost-service-and-review"],
]);

export const USB3_SSD_BLOCKER_CODES = Object.freeze([
  "I021-001-valid-microsd-rejection-trigger-or-lab-sample-only-authority",
  "I021-002-exact-current-candidate-approved-seller-and-fresh-quote",
  "I021-003-received-unit-firmware-usb-cable-port-and-mount-manifest",
  "I021-004-exact-pi-power-usb-image-layout-filesystem-and-workload-tuple",
  "I021-005-service-write-endurance-performance-full-disk-and-retest-gates",
  "I021-006-uas-bot-power-current-and-independent-instrumentation-protocol",
  "I021-007-power-cut-disconnect-corruption-harness-and-safety-protocol",
  "I021-008-recovery-release-writer-target-selection-and-offline-boot-oracles",
  "I021-009-mechanical-thermal-emi-retention-and-service-protocol",
  "I021-010-delivered-cost-volume-and-d111-review",
  "I021-011-schedule-result-schema-data-retention-adverse-evidence-and-review",
  "I021-012-purchase-destructive-operation-qualification-selection-and-publication-authority",
]);

const metricIds = [
  "cold-boot-time-p50-p95-worst-ms",
  "warm-restart-time-p50-p95-worst-ms",
  "bootloader-enumeration-failure-count",
  "kernel-uas-bot-reset-disconnect-and-error-count",
  "storage-operation-latency-p50-p95-p99-worst-us",
  "image-and-update-duration-p50-p95-worst-ms",
  "application-and-block-write-bytes",
  "observable-write-amplification-ratio",
  "health-wear-and-firmware-drift",
  "usable-capacity-quota-reserve-and-full-disk-state",
  "committed-corruption-event-count",
  "unverified-or-uncommitted-launch-count",
  "incorrect-recovery-target-mutation-count",
  "valid-scheduled-cut-and-outcome-count",
  "valid-disconnect-intermittent-contact-and-outcome-count",
  "corruption-injection-detection-and-recovery-count",
  "blank-device-write-readback-and-offline-boot-count",
  "recovery-time-p50-p95-worst-ms",
  "usb-negotiated-mode-and-speed",
  "usb-and-system-inrush-peak-and-steady-milliamps",
  "system-wall-power-milliwatts",
  "undervoltage-brownout-and-reconnect-count",
  "ssd-controller-and-enclosure-temperature-millicelsius",
  "cable-retention-force-connector-cycles-and-failure-count",
  "camera-controller-and-emi-failure-count",
  "assembled-volume-and-mass",
  "fresh-delivered-cost-cents",
  "failed-invalid-stopped-retried-adverse-and-worst-case-ledger",
];

const openAcceptanceKeys = [
  "minimumCandidateAssemblyCount",
  "minimumIndependentReceivedUnitsPerAssembly",
  "minimumIndependentLotsOrManufacturingBatchesPerAssembly",
  "minimumValidWarmRestartCycles",
  "minimumValidMissingLateAndMultipleDeviceCyclesPerScenario",
  "minimumValidPowerCutsPerAuthoritativeState",
  "minimumValidDisconnectsPerAuthoritativeState",
  "minimumValidIntermittentContactTrialsPerAuthoritativeState",
  "minimumValidCorruptionTrialsPerFaultClass",
  "minimumValidRecoveryRunsPerWriterPlatformAndImage",
  "maximumColdBootP95Ms",
  "maximumWarmRestartP95Ms",
  "maximumStorageOperationP95UsByOperation",
  "maximumImageAndUpdateP95MsByOperation",
  "projectedServiceHostWriteBytes",
  "minimumEnduranceMarginRatioPpm",
  "maximumPerformanceDriftRatioPpm",
  "minimumUsbCurrentMarginMilliamps",
  "maximumSystemWallPowerMilliwattsByPhase",
  "maximumControllerOrEnclosureTemperatureMillicelsius",
  "minimumCableRetentionForceMillinewtons",
  "minimumConnectorCycleCount",
  "maximumAssembledVolumeCubicMillimetres",
  "maximumAssembledMassMilligrams",
  "maximumFreshQuoteAgeSeconds",
  "failureRootCauseRetestFamilyScopeAndTieBreakProtocolSha256",
];

const authorityNullKeys = [
  "validTriggerOrLabSampleOnlyAuthoritySha256",
  "selectedExactCandidateReceiptFirmwareCablePortAndMountManifestSha256",
  "exactPiTargetPowerUsbImageLayoutFilesystemAndWorkloadManifestSha256",
  "exactServiceProjectionEndurancePerformanceAndFullDiskProtocolSha256",
  "exactUpdatePowerCutDisconnectCorruptionAndSafetyProtocolSha256",
  "exactRecoveryReleaseWriterTargetSelectionAndOfflineBootProtocolSha256",
  "exactMechanicalThermalEmiPowerAndServiceProtocolSha256",
  "freshDeliveredQuoteAndD111ReviewSha256",
  "exactScheduleOpenGatesResultSchemaRetestAndIndependentReviewSha256",
  "dataRightsRetentionRedactionIncidentAndPublicationProtocolSha256",
];

const authorityFalseKeys = [
  "purchaseOrReturnAuthorized",
  "firmwareUpdateImageWriteOrRecoveryMediaMutationAuthorized",
  "destructiveWorkloadPowerCutDisconnectOrCorruptionAuthorized",
  "targetBootPowerUsbMechanicalOrServiceOperationAuthorized",
  "qualificationSelectionPublicationOrProductBomMutationAuthorized",
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

function validateTrigger(trigger) {
  exactKeys(
    trigger,
    [
      "requiredMicroSdPlanFormat",
      "requiredMicroSdPlanCampaignId",
      "requiredMicroSdResultFormat",
      "requiredMicroSdConclusion",
      "validRejectedMicroSdResultRequiredUnlessLabSampleOnlyAuthority",
      "microSdPlanSha256",
      "microSdResultSha256",
      "triggeringFailureCode",
      "triggeringFailureEvidenceSha256",
      "rootCauseAndArchitectureApplicabilityReviewSha256",
      "labSampleOnlyAuthoritySha256",
      "labSampleMayQualifyFallback",
      "oneCardFailureMayQualifyArbitrarySsd",
      "nonStorageOrHarnessFailureMayInvokeProductionFallback",
      "resultMayBeAddedWhileGateBlocked",
    ],
    "triggerContract",
  );
  assert.equal(trigger.requiredMicroSdPlanFormat, "vcg-microsd-qualification-plan/v1");
  assert.equal(trigger.requiredMicroSdPlanCampaignId, "sandisk-high-endurance-256gb-v1");
  assert.equal(trigger.requiredMicroSdResultFormat, "vcg-microsd-qualification-result/v1");
  assert.equal(trigger.requiredMicroSdConclusion, "rejected");
  assert.equal(trigger.validRejectedMicroSdResultRequiredUnlessLabSampleOnlyAuthority, true);
  for (const key of [
    "microSdPlanSha256",
    "microSdResultSha256",
    "triggeringFailureCode",
    "triggeringFailureEvidenceSha256",
    "rootCauseAndArchitectureApplicabilityReviewSha256",
    "labSampleOnlyAuthoritySha256",
  ]) {
    assert.equal(trigger[key], null, `triggerContract.${key} must remain open`);
  }
  for (const key of [
    "labSampleMayQualifyFallback",
    "oneCardFailureMayQualifyArbitrarySsd",
    "nonStorageOrHarnessFailureMayInvokeProductionFallback",
    "resultMayBeAddedWhileGateBlocked",
  ]) {
    assert.equal(trigger[key], false);
  }
}

function validateCandidates(policy) {
  exactKeys(
    policy,
    [
      "requiredTopologyClass",
      "screenedCandidateCount",
      "screenedCandidates",
      "selectedAssemblyManifestSha256",
      "exactReceivedUnitIdentityAndReceiptSha256",
      "exactFirmwareAndManagementLifecycleSha256",
      "exactUsbDescriptorsCablePortTopologyAndNegotiatedModeSha256",
      "exactMountRetentionAndServiceManifestSha256",
      "poweredHubOrSeparateSupplyAuthorized",
      "separateBridgeEnclosureOrCableSubstitutionAuthorized",
      "candidateMayChangeAfterFirstResult",
      "screenFactsAvailabilityPriceOrAdvertisedSpeedMaySelectOrQualify",
      "oneCandidateMayRescueAnother",
    ],
    "candidatePolicy",
  );
  assert.equal(policy.requiredTopologyClass, "integrated-portable-ssd-bus-powered");
  assert.equal(policy.screenedCandidateCount, 2);
  assert.deepEqual(policy.screenedCandidates, [
    {
      candidateId: "kingston-xs1000-1tb-black",
      manufacturer: "Kingston",
      model: "XS1000 1TB black",
      exactPartNumber: "SXS1000/1000G",
      nominalCapacityBytes: 1000000000000,
      screenDisposition: "desk-lead-unavailable-unpriced-not-selected",
      screenObservedItemPriceCents: null,
      sourceFactsMaySelectPurchaseOrQualify: false,
    },
    {
      candidateId: "samsung-t7-shield-1tb-black",
      manufacturer: "Samsung",
      model: "T7 Shield 1TB black",
      exactPartNumber: "MU-PE1T0S/AM",
      nominalCapacityBytes: 1000000000000,
      screenDisposition: "desk-screen-cost-failure-not-selected",
      screenObservedItemPriceCents: 28799,
      sourceFactsMaySelectPurchaseOrQualify: false,
    },
  ]);
  for (const key of [
    "selectedAssemblyManifestSha256",
    "exactReceivedUnitIdentityAndReceiptSha256",
    "exactFirmwareAndManagementLifecycleSha256",
    "exactUsbDescriptorsCablePortTopologyAndNegotiatedModeSha256",
    "exactMountRetentionAndServiceManifestSha256",
  ]) {
    assert.equal(policy[key], null, `candidatePolicy.${key} must remain open`);
  }
  for (const key of [
    "poweredHubOrSeparateSupplyAuthorized",
    "separateBridgeEnclosureOrCableSubstitutionAuthorized",
    "candidateMayChangeAfterFirstResult",
    "screenFactsAvailabilityPriceOrAdvertisedSpeedMaySelectOrQualify",
    "oneCandidateMayRescueAnother",
  ]) {
    assert.equal(policy[key], false);
  }
}

function validateTarget(target) {
  exactKeys(
    target,
    [
      "targetId",
      "exactBoardEepromKernelFirmwareAndDriverManifestSha256",
      "exactPowerCoolingHatCameraControllerAndUsbTopologySha256",
      "exactSignedImageLayoutFilesystemAndMountPolicySha256",
      "exactWorkloadUpdateRecoveryAndServiceProjectionSha256",
      "storageConnection",
      "powerInput",
      "microSdMustBeAbsentForBootQualification",
      "unsafeUsbCurrentOverrideAllowed",
      "extraStorageDevicesMaySelectRecoveryTarget",
      "windowsDesktopOrOtherBoardProxyMayQualify",
    ],
    "targetBoundary",
  );
  assert.equal(target.targetId, "pi5-ai-hat26-lower-cost-reference");
  for (const key of [
    "exactBoardEepromKernelFirmwareAndDriverManifestSha256",
    "exactPowerCoolingHatCameraControllerAndUsbTopologySha256",
    "exactSignedImageLayoutFilesystemAndMountPolicySha256",
    "exactWorkloadUpdateRecoveryAndServiceProjectionSha256",
  ]) {
    assert.equal(target[key], null, `targetBoundary.${key} must remain open`);
  }
  assert.equal(target.storageConnection, "pi5-usb3-type-a");
  assert.equal(target.powerInput, "pi5-usb-c-5v5a-reference-supply");
  assert.equal(target.microSdMustBeAbsentForBootQualification, true);
  assert.equal(target.unsafeUsbCurrentOverrideAllowed, false);
  assert.equal(target.extraStorageDevicesMaySelectRecoveryTarget, false);
  assert.equal(target.windowsDesktopOrOtherBoardProxyMayQualify, false);
}

export async function validateUsb3SsdFallbackPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, USB3_SSD_FALLBACK_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "i021-pi5-usb3-ssd-fallback-2026-07-26");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, [
    "I-021",
    "I-022",
    "I-202",
    "Q-086",
    "Q-196",
    "Q-199",
    "Q-200",
    "Q-201",
    "Q-202",
  ]);
  assert.ok(
    typeof plan.claimBoundary === "string" &&
      plan.claimBoundary.length >= 800 &&
      plan.claimBoundary.includes("No purchase") &&
      plan.claimBoundary.includes("cannot qualify"),
    "claimBoundary is incomplete",
  );
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);
  validateTrigger(plan.triggerContract);
  validateCandidates(plan.candidatePolicy);
  validateTarget(plan.targetBoundary);

  assert.deepEqual(plan.phaseIds, USB3_SSD_PHASE_IDS);
  assert.deepEqual(
    plan.scenarioDefinitions.map(({ scenarioId, phaseId }) => [scenarioId, phaseId]),
    USB3_SSD_SCENARIO_DEFINITIONS,
  );
  assert.equal(plan.scenarioDefinitions.length, 24);
  for (const [index, scenario] of plan.scenarioDefinitions.entries()) {
    exactKeys(scenario, ["scenarioId", "phaseId"], `scenarioDefinitions[${index}]`);
    assert.ok(plan.phaseIds.includes(scenario.phaseId));
  }

  exactKeys(
    plan.measurements,
    [
      "requiredMetricIds",
      "independentBootStoragePowerCutDisconnectCorruptionRecoveryPowerThermalMechanicalCostAndClockOraclesRequired",
      "vendorToolUiKernelAttachmentAdvertisedSpeedOrFilesystemMountMaySubstituteForSemanticEvidence",
      "everyScheduledAttemptFailureInvalidationRetryAndWorstCaseMustRemainVisible",
    ],
    "measurements",
  );
  assert.deepEqual(plan.measurements.requiredMetricIds, metricIds);
  assert.equal(
    plan.measurements
      .independentBootStoragePowerCutDisconnectCorruptionRecoveryPowerThermalMechanicalCostAndClockOraclesRequired,
    true,
  );
  assert.equal(
    plan.measurements
      .vendorToolUiKernelAttachmentAdvertisedSpeedOrFilesystemMountMaySubstituteForSemanticEvidence,
    false,
  );
  assert.equal(
    plan.measurements.everyScheduledAttemptFailureInvalidationRetryAndWorstCaseMustRemainVisible,
    true,
  );

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidColdBootCycles: 100,
    maximumCommittedCorruptionEvents: 0,
    maximumUnverifiedOrUncommittedLaunches: 0,
    maximumIncorrectRecoveryTargetMutations: 0,
    maximumUnsafeUsbCurrentOverrides: 0,
    maximumSilentUasToBotDowngrades: 0,
    maximumUnexpectedUsbResetsOrDisconnects: 0,
    maximumUnauthorizedCapacityQuotaOrPolicyExpansions: 0,
    maximumMissingScheduledAttempts: 0,
    maximumCandidatePhaseOrAggregateRescues: 0,
    maximumLowerCostReferenceDeliveredCents: 65000,
    coldBootWithoutMicroSdRequired: true,
    sameLogicalStorageUpdateRecoveryPrivacyAndPermanentLossContractRequired: true,
    everyRequiredPhaseScenarioAndExactAssemblyMustPass: true,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
    extraCapacityMayRelaxQuotasWritesOrSupportedContentPromise: false,
    failedGateMayBeOffsetBySpeedCapacityCostOrAnotherCandidate: false,
    screenFactsVendorClaimsUsbAttachmentOneBootOrPartialCampaignMayQualify: false,
    allOpenGatesScheduleResultSchemaAndReviewRulesMustBeFrozenBeforeOperation: true,
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
    opaqueCandidateUnitLotCableMountTargetScenarioAttemptFaultAndReasonLabelsRequired: true,
    closedCountsTimingsDigestsMetricsCostsAndRedactedCategoriesRequired: true,
    rawUsbDescriptorsSerialsSmartValuesOrFirmwareToolPayloadsAllowed: false,
    sellerReceiptOrderReturnWarrantyOrSupportIdentifiersAllowed: false,
    hostnamesUsernamesPathsEnvironmentArgumentsOrFilesystemValuesAllowed: false,
    profileSaveRetroContentBrowserDataCredentialsTokensKeysOrSecretsAllowed: false,
    cameraScreenAudioVideoControllerPayloadOrHouseholdMediaAllowed: false,
    freeTextKernelFirmwareFilesystemToolRecoveryOrResultLogsAllowed: false,
    failedInvalidStoppedRetriedAdverseAndWorstCaseEvidenceMustRemainVisible: true,
  });

  exactKeys(plan.executionGate, ["status", "blockerCodes"], "executionGate");
  assert.equal(plan.executionGate.status, "blocked");
  assert.deepEqual(plan.executionGate.blockerCodes, USB3_SSD_BLOCKER_CODES);
  assert.equal(plan.result, null);
  return plan;
}

export async function parseUsb3SsdFallbackPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "USB 3 SSD fallback plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical two-space JSON with one trailing newline",
  );
  return validateUsb3SsdFallbackPlan(plan, repositoryRoot);
}

export async function readUsb3SsdFallbackPlan(path = trackedPath) {
  return parseUsb3SsdFallbackPlanBytes(await readFile(path), root);
}

async function main() {
  const plan = await readUsb3SsdFallbackPlan();
  console.log(
    `USB 3 SSD fallback plan valid: ${plan.phaseIds.length} phases, ${plan.scenarioDefinitions.length} scenarios, ${plan.executionGate.blockerCodes.length} blockers.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
