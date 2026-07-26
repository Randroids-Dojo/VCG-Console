import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json");
const MAX_BYTES = 96 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
export const PI5_COOLING_FORMAT = "vcg-pi5-cooling-soak-plan/v1";
export const PI5_COOLING_BLOCKERS = Object.freeze([
  "received-target-camera-enclosure-and-cooling-identities",
  "qualified-image-runtime-storage-and-workload-tuple",
  "exact-comparison-coolers-mounts-interfaces-and-fan-curves",
  "enclosure-vent-keepout-fit-and-safety-protocol",
  "room-ambient-meter-placement-and-calibration",
  "counterbalanced-schedule-cooldown-and-operator-protocol",
  "thermal-performance-power-tonal-rattle-recovery-and-cost-gates",
  "hardware-purchase-cut-participant-and-sustained-load-authority",
]);

const topKeys = ["format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary", "sourceDigestContract", "sourceBindings", "commonTargetBoundary", "coolingConfigurations", "workloadIds", "soakDurations", "schedule", "requiredMetrics", "acceptance", "selectionPolicy", "dataPolicy", "executionGate", "result"];
const commonKeys = ["hostProduct", "acceleratorProduct", "cameraContract", "prototypeEnclosureDirection", "receivedHardwareManifestSha256", "operatingSystemImageSha256", "kernelRuntimeWorkloadSha256", "storageFilesystemSha256", "cameraRoomPlacementSha256", "enclosureGeometryAndVentSha256", "powerAndFanControlPolicySha256", "instrumentCalibrationSha256", "operatorSafetyProtocolSha256"];
const openGates = ["maximumSustainedSocTemperatureC", "maximumSustainedAcceleratorTemperatureC", "maximumSustainedStorageTemperatureC", "maximumSustainedCameraTemperatureC", "maximumEnclosureSurfaceTemperatureC", "maximumThermalThrottleEvents", "minimumPoseFps", "minimumGameFps", "maximumGameFrameTimeP95Ms", "maximumCaptureDropRatio", "maximumPoseDropRatio", "maximumWallPowerW", "maximumIdleOneMeterAcousticsDba", "maximumAllowedTonalProminenceDb", "maximumAllowedRattleOrOscillationEvents", "maximumRecoveryMs", "minimumCoolingCostSavingsCents"];

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
    ["concurrent-workload-boundary", "benchmarks/concurrent-game-workload/pi5-hailo-concurrent-game-plan-v1.json"],
    ["memory-pressure-boundary", "benchmarks/pi5-memory-pressure/pi5-memory-tier-plan-v1.json"],
    ["enclosure-screen-boundary", "docs/ABS_PROJECT_BOX_CANDIDATE_SCREEN_2026-07-25.md"],
    ["active-play-safety-boundary", "docs/ACTIVE_PLAY_SAFETY.md"],
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

