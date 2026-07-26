import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json",
);
const MAX_BYTES = 192 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CROSS_TIER_CAMERA_GEOMETRY_FORMAT =
  "vcg-cross-tier-camera-placement-geometry-plan/v1";
export const GEOMETRY_BLOCKING_PERSONAS = Object.freeze([
  "school-age-child-standing",
  "adult-standing",
]);
export const GEOMETRY_ZONE_POINTS = Object.freeze([
  "center",
  "near-left-edge",
  "near-right-edge",
  "far-left-edge",
  "far-right-edge",
]);
export const EXTERNAL_MOUNT_ROLES = Object.freeze([
  "beside-machine",
  "on-top-of-machine",
  "above-machine",
  "tv-top",
  "shelf",
]);
export const GEOMETRY_BLOCKERS = Object.freeze([
  "selected-room-survey-and-safe-zone-result",
  "qualified-shared-camera-and-exact-target-configurations",
  "integrated-prototype-and-external-mount-identities",
  "numeric-role-values-and-optical-action-calibration-gates",
  "participant-consent-assent-and-comprehension-authority",
  "independent-optical-floor-and-action-ground-truth",
  "mount-stability-cable-safety-usb-and-relocation-protocols",
  "data-handling-instruments-operators-and-schedule",
  "room-participant-camera-mounting-construction-and-purchase-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "collectionBoundary",
  "integratedScreeningMatrix", "externalScreeningMatrix", "blockingValidationMatrix",
  "calibrationAndSetupMatrix", "measurements", "acceptance", "dataPolicy",
  "executionGate", "result",
];
const sourceDefinitions = [
  ["camera-packaging-and-optical-decisions", "docs/DECISIONS.md"],
  ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["prototype-box-boundary", "docs/ABS_PROJECT_BOX_CANDIDATE_SCREEN_2026-07-25.md"],
  ["room-and-play-zone-plan", "benchmarks/room-survey/living-room-play-zone-plan-v1.json"],
  ["shared-camera-plan", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["pose-edge-plan", "benchmarks/pose-edge-accuracy/mediapipe-edge-accuracy-plan-v1.json"],
  ["floor-contact-plan", "benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json"],
  ["real-room-action-plan", "benchmarks/real-room-one-player/first-real-room-one-player-plan-v1.json"],
];
const collectionKeys = [
  "selectedRoomSurveyResultSha256", "selectedCameraQualificationResultSha256",
  "integratedPrototypeConfigurationSha256", "supportedPcTargetConfigurationSha256",
  "steamMachineTargetConfigurationSha256", "participantConsentAndAssentProtocolSha256",
  "opticalGroundTruthProtocolSha256", "floorGroundTruthProtocolSha256",
  "actionGroundTruthProtocolSha256", "calibrationAndRelocationProtocolSha256",
  "mountStabilityAndCableSafetyProtocolSha256", "dataHandlingProtocolSha256",
  "scheduleSha256", "roomAccessAuthorized", "participantSessionsAuthorized",
  "cameraCollectionAuthorized", "mountingOrFurnitureMutationAuthorized",
  "cuttingDrillingOrConstructionAuthorized", "purchaseAuthorized",
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

export async function validateCrossTierCameraGeometryPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CROSS_TIER_CAMERA_GEOMETRY_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-camera-placement-geometry-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-037", "I-193", "I-194"]);
  for (const phrase of [
    "No room", "field of view", "purchase authority", "aggregate evidence",
    "cannot qualify the integrated appliance geometry",
  ]) assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  assert.equal(
    plan.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 13)) {
    assert.equal(plan.collectionBoundary[key], null, `blocked plan cannot bind ${key}`);
  }
  for (const key of collectionKeys.slice(13)) {
    assert.equal(plan.collectionBoundary[key], false, `blocked plan cannot authorize ${key}`);
  }

  exactKeys(plan.integratedScreeningMatrix, [
    "enclosureHeightRoles", "tvStandDepthRoles", "playerDistanceRoles",
    "roomWidthRoles", "pitchCandidateRoles", "exactRoleValuesMmOrDegrees",
    "requiredGeometricScreenCellCount", "advertisedFieldOfViewMaySubstituteMeasuredGeometry",
    "previewOrDiagramMaySubstitutePhysicalGeometry",
  ], "integratedScreeningMatrix");
  assert.deepEqual(plan.integratedScreeningMatrix.enclosureHeightRoles, ["low", "nominal", "high"]);
  assert.deepEqual(plan.integratedScreeningMatrix.tvStandDepthRoles, ["shallow", "nominal", "deep"]);
  assert.deepEqual(plan.integratedScreeningMatrix.playerDistanceRoles, ["near", "nominal", "far"]);
  assert.deepEqual(plan.integratedScreeningMatrix.roomWidthRoles, ["narrow", "nominal", "wide"]);
  assert.deepEqual(plan.integratedScreeningMatrix.pitchCandidateRoles, [
    "minimum-upward", "low-upward", "nominal-upward", "high-upward", "maximum-upward",
  ]);
  assert.equal(plan.integratedScreeningMatrix.exactRoleValuesMmOrDegrees, null);
  assert.equal(plan.integratedScreeningMatrix.requiredGeometricScreenCellCount, 405);
  assert.equal(plan.integratedScreeningMatrix.advertisedFieldOfViewMaySubstituteMeasuredGeometry, false);
  assert.equal(plan.integratedScreeningMatrix.previewOrDiagramMaySubstitutePhysicalGeometry, false);

  exactKeys(plan.externalScreeningMatrix, [
    "targetTierIds", "mountRoleIds", "zonePointIds", "requiredGeometricScreenCellCount",
    "minimumQualifiedMountRolesPerTargetTier", "unsupportedMountRolesMustRemainDocumented",
    "steamEvidenceMayQualifySupportedPc", "supportedPcEvidenceMayQualifySteam",
  ], "externalScreeningMatrix");
  assert.deepEqual(plan.externalScreeningMatrix.targetTierIds, ["supported-pc", "steam-machine"]);
  assert.deepEqual(plan.externalScreeningMatrix.mountRoleIds, [...EXTERNAL_MOUNT_ROLES]);
  assert.deepEqual(plan.externalScreeningMatrix.zonePointIds, [...GEOMETRY_ZONE_POINTS]);
  assert.equal(plan.externalScreeningMatrix.requiredGeometricScreenCellCount, 50);
  assert.equal(plan.externalScreeningMatrix.minimumQualifiedMountRolesPerTargetTier, 1);
  assert.equal(plan.externalScreeningMatrix.unsupportedMountRolesMustRemainDocumented, true);
  assert.equal(plan.externalScreeningMatrix.steamEvidenceMayQualifySupportedPc, false);
  assert.equal(plan.externalScreeningMatrix.supportedPcEvidenceMayQualifySteam, false);

  exactKeys(plan.blockingValidationMatrix, [
    "configurationCount", "configurationRule", "blockingPersonaClasses",
    "exploratoryPersonaClasses", "zonePointIds", "motionIds", "validTrialsPerCell",
    "requiredBlockingCellCount", "requiredBlockingTrialCount",
    "exploratoryEvidenceMayRescueBlockingFailure", "aggregateMayRescueFailedCell",
  ], "blockingValidationMatrix");
  assert.equal(plan.blockingValidationMatrix.configurationCount, 11);
  assert.equal(
    plan.blockingValidationMatrix.configurationRule,
    "one-selected-integrated-fixed-axis-plus-every-external-target-tier-mount-role",
  );
  assert.deepEqual(plan.blockingValidationMatrix.blockingPersonaClasses, [...GEOMETRY_BLOCKING_PERSONAS]);
  assert.deepEqual(plan.blockingValidationMatrix.exploratoryPersonaClasses, [
    "seated-exploratory", "limited-range-exploratory",
  ]);
  assert.deepEqual(plan.blockingValidationMatrix.zonePointIds, [...GEOMETRY_ZONE_POINTS]);
  assert.deepEqual(plan.blockingValidationMatrix.motionIds, [
    "neutral-full-body", "jump", "duck", "dodge-left", "dodge-right",
  ]);
  assert.equal(plan.blockingValidationMatrix.validTrialsPerCell, 20);
  assert.equal(plan.blockingValidationMatrix.requiredBlockingCellCount, 550);
  assert.equal(plan.blockingValidationMatrix.requiredBlockingTrialCount, 11000);
  assert.equal(plan.blockingValidationMatrix.exploratoryEvidenceMayRescueBlockingFailure, false);
  assert.equal(plan.blockingValidationMatrix.aggregateMayRescueFailedCell, false);

  assert.deepEqual(plan.calibrationAndSetupMatrix, {
    configurationCount: 11,
    calibrationCyclesPerConfiguration: 20,
    requiredCalibrationCycleCount: 220,
    setupErrorScenarioIds: [
      "camera-too-low", "camera-too-high", "pitch-outside-envelope", "mount-unstable",
      "cable-unstrain-relieved", "shutter-obscured", "activity-indicator-obscured",
      "placement-changed-without-recalibration", "floor-plane-invalid",
      "zone-edge-outside-coverage",
    ],
    automaticRoomAndFloorCalibrationRequired: true,
    placementChangeDetectionRequired: true,
    unsafeOrUnsupportedSetupMustFailClosed: true,
    manualHiddenCalibrationMayQualify: false,
  });

  exactKeys(plan.measurements, [
    "requiredPhysicalMeasurements", "independentOpticalAndFloorGroundTruthRequired",
    "physicalPictureMayBeInferredFromCalibrationState",
    "cameraPreviewMayEstablishFullBodyOrFloorCoverage",
    "actionAccuracyMayBeInferredFromLandmarkVisibility",
    "mountStabilityMayBeInferredFromStaticDimensions", "perCellEvidenceAndDispositionRequired",
  ], "measurements");
  assert.deepEqual(plan.measurements.requiredPhysicalMeasurements, [
    "camera-optical-datum-height-depth-and-offset", "tv-face-and-stand-geometry",
    "player-distance-and-room-width", "camera-pitch-roll-and-yaw",
    "measured-horizontal-vertical-and-diagonal-field-of-view", "distortion-and-crop-margin",
    "head-feet-hands-and-zone-edge-visibility", "floor-plane-and-floor-contact-error",
    "jump-duck-and-dodge-action-accuracy", "automatic-calibration-and-placement-change-detection",
    "mount-tip-slip-vibration-and-cable-pull-stability",
    "physical-shutter-reach-and-optical-blocking", "capture-indicator-visibility-and-truth",
    "usb-mode-bandwidth-drops-reconnect-and-cable-length",
  ]);
  assert.equal(plan.measurements.independentOpticalAndFloorGroundTruthRequired, true);
  for (const key of [
    "physicalPictureMayBeInferredFromCalibrationState",
    "cameraPreviewMayEstablishFullBodyOrFloorCoverage",
    "actionAccuracyMayBeInferredFromLandmarkVisibility",
    "mountStabilityMayBeInferredFromStaticDimensions",
  ]) assert.equal(plan.measurements[key], false);
  assert.equal(plan.measurements.perCellEvidenceAndDispositionRequired, true);

  exactKeys(plan.acceptance, [
    "minimumHorizontalFieldOfViewMilliDegrees", "minimumVerticalFieldOfViewMilliDegrees",
    "minimumHeadMarginMm", "minimumFeetMarginMm", "minimumZoneEdgeMarginMm",
    "maximumDistortionMilliPixels", "maximumCropLossPpm", "maximumFloorPlaneErrorMm",
    "minimumActionPrecisionPpm", "minimumActionRecallPpm", "maximumCalibrationDurationMs",
    "maximumPlacementChangeDetectionMs", "maximumUsbCaptureErrorsOrDrops",
    "maximumMountStabilityOrCableSafetyFailures", "exactlyOneIntegratedFixedPitchMustQualify",
    "atLeastOneExternalMountRolePerTargetTierMustQualify",
    "everyAdvertisedExternalMountRoleMustPassAllBlockingCells",
    "externalPlacementMayRescueIntegratedFailure", "integratedPlacementMayRescueExternalFailure",
    "seatedOrLimitedRangeEvidenceMayRescueBlockingFailure",
  ], "acceptance");
  for (const key of [
    "minimumHorizontalFieldOfViewMilliDegrees", "minimumVerticalFieldOfViewMilliDegrees",
    "minimumHeadMarginMm", "minimumFeetMarginMm", "minimumZoneEdgeMarginMm",
    "maximumDistortionMilliPixels", "maximumCropLossPpm", "maximumFloorPlaneErrorMm",
    "maximumCalibrationDurationMs", "maximumPlacementChangeDetectionMs",
  ]) assert.equal(plan.acceptance[key], null, `open gate ${key} must remain null`);
  assert.deepEqual([
    plan.acceptance.minimumActionPrecisionPpm,
    plan.acceptance.minimumActionRecallPpm,
    plan.acceptance.maximumUsbCaptureErrorsOrDrops,
    plan.acceptance.maximumMountStabilityOrCableSafetyFailures,
  ], [950000, 900000, 0, 0]);
  for (const key of [
    "exactlyOneIntegratedFixedPitchMustQualify",
    "atLeastOneExternalMountRolePerTargetTierMustQualify",
    "everyAdvertisedExternalMountRoleMustPassAllBlockingCells",
  ]) assert.equal(plan.acceptance[key], true);
  for (const key of [
    "externalPlacementMayRescueIntegratedFailure", "integratedPlacementMayRescueExternalFailure",
    "seatedOrLimitedRangeEvidenceMayRescueBlockingFailure",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.dataPolicy, {
    rawHomeVideoDefault: false,
    rawHomeVideoAllowedInRepositoryOrRelease: false,
    rawFramesAllowedInRepositoryOrRelease: false,
    redactedGeometryImagesAllowedBySeparateProtocol: true,
    exifGpsAndDeviceMetadataMustBeRemoved: true,
    facesNamesAddressesScreensReflectionsAndHouseholdIdentifiersMustBeRedacted: true,
    networkNamesCredentialsAddressesAndTrafficAllowed: false,
    skeletonAndNumericReleaseArtifactsPreferred: true,
    freeTextResultEvidenceAllowed: false,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...GEOMETRY_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedIntegratedScreenCellCount: 0,
    completedExternalScreenCellCount: 0,
    completedBlockingCellCount: 0,
    completedBlockingTrialCount: 0,
    completedCalibrationCycleCount: 0,
    selectedIntegratedFixedPitchMilliDegrees: null,
    qualifiedExternalMountRolesByTargetTier: [],
    publishedSetupEnvelopeSha256: null,
  });
  return plan;
}

export async function parseCrossTierCameraGeometryPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(
    text,
    `${JSON.stringify(plan, null, 2)}\n`,
    "plan must be canonical pretty JSON without duplicate or reordered keys",
  );
  return validateCrossTierCameraGeometryPlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseCrossTierCameraGeometryPlanBytes(await readFile(absolute));
    console.log(
      `${absolute}: valid blocked ${plan.integratedScreeningMatrix.requiredGeometricScreenCellCount}`
      + ` integrated-screen, ${plan.externalScreeningMatrix.requiredGeometricScreenCellCount}`
      + ` external-screen, ${plan.blockingValidationMatrix.requiredBlockingTrialCount}-trial campaign`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
