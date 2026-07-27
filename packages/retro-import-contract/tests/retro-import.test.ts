import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseRetroImportCandidate,
  parseRetroImportPolicy,
  parseRetroInstalledLibrary,
  RETRO_INSTALLED_LIBRARY_SCHEMA_ID,
  RetroImportCoordinator,
  RetroImportError,
  retroInstalledLibraryJsonSchema,
  type RetroImportCandidate,
  type RetroImportPolicy,
  type RetroImportRequest,
  type RetroInstalledEntry,
  type RetroInstalledLibrary,
} from "../src";
import checkedInInstalledLibrarySchema from "../../../schemas/retro-installed-library.schema.json";
import plainInstallFixture from "../fixtures/plain-install-v1.json";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const SESSION_ID = `ris-${"1".repeat(32)}`;
const SOURCE_HANDLE = `rih-${"2".repeat(32)}`;
const INSPECTION_ID = `rii-${"3".repeat(32)}`;
const OPENED_AT = 1_000_000;
const NOW = 1_001_000;

const basePolicy: RetroImportPolicy = {
  schemaVersion: 1,
  policyId: "starter-retro-import",
  revision: 7,
  maxSessionMs: 600_000,
  maxPlanMs: 30_000,
  maxSourceBytes: 10_000_000,
  maxArchiveEntries: 32,
  maxExpandedBytes: 32_000_000,
  maxCompressionRatio: 20,
  maxLibraryEntries: 1_000,
  maxLibraryBytes: 100_000_000,
  systems: [
    {
      id: "game-boy",
      plainExtensions: [".gb", ".gbc"],
      archiveFormats: ["zip"],
      defaultCoreId: "gambatte",
      controllerProfile: "retropad-standard-v1",
      maxContentBytes: 8_000_000,
    },
    {
      id: "game-boy-color",
      plainExtensions: [".gb", ".gbc"],
      archiveFormats: ["zip"],
      defaultCoreId: "gambatte",
      controllerProfile: "retropad-standard-v1",
      maxContentBytes: 8_000_000,
    },
  ],
};

const baseCandidate: RetroImportCandidate = {
  schemaVersion: 1,
  sessionId: SESSION_ID,
  transport: "usb",
  sourceHandle: SOURCE_HANDLE,
  sourceName: "Tetris.gb",
  receivedBytes: 1_024,
  receivedSha256: HASH_A,
  requestedSystemId: "game-boy",
  inspectionId: INSPECTION_ID,
  inspection: {
    kind: "plain",
  },
  scan: {
    engineId: "clamav",
    ruleSetRevision: "daily-2026.07.24",
    inspectionId: INSPECTION_ID,
    subjectSha256: HASH_A,
    scope: "container-and-expanded-payloads",
    status: "clean",
  },
};

const baseRequest: RetroImportRequest = {
  session: {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    transport: "usb",
    authorityId: "usb-session-authority",
    openedAtMs: OPENED_AT,
    expiresAtMs: OPENED_AT + 300_000,
    familyMode: "imports-allowed",
    entitlement: {
      statementVersion: "vcg-user-entitled-content-v1",
      scope: "selected-files-only",
      acceptedAtMs: OPENED_AT + 100,
      profileId: "player-one",
    },
  },
  candidate: baseCandidate,
  library: {
    schemaVersion: 1,
    generation: 7,
    entries: [],
  },
  capacity: {
    freeBytes: 1_000_000_000,
    reservedBytes: 100_000_000,
  },
  nowMs: NOW,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RetroImportError);
    expect((error as RetroImportError).code).toBe(code);
  }
}

function installedEntry(
  hash: string,
  overrides: Partial<RetroInstalledEntry> = {},
): RetroInstalledEntry {
  return {
    entryId: `content-${hash}`,
    systemId: "game-boy",
    sha256: hash,
    sizeBytes: 2_048,
    extension: ".gb",
    title: "Tetris",
    coreId: "gambatte",
    controllerProfile: "retropad-standard-v1",
    provenance: {
      transport: "usb",
      importSessionId: `ris-${"9".repeat(32)}`,
      entitlementStatementVersion: "vcg-user-entitled-content-v1",
      importedAtMs: 900_000,
    },
    ...overrides,
  };
}

