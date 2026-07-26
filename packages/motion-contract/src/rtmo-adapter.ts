import { COORDINATE_SPEC_VERSION, IMAGE_COORDINATE_SYSTEM } from "./coordinates";
import { CORE_LANDMARK_NAMES } from "./landmarks";
import {
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type MotionFrame,
  type PlayerMotion,
} from "./schema";

export interface RtmoFrameTiming {
  sequence: number;
  sourceTimestampMs: number;
  inferenceStartedAtMs: number;
  inferenceCompletedAtMs: number;
  publishedAtMs: number;
}

export interface RtmoPersonResult {
  keypoints: ReadonlyArray<readonly [number, number]>;
  scores: ReadonlyArray<number>;
}

export interface RtmoAdapterOptions {
  imageWidth: number;
  imageHeight: number;
  maxPlayers: number;
  observedScoreThreshold?: number;
  timestampQuality?: "camera-exposure" | "capture-arrival" | "replay";
}

interface RankedPlayer {
  sourceIndex: number;
  confidence: number;
  player: PlayerMotion;
}

const DEFAULT_OBSERVED_SCORE_THRESHOLD = 0.25;

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function validateTiming(timing: RtmoFrameTiming): void {
  if (!Number.isSafeInteger(timing.sequence) || timing.sequence < 0) {
    throw new Error("sequence must be a non-negative safe integer");
  }
  for (const [name, value] of Object.entries(timing).filter(([name]) => name !== "sequence")) {
    requireFinite(value, name);
    if (value < 0) throw new Error(`${name} must be non-negative`);
  }
  if (timing.inferenceStartedAtMs < timing.sourceTimestampMs) {
    throw new Error("inferenceStartedAtMs must not precede sourceTimestampMs");
  }
  if (timing.inferenceCompletedAtMs < timing.inferenceStartedAtMs) {
    throw new Error("inferenceCompletedAtMs must not precede inferenceStartedAtMs");
  }
  if (timing.publishedAtMs < timing.inferenceCompletedAtMs) {
    throw new Error("publishedAtMs must not precede inferenceCompletedAtMs");
  }
}

function validateOptions(options: RtmoAdapterOptions): Required<RtmoAdapterOptions> {
  requireFinite(options.imageWidth, "imageWidth");
  requireFinite(options.imageHeight, "imageHeight");
  if (options.imageWidth <= 0 || options.imageHeight <= 0) {
    throw new Error("image dimensions must be positive");
  }
  if (!Number.isSafeInteger(options.maxPlayers) || options.maxPlayers <= 0) {
    throw new Error("maxPlayers must be a positive safe integer");
  }
  const observedScoreThreshold = options.observedScoreThreshold ?? DEFAULT_OBSERVED_SCORE_THRESHOLD;
  requireFinite(observedScoreThreshold, "observedScoreThreshold");
  if (observedScoreThreshold <= 0 || observedScoreThreshold > 1) {
    throw new Error("observedScoreThreshold must be greater than zero and at most one");
  }
  return {
    ...options,
    observedScoreThreshold,
    timestampQuality: options.timestampQuality ?? "capture-arrival",
  };
}

function playerFromResult(
  result: RtmoPersonResult,
  sourceIndex: number,
  options: Required<RtmoAdapterOptions>,
): RankedPlayer | undefined {
  if (result.keypoints.length !== CORE_LANDMARK_NAMES.length) {
    throw new Error(`RTMO person ${sourceIndex} must contain exactly ${CORE_LANDMARK_NAMES.length} keypoints`);
  }
  if (result.scores.length !== CORE_LANDMARK_NAMES.length) {
    throw new Error(`RTMO person ${sourceIndex} must contain exactly ${CORE_LANDMARK_NAMES.length} scores`);
  }

  const coreLandmarks = CORE_LANDMARK_NAMES.map((name, landmarkIndex) => {
    const point = result.keypoints[landmarkIndex];
    const score = result.scores[landmarkIndex];
    if (!point || score === undefined) throw new Error(`RTMO person ${sourceIndex} is incomplete`);
    if (point.length !== 2) throw new Error(`RTMO person ${sourceIndex} keypoint ${landmarkIndex} must contain x and y`);
    requireFinite(point[0], `RTMO person ${sourceIndex} keypoint ${landmarkIndex} x`);
    requireFinite(point[1], `RTMO person ${sourceIndex} keypoint ${landmarkIndex} y`);
    requireFinite(score, `RTMO person ${sourceIndex} score ${landmarkIndex}`);
    if (score < 0 || score > 1) {
      throw new Error(`RTMO person ${sourceIndex} score ${landmarkIndex} must be between zero and one`);
    }
    return {
      name,
      position: {
        x: point[0] / options.imageWidth,
        y: point[1] / options.imageHeight,
      },
      visibility: score,
      observed: score >= options.observedScoreThreshold,
    };
  });

  const observed = coreLandmarks.filter((landmark) => landmark.observed);
  if (observed.length === 0) return undefined;
  const confidence = coreLandmarks.reduce((total, landmark) => total + landmark.visibility, 0) / coreLandmarks.length;
  const bounds = observed.reduce(
    (current, landmark) => ({
      left: Math.min(current.left, landmark.position.x),
      top: Math.min(current.top, landmark.position.y),
      right: Math.max(current.right, landmark.position.x),
      bottom: Math.max(current.bottom, landmark.position.y),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    sourceIndex,
    confidence,
    player: {
      id: `candidate-${sourceIndex + 1}`,
      sessionSlot: 1,
      confidence,
      state: "candidate",
      coreLandmarks,
      bounds,
      actions: [],
    },
  };
}

/**
 * Converts RTMO's COCO-17 pixel-space output into the portable Motion frame.
 *
 * RTMO does not provide stable cross-frame identities here. Candidate IDs retain
 * the source-array index only; the downstream session tracker remains the identity
 * authority. Coordinates are intentionally not clamped because the Motion image
 * coordinate contract permits finite points outside the visible frame.
 */
export function rtmoResultToMotionFrame(
  people: ReadonlyArray<RtmoPersonResult>,
  timing: RtmoFrameTiming,
  rawOptions: RtmoAdapterOptions,
): MotionFrame {
  validateTiming(timing);
  const options = validateOptions(rawOptions);
  const players = people
    .map((person, sourceIndex) => playerFromResult(person, sourceIndex, options))
    .filter((player): player is RankedPlayer => player !== undefined)
    .sort((left, right) => right.confidence - left.confidence || left.sourceIndex - right.sourceIndex)
    .slice(0, options.maxPlayers)
    .map(({ player }, index) => ({ ...player, sessionSlot: index + 1 }));

  return MotionFrameSchema.parse({
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence: timing.sequence,
    source: "rtmo-native",
    sourceTimestampMs: timing.sourceTimestampMs,
    inferenceStartedAtMs: timing.inferenceStartedAtMs,
    inferenceCompletedAtMs: timing.inferenceCompletedAtMs,
    publishedAtMs: timing.publishedAtMs,
    health: "ready",
    capabilities: {
      profiles: ["body.core17"],
      maxPlayers: options.maxPlayers,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      coordinateSystem: IMAGE_COORDINATE_SYSTEM,
      timestampQuality: options.timestampQuality,
    },
    players,
  });
}
