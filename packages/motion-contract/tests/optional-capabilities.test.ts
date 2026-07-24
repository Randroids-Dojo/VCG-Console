import { describe, expect, it } from "vitest";
import {
  KNOWN_OPTIONAL_MOTION_CAPABILITIES,
  MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
  OptionalMotionCapabilityInventorySchema,
  OptionalMotionCapabilityQuerySchema,
  negotiateOptionalMotionCapabilities,
  optionalMotionCapabilityQueryJsonSchema,
} from "../src";

const inventory = {
  schemaVersion: MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
  capabilities: [
    {
      id: "vcg.derived.segmentation",
      version: 1,
      dataProfiles: ["body.segmentation.v1"],
    },
    {
      id: "vcg.derived.hands",
      version: 2,
      dataProfiles: ["hands.landmarks.v2"],
    },
  ],
} as const;

describe("optional Motion capability query", () => {
  it("negotiates known required and optional capabilities by minimum revision", () => {
    expect(
      negotiateOptionalMotionCapabilities(inventory, {
        schemaVersion: MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
        required: [{ id: "vcg.derived.segmentation", minimumVersion: 1 }],
        optional: [
          { id: "vcg.derived.hands", minimumVersion: 2 },
          { id: "vcg.sensor.depth", minimumVersion: 1 },
        ],
      }),
    ).toEqual({
      accepted: true,
      active: inventory.capabilities,
      unavailableOptional: [{ id: "vcg.sensor.depth", minimumVersion: 1 }],
    });
  });

  it("rejects a missing or too-old required capability without partial authority", () => {
    expect(
      negotiateOptionalMotionCapabilities(inventory, {
        schemaVersion: MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
        required: [
          { id: "vcg.sensor.depth", minimumVersion: 1 },
          { id: "vcg.derived.hands", minimumVersion: 3 },
        ],
        optional: [{ id: "vcg.derived.segmentation", minimumVersion: 1 }],
      }),
    ).toEqual({
      accepted: false,
      missingRequired: [
        { id: "vcg.sensor.depth", minimumVersion: 1 },
        { id: "vcg.derived.hands", minimumVersion: 3 },
      ],
    });
  });

  it("matches an unknown future namespaced ID without changing this schema", () => {
    const futureInventory = {
      schemaVersion: MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
      capabilities: [
        {
          id: "studio.example.gaze",
          version: 4,
          dataProfiles: ["studio.example.gaze-points.v4"],
          futureAdvisory: "ignored",
        },
      ],
      futureInventoryField: true,
    };
    const result = negotiateOptionalMotionCapabilities(futureInventory, {
      schemaVersion: MOTION_CAPABILITY_QUERY_SCHEMA_VERSION,
      required: [{ id: "studio.example.gaze", minimumVersion: 3 }],
      optional: [],
      futureQueryField: true,
    });

    expect(KNOWN_OPTIONAL_MOTION_CAPABILITIES).not.toContain("studio.example.gaze");
    expect(result).toEqual({
      accepted: true,
      active: [{
        id: "studio.example.gaze",
        version: 4,
        dataProfiles: ["studio.example.gaze-points.v4"],
      }],
      unavailableOptional: [],
    });
  });

  it("rejects duplicate, overlapping, malformed, or unversioned requests", () => {
    expect(
      OptionalMotionCapabilityInventorySchema.safeParse({
        ...inventory,
        capabilities: [inventory.capabilities[0], inventory.capabilities[0]],
      }).success,
    ).toBe(false);
    expect(
      OptionalMotionCapabilityQuerySchema.safeParse({
        schemaVersion: 1,
        required: [{ id: "vcg.sensor.depth", minimumVersion: 1 }],
        optional: [{ id: "vcg.sensor.depth", minimumVersion: 1 }],
      }).success,
    ).toBe(false);
    expect(
      OptionalMotionCapabilityQuerySchema.safeParse({
        schemaVersion: 1,
        required: [{ id: "Depth Camera", minimumVersion: 0 }],
        optional: [],
      }).success,
    ).toBe(false);
    expect(
      OptionalMotionCapabilityQuerySchema.safeParse({
        schemaVersion: 2,
        required: [],
        optional: [],
      }).success,
    ).toBe(false);
  });

  it("exports an open identifier pattern rather than a closed capability enum", () => {
    const properties = optionalMotionCapabilityQueryJsonSchema.properties as {
      required: {
        items: {
          properties: {
            id: { pattern?: string; enum?: unknown };
          };
          additionalProperties?: unknown;
        };
      };
    };
    const identifier = properties.required.items.properties.id;
    expect(identifier?.pattern).toContain("[a-z");
    expect(identifier?.enum).toBeUndefined();
    expect(properties.required.items.additionalProperties).toBeUndefined();
    expect(optionalMotionCapabilityQueryJsonSchema.additionalProperties).toBeUndefined();
    expect(optionalMotionCapabilityQueryJsonSchema.$comment).toContain(
      "does not grant game permission",
    );
    expect(optionalMotionCapabilityQueryJsonSchema).toMatchObject({
      $id: "urn:vcg:schema:motion-capability-query:1",
      title: "VCG optional Motion capability query v1",
    });
  });
});
