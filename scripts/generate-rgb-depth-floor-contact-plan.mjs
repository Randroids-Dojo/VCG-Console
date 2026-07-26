import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const planRoot = resolve(repositoryRoot, "benchmarks", "floor-contact");
const defaultOutput = resolve(planRoot, "rgb-depth-floor-contact-plan-v1.json");

export const RGB_DEPTH_CAMPAIGN_FORMAT =
  "vcg-rgb-depth-floor-contact-campaign";
export const RGB_DEPTH_CAMPAIGN_FORMAT_VERSION = 1;
export const RGB_DEPTH_CAMPAIGN_ID = "rgb-depth-floor-contact-v1";
export const RGB_DEPTH_PERSONA_CLASSES = [
  "school-age-child-standing",
  "adult-standing",
];
export const RGB_DEPTH_CAMERA_POSITIONS = [
  "frame-center",
  "frame-left-quarter",
  "frame-right-quarter",
  "frame-left-edge",
  "frame-right-edge",
];
export const RGB_DEPTH_MOVEMENT_BLOCKS = [
  {
    movement: "jump",
    eventTypes: ["takeoff", "apex", "landing"],
  },
  {
    movement: "step-left",
    eventTypes: ["left-contact-loss", "left-contact-gain"],
  },
  {
    movement: "step-right",
    eventTypes: ["right-contact-loss", "right-contact-gain"],
  },
];
export const RGB_DEPTH_STRATEGIES = [
  "core17-2d-rule",
  "mediapipe33-world-rule",
];

function git(args) {
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

function requireBoundedOutput(argument) {
  const output = argument ? resolve(repositoryRoot, argument) : defaultOutput;
  const rootRelative = relative(planRoot, output);
  if (
    rootRelative === "" ||
    rootRelative === ".." ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative) ||
    !output.endsWith(".json")
  ) {
    throw new Error(
      "output must be a JSON file below benchmarks/floor-contact",
    );
  }
  return output;
}

function cellId(personaClass, cameraPosition, movement) {
  return `${personaClass}--${cameraPosition}--${movement}`;
}

export function buildRgbDepthFloorContactPlan() {
  const cells = RGB_DEPTH_PERSONA_CLASSES.flatMap((personaClass) =>
    RGB_DEPTH_CAMERA_POSITIONS.flatMap((cameraPosition) =>
      RGB_DEPTH_MOVEMENT_BLOCKS.map(({ movement, eventTypes }) => ({
        cellId: cellId(personaClass, cameraPosition, movement),
        personaClass,
        cameraPosition,
        movement,
        eventTypes,
        scheduledAttempts: 20,
      })),
    ),
  );
  return {
    format: RGB_DEPTH_CAMPAIGN_FORMAT,
    formatVersion: RGB_DEPTH_CAMPAIGN_FORMAT_VERSION,
    documentType: "plan",
    campaignId: RGB_DEPTH_CAMPAIGN_ID,
    generatedAt: new Date().toISOString(),
    sourceCommit: git(["rev-parse", "HEAD"]),
    workingTreeClean: git(["status", "--porcelain"]) === "",
    claimBoundary:
      "Pre-registered physical campaign only. No RGB strategy, depth device, contact reference, participant, room, camera position, event timing, floor contact, action accuracy, or target platform has passed.",
    privacy: {
      rawFramesRetainedByDefault: false,
      participantIdentityPolicy:
        "opaque session-local participant IDs; no name, portrait, face embedding, or durable body identity",
      permittedPersistentArtifacts: [
        "bounded skeleton-only trace",
        "bounded depth-derived event labels",
        "bounded contact-reference event labels",
        "configuration manifest",
        "aggregate metrics",
      ],
      prohibitedPersistentArtifacts: [
        "rgb image",
        "depth image",
        "video",
        "audio",
        "face embedding",
        "profile portrait",
      ],
    },
    configuration: {
      motionApiSchemaVersion: "0.4.0",
      rgbStrategies: RGB_DEPTH_STRATEGIES,
      reference: {
        floorPlane: "depth-calibrated-floor-plane",
        footContact: "synchronized-independent-contact-reference",
        depthAloneQualifiesContactTruth: false,
      },
      timestamps: {
        requiredClock: "single-monotonic-clock-or-measured-affine-mapping",
        rgbTimestamp:
          "exposure timestamp or bounded exposure interval; capture-arrival time alone is invalid",
        depthTimestamp:
          "depth exposure timestamp or bounded exposure interval",
        contactTimestamp:
          "contact-reference sample timestamp on the campaign clock",
        maximumSynchronizationErrorMs: 5,
        maximumReferenceUncertaintyMs: 8,
      },
      devicesRequiredAtExecution: [
        "exact RGB device, USB identity, firmware, format, FPS, controls, and mount",
        "exact depth device, USB identity, firmware, SDK, mode, controls, and mount",
        "exact independent contact-reference device, firmware, sample rate, and threshold",
        "exact host, OS, clock source, capture stack, pose models, and model hashes",
      ],
    },
    matrix: {
      personaClasses: RGB_DEPTH_PERSONA_CLASSES,
      cameraPositions: RGB_DEPTH_CAMERA_POSITIONS,
      movementBlocks: RGB_DEPTH_MOVEMENT_BLOCKS,
      attemptsPerCell: 20,
      negativeWindowSecondsPerPersonaPosition: 60,
      cells,
      scheduledMovementAttempts: cells.reduce(
        (sum, cell) => sum + cell.scheduledAttempts,
        0,
      ),
      scheduledNegativeWindows:
        RGB_DEPTH_PERSONA_CLASSES.length *
        RGB_DEPTH_CAMERA_POSITIONS.length,
    },
    scoring: {
      eventMatching:
        "unique nearest prediction to each reference event inside the symmetric match window; one prediction cannot match two references",
      matchWindowMs: 250,
      signedErrorDefinition:
        "prediction timestamp minus reference timestamp in milliseconds",
      distributionMethod: "nearest-rank",
      requiredDistributionFields: [
        "count",
        "mean",
        "p50",
        "p95",
        "p99",
        "minimum",
        "maximum",
        "worstAbsolute",
      ],
      requiredCountFields: [
        "reference",
        "predicted",
        "matched",
        "missed",
        "spurious",
      ],
      requiredRates: ["precision", "recall"],
      invalidAttemptPolicy:
        "retain and classify every scheduled attempt; invalid attempts never disappear from denominators",
      selectionPolicy:
        "no RGB strategy selection until every cell and negative window is complete, synchronization/reference uncertainty passes, per-persona/per-position distributions are reported separately, and owner event-error gates are recorded",
      eventTimingGateMs: null,
      actionLatencyGateMs: 120,
    },
    executionRequirements: [
      "approved consent/assent and the selected room sheet",
      "independent participant/session labeling with no durable identity",
      "fixed and measured RGB/depth/contact geometry",
      "floor-plane calibration residual and coverage before every position block",
      "synchronization proof before and after every participant session",
      "twenty retained scheduled attempts in every matrix cell",
      "one retained negative window for every persona/position pair",
      "detached configuration, skeleton-trace, depth-label, and contact-label SHA-256 values",
      "separate invalid, missed, spurious, and matched counts",
      "per-event signed and absolute error distributions by participant, persona, and camera position",
      "full D-110 camera-to-action timing reported separately from event error",
      "no aggregate-only claim and no depth-only foot-contact truth claim",
    ],
  };
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  const output = requireBoundedOutput(process.argv[2]);
  const plan = buildRgbDepthFloorContactPlan();
  await mkdir(resolve(output, ".."), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, output);
  console.log(relative(repositoryRoot, output));
}
