export {
  RETRO_INSTALLED_LIBRARY_SCHEMA_ID,
  retroInstalledLibraryJsonSchema,
} from "./installed-library-schema";
export * from "./arcade-sets";

export const RETRO_IMPORT_SCHEMA_VERSION = 1 as const;
export const RETRO_IMPORT_ENTITLEMENT_STATEMENT =
  "vcg-user-entitled-content-v1" as const;
export const RETRO_OPERATOR_PROVISIONED_TRANSPORT =
  "operator-provisioned" as const;

const SAFE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SESSION_ID = /^ris-[a-f0-9]{32}$/;
const SOURCE_HANDLE = /^rih-[a-f0-9]{32}$/;
const INSPECTION_ID = /^rii-[a-f0-9]{32}$/;
const CONTENT_ID = /^content-[a-f0-9]{64}$/;
const EXTENSION = /^\.[a-z0-9]{1,8}$/;
const ARCHIVE_EXTENSION: Readonly<Record<RetroArchiveFormat, string>> = {
  zip: ".zip",
};
const RESERVED_PORTABLE_NAMES = new Set([
  "aux",
  "clock$",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "con",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
  "nul",
  "prn",
]);

/** Transport a session, candidate, plan, and terminal intent may name. */
export type RetroImportTransport = "paired-lan" | "usb";
/** Transport an installed entry may record, including operator staging. */
export type RetroInstalledTransport =
  | RetroImportTransport
  | typeof RETRO_OPERATOR_PROVISIONED_TRANSPORT;
export type RetroArchiveFormat = "zip";
export type RetroScanStatus = "blocked" | "clean" | "error";
export type RetroImportPlanStatus = "conflict" | "duplicate" | "ready";
export type RetroImportDecisionAction =
  | "cancel"
  | "install"
  | "keep-both"
  | "replace-existing"
  | "use-existing";

export interface RetroImportSystemPolicy {
  id: string;
  plainExtensions: string[];
  archiveFormats: RetroArchiveFormat[];
  defaultCoreId: string;
  controllerProfile: string;
  maxContentBytes: number;
}

export interface RetroImportPolicy {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  policyId: string;
  revision: number;
  maxSessionMs: number;
  maxPlanMs: number;
  maxSourceBytes: number;
  maxArchiveEntries: number;
  maxExpandedBytes: number;
  maxCompressionRatio: number;
  maxLibraryEntries: number;
  maxLibraryBytes: number;
  systems: RetroImportSystemPolicy[];
}

export interface RetroImportEntitlement {
  statementVersion: typeof RETRO_IMPORT_ENTITLEMENT_STATEMENT;
  scope: "selected-files-only";
  acceptedAtMs: number;
  profileId: string;
}

export interface RetroImportSession {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  sessionId: string;
  transport: RetroImportTransport;
  authorityId: string;
  openedAtMs: number;
  expiresAtMs: number;
  familyMode: "imports-allowed" | "imports-denied";
  entitlement: RetroImportEntitlement;
}

export interface RetroArchiveEntryInspection {
  relativeName: string;
  sizeBytes: number;
  sha256: string;
}

export type RetroSourceInspection =
  | {
      kind: "plain";
    }
  | {
      kind: "archive";
      format: RetroArchiveFormat;
      expandedBytes: number;
      entries: RetroArchiveEntryInspection[];
    };

export interface RetroContentScan {
  engineId: string;
  ruleSetRevision: string;
  inspectionId: string;
  subjectSha256: string;
  scope: "container-and-expanded-payloads";
  status: RetroScanStatus;
}

export interface RetroImportCandidate {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  sessionId: string;
  transport: RetroImportTransport;
  sourceHandle: string;
  sourceName: string;
  receivedBytes: number;
  receivedSha256: string;
  requestedSystemId: string;
  inspectionId: string;
  inspection: RetroSourceInspection;
  scan: RetroContentScan;
}

/** Evidence one live USB or paired-LAN import session produced. */
export interface RetroSessionProvenance {
  transport: RetroImportTransport;
  importSessionId: string;
  entitlementStatementVersion: typeof RETRO_IMPORT_ENTITLEMENT_STATEMENT;
  importedAtMs: number;
}

/**
 * Provenance of content an operator staged onto the console themselves.
 *
 * It carries no session, no entitlement acknowledgement, and no import time,
 * because provisioning produces none of them.
 */
export interface RetroOperatorProvisionedProvenance {
  transport: typeof RETRO_OPERATOR_PROVISIONED_TRANSPORT;
}

export type RetroInstalledProvenance =
  | RetroOperatorProvisionedProvenance
  | RetroSessionProvenance;

export interface RetroInstalledEntry {
  entryId: string;
  systemId: string;
  sha256: string;
  sizeBytes: number;
  extension: string;
  title: string;
  coreId: string;
  controllerProfile: string;
  provenance: RetroInstalledProvenance;
}

/** Installed entry a terminal intent may name: session-bound provenance only. */
export interface RetroSessionInstalledEntry extends RetroInstalledEntry {
  provenance: RetroSessionProvenance;
}

export interface RetroInstalledLibrary {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  generation: number;
  entries: RetroInstalledEntry[];
}

export interface RetroImportCapacity {
  freeBytes: number;
  reservedBytes: number;
}

export interface RetroImportRequest {
  session: RetroImportSession;
  candidate: RetroImportCandidate;
  library: RetroInstalledLibrary;
  capacity: RetroImportCapacity;
  nowMs: number;
}

