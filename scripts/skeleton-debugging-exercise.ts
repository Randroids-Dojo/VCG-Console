import { createHash } from "node:crypto";
import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MOTION_TRACE_MAX_FRAMES,
  MOTION_TRACE_MAX_HEALTH_EVENTS,
  MOTION_TRACE_MAX_TRACKS,
  MotionTraceV2Schema,
  type CoreLandmarkName,
  type MotionAction,
  type MotionFrame,
  type MotionProfile,
  type MotionTraceV2,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";

export const EXERCISE_FORMAT = "vcg-skeleton-debugging-blind-exercise" as const;
export const SUBMISSION_FORMAT = "vcg-skeleton-debugging-blind-submission" as const;
export const RESULT_FORMAT = "vcg-skeleton-debugging-blind-result" as const;
export const EXERCISE_VERSION = 1 as const;
export const CAMPAIGN_ID = "core17-debugging-adequacy-v1" as const;
export const ANALYZER_ID = "core17-static-triage-v1" as const;

export const REPORTED_SYMPTOMS = [
  "unexpected-action",
  "left-right-inversion",
  "player-swap",
  "floor-contact-mismatch",
  "latency-regression",
  "landmark-loss",
  "tracker-dropout",
  "no-defect",
] as const;

export const FINDING_CODES = [
  "unsafe-action-under-low-confidence",
  "anatomical-axis-discontinuity",
  "track-position-discontinuity",
  "floor-reference-absent",
  "camera-exposure-time-absent",
  "landmark-observation-loss",
  "camera-disconnected-health",
] as const;

export const ROOT_CAUSE_CODES = [
  "action-confidence-gate-failure",
  "provider-landmark-name-swap",
  "identity-association-swap",
  "false-floor-contact-classification",
  "capture-latency-regression",
  "motion-blur",
  "camera-disconnected",
] as const;

export const REPRODUCTION_LEVELS = [
  "full",
  "symptom-only",
  "insufficient",
  "control",
] as const;

export type ReportedSymptom = (typeof REPORTED_SYMPTOMS)[number];
export type FindingCode = (typeof FINDING_CODES)[number];
export type RootCauseCode = (typeof ROOT_CAUSE_CODES)[number];
export type ReproductionLevel = (typeof REPRODUCTION_LEVELS)[number];

export interface BlindTraceCase {
  caseId: string;
  reportedSymptom: ReportedSymptom;
  traceSha256: string;
  trace: MotionTraceV2;
}

export interface BlindTraceBundle {
  format: typeof EXERCISE_FORMAT;
  formatVersion: typeof EXERCISE_VERSION;
  campaignId: typeof CAMPAIGN_ID;
  sourceCommit: string;
  workingTreeClean: boolean;
  traceSchema: {
    format: "vcg-motion-trace";
    formatVersion: 2;
    motionSchemaVersion: typeof MOTION_API_SCHEMA_VERSION;
  };
  analyzer: {
    id: typeof ANALYZER_ID;
    inputBoundary: "bundle-cases-only";
    truthAvailableToTriage: false;
  };
  truthCommitmentSha256: string;
  cases: BlindTraceCase[];
}

export interface TriageCase {
  caseId: string;
  traceSha256: string;
  reproductionLevel: ReproductionLevel;
  findingCodes: FindingCode[];
  rootCauseCode: RootCauseCode | null;
  rationaleCode:
    | "unsafe-authority-visible"
    | "axis-break-visible-cause-ambiguous"
    | "track-jump-visible-cause-ambiguous"
    | "physical-floor-truth-absent"
    | "exposure-clock-absent"
    | "observation-loss-visible-cause-ambiguous"
    | "stable-health-cause-visible"
    | "no-anomaly-detected"
    | "reported-symptom-not-reproduced";
}

export interface BlindTriageSubmission {
  format: typeof SUBMISSION_FORMAT;
  formatVersion: typeof EXERCISE_VERSION;
  campaignId: typeof CAMPAIGN_ID;
  analyzerId: typeof ANALYZER_ID;
  bundleSha256: string;
  truthAvailableToTriage: false;
  cases: TriageCase[];
}

