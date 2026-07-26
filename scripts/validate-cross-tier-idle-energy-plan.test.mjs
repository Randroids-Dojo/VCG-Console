import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCrossTierIdleEnergyPlanBytes,
  validateCrossTierIdleEnergyPlan,
} from "./validate-cross-tier-idle-energy-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/idle-energy/cross-tier-idle-energy-plan-v1.json"));
const tracked = await parseCrossTierIdleEnergyPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-120 campaign", () => {
  assert.equal(tracked.measurementProtocol.requiredIdleRuns, 180);
  assert.equal(tracked.measurementProtocol.minimumRequiredWakeCycles, 600);
  assert.equal(tracked.durations.at(-1).seconds, 86400);
});

test("rejects source substitution and invented target or selected strategy evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateCrossTierIdleEnergyPlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.targets[0].selectedStrategyId = "platform-suspend-candidate"; },
    (plan) => { plan.targets[1].hardwareFirmwareAndPowerTopologySha256 = "a".repeat(64); },
    (plan) => { plan.strategyProfiles[0].selected = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("preserves required targets and exact strategy comparison without substitution", async () => {
  for (const mutate of [
    (plan) => { plan.targetPolicy.requiredTargetIds.pop(); },
    (plan) => { plan.targets.reverse(); },
    (plan) => { plan.targets[0].candidateStrategyIds.pop(); },
    (plan) => { plan.targetPolicy.windowsMayQualifyOrdinaryLinux = true; },
    (plan) => { plan.targetPolicy.optionalTargetMayRescueRequiredTarget = true; },
    (plan) => { plan.targetPolicy.automaticStrategySelection = true; },
    (plan) => { plan.strategyProfiles.reverse(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects entry profile, duration, wake source, or idle invariant deletion", async () => {
  for (const mutate of [
    (plan) => { plan.entryProfiles.pop(); },
    (plan) => { plan.entryProfiles.reverse(); },
    (plan) => { plan.durations.pop(); },
    (plan) => { plan.durations[2].seconds = 86399; },
    (plan) => { plan.wakeSourcePolicy.requiredSourceRoles.pop(); },
    (plan) => { plan.wakeSourcePolicy.validCyclesPerTargetStrategySource = 99; },
    (plan) => { plan.wakeSourcePolicy.oneSourceMayRescueAnother = true; },
    (plan) => { plan.wakeSourcePolicy.hostEventMayEstablishPhysicalWake = true; },
    (plan) => { plan.idleInvariants.pop(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects weakened run counts, sampling, stabilization, retention, or intervention rules", async () => {
  for (const mutate of [
    (plan) => { plan.measurementProtocol.validRunsPerCell = 4; },
    (plan) => { plan.measurementProtocol.requiredIdleRuns = 179; },
    (plan) => { plan.measurementProtocol.minimumRequiredWakeCycles = 599; },
    (plan) => { plan.measurementProtocol.minimumPowerSampleRateHz = 0; },
    (plan) => { plan.measurementProtocol.ambientStabilizationSeconds = 1799; },
    (plan) => { plan.measurementProtocol.postWakeObservationSeconds = 299; },
    (plan) => { plan.measurementProtocol.counterbalancedTargetStrategyProfileDurationOrder = false; },
    (plan) => { plan.measurementProtocol.invalidHarnessRunsRetainedAndRerun = false; },
    (plan) => { plan.measurementProtocol.productFailuresMayBeReplaced = true; },
    (plan) => { plan.measurementProtocol.unscheduledOperatorInterventionIsProductFailure = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects weakened fixed gates and rescue across cells, strategies, targets, or durations", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumWarmWakeToControllerUsableMs = 5001; },
    (plan) => { plan.acceptance.maximumUnrecoveredWakeFailures = 1; },
    (plan) => { plan.acceptance.maximumPrivacyStateViolations = 1; },
    (plan) => { plan.acceptance.maximumUnsafeOrUnboundedWrites = 1; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.anotherStrategyMayRescueFailedStrategy = true; },
    (plan) => { plan.acceptance.anotherTargetMayRescueFailedTarget = true; },
    (plan) => { plan.acceptance.shorterDurationMayRescueLongerDuration = true; },
    (plan) => { plan.acceptance.powerSavingsMayRescuePrivacyWakeOrWriteFailure = true; },
    (plan) => { plan.acceptance.hostReportedPowerMayEstablishWallEnergy = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects invented numeric gates, automatic selection, mutation authority, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumIdleAverageWallPowerW = 10; },
    (plan) => { plan.selectionPolicy.automaticSelectionAllowed = true; },
    (plan) => { plan.selectionPolicy.selectedStrategyByTarget.push({ targetId: "pi5-hailo26-reference", strategyId: "low-power-launcher-idle" }); },
    (plan) => { plan.executionGate.idleSuspendOrWakeMutationAuthorized = true; },
    (plan) => { plan.executionGate.networkOrUpdateMutationAuthorized = true; },
    (plan) => { plan.executionGate.sustainedUnattendedCampaignAuthorized = true; },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects sensitive data, blocker drift, and hidden authority", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawFramesVideoOrAudioAllowed = true; },
    (plan) => { plan.dataPolicy.networkPayloadsAddressesOrCredentialsAllowed = true; },
    (plan) => { plan.dataPolicy.profileSaveOrPackageContentsAllowed = true; },
    (plan) => { plan.dataPolicy.stableEquipmentSerialsAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierIdleEnergyPlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.bestStrategy = "unknown";
  await assert.rejects(validateCrossTierIdleEnergyPlan(extra), /fields drifted/u);
  await assert.rejects(parseCrossTierIdleEnergyPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseCrossTierIdleEnergyPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseCrossTierIdleEnergyPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parseCrossTierIdleEnergyPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseCrossTierIdleEnergyPlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
