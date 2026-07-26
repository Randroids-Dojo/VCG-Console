import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SHARED_CAMERA_PLAN_PATH,
  parseCanonicalSharedCameraPlan,
} from "./validate-shared-camera-qualification-plan.mjs";
import {
  MAX_SHARED_CAMERA_RESULT_BYTES,
  expandSharedCameraCells,
  parseCanonicalReadySharedCameraPlan,
  parseCanonicalSharedCameraResult,
  validateReadySharedCameraPlan,
  validateSharedCameraResult,
} from "./validate-shared-camera-qualification-result.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const BLOCKED_PLAN_PATH = join(REPOSITORY_ROOT, ...SHARED_CAMERA_PLAN_PATH.split("/"));
const blockedPlanBytes = await readFile(BLOCKED_PLAN_PATH);
const blockedPlan = parseCanonicalSharedCameraPlan(blockedPlanBytes);

const READY_CLAIM_BOUNDARY =
  "This ready I-177 plan authorizes only the exact bound shared-camera qualification execution. It records no result, grants no raw-frame retention or egress, and does not qualify or select a camera, authorize a purchase, or change a product BOM.";
const READY_LIMITATIONS = [
  "Readiness is scoped to the exact received candidate, three target tuples, controls, room, participants, clocks, schedule, safety review, data protocol, and pre-registered numeric gates in this plan.",
  "Execution may produce only the closed result envelope; a changed device, target, driver, mode, control, placement, protocol, schedule, threshold, or source requires a new ready plan.",
  "Camera selection, purchase authority, and product BOM mutation remain outside this qualification execution and result contract.",
];
const RESULT_CLAIM_BOUNDARY =
  "This result derives qualification only for the exact ready I-177 plan and its 40 cells. It cannot select or purchase a camera, change a product BOM, qualify another device or target, retain or export raw frames or audio, or promote incomplete evidence.";
const RESULT_LIMITATIONS = [
  "Every disposition is scoped to the exact ready-plan digest, received candidate, target tuples, controls, room, participants, timestamp authority, schedule, and numeric gates.",
  "A qualified result is not a product-selection, purchase-authorization, or BOM-change decision.",
  "The result contains only opaque evidence digests, bounded codes, numeric observations, and derived summaries; it contains no raw frames, audio buffers, participant identifiers, paths, or free text.",
];

const digest = (seed) => createHash("sha256").update(seed).digest("hex");
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function buildReadyPlan() {
  const ready = structuredClone(blockedPlan);
  let digestIndex = 0;
  const nextDigest = () => digest(`ready-${digestIndex++}`);

  ready.qualification = "ready-plan-no-results";
  ready.candidate.ordered = true;
  ready.candidate.deliveredQuoteSha256 = nextDigest();
  ready.candidate.receiptSha256 = nextDigest();
  ready.candidate.receivedDeviceIdentitySha256 = nextDigest();

  ready.executionGate.status = "ready";
  ready.executionGate.selectedCandidateId = ready.candidate.candidateId;
  for (const key of Object.keys(ready.executionGate)) {
    if (key.endsWith("Sha256")) {
      ready.executionGate[key] = nextDigest();
    }
  }
  ready.executionGate.exposureTimestampAuthority = "hardware-exposure-start";
  ready.executionGate.blockerCodes = [];

  for (const target of ready.targets) {
    for (const key of Object.keys(target)) {
      if (key.endsWith("Sha256")) {
        target[key] = nextDigest();
      }
    }
  }

  ready.schedule.attemptsPerCell = 1;
  ready.schedule.sustainedCaptureDurationMs = 60_000;
  ready.schedule.hotPlugCyclesPerTarget = 1;
  ready.schedule.suspendResumeCyclesPerTarget = 1;
  ready.schedule.counterbalancedOrder = ready.targets.map((target) => target.id);

  ready.acceptance.minimumHorizontalFieldOfViewMilliDegrees = 80_000;
  ready.acceptance.minimumVerticalFieldOfViewMilliDegrees = 45_000;
  ready.acceptance.maximumDistortionError = 0.1;
  ready.acceptance.maximumDroppedFrameRate = 0.01;
  ready.acceptance.maximumP95ExposureTimeUs = 16_000;
  ready.acceptance.minimumLowLightIlluminanceMilliLux = 10_000;
  ready.acceptance.maximumReconnectTimeMs = 5_000;
  ready.acceptance.maximumResumeRecoveryTimeMs = 5_000;
  ready.acceptance.maximumDeliveredPriceCents = 20_000;

  ready.dataPolicy.temporaryFrameAnalysisAuthorized = true;
  ready.resultBoundary.executionAuthorized = true;
  ready.claimBoundary = READY_CLAIM_BOUNDARY;
  ready.limitations = READY_LIMITATIONS;
  return ready;
}