export interface RetroImportPlan {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  planId: string;
  policyId: string;
  policyRevision: number;
  expectedLibraryGeneration: number;
  sessionId: string;
  transport: RetroImportTransport;
  sourceHandle: string;
  sourceSha256: string;
  inspectionId: string;
  systemId: string;
  status: RetroImportPlanStatus;
  expiresAtMs: number;
  peakStagingBytes: number;
  entry: RetroSessionInstalledEntry;
  existingEntryIds: string[];
  replaceableEntryIds: string[];
  allowedDecisions: RetroImportDecisionAction[];
}

export type RetroImportDecision =
  | {
      action: Exclude<RetroImportDecisionAction, "replace-existing">;
    }
  | {
      action: "replace-existing";
      entryId: string;
    };

export interface RetroImportAuditEvent {
  event: "retro-import-terminal-intent";
  planId: string;
  policyId: string;
  policyRevision: number;
  sessionId: string;
  transport: RetroImportTransport;
  systemId: string;
  contentSha256: string;
  entitlementStatementVersion: typeof RETRO_IMPORT_ENTITLEMENT_STATEMENT;
  decision: RetroImportDecisionAction;
}

export interface RetroImportCommitIntent {
  schemaVersion: typeof RETRO_IMPORT_SCHEMA_VERSION;
  planId: string;
  expectedLibraryGeneration: number;
  action:
    | "cancel-and-cleanup"
    | "install-new"
    | "replace-existing"
    | "reuse-existing";
  sourceHandle: string;
  sourceSha256: string;
  installEntry: RetroSessionInstalledEntry | null;
  existingEntryId: string | null;
  cleanupStagingAfterTerminal: true;
  audit: RetroImportAuditEvent;
}

export class RetroImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RetroImportError";
    this.code = code;
  }
}

export function parseRetroImportPolicy(value: unknown): RetroImportPolicy {
  validatePolicy(value);
  return deepFreeze(structuredClone(value));
}

export function parseRetroImportSession(value: unknown): RetroImportSession {
  validateSession(value);
  return deepFreeze(structuredClone(value));
}

export function parseRetroImportCandidate(
  value: unknown,
): RetroImportCandidate {
  validateCandidate(value);
  return deepFreeze(structuredClone(value));
}

export function parseRetroInstalledLibrary(
  value: unknown,
): RetroInstalledLibrary {
  validateLibrary(value);
  return deepFreeze(structuredClone(value));
}

export function parseRetroImportCapacity(
  value: unknown,
): RetroImportCapacity {
  validateCapacity(value);
  return deepFreeze(structuredClone(value));
}

export class RetroImportCoordinator {
  readonly policy: RetroImportPolicy;
  readonly #issuedPlans = new WeakMap<RetroImportPlan, "consumed" | "issued">();
  readonly #revokedSessions = new Set<string>();

  constructor(policy: unknown) {
    this.policy = parseRetroImportPolicy(policy);
  }

