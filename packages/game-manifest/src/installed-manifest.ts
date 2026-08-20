import { z } from "zod";

/**
 * The installed-root game manifest: the document one signed installed package
 * binds by SHA-256 beneath the install root. It is a different type from the
 * public curated-shelf manifest in `./index`, which this module deliberately
 * does not import: the two documents describe different sets of packages and
 * version independently, so their leaf grammars are stated separately here.
 */

export const INSTALLED_GAME_MANIFEST_SCHEMA_VERSION = 1 as const;
export const INSTALLED_GAME_MANIFEST_SCHEMA_ID = "urn:vcg:schema:installed-game-manifest:1" as const;

/**
 * `documentType` tells the two v1 manifest documents apart from their own
 * bytes. The installed-root document must declare it; the public document is
 * already published without it, so the public parser stays unchanged and
 * absence means the public document. The native host enforces the field: it
 * rejects a bound manifest that omits it or declares the public document's
 * name, so an installed package must carry it to load at all.
 */
export const GAME_MANIFEST_DOCUMENT_TYPE = "vcg-game-manifest" as const;
export const INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE = "vcg-installed-game-manifest" as const;

/** Content modes an installed package may bind. The public document has no `library`. */
export const INSTALLED_LIBRETRO_CONTENT_MODES = ["none", "managed", "library"] as const;

/** Runtimes the signed installed catalog implements. */
export const INSTALLED_RUNTIME_VALUES = ["libretro", "native"] as const;

/** Compatibility values the host accepts for a signed qualified or development package. */
export const INSTALLED_COMPATIBILITY_STATUS_VALUES = ["qualified", "unverified"] as const;

/** Health kinds the host accepts for an installed local runtime. */
export const INSTALLED_HEALTH_CHECK_VALUES = ["process", "explicit-ready"] as const;

const PackageIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 values must be 64 lowercase hexadecimal characters");
// The refinement alone does not survive `z.toJSONSchema()`, which emits only
// `format: "uri"` -- so a published schema would accept an http:// source the
// parser rejects. The pattern is exported, so both agree.
const HttpsUrlSchema = z
  .url()
  .regex(/^https:\/\//, "artifact sources must use HTTPS");
const NativeArchitectureSchema = z.enum(["aarch64", "x86_64"]);

/** Bounded lowercase identifier grammar the host applies to installed IDs. */
const InstalledIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

// A library binding names a system and core that must match an installed
// library entry, and that grammar caps at 64. A longer binding would pass
// package validation and then match nothing.
const BindableIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
const InstalledVersionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[!-~]+$/, "installed package versions are 1-128 visible ASCII characters");

const InstalledLibretroArtifactSchema = z
  .object({
    id: PackageIdSchema,
    version: z.string().min(1),
    sha256: Sha256Schema.optional(),
    license: z.string().min(1),
    source: HttpsUrlSchema,
  })
  .passthrough();

const InstalledLibretroCoreSchema = InstalledLibretroArtifactSchema.extend({
  architectures: z.array(NativeArchitectureSchema).min(1),
  supportsNoGame: z.boolean(),
});

const InstalledLibretroContentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).passthrough(),
  z
    .object({
      mode: z.literal("managed"),
      format: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
      sha256: Sha256Schema,
    })
    .passthrough(),
  z
    .object({
      mode: z.literal("library"),
      systemId: BindableIdSchema,
      coreId: BindableIdSchema,
    })
    .passthrough(),
]);

/**
 * The Libretro record an installed-root manifest may carry. Only the content
 * mode is required: the signed catalog, not this document, binds the frontend,
 * core, and base-configuration paths and digests.
 */
