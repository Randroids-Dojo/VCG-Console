import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(root, "benchmarks/controller-pairing/cross-tier-bluetooth-controller-plan-v1.json");
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const BLUETOOTH_CONTROLLER_FORMAT = "vcg-cross-tier-bluetooth-controller-plan/v1";
export const BLUETOOTH_CONTROLLER_BLOCKERS = Object.freeze([
  "exact-received-controller-sample-revision-firmware-and-battery-roster-q227-q231",
  "exact-required-target-radio-bluez-sdl-mapping-compositor-and-bond-store-tuples",
  "controller-accessible-pairing-agent-ui-confirmation-and-recovery-policy",
  "battery-source-low-critical-unavailable-stale-and-warning-policy-q231",
  "pair-reconnect-battery-input-and-reliability-thresholds-q230-q232",
  "counterbalanced-applicability-schedule-harness-oracles-and-ledger-schema",
  "hardware-purchase-pair-bond-radio-service-battery-and-sustained-execution-authority",
]);

const topKeys = [
  "format", "status", "campaignId", "observedAt", "qualificationScope", "claimBoundary",
  "sourceDigestContract", "sourceBindings", "targetPolicy", "targets", "samplePolicy",
  "samples", "batteryConditions", "scenarios", "cycleProtocol", "requiredMetrics",
  "acceptance", "schedule", "dataPolicy", "executionGate", "result",
];
const targetKeys = [
  "targetId", "role", "required", "hardwareFirmwareAndRadioTopologySha256",
  "operatingSystemKernelBluezAndSdlSha256", "pairingAgentAndUiSha256",
  "bondStorePolicySha256", "qualifiedConfigurationSha256",
];
const sampleKeys = [
  "sampleId", "role", "expectedDisposition", "physicalSampleManifestSha256s",
  "firmwareManifestSha256", "bluetoothIdentityAndCapabilitiesSha256",
  "mappingManifestSha256", "batterySourceManifestSha256",
];
const openGates = [
  "maximumPairingP95Ms", "maximumColdBootReconnectP95Ms", "maximumFaultReconnectP95Ms",
  "maximumLowBatteryInputP95Ms", "maximumBatteryWarningLatencyMs",
  "minimumLowBatteryUsableSeconds", "maximumBluetoothDisconnectRatio",
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
    ["cross-tier-controller-campaign-boundary", "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json"],
    ["pi-radio-coexistence-boundary", "benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json"],
    ["controller-protocol-boundary", "docs/CONTROLLER_QUALIFICATION_PROTOCOL_2026-07-24.md"],
    ["cross-tier-timing-boundary", "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json"],
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

export async function validateCrossTierBluetoothControllerPlan(plan, repositoryRoot = root) {
  exactKeys(plan, topKeys, "plan");
  assert.equal(plan.format, BLUETOOTH_CONTROLLER_FORMAT);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.campaignId, "cross-tier-bluetooth-pair-reconnect-battery-v1");
  assert.equal(plan.observedAt, "2026-07-25");
  assert.deepEqual(plan.qualificationScope, ["I-117"]);
  assert.match(plan.claimBoundary, /^Pre-registered physical Bluetooth controller pairing/u);
  for (const phrase of ["No controller brand", "Browser Gamepad", "stored bond", "receiver or wired behavior", "one successful attempt"]) {
    assert.match(plan.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(plan.sourceDigestContract, "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected");
  await validateSources(plan.sourceBindings, repositoryRoot);

  assert.deepEqual(plan.targetPolicy, {
    requiredTargetIds: ["ordinary-x86-linux-premium", "pi5-hailo26-reference"],
    optionalTargetIds: ["steam-machine-optional"],
    windowsMayQualifyRequiredLinuxTarget: false,
    wsl2MayQualifyRequiredLinuxTarget: false,
    optionalTargetMayRescueRequiredTarget: false,
    oneRequiredTargetMayRescueAnother: false,
    piRadioCampaignMayQualifyOrdinaryX86: false,
    automaticTargetSelection: false,
  });
  const expectedTargets = [
    ["ordinary-x86-linux-premium", "common-premium-required", true],
    ["pi5-hailo26-reference", "lower-cost-reference-required", true],
    ["steam-machine-optional", "later-optional-compatibility", false],
  ];
  assert.equal(plan.targets.length, expectedTargets.length);
  for (const [index, target] of plan.targets.entries()) {
    exactKeys(target, targetKeys, `targets[${index}]`);
    assert.deepEqual([target.targetId, target.role, target.required], expectedTargets[index]);
    for (const key of targetKeys.slice(3)) assert.equal(target[key], null, `blocked plan cannot populate targets[${index}].${key}`);
  }

  assert.deepEqual(plan.samplePolicy, {
    requiredSampleRoles: ["first-party-standard", "second-vendor-standard", "generic-ambiguous", "simultaneous-cross-vendor-pair"],
    exactSampleSetDecision: "Q-227",
    bluetoothTransportRequired: true,
    wiredMayQualifyBluetooth: false,
    usbReceiverMayQualifyBluetooth: false,
    familyResemblanceMayQualify: false,
    mappingDatabaseEntryMayQualify: false,
    oneSuccessfulAttemptMayQualify: false,
    materialFirmwareOrHardwareRevisionIsSeparateConfiguration: true,
    automaticSampleSelection: false,
  });
  const expectedSamples = [
    ["first-party-standard", "must-pass"],
    ["second-vendor-standard", "must-pass"],
    ["generic-ambiguous", "must-fail-closed-or-pass-approved-guided-mapping"],
    ["simultaneous-cross-vendor-pair", "both-devices-must-pass-with-distinct-epochs-and-assignments"],
  ];
  assert.equal(plan.samples.length, expectedSamples.length);
  for (const [index, sample] of plan.samples.entries()) {
    exactKeys(sample, sampleKeys, `samples[${index}]`);
    assert.deepEqual([sample.sampleId, sample.role, sample.expectedDisposition], [expectedSamples[index][0], expectedSamples[index][0], expectedSamples[index][1]]);
    assert.deepEqual(sample.physicalSampleManifestSha256s, []);
    for (const key of sampleKeys.slice(4)) assert.equal(sample[key], null, `blocked plan cannot populate samples[${index}].${key}`);
  }

  const expectedBattery = ["normal-or-charging", "low", "critical", "unavailable", "stale"];
  assert.deepEqual(plan.batteryConditions.map((condition) => condition.conditionId), expectedBattery);
  for (const [index, condition] of plan.batteryConditions.entries()) {
    exactKeys(condition, ["conditionId", "requiredOutcome"], `batteryConditions[${index}]`);
    assert.ok(condition.requiredOutcome.length >= 100);
  }

  const expectedScenarios = [
    ["fresh-unpaired-controller-present-before-cold-boot", ["first-party-standard", "second-vendor-standard", "generic-ambiguous"], "pairing"],
    ["fresh-unpaired-controller-at-launcher", ["first-party-standard", "second-vendor-standard", "generic-ambiguous"], "pairing"],
    ["bonded-controller-off-during-cold-boot-then-wake", ["first-party-standard", "second-vendor-standard"], "cold-boot-reconnect"],
    ["bonded-controller-on-during-cold-boot", ["first-party-standard", "second-vendor-standard"], "cold-boot-reconnect"],
    ["controller-sleep-wake-and-reconnect", ["first-party-standard", "second-vendor-standard"], "reconnect"],
    ["host-radio-loss-and-recovery", ["first-party-standard", "second-vendor-standard", "simultaneous-cross-vendor-pair"], "fault-recovery"],
    ["bluetooth-service-restart", ["first-party-standard", "second-vendor-standard", "simultaneous-cross-vendor-pair"], "fault-recovery"],
    ["controller-power-loss-while-action-held", ["first-party-standard", "second-vendor-standard", "simultaneous-cross-vendor-pair"], "fault-recovery"],
    ["forget-bond-revoke-and-repair", ["first-party-standard", "second-vendor-standard", "generic-ambiguous"], "pairing"],
    ["unauthorized-nearby-device-and-pairing-failure", ["first-party-standard", "second-vendor-standard", "generic-ambiguous"], "pairing-failure"],
    ["two-controller-pairing-in-both-orders", ["simultaneous-cross-vendor-pair"], "simultaneous-devices"],
    ["two-controller-simultaneous-reconnect-and-reassignment", ["simultaneous-cross-vendor-pair"], "simultaneous-devices"],
    ["low-battery-pair-reconnect-and-use", ["first-party-standard", "second-vendor-standard"], "battery"],
    ["critical-unavailable-and-stale-battery-evidence", ["first-party-standard", "second-vendor-standard", "generic-ambiguous"], "battery"],
  ];
  assert.equal(plan.scenarios.length, expectedScenarios.length);
  for (const [index, scenario] of plan.scenarios.entries()) {
    exactKeys(scenario, ["scenarioId", "applicableSampleRoles", "domain", "requiredOutcome"], `scenarios[${index}]`);
    assert.deepEqual([scenario.scenarioId, scenario.applicableSampleRoles, scenario.domain], expectedScenarios[index]);
    assert.ok(scenario.requiredOutcome.length >= 130, `scenarios[${index}] outcome incomplete`);
  }
  assert.equal(new Set(plan.scenarios.map((scenario) => scenario.scenarioId)).size, 14);

  assert.deepEqual(plan.cycleProtocol, {
    validCyclesPerApplicableTargetSampleScenarioCell: 20,
    counterbalancedTargetSampleScenarioOrder: true,
    coldBootRequiresElectricalOffState: true,
    bondedAndFreshPairingStartStatesAreSeparate: true,
    invalidHarnessCyclesRetainedAndRerun: true,
    productFailuresMayBeReplaced: false,
    unscheduledKeyboardMouseOrDesktopInterventionIsProductFailure: true,
    scheduleSha256: null,
    pairingOperatorProtocolSha256: null,
    batteryConditionProtocolSha256: null,
    faultInjectionProtocolSha256: null,
    physicalInputAndClockOracleSha256: null,
  });
  assert.equal(plan.requiredMetrics.length, 10);
  assert.equal(new Set(plan.requiredMetrics).size, 10);
  for (const metric of plan.requiredMetrics) assert.ok(metric.length >= 85);

  exactKeys(plan.acceptance, [
    "maximumWarmReconnectToControllerUsableMs", "maximumUnrecoveredPairingOrReconnectFailures",
    "maximumFalsePairingOrConnectedClaims", "maximumStuckFabricatedDuplicateOrOldEpochActions",
    "maximumWrongPlayerOrDurableIdentityAssignments", "maximumReservedActionGameDeliveries",
    "maximumLostControllerOrPhysicalRecoveryPaths", "maximumBondCredentialOrStableIdentityDisclosures",
    ...openGates, "everyRequiredTargetSampleScenarioCellMustPass", "aggregateMayRescueFailedCell",
    "anotherTargetMayRescueFailedTarget", "wiredOrReceiverResultMayRescueBluetooth",
    "batteryStateMayBeInferred", "connectedFlagMayEstablishUsableInput",
    "storedBondMayEstablishFreshIdentityOrAssignment",
  ], "acceptance");
  assert.deepEqual([
    plan.acceptance.maximumWarmReconnectToControllerUsableMs,
    plan.acceptance.maximumUnrecoveredPairingOrReconnectFailures,
    plan.acceptance.maximumFalsePairingOrConnectedClaims,
    plan.acceptance.maximumStuckFabricatedDuplicateOrOldEpochActions,
    plan.acceptance.maximumWrongPlayerOrDurableIdentityAssignments,
    plan.acceptance.maximumReservedActionGameDeliveries,
    plan.acceptance.maximumLostControllerOrPhysicalRecoveryPaths,
    plan.acceptance.maximumBondCredentialOrStableIdentityDisclosures,
  ], [5000, 0, 0, 0, 0, 0, 0, 0]);
  for (const key of openGates) assert.equal(plan.acceptance[key], null, `blocked plan cannot populate ${key}`);
  assert.equal(plan.acceptance.everyRequiredTargetSampleScenarioCellMustPass, true);
  for (const key of [
    "aggregateMayRescueFailedCell", "anotherTargetMayRescueFailedTarget",
    "wiredOrReceiverResultMayRescueBluetooth", "batteryStateMayBeInferred",
    "connectedFlagMayEstablishUsableInput", "storedBondMayEstablishFreshIdentityOrAssignment",
  ]) assert.equal(plan.acceptance[key], false, `${key} must remain false`);

  const applicableCells = plan.scenarios.reduce((sum, scenario) => sum + scenario.applicableSampleRoles.length, 0);
  assert.deepEqual(plan.schedule, {
    requiredTargetCount: 2,
    optionalTargetCount: 1,
    sampleRoleCount: 4,
    scenarioCount: 14,
    applicableSampleScenarioCellCountPerTarget: 34,
    requiredTargetSampleScenarioCellCount: 68,
    requiredCycles: 1360,
    optionalCycles: 680,
    i152CycleMayBeReusedOnlyWithExactProtocolAndCellIdentity: true,
    i026CycleMayBeReusedOnlyWithExactProtocolAndCellIdentity: true,
    reusedCycleMayAppearOnce: true,
    partialControllerOrPiRadioEvidenceMayQualifyCampaign: false,
  });
  assert.equal(applicableCells, plan.schedule.applicableSampleScenarioCellCountPerTarget);
  assert.equal(applicableCells * plan.schedule.requiredTargetCount, plan.schedule.requiredTargetSampleScenarioCellCount);
  assert.equal(plan.schedule.requiredTargetSampleScenarioCellCount * plan.cycleProtocol.validCyclesPerApplicableTargetSampleScenarioCell, plan.schedule.requiredCycles);
  assert.equal(applicableCells * plan.schedule.optionalTargetCount * plan.cycleProtocol.validCyclesPerApplicableTargetSampleScenarioCell, plan.schedule.optionalCycles);

  assert.deepEqual(plan.dataPolicy, {
    rawBluetoothAddressesNamesOrStableSerialsAllowed: false,
    bondKeysPasskeysOrCredentialsAllowed: false,
    rawHidDescriptorsEventsOrPacketPayloadsAllowed: false,
    rawRadioTraceReleaseAllowed: false,
    participantIdentifiersAllowed: false,
    freeTextAllowed: false,
    saltedPerCampaignDeviceAliasesAllowed: true,
    aggregateTelemetryReleaseOnly: true,
  });
  assert.deepEqual(plan.executionGate, {
    status: "blocked",
    controllerPurchaseAuthorized: false,
    physicalControllerExecutionAuthorized: false,
    pairForgetOrBondMutationAuthorized: false,
    bluetoothRadioOrServiceFaultAuthorized: false,
    batteryDischargeOrPowerFaultAuthorized: false,
    sustainedCampaignAuthorized: false,
    blockerCodes: [...BLUETOOTH_CONTROLLER_BLOCKERS],
  });
  assert.deepEqual(plan.result, {
    artifactPath: null,
    sha256: null,
    disposition: "not-run",
    completedRequiredCycles: 0,
    completedOptionalCycles: 0,
    qualifiedTargetIds: [],
    qualifiedSampleIds: [],
    qualifiedScenarioIds: [],
    failedCellIds: [],
  });
  return plan;
}

export async function parseCrossTierBluetoothControllerPlanBytes(bytes, repositoryRoot = root) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= MAX_BYTES);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf));
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Cross-tier Bluetooth controller plan must be valid UTF-8");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Cross-tier Bluetooth controller plan must be valid JSON");
  }
  await validateCrossTierBluetoothControllerPlan(value, repositoryRoot);
  assert.equal(text, `${JSON.stringify(value, null, 2)}\n`, "Cross-tier Bluetooth controller plan must use canonical two-space JSON with one trailing newline");
  return value;
}

export async function validateTrackedCrossTierBluetoothControllerPlan() {
  return parseCrossTierBluetoothControllerPlanBytes(await readFile(trackedPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await validateTrackedCrossTierBluetoothControllerPlan();
  console.log(`Cross-tier Bluetooth controller plan valid: targets=${plan.targets.length} scenarios=${plan.scenarios.length} requiredCycles=${plan.schedule.requiredCycles}`);
}
