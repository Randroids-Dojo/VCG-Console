import { describe, expect, it } from "vitest";
import { gameManifestJsonSchema, GameManifestSchema } from "../src";

const valid = {
  schemaVersion: 1,
  id: "example-game",
  version: "hosted-2026-07-19",
  title: "Example Game",
  publisher: "Example",
  runtime: "remote-web",
  entrypoint: "https://example.com/play",
  architectures: ["web"],
  permissions: ["gamepad", "network"],
  inputProfiles: ["gamepad"],
  minimumConsoleVersion: "0.0.1",
  network: "required",
  allowedOrigins: ["https://example.com"],
  compatibilityStatus: "unverified",
  launch: { timeoutMs: 30_000, healthCheck: { type: "http", path: "/play" } },
  rights: { distribution: "remote-only", codeLicense: "NOASSERTION", contentLicense: "NOASSERTION", reviewStatus: "unreviewed" },
  notes: [],
};

describe("GameManifestSchema", () => {
  it("accepts an explicit unverified remote manifest", () => {
    expect(GameManifestSchema.parse(valid).compatibilityStatus).toBe("unverified");
  });

  it("rejects a remote manifest that omits its own origin", () => {
    expect(GameManifestSchema.safeParse({ ...valid, allowedOrigins: ["https://other.example"] }).success).toBe(false);
  });

  it("compares normalized origins", () => {
    expect(GameManifestSchema.safeParse({ ...valid, allowedOrigins: ["https://example.com:443/"] }).success).toBe(true);
  });

  it("rejects an offline package that requests network access", () => {
    expect(GameManifestSchema.safeParse({ ...valid, runtime: "local-web", network: "offline" }).success).toBe(false);
  });

  it("preserves extension fields in runtime parsing and exported schema", () => {
    const parsed = GameManifestSchema.parse({ ...valid, futureField: { enabled: true } });
    expect(parsed.futureField).toEqual({ enabled: true });
    expect(gameManifestJsonSchema.additionalProperties).not.toBe(false);
  });

  it("exports representable cross-field constraints", () => {
    expect(gameManifestJsonSchema.allOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ if: { properties: { runtime: { const: "remote-web" } }, required: ["runtime"] } }),
        expect.objectContaining({ if: { properties: { network: { const: "offline" } }, required: ["network"] } }),
      ]),
    );
  });
});
