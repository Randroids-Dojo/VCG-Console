import { AcceptedPortraitCollection } from "./portrait-capture";
import {
  AcceptedCalibrationResultCollection,
  type CalibrationReadyResult,
} from "./calibration-rehearsal";
import {
  hasUnsafeVisibleTextCharacter,
  unicodeScalarLength,
} from "../visible-text";

export const PROFILE_MANAGEMENT_MAX_PROFILES = 64;
export const PROFILE_MANAGEMENT_MAX_PROGRESS_RECORDS = 256;
export const PROFILE_MANAGEMENT_MAX_UNLINK_QUALIFICATIONS = 256;
export const PROFILE_MANAGEMENT_CONFIRMATION_DELAY_MS = 1_500;
export const PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS = 30_000;

export type ProfileManagementRuntime =
  | "remote-web"
  | "local-web"
  | "native"
  | "libretro";
export type ProfileManagementDestructiveOperation =
  | "recalibrate-profile"
  | "reset-profile"
  | "delete-profile";
export type ProfileManagementOperation =
  | "create-profile"
  | "rename-profile"
  | "apply-calibration"
  | ProfileManagementDestructiveOperation;

export interface ManagedProfileSeed {
  id: string;
  name: string;
  detail: string;
  calibrationRevision: number | null;
  bodyProfilePresent: boolean;
}

export interface ManagedProgressSeed {
  id: string;
  profileId: string | null;
  unassignedOwnerId: string;
  gameId: string;
  gameTitle: string;
  slotId: string;
  runtime: ProfileManagementRuntime;
  hostedServiceSeparate: boolean;
}

export interface QualifiedProgressUnlink {
  id: string;
  progressId: string;
  profileId: string;
  gameId: string;
  slotId: string;
  runtime: ProfileManagementRuntime;
  hostedServiceSeparate: boolean;
  sanitizerId: string;
  sanitizerRevision: number;
}

export interface ProfileDeletionBlocker {
  progressId: string;
  gameId: string;
  gameTitle: string;
  slotId: string;
  runtime: ProfileManagementRuntime;
}

export interface ManagedProfileSummary {
  id: string;
  name: string;
  detail: string;
  calibrationRevision: number | null;
  bodyProfilePresent: boolean;
  portraitPresent: boolean;
  linkedLocalProgressCount: number;
  hostedServiceCount: number;
}

export interface ProfileManagementSnapshot {
  revision: number;
  profiles: readonly Readonly<ManagedProfileSummary>[];
  unassignedLocalProgressCount: number;
}

export interface CreateProfilePlan {
  kind: "create-profile";
  expectedRevision: number;
  profileId: string;
  name: string;
  detail: "Local player";
}

export interface RenameProfilePlan {
  kind: "rename-profile";
  expectedRevision: number;
  profileId: string;
  expectedName: string;
  name: string;
}

export type SyntheticCalibrationResultRef = CalibrationReadyResult;

export interface ApplyCalibrationPlan {
  kind: "apply-calibration";
  expectedRevision: number;
  profileId: string;
  expectedCalibrationRevision: number | null;
  resultId: string;
  resultSessionId: number;
  resultAttempt: number;
  limited: boolean;
}

export interface DestructiveProfilePlan {
  kind: ProfileManagementDestructiveOperation;
  expectedRevision: number;
  profileId: string;
  expectedName: string;
  expectedPortraitRenderHandle: string | null;
  expectedCalibrationRevision: number | null;
  expectedBodyProfilePresent: boolean;
  expectedProgressIds: readonly string[];
  expectedUnlinkQualificationIds: readonly string[];
  expectedPermanentDeleteProgressIds: readonly string[];
  hostedServiceGameIds: readonly string[];
  confirmAfterMs: number;
  expiresAtMs: number;
}

export type ProfileManagementPlan =
  | CreateProfilePlan
  | RenameProfilePlan
  | ApplyCalibrationPlan
  | DestructiveProfilePlan;

export interface ProfileManagementDisposition {
  operation: ProfileManagementOperation;
  profileId: string;
  removedPortraitRenderHandle: string | null;
  calibrationCleared: boolean;
  bodyProfileRemoved: boolean;
  unassignedProgressCount: number;
  permanentlyDeletedProgressCount: number;
  preservedLinkedProgressCount: number;
  hostedServicesUnaffected: number;
}

export interface ProfileManagementCommitResult {
  disposition: Readonly<ProfileManagementDisposition>;
  snapshot: ProfileManagementSnapshot;
}

interface ManagedProfileRecord extends ManagedProfileSeed {}

interface ManagedProgressRecord extends ManagedProgressSeed {}

