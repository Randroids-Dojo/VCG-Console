import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  RESERVED_HOME_HOSTILE_STATE_IDS,
  RESERVED_HOME_REQUIRED_INPUT_ROLE_IDS,
  RESERVED_HOME_REQUIRED_TARGET_IDS,
  RESERVED_HOME_RUNTIME_IDS,
  readReservedHomeActionPlan,
  validateReservedHomeActionPlan,
} from "./validate-reserved-home-action-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const planPath = resolve(
  root,
  "benchmarks/reserved-home/reserved-home-action-plan-v1.json",
);

async function loadPlan() {
  return JSON.parse(await readFile(planPath, "utf8"));
}

test("accepts the tracked blocked zero-result I-091 plan", async () => {
  const plan = await readReservedHomeActionPlan();
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.qualificationScope, ["I-091"]);
  assert.equal(plan.qualificationMatrix.requiredCellCount, 480);
  assert.equal(plan.qualificationMatrix.requiredCycleCount, 9600);
  assert.equal(plan.result, null);
});

test("closed schema rejects an invented reserved-Home result", async () => {
  const plan = await loadPlan();
  plan.homeQualified = true;
  await assert.rejects(validateReservedHomeActionPlan(plan), /plan fields drifted/u);
});

test("source provenance rejects stale or substituted bytes", async () => {
  const plan = await loadPlan();
  plan.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /docs\/SECURITY_THREAT_MODEL\.md digest drifted/u,
  );
});

test("required Pi and ordinary-Linux targets cannot be replaced or rescued", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.targetPolicy.requiredTargetIds, RESERVED_HOME_REQUIRED_TARGET_IDS);
  plan.targetPolicy.optionalTargetMayRescueRequiredTarget = true;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /optionalTargetMayRescueRequiredTarget must remain false/u,
  );
});

test("target and compositor identities remain unproven", async () => {
  const plan = await loadPlan();
  plan.targets[0].operatingSystemKernelCompositorAndInputServiceSha256 =
    "a".repeat(64);
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /pi5-ai-hat26\.operatingSystemKernelCompositorAndInputServiceSha256 must remain open/u,
  );
});

test("all required controller and recovery-remote roles remain exact", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.qualificationMatrix.requiredInputRoleIds,
    RESERVED_HOME_REQUIRED_INPUT_ROLE_IDS,
  );
  plan.inputRoles[4].requirement = "optional";
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("generic ambiguous input cannot gain a guessed Home binding", async () => {
  const plan = await loadPlan();
  plan.inputRoles[2].homeBindingClass = "guess-by-controller-family";
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("all four runtime classes keep Home outside game authority", async () => {
  const plan = await loadPlan();
  assert.deepEqual(
    plan.runtimeClasses.map(({ runtimeId }) => runtimeId),
    RESERVED_HOME_RUNTIME_IDS,
  );
  plan.runtimeClasses[1].gameMayReceiveHome = true;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("all twelve hostile capture and failure states remain mandatory", async () => {
  const plan = await loadPlan();
  assert.deepEqual(plan.hostileStates, RESERVED_HOME_HOSTILE_STATE_IDS);
  plan.hostileStates.splice(3, 1);
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly deep-equal/u,
  );
});

test("system ownership begins before any game delivery", async () => {
  const plan = await loadPlan();
  plan.homeSemantics.timerStart = "game-callback-receives-home";
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /before-game-delivery/u,
  );
});

test("Steam overlay, browser Escape, Back, and game menus cannot substitute", async () => {
  const plan = await loadPlan();
  plan.homeSemantics.steamOverlayMayBeSoleHomeAuthority = true;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /steamOverlayMayBeSoleHomeAuthority must remain false/u,
  );
});

test("Home may never be delivered to the game", async () => {
  const plan = await loadPlan();
  plan.fixedAcceptance.maximumHomeEventsDeliveredToGame = 1;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("required matrix arithmetic preserves 480 cells and 9600 cycles", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.requiredCellCount = 479;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("failed, blocked, invalid, stopped, retried, and worst cases stay visible", async () => {
  const plan = await loadPlan();
  plan.qualificationMatrix.failedBlockedInvalidStoppedRetriedAndWorstCaseCyclesRemainVisible =
    false;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("physical edge, recipient, focus, surface, process, and clock oracles remain required", async () => {
  const plan = await loadPlan();
  plan.measurements.independentPhysicalEdgeRecipientFocusSurfaceInputRevocationProcessAndClockOraclesRequired =
    false;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("open Home, forced-exit, resume, and sample thresholds cannot be invented", async () => {
  const plan = await loadPlan();
  plan.openAcceptance.maximumHomeEndToEndP99Ms = 100;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /maximumHomeEndToEndP99Ms must remain open/u,
  );
});

test("no target, input, fault, runtime, or publication authority is granted", async () => {
  const plan = await loadPlan();
  plan.authorityBoundary.fullscreenPointerFocusProcessOrNetworkFaultAuthorized =
    true;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});

test("raw input, stable identifiers, media, paths, account data, and free text remain prohibited", async () => {
  const plan = await loadPlan();
  plan.dataPolicy.rawUsbBluetoothHidInputOrRemotePayloadsAllowed = true;
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /rawUsbBluetoothHidInputOrRemotePayloadsAllowed must remain false/u,
  );
});

test("blocked execution cannot contain a result", async () => {
  const plan = await loadPlan();
  plan.result = { disposition: "qualified" };
  await assert.rejects(
    validateReservedHomeActionPlan(plan),
    /Expected values to be strictly equal/u,
  );
});
