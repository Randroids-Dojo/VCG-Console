import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  JETSON_BLOCKERS,
  JETSON_FAULTS,
  JETSON_PRECISION_LANES,
  JETSON_WORKLOADS,
  parseJetsonOrinNanoSuperTensorRtPlanBytes,
  validateJetsonOrinNanoSuperTensorRtPlan,
} from "./validate-jetson-orin-nano-super-tensorrt-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/jetson/jetson-orin-nano-super-tensorrt-plan-v1.json"));
const tracked = await parseJetsonOrinNanoSuperTensorRtPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked I-019 Jetson TensorRT plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.campaignMatrix.workloadCount, 8);
  assert.equal(tracked.campaignMatrix.requiredLiveSoakRunCount, 48);
  assert.equal(tracked.campaignMatrix.requiredRecoveryCycleCount, 1920);
});

test("rejects stale or substituted source bindings", async () => {
  const plan = clone(); plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan), /digest drifted/u);
});

test("rejects candidate identity drift or promotion of vendor claims", async () => {
  for (const mutate of [
    (plan) => { plan.vendorCandidate.partNumber = "unknown"; },
    (plan) => { plan.vendorCandidate.cudaCoreCount = 2048; },
    (plan) => { plan.vendorCandidate.advertisedPowerRangeW = [7, 15]; },
    (plan) => { plan.vendorCandidate.vendorFactsMayEstablishVcgPerformanceOrSelection = true; },
    (plan) => { plan.vendorCandidate.receivedHardwareIdentitySha256 = "a".repeat(64); },
    (plan) => { plan.vendorCandidate.deliveredQuoteSha256 = "b".repeat(64); },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("rejects invented hardware, software, protocols, access, mutations, or publication authority", async () => {
  for (const mutate of [
    (plan) => { plan.executionBoundary.exactHardwareManifestSha256 = "a".repeat(64); },
    (plan) => { plan.executionBoundary.selectedSoftwareTupleSha256 = "b".repeat(64); },
    (plan) => { plan.executionBoundary.modelConversionManifestSha256 = "c".repeat(64); },
    (plan) => { plan.executionBoundary.purchaseAuthorized = true; },
    (plan) => { plan.executionBoundary.downloadAuthorized = true; },
    (plan) => { plan.executionBoundary.flashOrStorageMutationAuthorized = true; },
    (plan) => { plan.executionBoundary.targetAccessAuthorized = true; },
    (plan) => { plan.executionBoundary.networkOrHostedServiceUseAuthorized = true; },
    (plan) => { plan.executionBoundary.participantCollectionAuthorized = true; },
    (plan) => { plan.executionBoundary.faultInjectionAuthorized = true; },
    (plan) => { plan.executionBoundary.publicationAuthorized = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("preserves exact JetPack warning and TensorRT model-conversion boundaries", async () => {
  assert.deepEqual(tracked.tensorRtModelBoundary.precisionLaneIds, [...JETSON_PRECISION_LANES]);
  for (const mutate of [
    (plan) => { plan.softwareTuple.candidateTupleIds.pop(); },
    (plan) => { plan.softwareTuple.selectedCandidateTupleId = plan.softwareTuple.candidateTupleIds[0]; },
    (plan) => { plan.softwareTuple.tensorRtVersion = "10.3.0"; },
    (plan) => { plan.softwareTuple.latestOrMovingAliasAllowed = true; },
    (plan) => { plan.softwareTuple.superModeMustBeIndependentlyProvenFromModeClocksAndTelemetry = false; },
    (plan) => { plan.softwareTuple.jetpack720IsoMayBeAssumedToEnableSuperMode = true; },
    (plan) => { plan.tensorRtModelBoundary.precisionLaneIds.pop(); },
    (plan) => { plan.tensorRtModelBoundary.onnxSha256 = "a".repeat(64); },
    (plan) => { plan.tensorRtModelBoundary.targetSideEngineBuildRequired = false; },
    (plan) => { plan.tensorRtModelBoundary.filenameOrDownloadedEngineMayEstablishIdentity = true; },
    (plan) => { plan.tensorRtModelBoundary.enginePortabilityAcrossPlatformVersionOrGpuMayBeAssumed = true; },
    (plan) => { plan.tensorRtModelBoundary.dlaExecutionAllowed = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("preserves all eight identical product workloads", async () => {
  assert.deepEqual(tracked.workloads.map((workload) => [workload.workloadId, workload.runtime, workload.networkClass, workload.motionRole]), [...JETSON_WORKLOADS]);
  for (const mutate of [
    (plan) => { plan.workloads.pop(); },
    (plan) => { plan.workloads.reverse(); },
    (plan) => { plan.workloads[1].runtime = "synthetic"; },
    (plan) => { plan.workloads[5].networkClass = "offline-capable"; },
    (plan) => { plan.workloads[5].motionRole = "motion-integrated"; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("requires all replay, live, fault, rebuild, and engine cycles without rescue", async () => {
  assert.deepEqual(tracked.campaignMatrix.faultIds, [...JETSON_FAULTS]);
  for (const mutate of [
    (plan) => { plan.campaignMatrix.requiredImmutableReplayRunCount = 39; },
    (plan) => { plan.campaignMatrix.validLiveSoakRunsPerPrecisionWorkloadCell = 2; },
    (plan) => { plan.campaignMatrix.minimumMeasuredSecondsPerLiveSoakRun = 3599; },
    (plan) => { plan.campaignMatrix.faultIds.pop(); },
    (plan) => { plan.campaignMatrix.validRecoveryCyclesPerPrecisionWorkloadFaultCell = 19; },
    (plan) => { plan.campaignMatrix.requiredRecoveryCycleCount = 1919; },
    (plan) => { plan.campaignMatrix.validOfflineCleanRebuildCycles = 19; },
    (plan) => { plan.campaignMatrix.requiredEngineRebuildCount = 39; },
    (plan) => { plan.campaignMatrix.runOrderCounterbalanced = false; },
    (plan) => { plan.campaignMatrix.failuresRetriesInvalidRunsAndInterruptedRebuildsRemainVisible = false; },
    (plan) => { plan.campaignMatrix.failedOrInvalidRunMayBeSilentlyReplaced = true; },
    (plan) => { plan.campaignMatrix.precisionWorkloadFaultOrTargetMayRescueAnother = true; },
    (plan) => { plan.campaignMatrix.aggregateMayRescueFailedCell = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("rejects weakened product gates, post-result thresholds, incomplete cost, or unsafe data", async () => {
  for (const mutate of [
    (plan) => { plan.fixedAcceptance.maximumLiveExposureToActionP95Us = 130000; },
    (plan) => { plan.fixedAcceptance.maximumPrivilegedFalseActivations = 1; },
    (plan) => { plan.fixedAcceptance.vendorTopsPriceOrSingleInferenceBenchmarkMayQualify = true; },
    (plan) => { plan.fixedAcceptance.replayTimingMayQualifyExposureLatency = true; },
    (plan) => { plan.fixedAcceptance.passingFp16MayQualifyInt8OrReverse = true; },
    (plan) => { plan.fixedAcceptance.campaignMayAutomaticallySupersedePiHailoSelection = true; },
    (plan) => { plan.openAcceptance.minimumPoseFpsMilliFps = 30000; },
    (plan) => { plan.openAcceptance.maximumDeliveredCostCents = 65000; },
    (plan) => { plan.openAcceptance.mustBeFixedBeforeFirstDownloadFlashBuildOrRun = false; },
    (plan) => { plan.costBoundary.requiredDeliveredCostRoles.pop(); },
    (plan) => { plan.costBoundary.deliveredCostCents = 24900; },
    (plan) => { plan.costBoundary.boardOnlyPriceMayRepresentCompleteSystem = true; },
    (plan) => { plan.costBoundary.purchaseRecommendation = "buy"; },
    (plan) => { plan.dataPolicy.liveRawFrameOrAudioRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.credentialsTokensPrivateKeysPathsOrRequestBodiesAllowedInEvidence = true; },
    (plan) => { plan.dataPolicy.networkEgressDuringOfflineLanesAllowed = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("rejects blocker removal, premature results, qualification, selection, or purchase recommendation", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...JETSON_BLOCKERS]);
  for (const mutate of [
    (plan) => { plan.executionGate.blockerCodes.pop(); },
    (plan) => { plan.executionGate.state = "ready"; },
    (plan) => { plan.executionGate.readyRequiresEveryBlockerResolvedBeforeFirstDownloadFlashBuildOrRun = false; },
    (plan) => { plan.result.disposition = "qualified"; },
    (plan) => { plan.result.completedImmutableReplayRunCount = 40; },
    (plan) => { plan.result.completedRecoveryCycleCount = 1920; },
    (plan) => { plan.result.cellResults.push({}); },
    (plan) => { plan.result.qualifiedPrecisionLaneIds.push("fp16"); },
    (plan) => { plan.result.deliveredCostCents = 24900; },
    (plan) => { plan.result.jetsonQualified = true; },
    (plan) => { plan.result.piHailoSelectionSuperseded = true; },
    (plan) => { plan.result.purchaseRecommended = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(plan)); }
});

test("rejects unknown fields, noncanonical JSON, duplicate keys, BOM, invalid UTF-8, and oversize", async () => {
  const extra = clone(); extra.jetsonSelected = false;
  await assert.rejects(validateJetsonOrinNanoSuperTensorRtPlan(extra), /fields drifted/u);
  await assert.rejects(parseJetsonOrinNanoSuperTensorRtPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parseJetsonOrinNanoSuperTensorRtPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parseJetsonOrinNanoSuperTensorRtPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])), /BOM/u);
  await assert.rejects(parseJetsonOrinNanoSuperTensorRtPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parseJetsonOrinNanoSuperTensorRtPlanBytes(Buffer.alloc(192 * 1024 + 1)), /exceeds/u);
});
