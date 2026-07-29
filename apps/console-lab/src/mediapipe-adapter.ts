import {
  AppearanceFreeIdentityTracker,
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  CORE_TO_MEDIAPIPE_INDEX,
  MEDIAPIPE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type MotionFrame,
  type PlayerMotion,
} from "@vcg/motion-contract";
import type { NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export interface FrameTiming {
  sequence: number;
  sourceTimestampMs: number;
  inferenceStartedAtMs: number;
  inferenceCompletedAtMs: number;
  publishedAtMs: number;
}

export const MAX_ACTIVE_PLAYERS = 2;
export const MAX_TRACKED_POSES = 4;

interface MappedPose {
  confidence: number;
  coreLandmarks: PlayerMotion["coreLandmarks"];
  richLandmarks: NonNullable<PlayerMotion["richLandmarks"]>;
  bounds: PlayerMotion["bounds"];
}

function worldPoint(world: NormalizedLandmark | undefined) {
  if (!world) return undefined;
  return { xMeters: world.x, yMeters: world.y, zMeters: world.z };
}

function presence(point: NormalizedLandmark): number | undefined {
  if (!("presence" in point)) return undefined;
  return typeof point.presence === "number" ? point.presence : undefined;
}

function confidence(point: NormalizedLandmark): number {
  return Math.min(point.visibility ?? 1, presence(point) ?? 1);
}

function mappedLandmark<Name extends string>(
  name: Name,
  index: number,
  points: NormalizedLandmark[],
  world: NormalizedLandmark[],
) {
  const point = points[index];
  if (!point) throw new Error(`MediaPipe result is missing ${name}`);
  const pointPresence = presence(point);
  const position3d = worldPoint(world[index]);
  return {
    name,
    position: { x: point.x, y: point.y, z: point.z },
    ...(position3d ? { worldPosition: position3d } : {}),
    visibility: point.visibility ?? 1,
    ...(pointPresence === undefined ? {} : { presence: pointPresence }),
    observed: confidence(point) >= 0.25,
  };
}

function bounds(points: NormalizedLandmark[]) {
  return points.reduce(
    (current, point) => ({
      left: Math.min(current.left, point.x),
      top: Math.min(current.top, point.y),
      right: Math.max(current.right, point.x),
      bottom: Math.max(current.bottom, point.y),
    }),
    { left: 1, top: 1, right: 0, bottom: 0 },
  );
}

function poseFromResult(result: PoseLandmarkerResult, index: number): MappedPose | undefined {
  const points = result.landmarks[index];
  if (!points || points.length !== MEDIAPIPE_LANDMARK_NAMES.length) return undefined;
  const world = result.worldLandmarks[index] ?? [];

  const coreLandmarks = CORE_LANDMARK_NAMES.map((name) => mappedLandmark(name, CORE_TO_MEDIAPIPE_INDEX[name], points, world));
  const richLandmarks = MEDIAPIPE_LANDMARK_NAMES.map((name, index) => mappedLandmark(name, index, points, world));

  const playerConfidence =
    coreLandmarks.reduce((total, landmark) => total + Math.min(landmark.visibility, landmark.presence ?? 1), 0) / coreLandmarks.length;
  return {
    confidence: playerConfidence,
    coreLandmarks,
    richLandmarks,
    bounds: bounds(points),
  };
}

export class MediaPipeFrameAdapter {
  readonly #identityTracker = new AppearanceFreeIdentityTracker({
    algorithm: "two-stage-kalman-iou",
    maxTracks: MAX_TRACKED_POSES,
    maxMissedFrames: 6,
    maxAssociationDistance: 0.22,
    minimumDetectionConfidence: 0.1,
    highConfidenceThreshold: 0.6,
    minimumOks: 0.15,
  });
  #lastAssociationTimestampMs: number | undefined;

  convert(result: PoseLandmarkerResult, timing: FrameTiming): MotionFrame {
    const poses = result.landmarks.flatMap((_, index) => {
      const pose = poseFromResult(result, index);
      return pose ? [pose] : [];
    });
    const associationTimestampMs = Math.max(
      timing.sourceTimestampMs,
      (this.#lastAssociationTimestampMs ?? -1) + 0.001,
    );
    this.#lastAssociationTimestampMs = associationTimestampMs;
    const identity = this.#identityTracker.update({
      timestampMs: associationTimestampMs,
      detections: poses.map((pose) => ({
        confidence: Math.max(pose.confidence, 0.1),
        landmarks: pose.coreLandmarks.map((landmark) => ({
          x: landmark.position.x,
          y: landmark.position.y,
          // MediaPipe still reports a geometric hypothesis below our public
          // observed threshold. The associator may use that position to keep
          // identity continuity, while consumers still see observed=false.
          observed: Number.isFinite(landmark.position.x) && Number.isFinite(landmark.position.y),
        })),
      })),
    });
    const assignments = new Map(
      identity.assignments.map(({ detectionIndex, trackId }) => [detectionIndex, trackId]),
    );
    const players = poses.flatMap<PlayerMotion>((pose, detectionIndex) => {
      const id = assignments.get(detectionIndex);
      if (!id) return [];
      return [{
        id,
        sessionSlot: detectionIndex + 1,
        confidence: pose.confidence,
        state: "candidate",
        coreLandmarks: pose.coreLandmarks,
        richLandmarks: pose.richLandmarks,
        bounds: pose.bounds,
        actions: [],
      }];
    }).sort((left, right) => numericTrackId(left.id) - numericTrackId(right.id));

    return MotionFrameSchema.parse({
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence: timing.sequence,
      source: "mediapipe-web",
      sourceTimestampMs: timing.sourceTimestampMs,
      inferenceStartedAtMs: timing.inferenceStartedAtMs,
      inferenceCompletedAtMs: timing.inferenceCompletedAtMs,
      publishedAtMs: timing.publishedAtMs,
      health: "ready",
      capabilities: {
        profiles: ["body.core17", "body.mediapipe33", "body.world3d"],
        maxPlayers: MAX_ACTIVE_PLAYERS,
        coordinateSpecVersion: COORDINATE_SPEC_VERSION,
        coordinateSystem: "image.normalized.top-left",
        worldCoordinateSystem: "player.metric.hip-origin.provider-axes",
        timestampQuality: "capture-arrival",
      },
      players,
    });
  }
}

function numericTrackId(trackId: string): number {
  const numeric = Number(trackId.slice(trackId.lastIndexOf("-") + 1));
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

export function mediapipeResultToMotionFrame(result: PoseLandmarkerResult, timing: FrameTiming): MotionFrame {
  return new MediaPipeFrameAdapter().convert(result, timing);
}
