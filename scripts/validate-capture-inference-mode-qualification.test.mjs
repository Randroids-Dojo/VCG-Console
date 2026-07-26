import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CAPTURE_INFERENCE_MODE_PLAN_PATH,
  MAX_CAPTURE_INFERENCE_MODE_PLAN_BYTES,
  parseCanonicalCaptureInferenceModePlan,
  validateCaptureInferenceModePlan,
} from "./validate-capture-inference-mode-qualification.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const PLAN_PATH = join(
  REPOSITORY_ROOT,
  ...CAPTURE_INFERENCE_MODE_PLAN_PATH.split("/"),
);
const trackedPlanBytes = await readFile(PLAN_PATH);
const trackedPlan = parseCanonicalCaptureInferenceModePlan(trackedPlanBytes);

const clonePlan = () => structuredClone(trackedPlan);
const canonicalBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

test("accepts the tracked blocked I-178 four-mode plan", async () => {
  const summary = await validateCaptureInferenceModePlan(clonePlan());
  assert.deepEqual(summary, {
    campaignId: "shared-camera-capture-inference-mode-v1",
    status: "blocked",
    sourceBindingCount: 7,
    modeCount: 4,
    actionCount: 10,
  });
});

test("rejects source substitution, path drift, and stale digests", async () => {
  const digestDrift = clonePlan();
  digestDrift.sourceBindings[0].sha256 = "0".repeat(64);
  await assert.rejects(
    validateCaptureInferenceModePlan(digestDrift),
    /current-source binding/u,
  );

  const pathDrift = clonePlan();
  pathDrift.sourceBindings[0].path = "../outside.json";
  await assert.rejects(validateCaptureInferenceModePlan(pathDrift), /\.path/u);

  const reordered = clonePlan();
  [reordered.sourceBindings[0], reordered.sourceBindings[1]] = [
    reordered.sourceBindings[1],
    reordered.sourceBindings[0],
  ];
  await assert.rejects(validateCaptureInferenceModePlan(reordered), /\.path/u);
});

test("rejects mode omission, reordering, renaming, and capture drift", async () => {
  const omitted = clonePlan();
  omitted.modes.pop();
  await assert.rejects(validateCaptureInferenceModePlan(omitted), /modes/u);

  const reordered = clonePlan();
  [reordered.modes[0], reordered.modes[1]] = [reordered.modes[1], reordered.modes[0]];
  await assert.rejects(validateCaptureInferenceModePlan(reordered), /modes/u);

  const renamed = clonePlan();
  renamed.modes[0].id = "preferred-mode";
  await assert.rejects(validateCaptureInferenceModePlan(renamed), /modes/u);

  const captureDrift = clonePlan();
  captureDrift.modes[0].capture.framesPerSecondNumerator = 30;
  await assert.rejects(validateCaptureInferenceModePlan(captureDrift), /modes/u);
});

test("rejects invented downscale dimensions and hidden preprocessing claims", async () => {
  const inventedDownscale = clonePlan();
  inventedDownscale.modes[0].inference.width = 640;
  inventedDownscale.modes[0].inference.height = 360;
  await assert.rejects(validateCaptureInferenceModePlan(inventedDownscale), /modes/u);

  const directResize = clonePlan();
  directResize.modes[1].inference.strategy = "downscaled-from-capture";
  await assert.rejects(validateCaptureInferenceModePlan(directResize), /modes/u);

  const hiddenField = clonePlan();
  hiddenField.modes[0].inference.provider = "preferred-vendor";
  await assert.rejects(validateCaptureInferenceModePlan(hiddenField), /modes/u);
});

