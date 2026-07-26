import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MICROPHONE_DISABLEMENT_BLOCKED_CLAIM_BOUNDARY,
  MICROPHONE_DISABLEMENT_BLOCKERS,
  MICROPHONE_DISABLEMENT_LAYERS,
  MICROPHONE_DISABLEMENT_PHASES,
  MICROPHONE_DISABLEMENT_TARGETS,
  validateMicrophoneDisablementQualificationPlan,
} from "./validate-microphone-disablement-qualification.mjs";

const MAX_PLAN_BYTES = 128 * 1024;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9 ._+:/()-]{0,127}$/u;
const targetDynamicKeys = [
  "cameraIdentitySha256",
  "usbDescriptorSha256",
  "osImageSha256",
  "kernelOrBuild",
  "audioStackVersion",
  "sandboxRuntimeVersion",
  "browserVersion",
  "ordinaryUserPolicySha256",
];
const targetHashKeys = [
  "cameraIdentitySha256",
  "usbDescriptorSha256",
  "osImageSha256",
  "ordinaryUserPolicySha256",
];
const targetVersionKeys = [
  "kernelOrBuild",
  "audioStackVersion",
  "sandboxRuntimeVersion",
  "browserVersion",
];

export const MICROPHONE_DISABLEMENT_READY_CLAIM_BOUNDARY =
  "Ready microphone-disablement qualification plan only. Exact target inputs, ordinary-user policies, probe bundle, schedule, repetition count, timeout, target access, OS-policy mutation, and audio-probe handling are bound under the zero-retention policy. No attempt or target result exists, and readiness does not qualify microphone disablement.";
export const MICROPHONE_DISABLEMENT_RESULT_FORMAT =
  "vcg-microphone-disablement-qualification-result/v1";
export const MICROPHONE_DISABLEMENT_RESULT_CLAIM_BOUNDARY =
  "Microphone-disablement result envelope only. Disposition is derived from every ordered cell and cannot promote incomplete or rejected evidence. It claims no retained audio, transcription, voiceprint, participant identity, free text, or target qualification outside the exact ready plan.";

function exactKeys(value, expected, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function integer(value, minimum, maximum, label) {
  assert.ok(Number.isSafeInteger(value), `${label} must be a safe integer`);
  assert.ok(value >= minimum && value <= maximum, `${label} is out of range`);
  return value;
}

function isoDate(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/u, `${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert.ok(!Number.isNaN(parsed.valueOf()), `${label} is invalid`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `${label} is invalid`);
}

function decodeBoundedUtf8(bytes, maximumBytes, label) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= maximumBytes, `${label} size is invalid`);
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} has a BOM`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
}

function normalizedDigest(bytes, label) {
  const text = decodeBoundedUtf8(bytes, MAX_PLAN_BYTES, label);
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(text), `${label} has bare CR`);
  return createHash("sha256")
    .update(text.replaceAll("\r\n", "\n"))
    .digest("hex");
}

function blockedProjection(plan) {
  const projection = structuredClone(plan);
  projection.status = "blocked";
  projection.observedAt = "2026-07-25";
  projection.claimBoundary = MICROPHONE_DISABLEMENT_BLOCKED_CLAIM_BOUNDARY;
  for (const target of projection.targets) {
    for (const key of targetDynamicKeys) target[key] = null;
  }
  projection.executionMatrix.minimumValidAttemptsPerCell = null;
  projection.executionMatrix.attemptTimeoutMs = null;
  projection.executionMatrix.scheduleSha256 = null;
  projection.executionMatrix.probeBundleSha256 = null;
  projection.diagnosticPolicy.adminDiagnosticPathDisposition = "unresolved";
  projection.executionGate = {
    status: "blocked",
    targetAccessAuthorized: false,
    osPolicyMutationAuthorized: false,
    audioProbeAuthorized: false,
    purchaseAuthorized: false,
    blockerCodes: [...MICROPHONE_DISABLEMENT_BLOCKERS],
  };
  return projection;
}

