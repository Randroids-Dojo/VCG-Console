import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/depth-interference/cross-device-ir-interference-safety-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const IR_INTERFERENCE_FORMAT =
  "vcg-cross-device-ir-interference-safety-plan/v1";

export const IR_MODE_IDS = Object.freeze([
  "oak-d-pro-w-passive-stereo",
  "oak-d-pro-w-active-dot-940nm",
  "oak-d-pro-w-flood-mono-ir-940nm",
  "orbbec-gemini-335l-passive-stereo",
  "orbbec-gemini-335l-active-850nm",
  "realsense-d455-passive-stereo",
  "realsense-d455-projector-on-wavelength-unbound",
]);

export const IR_TRANSITION_IDS = Object.freeze([
  "sunlight-enter",
  "sunlight-exit",
  "matte-to-mirror",
  "mirror-to-matte",
  "no-interferer-to-active",
  "active-to-off",
  "commanded-observed-emitter-disagreement",
  "invalid-depth-burst-recovery",
]);

export const IR_COMPOUND_SCENE_IDS = Object.freeze([
  "diffuse-window-matte-no-external-ir-control",
  "oblique-sun-patch-mirror-cross-vendor-850nm",
  "backlit-window-glass-cross-vendor-940nm",
  "moving-sun-patch-polished-metal-same-model-active",
  "bright-sky-reflection-glossy-floor-tv-remote-bursts",
  "indoor-control-glossy-tv-reviewed-night-vision-illuminator",
]);

