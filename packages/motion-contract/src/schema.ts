import { z } from "zod";
import {
  actionBelongsToProfile,
  OBSTACLE_ACTION_NAMES,
  SHELL_ACTION_NAMES,
} from "./actions";
import { COORDINATE_SPEC_VERSION, IMAGE_COORDINATE_SYSTEM, PROVIDER_WORLD_COORDINATE_SYSTEM } from "./coordinates";
import { CORE_LANDMARK_NAMES, MEDIAPIPE_LANDMARK_NAMES } from "./landmarks";

export const MOTION_API_SCHEMA_VERSION = "0.4.0" as const;

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

export const MOTION_ACTION_NAMES = [
  "player_join",
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_swipe_up",
  "menu_swipe_down",
  "menu_select",
  "menu_back",
  "pause",
] as const;

export const MOTION_ACTION_PHASES = ["started", "held", "triggered", "ended", "cancelled"] as const;
export const MOTION_DISCRETE_ACTION_NAMES = [
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_swipe_up",
  "menu_swipe_down",
] as const;

export const MotionActionNameSchema = z.enum(MOTION_ACTION_NAMES);
const DISCRETE_ACTIONS = new Set<string>(MOTION_DISCRETE_ACTION_NAMES);

export const MotionActionSchema = z.object({
  name: MotionActionNameSchema,
  phase: z.enum(MOTION_ACTION_PHASES),
  confidence: z.number().min(0).max(1),
  occurredAtMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
}).superRefine((action, context) => {
  if (DISCRETE_ACTIONS.has(action.name) && action.phase !== "triggered") {
    context.addIssue({
      code: "custom",
      path: ["phase"],
      message: "discrete actions emit only triggered",
    });
  }
  if (action.phase === "started" && action.durationMs !== 0) {
    context.addIssue({
      code: "custom",
      path: ["durationMs"],
      message: "started actions require zero durationMs",
    });
  }
  if (["held", "ended", "cancelled"].includes(action.phase) && action.durationMs === undefined) {
    context.addIssue({
      code: "custom",
      path: ["durationMs"],
      message: `${action.phase} actions require durationMs`,
    });
  }
  if (!DISCRETE_ACTIONS.has(action.name) && action.phase === "triggered" && action.durationMs === undefined) {
    context.addIssue({
      code: "custom",
      path: ["durationMs"],
      message: "triggered sustained actions require durationMs",
    });
  }
  if (DISCRETE_ACTIONS.has(action.name) && action.durationMs !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["durationMs"],
      message: "discrete action triggers must not include durationMs",
    });
  }
  if (action.phase === "cancelled" && action.confidence !== 0) {
    context.addIssue({
      code: "custom",
      path: ["confidence"],
      message: "cancelled actions require zero confidence",
    });
  }
});

