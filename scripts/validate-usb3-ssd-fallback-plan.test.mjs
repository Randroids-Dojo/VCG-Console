import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  USB3_SSD_BLOCKER_CODES,
  USB3_SSD_PHASE_IDS,
  USB3_SSD_SCENARIO_DEFINITIONS,
  parseUsb3SsdFallbackPlanBytes,
  readUsb3SsdFallbackPlan,
  validateUsb3SsdFallbackPlan,
} from "./validate-usb3-ssd-fallback-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/usb3-ssd-fallback/pi5-usb3-ssd-fallback-plan-v1.json",
);
const trackedBytes = await readFile(planPath);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-021 plan", async () => {
  const plan = await readUsb3SsdFallbackPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.phaseIds.length, 12);
  assert.equal(plan.scenarioDefinitions.length, 24);
  assert.equal(plan.executionGate.blockerCodes.length, 12);
  assert.equal(plan.result, null);
});

test("closed schema rejects invented selection or result fields", async () => {
  const plan = await loadPlan();
  plan.selectedCandidateId = "kingston-xs1000-1tb-black";
  await assert.rejects(validateUsb3SsdFallbackPlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateUsb3SsdFallbackPlan(plan),
    /USB3_SSD_FALLBACK_SCREEN_2026-07-24\.md digest drifted/u,
  );
});