  plan(requestValue: unknown): RetroImportPlan {
    const request = parseRequest(requestValue);
    const { session, candidate, library, capacity, nowMs } = request;

    if (session.familyMode !== "imports-allowed") {
      fail("FAMILY_MODE_DENIED", "family mode denies retro imports");
    }
    if (
      this.#revokedSessions.has(session.sessionId)
      || nowMs < session.openedAtMs
      || nowMs >= session.expiresAtMs
    ) {
      fail("SESSION_INACTIVE", "retro import session is not active");
    }
    if (
      session.expiresAtMs - session.openedAtMs > this.policy.maxSessionMs
    ) {
      fail("SESSION_TOO_LONG", "retro import session exceeds policy duration");
    }
    if (
      session.entitlement.acceptedAtMs < session.openedAtMs
      || session.entitlement.acceptedAtMs > nowMs
      || session.entitlement.acceptedAtMs >= session.expiresAtMs
    ) {
      fail(
        "ENTITLEMENT_TIME_INVALID",
        "entitlement acknowledgement is outside the active session",
      );
    }
    if (
      candidate.sessionId !== session.sessionId
      || candidate.transport !== session.transport
    ) {
      fail(
        "CANDIDATE_SESSION_MISMATCH",
        "candidate is not bound to the import session",
      );
    }
    if (candidate.receivedBytes > this.policy.maxSourceBytes) {
      fail("SOURCE_TOO_LARGE", "source exceeds import policy");
    }
    if (
      candidate.scan.status !== "clean"
      || candidate.scan.inspectionId !== candidate.inspectionId
      || candidate.scan.subjectSha256 !== candidate.receivedSha256
    ) {
      fail(
        "SCAN_NOT_CLEAN",
        "candidate lacks exact clean native scan evidence",
      );
    }
    if (
      library.entries.length > this.policy.maxLibraryEntries
      || sumEntryBytes(library.entries) > this.policy.maxLibraryBytes
    ) {
      fail(
        "LIBRARY_POLICY_EXCEEDED",
        "current library exceeds configured policy",
      );
    }
    for (const installed of library.entries) {
      const installedSystem = this.policy.systems.find(
        (item) => item.id === installed.systemId,
      );
      if (
        !installedSystem
        || installed.coreId !== installedSystem.defaultCoreId
        || installed.controllerProfile
          !== installedSystem.controllerProfile
        || !installedSystem.plainExtensions.includes(installed.extension)
      ) {
        fail(
          "LIBRARY_POLICY_MISMATCH",
          "installed entry does not match the active signed policy",
        );
      }
    }

    const system = this.policy.systems.find(
      (item) => item.id === candidate.requestedSystemId,
    );
    if (!system) {
      fail("SYSTEM_UNSUPPORTED", "requested retro system is unsupported");
    }

    const payload = selectPayload(candidate, system, this.policy);
    if (payload.sizeBytes > system.maxContentBytes) {
      fail("CONTENT_TOO_LARGE", "content exceeds system policy");
    }

    const crossSystemHash = library.entries.find(
      (entry) =>
        entry.sha256 === payload.sha256 && entry.systemId !== system.id,
    );
    if (crossSystemHash) {
      fail(
        "HASH_SYSTEM_CONFLICT",
        "content hash is already assigned to a different system",
      );
    }

    const duplicateEntries = library.entries.filter(
      (entry) =>
        entry.systemId === system.id && entry.sha256 === payload.sha256,
    );
    const title = displayTitle(payload.name, system.id, payload.sha256);
    const normalizedTitle = comparisonTitle(title);
    const conflictEntries = library.entries.filter(
      (entry) =>
        entry.systemId === system.id
        && entry.sha256 !== payload.sha256
        && comparisonTitle(entry.title) === normalizedTitle,
    );

    const entry: RetroSessionInstalledEntry = {
      entryId: `content-${payload.sha256}`,
      systemId: system.id,
      sha256: payload.sha256,
      sizeBytes: payload.sizeBytes,
      extension: extensionOf(payload.name),
      title,
      coreId: system.defaultCoreId,
      controllerProfile: system.controllerProfile,
      provenance: {
        transport: session.transport,
        importSessionId: session.sessionId,
        entitlementStatementVersion:
          session.entitlement.statementVersion,
        importedAtMs: nowMs,
      },
    };

    let status: RetroImportPlanStatus;
    let peakStagingBytes = peakBytes(candidate);
    let existingEntryIds: string[];
    let replaceableEntryIds: string[];
    let allowedDecisions: RetroImportDecisionAction[];

    if (duplicateEntries.length > 0) {
      status = "duplicate";
      peakStagingBytes = 0;
      existingEntryIds = duplicateEntries.map((item) => item.entryId).sort();
      replaceableEntryIds = [];
      allowedDecisions = ["cancel", "use-existing"];
    } else {
      const availableBytes = capacity.freeBytes - capacity.reservedBytes;
      if (peakStagingBytes > availableBytes) {
        fail(
          "INSUFFICIENT_CAPACITY",
          "free space cannot hold bounded import staging",
        );
      }
      const libraryBytes = sumEntryBytes(library.entries);
      const keepBothBytes = safeAdd(
        libraryBytes,
        payload.sizeBytes,
        "installed-library bytes",
      );
      const keepBothFits =
        library.entries.length + 1 <= this.policy.maxLibraryEntries
        && keepBothBytes <= this.policy.maxLibraryBytes;

      if (conflictEntries.length === 0) {
        if (!keepBothFits) {
          fail(
            "LIBRARY_QUOTA_EXCEEDED",
            "new content exceeds installed-library quota",
          );
        }
        status = "ready";
        existingEntryIds = [];
        replaceableEntryIds = [];
        allowedDecisions = ["cancel", "install"];
      } else {
        status = "conflict";
        existingEntryIds = conflictEntries
          .map((item) => item.entryId)
          .sort();
        replaceableEntryIds = conflictEntries
          .filter(
            (item) =>
              safeAdd(
                libraryBytes - item.sizeBytes,
                payload.sizeBytes,
                "replacement library bytes",
              ) <= this.policy.maxLibraryBytes,
          )
          .map((item) => item.entryId)
          .sort();
        allowedDecisions = ["cancel"];
        if (keepBothFits) allowedDecisions.push("keep-both");
        if (replaceableEntryIds.length > 0) {
          allowedDecisions.push("replace-existing");
        }
      }
    }

    const plan: RetroImportPlan = deepFreeze({
      schemaVersion: RETRO_IMPORT_SCHEMA_VERSION,
      planId: [
        "rip",
        session.sessionId.slice(-8),
        payload.sha256.slice(0, 16),
        library.generation.toString(16),
      ].join("-"),
      policyId: this.policy.policyId,
      policyRevision: this.policy.revision,
      expectedLibraryGeneration: library.generation,
      sessionId: session.sessionId,
      transport: session.transport,
      sourceHandle: candidate.sourceHandle,
      sourceSha256: candidate.receivedSha256,
      inspectionId: candidate.inspectionId,
      systemId: system.id,
      status,
      expiresAtMs: Math.min(
        session.expiresAtMs,
        safeAdd(nowMs, this.policy.maxPlanMs, "plan expiry"),
      ),
      peakStagingBytes,
      entry,
      existingEntryIds,
      replaceableEntryIds,
      allowedDecisions,
    });
    this.#issuedPlans.set(plan, "issued");
    return plan;
  }

  revokeSession(sessionId: string): void {
    requirePattern(sessionId, SESSION_ID, 36, "session ID");
    this.#revokedSessions.add(sessionId);
  }

