import { z } from "zod";
import { CORE_LANDMARK_NAMES, type CoreLandmarkName } from "./landmarks";
import {
  PlayerMotionSchema,
  TrackerHealthStatusSchema,
  type MotionFrame,
  type PlayerMotion,
} from "./schema";

export const PLAYER_CONTROL_AVAILABILITY_SCHEMA_VERSION = 1 as const;

export const PLAYER_BODY_REGIONS = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;

export const PLAYER_CONTROL_GROUPS = [
  "menuSelect",
  "menuBackPause",
  "menuSwipe",
  "gameDodge",
  "gameDuck",
  "gameJump",
] as const;

export const PlayerRegionStateSchema = z.enum(["observed", "partial", "missing"]);
export const PlayerControlStateSchema = z.enum(["full", "partial", "unavailable"]);
export const PlayerControlAvailabilityReasonSchema = z.enum([
  "ready",
  "tracker-not-ready",
  "player-missing",
  "landmarks-missing",
]);

const CoreLandmarkNameSchema = z.enum(CORE_LANDMARK_NAMES);

export const PlayerControlAvailabilitySchema = z.object({
  schemaVersion: z.literal(PLAYER_CONTROL_AVAILABILITY_SCHEMA_VERSION),
  playerId: z.string().min(1).nullable(),
  state: PlayerControlStateSchema,
  reason: PlayerControlAvailabilityReasonSchema,
  regions: z.object({
    head: PlayerRegionStateSchema,
    torso: PlayerRegionStateSchema,
    leftArm: PlayerRegionStateSchema,
    rightArm: PlayerRegionStateSchema,
    leftLeg: PlayerRegionStateSchema,
    rightLeg: PlayerRegionStateSchema,
  }),
  controls: z.object({
    menuSelect: z.boolean(),
    menuBackPause: z.boolean(),
    menuSwipe: z.boolean(),
    gameDodge: z.boolean(),
    gameDuck: z.boolean(),
    gameJump: z.boolean(),
  }),
  missingLandmarks: z.array(CoreLandmarkNameSchema).max(CORE_LANDMARK_NAMES.length),
});

export type PlayerRegionState = z.infer<typeof PlayerRegionStateSchema>;
export type PlayerControlState = z.infer<typeof PlayerControlStateSchema>;
export type PlayerControlAvailability = z.infer<typeof PlayerControlAvailabilitySchema>;
export type PlayerControlGroup = (typeof PLAYER_CONTROL_GROUPS)[number];

const REGION_LANDMARKS = {
  head: ["nose", "left_eye", "right_eye", "left_ear", "right_ear"],
  torso: ["left_shoulder", "right_shoulder", "left_hip", "right_hip"],
  leftArm: ["left_shoulder", "left_elbow", "left_wrist"],
  rightArm: ["right_shoulder", "right_elbow", "right_wrist"],
  leftLeg: ["left_hip", "left_knee", "left_ankle"],
  rightLeg: ["right_hip", "right_knee", "right_ankle"],
} as const satisfies Readonly<Record<(typeof PLAYER_BODY_REGIONS)[number], readonly CoreLandmarkName[]>>;

export const PLAYER_CONTROL_REQUIRED_LANDMARKS = {
  menuSelect: ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist"],
  menuBackPause: [
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
  ],
  menuSwipe: ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist"],
  gameDodge: ["left_hip", "right_hip"],
  gameDuck: ["left_shoulder", "right_shoulder"],
  gameJump: ["left_hip", "right_hip", "left_ankle", "right_ankle"],
} as const satisfies Readonly<Record<PlayerControlGroup, readonly CoreLandmarkName[]>>;

/**
 * Derives a conservative, provider-neutral control-availability view from the
 * existing `observed` landmark signal. It does not invent a new confidence
 * threshold, authorize actions, or replace tracker health/context/calibration.
 */
export function assessPlayerControlAvailability(
  playerValue: PlayerMotion | undefined,
  trackerHealth: MotionFrame["health"],
): PlayerControlAvailability {
  const health = TrackerHealthStatusSchema.parse(trackerHealth);
  const player = playerValue === undefined ? undefined : PlayerMotionSchema.parse(playerValue);
  const observed = new Set(
    player?.coreLandmarks
      .filter((landmark) => landmark.observed)
      .map((landmark) => landmark.name) ?? [],
  );
  const missingLandmarks = CORE_LANDMARK_NAMES.filter((name) => !observed.has(name));
  const trackerReady = health === "ready";
  const controls = Object.fromEntries(
    PLAYER_CONTROL_GROUPS.map((control) => [
      control,
      trackerReady &&
        player !== undefined &&
        PLAYER_CONTROL_REQUIRED_LANDMARKS[control].every((name) => observed.has(name)),
    ]),
  ) as Record<PlayerControlGroup, boolean>;
  const regions = Object.fromEntries(
    PLAYER_BODY_REGIONS.map((region) => {
      const observedCount = REGION_LANDMARKS[region].filter((name) => observed.has(name)).length;
      const state: PlayerRegionState =
        observedCount === REGION_LANDMARKS[region].length
          ? "observed"
          : observedCount === 0
            ? "missing"
            : "partial";
      return [region, state];
    }),
  ) as PlayerControlAvailability["regions"];
  const availableCount = PLAYER_CONTROL_GROUPS.filter((control) => controls[control]).length;
  const state: PlayerControlState =
    trackerReady && missingLandmarks.length === 0
      ? "full"
      : availableCount > 0
        ? "partial"
        : "unavailable";
  const reason: PlayerControlAvailability["reason"] =
    !trackerReady
      ? "tracker-not-ready"
      : !player
        ? "player-missing"
        : missingLandmarks.length > 0
          ? "landmarks-missing"
          : "ready";
  return PlayerControlAvailabilitySchema.parse({
    schemaVersion: PLAYER_CONTROL_AVAILABILITY_SCHEMA_VERSION,
    playerId: player?.id ?? null,
    state,
    reason,
    regions,
    controls,
    missingLandmarks,
  });
}

const forwardCompatibleJsonSchemaOptions = {
  target: "draft-2020-12" as const,
  override: ({ jsonSchema }: { jsonSchema: Record<string, unknown> }) => {
    if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties;
  },
};

export const playerControlAvailabilityJsonSchema = z.toJSONSchema(
  PlayerControlAvailabilitySchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
playerControlAvailabilityJsonSchema.$id =
  "urn:vcg:schema:player-control-availability:1";
playerControlAvailabilityJsonSchema.title = "VCG player control availability v1";
playerControlAvailabilityJsonSchema.$comment =
  "Derived from existing observed landmarks and tracker health. It does not grant action authority or define qualification thresholds.";
