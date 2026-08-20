import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import {
  parseRetroInstalledLibrary,
  RETRO_IMPORT_ENTITLEMENT_STATEMENT,
  RETRO_OPERATOR_PROVISIONED_TRANSPORT,
  RetroImportError,
  type RetroInstalledEntry,
} from "../src";
import checkedInInstalledLibrarySchema from "../../../schemas/retro-installed-library.schema.json";
import {
  HASH_A,
  HASH_B,
  HASH_C,
  installedEntry,
  libraryOf,
  operatorProvisionedEntry,
} from "./installed-library-fixtures";

const ajv = new Ajv2020({ strict: true });
const validateWithPublishedSchema = ajv.compile(
  checkedInInstalledLibrarySchema,
);

type Verdict = "accepted" | "rejected";

interface CorpusCase {
  readonly name: string;
  readonly document: unknown;
  readonly verdict: Verdict;
}

function schemaVerdict(document: unknown): Verdict {
  return validateWithPublishedSchema(structuredClone(document))
    ? "accepted"
    : "rejected";
}

function parserVerdict(document: unknown): Verdict {
  try {
    parseRetroInstalledLibrary(structuredClone(document));
    return "accepted";
  } catch (error) {
    expect(error).toBeInstanceOf(RetroImportError);
    return "rejected";
  }
}

/** Fails naming every document the two disagree on, and its two verdicts. */
function expectAgreement(cases: readonly CorpusCase[]): void {
  expect(
    cases.map(({ name, document }) => ({
      name,
      schema: schemaVerdict(document),
      parser: parserVerdict(document),
    })),
  ).toEqual(
    cases.map(({ name, verdict }) => ({
      name,
      schema: verdict,
      parser: verdict,
    })),
  );
}

function entryDocument(overrides: Record<string, unknown>): unknown {
  return libraryOf({
    ...installedEntry(HASH_A),
    ...overrides,
  } as RetroInstalledEntry);
}

function provenanceDocument(provenance: unknown): unknown {
  return entryDocument({ provenance });
}

function sessionProvenance(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    transport: "usb",
    importSessionId: `ris-${"9".repeat(32)}`,
    entitlementStatementVersion: RETRO_IMPORT_ENTITLEMENT_STATEMENT,
    importedAtMs: 900_000,
    ...overrides,
  };
}

function withoutField(
  source: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const copy = { ...source };
  delete copy[field];
  return copy;
}

