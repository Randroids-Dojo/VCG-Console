export const ARCADE_SET_SCHEMA_VERSION = 1 as const;
export const ARCADE_SET_MAX_JSON_BYTES = 64 * 1024;
export const ARCADE_SET_MAX_TITLES = 256;
export const ARCADE_SET_MAX_INVENTORY = 512;

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface ArcadeTitlePolicy {
  titleId: string;
  setId: string;
  relationship: "parent" | "clone";
  parentSetId: string | null;
  setSha256: string;
  parentSha256: string | null;
  rightsStatus: "rights-cleared-test" | "user-supplied-unverified";
}

export interface ArcadeSetPolicy {
  schemaVersion: typeof ARCADE_SET_SCHEMA_VERSION;
  policyId: string;
  revision: number;
  coreId: string;
  coreVersion: string;
  setVersion: string;
  titles: ArcadeTitlePolicy[];
}

export interface InstalledArcadeSet {
  setId: string;
  sha256: string;
  scanStatus: "clean" | "blocked" | "unavailable";
}

export interface ArcadeSetInventory {
  schemaVersion: typeof ARCADE_SET_SCHEMA_VERSION;
  generation: number;
  coreId: string;
  coreVersion: string;
  setVersion: string;
  entries: InstalledArcadeSet[];
}

export interface ArcadeSetReadiness {
  status: "ready" | "blocked";
  diagnosticCode: "arcade-set-ready" | "arcade-set-blocked";
  policyId: string;
  policyRevision: number;
  titleId: string;
  coreId: string;
  coreVersion: string;
  setVersion: string;
  inventoryGeneration: number;
  missingSetIds: readonly string[];
  mismatchedSetIds: readonly string[];
  unsafeSetIds: readonly string[];
  userActionCodes: readonly (
    | "open-reviewed-arcade-set-help"
    | "select-local-arcade-set-files"
    | "retry-arcade-set-scan"
  )[];
}

export interface ArcadeSetLaunchBinding {
  policyId: string;
  policyRevision: number;
  titleId: string;
  coreId: string;
  coreVersion: string;
  setVersion: string;
  inventoryGeneration: number;
  requiredSets: readonly Readonly<{ setId: string; sha256: string }>[];
}

const policyAuthority = new WeakSet<object>();
const inventoryAuthority = new WeakSet<object>();
const readinessAuthority = new WeakMap<
  object,
  { policy: ArcadeSetPolicy; inventory: ArcadeSetInventory }
>();

function object(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}

function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ID.test(value) || value.length > 64) {
    throw new Error(`${label} must be an opaque safe ID`);
  }
}

function text(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 64
    || /[\\/]/u.test(value)
  ) {
    throw new Error(`${label} must be bounded path-free text`);
  }
}

function hash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
}

