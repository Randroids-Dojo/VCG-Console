import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPLETE_SYSTEM_ECONOMICS_BLOCKERS,
  COMPLETE_SYSTEM_ECONOMICS_CANDIDATES,
  COMPLETE_SYSTEM_ECONOMICS_METRICS,
  COMPLETE_SYSTEM_ECONOMICS_PHASES,
  COMPLETE_SYSTEM_ECONOMICS_WORKLOADS,
  readCompleteSystemEconomicsPlan,
  validateCompleteSystemEconomicsPlan,
} from "./validate-complete-system-economics-plan.mjs";

const tracked = await readCompleteSystemEconomicsPlan();

function clone() {
  return structuredClone(tracked);
}

async function rejects(mutator, pattern) {
  const candidate = clone();
  mutator(candidate);
  await assert.rejects(
    validateCompleteSystemEconomicsPlan(candidate),
    pattern,
  );
}

test("tracked complete-system economics plan is a strict zero-result matrix", async () => {
  const plan = await validateCompleteSystemEconomicsPlan(clone());
  assert.equal(plan.candidates.length, COMPLETE_SYSTEM_ECONOMICS_CANDIDATES.length);
  assert.equal(plan.workloads.length, COMPLETE_SYSTEM_ECONOMICS_WORKLOADS.length);
  assert.equal(plan.operationalMatrix.lifecyclePhaseCount, COMPLETE_SYSTEM_ECONOMICS_PHASES.length);
  assert.equal(plan.measurements.requiredMetricIds.length, COMPLETE_SYSTEM_ECONOMICS_METRICS.length);
  assert.equal(plan.executionGate.blockerCodes.length, COMPLETE_SYSTEM_ECONOMICS_BLOCKERS.length);
  assert.equal(plan.operationalMatrix.cellCount, 5 * 7 * 3);
  assert.equal(plan.operationalMatrix.requiredCycleCount, 5 * 7 * 3 * 20);
  assert.equal(plan.result.status, null);
});

test("closed schema rejects unknown policy fields", async () => {
  await rejects((plan) => {
    plan.selectionWinner = "custom-amd-mini-pc";
  }, /fields drifted/u);
});

test("exact five-candidate identity and order cannot drift", async () => {
  await rejects((plan) => {
    plan.candidates[1].candidateId = "cheap-mini-pc";
  }, /strictly deep-equal/u);
});

test("Steam Machine cannot silently become the premium reference", async () => {
  await rejects((plan) => {
    plan.comparisonContract.defaultPremiumReferenceId = "optional-steam-machine";
  }, /strictly deep-equal/u);
});

test("the lower-cost ceiling applies only to the Pi reference", async () => {
  await rejects((plan) => {
    plan.candidates[0].lowerCostCeilingApplies = true;
  }, /strictly deep-equal/u);
});

test("blocked candidates cannot acquire quotes, manifests, or results", async () => {
  await rejects((plan) => {
    plan.candidates[2].deliveredQuoteSha256 = "a".repeat(64);
  }, /blocked candidate cannot bind deliveredQuoteSha256/u);
});

test("component, MSRP, or subtotal prices cannot become delivered totals", async () => {
  await rejects((plan) => {
    plan.economicProtocol.baseMsrpSubtotalOrComponentPriceMayProveDeliveredTotal =
      true;
  }, /strictly deep-equal/u);
});

test("owned hardware availability cannot be represented as free economics", async () => {
  await rejects((plan) => {
    plan.comparisonContract.ownedHardwareAvailabilityMaySetEconomicCostToZero =
      true;
  }, /strictly deep-equal/u);
});

test("all 105 cells and 2100 cycles remain mandatory and visible", async () => {
  await rejects((plan) => {
    plan.operationalMatrix.requiredCycleCount = 700;
  }, /strictly deep-equal/u);
});

test("D-110 exposure-to-action p95 cannot be weakened", async () => {
  await rejects((plan) => {
    plan.fixedAcceptance.maximumExposureToActionP95Ms = 121;
  }, /strictly deep-equal/u);
});

test("D-118 accountless core cannot gain a Steam dependency", async () => {
  await rejects((plan) => {
    plan.fixedAcceptance.maximumSteamAccountDependenciesForCoreLocalOperation =
      1;
  }, /strictly deep-equal/u);
});

test("advertised TOPS cannot rank or rescue a candidate", async () => {
  await rejects((plan) => {
    plan.comparisonContract.advertisedTopsMayRankSelectOrRescueCandidate = true;
  }, /strictly deep-equal/u);
});

test("open economic and performance gates cannot be filled in silently", async () => {
  await rejects((plan) => {
    plan.openAcceptance.evaluationHorizonMonths = 60;
  }, /blocked plan cannot fix evaluationHorizonMonths/u);
});

test("operation and purchase authority remain false", async () => {
  await rejects((plan) => {
    plan.authorityBoundary.candidatePurchaseReturnBuildOrInstallationAuthorized =
      true;
  }, /must remain false/u);
});

test("blocked execution cannot bind a quote set", async () => {
  await rejects((plan) => {
    plan.executionGate.quoteSetSha256 = "b".repeat(64);
  }, /blocked gate cannot bind quoteSetSha256/u);
});

test("a recommendation or tier mutation cannot appear before evidence", async () => {
  await rejects((plan) => {
    plan.result.rankedRecommendation = ["owned-x86-linux"];
  }, /strictly deep-equal/u);
});

test("source bindings reject digest drift", async () => {
  await rejects((plan) => {
    plan.sourceBindings[0].sha256 = "0".repeat(64);
  }, /digest drifted/u);
});

test("one candidate cannot rescue another candidate", async () => {
  await rejects((plan) => {
    plan.candidates[4].mayQualifyOrRescueAnotherCandidate = true;
  }, /must remain false/u);
});