describe("closed import contracts", () => {
  it("keeps the checked-in closed installed-library schema current", () => {
    expect(retroInstalledLibraryJsonSchema.$id).toBe(
      RETRO_INSTALLED_LIBRARY_SCHEMA_ID,
    );
    expect(retroInstalledLibraryJsonSchema.additionalProperties).toBe(false);
    expect(
      retroInstalledLibraryJsonSchema.$defs.entry.additionalProperties,
    ).toBe(false);
    expect(
      retroInstalledLibraryJsonSchema.$defs.provenance.additionalProperties,
    ).toBe(false);
    expect(checkedInInstalledLibrarySchema).toEqual(
      retroInstalledLibraryJsonSchema,
    );
  });

  it("clones and deeply freezes the accepted policy", () => {
    const mutable = clone(basePolicy);
    const parsed = parseRetroImportPolicy(mutable);
    mutable.systems[0]!.plainExtensions.push(".zip");

    expect(parsed).toEqual(basePolicy);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.systems[0]?.plainExtensions)).toBe(true);
  });

  it("rejects unknown, missing, unsorted, duplicate, and unsupported policy data", () => {
    const unknown = { ...clone(basePolicy), arbitrary: true };
    expectCode(() => parseRetroImportPolicy(unknown), "UNKNOWN_OR_MISSING_FIELD");

    const missing = clone(basePolicy) as Partial<RetroImportPolicy>;
    delete missing.maxSessionMs;
    expectCode(() => parseRetroImportPolicy(missing), "UNKNOWN_OR_MISSING_FIELD");

    const unsorted = clone(basePolicy);
    unsorted.systems[0]!.plainExtensions.reverse();
    expectCode(() => parseRetroImportPolicy(unsorted), "INVALID_POLICY");

    const duplicate = clone(basePolicy);
    duplicate.systems[1]!.id = duplicate.systems[0]!.id;
    expectCode(() => parseRetroImportPolicy(duplicate), "INVALID_POLICY");

    const archive = clone(basePolicy) as unknown as {
      systems: Array<{ archiveFormats: string[] }>;
    };
    archive.systems[0]!.archiveFormats = ["7z"];
    expectCode(() => parseRetroImportPolicy(archive), "INVALID_POLICY");
  });

  it("rejects source paths, reserved names, and undeclared candidate fields", () => {
    for (const sourceName of [
      "../Tetris.gb",
      "folder/Tetris.gb",
      String.raw`C:\Tetris.gb`,
      "CON.gb",
      "Tetris.gb ",
      "Tetris?.gb",
      "Tetris|Alt.gb",
    ]) {
      const candidate = clone(baseCandidate);
      candidate.sourceName = sourceName;
      expectCode(() => parseRetroImportCandidate(candidate), "UNSAFE_NAME");
    }

    const unknown = { ...clone(baseCandidate), sourcePath: "E:\\Tetris.gb" };
    expectCode(
      () => parseRetroImportCandidate(unknown),
      "UNKNOWN_OR_MISSING_FIELD",
    );
  });

  it("requires installed IDs to derive from hashes and keeps provenance path-free", () => {
    const invalidId: RetroInstalledLibrary = {
      schemaVersion: 1,
      generation: 1,
      entries: [
        installedEntry(HASH_A, { entryId: `content-${HASH_B}` }),
      ],
    };
    expectCode(() => parseRetroInstalledLibrary(invalidId), "INVALID_LIBRARY");

    const withPath = clone({
      schemaVersion: 1,
      generation: 1,
      entries: [installedEntry(HASH_A)],
    }) as unknown as {
      entries: Array<{ provenance: Record<string, unknown> }>;
    };
    withPath.entries[0]!.provenance.sourcePath = "E:\\Tetris.gb";
    expectCode(
      () => parseRetroInstalledLibrary(withPath),
      "UNKNOWN_OR_MISSING_FIELD",
    );
  });

  it("rejects invisible, directional, and non-portable Unicode in names, paths, and titles", () => {
    const unsafeCharacters = [
      "\u0085",
      "\u00ad",
      "\u200b",
      "\u2028",
      "\u202e",
      "\u2066",
      "\ufeff",
      "\ud800",
    ];

    for (const unsafe of unsafeCharacters) {
      const plain = clone(baseCandidate);
      plain.sourceName = `Game${unsafe}.gb`;
      expectCode(() => parseRetroImportCandidate(plain), "UNSAFE_NAME");

      const archive = clone(baseCandidate);
      archive.sourceName = "Games.zip";
      archive.inspection = {
        kind: "archive",
        format: "zip",
        expandedBytes: 1_024,
        entries: [
          {
            relativeName: `folder/Game${unsafe}.gb`,
            sizeBytes: 1_024,
            sha256: HASH_B,
          },
        ],
      };
      expectCode(
        () => parseRetroImportCandidate(archive),
        "UNSAFE_ARCHIVE_PATH",
      );

      const library: RetroInstalledLibrary = {
        schemaVersion: 1,
        generation: 1,
        entries: [installedEntry(HASH_A, { title: `Game${unsafe}` })],
      };
      expectCode(() => parseRetroInstalledLibrary(library), "INVALID_LIBRARY");
    }
  });

  it("counts installed-title limits in Unicode scalars like JSON Schema and Rust", () => {
    const exact = parseRetroInstalledLibrary({
      schemaVersion: 1,
      generation: 1,
      entries: [installedEntry(HASH_A, { title: "🎮".repeat(80) })],
    });
    expect(exact.entries[0]?.title).toBe("🎮".repeat(80));

    expectCode(
      () => parseRetroInstalledLibrary({
        schemaVersion: 1,
        generation: 1,
        entries: [installedEntry(HASH_A, { title: "🎮".repeat(81) })],
      }),
      "INVALID_STRING",
    );
  });
});

