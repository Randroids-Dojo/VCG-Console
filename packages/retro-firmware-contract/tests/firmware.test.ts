import { describe, expect, it } from "vitest";

import {
  authorizeFirmwareLaunch,
  evaluateFirmwareReadiness,
  parseFirmwareInventory,
  parseFirmwareInventoryJson,
  parseFirmwarePolicy,
  parseFirmwarePolicyJson,
  RETRO_FIRMWARE_MAX_INVENTORY_ENTRIES,
  RETRO_FIRMWARE_MAX_JSON_BYTES,
  RETRO_FIRMWARE_MAX_REQUIREMENTS,
} from "../src/index.js";

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);

function policy(
  requirements: readonly Record<string, unknown>[] = [],
  overrides: Record<string, unknown> = {},
) {
  return parseFirmwarePolicy({
    schemaVersion: 1,
    policyId: "playstation-firmware-v1",
    revision: 1,
    systemId: "playstation",
    coreId: "beetle-psx",
    requirements,
    ...overrides,
  });
}

function requirement(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "firmware-a",
    sha256: digestA,
    required: true,
    acquisition: "user-supplied-only",
    rightsStatus: "restricted-or-unverified",
    licenseExpression: "NOASSERTION",
    documentationId: "playstation-firmware-help",
    ...overrides,
  };
}

function inventory(
  entries: readonly Record<string, unknown>[] = [],
  overrides: Record<string, unknown> = {},
) {
  return parseFirmwareInventory({
    schemaVersion: 1,
    generation: 7,
    systemId: "playstation",
    coreId: "beetle-psx",
    entries,
    ...overrides,
  });
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "firmware-a",
    sha256: digestA,
    scanStatus: "clean",
    ...overrides,
  };
}

