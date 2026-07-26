import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_PLAN_BYTES = 16 * 1024 * 1024;
const MAX_RESULT_BYTES = 32 * 1024 * 1024;
const MAX_TRIALS = 10_000;
const MAX_TEXT = 500;
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

export const REQUIRED_OPERATIONS = Object.freeze([
  "idle",
  "boot",
  "system-update",
  "package-update",
  "package-rollback",
  "retro-import",
  "save-checkpoint",
  "profile-vault",
  "log-rotation",
  "low-space",
  "filesystem-recovery",
]);

export const CORE_ORACLES = Object.freeze([
  "bootability",
  "committed-state",
  "authority-consistency",
  "trial-provenance",
]);

const ORACLE_KINDS = new Set([
  ...CORE_ORACLES,
  "filesystem-health",
  "card-health",
  "application-specific",
]);
const CUT_MODES = new Set([
  "before-boundary",
  "boundary-window",
  "after-boundary",
  "randomized-window",
]);
const ALLOWED_OUTCOMES = new Set([
  "prior-committed",
  "exact-pending-commit",
  "exact-new-committed",
  "explicit-recovery",
]);
const RESULT_OUTCOMES = new Set([...ALLOWED_OUTCOMES, "unexpected"]);
const DISPOSITIONS = new Set([
  "valid-pass",
  "valid-fail",
  "harness-invalid",
  "not-run",
]);
const ORACLE_STATUSES = new Set(["pass", "fail", "not-run"]);
const CONCLUSIONS = new Set(["qualified", "rejected", "incomplete"]);

