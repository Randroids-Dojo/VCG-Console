import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_PROGRESS_DEMO_ENTRIES,
  UNASSIGNED_PROGRESS_MAX_ENTRIES,
  UnassignedProgressConflictError,
  UnassignedProgressController,
  UnassignedProgressError,
  type UnassignedProgressEntry,
} from "./unassigned-progress";

function entry(
  overrides: Partial<UnassignedProgressEntry> = {},
): UnassignedProgressEntry {
  return {
    ...UNASSIGNED_PROGRESS_DEMO_ENTRIES[0]!,
    ...overrides,
  };
}

describe("UnassignedProgressController", () => {
  it("accepts a bounded closed sanitized record set and returns immutable copies", () => {
    const source = entry();
    const controller = new UnassignedProgressController([source]);
    const snapshot = controller.snapshot();

    expect(snapshot.revision).toBe(0);
    expect(snapshot.entries).toEqual([source]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    expect(Object.isFrozen(snapshot.entries[0])).toBe(true);
    source.gameTitle = "Changed outside";
    expect(controller.snapshot().entries[0]?.gameTitle).toBe("Obstacle");
    expect(JSON.stringify(snapshot)).not.toContain("profile-randy");
  });

  it("rejects unknown fields, unsafe IDs, duplicate owners, invalid boundaries, and excessive counts", () => {
    expect(
      () =>
        new UnassignedProgressController([
          { ...entry(), portrait: "data:image/png;base64,secret" } as never,
        ]),
    ).toThrow("closed schema");
    expect(
      () => new UnassignedProgressController([entry({ slotId: "../profile" })]),
    ).toThrow("invalid slot ID");
    expect(
      () =>
        new UnassignedProgressController([
          entry(),
          entry({ id: "second-entry" }),
        ]),
    ).toThrow("duplicate unassigned owner");
    expect(
      () =>
        new UnassignedProgressController([
          entry({ hostedProgressBoundary: "hosted-service-separate" }),
        ]),
    ).toThrow("local entries cannot claim a hosted boundary");
    expect(
      () =>
        new UnassignedProgressController(
          Array.from({ length: UNASSIGNED_PROGRESS_MAX_ENTRIES + 1 }, (_, index) =>
            entry({
              id: `entry-${index}`,
              ownerId: index.toString(16).padStart(32, "0"),
            }),
          ),
        ),
    ).toThrow("too many");
  });

  it("creates a path-free play intent without changing ownership", () => {
    const controller = new UnassignedProgressController([entry()]);
    const plan = controller.planPlay("obstacle-main");

    expect(plan).toEqual({
      kind: "play",
      expectedRevision: 0,
      entryId: "obstacle-main",
      gameId: "obstacle",
      slotId: "main-slot",
      runtime: "local-web",
      owner: {
        kind: "unassigned",
        id: "0123456789abcdef0123456789abcdef",
      },
      hostedProgressBoundary: "none",
    });
    expect(JSON.stringify(plan)).not.toMatch(/[A-Z]:\\|\/home\/|profile-randy/);
    expect(controller.snapshot().entries).toHaveLength(1);
    expect(() =>
      new UnassignedProgressController([
        entry({ compatibility: "package-unavailable" }),
      ]).planPlay("obstacle-main"),
    ).toThrow("not currently playable");
  });

  it("requires an explicit claim resolution and enforces keep-both capability", () => {
    const profileSlot = {
      profileId: "profile-randy",
      gameId: "obstacle",
      slotId: "main-slot",
    };
    const controller = new UnassignedProgressController([entry()], [profileSlot]);

    expect(controller.inspectClaim("obstacle-main", "profile-randy")).toEqual({
      conflict: true,
      keepBothAvailable: false,
    });
    expect(() => controller.planClaim("obstacle-main", "profile-randy")).toThrow(
      UnassignedProgressConflictError,
    );
    expect(() =>
      controller.planClaim("obstacle-main", "profile-randy", "keep-both"),
    ).toThrow("does not support");

    const plan = controller.planClaim(
      "obstacle-main",
      "profile-randy",
      "replace",
    );
    expect(plan.destination).toBe("same-slot");
    expect(controller.commit(plan)).toMatchObject({
      revision: 1,
      entries: [],
    });
  });

  it("supports a deliberate additional-slot resolution without overwriting the conflict", () => {
    const controller = new UnassignedProgressController(
      [entry({ supportsAdditionalSlot: true })],
      [{
        profileId: "profile-randy",
        gameId: "obstacle",
        slotId: "main-slot",
      }],
    );
    const plan = controller.planClaim(
      "obstacle-main",
      "profile-randy",
      "keep-both",
    );

    expect(plan.destination).toBe("additional-slot");
    expect(controller.commit(plan).entries).toHaveLength(0);
  });

  it("rejects stale confirmations and never infers a claim from a display name", () => {
    const controller = new UnassignedProgressController([
      entry(),
      entry({
        id: "second-entry",
        ownerId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        gameId: "second-game",
      }),
    ]);
    const stale = controller.planDelete("second-entry");
    controller.commit(controller.planClaim("obstacle-main", "profile-guest"));

    expect(() => controller.commit(stale)).toThrow("confirmation is stale");
    expect(controller.snapshot().entries.map((candidate) => candidate.id)).toEqual([
      "second-entry",
    ]);
    expect(() =>
      controller.planClaim("second-entry", "Randy" as never),
    ).toThrow("invalid profile ID");
  });

  it("permanently removes only the confirmed record from the prototype model", () => {
    const controller = new UnassignedProgressController([
      entry(),
      entry({
        id: "second-entry",
        ownerId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        gameId: "second-game",
      }),
    ]);
    const plan = controller.planDelete("obstacle-main");

    expect(plan).toEqual({
      kind: "delete",
      expectedRevision: 0,
      entryId: "obstacle-main",
      gameId: "obstacle",
      slotId: "main-slot",
    });
    expect(Object.keys(plan)).not.toContain("export");
    expect(controller.commit(plan).entries.map((candidate) => candidate.id)).toEqual([
      "second-entry",
    ]);
    expect(() => controller.commit(plan)).toThrow(UnassignedProgressError);
  });

  it("rejects runtime-forged mutation fields and unknown plan authority", () => {
    const controller = new UnassignedProgressController([entry()]);
    const deletion = controller.planDelete("obstacle-main");
    expect(() =>
      controller.commit({
        ...deletion,
        gameId: "different-game",
      }),
    ).toThrow("delete scope");
    expect(() =>
      controller.commit({
        ...deletion,
        exportPath: "D:\\save.zip",
      } as never),
    ).toThrow("closed schema");

    const conflictController = new UnassignedProgressController(
      [entry({ supportsAdditionalSlot: true })],
      [{
        profileId: "profile-randy",
        gameId: "obstacle",
        slotId: "main-slot",
      }],
    );
    const claim = conflictController.planClaim(
      "obstacle-main",
      "profile-randy",
      "keep-both",
    );
    expect(() =>
      conflictController.commit({
        ...claim,
        destination: "same-slot",
      }),
    ).toThrow("does not match");
    expect(() =>
      controller.commit({
        kind: "archive",
        expectedRevision: 0,
        entryId: "obstacle-main",
      } as never),
    ).toThrow("invalid mutation-plan kind");
  });
});