function deriveSummary(result, ready) {
  const expected = expandSharedCameraCells(ready);
  const passedCellCount = result.cells.filter((cell) => cell.disposition === "passed").length;
  const rejectedCellCount = result.cells.filter((cell) => cell.disposition === "rejected").length;
  const incompleteCellCount = result.cells.filter((cell) => cell.disposition === "incomplete").length;
  const sharedPass = result.cells.every(
    (cell, index) => expected[index].targetId !== null || cell.disposition === "passed",
  );
  const qualifiedTargetIds = ready.targets
    .filter((target) =>
      sharedPass &&
      result.cells.every(
        (cell, index) =>
          expected[index].targetId !== target.id || cell.disposition === "passed",
      ),
    )
    .map((target) => target.id);
  return {
    passedCellCount,
    rejectedCellCount,
    incompleteCellCount,
    qualifiedTargetIds,
    cameraQualified: passedCellCount === result.cells.length,
    cameraSelected: false,
    purchaseAuthorized: false,
    productBomsChanged: false,
    disposition:
      rejectedCellCount > 0 ? "rejected" : incompleteCellCount > 0 ? "incomplete" : "qualified",
  };
}

function buildPassingResult(ready) {
  const readyBytes = canonicalBytes(ready);
  let evidenceIndex = 0;
  const nextDigest = () => digest(`result-${evidenceIndex++}`);
  const expectedCells = expandSharedCameraCells(ready);
  const cells = expectedCells.map(({ check, targetId }, index) => {
    const attemptCount =
      check.id === "hot-plug-and-reconnect"
        ? ready.schedule.hotPlugCyclesPerTarget
        : check.id === "suspend-resume"
          ? ready.schedule.suspendResumeCyclesPerTarget
          : ready.schedule.attemptsPerCell;
    return {
      index,
      checkId: check.id,
      targetId,
      requiredEvidence: check.requiredEvidence.map((id) => ({ id, sha256: nextDigest() })),
      attempts: Array.from({ length: attemptCount }, (_, attemptIndex) => ({
        ordinal: attemptIndex + 1,
        status: "valid",
        outcome: "passed",
        evidenceSha256: nextDigest(),
        elapsedMs: 100,
        code: "ok",
        retainedRawFrameCount: 0,
        returnedAudioBufferCount: 0,
        networkEgressBytes: 0,
      })),
      disposition: "passed",
    };
  });
  const result = {
    format: "vcg-shared-camera-qualification-result/v1",
    campaignId: ready.campaignId,
    recordedAt: "2026-07-25T01:00:00.000Z",
    readyPlanSha256: digest(readyBytes),
    candidateId: ready.candidate.candidateId,
    cells,
    summary: null,
    dataDisposition: {
      retainedRawFrameCount: 0,
      returnedAudioBufferCount: 0,
      networkEgressBytes: 0,
      participantIdentifiersIncluded: false,
      pathsIncluded: false,
      freeTextIncluded: false,
    },
    claimBoundary: RESULT_CLAIM_BOUNDARY,
    limitations: RESULT_LIMITATIONS,
  };
  result.summary = deriveSummary(result, ready);
  return { result, readyBytes };
}

test("accepts an exact safe ready-plan transition", async () => {
  const ready = buildReadyPlan();
  assert.deepEqual(await validateReadySharedCameraPlan(ready, blockedPlan), {
    campaignId: "shared-wide-angle-uvc-camera-v1",
    targetCount: 3,
    scheduledCellCount: 40,
  });
});

test("derives a complete 40-cell qualified result without selecting the camera", async () => {
  const ready = buildReadyPlan();
  await validateReadySharedCameraPlan(ready, blockedPlan);
  const { result, readyBytes } = buildPassingResult(ready);
  assert.deepEqual(validateSharedCameraResult(result, ready, readyBytes), {
    passedCellCount: 40,
    rejectedCellCount: 0,
    incompleteCellCount: 0,
    qualifiedTargetIds: ready.targets.map((target) => target.id),
    cameraQualified: true,
    cameraSelected: false,
    purchaseAuthorized: false,
    productBomsChanged: false,
    disposition: "qualified",
  });
});