describe("shared USB and paired-LAN planning", () => {
  it("emits the exact plain-install intent consumed by the native host", () => {
    const payload = Buffer.from(plainInstallFixture.payloadUtf8, "utf8");
    const payloadSha256 = createHash("sha256").update(payload).digest("hex");
    expect(payload.byteLength).toBe(38);
    expect(payloadSha256).toBe(
      plainInstallFixture.intent.sourceSha256,
    );

    const request = clone(baseRequest);
    request.library.generation = 1;
    request.candidate.sourceName = "Interop_Fixture.gb";
    request.candidate.receivedBytes = payload.byteLength;
    request.candidate.receivedSha256 = payloadSha256;
    request.candidate.scan.subjectSha256 = payloadSha256;
    request.nowMs = plainInstallFixture.nowMs;

    expect(plainInstallFixture.policy).toEqual({
      policyId: basePolicy.policyId,
      policyRevision: basePolicy.revision,
      systemId: basePolicy.systems[0]!.id,
      extension: ".gb",
      coreId: basePolicy.systems[0]!.defaultCoreId,
      controllerProfile: basePolicy.systems[0]!.controllerProfile,
      maxContentBytes: basePolicy.systems[0]!.maxContentBytes,
      maxLibraryEntries: basePolicy.maxLibraryEntries,
      maxLibraryBytes: basePolicy.maxLibraryBytes,
    });

    const coordinator = new RetroImportCoordinator(basePolicy);
    const plan = coordinator.plan(request);
    expect(plan.inspectionId).toBe(plainInstallFixture.inspectionId);
    expect(plan.expiresAtMs).toBe(plainInstallFixture.planExpiresAtMs);
    expect(
      coordinator.authorize(plan, { action: "install" }, request.nowMs + 1),
    ).toEqual(plainInstallFixture.intent);
  });

  it("plans and authorizes a plain USB import without retaining source names", () => {
    const coordinator = new RetroImportCoordinator(basePolicy);
    const plan = coordinator.plan(baseRequest);

    expect(plan).toMatchObject({
      status: "ready",
      transport: "usb",
      sourceHandle: SOURCE_HANDLE,
      sourceSha256: HASH_A,
      systemId: "game-boy",
      peakStagingBytes: 1_024,
      allowedDecisions: ["cancel", "install"],
      entry: {
        entryId: `content-${HASH_A}`,
        extension: ".gb",
        title: "Tetris",
        coreId: "gambatte",
        controllerProfile: "retropad-standard-v1",
      },
    });
    expect(JSON.stringify(plan)).not.toContain("Tetris.gb");
    expect(JSON.stringify(plan)).not.toContain("usb-session-authority");
    expect(JSON.stringify(plan)).not.toContain("player-one");
    expect(Object.isFrozen(plan.entry.provenance)).toBe(true);

    const intent = coordinator.authorize(plan, { action: "install" }, NOW + 1);
    expect(intent).toMatchObject({
      action: "install-new",
      sourceHandle: SOURCE_HANDLE,
      installEntry: plan.entry,
      existingEntryId: null,
      cleanupStagingAfterTerminal: true,
      audit: {
        event: "retro-import-terminal-intent",
        decision: "install",
        contentSha256: HASH_A,
      },
    });
    expect(JSON.stringify(intent)).not.toContain("Tetris.gb");
  });

  it("uses the identical planner for a bounded paired-LAN session", () => {
    const request = clone(baseRequest);
    request.session.transport = "paired-lan";
    request.session.authorityId = "paired-session-authority";
    request.candidate.transport = "paired-lan";

    const plan = new RetroImportCoordinator(basePolicy).plan(request);
    expect(plan.transport).toBe("paired-lan");
    expect(plan.entry.provenance.transport).toBe("paired-lan");
    expect(plan.allowedDecisions).toEqual(["cancel", "install"]);
  });

  it("rejects family-mode denial and invalid entitlement timing", () => {
    const familyDenied = clone(baseRequest);
    familyDenied.session.familyMode = "imports-denied";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(familyDenied),
      "FAMILY_MODE_DENIED",
    );

    const staleEntitlement = clone(baseRequest);
    staleEntitlement.session.entitlement.acceptedAtMs =
      staleEntitlement.session.openedAtMs - 1;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(staleEntitlement),
      "ENTITLEMENT_TIME_INVALID",
    );

    const longSession = clone(baseRequest);
    longSession.session.expiresAtMs =
      longSession.session.openedAtMs + basePolicy.maxSessionMs + 1;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(longSession),
      "SESSION_TOO_LONG",
    );
  });

  it("rejects inactive, cross-session, and cross-transport candidates", () => {
    const expired = clone(baseRequest);
    expired.nowMs = expired.session.expiresAtMs;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(expired),
      "SESSION_INACTIVE",
    );

    const crossSession = clone(baseRequest);
    crossSession.candidate.sessionId = `ris-${"8".repeat(32)}`;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(crossSession),
      "CANDIDATE_SESSION_MISMATCH",
    );

    const crossTransport = clone(baseRequest);
    crossTransport.candidate.transport = "paired-lan";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(crossTransport),
      "CANDIDATE_SESSION_MISMATCH",
    );
  });

  it("requires exact clean scan binding and a supported system/extension", () => {
    for (const status of ["blocked", "error"] as const) {
      const request = clone(baseRequest);
      request.candidate.scan.status = status;
      expectCode(
        () => new RetroImportCoordinator(basePolicy).plan(request),
        "SCAN_NOT_CLEAN",
      );
    }

    const wrongHash = clone(baseRequest);
    wrongHash.candidate.scan.subjectSha256 = HASH_B;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(wrongHash),
      "SCAN_NOT_CLEAN",
    );

    const wrongInspection = clone(baseRequest);
    wrongInspection.candidate.scan.inspectionId = `rii-${"4".repeat(32)}`;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(wrongInspection),
      "SCAN_NOT_CLEAN",
    );

    const unsupportedSystem = clone(baseRequest);
    unsupportedSystem.candidate.requestedSystemId = "unknown-console";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(unsupportedSystem),
      "SYSTEM_UNSUPPORTED",
    );

    const unsupportedExtension = clone(baseRequest);
    unsupportedExtension.candidate.sourceName = "Tetris.exe";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(unsupportedExtension),
      "EXTENSION_UNSUPPORTED",
    );
  });
});

