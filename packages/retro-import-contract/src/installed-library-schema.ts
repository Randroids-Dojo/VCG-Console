export const RETRO_INSTALLED_LIBRARY_SCHEMA_ID =
  "urn:vcg:schema:retro-installed-library:1" as const;

/**
 * Code points a visible title may never carry, mirroring the runtime validator:
 * controls, surrogates, every whitespace form except U+0020, the invisible
 * formatting and bidirectional-override characters, and the path separators.
 */
const UNSAFE_TITLE_CODE_POINTS = "\\u0000-\\u001f\\u007f-\\u00a0\\u00ad"
  + "\\u061c\\u1680\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f"
  + "\\u2060-\\u2064\\u2066-\\u206f\\u3000\\ufeff\\ufff9-\\ufffb"
  + "\\ud800-\\udfff\\u{1bca0}-\\u{1bca3}\\u{1d173}-\\u{1d17a}"
  + "\\u{e0001}\\u{e0020}-\\u{e007f}/\\\\";

/**
 * Rejects a leading or trailing U+0020 as well, so an accepted title matches
 * the trimmed value the runtime validator requires.
 */
const TITLE_PATTERN = `^[^ ${UNSAFE_TITLE_CODE_POINTS}]`
  + `(?:[^${UNSAFE_TITLE_CODE_POINTS}]*[^ ${UNSAFE_TITLE_CODE_POINTS}])?$`;

export const retroInstalledLibraryJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: RETRO_INSTALLED_LIBRARY_SCHEMA_ID,
  title: "VCG retro installed library v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "generation", "entries"],
  properties: {
    schemaVersion: {
      const: 1,
    },
    generation: {
      type: "integer",
      minimum: 1,
      maximum: 9_007_199_254_740_991,
    },
    entries: {
      type: "array",
      maxItems: 100_000,
      items: {
        $ref: "#/$defs/entry",
      },
    },
  },
  $defs: {
    safeId: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)*$",
    },
    // A signed catalog names the system and core a library package may run,
    // using a grammar that excludes ".". An identifier the library accepted but
    // a package could never bind would be unreachable content, so bindable
    // identifiers are the narrower set. Identifiers no package names, such as a
    // controller profile, keep the wider grammar above.
    bindableId: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    },
    sha256: {
      type: "string",
      pattern: "^[a-f0-9]{64}$",
    },
    entry: {
      type: "object",
      additionalProperties: false,
      required: [
        "entryId",
        "systemId",
        "sha256",
        "sizeBytes",
        "extension",
        "title",
        "coreId",
        "controllerProfile",
        "provenance",
      ],
      properties: {
        entryId: {
          type: "string",
          pattern: "^content-[a-f0-9]{64}$",
        },
        systemId: {
          $ref: "#/$defs/bindableId",
        },
        sha256: {
          $ref: "#/$defs/sha256",
        },
        sizeBytes: {
          type: "integer",
          minimum: 1,
          maximum: 9_007_199_254_740_991,
        },
        extension: {
          type: "string",
          pattern: "^\\.[a-z0-9]{1,8}$",
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 80,
          pattern: TITLE_PATTERN,
        },
        coreId: {
          $ref: "#/$defs/bindableId",
        },
        controllerProfile: {
          $ref: "#/$defs/safeId",
        },
        provenance: {
          $ref: "#/$defs/provenance",
        },
      },
    },
    provenance: {
      oneOf: [
        {
          $ref: "#/$defs/operatorProvisionedProvenance",
        },
        {
          $ref: "#/$defs/sessionProvenance",
        },
      ],
    },
    operatorProvisionedProvenance: {
      type: "object",
      additionalProperties: false,
      required: ["transport"],
      properties: {
        transport: {
          const: "operator-provisioned",
        },
      },
    },
    sessionProvenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "transport",
        "importSessionId",
        "entitlementStatementVersion",
        "importedAtMs",
      ],
      properties: {
        transport: {
          enum: ["paired-lan", "usb"],
        },
        importSessionId: {
          type: "string",
          pattern: "^ris-[a-f0-9]{32}$",
        },
        entitlementStatementVersion: {
          const: "vcg-user-entitled-content-v1",
        },
        importedAtMs: {
          type: "integer",
          minimum: 0,
          maximum: 9_007_199_254_740_991,
        },
      },
    },
  },
} as const;
