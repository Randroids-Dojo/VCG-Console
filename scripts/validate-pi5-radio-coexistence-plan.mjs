import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json");
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
export const PI5_RADIO_FORMAT = "vcg-pi5-radio-coexistence-plan/v1";
export const PI5_RADIO_BLOCKERS = Object.freeze([
  "received-target-enclosure-controller-camera-and-access-point-identities",
  "qualified-image-radio-driver-firmware-and-regulatory-domain",
  "closed-enclosure-antenna-usb-and-placement-geometry",
  "network-server-path-payload-and-hosted-service-authority",
  "room-rf-survey-instruments-and-interference-boundary",
  "counterbalanced-schedule-input-stimulus-and-recovery-oracles",
  "packet-latency-throughput-camera-pose-power-thermal-and-recovery-gates",
  "hardware-purchase-network-service-radio-fault-and-participant-authority",
]);

const topKeys = ["format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary", "sourceDigestContract", "sourceBindings", "targetBoundary", "radioBands", "placementStrata", "scenarios", "schedule", "requiredMetrics", "acceptance", "dataPolicy", "executionGate", "result"];
const targetKeys = ["hostProduct", "acceleratorProduct", "receivedHardwareSha256", "imageKernelFirmwareSha256", "wifiBluetoothDriverFirmwareSha256", "regulatoryDomain", "antennaAndEnclosureGeometrySha256", "cameraUsbTopologySha256", "controllerInventorySha256", "accessPointInventoryAndConfigurationSha256", "networkServerAndPathSha256", "roomRfSurveySha256", "workloadBundleSha256", "instrumentCalibrationSha256"];
const openGates = ["maximumPacketLossRatio", "maximumRoundTripP95Ms", "maximumJitterP95Ms", "minimumDownloadBitsPerSecond", "minimumUploadBitsPerSecond", "maximumControllerInputP95Ms", "maximumControllerReconnectMs", "maximumWifiReassociationMs", "maximumCaptureDropRatio", "maximumPoseDropRatio", "minimumPoseFps", "minimumGameFps", "maximumSustainedSocTemperatureC", "maximumWallPowerW"];

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}
function normalizedDigest(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}
async function validateSources(bindings, repositoryRoot) {
  const expected = [
    ["controller-boundary", "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json"],
    ["camera-boundary", "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json"],
    ["workload-boundary", "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json"],
    ["enclosed-thermal-boundary", "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json"],
  ];
  assert.equal(bindings.length, expected.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], expected[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    assert.ok(absolute.startsWith(`${repositoryRoot}\\`) || absolute.startsWith(`${repositoryRoot}/`));
    assert.equal(normalizedDigest(await readFile(absolute), binding.path), binding.sha256, `${binding.path} digest drifted`);
  }
}