export async function validateReadyMicrophoneDisablementQualificationPlan(
  plan,
  repositoryRoot,
) {
  await validateMicrophoneDisablementQualificationPlan(
    blockedProjection(plan),
    repositoryRoot,
  );
  assert.equal(plan.status, "ready");
  isoDate(plan.observedAt, "ready plan observedAt");
  assert.ok(plan.observedAt >= "2026-07-25");
  assert.equal(plan.claimBoundary, MICROPHONE_DISABLEMENT_READY_CLAIM_BOUNDARY);
  for (const [targetIndex, target] of plan.targets.entries()) {
    for (const key of targetHashKeys) {
      assert.match(target[key], SHA256, `targets[${targetIndex}].${key} is invalid`);
    }
    for (const key of targetVersionKeys) {
      assert.match(target[key], SAFE_VERSION, `targets[${targetIndex}].${key} is invalid`);
    }
  }
  integer(
    plan.executionMatrix.minimumValidAttemptsPerCell,
    1,
    20,
    "minimumValidAttemptsPerCell",
  );
  integer(plan.executionMatrix.attemptTimeoutMs, 100, 60_000, "attemptTimeoutMs");
  assert.match(plan.executionMatrix.scheduleSha256, SHA256);
  assert.match(plan.executionMatrix.probeBundleSha256, SHA256);
  assert.deepEqual(plan.diagnosticPolicy, {
    adminDiagnosticPathDisposition: "none",
    ordinaryUserUnlockAllowed: false,
    developerModeUnlockAllowed: false,
    gameRequestUnlockAllowed: false,
    profileSettingUnlockAllowed: false,
    separateOwnerDecisionRequired: true,
    visibleDisclosureAndIndicatorRequiredIfEnabled: true,
    temporaryProbeMayPersistAudio: false,
  });
  assert.deepEqual(plan.executionGate, {
    status: "ready",
    targetAccessAuthorized: true,
    osPolicyMutationAuthorized: true,
    audioProbeAuthorized: true,
    purchaseAuthorized: false,
    blockerCodes: [],
  });
  return plan;
}

export async function parseReadyMicrophoneDisablementQualificationPlanBytes(
  bytes,
  repositoryRoot,
) {
  const text = decodeBoundedUtf8(bytes, MAX_PLAN_BYTES, "ready microphone-disablement plan");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("ready microphone-disablement plan must be valid JSON");
  }
  await validateReadyMicrophoneDisablementQualificationPlan(value, repositoryRoot);
  assert.equal(
    text,
    `${JSON.stringify(value, null, 2)}\n`,
    "ready microphone-disablement plan must use canonical two-space JSON with one trailing newline",
  );
  return value;
}

function deriveAttempt(attempt, plan, target, label, evidenceDigests) {
  exactKeys(
    attempt,
    [
      "attemptId",
      "status",
      "outcome",
      "outcomeCode",
      "returnedAudioTrack",
      "returnedAudioBufferCount",
      "returnedAudioByteCount",
      "elapsedMs",
      "configurationSha256",
      "evidenceSha256",
      "rawAudioRetained",
      "networkEgress",
    ],
    label,
  );
  assert.match(attempt.outcomeCode, SAFE_CODE);
  assert.equal(attempt.configurationSha256, target.ordinaryUserPolicySha256);
  assert.match(attempt.evidenceSha256, SHA256);
  assert.ok(!evidenceDigests.has(attempt.evidenceSha256), "attempt evidence digest was reused");
  evidenceDigests.add(attempt.evidenceSha256);
  assert.equal(typeof attempt.returnedAudioTrack, "boolean");
  integer(attempt.returnedAudioBufferCount, 0, 0xffff_ffff, `${label}.returnedAudioBufferCount`);
  integer(attempt.returnedAudioByteCount, 0, 0xffff_ffff, `${label}.returnedAudioByteCount`);
  assert.equal(attempt.rawAudioRetained, false);
  assert.equal(attempt.networkEgress, false);

  if (attempt.status === "valid") {
    assert.ok(
      [
        "authorization-denied",
        "device-unavailable",
        "capture-source-absent",
        "capture-succeeded",
      ].includes(attempt.outcome),
      `${label}.outcome is invalid`,
    );
    integer(attempt.elapsedMs, 0, plan.executionMatrix.attemptTimeoutMs, `${label}.elapsedMs`);
    const returnedAnything =
      attempt.returnedAudioTrack
      || attempt.returnedAudioBufferCount > 0
      || attempt.returnedAudioByteCount > 0;
    if (attempt.outcome === "capture-succeeded") {
      assert.equal(returnedAnything, true, `${label} hides a capture success`);
    } else {
      assert.equal(returnedAnything, false, `${label} denial returned audio`);
    }
  } else {
    assert.ok(["harness-invalid", "stopped"].includes(attempt.status), `${label}.status is invalid`);
    assert.equal(attempt.outcome, null);
    assert.equal(attempt.elapsedMs, null);
    assert.equal(attempt.returnedAudioTrack, false);
    assert.equal(attempt.returnedAudioBufferCount, 0);
    assert.equal(attempt.returnedAudioByteCount, 0);
  }
}