export const IR_BLOCKERS = Object.freeze([
  "ir-001-exact-received-devices-revisions-firmware-condition-cables-mounts-calibrations-and-seven-modes",
  "ir-002-exact-emitter-flood-source-wavelength-intensity-temperature-protection-and-state-observers",
  "ir-003-geography-legal-regulatory-laser-ir-electrical-child-safety-lab-records-and-stop-authority",
  "ir-004-room-window-sun-weather-instruments-exclusion-zone-and-repeatability",
  "ir-005-reflective-fixtures-beam-paths-barriers-operator-location-and-removal",
  "ir-006-external-ir-devices-output-duty-orientation-separation-power-and-state",
  "ir-007-presets-exposure-gain-hdr-filters-intensity-synchronization-and-mitigation-lanes",
  "ir-008-bench-fixture-independent-ground-truth-instruments-uncertainty-and-invalid-run-rules",
  "ir-009-transition-soak-stop-cooldown-emitter-off-quarantine-restart-and-incident-rules",
  "ir-010-adult-child-consent-assent-guardian-exposure-privacy-stop-deletion-and-adverse-events",
  "ir-011-all-open-numeric-gates-uncertainty-and-per-cell-disposition",
  "ir-012-operation-diagnostic-publication-selection-purchase-and-bom-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "candidateModes",
  "authorityBoundary", "safetyBoundary", "benchMatrix", "transitionCampaign",
  "soakCampaign", "humanPhase", "measurements", "fixedAcceptance",
  "openAcceptance", "dataPolicy", "executionGate", "result",
];

const sourceDefinitions = [
  ["campaign-contract", "docs/CROSS_DEVICE_IR_INTERFERENCE_SAFETY_CAMPAIGN_2026-07-26.md"],
  ["oak-rgb-depth-candidate-boundary", "benchmarks/depth-comparison/oak-d-pro-w-rgb-depth-comparison-plan-v1.json"],
  ["orbbec-candidate-boundary", "benchmarks/orbbec/gemini-335l-linux-target-plan-v1.json"],
  ["realsense-candidate-boundary", "benchmarks/realsense/d455-linux-target-plan-v1.json"],
  ["depth-option-research-boundary", "docs/RESEARCH.md"],
  ["prototype-acceptance-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["camera-capture-lighting-boundary", "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json"],
  ["exposure-to-action-proof-boundary", "scripts/validate-camera-action-latency-campaign.mjs"],
];

const candidateModes = [
  ["oak-d-pro-w-passive-stereo", "oak-d-pro-w-a00573", "Luxonis", "OAK-D Pro W IMX378", "A00573", "passive-stereo", "off", null, "not-applicable-source-off"],
  ["oak-d-pro-w-active-dot-940nm", "oak-d-pro-w-a00573", "Luxonis", "OAK-D Pro W IMX378", "A00573", "active-dot-stereo", "dot-projector", 940, "official-product-documentation-bound"],
  ["oak-d-pro-w-flood-mono-ir-940nm", "oak-d-pro-w-a00573", "Luxonis", "OAK-D Pro W IMX378", "A00573", "flood-mono-ir-exploratory", "flood-illuminator", 940, "official-product-documentation-bound"],
  ["orbbec-gemini-335l-passive-stereo", "orbbec-gemini-335l-g40055-170", "Orbbec", "Gemini 335L", "G40055-170", "passive-stereo", "off", null, "not-applicable-source-off"],
  ["orbbec-gemini-335l-active-850nm", "orbbec-gemini-335l-g40055-170", "Orbbec", "Gemini 335L", "G40055-170", "active-stereo", "laser-projector", 850, "candidate-plan-official-source-bound"],
  ["realsense-d455-passive-stereo", "realsense-d455-82635dsd455-999wct", "RealSense", "Depth Camera D455", "82635DSD455/999WCT", "passive-stereo", "off", null, "not-applicable-source-off"],
  ["realsense-d455-projector-on-wavelength-unbound", "realsense-d455-82635dsd455-999wct", "RealSense", "Depth Camera D455", "82635DSD455/999WCT", "projector-on-active-stereo", "projector", null, "official-received-unit-evidence-required"],
].map(([
  modeId, candidateId, manufacturer, product, exactSkuOrModel, modeClass,
  illuminationSource, nominalWavelengthNm, wavelengthStatus,
]) => ({
  modeId, candidateId, manufacturer, product, exactSkuOrModel, modeClass,
  illuminationSource, nominalWavelengthNm, wavelengthStatus,
  blocking: true,
  operationAuthorized: false,
}));

const requiredMeasurements = [
  "commanded-and-independently-observed-projector-flood-and-external-ir-state",
  "irradiance-or-reviewed-vendor-approved-proxy-with-uncertainty",
  "ambient-visible-and-ir-condition-with-time-weather-and-geometry",
  "surface-material-reflectance-incidence-and-beam-path-geometry",
  "camera-fixture-participant-and-interferer-distance-orientation",
  "device-host-room-usb-and-wall-power-temperature-and-throttling",
  "rgb-ir-saturation-valid-depth-fill-false-depth-missing-depth-and-instability",
  "depth-rgb-alignment-exposure-device-host-and-application-timestamps",
  "captured-dropped-duplicate-corrupt-out-of-order-and-stale-frames",
  "transition-detection-fail-closed-output-rejection-and-healthy-return-time",
  "independent-fixture-depth-pose-action-and-participant-absent-ground-truth",
  "operator-stop-barrier-breach-discomfort-entry-damage-and-incident-ledger",
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

export async function validateCrossDeviceIrInterferenceSafetyPlan(
  plan,
  repositoryRoot = root,
) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, IR_INTERFERENCE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-device-ir-interference-safety-v1");
  assert.equal(plan.observedAt, "2026-07-26");
  assert.deepEqual(plan.qualificationScope, ["I-045", "Q-018", "Q-025"]);
  assert.match(plan.claimBoundary, /strict zero-result/u);
  assert.match(plan.claimBoundary, /No camera purchase/u);
  assert.match(plan.claimBoundary, /No camera purchase[\s\S]*BOM change is authorized/u);
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.candidateModes, candidateModes);
  assert.deepEqual(plan.candidateModes.map(({ modeId }) => modeId), [...IR_MODE_IDS]);
  assert.equal(plan.candidateModes[1].nominalWavelengthNm, 940);
  assert.equal(plan.candidateModes[2].nominalWavelengthNm, 940);
  assert.equal(plan.candidateModes[4].nominalWavelengthNm, 850);
  assert.equal(plan.candidateModes[6].nominalWavelengthNm, null);
  assert.equal(
    plan.candidateModes[6].wavelengthStatus,
    "official-received-unit-evidence-required",
  );

  exactKeys(plan.authorityBoundary, [
    "exactReceivedDeviceManifestSha256", "exactFirmwareAndModeManifestSha256",
    "roomSunWeatherAndInstrumentProtocolSha256", "reflectiveFixtureAndBeamPathProtocolSha256",
    "externalIrDeviceAndStateProtocolSha256", "benchFixtureAndGroundTruthProtocolSha256",
    "transitionSoakAndStopProtocolSha256", "participantConsentAssentAndExposureProtocolSha256",
    "legalRegulatoryAndSafetyReviewSha256", "measurementAndAcceptanceProtocolSha256",
    "operatorScheduleAndIncidentProtocolSha256", "deviceAccessOrOperationAuthorized",
    "irEmitterFloodOrExternalSourceUseAuthorized", "sunlightReflectiveOrCompoundStagingAuthorized",
    "faultOrTransitionInjectionAuthorized", "adultParticipationAuthorized",
    "childParticipationAuthorized", "temporaryDiagnosticImageDepthIrOrPointCloudCollectionAuthorized",
    "resultPublicationAuthorized", "cameraSelectionPurchaseOrBomChangeAuthorized",
  ], "authorityBoundary");
  for (const key of Object.keys(plan.authorityBoundary).slice(0, 11)) {
    assert.equal(plan.authorityBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of Object.keys(plan.authorityBoundary).slice(11)) {
    assert.equal(plan.authorityBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.safetyBoundary, {
    vendorClassificationsAreFactsNotProjectAuthority: true,
    emittersAndFloodsDefaultOff: true,
    damagedOpenedModifiedUnofficiallyFlashedFilteredOrMismatchedDeviceMayOperate: false,
    magnifyingOpticsAllowed: false,
    deliberateDirectSunAimingAllowed: false,
    personOrAnimalAllowedInDirectOrSpecularBenchPath: false,
    independentCommandedAndObservedEmitterStateRequired: true,
    observerDisagreementMeansUnknownAndImmediateStop: true,
    unexpectedPersonAnimalReflectionTemperatureDamageBarrierOrOperatorControlEventStopsCampaign: true,
    stoppedFailedOrUnsafeModeMayBeRescuedByRecoveryAccuracyOrAnotherMode: false,
    exactReceivedRevisionFirmwareEnclosureIntensityDistanceDurationTemperatureAndGeographyRequired: true,
    reviewedBarriersInstrumentsOperatorStopCooldownQuarantineAndIncidentResponseRequired: true,
  });

  exactKeys(plan.benchMatrix, [
    "modeIds", "validRunsPerCell",
    "participantFreeCalibratedFixtureRequired", "balancedRandomizedRunOrderRequired",
    "allInvalidStoppedRetriedAndInterruptedRunsRemainVisible",
    "matrixConditionIdsFrozenBeforeOperation",
    "oneModeConditionDistanceSurfaceInterfererOrientationOrSceneMayRescueAnother",
    "sunlight", "reflection", "otherIr", "compound",
    "requiredTotalCellCount", "requiredTotalRunCount",
  ], "benchMatrix");
  assert.deepEqual(plan.benchMatrix.modeIds, [...IR_MODE_IDS]);
  assert.equal(plan.benchMatrix.validRunsPerCell, 20);
  assert.equal(plan.benchMatrix.participantFreeCalibratedFixtureRequired, true);
  assert.equal(plan.benchMatrix.balancedRandomizedRunOrderRequired, true);
  assert.equal(plan.benchMatrix.allInvalidStoppedRetriedAndInterruptedRunsRemainVisible, true);
  assert.equal(plan.benchMatrix.matrixConditionIdsFrozenBeforeOperation, true);
  assert.equal(
    plan.benchMatrix.oneModeConditionDistanceSurfaceInterfererOrientationOrSceneMayRescueAnother,
    false,
  );
  assert.deepEqual(plan.benchMatrix.sunlight, {
    conditionIds: [
      "indoor-control", "diffuse-window-daylight",
      "oblique-sun-patch-outside-optical-axis", "backlit-window",
      "moving-background-sun-patch", "bright-sky-window-reflection",
    ],
    subjectDistanceMm: [1500, 2500, 3500],
    requiredCellCount: 126,
    requiredRunCount: 2520,
  });
  assert.deepEqual(plan.benchMatrix.reflection, {
    surfaceIds: [
      "matte-control", "powered-off-glossy-tv", "clear-window-glass",
      "household-mirror", "polished-metal", "glossy-floor-fixture",
    ],
    incidenceAngleDegrees: [0, 45, 75],
    requiredCellCount: 126,
    requiredRunCount: 2520,
  });
  assert.deepEqual(plan.benchMatrix.otherIr, {
    interfererIds: [
      "none-control", "second-same-model-active-camera",
      "cross-vendor-850nm-camera", "cross-vendor-940nm-camera",
      "tv-remote-bursts", "reviewed-ir-night-vision-illuminator",
    ],
    separationMm: [1000, 2000, 3000],
    orientationIds: [
      "same-optical-axis", "crossing-fields-of-view", "back-to-back-control",
    ],
    requiredCellCount: 378,
    requiredRunCount: 7560,
  });
  assert.deepEqual(plan.benchMatrix.compound, {
    sceneIds: [...IR_COMPOUND_SCENE_IDS],
    subjectDistanceMm: [1500, 2500, 3500],
    requiredCellCount: 126,
    requiredRunCount: 2520,
  });
  const benchCellCount = 126 + 126 + 378 + 126;
  assert.equal(plan.benchMatrix.requiredTotalCellCount, benchCellCount);
  assert.equal(
    plan.benchMatrix.requiredTotalRunCount,
    benchCellCount * plan.benchMatrix.validRunsPerCell,
  );

  assert.deepEqual(plan.transitionCampaign, {
    modeIds: [...IR_MODE_IDS],
    transitionIds: [...IR_TRANSITION_IDS],
    validCyclesPerModeTransitionCell: 20,
    requiredModeTransitionCellCount: 56,
    requiredTransitionCycleCount: 1120,
    detectionFailClosedStaleOutputRejectionAndHealthyReturnRequired: true,
    automaticRetryMayHideFailure: false,
    laterRecoveryOrAnotherTransitionModeMayRescueFailure: false,
  });
  assert.equal(
    plan.transitionCampaign.requiredModeTransitionCellCount,
    IR_MODE_IDS.length * IR_TRANSITION_IDS.length,
  );
  assert.equal(
    plan.transitionCampaign.requiredTransitionCycleCount,
    plan.transitionCampaign.requiredModeTransitionCellCount
      * plan.transitionCampaign.validCyclesPerModeTransitionCell,
  );

  assert.deepEqual(plan.soakCampaign, {
    modeIds: [...IR_MODE_IDS],
    validOneHourSoaksPerMode: 3,
    minimumMeasuredSecondsPerSoak: 3600,
    requiredSoakCount: 21,
    continuousStateThermalPowerFrameDepthAndStopObservationRequired: true,
    interruptedStoppedOrInvalidSoakMayBeSilentlyReplaced: false,
    oneSoakOrModeMayRescueAnother: false,
  });
  assert.equal(
    plan.soakCampaign.requiredSoakCount,
    IR_MODE_IDS.length * plan.soakCampaign.validOneHourSoaksPerMode,
  );

  assert.deepEqual(plan.humanPhase, {
    status: "blocked",
    executionRequiresModeSpecificCompleteBenchTransitionSoakSafetyAndNumericGates: true,
    modeIds: [...IR_MODE_IDS],
    personaClasses: ["school-age-child-standing", "adult-standing"],
    placementIds: [
      "center", "near-left-edge", "near-right-edge", "far-left-edge", "far-right-edge",
    ],
    motionIds: [
      "neutral-full-body", "jump", "duck", "dodge-left", "dodge-right",
    ],
    compoundSceneIds: [...IR_COMPOUND_SCENE_IDS],
    validTrialsPerCell: 20,
    requiredCellCount: 2100,
    requiredTrialCount: 42000,
    participantAbsentNegativeDistanceMm: [1500, 2500, 3500],
    requiredParticipantAbsentNegativeSessionCount: 126,
    samePersonRoomModePlacementMotionSceneAndExposureProtocolRequired: true,
    consentAssentGuardianPrivacyExposureStopDeletionAndAdverseEventProtocolRequired: true,
    independentPoseActionAndSafetyGroundTruthRequired: true,
    benchSuccessMayAuthorizePeopleOrEstablishChildSafety: false,
    onePersonaPlacementMotionSceneOrModeMayRescueAnother: false,
  });
  const humanCellCount = IR_MODE_IDS.length * 2 * 5 * 5 * IR_COMPOUND_SCENE_IDS.length;
  assert.equal(plan.humanPhase.requiredCellCount, humanCellCount);
  assert.equal(
    plan.humanPhase.requiredTrialCount,
    humanCellCount * plan.humanPhase.validTrialsPerCell,
  );
  assert.equal(
    plan.humanPhase.requiredParticipantAbsentNegativeSessionCount,
    IR_MODE_IDS.length * IR_COMPOUND_SCENE_IDS.length
      * plan.humanPhase.participantAbsentNegativeDistanceMm.length,
  );

  assert.deepEqual(plan.measurements, {
    requiredMeasurements,
    independentGroundTruthRequired: true,
    candidateDepthMayLabelItself: false,
    vendorClaimScreenshotOrOneFrameMaySubstituteMeasurement: false,
    captureArrivalMaySubstituteExposureTimestamp: false,
    meanAggregateOrBestCaseMayHideWorstCell: false,
    perModeCellRunTransitionSoakStopRetryAndWorstCaseReportingRequired: true,
  });

  assert.deepEqual(plan.fixedAcceptance, {
    minimumValidRunsPerBenchCell: 20,
    minimumValidTransitionCyclesPerModeTransitionCell: 20,
    minimumValidOneHourSoaksPerMode: 3,
    minimumValidHumanTrialsPerCellIfAuthorized: 20,
    maximumUnknownOrDisagreedEmitterStateObservations: 0,
    maximumUnreviewedDirectOrSpecularPathEntries: 0,
    maximumUnexpectedPersonOrAnimalBenchEntries: 0,
    maximumSilentlyDiscardedInvalidStoppedRetriedOrInterruptedRuns: 0,
    allGatesMustBeFrozenBeforeOperation: true,
    aggregateRecoveryMitigationOrCrossModeRescueAllowed: false,
  });

  exactKeys(plan.openAcceptance, [
    "maximumIrradianceOrProxy", "maximumAmbientVisibleLevel", "maximumAmbientIrLevel",
    "maximumDeviceTemperatureMilliC", "maximumWallPowerMilliW", "maximumUsbPowerMilliW",
    "maximumRgbSaturationPpm", "maximumIrSaturationPpm", "minimumValidDepthFillPpm",
    "maximumFalseDepthPpm", "maximumMissingDepthPpm", "maximumDepthInstabilityP95Mm",
    "maximumDepthErrorP95Mm", "maximumRgbDepthAlignmentErrorP95Pixels",
    "maximumTimestampErrorP95Us", "maximumHealthyReturnTimeUs",
    "minimumTriggerPrecisionPpm", "minimumTriggerRecallPpm",
    "maximumUnintendedPrivilegedActionsPerNegativeSession",
    "minimumPredeclaredMaterialBenefitPpm",
  ], "openAcceptance");
  for (const [key, value] of Object.entries(plan.openAcceptance)) {
    assert.equal(value, null, `pre-operation gate ${key} must remain null`);
  }

  assert.deepEqual(plan.dataPolicy, {
    rawRgbDepthIrPointCloudAudioOrVideoAllowedInRepositoryOrRelease: false,
    participantNamesFacesVoicesExactAgesAddressesOrStableIdentifiersAllowed: false,
    deviceSerialNumbersPathsCredentialsSecretsOrUnredactedLogsAllowed: false,
    freeTextResultEvidenceAllowed: false,
    temporaryRawDiagnosticsRequireSeparateAuthorityConsentSecurityAndDeletionProtocol: true,
    closedVocabularyPathFreeAggregateEvidenceRequired: true,
    networkEgressAllowed: false,
  });

  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...IR_BLOCKERS],
  });

  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    receivedDeviceCount: 0,
    qualifiedFixtureCount: 0,
    participantCount: 0,
    completedBenchCellCount: 0,
    completedBenchRunCount: 0,
    completedTransitionCycleCount: 0,
    completedSoakCount: 0,
    completedHumanCellCount: 0,
    completedHumanTrialCount: 0,
    completedParticipantAbsentNegativeSessionCount: 0,
    qualifiedModeIds: [],
    safetyConclusionIds: [],
    materialDepthBenefitIds: [],
    selectedCameraOrModeIds: [],
    purchaseOrBomRecommendation: null,
  });

  return plan;
}

export async function parseCrossDeviceIrInterferenceSafetyPlanBytes(
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
  await validateCrossDeviceIrInterferenceSafetyPlan(plan, repositoryRoot);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseCrossDeviceIrInterferenceSafetyPlanBytes(
      await readFile(absolute),
    );
    console.log(
      `${absolute}: valid blocked ${plan.benchMatrix.requiredTotalCellCount}-cell,`
      + ` ${plan.benchMatrix.requiredTotalRunCount}-run,`
      + ` ${plan.transitionCampaign.requiredTransitionCycleCount}-transition-cycle,`
      + ` ${plan.soakCampaign.requiredSoakCount}-soak,`
      + ` ${plan.humanPhase.requiredTrialCount}-blocked-human-trial I-045 plan`,
    );
  }
}
