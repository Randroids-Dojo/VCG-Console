import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  SUBSTITUTE_ACCEPTANCE_STAGE_IDS,
  SUBSTITUTE_BLOCKER_CODES,
  SUBSTITUTE_OPTIONAL_TARGET_IDS,
  SUBSTITUTE_REQUIRED_TARGET_IDS,
  SUBSTITUTE_ROLE_DEFINITIONS,
  parseFailureCriticalSubstitutePlanBytes,
  readFailureCriticalSubstitutePlan,
  validateFailureCriticalSubstitutePlan,
} from "./validate-failure-critical-substitute-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/failure-critical-substitutes/cross-tier-failure-critical-substitute-plan-v1.json",
);
const trackedBytes = await readFile(planPath);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-031 plan", async () => {
  const plan = await readFailureCriticalSubstitutePlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.roleDefinitions.length, 12);
  assert.equal(plan.qualificationMatrix.requiredTargetRoleCellCount, 24);
  assert.equal(plan.qualificationMatrix.requiredAcceptanceStageResultCount, 384);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented approved vendor list or result", async () => {
  const plan = await loadPlan();
  plan.approvedVendors = ["example"];
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted repository bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateFailureCriticalSubstitutePlan(plan),
    /QUOTE_DATE_BOMS_2026-07-24\.md digest drifted/u,
  );
});

