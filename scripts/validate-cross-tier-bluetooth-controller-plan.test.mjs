import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCrossTierBluetoothControllerPlanBytes,
  validateCrossTierBluetoothControllerPlan,
} from "./validate-cross-tier-bluetooth-controller-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/controller-pairing/cross-tier-bluetooth-controller-plan-v1.json"));
const tracked = await parseCrossTierBluetoothControllerPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-117 campaign", () => {
  assert.equal(tracked.schedule.requiredTargetSampleScenarioCellCount, 68);
  assert.equal(tracked.schedule.requiredCycles, 1360);
  assert.equal(tracked.batteryConditions.length, 5);
});

test("rejects source substitution and invented target or sample evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateCrossTierBluetoothControllerPlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.targets[0].hardwareFirmwareAndRadioTopologySha256 = "a".repeat(64); },
    (plan) => { plan.samples[0].physicalSampleManifestSha256s.push("b".repeat(64)); },
    (plan) => { plan.samples[1].firmwareManifestSha256 = "c".repeat(64); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("preserves required targets, Bluetooth transport, sample roles, and non-substitution", async () => {
  for (const mutate of [
    (plan) => { plan.targetPolicy.requiredTargetIds.pop(); },
    (plan) => { plan.targets.reverse(); },
    (plan) => { plan.targetPolicy.windowsMayQualifyRequiredLinuxTarget = true; },
    (plan) => { plan.targetPolicy.piRadioCampaignMayQualifyOrdinaryX86 = true; },
    (plan) => { plan.samplePolicy.requiredSampleRoles.pop(); },
    (plan) => { plan.samplePolicy.bluetoothTransportRequired = false; },
    (plan) => { plan.samplePolicy.wiredMayQualifyBluetooth = true; },
    (plan) => { plan.samplePolicy.usbReceiverMayQualifyBluetooth = true; },
    (plan) => { plan.samplePolicy.oneSuccessfulAttemptMayQualify = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects battery or scenario coverage deletion and applicability substitution", async () => {
  for (const mutate of [
    (plan) => { plan.batteryConditions.pop(); },
    (plan) => { plan.batteryConditions.reverse(); },
    (plan) => { plan.scenarios.pop(); },
    (plan) => { plan.scenarios.reverse(); },
    (plan) => { plan.scenarios[0].applicableSampleRoles.pop(); },
    (plan) => { plan.scenarios[10].domain = "pairing"; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects weakened repetitions, cold-boot, failure retention, and intervention rules", async () => {
  for (const mutate of [
    (plan) => { plan.cycleProtocol.validCyclesPerApplicableTargetSampleScenarioCell = 19; },
    (plan) => { plan.cycleProtocol.counterbalancedTargetSampleScenarioOrder = false; },
    (plan) => { plan.cycleProtocol.coldBootRequiresElectricalOffState = false; },
    (plan) => { plan.cycleProtocol.bondedAndFreshPairingStartStatesAreSeparate = false; },
    (plan) => { plan.cycleProtocol.invalidHarnessCyclesRetainedAndRerun = false; },
    (plan) => { plan.cycleProtocol.productFailuresMayBeReplaced = true; },
    (plan) => { plan.cycleProtocol.unscheduledKeyboardMouseOrDesktopInterventionIsProductFailure = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects arithmetic drift and partial or duplicate evidence reuse", async () => {
  for (const mutate of [
    (plan) => { plan.schedule.applicableSampleScenarioCellCountPerTarget = 33; },
    (plan) => { plan.schedule.requiredCycles = 1359; },
    (plan) => { plan.schedule.optionalCycles = 679; },
    (plan) => { plan.schedule.i152CycleMayBeReusedOnlyWithExactProtocolAndCellIdentity = false; },
    (plan) => { plan.schedule.i026CycleMayBeReusedOnlyWithExactProtocolAndCellIdentity = false; },
    (plan) => { plan.schedule.reusedCycleMayAppearOnce = false; },
    (plan) => { plan.schedule.partialControllerOrPiRadioEvidenceMayQualifyCampaign = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects weakened fixed gates and inferred pairing, battery, or usability claims", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumWarmReconnectToControllerUsableMs = 5001; },
    (plan) => { plan.acceptance.maximumUnrecoveredPairingOrReconnectFailures = 1; },
    (plan) => { plan.acceptance.maximumStuckFabricatedDuplicateOrOldEpochActions = 1; },
    (plan) => { plan.acceptance.maximumWrongPlayerOrDurableIdentityAssignments = 1; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.wiredOrReceiverResultMayRescueBluetooth = true; },
    (plan) => { plan.acceptance.batteryStateMayBeInferred = true; },
    (plan) => { plan.acceptance.connectedFlagMayEstablishUsableInput = true; },
    (plan) => { plan.acceptance.storedBondMayEstablishFreshIdentityOrAssignment = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects invented thresholds, mutation authority, sensitive data, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumPairingP95Ms = 10000; },
    (plan) => { plan.executionGate.pairForgetOrBondMutationAuthorized = true; },
    (plan) => { plan.executionGate.bluetoothRadioOrServiceFaultAuthorized = true; },
    (plan) => { plan.executionGate.batteryDischargeOrPowerFaultAuthorized = true; },
    (plan) => { plan.dataPolicy.rawBluetoothAddressesNamesOrStableSerialsAllowed = true; },
    (plan) => { plan.dataPolicy.bondKeysPasskeysOrCredentialsAllowed = true; },
    (plan) => { plan.dataPolicy.rawHidDescriptorsEventsOrPacketPayloadsAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierBluetoothControllerPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.bestController = "unknown";
  await assert.rejects(validateCrossTierBluetoothControllerPlan(extra), /fields drifted/u);
  await assert.rejects(parseCrossTierBluetoothControllerPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseCrossTierBluetoothControllerPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseCrossTierBluetoothControllerPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parseCrossTierBluetoothControllerPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseCrossTierBluetoothControllerPlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
