import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_PLAN_BYTES = 4 * 1024 * 1024;
const MAX_RESULT_BYTES = 16 * 1024 * 1024;
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

export const REQUIRED_INTERFERENCE_CLASSES = Object.freeze([
  "spectator",
  "pet",
  "mirror",
  "television-person",
  "passerby",
]);

export const REQUIRED_SCENES = Object.freeze([
  "candidate",
  "joined",
  "loss-confirmation",
  "recovery-no-input",
  "recovery-explicit-original",
  "recovery-explicit-replacement",
  "post-resume-action",
]);

export const REQUIRED_PLAYER_PERSONAS = Object.freeze([
  "school-age-child-standing",
  "adult-standing",
]);

export const REQUIRED_ORACLES = Object.freeze([
  "candidate-observation",
  "joined-track",
  "control-owner",
  "takeover",
  "action-owner",
  "freeze-state",
  "privacy",
]);

const DISPOSITIONS = new Set([
  "valid-pass",
  "valid-fail",
  "harness-invalid",
  "not-run",
]);
const CONCLUSIONS = new Set(["qualified", "rejected", "incomplete"]);
const FAILURE_METRICS = [
  "falseJoins",
  "falseControls",
  "unintendedTakeovers",
  "falseActions",
];

export function parseJsonDocument(bytes, maximumBytes, name) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${name} must be a Buffer`);
  if (bytes.length === 0 || bytes.length > maximumBytes) {
    throw new Error(`${name} must contain 1 through ${maximumBytes} bytes`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `${name} is not valid UTF-8: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${name} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function validatePlayerSessionInterferencePlan(value) {
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
      "cells",
    ],
    "plan",
  );
  requireEqual(
    value.format,
    "vcg-player-session-interference-plan",
    "plan.format",
  );
  requireEqual(value.formatVersion, 1, "plan.formatVersion");
  requireId(value.campaignId, "plan.campaignId");
  requireUtcTimestamp(value.createdAt, "plan.createdAt");
  validateTarget(value.target);
  const policy = validatePolicy(value.policy);
  const cells = validateCells(value.cells, policy);
  return {
    campaignId: value.campaignId,
    repetitionsPerCell: policy.repetitionsPerCell,
    minimumValidTrialsPerCell: policy.minimumValidTrialsPerCell,
    plannedTrials: cells.length * policy.repetitionsPerCell,
    cells,
  };
}

export function validatePlayerSessionInterferenceResult(
  planBytes,
  resultValue,
) {
  const planValue = parseJsonDocument(
    planBytes,
    MAX_PLAN_BYTES,
    "plan",
  );
  const plan = validatePlayerSessionInterferencePlan(planValue);
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
  requireEqual(
    resultValue.format,
    "vcg-player-session-interference-result",
    "result.format",
  );
  requireEqual(resultValue.formatVersion, 1, "result.formatVersion");
  requireEqual(
    resultValue.campaignId,
    plan.campaignId,
    "result.campaignId",
  );
  requireSha256(resultValue.planSha256, "result.planSha256");
  requireEqual(
    resultValue.planSha256,
    sha256(planBytes),
    "result.planSha256",
  );
  requireUtcTimestamp(resultValue.startedAt, "result.startedAt");
  requireUtcTimestamp(resultValue.completedAt, "result.completedAt");
  if (Date.parse(resultValue.completedAt) < Date.parse(resultValue.startedAt)) {
    throw new Error("result.completedAt must not precede result.startedAt");
  }
  requireSha256(
    resultValue.environmentSha256,
    "result.environmentSha256",
  );
  if (!CONCLUSIONS.has(resultValue.conclusion)) {
    throw new Error(
      "result.conclusion must equal qualified, rejected, or incomplete",
    );
  }
  if (resultValue.stopReason !== null) {
    requireId(resultValue.stopReason, "result.stopReason");
  }
  if (!Array.isArray(resultValue.trials)) {
    throw new Error("result.trials must be an array");
  }
  if (resultValue.trials.length !== plan.plannedTrials) {
    throw new Error(
      "result.trials must account for every planned trial exactly once",
    );
  }

  const counts = {
    validPass: 0,
    validFail: 0,
    harnessInvalid: 0,
    notRun: 0,
  };
  const validByCell = new Map(plan.cells.map(({ cellId }) => [cellId, 0]));
  let trialIndex = 0;
  for (const cell of plan.cells) {
    for (
      let repetition = 1;
      repetition <= plan.repetitionsPerCell;
      repetition += 1
    ) {
      validateTrial(
        resultValue.trials[trialIndex],
        cell,
        repetition,
        trialIndex,
        counts,
      );
      const disposition = resultValue.trials[trialIndex].disposition;
      if (disposition === "valid-pass" || disposition === "valid-fail") {
        validByCell.set(
          cell.cellId,
          (validByCell.get(cell.cellId) ?? 0) + 1,
        );
      }
      trialIndex += 1;
    }
  }

  const insufficientCells = [...validByCell]
    .filter(([, valid]) => valid < plan.minimumValidTrialsPerCell)
    .map(([cellId]) => cellId);
  const hasNotRun = counts.notRun > 0;
  if ((hasNotRun || insufficientCells.length > 0) && resultValue.stopReason === null) {
    throw new Error(
      "result.stopReason is required when trials are not-run or a cell lacks valid trials",
    );
  }
  if (!hasNotRun && insufficientCells.length === 0 && resultValue.stopReason !== null) {
    throw new Error(
      "result.stopReason must be null when every cell has enough valid trials",
    );
  }

  const derivedConclusion =
    counts.validFail > 0
      ? "rejected"
      : hasNotRun || insufficientCells.length > 0
        ? "incomplete"
        : "qualified";
  requireEqual(
    resultValue.conclusion,
    derivedConclusion,
    "result.conclusion",
  );
  return {
    campaignId: plan.campaignId,
    planSha256: sha256(planBytes),
    plannedTrials: plan.plannedTrials,
    ...counts,
    insufficientCells,
    conclusion: derivedConclusion,
  };
}

