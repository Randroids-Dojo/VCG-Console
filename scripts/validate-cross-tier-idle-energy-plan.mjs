import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json");
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const IDLE_ENERGY_FORMAT = "vcg-cross-tier-idle-energy-plan/v1";
export const IDLE_ENERGY_BLOCKERS = Object.freeze([
  "selected-received-target-power-display-controller-and-wake-source-tuples",
  "qualified-idle-suspend-quiescence-privacy-display-input-and-wake-adapters",
  "ordinary-x86-strategy-comparison-and-selection-authority-q270",
  "calibrated-wall-power-thermal-write-network-state-and-physical-wake-oracles-q271-q272",
  "counterbalanced-one-eight-twenty-four-hour-and-hundred-cycle-schedule",
  "power-energy-thermal-write-network-wake-latency-and-reliability-gates",
  "hardware-purchase-idle-suspend-wake-display-network-update-and-unattended-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary",
  "sourceDigestContract", "sourceBindings", "targetPolicy", "targets", "strategyProfiles",
  "entryProfiles", "durations", "wakeSourcePolicy", "idleInvariants", "measurementProtocol",
  "requiredMetrics", "acceptance", "selectionPolicy", "dataPolicy", "executionGate", "result",
];
const targetKeys = [
  "targetId", "role", "required", "candidateStrategyIds", "strategyBoundary",
  "selectedStrategyId", "hardwareFirmwareAndPowerTopologySha256",
  "operatingSystemRuntimeAndAdapterSha256", "qualifiedConfigurationSha256",
];
const openGates = [
  "maximumIdleAverageWallPowerW", "maximumEightHourEnergyWh", "maximumTwentyFourHourEnergyWh",
  "maximumIdleTemperatureC", "maximumIdleWriteBytesPerHour", "maximumIdleNetworkBytesPerHour",
  "maximumWakeFailureRatio", "maximumWakeP95Ms", "minimumEnergySavingsRatioAgainstActiveLauncher",
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
    ["cross-tier-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
    ["power-recovery-policy-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
    ["physical-tv-wake-boundary", "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json"],
    ["physical-controller-wake-boundary", "benchmarks/controller-pairing/cross-tier-bluetooth-controller-plan-v1.json"],
    ["pi-thermal-boundary", "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json"],
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

export async function validateCrossTierIdleEnergyPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, IDLE_ENERGY_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-unattended-idle-energy-wake-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-120"]);
  assert.match(plan.claimBoundary, /^Pre-registered unattended idle energy/u);
  for (const phrase of ["No target", "wall power", "privacy", "one wake", "physical low-power behavior"]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: ["ordinary-x86-linux-premium", "pi5-hailo26-reference"],
    optionalTargetIds: ["steam-machine-optional"],
    windowsMayQualifyOrdinaryLinux: false,
    wsl2MayQualifyOrdinaryLinux: false,
    optionalTargetMayRescueRequiredTarget: false,
    oneRequiredTargetMayRescueAnother: false,
    automaticStrategySelection: false,
  });
  const expectedTargets = [
    ["ordinary-x86-linux-premium", "common-premium-required", true, ["platform-suspend-candidate", "low-power-launcher-idle-candidate"], "Q-270"],
    ["pi5-hailo26-reference", "lower-cost-reference-required", true, ["low-power-launcher-idle"], "D-095"],
    ["steam-machine-optional", "later-optional-compatibility", false, ["platform-suspend"], "D-095"],
  ];
  assert.equal(plan.targets.length, expectedTargets.length);
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(target, targetKeys, `targets[${index}]`);
    const expected = expectedTargets[index];
    assert.deepEqual([target.targetId, target.role, target.required, target.candidateStrategyIds], expected.slice(0, 4));
    assert.match(target.strategyBoundary, new RegExp(expected[4], "u"));
    for (const key of targetKeys.slice(5)) assert.equal(target[key], null, `blocked plan cannot populate targets[${index}].${key}`);
  }

  assert.deepEqual(plan.strategyProfiles, [
    { strategyId: "platform-suspend-candidate", applicableTargetIds: ["ordinary-x86-linux-premium"], requiredForComparison: true, selected: false },
    { strategyId: "low-power-launcher-idle-candidate", applicableTargetIds: ["ordinary-x86-linux-premium"], requiredForComparison: true, selected: false },
    { strategyId: "low-power-launcher-idle", applicableTargetIds: ["pi5-hailo26-reference"], requiredForComparison: true, selected: false },
    { strategyId: "platform-suspend", applicableTargetIds: ["steam-machine-optional"], requiredForComparison: false, selected: false },
  ]);
  const expectedEntries = [
    "accountless-offline-launcher", "online-launcher-quiescent", "after-local-game", "after-hosted-session",
  ];
  assert.deepEqual(plan.entryProfiles.map((profile) => profile.profileId), expectedEntries);
  for (const [index, profile] of plan.entryProfiles.entries()) {
    exactKeys(profile, ["profileId", "requiredState"], `entryProfiles[${index}]`);
    assert.ok(profile.requiredState.length >= 95);
  }
  assert.deepEqual(plan.durations, [
    { durationId: "one-hour-characterization", seconds: 3600, validRunsPerTargetStrategyProfile: 5 },
    { durationId: "eight-hour-overnight", seconds: 28800, validRunsPerTargetStrategyProfile: 5 },
    { durationId: "twenty-four-hour-unattended", seconds: 86400, validRunsPerTargetStrategyProfile: 5 },
  ]);
  assert.deepEqual(plan.wakeSourcePolicy, {
    requiredSourceRoles: ["primary-controller", "physical-fallback"],
    conditionalSourceRoles: ["remote-if-claimed", "hdmi-cec-if-claimed"],
    validCyclesPerTargetStrategySource: 100,
    unsupportedConditionalSourceMustBeReported: true,
    oneSourceMayRescueAnother: false,
    hostEventMayEstablishPhysicalWake: false,
  });
  assert.equal(plan.idleInvariants.length, 10);
  assert.equal(new Set(plan.idleInvariants).size, 10);
  for (const invariant of plan.idleInvariants) assert.ok(invariant.length >= 60);

  assert.deepEqual(plan.measurementProtocol, {
    targetStrategyCombinationCountRequired: 3,
    entryProfileCount: 4,
    durationCount: 3,
    validRunsPerCell: 5,
    requiredIdleRunCellCount: 36,
    requiredIdleRuns: 180,
    minimumRequiredWakeCycles: 600,
    optionalWakeCycles: 200,
    minimumPowerSampleRateHz: 1,
    minimumThermalSampleRateHz: 1,
    ambientStabilizationSeconds: 1800,
    postWakeObservationSeconds: 300,
    counterbalancedTargetStrategyProfileDurationOrder: true,
    invalidHarnessRunsRetainedAndRerun: true,
    productFailuresMayBeReplaced: false,
    unscheduledOperatorInterventionIsProductFailure: true,
    scheduleSha256: null,
    powerMeterAndClockCalibrationSha256: null,
    stateAndPrivacyOracleSha256: null,
    wakeStimulusProtocolSha256: null,
    writeAndNetworkQuiescenceProtocolSha256: null,
  });
  assert.equal(plan.measurementProtocol.targetStrategyCombinationCountRequired * plan.measurementProtocol.entryProfileCount * plan.measurementProtocol.durationCount, plan.measurementProtocol.requiredIdleRunCellCount);
  assert.equal(plan.measurementProtocol.requiredIdleRunCellCount * plan.measurementProtocol.validRunsPerCell, plan.measurementProtocol.requiredIdleRuns);
  assert.equal(plan.measurementProtocol.targetStrategyCombinationCountRequired * plan.wakeSourcePolicy.requiredSourceRoles.length * plan.wakeSourcePolicy.validCyclesPerTargetStrategySource, plan.measurementProtocol.minimumRequiredWakeCycles);
  assert.equal(plan.requiredMetrics.length, 10);
  assert.equal(new Set(plan.requiredMetrics).size, 10);
  for (const metric of plan.requiredMetrics) assert.ok(metric.length >= 90);

  exactKeys(plan.acceptance, [
    "maximumWarmWakeToControllerUsableMs", "maximumUnrecoveredWakeFailures",
    "maximumFalseOrDuplicateWakes", "maximumPrivacyStateViolations",
    "maximumUnsafeOrUnboundedWrites", "maximumUnsafeUpdateOrProtectedStateTransitions",
    "maximumLostRequiredWakeSources", "maximumCrashesHangsOrUnboundedRestarts",
    ...openGates, "everyRequiredIdleCellAndWakeSourceMustPass", "aggregateMayRescueFailedCell",
    "anotherStrategyMayRescueFailedStrategy", "anotherTargetMayRescueFailedTarget",
    "optionalTargetMayRescueRequiredTarget", "shorterDurationMayRescueLongerDuration",
    "powerSavingsMayRescuePrivacyWakeOrWriteFailure", "wakeLatencyMayRescueEnergyOrReliabilityFailure",
    "hostReportedPowerMayEstablishWallEnergy",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumWarmWakeToControllerUsableMs,
    plan.acceptance.maximumUnrecoveredWakeFailures,
    plan.acceptance.maximumFalseOrDuplicateWakes,
    plan.acceptance.maximumPrivacyStateViolations,
    plan.acceptance.maximumUnsafeOrUnboundedWrites,
    plan.acceptance.maximumUnsafeUpdateOrProtectedStateTransitions,
    plan.acceptance.maximumLostRequiredWakeSources,
    plan.acceptance.maximumCrashesHangsOrUnboundedRestarts,
  ], [5000, 0, 0, 0, 0, 0, 0, 0]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredIdleCellAndWakeSourceMustPass, true);
  for (const key of [
    "aggregateMayRescueFailedCell", "anotherStrategyMayRescueFailedStrategy",
    "anotherTargetMayRescueFailedTarget", "optionalTargetMayRescueRequiredTarget",
    "shorterDurationMayRescueLongerDuration", "powerSavingsMayRescuePrivacyWakeOrWriteFailure",
    "wakeLatencyMayRescueEnergyOrReliabilityFailure", "hostReportedPowerMayEstablishWallEnergy",
  ]) assert.equal(plan.acceptance[key], false, `${key} must remain false`);

  assert.deepEqual(plan.selectionPolicy, {
    selectedStrategyByTarget: [],
    automaticSelectionAllowed: false,
    selectionRequiresEveryRequiredCellPass: true,
    selectionRequiresPreRegisteredNumericGates: true,
    selectionRequiresControllerAndPhysicalFallback: true,
    selectionMustPublishEnergyLatencyReliabilityThermalAndWriteTradeoff: true,
  });
  assert.deepEqual(plan.dataPolicy, {
    rawFramesVideoOrAudioAllowed: false,
    networkPayloadsAddressesOrCredentialsAllowed: false,
    profileSaveOrPackageContentsAllowed: false,
    stableEquipmentSerialsAllowed: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    saltedPerCampaignEquipmentAliasesAllowed: true,
    aggregateTelemetryReleaseOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    purchaseAuthorized: false,
    idleSuspendOrWakeMutationAuthorized: false,
    displayAudioOrCecMutationAuthorized: false,
    networkOrUpdateMutationAuthorized: false,
    sustainedUnattendedCampaignAuthorized: false,
    blockerCodes: [...IDLE_ENERGY_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedRequiredIdleRuns: 0,
    completedRequiredWakeCycles: 0,
    qualifiedTargetIds: [],
    qualifiedStrategyIds: [],
    selectedStrategyByTarget: [],
    failedCellIds: [],
  });
  return plan;
}

export async function parseCrossTierIdleEnergyPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Cross-tier idle energy plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Cross-tier idle energy plan must be valid JSON");
  }
  await validateCrossTierIdleEnergyPlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Cross-tier idle energy plan must use canonical two-space JSON with one trailing newline");
  return value;
}

export async function validateTrackedCrossTierIdleEnergyPlan() {
  return parseCrossTierIdleEnergyPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedCrossTierIdleEnergyPlan();
  console.log(`Cross-tier idle energy plan valid: strategies=${plan.strategyProfiles.length} idleRuns=${plan.measurementProtocol.requiredIdleRuns} wakeCycles=${plan.measurementProtocol.minimumRequiredWakeCycles}`);
}