test("requires paired same-session counterbalancing without raw replay", async () => {
  const unpaired = clonePlan();
  unpaired.comparisonDesign.sameSessionRequired = false;
  await assert.rejects(validateCaptureInferenceModePlan(unpaired), /comparisonDesign/u);

  const replay = clonePlan();
  replay.comparisonDesign.rawFrameReplayAllowed = true;
  await assert.rejects(validateCaptureInferenceModePlan(replay), /comparisonDesign/u);

  const nonCounterbalanced = clonePlan();
  nonCounterbalanced.comparisonDesign.counterbalancedOrderRequired = false;
  await assert.rejects(validateCaptureInferenceModePlan(nonCounterbalanced), /comparisonDesign/u);

  const changedScene = clonePlan();
  changedScene.comparisonDesign.identicalRoomPlacementLightingRequired = false;
  await assert.rejects(validateCaptureInferenceModePlan(changedScene), /comparisonDesign/u);
});

test("preserves complete actions, attempts, and negative evidence", async () => {
  const fewerAttempts = clonePlan();
  fewerAttempts.comparisonDesign.measuredAttemptsPerActionPerCell = 19;
  await assert.rejects(validateCaptureInferenceModePlan(fewerAttempts), /comparisonDesign/u);

  const shorterNegative = clonePlan();
  shorterNegative.comparisonDesign.negativeWindowDurationMsPerModeCell = 899999;
  await assert.rejects(validateCaptureInferenceModePlan(shorterNegative), /comparisonDesign/u);

  const missingAction = clonePlan();
  missingAction.comparisonDesign.actions.pop();
  await assert.rejects(validateCaptureInferenceModePlan(missingAction), /comparisonDesign/u);

  const missingPrivileged = clonePlan();
  missingPrivileged.comparisonDesign.privilegedActionIds.pop();
  await assert.rejects(validateCaptureInferenceModePlan(missingPrivileged), /comparisonDesign/u);
});

test("rejects capture-arrival, inference-only, and endpoint substitution", async () => {
  const captureArrival = clonePlan();
  captureArrival.measurements.captureArrivalMaySubstitute = true;
  await assert.rejects(validateCaptureInferenceModePlan(captureArrival), /measurements/u);

  const inferenceOnly = clonePlan();
  inferenceOnly.measurements.inferenceOnlyMaySubstitute = true;
  await assert.rejects(validateCaptureInferenceModePlan(inferenceOnly), /measurements/u);

  const wrongStart = clonePlan();
  wrongStart.measurements.latencyStart = "browser-callback";
  await assert.rejects(validateCaptureInferenceModePlan(wrongStart), /measurements/u);

  const wrongEnd = clonePlan();
  wrongEnd.measurements.latencyEnd = "animation-start";
  await assert.rejects(validateCaptureInferenceModePlan(wrongEnd), /measurements/u);
});

test("rejects weakened fixed gates and prematurely chosen open gates", async () => {
  const slowGate = clonePlan();
  slowGate.acceptance.maximumP95ExposureToGameApiMs = 121;
  await assert.rejects(validateCaptureInferenceModePlan(slowGate), /acceptance/u);

  const precisionGate = clonePlan();
  precisionGate.acceptance.minimumActionPrecision = 0.94;
  await assert.rejects(validateCaptureInferenceModePlan(precisionGate), /acceptance/u);

  const falseActionGate = clonePlan();
  falseActionGate.acceptance.maximumUnintendedPrivilegedActions = 1;
  await assert.rejects(validateCaptureInferenceModePlan(falseActionGate), /acceptance/u);

  const inventedDropGate = clonePlan();
  inventedDropGate.acceptance.maximumDroppedFrameRate = 0.1;
  await assert.rejects(validateCaptureInferenceModePlan(inventedDropGate), /acceptance/u);

  const aggregateRescue = clonePlan();
  aggregateRescue.measurements.aggregateMayRescueFailedModeOrCell = true;
  await assert.rejects(validateCaptureInferenceModePlan(aggregateRescue), /measurements/u);
});

