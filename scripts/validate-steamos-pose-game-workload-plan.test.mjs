import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  STEAMOS_WORKLOAD_BACKENDS,
  STEAMOS_WORKLOAD_BLOCKERS,
  STEAMOS_WORKLOAD_METRICS,
  STEAMOS_WORKLOAD_RECOVERY_SCENARIOS,
  STEAMOS_WORKLOAD_TARGETS,
  STEAMOS_WORKLOADS,
  parseSteamOsPoseGameWorkloadPlanBytes,
  validateSteamOsPoseGameWorkloadPlan,
} from "./validate-steamos-pose-game-workload-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/steamos-workload/steamos-pose-game-workload-plan-v1.json",
  ),
);
const tracked = await parseSteamOsPoseGameWorkloadPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-168 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.targetCandidates.length, 2);
  assert.equal(tracked.inferenceBackends.length, 4);
  assert.equal(tracked.performanceMatrix.requiredCellCountPerSelectedTarget, 16);
  assert.equal(
    tracked.recoveryMatrix.requiredRecoveryCellCountPerSelectedTarget,
    128,
  );
  assert.equal(tracked.result.disposition, "blocked");
});

test("rejects stale, reordered, substituted, or missing source bindings", async () => {
  for (const mutate of [
    (plan) => {
      plan.sourceBindings[0].sha256 = "0".repeat(64);
    },
    (plan) => {
      plan.sourceBindings.reverse();
    },
    (plan) => {
      plan.sourceBindings[0].path = "docs/PROTOTYPE_SUCCESS_CRITERIA.md";
    },
    (plan) => {
      plan.sourceBindings.pop();
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("keeps exact-target and proxy evidence separate and fail-closed", async () => {
  assert.deepEqual(
    tracked.targetCandidates.map((target) => [
      target.targetId,
      target.targetClass,
      target.evidenceDisposition,
    ]),
    [...STEAMOS_WORKLOAD_TARGETS],
  );
  for (const mutate of [
    (plan) => {
      plan.targetCandidates.pop();
    },
    (plan) => {
      plan.targetCandidates.reverse();
    },
    (plan) => {
      plan.targetCandidates[1].targetClass = "qualified-equivalent";
    },
    (plan) => {
      plan.targetCandidates[0].hardwareInventorySha256 = "a".repeat(64);
    },
    (plan) => {
      plan.targetCandidates[1].targetReceivedInventoriedOrQualified = true;
    },
    (plan) => {
      plan.targetCandidates[1].otherTargetEvidenceMayQualify = true;
    },
    (plan) => {
      plan.targetSelectionBoundary.selectedExecutionTargetId =
        "closest-supported-amd-steamos-proxy";
    },
    (plan) => {
      plan.targetSelectionBoundary.proxyResultMayQualifySteamMachine = true;
    },
    (plan) => {
      plan.targetSelectionBoundary.proxyAndSteamMachineResultsMayBeAggregated =
        true;
    },
    (plan) => {
      plan.targetSelectionBoundary.targetChangeRequiresCompleteMatrixRerun = false;
    },
    (plan) => {
      plan.targetSelectionBoundary.differentTargetMayRescueFailure = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("rejects invented target, package, camera, service, fault, or publication authority", async () => {
  for (const [key, value] of Object.entries(tracked.authorityBoundary)) {
    const plan = clone();
    plan.authorityBoundary[key] = value === null ? "a".repeat(64) : true;
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("pins all four inference backends without selection or hidden unavailability", async () => {
  assert.deepEqual(
    tracked.inferenceBackends.map((backend) => [
      backend.backendId,
      backend.executionClass,
      backend.expectedRuntimeFamily,
    ]),
    [...STEAMOS_WORKLOAD_BACKENDS],
  );
  for (const mutate of [
    (plan) => {
      plan.inferenceBackends.pop();
    },
    (plan) => {
      plan.inferenceBackends.reverse();
    },
    (plan) => {
      plan.inferenceBackends[2].executionClass = "cpu";
    },
    (plan) => {
      plan.inferenceBackends[3].expectedRuntimeFamily = "rocm-assumed";
    },
    (plan) => {
      plan.inferenceBackends[0].targetResultSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.inferenceBackends[0].windowsSyntheticEvidenceMayQualify = true;
    },
    (plan) => {
      plan.inferenceBackends[3].unsupportedOrUnavailableResultMayBeDiscarded = true;
    },
    (plan) => {
      plan.inferenceBackends[0].backendMayBeSelectedBeforeCompleteMatrix = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("preserves exact workloads, real-camera timing, and title-integration boundaries", async () => {
  assert.deepEqual(
    tracked.workloads.map((workload) => [
      workload.workloadId,
      workload.runtime,
      workload.networkClass,
      workload.motionRole,
    ]),
    [...STEAMOS_WORKLOADS],
  );
  for (const mutate of [
    (plan) => {
      plan.workloads.pop();
    },
    (plan) => {
      plan.workloads.reverse();
    },
    (plan) => {
      plan.workloads[0].motionRole = "no-title-motion-delivery";
    },
    (plan) => {
      plan.workloads[1].exactContentAndInteractionSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.workloads[0].loadOrHeartbeatMayProvePlayability = true;
    },
    (plan) => {
      plan.workloads[1].compatibilityLoadMayProveMotionIntegration = true;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.motionApiVersion = "latest";
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.requiredProfileIds.pop();
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.genuineQualifiedCameraExposureRequired =
        false;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.qualifiedI166PackageRequired = false;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.qualifiedI167CameraAndPermissionRequired =
        false;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.syntheticReplayOrBackendCallTimingMayQualifyCameraToAction =
        true;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.compatibilityGameLoadMayQualifyTitleMotionIntegration =
        true;
    },
    (plan) => {
      plan.trackerAndWorkloadBoundary.campaignMayQualifyGeneralAccountlessLifecycle =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("requires all 16 one-hour backend-workload performance cells", async () => {
  for (const mutate of [
    (plan) => {
      plan.performanceMatrix.backendIds.pop();
    },
    (plan) => {
      plan.performanceMatrix.workloadIds.reverse();
    },
    (plan) => {
      plan.performanceMatrix.backendCount = 3;
    },
    (plan) => {
      plan.performanceMatrix.requiredCellCountPerSelectedTarget = 15;
    },
    (plan) => {
      plan.performanceMatrix.warmupSecondsPerCell = 299;
    },
    (plan) => {
      plan.performanceMatrix.minimumMeasuredSecondsPerCell = 3599;
    },
    (plan) => {
      plan.performanceMatrix.requiredRunsPerCell = 0;
    },
    (plan) => {
      plan.performanceMatrix.everyBackendMustBeAttempted = false;
    },
    (plan) => {
      plan.performanceMatrix.oneRunIsReliabilityRateEvidence = true;
    },
    (plan) => {
      plan.performanceMatrix.unsupportedUnavailableFailedStoppedAndRetriedCellsRemainVisible =
        false;
    },
    (plan) => {
      plan.performanceMatrix.otherBackendWorkloadTargetOrAggregateMayRescueFailure =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("requires all 128 recovery cells and preserves failed attempts", async () => {
  assert.deepEqual(
    tracked.recoveryMatrix.scenarioIds,
    [...STEAMOS_WORKLOAD_RECOVERY_SCENARIOS],
  );
  for (const mutate of [
    (plan) => {
      plan.recoveryMatrix.scenarioIds.pop();
    },
    (plan) => {
      plan.recoveryMatrix.scenarioIds.reverse();
    },
    (plan) => {
      plan.recoveryMatrix.scenarioCount = 7;
    },
    (plan) => {
      plan.recoveryMatrix.requiredRecoveryCellCountPerSelectedTarget = 127;
    },
    (plan) => {
      plan.recoveryMatrix.validAttemptsPerRecoveryCell = 1;
    },
    (plan) => {
      plan.recoveryMatrix.everyScenarioRunsForEveryBackendWorkloadCell = false;
    },
    (plan) => {
      plan.recoveryMatrix.scheduledFaultsRemainOutsideMeasuredPerformanceSoak =
        false;
    },
    (plan) => {
      plan.recoveryMatrix.failedInvalidStoppedRetriedAndAdverseAttemptsRemainVisible =
        false;
    },
    (plan) => {
      plan.recoveryMatrix.laterRecoveryMayHideEarlierFailure = true;
    },
    (plan) => {
      plan.recoveryMatrix.otherScenarioBackendWorkloadTargetOrAggregateMayRescueFailure =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("requires independent timing, quality, game, resource, and recovery measurements", async () => {
  assert.deepEqual(tracked.measurements.requiredMetricIds, [
    ...STEAMOS_WORKLOAD_METRICS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.measurements.requiredMetricIds.pop();
    },
    (plan) => {
      plan.measurements.requiredMetricIds.reverse();
    },
    (plan) => {
      plan.measurements.independentExposurePoseActionGameResourcePowerThermalAcousticProcessInputAndRecoveryOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.everyScheduledCellAttemptFailureAndUnavailableBackendMustRemainVisible =
        false;
    },
    (plan) => {
      plan.measurements.vendorSpecsSyntheticBenchmarksOtherTargetOrAggregateMaySubstituteTargetEvidence =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("preserves fixed latency, stability, privacy, target, and no-rescue gates", async () => {
  for (const [key, value] of Object.entries(tracked.fixedAcceptance)) {
    const plan = clone();
    plan.fixedAcceptance[key] = typeof value === "boolean" ? !value : value + 1;
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("keeps open gates null and rejects unsafe or hidden evidence", async () => {
  for (const key of Object.keys(tracked.openAcceptance)) {
    const plan = clone();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
  for (const [key, value] of Object.entries(tracked.dataPolicy)) {
    const plan = clone();
    plan.dataPolicy[key] = !value;
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("rejects blocker weakening, premature results, backend selection, and tier claims", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [
    ...STEAMOS_WORKLOAD_BLOCKERS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.executionGate.blockerCodes.pop();
    },
    (plan) => {
      plan.executionGate.status = "ready";
    },
    (plan) => {
      plan.result.artifactPath = "result.json";
    },
    (plan) => {
      plan.result.sha256 = "a".repeat(64);
    },
    (plan) => {
      plan.result.disposition = "qualified";
    },
    (plan) => {
      plan.result.executedTargetId = "exact-steam-machine";
    },
    (plan) => {
      plan.result.completedPerformanceCellCount = 16;
    },
    (plan) => {
      plan.result.completedRecoveryCellCount = 128;
    },
    (plan) => {
      plan.result.backendResults.push({});
    },
    (plan) => {
      plan.result.qualifiedBackendIds.push("mediapipe-cpu");
    },
    (plan) => {
      plan.result.selectedInferenceBackendId = "mediapipe-cpu";
    },
    (plan) => {
      plan.result.proxyOnlyResult = true;
    },
    (plan) => {
      plan.result.targetQualified = true;
    },
    (plan) => {
      plan.result.steamMachineQualified = true;
    },
    (plan) => {
      plan.result.steamMachinePrimaryTierChanged = true;
    },
    (plan) => {
      plan.result.publishedClaims.push("supported");
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsPoseGameWorkloadPlan(plan));
  }
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const extra = clone();
  extra.backendSelected = false;
  await assert.rejects(
    validateSteamOsPoseGameWorkloadPlan(extra),
    /fields drifted/u,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(duplicate),
    /canonical/u,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(Buffer.from('{\r"format":1}\n')),
    /bare CR/u,
  );
  await assert.rejects(
    parseSteamOsPoseGameWorkloadPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
