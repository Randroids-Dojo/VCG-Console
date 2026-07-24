import {
  MOTION_API_SCHEMA_VERSION,
  MotionFrameSchema,
  MotionPoseSimulator,
} from "@vcg/motion-contract";

const PAYLOAD_MODES = ["opaque-bytes", "motion-json"];

/**
 * Builds one fixed-size payload codec for the transport harness.
 *
 * Motion JSON mode deliberately validates on both sides of every measured
 * round trip. The transport receives only the encoded bytes and cannot skip,
 * specialize, or silently perform a different schema operation.
 */
export function createTransportPayloadCodec(mode, opaquePayloadBytes) {
  if (!PAYLOAD_MODES.includes(mode)) {
    throw new Error(`payload-mode must be ${PAYLOAD_MODES.join(" or ")}`);
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

  const frame = new MotionPoseSimulator({
    playerId: "transport-benchmark-player",
    playerConfidence: 0.98,
  }).frame(0, 1_000);
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
      frameShape: "one synthetic candidate with body.core17 landmarks and no actions",
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
