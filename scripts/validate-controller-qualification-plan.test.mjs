import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseControllerQualificationPlanBytes,
  validateControllerQualificationPlan,
  validateTrackedControllerQualificationPlan,
} from "./validate-controller-qualification-plan.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  repositoryRoot,
  "benchmarks/controller-qualification/cross-tier-controller-plan-v1.json",
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vcg-controller-qualification-"));
  const plan = JSON.parse(await readFile(trackedPath, "utf8"));
  for (const [index, binding] of plan.sourceBindings.entries()) {
    const absolute = join(root, ...binding.path.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    const bytes = Buffer.from(`fixture-${index}\n`);
    await writeFile(absolute, bytes);
    binding.sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  return { root, plan };
}

test("accepts the tracked blocked controller campaign", async () => {
  const plan = await validateTrackedControllerQualificationPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.runProtocol.declaredScenarioCount, 51);
});

test("accepts a complete isolated fixture", async () => {
  const { root, plan } = await fixture();
  await validateControllerQualificationPlan(plan, root);
});

test("rejects source drift", async () => {
  const { root, plan } = await fixture();
  const binding = plan.sourceBindings[0];
  await writeFile(join(root, ...binding.path.split("/")), "changed\n");
  await assert.rejects(validateControllerQualificationPlan(plan, root), /digest drifted/);
});

test("rejects source substitution", async () => {
  const { root, plan } = await fixture();
  plan.sourceBindings[0].path = "docs/CONTROLLER_MAPPING_CONTRACT.md";
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects hidden plan fields", async () => {
  const { root, plan } = await fixture();
  plan.deviceExceptions = [];
  await assert.rejects(validateControllerQualificationPlan(plan, root), /fields drifted/);
});

test("rejects browser evidence as native qualification", async () => {
  const { root, plan } = await fixture();
  plan.targetPolicy.browserAdapterMayQualifyNativeInput = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects optional Steam rescue of a required Linux target", async () => {
  const { root, plan } = await fixture();
  plan.targetPolicy.optionalTargetMayRescueRequiredTarget = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects invented target SDL evidence", async () => {
  const { root, plan } = await fixture();
  plan.targets[0].sdlBuildSha256 = "a".repeat(64);
  await assert.rejects(
    validateControllerQualificationPlan(plan, root),
    /blocked target cannot populate sdlBuildSha256/,
  );
});

test("rejects deleting or reordering target rows", async () => {
  const { root, plan } = await fixture();
  plan.targets.reverse();
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects family resemblance as compatibility proof", async () => {
  const { root, plan } = await fixture();
  plan.controllerSamplePolicy.familyResemblanceMayEstablishSupport = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects deleting a required sample role", async () => {
  const { root, plan } = await fixture();
  plan.controllerSamples.splice(1, 1);
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects premature exact device evidence", async () => {
  const { root, plan } = await fixture();
  plan.controllerSamples[0].deviceManifestSha256s = ["a".repeat(64)];
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects changing ambiguous mapping to guessed standard", async () => {
  const { root, plan } = await fixture();
  plan.controllerSamples[3].mappingExpectation = "trusted-standard";
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects deleting or reordering scenario groups", async () => {
  const { root, plan } = await fixture();
  plan.scenarioGroups.pop();
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects a duplicate scenario hidden across groups", async () => {
  const { root, plan } = await fixture();
  plan.scenarioGroups[1].scenarioIds[0] = plan.scenarioGroups[0].scenarioIds[0];
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects fewer than twenty valid cycles", async () => {
  const { root, plan } = await fixture();
  plan.scenarioGroups[0].requiredValidCyclesPerApplicableCell = 19;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects replacing a failed product cycle", async () => {
  const { root, plan } = await fixture();
  plan.runProtocol.failedProductCycleMayBeReplaced = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects weakening a zero-tolerance reserved-action gate", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.maximumReservedActionsDeliveredToGame = 1;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects choosing a response threshold before Q-230", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.maximumReservedActionP95Ms = 100;
  await assert.rejects(
    validateControllerQualificationPlan(plan, root),
    /blocked plan cannot populate maximumReservedActionP95Ms/,
  );
});

test("rejects inferring battery state", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.batteryStateMayBeInferred = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects stable hardware identifiers in the tracked ledger", async () => {
  const { root, plan } = await fixture();
  plan.dataPolicy.stableDeviceIdentifiersAllowedInTrackedLedger = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects granting physical controller authority through the plan", async () => {
  const { root, plan } = await fixture();
  plan.authority.physicalControllerExecutionAuthorized = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("rejects a fabricated compatibility result", async () => {
  const { root, plan } = await fixture();
  plan.result.disposition = "qualified";
  plan.result.compatibilityClaimAuthorized = true;
  await assert.rejects(validateControllerQualificationPlan(plan, root));
});

test("requires canonical JSON bytes", async () => {
  const { root, plan } = await fixture();
  await assert.rejects(
    parseControllerQualificationPlanBytes(Buffer.from(JSON.stringify(plan)), root),
    /canonical two-space JSON/,
  );
});

test("rejects a UTF-8 BOM", async () => {
  const { root, plan } = await fixture();
  const canonical = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  await assert.rejects(
    parseControllerQualificationPlanBytes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]),
      root,
    ),
  );
});

test("rejects bare carriage returns in bound sources", async () => {
  const { root, plan } = await fixture();
  const binding = plan.sourceBindings[0];
  const bytes = Buffer.from("one\rtwo\n");
  await writeFile(join(root, ...binding.path.split("/")), bytes);
  binding.sha256 = createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(validateControllerQualificationPlan(plan, root), /bare CR/);
});
