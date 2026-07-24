import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const actionNames = [
  "player_join",
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_select",
  "menu_back",
  "pause",
];
const actionSet = new Set(actionNames);
const negativeEventNames = new Set([...actionNames, "home", "resume", "exit"]);
const requiredPrivilegedActions = ["menu_back", "pause", "home", "resume", "exit"];
const identifierPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

export async function validateLatencyPlan(plan, root = repositoryRoot) {
  requireRecord(plan, "plan");
  requireExactKeys(
    plan,
    [
      "format",
      "formatVersion",
      "campaignId",
      "createdAt",
      "motionApiVersion",
      "motionBenchmark",
      "configuration",
      "timestampAuthority",
      "cells",
      "trials",
      "negativeWindows",
      "acceptance",
      "rawDataPolicy",
    ],
    "plan",
  );
  requireEqual(plan.format, "vcg-camera-action-latency-plan", "plan.format");
  requireEqual(plan.formatVersion, 1, "plan.formatVersion");
  requireIdentifier(plan.campaignId, "plan.campaignId");
  requireIsoDate(plan.createdAt, "plan.createdAt");
  requireEqual(plan.motionApiVersion, "0.3.0", "plan.motionApiVersion");

  await validateMotionBenchmarkBinding(plan.motionBenchmark, root);
  validateConfiguration(plan.configuration);
  validateTimestampAuthority(plan.timestampAuthority);
  validateAcceptance(plan.acceptance);
  validateRawDataPolicy(plan.rawDataPolicy);

  if (!Array.isArray(plan.cells) || plan.cells.length < 1 || plan.cells.length > 64) {
    throw new Error("plan.cells must contain 1 through 64 qualification cells");
  }
  const cells = new Map();
  for (const [index, cell] of plan.cells.entries()) {
    const name = `plan.cells[${index}]`;
    requireRecord(cell, name);
    requireExactKeys(cell, ["id", "personaClass", "placementId", "workloadId"], name);
    requireIdentifier(cell.id, `${name}.id`);
    if (
      !["school-age-child-standing", "adult-standing", "exploratory"].includes(
        cell.personaClass,
      )
    ) {
      throw new Error(`${name}.personaClass is unsupported`);
    }
    requireIdentifier(cell.placementId, `${name}.placementId`);
    requireIdentifier(cell.workloadId, `${name}.workloadId`);
    if (cells.has(cell.id)) throw new Error(`${name}.id is duplicated`);
    cells.set(cell.id, cell);
  }

  const expectedTrialKeys = new Set();
  const seenTrialIds = new Set();
  if (
    !Array.isArray(plan.trials) ||
    plan.trials.length !== cells.size * actionNames.length * plan.acceptance.minTrialsPerAction
  ) {
    throw new Error(
      "plan.trials must contain exactly minTrialsPerAction entries for every action in every cell",
    );
  }
  for (const [index, trial] of plan.trials.entries()) {
    const name = `plan.trials[${index}]`;
    requireRecord(trial, name);
    requireExactKeys(trial, ["id", "cellId", "action", "repetition"], name);
    requireIdentifier(trial.id, `${name}.id`);
    requireIdentifier(trial.cellId, `${name}.cellId`);
    if (!cells.has(trial.cellId)) throw new Error(`${name}.cellId is unknown`);
    requireAction(trial.action, `${name}.action`);
    requireInteger(
      trial.repetition,
      1,
      plan.acceptance.minTrialsPerAction,
      `${name}.repetition`,
    );
    if (seenTrialIds.has(trial.id)) throw new Error(`${name}.id is duplicated`);
    seenTrialIds.add(trial.id);
    const key = `${trial.cellId}:${trial.action}:${trial.repetition}`;
    if (expectedTrialKeys.has(key)) throw new Error(`${name} duplicates ${key}`);
    expectedTrialKeys.add(key);
  }
  for (const cellId of cells.keys()) {
    for (const action of actionNames) {
      for (let repetition = 1; repetition <= plan.acceptance.minTrialsPerAction; repetition += 1) {
        const key = `${cellId}:${action}:${repetition}`;
        if (!expectedTrialKeys.has(key)) throw new Error(`plan.trials is missing ${key}`);
      }
    }
  }

  if (!Array.isArray(plan.negativeWindows) || plan.negativeWindows.length < cells.size) {
    throw new Error("plan.negativeWindows must cover every qualification cell");
  }
  const negativeIds = new Set();
  const durationByCell = new Map([...cells.keys()].map((id) => [id, 0]));
  for (const [index, window] of plan.negativeWindows.entries()) {
    const name = `plan.negativeWindows[${index}]`;
    requireRecord(window, name);
    requireExactKeys(window, ["id", "cellId", "durationMs"], name);
    requireIdentifier(window.id, `${name}.id`);
    requireIdentifier(window.cellId, `${name}.cellId`);
    if (!cells.has(window.cellId)) throw new Error(`${name}.cellId is unknown`);
    requireInteger(window.durationMs, 1_000, 7_200_000, `${name}.durationMs`);
    if (negativeIds.has(window.id)) throw new Error(`${name}.id is duplicated`);
    negativeIds.add(window.id);
    durationByCell.set(window.cellId, durationByCell.get(window.cellId) + window.durationMs);
  }
  for (const [cellId, durationMs] of durationByCell) {
    if (durationMs < plan.acceptance.minNegativeDurationMsPerCell) {
      throw new Error(
        `negative windows for ${cellId} total ${durationMs} ms; expected at least ${plan.acceptance.minNegativeDurationMsPerCell}`,
      );
    }
  }

  return plan;
}

