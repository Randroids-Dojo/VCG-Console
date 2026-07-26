import { describe, expect, it } from "vitest";
import {
  assessPlayerControlAvailability,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MotionPoseSimulator,
  PLAYER_CONTROL_REQUIRED_LANDMARKS,
  PlayerControlAvailabilitySchema,
  playerControlAvailabilityJsonSchema,
} from "../src";

function player() {
  return new MotionPoseSimulator().frame(0, 0).players[0]!;
}

function hide(names: readonly string[]) {
  const value = structuredClone(player());
  for (const landmark of value.coreLandmarks) {
    if (names.includes(landmark.name)) landmark.observed = false;
  }
  return value;
}

describe("player control availability", () => {
  it("reports a complete ready player without adding thresholds", () => {
    expect(assessPlayerControlAvailability(player(), "ready")).toEqual({
      schemaVersion: 1,
      playerId: "simulator-player-1",
      state: "full",
      reason: "ready",
      regions: {
        head: "observed",
        torso: "observed",
        leftArm: "observed",
        rightArm: "observed",
        leftLeg: "observed",
        rightLeg: "observed",
      },
      controls: {
        menuSelect: true,
        menuBackPause: true,
        menuSwipe: true,
        gameDodge: true,
        gameDuck: true,
        gameJump: true,
      },
      missingLandmarks: [],
    });
  });

  it("suppresses only controls that require a missing arm", () => {
    const result = assessPlayerControlAvailability(
      hide(["left_elbow", "left_wrist"]),
      "ready",
    );
    expect(result).toMatchObject({
      state: "partial",
      reason: "landmarks-missing",
      regions: { leftArm: "partial", rightArm: "observed" },
      controls: {
        menuSelect: false,
        menuBackPause: false,
        menuSwipe: false,
        gameDodge: true,
        gameDuck: true,
        gameJump: true,
      },
    });
  });

  it("keeps unrelated shell and movement controls when ankles are missing", () => {
    const result = assessPlayerControlAvailability(
      hide(["left_ankle", "right_ankle"]),
      "ready",
    );
    expect(result.controls).toEqual({
      menuSelect: true,
      menuBackPause: true,
      menuSwipe: true,
      gameDodge: true,
      gameDuck: true,
      gameJump: false,
    });
    expect(result.regions).toMatchObject({ leftLeg: "partial", rightLeg: "partial" });
  });

  it("blocks every action when global tracker health is not ready", () => {
    const result = assessPlayerControlAvailability(player(), "degraded");
    expect(result).toMatchObject({
      state: "unavailable",
      reason: "tracker-not-ready",
      regions: { head: "observed", torso: "observed" },
    });
    expect(Object.values(result.controls)).toEqual([false, false, false, false, false, false]);
  });

  it("reports an absent player without fabricating a body region", () => {
    const result = assessPlayerControlAvailability(undefined, "ready");
    expect(result).toMatchObject({
      playerId: null,
      state: "unavailable",
      reason: "player-missing",
    });
    expect(result.missingLandmarks).toEqual(CORE_LANDMARK_NAMES);
    expect(Object.values(result.regions)).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
      "missing",
      "missing",
    ]);
  });

  it("exports exact control requirements and a versioned schema", () => {
    expect(PLAYER_CONTROL_REQUIRED_LANDMARKS.gameJump).toEqual([
      "left_hip",
      "right_hip",
      "left_ankle",
      "right_ankle",
    ]);
    expect(PlayerControlAvailabilitySchema.parse(
      assessPlayerControlAvailability(player(), "ready"),
    ).schemaVersion).toBe(1);
    expect(playerControlAvailabilityJsonSchema).toMatchObject({
      $id: "urn:vcg:schema:player-control-availability:1",
      title: "VCG player control availability v1",
    });
    expect(playerControlAvailabilityJsonSchema.$comment).toContain(
      "does not grant action authority",
    );
    expect(MOTION_API_SCHEMA_VERSION).toBe("0.4.0");
  });
});
