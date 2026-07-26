import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/camera-cabling/cross-tier-camera-cable-plan-v1.json");
const MAX_BYTES = 160 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const CAMERA_CABLE_PLAN_FORMAT = "vcg-cross-tier-camera-cable-plan/v1";
export const CAMERA_CABLE_TARGETS = Object.freeze([
  "ordinary-x86-linux-external-camera",
  "steamos-external-camera",
  "raspberry-pi-integrated-camera",
]);
export const CAMERA_CABLE_LENGTH_ROLES = Object.freeze([
  "device-supplied",
  "short-passive",
  "nominal-routing-passive",
  "maximum-proposed-passive",
]);
export const CAMERA_CABLE_BLOCKERS = Object.freeze([
  "qualified-shared-camera-and-geometry-results",
  "exact-target-port-topology-camera-cable-and-route-identities",
  "passive-length-bend-radius-and-route-role-values",
  "capture-drop-usb-power-recovery-and-radio-oracles",
  "mechanical-retention-pull-tip-slip-and-household-safety-protocol",
  "numeric-voltage-jitter-recovery-retention-and-rf-gates",
  "data-handling-instruments-operators-and-schedule",
  "camera-hot-plug-suspend-mechanical-installation-and-purchase-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope",
  "claimBoundary", "sourceDigestContract", "sourceBindings", "collectionBoundary",
  "uvcSustainedMatrix", "recoveryMatrix", "mechanicalAndRoutingMatrix",
  "conditionalExtensionBoundary", "measurements", "acceptance", "dataPolicy",
  "executionGate", "result",
];
const sourceDefinitions = [
  ["camera-and-packaging-decisions", "docs/DECISIONS.md"],
  ["active-play-cable-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
  ["prototype-box-cable-boundary", "docs/ABS_PROJECT_BOX_CANDIDATE_SCREEN_2026-07-25.md"],
  ["shared-camera-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
  ["camera-geometry-and-mount-boundary", "benchmarks/camera-geometry/cross-tier-camera-placement-geometry-plan-v1.json"],
  ["pi-radio-coexistence-boundary", "benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json"],
  ["boot-suspend-recovery-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
];
const collectionKeys = [
  "sharedCameraQualificationResultSha256", "cameraGeometryResultSha256",
  "ordinaryX86TargetConfigurationSha256", "steamTargetConfigurationSha256",
  "raspberryPiTargetConfigurationSha256", "cableInventoryAndIdentitySha256",
  "usbTopologyAndPowerProtocolSha256", "bendRetentionAndPullProtocolSha256",
  "captureAndDropOracleSha256", "hotPlugSuspendAndRecoveryProtocolSha256",
  "radioCoexistenceProtocolSha256", "safetyAndDataHandlingProtocolSha256",
  "scheduleSha256", "cameraOperationAuthorized", "hotPlugAndSuspendMutationAuthorized",
  "mechanicalPullAndBendTestingAuthorized", "enclosureOrFurnitureInstallationAuthorized",
  "purchaseAuthorized",
];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM`);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (error) { throw new Error(`${label} is not valid UTF-8`, { cause: error }); }
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
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(digest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validateCrossTierCameraCablePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, CAMERA_CABLE_PLAN_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-camera-cable-signal-stability-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-038"]);
  for (const phrase of ["No camera", "maximum supported length", "CSI fallback", "cannot qualify a cable path"]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.collectionBoundary, collectionKeys, "collectionBoundary");
  for (const key of collectionKeys.slice(0, 13)) assert.equal(plan.collectionBoundary[key], null);
  for (const key of collectionKeys.slice(13)) assert.equal(plan.collectionBoundary[key], false);

  exactKeys(plan.uvcSustainedMatrix, [
    "targetIds", "passiveCableLengthRoles", "stressStateIds", "exactCableLengthsAndBendRadiiMm",
    "requiredCellCount", "sustainedCaptureDurationMsPerCell", "requiredSustainedCaptureDurationMs",
    "genuine1920x1080At60FpsRequired", "cableOrTargetAggregateMayRescueFailedCell",
  ], "uvcSustainedMatrix");
  assert.deepEqual(plan.uvcSustainedMatrix.targetIds, [...CAMERA_CABLE_TARGETS]);
  assert.deepEqual(plan.uvcSustainedMatrix.passiveCableLengthRoles, [...CAMERA_CABLE_LENGTH_ROLES]);
  assert.deepEqual(plan.uvcSustainedMatrix.stressStateIds, [
    "straight-baseline", "minimum-bend-radius", "secured-service-loop",
    "adjacent-power-and-hdmi-routing", "radio-coexistence-load",
    "representative-retained-cable-pull",
  ]);
  assert.equal(plan.uvcSustainedMatrix.exactCableLengthsAndBendRadiiMm, null);
  assert.equal(plan.uvcSustainedMatrix.requiredCellCount, 72);
  assert.equal(plan.uvcSustainedMatrix.sustainedCaptureDurationMsPerCell, 3600000);
  assert.equal(plan.uvcSustainedMatrix.requiredSustainedCaptureDurationMs, 259200000);
  assert.equal(plan.uvcSustainedMatrix.genuine1920x1080At60FpsRequired, true);
  assert.equal(plan.uvcSustainedMatrix.cableOrTargetAggregateMayRescueFailedCell, false);

  assert.deepEqual(plan.recoveryMatrix, {
    targetCount: 3,
    passiveCableLengthRoleCount: 4,
    scenarioIds: [
      "cold-boot-attached", "hot-plug-at-launcher-idle",
      "disconnect-reconnect-under-representative-load",
      "suspend-resume-or-tier-native-idle-wake", "usb-controller-or-radio-stack-recovery",
    ],
    validCyclesPerCell: 20,
    requiredCellCount: 60,
    requiredCycleCount: 1200,
    postRecoveryCameraIdentityMustMatch: true,
    postRecoveryRecalibrationRuleMustBeApplied: true,
    failedCycleMayBeDeletedOrReplaced: false,
  });
  assert.deepEqual(plan.mechanicalAndRoutingMatrix, {
    requiredRouteRoles: [
      "integrated-internal-retained-route", "external-short-visible-route",
      "external-managed-wall-or-furniture-edge-route",
      "external-service-loop-and-replacement-route",
    ],
    requiredPullDirectionIds: [
      "toward-play-zone", "away-from-device", "lateral-left", "lateral-right", "vertical-down",
    ],
    pullCyclesPerDirection: 20,
    requiredPullCycleCountPerQualifiedRoute: 100,
    connectorOrEnclosureMayEnterPlayZone: false,
    looseLoopTripOrPetSnagHazardMayQualify: false,
    adhesiveOnlyRetentionMayQualify: false,
    shutterIndicatorVentAndServiceAccessMustRemainUnobstructed: true,
  });
  assert.deepEqual(plan.conditionalExtensionBoundary, {
    activeUsbExtensionStatus: "disabled-pending-passive-failure-and-owner-approval",
    activeUsbExtensionMayRescueARequiredPassiveCell: false,
    activeUsbExtensionRequiresSeparatePowerLatencyRfRecoveryAndSafetyMatrix: true,
    csiExtensionStatus: "disabled-unless-shared-uvc-failure-opens-pi-only-csi-fallback",
    csiEvidenceMayQualifyUvcOrAnotherTarget: false,
    csiRequiresSupersedingCapturePathDecision: true,
  });

  exactKeys(plan.measurements, [
    "requiredMeasurements", "usbEnumerationMayEstablishSustainedCapture",
    "receivedFrameMayEstablishSignalStability", "hostReportedUsbSpeedMayEstablishPhysicalCableSafety",
    "passingShortCableMayQualifyLongerCable", "perCellEvidenceAndDispositionRequired",
  ], "measurements");
  assert.equal(plan.measurements.requiredMeasurements.length, 12);
  for (const key of [
    "usbEnumerationMayEstablishSustainedCapture", "receivedFrameMayEstablishSignalStability",
    "hostReportedUsbSpeedMayEstablishPhysicalCableSafety", "passingShortCableMayQualifyLongerCable",
  ]) assert.equal(plan.measurements[key], false);
  assert.equal(plan.measurements.perCellEvidenceAndDispositionRequired, true);

  exactKeys(plan.acceptance, [
    "minimumCapturedFrameRateMilliHz", "maximumDuplicateDroppedCorruptOrOutOfOrderFramesPerCell",
    "maximumUsbCrcResetRetryDisconnectOrReenumerationEventsPerCell", "minimumCameraVoltageMilliVolts",
    "maximumCameraVoltageDropMilliVolts", "maximumFrameSpacingJitterUs",
    "maximumReconnectAndUsableCaptureMs", "maximumPostWakeUsableCaptureMs",
    "minimumCableRetentionPullForceMilliNewtons", "minimumBendRadiusMmByCableIdentity",
    "maximumRadioThroughputRegressionPpm", "maximumControllerInputLatencyRegressionUs",
    "everyRequiredPassiveCellMustPass", "anotherLengthRouteOrTargetMayRescueFailure",
    "conditionalExtensionEvidenceMayPromoteBaseline", "safetyFailureMayBeRescuedBySignalQuality",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.minimumCapturedFrameRateMilliHz,
    plan.acceptance.maximumDuplicateDroppedCorruptOrOutOfOrderFramesPerCell,
    plan.acceptance.maximumUsbCrcResetRetryDisconnectOrReenumerationEventsPerCell,
  ], [59000, 0, 0]);
  for (const key of [
    "minimumCameraVoltageMilliVolts", "maximumCameraVoltageDropMilliVolts",
    "maximumFrameSpacingJitterUs", "maximumReconnectAndUsableCaptureMs",
    "maximumPostWakeUsableCaptureMs", "minimumCableRetentionPullForceMilliNewtons",
    "minimumBendRadiusMmByCableIdentity", "maximumRadioThroughputRegressionPpm",
    "maximumControllerInputLatencyRegressionUs",
  ]) assert.equal(plan.acceptance[key], null);
  assert.equal(plan.acceptance.everyRequiredPassiveCellMustPass, true);
  for (const key of [
    "anotherLengthRouteOrTargetMayRescueFailure", "conditionalExtensionEvidenceMayPromoteBaseline",
    "safetyFailureMayBeRescuedBySignalQuality",
  ]) assert.equal(plan.acceptance[key], false);

  assert.deepEqual(plan.dataPolicy, {
    rawRoomVideoRequired: false,
    rawRoomVideoAllowedInRepositoryOrRelease: false,
    rawFramesAllowedInRepositoryOrRelease: false,
    syntheticOrNonidentifyingOpticalTargetPreferred: true,
    networkNamesCredentialsAddressesAndTrafficAllowed: false,
    stableDeviceSerialsAllowedInReleasedEvidence: false,
    saltedCampaignEquipmentAliasesRequired: true,
    freeTextResultEvidenceAllowed: false,
  });
  assert.deepEqual(plan.executionGate, { status: "blocked", blockerCodes: [...CAMERA_CABLE_BLOCKERS] });
  assert.deepEqual(plan.result, {
    artifactPath: null, sha256: null, disposition: "not-run",
    completedSustainedCellCount: 0, completedSustainedDurationMs: 0,
    completedRecoveryCellCount: 0, completedRecoveryCycleCount: 0,
    qualifiedPassiveCableRolesByTarget: [], maximumQualifiedCableLengthMmByTarget: [],
    qualifiedRouteRoles: [], activeUsbExtensionQualified: false, csiExtensionQualified: false,
  });
  return plan;
}

export async function parseCrossTierCameraCablePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.length <= MAX_BYTES, `plan exceeds ${MAX_BYTES} bytes`);
  const text = normalizedText(bytes, "plan");
  const plan = JSON.parse(text);
  assert.equal(text, `${JSON.stringify(plan, null, 2)}\n`, "plan must be canonical pretty JSON without duplicate or reordered keys");
  return validateCrossTierCameraCablePlan(plan, repositoryRoot);
}

async function main() {
  const paths = process.argv.slice(2);
  for (const path of paths.length > 0 ? paths : [trackedPath]) {
    const absolute = resolve(path);
    const plan = await parseCrossTierCameraCablePlanBytes(await readFile(absolute));
    console.log(`${absolute}: valid blocked ${plan.uvcSustainedMatrix.requiredCellCount}-cell, ${plan.recoveryMatrix.requiredCycleCount}-recovery-cycle cable campaign`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
