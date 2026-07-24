import { describe, expect, it } from "vitest";
import {
  COORDINATE_SPEC_VERSION,
  CORE_LANDMARK_NAMES,
  MOTION_API_SCHEMA_VERSION,
  MOTION_TRACE_MAX_FRAMES,
  MotionTracePlayer,
  MotionTraceV2Schema,
  type MotionFrame,
  type MotionTraceV2,
  type TrackerHealthEvent,
} from "../src";

function frame(sequence: number, atMs: number, playerId = "trace-player-1"): MotionFrame {
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    sourceTimestampMs: atMs,
    inferenceStartedAtMs: atMs,
    inferenceCompletedAtMs: atMs + 1,
    publishedAtMs: atMs + 1,
    health: "ready",
    capabilities: {
      profiles: ["body.core17"],
      maxPlayers: 1,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      coordinateSystem: "image.normalized.top-left",
      timestampQuality: "replay",
    },
    players: [
      {
        id: playerId,
        sessionSlot: 1,
        confidence: 1,
        state: "joined",
        coreLandmarks: CORE_LANDMARK_NAMES.map((name) => ({
          name,
          position: { x: 0.5, y: 0.5 },
          visibility: 1,
          observed: true,
        })),
        bounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
        actions: [],
      },
    ],
  };
}

function health(sequence: number, atMs: number): TrackerHealthEvent {
  return {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source: "synthetic",
    occurredAtMs: atMs,
    status: "ready",
    reason: "healthy",
    controlAvailability: "full",
  };
}

function trace(
  frames: MotionFrame[] = [frame(1, 10), frame(2, 20)],
  healthEvents: TrackerHealthEvent[] = [],
): MotionTraceV2 {
  return {
    format: "vcg-motion-trace",
    formatVersion: 2,
    createdAt: "2026-07-24T12:00:00.000Z",
    containsRawFrames: false,
    privacy: {
      containsRawFrames: false,
      containsAudio: false,
      containsPortraits: false,
      containsProfileIdentifiers: false,
      containsFreeText: false,
      containsDerivedSkeletons: true,
      containsTraceLocalTrackIds: true,
      containsExactExportTime: true,
    },
    retention: {
      volatileFrameLimit: 600,
      volatileHealthEventLimit: 128,
      volatileTrackLimit: 64,
      droppedFrames: 0,
      droppedHealthEvents: 0,
      trackLimitReached: false,
      playerLimitExceeded: false,
      persistentBeforeExport: false,
      exportPersistence: "user-managed-file",
      deletionControl: "clear-volatile-buffer-and-delete-exported-file",
    },
    provenance: {
      motionSchemaVersion: MOTION_API_SCHEMA_VERSION,
      coordinateSpecVersion: COORDINATE_SPEC_VERSION,
      frameSources: ["synthetic"],
      timestampQualities: ["replay"],
      exportedProfiles: ["body.core17"],
    },
    healthEvents,
    frames,
  };
}

describe("MotionTraceV2Schema", () => {
  it("accepts a strict bounded trace and remains replay-compatible", () => {
    const parsed = MotionTraceV2Schema.parse(trace());
    const observed: number[] = [];
    const replay = new MotionTracePlayer(parsed, {
      onFrame: (value) => observed.push(value.sequence),
    });
    replay.play();
    replay.advance(10);
    expect(observed).toEqual([1, 2]);
  });

  it("rejects undeclared envelope fields and non-local player identifiers", () => {
    expect(MotionTraceV2Schema.safeParse({ ...trace(), rawFrame: "forbidden" }).success).toBe(false);
    const nonLocal = trace([frame(1, 10, "profile-123")]);
    expect(MotionTraceV2Schema.safeParse(nonLocal).success).toBe(false);
    expect(MotionTraceV2Schema.safeParse(trace([frame(1, 10, "trace-player-64")])).success).toBe(true);
    expect(MotionTraceV2Schema.safeParse(trace([frame(1, 10, "trace-player-65")])).success).toBe(false);
  });

  it("requires provenance to be sorted, unique, and exact", () => {
    const wrongSource = structuredClone(trace());
    wrongSource.provenance.frameSources = ["replay"];
    expect(MotionTraceV2Schema.safeParse(wrongSource).success).toBe(false);

    const duplicate = structuredClone(trace());
    duplicate.provenance.exportedProfiles = ["body.core17", "body.core17"];
    expect(MotionTraceV2Schema.safeParse(duplicate).success).toBe(false);

    const duplicateFrameProfile = structuredClone(trace());
    duplicateFrameProfile.frames[0]!.capabilities.profiles.push("body.core17");
    expect(MotionTraceV2Schema.safeParse(duplicateFrameProfile).success).toBe(false);
  });

  it("rejects duplicate trace-local IDs or session slots in one frame", () => {
    const duplicateId = trace();
    const repeated = structuredClone(duplicateId.frames[0]!.players[0]!);
    repeated.sessionSlot = 2;
    duplicateId.frames[0]!.players.push(repeated);
    duplicateId.frames[0]!.capabilities.maxPlayers = 2;
    expect(MotionTraceV2Schema.safeParse(duplicateId).success).toBe(false);

    const duplicateSlot = trace();
    const second = structuredClone(duplicateSlot.frames[0]!.players[0]!);
    second.id = "trace-player-2";
    duplicateSlot.frames[0]!.players.push(second);
    duplicateSlot.frames[0]!.capabilities.maxPlayers = 2;
    expect(MotionTraceV2Schema.safeParse(duplicateSlot).success).toBe(false);
  });

  it("rejects reversed frame and health histories", () => {
    expect(MotionTraceV2Schema.safeParse(trace([frame(2, 20), frame(1, 10)])).success).toBe(false);
    expect(
      MotionTraceV2Schema.safeParse(trace(undefined, [health(2, 20), health(1, 10)])).success,
    ).toBe(false);
  });

  it("retains stable health reasons without provider exception text", () => {
    const withHealth = MotionTraceV2Schema.parse(trace(undefined, [health(1, 5)]));
    expect(withHealth.healthEvents).toEqual([
      expect.objectContaining({ status: "ready", reason: "healthy", controlAvailability: "full" }),
    ]);
    expect(JSON.stringify(withHealth)).not.toContain("message");
    expect(JSON.stringify(withHealth)).not.toContain("stack");
  });

  it("enforces the portable core-only diagnostic projection", () => {
    const richer = trace();
    richer.frames[0]!.players[0]!.coreLandmarks[0]!.presence = 1;
    expect(MotionTraceV2Schema.safeParse(richer).success).toBe(false);
  });

  it("rejects an empty or over-capacity frame collection", () => {
    expect(MotionTraceV2Schema.safeParse(trace([])).success).toBe(false);
    const tooMany = Array.from({ length: MOTION_TRACE_MAX_FRAMES + 1 }, (_, index) =>
      frame(index + 1, index + 1),
    );
    expect(MotionTraceV2Schema.safeParse(trace(tooMany)).success).toBe(false);
  });

  it("enforces the four-MiB runtime serialization bound", () => {
    const oversized = trace([frame(1, 10)]);
    oversized.frames[0]!.capabilities.profiles.push("actions.obstacle.v1");
    oversized.provenance.exportedProfiles = ["actions.obstacle.v1", "body.core17"];
    oversized.frames[0]!.players[0]!.actions = Array.from(
      { length: 80_000 },
      () => ({
        name: "jump",
        phase: "triggered",
        confidence: 1,
        occurredAtMs: 10,
      }),
    );
    const result = MotionTraceV2Schema.safeParse(oversized);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("4194304"))).toBe(true);
    }
  });
});
