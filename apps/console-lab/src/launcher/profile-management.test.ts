import { describe, expect, it } from "vitest";
import { AcceptedPortraitCollection } from "./portrait-capture";
import {
  PROFILE_MANAGEMENT_CONFIRMATION_DELAY_MS,
  PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS,
  PROFILE_MANAGEMENT_DEMO_PROFILES,
  PROFILE_MANAGEMENT_DEMO_PROGRESS,
  PROFILE_MANAGEMENT_MAX_PROFILES,
  ProfileManagementController,
  ProfileManagementError,
  type ManagedProfileSeed,
} from "./profile-management";

function controller(
  portraits = new AcceptedPortraitCollection(),
): ProfileManagementController {
  return new ProfileManagementController(
    PROFILE_MANAGEMENT_DEMO_PROFILES,
    PROFILE_MANAGEMENT_DEMO_PROGRESS,
    portraits,
  );
}

describe("ProfileManagementController", () => {
  it("accepts only bounded closed records and returns immutable minimized summaries", () => {
    const source: ManagedProfileSeed = {
      ...PROFILE_MANAGEMENT_DEMO_PROFILES[0]!,
    };
    const manager = new ProfileManagementController(
      [source],
      [PROFILE_MANAGEMENT_DEMO_PROGRESS[0]!],
    );
    const snapshot = manager.snapshot();

    expect(snapshot).toEqual({
      revision: 0,
      profiles: [{
        ...source,
        portraitPresent: false,
        linkedLocalProgressCount: 1,
        hostedServiceCount: 0,
      }],
      unassignedLocalProgressCount: 0,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.profiles)).toBe(true);
    expect(Object.isFrozen(snapshot.profiles[0])).toBe(true);
    source.name = "Changed outside";
    expect(manager.snapshot().profiles[0]?.name).toBe("Randy");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /ownerId|path|portraitRenderHandle|image|face|credential/i,
    );
  });

  it("rejects unknown fields, unsafe identifiers, orphaned links, and excessive state", () => {
    expect(() =>
      new ProfileManagementController(
        [{
          ...PROFILE_MANAGEMENT_DEMO_PROFILES[0]!,
          password: "secret",
        } as never],
        [],
      ),
    ).toThrow("closed schema");
    expect(() =>
      new ProfileManagementController(
        [{
          ...PROFILE_MANAGEMENT_DEMO_PROFILES[0]!,
          id: "../profile",
        }],
        [],
      ),
    ).toThrow("profile ID");
    expect(() =>
      new ProfileManagementController(
        PROFILE_MANAGEMENT_DEMO_PROFILES,
        [{
          ...PROFILE_MANAGEMENT_DEMO_PROGRESS[0]!,
          profileId: "profile-missing",
        }],
      ),
    ).toThrow("unknown profile");
    expect(() =>
      new ProfileManagementController(
        Array.from(
          { length: PROFILE_MANAGEMENT_MAX_PROFILES + 1 },
          (_, index): ManagedProfileSeed => ({
            id: `profile-${index}`,
            name: `Player ${index}`,
            detail: "Local player",
            calibrationRevision: null,
            bodyProfilePresent: false,
          }),
        ),
        [],
      ),
    ).toThrow("too many local profiles");
    expect(() =>
      new ProfileManagementController(
        PROFILE_MANAGEMENT_DEMO_PROFILES,
        [{
          ...PROFILE_MANAGEMENT_DEMO_PROGRESS[0]!,
          runtime: "native",
          hostedServiceSeparate: true,
        }],
      ),
    ).toThrow("cannot claim a hosted-service boundary");
  });

  it("creates and renames with opaque identity while allowing duplicate display names", () => {
    const manager = controller();
    const create = manager.planCreate("  Randy  ");
    expect(create).toMatchObject({
      kind: "create-profile",
      expectedRevision: 0,
      profileId: "profile-local-3",
      name: "Randy",
    });
    const created = manager.commit(create, 0);
    expect(created.snapshot.profiles.filter(
      (profile) => profile.name === "Randy",
    )).toHaveLength(2);

    const rename = manager.planRename("profile-guest", "Randy");
    const renamed = manager.commit(rename, 1);
    expect(renamed.snapshot.profiles.filter(
      (profile) => profile.name === "Randy",
    )).toHaveLength(3);
    expect(manager.progressOwnerKind("guest-godot-campaign")).toEqual({
      kind: "profile",
      profileId: "profile-guest",
    });
  });

  it("requires an elapsed confirmation delay, expires old plans, and rejects time rollback", () => {
    const manager = controller();
    const plan = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      100,
    );
    expect(plan.confirmAfterMs).toBe(
      100 + PROFILE_MANAGEMENT_CONFIRMATION_DELAY_MS,
    );
    expect(() =>
      manager.commit(plan, plan.confirmAfterMs - 1),
    ).toThrow("not armed");

    const expiring = controller();
    const expiringPlan = expiring.planDestructive(
      "reset-profile",
      "profile-randy",
      10,
    );
    expect(() =>
      expiring.commit(
        expiringPlan,
        expiringPlan.confirmAfterMs
          + PROFILE_MANAGEMENT_CONFIRMATION_TTL_MS
          + 1,
      ),
    ).toThrow("expired");

    const backwards = controller();
    backwards.planDestructive("reset-profile", "profile-randy", 10);
    expect(() =>
      backwards.planDestructive("delete-profile", "profile-randy", 9),
    ).toThrow("clock moved backwards");
  });

  it("recalibration invalidates calibration and body matching but preserves portrait and progress", () => {
    const portraits = new AcceptedPortraitCollection([{
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-profile-randy-a",
    }]);
    const manager = controller(portraits);
    const plan = manager.planDestructive(
      "recalibrate-profile",
      "profile-randy",
      0,
    );
    const result = manager.commit(plan, plan.confirmAfterMs);
    const profile = result.snapshot.profiles.find(
      (candidate) => candidate.id === "profile-randy",
    );

    expect(profile).toMatchObject({
      calibrationRevision: null,
      bodyProfilePresent: false,
      portraitPresent: true,
      linkedLocalProgressCount: 2,
    });
    expect(result.disposition).toMatchObject({
      removedPortraitRenderHandle: null,
      calibrationCleared: true,
      bodyProfileRemoved: true,
      unassignedProgressCount: 0,
      preservedLinkedProgressCount: 2,
      hostedServicesUnaffected: 1,
    });
    expect(manager.progressOwnerKind("randy-obstacle-main")).toEqual({
      kind: "profile",
      profileId: "profile-randy",
    });
  });

  it("applies one exact synthetic calibration result without creating body-match authority", () => {
    const portraits = new AcceptedPortraitCollection([{
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-profile-randy-a",
    }]);
    const manager = controller(portraits);
    const plan = manager.planApplyCalibration({
      id: "calibration-fixture-4-2",
      profileId: "profile-randy",
      sessionId: 4,
      attempt: 2,
      limited: false,
    });
    const result = manager.commit(plan, 0);
    const profile = result.snapshot.profiles.find(
      (candidate) => candidate.id === "profile-randy",
    );

    expect(profile).toMatchObject({
      calibrationRevision: 8,
      bodyProfilePresent: false,
      portraitPresent: true,
      linkedLocalProgressCount: 2,
    });
    expect(result.disposition).toMatchObject({
      operation: "apply-calibration",
      bodyProfileRemoved: true,
      unassignedProgressCount: 0,
      preservedLinkedProgressCount: 2,
    });
    expect(() => manager.commit(plan, 1)).toThrow(
      "confirmation is stale",
    );
    expect(() => controller().planApplyCalibration({
      id: "calibration-fixture-4-3",
      profileId: "profile-randy",
      sessionId: 4,
      attempt: 2,
      limited: false,
    })).toThrow("identity mismatch");
  });

  it("reset removes sensitive identity data while preserving the profile and linked progress", () => {
    const portraits = new AcceptedPortraitCollection([{
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-profile-randy-a",
    }]);
    const manager = controller(portraits);
    const plan = manager.planDestructive(
      "reset-profile",
      "profile-randy",
      0,
    );
    const result = manager.commit(plan, plan.confirmAfterMs);
    const profile = result.snapshot.profiles.find(
      (candidate) => candidate.id === "profile-randy",
    );

    expect(profile).toMatchObject({
      name: "Randy",
      calibrationRevision: null,
      bodyProfilePresent: false,
      portraitPresent: false,
      linkedLocalProgressCount: 2,
    });
    expect(portraits.portraitFor("profile-randy")).toBeNull();
    expect(result.disposition).toMatchObject({
      removedPortraitRenderHandle: "portrait-fixture-profile-randy-a",
      unassignedProgressCount: 0,
      preservedLinkedProgressCount: 2,
    });
  });

  it("delete removes the profile and sensitive data but unassigns every local progress link", () => {
    const portraits = new AcceptedPortraitCollection([{
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-profile-randy-a",
    }]);
    const manager = controller(portraits);
    const plan = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );
    const result = manager.commit(plan, plan.confirmAfterMs);

    expect(result.snapshot.profiles.map((profile) => profile.id)).toEqual([
      "profile-guest",
    ]);
    expect(result.snapshot.unassignedLocalProgressCount).toBe(2);
    expect(portraits.portraitFor("profile-randy")).toBeNull();
    expect(manager.progressOwnerKind("randy-obstacle-main")).toEqual({
      kind: "unassigned",
    });
    expect(manager.progressOwnerKind("randy-vibebots-local")).toEqual({
      kind: "unassigned",
    });
    expect(result.disposition).toMatchObject({
      calibrationCleared: true,
      bodyProfileRemoved: true,
      unassignedProgressCount: 2,
      preservedLinkedProgressCount: 0,
      hostedServicesUnaffected: 1,
    });
  });

  it("never reattaches unassigned progress when the same display name is recreated", () => {
    const manager = controller();
    const deletion = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );
    manager.commit(deletion, deletion.confirmAfterMs);
    const recreation = manager.planCreate("Randy");
    const result = manager.commit(recreation, deletion.confirmAfterMs + 1);

    expect(recreation.profileId).not.toBe("profile-randy");
    expect(result.snapshot.profiles.some(
      (profile) =>
        profile.name === "Randy"
        && profile.linkedLocalProgressCount === 0,
    )).toBe(true);
    expect(manager.progressOwnerKind("randy-obstacle-main")).toEqual({
      kind: "unassigned",
    });
  });

  it("allows deleting the final profile into an empty metadata-only state", () => {
    const portraits = new AcceptedPortraitCollection([{
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-profile-randy-a",
    }]);
    const manager = new ProfileManagementController(
      [PROFILE_MANAGEMENT_DEMO_PROFILES[0]!],
      [],
      portraits,
    );
    const deletion = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );
    const deleted = manager.commit(deletion, deletion.confirmAfterMs);

    expect(deleted.snapshot.profiles).toEqual([]);
    expect(deleted.snapshot.unassignedLocalProgressCount).toBe(0);
    expect(portraits.portraitFor("profile-randy")).toBeNull();
    const create = manager.planCreate("Randy");
    expect(create.profileId).not.toBe("profile-randy");
    expect(manager.commit(
      create,
      deletion.confirmAfterMs + 1,
    ).snapshot.profiles).toHaveLength(1);
  });

  it("rejects stale, forged, and externally changed confirmation scope", () => {
    const manager = controller();
    const stale = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );
    manager.commit(manager.planRename("profile-guest", "Visitor"), 1);
    expect(() =>
      manager.commit(stale, stale.confirmAfterMs),
    ).toThrow("confirmation is stale");

    const forgedManager = controller();
    const plan = forgedManager.planDestructive(
      "reset-profile",
      "profile-randy",
      0,
    );
    expect(() =>
      forgedManager.commit({
        ...plan,
        exportPath: "C:\\portrait.png",
      } as never, plan.confirmAfterMs),
    ).toThrow("closed schema");

    const portraits = new AcceptedPortraitCollection();
    const changedManager = controller(portraits);
    const changed = changedManager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );
    portraits.replaceExact(
      "profile-randy",
      null,
      "portrait-fixture-profile-randy-late",
    );
    expect(() =>
      changedManager.commit(changed, changed.confirmAfterMs),
    ).toThrow("scope changed");
  });

  it("plans disclose exact bounded scope without credentials, paths, owner IDs, or sensitive payloads", () => {
    const manager = controller();
    const plan = manager.planDestructive(
      "delete-profile",
      "profile-randy",
      0,
    );

    expect(plan.expectedProgressIds).toEqual([
      "randy-obstacle-main",
      "randy-vibebots-local",
    ]);
    expect(plan.hostedServiceGameIds).toEqual(["vibebots"]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.expectedProgressIds)).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(
      /444444|555555|password|credential|path|pixel|imageData|embedding/i,
    );
    expect(() =>
      manager.planRename("profile-randy", "\u0000Randy"),
    ).toThrow("profile name");
    expect(() =>
      manager.planRename("profile-randy", "Randy\u202e"),
    ).toThrow("profile name");
    expect(() =>
      manager.planDestructive(
        "delete-profile",
        "profile-randy",
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow("safe time");
    expect(() =>
      new ProfileManagementController(
        PROFILE_MANAGEMENT_DEMO_PROFILES,
        [{
          ...PROFILE_MANAGEMENT_DEMO_PROGRESS[0]!,
          ownerPath: "/profiles/randy",
        } as never],
      ),
    ).toThrow(ProfileManagementError);
  });
});
