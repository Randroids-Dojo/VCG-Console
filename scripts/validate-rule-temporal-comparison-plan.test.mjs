import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRuleTemporalComparisonPlan,
  validateTrackedRuleTemporalComparisonPlan,
} from "./validate-rule-temporal-comparison-plan.mjs";

async function fixture() {
  return structuredClone(await validateTrackedRuleTemporalComparisonPlan());
}

test("accepts the pinned three-candidate comparison plan", async () => {
  const plan = await fixture();
  assert.equal(plan.candidates.length, 3);
  assert.equal(plan.labels.length, 11);
  assert.equal(validateRuleTemporalComparisonPlan(plan), plan);
});

test("rejects raw-frame retention", async () => {
  const plan = await fixture();
  plan.dataset.rawFramesRetainedByDefault = true;
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /rawFramesRetainedByDefault/,
  );
});

test("rejects mutable or substituted upstream releases", async () => {
  const plan = await fixture();
  plan.upstream.release = "main";
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /upstream.release/,
  );
});

test("rejects upstream checkpoint accuracy as VCG evidence", async () => {
  const plan = await fixture();
  plan.candidates[1].checkpointPolicy =
    "use upstream top-1 as VCG accuracy";
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /candidates\[1\]/,
  );
});

test("rejects participant leakage across splits", async () => {
  const plan = await fixture();
  plan.dataset.splitUnit = "random clips";
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /dataset.splitUnit/,
  );
});

test("rejects unseeded single-run temporal evaluation", async () => {
  const plan = await fixture();
  plan.training.seeds = [];
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /training.seeds/,
  );
});

test("rejects omission of the negative class", async () => {
  const plan = await fixture();
  plan.labels.pop();
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /plan.labels/,
  );
});

test("keeps collection and selection gates explicitly unset", async () => {
  const plan = await fixture();
  plan.dataset.minimumParticipantsPerBlockingClass = 1;
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /minimumParticipantsPerBlockingClass/,
  );
  const second = await fixture();
  second.evaluation.perLabelMetricGates = {};
  assert.throws(
    () => validateRuleTemporalComparisonPlan(second),
    /perLabelMetricGates/,
  );
});

test("rejects aggregate-only candidate selection", async () => {
  const plan = await fixture();
  plan.evaluation.selectionPolicy = "pick highest aggregate accuracy";
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /aggregate-only selection/,
  );
});

test("rejects undeclared plan fields", async () => {
  const plan = await fixture();
  plan.selectedCandidate = "mmaction2-stgcn-joint-2d";
  assert.throws(
    () => validateRuleTemporalComparisonPlan(plan),
    /plan keys must be exactly/,
  );
});