function validateTarget(value) {
  requireRecord(value, "plan.target");
  requireExactKeys(
    value,
    [
      "platform",
      "roomSheetSha256",
      "cameraManifestSha256",
      "trackerManifestSha256",
      "softwareManifestSha256",
      "participantProtocolSha256",
      "harnessManifestSha256",
    ],
    "plan.target",
  );
  if (!["raspberry-pi-5", "x86-64-linux"].includes(value.platform)) {
    throw new Error(
      "plan.target.platform must equal raspberry-pi-5 or x86-64-linux",
    );
  }
  for (const field of [
    "roomSheetSha256",
    "cameraManifestSha256",
    "trackerManifestSha256",
    "softwareManifestSha256",
    "participantProtocolSha256",
    "harnessManifestSha256",
  ]) {
    requireSha256(value[field], `plan.target.${field}`);
  }
}

function validatePolicy(value) {
  requireRecord(value, "plan.policy");
  requireExactKeys(
    value,
    [
      "repetitionsPerCell",
      "minimumValidTrialsPerCell",
      "requiredInterferenceClasses",
      "requiredPlayerPersonas",
      "requiredScenes",
      "requiredOracles",
      "failureCeilings",
      "rawFrameRetention",
    ],
    "plan.policy",
  );
  requireInteger(
    value.repetitionsPerCell,
    10,
    100,
    "plan.policy.repetitionsPerCell",
  );
  requireInteger(
    value.minimumValidTrialsPerCell,
    10,
    value.repetitionsPerCell,
    "plan.policy.minimumValidTrialsPerCell",
  );
  requireExactStringArray(
    value.requiredInterferenceClasses,
    REQUIRED_INTERFERENCE_CLASSES,
    "plan.policy.requiredInterferenceClasses",
  );
  requireExactStringArray(
    value.requiredPlayerPersonas,
    REQUIRED_PLAYER_PERSONAS,
    "plan.policy.requiredPlayerPersonas",
  );
  requireExactStringArray(
    value.requiredScenes,
    REQUIRED_SCENES,
    "plan.policy.requiredScenes",
  );
  requireExactStringArray(
    value.requiredOracles,
    REQUIRED_ORACLES,
    "plan.policy.requiredOracles",
  );
  requireRecord(value.failureCeilings, "plan.policy.failureCeilings");
  requireExactKeys(
    value.failureCeilings,
    FAILURE_METRICS,
    "plan.policy.failureCeilings",
  );
  for (const metric of FAILURE_METRICS) {
    requireEqual(
      value.failureCeilings[metric],
      0,
      `plan.policy.failureCeilings.${metric}`,
    );
  }
  requireEqual(
    value.rawFrameRetention,
    false,
    "plan.policy.rawFrameRetention",
  );
  return {
    repetitionsPerCell: value.repetitionsPerCell,
    minimumValidTrialsPerCell: value.minimumValidTrialsPerCell,
  };
}

