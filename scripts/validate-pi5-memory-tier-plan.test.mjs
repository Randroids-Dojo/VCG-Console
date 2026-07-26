import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePi5MemoryTierPlanBytes, validatePi5MemoryTierPlan } from "./validate-pi5-memory-tier-plan.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedBytes = await readFile(resolve(root, "benchmarks/pi5-memory-pressure/pi5-memory-tier-plan-v1.json"));
const tracked = await parsePi5MemoryTierPlanBytes(trackedBytes);
const clone = () => structuredClone(tracked);

test("accepts the tracked blocked 40-required-cell memory plan", () => {
  assert.equal(tracked.tiers.filter((tier) => tier.required).length * tracked.workloadIds.length * tracked.phases.length, 40);
  assert.equal(tracked.result.disposition, "not-run");
});

test("rejects source substitution and invented common target evidence", async () => {
  const source = clone(); source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validatePi5MemoryTierPlan(source), /digest drifted/u);
  for (const mutate of [
    (plan) => { plan.commonTargetBoundary.boardFamily = "Raspberry Pi 4"; },
    (plan) => { plan.commonTargetBoundary.operatingSystemImageSha256 = "a".repeat(64); },
    (plan) => { plan.commonTargetBoundary.swapAndZramPolicySha256 = "b".repeat(64); },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("preserves D-042 tier order, eligibility, and optional isolation", async () => {
  for (const mutate of [
    (plan) => { plan.tiers.reverse(); },
    (plan) => { plan.tiers[0].required = false; },
    (plan) => { plan.tiers[1].executionOrder = 1; },
    (plan) => { plan.tiers[2].eligibleForMinimumRecommendation = true; },
    (plan) => { plan.selectionPolicy.fourGbRequiresStablePassingEightGbBaseline = false; },
    (plan) => { plan.selectionPolicy.twoGbRequiresSupersedingDecisionForProductEligibility = false; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("rejects workload, phase, and duration weakening", async () => {
  for (const mutate of [
    (plan) => { plan.workloadIds.pop(); },
    (plan) => { plan.workloadIds.reverse(); },
    (plan) => { plan.phases.pop(); },
    (plan) => { plan.phases[2].requiredEvidence.pop(); },
    (plan) => { plan.runProtocol.measuredSecondsPerWorkload = 3599; },
    (plan) => { plan.runProtocol.sameArtifactsAndConfigurationAcrossTiers = false; },
    (plan) => { plan.runProtocol.productFailuresMayBeReplaced = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("rejects weakened fixed gates, aggregate rescue, and synthetic-only qualification", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.maximumExposureToActionP95Ms = 121; },
    (plan) => { plan.acceptance.maximumUnexpectedOomKillsDuringRepresentativeRun = 1; },
    (plan) => { plan.acceptance.maximumOneMeterAcousticsDba = 36; },
    (plan) => { plan.acceptance.everyRequiredTierWorkloadPhaseMustPass = false; },
    (plan) => { plan.acceptance.aggregateMayRescueFailedCell = true; },
    (plan) => { plan.acceptance.optionalTwoGbMayRescueRequiredTier = true; },
    (plan) => { plan.acceptance.syntheticPressureAloneMayQualifyTier = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("rejects post-result thresholds, selection, and cost invention", async () => {
  for (const mutate of [
    (plan) => { plan.acceptance.minimumAvailableMemoryHeadroomBytes = 1; },
    (plan) => { plan.acceptance.maximumSwapBytes = 0; },
    (plan) => { plan.tiers[1].sameDateDeliveredCostCents = 10000; },
    (plan) => { plan.selectionPolicy.recommendedTierId = "pi5-4gb-minimum-candidate"; },
    (plan) => { plan.selectionPolicy.automaticSelectionAllowed = true; },
    (plan) => { plan.result.disposition = "qualified"; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("rejects hidden authority and sensitive swap or trace retention", async () => {
  for (const mutate of [
    (plan) => { plan.executionGate.hardwareAccessAuthorized = true; },
    (plan) => { plan.executionGate.pressureOrOomInjectionAuthorized = true; },
    (plan) => { plan.dataPolicy.rawFrameRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.skeletonTraceRetentionAuthorized = true; },
    (plan) => { plan.dataPolicy.swapOrDumpMayContainVaultPlaintext = true; },
    (plan) => { plan.dataPolicy.credentialsTokensOrHostedBodiesRetained = true; },
  ]) { const plan = clone(); mutate(plan); await assert.rejects(validatePi5MemoryTierPlan(plan)); }
});

test("rejects blockers, undeclared fields, noncanonical and malformed bytes", async () => {
  const blockers = clone(); blockers.executionGate.blockerCodes.reverse();
  await assert.rejects(validatePi5MemoryTierPlan(blockers));
  const extra = clone(); extra.minimum = "4GB";
  await assert.rejects(validatePi5MemoryTierPlan(extra), /fields drifted/u);
  await assert.rejects(parsePi5MemoryTierPlanBytes(Buffer.from(JSON.stringify(tracked))), /canonical/u);
  const duplicate = Buffer.from(`${JSON.stringify(tracked, null, 2).replace('  "status": "blocked",', '  "status": "blocked",\n  "status": "blocked",')}\n`);
  await assert.rejects(parsePi5MemoryTierPlanBytes(duplicate), /canonical/u);
  await assert.rejects(parsePi5MemoryTierPlanBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes])));
  await assert.rejects(parsePi5MemoryTierPlanBytes(Buffer.from([0xc3, 0x28])), /UTF-8/u);
  await assert.rejects(parsePi5MemoryTierPlanBytes(Buffer.alloc(96 * 1024 + 1)));
});