describe("bounded archive inspection", () => {
  function archiveRequest(): RetroImportRequest {
    const request = clone(baseRequest);
    request.candidate.sourceName = "Tetris.zip";
    request.candidate.receivedBytes = 600;
    request.candidate.receivedSha256 = HASH_B;
    request.candidate.scan.subjectSha256 = HASH_B;
    request.candidate.inspection = {
      kind: "archive",
      format: "zip",
      expandedBytes: 1_024,
      entries: [
        {
          relativeName: "games/Tetris.gb",
          sizeBytes: 1_024,
          sha256: HASH_A,
        },
      ],
    };
    return request;
  }

  it("accepts one inspected regular payload and accounts archive plus expansion", () => {
    const plan = new RetroImportCoordinator(basePolicy).plan(archiveRequest());
    expect(plan).toMatchObject({
      status: "ready",
      sourceSha256: HASH_B,
      peakStagingBytes: 1_624,
      entry: {
        sha256: HASH_A,
        sizeBytes: 1_024,
        extension: ".gb",
        title: "Tetris",
      },
    });
  });

  it("rejects traversal, absolute, backslash, reserved, and colliding paths", () => {
    for (const [relativeName, code] of [
      ["../Tetris.gb", "UNSAFE_NAME"],
      ["/Tetris.gb", "UNSAFE_ARCHIVE_PATH"],
      [String.raw`folder\Tetris.gb`, "UNSAFE_ARCHIVE_PATH"],
      ["folder/CON.gb", "UNSAFE_NAME"],
      ["folder/Tetris.gb ", "UNSAFE_NAME"],
    ] as const) {
      const request = archiveRequest();
      const inspection = request.candidate.inspection;
      if (inspection.kind !== "archive") throw new Error("archive expected");
      inspection.entries[0]!.relativeName = relativeName;
      expectCode(
        () => parseRetroImportCandidate(request.candidate),
        code,
      );
    }

    const collision = archiveRequest();
    if (collision.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    collision.candidate.inspection.entries.push({
      relativeName: "GAMES/tetris.GB",
      sizeBytes: 1_024,
      sha256: HASH_C,
    });
    collision.candidate.inspection.expandedBytes = 2_048;
    expectCode(
      () => parseRetroImportCandidate(collision.candidate),
      "INVALID_CANDIDATE",
    );

    const compatibilityCollision = archiveRequest();
    if (compatibilityCollision.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    compatibilityCollision.candidate.inspection.entries.push({
      relativeName: "games/Tetris．gb",
      sizeBytes: 1_024,
      sha256: HASH_C,
    });
    compatibilityCollision.candidate.inspection.expandedBytes = 2_048;
    expectCode(
      () => parseRetroImportCandidate(compatibilityCollision.candidate),
      "INVALID_CANDIDATE",
    );
  });

  it("rejects expansion bombs, nested archives, and multi-file archives", () => {
    const bomb = archiveRequest();
    if (bomb.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    bomb.candidate.receivedBytes = 10;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(bomb),
      "ARCHIVE_LIMIT_EXCEEDED",
    );

    const nested = archiveRequest();
    if (nested.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    nested.candidate.inspection.entries[0]!.relativeName = "nested.zip";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(nested),
      "NESTED_ARCHIVE_DENIED",
    );

    const multi = archiveRequest();
    if (multi.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    multi.candidate.inspection.entries.push({
      relativeName: "manual.txt",
      sizeBytes: 10,
      sha256: HASH_C,
    });
    multi.candidate.inspection.expandedBytes += 10;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(multi),
      "ARCHIVE_MULTI_FILE_UNSUPPORTED",
    );
  });

  it("rejects mismatched archive extension and expanded-byte accounting", () => {
    const extension = archiveRequest();
    extension.candidate.sourceName = "Tetris.7z";
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(extension),
      "ARCHIVE_EXTENSION_MISMATCH",
    );

    const bytes = archiveRequest();
    if (bytes.candidate.inspection.kind !== "archive") {
      throw new Error("archive expected");
    }
    bytes.candidate.inspection.expandedBytes += 1;
    expectCode(
      () => parseRetroImportCandidate(bytes.candidate),
      "INVALID_CANDIDATE",
    );
  });
});

describe("duplicates, conflicts, quotas, and terminal authority", () => {
  it("deduplicates by system and full hash without requiring staging capacity", () => {
    const request = clone(baseRequest);
    request.library.entries.push(installedEntry(HASH_A));
    request.capacity.freeBytes = 0;
    request.capacity.reservedBytes = 0;

    const coordinator = new RetroImportCoordinator(basePolicy);
    const plan = coordinator.plan(request);
    expect(plan).toMatchObject({
      status: "duplicate",
      peakStagingBytes: 0,
      existingEntryIds: [`content-${HASH_A}`],
      allowedDecisions: ["cancel", "use-existing"],
    });

    const intent = coordinator.authorize(
      plan,
      { action: "use-existing" },
      NOW + 1,
    );
    expect(intent).toMatchObject({
      action: "reuse-existing",
      installEntry: null,
      existingEntryId: `content-${HASH_A}`,
    });
  });

  it("fails closed when one hash is assigned to another system", () => {
    const request = clone(baseRequest);
    request.library.entries.push(
      installedEntry(HASH_A, {
        systemId: "game-boy-color",
      }),
    );
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(request),
      "HASH_SYSTEM_CONFLICT",
    );
  });

  it("requires an explicit exact target for same-title conflicts", () => {
    const request = clone(baseRequest);
    request.candidate.receivedSha256 = HASH_B;
    request.candidate.scan.subjectSha256 = HASH_B;
    request.library.entries.push(installedEntry(HASH_A));

    const coordinator = new RetroImportCoordinator(basePolicy);
    const plan = coordinator.plan(request);
    expect(plan).toMatchObject({
      status: "conflict",
      existingEntryIds: [`content-${HASH_A}`],
      replaceableEntryIds: [`content-${HASH_A}`],
      allowedDecisions: ["cancel", "keep-both", "replace-existing"],
    });

    expectCode(
      () =>
        coordinator.authorize(
          plan,
          { action: "replace-existing", entryId: `content-${HASH_C}` },
          NOW + 1,
        ),
      "REPLACEMENT_NOT_ALLOWED",
    );

    const intent = coordinator.authorize(
      plan,
      { action: "replace-existing", entryId: `content-${HASH_A}` },
      NOW + 1,
    );
    expect(intent).toMatchObject({
      action: "replace-existing",
      existingEntryId: `content-${HASH_A}`,
      installEntry: { sha256: HASH_B },
    });
  });

  it("offers replacement but not Keep Both when the library byte quota is tight", () => {
    const policy = clone(basePolicy);
    policy.maxLibraryBytes = 2_500;
    const request = clone(baseRequest);
    request.candidate.receivedSha256 = HASH_B;
    request.candidate.scan.subjectSha256 = HASH_B;
    request.library.entries.push(installedEntry(HASH_A));

    const plan = new RetroImportCoordinator(policy).plan(request);
    expect(plan.allowedDecisions).toEqual([
      "cancel",
      "replace-existing",
    ]);
  });

  it("rejects insufficient staging capacity, entry quota, and size limits", () => {
    const capacity = clone(baseRequest);
    capacity.capacity.freeBytes = 1_100;
    capacity.capacity.reservedBytes = 100;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(capacity),
      "INSUFFICIENT_CAPACITY",
    );

    const quotaPolicy = clone(basePolicy);
    quotaPolicy.maxLibraryEntries = 1;
    const quota = clone(baseRequest);
    quota.library.entries.push(
      installedEntry(HASH_B, { title: "Other Game" }),
    );
    expectCode(
      () => new RetroImportCoordinator(quotaPolicy).plan(quota),
      "LIBRARY_QUOTA_EXCEEDED",
    );

    const largePolicy = clone(basePolicy);
    largePolicy.systems[0]!.maxContentBytes = 100;
    expectCode(
      () => new RetroImportCoordinator(largePolicy).plan(baseRequest),
      "CONTENT_TOO_LARGE",
    );
  });

  it("fails closed when quota or expiry arithmetic would overflow", () => {
    const quotaPolicy = clone(basePolicy);
    quotaPolicy.maxSourceBytes = Number.MAX_SAFE_INTEGER;
    quotaPolicy.maxLibraryBytes = Number.MAX_SAFE_INTEGER;
    quotaPolicy.systems[0]!.maxContentBytes = Number.MAX_SAFE_INTEGER;
    const quota = clone(baseRequest);
    quota.library.entries.push(
      installedEntry(HASH_B, {
        title: "Other Game",
        sizeBytes: Number.MAX_SAFE_INTEGER - 512,
      }),
    );
    quota.capacity.freeBytes = Number.MAX_SAFE_INTEGER;
    quota.capacity.reservedBytes = 0;
    expectCode(
      () => new RetroImportCoordinator(quotaPolicy).plan(quota),
      "CAPACITY_OVERFLOW",
    );

    const expiry = clone(baseRequest);
    expiry.session.openedAtMs = Number.MAX_SAFE_INTEGER - 100;
    expiry.session.entitlement.acceptedAtMs = Number.MAX_SAFE_INTEGER - 99;
    expiry.session.expiresAtMs = Number.MAX_SAFE_INTEGER;
    expiry.nowMs = Number.MAX_SAFE_INTEGER - 50;
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(expiry),
      "CAPACITY_OVERFLOW",
    );
  });

  it("rejects cloned plans, invalid decisions, and terminal replay", () => {
    const coordinator = new RetroImportCoordinator(basePolicy);
    const plan = coordinator.plan(baseRequest);

    expectCode(
      () => coordinator.authorize(clone(plan), { action: "install" }, NOW + 1),
      "PLAN_NOT_ISSUED",
    );
    expectCode(
      () => coordinator.authorize(plan, { action: "keep-both" }, NOW + 1),
      "DECISION_NOT_ALLOWED",
    );
    coordinator.authorize(plan, { action: "install" }, NOW + 1);
    expectCode(
      () => coordinator.authorize(plan, { action: "install" }, NOW + 2),
      "PLAN_CONSUMED",
    );
  });

  it("permits exact cleanup cancellation after expiry or session revocation", () => {
    const expiredCoordinator = new RetroImportCoordinator(basePolicy);
    const expiredPlan = expiredCoordinator.plan(baseRequest);
    const expiredIntent = expiredCoordinator.authorize(
      expiredPlan,
      { action: "cancel" },
      expiredPlan.expiresAtMs,
    );
    expect(expiredIntent.action).toBe("cancel-and-cleanup");

    const revokedCoordinator = new RetroImportCoordinator(basePolicy);
    const revokedPlan = revokedCoordinator.plan(baseRequest);
    revokedCoordinator.revokeSession(SESSION_ID);
    expectCode(
      () =>
        revokedCoordinator.authorize(
          revokedPlan,
          { action: "install" },
          NOW + 1,
        ),
      "SESSION_REVOKED",
    );
    const cleanup = revokedCoordinator.authorize(
      revokedPlan,
      { action: "cancel" },
      NOW + 2,
    );
    expect(cleanup).toMatchObject({
      action: "cancel-and-cleanup",
      cleanupStagingAfterTerminal: true,
    });
  });

  it("rejects installed-library drift from the active signed policy", () => {
    const request = clone(baseRequest);
    request.library.entries.push(
      installedEntry(HASH_B, { coreId: "substituted-core" }),
    );
    expectCode(
      () => new RetroImportCoordinator(basePolicy).plan(request),
      "LIBRARY_POLICY_MISMATCH",
    );
  });
});
