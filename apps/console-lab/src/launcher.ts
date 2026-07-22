import { mount } from "svelte";
import type { ConsoleInputAction } from "./gamepad-router";
import Launcher from "./launcher/Launcher.svelte";
import type { LauncherOptions, LauncherView, SettingsPanel } from "./launcher/types";

export const launcherMarkup = `<div id="launcher-root"></div>`;

interface LauncherHandle {
  back: () => void;
  handleInput: (action: ConsoleInputAction) => void;
  hide: () => void;
  isVisible: () => boolean;
  openSearch: () => void;
  show: () => void;
  showSettings: (panel: SettingsPanel) => Promise<void>;
  showView: (view: LauncherView) => Promise<void>;
}

export class LauncherController {
  readonly #launcher: LauncherHandle;

  constructor(options: LauncherOptions) {
    const target = document.querySelector<HTMLElement>("#launcher-root");
    if (!target) throw new Error("Missing launcher mount point");
    this.#launcher = mount(Launcher, { target, props: options }) as LauncherHandle;
  }

  get visible(): boolean {
    return this.#launcher.isVisible();
  }

  show(): void {
    this.#launcher.show();
  }

  hide(): void {
    this.#launcher.hide();
  }

  showView(view: LauncherView): void {
    void this.#launcher.showView(view);
  }

  showSettings(panel: SettingsPanel): void {
    void this.#launcher.showSettings(panel);
  }

  back(): void {
    this.#launcher.back();
  }

  handleInput(action: ConsoleInputAction): void {
    this.#launcher.handleInput(action);
  }

  openSearch(): void {
    this.#launcher.openSearch();
  }
}
