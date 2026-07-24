import { z } from "zod";

export const GAME_MANIFEST_SCHEMA_VERSION = 1 as const;
export const GAME_MANIFEST_SCHEMA_ID = "urn:vcg:schema:game-manifest:1" as const;
export const GAME_PERMISSION_VALUES = [
  "gamepad",
  "pointer",
  "keyboard",
  "touch",
  "motion.core17",
  "motion.actions.obstacle",
  "network",
  "persistent-storage",
] as const;
export const GAME_INPUT_PROFILE_VALUES = [
  "gamepad",
  "pointer",
  "keyboard",
  "touch",
  "motion.obstacle.v1",
] as const;
export const GamePermissionSchema = z.enum(GAME_PERMISSION_VALUES);
export const GameInputProfileSchema = z.enum(GAME_INPUT_PROFILE_VALUES);
export const GameNetworkModeSchema = z.enum(["required", "optional", "offline"]);

export type GamePermission = z.infer<typeof GamePermissionSchema>;
export type GameInputProfile = z.infer<typeof GameInputProfileSchema>;
export type ManifestMotionProfile = "body.core17" | "actions.obstacle.v1";

const MOTION_PERMISSION_PROFILE: Readonly<
  Partial<Record<GamePermission, ManifestMotionProfile>>
> = {
  "motion.core17": "body.core17",
  "motion.actions.obstacle": "actions.obstacle.v1",
};

export function motionProfilesForPermissions(
  permissions: readonly GamePermission[],
): ManifestMotionProfile[] {
  const profiles = new Set<ManifestMotionProfile>();
  for (const permission of permissions) {
    const profile = MOTION_PERMISSION_PROFILE[permission];
    if (profile) profiles.add(profile);
  }
  return [...profiles];
}

const HttpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), "remote entrypoints and origins must use HTTPS");
const PackageIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 values must be 64 lowercase hexadecimal characters");
const NativeArchitectureSchema = z.enum(["aarch64", "x86_64"]);

const LibretroArtifactSchema = z
  .object({
    id: PackageIdSchema,
    version: z.string().min(1),
    sha256: Sha256Schema.optional(),
    license: z.string().min(1),
    source: HttpsUrlSchema,
  })
  .passthrough();

