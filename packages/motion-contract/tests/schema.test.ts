import { describe, expect, it } from "vitest";
import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionCapabilitiesSchema,
  MotionFrameSchema,
  TrackerHealthEventSchema,
  motionFrameJsonSchema,
  negotiateCapabilities,
} from "../src";

const coreLandmarks = CORE_LANDMARK_NAMES.map((name) => ({
  name,
  position: { x: 0.5, y: 0.5 },
  visibility: 1,
  observed: true,
}));

const validFrame = {
  schemaVersion: MOTION_API_SCHEMA_VERSION,
  sequence: 1,
  source: "synthetic",
  sourceTimestampMs: 10,
  inferenceStartedAtMs: 11,
  inferenceCompletedAtMs: 12,
  publishedAtMs: 13,
  health: "ready",
  capabilities: {
    profiles: ["body.core17", "actions.obstacle.v1"],
    maxPlayers: 1,
    coordinateSpecVersion: COORDINATE_SPEC_VERSION,
    coordinateSystem: "image.normalized.top-left",
    timestampQuality: "replay",
  },
  players: [
    {
      id: "player-1",
      sessionSlot: 1,
      confidence: 1,
      state: "candidate",
      coreLandmarks,
      bounds: { left: 0.25, top: 0.1, right: 0.75, bottom: 0.9 },
      actions: [],
    },
  ],
};

const availableCapabilities = MotionCapabilitiesSchema.parse(validFrame.capabilities);

