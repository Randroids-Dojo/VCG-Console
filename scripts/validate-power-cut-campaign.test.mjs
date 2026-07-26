import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CORE_ORACLES,
  REQUIRED_OPERATIONS,
  parseJsonDocument,
  validatePowerCutPlan,
  validatePowerCutResult,
} from "./validate-power-cut-campaign.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const DIGEST_E = "e".repeat(64);

function makePlan(trialCount = 200) {
  const trials = Array.from({ length: trialCount }, (_, index) => {
    const sequence = index + 1;
    const operation = REQUIRED_OPERATIONS[index % REQUIRED_OPERATIONS.length];
    return {
      trialId: `trial-${String(sequence).padStart(4, "0")}`,
      sequence,
      operation,
      transition: `${operation}.phase-${String(sequence).padStart(4, "0")}`,
      cut: {
        mode: "boundary-window",
        boundary: `${operation}.commit-boundary`,
        offsetMs: 0,
      },
      allowedOutcomes: [
        "prior-committed",
        "exact-pending-commit",
        "exact-new-committed",
        "explicit-recovery",
      ],
      oracleIds: [...CORE_ORACLES],
    };
  });
  return {
    format: "vcg-power-cut-campaign-plan",
    formatVersion: 1,
    campaignId: "pi5-sd-power-cut-001",
    createdAt: "2026-07-24T18:00:00Z",
    target: {
      platform: "raspberry-pi-5",
      hardwareManifestSha256: DIGEST_A,
      softwareManifestSha256: DIGEST_B,
      mediaIntakeSha256: DIGEST_C,
      harnessManifestSha256: DIGEST_D,
    },
    policy: {
      minimumValidTrials: 200,
      requiredOperations: [...REQUIRED_OPERATIONS],
      coreOracles: [...CORE_ORACLES],
    },
    oracles: CORE_ORACLES.map((id) => ({
      id,
      kind: id,
      description: `Authoritative ${id} oracle for the frozen campaign.`,
    })),
    trials,
  };
}

function encodePlan(plan) {
  return Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

function makeResult(plan, planBytes) {
  return {
    format: "vcg-power-cut-campaign-result",
    formatVersion: 1,
    campaignId: plan.campaignId,
    planSha256: createHash("sha256").update(planBytes).digest("hex"),
    startedAt: "2026-07-24T19:00:00Z",
    completedAt: "2026-07-25T19:00:00Z",
    environmentSha256: DIGEST_E,
    trials: plan.trials.map((trial) => ({
      trialId: trial.trialId,
      sequence: trial.sequence,
      disposition: "valid-pass",
      actualCut: {
        controllerMonotonicUs: trial.sequence * 1_000_000,
        powerLossObservedMs: 4,
        restoredAfterMs: 2_000,
      },
      outcome: "prior-committed",
      oracleResults: trial.oracleIds.map((oracleId) => ({
        oracleId,
        status: "pass",
        evidenceSha256: DIGEST_A,
      })),
      failureCodes: [],
      artifactDigests: [
        {
          kind: "trial-summary",
          sha256: DIGEST_B,
          bytes: 1_024,
        },
      ],
    })),
    conclusion: "qualified",
    stopReason: null,
  };
}

test("accepts a complete 200-trial zero-failure campaign", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  assert.equal(validatePowerCutPlan(plan).trials.length, 200);
  assert.deepEqual(validatePowerCutResult(planBytes, result), {
    campaignId: "pi5-sd-power-cut-001",
    planSha256: result.planSha256,
    plannedTrials: 200,
    validPass: 200,
    validFail: 0,
    harnessInvalid: 0,
    notRun: 0,
    conclusion: "qualified",
  });
});

