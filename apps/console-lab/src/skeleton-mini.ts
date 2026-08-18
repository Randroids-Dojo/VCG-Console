/**
 * When the corner skeleton has something true to draw.
 *
 * The corner skeleton answers one question for a player standing in the
 * room: does the camera see me, and where am I in its view. Only a camera
 * can answer it. Replayed and synthetic frames would draw a figure nobody
 * in the room is moving, so the corner stays empty whenever the tracker is
 * running on anything else - including the synthetic fallback the shell
 * uses when the camera fails to start.
 */

import type { MotionFrame } from "@vcg/motion-contract";

const CAMERA_SOURCES: ReadonlySet<MotionFrame["source"]> = new Set([
  "mediapipe-web",
  "rtmo-native",
]);

export function cornerSkeletonVisible(input: {
  source: MotionFrame["source"];
  playerCount: number;
  /** The full-size stage is already drawing this frame. */
  stageShowsSkeleton: boolean;
}): boolean {
  if (input.stageShowsSkeleton) return false;
  if (!CAMERA_SOURCES.has(input.source)) return false;
  return input.playerCount > 0;
}
