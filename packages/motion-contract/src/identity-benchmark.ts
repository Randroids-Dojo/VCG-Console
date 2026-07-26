import {
  AppearanceFreeIdentityTracker,
  type IdentityPoseDetection,
  type IdentityTrackerAlgorithm,
} from "./identity-tracking";

export const IDENTITY_BENCHMARK_SUITE_VERSION =
  "appearance-free-identity-synthetic/v1" as const;

export interface LabeledIdentityDetection extends IdentityPoseDetection {
  truthId: string;
}

export interface IdentityBenchmarkFrame {
  timestampMs: number;
  detections: LabeledIdentityDetection[];
}

export interface IdentityBenchmarkScenario {
  id: string;
  description: string;
  framesPerSecond: 30;
  frames: IdentityBenchmarkFrame[];
}

export interface IdentityScenarioMetrics {
  scenarioId: string;
  visibleTruthObservations: number;
  assignedObservations: number;
  missedAssignments: number;
  idSwitches: number;
  falseTrackTransfers: number;
  assignmentFragmentations: number;
  distinctTracks: number;
  identityCorrectAssignments: number;
  idPrecision: number;
  idRecall: number;
  idF1: number;
}

export interface IdentityAlgorithmMetrics {
  algorithm: IdentityTrackerAlgorithm;
  totals: Omit<IdentityScenarioMetrics, "scenarioId">;
  scenarios: IdentityScenarioMetrics[];
}

const TEMPLATE = [
  [0, -0.35],
  [-0.04, -0.38],
  [0.04, -0.38],
  [-0.08, -0.36],
  [0.08, -0.36],
  [-0.14, -0.18],
  [0.14, -0.18],
  [-0.2, 0],
  [0.2, 0],
  [-0.24, 0.18],
  [0.24, 0.18],
  [-0.1, 0.16],
  [0.1, 0.16],
  [-0.1, 0.4],
  [0.1, 0.4],
  [-0.1, 0.68],
  [0.1, 0.68],
] as const;

type PoseVariant = "adult-a" | "adult-b" | "child";

interface PosePlacement {
  truthId: string;
  x: number;
  y: number;
  scale: number;
  confidence: number;
  variant: PoseVariant;
}

interface AssignmentObservation {
  truthId: string;
  trackId: string;
}

export function generateIdentityBenchmarkSuite(): IdentityBenchmarkScenario[] {
  return [
    linearCrossingScenario(),
    centralOcclusionScenario(),
    confidenceDipScenario(),
    fastReversalScenario(),
    longExitAndReentryScenario(),
    threePlayerBraidedScenario(),
  ];
}

export function evaluateIdentityAlgorithm(
  algorithm: IdentityTrackerAlgorithm,
  scenarios: readonly IdentityBenchmarkScenario[],
): IdentityAlgorithmMetrics {
  const scenarioMetrics = scenarios.map((scenario) =>
    evaluateScenario(algorithm, scenario),
  );
  const visibleTruthObservations = sum(
    scenarioMetrics,
    "visibleTruthObservations",
  );
  const assignedObservations = sum(scenarioMetrics, "assignedObservations");
  const missedAssignments = sum(scenarioMetrics, "missedAssignments");
  const idSwitches = sum(scenarioMetrics, "idSwitches");
  const falseTrackTransfers = sum(scenarioMetrics, "falseTrackTransfers");
  const assignmentFragmentations = sum(
    scenarioMetrics,
    "assignmentFragmentations",
  );
  const distinctTracks = sum(scenarioMetrics, "distinctTracks");
  const identityCorrectAssignments = sum(
    scenarioMetrics,
    "identityCorrectAssignments",
  );
  return {
    algorithm,
    totals: {
      visibleTruthObservations,
      assignedObservations,
      missedAssignments,
      idSwitches,
      falseTrackTransfers,
      assignmentFragmentations,
      distinctTracks,
      identityCorrectAssignments,
      idPrecision: rate(identityCorrectAssignments, assignedObservations),
      idRecall: rate(
        identityCorrectAssignments,
        visibleTruthObservations,
      ),
      idF1: f1(
        identityCorrectAssignments,
        assignedObservations,
        visibleTruthObservations,
      ),
    },
    scenarios: scenarioMetrics,
  };
}

