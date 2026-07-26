import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMicrophoneDisablementQualificationPlanBytes } from "./validate-microphone-disablement-qualification.mjs";
import {
  MICROPHONE_DISABLEMENT_READY_CLAIM_BOUNDARY,
  MICROPHONE_DISABLEMENT_RESULT_CLAIM_BOUNDARY,
  parseMicrophoneDisablementQualificationResultBytes,
  parseReadyMicrophoneDisablementQualificationPlanBytes,
  validateMicrophoneDisablementQualificationResult,
  validateReadyMicrophoneDisablementQualificationPlan,
} from "./validate-microphone-disablement-result.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blockedBytes = await readFile(
  resolve(
    root,
    "benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json",
  ),
);
const blockedPlan = await parseMicrophoneDisablementQualificationPlanBytes(blockedBytes);
const digest = (value) => createHash("sha256").update(value).digest("hex");

function buildReadyPlan() {
  const plan = structuredClone(blockedPlan);
  plan.status = "ready";
  plan.claimBoundary = MICROPHONE_DISABLEMENT_READY_CLAIM_BOUNDARY;
  for (const [index, target] of plan.targets.entries()) {
    target.cameraIdentitySha256 = digest(`camera-${index}`);
    target.usbDescriptorSha256 = digest(`usb-${index}`);
    target.osImageSha256 = digest(`image-${index}`);
    target.kernelOrBuild = `kernel-build-${index + 1}`;
    target.audioStackVersion = `audio-stack-${index + 1}`;
    target.sandboxRuntimeVersion = `sandbox-${index + 1}`;
    target.browserVersion = `browser-${index + 1}`;
    target.ordinaryUserPolicySha256 = digest(`policy-${index}`);
  }
  plan.executionMatrix.minimumValidAttemptsPerCell = 2;
  plan.executionMatrix.attemptTimeoutMs = 1000;
  plan.executionMatrix.scheduleSha256 = digest("schedule");
  plan.executionMatrix.probeBundleSha256 = digest("probe-bundle");
  plan.diagnosticPolicy.adminDiagnosticPathDisposition = "none";
  plan.executionGate = {
    status: "ready",
    targetAccessAuthorized: true,
    osPolicyMutationAuthorized: true,
    audioProbeAuthorized: true,
    purchaseAuthorized: false,
    blockerCodes: [],
  };
  return plan;
}

const readyPlan = buildReadyPlan();
const readyPlanBytes = Buffer.from(`${JSON.stringify(readyPlan, null, 2)}\n`);
await parseReadyMicrophoneDisablementQualificationPlanBytes(readyPlanBytes);

function summarizeCell(cell, minimumValidAttempts) {
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
      : validAttemptCount >= minimumValidAttempts
        ? "passed"
        : "incomplete";
  return {
    validAttemptCount,
    harnessInvalidAttemptCount,
    stoppedAttemptCount,
    captureSuccessCount,
    returnedAudioTrackCount,
    returnedAudioBufferCount,
    returnedAudioByteCount,
    disposition,
  };
}

