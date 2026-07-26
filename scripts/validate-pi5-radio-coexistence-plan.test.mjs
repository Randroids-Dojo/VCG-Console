import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePi5RadioCoexistencePlanBytes, validatePi5RadioCoexistencePlan } from "./validate-pi5-radio-coexistence-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/pi5-radio-coexistence/pi5-wifi-bluetooth-coexistence-plan-v1.json"));
const tracked = await parsePi5RadioCoexistencePlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked 32-cell I-026 plan", () => {
  assert.equal(tracked.schedule.requiredCellCount, 32);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source substitution and invented target or regulatory evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePi5RadioCoexistencePlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.targetBoundary.hostProduct = "Raspberry Pi 4"; },
    (plan) => { plan.targetBoundary.regulatoryDomain = "US"; },
    (plan) => { plan.targetBoundary.wifiBluetoothDriverFirmwareSha256 = "a".repeat(64); },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("preserves required 2.4 GHz risk and 5 GHz control without cross-band rescue", async () => {
  for (const mutate of [
    (plan) => { plan.radioBands.pop(); },
    (plan) => { plan.radioBands.reverse(); },
    (plan) => { plan.radioBands[0].required = false; },
    (plan) => { plan.radioBands[0].wifiChannel = 6; },
    (plan) => { plan.acceptance.fiveGhzMayRescueFailedTwoGhzCell = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("rejects open-enclosure promotion and placement invention", async () => {
  for (const mutate of [
    (plan) => { plan.placementStrata.reverse(); },
    (plan) => { plan.placementStrata[0].mayQualifyProduct = true; },
    (plan) => { plan.placementStrata[1].geometrySha256 = "b".repeat(64); },
    (plan) => { plan.acceptance.openEnclosureMayQualifyClosedEnclosure = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("rejects scenario omission, controller/camera/network weakening, and schedule drift", async () => {
  for (const mutate of [
    (plan) => { plan.scenarios.pop(); },
    (plan) => { plan.scenarios.reverse(); },
    (plan) => { plan.scenarios[4].bluetoothControllerCount = 1; },
    (plan) => { plan.scenarios[5].cameraMode = "disabled"; },
    (plan) => { plan.scenarios[6].networkLoad = "idle-associated"; },
    (plan) => { plan.schedule.requiredCellCount = 31; },
    (plan) => { plan.schedule.validReconnectCyclesPerFaultCell = 19; },
    (plan) => { plan.schedule.productFailuresMayBeReplaced = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("rejects weakened controller, camera, latency, and no-rescue gates", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumControllerLifecycleFaults = 1; },
    (plan) => { plan.acceptance.maximumStuckOrFabricatedActions = 1; },
    (plan) => { plan.acceptance.requiredCaptureFramesPerSecond = 30; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.throughputMayRescueInputCameraOrRecoveryFailure = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("rejects post-result thresholds, hidden authority, identifiers, credentials, and payloads", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumPacketLossRatio = 0.01; },
    (plan) => { plan.executionGate.networkTrafficAuthorized = true; },
    (plan) => { plan.executionGate.radioFaultInjectionAuthorized = true; },
    (plan) => { plan.dataPolicy.rawMacBssidSsidOrControllerIdentifiersAuthorized = true; },
    (plan) => { plan.dataPolicy.wifiCredentialsAuthorized = true; },
    (plan) => { plan.dataPolicy.networkPayloadBodiesAuthorized = true; },
    (plan) => { plan.dataPolicy.rawFramesOrAudioAuthorized = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5RadioCoexistencePlan(plan)); }
});

test("rejects blockers, premature result, unknown fields, and malformed bytes", async () => {
  const blockers = clone(); blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validatePi5RadioCoexistencePlan(blockers));
  const result = clone(); result.result.productQualified = true;
  await assert.rejects(validatePi5RadioCoexistencePlan(result));
  const extra = clone(); extra.bestBand = "5GHz";
  await assert.rejects(validatePi5RadioCoexistencePlan(extra), /fields drifted/u);
  await assert.rejects(parsePi5RadioCoexistencePlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parsePi5RadioCoexistencePlanBytes(duplicate), /canonical/u);
  await assert.rejects(parsePi5RadioCoexistencePlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parsePi5RadioCoexistencePlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parsePi5RadioCoexistencePlanBytes(Buffer.alloc(96 * 1024 + 1)));
});
