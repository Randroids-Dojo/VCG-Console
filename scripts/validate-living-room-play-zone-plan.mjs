import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/room-survey/living-room-play-zone-plan-v1.json");
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const ROOM_PLAY_ZONE_FORMAT = "vcg-living-room-play-zone-plan/v1";
export const ROOM_PLAY_ZONE_BLOCKERS = Object.freeze([
  "selected-primary-room-and-consent-privacy-boundary",
  "measurement-tools-calibration-coordinate-floor-plan-and-photo-protocol",
  "normal-furniture-door-egress-cable-light-and-network-test-configuration",
  "child-adult-body-envelope-clearance-and-collision-review-protocol",
  "exact-tv-camera-enclosure-mount-and-cable-tuples",
  "obstacle-inter-player-slope-coverage-and-viewing-distance-gates",
  "room-access-photography-measurement-participant-and-mutation-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary",
  "sourceDigestContract", "sourceBindings", "coordinateSystem", "surveyBoundary",
  "requiredMeasurements", "hazardClasses", "playZonePolicy", "playerPostures",
  "cameraCoveragePolicy", "photoEvidencePolicy", "acceptance", "executionGate", "result",
];
const surveyKeys = [
  "roomAlias", "selectedRoomDecision", "measurementDate", "operatorProtocolSha256",
  "measurementToolAndCalibrationSha256", "annotatedFloorPlanSha256",
  "redactedPhotoContactSheetSha256", "privacyReviewSha256", "safetyReviewSha256",
];
const openGates = [
  "minimumObstacleClearanceMm", "minimumInterPlayerClearanceMm",
  "maximumPermittedFloorSlopeDegrees", "minimumCameraCoverageMarginMm",
  "minimumViewingDistanceMm", "maximumViewingDistanceMm",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function digest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  const expected = [
    ["product-room-boundary", "docs/RESEARCH.md"],
    ["prototype-gate-boundary", "docs/PROTOTYPE_SUCCESS_CRITERIA.md"],
    ["shared-camera-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
    ["physical-tv-boundary", "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json"],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validateLivingRoomPlayZonePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, ROOM_PLAY_ZONE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "primary-living-room-play-zone-survey-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-001", "I-002"]);
  assert.match(plan.claimBoundary, /^Pre-registered primary living-room/u);
  for (const phrase of ["No room", "address", "network", "collision", "A photograph", "cannot establish"]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.coordinateSystem, {
    unit: "millimetres",
    origin: "primary-TV active-picture horizontal center projected vertically onto the finished floor at the TV face plane",
    xAxis: "positive toward a viewer's right while facing the primary TV",
    yAxis: "positive away from the primary TV face into the room",
    zAxis: "positive upward from the finished floor",
    angles: "decimal degrees with positive pitch aimed above horizontal",
    dimensionsUseFinishedAccessibleSurfaces: true,
    estimatedValuesMayQualify: false,
  });
  exactKeys(plan.surveyBoundary, surveyKeys, "surveyBoundary");
  for (const key of surveyKeys) assert.equal(plan.surveyBoundary[key], null, `blocked plan cannot populate ${key}`);

  const expectedMeasurements = [
    "room-finished-width-depth-and-ceiling", "primary-tv-active-picture-and-face-plane",
    "viewing-and-player-distance-envelope", "furniture-and-fixed-obstacle-footprints",
    "doors-egress-and-moving-envelopes", "windows-mirrors-and-breakable-surfaces",
    "lighting-fixtures-and-testable-light-states", "power-outlets-circuits-and-cable-routes",
    "network-service-and-wired-port-boundary", "floor-surface-level-and-trip-boundary",
    "below-tv-prototype-envelope", "external-camera-placement-envelope",
  ];
  assert.deepEqual(plan.requiredMeasurements.map((item) => item.measurementId), expectedMeasurements);
  for (const [index, item] of plan.requiredMeasurements.entries()) {
    exactKeys(item, ["measurementId", "requiredEvidence"], `requiredMeasurements[${index}]`);
    assert.ok(item.requiredEvidence.length >= 100);
  }
  assert.deepEqual(plan.hazardClasses, [
    "wall-furniture-or-column-impact", "sharp-edge-or-protrusion",
    "glass-mirror-tv-or-breakable-impact", "door-drawer-recliner-or-moving-envelope",
    "trip-slip-rug-threshold-vent-or-level-change", "power-hdmi-usb-or-network-cable",
    "outlet-power-strip-heat-or-electrical-access", "unstable-tip-pull-or-falling-object",
    "window-direct-sun-reflection-or-treatment-cord", "ceiling-fan-light-soffit-or-overhead-impact",
    "pet-child-passage-or-household-egress-conflict", "camera-enclosure-stand-or-mount-instability",
  ]);

  exactKeys(plan.playZonePolicy, [
    "requiredOneTwoPlayerZoneId", "minimumWidthMm", "minimumDepthMm", "minimumAreaSquareMm",
    "zoneMustBeOneContiguousAxisAlignedRectangleInSurveyCoordinates", "zoneMustNotOverlapHazardEnvelope",
    "zoneMustPreserveHouseholdEgress", "zoneMustRemainValidWithNormalFurnitureAndDoorPositions",
    "oneAndTwoPlayerSubzonesMustBeMarked", "twoPlayerSimultaneousMovementAndArmSpanMustBeReviewed",
    "laterFourPlayerZoneRequiredForQualification", "laterFourPlayerZoneMayRescueRequiredZone",
    "minimumObstacleClearanceMm", "minimumInterPlayerClearanceMm", "maximumPermittedFloorSlopeDegrees",
  ], "playZonePolicy");
  assert.equal(plan.playZonePolicy.requiredOneTwoPlayerZoneId, "one-two-player-required-8x8ft");
  assert.equal(plan.playZonePolicy.minimumWidthMm, 2438.4);
  assert.equal(plan.playZonePolicy.minimumDepthMm, 2438.4);
  assert.equal(plan.playZonePolicy.minimumAreaSquareMm, 5945792.256);
  for (const key of [
    "zoneMustBeOneContiguousAxisAlignedRectangleInSurveyCoordinates", "zoneMustNotOverlapHazardEnvelope",
    "zoneMustPreserveHouseholdEgress", "zoneMustRemainValidWithNormalFurnitureAndDoorPositions",
    "oneAndTwoPlayerSubzonesMustBeMarked", "twoPlayerSimultaneousMovementAndArmSpanMustBeReviewed",
  ]) assert.equal(plan.playZonePolicy[key], true);
  assert.equal(plan.playZonePolicy.laterFourPlayerZoneRequiredForQualification, false);
  assert.equal(plan.playZonePolicy.laterFourPlayerZoneMayRescueRequiredZone, false);
  for (const key of ["minimumObstacleClearanceMm", "minimumInterPlayerClearanceMm", "maximumPermittedFloorSlopeDegrees"]) assert.equal(plan.playZonePolicy[key], null);

  assert.deepEqual(plan.playerPostures, [
    { postureId: "school-age-child-standing", requiredForOneTwoPlayerZone: true, bodyEnvelopeAndReachProtocolSha256: null },
    { postureId: "adult-standing", requiredForOneTwoPlayerZone: true, bodyEnvelopeAndReachProtocolSha256: null },
    { postureId: "seated-exploratory", requiredForOneTwoPlayerZone: false, bodyEnvelopeAndReachProtocolSha256: null },
  ]);
  assert.deepEqual(plan.cameraCoveragePolicy, {
    requiredPlacementRole: "below-tv-integrated-prototype-candidate",
    additionalPlacementRoles: ["external-beside-or-above-machine-candidate", "external-tv-top-or-shelf-candidate"],
    fixedApplianceOpticalAxisSelected: false,
    cameraIdentitySha256: null,
    lensAndModeSha256: null,
    placementAndMountSha256: null,
    roomFloorCalibrationSha256: null,
    oneTwoPlayerCoverageProofSha256: null,
    floorContactProofSha256: null,
    actionAccuracyProofSha256: null,
    setupErrorAndRecalibrationProofSha256: null,
    cameraPreviewMayEstablishCoverage: false,
    diagramMayEstablishCoverage: false,
    fourPlayerCoverageMayRescueOneTwoPlayerFailure: false,
  });
  assert.deepEqual(plan.photoEvidencePolicy, {
    requiredRedactedViewRoles: [
      "room-facing-primary-tv", "tv-wall-and-below-tv-envelope", "required-zone-from-left-rear",
      "required-zone-from-right-rear", "floor-cable-outlet-and-egress-detail",
      "candidate-camera-mount-and-sightline-detail",
    ],
    rawHomePhotosAllowedInRepository: false,
    rawHomePhotosAllowedInReleasedEvidence: false,
    exifGpsAndDeviceMetadataMustBeRemoved: true,
    facesNamesAddressesMailScreensReflectionsAndHouseholdIdentifiersMustBeRedacted: true,
    wifiNamesCredentialsMacIpAndTrafficAllowed: false,
    stableTvCameraRouterOrDeviceSerialsAllowed: false,
    redactedDerivativeDigestsAllowed: true,
    dimensionedAbstractFloorPlanRequired: true,
  });

  exactKeys(plan.acceptance, [
    "minimumRequiredZoneWidthMm", "minimumRequiredZoneDepthMm", "maximumUnmappedHazards",
    "maximumRequiredZoneHazardOverlaps", "maximumBlockedEgressPaths",
    "maximumUnstrainRelievedRequiredCables", "maximumUnstableRequiredMountsOrEnclosures",
    ...openGates, "everyRequiredMeasurementAndSafetyCheckMustPass", "photoMaySubstituteMeasurement",
    "approximationMaySubstituteMeasurement", "cameraPreviewMaySubstitutePhysicalCoverageAndAccuracy",
    "emptyRoomMaySubstituteNormalFurnitureConfiguration", "fourPlayerExperimentalZoneMayRescueRequiredZone",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.minimumRequiredZoneWidthMm, plan.acceptance.minimumRequiredZoneDepthMm,
    plan.acceptance.maximumUnmappedHazards, plan.acceptance.maximumRequiredZoneHazardOverlaps,
    plan.acceptance.maximumBlockedEgressPaths, plan.acceptance.maximumUnstrainRelievedRequiredCables,
    plan.acceptance.maximumUnstableRequiredMountsOrEnclosures,
  ], [2438.4, 2438.4, 0, 0, 0, 0, 0]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredMeasurementAndSafetyCheckMustPass, true);
  for (const key of [
    "photoMaySubstituteMeasurement", "approximationMaySubstituteMeasurement",
    "cameraPreviewMaySubstitutePhysicalCoverageAndAccuracy",
    "emptyRoomMaySubstituteNormalFurnitureConfiguration",
    "fourPlayerExperimentalZoneMayRescueRequiredZone",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    roomAccessAuthorized: false,
    photographyAuthorized: false,
    participantSessionAuthorized: false,
    furnitureOrFixtureMutationAuthorized: false,
    electricalOrNetworkInspectionAuthorized: false,
    mountingCuttingDrillingOrPurchaseAuthorized: false,
    blockerCodes: [...ROOM_PLAY_ZONE_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedRequiredMeasurements: 0,
    mappedHazardCount: 0,
    qualifiedPlayZoneIds: [],
    qualifiedCameraPlacementIds: [],
    selectedFixedOpticalAxisSha256: null,
  });
  return plan;
}

export async function parseLivingRoomPlayZonePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Living-room play-zone plan must be valid UTF-8"); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Living-room play-zone plan must be valid JSON"); }
  await validateLivingRoomPlayZonePlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Living-room play-zone plan must use canonical two-space JSON with one trailing newline");
  return value;
}

export async function validateTrackedLivingRoomPlayZonePlan() {
  return parseLivingRoomPlayZonePlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedLivingRoomPlayZonePlan();
  console.log(`Living-room play-zone plan valid: measurements=${plan.requiredMeasurements.length} hazards=${plan.hazardClasses.length} zone=${plan.playZonePolicy.minimumWidthMm}x${plan.playZonePolicy.minimumDepthMm}mm`);
}