const profileSeedKeys = [
  "bodyProfilePresent",
  "calibrationRevision",
  "detail",
  "id",
  "name",
] as const;
const progressSeedKeys = [
  "gameId",
  "gameTitle",
  "hostedServiceSeparate",
  "id",
  "profileId",
  "runtime",
  "slotId",
  "unassignedOwnerId",
] as const;
const unlinkQualificationKeys = [
  "gameId",
  "hostedServiceSeparate",
  "id",
  "profileId",
  "progressId",
  "runtime",
  "sanitizerId",
  "sanitizerRevision",
  "slotId",
] as const;
const createPlanKeys = [
  "detail",
  "expectedRevision",
  "kind",
  "name",
  "profileId",
] as const;
const renamePlanKeys = [
  "expectedName",
  "expectedRevision",
  "kind",
  "name",
  "profileId",
] as const;
const applyCalibrationPlanKeys = [
  "expectedCalibrationRevision",
  "expectedRevision",
  "kind",
  "limited",
  "profileId",
  "resultAttempt",
  "resultId",
  "resultSessionId",
] as const;
const destructivePlanKeys = [
  "confirmAfterMs",
  "expectedBodyProfilePresent",
  "expectedCalibrationRevision",
  "expectedName",
  "expectedPermanentDeleteProgressIds",
  "expectedPortraitRenderHandle",
  "expectedProgressIds",
  "expectedRevision",
  "expectedUnlinkQualificationIds",
  "expiresAtMs",
  "hostedServiceGameIds",
  "kind",
  "profileId",
] as const;

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ownerPattern = /^[0-9a-f]{32}$/;
const calibrationResultPattern =
  /^calibration-fixture-([1-9][0-9]*)-([1-9][0-9]*)$/;
const runtimes = new Set<ProfileManagementRuntime>([
  "remote-web",
  "local-web",
  "native",
  "libretro",
]);
const destructiveOperations = new Set<ProfileManagementDestructiveOperation>([
  "recalibrate-profile",
  "reset-profile",
  "delete-profile",
]);

export class ProfileManagementError extends Error {}

export class QualifiedProgressUnlinkCollection {
  readonly #qualifications =
    new Map<string, Readonly<QualifiedProgressUnlink>>();
  readonly #progressIds = new Set<string>();

  constructor(
    qualifications: readonly QualifiedProgressUnlink[] = [],
  ) {
    if (
      qualifications.length
      > PROFILE_MANAGEMENT_MAX_UNLINK_QUALIFICATIONS
    ) {
      throw new ProfileManagementError(
        "too many progress-unlink qualifications",
      );
    }
    for (const source of qualifications) {
      const qualification = validateUnlinkQualification(source);
      if (this.#qualifications.has(qualification.id)) {
        throw new ProfileManagementError(
          "duplicate progress-unlink qualification",
        );
      }
      if (this.#progressIds.has(qualification.progressId)) {
        throw new ProfileManagementError(
          "progress has multiple unlink qualifications",
        );
      }
      this.#qualifications.set(
        qualification.id,
        Object.freeze(qualification),
      );
      this.#progressIds.add(qualification.progressId);
    }
  }

  qualificationFor(
    progress: ManagedProgressSeed,
  ): Readonly<QualifiedProgressUnlink> | null {
    const qualification = [...this.#qualifications.values()].find(
      (candidate) =>
        candidate.progressId === progress.id
        && candidate.profileId === progress.profileId
        && candidate.gameId === progress.gameId
        && candidate.slotId === progress.slotId
        && candidate.runtime === progress.runtime
        && candidate.hostedServiceSeparate
          === progress.hostedServiceSeparate,
    );
    return qualification ?? null;
  }

  revokeExact(qualification: QualifiedProgressUnlink): boolean {
    let validated: QualifiedProgressUnlink;
    try {
      validated = validateUnlinkQualification(qualification);
    } catch {
      return false;
    }
    const current = this.#qualifications.get(validated.id);
    if (!current || !sameUnlinkQualification(current, validated)) {
      return false;
    }
    this.#qualifications.delete(validated.id);
    this.#progressIds.delete(validated.progressId);
    return true;
  }

  get size(): number {
    return this.#qualifications.size;
  }
}

export class ProfileManagementController {
  #revision = 0;
  #lastNowMs = 0;
  #nextProfileOrdinal = 3;
  #nextCalibrationRevision = 1;
  readonly #profiles = new Map<string, ManagedProfileRecord>();
  readonly #progress = new Map<string, ManagedProgressRecord>();
  readonly #portraits: AcceptedPortraitCollection;
  readonly #calibrationResults: AcceptedCalibrationResultCollection;
  readonly #unlinkQualifications: QualifiedProgressUnlinkCollection;
  readonly #issuedPlans = new WeakSet<ProfileManagementPlan>();

