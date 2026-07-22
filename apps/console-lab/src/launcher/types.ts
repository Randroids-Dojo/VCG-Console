export type LauncherView = "home" | "motion" | "museum" | "retro" | "profiles" | "settings";
export type LabMode = "tracker" | "obstacle" | "shell";
export type SettingsPanel = "system" | "network" | "storage" | "developer";
export type LaunchAdapter = "remote-web" | "local-web" | "native" | "retro";
export type LaunchStatus = "loading" | "ready" | "unavailable";

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
  action?: {
    label: string;
    href?: string;
  };
}

export interface LauncherOptions {
  openMotionLab: (mode?: LabMode) => void;
}

export interface SearchItem {
  title: string;
  detail: string;
  group: string;
  terms: string;
  action: () => void;
}