export interface TruthCase {
  caseId: string;
  reportedSymptom: ReportedSymptom;
  expectedFindingCode: FindingCode | null;
  rootCauseCode: RootCauseCode | null;
  expectedReproductionLevel: ReproductionLevel;
}

export interface ScoredCase extends TruthCase {
  traceSha256: string;
  submittedFindingCodes: FindingCode[];
  submittedRootCauseCode: RootCauseCode | null;
  submittedReproductionLevel: ReproductionLevel;
  symptomDetected: boolean;
  levelCorrect: boolean;
  rootCauseIdentified: boolean;
  unsupportedRootCauseClaim: boolean;
}

export interface BlindTriageResult {
  format: typeof RESULT_FORMAT;
  formatVersion: typeof EXERCISE_VERSION;
  campaignId: typeof CAMPAIGN_ID;
  bundleSha256: string;
  submissionSha256: string;
  truthCommitmentSha256: string;
  truthSalt: string;
  truth: TruthCase[];
  cases: ScoredCase[];
  aggregate: {
    totalCases: number;
    defectCases: number;
    controlCases: number;
    detectedDefectSymptoms: number;
    fullyReproducedDefects: number;
    symptomOnlyDefects: number;
    insufficientDefects: number;
    identifiedRootCauses: number;
    unsupportedRootCauseClaims: number;
    controlFalsePositives: number;
  };
  boundary: {
    automatedBlindToTruthByInterface: true;
    independentHumanDebugger: false;
    syntheticOnly: true;
    rawFramesUsed: false;
    physicalCauseQualification: false;
  };
}

const TRUTH_SALT = "d9c6e72ae15db01d8724e6fe2dfa10d9b65c2eeaa59c2346e34f0a76e7cf50a4";

const TRUTH: TruthCase[] = [
  {
    caseId: "trace-01",
    reportedSymptom: "unexpected-action",
    expectedFindingCode: "unsafe-action-under-low-confidence",
    rootCauseCode: "action-confidence-gate-failure",
    expectedReproductionLevel: "full",
  },
  {
    caseId: "trace-02",
    reportedSymptom: "left-right-inversion",
    expectedFindingCode: "anatomical-axis-discontinuity",
    rootCauseCode: "provider-landmark-name-swap",
    expectedReproductionLevel: "symptom-only",
  },
  {
    caseId: "trace-03",
    reportedSymptom: "player-swap",
    expectedFindingCode: "track-position-discontinuity",
    rootCauseCode: "identity-association-swap",
    expectedReproductionLevel: "symptom-only",
  },
  {
    caseId: "trace-04",
    reportedSymptom: "floor-contact-mismatch",
    expectedFindingCode: "floor-reference-absent",
    rootCauseCode: "false-floor-contact-classification",
    expectedReproductionLevel: "insufficient",
  },
  {
    caseId: "trace-05",
    reportedSymptom: "latency-regression",
    expectedFindingCode: "camera-exposure-time-absent",
    rootCauseCode: "capture-latency-regression",
    expectedReproductionLevel: "insufficient",
  },
  {
    caseId: "trace-06",
    reportedSymptom: "landmark-loss",
    expectedFindingCode: "landmark-observation-loss",
    rootCauseCode: "motion-blur",
    expectedReproductionLevel: "symptom-only",
  },
  {
    caseId: "trace-07",
    reportedSymptom: "tracker-dropout",
    expectedFindingCode: "camera-disconnected-health",
    rootCauseCode: "camera-disconnected",
    expectedReproductionLevel: "full",
  },
  {
    caseId: "trace-08",
    reportedSymptom: "no-defect",
    expectedFindingCode: null,
    rootCauseCode: null,
    expectedReproductionLevel: "control",
  },
];

