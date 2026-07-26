import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_SHARED_CAMERA_PLAN_BYTES,
  SHARED_CAMERA_PLAN_PATH,
  parseCanonicalSharedCameraPlan,
  validateSharedCameraPlan,
} from "./validate-shared-camera-qualification-plan.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const PLAN_PATH = join(REPOSITORY_ROOT, ...SHARED_CAMERA_PLAN_PATH.split("/"));
const trackedBytes = await readFile(PLAN_PATH);
const trackedPlan = parseCanonicalSharedCameraPlan(trackedBytes);

const clonePlan = () => structuredClone(trackedPlan);
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

test("accepts the tracked blocked 40-cell shared-camera plan", async () => {
  assert.deepEqual(await validateSharedCameraPlan(clonePlan()), {
    campaignId: "shared-wide-angle-uvc-camera-v1",
    status: "blocked",
    targetCount: 3,
    checkCount: 18,
    scheduledCellCount: 40,
  });
});

test("rejects stale, substituted, reordered, or unsafe source bindings", async () => {
  const stale = clonePlan();
  stale.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(validateSharedCameraPlan(stale), /current-source binding/u);

  const unsafe = clonePlan();
  unsafe.sourceBindings[0].path = "../quote.md";
  await assert.rejects(validateSharedCameraPlan(unsafe), /\.path/u);

  const reordered = clonePlan();
  [reordered.sourceBindings[0], reordered.sourceBindings[1]] = [
    reordered.sourceBindings[1],
    reordered.sourceBindings[0],
  ];
  await assert.rejects(validateSharedCameraPlan(reordered), /\.path/u);
});

test("keeps the Brio record a merchandise candidate only", async () => {
  const selected = clonePlan();
  selected.candidate.selected = true;
  await assert.rejects(validateSharedCameraPlan(selected), /candidate/u);

  const ordered = clonePlan();
  ordered.candidate.ordered = true;
  await assert.rejects(validateSharedCameraPlan(ordered), /candidate/u);

  const purchased = clonePlan();
  purchased.candidate.purchaseAuthorized = true;
  await assert.rejects(validateSharedCameraPlan(purchased), /candidate/u);

  const inventedReceipt = clonePlan();
  inventedReceipt.candidate.receiptSha256 = "a".repeat(64);
  await assert.rejects(validateSharedCameraPlan(inventedReceipt), /candidate/u);

  const promotedClaim = clonePlan();
  promotedClaim.candidate.advertisedClaimsOnly[1] = "qualified-1920x1080-at-60-fps";
  await assert.rejects(validateSharedCameraPlan(promotedClaim), /candidate/u);
});

test("rejects target omission, reordering, substitution, and fabricated identity", async () => {
  const omitted = clonePlan();
  omitted.targets.pop();
  await assert.rejects(validateSharedCameraPlan(omitted), /targets/u);

  const reordered = clonePlan();
  [reordered.targets[0], reordered.targets[1]] = [reordered.targets[1], reordered.targets[0]];
  await assert.rejects(validateSharedCameraPlan(reordered), /targets/u);

  const windowsSubstitution = clonePlan();
  windowsSubstitution.targets[0].id = "windows-fallback";
  await assert.rejects(validateSharedCameraPlan(windowsSubstitution), /targets/u);

  const fabricated = clonePlan();
  fabricated.targets[0].hardwareInventorySha256 = "b".repeat(64);
  await assert.rejects(validateSharedCameraPlan(fabricated), /targets/u);
});

test("rejects missing, reordered, renamed, or weakened checks", async () => {
  const omitted = clonePlan();
  omitted.checks.pop();
  await assert.rejects(validateSharedCameraPlan(omitted), /checks/u);

  const reordered = clonePlan();
  [reordered.checks[4], reordered.checks[5]] = [reordered.checks[5], reordered.checks[4]];
  await assert.rejects(validateSharedCameraPlan(reordered), /\.id/u);

  const renamed = clonePlan();
  renamed.checks[5].id = "paper-mode-claim";
  await assert.rejects(validateSharedCameraPlan(renamed), /\.id/u);

  const missingEvidence = clonePlan();
  missingEvidence.checks[10].requiredEvidence.pop();
  await assert.rejects(validateSharedCameraPlan(missingEvidence), /evidence inventory digest/u);

  const substitutedEvidence = clonePlan();
  substitutedEvidence.checks[11].requiredEvidence[0] = "inference-only-latency";
  await assert.rejects(validateSharedCameraPlan(substitutedEvidence), /evidence inventory digest/u);
});