  constructor(
    profiles: readonly ManagedProfileSeed[],
    progress: readonly ManagedProgressSeed[],
    portraits = new AcceptedPortraitCollection(),
    calibrationResults = new AcceptedCalibrationResultCollection(),
    unlinkQualifications = new QualifiedProgressUnlinkCollection(),
  ) {
    if (profiles.length > PROFILE_MANAGEMENT_MAX_PROFILES) {
      throw new ProfileManagementError("too many local profiles");
    }
    if (progress.length > PROFILE_MANAGEMENT_MAX_PROGRESS_RECORDS) {
      throw new ProfileManagementError("too many profile progress records");
    }
    for (const source of profiles) {
      const profile = validateProfileSeed(source);
      if (this.#profiles.has(profile.id)) {
        throw new ProfileManagementError("duplicate local profile");
      }
      this.#profiles.set(profile.id, profile);
      if (
        profile.calibrationRevision !== null
        && profile.calibrationRevision >= this.#nextCalibrationRevision
      ) {
        this.#nextCalibrationRevision = profile.calibrationRevision + 1;
      }
    }
    const owners = new Set<string>();
    for (const source of progress) {
      const record = validateProgressSeed(source);
      if (this.#progress.has(record.id)) {
        throw new ProfileManagementError("duplicate profile progress record");
      }
      if (owners.has(record.unassignedOwnerId)) {
        throw new ProfileManagementError("duplicate unassigned progress owner");
      }
      if (
        record.profileId !== null
        && !this.#profiles.has(record.profileId)
      ) {
        throw new ProfileManagementError(
          "profile progress references an unknown profile",
        );
      }
      owners.add(record.unassignedOwnerId);
      this.#progress.set(record.id, record);
    }
    this.#portraits = portraits;
    this.#calibrationResults = calibrationResults;
    this.#unlinkQualifications = unlinkQualifications;
  }