export async function validatePi5CoolingSoakPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, PI5_COOLING_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "pi5-four-cooling-config-soak-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-024", "I-025"]);
  assert.match(plan.claimBoundary, /^Pre-registered Raspberry Pi 5 thermal\/acoustic/u);
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  exactKeys(plan.commonTargetBoundary, commonKeys, "commonTargetBoundary");
  assert.deepEqual(commonKeys.slice(0, 4).map((key) => plan.commonTargetBoundary[key]), ["Raspberry Pi 5 8GB", "Raspberry Pi AI HAT+ 26 TOPS", "qualified shared UVC 1920x1080 at 60 FPS", "modified off-the-shelf ABS project box"]);
  for (const key of commonKeys.slice(4)) assert.equal(plan.commonTargetBoundary[key], null, `blocked plan cannot populate ${key}`);

  const configKeys = ["configurationId", "role", "quotedProduct", "exactReceivedAssemblySha256", "fanCurveSha256", "mountAndInterfaceSha256", "deliveredCostCents", "selected"];
  const expectedConfigs = [
    ["official-active-cooler-baseline", "selected-bom-baseline-candidate", "Raspberry Pi Active Cooler SC1148"],
    ["low-profile-blower-comparison", "comparison", null],
    ["passive-comparison", "comparison", null],
    ["larger-fan-comparison", "comparison", null],
  ];
  assert.equal(plan.coolingConfigurations.length, 4);
  for (const [index, config] of plan.coolingConfigurations.entries()) {
    exactKeys(config, configKeys, `coolingConfigurations[${index}]`);
    assert.deepEqual([config.configurationId, config.role, config.quotedProduct], expectedConfigs[index]);
    for (const key of ["exactReceivedAssemblySha256", "fanCurveSha256", "mountAndInterfaceSha256", "deliveredCostCents"]) assert.equal(config[key], null);
    assert.equal(config.selected, false);
  }
  assert.deepEqual(plan.workloadIds, ["obstacle-motion-sample", "vibebots-compatibility", "mi-casa-es-su-casa-compatibility", "determined-compatibility"]);
  assert.deepEqual(plan.soakDurations, [
    { durationId: "one-hour-qualification", warmupSeconds: 300, measuredSeconds: 3600, requiredRunsPerConfigurationWorkload: 1 },
    { durationId: "four-hour-endurance", warmupSeconds: 300, measuredSeconds: 14400, requiredRunsPerConfigurationWorkload: 1 },
  ]);
  assert.deepEqual(plan.schedule, {
    configurationCount: 4, workloadCount: 4, durationCount: 2, requiredCellCount: 32, samplingPeriodMs: 1000,
    counterbalancedConfigurationAndWorkloadOrder: true, coolDownToAmbientBandBeforeCell: true,
    invalidHarnessRunsRetainedAndRerun: true, productFailuresMayBeReplaced: false,
    oneRunIsReliabilityRateEvidence: false, counterbalancedScheduleSha256: null, coolDownProtocolSha256: null,
  });
  assert.equal(plan.requiredMetrics.length, 12);
  assert.equal(new Set(plan.requiredMetrics).size, 12);

  exactKeys(plan.acceptance, ["maximumOneMeterAcousticsDba", "maximumThermalShutdowns", "maximumUnrecoveredFailures", "maximumPrivilegedFalseActivations", "maximumExposureToActionP95Ms", ...openGates, "everyConfigurationWorkloadDurationCellMustPass", "aggregateMayRescueFailedCell", "numericDbaPassMayExcuseTonalRattleOrOscillationFailure", "openEnclosureMayQualifyFinalEnclosure", "oneHourMaySubstituteForFourHour"], "acceptance");
  assert.deepEqual([plan.acceptance.maximumOneMeterAcousticsDba, plan.acceptance.maximumThermalShutdowns, plan.acceptance.maximumUnrecoveredFailures, plan.acceptance.maximumPrivilegedFalseActivations, plan.acceptance.maximumExposureToActionP95Ms], [35, 0, 0, 0, 120]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyConfigurationWorkloadDurationCellMustPass, true);
  for (const key of ["aggregateMayRescueFailedCell", "numericDbaPassMayExcuseTonalRattleOrOscillationFailure", "openEnclosureMayQualifyFinalEnclosure", "oneHourMaySubstituteForFourHour"]) assert.equal(plan.acceptance[key], false);
  assert.deepEqual(plan.selectionPolicy, { baselineConfigurationId: "official-active-cooler-baseline", selectedConfigurationId: null, automaticSelectionAllowed: false, allConfigurationsUseExactSameTargetAndWorkloads: true, thermalAcousticPerformanceFitSafetyAndCostAreJoint: true, requiresSeparateEnclosureAndCoolingDecision: true });
  assert.deepEqual(plan.dataPolicy, { rawFrameRetentionAuthorized: false, audioRecordingAuthorized: false, acousticLevelAndSpectrumWithoutSpeechAllowed: true, participantIdentifiersAllowed: false, freeTextAllowed: false, releaseEvidenceAggregateTelemetryOnly: true });
  assert.deepEqual(plan.executionGate, { status: "blocked", hardwareAccessAuthorized: false, purchaseAuthorized: false, enclosureCutOrModificationAuthorized: false, participantCollectionAuthorized: false, sustainedLoadAuthorized: false, blockerCodes: [...PI5_COOLING_BLOCKERS] });
  assert.deepEqual(plan.result, { artifactPath: null, sha256: null, disposition: "not-run", completedCells: 0, qualifiedConfigurationIds: [], selectedConfigurationId: null });
  return plan;
}

export async function parsePi5CoolingSoakPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Pi 5 cooling plan must be valid UTF-8"); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Pi 5 cooling plan must be valid JSON"); }
  await validatePi5CoolingSoakPlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Pi 5 cooling plan must use canonical two-space JSON with one trailing newline");
  return value;
}
export async function validateTrackedPi5CoolingSoakPlan() { return parsePi5CoolingSoakPlanBytes(await readFile(trackedPath)); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedPi5CoolingSoakPlan();
  console.log(`Pi 5 cooling soak plan valid: configurations=${plan.coolingConfigurations.length} cells=${plan.schedule.requiredCellCount} blockers=${plan.executionGate.blockerCodes.length}`);
}