export async function validateLatencyResult(result, plan, planBytes, root = repositoryRoot) {
  await validateLatencyPlan(plan, root);
  requireRecord(result, "result");
  requireExactKeys(
    result,
    [
      "format",
      "formatVersion",
      "campaignId",
      "createdAt",
      "planPath",
      "planSha256",
      "configurationId",
      "timestampProof",
      "cellEvidence",
      "attempts",
      "negativeWindows",
      "independentVisibleResponse",
    ],
    "result",
  );
  requireEqual(result.format, "vcg-camera-action-latency-result", "result.format");
  requireEqual(result.formatVersion, 1, "result.formatVersion");
  requireEqual(result.campaignId, plan.campaignId, "result.campaignId");
  requireIsoDate(result.createdAt, "result.createdAt");
  if (Date.parse(result.createdAt) < Date.parse(plan.createdAt)) {
    throw new Error("result.createdAt cannot precede plan.createdAt");
  }
  requireRepositoryPath(result.planPath, "result.planPath");
  requireSha256(result.planSha256, "result.planSha256");
  const actualPlanSha256 = createHash("sha256").update(planBytes).digest("hex");
  requireEqual(result.planSha256, actualPlanSha256, "result.planSha256");
  requireEqual(result.configurationId, plan.configuration.id, "result.configurationId");
  validateTimestampProof(result.timestampProof, plan.timestampAuthority);
  validateCellEvidence(result.cellEvidence, plan.cells);

  const plannedTrials = new Map(plan.trials.map((trial) => [trial.id, trial]));
  if (!Array.isArray(result.attempts) || result.attempts.length !== plannedTrials.size) {
    throw new Error("result.attempts must contain exactly one entry for every planned trial");
  }
  const attempts = new Map();
  for (const [index, attempt] of result.attempts.entries()) {
    const name = `result.attempts[${index}]`;
    requireRecord(attempt, name);
    requireExactKeys(
      attempt,
      [
        "id",
        "status",
        "invalidReason",
        "exposureTimestampNs",
        "timestampUncertaintyUs",
        "droppedFrames",
        "events",
      ],
      name,
    );
    requireIdentifier(attempt.id, `${name}.id`);
    if (!plannedTrials.has(attempt.id)) throw new Error(`${name}.id is not planned`);
    if (attempts.has(attempt.id)) throw new Error(`${name}.id is duplicated`);
    attempts.set(attempt.id, attempt);
    if (!["completed", "invalid"].includes(attempt.status)) {
      throw new Error(`${name}.status must equal completed or invalid`);
    }
    requireInteger(attempt.droppedFrames, 0, 1_000_000, `${name}.droppedFrames`);
    if (!Array.isArray(attempt.events) || attempt.events.length > 1_000) {
      throw new Error(`${name}.events must be a bounded array`);
    }
    if (attempt.status === "invalid") {
      requireString(attempt.invalidReason, `${name}.invalidReason`);
      for (const field of ["exposureTimestampNs", "timestampUncertaintyUs"]) {
        requireEqual(attempt[field], null, `${name}.${field}`);
      }
      if (attempt.events.length !== 0) throw new Error(`${name}.events must be empty when invalid`);
      continue;
    }
    requireEqual(attempt.invalidReason, null, `${name}.invalidReason`);
    requireInteger(
      attempt.exposureTimestampNs,
      0,
      Number.MAX_SAFE_INTEGER,
      `${name}.exposureTimestampNs`,
    );
    requireInteger(
      attempt.timestampUncertaintyUs,
      0,
      plan.timestampAuthority.maxPerAttemptUncertaintyUs,
      `${name}.timestampUncertaintyUs`,
    );
    let previousTimestamp = -1;
    for (const [eventIndex, event] of attempt.events.entries()) {
      const eventName = `${name}.events[${eventIndex}]`;
      requireRecord(event, eventName);
      requireExactKeys(event, ["action", "phase", "gameReceiptTimestampNs"], eventName);
      requireAction(event.action, `${eventName}.action`);
      requireEqual(event.phase, "triggered", `${eventName}.phase`);
      requireInteger(
        event.gameReceiptTimestampNs,
        attempt.exposureTimestampNs,
        Number.MAX_SAFE_INTEGER,
        `${eventName}.gameReceiptTimestampNs`,
      );
      if (event.gameReceiptTimestampNs < previousTimestamp) {
        throw new Error(`${name}.events must be ordered by receipt timestamp`);
      }
      previousTimestamp = event.gameReceiptTimestampNs;
    }
  }

  const plannedNegativeWindows = new Map(plan.negativeWindows.map((window) => [window.id, window]));
  if (
    !Array.isArray(result.negativeWindows) ||
    result.negativeWindows.length !== plannedNegativeWindows.size
  ) {
    throw new Error(
      "result.negativeWindows must contain exactly one entry for every planned negative window",
    );
  }
  const negativeResults = new Map();
  for (const [index, window] of result.negativeWindows.entries()) {
    const name = `result.negativeWindows[${index}]`;
    requireRecord(window, name);
    requireExactKeys(
      window,
      [
        "id",
        "completed",
        "startTimestampNs",
        "endTimestampNs",
        "droppedFrames",
        "events",
      ],
      name,
    );
    requireIdentifier(window.id, `${name}.id`);
    const plannedWindow = plannedNegativeWindows.get(window.id);
    if (!plannedWindow) throw new Error(`${name}.id is not planned`);
    if (negativeResults.has(window.id)) throw new Error(`${name}.id is duplicated`);
    negativeResults.set(window.id, window);
    requireBoolean(window.completed, `${name}.completed`);
    requireInteger(
      window.startTimestampNs,
      0,
      Number.MAX_SAFE_INTEGER,
      `${name}.startTimestampNs`,
    );
    requireInteger(
      window.endTimestampNs,
      window.startTimestampNs,
      Number.MAX_SAFE_INTEGER,
      `${name}.endTimestampNs`,
    );
    if (
      window.completed &&
      window.endTimestampNs - window.startTimestampNs < plannedWindow.durationMs * 1_000_000
    ) {
      throw new Error(`${name} is shorter than its planned duration`);
    }
    requireInteger(window.droppedFrames, 0, 10_000_000, `${name}.droppedFrames`);
    if (!Array.isArray(window.events) || window.events.length > 10_000) {
      throw new Error(`${name}.events must be a bounded array`);
    }
    let previousTimestamp = -1;
    for (const [eventIndex, event] of window.events.entries()) {
      const eventName = `${name}.events[${eventIndex}]`;
      requireRecord(event, eventName);
      requireExactKeys(event, ["name", "receiptTimestampNs"], eventName);
      if (!negativeEventNames.has(event.name)) throw new Error(`${eventName}.name is unsupported`);
      requireInteger(
        event.receiptTimestampNs,
        window.startTimestampNs,
        window.endTimestampNs,
        `${eventName}.receiptTimestampNs`,
      );
      if (event.receiptTimestampNs < previousTimestamp) {
        throw new Error(`${name}.events must be ordered by receipt timestamp`);
      }
      previousTimestamp = event.receiptTimestampNs;
    }
  }

  validateIndependentVisibleResponse(
    result.independentVisibleResponse,
    plan.timestampAuthority.independentVisibleResponse,
  );
  return scoreLatencyResult(result, plan);
}

