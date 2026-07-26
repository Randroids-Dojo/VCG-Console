import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseBootResumeLaunchTimingPlanBytes,
  validateBootResumeLaunchTimingPlan,
  validateTrackedBootResumeLaunchTimingPlan,
} from "./validate-boot-resume-launch-timing-plan.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  repositoryRoot,
  "benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json",
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vcg-boot-resume-launch-"));
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

test("accepts the tracked blocked cross-tier timing plan", async () => {
  const plan = await validateTrackedBootResumeLaunchTimingPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.result.completedRequiredTrials, 0);
});

test("accepts a complete isolated fixture", async () => {
  const { root, plan } = await fixture();
  await validateBootResumeLaunchTimingPlan(plan, root);
});

test("rejects source drift after registration", async () => {
  const { root, plan } = await fixture();
  const binding = plan.sourceBindings[0];
  await writeFile(join(root, ...binding.path.split("/")), "changed\n");
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root), /digest drifted/);
});

test("rejects source substitution", async () => {
  const { root, plan } = await fixture();
  plan.sourceBindings[0].role = "another-role";
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects undeclared plan fields", async () => {
  const { root, plan } = await fixture();
  plan.hiddenEvidence = {};
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root), /fields drifted/);
});

test("rejects Windows qualification of ordinary native Linux", async () => {
  const { root, plan } = await fixture();
  plan.targetPolicy.windowsMayQualifyOrdinaryLinux = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects deleting or reordering a target", async () => {
  const { root, plan } = await fixture();
  plan.targets.reverse();
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects selecting the ordinary x86 idle strategy before Q-270", async () => {
  const { root, plan } = await fixture();
  plan.targets[0].idleStrategy = "platform-suspend";
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects weakening the Pi low-power idle selection", async () => {
  const { root, plan } = await fixture();
  plan.targets[1].idleStrategy = "platform-suspend";
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects invented target hardware evidence", async () => {
  const { root, plan } = await fixture();
  plan.targets[1].hardwareManifestSha256 = "a".repeat(64);
  await assert.rejects(
    validateBootResumeLaunchTimingPlan(plan, root),
    /blocked target cannot populate hardwareManifestSha256/,
  );
});

test("rejects an unproven wake source", async () => {
  const { root, plan } = await fixture();
  plan.targets[1].qualifiedWakeSources = ["controller"];
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects deleting a required timing path", async () => {
  const { root, plan } = await fixture();
  plan.paths.pop();
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects relaxing a fixed path deadline", async () => {
  const { root, plan } = await fixture();
  plan.paths[0].maximumMs = 61_000;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects fewer than twenty trials in one cell", async () => {
  const { root, plan } = await fixture();
  plan.paths[2].requiredTrialsPerTarget = 19;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects total schedule arithmetic drift", async () => {
  const { root, plan } = await fixture();
  plan.measurementProtocol.requiredCommonScheduledTrials = 319;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects discarding warmups or replacing failed trials", async () => {
  const { root, plan } = await fixture();
  plan.measurementProtocol.warmupAttemptsMayBeDiscarded = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects deletion of a privacy-state gate", async () => {
  const { root, plan } = await fixture();
  plan.idleWakeOracles.quiesceGates.splice(3, 1);
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects inferring hardware privacy state from UI", async () => {
  const { root, plan } = await fixture();
  plan.idleWakeOracles.privacyStateMayBeInferredFromUi = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects choosing a power ceiling after planning without owner input", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.maximumIdlePowerWByTarget["pi5-hailo26-reference"] = 5;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("keeps truthful hosted phase evidence separate from playability", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.hostedTruthfulPhaseMayEstablishPlayability = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects rescuing a required target with optional Steam evidence", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.optionalSteamMachineMayRescueCommonComparison = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects granting physical power authority through the plan", async () => {
  const { root, plan } = await fixture();
  plan.authority.physicalPowerControlAuthorized = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("rejects a fabricated timing result", async () => {
  const { root, plan } = await fixture();
  plan.result.disposition = "qualified";
  plan.result.completedRequiredTrials = 320;
  plan.result.commonComparisonEligible = true;
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root));
});

test("requires canonical JSON bytes", async () => {
  const { root, plan } = await fixture();
  await assert.rejects(
    parseBootResumeLaunchTimingPlanBytes(Buffer.from(JSON.stringify(plan)), root),
    /canonical two-space JSON/,
  );
});

test("rejects a UTF-8 BOM", async () => {
  const { root, plan } = await fixture();
  const canonical = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  await assert.rejects(
    parseBootResumeLaunchTimingPlanBytes(
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
  await assert.rejects(validateBootResumeLaunchTimingPlan(plan, root), /bare CR/);
});