  snapshot(): ProfileManagementSnapshot {
    return Object.freeze({
      revision: this.#revision,
      profiles: Object.freeze(
        [...this.#profiles.values()].map((profile) => {
          const linked = this.#linkedProgress(profile.id);
          return Object.freeze({
            ...profile,
            portraitPresent:
              this.#portraits.portraitFor(profile.id) !== null,
            linkedLocalProgressCount: linked.length,
            hostedServiceCount: linked.filter(
              (record) => record.hostedServiceSeparate,
            ).length,
          });
        }),
      ),
      unassignedLocalProgressCount: [...this.#progress.values()].filter(
        (record) => record.profileId === null,
      ).length,
    });
  }

  deletionBlockers(
    profileId: string,
  ): readonly Readonly<ProfileDeletionBlocker>[] {
    const profile = this.#requireProfile(profileId);
    return Object.freeze(
      this.#unlinkBlockers(this.#linkedProgress(profile.id)).map(
        (record) => Object.freeze({
          progressId: record.id,
          gameId: record.gameId,
          gameTitle: record.gameTitle,
          slotId: record.slotId,
          runtime: record.runtime,
        }),
      ),
    );
  }

  planCreate(name: string): CreateProfilePlan {
    const normalizedName = validateName(name);
    if (this.#profiles.size >= PROFILE_MANAGEMENT_MAX_PROFILES) {
      throw new ProfileManagementError("local profile limit reached");
    }
    let profileId: string;
    do {
      if (this.#nextProfileOrdinal > Number.MAX_SAFE_INTEGER) {
        throw new ProfileManagementError("profile identifier space exhausted");
      }
      profileId = `profile-local-${this.#nextProfileOrdinal++}`;
    } while (this.#profiles.has(profileId));
    const plan = Object.freeze({
      kind: "create-profile",
      expectedRevision: this.#revision,
      profileId,
      name: normalizedName,
      detail: "Local player",
    });
    this.#issuedPlans.add(plan);
    return plan;
  }

  planRename(profileId: string, name: string): RenameProfilePlan {
    const profile = this.#requireProfile(profileId);
    const plan = Object.freeze({
      kind: "rename-profile",
      expectedRevision: this.#revision,
      profileId: profile.id,
      expectedName: profile.name,
      name: validateName(name),
    });
    this.#issuedPlans.add(plan);
    return plan;
  }

  planApplyCalibration(
    result: SyntheticCalibrationResultRef,
    nowMs: number,
  ): ApplyCalibrationPlan {
    this.#observeTime(nowMs);
    validateCalibrationResult(result);
    if (!this.#calibrationResults.hasExact(result, nowMs)) {
      throw new ProfileManagementError(
        "calibration result was not issued for this exact profile",
      );
    }
    const profile = this.#requireProfile(result.profileId);
    const plan = Object.freeze({
      kind: "apply-calibration",
      expectedRevision: this.#revision,
      profileId: profile.id,
      expectedCalibrationRevision: profile.calibrationRevision,
      resultId: result.id,
      resultSessionId: result.sessionId,
      resultAttempt: result.attempt,
      limited: result.limited,
    });
    this.#issuedPlans.add(plan);
    return plan;
  }

  planDestructive(
    kind: ProfileManagementDestructiveOperation,
    profileId: string,
    nowMs: number,
    permanentlyDeleteProgressIds: readonly string[] = [],
  ): DestructiveProfilePlan {
    this.#observeTime(nowMs);
    if (!destructiveOperations.has(kind)) {
      throw new ProfileManagementError("invalid profile operation");
    }
    if (!Array.isArray(permanentlyDeleteProgressIds)) {
      throw new ProfileManagementError(
        "invalid permanent progress deletion scope",
      );
    }
    if (
      kind !== "delete-profile"
      && permanentlyDeleteProgressIds.length > 0
    ) {
      throw new ProfileManagementError(
        "only profile deletion can delete progress",
      );
    }
    const profile = this.#requireProfile(profileId);
    const linked = this.#linkedProgress(profile.id);
    const deletionScope =
      kind === "delete-profile"
        ? this.#resolveDeletionScope(
            linked,
            permanentlyDeleteProgressIds,
          )
        : {
            unlinkQualificationIds: [] as string[],
            permanentDeleteProgressIds: [] as string[],
          };
    if (
      nowMs
      > Number.MAX_SAFE_INTEGER
        - PROFILE_MANAGEMENT_CONFIRMATION_DELAY_MS
        - PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS
    ) {
      throw new ProfileManagementError(
        "profile confirmation window exceeds safe time",
      );
    }
    const confirmAfterMs =
      nowMs + PROFILE_MANAGEMENT_CONFIRMATION_DELAY_MS;
    const plan = Object.freeze({
      kind,
      expectedRevision: this.#revision,
      profileId: profile.id,
      expectedName: profile.name,
      expectedPortraitRenderHandle:
        this.#portraits.portraitFor(profile.id),
      expectedCalibrationRevision: profile.calibrationRevision,
      expectedBodyProfilePresent: profile.bodyProfilePresent,
      expectedProgressIds: Object.freeze(
        linked.map((record) => record.id).sort(),
      ),
      expectedUnlinkQualificationIds: Object.freeze(
        deletionScope.unlinkQualificationIds,
      ),
      expectedPermanentDeleteProgressIds: Object.freeze(
        deletionScope.permanentDeleteProgressIds,
      ),
      hostedServiceGameIds: Object.freeze(
        linked
          .filter((record) => record.hostedServiceSeparate)
          .map((record) => record.gameId)
          .sort(),
      ),
      confirmAfterMs,
      expiresAtMs:
        confirmAfterMs + PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS,
    });
    this.#issuedPlans.add(plan);
    return plan;
  }

  commit(
    plan: ProfileManagementPlan,
    nowMs: number,
  ): ProfileManagementCommitResult {
    this.#observeTime(nowMs);
    validatePlan(plan);
    if (plan.expectedRevision !== this.#revision) {
      throw new ProfileManagementError("profile confirmation is stale");
    }
    if (!this.#issuedPlans.has(plan)) {
      throw new ProfileManagementError(
        "profile plan was not issued by this controller",
      );
    }
    if (plan.kind === "create-profile") {
      return this.#commitCreate(plan);
    }
    if (plan.kind === "rename-profile") {
      return this.#commitRename(plan);
    }
    if (plan.kind === "apply-calibration") {
      return this.#commitApplyCalibration(plan, nowMs);
    }
    return this.#commitDestructive(plan, nowMs);
  }

  progressOwnerKind(
    progressId: string,
  ): Readonly<{ kind: "profile"; profileId: string }> | Readonly<{
    kind: "unassigned";
  }> {
    validateId(progressId, "progress ID");
    const record = this.#progress.get(progressId);
    if (!record) {
      throw new ProfileManagementError("profile progress record not found");
    }
    return record.profileId === null
      ? Object.freeze({ kind: "unassigned" as const })
      : Object.freeze({
          kind: "profile" as const,
          profileId: record.profileId,
        });
  }

  #commitCreate(plan: CreateProfilePlan): ProfileManagementCommitResult {
    if (this.#profiles.has(plan.profileId)) {
      throw new ProfileManagementError("profile identifier already exists");
    }
    if (this.#profiles.size >= PROFILE_MANAGEMENT_MAX_PROFILES) {
      throw new ProfileManagementError("local profile limit reached");
    }
    this.#profiles.set(plan.profileId, {
      id: plan.profileId,
      name: plan.name,
      detail: plan.detail,
      calibrationRevision: null,
      bodyProfilePresent: false,
    });
    this.#revision += 1;
    return this.#result(plan.kind, plan.profileId, {
      removedPortraitRenderHandle: null,
      calibrationCleared: false,
      bodyProfileRemoved: false,
      unassignedProgressCount: 0,
      permanentlyDeletedProgressCount: 0,
      preservedLinkedProgressCount: 0,
      hostedServicesUnaffected: 0,
    });
  }

  #commitRename(plan: RenameProfilePlan): ProfileManagementCommitResult {
    const profile = this.#requireProfile(plan.profileId);
    if (profile.name !== plan.expectedName) {
      throw new ProfileManagementError("profile name changed before commit");
    }
    profile.name = plan.name;
    this.#revision += 1;
    const linked = this.#linkedProgress(profile.id);
    return this.#result(plan.kind, plan.profileId, {
      removedPortraitRenderHandle: null,
      calibrationCleared: false,
      bodyProfileRemoved: false,
      unassignedProgressCount: 0,
      permanentlyDeletedProgressCount: 0,
      preservedLinkedProgressCount: linked.length,
      hostedServicesUnaffected: linked.filter(
        (record) => record.hostedServiceSeparate,
      ).length,
    });
  }

  #commitApplyCalibration(
    plan: ApplyCalibrationPlan,
    nowMs: number,
  ): ProfileManagementCommitResult {
    const profile = this.#requireProfile(plan.profileId);
    if (
      profile.calibrationRevision !== plan.expectedCalibrationRevision
    ) {
      throw new ProfileManagementError(
        "profile calibration changed before commit",
      );
    }
    if (this.#nextCalibrationRevision > Number.MAX_SAFE_INTEGER) {
      throw new ProfileManagementError(
        "calibration revision space exhausted",
      );
    }
    const result: CalibrationReadyResult = {
      id: plan.resultId,
      profileId: plan.profileId,
      sessionId: plan.resultSessionId,
      attempt: plan.resultAttempt,
      limited: plan.limited,
    };
    if (!this.#calibrationResults.consumeExact(result, nowMs)) {
      throw new ProfileManagementError(
        "calibration result is stale, changed, or already consumed",
      );
    }
    const bodyProfileRemoved = profile.bodyProfilePresent;
    profile.calibrationRevision = this.#nextCalibrationRevision++;
    profile.bodyProfilePresent = false;
    this.#revision += 1;
    const linked = this.#linkedProgress(profile.id);
    return this.#result(plan.kind, plan.profileId, {
      removedPortraitRenderHandle: null,
      calibrationCleared: false,
      bodyProfileRemoved,
      unassignedProgressCount: 0,
      permanentlyDeletedProgressCount: 0,
      preservedLinkedProgressCount: linked.length,
      hostedServicesUnaffected: linked.filter(
        (record) => record.hostedServiceSeparate,
      ).length,
    });
  }

  #commitDestructive(
    plan: DestructiveProfilePlan,
    nowMs: number,
  ): ProfileManagementCommitResult {
    if (nowMs < plan.confirmAfterMs) {
      throw new ProfileManagementError(
        "profile confirmation is not armed yet",
      );
    }
    if (nowMs > plan.expiresAtMs) {
      throw new ProfileManagementError("profile confirmation expired");
    }
    const profile = this.#requireProfile(plan.profileId);
    const linked = this.#linkedProgress(profile.id);
    const progressIds = linked.map((record) => record.id).sort();
    const hostedGameIds = linked
      .filter((record) => record.hostedServiceSeparate)
      .map((record) => record.gameId)
      .sort();
    const deletionScope =
      plan.kind === "delete-profile"
        ? this.#resolveDeletionScope(
            linked,
            plan.expectedPermanentDeleteProgressIds,
          )
        : {
            unlinkQualificationIds: [] as string[],
            permanentDeleteProgressIds: [] as string[],
          };
    if (
      profile.name !== plan.expectedName
      || profile.calibrationRevision !== plan.expectedCalibrationRevision
      || profile.bodyProfilePresent !== plan.expectedBodyProfilePresent
      || this.#portraits.portraitFor(profile.id)
        !== plan.expectedPortraitRenderHandle
      || !sameStrings(progressIds, plan.expectedProgressIds)
      || !sameStrings(
        deletionScope.unlinkQualificationIds,
        plan.expectedUnlinkQualificationIds,
      )
      || !sameStrings(
        deletionScope.permanentDeleteProgressIds,
        plan.expectedPermanentDeleteProgressIds,
      )
      || !sameStrings(hostedGameIds, plan.hostedServiceGameIds)
    ) {
      throw new ProfileManagementError(
        "profile scope changed before confirmation",
      );
    }

    const calibrationCleared = profile.calibrationRevision !== null;
    const bodyProfileRemoved = profile.bodyProfilePresent;
    let removedPortraitRenderHandle: string | null = null;
    let unassignedProgressCount = 0;
    let permanentlyDeletedProgressCount = 0;
    let preservedLinkedProgressCount = linked.length;

    if (plan.kind === "recalibrate-profile") {
      profile.calibrationRevision = null;
      profile.bodyProfilePresent = false;
    } else {
      removedPortraitRenderHandle = this.#portraits.removeExact(
        profile.id,
        plan.expectedPortraitRenderHandle,
      );
      profile.calibrationRevision = null;
      profile.bodyProfilePresent = false;
      if (plan.kind === "delete-profile") {
        const permanentDeleteIds = new Set(
          plan.expectedPermanentDeleteProgressIds,
        );
        for (const record of linked) {
          if (permanentDeleteIds.has(record.id)) {
            this.#progress.delete(record.id);
            permanentlyDeletedProgressCount += 1;
          } else {
            record.profileId = null;
            unassignedProgressCount += 1;
          }
        }
        preservedLinkedProgressCount = 0;
        this.#profiles.delete(profile.id);
      }
    }

    this.#revision += 1;
    return this.#result(plan.kind, plan.profileId, {
      removedPortraitRenderHandle,
      calibrationCleared,
      bodyProfileRemoved,
      unassignedProgressCount,
      permanentlyDeletedProgressCount,
      preservedLinkedProgressCount,
      hostedServicesUnaffected: hostedGameIds.length,
    });
  }

  #result(
    operation: ProfileManagementOperation,
    profileId: string,
    disposition: Omit<
      ProfileManagementDisposition,
      "operation" | "profileId"
    >,
  ): ProfileManagementCommitResult {
    return Object.freeze({
      disposition: Object.freeze({
        operation,
        profileId,
        ...disposition,
      }),
      snapshot: this.snapshot(),
    });
  }

  #requireProfile(profileId: string): ManagedProfileRecord {
    validateId(profileId, "profile ID");
    const profile = this.#profiles.get(profileId);
    if (!profile) throw new ProfileManagementError("local profile not found");
    return profile;
  }

  #linkedProgress(profileId: string): ManagedProgressRecord[] {
    return [...this.#progress.values()].filter(
      (record) => record.profileId === profileId,
    );
  }

  #unlinkBlockers(
    linked: readonly ManagedProgressRecord[],
  ): ManagedProgressRecord[] {
    return linked.filter(
      (record) =>
        this.#unlinkQualifications.qualificationFor(record) === null,
    );
  }

  #resolveDeletionScope(
    linked: readonly ManagedProgressRecord[],
    permanentlyDeleteProgressIds: readonly string[],
  ): {
    unlinkQualificationIds: string[];
    permanentDeleteProgressIds: string[];
  } {
    if (!Array.isArray(permanentlyDeleteProgressIds)) {
      throw new ProfileManagementError(
        "invalid permanent progress deletion scope",
      );
    }
    const permanentDeleteIds = [...permanentlyDeleteProgressIds].sort();
    validateIdArray(
      permanentDeleteIds,
      "permanent progress deletion scope",
    );
    const linkedIds = new Set(linked.map((record) => record.id));
    if (permanentDeleteIds.some((id) => !linkedIds.has(id))) {
      throw new ProfileManagementError(
        "permanent progress deletion is outside the profile scope",
      );
    }
    const permanentDeleteSet = new Set(permanentDeleteIds);
    const preserved = linked.filter(
      (record) => !permanentDeleteSet.has(record.id),
    );
    const blockers = this.#unlinkBlockers(preserved);
    if (blockers.length > 0) {
      const titles = [...new Set(
        blockers.map((record) => record.gameTitle),
      )].sort();
      const visible = titles.slice(0, 3);
      const remainder = titles.length - visible.length;
      throw new ProfileManagementError(
        `${blockers.length} linked progress item${
          blockers.length === 1 ? "" : "s"
        } cannot be safely unassigned until a sanitizer is qualified: ${
          visible.join(", ")
        }${remainder === 0 ? "" : ` and ${remainder} more`}`,
      );
    }
    return {
      unlinkQualificationIds: preserved
        .map((record) =>
          this.#unlinkQualifications.qualificationFor(record)!.id
        )
        .sort(),
      permanentDeleteProgressIds: permanentDeleteIds,
    };
  }

  #observeTime(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new ProfileManagementError(
        "time must be a non-negative safe integer",
      );
    }
    if (nowMs < this.#lastNowMs) {
      throw new ProfileManagementError(
        "profile-management clock moved backwards",
      );
    }
    this.#lastNowMs = nowMs;
  }
}

