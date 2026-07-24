import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_INTERFERENCE_CLASSES,
  REQUIRED_ORACLES,
  REQUIRED_PLAYER_PERSONAS,
  REQUIRED_SCENES,
  parseJsonDocument,
  validatePlayerSessionInterferencePlan,
  validatePlayerSessionInterferenceResult,
} from "./validate-player-session-interference-campaign.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const DIGEST_E = "e".repeat(64);
const DIGEST_F = "f".repeat(64);
const DIGEST_0 = "0".repeat(64);

function makePlan() {
  const repetitionsPerCell = 12;
  return {
    format: "vcg-player-session-interference-plan",
    formatVersion: 1,
    campaignId: "living-room-session-interference-001",
    createdAt: "2026-07-24T20:00:00Z",
    target: {
      platform: "x86-64-linux",
      roomSheetSha256: DIGEST_A,
      cameraManifestSha256: DIGEST_B,
      trackerManifestSha256: DIGEST_C,
      softwareManifestSha256: DIGEST_D,
      participantProtocolSha256: DIGEST_E,
      harnessManifestSha256: DIGEST_F,
    },
    policy: {
      repetitionsPerCell,
      minimumValidTrialsPerCell: 10,
      requiredInterferenceClasses: [...REQUIRED_INTERFERENCE_CLASSES],
      requiredPlayerPersonas: [...REQUIRED_PLAYER_PERSONAS],
      requiredScenes: [...REQUIRED_SCENES],
      requiredOracles: [...REQUIRED_ORACLES],
      failureCeilings: {
        falseJoins: 0,
        falseControls: 0,
        unintendedTakeovers: 0,
        falseActions: 0,
      },
      rawFrameRetention: false,
    },
    cells: REQUIRED_INTERFERENCE_CLASSES.flatMap((interferenceClass) =>
      REQUIRED_PLAYER_PERSONAS.flatMap((playerPersona) =>
        REQUIRED_SCENES.map((scene) => ({
          cellId: `${interferenceClass}.${playerPersona}.${scene}`,
          interferenceClass,
          playerPersona,
          scene,
          scriptId: `script-${interferenceClass}-${playerPersona}-${scene}`,
          repetitions: repetitionsPerCell,
          expectedExplicitTakeovers:
            scene === "recovery-explicit-replacement" ? 1 : 0,
          oracleIds: [...REQUIRED_ORACLES],
        })),
      ),
    ),
  };
}

function encodePlan(plan) {
  return Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

function makeResult(plan, planBytes) {
  return {
    format: "vcg-player-session-interference-result",
    formatVersion: 1,
    campaignId: plan.campaignId,
    planSha256: createHash("sha256").update(planBytes).digest("hex"),
    startedAt: "2026-07-25T01:00:00Z",
    completedAt: "2026-07-25T04:00:00Z",
    environmentSha256: DIGEST_0,
    trials: plan.cells.flatMap((cell) =>
      Array.from({ length: cell.repetitions }, (_, index) => ({
        trialId: `${cell.cellId}.${String(index + 1).padStart(2, "0")}`,
        cellId: cell.cellId,
        repetition: index + 1,
        disposition: "valid-pass",
        metrics: {
          falseCandidateObservations: 1,
          falseJoins: 0,
          falseControls: 0,
          unintendedTakeovers: 0,
          falseActions: 0,
          explicitTakeovers: cell.expectedExplicitTakeovers,
        },
        oracleEvidence: REQUIRED_ORACLES.map((oracleId) => ({
          oracleId,
          evidenceSha256: DIGEST_A,
          bytes: 1024,
        })),
        rawFrameRetained: false,
        failureCodes: [],
      })),
    ),
    conclusion: "qualified",
    stopReason: null,
  };
}

test("accepts a closed 70-cell, 840-trial zero-failure campaign", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const validatedPlan = validatePlayerSessionInterferencePlan(plan);
  const validatedResult = validatePlayerSessionInterferenceResult(
    planBytes,
    makeResult(plan, planBytes),
  );

  assert.equal(validatedPlan.cells.length, 70);
  assert.equal(validatedPlan.plannedTrials, 840);
  assert.deepEqual(validatedResult, {
    campaignId: plan.campaignId,
    planSha256: createHash("sha256").update(planBytes).digest("hex"),
    plannedTrials: 840,
    validPass: 840,
    validFail: 0,
    harnessInvalid: 0,
    notRun: 0,
    insufficientCells: [],
    conclusion: "qualified",
  });
});