function integer(value: unknown, label: string, positive: boolean): void {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < (positive ? 1 : 0)
  ) {
    throw new Error(`${label} must be a bounded integer`);
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(bytes: Uint8Array, label: string): unknown {
  if (bytes.byteLength === 0 || bytes.byteLength > ARCADE_SET_MAX_JSON_BYTES) {
    throw new Error(`${label} JSON byte size is invalid`);
  }
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(source);
  if (source !== `${JSON.stringify(value, null, 2)}\n`) {
    throw new Error(`${label} must be canonical JSON`);
  }
  return value;
}

export function parseArcadeSetPolicy(value: unknown): ArcadeSetPolicy {
  object(
    value,
    [
      "schemaVersion",
      "policyId",
      "revision",
      "coreId",
      "coreVersion",
      "setVersion",
      "titles",
    ],
    "arcade set policy",
  );
  if (value.schemaVersion !== ARCADE_SET_SCHEMA_VERSION) {
    throw new Error("unsupported arcade set policy version");
  }
  id(value.policyId, "policyId");
  integer(value.revision, "revision", true);
  id(value.coreId, "coreId");
  text(value.coreVersion, "coreVersion");
  text(value.setVersion, "setVersion");
  if (
    !Array.isArray(value.titles)
    || value.titles.length > ARCADE_SET_MAX_TITLES
  ) {
    throw new Error("titles must be a bounded array");
  }
  const titleIds = new Set<string>();
  const setIds = new Set<string>();
  let previous = "";
  for (const [index, entry] of value.titles.entries()) {
    object(
      entry,
      [
        "titleId",
        "setId",
        "relationship",
        "parentSetId",
        "setSha256",
        "parentSha256",
        "rightsStatus",
      ],
      `titles[${index}]`,
    );
    id(entry.titleId, `titles[${index}].titleId`);
    id(entry.setId, `titles[${index}].setId`);
    hash(entry.setSha256, `titles[${index}].setSha256`);
    if (
      entry.rightsStatus !== "rights-cleared-test"
      && entry.rightsStatus !== "user-supplied-unverified"
    ) {
      throw new Error("rightsStatus is invalid");
    }
    if (entry.relationship === "parent") {
      if (entry.parentSetId !== null || entry.parentSha256 !== null) {
        throw new Error("parent sets cannot declare a parent");
      }
    } else if (entry.relationship === "clone") {
      id(entry.parentSetId, `titles[${index}].parentSetId`);
      hash(entry.parentSha256, `titles[${index}].parentSha256`);
      if (entry.parentSetId === entry.setId) {
        throw new Error("clone parent must be a distinct set");
      }
    } else {
      throw new Error("relationship is invalid");
    }
    if (
      titleIds.has(entry.titleId)
      || setIds.has(entry.setId)
      || previous >= entry.titleId
    ) {
      throw new Error("titles must have unique sorted title and set IDs");
    }
    titleIds.add(entry.titleId);
    setIds.add(entry.setId);
    previous = entry.titleId;
  }
  const parsed = freeze(
    structuredClone(value) as unknown as ArcadeSetPolicy,
  );
  policyAuthority.add(parsed);
  return parsed;
}

export function parseArcadeSetPolicyJson(
  bytes: Uint8Array,
): ArcadeSetPolicy {
  return parseArcadeSetPolicy(canonical(bytes, "arcade set policy"));
}

export function parseArcadeSetInventory(value: unknown): ArcadeSetInventory {
  object(
    value,
    [
      "schemaVersion",
      "generation",
      "coreId",
      "coreVersion",
      "setVersion",
      "entries",
    ],
    "arcade set inventory",
  );
  if (value.schemaVersion !== ARCADE_SET_SCHEMA_VERSION) {
    throw new Error("unsupported arcade set inventory version");
  }
  integer(value.generation, "generation", false);
  id(value.coreId, "coreId");
  text(value.coreVersion, "coreVersion");
  text(value.setVersion, "setVersion");
  if (
    !Array.isArray(value.entries)
    || value.entries.length > ARCADE_SET_MAX_INVENTORY
  ) {
    throw new Error("entries must be a bounded array");
  }
  let previous = "";
  for (const [index, entry] of value.entries.entries()) {
    object(
      entry,
      ["setId", "sha256", "scanStatus"],
      `entries[${index}]`,
    );
    id(entry.setId, `entries[${index}].setId`);
    hash(entry.sha256, `entries[${index}].sha256`);
    if (
      entry.scanStatus !== "clean"
      && entry.scanStatus !== "blocked"
      && entry.scanStatus !== "unavailable"
    ) {
      throw new Error("scanStatus is invalid");
    }
    if (previous >= entry.setId) {
      throw new Error("inventory entries must have unique sorted set IDs");
    }
    previous = entry.setId;
  }
  const parsed = freeze(
    structuredClone(value) as unknown as ArcadeSetInventory,
  );
  inventoryAuthority.add(parsed);
  return parsed;
}

export function parseArcadeSetInventoryJson(
  bytes: Uint8Array,
): ArcadeSetInventory {
  return parseArcadeSetInventory(canonical(bytes, "arcade set inventory"));
}

export function evaluateArcadeSetReadiness(
  policy: ArcadeSetPolicy,
  inventory: ArcadeSetInventory,
  titleId: string,
): ArcadeSetReadiness {
  if (!policyAuthority.has(policy) || !inventoryAuthority.has(inventory)) {
    throw new Error("arcade policy and inventory must be parsed authorities");
  }
  if (
    policy.coreId !== inventory.coreId
    || policy.coreVersion !== inventory.coreVersion
    || policy.setVersion !== inventory.setVersion
  ) {
    throw new Error("arcade policy and inventory version scope mismatch");
  }
  const title = policy.titles.find((entry) => entry.titleId === titleId);
  if (!title) throw new Error("title is absent from the arcade set policy");
  const expected = [
    ...(title.relationship === "clone"
      ? [{ setId: title.parentSetId!, sha256: title.parentSha256! }]
      : []),
    { setId: title.setId, sha256: title.setSha256 },
  ];
  const installed = new Map(inventory.entries.map((entry) => [entry.setId, entry]));
  const missingSetIds: string[] = [];
  const mismatchedSetIds: string[] = [];
  const unsafeSetIds: string[] = [];
  for (const requirement of expected) {
    const entry = installed.get(requirement.setId);
    if (!entry) missingSetIds.push(requirement.setId);
    else if (entry.sha256 !== requirement.sha256) {
      mismatchedSetIds.push(requirement.setId);
    } else if (entry.scanStatus !== "clean") unsafeSetIds.push(requirement.setId);
  }
  const blocked =
    missingSetIds.length + mismatchedSetIds.length + unsafeSetIds.length > 0;
  const userActionCodes: ArcadeSetReadiness["userActionCodes"] = freeze([
    ...(blocked ? ["open-reviewed-arcade-set-help" as const] : []),
    ...(missingSetIds.length + mismatchedSetIds.length > 0
      ? ["select-local-arcade-set-files" as const]
      : []),
    ...(unsafeSetIds.length > 0 ? ["retry-arcade-set-scan" as const] : []),
  ]);
  const readiness = freeze({
    status: blocked ? "blocked" : "ready",
    diagnosticCode: blocked ? "arcade-set-blocked" : "arcade-set-ready",
    policyId: policy.policyId,
    policyRevision: policy.revision,
    titleId,
    coreId: policy.coreId,
    coreVersion: policy.coreVersion,
    setVersion: policy.setVersion,
    inventoryGeneration: inventory.generation,
    missingSetIds,
    mismatchedSetIds,
    unsafeSetIds,
    userActionCodes,
  } satisfies ArcadeSetReadiness);
  readinessAuthority.set(readiness, { policy, inventory });
  return readiness;
}

export function authorizeArcadeSetLaunch(
  readiness: ArcadeSetReadiness,
  policy: ArcadeSetPolicy,
  inventory: ArcadeSetInventory,
): ArcadeSetLaunchBinding {
  const authority = readinessAuthority.get(readiness);
  if (
    !authority
    || authority.policy !== policy
    || authority.inventory !== inventory
  ) {
    throw new Error("arcade readiness must be the exact current authority");
  }
  if (readiness.status !== "ready") throw new Error("arcade set is not ready");
  const title = policy.titles.find(({ titleId }) => titleId === readiness.titleId)!;
  return freeze({
    policyId: policy.policyId,
    policyRevision: policy.revision,
    titleId: title.titleId,
    coreId: policy.coreId,
    coreVersion: policy.coreVersion,
    setVersion: policy.setVersion,
    inventoryGeneration: inventory.generation,
    requiredSets: [
      ...(title.relationship === "clone"
        ? [{ setId: title.parentSetId!, sha256: title.parentSha256! }]
        : []),
      { setId: title.setId, sha256: title.setSha256 },
    ],
  });
}