describe("published installed-library schema executed against the parser", () => {
  it("compiles the published Draft 2020-12 document", () => {
    expect(checkedInInstalledLibrarySchema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(typeof validateWithPublishedSchema).toBe("function");
  });

  it("agrees on libraries both accept", () => {
    expectAgreement([
      {
        name: "all three provenance transports",
        document: libraryOf(
          installedEntry(HASH_A),
          installedEntry(HASH_B, {
            provenance: {
              transport: "paired-lan",
              importSessionId: `ris-${"8".repeat(32)}`,
              entitlementStatementVersion: RETRO_IMPORT_ENTITLEMENT_STATEMENT,
              importedAtMs: 800_000,
            },
          }),
          operatorProvisionedEntry(HASH_C),
        ),
        verdict: "accepted",
      },
      { name: "no entries", document: libraryOf(), verdict: "accepted" },
      {
        name: "highest safe generation",
        document: {
          schemaVersion: 1,
          generation: Number.MAX_SAFE_INTEGER,
          entries: [installedEntry(HASH_A)],
        },
        verdict: "accepted",
      },
      {
        // A signed catalog names a library package's system and core with a
        // grammar that excludes ".", so an identifier carrying one could never
        // be bound and is refused here rather than becoming unreachable
        // content. A controller profile, which no package names, still allows
        // it -- see the bindableId definition in the schema.
        name: "dotted core and system IDs",
        document: entryDocument({
          systemId: "game.boy",
          coreId: "gambatte.core",
        }),
        verdict: "rejected",
      },
      {
        name: "title at the 80-scalar ceiling",
        document: entryDocument({ title: "\u{1F3AE}".repeat(80) }),
        verdict: "accepted",
      },
      {
        name: "title with interior spaces and markers",
        document: entryDocument({
          title: "Super Mario Bros. + Duck Hunt (U) [!]",
        }),
        verdict: "accepted",
      },
    ]);
  });

  it("agrees on the transport-tagged provenance union", () => {
    expectAgreement([
      ...[
        { importSessionId: `ris-${"9".repeat(32)}` },
        { entitlementStatementVersion: RETRO_IMPORT_ENTITLEMENT_STATEMENT },
        { importedAtMs: 900_000 },
      ].map((evidence): CorpusCase => ({
        name: `operator-provisioned carrying ${Object.keys(evidence)[0]}`,
        document: provenanceDocument({
          transport: RETRO_OPERATOR_PROVISIONED_TRANSPORT,
          ...evidence,
        }),
        verdict: "rejected",
      })),
      ...[
        "transport",
        "importSessionId",
        "entitlementStatementVersion",
        "importedAtMs",
      ].map((field): CorpusCase => ({
        name: `session-bound missing ${field}`,
        document: provenanceDocument(withoutField(sessionProvenance(), field)),
        verdict: "rejected",
      })),
      {
        name: "session-bound reduced to its transport",
        document: provenanceDocument({ transport: "usb" }),
        verdict: "rejected",
      },
      ...[
        "operator",
        "operator_provisioned",
        "Operator-Provisioned",
        "paired_lan",
        "bluetooth",
        "",
      ].map((transport): CorpusCase => ({
        name: `transport ${JSON.stringify(transport)}`,
        document: provenanceDocument({ transport }),
        verdict: "rejected",
      })),
      {
        name: "provenance as a string",
        document: provenanceDocument("usb"),
        verdict: "rejected",
      },
      {
        name: "provenance as an array",
        document: provenanceDocument([]),
        verdict: "rejected",
      },
    ]);
  });

  it("agrees on unknown fields at every object level", () => {
    expectAgreement([
      {
        name: "unknown library field",
        document: { ...libraryOf(installedEntry(HASH_A)), arbitrary: true },
        verdict: "rejected",
      },
      {
        name: "unknown entry field",
        document: entryDocument({ sourcePath: "E:\\Tetris.gb" }),
        verdict: "rejected",
      },
      {
        name: "unknown session-provenance field",
        document: provenanceDocument(
          sessionProvenance({ sourcePath: "E:\\Tetris.gb" }),
        ),
        verdict: "rejected",
      },
      {
        name: "unknown operator-provisioned field",
        document: provenanceDocument({
          transport: RETRO_OPERATOR_PROVISIONED_TRANSPORT,
          sourcePath: "E:\\Tetris.gb",
        }),
        verdict: "rejected",
      },
    ]);
  });

  it("agrees on missing fields at every object level", () => {
    const library = libraryOf(installedEntry(HASH_A)) as unknown as Record<
      string,
      unknown
    >;
    expectAgreement([
      ...["schemaVersion", "generation", "entries"].map(
        (field): CorpusCase => ({
          name: `library missing ${field}`,
          document: withoutField(library, field),
          verdict: "rejected",
        }),
      ),
      ...[
        "entryId",
        "systemId",
        "sha256",
        "sizeBytes",
        "extension",
        "title",
        "coreId",
        "controllerProfile",
        "provenance",
      ].map((field): CorpusCase => ({
        name: `entry missing ${field}`,
        document: libraryOf(
          withoutField(
            installedEntry(HASH_A) as unknown as Record<string, unknown>,
            field,
          ) as unknown as RetroInstalledEntry,
        ),
        verdict: "rejected",
      })),
    ]);
  });

  it("agrees on bounded scalars and identifier grammars", () => {
    expectAgreement([
      {
        name: "schema version 2",
        document: { schemaVersion: 2, generation: 1, entries: [] },
        verdict: "rejected",
      },
      {
        name: "schema version as text",
        document: { schemaVersion: "1", generation: 1, entries: [] },
        verdict: "rejected",
      },
      {
        name: "generation 0",
        document: { schemaVersion: 1, generation: 0, entries: [] },
        verdict: "rejected",
      },
      {
        name: "fractional generation",
        document: { schemaVersion: 1, generation: 1.5, entries: [] },
        verdict: "rejected",
      },
      {
        name: "generation above the safe-integer ceiling",
        document: {
          schemaVersion: 1,
          generation: Number.MAX_SAFE_INTEGER + 1,
          entries: [],
        },
        verdict: "rejected",
      },
      {
        name: "entries as an object",
        document: { schemaVersion: 1, generation: 1, entries: {} },
        verdict: "rejected",
      },
      {
        name: "entry as a string",
        document: {
          schemaVersion: 1,
          generation: 1,
          entries: ["content-".concat(HASH_A)],
        },
        verdict: "rejected",
      },
      {
        name: "zero-byte entry",
        document: entryDocument({ sizeBytes: 0 }),
        verdict: "rejected",
      },
      {
        name: "extension without a dot",
        document: entryDocument({ extension: "gb" }),
        verdict: "rejected",
      },
      {
        name: "uppercase extension",
        document: entryDocument({ extension: ".GB" }),
        verdict: "rejected",
      },
      {
        name: "extension past eight characters",
        document: entryDocument({ extension: ".gameboy12" }),
        verdict: "rejected",
      },
      {
        name: "uppercase system ID",
        document: entryDocument({ systemId: "Game-Boy" }),
        verdict: "rejected",
      },
      {
        name: "underscored system ID",
        document: entryDocument({ systemId: "game_boy" }),
        verdict: "rejected",
      },
      {
        name: "empty controller profile",
        document: entryDocument({ controllerProfile: "" }),
        verdict: "rejected",
      },
      {
        name: "uppercase content hash",
        document: entryDocument({
          entryId: `content-${HASH_A.toUpperCase()}`,
          sha256: HASH_A.toUpperCase(),
        }),
        verdict: "rejected",
      },
      {
        name: "truncated entry ID",
        document: entryDocument({ entryId: "content-abc123" }),
        verdict: "rejected",
      },
      {
        name: "empty title",
        document: entryDocument({ title: "" }),
        verdict: "rejected",
      },
      {
        name: "title past the 80-scalar ceiling",
        document: entryDocument({ title: "\u{1F3AE}".repeat(81) }),
        verdict: "rejected",
      },
    ]);
  });

  it("agrees on visible titles", () => {
    expectAgreement([
      ...[
        "\u0085",
        "\u00a0",
        "\u00ad",
        "\u061c",
        "\u1680",
        "\u180e",
        "\u200b",
        "\u2028",
        "\u202e",
        "\u202f",
        "\u2060",
        "\u2066",
        "\u3000",
        "\ufeff",
        "\ufff9",
        "\ud800",
        "\u{1bca0}",
        "\u{1d173}",
        "\u{e0001}",
        "\u{e0020}",
      ].map((character): CorpusCase => ({
        name: `title carrying ${JSON.stringify(character)}`,
        document: entryDocument({ title: `Game${character}` }),
        verdict: "rejected",
      })),
      {
        name: "title with a leading space",
        document: entryDocument({ title: " Tetris" }),
        verdict: "rejected",
      },
      {
        name: "title with a trailing space",
        document: entryDocument({ title: "Tetris " }),
        verdict: "rejected",
      },
      {
        name: "title with a forward slash",
        document: entryDocument({ title: "Tetris/Alt" }),
        verdict: "rejected",
      },
      {
        name: "title with a backslash",
        document: entryDocument({ title: "Tetris\\Alt" }),
        verdict: "rejected",
      },
    ]);
  });

  /**
   * Draft 2020-12 has no keyword that compares two sibling values, no keyed
   * uniqueness, and no Unicode normalization. `uniqueItems` would catch only
   * wholly identical entries and costs a pairwise comparison of up to 100,000
   * entries, so it is not used. A consumer validating with the schema alone
   * must repeat these three checks itself.
   */
  it("records the rules the published schema cannot execute", () => {
    const parserOnly: ReadonlyArray<{ name: string; document: unknown }> = [
      {
        name: "entry ID that does not derive from its content hash",
        document: entryDocument({ entryId: `content-${HASH_B}` }),
      },
      {
        name: "two entries with one entry ID",
        document: libraryOf(installedEntry(HASH_A), installedEntry(HASH_A)),
      },
      {
        name: "title that is not NFC-normalized",
        document: entryDocument({ title: "Pokemo\u0301n" }),
      },
    ];

    for (const { name, document } of parserOnly) {
      expect(parserVerdict(document), name).toBe("rejected");
      expect(schemaVerdict(document), name).toBe("accepted");
    }
  });
});