const InstalledLibretroSchema = z
  .object({
    content: InstalledLibretroContentSchema,
    frontend: InstalledLibretroArtifactSchema.optional(),
    core: InstalledLibretroCoreSchema.optional(),
    controllerProfile: PackageIdSchema.optional(),
    saveNamespace: PackageIdSchema.optional(),
    bios: z
      .array(
        z
          .object({
            id: PackageIdSchema,
            sha256: Sha256Schema,
            required: z.boolean(),
            license: z.string().min(1),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

/**
 * Required fields are exactly the ones the native host reads, plus the
 * document discriminator. An installed-root manifest carries no presentation,
 * permission, rights, origin, or architecture obligation, because it never
 * enters the public catalog.
 */
export const InstalledGameManifestSchema = z
  .object({
    documentType: z.literal(INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE),
    schemaVersion: z.literal(INSTALLED_GAME_MANIFEST_SCHEMA_VERSION),
    id: InstalledIdSchema,
    version: InstalledVersionSchema,
    runtime: z.enum(INSTALLED_RUNTIME_VALUES),
    compatibilityStatus: z.enum(INSTALLED_COMPATIBILITY_STATUS_VALUES),
    launch: z
      .object({
        timeoutMs: z.number().int().min(1_000).max(120_000),
        healthCheck: z
          .object({ type: z.enum(INSTALLED_HEALTH_CHECK_VALUES) })
          .passthrough(),
      })
      .passthrough(),
    entrypoint: z.string().min(1).optional(),
    libretro: InstalledLibretroSchema.optional(),
  })
  .passthrough()
  .superRefine((manifest, context) => {
    if (manifest.runtime !== "libretro") {
      if (manifest.libretro) {
        context.addIssue({
          code: "custom",
          path: ["libretro"],
          message: "only libretro runtimes may declare a libretro launch contract",
        });
      }
      return;
    }
    const libretro = manifest.libretro;
    if (!libretro) return;
    if (libretro.content.mode === "none") {
      if (!libretro.core) {
        context.addIssue({
          code: "custom",
          path: ["libretro", "core"],
          message: "contentless launch requires the core it starts",
        });
      } else if (!libretro.core.supportsNoGame) {
        context.addIssue({
          code: "custom",
          path: ["libretro", "content"],
          message: "contentless launch requires a core that supports no-game startup",
        });
      }
    }
    if (
      libretro.core
      && manifest.entrypoint !== undefined
      && manifest.entrypoint !== `libretro:${libretro.core.id}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["entrypoint"],
        message: "libretro entrypoint must identify the selected core",
      });
    }
    if (manifest.compatibilityStatus === "qualified") {
      if (libretro.frontend && !libretro.frontend.sha256) {
        context.addIssue({
          code: "custom",
          path: ["libretro", "frontend", "sha256"],
          message: "qualified libretro frontends require an artifact hash",
        });
      }
      if (libretro.core && !libretro.core.sha256) {
        context.addIssue({
          code: "custom",
          path: ["libretro", "core", "sha256"],
          message: "qualified libretro cores require an artifact hash",
        });
      }
    }
  });

export type InstalledGameManifest = z.infer<typeof InstalledGameManifestSchema>;

export function parseInstalledGameManifest(value: unknown): InstalledGameManifest {
  return InstalledGameManifestSchema.parse(value);
}

export type GameManifestDocumentKind = "public" | "installed-root" | "unrecognized";

/**
 * Routes one parsed JSON value to the schema that governs it. `unrecognized`
 * fails closed: neither parser should be applied to it.
 */
export function classifyGameManifestDocument(value: unknown): GameManifestDocumentKind {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "unrecognized";
  const declared = (value as { documentType?: unknown }).documentType;
  if (declared === undefined || declared === GAME_MANIFEST_DOCUMENT_TYPE) return "public";
  if (declared === INSTALLED_GAME_MANIFEST_DOCUMENT_TYPE) return "installed-root";
  return "unrecognized";
}

export const installedGameManifestJsonSchema: Record<string, unknown> = {
  $id: INSTALLED_GAME_MANIFEST_SCHEMA_ID,
  title: "VCG installed-root game manifest v1",
  ...(z.toJSONSchema(InstalledGameManifestSchema, { target: "draft-2020-12" }) as Record<string, unknown>),
};
installedGameManifestJsonSchema.allOf = [
  {
    if: { properties: { runtime: { const: "native" } }, required: ["runtime"] },
    then: { not: { required: ["libretro"] } },
  },
  {
    if: {
      required: ["libretro"],
      properties: {
        libretro: {
          required: ["content"],
          properties: { content: { required: ["mode"], properties: { mode: { const: "none" } } } },
        },
      },
    },
    then: {
      properties: {
        libretro: {
          required: ["core"],
          properties: {
            core: { required: ["supportsNoGame"], properties: { supportsNoGame: { const: true } } },
          },
        },
      },
    },
  },
];
installedGameManifestJsonSchema.$comment =
  "parseInstalledGameManifest additionally compares the entrypoint with the selected core and requires artifact hashes on a qualified manifest; standard JSON Schema cannot express those cross-property constraints.";
