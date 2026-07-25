import { z } from "zod";

export const COMMUNITY_DISCOVERY_SCHEMA_VERSION = 1 as const;
export const COMMUNITY_DISCOVERY_FORMAT =
  "vcg-community-discovery/v1" as const;
export const MAX_COMMUNITY_DISCOVERY_BYTES = 128 * 1024;
export const MAX_COMMUNITY_DISCOVERY_ENTRIES = 256;

const IdentifierSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(96);
const OpaqueIdentifierSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/)
  .max(96);
const VersionSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/)
  .max(96);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const DiscoveryTextSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => value.trim() === value, "text must not have outer whitespace")
  .refine(
    (value) =>
      !/[\u0000-\u001f\u007f\\]/u.test(value)
      && !/(?:https?:\/\/|www\.)/iu.test(value),
    "text must not contain controls, paths, or web addresses",
  );
const RuntimeSchema = z.enum([
  "remote-web",
  "local-web",
  "native",
  "libretro",
]);
const InputProfileSchema = z.enum([
  "gamepad",
  "pointer",
  "keyboard",
  "touch",
  "motion.obstacle.v1",
]);
const AdmissionStateSchema = z.enum([
  "candidate",
  "approved",
  "temporarily-disabled",
  "revoked",
  "removed",
]);
const EmergencyReasonSchema = z.enum([
  "none",
  "safety",
  "security",
  "privacy",
  "rights",
  "content",
  "service-incident",
  "compatibility",
]);

const CommunityDiscoveryEntrySchema = z
  .object({
    admissionId: OpaqueIdentifierSchema,
    gameId: IdentifierSchema,
    version: VersionSchema,
    manifestSha256: Sha256Schema,
    trustTier: z.literal("curated-community"),
    admissionState: AdmissionStateSchema,
    runtime: RuntimeSchema,
    delivery: z.enum(["hosted", "installed"]),
    title: DiscoveryTextSchema.max(120),
    publisher: DiscoveryTextSchema.max(120),
    summary: DiscoveryTextSchema,
    network: z.enum(["required", "optional", "offline"]),
    inputProfiles: z.array(InputProfileSchema).min(1).max(5),
    serviceBoundary: z.enum([
      "none",
      "optional-account",
      "required-account",
      "payment",
    ]),
    reportRouteId: OpaqueIdentifierSchema,
    removalPolicy: z.enum([
      "no-local-data",
      "preserve-local-data",
      "user-choice",
    ]),
    emergencyReason: EmergencyReasonSchema,
    launchBindingId: OpaqueIdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.delivery === "hosted"
      && entry.removalPolicy !== "no-local-data"
    ) {
      context.addIssue({
        code: "custom",
        path: ["removalPolicy"],
        message: "hosted discovery entries cannot claim console-local data",
      });
    }
    const sortedInputs = [...entry.inputProfiles].sort(compareAscii);
    if (
      new Set(entry.inputProfiles).size !== entry.inputProfiles.length
      || sortedInputs.some((value, index) => value !== entry.inputProfiles[index])
    ) {
      context.addIssue({
        code: "custom",
        path: ["inputProfiles"],
        message: "input profiles must be unique and sorted",
      });
    }
    if (entry.admissionState === "approved") {
      if (entry.launchBindingId === null) {
        context.addIssue({
          code: "custom",
          path: ["launchBindingId"],
          message: "approved entries require one host launch binding",
        });
      }
      if (entry.emergencyReason !== "none") {
        context.addIssue({
          code: "custom",
          path: ["emergencyReason"],
          message: "approved entries cannot carry an emergency reason",
        });
      }
    } else if (entry.launchBindingId !== null) {
      context.addIssue({
        code: "custom",
        path: ["launchBindingId"],
        message: "non-approved entries cannot carry launch authority",
      });
    }
    if (
      ["temporarily-disabled", "revoked"].includes(entry.admissionState)
      && entry.emergencyReason === "none"
    ) {
      context.addIssue({
        code: "custom",
        path: ["emergencyReason"],
        message: "disabled and revoked entries require a bounded reason",
      });
    }
  });

