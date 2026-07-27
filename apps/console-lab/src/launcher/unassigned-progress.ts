import {
  hasUnsafeVisibleTextCharacter,
  unicodeScalarLength,
} from "../visible-text";

export const UNASSIGNED_PROGRESS_MAX_ENTRIES = 64;
export const UNASSIGNED_PROGRESS_MAX_BYTES = 64 * 1024 * 1024 * 1024;

export type UnassignedRuntime = "remote-web" | "local-web" | "native" | "libretro";
export type UnassignedCompatibility = "ready" | "update-required" | "package-unavailable";
export type HostedProgressBoundary = "none" | "hosted-service-separate";
export type ClaimConflictResolution = "replace" | "keep-both";

export interface UnassignedProgressEntry {
  id: string;
  ownerId: string;
  gameId: string;
  gameTitle: string;
  slotId: string;
  slotLabel: string;
  progressSummary: string;
  runtime: UnassignedRuntime;
  packageVersion: string;
  requiredVersion: string | null;
  compatibility: UnassignedCompatibility;
  hostedProgressBoundary: HostedProgressBoundary;
  supportsAdditionalSlot: boolean;
  bytesUsed: number;
  lastPlayedAt: string;
}

export interface ProfileSaveSlot {
  profileId: string;
  gameId: string;
  slotId: string;
}

export interface UnassignedProgressSnapshot {
  revision: number;
  entries: readonly Readonly<UnassignedProgressEntry>[];
}

export interface UnassignedPlayPlan {
  kind: "play";
  expectedRevision: number;
  entryId: string;
  gameId: string;
  slotId: string;
  runtime: UnassignedRuntime;
  owner: Readonly<{ kind: "unassigned"; id: string }>;
  hostedProgressBoundary: HostedProgressBoundary;
}

export interface UnassignedClaimPlan {
  kind: "claim";
  expectedRevision: number;
  entryId: string;
  targetProfileId: string;
  conflictResolution: ClaimConflictResolution | null;
  destination: "same-slot" | "additional-slot";
}

export interface UnassignedDeletePlan {
  kind: "delete";
  expectedRevision: number;
  entryId: string;
  gameId: string;
  slotId: string;
}

export type UnassignedMutationPlan = UnassignedClaimPlan | UnassignedDeletePlan;

export interface ClaimInspection {
  conflict: boolean;
  keepBothAvailable: boolean;
}

const entryKeys = [
  "bytesUsed",
  "compatibility",
  "gameId",
  "gameTitle",
  "hostedProgressBoundary",
  "id",
  "lastPlayedAt",
  "ownerId",
  "packageVersion",
  "progressSummary",
  "requiredVersion",
  "runtime",
  "slotId",
  "slotLabel",
  "supportsAdditionalSlot",
] as const;
const claimPlanKeys = [
  "conflictResolution",
  "destination",
  "entryId",
  "expectedRevision",
  "kind",
  "targetProfileId",
] as const;
const deletePlanKeys = [
  "entryId",
  "expectedRevision",
  "gameId",
  "kind",
  "slotId",
] as const;

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ownerPattern = /^[0-9a-f]{32}$/;
const versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const runtimes = new Set<UnassignedRuntime>([
  "remote-web",
  "local-web",
  "native",
  "libretro",
]);
const compatibilities = new Set<UnassignedCompatibility>([
  "ready",
  "update-required",
  "package-unavailable",
]);
const hostedBoundaries = new Set<HostedProgressBoundary>([
  "none",
  "hosted-service-separate",
]);

export class UnassignedProgressError extends Error {}

export class UnassignedProgressConflictError extends UnassignedProgressError {
  readonly keepBothAvailable: boolean;

  constructor(keepBothAvailable: boolean) {
    super("claim conflict requires an explicit resolution");
    this.keepBothAvailable = keepBothAvailable;
  }
}

export class UnassignedProgressController {
  #revision = 0;
  readonly #entries = new Map<string, UnassignedProgressEntry>();
  readonly #profileSlots = new Set<string>();
  readonly #issuedMutationPlans =
    new WeakSet<UnassignedMutationPlan>();