test("accepts honest incomplete evidence and withholds only the affected target", async () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  result.cells[4].attempts[0].status = "harness-invalid";
  result.cells[4].attempts[0].outcome = null;
  result.cells[4].attempts[0].code = "harness-invalid";
  result.cells[4].disposition = "incomplete";
  result.summary = deriveSummary(result, ready);

  const summary = validateSharedCameraResult(result, ready, readyBytes);
  assert.equal(summary.disposition, "incomplete");
  assert.deepEqual(summary.qualifiedTargetIds, ready.targets.slice(1).map((target) => target.id));
});

test("accepts an honest product failure and derives rejection", async () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);
  result.cells[5].attempts[0].outcome = "failed";
  result.cells[5].attempts[0].code = "product-failure";
  result.cells[5].disposition = "rejected";
  result.summary = deriveSummary(result, ready);

  const summary = validateSharedCameraResult(result, ready, readyBytes);
  assert.equal(summary.disposition, "rejected");
  assert.equal(summary.cameraQualified, false);
});

test("rejects immutable ready-plan drift and hidden fields", async () => {
  const source = buildReadyPlan();
  source.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateReadySharedCameraPlan(source, blockedPlan), /immutable projection/u);

  const check = buildReadyPlan();
  check.checks[0].requiredEvidence.pop();
  await assert.rejects(validateReadySharedCameraPlan(check, blockedPlan), /immutable projection/u);

  const hidden = buildReadyPlan();
  hidden.executionGate.provider = "unreviewed-provider";
  await assert.rejects(validateReadySharedCameraPlan(hidden, blockedPlan), /immutable projection/u);
});

test("rejects unsafe readiness, missing or reused digests, and capture-arrival authority", async () => {
  const selected = buildReadyPlan();
  selected.candidate.selected = true;
  await assert.rejects(validateReadySharedCameraPlan(selected, blockedPlan), /candidate.selected/u);

  const missing = buildReadyPlan();
  missing.executionGate.safetyReviewSha256 = null;
  await assert.rejects(validateReadySharedCameraPlan(missing, blockedPlan), /ready digest/u);

  const reused = buildReadyPlan();
  reused.executionGate.safetyReviewSha256 = reused.executionGate.participantProtocolSha256;
  await assert.rejects(validateReadySharedCameraPlan(reused, blockedPlan), /must not reuse/u);

  const arrival = buildReadyPlan();
  arrival.executionGate.exposureTimestampAuthority = "capture-arrival";
  await assert.rejects(validateReadySharedCameraPlan(arrival, blockedPlan), /approved exposure/u);
});

test("rejects unsafe schedules, post-result thresholds, and weakened privacy", async () => {
  const noAttempts = buildReadyPlan();
  noAttempts.schedule.attemptsPerCell = 0;
  await assert.rejects(validateReadySharedCameraPlan(noAttempts, blockedPlan), /attemptsPerCell/u);

  const reordered = buildReadyPlan();
  reordered.schedule.counterbalancedOrder.reverse();
  await assert.rejects(validateReadySharedCameraPlan(reordered, blockedPlan), /counterbalancedOrder/u);

  const invalidDropGate = buildReadyPlan();
  invalidDropGate.acceptance.maximumDroppedFrameRate = 2;
  await assert.rejects(validateReadySharedCameraPlan(invalidDropGate, blockedPlan), /maximumDroppedFrameRate/u);

  const retained = buildReadyPlan();
  retained.dataPolicy.rawFrameRetentionAllowed = true;
  await assert.rejects(validateReadySharedCameraPlan(retained, blockedPlan), /raw frame retention/u);

  const selected = buildReadyPlan();
  selected.resultBoundary.cameraSelected = true;
  await assert.rejects(validateReadySharedCameraPlan(selected, blockedPlan), /camera selection/u);
});

test("binds result identity, date, candidate, and exact ready-plan bytes", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  const planHash = structuredClone(result);
  planHash.readyPlanSha256 = "0".repeat(64);
  assert.throws(() => validateSharedCameraResult(planHash, ready, readyBytes), /readyPlanSha256/u);

  const candidate = structuredClone(result);
  candidate.candidateId = "substituted-camera";
  assert.throws(() => validateSharedCameraResult(candidate, ready, readyBytes), /candidateId/u);

  const old = structuredClone(result);
  old.recordedAt = "2026-07-24T23:59:59.000Z";
  assert.throws(() => validateSharedCameraResult(old, ready, readyBytes), /must not precede/u);
});

