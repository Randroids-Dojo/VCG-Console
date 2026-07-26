import {
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type MotionFrame,
} from "./schema";
import { COORDINATE_SPEC_VERSION } from "./coordinates";
import { CORE_LANDMARK_NAMES, type CoreLandmarkName } from "./landmarks";

export const MOTION_SIMULATOR_POSES = [
  "neutral",
  "dodge-left",
  "dodge-right",
  "duck",
  "jump",
  "hands-together",
  "crossed-arms",
  "swipe-left",
  "swipe-right",
] as const;

export type MotionSimulatorPose = (typeof MOTION_SIMULATOR_POSES)[number];

export interface MotionSimulatorSnapshot {
  pose: MotionSimulatorPose;
  playerVisible: boolean;
}

export type MotionSimulatorCommand =
  | { type: "pose"; pose: MotionSimulatorPose }
  | { type: "player-visible"; visible: boolean }
  | { type: "reset" };

export interface MotionPoseSimulatorOptions {
  playerId?: string;
  playerConfidence?: number;
}

type Point = readonly [x: number, y: number];

const NEUTRAL_POSE: Readonly<Record<CoreLandmarkName, Point>> = {
  nose: [0.5, 0.18],
  left_eye: [0.485, 0.17],
  right_eye: [0.515, 0.17],
  left_ear: [0.46, 0.18],
  right_ear: [0.54, 0.18],
  left_shoulder: [0.42, 0.3],
  right_shoulder: [0.58, 0.3],
  left_elbow: [0.38, 0.45],
  right_elbow: [0.62, 0.45],
  left_wrist: [0.35, 0.6],
  right_wrist: [0.65, 0.6],
  left_hip: [0.45, 0.55],
  right_hip: [0.55, 0.55],
  left_knee: [0.44, 0.73],
  right_knee: [0.56, 0.73],
  left_ankle: [0.43, 0.92],
  right_ankle: [0.57, 0.92],
};

const UPPER_BODY = new Set<CoreLandmarkName>([
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
]);

/**
 * Deterministic, camera-free Motion API source for SDK development and tests.
 *
 * Pose names target the corresponding standardized action recognizer. Frames
 * contain landmarks only; action derivation remains the consumer's job.
 */
export class MotionPoseSimulator {
  readonly #playerId: string;
  readonly #playerConfidence: number;
  #pose: MotionSimulatorPose = "neutral";
  #playerVisible = true;

  constructor(options: MotionPoseSimulatorOptions = {}) {
    this.#playerId = options.playerId ?? "simulator-player-1";
    this.#playerConfidence = options.playerConfidence ?? 0.98;
    if (!this.#playerId) throw new Error("playerId must not be empty");
    if (
      !Number.isFinite(this.#playerConfidence)
      || this.#playerConfidence < 0
      || this.#playerConfidence > 1
    ) {
      throw new Error("playerConfidence must be between 0 and 1");
    }
  }

  get snapshot(): Readonly<MotionSimulatorSnapshot> {
    return { pose: this.#pose, playerVisible: this.#playerVisible };
  }

  apply(command: MotionSimulatorCommand): void {
    if (command.type === "reset") {
      this.#pose = "neutral";
      this.#playerVisible = true;
    } else if (command.type === "pose") {
      if (!(MOTION_SIMULATOR_POSES as readonly string[]).includes(command.pose)) {
        throw new Error(`unknown simulator pose: ${String(command.pose)}`);
      }
      this.#pose = command.pose;
    } else if (command.type === "player-visible") {
      if (typeof command.visible !== "boolean") {
        throw new Error("player visibility must be boolean");
      }
      this.#playerVisible = command.visible;
    } else {
      throw new Error("unknown simulator command");
    }
  }

  setPose(pose: MotionSimulatorPose): void {
    this.apply({ type: "pose", pose });
  }

  setPlayerVisible(visible: boolean): void {
    this.apply({ type: "player-visible", visible });
  }

  reset(): void {
    this.apply({ type: "reset" });
  }

  frame(sequence: number, nowMs: number): MotionFrame {
    if (!Number.isInteger(sequence) || sequence < 0) {
      throw new Error("sequence must be a non-negative integer");
    }
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new Error("nowMs must be a non-negative finite number");
    }

    const points = posePoints(this.#pose);
    const coreLandmarks = CORE_LANDMARK_NAMES.map((name) => ({
      name,
      position: { x: points[name][0], y: points[name][1] },
      visibility: this.#playerConfidence,
      observed: true,
    }));
    const positions = Object.values(points);
    const xs = positions.map(([x]) => x);
    const ys = positions.map(([, y]) => y);

    return MotionFrameSchema.parse({
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence,
      source: "synthetic",
      sourceTimestampMs: nowMs,
      inferenceStartedAtMs: nowMs,
      inferenceCompletedAtMs: nowMs + 1,
      publishedAtMs: nowMs + 1,
      health: "ready",
      capabilities: {
        profiles: ["body.core17"],
        maxPlayers: 1,
        coordinateSpecVersion: COORDINATE_SPEC_VERSION,
        coordinateSystem: "image.normalized.top-left",
        timestampQuality: "replay",
      },
      players: this.#playerVisible
        ? [{
            id: this.#playerId,
            sessionSlot: 1,
            confidence: this.#playerConfidence,
            state: "candidate",
            coreLandmarks,
            bounds: {
              left: Math.min(...xs),
              top: Math.min(...ys),
              right: Math.max(...xs),
              bottom: Math.max(...ys),
            },
            actions: [],
          }]
        : [],
    });
  }
}

function posePoints(pose: MotionSimulatorPose): Record<CoreLandmarkName, Point> {
  const points = { ...NEUTRAL_POSE };
  const shift = (names: Iterable<CoreLandmarkName>, x: number, y: number): void => {
    for (const name of names) {
      const point = points[name];
      points[name] = [point[0] + x, point[1] + y];
    }
  };

  if (pose === "dodge-left") shift(CORE_LANDMARK_NAMES, 0.15, 0);
  if (pose === "dodge-right") shift(CORE_LANDMARK_NAMES, -0.15, 0);
  if (pose === "duck") shift(UPPER_BODY, 0, 0.14);
  if (pose === "jump") shift(CORE_LANDMARK_NAMES, 0, -0.1);
  if (pose === "hands-together") {
    points.left_elbow = [0.43, 0.42];
    points.right_elbow = [0.57, 0.42];
    points.left_wrist = [0.48, 0.47];
    points.right_wrist = [0.52, 0.47];
  }
  if (pose === "crossed-arms") {
    points.left_elbow = [0.44, 0.41];
    points.right_elbow = [0.56, 0.41];
    points.left_wrist = [0.61, 0.43];
    points.right_wrist = [0.39, 0.43];
  }
  if (pose === "swipe-left") {
    points.left_elbow = [0.52, 0.27];
    points.left_wrist = [0.68, 0.22];
  }
  if (pose === "swipe-right") {
    points.right_elbow = [0.48, 0.27];
    points.right_wrist = [0.32, 0.22];
  }
  return points;
}
