import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PI5_X86_BLOCKERS,
  PI5_X86_METRICS,
  PI5_X86_SCENARIOS,
  PI5_X86_TARGETS,
  PI5_X86_WORKLOADS,
  parsePi5X86ProductContractPlanBytes,
  validatePi5X86ProductContractPlan,
} from "./validate-pi5-x86-product-contract-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/cross-tier-reference/pi5-x86-product-contract-plan-v1.json",
  ),
);
const tracked = await parsePi5X86ProductContractPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-173 comparison", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.sourceBindings.length, 20);
  assert.equal(tracked.targetTiers.length, 3);
  assert.equal(tracked.workloads.length, 7);
  assert.equal(tracked.operationalMatrix.requiredCellCount, 34);
  assert.equal(tracked.operationalMatrix.requiredCycleCount, 680);
  assert.equal(tracked.openAcceptance.minimumPerActionPrecisionPpm, null);
  assert.equal(tracked.result.disposition, "blocked");
});

test("rejects stale, reordered, substituted, escaping, or missing sources", async () => {
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
      plan.sourceBindings[0].path = "../outside.json";
    },
    (plan) => {
      plan.sourceBindings.pop();
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("pins both required targets and keeps the optional Steam row isolated", async () => {
  assert.deepEqual(
    tracked.targetTiers.map((target) => [
      target.targetId,
      target.tierRole,
      target.architecture,
      target.accelerationClass,
      target.requiredForComparison,
    ]),
    [...PI5_X86_TARGETS],
  );
  for (const mutate of [
    (plan) => {
      plan.targetTiers.pop();
    },
    (plan) => {
      plan.targetTiers.reverse();
    },
    (plan) => {
      plan.targetTiers[0].architecture = "x86_64";
    },
    (plan) => {
      plan.targetTiers[1].tierRole = "optional";
    },
    (plan) => {
      plan.targetTiers[2].requiredForComparison = true;
    },
    (plan) => {
      plan.targetTiers[0].hardwareSoftwarePeripheralAndRoomManifestSha256 =
        "a".repeat(64);
    },
    (plan) => {
      plan.targetTiers[1].receivedBuiltOrQualified = true;
    },
    (plan) => {
      plan.targetTiers[2].otherTargetOrComponentEvidenceMayQualify = true;
    },
    (plan) => {
      plan.targetTiers[2].mayRescueAnotherTarget = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("rejects invented purchase, operation, protocol, or publication authority", async () => {
  for (const [key, value] of Object.entries(tracked.authorityBoundary)) {
    const plan = clone();
    plan.authorityBoundary[key] = value === null ? "a".repeat(64) : true;
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("preserves the identical common product contract", async () => {
  for (const mutate of [
    (plan) => {
      plan.commonProductContract.motionApiVersion = "latest";
    },
    (plan) => {
      plan.commonProductContract.requiredProfileIds.pop();
    },
    (plan) => {
      plan.commonProductContract.sameSourceGameManifestsSchemasActionsUxAndAcceptanceGatesRequired =
        false;
    },
    (plan) => {
      plan.commonProductContract.sameSharedWideAngleUvcCameraContractRequired =
        false;
    },
    (plan) => {
      plan.commonProductContract.sameStandardsConformantControllerAndReservedActionContractRequired =
        false;
    },
    (plan) => {
      plan.commonProductContract.sameAccountlessLauncherTrackerProfilesPackagesAndRetroContractRequired =
        false;
    },
    (plan) => {
      plan.commonProductContract.architectureAcceleratorDriverAndPackagingDifferencesMustRemainBehindReviewedInterfaces =
        false;
    },
    (plan) => {
      plan.commonProductContract.targetSpecificDowngradedGameMotionUxOfflineOrRecoveryScopeAllowed =
        true;
    },
    (plan) => {
      plan.commonProductContract.optionalSteamMachineMayRedefineOrRescueCommonContract =
        true;
    },
    (plan) => {
      plan.commonProductContract.componentOrPlanEvidenceMaySubstituteIntegratedTargetEvidence =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("pins all seven workloads without premature content or target results", async () => {
  assert.deepEqual(
    tracked.workloads.map((workload) => [
      workload.workloadId,
      workload.runtimeClass,
      workload.networkClass,
      workload.motionRole,
    ]),
    [...PI5_X86_WORKLOADS],
  );
  for (const mutate of [
    (plan) => {
      plan.workloads.pop();
    },
    (plan) => {
      plan.workloads.reverse();
    },
    (plan) => {
      plan.workloads[1].motionRole = "none-controller-only";
    },
    (plan) => {
      plan.workloads[4].networkClass = "offline-required";
    },
    (plan) => {
      plan.workloads[0].exactContentAndInteractionSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.workloads[0].targetSpecificResultSha256 = "a".repeat(64);
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("requires all 34 cells and 680 cycles with no cross-target rescue", async () => {
  assert.deepEqual(tracked.operationalMatrix.scenarioIds, [
    ...PI5_X86_SCENARIOS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.operationalMatrix.scenarioIds.pop();
    },
    (plan) => {
      plan.operationalMatrix.requiredTargetIds.reverse();
    },
    (plan) => {
      plan.operationalMatrix.optionalTargetIds = [];
    },
    (plan) => {
      plan.operationalMatrix.scenarioCount = 16;
    },
    (plan) => {
      plan.operationalMatrix.validCyclesPerRequiredTargetScenario = 19;
    },
    (plan) => {
      plan.operationalMatrix.requiredCellCount = 33;
    },
    (plan) => {
      plan.operationalMatrix.requiredCycleCount = 679;
    },
    (plan) => {
      plan.operationalMatrix.optionalCycleCount = 0;
    },
    (plan) => {
      plan.operationalMatrix.everyRequiredTargetRunsEveryScenario = false;
    },
    (plan) => {
      plan.operationalMatrix.sameScenarioProtocolAndAcceptanceGatesAcrossRequiredTargets =
        false;
    },
    (plan) => {
      plan.operationalMatrix.failedInvalidStoppedRetriedAdverseAndWorstCaseCyclesRemainVisible =
        false;
    },
    (plan) => {
      plan.operationalMatrix.optionalTargetMayQualifyOrRescueRequiredTarget = true;
    },
    (plan) => {
      plan.operationalMatrix.otherScenarioTargetComponentOrAggregateMayRescueFailure =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("requires all independent product, performance, recovery, and cost measurements", async () => {
  assert.deepEqual(tracked.measurements.requiredMetricIds, [
    ...PI5_X86_METRICS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.measurements.requiredMetricIds.pop();
    },
    (plan) => {
      plan.measurements.requiredMetricIds.reverse();
    },
    (plan) => {
      plan.measurements.independentTimingMotionGameInputOfflineDisplayUpdateRecoveryPowerAcousticAndCostOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.everyRequiredCellCycleFailureAndCostLineMustRemainVisible =
        false;
    },
    (plan) => {
      plan.measurements.deskPlanComponentOptionalTargetOrAggregateMaySubstituteIntegratedTargetEvidence =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("preserves fixed lifecycle, safety, privacy, cost, and no-rescue gates", async () => {
  for (const [key, value] of Object.entries(tracked.fixedAcceptance)) {
    const plan = clone();
    plan.fixedAcceptance[key] = typeof value === "boolean" ? !value : value + 1;
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("keeps all outcome-sensitive quality, resource, recovery, and cost gates null", async () => {
  assert.equal(Object.keys(tracked.openAcceptance).length, 22);
  for (const key of Object.keys(tracked.openAcceptance)) {
    const plan = clone();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("rejects invented cost evidence, purchases, unsafe data, or hidden adverse evidence", async () => {
  for (const [key, value] of Object.entries(tracked.costReportBoundary)) {
    const plan = clone();
    plan.costReportBoundary[key] =
      value === null
        ? "a".repeat(64)
        : typeof value === "boolean"
          ? !value
          : value + 1;
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
  for (const [key, value] of Object.entries(tracked.dataPolicy)) {
    const plan = clone();
    plan.dataPolicy[key] = !value;
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("rejects blocker weakening, premature results, qualification, or tier claims", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [...PI5_X86_BLOCKERS]);
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
      plan.result.completedRequiredCellCount = 34;
    },
    (plan) => {
      plan.result.completedRequiredCycleCount = 680;
    },
    (plan) => {
      plan.result.targetResults.push({});
    },
    (plan) => {
      plan.result.qualifiedRequiredTargetIds.push("pi5-ai-hat26");
    },
    (plan) => {
      plan.result.piDeliveredReferenceBuildCents = 1;
    },
    (plan) => {
      plan.result.ordinaryX86ReuseCostCents = 1;
    },
    (plan) => {
      plan.result.ordinaryX86ReplacementDeliveredCostCents = 1;
    },
    (plan) => {
      plan.result.piLowerCostReferenceQualified = true;
    },
    (plan) => {
      plan.result.ordinaryX86PremiumReferenceQualified = true;
    },
    (plan) => {
      plan.result.steamMachineOptionalRowQualified = true;
    },
    (plan) => {
      plan.result.referenceTierSelectionChanged = true;
    },
    (plan) => {
      plan.result.publishedClaims.push("supported");
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validatePi5X86ProductContractPlan(plan));
  }
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const extra = clone();
  extra.referenceSelected = false;
  await assert.rejects(validatePi5X86ProductContractPlan(extra), /fields drifted/u);
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(duplicate),
    /canonical/u,
  );
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(Buffer.from('{\r"format":1}\n')),
    /bare CR/u,
  );
  await assert.rejects(
    parsePi5X86ProductContractPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
