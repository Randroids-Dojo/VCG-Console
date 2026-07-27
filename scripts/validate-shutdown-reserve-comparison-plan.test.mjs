import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  SHUTDOWN_RESERVE_ALTERNATIVES,
  SHUTDOWN_RESERVE_BLOCKER_CODES,
  SHUTDOWN_RESERVE_COMMON_EVENT_IDS,
  SHUTDOWN_RESERVE_FAULT_IDS,
  SHUTDOWN_RESERVE_OPERATION_IDS,
  parseShutdownReserveComparisonPlanBytes,
  readShutdownReserveComparisonPlan,
  validateShutdownReserveComparisonPlan,
} from "./validate-shutdown-reserve-comparison-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/shutdown-reserve/pi5-shutdown-reserve-comparison-plan-v1.json",
);
const trackedBytes = await readFile(planPath);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-032 plan", async () => {
  const plan = await readShutdownReserveComparisonPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.alternatives.length, 4);
  assert.equal(plan.comparisonMatrix.totalScenarioCellCount, 330);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented selected product or result field", async () => {
  const plan = await loadPlan();
  plan.selectedProduct = "example-ups";
  await assert.rejects(validateShutdownReserveComparisonPlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateShutdownReserveComparisonPlan(plan),
    /OPEN_QUESTIONS\.md digest drifted/u,
  );
});

