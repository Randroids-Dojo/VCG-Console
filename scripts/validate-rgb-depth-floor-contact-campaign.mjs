import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  RGB_DEPTH_CAMERA_POSITIONS,
  RGB_DEPTH_CAMPAIGN_FORMAT,
  RGB_DEPTH_CAMPAIGN_FORMAT_VERSION,
  RGB_DEPTH_CAMPAIGN_ID,
  RGB_DEPTH_MOVEMENT_BLOCKS,
  RGB_DEPTH_PERSONA_CLASSES,
  RGB_DEPTH_STRATEGIES,
} from "./generate-rgb-depth-floor-contact-plan.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pinnedPlanPath =
  "benchmarks/floor-contact/rgb-depth-floor-contact-plan-v1.json";
const eventTypes = RGB_DEPTH_MOVEMENT_BLOCKS.flatMap(
  ({ eventTypes: values }) => values,
);
const invalidReasons = [
  "participant-stop",
  "unsafe-zone",
  "instruction-error",
  "reference-fault",
  "synchronization-fault",
  "rgb-capture-fault",
  "depth-capture-fault",
  "tracker-fault",
  "label-ambiguity",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalJsonSha256(value) {
  return sha256(Buffer.from(JSON.stringify(value), "utf8"));
}

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys must be exactly ${expected.join(", ")}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) {
    throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
  }
}

function requireText(value, name, maximum = 1_024) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maximum
  ) {
    throw new Error(`${name} must be bounded non-empty text`);
  }
}

function requireIsoDate(value, name) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be an ISO date-time`);
  }
}

function requireInteger(value, minimum, maximum, name) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
}

function requireNumber(value, minimum, maximum, name) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${name} must be a finite number between ${minimum} and ${maximum}`,
    );
  }
}

function requireSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be lowercase SHA-256 text`);
  }
}

function requireStringArray(value, expected, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  requireEqual(JSON.stringify(value), JSON.stringify(expected), name);
}

function expectedCellId(personaClass, cameraPosition, movement) {
  return `${personaClass}--${cameraPosition}--${movement}`;
}

function expectedCells() {
  return RGB_DEPTH_PERSONA_CLASSES.flatMap((personaClass) =>
    RGB_DEPTH_CAMERA_POSITIONS.flatMap((cameraPosition) =>
      RGB_DEPTH_MOVEMENT_BLOCKS.map(({ movement, eventTypes: events }) => ({
        cellId: expectedCellId(personaClass, cameraPosition, movement),
        personaClass,
        cameraPosition,
        movement,
        eventTypes: events,
        scheduledAttempts: 20,
      })),
    ),
  );
}

function validatePlanPrivacy(privacy) {
  requireRecord(privacy, "privacy");
  requireExactKeys(
    privacy,
    [
      "rawFramesRetainedByDefault",
      "participantIdentityPolicy",
      "permittedPersistentArtifacts",
      "prohibitedPersistentArtifacts",
    ],
    "privacy",
  );
  requireEqual(
    privacy.rawFramesRetainedByDefault,
    false,
    "privacy.rawFramesRetainedByDefault",
  );
  requireEqual(
    privacy.participantIdentityPolicy,
    "opaque session-local participant IDs; no name, portrait, face embedding, or durable body identity",
    "privacy.participantIdentityPolicy",
  );
  requireStringArray(
    privacy.permittedPersistentArtifacts,
    [
      "bounded skeleton-only trace",
      "bounded depth-derived event labels",
      "bounded contact-reference event labels",
      "configuration manifest",
      "aggregate metrics",
    ],
    "privacy.permittedPersistentArtifacts",
  );
  requireStringArray(
    privacy.prohibitedPersistentArtifacts,
    [
      "rgb image",
      "depth image",
      "video",
      "audio",
      "face embedding",
      "profile portrait",
    ],
    "privacy.prohibitedPersistentArtifacts",
  );
}

function validatePlanConfiguration(configuration) {
  requireRecord(configuration, "configuration");
  requireExactKeys(
    configuration,
    [
      "motionApiSchemaVersion",
      "rgbStrategies",
      "reference",
      "timestamps",
      "devicesRequiredAtExecution",
    ],
    "configuration",
  );
  requireEqual(
    configuration.motionApiSchemaVersion,
    "0.4.0",
    "configuration.motionApiSchemaVersion",
  );
  requireStringArray(
    configuration.rgbStrategies,
    RGB_DEPTH_STRATEGIES,
    "configuration.rgbStrategies",
  );
  requireRecord(configuration.reference, "configuration.reference");
  requireExactKeys(
    configuration.reference,
    ["floorPlane", "footContact", "depthAloneQualifiesContactTruth"],
    "configuration.reference",
  );
  requireEqual(
    configuration.reference.floorPlane,
    "depth-calibrated-floor-plane",
    "configuration.reference.floorPlane",
  );
  requireEqual(
    configuration.reference.footContact,
    "synchronized-independent-contact-reference",
    "configuration.reference.footContact",
  );
  requireEqual(
    configuration.reference.depthAloneQualifiesContactTruth,
    false,
    "configuration.reference.depthAloneQualifiesContactTruth",
  );
  requireRecord(configuration.timestamps, "configuration.timestamps");
  requireExactKeys(
    configuration.timestamps,
    [
      "requiredClock",
      "rgbTimestamp",
      "depthTimestamp",
      "contactTimestamp",
      "maximumSynchronizationErrorMs",
      "maximumReferenceUncertaintyMs",
    ],
    "configuration.timestamps",
  );
  requireEqual(
    configuration.timestamps.requiredClock,
    "single-monotonic-clock-or-measured-affine-mapping",
    "configuration.timestamps.requiredClock",
  );
  for (const field of [
    "rgbTimestamp",
    "depthTimestamp",
    "contactTimestamp",
  ]) {
    requireText(configuration.timestamps[field], `configuration.timestamps.${field}`);
  }
  if (!configuration.timestamps.rgbTimestamp.includes("capture-arrival time alone is invalid")) {
    throw new Error("configuration.timestamps.rgbTimestamp must reject arrival-only timing");
  }
  requireEqual(
    configuration.timestamps.maximumSynchronizationErrorMs,
    5,
    "configuration.timestamps.maximumSynchronizationErrorMs",
  );
  requireEqual(
    configuration.timestamps.maximumReferenceUncertaintyMs,
    8,
    "configuration.timestamps.maximumReferenceUncertaintyMs",
  );
  if (
    !Array.isArray(configuration.devicesRequiredAtExecution) ||
    configuration.devicesRequiredAtExecution.length !== 4
  ) {
    throw new Error(
      "configuration.devicesRequiredAtExecution must contain four requirements",
    );
  }
  configuration.devicesRequiredAtExecution.forEach((value, index) =>
    requireText(value, `configuration.devicesRequiredAtExecution[${index}]`),
  );
}

function validatePlanMatrix(matrix) {
  requireRecord(matrix, "matrix");
  requireExactKeys(
    matrix,
    [
      "personaClasses",
      "cameraPositions",
      "movementBlocks",
      "attemptsPerCell",
      "negativeWindowSecondsPerPersonaPosition",
      "cells",
      "scheduledMovementAttempts",
      "scheduledNegativeWindows",
    ],
    "matrix",
  );
  requireStringArray(
    matrix.personaClasses,
    RGB_DEPTH_PERSONA_CLASSES,
    "matrix.personaClasses",
  );
  requireStringArray(
    matrix.cameraPositions,
    RGB_DEPTH_CAMERA_POSITIONS,
    "matrix.cameraPositions",
  );
  requireEqual(
    JSON.stringify(matrix.movementBlocks),
    JSON.stringify(RGB_DEPTH_MOVEMENT_BLOCKS),
    "matrix.movementBlocks",
  );
  requireEqual(matrix.attemptsPerCell, 20, "matrix.attemptsPerCell");
  requireEqual(
    matrix.negativeWindowSecondsPerPersonaPosition,
    60,
    "matrix.negativeWindowSecondsPerPersonaPosition",
  );
  requireEqual(
    JSON.stringify(matrix.cells),
    JSON.stringify(expectedCells()),
    "matrix.cells",
  );
  requireEqual(
    matrix.scheduledMovementAttempts,
    600,
    "matrix.scheduledMovementAttempts",
  );
  requireEqual(
    matrix.scheduledNegativeWindows,
    10,
    "matrix.scheduledNegativeWindows",
  );
}

function validatePlanScoring(scoring) {
  requireRecord(scoring, "scoring");
  requireExactKeys(
    scoring,
    [
      "eventMatching",
      "matchWindowMs",
      "signedErrorDefinition",
      "distributionMethod",
      "requiredDistributionFields",
      "requiredCountFields",
      "requiredRates",
      "invalidAttemptPolicy",
      "selectionPolicy",
      "eventTimingGateMs",
      "actionLatencyGateMs",
    ],
    "scoring",
  );
  requireText(scoring.eventMatching, "scoring.eventMatching");
  requireEqual(scoring.matchWindowMs, 250, "scoring.matchWindowMs");
  requireEqual(
    scoring.signedErrorDefinition,
    "prediction timestamp minus reference timestamp in milliseconds",
    "scoring.signedErrorDefinition",
  );
  requireEqual(
    scoring.distributionMethod,
    "nearest-rank",
    "scoring.distributionMethod",
  );
  requireStringArray(
    scoring.requiredDistributionFields,
    [
      "count",
      "mean",
      "p50",
      "p95",
      "p99",
      "minimum",
      "maximum",
      "worstAbsolute",
    ],
    "scoring.requiredDistributionFields",
  );
  requireStringArray(
    scoring.requiredCountFields,
    ["reference", "predicted", "matched", "missed", "spurious"],
    "scoring.requiredCountFields",
  );
  requireStringArray(
    scoring.requiredRates,
    ["precision", "recall"],
    "scoring.requiredRates",
  );
  requireText(scoring.invalidAttemptPolicy, "scoring.invalidAttemptPolicy");
  requireText(scoring.selectionPolicy, "scoring.selectionPolicy");
  requireEqual(scoring.eventTimingGateMs, null, "scoring.eventTimingGateMs");
  requireEqual(scoring.actionLatencyGateMs, 120, "scoring.actionLatencyGateMs");
}

export function validateRgbDepthFloorContactPlan(plan) {
  requireRecord(plan, "plan");
  requireExactKeys(
    plan,
    [
      "format",
      "formatVersion",
      "documentType",
      "campaignId",
      "generatedAt",
      "sourceCommit",
      "workingTreeClean",
      "claimBoundary",
      "privacy",
      "configuration",
      "matrix",
      "scoring",
      "executionRequirements",
    ],
    "plan",
  );
  requireEqual(plan.format, RGB_DEPTH_CAMPAIGN_FORMAT, "plan.format");
  requireEqual(
    plan.formatVersion,
    RGB_DEPTH_CAMPAIGN_FORMAT_VERSION,
    "plan.formatVersion",
  );
  requireEqual(plan.documentType, "plan", "plan.documentType");
  requireEqual(plan.campaignId, RGB_DEPTH_CAMPAIGN_ID, "plan.campaignId");
  requireIsoDate(plan.generatedAt, "plan.generatedAt");
  if (
    typeof plan.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(plan.sourceCommit)
  ) {
    throw new Error("plan.sourceCommit must be a lowercase Git commit");
  }
  if (typeof plan.workingTreeClean !== "boolean") {
    throw new Error("plan.workingTreeClean must be boolean");
  }
  requireText(plan.claimBoundary, "plan.claimBoundary", 2_048);
  for (const phrase of [
    "Pre-registered physical campaign only",
    "No RGB strategy",
    "contact reference",
    "participant",
    "target platform",
  ]) {
    if (!plan.claimBoundary.includes(phrase)) {
      throw new Error(`plan.claimBoundary must address ${phrase}`);
    }
  }
  validatePlanPrivacy(plan.privacy);
  validatePlanConfiguration(plan.configuration);
  validatePlanMatrix(plan.matrix);
  validatePlanScoring(plan.scoring);
  if (
    !Array.isArray(plan.executionRequirements) ||
    plan.executionRequirements.length !== 12
  ) {
    throw new Error("plan.executionRequirements must contain twelve entries");
  }
  plan.executionRequirements.forEach((value, index) =>
    requireText(value, `plan.executionRequirements[${index}]`),
  );
  return plan;
}

function validateDevice(value, name) {
  requireRecord(value, name);
  requireExactKeys(value, ["identity", "configurationSha256"], name);
  requireText(value.identity, `${name}.identity`, 512);
  requireSha256(value.configurationSha256, `${name}.configurationSha256`);
}

function validateDistribution(value, matched, name, matchWindowMs) {
  requireRecord(value, name);
  requireExactKeys(
    value,
    [
      "count",
      "mean",
      "p50",
      "p95",
      "p99",
      "minimum",
      "maximum",
      "worstAbsolute",
    ],
    name,
  );
  requireEqual(value.count, matched, `${name}.count`);
  const fields = [
    "mean",
    "p50",
    "p95",
    "p99",
    "minimum",
    "maximum",
    "worstAbsolute",
  ];
  if (matched === 0) {
    fields.forEach((field) =>
      requireEqual(value[field], null, `${name}.${field}`),
    );
    return;
  }
  fields.forEach((field) =>
    requireNumber(
      value[field],
      field === "worstAbsolute" ? 0 : -matchWindowMs,
      matchWindowMs,
      `${name}.${field}`,
    ),
  );
  if (
    !(
      value.minimum <= value.p50 &&
      value.p50 <= value.p95 &&
      value.p95 <= value.p99 &&
      value.p99 <= value.maximum &&
      value.mean >= value.minimum &&
      value.mean <= value.maximum
    )
  ) {
    throw new Error(`${name} signed distribution must be monotonic`);
  }
  requireEqual(
    value.worstAbsolute,
    Math.max(Math.abs(value.minimum), Math.abs(value.maximum)),
    `${name}.worstAbsolute`,
  );
}

function roundedRate(numerator, denominator) {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

function validateEventMetric(
  metric,
  expectedEvent,
  validAttempts,
  name,
  matchWindowMs,
) {
  requireRecord(metric, name);
  requireExactKeys(
    metric,
    ["eventType", "counts", "precision", "recall", "signedErrorMs"],
    name,
  );
  requireEqual(metric.eventType, expectedEvent, `${name}.eventType`);
  requireRecord(metric.counts, `${name}.counts`);
  requireExactKeys(
    metric.counts,
    ["reference", "predicted", "matched", "missed", "spurious"],
    `${name}.counts`,
  );
  requireEqual(
    metric.counts.reference,
    validAttempts,
    `${name}.counts.reference`,
  );
  for (const field of ["predicted", "matched", "missed", "spurious"]) {
    requireInteger(
      metric.counts[field],
      0,
      Math.max(1_000, validAttempts * 10),
      `${name}.counts.${field}`,
    );
  }
  if (
    metric.counts.matched >
    Math.min(metric.counts.reference, metric.counts.predicted)
  ) {
    throw new Error(`${name}.counts.matched exceeds available events`);
  }
  requireEqual(
    metric.counts.missed,
    metric.counts.reference - metric.counts.matched,
    `${name}.counts.missed`,
  );
  requireEqual(
    metric.counts.spurious,
    metric.counts.predicted - metric.counts.matched,
    `${name}.counts.spurious`,
  );
  requireEqual(
    metric.precision,
    roundedRate(metric.counts.matched, metric.counts.predicted),
    `${name}.precision`,
  );
  requireEqual(
    metric.recall,
    roundedRate(metric.counts.matched, metric.counts.reference),
    `${name}.recall`,
  );
  validateDistribution(
    metric.signedErrorMs,
    metric.counts.matched,
    `${name}.signedErrorMs`,
    matchWindowMs,
  );
}

function validateResultCell(cell, expectedCell, participants, plan, index) {
  const name = `result.cells[${index}]`;
  requireRecord(cell, name);
  requireExactKeys(
    cell,
    [
      "cellId",
      "participantSessionId",
      "scheduledAttempts",
      "validAttempts",
      "invalidAttempts",
      "invalidReasons",
      "configurationSha256",
      "skeletonTraceSha256",
      "depthLabelsSha256",
      "contactLabelsSha256",
      "strategies",
    ],
    name,
  );
  requireEqual(cell.cellId, expectedCell.cellId, `${name}.cellId`);
  const participant = participants.get(cell.participantSessionId);
  if (!participant) {
    throw new Error(`${name}.participantSessionId is not declared`);
  }
  requireEqual(
    participant.personaClass,
    expectedCell.personaClass,
    `${name}.participant persona`,
  );
  requireEqual(
    cell.scheduledAttempts,
    expectedCell.scheduledAttempts,
    `${name}.scheduledAttempts`,
  );
  requireInteger(cell.validAttempts, 0, 20, `${name}.validAttempts`);
  requireInteger(cell.invalidAttempts, 0, 20, `${name}.invalidAttempts`);
  requireEqual(
    cell.validAttempts + cell.invalidAttempts,
    cell.scheduledAttempts,
    `${name} retained attempt total`,
  );
  if (
    !Array.isArray(cell.invalidReasons) ||
    cell.invalidReasons.length > cell.invalidAttempts ||
    cell.invalidReasons.some((reason) => !invalidReasons.includes(reason))
  ) {
    throw new Error(`${name}.invalidReasons is invalid`);
  }
  if (
    (cell.invalidAttempts === 0 && cell.invalidReasons.length !== 0) ||
    (cell.invalidAttempts > 0 && cell.invalidReasons.length === 0)
  ) {
    throw new Error(`${name}.invalidReasons must explain invalid attempts`);
  }
  for (const field of [
    "configurationSha256",
    "skeletonTraceSha256",
    "depthLabelsSha256",
    "contactLabelsSha256",
  ]) {
    requireSha256(cell[field], `${name}.${field}`);
  }
  if (!Array.isArray(cell.strategies) || cell.strategies.length !== 2) {
    throw new Error(`${name}.strategies must contain both RGB strategies`);
  }
  cell.strategies.forEach((strategy, strategyIndex) => {
    const strategyName = `${name}.strategies[${strategyIndex}]`;
    requireRecord(strategy, strategyName);
    requireExactKeys(strategy, ["strategy", "events"], strategyName);
    requireEqual(
      strategy.strategy,
      RGB_DEPTH_STRATEGIES[strategyIndex],
      `${strategyName}.strategy`,
    );
    if (
      !Array.isArray(strategy.events) ||
      strategy.events.length !== expectedCell.eventTypes.length
    ) {
      throw new Error(`${strategyName}.events has the wrong event set`);
    }
    strategy.events.forEach((metric, eventIndex) =>
      validateEventMetric(
        metric,
        expectedCell.eventTypes[eventIndex],
        cell.validAttempts,
        `${strategyName}.events[${eventIndex}]`,
        plan.scoring.matchWindowMs,
      ),
    );
  });
}

function validateNegativeWindow(window, expected, participants, index) {
  const name = `result.negativeWindows[${index}]`;
  requireRecord(window, name);
  requireExactKeys(
    window,
    [
      "windowId",
      "participantSessionId",
      "durationSeconds",
      "configurationSha256",
      "skeletonTraceSha256",
      "strategies",
    ],
    name,
  );
  requireEqual(window.windowId, expected.windowId, `${name}.windowId`);
  const participant = participants.get(window.participantSessionId);
  if (!participant) {
    throw new Error(`${name}.participantSessionId is not declared`);
  }
  requireEqual(
    participant.personaClass,
    expected.personaClass,
    `${name}.participant persona`,
  );
  requireNumber(window.durationSeconds, 60, 3_600, `${name}.durationSeconds`);
  requireSha256(window.configurationSha256, `${name}.configurationSha256`);
  requireSha256(window.skeletonTraceSha256, `${name}.skeletonTraceSha256`);
  if (!Array.isArray(window.strategies) || window.strategies.length !== 2) {
    throw new Error(`${name}.strategies must contain both RGB strategies`);
  }
  window.strategies.forEach((strategy, strategyIndex) => {
    const strategyName = `${name}.strategies[${strategyIndex}]`;
    requireRecord(strategy, strategyName);
    requireExactKeys(strategy, ["strategy", "falseEvents"], strategyName);
    requireEqual(
      strategy.strategy,
      RGB_DEPTH_STRATEGIES[strategyIndex],
      `${strategyName}.strategy`,
    );
    if (
      !Array.isArray(strategy.falseEvents) ||
      strategy.falseEvents.length !== eventTypes.length
    ) {
      throw new Error(`${strategyName}.falseEvents has the wrong event set`);
    }
    strategy.falseEvents.forEach((event, eventIndex) => {
      const eventName = `${strategyName}.falseEvents[${eventIndex}]`;
      requireRecord(event, eventName);
      requireExactKeys(event, ["eventType", "count"], eventName);
      requireEqual(
        event.eventType,
        eventTypes[eventIndex],
        `${eventName}.eventType`,
      );
      requireInteger(event.count, 0, 10_000, `${eventName}.count`);
    });
  });
}

function expectedNegativeWindows() {
  return RGB_DEPTH_PERSONA_CLASSES.flatMap((personaClass) =>
    RGB_DEPTH_CAMERA_POSITIONS.map((cameraPosition) => ({
      windowId: `${personaClass}--${cameraPosition}--negative`,
      personaClass,
      cameraPosition,
    })),
  );
}

export function validateRgbDepthFloorContactResult(result, planValue) {
  const plan = validateRgbDepthFloorContactPlan(planValue);
  requireRecord(result, "result");
  requireExactKeys(
    result,
    [
      "format",
      "formatVersion",
      "documentType",
      "campaignId",
      "generatedAt",
      "sourceCommit",
      "plan",
      "execution",
      "cells",
      "negativeWindows",
      "summary",
      "claimBoundary",
      "limitations",
    ],
    "result",
  );
  requireEqual(result.format, RGB_DEPTH_CAMPAIGN_FORMAT, "result.format");
  requireEqual(result.formatVersion, 1, "result.formatVersion");
  requireEqual(result.documentType, "result", "result.documentType");
  requireEqual(result.campaignId, RGB_DEPTH_CAMPAIGN_ID, "result.campaignId");
  requireIsoDate(result.generatedAt, "result.generatedAt");
  if (
    typeof result.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(result.sourceCommit)
  ) {
    throw new Error("result.sourceCommit must be a lowercase Git commit");
  }
  requireRecord(result.plan, "result.plan");
  requireExactKeys(
    result.plan,
    ["path", "canonicalSha256"],
    "result.plan",
  );
  requireEqual(result.plan.path, pinnedPlanPath, "result.plan.path");
  requireEqual(
    result.plan.canonicalSha256,
    canonicalJsonSha256(plan),
    "result.plan.canonicalSha256",
  );

  requireRecord(result.execution, "result.execution");
  requireExactKeys(
    result.execution,
    [
      "startedAt",
      "completedAt",
      "configurationSha256",
      "roomSheetSha256",
      "consentRecordSetSha256",
      "rgbDevice",
      "depthDevice",
      "contactDevice",
      "host",
      "synchronization",
      "participants",
      "rawFramesRetained",
    ],
    "result.execution",
  );
  requireIsoDate(result.execution.startedAt, "result.execution.startedAt");
  requireIsoDate(result.execution.completedAt, "result.execution.completedAt");
  if (
    Date.parse(result.execution.completedAt) <
    Date.parse(result.execution.startedAt)
  ) {
    throw new Error("result execution completion must follow start");
  }
  for (const field of [
    "configurationSha256",
    "roomSheetSha256",
    "consentRecordSetSha256",
  ]) {
    requireSha256(
      result.execution[field],
      `result.execution.${field}`,
    );
  }
  for (const field of [
    "rgbDevice",
    "depthDevice",
    "contactDevice",
    "host",
  ]) {
    validateDevice(result.execution[field], `result.execution.${field}`);
  }
  requireRecord(
    result.execution.synchronization,
    "result.execution.synchronization",
  );
  requireExactKeys(
    result.execution.synchronization,
    [
      "maximumMeasuredErrorMs",
      "maximumReferenceUncertaintyMs",
      "beforeAfterEverySession",
    ],
    "result.execution.synchronization",
  );
  requireNumber(
    result.execution.synchronization.maximumMeasuredErrorMs,
    0,
    60_000,
    "result.execution.synchronization.maximumMeasuredErrorMs",
  );
  requireNumber(
    result.execution.synchronization.maximumReferenceUncertaintyMs,
    0,
    60_000,
    "result.execution.synchronization.maximumReferenceUncertaintyMs",
  );
  requireEqual(
    result.execution.synchronization.beforeAfterEverySession,
    true,
    "result.execution.synchronization.beforeAfterEverySession",
  );
  requireEqual(
    result.execution.rawFramesRetained,
    false,
    "result.execution.rawFramesRetained",
  );
  if (
    !Array.isArray(result.execution.participants) ||
    result.execution.participants.length < 2 ||
    result.execution.participants.length > 64
  ) {
    throw new Error("result.execution.participants must contain 2 through 64 entries");
  }
  const participants = new Map();
  result.execution.participants.forEach((participant, index) => {
    const name = `result.execution.participants[${index}]`;
    requireRecord(participant, name);
    requireExactKeys(
      participant,
      ["participantSessionId", "personaClass"],
      name,
    );
    if (
      typeof participant.participantSessionId !== "string" ||
      !/^session-[a-z0-9-]{8,64}$/.test(participant.participantSessionId)
    ) {
      throw new Error(`${name}.participantSessionId must be opaque and bounded`);
    }
    if (participants.has(participant.participantSessionId)) {
      throw new Error(`${name}.participantSessionId must be unique`);
    }
    if (!RGB_DEPTH_PERSONA_CLASSES.includes(participant.personaClass)) {
      throw new Error(`${name}.personaClass is invalid`);
    }
    participants.set(participant.participantSessionId, participant);
  });
  for (const personaClass of RGB_DEPTH_PERSONA_CLASSES) {
    if (
      ![...participants.values()].some(
        (participant) => participant.personaClass === personaClass,
      )
    ) {
      throw new Error(`result.execution.participants is missing ${personaClass}`);
    }
  }

  const cells = expectedCells();
  if (!Array.isArray(result.cells) || result.cells.length !== cells.length) {
    throw new Error("result.cells must contain the complete 30-cell matrix");
  }
  result.cells.forEach((cell, index) =>
    validateResultCell(cell, cells[index], participants, plan, index),
  );
  const windows = expectedNegativeWindows();
  if (
    !Array.isArray(result.negativeWindows) ||
    result.negativeWindows.length !== windows.length
  ) {
    throw new Error(
      "result.negativeWindows must contain every persona/position pair",
    );
  }
  result.negativeWindows.forEach((window, index) =>
    validateNegativeWindow(window, windows[index], participants, index),
  );

  const totals = result.cells.reduce(
    (sum, cell) => ({
      valid: sum.valid + cell.validAttempts,
      invalid: sum.invalid + cell.invalidAttempts,
    }),
    { valid: 0, invalid: 0 },
  );
  const negativeSeconds = result.negativeWindows.reduce(
    (sum, window) => sum + window.durationSeconds,
    0,
  );
  const falseEvents = result.negativeWindows.reduce(
    (sum, window) =>
      sum +
      window.strategies.reduce(
        (strategySum, strategy) =>
          strategySum +
          strategy.falseEvents.reduce(
            (eventSum, event) => eventSum + event.count,
            0,
          ),
        0,
      ),
    0,
  );
  const synchronizationPassed =
    result.execution.synchronization.maximumMeasuredErrorMs <=
      plan.configuration.timestamps.maximumSynchronizationErrorMs &&
    result.execution.synchronization.maximumReferenceUncertaintyMs <=
      plan.configuration.timestamps.maximumReferenceUncertaintyMs;
  const selectionEligible =
    synchronizationPassed &&
    totals.invalid === 0 &&
    plan.scoring.eventTimingGateMs !== null;
  requireRecord(result.summary, "result.summary");
  requireExactKeys(
    result.summary,
    [
      "scheduledAttempts",
      "validAttempts",
      "invalidAttempts",
      "movementCells",
      "negativeWindows",
      "negativeSeconds",
      "falseEvents",
      "synchronizationPassed",
      "selectionEligible",
    ],
    "result.summary",
  );
  const expectedSummary = {
    scheduledAttempts: 600,
    validAttempts: totals.valid,
    invalidAttempts: totals.invalid,
    movementCells: 30,
    negativeWindows: 10,
    negativeSeconds,
    falseEvents,
    synchronizationPassed,
    selectionEligible,
  };
  for (const [field, expected] of Object.entries(expectedSummary)) {
    requireEqual(result.summary[field], expected, `result.summary.${field}`);
  }
  requireEqual(
    result.summary.selectionEligible,
    false,
    "result.summary.selectionEligible pending owner event gate",
  );

  requireText(result.claimBoundary, "result.claimBoundary", 2_048);
  for (const phrase of [
    "event-timing gate remains unset",
    "not strategy selection",
    "not target qualification",
  ]) {
    if (!result.claimBoundary.includes(phrase)) {
      throw new Error(`result.claimBoundary must address ${phrase}`);
    }
  }
  if (!Array.isArray(result.limitations) || result.limitations.length < 5) {
    throw new Error("result.limitations must contain at least five entries");
  }
  result.limitations.forEach((value, index) =>
    requireText(value, `result.limitations[${index}]`),
  );
  return result;
}

export async function readAndValidateRgbDepthCampaign(
  path,
  planValue,
) {
  const bytes = await readFile(path);
  if (bytes.length > 5_000_000) {
    throw new Error(`${path} exceeds the 5 MB campaign document limit`);
  }
  const value = JSON.parse(bytes);
  if (value.documentType === "plan") {
    return validateRgbDepthFloorContactPlan(value);
  }
  if (value.documentType === "result") {
    const plan =
      planValue ??
      JSON.parse(
        await readFile(resolve(repositoryRoot, pinnedPlanPath), "utf8"),
      );
    return validateRgbDepthFloorContactResult(value, plan);
  }
  throw new Error("campaign documentType must be plan or result");
}

async function runCli() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    throw new Error(
      "usage: node scripts/validate-rgb-depth-floor-contact-campaign.mjs <plan-or-result.json> [...]",
    );
  }
  for (const argument of paths) {
    const path = resolve(repositoryRoot, argument);
    const value = await readAndValidateRgbDepthCampaign(path);
    console.log(
      `${relativePath(path)}: valid ${value.documentType} (${value.campaignId})`,
    );
  }
}

function relativePath(path) {
  return path.startsWith(repositoryRoot)
    ? path.slice(repositoryRoot.length + 1)
    : path;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