export const MotionCapabilitiesSchema = z
  .object({
    profiles: z.array(z.enum(["body.core17", "body.mediapipe33", "body.world3d", "actions.obstacle.v1", "actions.shell.v1"])),
    maxPlayers: z.number().int().positive(),
    coordinateSpecVersion: z.literal(COORDINATE_SPEC_VERSION),
    coordinateSystem: z.literal(IMAGE_COORDINATE_SYSTEM),
    worldCoordinateSystem: z.literal(PROVIDER_WORLD_COORDINATE_SYSTEM).optional(),
    timestampQuality: z.enum(["camera-exposure", "capture-arrival", "replay"]),
  })
  .superRefine((capabilities, context) => {
    const hasWorldProfile = capabilities.profiles.includes("body.world3d");
    if (hasWorldProfile && !capabilities.worldCoordinateSystem) {
      context.addIssue({ code: "custom", path: ["worldCoordinateSystem"], message: "body.world3d requires an explicit worldCoordinateSystem" });
    } else if (!hasWorldProfile && capabilities.worldCoordinateSystem) {
      context.addIssue({ code: "custom", path: ["worldCoordinateSystem"], message: "worldCoordinateSystem requires the body.world3d profile" });
    }
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

export const TRACKER_HEALTH_REASONS = [
  "initializing",
  "restarting",
  "healthy",
  "low-confidence",
  "overload",
  "fallback-backend",
  "camera-unavailable",
  "camera-disconnected",
  "backend-fault",
] as const;

export const TrackerHealthStatusSchema = z.enum(["starting", "ready", "degraded", "fault"]);
export const TrackerHealthReasonSchema = z.enum(TRACKER_HEALTH_REASONS);
export const MotionSourceSchema = z.enum(["mediapipe-web", "rtmo-native", "replay", "synthetic"]);

const TrackerHealthEventBaseSchema = z.object({
  schemaVersion: z.literal(MOTION_API_SCHEMA_VERSION),
  sequence: z.number().int().nonnegative(),
  source: MotionSourceSchema,
  occurredAtMs: z.number().nonnegative(),
});

export const TrackerHealthEventSchema = z.discriminatedUnion("status", [
  TrackerHealthEventBaseSchema.extend({
    status: z.literal("starting"),
    reason: z.enum(["initializing", "restarting"]),
    controlAvailability: z.literal("blocked"),
  }),
  TrackerHealthEventBaseSchema.extend({
    status: z.literal("ready"),
    reason: z.literal("healthy"),
    controlAvailability: z.literal("full"),
  }),
  TrackerHealthEventBaseSchema.extend({
    status: z.literal("degraded"),
    reason: z.enum(["low-confidence", "overload", "fallback-backend"]),
    controlAvailability: z.literal("landmarks-only"),
  }),
  TrackerHealthEventBaseSchema.extend({
    status: z.literal("fault"),
    reason: z.enum(["camera-unavailable", "camera-disconnected", "backend-fault"]),
    controlAvailability: z.literal("blocked"),
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

export const MotionFrameSchema = z
  .object({
    schemaVersion: z.literal(MOTION_API_SCHEMA_VERSION),
    sequence: z.number().int().nonnegative(),
    source: MotionSourceSchema,
    sourceTimestampMs: z.number().nonnegative(),
    inferenceStartedAtMs: z.number().nonnegative(),
    inferenceCompletedAtMs: z.number().nonnegative(),
    publishedAtMs: z.number().nonnegative(),
    health: TrackerHealthStatusSchema,
    capabilities: MotionCapabilitiesSchema,
    players: z.array(PlayerMotionSchema),
  })
  .superRefine((frame, context) => {
    if ((frame.health === "starting" || frame.health === "fault") && frame.players.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["players"],
        message: `${frame.health} frames cannot expose player data`,
      });
    }
    if (frame.health !== "ready") {
      frame.players.forEach((player, playerIndex) => {
        if (player.actions.length > 0) {
          context.addIssue({
            code: "custom",
            path: ["players", playerIndex, "actions"],
            message: `${frame.health} frames cannot authorize standardized actions`,
          });
        }
      });
    }
    const activeProfiles = new Set(frame.capabilities.profiles);
    frame.players.forEach((player, playerIndex) => {
      player.actions.forEach((action, actionIndex) => {
        const granted =
          (activeProfiles.has("actions.obstacle.v1") &&
            actionBelongsToProfile(action.name, "actions.obstacle.v1")) ||
          (activeProfiles.has("actions.shell.v1") &&
            actionBelongsToProfile(action.name, "actions.shell.v1"));
        if (!granted) {
          context.addIssue({
            code: "custom",
            path: ["players", playerIndex, "actions", actionIndex, "name"],
            message: "action requires its owning capability profile",
          });
        }
      });
    });
  });

export const MotionTraceV1Schema = z.object({
  format: z.literal("vcg-motion-trace"),
  formatVersion: z.literal(1),
  createdAt: z.string().datetime(),
  containsRawFrames: z.literal(false),
  frames: z.array(MotionFrameSchema),
});

export const MOTION_TRACE_MAX_FRAMES = 600 as const;
export const MOTION_TRACE_MAX_HEALTH_EVENTS = 128 as const;
export const MOTION_TRACE_MAX_PLAYERS = 4 as const;
export const MOTION_TRACE_MAX_TRACKS = 64 as const;
export const MOTION_TRACE_MAX_BYTES = 4 * 1024 * 1024;

const MotionTracePrivacySchema = z
  .object({
    containsRawFrames: z.literal(false),
    containsAudio: z.literal(false),
    containsPortraits: z.literal(false),
    containsProfileIdentifiers: z.literal(false),
    containsFreeText: z.literal(false),
    containsDerivedSkeletons: z.literal(true),
    containsTraceLocalTrackIds: z.literal(true),
    containsExactExportTime: z.literal(true),
  })
  .strict();

const MotionTraceRetentionSchema = z
  .object({
    volatileFrameLimit: z.literal(MOTION_TRACE_MAX_FRAMES),
    volatileHealthEventLimit: z.literal(MOTION_TRACE_MAX_HEALTH_EVENTS),
    volatileTrackLimit: z.literal(MOTION_TRACE_MAX_TRACKS),
    droppedFrames: z.number().int().nonnegative(),
    droppedHealthEvents: z.number().int().nonnegative(),
    trackLimitReached: z.boolean(),
    playerLimitExceeded: z.boolean(),
    persistentBeforeExport: z.literal(false),
    exportPersistence: z.literal("user-managed-file"),
    deletionControl: z.literal("clear-volatile-buffer-and-delete-exported-file"),
  })
  .strict();

const MotionTraceProvenanceSchema = z
  .object({
    motionSchemaVersion: z.literal(MOTION_API_SCHEMA_VERSION),
    coordinateSpecVersion: z.literal(COORDINATE_SPEC_VERSION),
    frameSources: z.array(MotionSourceSchema).min(1).max(4),
    timestampQualities: z
      .array(z.enum(["camera-exposure", "capture-arrival", "replay"]))
      .min(1)
      .max(3),
    exportedProfiles: z.array(MotionProfileSchema).min(1).max(5),
  })
  .strict();

function requireSortedUnique(
  values: readonly string[],
  path: PropertyKey[],
  context: z.core.$RefinementCtx,
): void {
  const expected = [...new Set(values)].sort();
  if (values.length !== expected.length || values.some((value, index) => value !== expected[index])) {
    context.addIssue({
      code: "custom",
      path,
      message: "values must be unique and sorted",
      input: values,
    });
  }
}

function requireExactSet(
  declared: readonly string[],
  observed: ReadonlySet<string>,
  path: PropertyKey[],
  context: z.core.$RefinementCtx,
): void {
  const expected = [...observed].sort();
  if (declared.length !== expected.length || declared.some((value, index) => value !== expected[index])) {
    context.addIssue({
      code: "custom",
      path,
      message: "declared provenance must exactly match trace contents",
      input: declared,
    });
  }
}

export const MotionTraceV2Schema = z
  .object({
    format: z.literal("vcg-motion-trace"),
    formatVersion: z.literal(2),
    createdAt: z.string().datetime(),
    containsRawFrames: z.literal(false),
    privacy: MotionTracePrivacySchema,
    retention: MotionTraceRetentionSchema,
    provenance: MotionTraceProvenanceSchema,
    healthEvents: z.array(TrackerHealthEventSchema).max(MOTION_TRACE_MAX_HEALTH_EVENTS),
    frames: z.array(MotionFrameSchema).min(1).max(MOTION_TRACE_MAX_FRAMES),
  })
  .strict()
  .superRefine((trace, context) => {
    requireSortedUnique(trace.provenance.frameSources, ["provenance", "frameSources"], context);
    requireSortedUnique(trace.provenance.timestampQualities, ["provenance", "timestampQualities"], context);
    requireSortedUnique(trace.provenance.exportedProfiles, ["provenance", "exportedProfiles"], context);

    const observedSources = new Set<string>();
    const observedTimestampQualities = new Set<string>();
    const observedProfiles = new Set<string>();
    for (const event of trace.healthEvents) observedSources.add(event.source);
    for (const [frameIndex, frame] of trace.frames.entries()) {
      observedSources.add(frame.source);
      observedTimestampQualities.add(frame.capabilities.timestampQuality);
      for (const profile of frame.capabilities.profiles) observedProfiles.add(profile);
      if (new Set(frame.capabilities.profiles).size !== frame.capabilities.profiles.length) {
        context.addIssue({
          code: "custom",
          path: ["frames", frameIndex, "capabilities", "profiles"],
          message: "debug trace frame profiles must be unique",
          input: frame.capabilities.profiles,
        });
      }
      if (frame.capabilities.maxPlayers > MOTION_TRACE_MAX_PLAYERS) {
        context.addIssue({
          code: "custom",
          path: ["frames", frameIndex, "capabilities", "maxPlayers"],
          message: `debug traces support at most ${MOTION_TRACE_MAX_PLAYERS} players`,
          input: frame.capabilities.maxPlayers,
        });
      }
      if (frame.players.length > MOTION_TRACE_MAX_PLAYERS) {
        context.addIssue({
          code: "custom",
          path: ["frames", frameIndex, "players"],
          message: `debug traces support at most ${MOTION_TRACE_MAX_PLAYERS} players`,
          input: frame.players,
        });
      }
      const playerIds = new Set<string>();
      const sessionSlots = new Set<number>();
      for (const [playerIndex, player] of frame.players.entries()) {
        if (playerIds.has(player.id)) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "players", playerIndex, "id"],
            message: "debug trace frame player IDs must be unique",
            input: player.id,
          });
        }
        playerIds.add(player.id);
        if (sessionSlots.has(player.sessionSlot)) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "players", playerIndex, "sessionSlot"],
            message: "debug trace frame session slots must be unique",
            input: player.sessionSlot,
          });
        }
        sessionSlots.add(player.sessionSlot);
        if (!/^trace-player-(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(player.id)) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "players", playerIndex, "id"],
            message: "debug trace player IDs must be trace-local pseudonyms",
            input: player.id,
          });
        }
        if (player.richLandmarks !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "players", playerIndex, "richLandmarks"],
            message: "v2 debug traces retain only the portable core skeleton",
            input: player.richLandmarks,
          });
        }
        for (const [landmarkIndex, landmark] of player.coreLandmarks.entries()) {
          if (
            landmark.position.z !== undefined ||
            landmark.worldPosition !== undefined ||
            landmark.presence !== undefined
          ) {
            context.addIssue({
              code: "custom",
              path: ["frames", frameIndex, "players", playerIndex, "coreLandmarks", landmarkIndex],
              message: "v2 debug traces retain only normalized x/y, visibility, and observed state",
              input: landmark,
            });
          }
        }
      }
      if (frameIndex > 0) {
        const previous = trace.frames[frameIndex - 1]!;
        if (frame.sequence <= previous.sequence) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "sequence"],
            message: "debug trace frame sequences must increase strictly",
            input: frame.sequence,
          });
        }
        if (frame.sourceTimestampMs < previous.sourceTimestampMs) {
          context.addIssue({
            code: "custom",
            path: ["frames", frameIndex, "sourceTimestampMs"],
            message: "debug trace timestamps must be monotonic",
            input: frame.sourceTimestampMs,
          });
        }
      }
    }
    for (let eventIndex = 1; eventIndex < trace.healthEvents.length; eventIndex += 1) {
      const previous = trace.healthEvents[eventIndex - 1]!;
      const event = trace.healthEvents[eventIndex]!;
      if (event.sequence <= previous.sequence) {
        context.addIssue({
          code: "custom",
          path: ["healthEvents", eventIndex, "sequence"],
          message: "debug trace health sequences must increase strictly",
          input: event.sequence,
        });
      }
      if (event.occurredAtMs < previous.occurredAtMs) {
        context.addIssue({
          code: "custom",
          path: ["healthEvents", eventIndex, "occurredAtMs"],
          message: "debug trace health timestamps must be monotonic",
          input: event.occurredAtMs,
        });
      }
    }

    requireExactSet(trace.provenance.frameSources, observedSources, ["provenance", "frameSources"], context);
    requireExactSet(
      trace.provenance.timestampQualities,
      observedTimestampQualities,
      ["provenance", "timestampQualities"],
      context,
    );
    requireExactSet(trace.provenance.exportedProfiles, observedProfiles, ["provenance", "exportedProfiles"], context);

    const byteLength = new TextEncoder().encode(JSON.stringify(trace)).byteLength;
    if (byteLength > MOTION_TRACE_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        path: [],
        message: `debug trace exceeds ${MOTION_TRACE_MAX_BYTES} bytes`,
        input: trace,
      });
    }
  });