function evaluateScenario(
  algorithm: IdentityTrackerAlgorithm,
  scenario: IdentityBenchmarkScenario,
): IdentityScenarioMetrics {
  const tracker = new AppearanceFreeIdentityTracker({
    algorithm,
    maxTracks: 4,
    maxMissedFrames: 6,
    maxAssociationDistance: 0.22,
    minimumDetectionConfidence: 0.1,
    highConfidenceThreshold: 0.6,
    minimumOks: 0.15,
  });
  const previousTrackByTruth = new Map<string, string>();
  const previousTruthByTrack = new Map<string, string>();
  const previousVisibleAssigned = new Map<string, boolean>();
  const everAssigned = new Set<string>();
  const observedAssociations: AssignmentObservation[] = [];
  const distinctTracks = new Set<string>();
  let visibleTruthObservations = 0;
  let assignedObservations = 0;
  let missedAssignments = 0;
  let idSwitches = 0;
  let falseTrackTransfers = 0;
  let assignmentFragmentations = 0;

  for (const frame of scenario.frames) {
    const update = tracker.update({
      timestampMs: frame.timestampMs,
      detections: frame.detections.map(({ confidence, landmarks }) => ({
        confidence,
        landmarks,
      })),
    });
    const assignmentByDetection = new Map(
      update.assignments.map(({ detectionIndex, trackId }) => [
        detectionIndex,
        trackId,
      ]),
    );
    for (const [detectionIndex, detection] of frame.detections.entries()) {
      visibleTruthObservations += 1;
      const trackId = assignmentByDetection.get(detectionIndex);
      if (trackId === undefined) {
        missedAssignments += 1;
        previousVisibleAssigned.set(detection.truthId, false);
        continue;
      }
      assignedObservations += 1;
      distinctTracks.add(trackId);
      observedAssociations.push({ truthId: detection.truthId, trackId });

      const previousTrack = previousTrackByTruth.get(detection.truthId);
      if (previousTrack !== undefined && previousTrack !== trackId) {
        idSwitches += 1;
      }
      const previousTruth = previousTruthByTrack.get(trackId);
      if (previousTruth !== undefined && previousTruth !== detection.truthId) {
        falseTrackTransfers += 1;
      }
      if (
        everAssigned.has(detection.truthId) &&
        previousVisibleAssigned.get(detection.truthId) === false
      ) {
        assignmentFragmentations += 1;
      }
      everAssigned.add(detection.truthId);
      previousVisibleAssigned.set(detection.truthId, true);
      previousTrackByTruth.set(detection.truthId, trackId);
      previousTruthByTrack.set(trackId, detection.truthId);
    }
  }

  const identityCorrect = maximumIdentityCorrect(observedAssociations);
  return {
    scenarioId: scenario.id,
    visibleTruthObservations,
    assignedObservations,
    missedAssignments,
    idSwitches,
    falseTrackTransfers,
    assignmentFragmentations,
    distinctTracks: distinctTracks.size,
    identityCorrectAssignments: identityCorrect,
    idPrecision: rate(identityCorrect, assignedObservations),
    idRecall: rate(identityCorrect, visibleTruthObservations),
    idF1: f1(
      identityCorrect,
      assignedObservations,
      visibleTruthObservations,
    ),
  };
}

function linearCrossingScenario(): IdentityBenchmarkScenario {
  return scenario(
    "two-player-linear-crossing",
    "Two differently proportioned players exchange horizontal positions without disappearing.",
    61,
    (frame) => {
      const progress = frame / 60;
      return [
        placement("player-a", 0.2 + 0.6 * progress, 0.46, 0.34, 0.94, "adult-a"),
        placement("player-b", 0.8 - 0.6 * progress, 0.46, 0.29, 0.92, "adult-b"),
      ];
    },
  );
}

