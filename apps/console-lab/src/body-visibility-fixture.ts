import type { CoreLandmarkName, MotionFrame } from "@vcg/motion-contract";

export const BODY_VISIBILITY_FIXTURES = ["full", "left-arm", "legs", "half-body"] as const;
export type BodyVisibilityFixture = (typeof BODY_VISIBILITY_FIXTURES)[number];

const HIDDEN_LANDMARKS = {
  full: [],
  "left-arm": ["left_elbow", "left_wrist"],
  legs: ["left_knee", "right_knee", "left_ankle", "right_ankle"],
  "half-body": [
    "left_eye",
    "left_ear",
    "left_shoulder",
    "left_elbow",
    "left_wrist",
    "left_hip",
    "left_knee",
    "left_ankle",
  ],
} as const satisfies Readonly<Record<BodyVisibilityFixture, readonly CoreLandmarkName[]>>;

/**
 * Produces deterministic replay-only missing-landmark cases without changing
 * provider confidence values or pretending to define a production threshold.
 */
export function applyBodyVisibilityFixture(
  frame: MotionFrame,
  fixture: BodyVisibilityFixture,
): MotionFrame {
  const hidden = new Set<CoreLandmarkName>(HIDDEN_LANDMARKS[fixture]);
  if (hidden.size === 0) return frame;
  return {
    ...frame,
    players: frame.players.map((player) => ({
      ...player,
      coreLandmarks: player.coreLandmarks.map((landmark) =>
        hidden.has(landmark.name)
          ? { ...landmark, observed: false, visibility: 0, presence: 0 }
          : landmark,
      ),
      ...(player.richLandmarks
        ? {
            richLandmarks: player.richLandmarks.map((landmark) =>
              hidden.has(landmark.name as CoreLandmarkName)
                ? { ...landmark, observed: false, visibility: 0, presence: 0 }
                : landmark,
            ),
          }
        : {}),
    })),
  };
}