export const PROFILE_MANAGEMENT_DEMO_PROFILES = Object.freeze([
  Object.freeze({
    id: "profile-randy",
    name: "Randy",
    detail: "Local player",
    calibrationRevision: 7,
    bodyProfilePresent: true,
  }),
  Object.freeze({
    id: "profile-guest",
    name: "Guest",
    detail: "Local guest",
    calibrationRevision: null,
    bodyProfilePresent: false,
  }),
] satisfies readonly ManagedProfileSeed[]);

export const PROFILE_MANAGEMENT_DEMO_PROGRESS = Object.freeze([
  Object.freeze({
    id: "randy-obstacle-main",
    profileId: "profile-randy",
    unassignedOwnerId: "44444444444444444444444444444444",
    gameId: "obstacle",
    gameTitle: "Obstacle",
    slotId: "main-slot",
    runtime: "local-web",
    hostedServiceSeparate: false,
  }),
  Object.freeze({
    id: "randy-vibebots-local",
    profileId: "profile-randy",
    unassignedOwnerId: "55555555555555555555555555555555",
    gameId: "vibebots",
    gameTitle: "VibeBots",
    slotId: "local-settings",
    runtime: "remote-web",
    hostedServiceSeparate: true,
  }),
  Object.freeze({
    id: "guest-godot-campaign",
    profileId: "profile-guest",
    unassignedOwnerId: "66666666666666666666666666666666",
    gameId: "godot-motion-game",
    gameTitle: "Godot Motion Game",
    slotId: "campaign",
    runtime: "native",
    hostedServiceSeparate: false,
  }),
] satisfies readonly ManagedProgressSeed[]);

