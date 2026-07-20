import type { ConsoleInputAction } from "./gamepad-router";

type LauncherView = "home" | "motion" | "museum" | "retro" | "profiles" | "settings";

interface LauncherOptions {
  openMotionLab: (mode?: "tracker" | "obstacle" | "shell") => void;
}

interface SearchItem {
  title: string;
  detail: string;
  group: string;
  terms: string;
  action: () => void;
}

export const launcherMarkup = `
  <div class="boot-screen" id="boot-screen" aria-live="polite">
    <div class="boot-mark" aria-label="VCG Console">VCG<span>/</span></div>
    <div class="boot-readout">
      <p id="boot-status">LOCAL SYSTEM / STARTING</p>
      <div class="signal-line" aria-hidden="true"><span></span></div>
      <small>PRIVATE BY DEFAULT</small>
    </div>
  </div>

  <main class="launcher" id="launcher">
    <header class="launcher-topbar">
      <button class="launcher-brand" type="button" data-launcher-home aria-label="VCG Console home">VCG<span>/</span>CONSOLE</button>
      <button class="search-trigger" id="search-trigger" type="button" aria-haspopup="dialog">
        <span>Search games, hubs, and settings</span><kbd>/</kbd>
      </button>
      <div class="launcher-presence">
        <button type="button" data-view-target="profiles"><span class="profile-orbit" aria-hidden="true">R</span><span id="active-profile-name">Randy</span></button>
        <time id="launcher-clock" aria-label="Local time"></time>
      </div>
    </header>

    <div class="launcher-frame">
      <nav class="launcher-nav" aria-label="Launcher">
        <div class="nav-signal" aria-hidden="true"><span></span></div>
        <button class="active" type="button" data-view-target="home">Home</button>
        <button type="button" data-view-target="motion">Motion</button>
        <button type="button" data-view-target="museum">Museum</button>
        <button type="button" data-view-target="retro">Retro</button>
        <span class="nav-spacer"></span>
        <button type="button" data-view-target="profiles">Profiles</button>
        <button type="button" data-view-target="settings">Settings</button>
      </nav>

      <section class="launcher-content">
        <div class="launcher-view home-view" data-launcher-view="home">
          <div class="home-heading">
            <p class="view-kicker">READY / LOCAL</p>
            <h1>Good evening,<br /><span id="home-profile-name">Randy.</span></h1>
            <p>Choose where to play.</p>
          </div>
          <div class="home-destinations" aria-label="Game destinations">
            <button class="destination featured" type="button" data-lab-mode="obstacle">
              <span class="destination-index">MOTION / 01</span>
              <strong>Obstacle</strong>
              <small>Body-controlled survival lab</small>
              <span class="destination-action">Continue <b>→</b></span>
            </button>
            <button class="destination" type="button" data-view-target="museum">
              <span class="destination-index">ONLINE / 02</span>
              <strong>VibeCoded Museum</strong>
              <small>Explore the complete collection</small>
              <span class="destination-action">Enter <b>→</b></span>
            </button>
            <button class="destination" type="button" data-view-target="retro">
              <span class="destination-index">LOCAL / 03</span>
              <strong>RetroArch</strong>
              <small>Your installed retro library</small>
              <span class="destination-action">Open <b>→</b></span>
            </button>
          </div>
          <footer class="home-status">
            <span><i></i> Console ready</span>
            <span>0 games installed locally</span>
            <span>Network setup required</span>
          </footer>
        </div>

        <div class="launcher-view list-view" data-launcher-view="motion" hidden>
          <header class="view-header"><div><p class="view-kicker">MOTION HUB</p><h1>Move to play.</h1></div><p>Camera stays local. Every experience keeps a controller exit.</p></header>
          <div class="library-list">
            <button type="button" data-lab-mode="obstacle"><span>01</span><strong>Obstacle</strong><small>Dodge · Duck · Jump</small><b>Ready</b></button>
            <button type="button" data-lab-mode="tracker"><span>02</span><strong>Motion Lab</strong><small>Skeleton and signal diagnostics</small><b>Ready</b></button>
            <button type="button" data-lab-mode="shell"><span>03</span><strong>Shell Lab</strong><small>Gesture navigation and recovery</small><b>Ready</b></button>
          </div>
        </div>

        <div class="launcher-view museum-view" data-launcher-view="museum" hidden>
          <p class="view-kicker">VIBECODED.GAMES</p>
          <div class="museum-title"><h1>The museum is<br />a world of its own.</h1><span>LIVE / WEB</span></div>
          <p class="museum-copy">Walk through the full VibeCoded collection. The museum opens as a supervised web experience and returns here when you leave.</p>
          <a class="primary-action" href="https://vibecoded.games" target="_blank" rel="noopener noreferrer">Enter the museum <span>↗</span></a>
          <p class="boundary-note">Internet required · Opens vibecoded.games</p>
        </div>

        <div class="launcher-view retro-view" data-launcher-view="retro" hidden>
          <header class="view-header"><div><p class="view-kicker">RETRO HUB</p><h1>One library.<br />No clutter.</h1></div><p>RetroArch runs beneath the VCG shell so Home, loading, and recovery stay consistent.</p></header>
          <div class="empty-library">
            <span class="empty-glyph" aria-hidden="true">○</span>
            <div><strong>No retro games installed</strong><p>Import games you are legally entitled to use from USB or a paired computer.</p></div>
            <button type="button" data-toast="The native importer will become available with the console host.">Import games</button>
          </div>
          <div class="retro-actions">
            <button type="button" data-toast="RetroArch requires the native console host in this browser prototype.">Open RetroArch</button>
            <button type="button" data-search-open>Search library</button>
          </div>
        </div>

        <div class="launcher-view profiles-view" data-launcher-view="profiles" hidden>
          <header class="view-header"><div><p class="view-kicker">LOCAL PROFILES</p><h1>Who is playing?</h1></div><p>Profiles and portraits stay on this console.</p></header>
          <div class="profile-layout">
            <div class="profile-collection"><div class="profile-list" id="profile-list">
              <button class="selected" type="button" data-profile="Randy"><span>R</span><strong>Randy</strong><small>Selected</small></button>
              <button type="button" data-profile="Guest"><span>G</span><strong>Guest</strong><small>Local guest</small></button>
              <button class="create-profile" type="button" id="create-profile"><span>+</span><strong>Create profile</strong><small>New local player</small></button>
            </div><button class="update-profile" type="button" id="edit-profile">Update selected profile</button></div>
            <form class="profile-editor" id="profile-editor" hidden>
              <p class="view-kicker">PROFILE DETAILS</p>
              <label>Name<input id="profile-name-input" maxlength="24" autocomplete="off" /></label>
              <p>Portrait, motion calibration, and accessibility settings are configured on-device.</p>
              <div><button type="submit">Save profile</button><button type="button" id="cancel-profile">Cancel</button></div>
            </form>
          </div>
        </div>

        <div class="launcher-view settings-view" data-launcher-view="settings" hidden>
          <header class="view-header"><div><p class="view-kicker">CONSOLE SETTINGS</p><h1>System.</h1></div><p>Only controls that belong on the television.</p></header>
          <div class="settings-layout">
            <nav class="settings-nav" aria-label="Settings sections">
              <button class="active" type="button" data-settings-target="system">System</button>
              <button type="button" data-settings-target="network">Wi-Fi</button>
              <button type="button" data-settings-target="storage">Storage</button>
              <button type="button" data-settings-target="developer">Developer</button>
            </nav>
            <div class="settings-panels">
              <section data-settings-panel="system"><dl><div><dt>VCG Console</dt><dd>Prototype 0.0.1</dd></div><div><dt>Motion API</dt><dd>0.1.0</dd></div><div><dt>Update channel</dt><dd>Development</dd></div></dl><button type="button" data-toast="No console update service is connected in this prototype.">Check for updates</button></section>
              <section data-settings-panel="network" hidden><div class="setting-callout"><span>OFFLINE</span><strong>Wi-Fi is not configured</strong><p>Connect to use the museum and hosted games. Local motion and retro games remain available offline.</p><button type="button" id="scan-wifi">Scan for networks</button></div></section>
              <section data-settings-panel="storage" hidden><div class="storage-meter"><div><span style="width:15%"></span></div><p><strong>38 GB used</strong><span>218 GB available / 256 GB total</span></p></div><dl><div><dt>System</dt><dd>12 GB</dd></div><div><dt>Games</dt><dd>0 GB</dd></div><div><dt>Reserved</dt><dd>26 GB</dd></div></dl><small class="estimate-note">Development estimate · final hardware not yet qualified</small></section>
              <section data-settings-panel="developer" hidden><div class="toggle-row"><div><strong>Diagnostic overlay</strong><small>Show performance and tracker health</small></div><button type="button" role="switch" aria-checked="false">Off</button></div><div class="toggle-row"><div><strong>Developer mode</strong><small>Allow paired workstation sessions</small></div><button type="button" role="switch" aria-checked="false">Off</button></div><button type="button" data-lab-mode="tracker">Open Motion Lab</button></section>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="launcher-toast" id="launcher-toast" hidden role="status"></div>
    <div class="search-overlay" id="search-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="search-title">
      <div class="search-panel">
        <label id="search-title" for="universal-search">Search everything</label>
        <div class="search-input-row"><span>⌕</span><input id="universal-search" type="search" placeholder="Type a game, hub, or setting" autocomplete="off" /><kbd>ESC</kbd></div>
        <div class="search-results" id="search-results"></div>
        <p class="search-empty" id="search-empty" hidden>No matches. Try a game, hub, profile, or setting.</p>
      </div>
    </div>
  </main>
`;