test("keeps every execution identity and authority blocked", async () => {
  const ready = clonePlan();
  ready.executionGate.status = "ready";
  await assert.rejects(validateCaptureInferenceModePlan(ready), /executionGate/u);

  const target = clonePlan();
  target.executionGate.targetId = "unreviewed-target";
  await assert.rejects(validateCaptureInferenceModePlan(target), /executionGate/u);

  const timestamp = clonePlan();
  timestamp.executionGate.exposureTimestampAuthority = "capture-arrival";
  await assert.rejects(validateCaptureInferenceModePlan(timestamp), /executionGate/u);

  const missingBlocker = clonePlan();
  missingBlocker.executionGate.blockerCodes.pop();
  await assert.rejects(validateCaptureInferenceModePlan(missingBlocker), /executionGate/u);
});

test("rejects premature results, selection, product mutation, and purchase authority", async () => {
  const result = clonePlan();
  result.resultBoundary.resultArtifactSha256 = "a".repeat(64);
  await assert.rejects(validateCaptureInferenceModePlan(result), /resultBoundary/u);

  const qualification = clonePlan();
  qualification.resultBoundary.qualifiedModeIds = [
    "capture-720p60-direct-inference",
  ];
  await assert.rejects(validateCaptureInferenceModePlan(qualification), /resultBoundary/u);

  const selected = clonePlan();
  selected.resultBoundary.selectedModeId = "capture-720p60-direct-inference";
  selected.resultBoundary.productDefaultChanged = true;
  await assert.rejects(validateCaptureInferenceModePlan(selected), /resultBoundary/u);

  const purchase = clonePlan();
  purchase.resultBoundary.purchaseAuthorized = true;
  await assert.rejects(validateCaptureInferenceModePlan(purchase), /resultBoundary/u);
});

test("rejects raw retention, egress, identifiers, and premature frame authority", async () => {
  const retained = clonePlan();
  retained.dataPolicy.rawFrameRetentionAllowed = true;
  await assert.rejects(validateCaptureInferenceModePlan(retained), /dataPolicy/u);

  const egress = clonePlan();
  egress.dataPolicy.rawFrameNetworkEgressAllowed = true;
  await assert.rejects(validateCaptureInferenceModePlan(egress), /dataPolicy/u);

  const identified = clonePlan();
  identified.dataPolicy.participantIdentifiersAllowed = true;
  await assert.rejects(validateCaptureInferenceModePlan(identified), /dataPolicy/u);

  const premature = clonePlan();
  premature.dataPolicy.temporaryFrameAnalysisAuthorized = true;
  await assert.rejects(validateCaptureInferenceModePlan(premature), /dataPolicy/u);
});

test("rejects unknown fields and noncanonical or malformed envelopes", async () => {
  const unknown = clonePlan();
  unknown.notes = "hidden authority";
  await assert.rejects(validateCaptureInferenceModePlan(unknown), /fields must be exactly/u);

  assert.throws(
    () => parseCanonicalCaptureInferenceModePlan(Buffer.from(JSON.stringify(trackedPlan))),
    /canonical two-space JSON/u,
  );

  const duplicate = trackedPlanBytes
    .toString("utf8")
    .replace(
      '  "format": "vcg-capture-inference-mode-qualification-plan/v1",',
      '  "format": "vcg-capture-inference-mode-qualification-plan/v1",\n  "format": "vcg-capture-inference-mode-qualification-plan/v1",',
    );
  assert.throws(
    () => parseCanonicalCaptureInferenceModePlan(Buffer.from(duplicate)),
    /canonical two-space JSON/u,
  );

  assert.throws(
    () =>
      parseCanonicalCaptureInferenceModePlan(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), trackedPlanBytes]),
      ),
    /must not contain a UTF-8 BOM/u,
  );
  assert.throws(
    () => parseCanonicalCaptureInferenceModePlan(new Uint8Array([0xff])),
    /valid UTF-8/u,
  );
  assert.throws(
    () =>
      parseCanonicalCaptureInferenceModePlan(
        Buffer.alloc(MAX_CAPTURE_INFERENCE_MODE_PLAN_BYTES + 1, 0x20),
      ),
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
  const parsedReordered = parseCanonicalCaptureInferenceModePlan(canonicalBytes(reordered));
  await assert.rejects(
    validateCaptureInferenceModePlan(parsedReordered),
    /fields must be exactly/u,
  );
});
