import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const defaultRepositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const planRoot = resolve(defaultRepositoryRoot, "benchmarks", "pose-backends");
const defaultOutput = resolve(
  planRoot,
  "hailo-mediapipe-core-comparison-plan-v1.json",
);

export const HAILO_MEDIAPIPE_PLAN_FORMAT =
  "vcg-hailo-mediapipe-core-comparison-plan";
export const HAILO_MEDIAPIPE_PLAN_VERSION = 1;
export const HAILO_MEDIAPIPE_CAMPAIGN_ID =
  "hailo-yolov8m-mediapipe-lite-core17-v1";
export const HAILO_MEDIAPIPE_ACTIONS = [
  "dodge_left",
  "dodge_right",
  "duck",
  "jump",
];
export const HAILO_MEDIAPIPE_FLOOR_EVENTS = [
  "floor_contact",
  "floor_lift",
];

const SOURCE_BINDINGS = [
  {
    role: "hailo-core17-projection",
    path: "packages/motion-contract/src/hailo-core17.ts",
  },
  {
    role: "mediapipe-motion-adapter",
    path: "apps/console-lab/src/mediapipe-adapter.ts",
  },
  {
    role: "motion-schema",
    path: "packages/motion-contract/src/schema.ts",
  },
  {
    role: "game-manifest-motion-vocabulary",
    path: "packages/game-manifest/src/index.ts",
  },
];

function git(args, repositoryRoot) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr?.trim() || result.status}`,
    );
  }
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalSourceSha256(bytes, name = "source") {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error(`${name} bytes must be a Uint8Array`);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${name} must be valid UTF-8`);
  }
  const normalized = text.replaceAll("\r\n", "\n");
  if (normalized.includes("\r")) {
    throw new Error(`${name} must not contain bare carriage returns`);
  }
  return sha256(Buffer.from(normalized, "utf8"));
}

async function buildSourceBindings(repositoryRoot) {
  return Promise.all(
    SOURCE_BINDINGS.map(async ({ role, path }) => ({
      role,
      path,
      sha256: canonicalSourceSha256(
        await readFile(resolve(repositoryRoot, path)),
        path,
      ),
    })),
  );
}

function requireBoundedOutput(argument) {
  const output = argument
    ? resolve(defaultRepositoryRoot, argument)
    : defaultOutput;
  const rootRelative = relative(planRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error(
      "output must be a JSON file below benchmarks/pose-backends",
    );
  }
  return output;
}