test("derives all 40 shared, per-target, and packaging cells", async () => {
  const wrongScope = clonePlan();
  wrongScope.checks[4].scope = "shared-camera";
  await assert.rejects(validateSharedCameraPlan(wrongScope), /\.scope/u);

  const missingTarget = clonePlan();
  missingTarget.checks[4].targetIds.pop();
  await assert.rejects(validateSharedCameraPlan(missingTarget), /\.targetIds/u);

  const wrongPackaging = clonePlan();
  wrongPackaging.checks[15].targetIds = [
    "raspberry-pi5-ai-hat-integrated-camera",
  ];
  await assert.rejects(validateSharedCameraPlan(wrongPackaging), /\.targetIds/u);

  const falseCount = clonePlan();
  falseCount.schedule.scheduledCellCount = 39;
  await assert.rejects(validateSharedCameraPlan(falseCount), /schedule/u);
});

test("preserves genuine 1920x1080 at 60 FPS and D-110 latency gates", async () => {
  const width = clonePlan();
  width.acceptance.requiredCaptureWidth = 1280;
  await assert.rejects(validateSharedCameraPlan(width), /acceptance/u);

  const fps = clonePlan();
  fps.acceptance.requiredFramesPerSecondNumerator = 30;
  await assert.rejects(validateSharedCameraPlan(fps), /acceptance/u);

  const latency = clonePlan();
  latency.acceptance.maximumP95ExposureToGameApiMs = 121;
  await assert.rejects(validateSharedCameraPlan(latency), /acceptance/u);

  const defaultAudio = clonePlan();
  defaultAudio.acceptance.audioCaptureAllowedByDefault = true;
  await assert.rejects(validateSharedCameraPlan(defaultAudio), /acceptance/u);
});

test("rejects post-result thresholds and aggregate rescue", async () => {
  const inventedFov = clonePlan();
  inventedFov.acceptance.minimumHorizontalFieldOfViewMilliDegrees = 90000;
  await assert.rejects(validateSharedCameraPlan(inventedFov), /acceptance/u);

  const inventedDrops = clonePlan();
  inventedDrops.acceptance.maximumDroppedFrameRate = 0.01;
  await assert.rejects(validateSharedCameraPlan(inventedDrops), /acceptance/u);

  const inventedPrice = clonePlan();
  inventedPrice.acceptance.maximumDeliveredPriceCents = 16999;
  await assert.rejects(validateSharedCameraPlan(inventedPrice), /acceptance/u);

  const rescue = clonePlan();
  rescue.acceptance.aggregateMayRescueFailedCell = true;
  await assert.rejects(validateSharedCameraPlan(rescue), /acceptance/u);

  const unknownPass = clonePlan();
  unknownPass.acceptance.unknownOrNotRunMayPass = true;
  await assert.rejects(validateSharedCameraPlan(unknownPass), /acceptance/u);
});

test("keeps every execution identity, schedule, and authority blocked", async () => {
  const ready = clonePlan();
  ready.executionGate.status = "ready";
  await assert.rejects(validateSharedCameraPlan(ready), /executionGate/u);

  const selected = clonePlan();
  selected.executionGate.selectedCandidateId = trackedPlan.candidate.candidateId;
  await assert.rejects(validateSharedCameraPlan(selected), /executionGate/u);

  const captureArrival = clonePlan();
  captureArrival.executionGate.exposureTimestampAuthority = "capture-arrival";
  await assert.rejects(validateSharedCameraPlan(captureArrival), /executionGate/u);

  const attempts = clonePlan();
  attempts.schedule.attemptsPerCell = 1;
  await assert.rejects(validateSharedCameraPlan(attempts), /schedule/u);

  const missingBlocker = clonePlan();
  missingBlocker.executionGate.blockerCodes.pop();
  await assert.rejects(validateSharedCameraPlan(missingBlocker), /executionGate/u);
});

