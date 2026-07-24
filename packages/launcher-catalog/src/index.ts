import {
  GameManifestSchema,
  type GameManifest,
  formatGameManifestIssues,
} from "@vcg/game-manifest";
import { z } from "zod";

export const LAUNCHER_POLICY_SCHEMA_VERSION = 1 as const;

const BoundedTextSchema = z.string().min(1).max(160);
const HttpsRootSchema = z
  .url()
  .refine((value) => value.startsWith("https://"), "launcher destinations must use HTTPS")
  .refine((value) => {
    const url = new URL(value);
    return (
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  }, "launcher destinations must be credential-free HTTPS origins");
const IdentifierSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const SearchTermsSchema = z
  .array(z.string().regex(/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/).max(48))
  .min(1)
  .max(16);
const LaunchBudgetSchema = z
  .object({
    slowAfterMs: z.number().int().min(100).max(120_000),
    heartbeatTimeoutMs: z.number().int().min(100).max(120_000),
    timeoutMs: z.number().int().min(1_000).max(120_000),
  })
  .strict()
  .superRefine((budget, context) => {
    if (
      budget.slowAfterMs >= budget.heartbeatTimeoutMs ||
      budget.heartbeatTimeoutMs >= budget.timeoutMs
    ) {
      context.addIssue({
        code: "custom",
        message: "launch budgets must satisfy slowAfterMs < heartbeatTimeoutMs < timeoutMs",
      });
    }
  });

export const LauncherPolicySchema = z
  .object({
    schemaVersion: z.literal(LAUNCHER_POLICY_SCHEMA_VERSION),
    museum: z
      .object({
        id: IdentifierSchema,
        title: BoundedTextSchema,
        entrypoint: HttpsRootSchema,
        context: BoundedTextSchema,
        searchTerms: SearchTermsSchema,
      })
      .strict(),
    launchBudgets: z
      .object({
        local: LaunchBudgetSchema,
        remote: LaunchBudgetSchema,
      })
      .strict(),
    entries: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            surface: z.enum(["museum", "retro", "hidden"]),
            displayIndex: z.string().regex(/^[A-Z][0-9]{1,2}$/),
            searchDetail: BoundedTextSchema,
            searchTerms: SearchTermsSchema,
            summary: BoundedTextSchema,
            statusLabel: z.string().min(1).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(256),
  })
  .strict();

export type LauncherPolicy = z.infer<typeof LauncherPolicySchema>;
export type LaunchBudget = Readonly<LauncherPolicy["launchBudgets"]["local"]>;
type LauncherPolicySurface = LauncherPolicy["entries"][number]["surface"];
export type LauncherCatalogSurface = Exclude<LauncherPolicySurface, "hidden">;

export interface LauncherCatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly publisher: string;
  readonly runtime: GameManifest["runtime"];
  readonly entrypoint: string;
  readonly network: GameManifest["network"];
  readonly compatibilityStatus: GameManifest["compatibilityStatus"];
  readonly surface: LauncherCatalogSurface;
  readonly displayIndex: string;
  readonly searchDetail: string;
  readonly searchTerms: readonly string[];
  readonly summary: string;
  readonly statusLabel: string;
}

export interface LauncherCatalog {
  readonly schemaVersion: typeof LAUNCHER_POLICY_SCHEMA_VERSION;
  readonly museum: Readonly<LauncherPolicy["museum"]>;
  readonly launchBudgets: Readonly<{
    local: LaunchBudget;
    remote: LaunchBudget;
  }>;
  readonly entries: readonly LauncherCatalogEntry[];
}

export class LauncherCatalogError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "LauncherCatalogError";
  }
}