export async function buildHailoMediaPipeComparisonPlan({
  repositoryRoot = defaultRepositoryRoot,
  createdAt = new Date().toISOString(),
  sourceCommit = git(["rev-parse", "HEAD"], repositoryRoot),
  workingTreeClean = git(["status", "--porcelain"], repositoryRoot) === "",
} = {}) {
  return {
    format: HAILO_MEDIAPIPE_PLAN_FORMAT,
    formatVersion: HAILO_MEDIAPIPE_PLAN_VERSION,
    documentType: "plan",
    campaignId: HAILO_MEDIAPIPE_CAMPAIGN_ID,
    createdAt,
    sourceCommit,
    workingTreeClean,
    execution: {
      status: "blocked",
      recordedAttemptCount: 0,
      resultArtifact: null,
      resultSha256: null,
      qualification: "not-run",
      selectedBackend: null,
      selectedGameProfileRequirements: [],
      blockers: [
        "Motion has no honest Hailo source identity or reviewed explicit translator",
        "the complete Raspberry Pi, Hailo runtime, HEF, post-processor, and camera tuple is unset",
        "one exposure-authoritative camera stream cannot yet fan the same volatile frame to both backends",
        "the exposure-to-game-receipt clock mapping and uncertainty proof are unset",
        "the independent action and floor-contact ground-truth apparatus is unset",
        "participant minimums, consent, privacy review, and metric gates are unset",
      ],
    },
    claimBoundary:
      "Pre-registered architecture and comparison plan only. No Hailo runtime, Hailo frame, participant, room session, same-exposure backend comparison, action or floor-contact score, latency result, richer-profile requirement, backend selection, Raspberry Pi qualification, or raw-frame retention authority exists.",
    sourceDigestContract:
      "SHA-256 over strict UTF-8 source text after CRLF-to-LF normalization; bare carriage returns are rejected",
    sourceBindings: await buildSourceBindings(repositoryRoot),
    target: {
      productLane: "raspberry-pi-5-8gb-ai-hat-plus-26-tops",
      hostProcessor: "raspberry-pi-5-bcm2712",
      accelerator: "hailo-8-ai-hat-plus-26-tops",
      comparisonPlayerCount: 1,
      exactBoardRevision: null,
      exactHatRevision: null,
      operatingSystemImageSha256: null,
      kernelRelease: null,
      firmwareRevision: null,
      cameraUsbIdentity: null,
      cameraMode: null,
      roomManifestSha256: null,
    },
    backends: [
      {
        backendId: "hailo-yolov8m-pose-core17",
        family: "hailo-native-pose",
        motionSource: null,
        requiredMotionBoundary:
          "visible Motion 0.5.0 hailo-native source or reviewed exact translation",
        adapterInput: "hailo-coco17-normalized/v1",
        implementation:
          "packages/motion-contract/src/hailo-core17.ts",
        model: {
          name: "YOLOv8m Pose",
          landmarkLayout: "COCO-17",
          hefBytes: null,
          hefSha256: null,
        },
        runtime: {
          pcieDriverVersion: null,
          hailoRtVersion: null,
          tappasCoreVersion: null,
          hailoAppsCommit: null,
          postProcessorSha256: null,
          cameraPipelineSha256: null,
        },
        expectedPoseProfilesAvailable: ["body.core17"],
        expectedPoseProfilesUnavailable: [
          "body.mediapipe33",
          "body.world3d",
        ],
        nativeActionProfilesAvailable: [],
        scoreCalibrationSha256: null,
      },
      {
        backendId: "mediapipe-pose-landmarker-lite",
        family: "mediapipe-web-pose",
        motionSource: "mediapipe-web",
        requiredMotionBoundary: "Motion 0.4.0 exact source binding",
        adapterInput: "MediaPipe PoseLandmarkerResult",
        implementation:
          "apps/console-lab/src/mediapipe-adapter.ts",
        model: {
          name: "Pose Landmarker Lite float16 revision 1",
          landmarkLayout: "MediaPipe-33 plus provider-world",
          repositoryPath:
            "apps/console-lab/public/models/pose_landmarker_lite.task",
          bytes: 5_777_746,
          sha256:
            "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
        },
        runtime: {
          package: "@mediapipe/tasks-vision",
          packageVersion: "0.10.35",
          browserVersion: null,
          wasmBundleSha256: null,
          delegate: null,
        },
        expectedPoseProfilesAvailable: [
          "body.core17",
          "body.mediapipe33",
          "body.world3d",
        ],
        expectedPoseProfilesUnavailable: [],
        nativeActionProfilesAvailable: [],
        scoreCalibrationSha256: null,
      },
    ],
    capabilityComparison: {
      commonProfile: "body.core17",
      commonCoordinateSpecVersion: "0.1.0",
      commonCoordinateSystem: "image.normalized.top-left",
      sharedActionProfile: "actions.obstacle.v1",
      sharedActionOwner:
        "one versioned backend-neutral action engine applied after pose projection",
      sameExposureRequirement:
        "each scored attempt uses the exact same ordered exposure sequence for Hailo core17, MediaPipe core17, and the MediaPipe richer-profile ablation",
      comparisonViews: [
        {
          viewId: "hailo-core17-vs-mediapipe-core17",
          purpose:
            "compare provider pose paths through the identical portable landmark and action boundary",
          hailoProfiles: ["body.core17"],
          mediapipeProfiles: ["body.core17"],
        },
        {
          viewId: "mediapipe-core17-vs-mediapipe-rich",
          purpose:
            "isolate whether MediaPipe heel, foot-index, hand, and provider-world extensions materially improve the same labeled mechanic",
          hailoProfiles: [],
          mediapipeProfiles: [
            "body.core17",
            "body.mediapipe33",
            "body.world3d",
          ],
        },
        {
          viewId: "unavailable-profile-conformance",
          purpose:
            "prove unavailable richer values remain absent and required-profile negotiation fails closed",
          hailoProfiles: ["body.core17"],
          mediapipeProfiles: [
            "body.core17",
            "body.mediapipe33",
            "body.world3d",
          ],
        },
      ],
      unavailableValuePolicy:
        "an unavailable profile is omitted from capabilities and every field it owns is absent; never synthesize zero, null, copied core points, provider-world axes, or confidence",
      requiredNegotiationChecks: [
        "Hailo accepts body.core17 as required",
        "Hailo reports body.mediapipe33 as unavailable when optional",
        "Hailo rejects body.mediapipe33 when required",
        "Hailo reports body.world3d as unavailable when optional",
        "Hailo rejects body.world3d when required",
        "MediaPipe advertises only profiles present in every emitted frame",
      ],
    },
    capturePrivacy: {
      transport: "simultaneous-volatile-in-memory-fanout",
      sameFramePolicy:
        "one immutable exposure is delivered to both pinned backends before either result is scored",
      rawFramesRetained: false,
      rawFrameResultFieldsAllowed: false,
      temporaryRawCaptureAuthority: "not-authorized",
      fallbackWhenFanoutUnavailable:
        "block execution; do not substitute sequential, replayed, or different-session camera input",
      persistentFields: [
        "opaque campaign, participant, session, cell, and attempt codes",
        "backend and complete runtime-manifest digests",
        "exposure-authoritative and receipt timestamps plus bounded uncertainty",
        "normalized skeletons permitted by the compared capability view",
        "independent action and floor-contact labels",
        "derived action events, resource samples, invalid reasons, and aggregate metrics",
      ],
      prohibitedFields: [
        "RGB or depth image bytes",
        "video or audio",
        "name, display name, or contact detail",
        "portrait, face crop, face embedding, or appearance embedding",
        "durable body identity or profile identifier",
        "filesystem path, URL, credential, or free-form participant text",
      ],
      consentProtocolSha256: null,
      privacyReviewSha256: null,
      deletionAuditSha256: null,
    },
    timestampProtocol: {
      metricBoundary:
        "camera exposure to action receipt at the game boundary on one proven clock mapping",
      captureArrivalAcceptedAsExposure: false,
      acceptedExposureSources: [
        "hardware-exposure-start",
        "hardware-exposure-midpoint",
        "validated-driver-exposure",
      ],
      exposureSource: null,
      exposureClock: null,
      gameReceiptClock: null,
      clockMappingMethod: null,
      clockMappingProofSha256: null,
      exposureProofSha256: null,
      maximumPerAttemptUncertaintyUs: null,
      requiredLatencySummaries: ["p50", "p95", "p99", "worst"],
      requiredDropEvidence: [
        "camera frames",
        "fanout deliveries by backend",
        "backend admissions",
        "backend completions",
        "action-engine admissions",
        "game receipts",
      ],
    },
    study: {
      blockingPersonaClasses: [
        "school-age-child-standing",
        "adult-standing",
      ],
      exploratoryPersonaClasses: [
        "seated-exploratory",
        "limited-range-exploratory",
      ],
      minimumParticipantsPerBlockingClass: null,
      attemptsPerPositiveLabelPerParticipantAndPlacement: 20,
      negativeMinutesPerParticipantAndPlacement: 15,
      cameraPlacements: [
        "center-full-body",
        "left-edge-full-body",
        "right-edge-full-body",
        "lower-body-near-frame-edge",
        "partial-ankle-occlusion",
      ],
      motionActions: HAILO_MEDIAPIPE_ACTIONS,
      floorEvents: HAILO_MEDIAPIPE_FLOOR_EVENTS,
      negativeLabel: "negative",
      requiredNegativeStrata: [
        "neutral standing",
        "ordinary setup movement",
        "single-foot weight shift",
        "arm motion without dodge",
        "bend without duck",
        "toe or heel lift without jump",
        "partial exit and re-entry",
        "spectator or passerby",
      ],
      attemptOrdering:
        "counterbalanced within participant; freeze the complete schedule and hash before the first scored attempt",
      thresholdPolicy:
        "freeze backend observation thresholds and the shared action engine before blocking evaluation; never tune one backend on the held-out comparison",
      invalidAttemptPolicy:
        "retain every scheduled attempt and its stable invalid reason; never replace or omit a failed backend attempt",
      independentLabelManifestSha256: null,
      floorContactApparatusManifestSha256: null,
      scheduleSha256: null,
    },
    scoring: {
      actionConfusionMatrixRows: [
        "dodge_left",
        "dodge_right",
        "duck",
        "jump",
        "negative",
      ],
      actionConfusionMatrixColumns: [
        "dodge_left",
        "dodge_right",
        "duck",
        "jump",
        "no_action",
      ],
      floorEventConfusionMatrixRows: [
        "floor_contact",
        "floor_lift",
        "negative",
      ],
      floorEventConfusionMatrixColumns: [
        "floor_contact",
        "floor_lift",
        "no_event",
      ],
      requiredPerLabelMetrics: [
        "true positives",
        "false positives",
        "false negatives",
        "true negatives",
        "precision",
        "recall",
        "f1",
        "false events per negative minute",
      ],
      requiredTimingMetrics: [
        "exposure-to-pose p50/p95/p99/worst",
        "exposure-to-action-receipt p50/p95/p99/worst",
        "ground-truth-to-action signed-error p50/p95/p99/worst",
      ],
      requiredResourceMetrics: [
        "pose FPS and dropped frames",
        "CPU, GPU, NPU, RAM, and swap",
        "temperature, clocks, power, and fan noise",
        "concurrent obstacle-game frame-time p50/p95/p99/worst",
      ],
      requiredSlices: [
        "backend and capability view",
        "participant",
        "persona class",
        "camera placement",
        "action or floor event",
        "confidence and missing-landmark stratum",
      ],
      maximumActionP95LatencyMs: 120,
      perActionPrecisionGates: null,
      perActionRecallGates: null,
      floorEventMetricGates: null,
      resourceGates: null,
      aggregateMaskingPolicy:
        "report every blocking slice and incomplete cell; an aggregate pass cannot hide a failed persona, placement, action, floor event, unavailable profile, or invalid attempt",
      selectionPolicy:
        "select no backend or richer profile until every pre-registered gate is non-null and every blocking slice passes on complete same-exposure evidence",
    },
    gameProfileDecision: {
      manifestImplementation:
        "packages/game-manifest/src/index.ts",
      currentManifestMotionProfiles: [
        "body.core17",
        "actions.obstacle.v1",
      ],
      currentRicherProfileRequirements: [],
      auditScope:
        "every launchable first-party game and each compared dodge, duck, jump, and floor-contact mechanic",
      requiredEvidence:
        "same-exposure core-only and richer-profile metrics for the exact game mechanic, every blocking persona, and every required camera placement",
      richerRequirementRule:
        "a game may require a richer profile only when its pre-registered core-only gate fails, the richer view passes every blocking gate, the improvement is attributable to richer fields, and fail-closed unavailable-profile launch behavior is verified",
      coreSufficiencyRule:
        "retain body.core17 when it passes; do not require MediaPipe extensions from preference, aggregate improvement, or unmeasured floor-contact intuition",
      incompatibleBackendRule:
        "a backend missing a required richer profile is visibly incompatible for that game and receives no fabricated values or silent degraded control",
      result: "not-run",
      gamesRequiringRicherProfile: [],
    },
    requiredArtifacts: [
      "complete source-binding and dependency-lock hashes",
      "exact Pi, HAT, camera, OS, kernel, firmware, driver, HailoRT, TAPPAS, Hailo Apps, HEF, post-processor, MediaPipe, browser, delegate, and room manifests",
      "consent, privacy, minimization, and deletion-audit hashes",
      "same-exposure fanout proof with per-backend admission, completion, and drop accounting",
      "exposure authority, common-clock mapping, and uncertainty proofs",
      "independent action-label and floor-contact apparatus manifests",
      "frozen participant/cell/attempt schedule and threshold hashes",
      "closed capability manifests plus optional/required unavailable-profile negotiation transcripts",
      "complete per-attempt skeleton, event, timing, resource, and invalid-reason records without raw media",
      "per-view action and floor-event confusion matrices plus every required metric and slice",
      "complete-system concurrent obstacle-game resource and frame-time evidence",
      "per-game core-versus-richer profile audit with explicit no-requirement or requirement decision",
      "an incomplete result when any scheduled evidence or prerequisite is missing; never a partial qualification",
    ],
  };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const output = requireBoundedOutput(process.argv[2]);
  const plan = await buildHailoMediaPipeComparisonPlan();
  await mkdir(resolve(output, ".."), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, output);
  console.log(relative(defaultRepositoryRoot, output));
}