export function parseJsonDocument(bytes, maximumBytes, name) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${name} must be a Buffer`);
  if (bytes.length === 0 || bytes.length > maximumBytes) {
    throw new Error(`${name} must contain 1 through ${maximumBytes} bytes`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${name} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return value;
}

export function validatePowerCutPlan(value) {
  requireRecord(value, "plan");
  requireExactKeys(
    value,
    [
      "format",
      "formatVersion",
      "campaignId",
      "createdAt",
      "target",
      "policy",
      "oracles",
      "trials",
    ],
    "plan",
  );
  requireEqual(value.format, "vcg-power-cut-campaign-plan", "plan.format");
  requireEqual(value.formatVersion, 1, "plan.formatVersion");
  requireId(value.campaignId, "plan.campaignId");
  requireUtcTimestamp(value.createdAt, "plan.createdAt");

  validateTarget(value.target);
  validatePolicy(value.policy);
  const oracleIds = validateOracleDefinitions(value.oracles);
  const trials = validatePlannedTrials(value.trials, value.policy, oracleIds);
  return {
    campaignId: value.campaignId,
    minimumValidTrials: value.policy.minimumValidTrials,
    oracleIds,
    trials,
  };
}

export function validatePowerCutResult(planBytes, resultValue) {
  const planValue = parseJsonDocument(planBytes, MAX_PLAN_BYTES, "plan");
  const validatedPlan = validatePowerCutPlan(planValue);

  requireRecord(resultValue, "result");
  requireExactKeys(
    resultValue,
    [
      "format",
      "formatVersion",
      "campaignId",
      "planSha256",
      "startedAt",
      "completedAt",
      "environmentSha256",
      "trials",
      "conclusion",
      "stopReason",
    ],
    "result",
  );
  requireEqual(resultValue.format, "vcg-power-cut-campaign-result", "result.format");
  requireEqual(resultValue.formatVersion, 1, "result.formatVersion");
  requireEqual(resultValue.campaignId, validatedPlan.campaignId, "result.campaignId");
  requireSha256(resultValue.planSha256, "result.planSha256");
  const actualPlanSha256 = sha256(planBytes);
  requireEqual(resultValue.planSha256, actualPlanSha256, "result.planSha256");
  requireUtcTimestamp(resultValue.startedAt, "result.startedAt");
  requireUtcTimestamp(resultValue.completedAt, "result.completedAt");
  if (Date.parse(resultValue.completedAt) < Date.parse(resultValue.startedAt)) {
    throw new Error("result.completedAt must not precede result.startedAt");
  }
  requireSha256(resultValue.environmentSha256, "result.environmentSha256");
  if (!CONCLUSIONS.has(resultValue.conclusion)) {
    throw new Error("result.conclusion must equal qualified, rejected, or incomplete");
  }
  if (resultValue.stopReason !== null) requireId(resultValue.stopReason, "result.stopReason");

  if (!Array.isArray(resultValue.trials)) throw new Error("result.trials must be an array");
  if (resultValue.trials.length !== validatedPlan.trials.length) {
    throw new Error("result.trials must account for every planned trial exactly once");
  }

  const counts = {
    validPass: 0,
    validFail: 0,
    harnessInvalid: 0,
    notRun: 0,
  };
  for (let index = 0; index < validatedPlan.trials.length; index += 1) {
    const planned = validatedPlan.trials[index];
    const observed = resultValue.trials[index];
    validateTrialResult(observed, planned, index, counts);
  }

  const hasUnrun = counts.notRun > 0;
  if (hasUnrun && resultValue.stopReason === null) {
    throw new Error("result.stopReason is required when any trial is not-run");
  }
  if (!hasUnrun && resultValue.stopReason !== null) {
    throw new Error("result.stopReason must be null when every trial ran");
  }

  let derivedConclusion = "incomplete";
  if (counts.validFail > 0) {
    derivedConclusion = "rejected";
  } else if (
    counts.validPass >= validatedPlan.minimumValidTrials &&
    counts.validPass === validatedPlan.trials.length
  ) {
    derivedConclusion = "qualified";
  }
  requireEqual(resultValue.conclusion, derivedConclusion, "result.conclusion");

  return {
    campaignId: validatedPlan.campaignId,
    planSha256: actualPlanSha256,
    plannedTrials: validatedPlan.trials.length,
    ...counts,
    conclusion: derivedConclusion,
  };
}

function validateTarget(value) {
  requireRecord(value, "plan.target");
  requireExactKeys(
    value,
    [
      "platform",
      "hardwareManifestSha256",
      "softwareManifestSha256",
      "mediaIntakeSha256",
      "harnessManifestSha256",
    ],
    "plan.target",
  );
  requireEqual(value.platform, "raspberry-pi-5", "plan.target.platform");
  for (const field of [
    "hardwareManifestSha256",
    "softwareManifestSha256",
    "mediaIntakeSha256",
    "harnessManifestSha256",
  ]) {
    requireSha256(value[field], `plan.target.${field}`);
  }
}

function validatePolicy(value) {
  requireRecord(value, "plan.policy");
  requireExactKeys(
    value,
    ["minimumValidTrials", "requiredOperations", "coreOracles"],
    "plan.policy",
  );
  requireInteger(value.minimumValidTrials, 200, MAX_TRIALS, "plan.policy.minimumValidTrials");
  requireExactStringArray(
    value.requiredOperations,
    REQUIRED_OPERATIONS,
    "plan.policy.requiredOperations",
  );
  requireExactStringArray(value.coreOracles, CORE_ORACLES, "plan.policy.coreOracles");
}

function validateOracleDefinitions(value) {
  if (!Array.isArray(value) || value.length < CORE_ORACLES.length || value.length > 64) {
    throw new Error(`plan.oracles must contain ${CORE_ORACLES.length} through 64 definitions`);
  }
  const ids = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const oracle = value[index];
    const name = `plan.oracles[${index}]`;
    requireRecord(oracle, name);
    requireExactKeys(oracle, ["id", "kind", "description"], name);
    requireId(oracle.id, `${name}.id`);
    if (seen.has(oracle.id)) throw new Error(`${name}.id must be unique`);
    seen.add(oracle.id);
    if (!ORACLE_KINDS.has(oracle.kind)) throw new Error(`${name}.kind is unsupported`);
    requireText(oracle.description, 1, MAX_TEXT, `${name}.description`);
    ids.push(oracle.id);
  }
  for (const core of CORE_ORACLES) {
    const definition = value.find((oracle) => oracle.id === core);
    if (!definition || definition.kind !== core) {
      throw new Error(`plan.oracles must define core oracle ${core} with the same kind`);
    }
  }
  return ids;
}

function validatePlannedTrials(value, policy, oracleIds) {
  if (!Array.isArray(value)) throw new Error("plan.trials must be an array");
  if (value.length < policy.minimumValidTrials || value.length > MAX_TRIALS) {
    throw new Error(
      `plan.trials must contain plan.policy.minimumValidTrials through ${MAX_TRIALS} entries`,
    );
  }
  const knownOracles = new Set(oracleIds);
  const seenIds = new Set();
  const coveredOperations = new Set();
  const validated = [];
  for (let index = 0; index < value.length; index += 1) {
    const trial = value[index];
    const name = `plan.trials[${index}]`;
    requireRecord(trial, name);
    requireExactKeys(
      trial,
      [
        "trialId",
        "sequence",
        "operation",
        "transition",
        "cut",
        "allowedOutcomes",
        "oracleIds",
      ],
      name,
    );
    requireId(trial.trialId, `${name}.trialId`);
    if (seenIds.has(trial.trialId)) throw new Error(`${name}.trialId must be unique`);
    seenIds.add(trial.trialId);
    requireEqual(trial.sequence, index + 1, `${name}.sequence`);
    if (!REQUIRED_OPERATIONS.includes(trial.operation)) {
      throw new Error(`${name}.operation is unsupported`);
    }
    coveredOperations.add(trial.operation);
    requireId(trial.transition, `${name}.transition`);
    validateCut(trial.cut, name);
    requireUniqueEnumArray(
      trial.allowedOutcomes,
      ALLOWED_OUTCOMES,
      1,
      ALLOWED_OUTCOMES.size,
      `${name}.allowedOutcomes`,
    );
    requireUniqueIdArray(trial.oracleIds, 1, 64, `${name}.oracleIds`);
    for (const oracleId of trial.oracleIds) {
      if (!knownOracles.has(oracleId)) {
        throw new Error(`${name}.oracleIds references unknown oracle ${oracleId}`);
      }
    }
    for (const core of CORE_ORACLES) {
      if (!trial.oracleIds.includes(core)) {
        throw new Error(`${name}.oracleIds must include core oracle ${core}`);
      }
    }
    validated.push({
      trialId: trial.trialId,
      sequence: trial.sequence,
      allowedOutcomes: new Set(trial.allowedOutcomes),
      oracleIds: [...trial.oracleIds],
    });
  }
  for (const operation of REQUIRED_OPERATIONS) {
    if (!coveredOperations.has(operation)) {
      throw new Error(`plan.trials must cover required operation ${operation}`);
    }
  }
  return validated;
}

function validateCut(value, trialName) {
  const name = `${trialName}.cut`;
  requireRecord(value, name);
  requireExactKeys(value, ["mode", "boundary", "offsetMs"], name);
  if (!CUT_MODES.has(value.mode)) throw new Error(`${name}.mode is unsupported`);
  requireId(value.boundary, `${name}.boundary`);
  requireInteger(value.offsetMs, -600_000, 600_000, `${name}.offsetMs`);
  if (value.mode === "boundary-window" && value.offsetMs !== 0) {
    throw new Error(`${name}.offsetMs must equal 0 for boundary-window mode`);
  }
  if (value.mode === "before-boundary" && value.offsetMs >= 0) {
    throw new Error(`${name}.offsetMs must be negative for before-boundary mode`);
  }
  if (value.mode === "after-boundary" && value.offsetMs <= 0) {
    throw new Error(`${name}.offsetMs must be positive for after-boundary mode`);
  }
}

function validateTrialResult(value, planned, index, counts) {
  const name = `result.trials[${index}]`;
  requireRecord(value, name);
  requireExactKeys(
    value,
    [
      "trialId",
      "sequence",
      "disposition",
      "actualCut",
      "outcome",
      "oracleResults",
      "failureCodes",
      "artifactDigests",
    ],
    name,
  );
  requireEqual(value.trialId, planned.trialId, `${name}.trialId`);
  requireEqual(value.sequence, planned.sequence, `${name}.sequence`);
  if (!DISPOSITIONS.has(value.disposition)) throw new Error(`${name}.disposition is unsupported`);
  if (value.actualCut !== null) validateActualCut(value.actualCut, name);
  if (value.outcome !== null && !RESULT_OUTCOMES.has(value.outcome)) {
    throw new Error(`${name}.outcome is unsupported`);
  }
  requireUniqueIdArray(value.failureCodes, 0, 64, `${name}.failureCodes`);
  validateArtifactDigests(value.artifactDigests, name);
  const oracleStatuses = validateOracleResults(value.oracleResults, planned.oracleIds, name);

  switch (value.disposition) {
    case "valid-pass":
      counts.validPass += 1;
      if (value.actualCut === null) throw new Error(`${name}.actualCut is required for valid-pass`);
      if (!planned.allowedOutcomes.has(value.outcome)) {
        throw new Error(`${name}.outcome must be one of the planned allowed outcomes`);
      }
      if (value.failureCodes.length !== 0) {
        throw new Error(`${name}.failureCodes must be empty for valid-pass`);
      }
      if (value.artifactDigests.length === 0) {
        throw new Error(`${name}.artifactDigests must not be empty for valid-pass`);
      }
      if (oracleStatuses.some((status) => status !== "pass")) {
        throw new Error(`${name}.oracleResults must all pass for valid-pass`);
      }
      break;
    case "valid-fail":
      counts.validFail += 1;
      if (value.actualCut === null) throw new Error(`${name}.actualCut is required for valid-fail`);
      if (value.outcome === null) throw new Error(`${name}.outcome is required for valid-fail`);
      if (value.failureCodes.length === 0) {
        throw new Error(`${name}.failureCodes must not be empty for valid-fail`);
      }
      if (value.artifactDigests.length === 0) {
        throw new Error(`${name}.artifactDigests must not be empty for valid-fail`);
      }
      if (!oracleStatuses.includes("fail")) {
        throw new Error(`${name}.oracleResults must include a failure for valid-fail`);
      }
      break;
    case "harness-invalid":
      counts.harnessInvalid += 1;
      if (value.outcome !== null && value.outcome !== "unexpected") {
        throw new Error(`${name}.outcome must be null or unexpected for harness-invalid`);
      }
      if (value.failureCodes.length === 0) {
        throw new Error(`${name}.failureCodes must not be empty for harness-invalid`);
      }
      if (value.artifactDigests.length === 0) {
        throw new Error(`${name}.artifactDigests must not be empty for harness-invalid`);
      }
      break;
    case "not-run":
      counts.notRun += 1;
      if (value.actualCut !== null) throw new Error(`${name}.actualCut must be null for not-run`);
      if (value.outcome !== null) throw new Error(`${name}.outcome must be null for not-run`);
      if (value.failureCodes.length === 0) {
        throw new Error(`${name}.failureCodes must not be empty for not-run`);
      }
      if (value.artifactDigests.length !== 0) {
        throw new Error(`${name}.artifactDigests must be empty for not-run`);
      }
      if (oracleStatuses.some((status) => status !== "not-run")) {
        throw new Error(`${name}.oracleResults must all be not-run for not-run`);
      }
      break;
    default:
      throw new Error(`${name}.disposition is unsupported`);
  }
}

function validateActualCut(value, trialName) {
  const name = `${trialName}.actualCut`;
  requireRecord(value, name);
  requireExactKeys(
    value,
    ["controllerMonotonicUs", "powerLossObservedMs", "restoredAfterMs"],
    name,
  );
  requireInteger(value.controllerMonotonicUs, 0, Number.MAX_SAFE_INTEGER, `${name}.controllerMonotonicUs`);
  requireInteger(value.powerLossObservedMs, 0, 60_000, `${name}.powerLossObservedMs`);
  requireInteger(value.restoredAfterMs, 0, 3_600_000, `${name}.restoredAfterMs`);
}

function validateOracleResults(value, plannedOracleIds, trialName) {
  const name = `${trialName}.oracleResults`;
  if (!Array.isArray(value) || value.length !== plannedOracleIds.length) {
    throw new Error(`${name} must account for every planned oracle exactly once`);
  }
  const statuses = [];
  for (let index = 0; index < value.length; index += 1) {
    const oracle = value[index];
    const itemName = `${name}[${index}]`;
    requireRecord(oracle, itemName);
    requireExactKeys(oracle, ["oracleId", "status", "evidenceSha256"], itemName);
    requireEqual(oracle.oracleId, plannedOracleIds[index], `${itemName}.oracleId`);
    if (!ORACLE_STATUSES.has(oracle.status)) throw new Error(`${itemName}.status is unsupported`);
    if (oracle.status === "not-run") {
      if (oracle.evidenceSha256 !== null) {
        throw new Error(`${itemName}.evidenceSha256 must be null when status is not-run`);
      }
    } else {
      requireSha256(oracle.evidenceSha256, `${itemName}.evidenceSha256`);
    }
    statuses.push(oracle.status);
  }
  return statuses;
}

function validateArtifactDigests(value, trialName) {
  const name = `${trialName}.artifactDigests`;
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error(`${name} must contain 0 through 64 entries`);
  }
  const kinds = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const artifact = value[index];
    const itemName = `${name}[${index}]`;
    requireRecord(artifact, itemName);
    requireExactKeys(artifact, ["kind", "sha256", "bytes"], itemName);
    requireId(artifact.kind, `${itemName}.kind`);
    if (kinds.has(artifact.kind)) throw new Error(`${itemName}.kind must be unique`);
    kinds.add(artifact.kind);
    requireSha256(artifact.sha256, `${itemName}.sha256`);
    requireInteger(artifact.bytes, 1, Number.MAX_SAFE_INTEGER, `${itemName}.bytes`);
  }
}

function requireRecord(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${name} must contain exactly: ${wanted.join(", ")}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
}

function requireText(value, minimum, maximum, name) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new Error(`${name} must contain ${minimum} through ${maximum} characters`);
  }
}

function requireId(value, name) {
  requireText(value, 1, 100, name);
  if (!ID_PATTERN.test(value)) throw new Error(`${name} must use the closed lowercase identifier grammar`);
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${name} must be canonical lowercase SHA-256`);
  }
}