export function buildLauncherCatalog(
  manifestInputs: readonly unknown[],
  policyInput: unknown,
): LauncherCatalog {
  const policyResult = LauncherPolicySchema.safeParse(policyInput);
  if (!policyResult.success) {
    throw new LauncherCatalogError(
      `launcher policy is invalid:\n${formatIssues(policyResult.error.issues).join("\n")}`,
    );
  }
  const manifests = manifestInputs.map((input, index) => {
    const result = GameManifestSchema.safeParse(input);
    if (!result.success) {
      throw new LauncherCatalogError(
        `game manifest ${index + 1} is invalid:\n${formatGameManifestIssues(result.error.issues).join("\n")}`,
      );
    }
    return result.data;
  });
  const manifestsById = uniqueManifests(manifests);
  const policyEntries = uniquePolicyEntries(policyResult.data);
  requireExactMembership(manifestsById, policyEntries);

  return {
    schemaVersion: LAUNCHER_POLICY_SCHEMA_VERSION,
    museum: policyResult.data.museum,
    launchBudgets: policyResult.data.launchBudgets,
    entries: policyEntries.flatMap((entry): LauncherCatalogEntry[] => {
      const manifest = manifestsById.get(entry.id);
      if (!manifest) {
        throw new LauncherCatalogError(`launcher policy references unknown game ${entry.id}`);
      }
      validateSurface(entry.surface, manifest);
      if (entry.surface === "hidden") return [];
      return [{
        id: manifest.id,
        version: manifest.version,
        title: manifest.title,
        publisher: manifest.publisher,
        runtime: manifest.runtime,
        entrypoint: manifest.entrypoint,
        network: manifest.network,
        compatibilityStatus: manifest.compatibilityStatus,
        surface: entry.surface,
        displayIndex: entry.displayIndex,
        searchDetail: entry.searchDetail,
        searchTerms: entry.searchTerms,
        summary: entry.summary,
        statusLabel: entry.statusLabel,
      }];
    }),
  };
}

export function serializeLauncherCatalogModule(catalog: LauncherCatalog): string {
  return [
    'import type { LauncherCatalog } from "@vcg/launcher-catalog";',
    "",
    "// Generated by `pnpm prepare:catalog`; edit catalog manifests or launcher-policy.json.",
    `export const launcherCatalog = ${JSON.stringify(catalog, null, 2)} as const satisfies LauncherCatalog;`,
    "",
  ].join("\n");
}

function uniqueManifests(manifests: readonly GameManifest[]): Map<string, GameManifest> {
  const manifestsById = new Map<string, GameManifest>();
  for (const manifest of manifests) {
    if (manifestsById.has(manifest.id)) {
      throw new LauncherCatalogError(`duplicate game manifest ID ${manifest.id}`);
    }
    manifestsById.set(manifest.id, manifest);
  }
  return manifestsById;
}

function uniquePolicyEntries(policy: LauncherPolicy): LauncherPolicy["entries"] {
  const ids = new Set<string>();
  const displayIndices = new Set<string>();
  for (const entry of policy.entries) {
    if (ids.has(entry.id)) {
      throw new LauncherCatalogError(`duplicate launcher policy game ID ${entry.id}`);
    }
    ids.add(entry.id);
    if (displayIndices.has(entry.displayIndex)) {
      throw new LauncherCatalogError(
        `duplicate launcher policy display index ${entry.displayIndex}`,
      );
    }
    displayIndices.add(entry.displayIndex);
  }
  if (ids.has(policy.museum.id)) {
    throw new LauncherCatalogError(
      `museum ID ${policy.museum.id} conflicts with a game manifest ID`,
    );
  }
  return policy.entries;
}

function requireExactMembership(
  manifests: ReadonlyMap<string, GameManifest>,
  policyEntries: readonly LauncherPolicy["entries"][number][],
): void {
  const policyIds = new Set(policyEntries.map((entry) => entry.id));
  const missingPolicy = [...manifests.keys()].filter((id) => !policyIds.has(id)).sort();
  const missingManifest = [...policyIds].filter((id) => !manifests.has(id)).sort();
  if (missingPolicy.length > 0 || missingManifest.length > 0) {
    const details = [
      missingPolicy.length > 0 ? `missing policy entries: ${missingPolicy.join(", ")}` : "",
      missingManifest.length > 0 ? `unknown policy entries: ${missingManifest.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new LauncherCatalogError(`launcher catalog membership drifted: ${details}`);
  }
}

function validateSurface(
  surface: LauncherPolicySurface,
  manifest: GameManifest,
): void {
  if (surface === "museum" && manifest.runtime !== "remote-web") {
    throw new LauncherCatalogError(
      `museum game ${manifest.id} must use the remote-web runtime`,
    );
  }
  if (surface === "retro" && manifest.runtime !== "libretro") {
    throw new LauncherCatalogError(`retro game ${manifest.id} must use the libretro runtime`);
  }
}

function formatIssues(
  issues: readonly {
    readonly code: string;
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
): string[] {
  return issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "policy" : issue.path.map(String).join(".");
      return `${path}: [${issue.code}] ${issue.message}`;
    })
    .sort();
}
