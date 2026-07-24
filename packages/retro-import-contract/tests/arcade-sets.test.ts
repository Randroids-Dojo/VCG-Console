import { describe, expect, it } from "vitest";

import {
  authorizeArcadeSetLaunch,
  evaluateArcadeSetReadiness,
  parseArcadeSetInventory,
  parseArcadeSetInventoryJson,
  parseArcadeSetPolicy,
  parseArcadeSetPolicyJson,
} from "../src/arcade-sets.js";

const parentHash = "a".repeat(64);
const cloneHash = "b".repeat(64);

const titles = [
  {
    titleId: "fixture-clone",
    setId: "fixture-clone-set",
    relationship: "clone",
    parentSetId: "fixture-parent-set",
    setSha256: cloneHash,
    parentSha256: parentHash,
    rightsStatus: "rights-cleared-test",
  },
  {
    titleId: "fixture-parent",
    setId: "fixture-parent-set",
    relationship: "parent",
    parentSetId: null,
    setSha256: parentHash,
    parentSha256: null,
    rightsStatus: "rights-cleared-test",
  },
] as const;

function policy(overrides: Record<string, unknown> = {}) {
  return parseArcadeSetPolicy({
    schemaVersion: 1,
    policyId: "arcade-fixture-v1",
    revision: 1,
    coreId: "mame-fixture",
    coreVersion: "0.999",
    setVersion: "0.999-merged",
    titles,
    ...overrides,
  });
}

function inventory(
  entries: readonly Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
) {
  return parseArcadeSetInventory({
    schemaVersion: 1,
    generation: 4,
    coreId: "mame-fixture",
    coreVersion: "0.999",
    setVersion: "0.999-merged",
    entries,
    ...overrides,
  });
}

const parent = {
  setId: "fixture-parent-set",
  sha256: parentHash,
  scanStatus: "clean",
} as const;
const clone = {
  setId: "fixture-clone-set",
  sha256: cloneHash,
  scanStatus: "clean",
} as const;

describe("arcade parent/clone preflight", () => {
  it("authorizes an exact rights-cleared parent fixture", () => {
    const selected = policy();
    const installed = inventory([parent]);
    const ready = evaluateArcadeSetReadiness(
      selected,
      installed,
      "fixture-parent",
    );
    expect(ready.status).toBe("ready");
    expect(authorizeArcadeSetLaunch(ready, selected, installed).requiredSets)
      .toEqual([{ setId: "fixture-parent-set", sha256: parentHash }]);
  });

  it("requires both exact parent and clone sets", () => {
    const selected = policy();
    const installed = inventory([clone, parent]);
    const ready = evaluateArcadeSetReadiness(
      selected,
      installed,
      "fixture-clone",
    );
    expect(ready.status).toBe("ready");
    expect(authorizeArcadeSetLaunch(ready, selected, installed).requiredSets)
      .toEqual([
        { setId: "fixture-parent-set", sha256: parentHash },
        { setId: "fixture-clone-set", sha256: cloneHash },
      ]);
  });

  it("diagnoses missing clone or parent independently", () => {
    const selected = policy();
    expect(
      evaluateArcadeSetReadiness(
        selected,
        inventory([parent]),
        "fixture-clone",
      ).missingSetIds,
    ).toEqual(["fixture-clone-set"]);
    expect(
      evaluateArcadeSetReadiness(
        selected,
        inventory([clone]),
        "fixture-clone",
      ).missingSetIds,
    ).toEqual(["fixture-parent-set"]);
  });

  it("diagnoses wrong-hash and unsafe sets without launch", () => {
    const selected = policy();
    const installed = inventory([
      { ...clone, sha256: "c".repeat(64) },
      { ...parent, scanStatus: "blocked" },
    ]);
    const result = evaluateArcadeSetReadiness(
      selected,
      installed,
      "fixture-clone",
    );
    expect(result.mismatchedSetIds).toEqual(["fixture-clone-set"]);
    expect(result.unsafeSetIds).toEqual(["fixture-parent-set"]);
    expect(() => authorizeArcadeSetLaunch(result, selected, installed))
      .toThrow(/not ready/u);
  });

  it("rejects core, core-version, and set-version confusion", () => {
    const selected = policy();
    for (const overrides of [
      { coreId: "wrong-core" },
      { coreVersion: "1.000" },
      { setVersion: "1.000-merged" },
    ]) {
      expect(() =>
        evaluateArcadeSetReadiness(
          selected,
          inventory([], overrides),
          "fixture-parent",
        ),
      ).toThrow(/scope/u);
    }
  });

  it("rejects invalid parent/clone graphs and ambiguous ordering", () => {
    expect(() =>
      policy({
        titles: [{ ...titles[0], parentSetId: "fixture-clone-set" }],
      }),
    ).toThrow(/distinct/u);
    expect(() => policy({ titles: [...titles].reverse() })).toThrow(/sorted/u);
    expect(() => policy({ titles: [titles[1], titles[1]] })).toThrow();
  });

  it("rejects paths, names, URLs, bytes, and unknown authority fields", () => {
    for (const field of [
      "path",
      "filename",
      "displayName",
      "downloadUrl",
      "data",
    ]) {
      expect(() =>
        policy({ titles: [{ ...titles[1], [field]: "forbidden" }] }),
      ).toThrow(/unknown/u);
      expect(() =>
        inventory([{ ...parent, [field]: "forbidden" }]),
      ).toThrow(/unknown/u);
    }
  });

  it("rejects clones and stale parsed authorities", () => {
    const selected = policy();
    const installed = inventory([parent]);
    const ready = evaluateArcadeSetReadiness(
      selected,
      installed,
      "fixture-parent",
    );
    expect(() =>
      authorizeArcadeSetLaunch(
        structuredClone(ready),
        selected,
        installed,
      ),
    ).toThrow(/exact current/u);
    expect(() =>
      authorizeArcadeSetLaunch(
        ready,
        policy({ revision: 2 }),
        installed,
      ),
    ).toThrow(/exact current/u);
    expect(() =>
      authorizeArcadeSetLaunch(
        ready,
        selected,
        inventory([parent], { generation: 5 }),
      ),
    ).toThrow(/exact current/u);
  });

  it("refuses unknown titles and unparsed authority clones", () => {
    const selected = policy();
    const installed = inventory([parent]);
    expect(() =>
      evaluateArcadeSetReadiness(selected, installed, "unknown"),
    ).toThrow(/absent/u);
    expect(() =>
      evaluateArcadeSetReadiness(
        structuredClone(selected),
        installed,
        "fixture-parent",
      ),
    ).toThrow(/parsed/u);
  });

  it("accepts only bounded canonical JSON", () => {
    const policyValue = structuredClone(policy());
    const inventoryValue = structuredClone(inventory([parent]));
    expect(
      parseArcadeSetPolicyJson(
        new TextEncoder().encode(`${JSON.stringify(policyValue, null, 2)}\n`),
      ).policyId,
    ).toBe("arcade-fixture-v1");
    expect(
      parseArcadeSetInventoryJson(
        new TextEncoder().encode(
          `${JSON.stringify(inventoryValue, null, 2)}\n`,
        ),
      ).generation,
    ).toBe(4);
    expect(() =>
      parseArcadeSetPolicyJson(
        new TextEncoder().encode(JSON.stringify(policyValue)),
      ),
    ).toThrow(/canonical/u);
  });
});