export const CommunityDiscoveryFeedSchema = z
  .object({
    format: z.literal(COMMUNITY_DISCOVERY_FORMAT),
    schemaVersion: z.literal(COMMUNITY_DISCOVERY_SCHEMA_VERSION),
    audience: z.literal("family-community"),
    keyId: OpaqueIdentifierSchema,
    catalogGeneration: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    entries: z
      .array(CommunityDiscoveryEntrySchema)
      .max(MAX_COMMUNITY_DISCOVERY_ENTRIES),
  })
  .strict()
  .superRefine((feed, context) => {
    const admissionIds = new Set<string>();
    const gameIds = new Set<string>();
    const launchBindings = new Set<string>();
    for (const [index, entry] of feed.entries.entries()) {
      if (admissionIds.has(entry.admissionId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "admissionId"],
          message: "admission IDs must be unique",
        });
      }
      admissionIds.add(entry.admissionId);
      if (gameIds.has(entry.gameId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "gameId"],
          message: "game IDs must be unique",
        });
      }
      gameIds.add(entry.gameId);
      if (entry.launchBindingId !== null) {
        if (launchBindings.has(entry.launchBindingId)) {
          context.addIssue({
            code: "custom",
            path: ["entries", index, "launchBindingId"],
            message: "launch bindings must be unique",
          });
        }
        launchBindings.add(entry.launchBindingId);
      }
      if (
        index > 0
        && compareAscii(feed.entries[index - 1]!.gameId, entry.gameId) >= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "gameId"],
          message: "entries must be strictly sorted by game ID",
        });
      }
    }
  });

export type CommunityDiscoveryFeed = z.infer<
  typeof CommunityDiscoveryFeedSchema
>;

declare const verifiedCommunityFeedBrand: unique symbol;
export type VerifiedCommunityDiscoveryFeed = Readonly<
  CommunityDiscoveryFeed & {
    readonly [verifiedCommunityFeedBrand]: true;
  }
>;

export interface CommunityDiscoverySignatureRequest {
  readonly bytes: Uint8Array;
  readonly signature: Uint8Array;
  readonly format: typeof COMMUNITY_DISCOVERY_FORMAT;
  readonly audience: "family-community";
  readonly keyId: string;
  readonly catalogGeneration: number;
}

export type CommunityDiscoverySignatureVerifier = (
  request: CommunityDiscoverySignatureRequest,
) => boolean | Promise<boolean>;

export type CommunityRuntimeLabel =
  | "Hosted web"
  | "Local web"
  | "Native"
  | "Libretro";

export interface FamilyCommunityDiscoveryEntry {
  readonly gameId: string;
  readonly version: string;
  readonly title: string;
  readonly publisher: string;
  readonly summary: string;
  readonly trustLabel: "Community reviewed";
  readonly runtimeLabel: CommunityRuntimeLabel;
  readonly deliveryLabel: "Hosted service" | "Installed locally";
  readonly networkLabel: "Network required" | "Network optional" | "Offline";
  readonly inputLabels: readonly string[];
  readonly serviceLabel:
    | "No account"
    | "Optional external account"
    | "External account required"
    | "External payment boundary";
  readonly availability: "available";
  readonly unavailableReason: null;
  readonly launchAction: Readonly<{
    kind: "request-host-launch";
    admissionId: string;
    launchBindingId: string;
  }>;
  readonly installAction: "none";
  readonly reportAction: Readonly<{
    kind: "report-by-id";
    reportRouteId: string;
  }>;
  readonly removalNotice:
    | "No console-local data"
    | "Local data preserved"
    | "Removal asks before local-data deletion";
}

export interface FamilyCommunityDiscoveryProjection {
  readonly schemaVersion: typeof COMMUNITY_DISCOVERY_SCHEMA_VERSION;
  readonly catalogGeneration: number;
  readonly surface: "family-community";
  readonly entries: readonly Readonly<FamilyCommunityDiscoveryEntry>[];
}

export class CommunityDiscoveryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommunityDiscoveryError";
  }
}

const verifiedFeeds = new WeakSet<object>();

