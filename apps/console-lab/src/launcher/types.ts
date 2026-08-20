import type { AccessibilityPreferenceController } from "./accessibility-preferences";

export type LauncherView =
  | "home"
  | "motion"
  | "session-adversarial"
  | "museum"
  | "retro"
  | "retro-game"
  | "retro-library"
  | "profiles"
  | "profile-management"
  | "calibration"
  | "portrait"
  | "unassigned"
  | "settings";
export type LabMode = "tracker" | "obstacle" | "shell";
export type SettingsPanel =
  | "system"
  | "accessibility"
  | "display"
  | "audio"
  | "controllers"
  | "network"
  | "storage"
  | "developer";
export type LaunchAdapter = "remote-web" | "local-web" | "native" | "retro";
export type LaunchFaultPreview = "slow" | "offline" | "hung" | "crashed" | "recovered";
export type LaunchStatus = "loading" | "slow" | "ready" | "offline" | "hung" | "crashed" | "recovering" | "recovered" | "unavailable";

export interface LaunchPhase {
  label: string;
  detail: string;
}

export interface LaunchSession {
  adapter: LaunchAdapter;
  adapterLabel: string;
  title: string;
  context: string;
  phases: LaunchPhase[];
  activePhase: number;
  status: LaunchStatus;
  startedAt: number;
  progress?: number;
  detail: string;
  canRetry?: boolean;
  diagnostics?: {
    code: string;
    attempt: number;
    lastSignal: string;
    lastSignalAt: number;
    timeoutMs: number;
    heartbeatTimeoutMs: number;
  };
  action?: {
    label: string;
  };
}

export interface LauncherOptions {
  accessibilityPreferences: AccessibilityPreferenceController;
  openMotionLab: (mode?: LabMode) => void;
}

export interface LocalProfile {
  id: string;
  name: string;
  detail: string;
}

export interface SearchItem {
  title: string;
  detail: string;
  group: string;
  terms: string;
  action: () => void;
}