describe("retro firmware readiness", () => {
  it("allows a contentless core with no firmware requirements", () => {
    const selectedPolicy = policy();
    const installed = inventory();
    const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
    expect(readiness).toMatchObject({
      status: "ready",
      diagnosticCode: "firmware-ready-no-requirements",
      userActionCodes: [],
    });
    expect(
      authorizeFirmwareLaunch(readiness, selectedPolicy, installed),
    ).toMatchObject({ requiredFirmware: [], inventoryGeneration: 7 });
  });

  it("binds an exact clean required firmware identity into launch", () => {
    const selectedPolicy = policy([requirement()]);
    const installed = inventory([entry()]);
    const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
    expect(readiness.diagnosticCode).toBe("firmware-ready");
    expect(
      authorizeFirmwareLaunch(readiness, selectedPolicy, installed),
    ).toMatchObject({
      policyId: "playstation-firmware-v1",
      policyRevision: 1,
      systemId: "playstation",
      coreId: "beetle-psx",
      inventoryGeneration: 7,
      requiredFirmware: [{ id: "firmware-a", sha256: digestA }],
    });
  });

  it("blocks missing, mismatched, and unsafe required firmware", () => {
    const selectedPolicy = policy([requirement()]);
    const cases = [
      [inventory(), "missingRequiredIds"],
      [inventory([entry({ sha256: digestB })]), "mismatchedRequiredIds"],
      [inventory([entry({ scanStatus: "blocked" })]), "unsafeRequiredIds"],
      [inventory([entry({ scanStatus: "unavailable" })]), "unsafeRequiredIds"],
    ] as const;
    for (const [installed, field] of cases) {
      const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
      expect(readiness.status).toBe("blocked");
      expect(readiness[field]).toEqual(["firmware-a"]);
      expect(() =>
        authorizeFirmwareLaunch(readiness, selectedPolicy, installed),
      ).toThrow(/not ready/u);
    }
  });

  it("reports optional attention without blocking launch", () => {
    const selectedPolicy = policy([
      requirement({
        id: "firmware-optional",
        required: false,
      }),
    ]);
    const installed = inventory();
    const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
    expect(readiness).toMatchObject({
      status: "ready",
      diagnosticCode: "firmware-ready-optional-attention",
      missingOptionalIds: ["firmware-optional"],
      userActionCodes: [
        "open-reviewed-firmware-help",
        "select-local-firmware-files",
      ],
    });
    expect(
      authorizeFirmwareLaunch(readiness, selectedPolicy, installed)
        .requiredFirmware,
    ).toEqual([]);
  });

  it("rejects duplicate, unsorted, excessive, or unsafe identities", () => {
    expect(() =>
      policy([requirement({ id: "firmware-b" }), requirement()]),
    ).toThrow(/sorted/u);
    expect(() =>
      policy([requirement(), requirement()]),
    ).toThrow(/unique/u);
    expect(() =>
      policy(
        Array.from({ length: RETRO_FIRMWARE_MAX_REQUIREMENTS + 1 }, (_, i) =>
          requirement({ id: `firmware-${String(i).padStart(3, "0")}` }),
        ),
      ),
    ).toThrow();
    expect(() =>
      inventory(
        Array.from(
          { length: RETRO_FIRMWARE_MAX_INVENTORY_ENTRIES + 1 },
          (_, i) => entry({ id: `firmware-${String(i).padStart(3, "0")}` }),
        ),
      ),
    ).toThrow();
    expect(() =>
      policy([requirement({ id: "../firmware" })]),
    ).toThrow();
  });

  it("rejects paths, filenames, URLs, display names, bytes, and unknown policy", () => {
    for (const [field, value] of [
      ["path", "system/scph.bin"],
      ["filename", "scph.bin"],
      ["downloadUrl", "https://example.test/firmware"],
      ["displayName", "Console BIOS"],
      ["data", "base64"],
      ["sourceDevice", "usb-1"],
    ] as const) {
      expect(() =>
        policy([requirement({ [field]: value })]),
      ).toThrow();
      expect(() =>
        inventory([entry({ [field]: value })]),
      ).toThrow();
    }
  });

  it("never bundles restricted or unreviewed firmware", () => {
    expect(() =>
      policy([
        requirement({
          acquisition: "bundled-by-console",
          rightsStatus: "restricted-or-unverified",
        }),
      ]),
    ).toThrow(/approved redistribution/u);
    expect(() =>
      policy([
        requirement({
          acquisition: "bundled-by-console",
          rightsStatus: "approved-redistributable",
        }),
      ]),
    ).not.toThrow();
  });

  it("rejects system/core scope confusion", () => {
    const selectedPolicy = policy([requirement()]);
    expect(() =>
      evaluateFirmwareReadiness(
        selectedPolicy,
        inventory([entry()], { systemId: "saturn" }),
      ),
    ).toThrow(/scope/u);
    expect(() =>
      evaluateFirmwareReadiness(
        selectedPolicy,
        inventory([entry()], { coreId: "wrong-core" }),
      ),
    ).toThrow(/scope/u);
  });

  it("rejects cloned, stale-policy, and stale-inventory launch authority", () => {
    const selectedPolicy = policy([requirement()]);
    const installed = inventory([entry()]);
    const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
    expect(() =>
      authorizeFirmwareLaunch(
        structuredClone(readiness),
        selectedPolicy,
        installed,
      ),
    ).toThrow(/exact current/u);
    expect(() =>
      authorizeFirmwareLaunch(
        readiness,
        policy([requirement()], { revision: 2 }),
        installed,
      ),
    ).toThrow(/exact current/u);
    expect(() =>
      authorizeFirmwareLaunch(
        readiness,
        selectedPolicy,
        inventory([entry()], { generation: 8 }),
      ),
    ).toThrow(/exact current/u);
  });

  it("requires branded parsed policy and inventory objects", () => {
    const selectedPolicy = policy([requirement()]);
    const installed = inventory([entry()]);
    expect(() =>
      evaluateFirmwareReadiness(
        structuredClone(selectedPolicy),
        installed,
      ),
    ).toThrow(/parsed authority/u);
    expect(() =>
      evaluateFirmwareReadiness(
        selectedPolicy,
        structuredClone(installed),
      ),
    ).toThrow(/parsed authority/u);
  });

  it("accepts only bounded canonical UTF-8 JSON", () => {
    const policyValue = {
      schemaVersion: 1,
      policyId: "no-firmware-v1",
      revision: 1,
      systemId: "contentless",
      coreId: "core",
      requirements: [],
    };
    const canonical = new TextEncoder().encode(
      `${JSON.stringify(policyValue, null, 2)}\n`,
    );
    expect(parseFirmwarePolicyJson(canonical).policyId).toBe(
      "no-firmware-v1",
    );
    expect(() =>
      parseFirmwarePolicyJson(
        new TextEncoder().encode(JSON.stringify(policyValue)),
      ),
    ).toThrow(/canonical/u);
    expect(() =>
      parseFirmwarePolicyJson(
        new Uint8Array(RETRO_FIRMWARE_MAX_JSON_BYTES + 1),
      ),
    ).toThrow(/byte size/u);
    expect(() =>
      parseFirmwareInventoryJson(
        new TextEncoder().encode(
          '{"schemaVersion":1,"generation":0,"generation":1}\n',
        ),
      ),
    ).toThrow();
  });

  it("returns deeply frozen path-free stable diagnostics", () => {
    const selectedPolicy = policy([requirement()]);
    const installed = inventory();
    const readiness = evaluateFirmwareReadiness(selectedPolicy, installed);
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.missingRequiredIds)).toBe(true);
    const serialized = JSON.stringify(readiness);
    for (const forbidden of [
      "path",
      "filename",
      "download",
      "displayName",
      "sourceDevice",
      "base64",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