export const MotionTraceSchema = z.discriminatedUnion("formatVersion", [
  MotionTraceV1Schema,
  MotionTraceV2Schema,
]);

export type MotionFrame = z.infer<typeof MotionFrameSchema>;
export type MotionTrace = z.infer<typeof MotionTraceSchema>;
export type MotionTraceV2 = z.infer<typeof MotionTraceV2Schema>;
export type PlayerMotion = z.infer<typeof PlayerMotionSchema>;
export type MotionAction = z.infer<typeof MotionActionSchema>;
export type MotionCapabilities = z.infer<typeof MotionCapabilitiesSchema>;
export type MotionProfile = z.infer<typeof MotionProfileSchema>;
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;
export type CapabilityNegotiation = z.infer<typeof CapabilityNegotiationSchema>;
export type TrackerHealthStatus = z.infer<typeof TrackerHealthStatusSchema>;
export type TrackerHealthReason = z.infer<typeof TrackerHealthReasonSchema>;
export type TrackerHealthEvent = z.infer<typeof TrackerHealthEventSchema>;

export const motionFrameJsonSchema = z.toJSONSchema(MotionFrameSchema, {
  target: "draft-2020-12",
}) as Record<string, unknown>;
export const motionTraceJsonSchema = z.toJSONSchema(MotionTraceV2Schema, {
  target: "draft-2020-12",
}) as Record<string, unknown>;
export const trackerHealthEventJsonSchema = z.toJSONSchema(TrackerHealthEventSchema, {
  target: "draft-2020-12",
}) as Record<string, unknown>;

