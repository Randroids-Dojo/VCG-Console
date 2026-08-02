// Camera capture profiles.
//
// Requested capture mode is a per-tier decision, not a product claim. The
// console asks for one exact mode and then reports what the camera actually
// delivered; neither value qualifies a camera, a tier, or a latency budget.
//
// The default is deliberately the smallest useful mode. Pose inference on the
// Raspberry Pi 5 reference candidate runs on the CPU in the browser, where
// per-frame `createImageBitmap` and inference cost scale with capture size. A
// desk workstation can opt into a larger mode explicitly; the reverse default
// would make the constrained tier the surprising case.

export type CaptureProfileId = "low-power" | "balanced" | "target";

export interface CaptureProfile {
  readonly id: CaptureProfileId;
  /** Requested capture width in pixels. */
  readonly width: number;
  /** Requested capture height in pixels. */
  readonly height: number;
  /** Requested capture frame rate in frames per second. */
  readonly frameRate: number;
}

// Smallest mode, intended to keep browser CPU pose inference viable on the
// Raspberry Pi 5 reference candidate. Room coverage and accuracy at this mode
// are unmeasured.
const LOW_POWER: CaptureProfile = { id: "low-power", width: 640, height: 480, frameRate: 30 };
// Intermediate mode for comparing accuracy against cost on one tier. It is not
// a qualified setting for either reference class.
const BALANCED: CaptureProfile = { id: "balanced", width: 1280, height: 720, frameRate: 30 };
// The product camera contract mode. Requesting it does not establish that a
// camera, tier, or room sustains it.
const TARGET: CaptureProfile = { id: "target", width: 1920, height: 1080, frameRate: 60 };

export const CAPTURE_PROFILES: readonly CaptureProfile[] = [LOW_POWER, BALANCED, TARGET];

export const DEFAULT_CAPTURE_PROFILE = LOW_POWER;

/**
 * Reads `?capture=<id>` from a location-like search string. Anything not
 * exactly matching a declared identifier falls back to the default rather than
 * requesting an undeclared capture mode.
 */
export function captureProfileFromSearch(search: string): CaptureProfile {
  const requested = new URLSearchParams(search).get("capture");
  return CAPTURE_PROFILES.find((candidate) => candidate.id === requested) ?? DEFAULT_CAPTURE_PROFILE;
}

/** One human-readable spelling of a capture mode, used everywhere it is shown. */
export function captureModeLabel(profile: CaptureProfile): string {
  return `${profile.width}x${profile.height} at ${profile.frameRate} FPS (${profile.id})`;
}

/**
 * Ideal-only constraints. A hard constraint would make an otherwise usable
 * camera fail to open; qualification uses the observed mode instead.
 */
export function captureConstraints(profile: CaptureProfile): MediaTrackConstraints {
  return {
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: profile.frameRate },
    facingMode: "user",
  };
}

/** What the camera reported after the stream opened, when it reported it. */
export type ObservedCaptureMode = Pick<MediaTrackSettings, "width" | "height" | "frameRate">;

export function describeCaptureMode(
  profile: CaptureProfile,
  observed: ObservedCaptureMode | undefined,
): string {
  const requested = `Capture mode: requested ${captureModeLabel(profile)}`;
  if (observed?.width === undefined && observed?.height === undefined) {
    return `${requested}; the camera reported no mode.`;
  }
  const rate =
    observed.frameRate === undefined
      ? "an unreported frame rate"
      : `${Math.round(observed.frameRate)} FPS`;
  return `${requested}; the camera reported ${observed.width ?? 0}x${observed.height ?? 0} at ${rate}.`;
}