  authorize(
    planValue: unknown,
    decisionValue: unknown,
    nowMsValue: unknown,
  ): RetroImportCommitIntent {
    if (!isRecord(planValue)) {
      fail("PLAN_NOT_ISSUED", "plan was not issued by this coordinator");
    }
    const plan = planValue as unknown as RetroImportPlan;
    const state = this.#issuedPlans.get(plan);
    if (!state) {
      fail(
        "PLAN_NOT_ISSUED",
        "plan must be the exact coordinator-issued object",
      );
    }
    if (state === "consumed") {
      fail("PLAN_CONSUMED", "plan has already produced a terminal intent");
    }
    const decision = parseDecision(decisionValue);
    const nowMs = requireInteger(nowMsValue, 0, Number.MAX_SAFE_INTEGER, "now");

    if (!plan.allowedDecisions.includes(decision.action)) {
      fail("DECISION_NOT_ALLOWED", "decision is not allowed by this plan");
    }
    if (
      decision.action !== "cancel"
      && (
        this.#revokedSessions.has(plan.sessionId)
        || nowMs >= plan.expiresAtMs
      )
    ) {
      fail(
        this.#revokedSessions.has(plan.sessionId)
          ? "SESSION_REVOKED"
          : "PLAN_EXPIRED",
        "non-cancel import authority is no longer active",
      );
    }

    let action: RetroImportCommitIntent["action"];
    let installEntry: RetroSessionInstalledEntry | null = null;
    let existingEntryId: string | null = null;
    switch (decision.action) {
      case "cancel":
        action = "cancel-and-cleanup";
        break;
      case "install":
      case "keep-both":
        action = "install-new";
        installEntry = plan.entry;
        break;
      case "use-existing":
        action = "reuse-existing";
        existingEntryId = plan.existingEntryIds[0] ?? null;
        if (existingEntryId === null) {
          fail("DECISION_NOT_ALLOWED", "duplicate plan has no existing entry");
        }
        break;
      case "replace-existing":
        if (!plan.replaceableEntryIds.includes(decision.entryId)) {
          fail(
            "REPLACEMENT_NOT_ALLOWED",
            "replacement target is not bound to the plan",
          );
        }
        action = "replace-existing";
        installEntry = plan.entry;
        existingEntryId = decision.entryId;
        break;
    }

    this.#issuedPlans.set(plan, "consumed");
    return deepFreeze({
      schemaVersion: RETRO_IMPORT_SCHEMA_VERSION,
      planId: plan.planId,
      expectedLibraryGeneration: plan.expectedLibraryGeneration,
      action,
      sourceHandle: plan.sourceHandle,
      sourceSha256: plan.sourceSha256,
      installEntry,
      existingEntryId,
      cleanupStagingAfterTerminal: true,
      audit: {
        event: "retro-import-terminal-intent",
        planId: plan.planId,
        policyId: plan.policyId,
        policyRevision: plan.policyRevision,
        sessionId: plan.sessionId,
        transport: plan.transport,
        systemId: plan.systemId,
        contentSha256: plan.entry.sha256,
        entitlementStatementVersion:
          plan.entry.provenance.entitlementStatementVersion,
        decision: decision.action,
      },
    });
  }
}

function parseRequest(value: unknown): RetroImportRequest {
  const request = requireRecord(value, "import request");
  requireFields(
    request,
    ["candidate", "capacity", "library", "nowMs", "session"],
    "import request",
  );
  return deepFreeze({
    session: parseRetroImportSession(request.session),
    candidate: parseRetroImportCandidate(request.candidate),
    library: parseRetroInstalledLibrary(request.library),
    capacity: parseRetroImportCapacity(request.capacity),
    nowMs: requireInteger(
      request.nowMs,
      0,
      Number.MAX_SAFE_INTEGER,
      "request now",
    ),
  });
}

function validatePolicy(value: unknown): asserts value is RetroImportPolicy {
  const policy = requireRecord(value, "retro import policy");
  requireFields(
    policy,
    [
      "maxArchiveEntries",
      "maxCompressionRatio",
      "maxExpandedBytes",
      "maxLibraryBytes",
      "maxLibraryEntries",
      "maxPlanMs",
      "maxSessionMs",
      "maxSourceBytes",
      "policyId",
      "revision",
      "schemaVersion",
      "systems",
    ],
    "retro import policy",
  );
  requireLiteral(
    policy.schemaVersion,
    RETRO_IMPORT_SCHEMA_VERSION,
    "policy schema version",
  );
  requireSafeId(policy.policyId, 64, "policy ID");
  requireInteger(policy.revision, 1, Number.MAX_SAFE_INTEGER, "policy revision");
  requireInteger(policy.maxSessionMs, 1_000, 3_600_000, "maximum session");
  requireInteger(policy.maxPlanMs, 1_000, 300_000, "maximum plan");
  requireInteger(
    policy.maxSourceBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "maximum source bytes",
  );
  requireInteger(
    policy.maxArchiveEntries,
    1,
    4_096,
    "maximum archive entries",
  );
  requireInteger(
    policy.maxExpandedBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "maximum expanded bytes",
  );
  requireInteger(
    policy.maxCompressionRatio,
    1,
    1_000,
    "maximum compression ratio",
  );
  requireInteger(
    policy.maxLibraryEntries,
    1,
    100_000,
    "maximum library entries",
  );
  requireInteger(
    policy.maxLibraryBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "maximum library bytes",
  );
  const systems = requireArray(policy.systems, 1, 64, "systems");
  const ids = new Set<string>();
  for (const systemValue of systems) {
    const system = requireRecord(systemValue, "system policy");
    requireFields(
      system,
      [
        "archiveFormats",
        "controllerProfile",
        "defaultCoreId",
        "id",
        "maxContentBytes",
        "plainExtensions",
      ],
      "system policy",
    );
    const id = requireBindableId(system.id, 64, "system ID");
    if (ids.has(id)) fail("INVALID_POLICY", "system IDs must be unique");
    ids.add(id);
    requireBindableId(system.defaultCoreId, 64, "default core ID");
    requireSafeId(system.controllerProfile, 64, "controller profile");
    const extensions = requireStringArray(
      system.plainExtensions,
      1,
      64,
      "plain extensions",
    );
    requireSortedUnique(extensions, "plain extensions");
    for (const extension of extensions) {
      if (!EXTENSION.test(extension)) {
        fail("INVALID_POLICY", "plain extensions must be canonical");
      }
    }
    const formats = requireStringArray(
      system.archiveFormats,
      0,
      4,
      "archive formats",
    );
    requireSortedUnique(formats, "archive formats");
    for (const format of formats) {
      if (format !== "zip") {
        fail("INVALID_POLICY", "archive format is unsupported");
      }
    }
    requireInteger(
      system.maxContentBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      "maximum system content bytes",
    );
  }
}