test("a valid rejected microSD result or separate lab authority remains mandatory", async () => {
  for (const mutate of [
    (plan) => {
      plan.triggerContract.requiredMicroSdConclusion = "qualified";
    },
    (plan) => {
      plan.triggerContract.validRejectedMicroSdResultRequiredUnlessLabSampleOnlyAuthority = false;
    },
    (plan) => {
      plan.triggerContract.nonStorageOrHarnessFailureMayInvokeProductionFallback = true;
    },
    (plan) => {
      plan.triggerContract.labSampleMayQualifyFallback = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("blocked trigger evidence cannot be fabricated into the tracked plan", async () => {
  const plan = await loadPlan();
  plan.triggerContract.microSdResultSha256 = "a".repeat(64);
  await assert.rejects(validateUsb3SsdFallbackPlan(plan), /must remain open/u);
});

test("screened candidates remain exact unselected source facts", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.candidatePolicy.screenedCandidates.map(({ candidateId, exactPartNumber }) => [
      candidateId,
      exactPartNumber,
    ]),
    [
      ["kingston-xs1000-1tb-black", "SXS1000/1000G"],
      ["samsung-t7-shield-1tb-black", "MU-PE1T0S/AM"],
    ],
  );
  plan.candidatePolicy.screenedCandidates[0].sourceFactsMaySelectPurchaseOrQualify = true;
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("candidate, firmware, cable, port and mount identities remain open", async () => {
  const plan = await loadPlan();
  plan.candidatePolicy.exactUsbDescriptorsCablePortTopologyAndNegotiatedModeSha256 =
    "b".repeat(64);
  await assert.rejects(validateUsb3SsdFallbackPlan(plan), /must remain open/u);
});

test("powered hubs, separate assemblies and candidate rescue remain unauthorized", async () => {
  for (const key of [
    "poweredHubOrSeparateSupplyAuthorized",
    "separateBridgeEnclosureOrCableSubstitutionAuthorized",
    "candidateMayChangeAfterFirstResult",
    "oneCandidateMayRescueAnother",
  ]) {
    const plan = await loadPlan();
    plan.candidatePolicy[key] = true;
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("the Pi USB boot and safe-current boundary cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.targetBoundary.storageConnection = "pi5-usb-c";
    },
    (plan) => {
      plan.targetBoundary.microSdMustBeAbsentForBootQualification = false;
    },
    (plan) => {
      plan.targetBoundary.unsafeUsbCurrentOverrideAllowed = true;
    },
    (plan) => {
      plan.targetBoundary.extraStorageDevicesMaySelectRecoveryTarget = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("all twelve phases remain exact and ordered", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.phaseIds, USB3_SSD_PHASE_IDS);
  plan.phaseIds.splice(7, 1);
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("all twenty-four boot workload fault recovery and cost scenarios remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.scenarioDefinitions.map(({ scenarioId, phaseId }) => [scenarioId, phaseId]),
    USB3_SSD_SCENARIO_DEFINITIONS,
  );
  plan.scenarioDefinitions.splice(14, 1);
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("independent semantic oracles and adverse ledgers remain required", async () => {
  const plan = await loadPlan();
  plan.measurements.independentBootStoragePowerCutDisconnectCorruptionRecoveryPowerThermalMechanicalCostAndClockOraclesRequired =
    false;
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("vendor UI attachment speed and filesystem mount cannot substitute for evidence", async () => {
  const plan = await loadPlan();
  plan.measurements.vendorToolUiKernelAttachmentAdvertisedSpeedOrFilesystemMountMaySubstituteForSemanticEvidence =
    true;
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("fixed integrity boot cost and no-rescue gates cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.fixedAcceptance.minimumValidColdBootCycles = 99;
    },
    (plan) => {
      plan.fixedAcceptance.maximumCommittedCorruptionEvents = 1;
    },
    (plan) => {
      plan.fixedAcceptance.maximumLowerCostReferenceDeliveredCents = 65001;
    },
    (plan) => {
      plan.fixedAcceptance.extraCapacityMayRelaxQuotasWritesOrSupportedContentPromise = true;
    },
    (plan) => {
      plan.fixedAcceptance.failedGateMayBeOffsetBySpeedCapacityCostOrAnotherCandidate = true;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("outcome-sensitive sample schedule performance endurance and physical gates remain open", async () => {
  const plan = await loadPlan();
  plan.openAcceptance.minimumValidPowerCutsPerAuthoritativeState = 100;
  await assert.rejects(validateUsb3SsdFallbackPlan(plan), /must remain open/u);
});

test("no purchase destructive target qualification or BOM authority is granted", async () => {
  for (const key of [
    "purchaseOrReturnAuthorized",
    "firmwareUpdateImageWriteOrRecoveryMediaMutationAuthorized",
    "destructiveWorkloadPowerCutDisconnectOrCorruptionAuthorized",
    "targetBootPowerUsbMechanicalOrServiceOperationAuthorized",
    "qualificationSelectionPublicationOrProductBomMutationAuthorized",
  ]) {
    const plan = await loadPlan();
    plan.authorityBoundary[key] = true;
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("raw identifiers receipts paths user state media secrets and free text remain prohibited", async () => {
  for (const key of [
    "rawUsbDescriptorsSerialsSmartValuesOrFirmwareToolPayloadsAllowed",
    "sellerReceiptOrderReturnWarrantyOrSupportIdentifiersAllowed",
    "hostnamesUsernamesPathsEnvironmentArgumentsOrFilesystemValuesAllowed",
    "profileSaveRetroContentBrowserDataCredentialsTokensKeysOrSecretsAllowed",
    "cameraScreenAudioVideoControllerPayloadOrHouseholdMediaAllowed",
    "freeTextKernelFirmwareFilesystemToolRecoveryOrResultLogsAllowed",
  ]) {
    const plan = await loadPlan();
    plan.dataPolicy[key] = true;
    await assert.rejects(validateUsb3SsdFallbackPlan(plan));
  }
});

test("all blockers remain and blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, USB3_SSD_BLOCKER_CODES);
  plan.result = { conclusion: "qualified" };
  await assert.rejects(validateUsb3SsdFallbackPlan(plan));
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const plan = await loadPlan();
  await assert.rejects(
    parseUsb3SsdFallbackPlanBytes(Buffer.from(JSON.stringify(plan))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(plan, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseUsb3SsdFallbackPlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseUsb3SsdFallbackPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseUsb3SsdFallbackPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseUsb3SsdFallbackPlanBytes(Buffer.from("{\r}")),
    /bare CR/u,
  );
  await assert.rejects(
    parseUsb3SsdFallbackPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
