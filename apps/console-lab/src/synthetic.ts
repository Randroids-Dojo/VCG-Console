import {
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  type CoreLandmarkName,
  type MotionFrame,
} from "@vcg/motion-contract";

const REST_POSE: Record<CoreLandmarkName, readonly [number, number]> = {
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

export function syntheticFrame(sequence: number, nowMs: number): MotionFrame {
  const wave = Math.sin(nowMs / 900) * 0.07;
  const crouch = Math.max(0, Math.sin(nowMs / 2100)) * 0.05;
  const coreLandmarks = CORE_LANDMARK_NAMES.map((name) => {
    const rest = REST_POSE[name];
    const upperBody = name.includes("shoulder") || name.includes("elbow") || name.includes("wrist") || name.includes("eye") || name.includes("ear") || name === "nose";
    const armWave = name === "left_wrist" ? Math.sin(nowMs / 350) * 0.12 : 0;
    return {
      name,
      position: {
        x: rest[0] + wave,
        y: rest[1] + (upperBody ? crouch : 0) + armWave,
      },
      visibility: 0.98,
      observed: true,
    };
  });

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
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: "replay",
    },
    players: [
      {
        id: "synthetic-1",
        sessionSlot: 1,
        confidence: 0.98,
        state: "candidate",
        coreLandmarks,
        bounds: { left: 0.3 + wave, top: 0.12, right: 0.7 + wave, bottom: 0.94 },
        actions: [],
      },
    ],
  });
}