const BASE_POSE: Record<CoreLandmarkName, readonly [number, number]> = {
  nose: [0.5, 0.15],
  left_eye: [0.48, 0.14],
  right_eye: [0.52, 0.14],
  left_ear: [0.45, 0.15],
  right_ear: [0.55, 0.15],
  left_shoulder: [0.4, 0.3],
  right_shoulder: [0.6, 0.3],
  left_elbow: [0.36, 0.45],
  right_elbow: [0.64, 0.45],
  left_wrist: [0.33, 0.6],
  right_wrist: [0.67, 0.6],
  left_hip: [0.44, 0.55],
  right_hip: [0.56, 0.55],
  left_knee: [0.43, 0.73],
  right_knee: [0.57, 0.73],
  left_ankle: [0.42, 0.92],
  right_ankle: [0.58, 0.92],
};

interface PlayerOptions {
  confidence?: number;
  actions?: MotionAction[];
  centerOffsetX?: number;
  unobserved?: readonly CoreLandmarkName[];
  swappedLaterality?: boolean;
}

function player(id: string, options: PlayerOptions = {}): MotionFrame["players"][number] {
  const unobserved = new Set(options.unobserved ?? []);
  const offset = options.centerOffsetX ?? 0;
  const positionByName = new Map<CoreLandmarkName, readonly [number, number]>(
    CORE_LANDMARK_NAMES.map((name) => {
      if (!options.swappedLaterality) return [name, BASE_POSE[name]];
      if (name.startsWith("left_")) {
        const counterpart = name.replace(/^left_/, "right_") as CoreLandmarkName;
        return [name, BASE_POSE[counterpart]];
      }
      if (name.startsWith("right_")) {
        const counterpart = name.replace(/^right_/, "left_") as CoreLandmarkName;
        return [name, BASE_POSE[counterpart]];
      }
      return [name, BASE_POSE[name]];
    }),
  );
  return {
    id,
    sessionSlot: Number(id.at(-1)),
    confidence: options.confidence ?? 0.98,
    state: "joined",
    coreLandmarks: CORE_LANDMARK_NAMES.map((name) => {
      const position = positionByName.get(name)!;
      const observed = !unobserved.has(name);
      return {
        name,
        position: { x: position[0] + offset, y: position[1] },
        visibility: observed ? 0.98 : 0.1,
        observed,
      };
    }),
    bounds: {
      left: 0.3 + offset,
      top: 0.1,
      right: 0.7 + offset,
      bottom: 0.95,
    },
    actions: options.actions ?? [],
  };
}

interface FrameOptions {
  players?: MotionFrame["players"];
  timestampQuality?: MotionFrame["capabilities"]["timestampQuality"];
  source?: MotionFrame["source"];
  publishedDelayMs?: number;
  health?: MotionFrame["health"];
  actionProfiles?: MotionProfile[];
}

function frame(sequence: number, atMs: number, options: FrameOptions = {}): MotionFrame {
  const players = options.players ?? [player("trace-player-1")];
  const actionProfiles = options.actionProfiles ?? [];
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: options.source ?? "synthetic",
    sourceTimestampMs: atMs,
    inferenceStartedAtMs: atMs + 1,
    inferenceCompletedAtMs: atMs + 5,
    publishedAtMs: atMs + (options.publishedDelayMs ?? 6),
    health: options.health ?? "ready",
    capabilities: {
      profiles: ["body.core17", ...actionProfiles],
      maxPlayers: Math.max(1, players.length),
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: options.timestampQuality ?? "replay",
    },
    players,
  };
}

function healthEvent(
  sequence: number,
  atMs: number,
  reason: "healthy" | "camera-disconnected",
): TrackerHealthEvent {
  if (reason === "healthy") {
    return {
      schemaVersion: MOTION_API_SCHEMA_VERSION,
      sequence,
      source: "synthetic",
      occurredAtMs: atMs,
      status: "ready",
      reason,
      controlAvailability: "full",
    };
  }
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    occurredAtMs: atMs,
    status: "fault",
    reason,
    controlAvailability: "blocked",
  };
}

