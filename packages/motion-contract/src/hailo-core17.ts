import {
  COORDINATE_SPEC_VERSION,
  IMAGE_COORDINATE_SYSTEM,
} from "./coordinates";
import {
  CORE_LANDMARK_NAMES,
  type CoreLandmarkName,
} from "./landmarks";
import {
  PlayerMotionSchema,
  type PlayerMotion,
} from "./schema";

export const HAILO_CORE17_INPUT_VERSION =
  "hailo-coco17-normalized/v1" as const;
export const HAILO_CORE17_PROJECTION_VERSION =
  "hailo-core17-projection/v1" as const;
export const MAX_HAILO_INPUT_PEOPLE = 64;
export const MAX_HAILO_PROJECTED_PLAYERS = 4;

export interface HailoCore17LandmarkObservation {
  readonly name: CoreLandmarkName;
  readonly x: number;
  readonly y: number;
  readonly score: number;
}

export interface HailoCore17PersonObservation {
  readonly landmarks: readonly Readonly<HailoCore17LandmarkObservation>[];
}

export interface HailoCore17BatchObservation {
  readonly schemaVersion: typeof HAILO_CORE17_INPUT_VERSION;
  readonly people: readonly Readonly<HailoCore17PersonObservation>[];
}

export interface HailoCore17ProjectionOptions {
  readonly maxPlayers: number;
  readonly observedScoreThreshold?: number;
}

export interface HailoCore17Projection {
  readonly schemaVersion: typeof HAILO_CORE17_PROJECTION_VERSION;
  readonly backend: "hailo";
  readonly motionFrameEmission: "blocked-pending-honest-source";
  readonly coordinateSpecVersion: typeof COORDINATE_SPEC_VERSION;
  readonly coordinateSystem: typeof IMAGE_COORDINATE_SYSTEM;
  readonly availableProfiles: readonly ["body.core17"];
  readonly unavailableProfiles: readonly [
    "body.mediapipe33",
    "body.world3d",
    "actions.obstacle.v1",
    "actions.shell.v1",
  ];
  readonly players: readonly Readonly<PlayerMotion>[];
}

interface RankedPlayer {
  readonly sourceIndex: number;
  readonly confidence: number;
  readonly player: PlayerMotion;
}

const DEFAULT_OBSERVED_SCORE_THRESHOLD = 0.25;
const BATCH_KEYS = ["people", "schemaVersion"] as const;
const PERSON_KEYS = ["landmarks"] as const;
const LANDMARK_KEYS = ["name", "score", "x", "y"] as const;
const OPTION_KEYS = ["maxPlayers", "observedScoreThreshold"] as const;

function requirePlainRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const actual = Object.keys(record).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${name} contains missing or unknown fields`);
  }
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function requireDenseArray(array: readonly unknown[], name: string): void {
  const keys = Object.keys(array);
  if (
    keys.length !== array.length ||
    keys.some((key, index) => key !== String(index))
  ) {
    throw new Error(`${name} must be a dense array without unknown fields`);
  }
}

function validateOptions(
  rawOptions: HailoCore17ProjectionOptions,
): Required<HailoCore17ProjectionOptions> {
  const options = requirePlainRecord(rawOptions, "options");
  const actualKeys = Object.keys(options).sort();
  if (
    actualKeys.some(
      (key) => !(OPTION_KEYS as readonly string[]).includes(key),
    ) ||
    !actualKeys.includes("maxPlayers")
  ) {
    throw new Error("options contains missing or unknown fields");
  }
  const maxPlayers = options.maxPlayers;
  if (
    typeof maxPlayers !== "number" ||
    !Number.isSafeInteger(maxPlayers) ||
    maxPlayers <= 0 ||
    maxPlayers > MAX_HAILO_PROJECTED_PLAYERS
  ) {
    throw new Error(
      `maxPlayers must be a safe integer between one and ${MAX_HAILO_PROJECTED_PLAYERS}`,
    );
  }
  const observedScoreThreshold =
    options.observedScoreThreshold ?? DEFAULT_OBSERVED_SCORE_THRESHOLD;
  const threshold = requireFiniteNumber(
    observedScoreThreshold,
    "observedScoreThreshold",
  );
  if (threshold <= 0 || threshold > 1) {
    throw new Error(
      "observedScoreThreshold must be greater than zero and at most one",
    );
  }
  return { maxPlayers, observedScoreThreshold: threshold };
}

function playerFromObservation(
  value: unknown,
  sourceIndex: number,
  observedScoreThreshold: number,
): RankedPlayer | undefined {
  const person = requirePlainRecord(value, `Hailo person ${sourceIndex}`);
  requireExactKeys(person, PERSON_KEYS, `Hailo person ${sourceIndex}`);
  const landmarks = person.landmarks;
  if (!Array.isArray(landmarks)) {
    throw new Error(`Hailo person ${sourceIndex} landmarks must be an array`);
  }
  requireDenseArray(landmarks, `Hailo person ${sourceIndex} landmarks`);
  if (landmarks.length !== CORE_LANDMARK_NAMES.length) {
    throw new Error(
      `Hailo person ${sourceIndex} must contain exactly ${CORE_LANDMARK_NAMES.length} landmarks`,
    );
  }

  const coreLandmarks = CORE_LANDMARK_NAMES.map((expectedName, index) => {
    const landmark = requirePlainRecord(
      landmarks[index],
      `Hailo person ${sourceIndex} landmark ${index}`,
    );
    requireExactKeys(
      landmark,
      LANDMARK_KEYS,
      `Hailo person ${sourceIndex} landmark ${index}`,
    );
    if (landmark.name !== expectedName) {
      throw new Error(
        `Hailo person ${sourceIndex} landmark ${index} must be ${expectedName}`,
      );
    }
    const x = requireFiniteNumber(
      landmark.x,
      `Hailo person ${sourceIndex} landmark ${index} x`,
    );
    const y = requireFiniteNumber(
      landmark.y,
      `Hailo person ${sourceIndex} landmark ${index} y`,
    );
    const score = requireFiniteNumber(
      landmark.score,
      `Hailo person ${sourceIndex} landmark ${index} score`,
    );
    if (score < 0 || score > 1) {
      throw new Error(
        `Hailo person ${sourceIndex} landmark ${index} score must be between zero and one`,
      );
    }
    return {
      name: expectedName,
      position: { x, y },
      visibility: score,
      observed: score >= observedScoreThreshold,
    };
  });

  const observed = coreLandmarks.filter((landmark) => landmark.observed);
  if (observed.length === 0) return undefined;
  const confidence =
    coreLandmarks.reduce(
      (total, landmark) => total + landmark.visibility,
      0,
    ) / coreLandmarks.length;
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
    player: PlayerMotionSchema.parse({
      id: `candidate-${sourceIndex + 1}`,
      sessionSlot: 1,
      confidence,
      state: "candidate",
      coreLandmarks,
      bounds,
      actions: [],
    }),
  };
}

/**
 * Maps a closed, already-normalized Hailo COCO-17 observation into the
 * provider-neutral core player shape without creating a Motion frame.
 *
 * The actual Hailo runtime/post-processing tuple must translate its native
 * output into HAILO_CORE17_INPUT_VERSION and prove the image-coordinate
 * semantics. Motion 0.4 has no honest Hailo source value, so this projection
 * deliberately cannot be sent over the Motion wire contract.
 */
export function projectHailoCore17(
  observation: unknown,
  rawOptions: HailoCore17ProjectionOptions,
): HailoCore17Projection {
  const batch = requirePlainRecord(observation, "Hailo observation");
  requireExactKeys(batch, BATCH_KEYS, "Hailo observation");
  if (batch.schemaVersion !== HAILO_CORE17_INPUT_VERSION) {
    throw new Error(
      `Hailo observation must use ${HAILO_CORE17_INPUT_VERSION}`,
    );
  }
  const people = batch.people;
  if (!Array.isArray(people)) {
    throw new Error("Hailo observation people must be an array");
  }
  requireDenseArray(people, "Hailo observation people");
  if (people.length > MAX_HAILO_INPUT_PEOPLE) {
    throw new Error(
      `Hailo observation cannot exceed ${MAX_HAILO_INPUT_PEOPLE} people`,
    );
  }
  const options = validateOptions(rawOptions);
  const players = people
    .map((person, sourceIndex) =>
      playerFromObservation(
        person,
        sourceIndex,
        options.observedScoreThreshold,
      ),
    )
    .filter((player): player is RankedPlayer => player !== undefined)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.sourceIndex - right.sourceIndex,
    )
    .slice(0, options.maxPlayers)
    .map(({ player }, index) => ({ ...player, sessionSlot: index + 1 }));

  return {
    schemaVersion: HAILO_CORE17_PROJECTION_VERSION,
    backend: "hailo",
    motionFrameEmission: "blocked-pending-honest-source",
    coordinateSpecVersion: COORDINATE_SPEC_VERSION,
    coordinateSystem: IMAGE_COORDINATE_SYSTEM,
    availableProfiles: ["body.core17"],
    unavailableProfiles: [
      "body.mediapipe33",
      "body.world3d",
      "actions.obstacle.v1",
      "actions.shell.v1",
    ],
    players,
  };
}