export function scoreLatencyResult(result, plan) {
  const plannedTrials = new Map(plan.trials.map((trial) => [trial.id, trial]));
  const cellScores = new Map(
    plan.cells.map((cell) => [
      cell.id,
      new Map(
        actionNames.map((action) => [
          action,
          { action, truePositives: 0, falsePositives: 0, falseNegatives: 0, latenciesMs: [] },
        ]),
      ),
    ]),
  );
  let incomplete = false;
  let totalDroppedFrames = 0;

  for (const attempt of result.attempts) {
    const trial = plannedTrials.get(attempt.id);
    totalDroppedFrames += attempt.droppedFrames;
    if (attempt.status === "invalid") {
      incomplete = true;
      continue;
    }
    const scores = cellScores.get(trial.cellId);
    const matching = attempt.events.filter((event) => event.action === trial.action);
    if (matching.length === 0) {
      scores.get(trial.action).falseNegatives += 1;
    } else {
      const expectedScore = scores.get(trial.action);
      expectedScore.truePositives += 1;
      expectedScore.falsePositives += matching.length - 1;
      const latencyMs =
        (matching[0].gameReceiptTimestampNs - attempt.exposureTimestampNs) / 1_000_000 +
        attempt.timestampUncertaintyUs / 1_000;
      expectedScore.latenciesMs.push(latencyMs);
    }
    for (const event of attempt.events) {
      if (event.action !== trial.action) scores.get(event.action).falsePositives += 1;
    }
  }

  const privilegedFalseActivations = [];
  for (const resultWindow of result.negativeWindows) {
    const plannedWindow = plan.negativeWindows.find((window) => window.id === resultWindow.id);
    totalDroppedFrames += resultWindow.droppedFrames;
    if (!resultWindow.completed) incomplete = true;
    const scores = cellScores.get(plannedWindow.cellId);
    for (const event of resultWindow.events) {
      if (actionSet.has(event.name)) scores.get(event.name).falsePositives += 1;
      if (plan.acceptance.privilegedActions.includes(event.name)) {
        privilegedFalseActivations.push({
          windowId: resultWindow.id,
          name: event.name,
          receiptTimestampNs: event.receiptTimestampNs,
        });
      }
    }
  }

  const cells = [];
  let gatesPass = privilegedFalseActivations.length === 0;
  for (const cell of plan.cells) {
    const actions = [];
    for (const action of actionNames) {
      const raw = cellScores.get(cell.id).get(action);
      const precisionDenominator = raw.truePositives + raw.falsePositives;
      const recallDenominator = raw.truePositives + raw.falseNegatives;
      const precision =
        precisionDenominator === 0 ? null : raw.truePositives / precisionDenominator;
      const recall = recallDenominator === 0 ? null : raw.truePositives / recallDenominator;
      const latency = {
        p50: percentile(raw.latenciesMs, 0.5),
        p95: percentile(raw.latenciesMs, 0.95),
        p99: percentile(raw.latenciesMs, 0.99),
        worst: raw.latenciesMs.length === 0 ? null : Math.max(...raw.latenciesMs),
      };
      const pass =
        precision !== null &&
        precision >= plan.acceptance.minPrecision &&
        recall !== null &&
        recall >= plan.acceptance.minRecall &&
        latency.p95 !== null &&
        latency.p95 <= plan.acceptance.maxP95LatencyMs;
      if (!pass) gatesPass = false;
      actions.push({
        action,
        truePositives: raw.truePositives,
        falsePositives: raw.falsePositives,
        falseNegatives: raw.falseNegatives,
        precision,
        recall,
        latencyMs: latency,
        pass,
      });
    }
    cells.push({ id: cell.id, actions });
  }

  const visible = result.independentVisibleResponse;
  if (plan.timestampAuthority.independentVisibleResponse.required) {
    if (visible.status === "not-run") incomplete = true;
    if (visible.status === "fail") gatesPass = false;
  }

  return {
    status: incomplete ? "incomplete" : gatesPass ? "qualified-cells" : "rejected",
    totalDroppedFrames,
    privilegedFalseActivations,
    cells,
  };
}