function trace(frames: MotionFrame[], healthEvents: TrackerHealthEvent[] = []): MotionTraceV2 {
  const frameSources = new Set<MotionFrame["source"]>();
  const timestampQualities = new Set<MotionFrame["capabilities"]["timestampQuality"]>();
  const exportedProfiles = new Set<MotionProfile>();
  for (const event of healthEvents) frameSources.add(event.source);
  for (const value of frames) {
    frameSources.add(value.source);
    timestampQualities.add(value.capabilities.timestampQuality);
    for (const profile of value.capabilities.profiles) exportedProfiles.add(profile);
  }
  return MotionTraceV2Schema.parse({
    format: "vcg-motion-trace",
    formatVersion: 2,
    createdAt: "2026-07-24T12:00:00.000Z",
    containsRawFrames: false,
    privacy: {
      containsRawFrames: false,
      containsAudio: false,
      containsPortraits: false,
      containsProfileIdentifiers: false,
      containsFreeText: false,
      containsDerivedSkeletons: true,
      containsTraceLocalTrackIds: true,
      containsExactExportTime: true,
    },
    retention: {
      volatileFrameLimit: MOTION_TRACE_MAX_FRAMES,
      volatileHealthEventLimit: MOTION_TRACE_MAX_HEALTH_EVENTS,
      volatileTrackLimit: MOTION_TRACE_MAX_TRACKS,
      droppedFrames: 0,
      droppedHealthEvents: 0,
      trackLimitReached: false,
      playerLimitExceeded: false,
      persistentBeforeExport: false,
      exportPersistence: "user-managed-file",
      deletionControl: "clear-volatile-buffer-and-delete-exported-file",
    },
    provenance: {
      motionSchemaVersion: MOTION_API_SCHEMA_VERSION,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      frameSources: [...frameSources].sort(),
      timestampQualities: [...timestampQualities].sort(),
      exportedProfiles: [...exportedProfiles].sort(),
    },
    healthEvents,
    frames,
  });
}

function buildTraceCases(): Array<Omit<BlindTraceCase, "traceSha256">> {
  const jump: MotionAction = {
    name: "jump",
    phase: "triggered",
    confidence: 0.9,
    occurredAtMs: 33,
  };
  const lowConfidenceJoints: CoreLandmarkName[] = [
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ];
  return [
    {
      caseId: "trace-01",
      reportedSymptom: "unexpected-action",
      trace: trace([
        frame(1, 0, { actionProfiles: ["actions.obstacle.v1"] }),
        frame(2, 33, {
          players: [
            player("trace-player-1", {
              confidence: 0.3,
              unobserved: lowConfidenceJoints,
              actions: [jump],
            }),
          ],
          actionProfiles: ["actions.obstacle.v1"],
        }),
        frame(3, 66, { actionProfiles: ["actions.obstacle.v1"] }),
      ]),
    },
    {
      caseId: "trace-02",
      reportedSymptom: "left-right-inversion",
      trace: trace([
        frame(1, 0),
        frame(2, 33),
        frame(3, 66, { players: [player("trace-player-1", { swappedLaterality: true })] }),
      ]),
    },
    {
      caseId: "trace-03",
      reportedSymptom: "player-swap",
      trace: trace([
        frame(1, 0, {
          players: [
            player("trace-player-1", { centerOffsetX: -0.2 }),
            player("trace-player-2", { centerOffsetX: 0.2 }),
          ],
        }),
        frame(2, 33, {
          players: [
            player("trace-player-1", { centerOffsetX: -0.18 }),
            player("trace-player-2", { centerOffsetX: 0.18 }),
          ],
        }),
        frame(3, 66, {
          players: [
            player("trace-player-1", { centerOffsetX: 0.18 }),
            player("trace-player-2", { centerOffsetX: -0.18 }),
          ],
        }),
      ]),
    },
    {
      caseId: "trace-04",
      reportedSymptom: "floor-contact-mismatch",
      trace: trace([
        frame(1, 0, { actionProfiles: ["actions.obstacle.v1"] }),
        frame(2, 33, {
          players: [player("trace-player-1", { actions: [jump] })],
          actionProfiles: ["actions.obstacle.v1"],
        }),
      ]),
    },
    {
      caseId: "trace-05",
      reportedSymptom: "latency-regression",
      trace: trace([
        frame(1, 0, { timestampQuality: "capture-arrival", publishedDelayMs: 95 }),
        frame(2, 33, { timestampQuality: "capture-arrival", publishedDelayMs: 96 }),
      ]),
    },
    {
      caseId: "trace-06",
      reportedSymptom: "landmark-loss",
      trace: trace([
        frame(1, 0),
        frame(2, 33, {
          players: [player("trace-player-1", { unobserved: ["left_wrist"] })],
        }),
        frame(3, 66),
      ]),
    },
    {
      caseId: "trace-07",
      reportedSymptom: "tracker-dropout",
      trace: trace(
        [
          frame(1, 0),
          frame(2, 33, { players: [], health: "fault" }),
        ],
        [healthEvent(1, 0, "healthy"), healthEvent(2, 33, "camera-disconnected")],
      ),
    },
    {
      caseId: "trace-08",
      reportedSymptom: "no-defect",
      trace: trace([frame(1, 0), frame(2, 33), frame(3, 66)]),
    },
  ];
}

