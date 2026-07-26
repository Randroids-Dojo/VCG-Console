import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCrossTierTvAppliancePlanBytes,
  validateCrossTierTvAppliancePlan,
} from "./validate-cross-tier-tv-appliance-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/tv-appliance/cross-tier-tv-appliance-plan-v1.json"));
const tracked = await parseCrossTierTvAppliancePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-118 cross-tier campaign", () => {
  assert.deepEqual(tracked.targetPolicy.requiredTargetIds, ["ordinary-x86-linux-premium", "pi5-hailo26-reference"]);
  assert.equal(tracked.schedule.requiredTargetScenarioCellCount, 16);
  assert.equal(tracked.schedule.requiredCycles, 1600);
});

test("rejects source substitution and invented target or equipment evidence", async () => {
  const source = clone();
  source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateCrossTierTvAppliancePlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.targets[0].idleStrategy = "platform-suspend"; },
    (plan) => { plan.targets[1].hardwareAndFirmwareSha256 = "a".repeat(64); },
    (plan) => { plan.sharedEquipmentBoundary.primaryTvManufacturerModelRevisionSha256 = "b".repeat(64); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("preserves both required targets and optional Steam non-substitution", async () => {
  for (const mutate of [
    (plan) => { plan.targetPolicy.requiredTargetIds.pop(); },
    (plan) => { plan.targets.reverse(); },
    (plan) => { plan.targets[0].required = false; },
    (plan) => { plan.targetPolicy.windowsMayQualifyOrdinaryLinux = true; },
    (plan) => { plan.targetPolicy.wsl2MayQualifyOrdinaryLinux = true; },
    (plan) => { plan.targetPolicy.steamMachineMaySubstituteRequiredTarget = true; },
    (plan) => { plan.targetPolicy.oneRequiredTargetMayRescueAnother = true; },
    (plan) => { plan.targetPolicy.piCampaignMayQualifyOrdinaryX86 = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects scenario deletion, domain substitution, and weakened cycle coverage", async () => {
  for (const mutate of [
    (plan) => { plan.scenarios.pop(); },
    (plan) => { plan.scenarios.reverse(); },
    (plan) => { plan.scenarios[2].domain = "sleep-wake"; },
    (plan) => { plan.cycleProtocol.phases.pop(); },
    (plan) => { plan.cycleProtocol.validCyclesPerScenarioPerTarget = 99; },
    (plan) => { plan.cycleProtocol.minimumPostRecoveryObservationSeconds = 59; },
    (plan) => { plan.cycleProtocol.counterbalancedTargetScenarioOrder = false; },
    (plan) => { plan.cycleProtocol.invalidHarnessCyclesRetainedAndRerun = false; },
    (plan) => { plan.cycleProtocol.productFailuresMayBeReplaced = true; },
    (plan) => { plan.cycleProtocol.unscheduledOperatorInterventionIsProductFailure = false; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects schedule arithmetic drift, duplicate reuse, and partial Pi promotion", async () => {
  for (const mutate of [
    (plan) => { plan.schedule.requiredTargetScenarioCellCount = 15; },
    (plan) => { plan.schedule.requiredCycles = 1599; },
    (plan) => { plan.schedule.optionalCycles = 799; },
    (plan) => { plan.schedule.piI027I028CyclesMayBeReusedOnlyWithExactProtocolAndCellIdentity = false; },
    (plan) => { plan.schedule.reusedCycleMayAppearOnce = false; },
    (plan) => { plan.schedule.partialPiEvidenceMayQualifyCrossTierCampaign = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects weakened fixed gates and non-physical evidence promotion", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumWarmWakeToControllerUsableMs = 5001; },
    (plan) => { plan.acceptance.maximumUnrecoveredCycles = 1; },
    (plan) => { plan.acceptance.maximumFalsePhysicalReadyOrAudibleClaims = 1; },
    (plan) => { plan.acceptance.maximumCecLoopsOrRunawayRepeats = 1; },
    (plan) => { plan.acceptance.maximumLostControllerOrPhysicalFallbacks = 1; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.anotherTargetMayRescueFailedTarget = true; },
    (plan) => { plan.acceptance.cecTrafficMayEstablishPhysicalOutcome = true; },
    (plan) => { plan.acceptance.edidEldOrCompositorStateMayEstablishPhysicalOutcome = true; },
    (plan) => { plan.acceptance.audioApiStateMayEstablishAudibleOutput = true; },
    (plan) => { plan.acceptance.runningLauncherMayEstablishControllerUsability = true; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects invented post-result thresholds, mutation authority, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumHotPlugRecoveryP95Ms = 2000; },
    (plan) => { plan.executionGate.tvPowerInputVolumeOrMuteMutationAuthorized = true; },
    (plan) => { plan.executionGate.displayModeOrAudioRouteMutationAuthorized = true; },
    (plan) => { plan.executionGate.cecTransmissionAuthorized = true; },
    (plan) => { plan.executionGate.physicalHotPlugAuthorized = true; },
    (plan) => { plan.executionGate.sustainedCampaignAuthorized = true; },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedRequiredCycles = 1600; },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects raw sensitive evidence, stable identifiers, and blocker drift", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawFramesVideoOrAudioRecordingAuthorized = true; },
    (plan) => { plan.dataPolicy.rawEdidEldOrCecTraceReleaseAuthorized = true; },
    (plan) => { plan.dataPolicy.stableEquipmentSerialsAllowed = true; },
    (plan) => { plan.dataPolicy.networkAddressesOrCredentialsAllowed = true; },
    (plan) => { plan.dataPolicy.freeTextAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
  ]) {
    const plan = clone(); mutate(plan);
    await assert.rejects(validateCrossTierTvAppliancePlan(plan));
  }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.bestTv = "unknown";
  await assert.rejects(validateCrossTierTvAppliancePlan(extra), /fields drifted/u);
  await assert.rejects(parseCrossTierTvAppliancePlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseCrossTierTvAppliancePlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseCrossTierTvAppliancePlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parseCrossTierTvAppliancePlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseCrossTierTvAppliancePlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