function recomputeResult(result, plan = readyPlan) {
  for (const cell of result.cells) {
    cell.summary = summarizeCell(
      cell,
      plan.executionMatrix.minimumValidAttemptsPerCell,
    );
  }
  const passedCellCount = result.cells.filter(
    (cell) => cell.summary.disposition === "passed",
  ).length;
  const rejectedCellCount = result.cells.filter(
    (cell) => cell.summary.disposition === "rejected",
  ).length;
  const incompleteCellCount = result.cells.filter(
    (cell) => cell.summary.disposition === "incomplete",
  ).length;
  const sum = (key) => result.cells.reduce((total, cell) => total + cell.summary[key], 0);
  const qualifiedTargetIds = plan.targets
    .filter((target, targetIndex) =>
      result.cells
        .slice(targetIndex * 64, (targetIndex + 1) * 64)
        .every((cell) => cell.summary.disposition === "passed"),
    )
    .map((target) => target.targetId);
  result.summary = {
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
  result.disposition =
    rejectedCellCount > 0
      ? "rejected"
      : incompleteCellCount > 0
        ? "incomplete"
        : "qualified";
  return result;
}

function buildResult() {
  const cells = [];
  let evidenceIndex = 0;
  for (const target of readyPlan.targets) {
    for (const layer of readyPlan.requiredLayers) {
      for (const phaseId of readyPlan.requiredPhases) {
        const attempts = Array.from({ length: 2 }, (_, attemptIndex) => ({
          attemptId: `attempt-${String(attemptIndex + 1).padStart(3, "0")}`,
          status: "valid",
          outcome: "authorization-denied",
          outcomeCode: "AUTHORIZATION_DENIED",
          returnedAudioTrack: false,
          returnedAudioBufferCount: 0,
          returnedAudioByteCount: 0,
          elapsedMs: 5,
          configurationSha256: target.ordinaryUserPolicySha256,
          evidenceSha256: digest(`evidence-${evidenceIndex++}`),
          rawAudioRetained: false,
          networkEgress: false,
        }));
        cells.push({
          targetId: target.targetId,
          layerId: layer.layerId,
          phaseId,
          attempts,
          summary: {},
        });
      }
    }
  }
  return recomputeResult({
    format: "vcg-microphone-disablement-qualification-result/v1",
    campaignId: readyPlan.campaignId,
    planSha256: digest(readyPlanBytes),
    observedAt: "2026-07-25",
    claimBoundary: MICROPHONE_DISABLEMENT_RESULT_CLAIM_BOUNDARY,
    scheduleSha256: readyPlan.executionMatrix.scheduleSha256,
    probeBundleSha256: readyPlan.executionMatrix.probeBundleSha256,
    cells,
    summary: {},
    disposition: "incomplete",
    dataDisposition: {
      rawAudioRetained: false,
      audioSampleBytesPersisted: 0,
      networkEgressEvents: 0,
      transcriptsCreated: 0,
      voiceprintsCreated: 0,
      participantIdentifiersRecorded: 0,
      freeTextFieldsRecorded: 0,
    },
  });
}

test("accepts an exact ready plan and derives a complete qualified result", async () => {
  await validateReadyMicrophoneDisablementQualificationPlan(readyPlan);
  const result = buildResult();
  await validateMicrophoneDisablementQualificationResult(
    result,
    readyPlan,
    readyPlanBytes,
  );
  assert.equal(result.disposition, "qualified");
  assert.equal(result.summary.passedCellCount, 192);
  assert.deepEqual(result.summary.qualifiedTargetIds, readyPlan.targets.map((target) => target.targetId));
});

test("accepts honest incomplete cells and withholds only the affected target", async () => {
  const result = buildResult();
  result.cells[0].attempts.pop();
  recomputeResult(result);
  await validateMicrophoneDisablementQualificationResult(
    result,
    readyPlan,
    readyPlanBytes,
  );
  assert.equal(result.disposition, "incomplete");
  assert.equal(result.summary.incompleteCellCount, 1);
  assert.deepEqual(
    result.summary.qualifiedTargetIds,
    readyPlan.targets.slice(1).map((target) => target.targetId),
  );
});

test("accepts an honest capture failure and derives rejection", async () => {
  const result = buildResult();
  Object.assign(result.cells[0].attempts[0], {
    outcome: "capture-succeeded",
    outcomeCode: "AUDIO_TRACK_RETURNED",
    returnedAudioTrack: true,
    returnedAudioBufferCount: 1,
    returnedAudioByteCount: 128,
  });
  recomputeResult(result);
  await validateMicrophoneDisablementQualificationResult(
    result,
    readyPlan,
    readyPlanBytes,
  );
  assert.equal(result.disposition, "rejected");
  assert.equal(result.summary.captureSuccessCount, 1);
  assert.equal(result.dataDisposition.audioSampleBytesPersisted, 0);
});

test("rejects a hidden capture failure or promoted disposition", async () => {
  const result = buildResult();
  Object.assign(result.cells[0].attempts[0], {
    outcome: "capture-succeeded",
    outcomeCode: "AUDIO_TRACK_RETURNED",
    returnedAudioTrack: true,
  });
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(
      result,
      readyPlan,
      readyPlanBytes,
    ),
    /summary drifted/u,
  );
  recomputeResult(result);
  result.disposition = "qualified";
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(
      result,
      readyPlan,
      readyPlanBytes,
    ),
    /disposition drifted/u,
  );
});

test("rejects missing, duplicated, or reordered cells", async () => {
  for (const mutate of [
    (result) => { result.cells.pop(); },
    (result) => { result.cells[1] = structuredClone(result.cells[0]); },
    (result) => { [result.cells[0], result.cells[1]] = [result.cells[1], result.cells[0]]; },
  ]) {
    const result = buildResult();
    mutate(result);
    await assert.rejects(
      validateMicrophoneDisablementQualificationResult(
        result,
        readyPlan,
        readyPlanBytes,
      ),
    );
  }
});

test("rejects attempt-order drift and reused evidence digests", async () => {
  const order = buildResult();
  order.cells[0].attempts[0].attemptId = "attempt-002";
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(order, readyPlan, readyPlanBytes),
    /attempt order drifted/u,
  );
  const reused = buildResult();
  reused.cells[0].attempts[1].evidenceSha256 =
    reused.cells[0].attempts[0].evidenceSha256;
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(reused, readyPlan, readyPlanBytes),
    /digest was reused/u,
  );
});