export class LauncherController {
  readonly #options: LauncherOptions;
  readonly #launcher: HTMLElement;
  readonly #searchOverlay: HTMLElement;
  readonly #searchInput: HTMLInputElement;
  readonly #searchResults: HTMLElement;
  readonly #searchEmpty: HTMLElement;
  readonly #items: SearchItem[];
  #view: LauncherView = "home";
  #toastTimer: number | undefined;

  constructor(options: LauncherOptions) {
    this.#options = options;
    this.#launcher = required("#launcher");
    this.#searchOverlay = required("#search-overlay");
    this.#searchInput = required("#universal-search");
    this.#searchResults = required("#search-results");
    this.#searchEmpty = required("#search-empty");
    this.#items = [
      { title: "Obstacle", detail: "Motion game", group: "Motion", terms: "dodge duck jump body", action: () => options.openMotionLab("obstacle") },
      { title: "Motion Lab", detail: "Skeleton diagnostics", group: "Motion", terms: "camera tracker debug signal", action: () => options.openMotionLab("tracker") },
      { title: "Shell Lab", detail: "Gesture navigation", group: "Motion", terms: "swipe select back pause", action: () => options.openMotionLab("shell") },
      { title: "VibeCoded Museum", detail: "vibecoded.games", group: "Online", terms: "museum collection web games", action: () => this.showView("museum") },
      { title: "VibeBots", detail: "Museum catalog", group: "Game", terms: "vibecoded online robots", action: () => this.showView("museum") },
      { title: "Mi Casa Es Su Casa", detail: "Museum catalog", group: "Game", terms: "vibecoded online casa", action: () => this.showView("museum") },
      { title: "Determined", detail: "Museum catalog", group: "Game", terms: "vibecoded online word game", action: () => this.showView("museum") },
      { title: "RetroArch", detail: "Retro library", group: "Local", terms: "retro emulator arcade rom library", action: () => this.showView("retro") },
      { title: "Profiles", detail: "Players on this console", group: "System", terms: "profile player portrait calibration", action: () => this.showView("profiles") },
      { title: "Wi-Fi", detail: "Network setup", group: "Settings", terms: "wifi internet network connection", action: () => this.showSettings("network") },
      { title: "Storage", detail: "Capacity and usage", group: "Settings", terms: "disk space capacity games", action: () => this.showSettings("storage") },
      { title: "Developer options", detail: "Diagnostics and pairing", group: "Settings", terms: "debug diagnostic developer version", action: () => this.showSettings("developer") },
    ];
    this.#bind();
    this.#paintClock();
    window.setInterval(() => this.#paintClock(), 15_000);
    this.#startBoot();
  }

