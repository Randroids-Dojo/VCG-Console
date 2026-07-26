import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePi5HdmiAudioCecPlanBytes, validatePi5HdmiAudioCecPlan } from "./validate-pi5-hdmi-audio-cec-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/pi5-hdmi-cec/pi5-hdmi-audio-cec-plan-v1.json"));
const tracked = await parsePi5HdmiAudioCecPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-027/I-028 plan", () => {
  assert.equal(tracked.schedule.requiredDirectTvAvCellCount, 24);
  assert.equal(tracked.schedule.cecScenarioCount * tracked.schedule.validCyclesPerCecScenario, 1000);
});

test("rejects source substitution and invented physical target evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePi5HdmiAudioCecPlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.targetBoundary.hostProduct = "Raspberry Pi 4"; },
    (plan) => { plan.targetBoundary.primaryTvManufacturerModelRevisionSha256 = "a".repeat(64); },
    (plan) => { plan.targetBoundary.tvFirmwareVersion = "invented"; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("preserves 720p recovery, 1080p baseline, 4K headroom, SDR, and stereo baseline", async () => {
  for (const mutate of [
    (plan) => { plan.displayModes.pop(); },
    (plan) => { plan.displayModes.reverse(); },
    (plan) => { plan.displayModes[1].refreshNumerator = 30; },
    (plan) => { plan.displayModes[2].hdr = true; },
    (plan) => { plan.audioRoutes[0].channelCount = 6; },
    (plan) => { plan.audioRoutes[1].mayQualifyBaseline = true; },
    (plan) => { plan.selectionPolicy.hdrAuthorized = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("rejects AV or CEC coverage deletion and schedule weakening", async () => {
  for (const mutate of [
    (plan) => { plan.avChecks.pop(); },
    (plan) => { plan.cecScenarios.pop(); },
    (plan) => { plan.cecScenarios.reverse(); },
    (plan) => { plan.schedule.requiredDirectTvAvCellCount = 23; },
    (plan) => { plan.schedule.validTrialsPerRequiredAvCell = 19; },
    (plan) => { plan.schedule.validCyclesPerCecScenario = 99; },
    (plan) => { plan.schedule.minimumSustainedSecondsPerModeRoute = 3599; },
    (plan) => { plan.schedule.productFailuresMayBeReplaced = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("rejects weakened wake, latency, zero-failure, and evidence boundaries", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumWarmWakeToUsableMs = 5001; },
    (plan) => { plan.acceptance.maximumExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumCecCommandLoopsOrRunawayRepeats = 1; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.edidOrCompositorStateMayEstablishPhysicalDisplay = true; },
    (plan) => { plan.acceptance.webAudioPlaybackMayEstablishPhysicalAudio = true; },
    (plan) => { plan.acceptance.browserViewportMayEstablishHdmiModeOrOverscan = true; },
    (plan) => { plan.acceptance.optionalReceiverMayRescueDirectTvFailure = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("rejects post-result gates, selection, and hidden mutation authority", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumAudioLatencyP95Ms = 50; },
    (plan) => { plan.selectionPolicy.selectedDisplayModeId = "baseline-1920x1080-60-sdr"; },
    (plan) => { plan.selectionPolicy.automaticSelectionAllowed = true; },
    (plan) => { plan.executionGate.tvPowerInputVolumeOrMuteMutationAuthorized = true; },
    (plan) => { plan.executionGate.displayModeOrAudioRouteMutationAuthorized = true; },
    (plan) => { plan.executionGate.cecTransmissionAuthorized = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("rejects raw media, trace, stable identifiers, blocker drift, and premature results", async () => {
  for (const mutate of [
    (plan) => { plan.dataPolicy.rawFramesVideoOrAudioRecordingAuthorized = true; },
    (plan) => { plan.dataPolicy.edidEldAndCecTraceAuthorized = true; },
    (plan) => { plan.dataPolicy.stableTvReceiverOrCableSerialsAllowed = true; },
    (plan) => { plan.executionGate.blockerCodes.reverse(); },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5HdmiAudioCecPlan(plan)); }
});

test("rejects unknown fields, noncanonical, duplicate, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.bestMode = "4K";
  await assert.rejects(validatePi5HdmiAudioCecPlan(extra), /fields drifted/u);
  await assert.rejects(parsePi5HdmiAudioCecPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parsePi5HdmiAudioCecPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parsePi5HdmiAudioCecPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parsePi5HdmiAudioCecPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parsePi5HdmiAudioCecPlanBytes(Buffer.alloc(128 * 1024 + 1)));
});
