import { describe, expect, it } from "vitest";
import {
  CONTROLLER_RESERVED_ACTIONS,
  mapControllerSnapshot,
  parseControllerMappingProfile,
} from "../src";

const bindings = [
  { action: "confirm", control: "button:0" },
  { action: "navigate-down", control: "hat:0:down" },
  { action: "navigate-left", control: "hat:0:left" },
  { action: "navigate-right", control: "hat:0:right" },
  { action: "navigate-up", control: "hat:0:up" },
] as const;

function profile(overrides: Record<string, unknown> = {}) {
  return parseControllerMappingProfile({
    schemaVersion: 1,
    mappingId: "fixture-controller-v1",
    revision: 1,
    device: {
      sdlGuid: "a".repeat(32),
      vendorId: "1234",
      productId: "5678",
    },
    scope: "console-and-consenting-games",
    reservedActionsOwnedByHost: ["home", "back", "pause"],
    bindings,
    ...overrides,
  });
}

describe("canonical controller mapping", () => {
  it("maps a complete shell profile deterministically", () => {
    const result = mapControllerSnapshot(profile(), {
      mappingId: "fixture-controller-v1",
      mappingRevision: 1,
      connectionEpoch: 7,
      pressedControls: ["hat:0:right", "button:0"],
    });
    expect(result).toEqual({
      mappingId: "fixture-controller-v1",
      mappingRevision: 1,
      connectionEpoch: 7,
      actions: ["confirm", "navigate-right"],
      unmappedControls: [],
      reservedActionsEmitted: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("reports valid unmapped controls without inventing actions", () => {
    expect(
      mapControllerSnapshot(profile(), {
        mappingId: "fixture-controller-v1",
        mappingRevision: 1,
        connectionEpoch: 1,
        pressedControls: ["button:31"],
      }),
    ).toMatchObject({
      actions: [],
      unmappedControls: ["button:31"],
      reservedActionsEmitted: [],
    });
  });

  it("requires every canonical shell action exactly once", () => {
    expect(() => profile({ bindings: bindings.slice(1) })).toThrow(/confirm/u);
    expect(() =>
      profile({
        bindings: [...bindings, { action: "confirm", control: "button:1" }],
      }),
    ).toThrow(/unique/u);
  });

  it("rejects duplicate physical controls and ambiguous ordering", () => {
    expect(() =>
      profile({
        bindings: bindings.map((binding, index) =>
          index === 1 ? { ...binding, control: "button:0" } : binding,
        ),
      }),
    ).toThrow(/controls must be unique/u);
    expect(() => profile({ bindings: [...bindings].reverse() })).toThrow(
      /action-sorted/u,
    );
  });

  it("cannot map or emit Home, Back, or Pause", () => {
    expect(CONTROLLER_RESERVED_ACTIONS).toEqual(["home", "back", "pause"]);
    for (const action of CONTROLLER_RESERVED_ACTIONS) {
      expect(() =>
        profile({
          bindings: [...bindings, { action, control: "button:1" }],
        }),
      ).toThrow();
    }
    const serialized = JSON.stringify(
      mapControllerSnapshot(profile(), {
        mappingId: "fixture-controller-v1",
        mappingRevision: 1,
        connectionEpoch: 1,
        pressedControls: ["button:1"],
      }),
    );
    expect(serialized).not.toContain('"home"');
    expect(serialized).not.toContain('"back"');
    expect(serialized).not.toContain('"pause"');
  });

  it("rejects mapping ID or revision substitution", () => {
    const selected = profile();
    for (const snapshot of [
      {
        mappingId: "other",
        mappingRevision: 1,
        connectionEpoch: 1,
        pressedControls: [],
      },
      {
        mappingId: "fixture-controller-v1",
        mappingRevision: 2,
        connectionEpoch: 1,
        pressedControls: [],
      },
    ]) {
      expect(() => mapControllerSnapshot(selected, snapshot)).toThrow(
        /authority does not match/u,
      );
    }
  });

  it("rejects clones, duplicate samples, and unknown authority fields", () => {
    const selected = profile();
    expect(() =>
      mapControllerSnapshot(structuredClone(selected), {
        mappingId: "fixture-controller-v1",
        mappingRevision: 1,
        connectionEpoch: 1,
        pressedControls: [],
      }),
    ).toThrow(/exact parsed/u);
    expect(() =>
      mapControllerSnapshot(selected, {
        mappingId: "fixture-controller-v1",
        mappingRevision: 1,
        connectionEpoch: 1,
        pressedControls: ["button:0", "button:0"],
      }),
    ).toThrow(/repeats/u);
    expect(() =>
      profile({ deviceName: "Household controller" }),
    ).toThrow();
  });

  it("rejects unsafe control vocabulary and device identity", () => {
    expect(() =>
      profile({
        bindings: [
          ...bindings.slice(0, -1),
          { action: "navigate-up", control: "../../keyboard" },
        ],
      }),
    ).toThrow();
    expect(() =>
      profile({
        device: {
          sdlGuid: "not-a-guid",
          vendorId: "1234",
          productId: "5678",
        },
      }),
    ).toThrow();
  });

  it("keeps the fixed reserved-action declaration exact", () => {
    expect(() =>
      profile({ reservedActionsOwnedByHost: ["home", "back"] }),
    ).toThrow();
    expect(() =>
      profile({
        reservedActionsOwnedByHost: ["home", "back", "pause", "confirm"],
      }),
    ).toThrow();
  });
});