  get visible(): boolean {
    return !this.#launcher.hidden;
  }

  show(): void {
    this.#launcher.hidden = false;
    this.showView("home");
  }

  hide(): void {
    this.closeSearch();
    this.#launcher.hidden = true;
  }

  showView(view: LauncherView): void {
    this.#view = view;
    for (const panel of document.querySelectorAll<HTMLElement>("[data-launcher-view]")) panel.hidden = panel.dataset.launcherView !== view;
    for (const button of document.querySelectorAll<HTMLButtonElement>(".launcher-nav [data-view-target]")) button.classList.toggle("active", button.dataset.viewTarget === view);
    const active = document.querySelector<HTMLButtonElement>(`.launcher-nav [data-view-target="${view}"]`);
    const signal = document.querySelector<HTMLElement>(".nav-signal span");
    if (active && signal) signal.style.transform = `translateY(${active.offsetTop - 52}px)`;
    active?.focus({ preventScroll: true });
  }

  showSettings(panel: "system" | "network" | "storage" | "developer"): void {
    this.showView("settings");
    document.querySelector<HTMLButtonElement>(`[data-settings-target="${panel}"]`)?.click();
  }

  back(): void {
    if (!this.#searchOverlay.hidden) this.closeSearch();
    else if (this.#view !== "home") this.showView("home");
  }

  handleInput(action: ConsoleInputAction): void {
    if (action === "home") return this.showView("home");
    if (action === "back") return this.back();
    const controls = [...document.querySelectorAll<HTMLElement>("#launcher button:not([disabled]), #launcher a[href], #launcher input")].filter(
      (element) => element.offsetParent !== null,
    );
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    if (action === "left" || action === "up" || action === "right" || action === "down") {
      const direction = action === "left" || action === "up" ? -1 : 1;
      controls[(current + direction + controls.length) % controls.length]?.focus();
    } else if (action === "select") {
      (document.activeElement as HTMLElement | null)?.click();
    }
  }

  openSearch(): void {
    this.#searchOverlay.hidden = false;
    this.#searchInput.value = "";
    this.#renderSearch("");
    this.#searchInput.focus();
  }

  closeSearch(): void {
    this.#searchOverlay.hidden = true;
  }

  #bind(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view-target]")) {
      button.addEventListener("click", () => this.showView(button.dataset.viewTarget as LauncherView));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lab-mode]")) {
      button.addEventListener("click", () => this.#options.openMotionLab(button.dataset.labMode as "tracker" | "obstacle" | "shell"));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-launcher-home]")) button.addEventListener("click", () => this.showView("home"));
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-search-open]")) button.addEventListener("click", () => this.openSearch());
    required<HTMLButtonElement>("#search-trigger").addEventListener("click", () => this.openSearch());
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-toast]")) {
      button.addEventListener("click", () => this.#toast(button.dataset.toast ?? "Unavailable"));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-settings-target]")) {
      button.addEventListener("click", () => {
        for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-settings-target]")) candidate.classList.toggle("active", candidate === button);
        for (const panel of document.querySelectorAll<HTMLElement>("[data-settings-panel]")) panel.hidden = panel.dataset.settingsPanel !== button.dataset.settingsTarget;
      });
    }
    for (const toggle of document.querySelectorAll<HTMLButtonElement>("[role=switch]")) {
      toggle.addEventListener("click", () => {
        const next = toggle.getAttribute("aria-checked") !== "true";
        toggle.setAttribute("aria-checked", String(next));
        toggle.textContent = next ? "On" : "Off";
      });
    }
    required<HTMLButtonElement>("#scan-wifi").addEventListener("click", (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.textContent = "Scanning…";
      button.disabled = true;
      window.setTimeout(() => {
        button.textContent = "No networks found · Scan again";
        button.disabled = false;
      }, 900);
    });
    this.#bindProfiles();
    this.#searchInput.addEventListener("input", () => this.#renderSearch(this.#searchInput.value));
    this.#searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.#searchResults.querySelector<HTMLButtonElement>("button")?.focus();
      }
    });
    this.#searchOverlay.addEventListener("click", (event) => {
      if (event.target === this.#searchOverlay) this.closeSearch();
    });
  }

  #bindProfiles(): void {
    const editor = required<HTMLFormElement>("#profile-editor");
    const input = required<HTMLInputElement>("#profile-name-input");
    let editingButton: HTMLButtonElement | undefined;
    const openEditor = (name = "", button?: HTMLButtonElement) => {
      editingButton = button;
      input.value = name;
      editor.hidden = false;
      input.focus();
    };
    required<HTMLButtonElement>("#create-profile").addEventListener("click", () => openEditor());
    required<HTMLButtonElement>("#edit-profile").addEventListener("click", () => {
      const selected = document.querySelector<HTMLButtonElement>("[data-profile].selected");
      if (selected) openEditor(selected.dataset.profile ?? "", selected);
    });
    required<HTMLButtonElement>("#cancel-profile").addEventListener("click", () => {
      editor.hidden = true;
      editingButton = undefined;
    });
    const selectProfile = (button: HTMLButtonElement) => {
      for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-profile]")) candidate.classList.toggle("selected", candidate === button);
      const name = button.dataset.profile ?? "Player";
      required("#active-profile-name").textContent = name;
      required("#home-profile-name").textContent = `${name}.`;
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-profile]")) button.addEventListener("click", () => selectProfile(button));
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      if (editingButton) {
        editingButton.dataset.profile = name;
        const initial = editingButton.querySelector("span");
        const label = editingButton.querySelector("strong");
        if (initial) initial.textContent = name.slice(0, 1).toUpperCase();
        if (label) label.textContent = name;
        editor.hidden = true;
        selectProfile(editingButton);
        editingButton = undefined;
        this.#toast(`Profile updated: ${name}`);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.profile = name;
      button.innerHTML = `<span>${escapeHtml(name.slice(0, 1).toUpperCase())}</span><strong>${escapeHtml(name)}</strong><small>Local player</small>`;
      button.addEventListener("click", () => selectProfile(button));
      required("#profile-list").insertBefore(button, required("#create-profile"));
      editor.hidden = true;
      selectProfile(button);
      this.#toast(`Profile created: ${name}`);
    });
  }

  #renderSearch(query: string): void {
    const normalized = query.trim().toLowerCase();
    const matches = this.#items.filter((item) => `${item.title} ${item.detail} ${item.group} ${item.terms}`.toLowerCase().includes(normalized));
    this.#searchResults.replaceChildren();
    for (const item of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span>${escapeHtml(item.group)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small><b>→</b>`;
      button.addEventListener("click", () => {
        this.closeSearch();
        item.action();
      });
      this.#searchResults.append(button);
    }
    this.#searchEmpty.hidden = matches.length > 0;
  }

  #toast(message: string): void {
    const toast = required<HTMLElement>("#launcher-toast");
    toast.textContent = message;
    toast.hidden = false;
    if (this.#toastTimer !== undefined) window.clearTimeout(this.#toastTimer);
    this.#toastTimer = window.setTimeout(() => (toast.hidden = true), 3_000);
  }

  #paintClock(): void {
    required("#launcher-clock").textContent = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  #startBoot(): void {
    const boot = required<HTMLElement>("#boot-screen");
    const params = new URLSearchParams(location.search);
    if (params.has("holdBoot")) boot.classList.add("held");
    if (params.has("skipBoot")) {
      boot.hidden = true;
      return;
    }
    requestAnimationFrame(() => boot.classList.add("running"));
    window.setTimeout(() => {
      required("#boot-status").textContent = "SYSTEM READY";
      boot.classList.add("ready");
      if (!params.has("holdBoot")) window.setTimeout(() => (boot.hidden = true), 360);
    }, 1_100);
  }
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing launcher element ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
