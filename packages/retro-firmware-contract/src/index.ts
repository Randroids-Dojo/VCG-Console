import { z } from "zod";

export const RETRO_FIRMWARE_SCHEMA_VERSION = 1 as const;
export const RETRO_FIRMWARE_MAX_JSON_BYTES = 64 * 1024;
export const RETRO_FIRMWARE_MAX_REQUIREMENTS = 64;
export const RETRO_FIRMWARE_MAX_INVENTORY_ENTRIES = 128;

const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "SHA-256 must be lowercase hexadecimal");

export const FirmwareRequirementSchema = z
  .object({
    id: OpaqueIdSchema,
    sha256: Sha256Schema,
    required: z.boolean(),
    acquisition: z.enum(["user-supplied-only", "bundled-by-console"]),
    rightsStatus: z.enum([
      "restricted-or-unverified",
      "approved-redistributable",
    ]),
    licenseExpression: z.string().min(1).max(128),
    documentationId: OpaqueIdSchema,
  })
  .strict()
  .superRefine((requirement, context) => {
    if (
      requirement.acquisition === "bundled-by-console"
      && requirement.rightsStatus !== "approved-redistributable"
    ) {
      context.addIssue({
        code: "custom",
        path: ["rightsStatus"],
        message: "console-bundled firmware requires approved redistribution",
      });
    }
  });

export const FirmwarePolicySchema = z
  .object({
    schemaVersion: z.literal(RETRO_FIRMWARE_SCHEMA_VERSION),
    policyId: OpaqueIdSchema,
    revision: z.number().int().positive(),
    systemId: OpaqueIdSchema,
    coreId: OpaqueIdSchema,
    requirements: z
      .array(FirmwareRequirementSchema)
      .max(RETRO_FIRMWARE_MAX_REQUIREMENTS),
  })
  .strict()
  .superRefine((policy, context) => {
    const ids = policy.requirements.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["requirements"],
        message: "firmware requirement IDs must be unique",
      });
    }
    if (ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) {
      context.addIssue({
        code: "custom",
        path: ["requirements"],
        message: "firmware requirements must be strictly ID-sorted",
      });
    }
  });

export const InstalledFirmwareEntrySchema = z
  .object({
    id: OpaqueIdSchema,
    sha256: Sha256Schema,
    scanStatus: z.enum(["clean", "blocked", "unavailable"]),
  })
  .strict();

export const FirmwareInventorySchema = z
  .object({
    schemaVersion: z.literal(RETRO_FIRMWARE_SCHEMA_VERSION),
    generation: z.number().int().nonnegative(),
    systemId: OpaqueIdSchema,
    coreId: OpaqueIdSchema,
    entries: z
      .array(InstalledFirmwareEntrySchema)
      .max(RETRO_FIRMWARE_MAX_INVENTORY_ENTRIES),
  })
  .strict()
  .superRefine((inventory, context) => {
    const ids = inventory.entries.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: "installed firmware IDs must be unique",
      });
    }
    if (ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) {
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message: "installed firmware entries must be strictly ID-sorted",
      });
    }
  });

export type FirmwarePolicy = Readonly<
  z.infer<typeof FirmwarePolicySchema>
>;
export type FirmwareInventory = Readonly<
  z.infer<typeof FirmwareInventorySchema>
>;

export type FirmwareDiagnosticCode =
  | "firmware-ready-no-requirements"
  | "firmware-ready"
  | "firmware-ready-optional-attention"
  | "firmware-blocked";

export type FirmwareUserActionCode =
  | "open-reviewed-firmware-help"
  | "select-local-firmware-files"
  | "retry-firmware-scan";

export interface FirmwareReadiness {
  readonly status: "ready" | "blocked";
  readonly diagnosticCode: FirmwareDiagnosticCode;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly systemId: string;
  readonly coreId: string;
  readonly inventoryGeneration: number;
  readonly missingRequiredIds: readonly string[];
  readonly mismatchedRequiredIds: readonly string[];
  readonly unsafeRequiredIds: readonly string[];
  readonly missingOptionalIds: readonly string[];
  readonly mismatchedOptionalIds: readonly string[];
  readonly unsafeOptionalIds: readonly string[];
  readonly userActionCodes: readonly FirmwareUserActionCode[];
}

export interface FirmwareLaunchBinding {
  readonly policyId: string;
  readonly policyRevision: number;
  readonly systemId: string;
  readonly coreId: string;
  readonly inventoryGeneration: number;
  readonly requiredFirmware: readonly Readonly<{
    id: string;
    sha256: string;
  }>[];
}

const policyAuthorities = new WeakSet<object>();
const inventoryAuthorities = new WeakSet<object>();
const readinessAuthorities = new WeakMap<
  object,
  Readonly<{
    policy: FirmwarePolicy;
    inventory: FirmwareInventory;
  }>