function validateSession(value: unknown): asserts value is RetroImportSession {
  const session = requireRecord(value, "retro import session");
  requireFields(
    session,
    [
      "authorityId",
      "entitlement",
      "expiresAtMs",
      "familyMode",
      "openedAtMs",
      "schemaVersion",
      "sessionId",
      "transport",
    ],
    "retro import session",
  );
  requireLiteral(
    session.schemaVersion,
    RETRO_IMPORT_SCHEMA_VERSION,
    "session schema version",
  );
  requirePattern(session.sessionId, SESSION_ID, 36, "session ID");
  requireEnum(session.transport, ["paired-lan", "usb"], "transport");
  requireSafeId(session.authorityId, 80, "authority ID");
  const openedAtMs = requireInteger(
    session.openedAtMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "session open time",
  );
  const expiresAtMs = requireInteger(
    session.expiresAtMs,
    1,
    Number.MAX_SAFE_INTEGER,
    "session expiry",
  );
  if (expiresAtMs <= openedAtMs) {
    fail("INVALID_SESSION", "session expiry must follow open time");
  }
  requireEnum(
    session.familyMode,
    ["imports-allowed", "imports-denied"],
    "family mode",
  );
  const entitlement = requireRecord(session.entitlement, "entitlement");
  requireFields(
    entitlement,
    ["acceptedAtMs", "profileId", "scope", "statementVersion"],
    "entitlement",
  );
  requireLiteral(
    entitlement.statementVersion,
    RETRO_IMPORT_ENTITLEMENT_STATEMENT,
    "entitlement statement",
  );
  requireLiteral(
    entitlement.scope,
    "selected-files-only",
    "entitlement scope",
  );
  requireInteger(
    entitlement.acceptedAtMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "entitlement acceptance time",
  );
  requireSafeId(entitlement.profileId, 64, "entitlement profile ID");
}

function validateCandidate(
  value: unknown,
): asserts value is RetroImportCandidate {
  const candidate = requireRecord(value, "retro import candidate");
  requireFields(
    candidate,
    [
      "inspection",
      "inspectionId",
      "receivedBytes",
      "receivedSha256",
      "requestedSystemId",
      "scan",
      "schemaVersion",
      "sessionId",
      "sourceHandle",
      "sourceName",
      "transport",
    ],
    "retro import candidate",
  );
  requireLiteral(
    candidate.schemaVersion,
    RETRO_IMPORT_SCHEMA_VERSION,
    "candidate schema version",
  );
  requirePattern(candidate.sessionId, SESSION_ID, 36, "candidate session ID");
  requireEnum(candidate.transport, ["paired-lan", "usb"], "candidate transport");
  requirePattern(
    candidate.sourceHandle,
    SOURCE_HANDLE,
    36,
    "source handle",
  );
  requirePortableBasename(candidate.sourceName, "source name");
  requireInteger(
    candidate.receivedBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "received bytes",
  );
  requireSha256(candidate.receivedSha256, "received SHA-256");
  requireBindableId(candidate.requestedSystemId, 64, "requested system ID");
  requirePattern(
    candidate.inspectionId,
    INSPECTION_ID,
    36,
    "inspection ID",
  );

  const inspection = requireRecord(candidate.inspection, "source inspection");
  const kind = requireEnum(
    inspection.kind,
    ["archive", "plain"],
    "inspection kind",
  );
  if (kind === "plain") {
    requireFields(inspection, ["kind"], "plain inspection");
  } else {
    requireFields(
      inspection,
      ["entries", "expandedBytes", "format", "kind"],
      "archive inspection",
    );
    requireLiteral(inspection.format, "zip", "archive format");
    const expandedBytes = requireInteger(
      inspection.expandedBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      "expanded bytes",
    );
    const entries = requireArray(
      inspection.entries,
      1,
      4_096,
      "archive entries",
    );
    const portablePaths = new Set<string>();
    let observedBytes = 0;
    for (const entryValue of entries) {
      const entry = requireRecord(entryValue, "archive entry");
      requireFields(
        entry,
        ["relativeName", "sha256", "sizeBytes"],
        "archive entry",
      );
      const relativeName = requirePortableRelativePath(entry.relativeName);
      const collisionKey = relativeName
        .normalize("NFKC")
        .toLocaleLowerCase("en-US");
      if (portablePaths.has(collisionKey)) {
        fail(
          "INVALID_CANDIDATE",
          "archive contains a portable path collision",
        );
      }
      portablePaths.add(collisionKey);
      observedBytes += requireInteger(
        entry.sizeBytes,
        1,
        Number.MAX_SAFE_INTEGER,
        "archive entry bytes",
      );
      if (!Number.isSafeInteger(observedBytes)) {
        fail("INVALID_CANDIDATE", "archive expanded bytes overflow");
      }
      requireSha256(entry.sha256, "archive entry SHA-256");
    }
    if (observedBytes !== expandedBytes) {
      fail(
        "INVALID_CANDIDATE",
        "archive entry bytes do not match expanded bytes",
      );
    }
  }

  const scan = requireRecord(candidate.scan, "content scan");
  requireFields(
    scan,
    [
      "engineId",
      "inspectionId",
      "ruleSetRevision",
      "scope",
      "status",
      "subjectSha256",
    ],
    "content scan",
  );
  requireSafeId(scan.engineId, 64, "scan engine ID");
  requireBoundedString(scan.ruleSetRevision, 1, 128, "scan rule revision");
  requirePattern(scan.inspectionId, INSPECTION_ID, 36, "scan inspection ID");
  requireSha256(scan.subjectSha256, "scan subject SHA-256");
  requireLiteral(
    scan.scope,
    "container-and-expanded-payloads",
    "scan scope",
  );
  requireEnum(scan.status, ["blocked", "clean", "error"], "scan status");
}