test("CLI validates exact plan and result files", async () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  const directory = await mkdtemp(join(tmpdir(), "vcg-power-cut-"));
  const planPath = join(directory, "plan.json");
  const resultPath = join(directory, "result.json");
  try {
    await writeFile(planPath, planBytes);
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    const scriptPath = fileURLToPath(
      new URL("./validate-power-cut-campaign.mjs", import.meta.url),
    );
    const completed = spawnSync(
      process.execPath,
      [scriptPath, planPath, resultPath],
      { encoding: "utf8" },
    );
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /qualified \(200 pass, 0 fail/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a plan with fewer than hundreds of valid trials", () => {
  const plan = makePlan(199);
  assert.throws(
    () => validatePowerCutPlan(plan),
    /plan\.trials must contain plan\.policy\.minimumValidTrials/,
  );
});

test("rejects invalid UTF-8 before JSON parsing", () => {
  assert.throws(
    () => parseJsonDocument(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]), 1024, "fixture"),
    /fixture is not valid UTF-8/,
  );
});

test("rejects a plan that omits an I-202 operation class", () => {
  const plan = makePlan();
  for (const trial of plan.trials) trial.operation = "idle";
  assert.throws(
    () => validatePowerCutPlan(plan),
    /must cover required operation boot/,
  );
});

test("rejects open plan fields and noncanonical cut semantics", () => {
  const plan = makePlan();
  plan.untrusted = true;
  assert.throws(() => validatePowerCutPlan(plan), /plan must contain exactly/);
  delete plan.untrusted;
  plan.trials[0].cut = {
    mode: "before-boundary",
    boundary: "idle.commit-boundary",
    offsetMs: 1,
  };
  assert.throws(
    () => validatePowerCutPlan(plan),
    /offsetMs must be negative/,
  );
});

test("binds results to the exact plan bytes", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  const changedBytes = Buffer.from(`${JSON.stringify(plan)}\n`, "utf8");
  assert.throws(
    () => validatePowerCutResult(changedBytes, result),
    /result\.planSha256 must equal/,
  );
});

test("requires one ordered result for every scheduled trial", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials.pop();
  assert.throws(
    () => validatePowerCutResult(planBytes, result),
    /account for every planned trial exactly once/,
  );
});

test("does not permit a passing disposition with a failed oracle", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0].oracleResults[1].status = "fail";
  assert.throws(
    () => validatePowerCutResult(planBytes, result),
    /oracleResults must all pass for valid-pass/,
  );
});

test("derives rejection from one valid product failure", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0] = {
    ...result.trials[0],
    disposition: "valid-fail",
    outcome: "unexpected",
    oracleResults: result.trials[0].oracleResults.map((oracle, index) => ({
      ...oracle,
      status: index === 1 ? "fail" : oracle.status,
    })),
    failureCodes: ["committed-state-corruption"],
  };
  result.conclusion = "rejected";
  assert.equal(
    validatePowerCutResult(planBytes, result).conclusion,
    "rejected",
  );
});

test("does not permit a ledger to understate a valid product failure", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0] = {
    ...result.trials[0],
    disposition: "valid-fail",
    outcome: "unexpected",
    oracleResults: result.trials[0].oracleResults.map((oracle, index) => ({
      ...oracle,
      status: index === 1 ? "fail" : oracle.status,
    })),
    failureCodes: ["committed-state-corruption"],
  };
  result.conclusion = "incomplete";
  assert.throws(
    () => validatePowerCutResult(planBytes, result),
    /result\.conclusion must equal "rejected"/,
  );
});

test("classifies harness-invalid and stopped trials as incomplete", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0] = {
    ...result.trials[0],
    disposition: "harness-invalid",
    outcome: null,
    oracleResults: result.trials[0].oracleResults.map((oracle) => ({
      ...oracle,
      status: "not-run",
      evidenceSha256: null,
    })),
    failureCodes: ["fixture-trigger-missed"],
  };
  result.trials[1] = {
    ...result.trials[1],
    disposition: "not-run",
    actualCut: null,
    outcome: null,
    oracleResults: result.trials[1].oracleResults.map((oracle) => ({
      ...oracle,
      status: "not-run",
      evidenceSha256: null,
    })),
    failureCodes: ["campaign-stopped"],
    artifactDigests: [],
  };
  result.conclusion = "incomplete";
  result.stopReason = "fixture-requalification-required";
  const summary = validatePowerCutResult(planBytes, result);
  assert.equal(summary.harnessInvalid, 1);
  assert.equal(summary.notRun, 1);
  assert.equal(summary.conclusion, "incomplete");
});