test("rejects missing, duplicated, reordered, or substituted cells and evidence", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  const missing = structuredClone(result);
  missing.cells.pop();
  assert.throws(() => validateSharedCameraResult(missing, ready, readyBytes), /exactly 40/u);

  const reordered = structuredClone(result);
  [reordered.cells[0], reordered.cells[1]] = [reordered.cells[1], reordered.cells[0]];
  assert.throws(() => validateSharedCameraResult(reordered, ready, readyBytes), /\.index/u);

  const evidenceId = structuredClone(result);
  evidenceId.cells[0].requiredEvidence[0].id = "paper-claim";
  assert.throws(() => validateSharedCameraResult(evidenceId, ready, readyBytes), /\.id/u);

  const reused = structuredClone(result);
  reused.cells[1].requiredEvidence[0].sha256 = reused.cells[0].requiredEvidence[0].sha256;
  assert.throws(() => validateSharedCameraResult(reused, ready, readyBytes), /must not reuse/u);
});

test("rejects attempt omission, ordering drift, unsafe codes, and promoted dispositions", () => {
  const ready = buildReadyPlan();
  ready.schedule.attemptsPerCell = 2;
  const { result, readyBytes } = buildPassingResult(ready);

  const omitted = structuredClone(result);
  omitted.cells[0].attempts.pop();
  assert.throws(() => validateSharedCameraResult(omitted, ready, readyBytes), /exactly 2/u);

  const ordinal = structuredClone(result);
  ordinal.cells[0].attempts[0].ordinal = 2;
  assert.throws(() => validateSharedCameraResult(ordinal, ready, readyBytes), /\.ordinal/u);

  const code = structuredClone(result);
  code.cells[0].attempts[0].code = "provider said this was probably okay";
  assert.throws(() => validateSharedCameraResult(code, ready, readyBytes), /safe bounded code/u);

  const promoted = structuredClone(result);
  promoted.cells[0].attempts[0].status = "stopped";
  promoted.cells[0].attempts[0].outcome = null;
  promoted.cells[0].attempts[0].code = "stopped";
  assert.throws(() => validateSharedCameraResult(promoted, ready, readyBytes), /disposition/u);
});

test("rejects raw frames, audio buffers, egress, paths, identifiers, and free text", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  for (const key of [
    "retainedRawFrameCount",
    "returnedAudioBufferCount",
    "networkEgressBytes",
  ]) {
    const unsafe = structuredClone(result);
    unsafe.cells[0].attempts[0][key] = 1;
    assert.throws(() => validateSharedCameraResult(unsafe, ready, readyBytes), /count|bytes/u);
  }

  for (const key of ["participantIdentifiersIncluded", "pathsIncluded", "freeTextIncluded"]) {
    const unsafe = structuredClone(result);
    unsafe.dataDisposition[key] = true;
    assert.throws(() => validateSharedCameraResult(unsafe, ready, readyBytes), /dataDisposition/u);
  }
});

test("rejects summary rescue, target promotion, selection, purchase, and BOM mutation", () => {
  const ready = buildReadyPlan();
  const { result, readyBytes } = buildPassingResult(ready);

  const hiddenFailure = structuredClone(result);
  hiddenFailure.cells[4].attempts[0].outcome = "failed";
  hiddenFailure.cells[4].attempts[0].code = "product-failure";
  hiddenFailure.cells[4].disposition = "rejected";
  assert.throws(() => validateSharedCameraResult(hiddenFailure, ready, readyBytes), /result.summary/u);

  for (const key of ["cameraSelected", "purchaseAuthorized", "productBomsChanged"]) {
    const promoted = structuredClone(result);
    promoted.summary[key] = true;
    assert.throws(() => validateSharedCameraResult(promoted, ready, readyBytes), /result.summary/u);
  }
});

test("requires canonical bounded ready-plan and result envelopes", () => {
  const ready = buildReadyPlan();
  const { result } = buildPassingResult(ready);
  const readyBytes = canonicalBytes(ready);
  const resultBytes = canonicalBytes(result);
  assert.deepEqual(parseCanonicalReadySharedCameraPlan(readyBytes), ready);
  assert.deepEqual(parseCanonicalSharedCameraResult(resultBytes), result);

  assert.throws(
    () => parseCanonicalReadySharedCameraPlan(Buffer.from(JSON.stringify(ready))),
    /canonical two-space JSON/u,
  );
  assert.throws(
    () =>
      parseCanonicalSharedCameraResult(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), resultBytes]),
      ),
    /must not contain a UTF-8 BOM/u,
  );
  assert.throws(
    () => parseCanonicalSharedCameraResult(new Uint8Array([0xff])),
    /valid UTF-8/u,
  );
  assert.throws(
    () => parseCanonicalSharedCameraResult(Buffer.alloc(MAX_SHARED_CAMERA_RESULT_BYTES + 1)),
    /must be between 1 and/u,
  );
});
