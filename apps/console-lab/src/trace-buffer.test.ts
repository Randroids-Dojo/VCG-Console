import { describe, expect, it } from "vitest";
import { syntheticFrame } from "./synthetic";
import { TraceBuffer } from "./trace-buffer";
import { trackerHealthFixture } from "./tracker-health";

describe("TraceBuffer", () => {
  it("retains a bounded, provenance-complete v2 skeleton replay", () => {
    const trace = new TraceBuffer(2);
    trace.push(syntheticFrame(1, 10));
    trace.push(syntheticFrame(2, 20));
    trace.push(syntheticFrame(3, 30));
    const snapshot = trace.snapshot(new Date("2026-07-24T12:00:00.000Z"));
    expect(snapshot.formatVersion).toBe(2);
    expect(snapshot.createdAt).toBe("2026-07-24T12:00:00.000Z");
    expect(snapshot.frames.map((frame) => frame.sequence)).toEqual([2, 3]);
    expect(snapshot.containsRawFrames).toBe(false);
    expect(snapshot.provenance).toEqual({
      motionSchemaVersion: "0.4.0",
      coordinateSpecVersion: "0.1.0",
      frameSources: ["synthetic"],
      timestampQualities: ["replay"],
      exportedProfiles: ["body.core17"],
    });
    expect(snapshot.retention).toMatchObject({
      volatileFrameLimit: 600,
      volatileHealthEventLimit: 128,
      volatileTrackLimit: 64,
      droppedFrames: 1,
      droppedHealthEvents: 0,
      trackLimitReached: false,
      playerLimitExceeded: false,
      persistentBeforeExport: false,
      exportPersistence: "user-managed-file",
    });
    const keys = new Set<string>();
    JSON.stringify(snapshot, (key, value) => {
      keys.add(key);
      return value;
    });
    expect(keys).not.toContain("imageData");
    expect(keys).not.toContain("rawFrame");
    expect(keys).not.toContain("videoFrame");
  });

  it("pseudonymizes tracks and removes richer body fields from the export", () => {
    const trace = new TraceBuffer();
    const first = syntheticFrame(1, 10);
    first.players[0]!.id = "profile-or-provider-stable-id";
    const nose = first.players[0]!.coreLandmarks[0]!;
    nose.position.z = 0.25;
    nose.worldPosition = { xMeters: 1, yMeters: 2, zMeters: 3 };
    nose.presence = 0.9;
    trace.push(first);

    const second = syntheticFrame(2, 20);
    second.players[0]!.id = "profile-or-provider-stable-id";
    trace.push(second);

    const snapshot = trace.snapshot(new Date("2026-07-24T12:00:00.000Z"));
    expect(snapshot.frames.map((frame) => frame.players[0]?.id)).toEqual([
      "trace-player-1",
      "trace-player-1",
    ]);
    expect(snapshot.privacy).toEqual({
      containsRawFrames: false,
      containsAudio: false,
      containsPortraits: false,
      containsProfileIdentifiers: false,
      containsFreeText: false,
      containsDerivedSkeletons: true,
      containsTraceLocalTrackIds: true,
      containsExactExportTime: true,
    });
    expect(snapshot.frames[0]!.players[0]!.coreLandmarks[0]).toEqual({
      name: "nose",
      position: { x: expect.any(Number), y: expect.any(Number) },
      visibility: expect.any(Number),
      observed: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("profile-or-provider-stable-id");
  });

  it("retains only the newest bounded stable health events", () => {
    const trace = new TraceBuffer();
    trace.push(syntheticFrame(1, 10));
    for (let sequence = 0; sequence < 129; sequence += 1) {
      trace.pushHealth(trackerHealthFixture("healthy", sequence, sequence));
    }

    const snapshot = trace.snapshot(new Date("2026-07-24T12:00:00.000Z"));
    expect(trace.healthSize).toBe(128);
    expect(snapshot.healthEvents).toHaveLength(128);
    expect(snapshot.healthEvents[0]?.sequence).toBe(1);
    expect(snapshot.healthEvents.at(-1)?.sequence).toBe(128);
    expect(snapshot.retention.droppedHealthEvents).toBe(1);
  });

  it("preserves bounded sequential track churn beyond the concurrent player limit", () => {
    const trace = new TraceBuffer(5);
    for (let index = 1; index <= 5; index += 1) {
      const value = syntheticFrame(index, index * 10);
      value.players[0]!.id = `source-track-${index}`;
      trace.push(value);
    }
    expect(
      trace.snapshot().frames.map((value) => value.players[0]!.id),
    ).toEqual([
      "trace-player-1",
      "trace-player-2",
      "trace-player-3",
      "trace-player-4",
      "trace-player-5",
    ]);
  });

  it("reports and skips frames beyond the track or player bounds without throwing", () => {
    const trace = new TraceBuffer();
    for (let index = 1; index <= 65; index += 1) {
      const value = syntheticFrame(index, index * 10);
      value.players[0]!.id = `source-track-${index}`;
      expect(trace.push(value)).toBe(index <= 64);
    }
    const trackLimited = trace.snapshot();
    expect(trackLimited.frames).toHaveLength(64);
    expect(trackLimited.retention).toMatchObject({
      droppedFrames: 1,
      trackLimitReached: true,
      playerLimitExceeded: false,
    });

    trace.clear();
    const tooManyPlayers = syntheticFrame(100, 1_000);
    tooManyPlayers.capabilities.maxPlayers = 5;
    expect(trace.push(tooManyPlayers)).toBe(false);
    expect(trace.size).toBe(0);
    expect(() => trace.snapshot()).toThrow("at least one frame");
    const valid = syntheticFrame(101, 1_010);
    expect(trace.push(valid)).toBe(true);
    expect(trace.snapshot().retention).toMatchObject({
      droppedFrames: 1,
      trackLimitReached: false,
      playerLimitExceeded: true,
    });
  });

  it("clears trace-local identity and refuses empty or invalidly sized exports", () => {
    expect(() => new TraceBuffer(0)).toThrow("trace capacity");
    expect(() => new TraceBuffer(601)).toThrow("trace capacity");
    const trace = new TraceBuffer();
    expect(() => trace.snapshot()).toThrow("at least one frame");
    const frame = syntheticFrame(1, 10);
    frame.players[0]!.id = "first-private-id";
    trace.push(frame);
    expect(trace.snapshot().frames[0]!.players[0]!.id).toBe("trace-player-1");
    trace.clear();
    const replacement = syntheticFrame(2, 20);
    replacement.players[0]!.id = "second-private-id";
    trace.push(replacement);
    expect(trace.snapshot().frames[0]!.players[0]!.id).toBe("trace-player-1");
  });

  it("isolates retained frames from later source mutation", () => {
    const trace = new TraceBuffer();
    const frame = syntheticFrame(1, 10);
    trace.push(frame);
    frame.players[0]!.coreLandmarks[0]!.position.x = 0;
    expect(trace.snapshot().frames[0]!.players[0]!.coreLandmarks[0]!.position.x).not.toBe(0);
  });
});
