import { describe, expect, it } from "vitest";
import { cornerSkeletonVisible } from "./skeleton-mini";

describe("cornerSkeletonVisible", () => {
  it("draws what the camera sees", () => {
    for (const source of ["mediapipe-web", "rtmo-native"] as const) {
      expect(
        cornerSkeletonVisible({
          source,
          playerCount: 1,
          stageShowsSkeleton: false,
        }),
      ).toBe(true);
    }
  });

  it("stays empty on replayed and synthetic frames", () => {
    // The synthetic fallback runs when the camera fails to start, and a
    // figure nobody in the room is moving would read as a working camera.
    for (const source of ["replay", "synthetic"] as const) {
      expect(
        cornerSkeletonVisible({
          source,
          playerCount: 2,
          stageShowsSkeleton: false,
        }),
      ).toBe(false);
    }
  });

  it("stays empty when the camera sees nobody", () => {
    expect(
      cornerSkeletonVisible({
        source: "mediapipe-web",
        playerCount: 0,
        stageShowsSkeleton: false,
      }),
    ).toBe(false);
  });

  it("steps aside for the full-size stage", () => {
    expect(
      cornerSkeletonVisible({
        source: "mediapipe-web",
        playerCount: 1,
        stageShowsSkeleton: true,
      }),
    ).toBe(false);
  });
});
