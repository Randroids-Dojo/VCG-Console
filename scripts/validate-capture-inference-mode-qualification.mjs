import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");

export const CAPTURE_INFERENCE_MODE_PLAN_PATH =
  "benchmarks/capture-inference-mode/shared-camera-capture-inference-mode-plan-v1.json";
export const MAX_CAPTURE_INFERENCE_MODE_PLAN_BYTES = 64 * 1024;

const FORMAT = "vcg-capture-inference-mode-qualification-plan/v1";
const CAMPAIGN_ID = "shared-camera-capture-inference-mode-v1";
const CLAIM_BOUNDARY =
  "This file pre-registers a blocked I-178 capture and inference mode comparison only. It authorizes no camera, target, participant, room capture, temporary frame analysis, product default, purchase, execution, qualification, or selection and records no physical result.";

const SOURCE_PATHS = [
  "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
  "scripts/validate-camera-capture-policy-campaign.mjs",
  "scripts/validate-camera-action-latency-campaign.mjs",
  "apps/console-lab/src/tracker.ts",
  "apps/console-lab/src/tracker-worker.ts",
  "packages/motion-contract/src/index.ts",
  "docs/PROTOTYPE_SUCCESS_CRITERIA.md",
];

const BLOCKER_CODES = [
  "acceptance-gates",
  "camera-qualification",
  "capture-policy-result",
  "counterbalanced-schedule",
  "data-handling-authority",
  "exposure-timestamp-authority",
  "ground-truth-protocol",
  "inference-downscale-selection",
  "participant-consent",
  "room-placement-binding",
  "selection-policy",
  "target-runtime-binding",
];

