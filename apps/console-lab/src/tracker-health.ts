import {
  MOTION_API_SCHEMA_VERSION,
  TrackerHealthEventSchema,
  type TrackerHealthEvent,
  type TrackerHealthReason,
} from "@vcg/motion-contract";

export interface TrackerHealthPresentation {
  badge: string;
  title: string;
  detail: string;
}

const PRESENTATION: Readonly<Record<TrackerHealthReason, TrackerHealthPresentation>> = {
  initializing: {
    badge: "STARTING",
    title: "Tracker is starting",
    detail: "Motion control is blocked until a healthy source is ready. Controller and keyboard recovery remain available.",
  },
  restarting: {
    badge: "RESTARTING",
    title: "Tracker is restarting",
    detail: "Motion control stays blocked during restart. No prior hold or action carries into the new tracker epoch.",
  },
  healthy: {
    badge: "READY",
    title: "Tracker is ready",
    detail: "Landmarks and standardized actions are available from the active local source.",
  },
  "low-confidence": {
    badge: "LOW CONF",
    title: "Tracking confidence is low",
    detail: "Landmarks remain visible for feedback, but standardized motion actions are suppressed.",
  },
  overload: {
    badge: "OVERLOAD",
    title: "Tracker is overloaded",
    detail: "Frames may be dropped to bound latency. Standardized motion actions are suppressed until recovery.",
  },
  "fallback-backend": {
    badge: "FALLBACK",
    title: "Tracker is using a fallback backend",
    detail: "Landmarks remain visible, but standardized motion actions are suppressed pending backend qualification.",
  },
  "camera-unavailable": {
    badge: "NO CAMERA",
    title: "Camera is unavailable",
    detail: "Motion control is blocked. Check permission and camera availability, or continue with controller and keyboard input.",
  },
  "camera-disconnected": {
    badge: "CAMERA LOST",
    title: "Camera disconnected",
    detail: "Motion control is blocked. Reconnect or restart the camera, or continue with controller and keyboard input.",
  },
  "backend-fault": {
    badge: "FAULT",
    title: "Tracker fault",
    detail: "Motion control is blocked. Restart the tracker or continue with controller and keyboard input.",
  },
};

export function trackerHealthPresentation(event: TrackerHealthEvent): TrackerHealthPresentation {
  return PRESENTATION[event.reason];
}

export function trackerHealthFixture(
  reason: TrackerHealthReason,
  sequence: number,
  occurredAtMs: number,
  source: TrackerHealthEvent["source"] = "synthetic",
): TrackerHealthEvent {
  const common = {
    schemaVersion: MOTION_API_SCHEMA_VERSION,
    sequence,
    source,
    occurredAtMs,
  };
  switch (reason) {
    case "initializing":
    case "restarting":
      return TrackerHealthEventSchema.parse({
        ...common,
        status: "starting",
        reason,
        controlAvailability: "blocked",
      });
    case "healthy":
      return TrackerHealthEventSchema.parse({
        ...common,
        status: "ready",
        reason,
        controlAvailability: "full",
      });
    case "low-confidence":
    case "overload":
    case "fallback-backend":
      return TrackerHealthEventSchema.parse({
        ...common,
        status: "degraded",
        reason,
        controlAvailability: "landmarks-only",
      });
    case "camera-unavailable":
    case "camera-disconnected":
    case "backend-fault":
      return TrackerHealthEventSchema.parse({
        ...common,
        status: "fault",
        reason,
        controlAvailability: "blocked",
      });
  }
}
