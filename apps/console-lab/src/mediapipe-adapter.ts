import {
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

function playerFromResult(result: PoseLandmarkerResult): PlayerMotion | undefined {
  const points = result.landmarks[0];
  if (!points || points.length !== MEDIAPIPE_LANDMARK_NAMES.length) return undefined;
  const world = result.worldLandmarks[0] ?? [];

  const coreLandmarks = CORE_LANDMARK_NAMES.map((name) => mappedLandmark(name, CORE_TO_MEDIAPIPE_INDEX[name], points, world));
  const richLandmarks = MEDIAPIPE_LANDMARK_NAMES.map((name, index) => mappedLandmark(name, index, points, world));

  const playerConfidence =
    coreLandmarks.reduce((total, landmark) => total + Math.min(landmark.visibility, landmark.presence ?? 1), 0) / coreLandmarks.length;
  return {
    id: "candidate-1",
    sessionSlot: 1,
    confidence: playerConfidence,
    state: "candidate",
    coreLandmarks,
    richLandmarks,
    bounds: bounds(points),
    actions: [],
  };
}

export function mediapipeResultToMotionFrame(result: PoseLandmarkerResult, timing: FrameTiming): MotionFrame {
  const player = playerFromResult(result);
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
      maxPlayers: 1,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      coordinateSystem: "image.normalized.top-left",
      worldCoordinateSystem: "player.metric.hip-origin.provider-axes",
      timestampQuality: "capture-arrival",
    },
    players: player ? [player] : [],
  });
}
