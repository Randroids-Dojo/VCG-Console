import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");

export const SHARED_CAMERA_PLAN_PATH =
  "benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json";
export const MAX_SHARED_CAMERA_PLAN_BYTES = 128 * 1024;

const SOURCE_PATHS = [
  "docs/QUOTE_DATE_BOMS_2026-07-24.md",
  "docs/MICROPHONE_DISABLEMENT_QUALIFICATION_PLAN_2026-07-25.md",
  "docs/CAMERA_CAPTURE_POLICY_CAMPAIGN_2026-07-25.md",
  "benchmarks/camera-capture-policy/first-room-capture-policy-plan-v1.json",
  "docs/CAMERA_ACTION_LATENCY_CAMPAIGN_2026-07-24.md",
  "docs/PROTOTYPE_SUCCESS_CRITERIA.md",
  "docs/STEAM_MACHINE_2026.md",
  "docs/RESEARCH.md",
];

const TARGET_IDS = [
  "ordinary-x86-linux-external-camera",
  "steamos-external-camera",
  "raspberry-pi5-ai-hat-integrated-camera",
];

const TARGETS = [
  {
    id: TARGET_IDS[0],
    role: "ordinary-x86-linux-reference",
    required: true,
    hardwareInventorySha256: null,
    operatingSystemImageSha256: null,
    kernelSha256: null,
    cameraDriverSha256: null,
    runtimeBundleSha256: null,
    usbTopologySha256: null,
    packagingProtocolSha256: null,
  },
  {
    id: TARGET_IDS[1],
    role: "steamos-reference",
    required: true,
    hardwareInventorySha256: null,
    operatingSystemImageSha256: null,
    kernelSha256: null,
    cameraDriverSha256: null,
    runtimeBundleSha256: null,
    usbTopologySha256: null,
    packagingProtocolSha256: null,
  },
  {
    id: TARGET_IDS[2],
    role: "lower-cost-integrated-reference",
    required: true,
    hardwareInventorySha256: null,
    operatingSystemImageSha256: null,
    kernelSha256: null,
    cameraDriverSha256: null,
    runtimeBundleSha256: null,
    usbTopologySha256: null,
    packagingProtocolSha256: null,
  },
];

const CHECK_IDS = [
  "candidate-delivered-identity",
  "physical-optical-shutter",
  "capture-activity-indicator",
  "standard-connector-replacement-recalibration",
  "linux-usb-identity",
  "genuine-1920x1080-at-60-fps-mode",
  "sustained-capture",
  "field-of-view-and-room-coverage",
  "distortion-crop-and-floor-geometry",
  "exposure-and-low-light",
  "exposure-timestamp-authority",
  "exposure-to-game-api-latency",
  "hot-plug-and-reconnect",
  "suspend-resume",
  "microphone-disablement",
  "ordinary-x86-external-mount-fit",
  "steamos-external-mount-fit",
  "raspberry-pi-integrated-fixed-angle-fit",
];

const CHECKS_SHA256 =
  "fd03ed0a36c31a7dd12a960ac7cb2c092f1c5ed7107fce62ce17be2f23137fcc";

const CANDIDATE = {
  candidateId: "logitech-brio-pro-960-001105",
  manufacturer: "Logitech",
  productName: "Brio Pro Ultra HD Webcam",
  merchandiseModel: "960-001105",
  evidenceSourcePath: "docs/QUOTE_DATE_BOMS_2026-07-24.md",
  advertisedClaimsOnly: [
    "manufacturer-stated-uvc",
    "manufacturer-stated-1920x1080-at-60-fps",
    "manufacturer-stated-adjustable-90-78-65-degree-diagonal-fov",
  ],
  selected: false,
  ordered: false,
  purchaseAuthorized: false,
  deliveredQuoteSha256: null,
  receiptSha256: null,
  receivedDeviceIdentitySha256: null,
};

const EXECUTION_GATE = {
  status: "blocked",
  selectedCandidateId: null,
  receivedDeviceInventorySha256: null,
  cameraControlInventorySha256: null,
  cameraFirmwareSha256: null,
  roomAndPlacementProtocolSha256: null,
  opticalGroundTruthProtocolSha256: null,
  exposureTimestampAuthority: null,
  exposureTimestampProofSha256: null,
  clockMappingProofSha256: null,
  participantProtocolSha256: null,
  dataHandlingProtocolSha256: null,
  counterbalancedScheduleSha256: null,
  safetyReviewSha256: null,
  blockerCodes: [
    "acceptance-gates",
    "camera-controls",
    "counterbalanced-schedule",
    "data-handling-authority",
    "delivered-quote",
    "exposure-timestamp-authority",
    "optical-ground-truth",
    "participant-consent",
    "received-device-identity",
    "room-placement-binding",
    "safety-review",
    "target-runtime-bindings",
  ],
};