  constructor(
    entries: readonly UnassignedProgressEntry[],
    profileSlots: readonly ProfileSaveSlot[] = [],
  ) {
    if (entries.length > UNASSIGNED_PROGRESS_MAX_ENTRIES) {
      throw new UnassignedProgressError("too many unassigned progress entries");
    }
    const owners = new Set<string>();
    for (const source of entries) {
      const entry = validateEntry(source);
      if (this.#entries.has(entry.id)) {
        throw new UnassignedProgressError("duplicate unassigned progress entry");
      }
      if (owners.has(entry.ownerId)) {
        throw new UnassignedProgressError("duplicate unassigned owner");
      }
      owners.add(entry.ownerId);
      this.#entries.set(entry.id, entry);
    }
    for (const slot of profileSlots) {
      validateId(slot.profileId, "profile ID");
      validateId(slot.gameId, "game ID");
      validateId(slot.slotId, "slot ID");
      const key = profileSlotKey(slot.profileId, slot.gameId, slot.slotId);
      if (this.#profileSlots.has(key)) {
        throw new UnassignedProgressError("duplicate profile save slot");
      }
      this.#profileSlots.add(key);
    }
  }

  snapshot(): UnassignedProgressSnapshot {
    return Object.freeze({
      revision: this.#revision,
      entries: Object.freeze(
        [...this.#entries.values()].map((entry) => Object.freeze({ ...entry })),
      ),
    });
  }

  inspectClaim(entryId: string, targetProfileId: string): ClaimInspection {
    const entry = this.#requireEntry(entryId);
    validateId(targetProfileId, "profile ID");
    const conflict = this.#profileSlots.has(
      profileSlotKey(targetProfileId, entry.gameId, entry.slotId),
    );
    return Object.freeze({
      conflict,
      keepBothAvailable: conflict && entry.supportsAdditionalSlot,
    });
  }

  planPlay(entryId: string): UnassignedPlayPlan {
    const entry = this.#requireEntry(entryId);
    if (entry.compatibility !== "ready") {
      throw new UnassignedProgressError("entry is not currently playable");
    }
    return Object.freeze({
      kind: "play",
      expectedRevision: this.#revision,
      entryId: entry.id,
      gameId: entry.gameId,
      slotId: entry.slotId,
      runtime: entry.runtime,
      owner: Object.freeze({ kind: "unassigned", id: entry.ownerId }),
      hostedProgressBoundary: entry.hostedProgressBoundary,
    });
  }

  planClaim(
    entryId: string,
    targetProfileId: string,
    conflictResolution: ClaimConflictResolution | null = null,
  ): UnassignedClaimPlan {
    const entry = this.#requireEntry(entryId);
    const inspection = this.inspectClaim(entryId, targetProfileId);
    if (inspection.conflict && conflictResolution === null) {
      throw new UnassignedProgressConflictError(inspection.keepBothAvailable);
    }
    if (!inspection.conflict && conflictResolution !== null) {
      throw new UnassignedProgressError("claim resolution supplied without a conflict");
    }
    if (conflictResolution === "keep-both" && !inspection.keepBothAvailable) {
      throw new UnassignedProgressError("this game does not support an additional slot");
    }
    const plan = Object.freeze({
      kind: "claim",
      expectedRevision: this.#revision,
      entryId: entry.id,
      targetProfileId,
      conflictResolution,
      destination:
        conflictResolution === "keep-both" ? "additional-slot" : "same-slot",
    });
    this.#issuedMutationPlans.add(plan);
    return plan;
  }

  planDelete(entryId: string): UnassignedDeletePlan {
    const entry = this.#requireEntry(entryId);
    const plan = Object.freeze({
      kind: "delete",
      expectedRevision: this.#revision,
      entryId: entry.id,
      gameId: entry.gameId,
      slotId: entry.slotId,
    });
    this.#issuedMutationPlans.add(plan);
    return plan;
  }