async function validateMotionBenchmarkBinding(binding, root) {
  requireRecord(binding, "plan.motionBenchmark");
  requireExactKeys(
    binding,
    ["protocolId", "repositoryPath", "sha256"],
    "plan.motionBenchmark",
  );
  requireEqual(
    binding.protocolId,
    "household-one-player-v1",
    "plan.motionBenchmark.protocolId",
  );
  requireRepositoryPath(binding.repositoryPath, "plan.motionBenchmark.repositoryPath");
  requireSha256(binding.sha256, "plan.motionBenchmark.sha256");
  const bytes = await readRepositoryFile(root, binding.repositoryPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  requireEqual(digest, binding.sha256, "plan.motionBenchmark.sha256");
  const benchmark = parseJson(bytes, binding.repositoryPath);
  requireEqual(benchmark.format, "vcg-motion-benchmark-plan", "motion benchmark format");
  requireEqual(benchmark.protocolId, binding.protocolId, "motion benchmark protocolId");
}

function validateConfiguration(configuration) {
  requireRecord(configuration, "plan.configuration");
  requireExactKeys(
    configuration,
    [
      "id",
      "targetSha256",
      "cameraSha256",
      "pipelineSha256",
      "workloadSha256",
      "roomSha256",
      "placementSha256",
      "personaProtocolSha256",
    ],
    "plan.configuration",
  );
  requireIdentifier(configuration.id, "plan.configuration.id");
  for (const field of [
    "targetSha256",
    "cameraSha256",
    "pipelineSha256",
    "workloadSha256",
    "roomSha256",
    "placementSha256",
    "personaProtocolSha256",
  ]) {
    requireSha256(configuration[field], `plan.configuration.${field}`);
  }
}

function validateTimestampAuthority(authority) {
  requireRecord(authority, "plan.timestampAuthority");
  requireExactKeys(
    authority,
    [
      "exposureSource",
      "exposureClock",
      "gameReceiptClock",
      "clockMappingMethod",
      "clockMappingProofSha256",
      "exposureProofSha256",
      "maxPerAttemptUncertaintyUs",
      "independentVisibleResponse",
    ],
    "plan.timestampAuthority",
  );
  if (
    ![
      "hardware-exposure-start",
      "hardware-exposure-midpoint",
      "validated-driver-exposure",
    ].includes(authority.exposureSource)
  ) {
    throw new Error("plan.timestampAuthority.exposureSource is not exposure-authoritative");
  }
  requireIdentifier(authority.exposureClock, "plan.timestampAuthority.exposureClock");
  requireIdentifier(authority.gameReceiptClock, "plan.timestampAuthority.gameReceiptClock");
  if (!["shared-clock", "affine-calibration"].includes(authority.clockMappingMethod)) {
    throw new Error("plan.timestampAuthority.clockMappingMethod is unsupported");
  }
  if (
    authority.clockMappingMethod === "shared-clock" &&
    authority.exposureClock !== authority.gameReceiptClock
  ) {
    throw new Error("shared-clock requires identical exposure and receipt clocks");
  }
  requireSha256(
    authority.clockMappingProofSha256,
    "plan.timestampAuthority.clockMappingProofSha256",
  );
  requireSha256(authority.exposureProofSha256, "plan.timestampAuthority.exposureProofSha256");
  requireInteger(
    authority.maxPerAttemptUncertaintyUs,
    0,
    119_999,
    "plan.timestampAuthority.maxPerAttemptUncertaintyUs",
  );
  validateIndependentVisibleResponsePlan(authority.independentVisibleResponse);
}

function validateIndependentVisibleResponsePlan(value) {
  requireRecord(value, "plan.timestampAuthority.independentVisibleResponse");
  requireExactKeys(
    value,
    ["required", "minimumFramesPerSecond", "reasonIfNotRequired"],
    "plan.timestampAuthority.independentVisibleResponse",
  );
  requireBoolean(value.required, "independentVisibleResponse.required");
  if (value.required) {
    requireInteger(
      value.minimumFramesPerSecond,
      240,
      100_000,
      "independentVisibleResponse.minimumFramesPerSecond",
    );
    requireEqual(value.reasonIfNotRequired, null, "independentVisibleResponse.reasonIfNotRequired");
  } else {
    requireEqual(
      value.minimumFramesPerSecond,
      null,
      "independentVisibleResponse.minimumFramesPerSecond",
    );
    requireString(
      value.reasonIfNotRequired,
      "independentVisibleResponse.reasonIfNotRequired",
    );
  }
}

function validateTimestampProof(proof, authority) {
  requireRecord(proof, "result.timestampProof");
  requireExactKeys(
    proof,
    [
      "exposureSource",
      "exposureClock",
      "gameReceiptClock",
      "clockMappingMethod",
      "clockMappingProofSha256",
      "exposureProofSha256",
    ],
    "result.timestampProof",
  );
  for (const field of [
    "exposureSource",
    "exposureClock",
    "gameReceiptClock",
    "clockMappingMethod",
    "clockMappingProofSha256",
    "exposureProofSha256",
  ]) {
    requireEqual(proof[field], authority[field], `result.timestampProof.${field}`);
  }
}

function validateCellEvidence(evidence, cells) {
  if (!Array.isArray(evidence) || evidence.length !== cells.length) {
    throw new Error("result.cellEvidence must contain exactly one entry per qualification cell");
  }
  const plannedCellIds = new Set(cells.map((cell) => cell.id));
  const seen = new Set();
  for (const [index, entry] of evidence.entries()) {
    const name = `result.cellEvidence[${index}]`;
    requireRecord(entry, name);
    requireExactKeys(
      entry,
      [
        "cellId",
        "skeletonTraceSha256",
        "groundTruthSha256",
        "workloadTraceSha256",
        "systemTraceSha256",
      ],
      name,
    );
    requireIdentifier(entry.cellId, `${name}.cellId`);
    if (!plannedCellIds.has(entry.cellId)) throw new Error(`${name}.cellId is not planned`);
    if (seen.has(entry.cellId)) throw new Error(`${name}.cellId is duplicated`);
    seen.add(entry.cellId);
    for (const field of [
      "skeletonTraceSha256",
      "groundTruthSha256",
      "workloadTraceSha256",
      "systemTraceSha256",
    ]) {
      requireSha256(entry[field], `${name}.${field}`);
    }
  }
}

function validateIndependentVisibleResponse(result, planned) {
  requireRecord(result, "result.independentVisibleResponse");
  requireExactKeys(
    result,
    ["status", "evidenceSha256", "observedFramesPerSecond", "sampleCount"],
    "result.independentVisibleResponse",
  );
  if (!["pass", "fail", "not-run"].includes(result.status)) {
    throw new Error("result.independentVisibleResponse.status is unsupported");
  }
  if (result.status === "not-run") {
    requireEqual(result.evidenceSha256, null, "independentVisibleResponse.evidenceSha256");
    requireEqual(
      result.observedFramesPerSecond,
      null,
      "independentVisibleResponse.observedFramesPerSecond",
    );
    requireEqual(result.sampleCount, 0, "independentVisibleResponse.sampleCount");
    return;
  }
  requireSha256(result.evidenceSha256, "independentVisibleResponse.evidenceSha256");
  requireInteger(
    result.observedFramesPerSecond,
    1,
    100_000,
    "independentVisibleResponse.observedFramesPerSecond",
  );
  requireInteger(result.sampleCount, 1, 100_000, "independentVisibleResponse.sampleCount");
  if (
    planned.required &&
    result.observedFramesPerSecond < planned.minimumFramesPerSecond
  ) {
    throw new Error("independent visible-response evidence is below the planned frame rate");
  }
}

function validateAcceptance(acceptance) {
  requireRecord(acceptance, "plan.acceptance");
  requireExactKeys(
    acceptance,
    [
      "maxP95LatencyMs",
      "minPrecision",
      "minRecall",
      "minTrialsPerAction",
      "minNegativeDurationMsPerCell",
      "privilegedActions",
    ],
    "plan.acceptance",
  );
  requireEqual(acceptance.maxP95LatencyMs, 120, "plan.acceptance.maxP95LatencyMs");
  requireEqual(acceptance.minPrecision, 0.95, "plan.acceptance.minPrecision");
  requireEqual(acceptance.minRecall, 0.9, "plan.acceptance.minRecall");
  requireEqual(acceptance.minTrialsPerAction, 20, "plan.acceptance.minTrialsPerAction");
  requireEqual(
    acceptance.minNegativeDurationMsPerCell,
    900_000,
    "plan.acceptance.minNegativeDurationMsPerCell",
  );
  if (
    !Array.isArray(acceptance.privilegedActions) ||
    acceptance.privilegedActions.length !== requiredPrivilegedActions.length ||
    acceptance.privilegedActions.some(
      (value, index) => value !== requiredPrivilegedActions[index],
    )
  ) {
    throw new Error(
      `plan.acceptance.privilegedActions must equal ${requiredPrivilegedActions.join(", ")}`,
    );
  }
}

function validateRawDataPolicy(policy) {
  requireRecord(policy, "plan.rawDataPolicy");
  requireExactKeys(
    policy,
    ["containsRawFrames", "rawVideoDefault", "traceKind"],
    "plan.rawDataPolicy",
  );
  requireEqual(policy.containsRawFrames, false, "plan.rawDataPolicy.containsRawFrames");
  requireEqual(policy.rawVideoDefault, false, "plan.rawDataPolicy.rawVideoDefault");
  requireEqual(policy.traceKind, "skeleton-and-events-only", "plan.rawDataPolicy.traceKind");
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * probability) - 1];
}

