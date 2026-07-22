import { z } from "zod";

const HttpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), "remote entrypoints and origins must use HTTPS");

export const GameManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: z.string().min(1),
    title: z.string().min(1),
    publisher: z.string().min(1),
    runtime: z.enum(["remote-web", "local-web", "native", "libretro"]),
    entrypoint: z.string().min(1),
    architectures: z.array(z.enum(["aarch64", "x86_64", "web"])).min(1),
    permissions: z.array(z.enum(["gamepad", "pointer", "keyboard", "touch", "motion.core17", "motion.actions.obstacle", "network", "persistent-storage"])),
    inputProfiles: z.array(z.enum(["gamepad", "pointer", "keyboard", "touch", "motion.obstacle.v1"])),
    minimumConsoleVersion: z.string().min(1),
    network: z.enum(["required", "optional", "offline"]),
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
  });

export type GameManifest = z.infer<typeof GameManifestSchema>;
export const gameManifestJsonSchema = z.toJSONSchema(GameManifestSchema, { target: "draft-2020-12" }) as Record<string, unknown>;
gameManifestJsonSchema.allOf = [
  {
    if: { properties: { runtime: { const: "remote-web" } }, required: ["runtime"] },
    then: { properties: { entrypoint: { pattern: "^https://" } } },
  },
  {
    if: { properties: { network: { const: "offline" } }, required: ["network"] },
    then: { properties: { permissions: { not: { contains: { const: "network" } } } } },
  },
];
gameManifestJsonSchema.$comment =
  "parseGameManifest additionally compares normalized entrypoint and allowedOrigins values; standard JSON Schema cannot express cross-property URL-origin equality.";

export function parseGameManifest(value: unknown): GameManifest {
  return GameManifestSchema.parse(value);
}