  commit(plan: UnassignedMutationPlan): UnassignedProgressSnapshot {
    validateMutationPlan(plan);
    if (plan.expectedRevision !== this.#revision) {
      throw new UnassignedProgressError("confirmation is stale");
    }
    if (!this.#issuedMutationPlans.has(plan)) {
      throw new UnassignedProgressError(
        "mutation plan was not issued by this controller",
      );
    }
    const entry = this.#requireEntry(plan.entryId);
    if (plan.kind === "claim") {
      const inspection = this.inspectClaim(entry.id, plan.targetProfileId);
      if (inspection.conflict && plan.conflictResolution === null) {
        throw new UnassignedProgressConflictError(inspection.keepBothAvailable);
      }
      if (!inspection.conflict && plan.conflictResolution !== null) {
        throw new UnassignedProgressError("claim conflict changed before commit");
      }
      if (plan.conflictResolution === "keep-both" && !inspection.keepBothAvailable) {
        throw new UnassignedProgressError("additional-slot resolution is unavailable");
      }
      const expectedDestination =
        plan.conflictResolution === "keep-both" ? "additional-slot" : "same-slot";
      if (plan.destination !== expectedDestination) {
        throw new UnassignedProgressError("claim destination does not match its resolution");
      }
      if (plan.conflictResolution !== "keep-both") {
        this.#profileSlots.add(
          profileSlotKey(plan.targetProfileId, entry.gameId, entry.slotId),
        );
      }
    } else if (plan.gameId !== entry.gameId || plan.slotId !== entry.slotId) {
      throw new UnassignedProgressError("delete scope does not match the entry");
    }
    this.#entries.delete(entry.id);
    this.#revision += 1;
    return this.snapshot();
  }

  #requireEntry(entryId: string): UnassignedProgressEntry {
    validateId(entryId, "entry ID");
    const entry = this.#entries.get(entryId);
    if (!entry) throw new UnassignedProgressError("unassigned progress entry not found");
    return entry;
  }
}

export const UNASSIGNED_PROGRESS_DEMO_ENTRIES = Object.freeze([
  Object.freeze({
    id: "obstacle-main",
    ownerId: "0123456789abcdef0123456789abcdef",
    gameId: "obstacle",
    gameTitle: "Obstacle",
    slotId: "main-slot",
    slotLabel: "Checkpoint 12",
    progressSummary: "18,450 points · 42% complete",
    runtime: "local-web",
    packageVersion: "0.3.0",
    requiredVersion: null,
    compatibility: "ready",
    hostedProgressBoundary: "none",
    supportsAdditionalSlot: false,
    bytesUsed: 184_320,
    lastPlayedAt: "2026-07-22T19:14:00.000Z",
  }),
  Object.freeze({
    id: "godot-motion-main",
    ownerId: "11111111111111111111111111111111",
    gameId: "godot-motion-game",
    gameTitle: "Godot Motion Game",
    slotId: "campaign",
    slotLabel: "Campaign · Stage 4",
    progressSummary: "11 challenges cleared",
    runtime: "native",
    packageVersion: "0.1.0",
    requiredVersion: "0.2.0",
    compatibility: "update-required",
    hostedProgressBoundary: "none",
    supportsAdditionalSlot: true,
    bytesUsed: 1_228_800,
    lastPlayedAt: "2026-07-18T17:42:00.000Z",
  }),
  Object.freeze({
    id: "retro-2048-main",
    ownerId: "22222222222222222222222222222222",
    gameId: "retro-2048",
    gameTitle: "2048",
    slotId: "main-slot",
    slotLabel: "Local run",
    progressSummary: "Best tile 1024 · score 16,384",
    runtime: "libretro",
    packageVersion: "1.0.0",
    requiredVersion: null,
    compatibility: "package-unavailable",
    hostedProgressBoundary: "none",
    supportsAdditionalSlot: false,
    bytesUsed: 65_536,
    lastPlayedAt: "2026-07-12T20:03:00.000Z",
  }),
  Object.freeze({
    id: "vibebots-local",
    ownerId: "33333333333333333333333333333333",
    gameId: "vibebots",
    gameTitle: "VibeBots",
    slotId: "local-settings",
    slotLabel: "Console-local progress",
    progressSummary: "Local tutorial and display state",
    runtime: "remote-web",
    packageVersion: "1.0.0",
    requiredVersion: null,
    compatibility: "ready",
    hostedProgressBoundary: "hosted-service-separate",
    supportsAdditionalSlot: true,
    bytesUsed: 98_304,
    lastPlayedAt: "2026-07-09T18:31:00.000Z",
  }),
] satisfies readonly UnassignedProgressEntry[]);