test("rejects raw collection, retention, egress, identity, and free text", async () => {
  for (const key of [
    "temporaryFrameAnalysisAuthorized",
    "rawRoomVideoDefault",
    "rawFrameRetentionAllowed",
    "rawFrameNetworkEgressAllowed",
    "participantIdentifiersAllowed",
    "freeTextAllowed",
  ]) {
    const plan = clonePlan();
    plan.dataPolicy[key] = true;
    await assert.rejects(validateSharedCameraPlan(plan), /dataPolicy/u);
  }

  const weakenedRelease = clonePlan();
  weakenedRelease.dataPolicy.skeletonAndNumericReleaseOnly = false;
  await assert.rejects(validateSharedCameraPlan(weakenedRelease), /dataPolicy/u);
});

test("rejects premature results, qualification, selection, purchase, and BOM mutation", async () => {
  const result = clonePlan();
  result.resultBoundary.resultArtifactSha256 = "c".repeat(64);
  await assert.rejects(validateSharedCameraPlan(result), /resultBoundary/u);

  const target = clonePlan();
  target.resultBoundary.qualifiedTargetIds = [trackedPlan.targets[0].id];
  await assert.rejects(validateSharedCameraPlan(target), /resultBoundary/u);

  for (const key of [
    "cameraQualified",
    "cameraSelected",
    "purchaseAuthorized",
    "productBomsChanged",
    "executionAuthorized",
  ]) {
    const plan = clonePlan();
    plan.resultBoundary[key] = true;
    await assert.rejects(validateSharedCameraPlan(plan), /resultBoundary/u);
  }
});

test("rejects claim-boundary weakening, limitation drift, and unknown fields", async () => {
  const promoted = clonePlan();
  promoted.claimBoundary = "The camera is qualified.";
  await assert.rejects(validateSharedCameraPlan(promoted), /claimBoundary/u);

  const missingLimitation = clonePlan();
  missingLimitation.limitations.pop();
  await assert.rejects(validateSharedCameraPlan(missingLimitation), /limitations/u);

  const unknown = clonePlan();
  unknown.displayName = "Selected family camera";
  await assert.rejects(validateSharedCameraPlan(unknown), /fields must be exactly/u);
});

test("rejects noncanonical, duplicate, BOM, invalid UTF-8, and oversized bytes", async () => {
  assert.throws(
    () => parseCanonicalSharedCameraPlan(Buffer.from(JSON.stringify(trackedPlan))),
    /canonical two-space JSON/u,
  );

  const duplicate = trackedBytes
    .toString("utf8")
    .replace(
      '  "format": "vcg-shared-camera-qualification-plan/v1",',
      '  "format": "vcg-shared-camera-qualification-plan/v1",\n  "format": "vcg-shared-camera-qualification-plan/v1",',
    );
  assert.throws(
    () => parseCanonicalSharedCameraPlan(Buffer.from(duplicate)),
    /canonical two-space JSON/u,
  );
  assert.throws(
    () =>
      parseCanonicalSharedCameraPlan(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedBytes]),
      ),
    /must not contain a UTF-8 BOM/u,
  );
  assert.throws(
    () => parseCanonicalSharedCameraPlan(new Uint8Array([0xff])),
    /valid UTF-8/u,
  );
  assert.throws(
    () => parseCanonicalSharedCameraPlan(Buffer.alloc(MAX_SHARED_CAMERA_PLAN_BYTES + 1)),
    /must be between 1 and/u,
  );

  const reordered = {
    campaignId: trackedPlan.campaignId,
    format: trackedPlan.format,
    ...Object.fromEntries(
      Object.entries(trackedPlan).filter(
        ([key]) => key !== "campaignId" && key !== "format",
      ),
    ),
  };
  await assert.rejects(
    validateSharedCameraPlan(parseCanonicalSharedCameraPlan(canonicalBytes(reordered))),
    /fields must be exactly/u,
  );
});