describe("MotionFrameSchema", () => {
  it("requires the explicit temporal-action schema version", () => {
    expect(MOTION_API_SCHEMA_VERSION).toBe("0.4.0");
    expect(MotionFrameSchema.safeParse({ ...validFrame, schemaVersion: "0.2.0" }).success).toBe(false);
  });

  it("accepts a complete portable core frame", () => {
    expect(MotionFrameSchema.parse(validFrame).players[0]?.coreLandmarks).toHaveLength(17);
  });

  it("requires emitted action families to be advertised", () => {
    const action = {
      name: "menu_select",
      phase: "triggered",
      confidence: 0.9,
      occurredAtMs: 13,
      durationMs: 450,
    };
    const invalid = {
      ...structuredClone(validFrame),
      players: validFrame.players.map((player) => ({ ...player, actions: [action] })),
    };
    expect(MotionFrameSchema.safeParse(invalid).success).toBe(false);
    const valid = {
      ...invalid,
      capabilities: {
        ...invalid.capabilities,
        profiles: [...invalid.capabilities.profiles, "actions.shell.v1"],
      },
    };
    expect(MotionFrameSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects fabricated or incomplete core arrays", () => {
    const invalid = structuredClone(validFrame);
    invalid.players[0]?.coreLandmarks.pop();
    expect(MotionFrameSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a complete-length array that duplicates one landmark", () => {
    const invalid = structuredClone(validFrame);
    if (invalid.players[0]) invalid.players[0].coreLandmarks[16] = invalid.players[0].coreLandmarks[15]!;
    expect(MotionFrameSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects confidence values outside the portable range", () => {
    const invalid = structuredClone(validFrame);
    if (invalid.players[0]) invalid.players[0].confidence = 1.1;
    expect(MotionFrameSchema.safeParse(invalid).success).toBe(false);
  });

  it("exports a draft 2020-12 JSON schema", () => {
    expect(motionFrameJsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("exports exact-once constraints for every landmark name", () => {
    const properties = motionFrameJsonSchema.properties as Record<string, Record<string, unknown>>;
    const playerProperties = (properties.players!.items as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    expect(playerProperties.coreLandmarks!.allOf).toHaveLength(CORE_LANDMARK_NAMES.length);
    expect(playerProperties.richLandmarks!.allOf).toHaveLength(33);
    expect(playerProperties.coreLandmarks!.allOf).toContainEqual({
      contains: { type: "object", properties: { name: { const: "nose" } }, required: ["name"] },
      minContains: 1,
      maxContains: 1,
    });
  });

  it("exports representable action lifecycle and capability constraints", () => {
    const properties = motionFrameJsonSchema.properties as Record<string, Record<string, unknown>>;
    const player = properties.players as unknown as {
      items: { properties: Record<string, { items: Record<string, unknown> }> };
    };
    const action = player.items.properties.actions!.items;
    expect(action.allOf).toHaveLength(3);
    expect(motionFrameJsonSchema.allOf).toHaveLength(4);
  });

  it("blocks player data during start/fault and actions during degradation", () => {
    expect(MotionFrameSchema.safeParse({ ...validFrame, health: "starting" }).success).toBe(false);
    expect(MotionFrameSchema.safeParse({ ...validFrame, health: "fault" }).success).toBe(false);

    const degraded = {
      ...structuredClone(validFrame),
      health: "degraded",
      players: validFrame.players.map((player) => ({
        ...player,
        actions: [{
          name: "jump",
          phase: "triggered",
          confidence: 0.9,
          occurredAtMs: 13,
        }],
      })),
    };
    expect(MotionFrameSchema.safeParse(degraded).success).toBe(false);
    expect(
      MotionFrameSchema.safeParse({
        ...degraded,
        players: degraded.players.map((player) => ({ ...player, actions: [] })),
      }).success,
    ).toBe(true);
    expect(motionFrameJsonSchema.allOf).toContainEqual({
      if: {
        properties: { health: { enum: ["starting", "fault"] } },
        required: ["health"],
      },
      then: { properties: { players: { maxItems: 0 } } },
    });
    expect(motionFrameJsonSchema.allOf).toContainEqual({
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
    });
  });

  it("requires explicit world-frame semantics exactly when world data is advertised", () => {
    const withWorld = structuredClone(validFrame);
    withWorld.capabilities.profiles.push("body.world3d");
    expect(MotionFrameSchema.safeParse(withWorld).success).toBe(false);
    Object.assign(withWorld.capabilities, { worldCoordinateSystem: "player.metric.hip-origin.provider-axes" });
    expect(MotionFrameSchema.safeParse(withWorld).success).toBe(true);

    const withoutWorld = structuredClone(validFrame) as typeof validFrame & { capabilities: { worldCoordinateSystem?: string } };
    withoutWorld.capabilities.worldCoordinateSystem = "player.metric.hip-origin.provider-axes";
    expect(MotionFrameSchema.safeParse(withoutWorld).success).toBe(false);
  });

  it("exports the representable world-profile cross rule", () => {
    const properties = motionFrameJsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(properties.capabilities?.allOf).toEqual([
      {
        if: { properties: { profiles: { contains: { const: "body.world3d" } } }, required: ["profiles"] },
        then: { required: ["worldCoordinateSystem"] },
        else: { not: { required: ["worldCoordinateSystem"] } },
      },
    ]);
  });

  it("degrades optional profiles without fabricating required capabilities", () => {
    expect(
      negotiateCapabilities(availableCapabilities, {
        requiredProfiles: ["body.core17"],
        optionalProfiles: ["body.world3d", "actions.obstacle.v1"],
      }),
    ).toEqual({ accepted: true, activeProfiles: ["body.core17", "actions.obstacle.v1"], unavailableOptionalProfiles: ["body.world3d"] });
  });

  it("refuses clients whose required profile is unavailable", () => {
    expect(
      negotiateCapabilities(availableCapabilities, {
        requiredProfiles: ["body.mediapipe33"],
        optionalProfiles: [],
      }),
    ).toEqual({ accepted: false, missingRequiredProfiles: ["body.mediapipe33"] });
  });
});

describe("TrackerHealthEventSchema", () => {
  const base = {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence: 1,
    source: "synthetic",
    occurredAtMs: 100,
  } as const;

  it.each([
    ["starting", "initializing", "blocked"],
    ["starting", "restarting", "blocked"],
    ["ready", "healthy", "full"],
    ["degraded", "low-confidence", "landmarks-only"],
    ["degraded", "overload", "landmarks-only"],
    ["degraded", "fallback-backend", "landmarks-only"],
    ["fault", "camera-unavailable", "blocked"],
    ["fault", "camera-disconnected", "blocked"],
    ["fault", "backend-fault", "blocked"],
  ] as const)("accepts the %s/%s fixture", (status, reason, controlAvailability) => {
    expect(TrackerHealthEventSchema.parse({ ...base, status, reason, controlAvailability })).toMatchObject({
      status,
      reason,
      controlAvailability,
    });
  });

  it("rejects incoherent status, reason, and control combinations", () => {
    expect(
      TrackerHealthEventSchema.safeParse({
        ...base,
        status: "ready",
        reason: "overload",
        controlAvailability: "full",
      }).success,
    ).toBe(false);
    expect(
      TrackerHealthEventSchema.safeParse({
        ...base,
        status: "degraded",
        reason: "overload",
        controlAvailability: "full",
      }).success,
    ).toBe(false);
  });
});