function deriveCell(cell, plan, target, layerId, phaseId, evidenceDigests, cellIndex) {
  const label = `cells[${cellIndex}]`;
  exactKeys(
    cell,
    ["targetId", "layerId", "phaseId", "attempts", "summary"],
    label,
  );
  assert.deepEqual([cell.targetId, cell.layerId, cell.phaseId], [target.targetId, layerId, phaseId]);
  assert.ok(Array.isArray(cell.attempts));
  assert.ok(cell.attempts.length > 0 && cell.attempts.length <= 40);
  for (const [attemptIndex, attempt] of cell.attempts.entries()) {
    assert.equal(
      attempt.attemptId,
      `attempt-${String(attemptIndex + 1).padStart(3, "0")}`,
      `${label} attempt order drifted`,
    );
    deriveAttempt(attempt, plan, target, `${label}.attempts[${attemptIndex}]`, evidenceDigests);
  }

  const validAttemptCount = cell.attempts.filter((attempt) => attempt.status === "valid").length;
  const harnessInvalidAttemptCount = cell.attempts.filter(
    (attempt) => attempt.status === "harness-invalid",
  ).length;
  const stoppedAttemptCount = cell.attempts.filter((attempt) => attempt.status === "stopped").length;
  const captureSuccessCount = cell.attempts.filter(
    (attempt) => attempt.status === "valid" && attempt.outcome === "capture-succeeded",
  ).length;
  const returnedAudioTrackCount = cell.attempts.filter(
    (attempt) => attempt.returnedAudioTrack,
  ).length;
  const returnedAudioBufferCount = cell.attempts.reduce(
    (total, attempt) => total + attempt.returnedAudioBufferCount,
    0,
  );
  const returnedAudioByteCount = cell.attempts.reduce(
    (total, attempt) => total + attempt.returnedAudioByteCount,
    0,
  );
  const disposition =
    captureSuccessCount > 0
    || returnedAudioTrackCount > 0
    || returnedAudioBufferCount > 0
    || returnedAudioByteCount > 0
      ? "rejected"
      : validAttemptCount >= plan.executionMatrix.minimumValidAttemptsPerCell
        ? "passed"
        : "incomplete";
  const derived = {
    validAttemptCount,
    harnessInvalidAttemptCount,
    stoppedAttemptCount,
    captureSuccessCount,
    returnedAudioTrackCount,
    returnedAudioBufferCount,
    returnedAudioByteCount,
    disposition,
  };
  assert.deepEqual(cell.summary, derived, `${label}.summary drifted`);
  return derived;
}