function validateCells(value, policy) {
  if (!Array.isArray(value)) throw new Error("plan.cells must be an array");
  const expectedLength =
    REQUIRED_INTERFERENCE_CLASSES.length *
    REQUIRED_PLAYER_PERSONAS.length *
    REQUIRED_SCENES.length;
  if (value.length !== expectedLength) {
    throw new Error(`plan.cells must contain exactly ${expectedLength} cells`);
  }
  const validated = [];
  let index = 0;
  for (const interferenceClass of REQUIRED_INTERFERENCE_CLASSES) {
    for (const playerPersona of REQUIRED_PLAYER_PERSONAS) {
      for (const scene of REQUIRED_SCENES) {
        const cell = value[index];
        const name = `plan.cells[${index}]`;
        requireRecord(cell, name);
        requireExactKeys(
          cell,
          [
            "cellId",
            "interferenceClass",
            "playerPersona",
            "scene",
            "scriptId",
            "repetitions",
            "expectedExplicitTakeovers",
            "oracleIds",
          ],
          name,
        );
        const expectedId =
          `${interferenceClass}.${playerPersona}.${scene}`;
        requireEqual(cell.cellId, expectedId, `${name}.cellId`);
        requireEqual(
          cell.interferenceClass,
          interferenceClass,
          `${name}.interferenceClass`,
        );
        requireEqual(
          cell.playerPersona,
          playerPersona,
          `${name}.playerPersona`,
        );
        requireEqual(cell.scene, scene, `${name}.scene`);
        requireId(cell.scriptId, `${name}.scriptId`);
        requireEqual(
          cell.repetitions,
          policy.repetitionsPerCell,
          `${name}.repetitions`,
        );
        requireEqual(
          cell.expectedExplicitTakeovers,
          scene === "recovery-explicit-replacement" ? 1 : 0,
          `${name}.expectedExplicitTakeovers`,
        );
        requireExactStringArray(
          cell.oracleIds,
          REQUIRED_ORACLES,
          `${name}.oracleIds`,
        );
        validated.push({
          cellId: cell.cellId,
          expectedExplicitTakeovers: cell.expectedExplicitTakeovers,
          oracleIds: [...cell.oracleIds],
        });
        index += 1;
      }
    }
  }
  return validated;
}

function validateTrial(trial, cell, repetition, index, counts) {
  const name = `result.trials[${index}]`;
  requireRecord(trial, name);
  requireExactKeys(
    trial,
    [
      "trialId",
      "cellId",
      "repetition",
      "disposition",
      "metrics",
      "oracleEvidence",
      "rawFrameRetained",
      "failureCodes",
    ],
    name,
  );
  requireEqual(
    trial.trialId,
    `${cell.cellId}.${String(repetition).padStart(2, "0")}`,
    `${name}.trialId`,
  );
  requireEqual(trial.cellId, cell.cellId, `${name}.cellId`);
  requireEqual(trial.repetition, repetition, `${name}.repetition`);
  if (!DISPOSITIONS.has(trial.disposition)) {
    throw new Error(`${name}.disposition is unsupported`);
  }
  requireRecord(trial.metrics, `${name}.metrics`);
  requireExactKeys(
    trial.metrics,
    [
      "falseCandidateObservations",
      "falseJoins",
      "falseControls",
      "unintendedTakeovers",
      "falseActions",
      "explicitTakeovers",
    ],
    `${name}.metrics`,
  );
  for (const metric of Object.keys(trial.metrics)) {
    requireInteger(
      trial.metrics[metric],
      0,
      1_000_000,
      `${name}.metrics.${metric}`,
    );
  }
  requireEqual(
    trial.rawFrameRetained,
    false,
    `${name}.rawFrameRetained`,
  );
  validateOracleEvidence(
    trial.oracleEvidence,
    cell.oracleIds,
    `${name}.oracleEvidence`,
  );
  const minimumFailureCodes =
    trial.disposition === "valid-pass" ? 0 : 1;
  requireIdArray(
    trial.failureCodes,
    `${name}.failureCodes`,
    minimumFailureCodes,
  );

  const hasAuthorityFailure = FAILURE_METRICS.some(
    (metric) => trial.metrics[metric] > 0,
  );
  const explicitTakeoverMatches =
    trial.metrics.explicitTakeovers === cell.expectedExplicitTakeovers;
  if (
    trial.disposition === "valid-pass" &&
    (hasAuthorityFailure ||
      !explicitTakeoverMatches ||
      trial.failureCodes.length > 0)
  ) {
    throw new Error(
      `${name} cannot be valid-pass with an authority failure, takeover mismatch, or failure code`,
    );
  }
  if (
    trial.disposition === "valid-fail" &&
    !hasAuthorityFailure &&
    explicitTakeoverMatches
  ) {
    throw new Error(
      `${name} valid-fail requires an authority failure or explicit-takeover mismatch`,
    );
  }
  if (
    (trial.disposition === "harness-invalid" ||
      trial.disposition === "not-run") &&
    Object.values(trial.metrics).some((value) => value !== 0)
  ) {
    throw new Error(
      `${name} ${trial.disposition} must not encode product metrics`,
    );
  }
  counts[
    {
      "valid-pass": "validPass",
      "valid-fail": "validFail",
      "harness-invalid": "harnessInvalid",
      "not-run": "notRun",
    }[trial.disposition]
  ] += 1;
}