test("D-109 software and storage incumbent cannot silently become backup power", async () => {
  for (const mutate of [
    (plan) => {
      plan.incumbentPolicy.selectedAlternativeId = "small-external-ups";
    },
    (plan) => {
      plan.incumbentPolicy.backupPowerRequiredByCurrentDecision = true;
    },
    (plan) => {
      plan.incumbentPolicy.reserveSelectionRequiresSupersedingD109Decision = false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("microSD SSD UPS and supercapacitor alternatives remain exact and non-selected", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.alternatives.map(({ alternativeId, alternativeClass, comparisonRole }) => [
      alternativeId,
      alternativeClass,
      comparisonRole,
    ]),
    SHUTDOWN_RESERVE_ALTERNATIVES,
  );
  plan.alternatives[2].candidateReceivedInventoriedAndAuthorized = true;
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("exact received target reserve cell firmware and wiring identities remain open", async () => {
  const plan = await loadPlan();
  plan.alternatives[3].exactReserveCandidateRevisionCellFirmwareAndWiringManifestSha256 =
    "a".repeat(64);
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("all eleven inherited I-202 operation classes remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.operationIds, SHUTDOWN_RESERVE_OPERATION_IDS);
  plan.operationIds.pop();
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("common abrupt loss brownout dropout undervoltage and reconnect events cannot drift", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.commonElectricalEventProfileIds, SHUTDOWN_RESERVE_COMMON_EVENT_IDS);
  plan.commonElectricalEventProfileIds.reverse();
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("depleted disconnected unhealthy signal-fault and low-reserve boot profiles remain", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.reserveFaultProfileIds, SHUTDOWN_RESERVE_FAULT_IDS);
  plan.reserveFaultProfileIds.splice(2, 1);
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("matrix arithmetic preserves 220 common 110 reserve-fault and 330 total cells", async () => {
  for (const [key, value] of [
    ["commonScenarioCellCount", 219],
    ["reserveFaultScenarioCellCount", 109],
    ["totalScenarioCellCount", 329],
  ]) {
    const plan = await loadPlan();
    plan.comparisonMatrix[key] = value;
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("every alternative uses the same target workload schedule and oracles", async () => {
  const plan = await loadPlan();
  plan.comparisonMatrix.sameExactTargetWorkloadOperationEventScheduleAndOraclesRequired = false;
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("alternative operation event average and aggregate rescue remain forbidden", async () => {
  const plan = await loadPlan();
  plan.comparisonMatrix.alternativeOperationEventOrAggregateMayRescueFailure = true;
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("independent integrated evidence and pre-repair adverse ledgers remain required", async () => {
  for (const mutate of [
    (plan) => {
      plan.measurements.independentElectricalTimingStateSafetyCostAndLifecycleOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.vendorSpecificationCalculatedCapacityOrCleanShutdownMaySubstituteForIntegratedEvidence =
        true;
    },
    (plan) => {
      plan.measurements.preRepairFirstFailureEvidenceAndEveryAttemptMustRemainVisible = false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("fixed power integrity safety D-109 and D-111 gates cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.fixedAcceptance.minimumValidPowerCutTrialsPerAlternative = 199;
    },
    (plan) => {
      plan.fixedAcceptance.maximumCommittedStateCorruptionsOrUnauthorizedAuthorityChanges = 1;
    },
    (plan) => {
      plan.fixedAcceptance.maximumPiLowerCostDeliveredReferenceCents = 65001;
    },
    (plan) => {
      plan.fixedAcceptance.failedMicrosdRequiresDocumentedUsb3SsdFallbackEvaluationBeforeReserveSelection =
        false;
    },
    (plan) => {
      plan.fixedAcceptance.backupPowerSelectionRequiresSupersedingD109OwnerDecision = false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("outcome-sensitive trigger samples timing aging value and ranking gates remain open", async () => {
  for (const key of [
    "repeatedInterruptionFailureTriggerCountAndWindow",
    "minimumReceivedUnitsAndIndependentLotsPerAlternative",
    "minimumFreshAndEndOfLifeReserveMarginMicroseconds",
    "maximumDeliveredCostDeltaCents",
    "decisionHorizonRankingWeightsTieBreakExpiryAndRetestPolicySha256",
  ]) {
    const plan = await loadPlan();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validateShutdownReserveComparisonPlan(plan), /must remain open/u);
  }
});

test("no recommendation result or D-109 superseding decision is invented", async () => {
  for (const mutate of [
    (plan) => {
      plan.decisionProtocol.recommendedAlternativeId = "small-external-ups";
    },
    (plan) => {
      plan.decisionProtocol.passingReserveAutomaticallyOverridesD109 = true;
    },
    (plan) => {
      plan.decisionProtocol.d109SupersedingDecisionId = "D-999";
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("no purchase wiring charging destructive operation selection publication or BOM authority exists", async () => {
  for (const key of [
    "purchaseReturnOrVendorContactAuthorized",
    "wiringChargingFirmwareMutationOrElectricalAssemblyAuthorized",
    "destructivePowerFaultTargetOrReserveOperationAuthorized",
    "candidateSelectionD109SupersessionBomMutationPublicationOrProductClaimAuthorized",
  ]) {
    const plan = await loadPlan();
    plan.authorityBoundary[key] = true;
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("raw device seller path household credential payment and free-text data remain prohibited", async () => {
  for (const key of [
    "rawSerialUsbPciFirmwareBatteryCellSmartOrDeviceIdentifiersAllowed",
    "sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed",
    "hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed",
    "profileSaveBrowserCameraAudioVideoControllerPayloadOrParticipantDataAllowed",
    "credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed",
    "freeTextElectricalFirmwareKernelShutdownFaultServiceOrResultLogsAllowed",
  ]) {
    const plan = await loadPlan();
    plan.dataPolicy[key] = true;
    await assert.rejects(validateShutdownReserveComparisonPlan(plan));
  }
});

test("all blockers remain and blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, SHUTDOWN_RESERVE_BLOCKER_CODES);
  plan.result = { status: "selected" };
  await assert.rejects(validateShutdownReserveComparisonPlan(plan));
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const plan = await loadPlan();
  await assert.rejects(
    parseShutdownReserveComparisonPlanBytes(Buffer.from(JSON.stringify(plan))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(plan, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseShutdownReserveComparisonPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseShutdownReserveComparisonPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseShutdownReserveComparisonPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseShutdownReserveComparisonPlanBytes(Buffer.from("{\r}")),
    /bare CR/u,
  );
  await assert.rejects(
    parseShutdownReserveComparisonPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
