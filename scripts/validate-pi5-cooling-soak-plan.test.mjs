import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePi5CoolingSoakPlanBytes, validatePi5CoolingSoakPlan } from "./validate-pi5-cooling-soak-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/pi5-thermal-acoustic/pi5-cooling-soak-plan-v1.json"));
const tracked = await parsePi5CoolingSoakPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked 32-cell I-024/I-025 plan", () => {
  assert.deepEqual(tracked.qualificationScope, ["I-024", "I-025"]);
  assert.equal(tracked.schedule.requiredCellCount, 32);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source drift and invented target evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePi5CoolingSoakPlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.commonTargetBoundary.hostProduct = "Raspberry Pi 4"; },
    (plan) => { plan.commonTargetBoundary.receivedHardwareManifestSha256 = "a".repeat(64); },
    (plan) => { plan.commonTargetBoundary.instrumentCalibrationSha256 = "b".repeat(64); },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5CoolingSoakPlan(plan)); }
});

test("rejects candidate omission, substitution, selection, and fabricated identity", async () => {
  for (const mutate of [
    (plan) => { plan.coolingConfigurations.pop(); },
    (plan) => { plan.coolingConfigurations.reverse(); },
    (plan) => { plan.coolingConfigurations[1].quotedProduct = "invented blower"; },
    (plan) => { plan.coolingConfigurations[0].exactReceivedAssemblySha256 = "c".repeat(64); },
    (plan) => { plan.coolingConfigurations[0].selected = true; },
    (plan) => { plan.selectionPolicy.selectedConfigurationId = "official-active-cooler-baseline"; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5CoolingSoakPlan(plan)); }
});

test("rejects workload, duration, cell arithmetic, cooldown, and failure replacement drift", async () => {
  for (const mutate of [
    (plan) => { plan.workloadIds.pop(); },
    (plan) => { plan.soakDurations[1].measuredSeconds = 14399; },
    (plan) => { plan.schedule.requiredCellCount = 31; },
    (plan) => { plan.schedule.coolDownToAmbientBandBeforeCell = false; },
    (plan) => { plan.schedule.productFailuresMayBeReplaced = true; },
    (plan) => { plan.acceptance.oneHourMaySubstituteForFourHour = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5CoolingSoakPlan(plan)); }
});

test("rejects weakened acoustics, safety, latency, tonal, and enclosure gates", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumOneMeterAcousticsDba = 36; },
    (plan) => { plan.acceptance.maximumThermalShutdowns = 1; },
    (plan) => { plan.acceptance.maximumExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.numericDbaPassMayExcuseTonalRattleOrOscillationFailure = true; },
    (plan) => { plan.acceptance.openEnclosureMayQualifyFinalEnclosure = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5CoolingSoakPlan(plan)); }
});

test("rejects post-result thresholds, authority, and unsafe data capture", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumSustainedSocTemperatureC = 80; },
    (plan) => { plan.acceptance.maximumAllowedTonalProminenceDb = 5; },
    (plan) => { plan.executionGate.purchaseAuthorized = true; },
    (plan) => { plan.executionGate.enclosureCutOrModificationAuthorized = true; },
    (plan) => { plan.executionGate.sustainedLoadAuthorized = true; },
    (plan) => { plan.dataPolicy.rawFrameRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.audioRecordingAuthorized = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5CoolingSoakPlan(plan)); }
});

test("rejects blocker drift, premature results, and undeclared fields", async () => {
  const blockers = clone(); blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validatePi5CoolingSoakPlan(blockers));
  const result = clone(); result.result.disposition = "qualified";
  await assert.rejects(validatePi5CoolingSoakPlan(result));
  const extra = clone(); extra.quietest = "passive";
  await assert.rejects(validatePi5CoolingSoakPlan(extra), /fields drifted/u);
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized bytes", async () => {
  await assert.rejects(parsePi5CoolingSoakPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parsePi5CoolingSoakPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parsePi5CoolingSoakPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parsePi5CoolingSoakPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parsePi5CoolingSoakPlanBytes(Buffer.alloc(96 * 1024 + 1)));
});