function requireUtcTimestamp(value, name) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a valid UTC timestamp ending in Z`);
  }
}

function requireInteger(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a safe integer from ${minimum} through ${maximum}`);
  }
}

function requireExactStringArray(value, expected, name) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    throw new Error(`${name} must equal the canonical ordered list`);
  }
}

function requireUniqueIdArray(value, minimum, maximum, name) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${name} must contain ${minimum} through ${maximum} identifiers`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    requireId(value[index], `${name}[${index}]`);
    if (seen.has(value[index])) throw new Error(`${name}[${index}] must be unique`);
    seen.add(value[index]);
  }
}

function requireUniqueEnumArray(value, allowed, minimum, maximum, name) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${name} must contain ${minimum} through ${maximum} values`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!allowed.has(value[index])) throw new Error(`${name}[${index}] is unsupported`);
    if (seen.has(value[index])) throw new Error(`${name}[${index}] must be unique`);
    seen.add(value[index]);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const [planArgument, resultArgument, ...extra] = process.argv.slice(2);
  if (!planArgument || !resultArgument || extra.length !== 0) {
    throw new Error(
      "usage: node scripts/validate-power-cut-campaign.mjs <plan.json> <result.json>",
    );
  }
  const planPath = resolve(planArgument);
  const resultPath = resolve(resultArgument);
  const planBytes = await readFile(planPath);
  const resultBytes = await readFile(resultPath);
  const plan = parseJsonDocument(planBytes, MAX_PLAN_BYTES, "plan");
  const result = parseJsonDocument(resultBytes, MAX_RESULT_BYTES, "result");
  validatePowerCutPlan(plan);
  const summary = validatePowerCutResult(planBytes, result);
  console.log(
    `${resultPath}: ${summary.conclusion} (${summary.validPass} pass, ${summary.validFail} fail, ${summary.harnessInvalid} harness-invalid, ${summary.notRun} not-run; plan ${summary.planSha256})`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