test("rejects denial with returned audio and capture success without a signal", async () => {
  const denial = buildResult();
  denial.cells[0].attempts[0].returnedAudioByteCount = 1;
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(denial, readyPlan, readyPlanBytes),
    /denial returned audio/u,
  );
  const hidden = buildResult();
  hidden.cells[0].attempts[0].outcome = "capture-succeeded";
  hidden.cells[0].attempts[0].outcomeCode = "CAPTURE_SUCCEEDED";
  await assert.rejects(
    validateMicrophoneDisablementQualificationResult(hidden, readyPlan, readyPlanBytes),
    /hides a capture success/u,
  );
});

test("rejects samples attached to invalid attempts, retention, and egress", async () => {
  for (const mutate of [
    (result) => {
      Object.assign(result.cells[0].attempts[0], {
        status: "harness-invalid",
        outcome: null,
        elapsedMs: null,
        returnedAudioBufferCount: 1,
      });
    },
    (result) => { result.cells[0].attempts[0].rawAudioRetained = true; },
    (result) => { result.cells[0].attempts[0].networkEgress = true; },
    (result) => { result.dataDisposition.transcriptsCreated = 1; },
  ]) {
    const result = buildResult();
    mutate(result);
    await assert.rejects(
      validateMicrophoneDisablementQualificationResult(
        result,
        readyPlan,
        readyPlanBytes,
      ),
    );
  }
});

test("rejects open statuses, silence outcomes, provider text, and unsafe codes", async () => {
  for (const mutate of [
    (result) => { result.cells[0].attempts[0].status = "timeout"; },
    (result) => { result.cells[0].attempts[0].outcome = "muted-silence"; },
    (result) => { result.cells[0].attempts[0].outcomeCode = "denied at C:\\device"; },
    (result) => { result.cells[0].attempts[0].providerText = "permission denied"; },
    (result) => { result.notes = "all good"; },
  ]) {
    const result = buildResult();
    mutate(result);
    await assert.rejects(
      validateMicrophoneDisablementQualificationResult(
        result,
        readyPlan,
        readyPlanBytes,
      ),
    );
  }
});

test("rejects plan, schedule, probe, policy, and timeout substitution", async () => {
  const result = buildResult();
  for (const mutate of [
    (candidate) => { candidate.planSha256 = "0".repeat(64); },
    (candidate) => { candidate.scheduleSha256 = "1".repeat(64); },
    (candidate) => { candidate.probeBundleSha256 = "2".repeat(64); },
    (candidate) => { candidate.cells[0].attempts[0].configurationSha256 = "3".repeat(64); },
    (candidate) => { candidate.cells[0].attempts[0].elapsedMs = 1001; },
    (candidate) => { candidate.observedAt = "2026-02-30"; },
  ]) {
    const candidate = structuredClone(result);
    mutate(candidate);
    await assert.rejects(
      validateMicrophoneDisablementQualificationResult(
        candidate,
        readyPlan,
        readyPlanBytes,
      ),
    );
  }
});

test("rejects an incomplete ready plan and every unsafe diagnostic or gate", async () => {
  for (const mutate of [
    (plan) => { plan.targets[0].cameraIdentitySha256 = null; },
    (plan) => { plan.observedAt = "2026-07-24"; },
    (plan) => { plan.observedAt = "2026-02-30"; },
    (plan) => { plan.executionMatrix.minimumValidAttemptsPerCell = 21; },
    (plan) => { plan.executionMatrix.attemptTimeoutMs = 99; },
    (plan) => { plan.diagnosticPolicy.adminDiagnosticPathDisposition = "enabled"; },
    (plan) => { plan.executionGate.audioProbeAuthorized = false; },
    (plan) => { plan.executionGate.purchaseAuthorized = true; },
  ]) {
    const plan = buildReadyPlan();
    mutate(plan);
    await assert.rejects(validateReadyMicrophoneDisablementQualificationPlan(plan));
  }
});

test("parses canonical ready/result bytes and rejects malformed envelopes", async () => {
  const result = buildResult();
  const resultBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  await parseMicrophoneDisablementQualificationResultBytes(
    resultBytes,
    readyPlanBytes,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationResultBytes(
      Buffer.from(JSON.stringify(result)),
      readyPlanBytes,
    ),
    /canonical/u,
  );
  const duplicate = Buffer.from(
    `${JSON.stringify(result, null, 2).replace(
      '  "campaignId": "bundled-camera-microphone-disablement-v1",',
      '  "campaignId": "bundled-camera-microphone-disablement-v1",\n  "campaignId": "bundled-camera-microphone-disablement-v1",',
    )}\n`,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationResultBytes(duplicate, readyPlanBytes),
    /canonical/u,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationResultBytes(
      Buffer.from([0xc3, 0x28]),
      readyPlanBytes,
    ),
    /UTF-8/u,
  );
  await assert.rejects(
    parseMicrophoneDisablementQualificationResultBytes(
      Buffer.alloc(8 * 1024 * 1024 + 1),
      readyPlanBytes,
    ),
  );
});
