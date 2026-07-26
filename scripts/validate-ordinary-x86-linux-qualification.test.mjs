import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseOrdinaryX86LinuxQualificationPlanBytes,
  validateOrdinaryX86LinuxQualificationPlan,
  validateTrackedOrdinaryX86LinuxQualificationPlan,
} from "./validate-ordinary-x86-linux-qualification.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  repositoryRoot,
  "benchmarks/x86-linux/ordinary-x86-linux-qualification-plan-v1.json",
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vcg-ordinary-x86-linux-"));
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

test("accepts the tracked blocked ordinary x86 Linux plan", async () => {
  const plan = await validateTrackedOrdinaryX86LinuxQualificationPlan();
  assert.equal(plan.status, "blocked");
  assert.equal(plan.result.disposition, "not-run");
});

test("accepts a complete isolated fixture", async () => {
  const { root, plan } = await fixture();
  await validateOrdinaryX86LinuxQualificationPlan(plan, root);
});

test("rejects source evidence changed after registration", async () => {
  const { root, plan } = await fixture();
  const binding = plan.sourceBindings[0];
  await writeFile(join(root, ...binding.path.split("/")), "changed\n");
  await assert.rejects(
    validateOrdinaryX86LinuxQualificationPlan(plan, root),
    /digest drifted/,
  );
});

test("rejects a substituted source role or path", async () => {
  const { root, plan } = await fixture();
  plan.sourceBindings[0].path = "docs/PROTOTYPE_SUCCESS_CRITERIA.md";
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects extra plan fields that could hide qualification state", async () => {
  const { root, plan } = await fixture();
  plan.unreviewedEvidence = {};
  await assert.rejects(
    validateOrdinaryX86LinuxQualificationPlan(plan, root),
    /fields drifted/,
  );
});

test("rejects selecting the development host inside the blocked plan", async () => {
  const { root, plan } = await fixture();
  plan.selectionPolicy.selectedReferenceId = "owned-ryzen-rtx";
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects treating Windows as native Linux qualification", async () => {
  const { root, plan } = await fixture();
  plan.selectionPolicy.windowsMayQualify = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects treating WSL2 as native Linux qualification", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.windowsOrWslEvidenceMayQualifyNativeLinux = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects substituting Steam Machine for the ordinary PC baseline", async () => {
  const { root, plan } = await fixture();
  plan.selectionPolicy.steamMachineMaySubstitute = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects an unexplained Linux image in a blocked target", async () => {
  const { root, plan } = await fixture();
  plan.targetBoundary.linuxImageSha256 = "a".repeat(64);
  await assert.rejects(
    validateOrdinaryX86LinuxQualificationPlan(plan, root),
    /blocked target cannot populate linuxImageSha256/,
  );
});

test("rejects deleting a representative workload", async () => {
  const { root, plan } = await fixture();
  plan.workloads.pop();
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects weakening the twenty-launch requirement", async () => {
  const { root, plan } = await fixture();
  plan.workloads[1].requiredLaunchTrials = 19;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects marking a phase complete without evidence", async () => {
  const { root, plan } = await fixture();
  plan.qualificationPhases[0].status = "complete";
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects importing the lower-cost 35 dBA gate into the premium plan", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.maximumOneMeterAcousticsDba = 35;
  await assert.rejects(
    validateOrdinaryX86LinuxQualificationPlan(plan, root),
    /blocked plan cannot populate maximumOneMeterAcousticsDba/,
  );
});

test("rejects capture-arrival timing as exposure-latency proof", async () => {
  const { root, plan } = await fixture();
  plan.acceptance.captureArrivalMayEstablishExposureLatency = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects granting disk mutation through the evidence artifact", async () => {
  const { root, plan } = await fixture();
  plan.authority.physicalDiskMutationAuthorized = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("rejects a fabricated passing result", async () => {
  const { root, plan } = await fixture();
  plan.result.disposition = "qualified";
  plan.result.commonPremiumComparisonEligible = true;
  await assert.rejects(validateOrdinaryX86LinuxQualificationPlan(plan, root));
});

test("requires canonical JSON bytes", async () => {
  const { root, plan } = await fixture();
  const nonCanonical = Buffer.from(JSON.stringify(plan));
  await assert.rejects(
    parseOrdinaryX86LinuxQualificationPlanBytes(nonCanonical, root),
    /canonical two-space JSON/,
  );
});

test("rejects a UTF-8 BOM", async () => {
  const { root, plan } = await fixture();
  const canonical = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]);
  await assert.rejects(parseOrdinaryX86LinuxQualificationPlanBytes(withBom, root));
});

test("rejects bare carriage returns in bound sources", async () => {
  const { root, plan } = await fixture();
  const binding = plan.sourceBindings[0];
  const bytes = Buffer.from("one\rtwo\n");
  await writeFile(join(root, ...binding.path.split("/")), bytes);
  binding.sha256 = createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(
    validateOrdinaryX86LinuxQualificationPlan(plan, root),
    /bare CR/,
  );
});
