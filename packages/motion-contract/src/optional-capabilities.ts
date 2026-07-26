import { z } from "zod";

export const MOTION_CAPABILITY_QUERY_SCHEMA_VERSION = 1 as const;

export const KNOWN_OPTIONAL_MOTION_CAPABILITIES = [
  "vcg.sensor.depth",
  "vcg.derived.segmentation",
  "vcg.derived.hands",
] as const;

export const OptionalMotionCapabilityIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/,
    "capability IDs must be lowercase namespaced identifiers",
  );

export const MotionDataProfileIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/,
    "data profile IDs must be lowercase namespaced identifiers",
  );

export const OptionalMotionCapabilityRequestItemSchema = z.object({
  id: OptionalMotionCapabilityIdSchema,
  minimumVersion: z.number().int().positive(),
});

export const OptionalMotionCapabilityDescriptorSchema = z.object({
  id: OptionalMotionCapabilityIdSchema,
  version: z.number().int().positive(),
  dataProfiles: z.array(MotionDataProfileIdSchema).max(32),
});

export const OptionalMotionCapabilityInventorySchema = z
  .object({
    schemaVersion: z.literal(MOTION_CAPABILITY_QUERY_SCHEMA_VERSION),
    capabilities: z.array(OptionalMotionCapabilityDescriptorSchema).max(128),
  })
  .superRefine((inventory, context) => {
    addDuplicateIdIssues(inventory.capabilities, context, ["capabilities"]);
  });

export const OptionalMotionCapabilityQuerySchema = z
  .object({
    schemaVersion: z.literal(MOTION_CAPABILITY_QUERY_SCHEMA_VERSION),
    required: z.array(OptionalMotionCapabilityRequestItemSchema).max(64),
    optional: z.array(OptionalMotionCapabilityRequestItemSchema).max(64),
  })
  .superRefine((query, context) => {
    addDuplicateIdIssues(query.required, context, ["required"]);
    addDuplicateIdIssues(query.optional, context, ["optional"]);
    const requiredIds = new Set(query.required.map(({ id }) => id));
    query.optional.forEach(({ id }, index) => {
      if (requiredIds.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["optional", index, "id"],
          message: "a capability cannot be both required and optional",
        });
      }
    });
  });

export const OptionalMotionCapabilityNegotiationSchema = z.discriminatedUnion("accepted", [
  z.object({
    accepted: z.literal(true),
    active: z.array(OptionalMotionCapabilityDescriptorSchema).max(128),
    unavailableOptional: z.array(OptionalMotionCapabilityRequestItemSchema).max(64),
  }),
  z.object({
    accepted: z.literal(false),
    missingRequired: z.array(OptionalMotionCapabilityRequestItemSchema).min(1).max(64),
  }),
]);

export type OptionalMotionCapabilityId = z.infer<typeof OptionalMotionCapabilityIdSchema>;
export type OptionalMotionCapabilityRequestItem = z.infer<
  typeof OptionalMotionCapabilityRequestItemSchema
>;
export type OptionalMotionCapabilityDescriptor = z.infer<
  typeof OptionalMotionCapabilityDescriptorSchema
>;
export type OptionalMotionCapabilityInventory = z.infer<
  typeof OptionalMotionCapabilityInventorySchema
>;
export type OptionalMotionCapabilityQuery = z.infer<
  typeof OptionalMotionCapabilityQuerySchema
>;
export type OptionalMotionCapabilityNegotiation = z.infer<
  typeof OptionalMotionCapabilityNegotiationSchema
>;

/**
 * Matches exact namespaced capability IDs and minimum integer revisions.
 *
 * This reports provider availability only. It does not grant a game permission,
 * add a Motion frame profile, or authorize any data transport.
 */
export function negotiateOptionalMotionCapabilities(
  inventoryValue: unknown,
  queryValue: unknown,
): OptionalMotionCapabilityNegotiation {
  const inventory = OptionalMotionCapabilityInventorySchema.parse(inventoryValue);
  const query = OptionalMotionCapabilityQuerySchema.parse(queryValue);
  const byId = new Map(inventory.capabilities.map((capability) => [capability.id, capability]));
  const matches = (
    item: OptionalMotionCapabilityRequestItem,
  ): OptionalMotionCapabilityDescriptor | undefined => {
    const available = byId.get(item.id);
    return available && available.version >= item.minimumVersion ? available : undefined;
  };
  const missingRequired = query.required.filter((item) => !matches(item));
  if (missingRequired.length > 0) {
    return OptionalMotionCapabilityNegotiationSchema.parse({
      accepted: false,
      missingRequired,
    });
  }
  return OptionalMotionCapabilityNegotiationSchema.parse({
    accepted: true,
    active: [...query.required, ...query.optional].flatMap((item) => {
      const available = matches(item);
      return available ? [available] : [];
    }),
    unavailableOptional: query.optional.filter((item) => !matches(item)),
  });
}

const forwardCompatibleJsonSchemaOptions = {
  target: "draft-2020-12" as const,
  override: ({ jsonSchema }: { jsonSchema: Record<string, unknown> }) => {
    if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties;
  },
};

export const optionalMotionCapabilityInventoryJsonSchema = z.toJSONSchema(
  OptionalMotionCapabilityInventorySchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
export const optionalMotionCapabilityQueryJsonSchema = z.toJSONSchema(
  OptionalMotionCapabilityQuerySchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
export const optionalMotionCapabilityNegotiationJsonSchema = z.toJSONSchema(
  OptionalMotionCapabilityNegotiationSchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;

for (const [schema, id, title] of [
  [
    optionalMotionCapabilityInventoryJsonSchema,
    "urn:vcg:schema:motion-capability-inventory:1",
    "VCG optional Motion capability inventory v1",
  ],
  [
    optionalMotionCapabilityQueryJsonSchema,
    "urn:vcg:schema:motion-capability-query:1",
    "VCG optional Motion capability query v1",
  ],
  [
    optionalMotionCapabilityNegotiationJsonSchema,
    "urn:vcg:schema:motion-capability-negotiation:1",
    "VCG optional Motion capability negotiation v1",
  ],
] as const) {
  schema.$id = id;
  schema.title = title;
  schema.$comment =
    "Capability IDs are intentionally open namespaced strings. Availability does not grant game permission or define a data profile.";
}

function addDuplicateIdIssues(
  values: readonly { id: string }[],
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
): void {
  const seen = new Set<string>();
  values.forEach(({ id }, index) => {
    if (seen.has(id)) {
      context.addIssue({
        code: "custom",
        path: [...path, index, "id"],
        message: `duplicate capability ID ${id}`,
      });
    }
    seen.add(id);
  });
}
