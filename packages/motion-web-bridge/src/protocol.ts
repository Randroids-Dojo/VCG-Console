import {
  CapabilityNegotiationSchema,
  CapabilityRequestSchema,
  MotionCapabilitiesSchema,
  MotionFrameSchema,
  addMotionContractJsonConstraints,
} from "@vcg/motion-contract";
import { z } from "zod";

export const MOTION_BRIDGE_PROTOCOL_VERSION = 1 as const;

export const BridgeClientHelloSchema = z.object({
  type: z.literal("vcg.motion.hello"),
  protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
  clientId: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/).max(80),
  request: CapabilityRequestSchema,
});

export const BridgeClientMessageSchema = z.discriminatedUnion("type", [
  BridgeClientHelloSchema,
  z.object({
    type: z.literal("vcg.motion.goodbye"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    sessionId: z.string().min(1),
  }),
  z.object({
    type: z.literal("vcg.motion.ack"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    sessionId: z.string().min(1),
    sequence: z.number().int().nonnegative(),
  }),
]);

export const BridgeServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("vcg.motion.welcome"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    sessionId: z.string().min(1),
    capabilities: MotionCapabilitiesSchema,
    negotiation: CapabilityNegotiationSchema,
  }),
  z.object({
    type: z.literal("vcg.motion.rejected"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    reason: z.enum(["capability-mismatch", "protocol-error"]),
    negotiation: CapabilityNegotiationSchema.optional(),
  }),
  z.object({
    type: z.literal("vcg.motion.frame"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    sessionId: z.string().min(1),
    frame: MotionFrameSchema,
  }),
  z.object({
    type: z.literal("vcg.motion.error"),
    protocolVersion: z.literal(MOTION_BRIDGE_PROTOCOL_VERSION),
    code: z.enum(["invalid-message", "handshake-required"]),
  }),
]);

export type BridgeClientHello = z.infer<typeof BridgeClientHelloSchema>;
export type BridgeClientMessage = z.infer<typeof BridgeClientMessageSchema>;
export type BridgeServerMessage = z.infer<typeof BridgeServerMessageSchema>;
const wireJsonSchemaOptions = {
  target: "draft-2020-12" as const,
  override: ({ jsonSchema }: { jsonSchema: Record<string, unknown> }) => {
    if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties;
  },
};

export const bridgeClientMessageJsonSchema = z.toJSONSchema(BridgeClientMessageSchema, wireJsonSchemaOptions);
export const bridgeServerMessageJsonSchema = addMotionContractJsonConstraints(
  z.toJSONSchema(BridgeServerMessageSchema, wireJsonSchemaOptions),
);

// Wire objects intentionally use Zod's default strip behavior. Unknown fields
// are ignored for forward compatibility; known fields and versions remain strict.
export function parseBridgeClientHello(value: unknown): BridgeClientHello {
  return BridgeClientHelloSchema.parse(value);
}

export function parseBridgeClientMessage(value: unknown): BridgeClientMessage {
  return BridgeClientMessageSchema.parse(value);
}

export function parseBridgeServerMessage(value: unknown): BridgeServerMessage {
  return BridgeServerMessageSchema.parse(value);
}
