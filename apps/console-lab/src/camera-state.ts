import type { TrackerStatus } from "./tracker";

export type CameraSoftwareState =
  | "disabled"
  | "starting"
  | "requesting-permission"
  | "active"
  | "permission-denied"
  | "unavailable"
  | "disconnected"
  | "failed";

export interface CameraStatePresentation {
  badge: string;
  title: string;
  access: string;
  activity: string;
  detail: string;
}

export const CAMERA_SHUTTER_STATE = "NOT SENSED";
export const CAMERA_SHUTTER_DETAIL =
  "Physical shutter position is not sensed. Check the shutter directly before camera use.";

const PRESENTATION: Readonly<Record<CameraSoftwareState, CameraStatePresentation>> = {
  disabled: {
    badge: "DISABLED",
    title: "Software camera access is disabled",
    access: "RELEASED",
    activity: "NO STREAM",
    detail: "The camera stream is stopped. Replay, controller, and keyboard input remain available.",
  },
  starting: {
    badge: "STARTING",
    title: "Preparing local camera tracking",
    access: "PREPARING",
    activity: "NO STREAM",
    detail: "The local pose backend is loading. Controller and keyboard recovery remain available.",
  },
  "requesting-permission": {
    badge: "PERMISSION",
    title: "Waiting for camera permission",
    access: "REQUESTING",
    activity: "NO STREAM",
    detail: "Browser permission is required before a local camera stream can start.",
  },
  active: {
    badge: "ACTIVE",
    title: "Local camera stream is active",
    access: "ENABLED",
    activity: "STREAM ACTIVE",
    detail: "The stream stays local and is not displayed or recorded. Stream activity does not prove an unobstructed lens view.",
  },
  "permission-denied": {
    badge: "PERMISSION DENIED",
    title: "Camera permission was not granted",
    access: "BLOCKED",
    activity: "NO STREAM",
    detail: "Change browser permission and retry, or continue with replay, controller, or keyboard input.",
  },
  unavailable: {
    badge: "UNAVAILABLE",
    title: "Camera is unavailable",
    access: "UNAVAILABLE",
    activity: "NO STREAM",
    detail: "Check the camera connection and availability, then retry. Controller and keyboard input remain available.",
  },
  disconnected: {
    badge: "DISCONNECTED",
    title: "Camera stream was disconnected",
    access: "LOST",
    activity: "NO STREAM",
    detail: "Reconnect the camera and retry. Motion control stays blocked; controller and keyboard input remain available.",
  },
  failed: {
    badge: "FAILED",
    title: "Camera tracking failed",
    access: "FAILED",
    activity: "NO STREAM",
    detail: "Restart camera tracking or continue with replay, controller, or keyboard input.",
  },
};

export function cameraStatePresentation(state: CameraSoftwareState): CameraStatePresentation {
  return PRESENTATION[state];
}

export function cameraStateForTrackerStatus(
  status: TrackerStatus,
): CameraSoftwareState | undefined {
  switch (status) {
    case "idle":
    case "stopped":
      return "disabled";
    case "loading":
      return "starting";
    case "requesting-camera":
      return "requesting-permission";
    case "running":
      return "active";
    case "fault":
      return undefined;
  }
}

export function cameraStateForStartFailure(error: unknown): CameraSoftwareState {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (
    name === "NotFoundError"
    || name === "NotReadableError"
    || name === "OverconstrainedError"
  ) {
    return "unavailable";
  }
  return "failed";
}

function errorName(error: unknown): string | undefined {
  if (error instanceof Error) return error.name;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  return undefined;
}