const SCHEDULE = {
  sharedCheckCount: 4,
  perTargetCheckCount: 11,
  targetPackagingCheckCount: 3,
  scheduledCellCount: 40,
  attemptsPerCell: null,
  sustainedCaptureDurationMs: null,
  hotPlugCyclesPerTarget: null,
  suspendResumeCyclesPerTarget: null,
  counterbalancedOrder: null,
};

const ACCEPTANCE = {
  requiredCaptureWidth: 1920,
  requiredCaptureHeight: 1080,
  requiredFramesPerSecondNumerator: 60,
  requiredFramesPerSecondDenominator: 1,
  maximumP95ExposureToGameApiMs: 120,
  physicalOpticalShutterRequired: true,
  captureActivityIndicatorRequired: true,
  standardConnectorRequired: true,
  audioCaptureAllowedByDefault: false,
  minimumHorizontalFieldOfViewMilliDegrees: null,
  minimumVerticalFieldOfViewMilliDegrees: null,
  maximumDistortionError: null,
  maximumDroppedFrameRate: null,
  maximumP95ExposureTimeUs: null,
  minimumLowLightIlluminanceMilliLux: null,
  maximumReconnectTimeMs: null,
  maximumResumeRecoveryTimeMs: null,
  maximumDeliveredPriceCents: null,
  perTargetPerCheckPassRequired: true,
  aggregateMayRescueFailedCell: false,
  unknownOrNotRunMayPass: false,
};

const DATA_POLICY = {
  temporaryFrameAnalysisAuthorized: false,
  rawRoomVideoDefault: false,
  rawFrameRetentionAllowed: false,
  rawFrameNetworkEgressAllowed: false,
  skeletonAndNumericReleaseOnly: true,
  participantIdentifiersAllowed: false,
  freeTextAllowed: false,
};

const RESULT_BOUNDARY = {
  resultArtifactSha256: null,
  qualifiedTargetIds: [],
  cameraQualified: false,
  cameraSelected: false,
  purchaseAuthorized: false,
  productBomsChanged: false,
  executionAuthorized: false,
};

const CLAIM_BOUNDARY =
  "This file pre-registers a blocked I-177 shared-camera qualification campaign around one existing merchandise candidate only. It authorizes no order, purchase, camera use, participant, room capture, temporary frame analysis, target execution, qualification, selection, or BOM change and records no delivered quote, receipt, received device, USB mode, optical, latency, reliability, privacy, packaging, or product result.";