export async function verifyCommunityDiscoveryFeed(
  bytes: Uint8Array,
  detachedSignature: Uint8Array,
  expectedCatalogGeneration: number,
  verifySignature: CommunityDiscoverySignatureVerifier,
): Promise<VerifiedCommunityDiscoveryFeed> {
  if (!(bytes instanceof Uint8Array)) {
    throw new CommunityDiscoveryError(
      "community discovery feed must be UTF-8 bytes",
    );
  }
  if (bytes.length === 0 || bytes.length > MAX_COMMUNITY_DISCOVERY_BYTES) {
    throw new CommunityDiscoveryError(
      "community discovery feed byte size is invalid",
    );
  }
  if (
    !(detachedSignature instanceof Uint8Array)
    || detachedSignature.length === 0
    || detachedSignature.length > 1_024
  ) {
    throw new CommunityDiscoveryError(
      "community discovery signature size is invalid",
    );
  }
  if (
    !Number.isSafeInteger(expectedCatalogGeneration)
    || expectedCatalogGeneration < 1
  ) {
    throw new CommunityDiscoveryError(
      "expected catalog generation is invalid",
    );
  }

  const ownedBytes = Uint8Array.from(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(ownedBytes);
  } catch {
    throw new CommunityDiscoveryError(
      "community discovery feed is not valid UTF-8",
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new CommunityDiscoveryError(
      "community discovery feed is not valid JSON",
    );
  }
  const result = CommunityDiscoveryFeedSchema.safeParse(input);
  if (!result.success) {
    throw new CommunityDiscoveryError(
      "community discovery feed failed its closed schema",
    );
  }
  const canonical = `${JSON.stringify(result.data)}\n`;
  if (text !== canonical) {
    throw new CommunityDiscoveryError(
      "community discovery feed must use canonical JSON",
    );
  }
  if (result.data.catalogGeneration !== expectedCatalogGeneration) {
    throw new CommunityDiscoveryError(
      "community discovery catalog generation is stale or unexpected",
    );
  }

  let verified = false;
  try {
    verified = await verifySignature({
      bytes: Uint8Array.from(ownedBytes),
      signature: Uint8Array.from(detachedSignature),
      format: result.data.format,
      audience: result.data.audience,
      keyId: result.data.keyId,
      catalogGeneration: result.data.catalogGeneration,
    });
  } catch {
    throw new CommunityDiscoveryError(
      "community discovery signature verification failed",
    );
  }
  if (!verified) {
    throw new CommunityDiscoveryError(
      "community discovery signature verification failed",
    );
  }

  const feed = deepFreeze(result.data) as VerifiedCommunityDiscoveryFeed;
  verifiedFeeds.add(feed);
  return feed;
}

export function projectFamilyCommunityDiscovery(
  feed: VerifiedCommunityDiscoveryFeed,
): FamilyCommunityDiscoveryProjection {
  if (
    typeof feed !== "object"
    || feed === null
    || !verifiedFeeds.has(feed)
  ) {
    throw new CommunityDiscoveryError(
      "family community discovery requires the exact verified feed",
    );
  }

  return deepFreeze({
    schemaVersion: COMMUNITY_DISCOVERY_SCHEMA_VERSION,
    catalogGeneration: feed.catalogGeneration,
    surface: "family-community" as const,
    entries: feed.entries.flatMap(
      (entry): FamilyCommunityDiscoveryEntry[] => {
        if (entry.admissionState !== "approved") {
          return [];
        }
        if (entry.launchBindingId === null) {
          throw new CommunityDiscoveryError(
            "approved discovery entry lost its host launch binding",
          );
        }
        return [
          {
            gameId: entry.gameId,
            version: entry.version,
            title: entry.title,
            publisher: entry.publisher,
            summary: entry.summary,
            trustLabel: "Community reviewed",
            runtimeLabel: runtimeLabel(entry.runtime),
            deliveryLabel:
              entry.delivery === "hosted"
                ? "Hosted service"
                : "Installed locally",
            networkLabel:
              entry.network === "required"
                ? "Network required"
                : entry.network === "optional"
                  ? "Network optional"
                  : "Offline",
            inputLabels: entry.inputProfiles.map(inputLabel),
            serviceLabel: serviceLabel(entry.serviceBoundary),
            availability: "available",
            unavailableReason: null,
            launchAction: {
              kind: "request-host-launch",
              admissionId: entry.admissionId,
              launchBindingId: entry.launchBindingId,
            },
            installAction: "none",
            reportAction: {
              kind: "report-by-id",
              reportRouteId: entry.reportRouteId,
            },
            removalNotice:
              entry.removalPolicy === "no-local-data"
                ? "No console-local data"
                : entry.removalPolicy === "preserve-local-data"
                  ? "Local data preserved"
                  : "Removal asks before local-data deletion",
          },
        ];
      },
    ),
  });
}

function runtimeLabel(
  runtime: z.infer<typeof RuntimeSchema>,
): CommunityRuntimeLabel {
  switch (runtime) {
    case "remote-web":
      return "Hosted web";
    case "local-web":
      return "Local web";
    case "native":
      return "Native";
    case "libretro":
      return "Libretro";
  }
}

function inputLabel(
  input: z.infer<typeof InputProfileSchema>,
): string {
  switch (input) {
    case "gamepad":
      return "Controller";
    case "pointer":
      return "Pointer";
    case "keyboard":
      return "Keyboard";
    case "touch":
      return "Touch";
    case "motion.obstacle.v1":
      return "Body motion";
  }
}

function serviceLabel(
  boundary: CommunityDiscoveryFeed["entries"][number]["serviceBoundary"],
): FamilyCommunityDiscoveryEntry["serviceLabel"] {
  switch (boundary) {
    case "none":
      return "No account";
    case "optional-account":
      return "Optional external account";
    case "required-account":
      return "External account required";
    case "payment":
      return "External payment boundary";
  }
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
