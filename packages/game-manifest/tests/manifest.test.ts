import { describe, expect, it } from "vitest";
import { GameManifestSchema } from "../src";

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

  it("rejects an offline package that requests network access", () => {
    expect(GameManifestSchema.safeParse({ ...valid, runtime: "local-web", network: "offline" }).success).toBe(false);
  });
});