function validateLibrary(
  value: unknown,
): asserts value is RetroInstalledLibrary {
  const library = requireRecord(value, "installed retro library");
  requireFields(
    library,
    ["entries", "generation", "schemaVersion"],
    "installed retro library",
  );
  requireLiteral(
    library.schemaVersion,
    RETRO_IMPORT_SCHEMA_VERSION,
    "library schema version",
  );
  requireInteger(
    library.generation,
    1,
    Number.MAX_SAFE_INTEGER,
    "library generation",
  );
  const entries = requireArray(library.entries, 0, 100_000, "library entries");
  const ids = new Set<string>();
  const contentKeys = new Set<string>();
  for (const entryValue of entries) {
    const entry = requireRecord(entryValue, "installed entry");
    requireFields(
      entry,
      [
        "controllerProfile",
        "coreId",
        "entryId",
        "extension",
        "provenance",
        "sha256",
        "sizeBytes",
        "systemId",
        "title",
      ],
      "installed entry",
    );
    const entryId = requirePattern(
      entry.entryId,
      CONTENT_ID,
      72,
      "installed entry ID",
    );
    if (ids.has(entryId)) {
      fail("INVALID_LIBRARY", "installed entry IDs must be unique");
    }
    ids.add(entryId);
    const systemId = requireBindableId(entry.systemId, 64, "installed system ID");
    const sha256 = requireSha256(entry.sha256, "installed SHA-256");
    if (entryId !== `content-${sha256}`) {
      fail(
        "INVALID_LIBRARY",
        "installed entry ID must derive from its full content hash",
      );
    }
    const contentKey = `${systemId}:${sha256}`;
    if (contentKeys.has(contentKey)) {
      fail("INVALID_LIBRARY", "installed system/hash pairs must be unique");
    }
    contentKeys.add(contentKey);
    requireInteger(
      entry.sizeBytes,
      1,
      Number.MAX_SAFE_INTEGER,
      "installed entry bytes",
    );
    requirePattern(entry.extension, EXTENSION, 9, "installed extension");
    requireVisibleTitle(entry.title, "installed title");
    requireBindableId(entry.coreId, 64, "installed core ID");
    requireSafeId(
      entry.controllerProfile,
      64,
      "installed controller profile",
    );
    validateInstalledProvenance(entry.provenance);
  }
}

/**
 * Validates the closed union the native host records, tagged on `transport`.
 *
 * An operator-provisioned entry carries the tag alone: a session ID,
 * entitlement acknowledgement, or import time on it is rejected rather than
 * ignored, because provisioning produces no such evidence.
 */
function validateInstalledProvenance(value: unknown): void {
  const provenance = requireRecord(value, "installed provenance");
  const transport: RetroInstalledTransport = requireEnum(
    provenance.transport,
    [RETRO_OPERATOR_PROVISIONED_TRANSPORT, "paired-lan", "usb"],
    "installed transport",
  );
  if (transport === RETRO_OPERATOR_PROVISIONED_TRANSPORT) {
    requireFields(provenance, ["transport"], "installed provenance");
    return;
  }
  requireFields(
    provenance,
    [
      "entitlementStatementVersion",
      "importedAtMs",
      "importSessionId",
      "transport",
    ],
    "installed provenance",
  );
  requirePattern(
    provenance.importSessionId,
    SESSION_ID,
    36,
    "installed session ID",
  );
  requireLiteral(
    provenance.entitlementStatementVersion,
    RETRO_IMPORT_ENTITLEMENT_STATEMENT,
    "installed entitlement statement",
  );
  requireInteger(
    provenance.importedAtMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "installed time",
  );
}