export function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function buildBlindTraceBundle(
  sourceCommit = "0".repeat(40),
  workingTreeClean = false,
): BlindTraceBundle {
  const cases = buildTraceCases().map((value) => ({
    ...value,
    traceSha256: sha256(value.trace),
  }));
  return {
    format: EXERCISE_FORMAT,
    formatVersion: EXERCISE_VERSION,
    campaignId: CAMPAIGN_ID,
    sourceCommit,
    workingTreeClean,
    traceSchema: {
      format: "vcg-motion-trace",
      formatVersion: 2,
      motionSchemaVersion: MOTION_API_SCHEMA_VERSION,
    },
    analyzer: {
      id: ANALYZER_ID,
      inputBoundary: "bundle-cases-only",
      truthAvailableToTriage: false,
    },
    truthCommitmentSha256: sha256({ salt: TRUTH_SALT, truth: TRUTH }),
    cases,
  };
}

function landmarkX(
  frameValue: MotionFrame,
  playerId: string,
  name: CoreLandmarkName,
): number | undefined {
  return frameValue.players
    .find((candidate) => candidate.id === playerId)
    ?.coreLandmarks.find((landmark) => landmark.name === name)?.position.x;
}

function hasUnsafeAction(traceValue: MotionTraceV2): boolean {
  const actionRequired = new Set<CoreLandmarkName>([
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ]);
  return traceValue.frames.some((frameValue) =>
    frameValue.players.some((candidate) => {
      const hasTriggeredAction = candidate.actions.some((action) => action.phase === "triggered");
      if (!hasTriggeredAction) return false;
      if (candidate.confidence < 0.5) return true;
      return candidate.coreLandmarks.some(
        (landmark) =>
          actionRequired.has(landmark.name) &&
          (!landmark.observed || landmark.visibility < 0.5),
      );
    }),
  );
}

