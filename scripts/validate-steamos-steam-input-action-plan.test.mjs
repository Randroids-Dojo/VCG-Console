import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  STEAMOS_STEAM_INPUT_BLOCKERS,
  STEAMOS_STEAM_INPUT_CONTROLLER_ROLES,
  STEAMOS_STEAM_INPUT_METRICS,
  STEAMOS_STEAM_INPUT_ROUTES,
  STEAMOS_STEAM_INPUT_SCENARIO_GROUPS,
  parseSteamOsSteamInputActionPlanBytes,
  validateSteamOsSteamInputActionPlan,
} from "./validate-steamos-steam-input-action-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(
  resolve(
    root,
    "benchmarks/steam-input/steamos-steam-input-action-plan-v1.json",
  ),
);
const tracked = await parseSteamOsSteamInputActionPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked zero-result I-169 plan", () => {
  assert.equal(tracked.status, "blocked");
  assert.equal(tracked.sourceBindings.length, 14);
  assert.equal(tracked.inputRoutes.length, 4);
  assert.equal(tracked.controllerRoles.length, 7);
  assert.equal(tracked.qualificationMatrix.requiredCellCount, 406);
  assert.equal(tracked.qualificationMatrix.requiredCycleCount, 8120);
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
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("pins the optional adapter contract and accountless reserved-action boundary", async () => {
  for (const mutate of [
    (plan) => {
      plan.prototypeContract.contractSourceSha256 = "0".repeat(64);
    },
    (plan) => {
      plan.prototypeContract.disposition = "required-steam-input";
    },
    (plan) => {
      plan.prototypeContract.baseInputAuthority = "steam-input";
    },
    (plan) => {
      plan.prototypeContract.actionSetIds.reverse();
    },
    (plan) => {
      plan.prototypeContract.actionSetLayerIds.pop();
    },
    (plan) => {
      plan.prototypeContract.reservedActionIds.pop();
    },
    (plan) => {
      plan.prototypeContract.reservedActionsHostOrCompositorOnly = false;
    },
    (plan) => {
      plan.prototypeContract.steamActionMayBeSoleReservedAuthority = true;
    },
    (plan) => {
      plan.prototypeContract.steamAccountRequiredForCoreOperation = true;
    },
    (plan) => {
      plan.prototypeContract.actualIgaVdfDefaultConfigurationsAndAppIdBound =
        true;
    },
    (plan) => {
      plan.prototypeContract.softwareContractMayQualifyPhysicalOrSteamIntegration =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("rejects invented target, partner, mapping, service, fault, or publication authority", async () => {
  for (const [key, value] of Object.entries(tracked.authorityBoundary)) {
    const plan = clone();
    plan.authorityBoundary[key] = value === null ? "a".repeat(64) : true;
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("preserves all four input routes without Steam or legacy promotion", async () => {
  assert.deepEqual(
    tracked.inputRoutes.map((route) => [
      route.routeId,
      route.routeClass,
      route.provider,
      route.steamClientRequired,
      route.mayQualifySteamNativeActions,
    ]),
    [...STEAMOS_STEAM_INPUT_ROUTES],
  );
  for (const mutate of [
    (plan) => {
      plan.inputRoutes.pop();
    },
    (plan) => {
      plan.inputRoutes.reverse();
    },
    (plan) => {
      plan.inputRoutes[0].steamClientRequired = true;
    },
    (plan) => {
      plan.inputRoutes[2].mayQualifySteamNativeActions = true;
    },
    (plan) => {
      plan.inputRoutes[1].provider = "assumed-api";
    },
    (plan) => {
      plan.inputRoutes[0].implementationBuildSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.inputRoutes[0].routeResultSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.inputRoutes[0].implementedOrQualified = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("pins seven controller roles without family-name or sample promotion", async () => {
  assert.deepEqual(
    tracked.controllerRoles.map((role) => [
      role.roleId,
      role.mappingExpectation,
    ]),
    [...STEAMOS_STEAM_INPUT_CONTROLLER_ROLES],
  );
  for (const mutate of [
    (plan) => {
      plan.controllerRoles.pop();
    },
    (plan) => {
      plan.controllerRoles.reverse();
    },
    (plan) => {
      plan.controllerRoles[5].mappingExpectation = "must-work-by-brand";
    },
    (plan) => {
      plan.controllerRoles[6].mappingExpectation = "guessed-standard";
    },
    (plan) => {
      plan.controllerRoles[0].exactSampleManifestSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.controllerRoles[0].mappingConfigurationSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.controllerRoles[0].roleResultSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.controllerRoles[0].sampleReceivedOrQualified = true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("requires all five groups, 406 cells, and 8120 visible cycles", async () => {
  assert.deepEqual(tracked.qualificationMatrix.scenarioGroups, [
    ...STEAMOS_STEAM_INPUT_SCENARIO_GROUPS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.qualificationMatrix.controllerRoleIds.pop();
    },
    (plan) => {
      plan.qualificationMatrix.scenarioGroups.pop();
    },
    (plan) => {
      plan.qualificationMatrix.scenarioGroups[0].routeIds.reverse();
    },
    (plan) => {
      plan.qualificationMatrix.scenarioGroups[1].scenarioIds.pop();
    },
    (plan) => {
      plan.qualificationMatrix.scenarioGroups[0].requiredCellCount = 139;
    },
    (plan) => {
      plan.qualificationMatrix.controllerRoleCount = 6;
    },
    (plan) => {
      plan.qualificationMatrix.declaredScenarioCount = 23;
    },
    (plan) => {
      plan.qualificationMatrix.requiredCellCount = 405;
    },
    (plan) => {
      plan.qualificationMatrix.validCyclesPerCell = 19;
    },
    (plan) => {
      plan.qualificationMatrix.requiredCycleCount = 8119;
    },
    (plan) => {
      plan.qualificationMatrix.everyDeclaredRoleRouteScenarioCellMustRun = false;
    },
    (plan) => {
      plan.qualificationMatrix.failedInvalidStoppedRetriedUnsupportedAdverseAndWorstCaseCyclesRemainVisible =
        false;
    },
    (plan) => {
      plan.qualificationMatrix.oneControllerRouteModeTargetOrAggregateMayRescueFailure =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("requires independent route, action, glyph, text, identity, and recovery evidence", async () => {
  assert.deepEqual(tracked.measurements.requiredMetricIds, [
    ...STEAMOS_STEAM_INPUT_METRICS,
  ]);
  for (const mutate of [
    (plan) => {
      plan.measurements.requiredMetricIds.pop();
    },
    (plan) => {
      plan.measurements.requiredMetricIds.reverse();
    },
    (plan) => {
      plan.measurements.independentInputRecipientGlyphTextEntryAccountlessIdentityAndRecoveryOraclesRequired =
        false;
    },
    (plan) => {
      plan.measurements.everyScheduledCellCycleFailureUnavailableRouteAndConfigurationMustRemainVisible =
        false;
    },
    (plan) => {
      plan.measurements.vendorListMappingPresenceSyntheticBrowserOrOtherControllerMaySubstitutePhysicalEvidence =
        true;
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("preserves fixed accountless, zero-setup, reserved, text, and no-rescue gates", async () => {
  for (const [key, value] of Object.entries(tracked.fixedAcceptance)) {
    const plan = clone();
    plan.fixedAcceptance[key] = typeof value === "boolean" ? !value : value + 1;
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("keeps every outcome-sensitive sample and latency gate null", async () => {
  assert.equal(Object.keys(tracked.openAcceptance).length, 12);
  for (const key of Object.keys(tracked.openAcceptance)) {
    const plan = clone();
    plan.openAcceptance[key] = 1;
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("rejects raw input, entered text, identity, secrets, free text, or hidden failures", async () => {
  for (const [key, value] of Object.entries(tracked.dataPolicy)) {
    const plan = clone();
    plan.dataPolicy[key] = !value;
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("rejects blocker weakening, premature results, route qualification, and compatibility claims", async () => {
  assert.deepEqual(tracked.executionGate.blockerCodes, [
    ...STEAMOS_STEAM_INPUT_BLOCKERS,
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
      plan.result.executedTargetManifestSha256 = "a".repeat(64);
    },
    (plan) => {
      plan.result.completedCellCount = 406;
    },
    (plan) => {
      plan.result.completedCycleCount = 8120;
    },
    (plan) => {
      plan.result.controllerRouteResults.push({});
    },
    (plan) => {
      plan.result.qualifiedControllerRoleIds.push("steam-controller");
    },
    (plan) => {
      plan.result.qualifiedInputRouteIds.push("steam-input-native-actions");
    },
    (plan) => {
      plan.result.nativeSteamInputActionsQualified = true;
    },
    (plan) => {
      plan.result.legacyCompatibilityQualified = true;
    },
    (plan) => {
      plan.result.accountlessBaseInputPreserved = true;
    },
    (plan) => {
      plan.result.standardsConformantCompatibilityClaimAuthorized = true;
    },
    (plan) => {
      plan.result.publishedClaims.push("supported");
    },
  ]) {
    const plan = clone();
    mutate(plan);
    await assert.rejects(validateSteamOsSteamInputActionPlan(plan));
  }
});

test("rejects unknown fields, duplicate keys, noncanonical JSON, BOM, invalid UTF-8, bare CR, and oversize input", async () => {
  const extra = clone();
  extra.steamInputQualified = false;
  await assert.rejects(
    validateSteamOsSteamInputActionPlan(extra),
    /fields drifted/u,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(Buffer.from(JSON.stringify(tracked))),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(tracked, null, 2).replace(
      '  "status": "blocked",',
      '  "status": "blocked",\n  "status": "blocked",',
    )}\n`,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(duplicate),
    /canonical/u,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
    ),
    /BOM/u,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(Buffer.from([0xc3, 0x28])),
    /UTF-8/u,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(Buffer.from('{\r"format":1}\n')),
    /bare CR/u,
  );
  await assert.rejects(
    parseSteamOsSteamInputActionPlanBytes(Buffer.alloc(256 * 1024 + 1)),
    /exceeds/u,
  );
});