>();

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function parseCanonicalJson(
  bytes: Uint8Array,
  label: string,
): unknown {
  if (
    bytes.byteLength === 0
    || bytes.byteLength > RETRO_FIRMWARE_MAX_JSON_BYTES
  ) {
    throw new Error(`${label} JSON byte size is invalid`);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (text !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(
      `${label} must be canonical JSON without duplicate or reordered fields`,
    );
  }
  return value;
}

export function parseFirmwarePolicy(value: unknown): FirmwarePolicy {
  const policy = deepFreeze(FirmwarePolicySchema.parse(value));
  policyAuthorities.add(policy);
  return policy;
}

export function parseFirmwarePolicyJson(bytes: Uint8Array): FirmwarePolicy {
  return parseFirmwarePolicy(parseCanonicalJson(bytes, "firmware policy"));
}

export function parseFirmwareInventory(value: unknown): FirmwareInventory {
  const inventory = deepFreeze(FirmwareInventorySchema.parse(value));
  inventoryAuthorities.add(inventory);
  return inventory;
}

export function parseFirmwareInventoryJson(
  bytes: Uint8Array,
): FirmwareInventory {
  return parseFirmwareInventory(
    parseCanonicalJson(bytes, "firmware inventory"),
  );
}

function requireAuthority(
  value: object,
  authorities: WeakSet<object>,
  label: string,
): void {
  if (!authorities.has(value)) {
    throw new Error(`${label} must be an exact parsed authority object`);
  }
}

export function evaluateFirmwareReadiness(
  policy: FirmwarePolicy,
  inventory: FirmwareInventory,
): FirmwareReadiness {
  requireAuthority(policy, policyAuthorities, "firmware policy");
  requireAuthority(inventory, inventoryAuthorities, "firmware inventory");
  if (
    policy.systemId !== inventory.systemId
    || policy.coreId !== inventory.coreId
  ) {
    throw new Error("firmware policy and inventory scope do not match");
  }

  const installed = new Map(
    inventory.entries.map((entry) => [entry.id, entry]),
  );
  const missingRequiredIds: string[] = [];
  const mismatchedRequiredIds: string[] = [];
  const unsafeRequiredIds: string[] = [];
  const missingOptionalIds: string[] = [];
  const mismatchedOptionalIds: string[] = [];
  const unsafeOptionalIds: string[] = [];

  for (const requirement of policy.requirements) {
    const entry = installed.get(requirement.id);
    const missing = requirement.required
      ? missingRequiredIds
      : missingOptionalIds;
    const mismatched = requirement.required
      ? mismatchedRequiredIds
      : mismatchedOptionalIds;
    const unsafe = requirement.required
      ? unsafeRequiredIds
      : unsafeOptionalIds;
    if (!entry) missing.push(requirement.id);
    else if (entry.sha256 !== requirement.sha256) {
      mismatched.push(requirement.id);
    } else if (entry.scanStatus !== "clean") {
      unsafe.push(requirement.id);
    }
  }

  const blocked =
    missingRequiredIds.length > 0
    || mismatchedRequiredIds.length > 0
    || unsafeRequiredIds.length > 0;
  const optionalAttention =
    missingOptionalIds.length > 0
    || mismatchedOptionalIds.length > 0
    || unsafeOptionalIds.length > 0;
  const userActionCodes: FirmwareUserActionCode[] = [];
  if (blocked || optionalAttention) {
    userActionCodes.push("open-reviewed-firmware-help");
  }
  if (
    missingRequiredIds.length > 0
    || mismatchedRequiredIds.length > 0
    || missingOptionalIds.length > 0
    || mismatchedOptionalIds.length > 0
  ) {
    userActionCodes.push("select-local-firmware-files");
  }
  if (unsafeRequiredIds.length > 0 || unsafeOptionalIds.length > 0) {
    userActionCodes.push("retry-firmware-scan");
  }

  const diagnosticCode: FirmwareDiagnosticCode =
    policy.requirements.length === 0
      ? "firmware-ready-no-requirements"
      : blocked
        ? "firmware-blocked"
        : optionalAttention
          ? "firmware-ready-optional-attention"
          : "firmware-ready";
  const readiness = deepFreeze({
    status: blocked ? "blocked" : "ready",
    diagnosticCode,
    policyId: policy.policyId,
    policyRevision: policy.revision,
    systemId: policy.systemId,
    coreId: policy.coreId,
    inventoryGeneration: inventory.generation,
    missingRequiredIds,
    mismatchedRequiredIds,
    unsafeRequiredIds,
    missingOptionalIds,
    mismatchedOptionalIds,
    unsafeOptionalIds,
    userActionCodes,
  } satisfies FirmwareReadiness);
  readinessAuthorities.set(readiness, { policy, inventory });
  return readiness;
}

export function authorizeFirmwareLaunch(
  readiness: FirmwareReadiness,
  policy: FirmwarePolicy,
  inventory: FirmwareInventory,
): FirmwareLaunchBinding {
  const authority = readinessAuthorities.get(readiness);
  if (
    !authority
    || authority.policy !== policy
    || authority.inventory !== inventory
  ) {
    throw new Error(
      "firmware readiness must be the exact current preflight authority",
    );
  }
  if (readiness.status !== "ready") {
    throw new Error("required firmware is not ready");
  }
  return deepFreeze({
    policyId: policy.policyId,
    policyRevision: policy.revision,
    systemId: policy.systemId,
    coreId: policy.coreId,
    inventoryGeneration: inventory.generation,
    requiredFirmware: policy.requirements
      .filter(({ required }) => required)
      .map(({ id, sha256 }) => ({ id, sha256 })),
  });
}