export async function validatePi5RadioCoexistencePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_RADIO_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-wifi-bluetooth-camera-coexistence-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.equal(plan.qualificationScope, "I-026");
  assert.match(plan.claimBoundary, /^Pre-registered Raspberry Pi 5 Wi-Fi\/Bluetooth/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.targetBoundary, targetKeys, "targetBoundary");
  assert.deepEqual([plan.targetBoundary.hostProduct, plan.targetBoundary.acceleratorProduct], ["Raspberry Pi 5 8GB", "Raspberry Pi AI HAT+ 26 TOPS"]);
  for (const key of targetKeys.slice(2)) assert.equal(plan.targetBoundary[key], null, `blocked plan cannot populate ${key}`);

  const bandKeys = ["bandId", "required", "wifiCenterFrequencyHz", "wifiChannelWidthHz", "wifiChannel", "bluetoothAdaptiveFrequencyHoppingVerified"];
  assert.deepEqual(plan.radioBands.map((band) => band.bandId), ["wifi-2g4-bluetooth-cochannel-risk", "wifi-5g-bluetooth-control"]);
  for (const [index, band] of plan.radioBands.entries()) {
    exactKeys(band, bandKeys, `radioBands[${index}]`);
    assert.equal(band.required, true);
    for (const key of bandKeys.slice(2)) assert.equal(band[key], null);
  }
  assert.deepEqual(plan.placementStrata, [
    { placementId: "open-enclosure-diagnostic", required: true, mayQualifyProduct: false, geometrySha256: null },
    { placementId: "closed-enclosure-installed-below-tv", required: true, mayQualifyProduct: true, geometrySha256: null },
  ]);

  const scenarioKeys = ["scenarioId", "cameraMode", "bluetoothControllerCount", "networkLoad"];
  const expectedScenarios = [
    ["wifi-idle-no-camera-no-controller", "disabled", 0, "idle-associated"],
    ["wifi-download-camera-1080p60-no-controller", "1920x1080-at-60-fps", 0, "bounded-sustained-download"],
    ["wifi-idle-camera-1080p60-one-controller", "1920x1080-at-60-fps", 1, "idle-associated"],
    ["wifi-download-camera-1080p60-one-controller", "1920x1080-at-60-fps", 1, "bounded-sustained-download"],
    ["wifi-bidirectional-camera-1080p60-two-controllers", "1920x1080-at-60-fps", 2, "bounded-bidirectional"],
    ["hosted-workload-camera-1080p60-two-controllers", "1920x1080-at-60-fps", 2, "representative-hosted-session"],
    ["update-download-camera-1080p60-one-controller", "1920x1080-at-60-fps", 1, "qualified-update-download-no-install"],
    ["radio-loss-reconnect-under-full-load", "1920x1080-at-60-fps", 2, "bounded-bidirectional-with-authorized-radio-fault"],
  ];
  assert.equal(plan.scenarios.length, expectedScenarios.length);
  for (const [index, scenario] of plan.scenarios.entries()) {
    exactKeys(scenario, scenarioKeys, `scenarios[${index}]`);
    assert.deepEqual(scenarioKeys.map((key) => scenario[key]), expectedScenarios[index]);
  }
  assert.deepEqual(plan.schedule, {
    bandCount: 2, placementCount: 2, scenarioCount: 8, requiredCellCount: 32,
    warmupSecondsPerCell: 300, measuredSecondsPerCell: 1800,
    validTrialsPerInputLatencyCell: 20, validReconnectCyclesPerFaultCell: 20,
    samplingPeriodMs: 1000, counterbalancedOrder: true,
    invalidHarnessTrialsRetainedAndRerun: true, productFailuresMayBeReplaced: false,
    scheduleSha256: null, operatorProtocolSha256: null, networkPayloadManifestSha256: null,
  });
  assert.equal(plan.requiredMetrics.length, 11);
  assert.equal(new Set(plan.requiredMetrics).size, 11);

  exactKeys(plan.acceptance, ["maximumExposureToActionP95Ms", "maximumControllerLifecycleFaults", "maximumStuckOrFabricatedActions", "maximumWrongPlayerOrOldEpochActions", "maximumUnrecoveredDisconnects", "requiredCaptureWidth", "requiredCaptureHeight", "requiredCaptureFramesPerSecond", ...openGates, "everyRequiredCellMustPass", "aggregateMayRescueFailedCell", "fiveGhzMayRescueFailedTwoGhzCell", "openEnclosureMayQualifyClosedEnclosure", "throughputMayRescueInputCameraOrRecoveryFailure"], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumExposureToActionP95Ms, plan.acceptance.maximumControllerLifecycleFaults,
    plan.acceptance.maximumStuckOrFabricatedActions, plan.acceptance.maximumWrongPlayerOrOldEpochActions,
    plan.acceptance.maximumUnrecoveredDisconnects, plan.acceptance.requiredCaptureWidth,
    plan.acceptance.requiredCaptureHeight, plan.acceptance.requiredCaptureFramesPerSecond,
  ], [120, 0, 0, 0, 0, 1920, 1080, 60]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredCellMustPass, true);
  for (const key of ["aggregateMayRescueFailedCell", "fiveGhzMayRescueFailedTwoGhzCell", "openEnclosureMayQualifyClosedEnclosure", "throughputMayRescueInputCameraOrRecoveryFailure"]) assert.equal(plan.acceptance[key], false);
  assert.deepEqual(plan.dataPolicy, {
    rawMacBssidSsidOrControllerIdentifiersAuthorized: false,
    wifiCredentialsAuthorized: false,
    networkPayloadBodiesAuthorized: false,
    rawUsbBluetoothDescriptorsAuthorized: false,
    rawFramesOrAudioAuthorized: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    saltedPerCampaignOpaqueDeviceAliasesAllowed: true,
    aggregateTelemetryReleaseOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked", hardwareAccessAuthorized: false, purchaseAuthorized: false,
    networkTrafficAuthorized: false, hostedServiceUseAuthorized: false,
    radioFaultInjectionAuthorized: false, participantCollectionAuthorized: false,
    blockerCodes: [...PI5_RADIO_BLOCKERS],
  });
  assert.deepEqual(plan.result, { artifactPath: null, sha256: null, disposition: "not-run", completedCells: 0, qualifiedBands: [], qualifiedPlacements: [], productQualified: false });
  return plan;
}

export async function parsePi5RadioCoexistencePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Pi 5 radio plan must be valid UTF-8"); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Pi 5 radio plan must be valid JSON"); }
  await validatePi5RadioCoexistencePlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Pi 5 radio plan must use canonical two-space JSON with one trailing newline");
  return value;
}
export async function validateTrackedPi5RadioCoexistencePlan() { return parsePi5RadioCoexistencePlanBytes(await readFile(trackedPath)); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5RadioCoexistencePlan();
  console.log(`Pi 5 radio coexistence plan valid: bands=${plan.radioBands.length} cells=${plan.schedule.requiredCellCount} blockers=${plan.executionGate.blockerCodes.length}`);
}
