import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GameManifestSchema } from "../src";
import {
  classifyGameManifestDocument,
  GAME_MANIFEST_DOCUMENT_TYPE,
  INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE,
  INSTALLED_GAME_MANIFEST_SCHEMA_ID,
  INSTALLED_LIBRETRO_CONTENT_MODES,
  InstalledGameManifestSchema,
  installedGameManifestJsonSchema,
  parseInstalledGameManifest,
} from "../src/installed-manifest";
import libraryFixture from "../fixtures/installed-root-v1/library-nes.vcg-game.json";
import validLibretroFixture from "../fixtures/v1/valid/libretro.vcg-game.json";
import validNativeFixture from "../fixtures/v1/valid/native.vcg-game.json";
import validRemoteWebFixture from "../fixtures/v1/valid/remote-web.vcg-game.json";

/** The six fields the native host reads, plus the document discriminator. */
const hostRead = {
  documentType: INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE,
  schemaVersion: 1,
  id: "retro-2048",
  version: "1.0.0",
  runtime: "libretro",
  compatibilityStatus: "qualified",
  launch: { timeoutMs: 15_000, healthCheck: { type: "process" } },
};

const noGameCore = {
  id: "2048",
  version: "retroarch-1.22.2-stable-bundle",
  sha256: "b".repeat(64),
  license: "LicenseRef-Public-Domain",
  source: "https://github.com/libretro/libretro-2048",
  architectures: ["x86_64"],
  supportsNoGame: true,
};

const contentRequiringCore = { ...noGameCore, id: "mesen", supportsNoGame: false };

const checkedInSchemaPath = fileURLToPath(
  new URL("../../../schemas/installed-game-manifest.schema.json", import.meta.url),
);

describe("InstalledGameManifestSchema", () => {
  it("accepts the six fields the native host reads plus the discriminator", () => {
    expect(parseInstalledGameManifest(hostRead).id).toBe("retro-2048");
  });

  it("requires every field the native host reads", () => {
    for (const field of Object.keys(hostRead)) {
      const partial: Record<string, unknown> = { ...hostRead };
      delete partial[field];
      expect(InstalledGameManifestSchema.safeParse(partial).success, field).toBe(false);
    }
  });

  it("accepts all three installed content modes", () => {
    const content: Record<(typeof INSTALLED_LIBRETRO_CONTENT_MODES)[number], unknown> = {
      none: { mode: "none" },
      managed: { mode: "managed", format: "nes", sha256: "a".repeat(64) },
      library: { mode: "library", systemId: "nes", coreId: "mesen" },
    };
    for (const mode of INSTALLED_LIBRETRO_CONTENT_MODES) {
      const parsed = InstalledGameManifestSchema.safeParse({
        ...hostRead,
        entrypoint: mode === "none" ? "libretro:2048" : "libretro:mesen",
        libretro: {
          content: content[mode],
          core: mode === "none" ? noGameCore : contentRequiringCore,
        },
      });
      expect(parsed.success, mode).toBe(true);
    }
  });

  it("rejects a library package that claims contentless launch", () => {
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        entrypoint: "libretro:mesen",
        libretro: { content: { mode: "none" }, core: contentRequiringCore },
      }).success,
    ).toBe(false);
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        libretro: { content: { mode: "none" } },
      }).success,
    ).toBe(false);
  });

  it("rejects values the native host cannot accept for an installed package", () => {
    for (const override of [
      { runtime: "remote-web" },
      { runtime: "local-web" },
      { compatibilityStatus: "partial" },
      { compatibilityStatus: "blocked" },
      { schemaVersion: 2 },
      { launch: { timeoutMs: 15_000, healthCheck: { type: "http", path: "/health" } } },
      { launch: { timeoutMs: 999, healthCheck: { type: "process" } } },
      { launch: { timeoutMs: 120_001, healthCheck: { type: "process" } } },
    ]) {
      expect(
        InstalledGameManifestSchema.safeParse({ ...hostRead, ...override }).success,
        JSON.stringify(override),
      ).toBe(false);
    }
  });

  it("rejects a libretro record on a native package", () => {
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        runtime: "native",
        libretro: { content: { mode: "library", systemId: "nes", coreId: "mesen" } },
      }).success,
    ).toBe(false);
  });

  it("requires a qualified installed manifest to hash the artifacts it names", () => {
    const { sha256: _core, ...unhashedCore } = noGameCore;
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        entrypoint: "libretro:2048",
        libretro: { content: { mode: "none" }, core: unhashedCore },
      }).success,
    ).toBe(false);
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        compatibilityStatus: "unverified",
        entrypoint: "libretro:2048",
        libretro: { content: { mode: "none" }, core: unhashedCore },
      }).success,
    ).toBe(true);
  });

  it("requires a declared entrypoint to identify the selected core", () => {
    expect(
      InstalledGameManifestSchema.safeParse({
        ...hostRead,
        entrypoint: "libretro:wrong-core",
        libretro: { content: { mode: "none" }, core: noGameCore },
      }).success,
    ).toBe(false);
  });

  it("preserves fields the host ignores", () => {
    expect(parseInstalledGameManifest({ ...hostRead, title: "2048" }).title).toBe("2048");
  });
});