function validateEntry(source: UnassignedProgressEntry): UnassignedProgressEntry {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new UnassignedProgressError("entry must be an object");
  }
  const keys = Object.keys(source).sort();
  const expectedKeys = [...entryKeys].sort();
  if (
    keys.length !== expectedKeys.length
    || !expectedKeys.every((key, index) => keys[index] === key)
  ) {
    throw new UnassignedProgressError("entry must use the closed schema");
  }
  validateId(source.id, "entry ID");
  if (!ownerPattern.test(source.ownerId)) {
    throw new UnassignedProgressError("invalid opaque owner ID");
  }
  validateId(source.gameId, "game ID");
  validateId(source.slotId, "slot ID");
  validateText(source.gameTitle, 48, "game title");
  validateText(source.slotLabel, 48, "slot label");
  validateText(source.progressSummary, 96, "progress summary");
  if (!runtimes.has(source.runtime)) {
    throw new UnassignedProgressError("invalid runtime");
  }
  if (!versionPattern.test(source.packageVersion)) {
    throw new UnassignedProgressError("invalid package version");
  }
  if (
    source.requiredVersion !== null
    && !versionPattern.test(source.requiredVersion)
  ) {
    throw new UnassignedProgressError("invalid required package version");
  }
  if (!compatibilities.has(source.compatibility)) {
    throw new UnassignedProgressError("invalid compatibility");
  }
  if (!hostedBoundaries.has(source.hostedProgressBoundary)) {
    throw new UnassignedProgressError("invalid hosted progress boundary");
  }
  if (
    source.runtime === "remote-web"
    && source.hostedProgressBoundary !== "hosted-service-separate"
  ) {
    throw new UnassignedProgressError("remote-web entries require the hosted boundary");
  }
  if (
    source.runtime !== "remote-web"
    && source.hostedProgressBoundary !== "none"
  ) {
    throw new UnassignedProgressError("local entries cannot claim a hosted boundary");
  }
  if (typeof source.supportsAdditionalSlot !== "boolean") {
    throw new UnassignedProgressError("invalid additional-slot capability");
  }
  if (
    !Number.isSafeInteger(source.bytesUsed)
    || source.bytesUsed < 0
    || source.bytesUsed > UNASSIGNED_PROGRESS_MAX_BYTES
  ) {
    throw new UnassignedProgressError("invalid byte count");
  }
  const timestamp = Date.parse(source.lastPlayedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== source.lastPlayedAt) {
    throw new UnassignedProgressError("invalid last-played timestamp");
  }
  return { ...source };
}

function validateMutationPlan(plan: UnassignedMutationPlan): void {
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) {
    throw new UnassignedProgressError("mutation plan must be an object");
  }
  if (!Number.isSafeInteger(plan.expectedRevision) || plan.expectedRevision < 0) {
    throw new UnassignedProgressError("invalid mutation-plan revision");
  }
  if (plan.kind === "claim") {
    validateExactKeys(plan, claimPlanKeys, "claim plan");
    validateId(plan.entryId, "entry ID");
    validateId(plan.targetProfileId, "profile ID");
    if (
      plan.conflictResolution !== null
      && plan.conflictResolution !== "replace"
      && plan.conflictResolution !== "keep-both"
    ) {
      throw new UnassignedProgressError("invalid claim conflict resolution");
    }
    if (plan.destination !== "same-slot" && plan.destination !== "additional-slot") {
      throw new UnassignedProgressError("invalid claim destination");
    }
    return;
  }
  if (plan.kind === "delete") {
    validateExactKeys(plan, deletePlanKeys, "delete plan");
    validateId(plan.entryId, "entry ID");
    validateId(plan.gameId, "game ID");
    validateId(plan.slotId, "slot ID");
    return;
  }
  throw new UnassignedProgressError("invalid mutation-plan kind");
}

function validateExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    keys.length !== sortedExpected.length
    || !sortedExpected.every((key, index) => keys[index] === key)
  ) {
    throw new UnassignedProgressError(`${label} must use the closed schema`);
  }
}

function validateId(value: string, label: string): void {
  if (typeof value !== "string" || value.length > 64 || !idPattern.test(value)) {
    throw new UnassignedProgressError(`invalid ${label}`);
  }
}

function validateText(value: string, maximum: number, label: string): void {
  if (
    typeof value !== "string"
    || unicodeScalarLength(value) === 0
    || unicodeScalarLength(value) > maximum
    || hasUnsafeVisibleTextCharacter(value)
  ) {
    throw new UnassignedProgressError(`invalid ${label}`);
  }
}

function profileSlotKey(profileId: string, gameId: string, slotId: string): string {
  return `${profileId}\u0000${gameId}\u0000${slotId}`;
}