test("required Pi and ordinary x86 targets cannot be omitted or rescued by Steam", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.targetPolicy.requiredTargetIds, SUBSTITUTE_REQUIRED_TARGET_IDS);
  assert.deepEqual(plan.targetPolicy.optionalTargetIds, SUBSTITUTE_OPTIONAL_TARGET_IDS);
  plan.targetPolicy.optionalTargetMayQualifyOrRescueRequiredTarget = true;
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("target baseline product image firmware power and peripheral identities remain open", async () => {
  const plan = await loadPlan();
  plan.targets[0].exactPrimaryProductAndRoleBaselineManifestSha256 = "a".repeat(64);
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("all twelve functional failure-critical roles remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.roleDefinitions.map(({ roleId, productFunction, mandatoryCheckIds }) => [
      roleId,
      productFunction,
      mandatoryCheckIds,
    ]),
    SUBSTITUTE_ROLE_DEFINITIONS,
  );
  plan.roleDefinitions.splice(9, 1);
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("role-specific storage camera power controller and recovery checks cannot drift", async () => {
  for (const roleIndex of [2, 3, 4, 10, 11]) {
    const plan = await loadPlan();
    plan.roleDefinitions[roleIndex].mandatoryCheckIds.pop();
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("primary substitute and approved-vendor identities remain open", async () => {
  const plan = await loadPlan();
  plan.candidateAndVendorPolicy.approvedVendorListSha256 = "b".repeat(64);
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("vendor approval stock price specifications and connectors cannot qualify a part", async () => {
  for (const key of [
    "marketplaceUsedOpenBoxOrUnidentifiedSellerAllowed",
    "vendorApprovalMayQualifyPartOrAuthorizePurchase",
    "stockPriceSpecificationOrConnectorMatchMayQualify",
    "candidateMayChangeAfterFirstResult",
  ]) {
    const plan = await loadPlan();
    plan.candidateAndVendorPolicy[key] = true;
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("all eight ordered acceptance stages remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.acceptanceStageIds, SUBSTITUTE_ACCEPTANCE_STAGE_IDS);
  plan.acceptanceStageIds.reverse();
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("matrix arithmetic preserves 24 required cells 48 candidate records and 384 stage results", async () => {
  for (const [key, value] of [
    ["requiredTargetRoleCellCount", 23],
    ["requiredCandidateRecordCount", 47],
    ["requiredAcceptanceStageResultCount", 383],
  ]) {
    const plan = await loadPlan();
    plan.qualificationMatrix[key] = value;
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("every primary and substitute uses every stage under the same product contract", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.primaryAndSubstituteMustUseSameTargetProductWorkloadAndAcceptanceContract =
    false;
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("candidate target role stage and aggregate rescue remain forbidden", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.candidateTargetRoleStageOrAggregateMayRescueFailure = true;
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("independent integrated evidence and complete adverse ledgers remain required", async () => {
  for (const mutate of [
    (plan) => {
      plan.measurements.independentIdentityFitSafetyPerformancePowerThermalAcousticFaultRecoveryCostSupplyAndClockOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.vendorUiSpecificationComponentSmokeOrSelfReportMaySubstituteForIntegratedEvidence =
        true;
    },
    (plan) => {
      plan.measurements.everyAttemptFailureInvalidationRetryExceptionAndWorstCaseMustRemainVisible =
        false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("fixed substitute no-silent-change product-gate and D-111 limits cannot weaken", async () => {
  for (const mutate of [
    (plan) => {
      plan.fixedAcceptance.minimumQualifiedSubstitutesPerRequiredTargetRoleCell = 0;
    },
    (plan) => {
      plan.fixedAcceptance.maximumUnqualifiedOrSilentSubstitutions = 1;
    },
    (plan) => {
      plan.fixedAcceptance.maximumWeakenedInheritedProductGates = 1;
    },
    (plan) => {
      plan.fixedAcceptance.maximumPiLowerCostDeliveredReferenceCents = 65001;
    },
    (plan) => {
      plan.fixedAcceptance.architectureTierOrFunctionalRoleChangeRequiresSupersedingDecision =
        false;
    },
  ]) {
    const plan = await loadPlan();
    mutate(plan);
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("outcome-sensitive samples regressions service quote supply and ranking gates remain open", async () => {
  const plan = await loadPlan();
  plan.openAcceptance.minimumReceivedUnitsPerCandidateTargetRole = 2;
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan), /must remain open/u);
});

test("no purchase vendor contact destructive operation qualification publication or BOM authority exists", async () => {
  for (const key of [
    "purchaseReturnOrVendorContactAuthorized",
    "firmwareUpdateDestructiveFaultPowerOrTargetOperationAuthorized",
    "approvedVendorListPublicationAuthorized",
    "qualificationSelectionSubstitutionPublicationOrBomMutationAuthorized",
  ]) {
    const plan = await loadPlan();
    plan.authorityBoundary[key] = true;
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("raw device vendor path user media credential payment and free-text data remain prohibited", async () => {
  for (const key of [
    "rawSerialUsbPciBluetoothFirmwareSmartOrDeviceIdentifiersAllowed",
    "sellerReceiptOrderReturnWarrantySupportOrContactIdentifiersAllowed",
    "hostnamesUsernamesPathsEnvironmentArgumentsNetworkOrFilesystemValuesAllowed",
    "profileSaveBrowserCameraAudioVideoControllerPayloadOrParticipantDataAllowed",
    "credentialsTokensKeysSecretsPaymentTaxOrStreetAddressDataAllowed",
    "freeTextVendorFirmwareDriverKernelFaultServiceOrResultLogsAllowed",
  ]) {
    const plan = await loadPlan();
    plan.dataPolicy[key] = true;
    await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
  }
});

test("all blockers remain and blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.executionGate.blockerCodes, SUBSTITUTE_BLOCKER_CODES);
  plan.result = { status: "qualified" };
  await assert.rejects(validateFailureCriticalSubstitutePlan(plan));
});

test("rejects noncanonical JSON duplicate keys BOM invalid UTF-8 bare CR and oversize", async () => {
  const plan = await loadPlan();
  await assert.rejects(
    parseFailureCriticalSubstitutePlanBytes(Buffer.from(JSON.stringify(plan))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(plan, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(parseFailureCriticalSubstitutePlanBytes(duplicate), /canonical/u);
  await assert.rejects(
    parseFailureCriticalSubstitutePlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseFailureCriticalSubstitutePlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseFailureCriticalSubstitutePlanBytes(Buffer.from("{\r}")),
    /bare CR/u,
  );
  await assert.rejects(
    parseFailureCriticalSubstitutePlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
