import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json");
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const TV_APPLIANCE_FORMAT = "vcg-cross-tier-tv-appliance-plan/v1";
export const TV_APPLIANCE_BLOCKERS = Object.freeze([
  "selected-received-target-tv-port-cable-source-and-optional-receiver-tuples",
  "qualified-target-images-compositors-display-audio-cec-and-controller-stacks",
  "ordinary-x86-idle-strategy-and-exact-wake-source-policy",
  "physical-video-audio-controller-fallback-and-independent-timing-oracles",
  "counterbalanced-hundred-cycle-schedule-and-fault-protocol",
  "wake-input-audio-hotplug-reliability-power-and-thermal-gates",
  "hardware-purchase-tv-mutation-cec-hotplug-and-sustained-campaign-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary",
  "sourceDigestContract", "sourceBindings", "targetPolicy", "targets", "sharedEquipmentBoundary",
  "scenarios", "cycleProtocol", "requiredMetrics", "acceptance", "schedule", "dataPolicy",
  "executionGate", "result",
];
const targetKeys = [
  "targetId", "role", "required", "idleStrategy", "idleStrategyBoundary",
  "hardwareAndFirmwareSha256", "operatingSystemRuntimeAndCompositorSha256",
  "displayAudioAndCecStackSha256", "qualifiedConfigurationSha256",
];
const equipmentKeys = [
  "primaryTvManufacturerModelRevisionSha256", "primaryTvFirmwareAndSettingsSha256",
  "primaryTvPortSha256", "hdmiCableIdentityAndCertificationSha256", "externalSourceIdentitySha256",
  "optionalReceiverOrSoundbarIdentitySha256", "physicalVideoAndAudioOracleSha256",
  "controllerAndPhysicalFallbackOracleSha256", "independentTimingHarnessSha256",
  "cecAdapterAndTraceToolSha256", "roomAndViewingGeometrySha256",
];
const openGates = [
  "maximumWakeFailureRatio", "maximumInputSwitchRecoveryP95Ms", "maximumAudioRouteRecoveryP95Ms",
  "maximumHotPlugRecoveryP95Ms", "maximumUnexpectedAudioDropouts",
  "maximumUnexpectedVideoBlankingEvents", "maximumWallPowerW", "maximumSustainedTemperatureC",
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
    ["pi-hdmi-audio-cec-boundary", "benchmarks/pi5-hdmi-cec/pi5-hdmi-audio-cec-plan-v1.json"],
    ["ordinary-x86-target-boundary", "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json"],
    ["cross-tier-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
    ["display-audio-settings-boundary", "docs/DISPLAY_AUDIO_SETTINGS_REHEARSAL_2026-07-25.md"],
    ["power-recovery-policy-boundary", "docs/POWER_RECOVERY_STATE_MACHINE.md"],
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

export async function validateCrossTierTvAppliancePlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, TV_APPLIANCE_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-tv-sleep-wake-input-audio-hotplug-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-118"]);
  assert.match(plan.claimBoundary, /^Pre-registered physical-TV appliance behavior campaign only\./u);
  for (const boundary of ["Browser pixels", "CEC traffic", "running launcher", "physical picture", "audible output", "controller-recovery"]) {
    assert.match(plan.claimBoundary, new RegExp(boundary, "u"));
  }
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: ["ordinary-x86-linux-premium", "pi5-hailo26-reference"],
    optionalTargetIds: ["steam-machine-optional"],
    windowsMayQualifyOrdinaryLinux: false,
    wsl2MayQualifyOrdinaryLinux: false,
    steamMachineMaySubstituteRequiredTarget: false,
    oneRequiredTargetMayRescueAnother: false,
    piCampaignMayQualifyOrdinaryX86: false,
    automaticTargetSelection: false,
  });

  const expectedTargets = [
    ["ordinary-x86-linux-premium", "common-premium-required", true, null, "Q-270"],
    ["pi5-hailo26-reference", "lower-cost-reference-required", true, "low-power-launcher-idle", "D-095"],
    ["steam-machine-optional", "later-optional-compatibility", false, "platform-suspend", "D-095"],
  ];
  assert.equal(plan.targets.length, expectedTargets.length);
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(target, targetKeys, `targets[${index}]`);
    const expected = expectedTargets[index];
    assert.deepEqual([target.targetId, target.role, target.required, target.idleStrategy], expected.slice(0, 4));
    assert.match(target.idleStrategyBoundary, new RegExp(expected[4], "u"));
    for (const key of targetKeys.slice(5)) assert.equal(target[key], null, `blocked plan cannot populate targets[${index}].${key}`);
  }

  exactKeys(plan.sharedEquipmentBoundary, equipmentKeys, "sharedEquipmentBoundary");
  for (const key of equipmentKeys) assert.equal(plan.sharedEquipmentBoundary[key], null, `blocked plan cannot populate ${key}`);

  const expectedScenarios = [
    ["launcher-idle-tv-standby-and-approved-wake", "sleep-wake"],
    ["tv-standby-while-console-active-and-return", "sleep-wake"],
    ["deliberate-input-switch-away-and-back", "input-switch"],
    ["external-source-takes-input-and-user-returns", "input-switch"],
    ["direct-tv-audio-route-loss-and-restoration", "audio-change"],
    ["audio-device-change-away-and-back", "audio-change"],
    ["hdmi-unplug-replug-and-safe-mode-recovery", "hotplug"],
    ["hotplug-during-launch-game-and-idle-boundaries", "hotplug"],
  ];
  assert.equal(plan.scenarios.length, expectedScenarios.length);
  for (const [index, scenario] of plan.scenarios.entries()) {
    exactKeys(scenario, ["scenarioId", "domain", "requiredOutcome"], `scenarios[${index}]`);
    assert.deepEqual([scenario.scenarioId, scenario.domain], expectedScenarios[index]);
    assert.ok(scenario.requiredOutcome.length >= 135, `scenarios[${index}] outcome is incomplete`);
  }
  assert.equal(new Set(plan.scenarios.map((scenario) => scenario.scenarioId)).size, 8);
  assert.deepEqual(plan.scenarios.map((scenario) => scenario.domain), [
    "sleep-wake", "sleep-wake", "input-switch", "input-switch",
    "audio-change", "audio-change", "hotplug", "hotplug",
  ]);

  assert.deepEqual(plan.cycleProtocol, {
    phases: [
      "prove baseline physical picture audible stereo and controller response",
      "apply exactly one scheduled TV input audio sleep wake or hot-plug stimulus",
      "observe physical state and host state independently without accepting API state as physical proof",
      "apply the pre-registered recovery action without unscheduled operator intervention",
      "prove restored physical picture audible stereo controller response and privileged fallback",
      "hold the restored state for the complete post-recovery observation interval",
    ],
    validCyclesPerScenarioPerTarget: 100,
    minimumPostRecoveryObservationSeconds: 60,
    counterbalancedTargetScenarioOrder: true,
    invalidHarnessCyclesRetainedAndRerun: true,
    productFailuresMayBeReplaced: false,
    unscheduledOperatorInterventionIsProductFailure: true,
    scheduleSha256: null,
    operatorProtocolSha256: null,
    faultInjectionProtocolSha256: null,
    physicalObservationProtocolSha256: null,
  });

  assert.equal(plan.requiredMetrics.length, 11);
  assert.equal(new Set(plan.requiredMetrics).size, 11);
  for (const metric of plan.requiredMetrics) assert.ok(metric.length >= 70);

  exactKeys(plan.acceptance, [
    "maximumWarmWakeToControllerUsableMs", "maximumUnrecoveredCycles",
    "maximumFalsePhysicalReadyOrAudibleClaims", "maximumCecLoopsOrRunawayRepeats",
    "maximumUnexpectedInputTakeovers", "maximumLostControllerOrPhysicalFallbacks",
    "maximumPrivacyOrQuiescenceGateViolations", "maximumCrashesHangsOrUnboundedRestarts",
    ...openGates, "everyRequiredTargetScenarioCellMustPass", "aggregateMayRescueFailedCell",
    "anotherTargetMayRescueFailedTarget", "optionalTargetMayRescueRequiredTarget",
    "cecTrafficMayEstablishPhysicalOutcome", "edidEldOrCompositorStateMayEstablishPhysicalOutcome",
    "audioApiStateMayEstablishAudibleOutput", "runningLauncherMayEstablishControllerUsability",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumWarmWakeToControllerUsableMs,
    plan.acceptance.maximumUnrecoveredCycles,
    plan.acceptance.maximumFalsePhysicalReadyOrAudibleClaims,
    plan.acceptance.maximumCecLoopsOrRunawayRepeats,
    plan.acceptance.maximumUnexpectedInputTakeovers,
    plan.acceptance.maximumLostControllerOrPhysicalFallbacks,
    plan.acceptance.maximumPrivacyOrQuiescenceGateViolations,
    plan.acceptance.maximumCrashesHangsOrUnboundedRestarts,
  ], [5000, 0, 0, 0, 0, 0, 0, 0]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredTargetScenarioCellMustPass, true);
  for (const key of [
    "aggregateMayRescueFailedCell", "anotherTargetMayRescueFailedTarget",
    "optionalTargetMayRescueRequiredTarget", "cecTrafficMayEstablishPhysicalOutcome",
    "edidEldOrCompositorStateMayEstablishPhysicalOutcome", "audioApiStateMayEstablishAudibleOutput",
    "runningLauncherMayEstablishControllerUsability",
  ]) assert.equal(plan.acceptance[key], false, `${key} must remain false`);

  assert.deepEqual(plan.schedule, {
    requiredTargetCount: 2,
    optionalTargetCount: 1,
    scenarioCount: 8,
    requiredTargetScenarioCellCount: 16,
    requiredCycles: 1600,
    optionalCycles: 800,
    piI027I028CyclesMayBeReusedOnlyWithExactProtocolAndCellIdentity: true,
    reusedCycleMayAppearOnce: true,
    partialPiEvidenceMayQualifyCrossTierCampaign: false,
  });
  assert.equal(
    plan.schedule.requiredTargetCount * plan.schedule.scenarioCount * plan.cycleProtocol.validCyclesPerScenarioPerTarget,
    plan.schedule.requiredCycles,
  );
  assert.equal(
    plan.schedule.optionalTargetCount * plan.schedule.scenarioCount * plan.cycleProtocol.validCyclesPerScenarioPerTarget,
    plan.schedule.optionalCycles,
  );

  assert.deepEqual(plan.dataPolicy, {
    rawFramesVideoOrAudioRecordingAuthorized: false,
    rawEdidEldOrCecTraceReleaseAuthorized: false,
    stableEquipmentSerialsAllowed: false,
    networkAddressesOrCredentialsAllowed: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    saltedPerCampaignEquipmentAliasesAllowed: true,
    aggregateTelemetryReleaseOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    hardwareAccessAuthorized: false,
    purchaseAuthorized: false,
    tvPowerInputVolumeOrMuteMutationAuthorized: false,
    displayModeOrAudioRouteMutationAuthorized: false,
    cecTransmissionAuthorized: false,
    physicalHotPlugAuthorized: false,
    sustainedCampaignAuthorized: false,
    blockerCodes: [...TV_APPLIANCE_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedRequiredCycles: 0,
    completedOptionalCycles: 0,
    qualifiedTargetIds: [],
    qualifiedScenarioIds: [],
    failedCellIds: [],
  });
  return plan;
}

export async function parseCrossTierTvAppliancePlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Cross-tier TV appliance plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Cross-tier TV appliance plan must be valid JSON");
  }
  await validateCrossTierTvAppliancePlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Cross-tier TV appliance plan must use canonical two-space JSON with one trailing newline");
  return value;
}

export async function validateTrackedCrossTierTvAppliancePlan() {
  return parseCrossTierTvAppliancePlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedCrossTierTvAppliancePlan();
  console.log(`Cross-tier TV appliance plan valid: targets=${plan.targets.length} scenarios=${plan.scenarios.length} requiredCycles=${plan.schedule.requiredCycles}`);
}