function hasAxisDiscontinuity(traceValue: MotionTraceV2): boolean {
  for (let index = 1; index < traceValue.frames.length; index += 1) {
    const previous = traceValue.frames[index - 1]!;
    const current = traceValue.frames[index]!;
    for (const previousPlayer of previous.players) {
      if (!current.players.some((candidate) => candidate.id === previousPlayer.id)) continue;
      const previousShoulder =
        (landmarkX(previous, previousPlayer.id, "right_shoulder") ?? 0) -
        (landmarkX(previous, previousPlayer.id, "left_shoulder") ?? 0);
      const currentShoulder =
        (landmarkX(current, previousPlayer.id, "right_shoulder") ?? 0) -
        (landmarkX(current, previousPlayer.id, "left_shoulder") ?? 0);
      const previousHip =
        (landmarkX(previous, previousPlayer.id, "right_hip") ?? 0) -
        (landmarkX(previous, previousPlayer.id, "left_hip") ?? 0);
      const currentHip =
        (landmarkX(current, previousPlayer.id, "right_hip") ?? 0) -
        (landmarkX(current, previousPlayer.id, "left_hip") ?? 0);
      if (
        Math.abs(previousShoulder) >= 0.05 &&
        Math.abs(currentShoulder) >= 0.05 &&
        Math.abs(previousHip) >= 0.05 &&
        Math.abs(currentHip) >= 0.05 &&
        previousShoulder * currentShoulder < 0 &&
        previousHip * currentHip < 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasTrackJump(traceValue: MotionTraceV2): boolean {
  for (let index = 1; index < traceValue.frames.length; index += 1) {
    const previous = traceValue.frames[index - 1]!;
    const current = traceValue.frames[index]!;
    const elapsed = current.sourceTimestampMs - previous.sourceTimestampMs;
    if (elapsed <= 0 || elapsed > 100) continue;
    for (const previousPlayer of previous.players) {
      const currentPlayer = current.players.find((candidate) => candidate.id === previousPlayer.id);
      if (!currentPlayer) continue;
      const previousCenter = (previousPlayer.bounds.left + previousPlayer.bounds.right) / 2;
      const currentCenter = (currentPlayer.bounds.left + currentPlayer.bounds.right) / 2;
      if (Math.abs(currentCenter - previousCenter) > 0.25) return true;
    }
  }
  return false;
}

function hasObservationLoss(traceValue: MotionTraceV2): boolean {
  return traceValue.frames.some((frameValue) =>
    frameValue.players.some((candidate) =>
      candidate.coreLandmarks.some((landmark) => !landmark.observed || landmark.visibility < 0.5),
    ),
  );
}

function triageCase(value: BlindTraceCase): TriageCase {
  const base = {
    caseId: value.caseId,
    traceSha256: value.traceSha256,
  };
  switch (value.reportedSymptom) {
    case "unexpected-action":
      return hasUnsafeAction(value.trace)
        ? {
            ...base,
            reproductionLevel: "full",
            findingCodes: ["unsafe-action-under-low-confidence"],
            rootCauseCode: "action-confidence-gate-failure",
            rationaleCode: "unsafe-authority-visible",
          }
        : {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    case "left-right-inversion":
      return hasAxisDiscontinuity(value.trace)
        ? {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: ["anatomical-axis-discontinuity"],
            rootCauseCode: null,
            rationaleCode: "axis-break-visible-cause-ambiguous",
          }
        : {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    case "player-swap":
      return hasTrackJump(value.trace)
        ? {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: ["track-position-discontinuity"],
            rootCauseCode: null,
            rationaleCode: "track-jump-visible-cause-ambiguous",
          }
        : {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    case "floor-contact-mismatch": {
      const hasMetricFloorEvidence = value.trace.provenance.exportedProfiles.includes("body.world3d");
      return !hasMetricFloorEvidence
        ? {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: ["floor-reference-absent"],
            rootCauseCode: null,
            rationaleCode: "physical-floor-truth-absent",
          }
        : {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    }
    case "latency-regression": {
      const hasExposureClock = value.trace.provenance.timestampQualities.includes("camera-exposure");
      return !hasExposureClock
        ? {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: ["camera-exposure-time-absent"],
            rootCauseCode: null,
            rationaleCode: "exposure-clock-absent",
          }
        : {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    }
    case "landmark-loss":
      return hasObservationLoss(value.trace)
        ? {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: ["landmark-observation-loss"],
            rootCauseCode: null,
            rationaleCode: "observation-loss-visible-cause-ambiguous",
          }
        : {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    case "tracker-dropout": {
      const disconnected = value.trace.healthEvents.some(
        (event) => event.status === "fault" && event.reason === "camera-disconnected",
      );
      return disconnected
        ? {
            ...base,
            reproductionLevel: "full",
            findingCodes: ["camera-disconnected-health"],
            rootCauseCode: "camera-disconnected",
            rationaleCode: "stable-health-cause-visible",
          }
        : {
            ...base,
            reproductionLevel: "insufficient",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          };
    }
    case "no-defect": {
      const anomaly =
        hasUnsafeAction(value.trace) ||
        hasAxisDiscontinuity(value.trace) ||
        hasTrackJump(value.trace) ||
        hasObservationLoss(value.trace) ||
        value.trace.healthEvents.some((event) => event.status === "fault");
      return anomaly
        ? {
            ...base,
            reproductionLevel: "symptom-only",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "reported-symptom-not-reproduced",
          }
        : {
            ...base,
            reproductionLevel: "control",
            findingCodes: [],
            rootCauseCode: null,
            rationaleCode: "no-anomaly-detected",
          };
    }
  }
}

export function triageBlindTraceBundle(bundle: BlindTraceBundle): BlindTriageSubmission {
  return {
    format: SUBMISSION_FORMAT,
    formatVersion: EXERCISE_VERSION,
    campaignId: CAMPAIGN_ID,
    analyzerId: ANALYZER_ID,
    bundleSha256: sha256(bundle),
    truthAvailableToTriage: false,
    cases: bundle.cases.map(triageCase),
  };
}

export function scoreBlindTriage(
  bundle: BlindTraceBundle,
  submission: BlindTriageSubmission,
): BlindTriageResult {
  const submittedById = new Map(submission.cases.map((value) => [value.caseId, value]));
  const traceById = new Map(bundle.cases.map((value) => [value.caseId, value]));
  const cases: ScoredCase[] = TRUTH.map((truth) => {
    const submitted = submittedById.get(truth.caseId);
    const traceCase = traceById.get(truth.caseId);
    if (!submitted || !traceCase) throw new Error(`missing scored case ${truth.caseId}`);
    const symptomDetected =
      truth.expectedFindingCode === null
        ? submitted.findingCodes.length === 0
        : submitted.findingCodes.includes(truth.expectedFindingCode);
    return {
      ...truth,
      traceSha256: traceCase.traceSha256,
      submittedFindingCodes: submitted.findingCodes,
      submittedRootCauseCode: submitted.rootCauseCode,
      submittedReproductionLevel: submitted.reproductionLevel,
      symptomDetected,
      levelCorrect: submitted.reproductionLevel === truth.expectedReproductionLevel,
      rootCauseIdentified:
        truth.rootCauseCode !== null && submitted.rootCauseCode === truth.rootCauseCode,
      unsupportedRootCauseClaim:
        submitted.rootCauseCode !== null && submitted.rootCauseCode !== truth.rootCauseCode,
    };
  });
  const defects = cases.filter((value) => value.expectedReproductionLevel !== "control");
  const controls = cases.filter((value) => value.expectedReproductionLevel === "control");
  return {
    format: RESULT_FORMAT,
    formatVersion: EXERCISE_VERSION,
    campaignId: CAMPAIGN_ID,
    bundleSha256: sha256(bundle),
    submissionSha256: sha256(submission),
    truthCommitmentSha256: bundle.truthCommitmentSha256,
    truthSalt: TRUTH_SALT,
    truth: structuredClone(TRUTH),
    cases,
    aggregate: {
      totalCases: cases.length,
      defectCases: defects.length,
      controlCases: controls.length,
      detectedDefectSymptoms: defects.filter((value) => value.symptomDetected).length,
      fullyReproducedDefects: defects.filter(
        (value) => value.submittedReproductionLevel === "full",
      ).length,
      symptomOnlyDefects: defects.filter(
        (value) => value.submittedReproductionLevel === "symptom-only",
      ).length,
      insufficientDefects: defects.filter(
        (value) => value.submittedReproductionLevel === "insufficient",
      ).length,
      identifiedRootCauses: defects.filter((value) => value.rootCauseIdentified).length,
      unsupportedRootCauseClaims: defects.filter((value) => value.unsupportedRootCauseClaim).length,
      controlFalsePositives: controls.filter(
        (value) =>
          value.submittedFindingCodes.length > 0 ||
          value.submittedRootCauseCode !== null ||
          value.submittedReproductionLevel !== "control",
      ).length,
    },
    boundary: {
      automatedBlindToTruthByInterface: true,
      independentHumanDebugger: false,
      syntheticOnly: true,
      rawFramesUsed: false,
      physicalCauseQualification: false,
    },
  };
}

function requireExactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has undeclared or missing fields`);
  }
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} does not match`);
}

export function validateExerciseArtifacts(
  bundleValue: unknown,
  submissionValue: unknown,
  resultValue: unknown,
): {
  bundle: BlindTraceBundle;
  submission: BlindTriageSubmission;
  result: BlindTriageResult;
} {
  requireExactKeys(
    bundleValue,
    [
      "format",
      "formatVersion",
      "campaignId",
      "sourceCommit",
      "workingTreeClean",
      "traceSchema",
      "analyzer",
      "truthCommitmentSha256",
      "cases",
    ],
    "bundle",
  );
  const bundle = bundleValue as unknown as BlindTraceBundle;
  if (
    bundle.format !== EXERCISE_FORMAT ||
    bundle.formatVersion !== EXERCISE_VERSION ||
    bundle.campaignId !== CAMPAIGN_ID ||
    !/^[0-9a-f]{40}$/.test(bundle.sourceCommit) ||
    typeof bundle.workingTreeClean !== "boolean" ||
    !/^[0-9a-f]{64}$/.test(bundle.truthCommitmentSha256)
  ) {
    throw new Error("bundle identity is invalid");
  }
  requireExactKeys(bundle.traceSchema, ["format", "formatVersion", "motionSchemaVersion"], "traceSchema");
  requireEqual(
    bundle.traceSchema,
    {
      format: "vcg-motion-trace",
      formatVersion: 2,
      motionSchemaVersion: MOTION_API_SCHEMA_VERSION,
    },
    "trace schema",
  );
  requireExactKeys(bundle.analyzer, ["id", "inputBoundary", "truthAvailableToTriage"], "analyzer");
  requireEqual(
    bundle.analyzer,
    {
      id: ANALYZER_ID,
      inputBoundary: "bundle-cases-only",
      truthAvailableToTriage: false,
    },
    "analyzer boundary",
  );
  if (!Array.isArray(bundle.cases) || bundle.cases.length !== TRUTH.length) {
    throw new Error("bundle cases are incomplete");
  }
  const caseIds = bundle.cases.map((value) => value.caseId);
  requireEqual(caseIds, TRUTH.map((value) => value.caseId), "case order");
  for (const [index, value] of bundle.cases.entries()) {
    requireExactKeys(value, ["caseId", "reportedSymptom", "traceSha256", "trace"], `case ${index}`);
    if (value.reportedSymptom !== TRUTH[index]!.reportedSymptom) {
      throw new Error(`case ${index} symptom changed`);
    }
    const parsedTrace = MotionTraceV2Schema.parse(value.trace);
    requireEqual(parsedTrace, value.trace, `case ${index} canonical trace`);
    if (sha256(value.trace) !== value.traceSha256) throw new Error(`case ${index} trace digest changed`);
  }

  requireExactKeys(
    submissionValue,
    [
      "format",
      "formatVersion",
      "campaignId",
      "analyzerId",
      "bundleSha256",
      "truthAvailableToTriage",
      "cases",
    ],
    "submission",
  );
  const submission = submissionValue as unknown as BlindTriageSubmission;
  requireEqual(submission, triageBlindTraceBundle(bundle), "blind triage submission");

  requireExactKeys(
    resultValue,
    [
      "format",
      "formatVersion",
      "campaignId",
      "bundleSha256",
      "submissionSha256",
      "truthCommitmentSha256",
      "truthSalt",
      "truth",
      "cases",
      "aggregate",
      "boundary",
    ],
    "result",
  );
  const result = resultValue as unknown as BlindTriageResult;
  if (sha256({ salt: result.truthSalt, truth: result.truth }) !== bundle.truthCommitmentSha256) {
    throw new Error("truth reveal does not match its commitment");
  }
  requireEqual(result, scoreBlindTriage(bundle, submission), "scored result");
  return { bundle, submission, result };
}