export const PROFILE_MANAGEMENT_DEMO_UNLINK_QUALIFICATIONS =
  Object.freeze([
    Object.freeze({
      id: "unlink-randy-obstacle-v1",
      progressId: "randy-obstacle-main",
      profileId: "profile-randy",
      gameId: "obstacle",
      slotId: "main-slot",
      runtime: "local-web",
      hostedServiceSeparate: false,
      sanitizerId: "sanitize-local-web-profile-v1",
      sanitizerRevision: 1,
    }),
    Object.freeze({
      id: "unlink-randy-vibebots-v1",
      progressId: "randy-vibebots-local",
      profileId: "profile-randy",
      gameId: "vibebots",
      slotId: "local-settings",
      runtime: "remote-web",
      hostedServiceSeparate: true,
      sanitizerId: "sanitize-remote-local-settings-v1",
      sanitizerRevision: 1,
    }),
  ] satisfies readonly QualifiedProgressUnlink[]);

function validateProfileSeed(source: ManagedProfileSeed): ManagedProfileRecord {
  validateExactKeys(source, profileSeedKeys, "profile seed");
  validateId(source.id, "profile ID");
  const name = validateName(source.name);
  validateText(source.detail, 32, "profile detail");
  if (
    source.calibrationRevision !== null
    && (
      !Number.isSafeInteger(source.calibrationRevision)
      || source.calibrationRevision <= 0
    )
  ) {
    throw new ProfileManagementError("invalid calibration revision");
  }
  if (typeof source.bodyProfilePresent !== "boolean") {
    throw new ProfileManagementError("invalid body-profile state");
  }
  return {
    id: source.id,
    name,
    detail: source.detail,
    calibrationRevision: source.calibrationRevision,
    bodyProfilePresent: source.bodyProfilePresent,
  };
}