export function addCoordinateCapabilityJsonConstraints<T extends Record<string, unknown>>(schema: T): T {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const properties = node.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      const fields = properties as Record<string, unknown>;
      if (fields.profiles && fields.coordinateSpecVersion && fields.coordinateSystem && fields.worldCoordinateSystem) {
        node.allOf = [
          {
            if: { properties: { profiles: { contains: { const: "body.world3d" } } }, required: ["profiles"] },
            then: { required: ["worldCoordinateSystem"] },
            else: { not: { required: ["worldCoordinateSystem"] } },
          },
        ];
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(schema);
  return schema;
}

export function addMotionContractJsonConstraints<T extends Record<string, unknown>>(schema: T): T {
  addCoordinateCapabilityJsonConstraints(schema);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const properties = node.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      const fields = properties as Record<string, unknown>;
      if (fields.name && fields.phase && fields.confidence && fields.occurredAtMs && fields.durationMs) {
        node.allOf = [
          {
            if: {
              properties: { name: { enum: [...MOTION_DISCRETE_ACTION_NAMES] } },
              required: ["name"],
            },
            then: {
              properties: { phase: { const: "triggered" } },
              required: ["phase"],
              not: { required: ["durationMs"] },
            },
            else: { required: ["durationMs"] },
          },
          {
            if: { properties: { phase: { const: "started" } }, required: ["phase"] },
            then: { properties: { durationMs: { const: 0 } }, required: ["durationMs"] },
          },
          {
            if: { properties: { phase: { const: "cancelled" } }, required: ["phase"] },
            then: { properties: { confidence: { const: 0 } }, required: ["confidence"] },
          },
        ];
      }
      if (fields.schemaVersion && fields.capabilities && fields.players) {
        node.allOf = [
          actionProfileJsonConstraint("actions.obstacle.v1", OBSTACLE_ACTION_NAMES),
          actionProfileJsonConstraint("actions.shell.v1", SHELL_ACTION_NAMES),
          {
            if: {
              properties: { health: { enum: ["starting", "fault"] } },
              required: ["health"],
            },
            then: { properties: { players: { maxItems: 0 } } },
          },
          {
            if: {
              properties: { health: { not: { const: "ready" } } },
              required: ["health"],
            },
            then: {
              properties: {
                players: {
                  items: {
                    properties: { actions: { maxItems: 0 } },
                    required: ["actions"],
                  },
                },
              },
            },
          },
        ];
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(schema);
  return schema;
}

function actionProfileJsonConstraint(
  profile: "actions.obstacle.v1" | "actions.shell.v1",
  actionNames: readonly string[],
): Record<string, unknown> {
  return {
    if: {
      properties: {
        capabilities: {
          properties: { profiles: { not: { contains: { const: profile } } } },
          required: ["profiles"],
        },
      },
      required: ["capabilities"],
    },
    then: {
      properties: {
        players: {
          items: {
            properties: {
              actions: {
                items: {
                  properties: { name: { not: { enum: [...actionNames] } } },
                  required: ["name"],
                },
              },
            },
            required: ["actions"],
          },
        },
      },
    },
  };
}

addMotionContractJsonConstraints(motionFrameJsonSchema);

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

export function parseTrackerHealthEvent(value: unknown): TrackerHealthEvent {
  return TrackerHealthEventSchema.parse(value);
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
