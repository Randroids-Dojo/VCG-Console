import {
  MEDIAPIPE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  MotionPoseSimulator,
  PROVIDER_WORLD_COORDINATE_SYSTEM,
} from "@vcg/motion-contract";

const PAYLOAD_MODES = ["opaque-bytes", "motion-json"];
const MOTION_FRAME_SHAPES = ["core17", "mediapipe33-world", "action-heavy"];
const FRAME_DESCRIPTIONS = {
  core17: "one synthetic candidate with body.core17 landmarks and no actions",
  "mediapipe33-world":
    "one synthetic joined player with body.core17 plus body.mediapipe33 world landmarks and no actions",
  "action-heavy":
    "one synthetic joined player with body.core17 landmarks and ten standardized triggered actions",
};

/**
 * Builds one fixed-size payload codec for the transport harness.
 *
 * Motion JSON mode deliberately validates on both sides of every measured
 * round trip. The transport receives only the encoded bytes and cannot skip,
 * specialize, or silently perform a different schema operation.
 */
export function createTransportPayloadCodec(
  mode,
  opaquePayloadBytes,
  motionFrameShape = "core17",
) {
  if (!PAYLOAD_MODES.includes(mode)) {
    throw new Error(`payload-mode must be ${PAYLOAD_MODES.join(" or ")}`);
  }
  if (!MOTION_FRAME_SHAPES.includes(motionFrameShape)) {
    throw new Error(`motion-frame-shape must be ${MOTION_FRAME_SHAPES.join(", ")}`);
  }
  if (mode === "opaque-bytes") {
    const referencePayload = deterministicPayload(opaquePayloadBytes);
    return Object.freeze({
      mode,
      referencePayload,
      metadata: Object.freeze({
        payloadMode: mode,
        serialization: "none",
        schemaValidation: false,
        producerSchemaValidation: false,
        consumerSchemaValidation: false,
      }),
      encode() {
        return referencePayload;
      },
      verify(response) {
        if (
          response.byteLength !== referencePayload.byteLength ||
          response[0] !== referencePayload[0] ||
          response.at(-1) !== referencePayload.at(-1)
        ) {
          throw new Error("opaque response mismatch");
        }
      },
    });
  }

  const frame = benchmarkMotionFrame(motionFrameShape);
  const referencePayload = encodeMotionFrame(frame);
  return Object.freeze({
    mode,
    referencePayload,
    metadata: Object.freeze({
      payloadMode: mode,
      serialization: "json-utf8",
      schemaValidation: true,
      producerSchemaValidation: true,
      consumerSchemaValidation: true,
      motionApiVersion: MOTION_API_SCHEMA_VERSION,
      frameShape: FRAME_DESCRIPTIONS[motionFrameShape],
    }),
    encode() {
      return encodeMotionFrame(frame);
    },
    verify(response) {
      const decoded = MotionFrameSchema.parse(JSON.parse(Buffer.from(response).toString("utf8")));
      if (
        decoded.schemaVersion !== MOTION_API_SCHEMA_VERSION ||
        decoded.sequence !== frame.sequence ||
        decoded.players.length !== 1 ||
        decoded.players[0]?.coreLandmarks.length !== 17
      ) {
        throw new Error("Motion response identity mismatch");
      }
    },
  });
}

function benchmarkMotionFrame(shape) {
  const base = new MotionPoseSimulator({
    playerId: "transport-benchmark-player",
    playerConfidence: 0.98,
  }).frame(0, 1_000);
  if (shape === "core17") return base;

  const player = base.players[0];
  if (!player) throw new Error("benchmark simulator did not produce its fixed player");
  if (shape === "mediapipe33-world") {
    return MotionFrameSchema.parse({
      ...base,
      capabilities: {
        ...base.capabilities,
        profiles: ["body.core17", "body.mediapipe33", "body.world3d"],
        worldCoordinateSystem: PROVIDER_WORLD_COORDINATE_SYSTEM,
      },
      players: [
        {
          ...player,
          state: "joined",
          richLandmarks: MEDIAPIPE_LANDMARK_NAMES.map((name, index) => ({
            name,
            position: {
              x: ((index % 11) + 1) / 12,
              y: (Math.floor(index / 11) + 1) / 4,
              z: (index - 16) / 100,
            },
            worldPosition: {
              xMeters: (index - 16) / 20,
              yMeters: 0.2 + index / 50,
              zMeters: 1.5 + (index % 5) / 10,
            },
            visibility: 0.97,
            presence: 0.96,
            observed: true,
          })),
        },
      ],
    });
  }

  const actionNames = [
    "pause",
    "menu_back",
    "player_join",
    "menu_select",
    "menu_swipe_left",
    "menu_swipe_right",
    "jump",
    "duck",
    "dodge_left",
    "dodge_right",
  ];
  const discrete = new Set([
    "menu_swipe_left",
    "menu_swipe_right",
    "jump",
    "duck",
    "dodge_left",
    "dodge_right",
  ]);
  return MotionFrameSchema.parse({
    ...base,
    capabilities: {
      ...base.capabilities,
      profiles: ["body.core17", "actions.obstacle.v1", "actions.shell.v1"],
    },
    players: [
      {
        ...player,
        state: "joined",
        actions: actionNames.map((name, index) => ({
          name,
          phase: "triggered",
          confidence: 0.9 + index / 1_000,
          occurredAtMs: 1_001,
          ...(discrete.has(name) ? {} : { durationMs: 350 + index }),
        })),
      },
    ],
  });
}

function encodeMotionFrame(frame) {
  const validated = MotionFrameSchema.parse(frame);
  return Buffer.from(JSON.stringify(validated), "utf8");
}

function deterministicPayload(size) {
  const value = Buffer.allocUnsafe(size);
  for (let index = 0; index < size; index += 1) {
    value[index] = (index * 31 + 17) & 0xff;
  }
  return value;
}