function validateProgressSeed(
  source: ManagedProgressSeed,
): ManagedProgressRecord {
  validateExactKeys(source, progressSeedKeys, "profile progress seed");
  validateId(source.id, "progress ID");
  if (source.profileId !== null) validateId(source.profileId, "profile ID");
  if (!ownerPattern.test(source.unassignedOwnerId)) {
    throw new ProfileManagementError("invalid unassigned progress owner");
  }
  validateId(source.gameId, "game ID");
  validateText(source.gameTitle, 48, "game title");
  validateId(source.slotId, "slot ID");
  if (!runtimes.has(source.runtime)) {
    throw new ProfileManagementError("invalid progress runtime");
  }
  if (typeof source.hostedServiceSeparate !== "boolean") {
    throw new ProfileManagementError("invalid hosted-service boundary");
  }
  if (
    source.runtime === "remote-web"
    && !source.hostedServiceSeparate
  ) {
    throw new ProfileManagementError(
      "remote progress requires the hosted-service boundary",
    );
  }
  if (
    source.runtime !== "remote-web"
    && source.hostedServiceSeparate
  ) {
    throw new ProfileManagementError(
      "local progress cannot claim a hosted-service boundary",
    );
  }
  return { ...source };
}

function validateUnlinkQualification(
  source: QualifiedProgressUnlink,
): QualifiedProgressUnlink {
  validateExactKeys(
    source,
    unlinkQualificationKeys,
    "progress-unlink qualification",
  );
  validateId(source.id, "progress-unlink qualification ID");
  validateId(source.progressId, "progress ID");
  validateId(source.profileId, "profile ID");
  validateId(source.gameId, "game ID");
  validateId(source.slotId, "slot ID");
  if (!runtimes.has(source.runtime)) {
    throw new ProfileManagementError(
      "invalid progress-unlink qualification runtime",
    );
  }
  if (typeof source.hostedServiceSeparate !== "boolean") {
    throw new ProfileManagementError(
      "invalid progress-unlink hosted-service boundary",
    );
  }
  if (
    (source.runtime === "remote-web")
      !== source.hostedServiceSeparate
  ) {
    throw new ProfileManagementError(
      "progress-unlink runtime boundary mismatch",
    );
  }
  validateId(source.sanitizerId, "progress sanitizer ID");
  if (
    !Number.isSafeInteger(source.sanitizerRevision)
    || source.sanitizerRevision <= 0
  ) {
    throw new ProfileManagementError(
      "invalid progress sanitizer revision",
    );
  }
  return { ...source };
}