function centralOcclusionScenario(): IdentityBenchmarkScenario {
  return scenario(
    "brief-central-occlusion",
    "One of two crossing players disappears for five frames at the overlap and returns inside the retention window.",
    70,
    (frame) => {
      const progress = frame / 69;
      const poses = [
        placement("player-a", 0.18 + 0.64 * progress, 0.45, 0.34, 0.93, "adult-a"),
      ];
      if (frame < 32 || frame > 36) {
        poses.push(
          placement("player-b", 0.82 - 0.64 * progress, 0.47, 0.28, 0.9, "adult-b"),
        );
      }
      return poses;
    },
  );
}

function confidenceDipScenario(): IdentityBenchmarkScenario {
  return scenario(
    "crossing-confidence-dip",
    "One crossing player's confidence falls below the high-confidence association threshold but stays observable.",
    64,
    (frame) => {
      const progress = frame / 63;
      return [
        placement("player-a", 0.2 + 0.58 * progress, 0.44, 0.33, 0.91, "adult-a"),
        placement(
          "player-b",
          0.8 - 0.58 * progress,
          0.48,
          0.27,
          frame >= 25 && frame <= 39 ? 0.28 : 0.9,
          "adult-b",
        ),
      ];
    },
  );
}

function fastReversalScenario(): IdentityBenchmarkScenario {
  return scenario(
    "fast-direction-reversal",
    "A moving player reverses direction near a mostly stationary second player.",
    72,
    (frame) => {
      const movingX =
        frame <= 35
          ? 0.18 + (0.48 * frame) / 35
          : 0.66 - (0.34 * (frame - 35)) / 36;
      return [
        placement("player-a", movingX, 0.44, 0.33, 0.92, "adult-a"),
        placement("player-b", 0.58, 0.48, 0.28, 0.9, "adult-b"),
      ];
    },
  );
}

function longExitAndReentryScenario(): IdentityBenchmarkScenario {
  return scenario(
    "long-exit-and-reentry",
    "A player leaves beyond the retention window and later re-enters near the retained player.",
    85,
    (frame) => {
      const poses = [
        placement("player-a", 0.42, 0.45, 0.34, 0.94, "adult-a"),
      ];
      if (frame < 25) {
        poses.push(
          placement("player-b", 0.72 + frame * 0.008, 0.47, 0.27, 0.9, "adult-b"),
        );
      } else if (frame > 52) {
        poses.push(
          placement("player-b", 0.92 - (frame - 52) * 0.012, 0.47, 0.27, 0.9, "adult-b"),
        );
      }
      return poses;
    },
  );
}

function threePlayerBraidedScenario(): IdentityBenchmarkScenario {
  return scenario(
    "three-player-braided-crossing",
    "Three differently proportioned players cross through the center on nearby paths.",
    76,
    (frame) => {
      const progress = frame / 75;
      return [
        placement("player-a", 0.14 + 0.72 * progress, 0.41, 0.34, 0.93, "adult-a"),
        placement("player-b", 0.86 - 0.72 * progress, 0.48, 0.29, 0.91, "adult-b"),
        placement(
          "player-c",
          0.5 + 0.18 * Math.sin(progress * Math.PI * 2),
          0.55 - 0.12 * progress,
          0.23,
          0.88,
          "child",
        ),
      ];
    },
  );
}

function scenario(
  id: string,
  description: string,
  frameCount: number,
  placementsAtFrame: (frame: number) => PosePlacement[],
): IdentityBenchmarkScenario {
  return {
    id,
    description,
    framesPerSecond: 30,
    frames: Array.from({ length: frameCount }, (_, frame) => {
      const placements = placementsAtFrame(frame);
      const detections = placements
        .map((placementValue) => labeledPose(placementValue, frame))
        .sort((left, right) =>
          detectionOrderKey(id, frame, left.truthId) -
            detectionOrderKey(id, frame, right.truthId) ||
          left.truthId.localeCompare(right.truthId),
        );
      return {
        timestampMs: Math.round((frame * 1000) / 30),
        detections,
      };
    }),
  };
}