function validateOracleEvidence(value, expectedIds, name) {
  if (!Array.isArray(value) || value.length !== expectedIds.length) {
    throw new Error(`${name} must contain every required oracle exactly once`);
  }
  for (let index = 0; index < expectedIds.length; index += 1) {
    const evidence = value[index];
    const itemName = `${name}[${index}]`;
    requireRecord(evidence, itemName);
    requireExactKeys(
      evidence,
      ["oracleId", "evidenceSha256", "bytes"],
      itemName,
    );
    requireEqual(
      evidence.oracleId,
      expectedIds[index],
      `${itemName}.oracleId`,
    );
    requireSha256(evidence.evidenceSha256, `${itemName}.evidenceSha256`);
    requireInteger(evidence.bytes, 1, 1_000_000_000, `${itemName}.bytes`);
  }
}

function requireRecord(value, name) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${name} must be a plain object`);
  }
}

function requireExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(
      `${name} must contain exactly: ${wanted.join(", ")}`,
    );
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) {
    throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
  }
}

function requireId(value, name) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    !ID_PATTERN.test(value)
  ) {
    throw new Error(`${name} must be a bounded lowercase opaque identifier`);
  }
}

function requireIdArray(value, name, minimum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > 64) {
    throw new Error(`${name} must contain ${minimum} through 64 identifiers`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    requireId(value[index], `${name}[${index}]`);
    if (seen.has(value[index])) {
      throw new Error(`${name} must not contain duplicates`);
    }
    seen.add(value[index]);
  }
}

function requireExactStringArray(value, expected, name) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    throw new Error(
      `${name} must exactly equal ${JSON.stringify(expected)}`,
    );
  }
}

function requireInteger(value, minimum, maximum, name) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256 digest`);
  }
}

function requireUtcTimestamp(value, name) {
  if (
    typeof value !== "string" ||
    !UTC_TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${name} must be a canonical UTC timestamp`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const [planArgument, resultArgument, ...rest] = process.argv.slice(2);
  if (!planArgument || rest.length > 0) {
    throw new Error(
      "usage: node scripts/validate-player-session-interference-campaign.mjs <plan.json> [result.json]",
    );
  }
  const planPath = resolve(planArgument);
  const planBytes = await readFile(planPath);
  const plan = validatePlayerSessionInterferencePlan(
    parseJsonDocument(planBytes, MAX_PLAN_BYTES, "plan"),
  );
  if (!resultArgument) {
    process.stdout.write(
      `Valid player-session interference plan ${plan.campaignId}: ${plan.cells.length} cells, ${plan.plannedTrials} trials\n`,
    );
    return;
  }
  const resultBytes = await readFile(resolve(resultArgument));
  const result = validatePlayerSessionInterferenceResult(
    planBytes,
    parseJsonDocument(resultBytes, MAX_RESULT_BYTES, "result"),
  );
  process.stdout.write(
    `Valid player-session interference result ${result.campaignId}: ${result.conclusion} (${result.validPass} pass, ${result.validFail} fail, ${result.harnessInvalid} harness-invalid, ${result.notRun} not-run)\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