function validatePlan(plan: ProfileManagementPlan): void {
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) {
    throw new ProfileManagementError("profile plan must be an object");
  }
  if (
    !Number.isSafeInteger(plan.expectedRevision)
    || plan.expectedRevision < 0
  ) {
    throw new ProfileManagementError("invalid profile-plan revision");
  }
  if (plan.kind === "create-profile") {
    validateExactKeys(plan, createPlanKeys, "create plan");
    validateId(plan.profileId, "profile ID");
    validateName(plan.name);
    if (plan.detail !== "Local player") {
      throw new ProfileManagementError("invalid created profile detail");
    }
    return;
  }
  if (plan.kind === "rename-profile") {
    validateExactKeys(plan, renamePlanKeys, "rename plan");
    validateId(plan.profileId, "profile ID");
    validateName(plan.expectedName);
    validateName(plan.name);
    return;
  }
  if (plan.kind === "apply-calibration") {
    validateExactKeys(
      plan,
      applyCalibrationPlanKeys,
      "apply-calibration plan",
    );
    validateId(plan.profileId, "profile ID");
    if (
      plan.expectedCalibrationRevision !== null
      && (
        !Number.isSafeInteger(plan.expectedCalibrationRevision)
        || plan.expectedCalibrationRevision <= 0
      )
    ) {
      throw new ProfileManagementError("invalid prior calibration revision");
    }
    validateCalibrationResult({
      id: plan.resultId,
      profileId: plan.profileId,
      sessionId: plan.resultSessionId,
      attempt: plan.resultAttempt,
      limited: plan.limited,
    });
    return;
  }
  if (!destructiveOperations.has(plan.kind)) {
    throw new ProfileManagementError("invalid profile-plan kind");
  }
  validateExactKeys(plan, destructivePlanKeys, "destructive profile plan");
  validateId(plan.profileId, "profile ID");
  validateName(plan.expectedName);
  if (plan.expectedPortraitRenderHandle !== null) {
    if (
      typeof plan.expectedPortraitRenderHandle !== "string"
      || !/^portrait-fixture-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        plan.expectedPortraitRenderHandle,
      )
    ) {
      throw new ProfileManagementError("invalid portrait scope");
    }
  }
  if (
    plan.expectedCalibrationRevision !== null
    && (
      !Number.isSafeInteger(plan.expectedCalibrationRevision)
      || plan.expectedCalibrationRevision <= 0
    )
  ) {
    throw new ProfileManagementError("invalid calibration scope");
  }
  if (typeof plan.expectedBodyProfilePresent !== "boolean") {
    throw new ProfileManagementError("invalid body-profile scope");
  }
  validateIdArray(plan.expectedProgressIds, "progress scope");
  validateIdArray(
    plan.expectedUnlinkQualificationIds,
    "progress-unlink qualification scope",
  );
  validateIdArray(
    plan.expectedPermanentDeleteProgressIds,
    "permanent progress deletion scope",
  );
  if (
    plan.kind !== "delete-profile"
    && (
      plan.expectedUnlinkQualificationIds.length > 0
      || plan.expectedPermanentDeleteProgressIds.length > 0
    )
  ) {
    throw new ProfileManagementError(
      "non-deletion plan cannot carry progress deletion scope",
    );
  }
  validateIdArray(plan.hostedServiceGameIds, "hosted-service scope");
  if (
    !Number.isSafeInteger(plan.confirmAfterMs)
    || plan.confirmAfterMs < 0
    || !Number.isSafeInteger(plan.expiresAtMs)
    || plan.expiresAtMs
      !== plan.confirmAfterMs + PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS
  ) {
    throw new ProfileManagementError("invalid confirmation window");
  }
}

function validateCalibrationResult(
  result: SyntheticCalibrationResultRef,
): void {
  if (
    typeof result !== "object"
    || result === null
    || Array.isArray(result)
    || !hasExactKeyNames(
      result,
      ["attempt", "id", "limited", "profileId", "sessionId"],
    )
  ) {
    throw new ProfileManagementError(
      "calibration result must use the closed schema",
    );
  }
  validateId(result.profileId, "profile ID");
  if (
    !Number.isSafeInteger(result.sessionId)
    || result.sessionId <= 0
    || !Number.isSafeInteger(result.attempt)
    || result.attempt <= 0
    || typeof result.limited !== "boolean"
  ) {
    throw new ProfileManagementError("invalid calibration result");
  }
  const match = calibrationResultPattern.exec(result.id);
  if (
    !match
    || Number(match[1]) !== result.sessionId
    || Number(match[2]) !== result.attempt
  ) {
    throw new ProfileManagementError(
      "calibration result identity mismatch",
    );
  }
}

function validateIdArray(value: readonly string[], label: string): void {
  if (!Array.isArray(value) || value.length > PROFILE_MANAGEMENT_MAX_PROGRESS_RECORDS) {
    throw new ProfileManagementError(`invalid ${label}`);
  }
  const seen = new Set<string>();
  for (const id of value) {
    validateId(id, label);
    if (seen.has(id)) throw new ProfileManagementError(`duplicate ${label}`);
    seen.add(id);
  }
  if (!sameStrings([...value].sort(), value)) {
    throw new ProfileManagementError(`${label} must be sorted`);
  }
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
    throw new ProfileManagementError(`${label} must use the closed schema`);
  }
}

function hasExactKeyNames(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length
    && sortedExpected.every((key, index) => keys[index] === key)
  );
}

function validateId(value: string, label: string): void {
  if (
    typeof value !== "string"
    || value.length > 64
    || !idPattern.test(value)
  ) {
    throw new ProfileManagementError(`invalid ${label}`);
  }
}

function validateName(value: string): string {
  if (
    typeof value !== "string"
    || hasUnsafeVisibleTextCharacter(value)
  ) {
    throw new ProfileManagementError("invalid profile name");
  }
  const normalized = value.trim().normalize("NFC");
  if (
    unicodeScalarLength(normalized) === 0
    || unicodeScalarLength(normalized) > 24
    || hasUnsafeVisibleTextCharacter(normalized)
  ) {
    throw new ProfileManagementError("invalid profile name");
  }
  return normalized;
}

function validateText(value: string, maximum: number, label: string): void {
  if (
    typeof value !== "string"
    || unicodeScalarLength(value) === 0
    || unicodeScalarLength(value) > maximum
    || hasUnsafeVisibleTextCharacter(value)
  ) {
    throw new ProfileManagementError(`invalid ${label}`);
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length
    && left.every((value, index) => value === right[index])
  );
}

function sameUnlinkQualification(
  left: QualifiedProgressUnlink,
  right: QualifiedProgressUnlink,
): boolean {
  return unlinkQualificationKeys.every(
    (key) => left[key] === right[key],
  );
}