const LIMITATIONS = [
  "The Logitech Brio Pro 960-001105 is an existing merchandise candidate, not a selected, purchased, received, or qualified camera.",
  "Manufacturer-stated UVC, 1920 by 1080 at 60 frames per second, and adjustable field of view do not prove a genuine sustained mode, latency, optical quality, Linux compatibility, privacy behavior, or packaging fit.",
  "Every target identity, received-device binding, capture control, room, participant, timestamp, optical truth, schedule, safety review, data authority, and open numeric gate is unresolved.",
  "The plan requires 40 explicit shared, per-target, and packaging cells with no aggregate rescue; it contains no attempt or result ledger.",
  "No quote, order, receipt, USB observation, frame, audio sample, person, room, physical fit, qualification, selection, purchase authorization, or BOM mutation is recorded.",
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
    fail(`${label} does not match the closed shared-camera plan`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseCanonicalSharedCameraPlan(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    fail("shared-camera plan bytes must be a Uint8Array");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SHARED_CAMERA_PLAN_BYTES) {
    fail(`shared-camera plan must be between 1 and ${MAX_SHARED_CAMERA_PLAN_BYTES} bytes`);
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("shared-camera plan must not contain a UTF-8 BOM");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("shared-camera plan must be valid UTF-8");
  }

  let plan;
  try {
    plan = JSON.parse(text);
  } catch {
    fail("shared-camera plan must contain valid JSON");
  }
  assertPlainObject(plan, "shared-camera plan");
  if (text !== `${JSON.stringify(plan, null, 2)}\n`) {
    fail("shared-camera plan must use canonical two-space JSON with one trailing newline");
  }
  return plan;
}

function validateChecks(checks) {
  if (!Array.isArray(checks) || checks.length !== CHECK_IDS.length) {
    fail(`checks must contain exactly ${CHECK_IDS.length} entries`);
  }

  let scheduledCellCount = 0;
  for (const [index, check] of checks.entries()) {
    assertExactKeys(
      check,
      ["id", "scope", "targetIds", "requiredEvidence"],
      `checks[${index}]`,
    );
    assertExact(check.id, CHECK_IDS[index], `checks[${index}].id`);
    if (!Array.isArray(check.requiredEvidence) || check.requiredEvidence.length === 0) {
      fail(`checks[${index}].requiredEvidence must be a nonempty array`);
    }
    if (
      new Set(check.requiredEvidence).size !== check.requiredEvidence.length ||
      check.requiredEvidence.some(
        (entry) => typeof entry !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry),
      )
    ) {
      fail(`checks[${index}].requiredEvidence must contain unique safe evidence IDs`);
    }

    if (index < 4) {
      assertExact(check.scope, "shared-camera", `checks[${index}].scope`);
      assertExact(check.targetIds, [], `checks[${index}].targetIds`);
      scheduledCellCount += 1;
    } else if (index < 15) {
      assertExact(check.scope, "per-target", `checks[${index}].scope`);
      assertExact(check.targetIds, TARGET_IDS, `checks[${index}].targetIds`);
      scheduledCellCount += TARGET_IDS.length;
    } else {
      assertExact(check.scope, "target-packaging", `checks[${index}].scope`);
      assertExact(check.targetIds, [TARGET_IDS[index - 15]], `checks[${index}].targetIds`);
      scheduledCellCount += 1;
    }
  }

  assertExact(
    sha256(Buffer.from(JSON.stringify(checks))),
    CHECKS_SHA256,
    "checks evidence inventory digest",
  );
  return scheduledCellCount;
}

export async function validateSharedCameraPlan(
  plan,
  { repositoryRoot = REPOSITORY_ROOT } = {},
) {
  assertExactKeys(
    plan,
    [
      "format",
      "campaignId",
      "createdAt",
      "qualification",
      "sourceBindings",
      "candidate",
      "executionGate",
      "targets",
      "checks",
      "schedule",
      "acceptance",
      "dataPolicy",
      "resultBoundary",
      "claimBoundary",
      "limitations",
    ],
    "shared-camera plan",
  );
  assertExact(plan.format, "vcg-shared-camera-qualification-plan/v1", "format");
  assertExact(plan.campaignId, "shared-wide-angle-uvc-camera-v1", "campaignId");
  assertExact(plan.createdAt, "2026-07-25T00:00:00.000Z", "createdAt");
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

  assertExact(plan.candidate, CANDIDATE, "candidate");
  assertExact(plan.executionGate, EXECUTION_GATE, "executionGate");
  assertExact(plan.targets, TARGETS, "targets");
  const scheduledCellCount = validateChecks(plan.checks);
  assertExact(plan.schedule, SCHEDULE, "schedule");
  assertExact(scheduledCellCount, plan.schedule.scheduledCellCount, "scheduledCellCount");
  assertExact(plan.acceptance, ACCEPTANCE, "acceptance");
  assertExact(plan.dataPolicy, DATA_POLICY, "dataPolicy");
  assertExact(plan.resultBoundary, RESULT_BOUNDARY, "resultBoundary");
  assertExact(plan.claimBoundary, CLAIM_BOUNDARY, "claimBoundary");
  assertExact(plan.limitations, LIMITATIONS, "limitations");

  return {
    campaignId: plan.campaignId,
    status: plan.executionGate.status,
    targetCount: plan.targets.length,
    checkCount: plan.checks.length,
    scheduledCellCount,
  };
}

export async function validateSharedCameraPlanFile(
  planPath = join(REPOSITORY_ROOT, ...SHARED_CAMERA_PLAN_PATH.split("/")),
  options,
) {
  return validateSharedCameraPlan(parseCanonicalSharedCameraPlan(await readFile(planPath)), options);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedPath = process.argv[2]
    ? resolve(process.argv[2])
    : join(REPOSITORY_ROOT, ...SHARED_CAMERA_PLAN_PATH.split("/"));
  try {
    const summary = await validateSharedCameraPlanFile(requestedPath);
    console.log(
      `shared-camera plan valid: status=${summary.status} targets=${summary.targetCount} checks=${summary.checkCount} cells=${summary.scheduledCellCount}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