const ACTIONS = [
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

const MODES = [
  {
    id: "capture-1080p60-downscaled-inference",
    role: "primary-candidate",
    capture: {
      width: 1920,
      height: 1080,
      framesPerSecondNumerator: 60,
      framesPerSecondDenominator: 1,
      pixelFormat: null,
      controlPresetId: null,
    },
    inference: {
      strategy: "downscaled-from-capture",
      width: null,
      height: null,
      maximumFramesPerSecondNumerator: 60,
      maximumFramesPerSecondDenominator: 1,
      independentResizeCostRequired: true,
    },
    requiredExecution: true,
  },
  {
    id: "capture-720p60-direct-inference",
    role: "primary-candidate",
    capture: {
      width: 1280,
      height: 720,
      framesPerSecondNumerator: 60,
      framesPerSecondDenominator: 1,
      pixelFormat: null,
      controlPresetId: null,
    },
    inference: {
      strategy: "direct-capture-resolution",
      width: 1280,
      height: 720,
      maximumFramesPerSecondNumerator: 60,
      maximumFramesPerSecondDenominator: 1,
      independentResizeCostRequired: false,
    },
    requiredExecution: true,
  },
  {
    id: "capture-1080p30-downscaled-inference",
    role: "fallback-candidate",
    capture: {
      width: 1920,
      height: 1080,
      framesPerSecondNumerator: 30,
      framesPerSecondDenominator: 1,
      pixelFormat: null,
      controlPresetId: null,
    },
    inference: {
      strategy: "downscaled-from-capture",
      width: null,
      height: null,
      maximumFramesPerSecondNumerator: 30,
      maximumFramesPerSecondDenominator: 1,
      independentResizeCostRequired: true,
    },
    requiredExecution: true,
  },
  {
    id: "capture-720p30-direct-inference",
    role: "fallback-candidate",
    capture: {
      width: 1280,
      height: 720,
      framesPerSecondNumerator: 30,
      framesPerSecondDenominator: 1,
      pixelFormat: null,
      controlPresetId: null,
    },
    inference: {
      strategy: "direct-capture-resolution",
      width: 1280,
      height: 720,
      maximumFramesPerSecondNumerator: 30,
      maximumFramesPerSecondDenominator: 1,
      independentResizeCostRequired: false,
    },
    requiredExecution: true,
  },
];

const EXECUTION_GATE = {
  status: "blocked",
  targetId: null,
  operatingSystemImageSha256: null,
  cameraId: null,
  cameraDeviceSha256: null,
  cameraQualificationResultSha256: null,
  capturePolicyResultSha256: null,
  trackerBundleSha256: null,
  roomAndPlacementProtocolSha256: null,
  participantProtocolSha256: null,
  exposureTimestampAuthority: null,
  exposureTimestampProofSha256: null,
  clockMappingProofSha256: null,
  groundTruthProtocolSha256: null,
  counterbalancedScheduleSha256: null,
  dataHandlingProtocolSha256: null,
  blockerCodes: BLOCKER_CODES,
};

const COMPARISON_DESIGN = {
  sameSessionRequired: true,
  rawFrameReplayAllowed: false,
  oneCameraStreamAtATime: true,
  counterbalancedOrderRequired: true,
  pairedPersonaMovementScriptRequired: true,
  identicalRoomPlacementLightingRequired: true,
  exactTrackerAndActionRulesRequired: true,
  warmupAttemptsPerMode: null,
  interleaveBlockSize: null,
  measuredAttemptsPerActionPerCell: 20,
  negativeWindowDurationMsPerModeCell: 900000,
  blockingPersonaClasses: ["adult-standing", "school-age-child-standing"],
  placementIds: null,
  lightingConditionIds: null,
  actions: ACTIONS,
  privilegedActionIds: ["menu_back", "pause", "home", "resume", "exit"],
  scheduledCellCount: null,
  scheduledActionAttemptCount: null,
};

const MEASUREMENTS = {
  latencyStart: "trustworthy-camera-exposure",
  latencyEnd: "recognized-action-receipt-at-game-api",
  captureArrivalMaySubstitute: false,
  inferenceOnlyMaySubstitute: false,
  requiredMetrics: [
    "action-precision",
    "action-recall",
    "capture-frames-per-second",
    "dropped-frames",
    "exposure-time-microseconds",
    "exposure-to-game-api-latency",
    "inference-frames-per-second",
    "latency-p50-p95-p99-worst",
    "pipeline-stage-timing",
    "system-cpu",
    "system-ram",
    "usb-bandwidth",
  ],
  perModePerCellRequired: true,
  attemptLevelPublicationRequired: true,
  failuresAndRetriesPublished: true,
  droppedAttemptsMayBeDiscarded: false,
  groundTruthIndependentOfCandidateOutput: true,
  aggregateMayRescueFailedModeOrCell: false,
  resourceSamplingIntervalMs: null,
};

const ACCEPTANCE = {
  maximumP95ExposureToGameApiMs: 120,
  minimumActionPrecision: 0.95,
  minimumActionRecall: 0.9,
  maximumUnintendedPrivilegedActions: 0,
  minimumCaptureFramesPerSecondMilliHz: null,
  maximumDroppedFrameRate: null,
  maximumP99ExposureToGameApiMs: null,
  maximumWorstExposureToGameApiMs: null,
  minimumInferenceFramesPerSecondMilliHz: null,
  maximumUsbBytesPerSecond: null,
  maximumCpuPermille: null,
  maximumRamBytes: null,
  maximumP95ExposureTimeUs: null,
  selectionPolicy: null,
};

const DATA_POLICY = {
  temporaryFrameAnalysisAuthorized: false,
  rawFrameRetentionAllowed: false,
  rawFrameNetworkEgressAllowed: false,
  rawFrameReplayAllowed: false,
  skeletonOnlyTraceRequired: true,
  participantIdentifiersAllowed: false,
  freeTextAllowed: false,
  dataHandlingAuthoritySha256: null,
};

const RESULT_BOUNDARY = {
  resultArtifactSha256: null,
  qualifiedModeIds: [],
  selectedModeId: null,
  productDefaultChanged: false,
  executionAuthorized: false,
  purchaseAuthorized: false,
};

const LIMITATIONS = [
  "The exact target, operating-system image, camera, camera qualification, capture-policy result, tracker bundle, room, placements, lighting conditions, participants, clocks, ground truth, counterbalanced schedule, and data handling authority are unresolved.",
  "The downscaled inference dimensions, camera pixel formats, capture-control preset identities, warmup count, interleave block size, and resource sampling interval are unresolved.",
  "Capture-arrival, browser callback, inference-only, animation, and display timestamps cannot prove the 120 millisecond exposure-to-game-API gate.",
  "Every open performance, resource, exposure, tail-latency, and selection gate is null, so no mode is runnable, qualified, preferred, or selected.",
  "No frame, participant, camera, room, action, timing, drop, resource, target, qualification, selection, purchase, or product-default result is recorded.",
];

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertPlainObject(value, label);
  const actualKeys = Object.keys(value);
  if (!isDeepStrictEqual(actualKeys, expectedKeys)) {
    fail(`${label} fields must be exactly ${expectedKeys.join(", ")}`);
  }
}