function placement(
  truthId: string,
  x: number,
  y: number,
  scale: number,
  confidence: number,
  variant: PoseVariant,
): PosePlacement {
  return { truthId, x, y, scale, confidence, variant };
}

function labeledPose(
  placementValue: PosePlacement,
  frame: number,
): LabeledIdentityDetection {
  const phase = truthPhase(placementValue.truthId);
  return {
    truthId: placementValue.truthId,
    confidence: placementValue.confidence,
    landmarks: TEMPLATE.map(([templateX, templateY], landmarkIndex) => {
      const shaped = variantShape(
        templateX,
        templateY,
        landmarkIndex,
        placementValue.variant,
      );
      return {
        x:
          placementValue.x +
          shaped.x * placementValue.scale +
          deterministicJitter(frame, landmarkIndex, phase, "x"),
        y:
          placementValue.y +
          shaped.y * placementValue.scale +
          deterministicJitter(frame, landmarkIndex, phase, "y"),
        observed: true,
      };
    }),
  };
}

function variantShape(
  x: number,
  y: number,
  landmarkIndex: number,
  variant: PoseVariant,
): { x: number; y: number } {
  if (variant === "adult-b") {
    const upperBody = landmarkIndex >= 5 && landmarkIndex <= 10;
    return {
      x: x * (upperBody ? 0.76 : 1.08),
      y: y * 1.04,
    };
  }
  if (variant === "child") {
    const leg = landmarkIndex >= 13;
    return {
      x: x * 1.12,
      y: y * (leg ? 0.78 : 1),
    };
  }
  return { x, y };
}

function deterministicJitter(
  frame: number,
  landmarkIndex: number,
  phase: number,
  axis: "x" | "y",
): number {
  const axisOffset = axis === "x" ? 0.31 : 1.17;
  return (
    Math.sin(frame * 0.73 + landmarkIndex * 1.91 + phase + axisOffset) *
    0.0015
  );
}

function truthPhase(truthId: string): number {
  return [...truthId].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
}

function detectionOrderKey(
  scenarioId: string,
  frame: number,
  truthId: string,
): number {
  let hash = 2166136261;
  for (const character of `${scenarioId}:${frame}:${truthId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function maximumIdentityCorrect(
  observations: readonly AssignmentObservation[],
): number {
  const truths = [...new Set(observations.map(({ truthId }) => truthId))].sort();
  const tracks = [...new Set(observations.map(({ trackId }) => trackId))].sort();
  const counts = new Map<string, number>();
  for (const { truthId, trackId } of observations) {
    const key = `${truthId}\u0000${trackId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  const usedTracks = new Set<string>();
  const search = (truthIndex: number, total: number): void => {
    if (truthIndex === truths.length) {
      best = Math.max(best, total);
      return;
    }
    search(truthIndex + 1, total);
    const truthId = truths[truthIndex];
    if (truthId === undefined) return;
    for (const trackId of tracks) {
      if (usedTracks.has(trackId)) continue;
      usedTracks.add(trackId);
      search(
        truthIndex + 1,
        total + (counts.get(`${truthId}\u0000${trackId}`) ?? 0),
      );
      usedTracks.delete(trackId);
    }
  };
  search(0, 0);
  return best;
}

function sum(
  metrics: readonly IdentityScenarioMetrics[],
  field:
    | "visibleTruthObservations"
    | "assignedObservations"
    | "missedAssignments"
    | "idSwitches"
    | "falseTrackTransfers"
    | "assignmentFragmentations"
    | "distinctTracks"
    | "identityCorrectAssignments",
): number {
  return metrics.reduce((total, value) => total + value[field], 0);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function f1(
  correct: number,
  assignedObservations: number,
  visibleTruthObservations: number,
): number {
  const denominator = assignedObservations + visibleTruthObservations;
  return denominator === 0 ? 0 : round((2 * correct) / denominator);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
