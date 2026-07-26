import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/lens-calibration/cross-tier-lens-distortion-rectification-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const LENS_RECTIFICATION_FORMAT =
  "vcg-cross-tier-lens-distortion-rectification-plan/v1";
export const LENS_TARGET_TIERS = Object.freeze([
  "ordinary-x86-linux-external-camera",
  "steamos-external-camera",
  "raspberry-pi5-ai-hat-integrated-camera",
]);
export const LENS_STRATEGIES = Object.freeze([
  "raw-unrectified-baseline",
  "pre-inference-rectified",
  "post-inference-coordinate-transform-control",
]);
export const LENS_POSITION_IDS = Object.freeze([
  "center",
  "upper-left-quarter",
  "upper-right-quarter",
  "lower-left-quarter",
  "lower-right-quarter",
  "left-distortion-edge",
  "right-distortion-edge",
  "top-distortion-edge",
  "bottom-distortion-edge",
]);
export const LENS_BLOCKERS = Object.freeze([
  "qualified-camera-geometry-and-exact-targets",
  "exact-camera-mode-capture-inference-and-postprocess-pipelines",
  "frozen-distortion-model-selection-and-strategy-selection-rule",
  "independent-optical-pose-action-and-floor-ground-truth",
  "numeric-calibration-accuracy-crop-floor-and-overhead-gates",
  "qualified-exposure-timestamps-and-latency-instrumentation",
  "reviewed-stored-calibration-schema-protection-and-invalidation",
  "participant-consent-assent-data-handling-and-schedule",
  "camera-participant-target-write-and-purchase-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "collectionBoundary",
  "strategyMatrix", "calibrationTargetMatrix", "poseAndActionMatrix", "latencyMatrix",
  "storedCalibrationArtifact", "measurements", "acceptance", "dataPolicy",
  "executionGate", "result",
];
const sourceDefinitions = [
  ["camera-calibration-and-product-decisions", "docs/DECISIONS.md"],
  ["coordinate-frame-contract", "docs/COORDINATE_FRAMES.md"],
  ["camera-free-calibration-boundary", "docs/CALIBRATION_REHEARSAL.md"],
  ["camera-free-calibration-evidence", "benchmarks/calibration/camera-free-calibration-rehearsal-v1.json"],
  ["shared-camera-plan", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["cross-tier-camera-geometry-plan", "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json"],
  ["pose-edge-plan", "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json"],
  ["floor-contact-plan", "benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json"],
];
const collectionKeys = [
  "selectedCameraQualificationResultSha256", "selectedGeometryResultSha256",
  "ordinaryX86LinuxTargetConfigurationSha256", "steamOsTargetConfigurationSha256",
  "raspberryPiTargetConfigurationSha256", "exactCameraIdentityAndModeMatrixSha256",
  "captureAndPreprocessingPipelineSha256", "inferenceAndPostprocessingPipelineSha256",
  "independentOpticalGroundTruthProtocolSha256", "poseAndActionGroundTruthProtocolSha256",
  "floorGroundTruthProtocolSha256", "latencyInstrumentationProtocolSha256",
  "calibrationArtifactStorageProtocolSha256", "participantConsentAndAssentProtocolSha256",
  "dataHandlingProtocolSha256", "scheduleSha256", "cameraCollectionAuthorized",
  "participantSessionsAuthorized", "targetMutationAuthorized",
  "persistentCalibrationWriteAuthorized", "purchaseAuthorized",
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

export async function validateLensDistortionRectificationPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, LENS_RECTIFICATION_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-lens-distortion-rectification-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-039"]);
  for (const phrase of [
    "No camera", "inference-input state", "stored artifact", "latency result",
    "post-inference coordinate transform", "cannot prove that inference received rectified pixels",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 16)) {
    assert.equal(plan.collectionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of collectionKeys.slice(16)) {
    assert.equal(plan.collectionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  assert.deepEqual(plan.strategyMatrix, {
    targetTierIds: [...LENS_TARGET_TIERS],
    strategyIds: [...LENS_STRATEGIES],
    requiredTargetStrategyCellCount: 9,
    sameOpticalCaptureSequenceRequiredForAccuracyComparison: true,
    livePipelineRequiredForLatencyComparison: true,
    postInferenceTransformMayClaimRectifiedInferenceInput: false,
    previewMayEstablishInferenceInputState: false,
    selectionRuleSha256: null,
    strategyMayBeSelectedAfterSeeingResults: false,
    crossTargetStrategyRescueAllowed: false,
  });

  assert.deepEqual(plan.calibrationTargetMatrix, {
    distortionModelCandidateIds: ["brown-conrady", "fisheye-equidistant"],
    selectedDistortionModelByCameraMode: null,
    coveragePositionIds: [
      "center", "upper-left", "upper-right", "lower-left", "lower-right",
      "left-edge", "right-edge", "top-edge", "bottom-edge",
    ],
    distanceRoleIds: ["near", "nominal", "far"],
    tiltRoleIds: ["negative-pitch", "level", "positive-pitch"],
    minimumCalibrationImagesPerTargetConfiguration: 30,
    minimumIndependentValidationImagesPerTargetConfiguration: 20,
    requiredCalibrationImageCount: 90,
    requiredIndependentValidationImageCount: 60,
    calibrationAndValidationImagesMustBeDisjoint: true,
    independentTargetGeometryRequired: true,
    manufacturerCoefficientsMaySubstituteMeasuredCalibration: false,
  });

  assert.deepEqual(plan.poseAndActionMatrix, {
    blockingPersonaClasses: ["school-age-child-standing", "adult-standing"],
    positionIds: [...LENS_POSITION_IDS],
    postureIds: [
      "neutral", "arms-raised", "squat", "lean-left", "lean-right",
      "single-leg-left", "single-leg-right",
    ],
    validTrialsPerCell: 20,
    requiredBlockingCellCount: 1134,
    requiredBlockingTrialCount: 22680,
    actionOutcomeIds: ["jump", "duck", "dodge-left", "dodge-right"],
    actionOutcomesJoinedToExactCameraFrameAndStrategy: true,
    centerOrAggregateEvidenceMayRescueEdgeFailure: false,
    onePersonaMayRescueAnother: false,
  });

  assert.deepEqual(plan.latencyMatrix, {
    targetStrategyCellCount: 9,
    minimumMeasuredFramesPerCell: 1000,
    requiredMeasuredFrameCount: 9000,
    exposureTimestampRequired: true,
    captureArrivalTimestampMaySubstituteExposureTimestamp: false,
    pairedWarmupAndLoadOrderProtocolSha256: null,
    perStageTimingAndResourceEvidenceRequired: true,
  });

  exactKeys(plan.storedCalibrationArtifact, [
    "format", "requiredFields", "exactCameraModeOrientationCropAndTargetBindingRequired",
    "rawImagesOrVideoAllowedInArtifact", "crossCameraModeTargetOrCropReuseAllowed",
    "unknownArtifactVersionFailsClosed", "identityOrValidityMismatchFailsClosed",
    "writableArtifactMaySelfAuthorize", "artifactPath", "artifactSha256",
  ], "storedCalibrationArtifact");
  assert.equal(plan.storedCalibrationArtifact.format, "vcg-lens-calibration/v1");
  assert.deepEqual(plan.storedCalibrationArtifact.requiredFields, [
    "artifactVersion", "cameraIdentityDigest", "targetTierId", "capturePathId",
    "pixelFormat", "widthPx", "heightPx", "nominalFpsMilliHz", "orientation", "mirrored",
    "preInferenceCrop", "distortionModel", "intrinsicsMatrix3x3", "distortionCoefficients",
    "rectificationMatrix3x3", "newCameraMatrix3x3", "rectifiedRoiPx",
    "rawToRectifiedCoordinateMapping", "rectifiedToDeclaredImageCoordinateMapping",
    "calibrationProtocolSha256", "calibrationObservationSetSha256", "validationSummarySha256",
    "validityEnvelope", "createdAt", "expiresAt", "sourceManifestSha256",
  ]);
  assert.equal(plan.storedCalibrationArtifact.exactCameraModeOrientationCropAndTargetBindingRequired, true);
  assert.equal(plan.storedCalibrationArtifact.rawImagesOrVideoAllowedInArtifact, false);
  assert.equal(plan.storedCalibrationArtifact.crossCameraModeTargetOrCropReuseAllowed, false);
  assert.equal(plan.storedCalibrationArtifact.unknownArtifactVersionFailsClosed, true);
  assert.equal(plan.storedCalibrationArtifact.identityOrValidityMismatchFailsClosed, true);
  assert.equal(plan.storedCalibrationArtifact.writableArtifactMaySelfAuthorize, false);
  assert.equal(plan.storedCalibrationArtifact.artifactPath, null);
  assert.equal(plan.storedCalibrationArtifact.artifactSha256, null);

  assert.deepEqual(plan.measurements, {
    requiredMeasurements: [
      "independent-target-reprojection-error", "straight-line-residual-by-frame-zone",
      "raw-versus-rectified-field-of-view-and-crop",
      "raw-to-rectified-and-declared-coordinate-round-trip",
      "core-17-per-landmark-pixel-and-torso-normalized-error",
      "edge-versus-center-accuracy-delta", "floor-plane-and-floor-contact-error",
      "jump-duck-and-dodge-precision-recall",
      "exposure-to-capture-inference-postprocess-and-game-receipt-timing",
      "rectification-cpu-gpu-memory-and-bandwidth-overhead",
      "calibration-repeatability-and-validity-invalidation",
    ],
    inferenceInputRectificationStateRequiresInstrumentedBoundaryEvidence: true,
    postInferenceCoordinatesMaySubstitutePixelInputEvidence: false,
    calibrationUiStateMaySubstitutePhysicalValidation: false,
    perTargetStrategyPositionPostureAndPersonaEvidenceRequired: true,
  });

  exactKeys(plan.acceptance, [
    "maximumIndependentReprojectionErrorMilliPixels", "maximumStraightLineResidualMilliPixels",
    "maximumPoseErrorP95MilliPixels", "maximumEdgeRegressionPpm", "maximumCropLossPpm",
    "maximumFloorPlaneErrorMm", "maximumRectificationLatencyOverheadMicrosP95",
    "maximumRectificationCpuOverheadPpm", "maximumRectificationGpuOverheadPpm",
    "maximumRectificationMemoryOverheadKiB", "maximumExposureToActionReceiptMsP95",
    "minimumActionPrecisionPpm", "minimumActionRecallPpm", "everyBlockingCellMustPass",
    "aggregateMayRescueFailedCell", "targetOrStrategyMayRescueAnother",
    "selectionMustUsePrecommittedRule",
  ], "acceptance");
  for (const key of [
    "maximumIndependentReprojectionErrorMilliPixels", "maximumStraightLineResidualMilliPixels",
    "maximumPoseErrorP95MilliPixels", "maximumEdgeRegressionPpm", "maximumCropLossPpm",
    "maximumFloorPlaneErrorMm", "maximumRectificationLatencyOverheadMicrosP95",
    "maximumRectificationCpuOverheadPpm", "maximumRectificationGpuOverheadPpm",
    "maximumRectificationMemoryOverheadKiB",
  ]) assert.equal(plan.acceptance[key], null, `open gate ${key} must remain null`);
  assert.equal(plan.acceptance.maximumExposureToActionReceiptMsP95, 120);
  assert.equal(plan.acceptance.minimumActionPrecisionPpm, 950000);
  assert.equal(plan.acceptance.minimumActionRecallPpm, 900000);
  assert.equal(plan.acceptance.everyBlockingCellMustPass, true);
  assert.equal(plan.acceptance.aggregateMayRescueFailedCell, false);
  assert.equal(plan.acceptance.targetOrStrategyMayRescueAnother, false);
  assert.equal(plan.acceptance.selectionMustUsePrecommittedRule, true);

  assert.deepEqual(plan.dataPolicy, {
    rawHomeVideoDefault: false,
    rawHomeVideoAllowedInRepositoryOrRelease: false,
    rawFramesAllowedInRepositoryOrRelease: false,
    redactedCalibrationTargetImagesAllowedBySeparateProtocol: true,
    exifGpsAndStableDeviceIdentifiersMustBeRemoved: true,
    facesNamesAddressesScreensReflectionsAndHouseholdIdentifiersMustBeRedacted: true,
    networkNamesCredentialsAddressesAndTrafficAllowed: false,
    calibrationCoefficientsAndNumericEvidencePreferred: true,
    freeTextResultEvidenceAllowed: false,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...LENS_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedCalibrationImageCount: 0,
    completedIndependentValidationImageCount: 0,
    completedBlockingCellCount: 0,
    completedBlockingTrialCount: 0,
    completedMeasuredFrameCount: 0,
    selectedStrategyByTargetTier: [],
    publishedCalibrationArtifactSetSha256: null,
  });
  return plan;
}

export async function parseLensDistortionRectificationPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical pretty JSON without duplicate or reordered keys",
  );
  return validateLensDistortionRectificationPlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseLensDistortionRectificationPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.calibrationTargetMatrix.requiredCalibrationImageCount}`
      + `-calibration-image, ${plan.poseAndActionMatrix.requiredBlockingTrialCount}`
      + `-trial, ${plan.latencyMatrix.requiredMeasuredFrameCount}-frame campaign`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
