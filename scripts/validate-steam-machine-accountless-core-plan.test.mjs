import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  ACCOUNTLESS_CORE_ROLE_IDS,
  ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS,
  readSteamMachineAccountlessCorePlan,
  validateSteamMachineAccountlessCorePlan,
} from "./validate-steam-machine-accountless-core-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/steam-machine-accountless/steam-machine-accountless-core-plan-v1.json",
);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

test("accepts the strict zero-result I-170 accountless plan", async () => {
  const plan = await readSteamMachineAccountlessCorePlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.result, null);
  assert.equal(plan.qualificationMatrix.requiredCellCount, 60);
  assert.equal(plan.qualificationMatrix.requiredCycleCount, 600);
  assert.equal(plan.executionGate.blockerCodes.length, 12);
});

test("closed plan schema rejects unknown claims", async () => {
  const plan = await loadPlan();
  plan.accountlessQualified = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /plan fields drifted/u,
  );
});

test("source provenance rejects a substituted digest", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /docs\/AUTONOMOUS_RESEARCH_2026-07-19\.md digest drifted/u,
  );
});

test("official Steam Machine setup facts cannot omit the guided Steam login", async () => {
  const plan = await loadPlan();
  plan.officialReferenceRecords[0].facts.shift();
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly deep-equal/u,
  );
});

test("Valve Offline Mode cannot be promoted into accountless evidence", async () => {
  const plan = await loadPlan();
  plan.targetContract.steamOfflineModeCountsAsAccountless = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /steamOfflineModeCountsAsAccountless must remain false/u,
  );
});

test("remembered credentials cannot be promoted into accountless evidence", async () => {
  const plan = await loadPlan();
  plan.targetContract.rememberedCredentialsCountAsAccountless = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /rememberedCredentialsCountAsAccountless must remain false/u,
  );
});

test("target receipt and supported no-login entry remain unproven", async () => {
  const plan = await loadPlan();
  plan.targetContract.supportedAccountlessFirstSetupOrVcgEntryPathSha256 =
    "a".repeat(64);
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /supportedAccountlessFirstSetupOrVcgEntryPathSha256 must remain open/u,
  );
});

test("all six local core roles remain Steam-independent", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.coreRoles.map(({ roleId }) => roleId),
    ACCOUNTLESS_CORE_ROLE_IDS,
  );
  plan.coreRoles[3].steamDependencyAllowed = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("all ten lifecycle scenarios produce sixty cells and six hundred cycles", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.lifecycleScenarios.map(({ scenarioId }) => scenarioId),
    ACCOUNTLESS_LIFECYCLE_SCENARIO_IDS,
  );
  plan.qualificationMatrix.requiredCycleCount = 590;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("a stock first-boot login boundary must be recorded without workaround promotion", async () => {
  const plan = await loadPlan();
  plan.lifecycleScenarios[0].requiredOutcome =
    "A logged-in Offline Mode workaround is acceptable for accountless qualification evidence.";
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /blocking login boundary is recorded without workaround promotion/u,
  );
});

test("account removal cannot delete or reassign local VCG data", async () => {
  const plan = await loadPlan();
  plan.fixedAcceptance.accountRemovalMayDeleteOrReassignLocalVcgData = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /accountRemovalMayDeleteOrReassignLocalVcgData must remain false/u,
  );
});

test("recovery cannot restore device-only identity from Steam", async () => {
  const plan = await loadPlan();
  plan.fixedAcceptance.recoveryMayRestoreDeviceOnlyIdentityFromSteam = true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /recoveryMayRestoreDeviceOnlyIdentityFromSteam must remain false/u,
  );
});

test("Steam-only and third-party services stay separate from local core", async () => {
  const plan = await loadPlan();
  plan.serviceBoundaryCases[2].expectedDisposition =
    "available-without-account-or-network";
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly deep-equal/u,
  );
});

test("logged-in runs, other targets, roles, scenarios, and aggregates cannot rescue failure", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.loggedInOfflineModeOtherTargetRoleScenarioOrAggregateMayRescueFailure =
    true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("all operational authority remains absent", async () => {
  const plan = await loadPlan();
  plan.authorityBoundary.steamAccountCreationLoginSignOutRemovalOrDeletionAuthorized =
    true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /steamAccountCreationLoginSignOutRemovalOrDeletionAuthorized must remain false/u,
  );
});

test("open timing and growth gates cannot be invented", async () => {
  const plan = await loadPlan();
  plan.openAcceptance.maximumControllerUsableReadyP95MsByScenario = {
    "accountless-cold-restart-online": 5000,
  };
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /maximumControllerUsableReadyP95MsByScenario must remain open/u,
  );
});

test("sensitive account, profile, save, payload, network, and free-text data stay prohibited", async () => {
  const plan = await loadPlan();
  plan.dataPolicy.steamAccountNamesIdsEmailsPhoneNumbersCredentialsTokensCookiesOrQrCodesAllowed =
    true;
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /steamAccountNamesIdsEmailsPhoneNumbersCredentialsTokensCookiesOrQrCodesAllowed must remain false/u,
  );
});

test("a blocked plan cannot contain a result", async () => {
  const plan = await loadPlan();
  plan.result = { disposition: "qualified" };
  await assert.rejects(
    validateSteamMachineAccountlessCorePlan(plan),
    /Expected values to be strictly equal/u,
  );
});
