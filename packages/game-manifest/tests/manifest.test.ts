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

const validLibretro = {
  ...valid,
  id: "retro-2048",
  version: "qualification-candidate",
  title: "2048",
  publisher: "Libretro",
  runtime: "libretro",
  entrypoint: "libretro:2048",
  architectures: ["aarch64", "x86_64"],
  permissions: ["gamepad", "persistent-storage"],
  inputProfiles: ["gamepad"],
  network: "offline",
  allowedOrigins: [],
  launch: { timeoutMs: 15_000, healthCheck: { type: "process" } },
  rights: {
    distribution: "redistributable",
    codeLicense: "GPL-3.0-only AND LicenseRef-Public-Domain",
    contentLicense: "NONE",
    reviewStatus: "unreviewed",
  },
  libretro: {
    frontend: {
      id: "retroarch",
      version: "qualification-pending",
      license: "GPL-3.0-only",
      source: "https://github.com/libretro/RetroArch",
    },
    core: {
      id: "2048",
      version: "qualification-pending",
      license: "LicenseRef-Public-Domain",
      source: "https://github.com/libretro/libretro-2048",
      architectures: ["aarch64", "x86_64"],
      supportsNoGame: true,
    },
    content: { mode: "none" },
    controllerProfile: "retropad-standard-v1",
    saveNamespace: "retro-2048",
    bios: [],
  },
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

  it("accepts an unverified contentless libretro candidate", () => {
    expect(GameManifestSchema.parse(validLibretro).libretro?.core.id).toBe("2048");
  });

  it("requires libretro contracts to match their core entrypoint and architecture", () => {
    expect(GameManifestSchema.safeParse({ ...validLibretro, entrypoint: "libretro:wrong-core" }).success).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...validLibretro,
        libretro: {
          ...validLibretro.libretro,
          core: { ...validLibretro.libretro.core, architectures: ["x86_64"] },
        },
      }).success,
    ).toBe(false);
  });

  it("requires hashes before a libretro candidate can be called qualified", () => {
    expect(GameManifestSchema.safeParse({ ...validLibretro, compatibilityStatus: "qualified" }).success).toBe(false);
    expect(
      GameManifestSchema.safeParse({
        ...validLibretro,
        compatibilityStatus: "qualified",
        libretro: {
          ...validLibretro.libretro,
          frontend: { ...validLibretro.libretro.frontend, sha256: "a".repeat(64) },
          core: { ...validLibretro.libretro.core, sha256: "b".repeat(64) },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects libretro capabilities that escape the curated offline lane", () => {
    expect(GameManifestSchema.safeParse({ ...validLibretro, network: "optional" }).success).toBe(false);
    expect(GameManifestSchema.safeParse({ ...validLibretro, allowedOrigins: ["https://example.com"] }).success).toBe(false);
    expect(GameManifestSchema.safeParse({ ...validLibretro, permissions: ["gamepad", "network"] }).success).toBe(false);
  });

  it("rejects contentless launch for a core that requires content", () => {
    expect(
      GameManifestSchema.safeParse({
        ...validLibretro,
        libretro: {
          ...validLibretro.libretro,
          core: { ...validLibretro.libretro.core, supportsNoGame: false },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects libretro configuration on another runtime", () => {
    expect(GameManifestSchema.safeParse({ ...validLibretro, runtime: "native" }).success).toBe(false);
  });

  it("exports representable cross-field constraints", () => {
    expect(gameManifestJsonSchema.allOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ if: { properties: { runtime: { const: "remote-web" } }, required: ["runtime"] } }),
        expect.objectContaining({ if: { properties: { network: { const: "offline" } }, required: ["network"] } }),
        expect.objectContaining({ if: { properties: { runtime: { const: "libretro" } }, required: ["runtime"] } }),
      ]),
    );
  });
});