test("CLI validates exact plan and result files", async () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  const directory = await mkdtemp(
    join(tmpdir(), "vcg-player-session-interference-"),
  );
  const planPath = join(directory, "plan.json");
  const resultPath = join(directory, "result.json");
  try {
    await writeFile(planPath, planBytes);
    await writeFile(
      resultPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    const scriptPath = fileURLToPath(
      new URL(
        "./validate-player-session-interference-campaign.mjs",
        import.meta.url,
      ),
    );
    const completed = spawnSync(
      process.execPath,
      [scriptPath, planPath, resultPath],
      { encoding: "utf8" },
    );
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /qualified \(840 pass, 0 fail/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects invalid UTF-8 before JSON parsing", () => {
  assert.throws(
    () =>
      parseJsonDocument(
        Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]),
        1024,
        "fixture",
      ),
    /fixture is not valid UTF-8/,
  );
});

test("rejects unknown plan fields and reordered coverage cells", () => {
  const plan = makePlan();
  plan.untrusted = true;
  assert.throws(
    () => validatePlayerSessionInterferencePlan(plan),
    /plan must contain exactly/,
  );
  delete plan.untrusted;
  [plan.cells[0], plan.cells[1]] = [plan.cells[1], plan.cells[0]];
  assert.throws(
    () => validatePlayerSessionInterferencePlan(plan),
    /plan\.cells\[0\]\.cellId must equal/,
  );
});

test("requires zero authority-failure ceilings and no raw-frame retention", () => {
  const plan = makePlan();
  plan.policy.failureCeilings.falseActions = 1;
  assert.throws(
    () => validatePlayerSessionInterferencePlan(plan),
    /failureCeilings\.falseActions must equal 0/,
  );
  plan.policy.failureCeilings.falseActions = 0;
  plan.policy.rawFrameRetention = true;
  assert.throws(
    () => validatePlayerSessionInterferencePlan(plan),
    /rawFrameRetention must equal false/,
  );
});

test("binds results to exact plan bytes", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  const changedBytes = Buffer.from(`${JSON.stringify(plan)}\n`, "utf8");
  assert.throws(
    () =>
      validatePlayerSessionInterferenceResult(changedBytes, result),
    /result\.planSha256 must equal/,
  );
});

test("requires exact explicit takeover evidence only in replacement scenes", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  const replacementTrial = result.trials.find(({ cellId }) =>
    cellId.endsWith(".recovery-explicit-replacement"),
  );
  replacementTrial.metrics.explicitTakeovers = 0;
  assert.throws(
    () => validatePlayerSessionInterferenceResult(planBytes, result),
    /cannot be valid-pass.*takeover mismatch/,
  );
});

test("derives rejection from one valid false-control failure", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0].disposition = "valid-fail";
  result.trials[0].metrics.falseControls = 1;
  result.trials[0].failureCodes = ["false-control"];
  result.conclusion = "rejected";
  assert.equal(
    validatePlayerSessionInterferenceResult(planBytes, result)
      .conclusion,
    "rejected",
  );
});

test("does not allow a passing disposition to hide authority failure", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0].metrics.falseJoins = 1;
  assert.throws(
    () => validatePlayerSessionInterferenceResult(planBytes, result),
    /cannot be valid-pass/,
  );
});

test("derives incomplete when a cell lacks ten valid trials", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  for (const trial of result.trials.slice(0, 3)) {
    trial.disposition = "harness-invalid";
    trial.metrics.falseCandidateObservations = 0;
    trial.failureCodes = ["fixture-occluded"];
  }
  result.conclusion = "incomplete";
  result.stopReason = "insufficient-valid-cell";
  const validated = validatePlayerSessionInterferenceResult(
    planBytes,
    result,
  );
  assert.equal(validated.conclusion, "incomplete");
  assert.deepEqual(validated.insufficientCells, [
    "spectator.school-age-child-standing.candidate",
  ]);
});

test("requires every ordered oracle and prohibits raw-frame evidence", () => {
  const plan = makePlan();
  const planBytes = encodePlan(plan);
  const result = makeResult(plan, planBytes);
  result.trials[0].oracleEvidence.reverse();
  assert.throws(
    () => validatePlayerSessionInterferenceResult(planBytes, result),
    /oracleEvidence\[0\]\.oracleId must equal/,
  );
  result.trials[0].oracleEvidence.reverse();
  result.trials[0].rawFrameRetained = true;
  assert.throws(
    () => validatePlayerSessionInterferenceResult(planBytes, result),
    /rawFrameRetained must equal false/,
  );
});
