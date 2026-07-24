import { describe, expect, it } from "vitest";
import {
  MAX_PLAYER_SESSION_ACTION_COMPLETIONS,
  MAX_PLAYER_SESSION_VISIBLE_TRACKS,
  PlayerSessionController,
} from "./player-session";

function joinedController(maxPlayers: 1 | 2 = 1): PlayerSessionController {
  const session = new PlayerSessionController({ maxPlayers });
  session.observe(0, maxPlayers === 1 ? ["track-a"] : ["track-a", "track-b"]);
  session.join("track-a");
  if (maxPlayers === 2) session.join("track-b");
  return session;
}

describe("PlayerSessionController", () => {
  it("assigns visible candidates sequentially and never by passive detection", () => {
    const session = new PlayerSessionController({ maxPlayers: 2 });
    session.observe(0, ["track-b", "track-a"]);
    expect(session.snapshot().players).toEqual([]);
    expect(session.join("track-b")).toEqual({
      type: "player-joined",
      slot: 1,
      trackId: "track-b",
    });
    expect(session.join("track-a")).toEqual({
      type: "player-joined",
      slot: 2,
      trackId: "track-a",
    });
    expect(() => session.join("spectator")).toThrow("visible candidate");
  });

  it("leaves only deliberately and treats re-entry as a fresh assignment", () => {
    const session = joinedController(2);

    expect(session.leave(1)).toEqual({
      type: "player-left",
      slot: 1,
      trackId: "track-a",
      remainingSlots: [2],
    });
    expect(session.snapshot()).toMatchObject({
      phase: "playing",
      launcherOwner: 2,
      players: [{ slot: 2, trackId: "track-b" }],
    });
    expect(session.authorizeGameplayAction("track-a")).toBeUndefined();
    expect(session.join("track-a")).toEqual({
      type: "player-joined",
      slot: 1,
      trackId: "track-a",
    });
    expect(session.snapshot()).toMatchObject({
      launcherOwner: 2,
      players: [
        { slot: 1, trackId: "track-a" },
        { slot: 2, trackId: "track-b" },
      ],
    });

    session.leave(2);
    expect(session.leave(1)).toEqual({
      type: "player-left",
      slot: 1,
      trackId: "track-a",
      remainingSlots: [],
    });
    expect(session.snapshot()).toEqual({
      phase: "setup",
      players: [],
    });
    expect(() => session.leave(1)).toThrow("session phase is setup");
  });

  it("rejects unknown-slot or overlay leave attempts without changing the roster", () => {
    const session = joinedController(2);
    expect(() => session.leave(3 as 1)).toThrow("valid player slot");
    session.openPause([{ slot: 1, completedAtMs: 100 }]);
    expect(() => session.leave(2)).toThrow("session phase is paused");
    expect(session.snapshot()).toMatchObject({
      phase: "paused",
      players: [{ slot: 1 }, { slot: 2 }],
    });
  });

  it("requires sustained multi-update loss evidence before freezing everyone", () => {
    const session = joinedController(2);
    expect(session.observe(100, ["track-a", "track-b"])).toEqual([]);
    expect(session.observe(200, ["track-a"])).toEqual([]);
    expect(session.observe(499, ["track-a"])).toEqual([]);
    expect(session.observe(500, ["track-a"])).toEqual([
      { type: "freeze", reason: "tracking-loss", lostSlots: [2] },
    ]);
    expect(session.snapshot()).toMatchObject({
      phase: "frozen",
      players: [
        { slot: 1, presence: "joined" },
        { slot: 2, presence: "reacquiring" },
      ],
    });
  });

  it("silently resumes only when every lost session track returns in time", () => {
    const session = joinedController(2);
    session.observe(100, ["track-a", "track-b"]);
    session.observe(200, []);
    session.observe(500, []);
    expect(session.observe(1_000, ["track-a", "spectator"])).toEqual([]);
    expect(session.snapshot().phase).toBe("frozen");
    expect(session.observe(1_100, ["track-a", "track-b"])).toEqual([
      { type: "silent-recovery", recoveredSlots: [2] },
    ]);
    expect(session.snapshot().phase).toBe("playing");
  });

  it("opens recovery after the same-track window and never auto-resumes afterward", () => {
    const session = joinedController();
    session.observe(100, ["track-a"]);
    session.observe(200, []);
    session.observe(500, []);
    expect(session.observe(2_499, ["spectator"])).toEqual([]);
    expect(session.observe(2_500, ["spectator"])).toEqual([
      { type: "show-recovery", lostSlots: [1] },
    ]);
    expect(session.observe(2_600, ["track-a", "spectator"])).toEqual([]);
    expect(session.snapshot()).toMatchObject({
      phase: "recovery",
      players: [{ slot: 1, presence: "awaiting-resume", visible: true }],
    });
  });

  it("allows deliberate one-player candidate takeover only from recovery", () => {
    const session = joinedController();
    session.observe(100, ["track-a"]);
    session.observe(200, []);
    session.observe(500, []);
    session.observe(2_500, ["track-c"]);
    expect(session.resumeRecovery("track-c")).toEqual({
      type: "recovery-resumed",
      ownerSlot: 1,
      takeover: true,
      removedSlots: [],
    });
    expect(session.snapshot()).toMatchObject({
      phase: "playing",
      players: [{ slot: 1, trackId: "track-c", presence: "joined" }],
    });
  });

  it("requires every retained multiplayer track or explicit roster reduction", () => {
    const session = joinedController(2);
    session.observe(100, ["track-a", "track-b"]);
    session.observe(200, ["track-b"]);
    session.observe(500, ["track-b"]);
    session.observe(2_500, ["track-b"]);
    expect(() => session.resumeRecovery("track-b")).toThrow("every retained");
    expect(session.resumeRecovery("track-b", [2])).toEqual({
      type: "recovery-resumed",
      ownerSlot: 2,
      takeover: false,
      removedSlots: [1],
    });
    expect(session.snapshot()).toMatchObject({
      launcherOwner: 2,
      players: [{ slot: 2, trackId: "track-b" }],
    });
  });

  it("awards simultaneous pause to the earliest completion then lower slot", () => {
    const session = joinedController(2);
    expect(
      session.openPause([
        { slot: 2, completedAtMs: 1_000 },
        { slot: 1, completedAtMs: 1_000 },
      ]),
    ).toEqual({ type: "pause-opened", ownerSlot: 1 });
    expect(session.openPause([{ slot: 2, completedAtMs: 1_001 }])).toBeUndefined();
    expect(() => session.closePause(2, "game")).toThrow("pause owner");
    expect(session.closePause(1, "launcher")).toEqual({
      type: "pause-closed",
      ownerSlot: 1,
      destination: "launcher",
    });
    expect(session.snapshot()).toMatchObject({ phase: "playing", launcherOwner: 1 });
  });

  it("binds gameplay and pause authority to an exact visible joined track", () => {
    const session = joinedController(2);
    session.observe(100, ["track-a", "track-b", "spectator", "pet"]);

    expect(session.authorizeGameplayAction("track-a")).toBe(1);
    expect(session.authorizeGameplayAction("track-b")).toBe(2);
    expect(session.authorizeGameplayAction("spectator")).toBeUndefined();
    expect(session.authorizeGameplayAction("pet")).toBeUndefined();
    expect(
      session.openPauseForTracks([
        { trackId: "spectator", completedAtMs: 90 },
        { trackId: "track-b", completedAtMs: 100 },
        { trackId: "track-a", completedAtMs: 100 },
      ]),
    ).toEqual({ type: "pause-opened", ownerSlot: 1 });
    expect(session.authorizeGameplayAction("track-a")).toBeUndefined();
  });

  it("withholds action authority during loss confirmation and recovery", () => {
    const session = joinedController();
    session.observe(100, []);
    expect(session.authorizeGameplayAction("track-a")).toBeUndefined();
    session.observe(400, []);
    expect(session.snapshot().phase).toBe("frozen");
    expect(session.authorizeGameplayAction("track-a")).toBeUndefined();
    session.observe(2_400, ["passerby"]);
    expect(session.snapshot().phase).toBe("recovery");
    expect(session.authorizeGameplayAction("track-a")).toBeUndefined();
    expect(session.authorizeGameplayAction("passerby")).toBeUndefined();
  });

  it("preserves a manual pause through short loss and replaces it after expiry", () => {
    const session = joinedController();
    session.openPause([{ slot: 1, completedAtMs: 100 }]);
    session.observe(200, []);
    expect(session.observe(500, [])).toEqual([
      { type: "freeze", reason: "tracking-loss", lostSlots: [1] },
    ]);
    expect(session.observe(1_000, ["track-a"])).toEqual([
      { type: "silent-recovery", recoveredSlots: [1] },
    ]);
    expect(session.snapshot()).toMatchObject({ phase: "paused", overlayOwner: 1 });

    session.observe(1_100, []);
    session.observe(1_400, []);
    expect(session.observe(3_400, [])).toEqual([
      { type: "show-recovery", lostSlots: [1] },
    ]);
    expect(session.snapshot()).toMatchObject({ phase: "recovery" });
    expect(session.snapshot().overlayOwner).toBeUndefined();
  });

  it("hard faults and clock regression fail closed immediately", () => {
    const session = joinedController();
    expect(session.observe(100, ["track-a"], { hardFault: true })).toEqual([
      { type: "freeze", reason: "hard-fault", lostSlots: [1] },
    ]);
    expect(session.observe(200, [], { hardFault: true })).toEqual([]);
    expect(session.observe(50, ["track-a"])).toEqual([
      { type: "freeze", reason: "clock-regression", lostSlots: [1] },
    ]);
    expect(session.snapshot().phase).toBe("frozen");
  });

  it("rejects ambiguous observations and invalid timing configuration", () => {
    expect(() => new PlayerSessionController({ lossConfirmationMs: 0 })).toThrow(
      "lossConfirmationMs",
    );
    const session = new PlayerSessionController();
    expect(() => session.observe(0, ["same", "same"])).toThrow("duplicate");
    expect(() => session.observe(Number.NaN, [])).toThrow("nowMs");
    expect(() =>
      session.observe(
        0,
        Array.from(
          { length: MAX_PLAYER_SESSION_VISIBLE_TRACKS + 1 },
          (_, index) => `track-${index}`,
        ),
      ),
    ).toThrow("visible tracks");
    expect(() =>
      session.openPauseForTracks(
        Array.from(
          { length: MAX_PLAYER_SESSION_ACTION_COMPLETIONS + 1 },
          (_, index) => ({
            trackId: `track-${index}`,
            completedAtMs: index,
          }),
        ),
      ),
    ).toThrow("track action completions");
  });
});
