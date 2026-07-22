export type LauncherView = "home" | "motion" | "museum" | "retro" | "profiles" | "settings";
export type LabMode = "tracker" | "obstacle" | "shell";
export type SettingsPanel = "system" | "network" | "storage" | "developer";

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