async function readRepositoryFile(root, repositoryPath) {
  const absolutePath = resolve(root, ...repositoryPath.split("/"));
  const rootRelative = relative(root, absolutePath);
  if (
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative)
  ) {
    throw new Error(`${repositoryPath} escapes the repository`);
  }
  return readFile(absolutePath);
}

function requireRepositoryPath(value, name) {
  requireString(value, name);
  if (
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${name} must be a normalized repository-relative POSIX path`);
  }
}

function requireAction(value, name) {
  if (!actionSet.has(value)) throw new Error(`${name} is not a Motion 0.3.0 action`);
}

function requireIdentifier(value, name) {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    throw new Error(`${name} must be a bounded lowercase identifier`);
  }
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function parseJson(bytes, name) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${name} must contain JSON`);
  }
}

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${name} must contain exactly: ${expected.join(", ")}`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be non-empty text`);
  }
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean`);
}

function requireInteger(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
}

function requireIsoDate(value, name) {
  requireString(value, name);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be ISO date text`);
}

async function validatePath(path) {
  const bytes = await readFile(path);
  const value = parseJson(bytes, path);
  if (value.format === "vcg-camera-action-latency-plan") {
    await validateLatencyPlan(value);
    return { kind: "plan", value };
  }
  if (value.format === "vcg-camera-action-latency-result") {
    requireRepositoryPath(value.planPath, "result.planPath");
    const planBytes = await readRepositoryFile(repositoryRoot, value.planPath);
    const plan = parseJson(planBytes, value.planPath);
    const score = await validateLatencyResult(value, plan, planBytes);
    return { kind: "result", value, score };
  }
  throw new Error("unrecognized camera-to-action latency format");
}

async function runCli() {
  const requested = process.argv.slice(2);
  if (requested.length === 0) {
    throw new Error(
      "usage: node scripts/validate-camera-action-latency-campaign.mjs <plan-or-result.json> [...]",
    );
  }
  let failures = 0;
  for (const requestedPath of requested) {
    const path = resolve(requestedPath);
    try {
      const validated = await validatePath(path);
      if (validated.kind === "plan") {
        console.log(
          `${relative(repositoryRoot, path)}: valid plan (${validated.value.cells.length} cells, ${validated.value.trials.length} trials)`,
        );
      } else {
        console.log(
          `${relative(repositoryRoot, path)}: valid result (${validated.score.status}, ${validated.score.totalDroppedFrames} dropped frames)`,
        );
      }
    } catch (error) {
      failures += 1;
      console.error(
        `${relative(repositoryRoot, path)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await runCli();
}