function validateCapacity(value: unknown): asserts value is RetroImportCapacity {
  const capacity = requireRecord(value, "import capacity");
  requireFields(capacity, ["freeBytes", "reservedBytes"], "import capacity");
  const freeBytes = requireInteger(
    capacity.freeBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "free bytes",
  );
  const reservedBytes = requireInteger(
    capacity.reservedBytes,
    0,
    Number.MAX_SAFE_INTEGER,
    "reserved bytes",
  );
  if (reservedBytes > freeBytes) {
    fail("INVALID_CAPACITY", "reserved bytes exceed free bytes");
  }
}

function selectPayload(
  candidate: RetroImportCandidate,
  system: RetroImportSystemPolicy,
  policy: RetroImportPolicy,
): { name: string; sizeBytes: number; sha256: string } {
  if (candidate.inspection.kind === "plain") {
    const extension = extensionOf(candidate.sourceName);
    if (!system.plainExtensions.includes(extension)) {
      fail(
        "EXTENSION_UNSUPPORTED",
        "plain content extension is unsupported for the selected system",
      );
    }
    return {
      name: candidate.sourceName,
      sizeBytes: candidate.receivedBytes,
      sha256: candidate.receivedSha256,
    };
  }

  if (!system.archiveFormats.includes(candidate.inspection.format)) {
    fail(
      "ARCHIVE_UNSUPPORTED",
      "archive format is unsupported for the selected system",
    );
  }
  if (
    extensionOf(candidate.sourceName)
    !== ARCHIVE_EXTENSION[candidate.inspection.format]
  ) {
    fail("ARCHIVE_EXTENSION_MISMATCH", "archive name and format disagree");
  }
  if (
    candidate.inspection.entries.length > policy.maxArchiveEntries
    || candidate.inspection.expandedBytes > policy.maxExpandedBytes
    || BigInt(candidate.inspection.expandedBytes)
      > BigInt(candidate.receivedBytes) * BigInt(policy.maxCompressionRatio)
  ) {
    fail("ARCHIVE_LIMIT_EXCEEDED", "archive exceeds bounded expansion policy");
  }
  if (candidate.inspection.entries.length !== 1) {
    fail(
      "ARCHIVE_MULTI_FILE_UNSUPPORTED",
      "v1 accepts exactly one regular payload per archive",
    );
  }
  const payload = candidate.inspection.entries[0];
  if (!payload) {
    fail("ARCHIVE_EMPTY", "archive has no payload");
  }
  const extension = extensionOf(payload.relativeName);
  const nestedArchiveExtensions = Object.values(ARCHIVE_EXTENSION);
  if (nestedArchiveExtensions.includes(extension)) {
    fail("NESTED_ARCHIVE_DENIED", "nested archives are unsupported");
  }
  if (!system.plainExtensions.includes(extension)) {
    fail(
      "EXTENSION_UNSUPPORTED",
      "archive payload extension is unsupported for the selected system",
    );
  }
  return {
    name: payload.relativeName,
    sizeBytes: payload.sizeBytes,
    sha256: payload.sha256,
  };
}

function peakBytes(candidate: RetroImportCandidate): number {
  if (candidate.inspection.kind === "plain") return candidate.receivedBytes;
  const peak = candidate.receivedBytes + candidate.inspection.expandedBytes;
  if (!Number.isSafeInteger(peak)) {
    fail("CAPACITY_OVERFLOW", "archive staging bytes overflow");
  }
  return peak;
}

function parseDecision(value: unknown): RetroImportDecision {
  const decision = requireRecord(value, "import decision");
  const action = requireEnum(
    decision.action,
    ["cancel", "install", "keep-both", "replace-existing", "use-existing"],
    "import decision action",
  );
  if (action === "replace-existing") {
    requireFields(decision, ["action", "entryId"], "replacement decision");
    const entryId = requirePattern(
      decision.entryId,
      CONTENT_ID,
      72,
      "replacement entry ID",
    );
    return { action, entryId };
  }
  requireFields(decision, ["action"], "import decision");
  return { action };
}

function extensionOf(name: string): string {
  const leaf = name.split("/").at(-1) ?? name;
  const index = leaf.lastIndexOf(".");
  if (index <= 0 || index === leaf.length - 1) {
    return "";
  }
  return leaf.slice(index).toLocaleLowerCase("en-US");
}

function displayTitle(name: string, systemId: string, sha256: string): string {
  const leaf = name.split("/").at(-1) ?? name;
  const extension = extensionOf(leaf);
  const stem = extension === "" ? leaf : leaf.slice(0, -extension.length);
  const normalized = stem
    .normalize("NFC")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized === "") {
    return `${systemId.toLocaleUpperCase("en-US")} ${sha256.slice(0, 8)}`;
  }
  return [...normalized].slice(0, 80).join("");
}

function comparisonTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function requirePortableBasename(value: unknown, label: string): string {
  const name = requireBoundedString(value, 1, 255, label);
  if (
    name !== name.normalize("NFC")
    || name.includes("/")
    || name.includes("\\")
    || [...name].some(isUnsafeDisplayCharacter)
    || /[<>"|?*]/u.test(name)
    || name.endsWith(".")
    || name.endsWith(" ")
    || name.includes(":")
  ) {
    fail("UNSAFE_NAME", `${label} must be a portable NFC basename`);
  }
  requirePortableSegment(name, label);
  return name;
}

function requirePortableRelativePath(value: unknown): string {
  const path = requireBoundedString(value, 1, 240, "archive relative name");
  if (
    path !== path.normalize("NFC")
    || path.startsWith("/")
    || path.includes("\\")
    || path.includes(":")
    || [...path].some(isUnsafeDisplayCharacter)
    || /[<>"|?*]/u.test(path)
  ) {
    fail("UNSAFE_ARCHIVE_PATH", "archive path is not portable");
  }
  const segments = path.split("/");
  if (segments.length > 8) {
    fail("UNSAFE_ARCHIVE_PATH", "archive path is too deep");
  }
  for (const segment of segments) {
    requirePortableSegment(segment, "archive path segment");
  }
  return path;
}

function requirePortableSegment(segment: string, label: string): void {
  if (
    segment === ""
    || segment === "."
    || segment === ".."
    || segment.endsWith(".")
    || segment.endsWith(" ")
  ) {
    fail("UNSAFE_NAME", `${label} is unsafe`);
  }
  const stem = segment.split(".")[0]?.toLocaleLowerCase("en-US") ?? "";
  if (RESERVED_PORTABLE_NAMES.has(stem)) {
    fail("UNSAFE_NAME", `${label} uses a reserved portable name`);
  }
}

function requireVisibleTitle(value: unknown, label: string): string {
  if (typeof value !== "string") {
    fail("INVALID_STRING", `${label} must be a bounded string`);
  }
  const title = value as string;
  const scalarLength = [...title].length;
  if (scalarLength < 1 || scalarLength > 80) {
    fail("INVALID_STRING", `${label} must be a bounded string`);
  }
  if (
    title !== title.normalize("NFC")
    || [...title].some(isUnsafeDisplayCharacter)
    || /[/\\]/u.test(title)
    || title.trim() !== title
  ) {
    fail("INVALID_LIBRARY", `${label} is not a safe visible title`);
  }
  return title;
}

function isUnsafeDisplayCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return true;
  return (
    (codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    || codePoint === 0x00ad
    || codePoint === 0x061c
    || codePoint === 0x180e
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x2028 && codePoint <= 0x202e)
    || (codePoint >= 0x2060 && codePoint <= 0x2064)
    || (codePoint >= 0x2066 && codePoint <= 0x206f)
    || codePoint === 0xfeff
    || (codePoint >= 0xfff9 && codePoint <= 0xfffb)
    || (codePoint >= 0x1bca0 && codePoint <= 0x1bca3)
    || (codePoint >= 0x1d173 && codePoint <= 0x1d17a)
    || codePoint === 0xe0001
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || (character !== " " && /\s/u.test(character))
  );
}

function sumEntryBytes(entries: readonly RetroInstalledEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += entry.sizeBytes;
    if (!Number.isSafeInteger(total)) {
      fail("LIBRARY_SIZE_OVERFLOW", "installed library bytes overflow");
    }
  }
  return total;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    fail("CAPACITY_OVERFLOW", `${label} overflow`);
  }
  return result;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail("INVALID_SHAPE", `${label} must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length
    || actual.some((field, index) => field !== required[index])
  ) {
    fail("UNKNOWN_OR_MISSING_FIELD", `${label} has unknown or missing fields`);
  }
}

function requireArray(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): unknown[] {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
  ) {
    fail("INVALID_ARRAY", `${label} must be a bounded array`);
  }
  return value;
}

function requireStringArray(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): string[] {
  const items = requireArray(value, minimum, maximum, label);
  return items.map((item) => requireBoundedString(item, 1, 128, label));
}

function requireSortedUnique(value: readonly string[], label: string): void {
  const sorted = [...new Set(value)].sort();
  if (
    sorted.length !== value.length
    || value.some((item, index) => item !== sorted[index])
  ) {
    fail("INVALID_POLICY", `${label} must be sorted and unique`);
  }
}

function requireBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): string {
  if (
    typeof value !== "string"
    || value.length < minimum
    || value.length > maximum
  ) {
    fail("INVALID_STRING", `${label} must be a bounded string`);
  }
  return value;
}

/**
 * Validates an identifier a signed catalog can name.
 *
 * The catalog binds a library package by system and core using a grammar that
 * excludes ".", so an identifier the library accepted but no package could bind
 * would be unreachable content. Delegates first, so every rejection
 * {@link requireSafeId} already performs still fires.
 */
function requireBindableId(value: unknown, maximum: number, label: string): string {
  const id = requireSafeId(value, maximum, label);
  if (id.includes(".")) {
    fail("INVALID_ID", `${label} is invalid`);
  }
  return id;
}

function requireSafeId(value: unknown, maximum: number, label: string): string {
  const id = requireBoundedString(value, 1, maximum, label);
  if (!SAFE_ID.test(id)) {
    fail("INVALID_ID", `${label} is invalid`);
  }
  return id;
}

function requirePattern(
  value: unknown,
  pattern: RegExp,
  maximum: number,
  label: string,
): string {
  const text = requireBoundedString(value, 1, maximum, label);
  if (!pattern.test(text)) {
    fail("INVALID_VALUE", `${label} is invalid`);
  }
  return text;
}

function requireSha256(value: unknown, label: string): string {
  return requirePattern(value, SHA256, 64, label);
}

function requireInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    fail("INVALID_INTEGER", `${label} must be a bounded safe integer`);
  }
  return value as number;
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    fail("INVALID_VALUE", `${label} is invalid`);
  }
  return expected;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail("INVALID_VALUE", `${label} is invalid`);
  }
  return value as T[number];
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new RetroImportError(code, message);
}