export async function validateMicrophoneDisablementQualificationResult(
  result,
  readyPlan,
  readyPlanBytes,
  repositoryRoot,
) {
  await validateReadyMicrophoneDisablementQualificationPlan(readyPlan, repositoryRoot);
  exactKeys(
    result,
    [
      "format",
      "campaignId",
      "planSha256",
      "observedAt",
      "claimBoundary",
      "scheduleSha256",
      "probeBundleSha256",
      "cells",
      "summary",
      "disposition",
      "dataDisposition",
    ],
    "result",
  );
  assert.equal(result.format, MICROPHONE_DISABLEMENT_RESULT_FORMAT);
  assert.equal(result.campaignId, readyPlan.campaignId);
  assert.equal(result.planSha256, normalizedDigest(readyPlanBytes, "ready microphone-disablement plan"));
  isoDate(result.observedAt, "result observedAt");
  assert.ok(result.observedAt >= readyPlan.observedAt);
  assert.equal(result.claimBoundary, MICROPHONE_DISABLEMENT_RESULT_CLAIM_BOUNDARY);
  assert.equal(result.scheduleSha256, readyPlan.executionMatrix.scheduleSha256);
  assert.equal(result.probeBundleSha256, readyPlan.executionMatrix.probeBundleSha256);
  assert.equal(result.cells.length, readyPlan.executionMatrix.expectedCellCount);

  const evidenceDigests = new Set();
  const derivedCells = [];
  let cellIndex = 0;
  for (const [targetIndex, targetTuple] of MICROPHONE_DISABLEMENT_TARGETS.entries()) {
    const target = readyPlan.targets[targetIndex];
    assert.equal(target.targetId, targetTuple[0]);
    for (const layer of MICROPHONE_DISABLEMENT_LAYERS) {
      for (const phaseId of MICROPHONE_DISABLEMENT_PHASES) {
        derivedCells.push(
          deriveCell(
            result.cells[cellIndex],
            readyPlan,
            target,
            layer.layerId,
            phaseId,
            evidenceDigests,
            cellIndex,
          ),
        );
        cellIndex += 1;
      }
    }
  }

  const passedCellCount = derivedCells.filter((cell) => cell.disposition === "passed").length;
  const rejectedCellCount = derivedCells.filter((cell) => cell.disposition === "rejected").length;
  const incompleteCellCount = derivedCells.filter(
    (cell) => cell.disposition === "incomplete",
  ).length;
  const sum = (key) => derivedCells.reduce((total, cell) => total + cell[key], 0);
  const qualifiedTargetIds = readyPlan.targets
    .filter((target, targetIndex) =>
      derivedCells
        .slice(targetIndex * 64, (targetIndex + 1) * 64)
        .every((cell) => cell.disposition === "passed"),
    )
    .map((target) => target.targetId);
  const disposition =
    rejectedCellCount > 0
      ? "rejected"
      : incompleteCellCount > 0
        ? "incomplete"
        : "qualified";
  const derivedSummary = {
    expectedCellCount: 192,
    passedCellCount,
    rejectedCellCount,
    incompleteCellCount,
    validAttemptCount: sum("validAttemptCount"),
    harnessInvalidAttemptCount: sum("harnessInvalidAttemptCount"),
    stoppedAttemptCount: sum("stoppedAttemptCount"),
    captureSuccessCount: sum("captureSuccessCount"),
    returnedAudioTrackCount: sum("returnedAudioTrackCount"),
    returnedAudioBufferCount: sum("returnedAudioBufferCount"),
    returnedAudioByteCount: sum("returnedAudioByteCount"),
    qualifiedTargetIds,
  };
  assert.deepEqual(result.summary, derivedSummary, "result summary drifted");
  assert.equal(result.disposition, disposition, "result disposition drifted");
  assert.deepEqual(result.dataDisposition, {
    rawAudioRetained: false,
    audioSampleBytesPersisted: 0,
    networkEgressEvents: 0,
    transcriptsCreated: 0,
    voiceprintsCreated: 0,
    participantIdentifiersRecorded: 0,
    freeTextFieldsRecorded: 0,
  });
  return result;
}

export async function parseMicrophoneDisablementQualificationResultBytes(
  resultBytes,
  readyPlanBytes,
  repositoryRoot,
) {
  const readyPlan = await parseReadyMicrophoneDisablementQualificationPlanBytes(
    readyPlanBytes,
    repositoryRoot,
  );
  const text = decodeBoundedUtf8(
    resultBytes,
    MAX_RESULT_BYTES,
    "microphone-disablement result",
  );
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("microphone-disablement result must be valid JSON");
  }
  await validateMicrophoneDisablementQualificationResult(
    result,
    readyPlan,
    readyPlanBytes,
    repositoryRoot,
  );
  assert.equal(
    text,
    `${JSON.stringify(result, null, 2)}\n`,
    "microphone-disablement result must use canonical two-space JSON with one trailing newline",
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    "microphone-disablement result validator available; no tracked ready plan or result exists",
  );
}