const LibretroManifestSchema = z
  .object({
    frontend: LibretroArtifactSchema,
    core: LibretroArtifactSchema.extend({
      architectures: z.array(NativeArchitectureSchema).min(1),
      supportsNoGame: z.boolean(),
    }),
    content: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("none") }).passthrough(),
      z
        .object({
          mode: z.literal("managed"),
          format: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
          sha256: Sha256Schema,
        })
        .passthrough(),
    ]),
    controllerProfile: PackageIdSchema,
    saveNamespace: PackageIdSchema,
    bios: z.array(
      z
        .object({
          id: PackageIdSchema,
          sha256: Sha256Schema,
          required: z.boolean(),
          license: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const GameManifestSchema = z
  .object({
    schemaVersion: z.literal(GAME_MANIFEST_SCHEMA_VERSION),
    id: PackageIdSchema,
    version: z.string().min(1),
    title: z.string().min(1),
    publisher: z.string().min(1),
    runtime: z.enum(["remote-web", "local-web", "native", "libretro"]),
    entrypoint: z.string().min(1),
    architectures: z.array(z.enum(["aarch64", "x86_64", "web"])).min(1),
    permissions: z.array(GamePermissionSchema),
    inputProfiles: z.array(GameInputProfileSchema),
    minimumConsoleVersion: z.string().min(1),
    network: GameNetworkModeSchema,
    allowedOrigins: z.array(HttpsUrlSchema),
    compatibilityStatus: z.enum(["unverified", "partial", "qualified", "blocked"]),
    launch: z.object({
      timeoutMs: z.number().int().min(1_000).max(120_000),
      healthCheck: z.object({
        type: z.enum(["http", "process", "explicit-ready"]),
        path: z.string().optional(),
      }).passthrough(),
    }).passthrough(),
    rights: z.object({
      distribution: z.enum(["remote-only", "owner-authorized-local", "redistributable"]),
      codeLicense: z.string().min(1),
      contentLicense: z.string().min(1),
      reviewStatus: z.enum(["unreviewed", "owner-confirmed", "audited"]),
    }).passthrough(),
    libretro: LibretroManifestSchema.optional(),
    notes: z.array(z.string()),
  })
  .passthrough()
  .superRefine((manifest, context) => {
    if (manifest.runtime === "remote-web") {
      const parsed = HttpsUrlSchema.safeParse(manifest.entrypoint);
      if (!parsed.success) context.addIssue({ code: "custom", path: ["entrypoint"], message: "remote-web entrypoint must use HTTPS" });
      else if (!manifest.allowedOrigins.some((origin) => new URL(origin).origin === new URL(manifest.entrypoint).origin)) {
        context.addIssue({ code: "custom", path: ["allowedOrigins"], message: "allowedOrigins must include the entrypoint origin" });
      }
    }
    if (manifest.network === "offline" && manifest.permissions.includes("network")) {
      context.addIssue({ code: "custom", path: ["permissions"], message: "offline manifests cannot request network" });
    }
    if (manifest.runtime === "libretro") {
      if (!manifest.libretro) {
        context.addIssue({ code: "custom", path: ["libretro"], message: "libretro runtimes require a libretro launch contract" });
        return;
      }
      if (manifest.entrypoint !== `libretro:${manifest.libretro.core.id}`) {
        context.addIssue({ code: "custom", path: ["entrypoint"], message: "libretro entrypoint must identify the selected core" });
      }
      if (manifest.network !== "offline") {
        context.addIssue({ code: "custom", path: ["network"], message: "curated libretro packages must launch offline" });
      }
      if (manifest.allowedOrigins.length > 0) {
        context.addIssue({ code: "custom", path: ["allowedOrigins"], message: "libretro packages cannot declare web origins" });
      }
      if (manifest.architectures.includes("web")) {
        context.addIssue({ code: "custom", path: ["architectures"], message: "libretro packages require native architectures" });
      }
      const unsupportedPermission = manifest.permissions.find(
        (permission) => !["gamepad", "persistent-storage"].includes(permission),
      );
      if (unsupportedPermission) {
        context.addIssue({
          code: "custom",
          path: ["permissions"],
          message: `libretro packages cannot request ${unsupportedPermission}`,
        });
      }
      if (manifest.launch.healthCheck.type === "http") {
        context.addIssue({ code: "custom", path: ["launch", "healthCheck", "type"], message: "libretro health checks must be process or explicit-ready" });
      }
      if (manifest.libretro.content.mode === "none" && !manifest.libretro.core.supportsNoGame) {
        context.addIssue({ code: "custom", path: ["libretro", "content"], message: "contentless launch requires a core that supports no-game startup" });
      }
      for (const architecture of manifest.architectures) {
        if (architecture !== "web" && !manifest.libretro.core.architectures.includes(architecture)) {
          context.addIssue({
            code: "custom",
            path: ["libretro", "core", "architectures"],
            message: `core artifact is missing ${architecture}`,
          });
        }
      }
      if (manifest.compatibilityStatus === "qualified") {
        if (!manifest.libretro.frontend.sha256) {
          context.addIssue({ code: "custom", path: ["libretro", "frontend", "sha256"], message: "qualified libretro frontends require an artifact hash" });
        }
        if (!manifest.libretro.core.sha256) {
          context.addIssue({ code: "custom", path: ["libretro", "core", "sha256"], message: "qualified libretro cores require an artifact hash" });
        }
      }
    } else if (manifest.libretro) {
      context.addIssue({ code: "custom", path: ["libretro"], message: "only libretro runtimes may declare a libretro launch contract" });
    }
  });

export type GameManifest = z.infer<typeof GameManifestSchema>;

export interface GamePermissionGrant {
  readonly declared: readonly GamePermission[];
  readonly network: boolean;
  readonly persistentStorage: boolean;
  readonly motionProfiles: readonly ManifestMotionProfile[];
}

export class GamePermissionGrantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GamePermissionGrantError";
  }
}

/**
 * Derives launch authority only from a parsed v1 manifest's closed permission
 * vocabulary. Cross-field inconsistencies fail here so v1 parsing compatibility
 * remains stable while invalid declarations cannot become authority.
 */
export function deriveGamePermissionGrant(
  manifest: Pick<GameManifest, "inputProfiles" | "network" | "permissions">,
): GamePermissionGrant {
  const permissions = z.array(GamePermissionSchema).parse(manifest.permissions);
  const inputProfiles = z.array(GameInputProfileSchema).parse(manifest.inputProfiles);
  const networkMode = GameNetworkModeSchema.parse(manifest.network);
  const declared = [...new Set(permissions)];
  const has = (permission: GamePermission) => declared.includes(permission);
  if (networkMode === "offline" && has("network")) {
    throw new GamePermissionGrantError("offline manifests cannot receive network authority");
  }
  if (networkMode !== "offline" && !has("network")) {
    throw new GamePermissionGrantError(
      `${networkMode} network mode requires the network permission`,
    );
  }
  const obstaclePermission = has("motion.actions.obstacle");
  const obstacleInput = inputProfiles.includes("motion.obstacle.v1");
  if (obstaclePermission && !has("motion.core17")) {
    throw new GamePermissionGrantError(
      "motion.actions.obstacle requires motion.core17 because Motion v0.3 frames always carry the core skeleton",
    );
  }
  if (obstaclePermission !== obstacleInput) {
    throw new GamePermissionGrantError(
      obstaclePermission
        ? "motion.actions.obstacle requires the motion.obstacle.v1 input profile"
        : "motion.obstacle.v1 requires the motion.actions.obstacle permission",
    );
  }
  return {
    declared,
    network: has("network"),
    persistentStorage: has("persistent-storage"),
    motionProfiles: motionProfilesForPermissions(declared),
  };
}

export const gameManifestJsonSchema: Record<string, unknown> = {
  $id: GAME_MANIFEST_SCHEMA_ID,
  title: "VCG game manifest v1",
  ...(z.toJSONSchema(GameManifestSchema, { target: "draft-2020-12" }) as Record<string, unknown>),
};
gameManifestJsonSchema.allOf = [
  {
    if: { properties: { runtime: { const: "remote-web" } }, required: ["runtime"] },
    then: { properties: { entrypoint: { pattern: "^https://" } } },
  },
  {
    if: { properties: { network: { const: "offline" } }, required: ["network"] },
    then: { properties: { permissions: { not: { contains: { const: "network" } } } } },
  },
  {
    if: { properties: { runtime: { const: "libretro" } }, required: ["runtime"] },
    then: {
      required: ["libretro"],
      properties: {
        entrypoint: { pattern: "^libretro:[a-z0-9]+(?:-[a-z0-9]+)*$" },
        network: { const: "offline" },
        allowedOrigins: { maxItems: 0 },
        architectures: { not: { contains: { const: "web" } } },
      },
    },
    else: { not: { required: ["libretro"] } },
  },
];
gameManifestJsonSchema.$comment =
  "parseGameManifest additionally compares normalized entrypoint/origin values and libretro core/architecture identity; standard JSON Schema cannot express those cross-property constraints.";

export function parseGameManifest(value: unknown): GameManifest {
  return GameManifestSchema.parse(value);
}

type ManifestIssue = Readonly<{
  code: string;
  path: readonly PropertyKey[];
  message: string;
}>;

/**
 * Produces stable, sorted CLI diagnostics from Zod issues.
 *
 * The path and issue code are part of the author-facing validation contract.
 * Human-readable Zod messages remain useful context but are not intended as
 * machine-readable identifiers.
 */
export function formatGameManifestIssues(issues: readonly ManifestIssue[]): string[] {
  return issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "manifest" : issue.path.map(String).join(".");
      return `${path}: [${issue.code}] ${issue.message}`;
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
