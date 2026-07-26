import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  parseCanonicalSharedCameraPlan,
  validateSharedCameraPlan,
} from "./validate-shared-camera-qualification-plan.mjs";

export const MAX_READY_SHARED_CAMERA_PLAN_BYTES = 128 * 1024;
export const MAX_SHARED_CAMERA_RESULT_BYTES = 16 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const READY_QUALIFICATION = "ready-plan-no-results";
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

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  if (!isDeepStrictEqual(Object.keys(value), keys)) {
    fail(`${label} fields must be exactly ${keys.join(", ")}`);
  }
}

function assertExact(value, expected, label) {
  if (!isDeepStrictEqual(value, expected)) {
    fail(`${label} does not match the bound qualification contract`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertBoundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
}

function assertBoundedNumber(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be a finite number from ${minimum} through ${maximum}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function parseCanonicalJson(bytes, maximumBytes, label) {
  if (!(bytes instanceof Uint8Array)) {
    fail(`${label} bytes must be a Uint8Array`);
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    fail(`${label} must be between 1 and ${maximumBytes} bytes`);
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${label} must not contain a UTF-8 BOM`);
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} must be valid UTF-8`);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} must contain valid JSON`);
  }
  assertPlainObject(value, label);
  if (text !== `${JSON.stringify(value, null, 2)}\n`) {
    fail(`${label} must use canonical two-space JSON with one trailing newline`);
  }
  return value;
}

export function parseCanonicalReadySharedCameraPlan(bytes) {
  return parseCanonicalJson(
    bytes,
    MAX_READY_SHARED_CAMERA_PLAN_BYTES,
    "ready shared-camera plan",
  );
}

export function parseCanonicalSharedCameraResult(bytes) {
  return parseCanonicalJson(bytes, MAX_SHARED_CAMERA_RESULT_BYTES, "shared-camera result");
}

function collectReadyDigests(readyPlan) {
  const digests = [
    readyPlan.candidate.deliveredQuoteSha256,
    readyPlan.candidate.receiptSha256,
    readyPlan.candidate.receivedDeviceIdentitySha256,
    ...Object.entries(readyPlan.executionGate)
      .filter(([key]) => key.endsWith("Sha256"))
      .map(([, value]) => value),
    ...readyPlan.targets.flatMap((target) =>
      Object.entries(target)
        .filter(([key]) => key.endsWith("Sha256"))
        .map(([, value]) => value),
    ),
  ];
  for (const [index, digest] of digests.entries()) {
    assertSha256(digest, `ready digest[${index}]`);
  }
  if (new Set(digests).size !== digests.length) {
    fail("ready plan must not reuse evidence digests across distinct bindings");
  }
}

function restoreKnownFields(projection, blockedPlan, objectKey) {
  for (const key of Object.keys(blockedPlan[objectKey])) {
    projection[objectKey][key] = clone(blockedPlan[objectKey][key]);
  }
}

export async function validateReadySharedCameraPlan(
  readyPlan,
  blockedPlan,
  options,
) {
  await validateSharedCameraPlan(blockedPlan, options);
  assertExactKeys(readyPlan, Object.keys(blockedPlan), "ready shared-camera plan");
  assertExact(readyPlan.format, blockedPlan.format, "ready format");
  assertExact(readyPlan.campaignId, blockedPlan.campaignId, "ready campaignId");
  assertExact(readyPlan.createdAt, blockedPlan.createdAt, "ready createdAt");
  assertExact(readyPlan.qualification, READY_QUALIFICATION, "ready qualification");

  assertExact(readyPlan.candidate.candidateId, blockedPlan.candidate.candidateId, "candidateId");
  assertExact(readyPlan.candidate.selected, false, "candidate.selected");
  assertExact(readyPlan.candidate.ordered, true, "candidate.ordered");
  assertExact(readyPlan.candidate.purchaseAuthorized, false, "candidate.purchaseAuthorized");
  assertSha256(readyPlan.candidate.deliveredQuoteSha256, "candidate.deliveredQuoteSha256");
  assertSha256(readyPlan.candidate.receiptSha256, "candidate.receiptSha256");
  assertSha256(
    readyPlan.candidate.receivedDeviceIdentitySha256,
    "candidate.receivedDeviceIdentitySha256",
  );

  assertExact(readyPlan.executionGate.status, "ready", "executionGate.status");
  assertExact(
    readyPlan.executionGate.selectedCandidateId,
    blockedPlan.candidate.candidateId,
    "executionGate.selectedCandidateId",
  );
  if (
    ![
      "hardware-exposure-start",
      "hardware-exposure-midpoint-with-start-uncertainty",
      "independently-validated-driver-exposure",
    ].includes(readyPlan.executionGate.exposureTimestampAuthority)
  ) {
    fail("executionGate.exposureTimestampAuthority is not an approved exposure authority");
  }
  assertExact(readyPlan.executionGate.blockerCodes, [], "executionGate.blockerCodes");

  assertExact(readyPlan.targets.length, blockedPlan.targets.length, "ready target count");
  for (const [index, target] of readyPlan.targets.entries()) {
    assertExact(target.id, blockedPlan.targets[index].id, `targets[${index}].id`);
    assertExact(target.role, blockedPlan.targets[index].role, `targets[${index}].role`);
    assertExact(target.required, true, `targets[${index}].required`);
  }

  assertBoundedInteger(readyPlan.schedule.attemptsPerCell, 1, 100, "attemptsPerCell");
  assertBoundedInteger(
    readyPlan.schedule.sustainedCaptureDurationMs,
    60_000,
    86_400_000,
    "sustainedCaptureDurationMs",
  );
  assertBoundedInteger(
    readyPlan.schedule.hotPlugCyclesPerTarget,
    1,
    100,
    "hotPlugCyclesPerTarget",
  );
  assertBoundedInteger(
    readyPlan.schedule.suspendResumeCyclesPerTarget,
    1,
    100,
    "suspendResumeCyclesPerTarget",
  );
  assertExact(
    readyPlan.schedule.counterbalancedOrder,
    readyPlan.targets.map((target) => target.id),
    "counterbalancedOrder",
  );

  assertBoundedInteger(
    readyPlan.acceptance.minimumHorizontalFieldOfViewMilliDegrees,
    1,
    180_000,
    "minimumHorizontalFieldOfViewMilliDegrees",
  );
  assertBoundedInteger(
    readyPlan.acceptance.minimumVerticalFieldOfViewMilliDegrees,
    1,
    180_000,
    "minimumVerticalFieldOfViewMilliDegrees",
  );
  assertBoundedNumber(
    readyPlan.acceptance.maximumDistortionError,
    0,
    1,
    "maximumDistortionError",
  );
  assertBoundedNumber(
    readyPlan.acceptance.maximumDroppedFrameRate,
    0,
    1,
    "maximumDroppedFrameRate",
  );
  assertBoundedInteger(
    readyPlan.acceptance.maximumP95ExposureTimeUs,
    1,
    1_000_000,
    "maximumP95ExposureTimeUs",
  );
  assertBoundedInteger(
    readyPlan.acceptance.minimumLowLightIlluminanceMilliLux,
    1,
    10_000_000,
    "minimumLowLightIlluminanceMilliLux",
  );
  assertBoundedInteger(
    readyPlan.acceptance.maximumReconnectTimeMs,
    1,
    600_000,
    "maximumReconnectTimeMs",
  );
  assertBoundedInteger(
    readyPlan.acceptance.maximumResumeRecoveryTimeMs,
    1,
    600_000,
    "maximumResumeRecoveryTimeMs",
  );
  assertBoundedInteger(
    readyPlan.acceptance.maximumDeliveredPriceCents,
    1,
    10_000_000,
    "maximumDeliveredPriceCents",
  );

  assertExact(readyPlan.dataPolicy.temporaryFrameAnalysisAuthorized, true, "frame authority");
  assertExact(readyPlan.dataPolicy.rawRoomVideoDefault, false, "raw room video default");
  assertExact(readyPlan.dataPolicy.rawFrameRetentionAllowed, false, "raw frame retention");
  assertExact(readyPlan.dataPolicy.rawFrameNetworkEgressAllowed, false, "raw frame egress");
  assertExact(readyPlan.dataPolicy.skeletonAndNumericReleaseOnly, true, "release boundary");
  assertExact(readyPlan.dataPolicy.participantIdentifiersAllowed, false, "participant IDs");
  assertExact(readyPlan.dataPolicy.freeTextAllowed, false, "free text");

  assertExact(readyPlan.resultBoundary.resultArtifactSha256, null, "result digest");
  assertExact(readyPlan.resultBoundary.qualifiedTargetIds, [], "qualified targets");
  assertExact(readyPlan.resultBoundary.cameraQualified, false, "camera qualification");
  assertExact(readyPlan.resultBoundary.cameraSelected, false, "camera selection");
  assertExact(readyPlan.resultBoundary.purchaseAuthorized, false, "purchase authority");
  assertExact(readyPlan.resultBoundary.productBomsChanged, false, "BOM mutation");
  assertExact(readyPlan.resultBoundary.executionAuthorized, true, "execution authority");
  assertExact(readyPlan.claimBoundary, READY_CLAIM_BOUNDARY, "ready claimBoundary");
  assertExact(readyPlan.limitations, READY_LIMITATIONS, "ready limitations");
  collectReadyDigests(readyPlan);

  const projection = clone(readyPlan);
  projection.qualification = blockedPlan.qualification;
  for (const key of Object.keys(blockedPlan.candidate)) {
    projection.candidate[key] = clone(blockedPlan.candidate[key]);
  }
  for (const key of Object.keys(blockedPlan.executionGate)) {
    projection.executionGate[key] = clone(blockedPlan.executionGate[key]);
  }
  for (const [index, blockedTarget] of blockedPlan.targets.entries()) {
    for (const key of Object.keys(blockedTarget)) {
      projection.targets[index][key] = clone(blockedTarget[key]);
    }
  }
  restoreKnownFields(projection, blockedPlan, "schedule");
  restoreKnownFields(projection, blockedPlan, "acceptance");
  restoreKnownFields(projection, blockedPlan, "dataPolicy");
  restoreKnownFields(projection, blockedPlan, "resultBoundary");
  projection.claimBoundary = blockedPlan.claimBoundary;
  projection.limitations = clone(blockedPlan.limitations);
  assertExact(projection, blockedPlan, "ready plan immutable projection");

  return {
    campaignId: readyPlan.campaignId,
    targetCount: readyPlan.targets.length,
    scheduledCellCount: readyPlan.schedule.scheduledCellCount,
  };
}

export function expandSharedCameraCells(readyPlan) {
  const cells = [];
  for (const check of readyPlan.checks) {
    if (check.scope === "shared-camera") {
      cells.push({ check, targetId: null });
    } else {
      for (const targetId of check.targetIds) {
        cells.push({ check, targetId });
      }
    }
  }
  return cells;
}

function expectedAttemptCount(readyPlan, checkId) {
  if (checkId === "hot-plug-and-reconnect") {
    return readyPlan.schedule.hotPlugCyclesPerTarget;
  }
  if (checkId === "suspend-resume") {
    return readyPlan.schedule.suspendResumeCyclesPerTarget;
  }
  return readyPlan.schedule.attemptsPerCell;
}

function deriveCellDisposition(cell) {
  if (cell.attempts.some((attempt) => attempt.status === "valid" && attempt.outcome === "failed")) {
    return "rejected";
  }
  if (
    cell.requiredEvidence.some((entry) => entry.sha256 === null) ||
    cell.attempts.some((attempt) => attempt.status !== "valid")
  ) {
    return "incomplete";
  }
  return "passed";
}

function validateResultCell(cell, expected, index, readyPlan, usedDigests) {
  assertExactKeys(
    cell,
    ["index", "checkId", "targetId", "requiredEvidence", "attempts", "disposition"],
    `cells[${index}]`,
  );
  assertExact(cell.index, index, `cells[${index}].index`);
  assertExact(cell.checkId, expected.check.id, `cells[${index}].checkId`);
  assertExact(cell.targetId, expected.targetId, `cells[${index}].targetId`);

  if (
    !Array.isArray(cell.requiredEvidence) ||
    cell.requiredEvidence.length !== expected.check.requiredEvidence.length
  ) {
    fail(`cells[${index}].requiredEvidence must preserve the complete evidence inventory`);
  }
  for (const [evidenceIndex, evidence] of cell.requiredEvidence.entries()) {
    assertExactKeys(evidence, ["id", "sha256"], `cells[${index}].requiredEvidence[${evidenceIndex}]`);
    assertExact(
      evidence.id,
      expected.check.requiredEvidence[evidenceIndex],
      `cells[${index}].requiredEvidence[${evidenceIndex}].id`,
    );
    if (evidence.sha256 !== null) {
      assertSha256(evidence.sha256, `cells[${index}].requiredEvidence[${evidenceIndex}].sha256`);
      if (usedDigests.has(evidence.sha256)) {
        fail("result must not reuse evidence digests across distinct artifacts");
      }
      usedDigests.add(evidence.sha256);
    }
  }

  const attemptCount = expectedAttemptCount(readyPlan, cell.checkId);
  if (!Array.isArray(cell.attempts) || cell.attempts.length !== attemptCount) {
    fail(`cells[${index}].attempts must contain exactly ${attemptCount} entries`);
  }
  for (const [attemptIndex, attempt] of cell.attempts.entries()) {
    assertExactKeys(
      attempt,
      [
        "ordinal",
        "status",
        "outcome",
        "evidenceSha256",
        "elapsedMs",
        "code",
        "retainedRawFrameCount",
        "returnedAudioBufferCount",
        "networkEgressBytes",
      ],
      `cells[${index}].attempts[${attemptIndex}]`,
    );
    assertExact(attempt.ordinal, attemptIndex + 1, `cells[${index}].attempts[${attemptIndex}].ordinal`);
    if (!["valid", "harness-invalid", "stopped"].includes(attempt.status)) {
      fail(`cells[${index}].attempts[${attemptIndex}].status is not allowed`);
    }
    assertSha256(attempt.evidenceSha256, `cells[${index}].attempts[${attemptIndex}].evidenceSha256`);
    if (usedDigests.has(attempt.evidenceSha256)) {
      fail("result must not reuse evidence digests across distinct artifacts");
    }
    usedDigests.add(attempt.evidenceSha256);
    assertBoundedInteger(
      attempt.elapsedMs,
      0,
      86_400_000,
      `cells[${index}].attempts[${attemptIndex}].elapsedMs`,
    );
    if (typeof attempt.code !== "string" || !SAFE_CODE_PATTERN.test(attempt.code)) {
      fail(`cells[${index}].attempts[${attemptIndex}].code must be a safe bounded code`);
    }
    if (attempt.status === "valid") {
      if (!["passed", "failed"].includes(attempt.outcome)) {
        fail(`cells[${index}].attempts[${attemptIndex}].outcome must record a valid outcome`);
      }
      assertExact(
        attempt.code,
        attempt.outcome === "passed" ? "ok" : "product-failure",
        `cells[${index}].attempts[${attemptIndex}].code`,
      );
    } else {
      assertExact(attempt.outcome, null, `cells[${index}].attempts[${attemptIndex}].outcome`);
      assertExact(attempt.code, attempt.status, `cells[${index}].attempts[${attemptIndex}].code`);
    }
    assertExact(attempt.retainedRawFrameCount, 0, "retained raw frame count");
    assertExact(attempt.returnedAudioBufferCount, 0, "returned audio buffer count");
    assertExact(attempt.networkEgressBytes, 0, "network egress bytes");
  }

  assertExact(cell.disposition, deriveCellDisposition(cell), `cells[${index}].disposition`);
}

function deriveSummary(cells, expectedCells, readyPlan) {
  const passedCellCount = cells.filter((cell) => cell.disposition === "passed").length;
  const rejectedCellCount = cells.filter((cell) => cell.disposition === "rejected").length;
  const incompleteCellCount = cells.filter((cell) => cell.disposition === "incomplete").length;
  const sharedPass = cells.every(
    (cell, index) => expectedCells[index].targetId !== null || cell.disposition === "passed",
  );
  const qualifiedTargetIds = readyPlan.targets
    .filter((target) =>
      sharedPass &&
      cells.every(
        (cell, index) =>
          expectedCells[index].targetId !== target.id || cell.disposition === "passed",
      ),
    )
    .map((target) => target.id);
  const cameraQualified = passedCellCount === cells.length;
  return {
    passedCellCount,
    rejectedCellCount,
    incompleteCellCount,
    qualifiedTargetIds,
    cameraQualified,
    cameraSelected: false,
    purchaseAuthorized: false,
    productBomsChanged: false,
    disposition:
      rejectedCellCount > 0 ? "rejected" : incompleteCellCount > 0 ? "incomplete" : "qualified",
  };
}

export function validateSharedCameraResult(result, readyPlan, readyPlanBytes) {
  assertExactKeys(
    result,
    [
      "format",
      "campaignId",
      "recordedAt",
      "readyPlanSha256",
      "candidateId",
      "cells",
      "summary",
      "dataDisposition",
      "claimBoundary",
      "limitations",
    ],
    "shared-camera result",
  );
  assertExact(result.format, "vcg-shared-camera-qualification-result/v1", "result format");
  assertExact(result.campaignId, readyPlan.campaignId, "result campaignId");
  const recordedAtMs = Date.parse(result.recordedAt);
  if (!Number.isFinite(recordedAtMs) || new Date(recordedAtMs).toISOString() !== result.recordedAt) {
    fail("result.recordedAt must be a canonical ISO timestamp");
  }
  if (recordedAtMs < Date.parse(readyPlan.createdAt)) {
    fail("result.recordedAt must not precede the ready plan");
  }
  assertExact(result.readyPlanSha256, sha256(readyPlanBytes), "readyPlanSha256");
  assertExact(result.candidateId, readyPlan.candidate.candidateId, "result candidateId");

  const expectedCells = expandSharedCameraCells(readyPlan);
  if (!Array.isArray(result.cells) || result.cells.length !== expectedCells.length) {
    fail(`result.cells must contain exactly ${expectedCells.length} ordered cells`);
  }
  const usedDigests = new Set();
  for (const [index, cell] of result.cells.entries()) {
    validateResultCell(cell, expectedCells[index], index, readyPlan, usedDigests);
  }

  assertExactKeys(
    result.summary,
    [
      "passedCellCount",
      "rejectedCellCount",
      "incompleteCellCount",
      "qualifiedTargetIds",
      "cameraQualified",
      "cameraSelected",
      "purchaseAuthorized",
      "productBomsChanged",
      "disposition",
    ],
    "result.summary",
  );
  assertExact(result.summary, deriveSummary(result.cells, expectedCells, readyPlan), "result.summary");
  assertExact(
    result.dataDisposition,
    {
      retainedRawFrameCount: 0,
      returnedAudioBufferCount: 0,
      networkEgressBytes: 0,
      participantIdentifiersIncluded: false,
      pathsIncluded: false,
      freeTextIncluded: false,
    },
    "result.dataDisposition",
  );
  assertExact(result.claimBoundary, RESULT_CLAIM_BOUNDARY, "result.claimBoundary");
  assertExact(result.limitations, RESULT_LIMITATIONS, "result.limitations");

  return result.summary;
}

export async function validateSharedCameraResultFiles(
  blockedPlanPath,
  readyPlanPath,
  resultPath,
  options,
) {
  const blockedPlanBytes = await readFile(blockedPlanPath);
  const readyPlanBytes = await readFile(readyPlanPath);
  const resultBytes = await readFile(resultPath);
  const blockedPlan = parseCanonicalSharedCameraPlan(blockedPlanBytes);
  const readyPlan = parseCanonicalReadySharedCameraPlan(readyPlanBytes);
  await validateReadySharedCameraPlan(readyPlan, blockedPlan, options);
  return validateSharedCameraResult(
    parseCanonicalSharedCameraResult(resultBytes),
    readyPlan,
    readyPlanBytes,
  );
}