function assertExact(value, expected, label) {
  if (!isDeepStrictEqual(value, expected)) {
    fail(`${label} does not match the closed qualification plan`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseCanonicalCaptureInferenceModePlan(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    fail("capture/inference mode plan bytes must be a Uint8Array");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CAPTURE_INFERENCE_MODE_PLAN_BYTES) {
    fail(
      `capture/inference mode plan must be between 1 and ${MAX_CAPTURE_INFERENCE_MODE_PLAN_BYTES} bytes`,
    );
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("capture/inference mode plan must not contain a UTF-8 BOM");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("capture/inference mode plan must be valid UTF-8");
  }
  let plan;
  try {
    plan = JSON.parse(text);
  } catch {
    fail("capture/inference mode plan must contain valid JSON");
  }
  assertPlainObject(plan, "capture/inference mode plan");

  if (text !== `${JSON.stringify(plan, null, 2)}\n`) {
    fail(
      "capture/inference mode plan must use canonical two-space JSON with one trailing newline",
    );
  }
  return plan;
}

export async function validateCaptureInferenceModePlan(
  plan,
  { repositoryRoot = REPOSITORY_ROOT } = {},
) {
  assertExactKeys(
    plan,
    [
      "format",
      "campaignId",
      "createdAt",
      "motionApiVersion",
      "qualification",
      "sourceBindings",
      "executionGate",
      "modes",
      "comparisonDesign",
      "measurements",
      "acceptance",
      "dataPolicy",
      "resultBoundary",
      "claimBoundary",
      "limitations",
    ],
    "capture/inference mode plan",
  );
  assertExact(plan.format, FORMAT, "format");
  assertExact(plan.campaignId, CAMPAIGN_ID, "campaignId");
  assertExact(plan.createdAt, "2026-07-25T00:00:00.000Z", "createdAt");
  assertExact(plan.motionApiVersion, "0.4.0", "motionApiVersion");
  assertExact(plan.qualification, "blocked-zero-result-plan", "qualification");

  if (!Array.isArray(plan.sourceBindings) || plan.sourceBindings.length !== SOURCE_PATHS.length) {
    fail(`sourceBindings must contain exactly ${SOURCE_PATHS.length} entries`);
  }
  for (const [index, expectedPath] of SOURCE_PATHS.entries()) {
    const binding = plan.sourceBindings[index];
    assertExactKeys(binding, ["path", "sha256"], `sourceBindings[${index}]`);
    assertExact(binding.path, expectedPath, `sourceBindings[${index}].path`);
    if (!/^[0-9a-f]{64}$/u.test(binding.sha256)) {
      fail(`sourceBindings[${index}].sha256 must be a lowercase SHA-256 digest`);
    }
    const currentBytes = await readFile(join(repositoryRoot, ...expectedPath.split("/")));
    assertExact(
      binding.sha256,
      sha256(currentBytes),
      `sourceBindings[${index}].sha256 current-source binding`,
    );
  }

  assertExact(plan.executionGate, EXECUTION_GATE, "executionGate");
  assertExact(plan.modes, MODES, "modes");
  assertExact(plan.comparisonDesign, COMPARISON_DESIGN, "comparisonDesign");
  assertExact(plan.measurements, MEASUREMENTS, "measurements");
  assertExact(plan.acceptance, ACCEPTANCE, "acceptance");
  assertExact(plan.dataPolicy, DATA_POLICY, "dataPolicy");
  assertExact(plan.resultBoundary, RESULT_BOUNDARY, "resultBoundary");
  assertExact(plan.claimBoundary, CLAIM_BOUNDARY, "claimBoundary");
  assertExact(plan.limitations, LIMITATIONS, "limitations");

  return {
    campaignId: plan.campaignId,
    status: plan.executionGate.status,
    sourceBindingCount: plan.sourceBindings.length,
    modeCount: plan.modes.length,
    actionCount: plan.comparisonDesign.actions.length,
  };
}

export async function validateCaptureInferenceModePlanFile(
  planPath = join(REPOSITORY_ROOT, ...CAPTURE_INFERENCE_MODE_PLAN_PATH.split("/")),
  options,
) {
  const plan = parseCanonicalCaptureInferenceModePlan(await readFile(planPath));
  return validateCaptureInferenceModePlan(plan, options);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedPath = process.argv[2]
    ? resolve(process.argv[2])
    : join(REPOSITORY_ROOT, ...CAPTURE_INFERENCE_MODE_PLAN_PATH.split("/"));
  try {
    const summary = await validateCaptureInferenceModePlanFile(requestedPath);
    console.log(
      `capture/inference mode plan valid: status=${summary.status} modes=${summary.modeCount} actions=${summary.actionCount} sources=${summary.sourceBindingCount}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
