import { describe, expect, it } from "vitest";
import { CORE_LANDMARK_NAMES, MOTION_API_SCHEMA_VERSION, MotionCapabilitiesSchema, MotionFrameSchema, motionFrameJsonSchema, negotiateCapabilities } from "../src";

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
    coordinateSpecVersion: "0.1.0",
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
  it("accepts a complete portable core frame", () => {
    expect(MotionFrameSchema.parse(validFrame).players[0]?.coreLandmarks).toHaveLength(17);
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
