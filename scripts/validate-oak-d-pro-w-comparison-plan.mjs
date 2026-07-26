import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/depth-comparison/oak-d-pro-w-rgb-depth-comparison-plan-v1.json",
);
const MAX_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const OAK_COMPARISON_FORMAT = "vcg-oak-d-pro-w-rgb-depth-comparison-plan/v1";
export const OAK_COMPARISON_LANES = Object.freeze([
  "shared-uvc-rgb-host-mediapipe-control",
  "oak-central-rgb-host-mediapipe-camera-control",
  "oak-rgb-plus-passive-stereo-depth-candidate",
  "oak-rgb-plus-dot-projector-active-stereo-depth-candidate",
  "oak-mono-ir-plus-flood-and-active-stereo-low-light-exploratory",
]);
export const OAK_COMPARISON_BLOCKERS = Object.freeze([
  "received-exact-oak-device-and-fresh-delivered-quote",
  "qualified-shared-rgb-camera-room-geometry-capture-lens-and-visual-baselines",
  "exact-target-mount-co-registration-power-and-usb-topologies",
  "pinned-depthai-firmware-runtime-pipelines-and-depth-fusion-algorithm",
  "cross-camera-exposure-rgb-depth-synchronization-and-ground-truth",
  "numeric-depth-floor-overlap-skew-overhead-power-thermal-cost-and-benefit-gates",
  "one-player-gates-before-two-player-i054-overlap-execution",
  "ir-emitter-safety-i045-interference-and-participant-review",
  "participant-consent-assent-data-handling-and-deletion-protocols",
  "room-participant-camera-firmware-emitter-purchase-operators-and-schedule-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "candidateSnapshot",
  "collectionBoundary", "comparisonLanes", "sessionDesign", "onePlayerMatrix",
  "twoPlayerOverlapMatrix", "measurements", "acceptance", "costPolicy", "dataPolicy",
  "irSafetyPolicy", "executionGate", "result",
];
const sourceDefinitions = [
  ["oak-d-pro-w-official-source-screen", "docs/OAK_D_PRO_W_CANDIDATE_SCREEN_2026-07-25.md"],
  ["rgb-depth-product-decisions", "docs/DECISIONS.md"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["shared-wide-rgb-camera-plan", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-capture-and-lighting-plan", "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json"],
  ["lens-calibration-plan", "benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json"],
  ["visual-robustness-plan", "benchmarks/visual-robustness/cross-tier-visual-robustness-plan-v1.json"],
  ["rgb-depth-floor-contact-plan", "benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json"],
  ["first-real-room-one-player-plan", "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json"],
];
const collectionKeys = [
  "receivedOakDeviceIdentitySha256", "selectedSharedRgbCameraResultSha256",
  "oakCameraCalibrationAndModeMatrixSha256", "ordinaryX86LinuxTargetConfigurationSha256",
  "steamOsTargetConfigurationSha256", "raspberryPiTargetConfigurationSha256",
  "roomSurveyAndSafeZoneResultSha256", "cameraMountAndCoRegistrationProtocolSha256",
  "crossCameraExposureSynchronizationProtocolSha256",
  "depthAiRuntimeFirmwareAndPipelineManifestSha256", "depthFusionAlgorithmSha256",
  "independentPoseActionFloorAndOverlapGroundTruthProtocolSha256",
  "irEmitterSafetyAndInterferenceProtocolSha256", "participantConsentAndAssentProtocolSha256",
  "dataHandlingProtocolSha256", "powerThermalUsbInstrumentationProtocolSha256",
  "deliveredCostQuoteSha256", "scheduleSha256", "roomAccessAuthorized",
  "adultParticipationAuthorized", "childParticipationAuthorized", "cameraCollectionAuthorized",
  "oakFirmwareOrPipelineMutationAuthorized", "irEmitterUseAuthorized",
  "temporaryDiagnosticImageCollectionAuthorized", "purchaseAuthorized",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
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
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return text.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(
      absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateOakComparisonPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, OAK_COMPARISON_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "oak-d-pro-w-versus-shared-wide-rgb-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-042"]);
  for (const phrase of [
    "No OAK-D Pro W", "Vendor range", "candidate facts", "One streamed frame",
    "cannot establish that depth materially improves another target",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.candidateSnapshot, {
    manufacturer: "Luxonis",
    product: "OAK-D Pro W",
    centralRgbVariant: "IMX378",
    sku: "A00573",
    architecture: "RVC2",
    connection: "USB",
    officialProductUrl: "https://shop.luxonis.com/products/oak-d-pro-w",
    officialDocumentationUrl: "https://docs.luxonis.com/hardware/products/OAK-D%20Pro%20W",
    observedListPriceUsdCents: 52900,
    observedAvailability: "in-stock",
    observedAt: "2026-07-25",
    deliveredQuoteSha256: null,
    merchandiseObservationMayAuthorizePurchaseOrSelection: false,
  });

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 18)) {
    assert.equal(plan.collectionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of collectionKeys.slice(18)) {
    assert.equal(plan.collectionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.comparisonLanes, {
    laneIds: [...OAK_COMPARISON_LANES],
    blockingLaneIds: OAK_COMPARISON_LANES.slice(0, 4),
    exploratoryLaneIds: [OAK_COMPARISON_LANES[4]],
    onDeviceNeuralInferenceAllowedInBlockingLanes: false,
    oakRgbOnlyCameraControlRequired: true,
    passiveAndActiveStereoMustRemainSeparate: true,
    exploratoryMonoIrMayRescueBlockingFailure: false,
    oakRgbImprovementMayBeAttributedToDepth: false,
    oneLaneOrTargetMayRescueAnother: false,
  });

  assert.deepEqual(plan.sessionDesign, {
    sameParticipantRoomPlacementLightingActionSessionRequired: true,
    balancedRandomizedLaneOrderRequired: true,
    perLaneWarmupCalibrationAndDriftChecksRequired: true,
    oakInternalAblationsMustUseSameExposureFanOut: true,
    sharedUvcAndOakExactExposureEquivalenceClaimed: false,
    maximumCrossCameraExposureSkewUs: null,
    independentExposureAndSynchronizationProofRequired: true,
    rawRgbDepthOrIrRetentionRequired: false,
    sequentialSessionMayClaimSameExposure: false,
  });

  assert.deepEqual(plan.onePlayerMatrix, {
    targetTierIds: ["ordinary-x86-linux", "steamos", "raspberry-pi5-ai-hat"],
    personaClasses: ["school-age-child-standing", "adult-standing"],
    placementIds: ["center", "near-left-edge", "near-right-edge", "far-left-edge", "far-right-edge"],
    lightingConditionIds: ["daylight", "backlight", "warm-lamp", "cool-lamp", "tv-only", "dim"],
    motionIds: ["neutral-full-body", "jump", "duck", "dodge-left", "dodge-right"],
    validTrialsPerCell: 20,
    requiredCellCount: 4500,
    requiredTrialCount: 90000,
    everyLaneTargetPersonaPlacementLightingAndMotionCellMustPass: true,
    aggregateMayRescueFailedCell: false,
  });

  assert.deepEqual(plan.twoPlayerOverlapMatrix, {
    executionRequiresCompletedOnePlayerAndI054Gates: true,
    requiredForCompleteDepthSelectionClaim: true,
    pairClassIds: ["adult-adult-standing", "adult-child-standing", "child-child-standing"],
    overlapScenarioIds: [
      "side-by-side-control", "cross-left-to-right", "cross-right-to-left",
      "partial-body-overlap", "short-full-occlusion-and-reentry",
    ],
    placementIds: ["center", "left-overlap-zone", "right-overlap-zone"],
    validTrialsPerCell: 20,
    requiredCellCount: 675,
    requiredTrialCount: 13500,
    identityActionAndRecoveryGroundTruthRequired: true,
    onePairScenarioOrPlacementMayRescueAnother: false,
  });

  assert.deepEqual(plan.measurements, {
    requiredMeasurements: [
      "rgb-valid-depth-and-qualified-action-overlap-coverage",
      "core17-per-landmark-detection-missing-and-normalized-error",
      "floor-plane-floor-contact-and-step-jump-event-error",
      "two-player-detection-identity-switch-action-ownership-and-recovery",
      "low-light-passive-active-and-flood-assisted-accuracy",
      "exposure-cross-camera-and-rgb-depth-synchronization",
      "exposure-to-game-api-p50-p95-p99-and-worst",
      "captured-duplicate-dropped-corrupt-and-out-of-order-frames",
      "wall-device-usb-power-voltage-current-and-brownout-events",
      "device-host-thermal-and-throttling-state",
      "cpu-gpu-vpu-memory-usb-and-bandwidth-load",
      "cold-start-hot-plug-reconnect-suspend-or-idle-and-fault-recovery",
      "delivered-cost-mount-power-cable-and-integration-cost",
      "sdk-firmware-model-package-update-and-maintenance-surface",
    ],
    independentGroundTruthRequired: true,
    candidateDepthMayLabelItself: false,
    vendorDepthAccuracyMaySubstituteMeasuredRoomAccuracy: false,
    captureArrivalMaySubstituteExposureTimestamp: false,
    usbEnumerationMaySubstituteSustainedPipelineEvidence: false,
    perLaneTargetConditionAndWorstCaseReportingRequired: true,
  });

  exactKeys(plan.acceptance, [
    "minimumTriggerPrecisionPpm", "minimumTriggerRecallPpm",
    "maximumExposureToGameApiP95Us", "maximumUnintendedPrivilegedActionsPerNegativeSession",
    "minimumValidDepthCoveragePpm", "maximumDepthErrorP95Mm", "maximumFloorPlaneErrorP95Mm",
    "maximumFloorContactEventErrorP95Ms", "maximumIdentitySwitchesPerOverlapCell",
    "maximumCrossCameraExposureSkewUs", "maximumDepthPipelineLatencyOverheadUsP95",
    "maximumWallPowerMilliW", "maximumUsbPowerMilliW", "maximumDeviceTemperatureMilliC",
    "maximumIncrementalDeliveredCostUsdCents", "minimumPredeclaredMaterialBenefitPpm",
    "depthSelectionRequiresMaterialBenefitAndNoBlockingRegression",
    "cameraOnlyImprovementMayQualifyDepth",
    "aggregateTargetLightingPlacementPersonaOrLaneMayRescueFailure",
    "unsafeIrOrPowerResultMayBeRescuedByAccuracy",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.minimumTriggerPrecisionPpm,
    plan.acceptance.minimumTriggerRecallPpm,
    plan.acceptance.maximumExposureToGameApiP95Us,
    plan.acceptance.maximumUnintendedPrivilegedActionsPerNegativeSession,
  ], [950000, 900000, 120000, 0]);
  for (const key of [
    "minimumValidDepthCoveragePpm", "maximumDepthErrorP95Mm", "maximumFloorPlaneErrorP95Mm",
    "maximumFloorContactEventErrorP95Ms", "maximumIdentitySwitchesPerOverlapCell",
    "maximumCrossCameraExposureSkewUs", "maximumDepthPipelineLatencyOverheadUsP95",
    "maximumWallPowerMilliW", "maximumUsbPowerMilliW", "maximumDeviceTemperatureMilliC",
    "maximumIncrementalDeliveredCostUsdCents", "minimumPredeclaredMaterialBenefitPpm",
  ]) assert.equal(plan.acceptance[key], null, `open gate ${key} must remain null`);
  assert.equal(plan.acceptance.depthSelectionRequiresMaterialBenefitAndNoBlockingRegression, true);
  assert.equal(plan.acceptance.cameraOnlyImprovementMayQualifyDepth, false);
  assert.equal(plan.acceptance.aggregateTargetLightingPlacementPersonaOrLaneMayRescueFailure, false);
  assert.equal(plan.acceptance.unsafeIrOrPowerResultMayBeRescuedByAccuracy, false);

  assert.deepEqual(plan.costPolicy, {
    observedCandidateListPriceUsdCents: 52900,
    observedAt: "2026-07-25",
    deliveredCandidateCostUsdCents: null,
    sharedRgbBaselineDeliveredCostUsdCents: null,
    incrementalMountPowerCableAndIntegrationCostUsdCents: null,
    priceSnapshotMayAuthorizePurchaseOrBOMMutation: false,
    stalePriceMayBeReusedAtPurchase: false,
    costMayRescueAccuracySafetyLatencyOrMaintenanceFailure: false,
  });

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoDefault: false,
    rawRgbDepthIrFramesAllowedInRepositoryOrRelease: false,
    temporaryVolatileSameExposureFanOutAllowedOnlyBySeparateProtocol: true,
    temporaryDiagnosticImagesRequireSeparateConsentAndDeletionProtocol: true,
    participantNamesPortraitsVoicesAddressesOrStableIdentifiersAllowed: false,
    deviceSerialNumbersAllowedInRelease: false,
    skeletonDepthSummaryGroundTruthTimingPowerAndAggregateArtifactsPreferred: true,
    networkEgressAllowed: false,
    freeTextResultEvidenceAllowed: false,
  });

  assert.deepEqual(plan.irSafetyPolicy, {
    emittersDefaultOff: true,
    damagedOpenedModifiedOrUnofficialFirmwareDeviceMayOperateEmitters: false,
    magnifyingOpticsAllowed: false,
    exactEmitterIntensityDistanceDurationTemperatureAndReflectionProtocolRequired: true,
    sunlightReflectiveSurfaceAndOtherIrDeviceCampaignRemainsI045: true,
    vendorLaserClassificationMaySubstituteProjectParticipantOrRoomReview: false,
    successfulDepthMayWaiveIrSafetyFailure: false,
    emitterStateMustBeIndependentlyObservedAndRecorded: true,
  });

  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    blockerCodes: [...OAK_COMPARISON_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedOnePlayerCellCount: 0,
    completedOnePlayerTrialCount: 0,
    completedTwoPlayerOverlapCellCount: 0,
    completedTwoPlayerOverlapTrialCount: 0,
    qualifiedLaneTargetConditionIds: [],
    materialDepthBenefitIds: [],
    selectedDepthLaneByTargetTier: [],
    publishedCostAndMaintenanceReportSha256: null,
  });
  return plan;
}

export async function parseOakComparisonPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical pretty JSON without duplicate or reordered keys",
  );
  return validateOakComparisonPlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseOakComparisonPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.onePlayerMatrix.requiredTrialCount}-one-player,`
      + ` ${plan.twoPlayerOverlapMatrix.requiredTrialCount}-overlap-trial comparison`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
