import { z } from "zod";
import { CORE_LANDMARK_NAMES, MEDIAPIPE_LANDMARK_NAMES } from "./landmarks";

export const MOTION_API_SCHEMA_VERSION = "0.1.0" as const;

const NormalizedPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite().optional(),
});

const WorldPointSchema = z.object({
  xMeters: z.number().finite(),
  yMeters: z.number().finite(),
  zMeters: z.number().finite(),
});

export const LandmarkSchema = z.object({
  name: z.enum(CORE_LANDMARK_NAMES),
  position: NormalizedPointSchema,
  worldPosition: WorldPointSchema.optional(),
  visibility: z.number().min(0).max(1),
  presence: z.number().min(0).max(1).optional(),
  observed: z.boolean(),
});

export const RichLandmarkSchema = z.object({
  name: z.enum(MEDIAPIPE_LANDMARK_NAMES),
  position: NormalizedPointSchema,
  worldPosition: WorldPointSchema.optional(),
  visibility: z.number().min(0).max(1),
  presence: z.number().min(0).max(1).optional(),
  observed: z.boolean(),
});

export const MotionActionNameSchema = z.enum([
  "player_join",
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_select",
  "menu_back",
  "pause",
]);

export const MotionActionSchema = z.object({
  name: MotionActionNameSchema,
  phase: z.enum(["started", "held", "ended", "triggered"]),
  confidence: z.number().min(0).max(1),
  occurredAtMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
});

export const MotionCapabilitiesSchema = z.object({
  profiles: z.array(z.enum(["body.core17", "body.mediapipe33", "body.world3d", "actions.obstacle.v1", "actions.shell.v1"])),
  maxPlayers: z.number().int().positive(),
  coordinateSystem: z.literal("image.normalized.top-left"),
  timestampQuality: z.enum(["camera-exposure", "capture-arrival", "replay"]),
});

export const MotionProfileSchema = MotionCapabilitiesSchema.shape.profiles.element;

export const CapabilityRequestSchema = z.object({
  requiredProfiles: z.array(MotionProfileSchema),
  optionalProfiles: z.array(MotionProfileSchema),
});

export const CapabilityNegotiationSchema = z.discriminatedUnion("accepted", [
  z.object({
    accepted: z.literal(true),
    activeProfiles: z.array(MotionProfileSchema),
    unavailableOptionalProfiles: z.array(MotionProfileSchema),
  }),
  z.object({
    accepted: z.literal(false),
    missingRequiredProfiles: z.array(MotionProfileSchema).min(1),
  }),
]);

function hasEveryLandmark<T extends string>(landmarks: ReadonlyArray<{ name: T }>, expected: ReadonlyArray<T>): boolean {
  const names = new Set(landmarks.map((landmark) => landmark.name));
  return names.size === expected.length && expected.every((name) => names.has(name));
}

export const PlayerMotionSchema = z
  .object({
    id: z.string().min(1),
    sessionSlot: z.number().int().positive(),
    confidence: z.number().min(0).max(1),
    state: z.enum(["candidate", "joined", "lost"]),
    coreLandmarks: z.array(LandmarkSchema).length(CORE_LANDMARK_NAMES.length),
    richLandmarks: z.array(RichLandmarkSchema).length(MEDIAPIPE_LANDMARK_NAMES.length).optional(),
    bounds: z.object({
      left: z.number().finite(),
      top: z.number().finite(),
      right: z.number().finite(),
      bottom: z.number().finite(),
    }),
    actions: z.array(MotionActionSchema),
  })
  .superRefine((player, context) => {
    if (!hasEveryLandmark(player.coreLandmarks, CORE_LANDMARK_NAMES)) {
      context.addIssue({ code: "custom", path: ["coreLandmarks"], message: "coreLandmarks must contain every core landmark exactly once" });
    }
    if (player.richLandmarks && !hasEveryLandmark(player.richLandmarks, MEDIAPIPE_LANDMARK_NAMES)) {
      context.addIssue({ code: "custom", path: ["richLandmarks"], message: "richLandmarks must contain every MediaPipe landmark exactly once" });
    }
  });

export const MotionFrameSchema = z.object({
  schemaVersion: z.literal(MOTION_API_SCHEMA_VERSION),
  sequence: z.number().int().nonnegative(),
  source: z.enum(["mediapipe-web", "replay", "synthetic"]),
  sourceTimestampMs: z.number().nonnegative(),
  inferenceStartedAtMs: z.number().nonnegative(),
  inferenceCompletedAtMs: z.number().nonnegative(),
  publishedAtMs: z.number().nonnegative(),
  health: z.enum(["starting", "ready", "degraded", "fault"]),
  capabilities: MotionCapabilitiesSchema,
  players: z.array(PlayerMotionSchema),
});

export const MotionTraceSchema = z.object({
  format: z.literal("vcg-motion-trace"),
  formatVersion: z.literal(1),
  createdAt: z.string().datetime(),
  containsRawFrames: z.literal(false),
  frames: z.array(MotionFrameSchema),
});

export type MotionFrame = z.infer<typeof MotionFrameSchema>;
export type MotionTrace = z.infer<typeof MotionTraceSchema>;
export type PlayerMotion = z.infer<typeof PlayerMotionSchema>;
export type MotionAction = z.infer<typeof MotionActionSchema>;
export type MotionCapabilities = z.infer<typeof MotionCapabilitiesSchema>;
export type MotionProfile = z.infer<typeof MotionProfileSchema>;
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;
export type CapabilityNegotiation = z.infer<typeof CapabilityNegotiationSchema>;

export const motionFrameJsonSchema = z.toJSONSchema(MotionFrameSchema, {
  target: "draft-2020-12",
}) as Record<string, unknown>;

function exactNameConstraints(names: readonly string[]): Record<string, unknown>[] {
  return names.map((name) => ({
    contains: { type: "object", properties: { name: { const: name } }, required: ["name"] },
    minContains: 1,
    maxContains: 1,
  }));
}

const frameProperties = motionFrameJsonSchema.properties as Record<string, Record<string, unknown>>;
const playerProperties = (frameProperties.players!.items as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
playerProperties.coreLandmarks!.allOf = exactNameConstraints(CORE_LANDMARK_NAMES);
playerProperties.richLandmarks!.allOf = exactNameConstraints(MEDIAPIPE_LANDMARK_NAMES);

export function parseMotionFrame(value: unknown): MotionFrame {
  return MotionFrameSchema.parse(value);
}

export function parseMotionTrace(value: unknown): MotionTrace {
  return MotionTraceSchema.parse(value);
}

export function negotiateCapabilities(available: MotionCapabilities, request: CapabilityRequest): CapabilityNegotiation {
  const parsedAvailable = MotionCapabilitiesSchema.parse(available);
  const parsedRequest = CapabilityRequestSchema.parse(request);
  const supported = new Set(parsedAvailable.profiles);
  const missingRequiredProfiles = parsedRequest.requiredProfiles.filter((profile) => !supported.has(profile));
  if (missingRequiredProfiles.length > 0) return { accepted: false, missingRequiredProfiles };

  return {
    accepted: true,
    activeProfiles: [...new Set([...parsedRequest.requiredProfiles, ...parsedRequest.optionalProfiles.filter((profile) => supported.has(profile))])],
    unavailableOptionalProfiles: parsedRequest.optionalProfiles.filter((profile) => !supported.has(profile)),
  };
}