describe("game manifest document discriminator", () => {
  it("routes each document to the schema that governs it", () => {
    expect(classifyGameManifestDocument(libraryFixture)).toBe("installed-root");
    expect(classifyGameManifestDocument(validRemoteWebFixture)).toBe("public");
    expect(classifyGameManifestDocument(validLibretroFixture)).toBe("public");
    expect(classifyGameManifestDocument(validNativeFixture)).toBe("public");
    expect(classifyGameManifestDocument({ ...hostRead, documentType: GAME_MANIFEST_DOCUMENT_TYPE }))
      .toBe("public");
    expect(classifyGameManifestDocument({ documentType: "vcg-something-else" })).toBe(
      "unrecognized",
    );
    expect(classifyGameManifestDocument([])).toBe("unrecognized");
    expect(classifyGameManifestDocument(null)).toBe("unrecognized");
  });

  it("keeps each document out of the other parser", () => {
    expect(GameManifestSchema.safeParse(libraryFixture).success).toBe(false);
    expect(InstalledGameManifestSchema.safeParse(validRemoteWebFixture).success).toBe(false);
    expect(InstalledGameManifestSchema.safeParse(validLibretroFixture).success).toBe(false);
  });

  it("keeps the library content mode off the curated shelf", () => {
    const shelf = validLibretroFixture as { libretro: Record<string, unknown> };
    expect(
      GameManifestSchema.safeParse({
        ...validLibretroFixture,
        libretro: {
          ...shelf.libretro,
          content: { mode: "library", systemId: "nes", coreId: "mesen" },
        },
      }).success,
    ).toBe(false);
    expect(GameManifestSchema.safeParse(validLibretroFixture).success).toBe(true);
  });

  it("parses the canonical installed-root library fixture", () => {
    const parsed = parseInstalledGameManifest(libraryFixture);
    expect(parsed.libretro?.content).toMatchObject({
      mode: "library",
      systemId: "nes",
      coreId: "mesen",
    });
  });
});

describe("installedGameManifestJsonSchema", () => {
  it("matches the checked-in export byte for byte", () => {
    expect(readFileSync(checkedInSchemaPath, "utf8")).toBe(
      `${JSON.stringify(installedGameManifestJsonSchema, null, 2)}\n`,
    );
  });

  it("exports the discriminator and the representable cross-field constraints", () => {
    expect(installedGameManifestJsonSchema.$id).toBe(INSTALLED_GAME_MANIFEST_SCHEMA_ID);
    expect(installedGameManifestJsonSchema.properties).toMatchObject({
      documentType: { const: INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE },
    });
    expect(installedGameManifestJsonSchema.required).toContain("documentType");
    expect(installedGameManifestJsonSchema.allOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          if: { properties: { runtime: { const: "native" } }, required: ["runtime"] },
        }),
      ]),
    );
    expect(installedGameManifestJsonSchema.additionalProperties).not.toBe(false);
  });
});
