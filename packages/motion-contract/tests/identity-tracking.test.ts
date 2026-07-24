import { describe, expect, it } from "vitest";
import {
  AppearanceFreeIdentityTracker,
  CORE_LANDMARK_NAMES,
  IDENTITY_TRACKER_ALGORITHMS,
  type IdentityPoseDetection,
} from "../src";

const TEMPLATE = [
  [0, -0.35],
  [-0.04, -0.38],
  [0.04, -0.38],
  [-0.08, -0.36],
  [0.08, -0.36],
  [-0.14, -0.18],
  [0.14, -0.18],
  [-0.2, 0],
  [0.2, 0],
  [-0.24, 0.18],
  [0.24, 0.18],
  [-0.1, 0.16],
  [0.1, 0.16],
  [-0.1, 0.4],
  [0.1, 0.4],
  [-0.1, 0.68],
  [0.1, 0.68],
] as const;

function pose(
  centerX: number,
  centerY = 0.45,
  confidence = 0.9,
  scale = 0.3,
): IdentityPoseDetection {
  return {
    confidence,
    landmarks: TEMPLATE.map(([x, y]) => ({
      x: centerX + x * scale,
      y: centerY + y * scale,
      observed: true,
    })),
  };
}

describe("AppearanceFreeIdentityTracker", () => {
  it("exposes all five appearance-free comparison algorithms", () => {
    expect(IDENTITY_TRACKER_ALGORITHMS).toEqual([
      "nearest-centroid",
      "kalman-centroid",
      "oks",
      "kalman-oks-hybrid",
      "two-stage-kalman-iou",
    ]);
  });

  it.each(IDENTITY_TRACKER_ALGORITHMS)(
    "%s maintains two non-crossing identities when detection order changes",
    (algorithm) => {
      const tracker = new AppearanceFreeIdentityTracker({ algorithm });
      const initial = tracker.update({
        timestampMs: 0,
        detections: [pose(0.25), pose(0.75)],
      });
      expect(initial.assignments.map(({ trackId }) => trackId)).toEqual([
        "pose-1",
        "pose-2",
      ]);

      const next = tracker.update({
        timestampMs: 33,
        detections: [pose(0.73), pose(0.27)],
      });
      expect(next.assignments).toEqual([
        { detectionIndex: 0, trackId: "pose-2" },
        { detectionIndex: 1, trackId: "pose-1" },
      ]);
      expect(next.activeTrackIds).toEqual(["pose-1", "pose-2"]);
    },
  );

  it("uses a global one-to-one assignment rather than duplicating a track", () => {
    const tracker = new AppearanceFreeIdentityTracker({
      algorithm: "nearest-centroid",
      maxAssociationDistance: 0.5,
    });
    tracker.update({
      timestampMs: 0,
      detections: [pose(0.4), pose(0.6)],
    });
    const update = tracker.update({
      timestampMs: 33,
      detections: [pose(0.49), pose(0.51)],
    });
    expect(new Set(update.assignments.map(({ trackId }) => trackId)).size).toBe(2);
    expect(new Set(update.assignments.map(({ detectionIndex }) => detectionIndex)).size).toBe(2);
  });

  it("expires a missing identity and never reuses its opaque track ID", () => {
    const tracker = new AppearanceFreeIdentityTracker({
      algorithm: "kalman-centroid",
      maxMissedFrames: 1,
    });
    tracker.update({ timestampMs: 0, detections: [pose(0.3)] });
    expect(tracker.update({ timestampMs: 33, detections: [] }).activeTrackIds).toEqual([
      "pose-1",
    ]);
    expect(tracker.update({ timestampMs: 66, detections: [] }).activeTrackIds).toEqual([]);
    expect(
      tracker.update({ timestampMs: 99, detections: [pose(0.3)] }).assignments,
    ).toEqual([{ detectionIndex: 0, trackId: "pose-2" }]);
  });

  it("uses low-confidence observations only to continue an existing two-stage track", () => {
    const tracker = new AppearanceFreeIdentityTracker({
      algorithm: "two-stage-kalman-iou",
      minimumDetectionConfidence: 0.1,
      highConfidenceThreshold: 0.6,
    });
    expect(
      tracker.update({
        timestampMs: 0,
        detections: [pose(0.3, 0.45, 0.2)],
      }).assignments,
    ).toEqual([]);
    expect(
      tracker.update({
        timestampMs: 33,
        detections: [pose(0.3, 0.45, 0.9)],
      }).assignments,
    ).toEqual([{ detectionIndex: 0, trackId: "pose-1" }]);
    expect(
      tracker.update({
        timestampMs: 66,
        detections: [pose(0.31, 0.45, 0.2)],
      }).assignments,
    ).toEqual([{ detectionIndex: 0, trackId: "pose-1" }]);
  });

  it("enforces bounded strict input and monotonic time", () => {
    expect(
      () =>
        new AppearanceFreeIdentityTracker({
          algorithm: "nearest-centroid",
          maxTracks: 5,
        }),
    ).toThrow(/maxTracks/);
    const tracker = new AppearanceFreeIdentityTracker({
      algorithm: "nearest-centroid",
    });
    tracker.update({ timestampMs: 10, detections: [pose(0.5)] });
    expect(() =>
      tracker.update({ timestampMs: 10, detections: [] }),
    ).toThrow(/strictly increasing/);
    expect(() =>
      new AppearanceFreeIdentityTracker({
        algorithm: "nearest-centroid",
      }).update({
        timestampMs: 0,
        detections: [
          {
            ...pose(0.5),
            landmarks: CORE_LANDMARK_NAMES.slice(1).map(() => ({
              x: 0.5,
              y: 0.5,
              observed: true,
            })),
          },
        ],
      }),
    ).toThrow(/exactly 17/);
    expect(() =>
      new AppearanceFreeIdentityTracker({
        algorithm: "nearest-centroid",
      }).update({
        timestampMs: 0,
        detections: [{ ...pose(0.5), confidence: Number.NaN }],
      }),
    ).toThrow(/confidence/);
  });
});
